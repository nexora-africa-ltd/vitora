# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""Materialize DHA preview invoice data into local Invoice/InvoiceItem records."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from decimal import Decimal
from typing import Any

from django.db import transaction
from django.db.models import Q

from hmis.apps.billing.models import Invoice, InvoiceItem, SHAClaim, SHAClaimItem
from hmis.apps.billing.services.admission_attachment_service import AdmissionAttachmentService
from hmis.apps.billing.services.claim_form_attachment_service import ClaimFormAttachmentService
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


def _weak_line_key(
    description: str, quantity: Decimal, unit_price: Decimal
) -> tuple[str, str, str]:
    return (
        str(description or "").strip().lower(),
        str(Decimal(quantity or 0).quantize(TWO_DP)),
        str(Decimal(unit_price or 0).quantize(TWO_DP)),
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
    critical_care_attachment_id: int | None = None
    critical_care_created: bool = False
    critical_care_updated: bool = False
    critical_care_skipped_reason: str = ""
    discharge_summary_attachment_id: int | None = None
    discharge_summary_created: bool = False
    discharge_summary_updated: bool = False
    discharge_summary_skipped_reason: str = ""
    claim_form_attachment_id: int | None = None
    claim_form_created: bool = False
    claim_form_updated: bool = False
    claim_form_skipped_reason: str = ""
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
            admission_docs = AdmissionAttachmentService.ensure_for_claim(claim=claim, user=user)
            claim_form_result = ClaimFormAttachmentService.ensure_for_claim(claim=claim, user=user)
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
                critical_care_attachment_id=admission_docs.critical_care.attachment_id,
                critical_care_created=admission_docs.critical_care.created,
                critical_care_updated=admission_docs.critical_care.updated,
                critical_care_skipped_reason=admission_docs.critical_care.skipped_reason,
                discharge_summary_attachment_id=admission_docs.discharge_summary.attachment_id,
                discharge_summary_created=admission_docs.discharge_summary.created,
                discharge_summary_updated=admission_docs.discharge_summary.updated,
                discharge_summary_skipped_reason=admission_docs.discharge_summary.skipped_reason,
                claim_form_attachment_id=claim_form_result.attachment_id,
                claim_form_created=claim_form_result.created,
                claim_form_updated=claim_form_result.updated,
                claim_form_skipped_reason=claim_form_result.skipped_reason,
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
                deleted_invoice_item_ids = list(delete_qs.values_list("id", flat=True))
                if deleted_invoice_item_ids:
                    SHAClaimItem.objects.filter(
                        claim=claim,
                        invoice_item_id__in=deleted_invoice_item_ids,
                    ).update(invoice_item_id=None)
                replaced = delete_qs.count()
                delete_qs.delete()

            created = 0
            created_items_by_key: dict[tuple[str, str, str, str], list[int]] = {}
            created_items_by_weak_key: dict[tuple[str, str, str], list[int]] = {}
            for line in parsed_lines:
                tariff = line.get("tariff")
                tariff_code = str(line.get("tariff_code") or getattr(tariff, "code", "") or "")
                quantity = Decimal(str(line.get("quantity") or "0"))
                unit_price = Decimal(str(line.get("unit_price") or "0"))
                if quantity <= 0 or unit_price <= 0:
                    continue

                line_total = (quantity * unit_price).quantize(TWO_DP)

                created_item = InvoiceItem.objects.create(
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
                key = _line_key(
                    str(line.get("description") or tariff_code or "DHA Preview Line"),
                    quantity,
                    unit_price,
                    tariff_code,
                )
                created_items_by_key.setdefault(key, []).append(created_item.id)
                weak_key = _weak_line_key(
                    str(line.get("description") or tariff_code or "DHA Preview Line"),
                    quantity,
                    unit_price,
                )
                created_items_by_weak_key.setdefault(weak_key, []).append(created_item.id)
                created += 1

            candidate_claim_items = claim.items.filter(invoice_item_id__isnull=True).order_by(
                "-is_preview_line", "created_at", "id"
            )
            for claim_item in candidate_claim_items:
                key = _line_key(
                    claim_item.description,
                    claim_item.quantity,
                    claim_item.unit_price,
                    getattr(claim_item.tariff, "code", "") or "",
                )
                matches = created_items_by_key.get(key) or []
                if not matches:
                    weak_key = _weak_line_key(
                        claim_item.description,
                        claim_item.quantity,
                        claim_item.unit_price,
                    )
                    matches = created_items_by_weak_key.get(weak_key) or []
                if not matches:
                    continue
                invoice_item_id = matches.pop(0)
                update_data = {"invoice_item_id": invoice_item_id}
                if not claim_item.is_preview_line:
                    update_data["is_preview_line"] = True
                SHAClaimItem.objects.filter(pk=claim_item.pk).update(**update_data)

        final_bill_result = FinalBillAttachmentService.ensure_for_claim(claim=claim, user=user)
        admission_docs = AdmissionAttachmentService.ensure_for_claim(claim=claim, user=user)
        claim_form_result = ClaimFormAttachmentService.ensure_for_claim(claim=claim, user=user)

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
            critical_care_attachment_id=admission_docs.critical_care.attachment_id,
            critical_care_created=admission_docs.critical_care.created,
            critical_care_updated=admission_docs.critical_care.updated,
            critical_care_skipped_reason=admission_docs.critical_care.skipped_reason,
            discharge_summary_attachment_id=admission_docs.discharge_summary.attachment_id,
            discharge_summary_created=admission_docs.discharge_summary.created,
            discharge_summary_updated=admission_docs.discharge_summary.updated,
            discharge_summary_skipped_reason=admission_docs.discharge_summary.skipped_reason,
            claim_form_attachment_id=claim_form_result.attachment_id,
            claim_form_created=claim_form_result.created,
            claim_form_updated=claim_form_result.updated,
            claim_form_skipped_reason=claim_form_result.skipped_reason,
            skipped_reason="",
        )
