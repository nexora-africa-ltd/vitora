# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""Materialize DHA preview invoice data into local Invoice/InvoiceItem records."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from decimal import Decimal
from typing import Any

from django.db import transaction
from django.db.models import Q

from hmis.apps.billing.models import Invoice, InvoiceItem, SHAClaim
from hmis.apps.billing.services.final_bill_attachment_service import FinalBillAttachmentService

AUTO_MATERIALIZED_MARKER = "DHA_PREVIEW_MATERIALIZED"
TWO_DP = Decimal("0.01")


def _line_key(
    description: str, quantity: Decimal, unit_price: Decimal, tariff_code: str
) -> tuple[str, str, str, str]:
    return (
        str(description or "").strip().lower(),
        str(Decimal(quantity or 0).quantize(TWO_DP)),
        str(Decimal(unit_price or 0).quantize(TWO_DP)),
        str(tariff_code or "").strip().lower(),
    )


@dataclass
class MaterializePreviewInvoiceResult:
    invoice_id: int | None
    invoice_number: str
    linked_existing_invoice: bool
    materialized: bool
    items_created: int
    items_replaced: int
    final_bill_attachment_id: int | None = None
    final_bill_created: bool = False
    final_bill_updated: bool = False
    final_bill_skipped_reason: str = ""
    skipped_reason: str = ""


class PreviewInvoiceMaterializer:
    """Create/link local invoices from preview-derived claim lines."""

    @classmethod
    def materialize(
        cls,
        *,
        claim: SHAClaim,
        parsed_lines: list[dict[str, Any]],
        detected_invoice_number: str,
        user,
        replace_existing: bool = True,
    ) -> MaterializePreviewInvoiceResult:
        invoice = claim.invoice
        linked_existing = False

        if invoice is None and detected_invoice_number:
            existing_link = (
                SHAClaim.objects.select_related("invoice")
                .filter(
                    facility=claim.facility,
                    dha_invoice_number=detected_invoice_number,
                    invoice__isnull=False,
                    patient=claim.patient,
                )
                .exclude(pk=claim.pk)
                .first()
            )
            if existing_link and existing_link.invoice:
                invoice = existing_link.invoice
                linked_existing = True

        if invoice is None:
            invoice = Invoice.objects.create(
                patient=claim.patient,
                encounter=claim.encounter,
                facility=claim.facility,
                status=Invoice.Status.DRAFT,
                payment_type=Invoice.PaymentType.INSURANCE,
                payer_type=Invoice.PayerType.SHA,
                invoice_date=claim.service_date or date.today(),
                created_by=user,
                insurance_provider="SHA",
                insurance_member_no=getattr(claim, "sha_member_number", "") or "",
                sha_claim_number=claim.claim_number,
                internal_notes=(
                    f"{AUTO_MATERIALIZED_MARKER}; "
                    f"claim={claim.claim_number}; "
                    f"dha_invoice={detected_invoice_number or '-'}"
                ),
            )
        else:
            notes = invoice.internal_notes or ""
            update_fields: list[str] = []
            if AUTO_MATERIALIZED_MARKER not in notes:
                invoice.internal_notes = (
                    f"{notes}\n{AUTO_MATERIALIZED_MARKER}; "
                    f"claim={claim.claim_number}; "
                    f"dha_invoice={detected_invoice_number or '-'}"
                ).strip()
                update_fields.append("internal_notes")
            if invoice.payer_type == Invoice.PayerType.CASH:
                invoice.payer_type = Invoice.PayerType.SHA
                update_fields.append("payer_type")
            if update_fields:
                update_fields.append("updated_at")
                invoice.save(update_fields=update_fields)

        if claim.invoice_id != invoice.id:
            claim.invoice = invoice
            claim.save(update_fields=["invoice", "updated_at"])

        can_write_items = AUTO_MATERIALIZED_MARKER in (invoice.internal_notes or "")
        if not can_write_items:
            final_bill_result = FinalBillAttachmentService.ensure_for_claim(claim=claim, user=user)
            return MaterializePreviewInvoiceResult(
                invoice_id=invoice.id,
                invoice_number=invoice.invoice_number,
                linked_existing_invoice=linked_existing,
                materialized=False,
                items_created=0,
                items_replaced=0,
                final_bill_attachment_id=final_bill_result.attachment_id,
                final_bill_created=final_bill_result.created,
                final_bill_updated=final_bill_result.updated,
                final_bill_skipped_reason=final_bill_result.skipped_reason,
                skipped_reason="invoice_not_auto_materialized",
            )

        with transaction.atomic():
            replaced = 0
            if replace_existing:
                preview_keys = {
                    _line_key(
                        str(line.get("description") or line.get("tariff_code") or ""),
                        Decimal(str(line.get("quantity") or "0")),
                        Decimal(str(line.get("unit_price") or "0")),
                        str(
                            line.get("tariff_code") or getattr(line.get("tariff"), "code", "") or ""
                        ),
                    )
                    for line in parsed_lines
                }
                matched_fallback_ids: list[int] = []
                for item in invoice.items.filter(
                    is_preview_materialized=False, is_covered_by_insurance=True
                ):
                    item_key = _line_key(
                        item.description,
                        Decimal(str(item.quantity or "0")),
                        Decimal(str(item.unit_price or "0")),
                        item.sha_code,
                    )
                    if item_key in preview_keys:
                        matched_fallback_ids.append(item.id)

                delete_qs = invoice.items.filter(
                    Q(is_preview_materialized=True) | Q(id__in=matched_fallback_ids)
                )
                replaced = delete_qs.count()
                delete_qs.delete()

            created = 0
            for line in parsed_lines:
                tariff = line.get("tariff")
                tariff_code = str(line.get("tariff_code") or getattr(tariff, "code", "") or "")
                quantity = Decimal(str(line.get("quantity") or "0"))
                unit_price = Decimal(str(line.get("unit_price") or "0"))
                if quantity <= 0 or unit_price <= 0:
                    continue

                line_total = (quantity * unit_price).quantize(TWO_DP)

                InvoiceItem.objects.create(
                    invoice=invoice,
                    item_type=InvoiceItem.ItemType.SERVICE,
                    service=getattr(tariff, "service", None) if tariff else None,
                    description=str(line.get("description") or tariff_code or "DHA Preview Line"),
                    quantity=quantity,
                    unit_price=unit_price,
                    line_total=line_total,
                    sha_code=tariff_code,
                    is_covered_by_insurance=True,
                    insurance_approved_amount=line_total,
                    is_preview_materialized=True,
                )
                created += 1

        final_bill_result = FinalBillAttachmentService.ensure_for_claim(claim=claim, user=user)

        return MaterializePreviewInvoiceResult(
            invoice_id=invoice.id,
            invoice_number=invoice.invoice_number,
            linked_existing_invoice=linked_existing,
            materialized=True,
            items_created=created,
            items_replaced=replaced,
            final_bill_attachment_id=final_bill_result.attachment_id,
            final_bill_created=final_bill_result.created,
            final_bill_updated=final_bill_result.updated,
            final_bill_skipped_reason=final_bill_result.skipped_reason,
            skipped_reason="",
        )
