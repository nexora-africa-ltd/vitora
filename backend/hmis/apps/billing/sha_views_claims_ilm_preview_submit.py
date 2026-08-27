"""
What this file is for: ILM preview/materialization/submission/close actions for SHA claims.
How to use: mixed into SHAClaimViewSet via SHAClaimILMMixin composition.
Supported inputs/args: DRF ILM preview/apply/materialize/submit/close action payloads.
"""

# ruff: noqa: ARG002

import logging
from datetime import date
from decimal import Decimal, InvalidOperation

from django.db import models
from rest_framework.decorators import action as drf_action
from rest_framework.response import Response

from hmis.apps.billing.models import SHAClaimItem, SHATariff
from hmis.apps.billing.sha_views_claims_helpers import (
    _collect_unresolved_claim_lines,
    _extract_dha_invoice_number,
    _extract_preview_claim_reference,
    _infer_tariff_category_from_code,
    _stringify_error,
)
from hmis.apps.core.models import AuditLog

logger = logging.getLogger(__name__)


class SHAClaimILMPreviewSubmitMixin:
    """ILM preview/materialization/submission/close actions for SHA claims."""

    @drf_action(detail=True, methods=["post"], url_path="ilm/preview")
    def ilm_preview(self, request, pk=None):
        claim = self.get_object()
        ilm_service = self._ilm_service(facility=claim.facility)
        try:
            result = ilm_service.preview(claim, user=request.user)
        except Exception as exc:
            return self._ilm_handle_error(exc)

        if result.status_code < 400 and not self._preview_payload_has_diagnoses(result.payload):
            synced_count = self._sync_claim_diagnoses_to_dha(claim, user=request.user)
            if synced_count:
                try:
                    refreshed_result = ilm_service.preview(claim, user=request.user)
                    if refreshed_result.status_code < 400:
                        result = refreshed_result
                except Exception as exc:  # noqa: BLE001 - keep first preview result
                    logger.warning(
                        "Failed to re-preview claim %s after diagnosis sync: %s",
                        claim.id,
                        _stringify_error(exc),
                    )

        if result.status_code < 400:
            try:
                reconciliation_summary = ilm_service.reconcile_interventions_from_preview(
                    claim,
                    result.payload,
                    user=request.user,
                )
                result.reconciliation_summary = reconciliation_summary
            except Exception as exc:  # noqa: BLE001 - fail-open, preview should still return
                logger.warning(
                    "Failed to reconcile claim interventions from preview for claim %s: %s",
                    claim.id,
                    _stringify_error(exc),
                )

        # Stamp previewed_at on success (DHA UAT: preview required before submit)
        if result.response and result.status_code < 400:
            from django.utils import timezone as tz

            claim.previewed_at = tz.now()
            dha_invoice_number = _extract_dha_invoice_number(result.payload)
            preview_claim_reference = _extract_preview_claim_reference(result.payload)
            if dha_invoice_number:
                claim.dha_invoice_number = dha_invoice_number
            if preview_claim_reference:
                claim.sha_claim_reference = preview_claim_reference

            update_fields = ["previewed_at", "updated_at"]
            if dha_invoice_number:
                update_fields.append("dha_invoice_number")
            if preview_claim_reference:
                update_fields.append("sha_claim_reference")
            claim.save(update_fields=update_fields)
        return self._ilm_response(result)

    @drf_action(detail=True, methods=["post"], url_path="ilm/preview-payer")
    def ilm_preview_payer(self, request, pk=None):
        """Fetch the payer's adjudication view of this claim from DHA."""
        claim = self.get_object()
        try:
            result = self._ilm_service(facility=claim.facility).preview_payer_claim(
                claim, user=request.user
            )
        except Exception as exc:
            return self._ilm_handle_error(exc)
        return self._ilm_response(result)

    @drf_action(detail=True, methods=["post"], url_path="ilm/apply-preview-lines")
    def ilm_apply_preview_lines(self, request, pk=None):
        """Backfill local claim items from an ILM preview payload (manual, auditable)."""
        from django.db import transaction

        from hmis.apps.billing.services.preview_invoice_materializer import (
            PreviewInvoiceMaterializer,
        )

        claim = self.get_object()
        payload = request.data.get("payload")
        replace_existing = bool(request.data.get("replace_existing", True))

        if not isinstance(payload, dict):
            return Response({"error": "payload object is required"}, status=400)

        invoices = payload.get("invoices")
        if not isinstance(invoices, list) or not invoices:
            return Response({"error": "payload.invoices must be a non-empty array"}, status=400)

        parsed_lines = []
        parse_errors = []
        unmatched_tariff_codes = set()
        unresolved_lines = []
        description_resolved_count = 0
        auto_upserted_tariff_codes = set()
        detected_invoice_number = ""
        preview_claim_reference = _extract_preview_claim_reference(payload)

        for invoice in invoices:
            if not isinstance(invoice, dict):
                continue
            if not detected_invoice_number:
                detected_invoice_number = str(
                    invoice.get("invoice_number")
                    or invoice.get("invoice_no")
                    or invoice.get("invoice")
                    or ""
                ).strip()
            lines = invoice.get("lines")
            if not isinstance(lines, list):
                continue

            for raw_line in lines:
                if not isinstance(raw_line, dict):
                    continue

                tariff_code = str(
                    raw_line.get("item_code") or raw_line.get("intervention_code") or ""
                ).strip()
                if tariff_code:
                    tariff_code = tariff_code.upper()
                description = str(
                    raw_line.get("item_name") or tariff_code or "Preview line"
                ).strip()

                quantity_raw = raw_line.get("quantity", 1)
                unit_price_raw = raw_line.get("unit_price")
                if unit_price_raw in (None, ""):
                    unit_price_raw = raw_line.get("line_net_amount") or raw_line.get(
                        "line_total_amount"
                    )

                try:
                    quantity = Decimal(str(quantity_raw or "1"))
                    unit_price = Decimal(str(unit_price_raw or "0"))
                except (InvalidOperation, TypeError, ValueError):
                    parse_errors.append(f"Invalid numeric values for line '{description}'")
                    continue

                if quantity <= 0:
                    parse_errors.append(f"Quantity must be > 0 for line '{description}'")
                    continue
                if unit_price <= 0:
                    parse_errors.append(f"Unit price must be > 0 for line '{description}'")
                    continue

                tariff = None
                if tariff_code:
                    tariff = SHATariff.objects.filter(code=tariff_code, is_active=True).first()

                if tariff is None and description:
                    tariff = (
                        SHATariff.get_active_tariffs(facility_level=claim.facility_level)
                        .filter(
                            models.Q(name__iexact=description)
                            | models.Q(description__iexact=description)
                        )
                        .first()
                    )
                    if tariff is None:
                        tariff = (
                            SHATariff.get_active_tariffs(facility_level=claim.facility_level)
                            .filter(
                                models.Q(name__icontains=description)
                                | models.Q(description__icontains=description)
                            )
                            .order_by("code")
                            .first()
                        )
                    if tariff is not None:
                        description_resolved_count += 1

                if tariff is None and tariff_code:
                    facility_level_raw = getattr(getattr(claim, "facility", None), "level", "")
                    if facility_level_raw:
                        fallback_level = f"L{facility_level_raw}"
                    else:
                        fallback_level = claim.facility_level or SHATariff.TariffLevel.LEVEL_3
                    if isinstance(fallback_level, str) and not fallback_level.upper().startswith(
                        "L"
                    ):
                        fallback_level = f"L{fallback_level}"
                    tariff, created = SHATariff.objects.get_or_create(
                        code=tariff_code,
                        defaults={
                            "name": description or tariff_code,
                            "description": f"Auto-imported from DHA preview for claim {claim.claim_number}",
                            "category": _infer_tariff_category_from_code(tariff_code),
                            "facility_level": fallback_level,
                            "sha_amount": unit_price,
                            "effective_date": date.today(),
                            "is_active": True,
                            "max_quantity_per_claim": 99,
                        },
                    )
                    if created:
                        auto_upserted_tariff_codes.add(tariff_code)

                if tariff is None:
                    if tariff_code:
                        unmatched_tariff_codes.add(tariff_code)
                    unresolved_lines.append(
                        {
                            "description": description,
                            "tariff_code": tariff_code,
                        }
                    )

                parsed_lines.append(
                    {
                        "tariff": tariff,
                        "tariff_code": tariff_code,
                        "description": description,
                        "quantity": quantity,
                        "unit_price": unit_price,
                    }
                )

        if not parsed_lines:
            return Response(
                {
                    "error": "No valid preview lines found to apply.",
                    "parse_errors": parse_errors,
                },
                status=400,
            )

        previous_count = claim.items.count()
        created_count = 0
        two_dp = Decimal("0.01")
        with transaction.atomic():
            if replace_existing:
                preview_keys = {
                    (
                        str(line["description"] or "").strip().lower(),
                        str(Decimal(str(line["quantity"])).quantize(two_dp)),
                        str(Decimal(str(line["unit_price"])).quantize(two_dp)),
                        str(
                            line.get("tariff_code") or getattr(line.get("tariff"), "code", "") or ""
                        )
                        .strip()
                        .lower(),
                    )
                    for line in parsed_lines
                }
                matched_fallback_ids: list[int] = []
                for item in claim.items.filter(is_preview_line=False):
                    item_key = (
                        str(item.description or "").strip().lower(),
                        str(Decimal(str(item.quantity or "0")).quantize(two_dp)),
                        str(Decimal(str(item.unit_price or "0")).quantize(two_dp)),
                        str(getattr(item.tariff, "code", "") or "").strip().lower(),
                    )
                    if item_key in preview_keys:
                        matched_fallback_ids.append(item.id)

                claim.items.filter(
                    models.Q(is_preview_line=True) | models.Q(id__in=matched_fallback_ids)
                ).delete()

            for line in parsed_lines:
                line_total = (line["quantity"] * line["unit_price"]).quantize(two_dp)
                SHAClaimItem.objects.create(
                    claim=claim,
                    tariff=line["tariff"],
                    description=line["description"],
                    service_date=claim.service_date,
                    quantity=line["quantity"],
                    unit_price=line["unit_price"],
                    sha_covered_amount=line_total,
                    patient_payable_amount=Decimal("0.00"),
                    discount_amount=Decimal("0.00"),
                    allocation_status=SHAClaimItem.AllocationStatus.RESOLVED,
                    is_preview_line=True,
                )
                created_count += 1

            if detected_invoice_number:
                claim.dha_invoice_number = detected_invoice_number
            if preview_claim_reference:
                claim.sha_claim_reference = preview_claim_reference

            update_fields = ["updated_at"]
            if detected_invoice_number:
                update_fields.append("dha_invoice_number")
            if preview_claim_reference:
                update_fields.append("sha_claim_reference")
            claim.save(update_fields=update_fields)

            claim.calculate_claimed_amount()

        invoice_materialization = PreviewInvoiceMaterializer.materialize(
            claim=claim,
            parsed_lines=parsed_lines,
            detected_invoice_number=detected_invoice_number,
            user=request.user,
            replace_existing=replace_existing,
        )

        AuditLog.log(
            action="sha_claim_apply_preview_lines",
            user=request.user,
            resource_type="SHAClaim",
            resource_id=claim.id,
            details={
                "replace_existing": replace_existing,
                "previous_item_count": previous_count,
                "created_item_count": created_count,
                "incoming_line_count": len(parsed_lines),
                "detected_invoice_number": detected_invoice_number,
                "invoice_linked": bool(invoice_materialization.invoice_id),
                "materialized_invoice_id": invoice_materialization.invoice_id,
                "materialized_invoice_number": invoice_materialization.invoice_number,
                "materialized_invoice_items_created": invoice_materialization.items_created,
                "materialized_invoice_items_replaced": invoice_materialization.items_replaced,
                "materialized_invoice_skipped_reason": invoice_materialization.skipped_reason,
                "final_bill_attachment_id": invoice_materialization.final_bill_attachment_id,
                "final_bill_created": invoice_materialization.final_bill_created,
                "final_bill_updated": invoice_materialization.final_bill_updated,
                "final_bill_skipped_reason": invoice_materialization.final_bill_skipped_reason,
                "critical_care_attachment_id": invoice_materialization.critical_care_attachment_id,
                "critical_care_created": invoice_materialization.critical_care_created,
                "critical_care_updated": invoice_materialization.critical_care_updated,
                "critical_care_skipped_reason": invoice_materialization.critical_care_skipped_reason,
                "discharge_summary_attachment_id": invoice_materialization.discharge_summary_attachment_id,
                "discharge_summary_created": invoice_materialization.discharge_summary_created,
                "discharge_summary_updated": invoice_materialization.discharge_summary_updated,
                "discharge_summary_skipped_reason": invoice_materialization.discharge_summary_skipped_reason,
                "claim_form_attachment_id": invoice_materialization.claim_form_attachment_id,
                "claim_form_created": invoice_materialization.claim_form_created,
                "claim_form_updated": invoice_materialization.claim_form_updated,
                "claim_form_skipped_reason": invoice_materialization.claim_form_skipped_reason,
                "allocation_pending_count": claim.items.filter(
                    allocation_status=SHAClaimItem.AllocationStatus.PENDING
                ).count(),
                "unmatched_tariff_codes": sorted(unmatched_tariff_codes),
                "description_resolved_count": description_resolved_count,
                "unresolved_lines": unresolved_lines,
                "parse_errors": parse_errors,
                "auto_upserted_tariff_codes": sorted(auto_upserted_tariff_codes),
            },
        )

        return Response(
            {
                "success": True,
                "message": "Preview lines applied to local claim items.",
                "replace_existing": replace_existing,
                "previous_item_count": previous_count,
                "created_item_count": created_count,
                "detected_invoice_number": detected_invoice_number,
                "invoice_linked": bool(invoice_materialization.invoice_id),
                "materialized_invoice_id": invoice_materialization.invoice_id,
                "materialized_invoice_number": invoice_materialization.invoice_number,
                "materialized_invoice_items_created": invoice_materialization.items_created,
                "materialized_invoice_items_replaced": invoice_materialization.items_replaced,
                "materialized_invoice_skipped_reason": invoice_materialization.skipped_reason,
                "final_bill_attachment_id": invoice_materialization.final_bill_attachment_id,
                "final_bill_created": invoice_materialization.final_bill_created,
                "final_bill_updated": invoice_materialization.final_bill_updated,
                "final_bill_skipped_reason": invoice_materialization.final_bill_skipped_reason,
                "critical_care_attachment_id": invoice_materialization.critical_care_attachment_id,
                "critical_care_created": invoice_materialization.critical_care_created,
                "critical_care_updated": invoice_materialization.critical_care_updated,
                "critical_care_skipped_reason": invoice_materialization.critical_care_skipped_reason,
                "discharge_summary_attachment_id": invoice_materialization.discharge_summary_attachment_id,
                "discharge_summary_created": invoice_materialization.discharge_summary_created,
                "discharge_summary_updated": invoice_materialization.discharge_summary_updated,
                "discharge_summary_skipped_reason": invoice_materialization.discharge_summary_skipped_reason,
                "claim_form_attachment_id": invoice_materialization.claim_form_attachment_id,
                "claim_form_created": invoice_materialization.claim_form_created,
                "claim_form_updated": invoice_materialization.claim_form_updated,
                "claim_form_skipped_reason": invoice_materialization.claim_form_skipped_reason,
                "allocation_pending_count": claim.items.filter(
                    allocation_status=SHAClaimItem.AllocationStatus.PENDING
                ).count(),
                "unmatched_tariff_codes": sorted(unmatched_tariff_codes),
                "description_resolved_count": description_resolved_count,
                "unresolved_lines": unresolved_lines,
                "parse_errors": parse_errors,
                "auto_upserted_tariff_codes": sorted(auto_upserted_tariff_codes),
                "claimed_amount": str(claim.claimed_amount),
            }
        )

    @drf_action(detail=True, methods=["post"], url_path="ilm/materialize-preview-invoice")
    def ilm_materialize_preview_invoice(self, request, pk=None):
        """Materialize/link a local invoice from current claim preview-derived lines."""
        from hmis.apps.billing.services.preview_invoice_materializer import (
            PreviewInvoiceMaterializer,
        )

        claim = self.get_object()
        replace_existing = bool(request.data.get("replace_existing", True))
        detected_invoice_number = str(
            request.data.get("invoice_number") or claim.dha_invoice_number or ""
        ).strip()

        claim_items = list(claim.items.select_related("tariff").all())
        if not claim_items:
            return Response(
                {
                    "error": (
                        "No local claim items found. Apply preview lines first via "
                        "POST /api/billing/claims/{id}/ilm/apply-preview-lines/."
                    )
                },
                status=400,
            )

        parsed_lines = [
            {
                "tariff": item.tariff,
                "tariff_code": item.tariff.code if item.tariff else "",
                "description": item.description,
                "quantity": item.quantity,
                "unit_price": item.unit_price,
            }
            for item in claim_items
        ]

        result = PreviewInvoiceMaterializer.materialize(
            claim=claim,
            parsed_lines=parsed_lines,
            detected_invoice_number=detected_invoice_number,
            user=request.user,
            replace_existing=replace_existing,
        )

        return Response(
            {
                "success": True,
                "invoice_id": result.invoice_id,
                "invoice_number": result.invoice_number,
                "linked_existing_invoice": result.linked_existing_invoice,
                "materialized": result.materialized,
                "items_created": result.items_created,
                "items_replaced": result.items_replaced,
                "final_bill_attachment_id": result.final_bill_attachment_id,
                "final_bill_created": result.final_bill_created,
                "final_bill_updated": result.final_bill_updated,
                "final_bill_skipped_reason": result.final_bill_skipped_reason,
                "critical_care_attachment_id": result.critical_care_attachment_id,
                "critical_care_created": result.critical_care_created,
                "critical_care_updated": result.critical_care_updated,
                "critical_care_skipped_reason": result.critical_care_skipped_reason,
                "discharge_summary_attachment_id": result.discharge_summary_attachment_id,
                "discharge_summary_created": result.discharge_summary_created,
                "discharge_summary_updated": result.discharge_summary_updated,
                "discharge_summary_skipped_reason": result.discharge_summary_skipped_reason,
                "claim_form_attachment_id": result.claim_form_attachment_id,
                "claim_form_created": result.claim_form_created,
                "claim_form_updated": result.claim_form_updated,
                "claim_form_skipped_reason": result.claim_form_skipped_reason,
                "skipped_reason": result.skipped_reason,
            }
        )

    @drf_action(detail=True, methods=["post"], url_path="ilm/submit")
    def ilm_submit(self, request, pk=None):
        from hmis.apps.billing.sha_automation import SHAClaimAutomationService

        claim = self.get_object()
        d = request.data
        invoice_number = d.get("invoice_number") or claim.dha_invoice_number
        if not invoice_number:
            return Response(
                {
                    "error": (
                        "DHA invoice number is required. Run claim preview first "
                        "to fetch the DHA invoice number."
                    )
                },
                status=400,
            )

        invoice_number = str(invoice_number).strip()
        if invoice_number and claim.dha_invoice_number != invoice_number:
            claim.dha_invoice_number = invoice_number
            claim.save(update_fields=["dha_invoice_number", "updated_at"])

        # Ensure claim items exist from invoice when available.
        if not claim.items.exists() and claim.invoice_id and claim.invoice:
            for invoice_item in claim.invoice.items.all():
                SHAClaimItem.create_from_invoice_item(claim, invoice_item)
            claim.calculate_claimed_amount()

        # Best-effort auto-attach of core digital documents before validation.
        # This includes clinical notes and invoice summary attachment generation.
        SHAClaimAutomationService.auto_attach_documents(claim.id)

        # Best-effort auto-preview if this claim has never been previewed.
        # DHA UAT requires preview before submit; doing it here removes a common
        # operator failure mode while keeping explicit Preview available in UI.
        preview_error = None
        if not claim.previewed_at:
            try:
                preview_result = self._ilm_service(facility=claim.facility).preview(
                    claim,
                    user=request.user,
                )
                if preview_result.status_code < 400:
                    from django.utils import timezone as tz

                    claim.previewed_at = tz.now()
                    claim.save(update_fields=["previewed_at", "updated_at"])
                else:
                    preview_error = str(preview_result.payload) if preview_result.payload else None
            except Exception as exc:
                preview_error = _stringify_error(exc)

        # Local pre-flight validation (DHA UAT: catch errors before DHA round-trip)
        from hmis.apps.billing.services.sha_claims import SHAClaimsService

        is_valid, errors = SHAClaimsService(facility=claim.facility).validate_claim(
            claim,
            user=request.user,
        )
        unresolved_lines = _collect_unresolved_claim_lines(claim)
        if preview_error:
            errors.append(f"Auto-preview failed: {preview_error}")
            is_valid = False
        if not is_valid:
            response_data = {
                "error": "Claim failed local pre-submission validation.",
                "code": "local_validation_failed",
                "validation_errors": errors,
            }
            if unresolved_lines:
                response_data["unresolved_lines"] = unresolved_lines
                response_data["missing_tariff_count"] = len(unresolved_lines)

            return Response(
                response_data,
                status=400,
            )

        # Best-effort sync of active local interventions into the DHA visit before submit.
        # Do not block submission here; missing interventions still surface via DHA response.
        try:
            sync_summary = self._sync_missing_interventions_to_dha(
                claim,
                user=request.user,
                strict_preview=False,
            )
            if sync_summary and not bool(sync_summary.get("ok", True)):
                logger.warning(
                    "Intervention sync before submit not fully successful for claim %s: %s",
                    claim.id,
                    sync_summary,
                )
        except Exception as exc:  # noqa: BLE001 - fail open before submit
            logger.warning(
                "Intervention sync before submit failed for claim %s: %s",
                claim.id,
                _stringify_error(exc),
            )

        try:
            result = self._ilm_service(facility=claim.facility).submit(
                claim,
                invoice_number=str(invoice_number),
                otp=str(d.get("otp", "")),
                discharge_auth_guid=str(d.get("discharge_auth_guid", "")),
                discharge_reason=str(d.get("discharge_reason", "")),
                notes=str(d.get("notes", "")),
                practitioner_identification_number=str(
                    d.get("practitioner_identification_number", "")
                ),
                practitioner_identification_type=str(d.get("practitioner_identification_type", "")),
                practitioner_regulation_body=str(d.get("practitioner_regulation_body", "KMPDC")),
                user=request.user,
            )
        except Exception as exc:
            return self._ilm_handle_error(exc)
        return self._ilm_response(result)

    @drf_action(detail=True, methods=["post"], url_path="ilm/close")
    def ilm_close(self, request, pk=None):
        from hmis.apps.billing.services.ilm_claim_service import CloseClaimParams

        claim = self.get_object()
        d = request.data
        if not d.get("cancel_reason_type"):
            return Response({"error": "cancel_reason_type required"}, status=400)
        try:
            params = CloseClaimParams(
                cancel_reason_type=str(d["cancel_reason_type"]),
                cancel_reason_text=str(d.get("cancel_reason_text", "")),
            )
            result = self._ilm_service(facility=claim.facility).close(
                claim, params, user=request.user
            )
        except Exception as exc:
            return self._ilm_handle_error(exc)
        return self._ilm_response(result)
