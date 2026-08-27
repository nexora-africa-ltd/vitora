"""
What this file is for: shared helper functions for SHA claim view modules.
How to use: imported by claim mixins and compatibility shims to reuse SHA claim utility logic.
Supported inputs/args: helper function inputs for attachment mapping, money parsing, preview extraction, and tariff inference.
"""

import logging
from collections.abc import Mapping
from decimal import Decimal, InvalidOperation

from rest_framework import serializers

from hmis.apps.billing.document_types import (
    dha_document_type_to_local_attachment_type,
    local_to_dha_document_type,
)
from hmis.apps.billing.models import SHAClaim, SHAClaimAttachment, SHATariff

logger = logging.getLogger(__name__)


def _to_dha_document_type(
    local_attachment_type: str,
    *,
    attachment_name: str = "",
    original_filename: str = "",
) -> str:
    haystack = _normalize_attachment_name(f"{attachment_name} {original_filename}")
    if "critical care" in haystack or "icu" in haystack or "hdu" in haystack or "nbu" in haystack:
        return "CRITICAL_CARE_UNIT_CASE"
    if "final bill" in haystack:
        return "FINAL_BILL"
    if "claim form" in haystack:
        return "CLAIM_FORM"
    if "discharge summary" in haystack:
        return "DISCHARGE_SUMMARY"

    return local_to_dha_document_type(local_attachment_type)


def _to_dha_document_type_for_claim(claim: SHAClaim, attachment: SHAClaimAttachment) -> str:
    """Resolve DHA doc type with claim-context overrides.

    DHA preview for inpatient flows expects FINAL_BILL, while local attachments often
    store invoice-like types/names. Normalize those to FINAL_BILL for IP claims.
    """
    doc_type = _to_dha_document_type(
        attachment.attachment_type,
        attachment_name=attachment.name,
        original_filename=attachment.original_filename,
    )
    if doc_type == "INVOICE" and claim.claim_type == SHAClaim.ClaimType.INPATIENT:
        return "FINAL_BILL"
    return doc_type


def _normalize_attachment_name(value: str) -> str:
    normalized = "".join(ch.lower() if ch.isalnum() else " " for ch in str(value or "").strip())
    parts = [part for part in normalized.split() if part]
    if (
        parts
        and len(parts[-1]) <= 5
        and parts[-1]
        in {
            "pdf",
            "jpg",
            "jpeg",
            "png",
            "doc",
            "docx",
            "webp",
            "tif",
            "tiff",
        }
    ):
        parts = parts[:-1]
    return " ".join(parts)


def _to_local_attachment_type(dha_document_type: str) -> str:
    return dha_document_type_to_local_attachment_type(
        dha_document_type,
        default=SHAClaimAttachment.AttachmentType.OTHER,
    )


def _build_attachment_sync_status(claim: SHAClaim) -> dict:
    from hmis.apps.billing.services.consent_token_resolver import resolve_for_claim
    from hmis.apps.billing.services.ilm_claim_service import PREVIEW_PATH
    from hmis.apps.core.models import DHAOutboundCall

    local_attachments = list(claim.attachments.all())
    local_count = len(local_attachments)
    if local_count == 0:
        return {
            "local_count": 0,
            "matched": 0,
            "total": 0,
            "all_matched": True,
            "missing": [],
            "consent_token_present": False,
        }

    try:
        consent = resolve_for_claim(claim)
        consent_token = consent.token
    except Exception:
        consent_token = ""

    if not consent_token:
        return {
            "local_count": local_count,
            "matched": 0,
            "total": local_count,
            "all_matched": False,
            "missing": [
                {
                    "attachment_id": att.id,
                    "attachment_name": att.name,
                    "attachment_type": _to_dha_document_type_for_claim(claim, att),
                }
                for att in local_attachments
            ],
            "consent_token_present": False,
        }

    bucket: dict[tuple[str, str], list[dict[str, str]]] = {}
    match_source = "upload_history"
    stale_preview_detected = False

    latest_upload_call = (
        DHAOutboundCall.objects.filter(
            path="/api/v1/claims/attachments",
            consent_token=consent_token,
            status=DHAOutboundCall.Status.SUCCESS,
        )
        .order_by("-created_at")
        .first()
    )
    latest_upload_at = latest_upload_call.created_at if latest_upload_call else None

    # Preferred source of truth: latest successful DHA preview payload.
    # If preview says claim_attachments is empty, we must treat sync as missing even if
    # uploads previously succeeded in outbound logs.
    preview_calls = DHAOutboundCall.objects.filter(
        path=PREVIEW_PATH,
        consent_token=consent_token,
        status=DHAOutboundCall.Status.SUCCESS,
    ).order_by("-created_at")

    for call in preview_calls:
        response = call.response_excerpt if isinstance(call.response_excerpt, Mapping) else {}
        payload = response
        if isinstance(response.get("payload"), Mapping):
            payload = response.get("payload")
        attachments = payload.get("claim_attachments") if isinstance(payload, Mapping) else None
        if not isinstance(attachments, list):
            continue

        # If we have newer successful upload calls than this preview snapshot,
        # treat preview as stale and fall back to upload history matching.
        if latest_upload_at and call.created_at and latest_upload_at > call.created_at:
            stale_preview_detected = True
            break

        match_source = "preview"
        for entry in attachments:
            if not isinstance(entry, Mapping):
                continue
            doc_type = (
                str(
                    entry.get("attachment_type")
                    or entry.get("document_type")
                    or entry.get("type")
                    or ""
                )
                .strip()
                .upper()
            )
            if not doc_type:
                continue
            doc_title = str(
                entry.get("title")
                or entry.get("document_title")
                or entry.get("attachment_name")
                or entry.get("description")
                or ""
            ).strip()
            key = (doc_type, _normalize_attachment_name(doc_title))
            bucket.setdefault(key, []).append(
                {
                    "remote_attachment_id": str(
                        entry.get("id")
                        or entry.get("attachment_id")
                        or entry.get("attachment_guid")
                        or ""
                    ).strip(),
                    "intervention_code": str(entry.get("intervention_code") or "").strip(),
                }
            )
        break

    if stale_preview_detected and match_source != "preview":
        match_source = "upload_history_after_stale_preview"

    # Fallback for flows where preview has not yet been run.
    if not bucket and match_source != "preview":
        calls = DHAOutboundCall.objects.filter(
            path="/api/v1/claims/attachments",
            consent_token=consent_token,
            status=DHAOutboundCall.Status.SUCCESS,
        ).order_by("created_at")

        for call in calls:
            payload = call.request_payload if isinstance(call.request_payload, Mapping) else {}
            response = call.response_excerpt if isinstance(call.response_excerpt, Mapping) else {}
            doc_type = str(payload.get("document_type") or "").strip().upper()
            doc_title = str(
                payload.get("document_title")
                or payload.get("attachment_name")
                or payload.get("document_name")
                or ""
            ).strip()
            if not doc_type:
                continue
            key = (doc_type, _normalize_attachment_name(doc_title))
            remote_attachment_id = str(
                response.get("id")
                or response.get("attachment_id")
                or response.get("attachment_guid")
                or ""
            ).strip()
            intervention_code = str(
                payload.get("intervention_code") or response.get("intervention_code") or ""
            ).strip()
            bucket.setdefault(key, []).append(
                {
                    "remote_attachment_id": remote_attachment_id,
                    "intervention_code": intervention_code,
                }
            )

    matched = 0
    matched_details: list[dict[str, str | int]] = []
    missing: list[dict[str, str | int]] = []
    for att in local_attachments:
        doc_type = _to_dha_document_type_for_claim(claim, att)
        candidates = [
            _normalize_attachment_name(att.name),
            _normalize_attachment_name(att.original_filename),
        ]
        found = False
        for name_key in candidates:
            key = (doc_type, name_key)
            entries = bucket.get(key) or []
            if entries:
                matched_meta = entries.pop(0)
                matched += 1
                matched_details.append(
                    {
                        "attachment_id": att.id,
                        "attachment_name": att.name,
                        "attachment_type": doc_type,
                        "remote_attachment_id": matched_meta.get("remote_attachment_id", ""),
                        "intervention_code": matched_meta.get("intervention_code", ""),
                    }
                )
                found = True
                break
        if not found:
            missing.append(
                {
                    "attachment_id": att.id,
                    "attachment_name": att.name,
                    "attachment_type": doc_type,
                }
            )

    return {
        "local_count": local_count,
        "matched": matched,
        "total": local_count,
        "all_matched": len(missing) == 0,
        "match_source": match_source,
        "matched_details": matched_details,
        "missing": missing,
        "consent_token_present": True,
    }


def _stringify_error(exc: Exception) -> str:
    """Extract the most useful client-safe error message from an exception."""
    if isinstance(exc, serializers.ValidationError):
        detail = getattr(exc, "detail", None)
        if isinstance(detail, list):
            return "; ".join(str(item) for item in detail if item)
        if isinstance(detail, Mapping):
            parts: list[str] = []
            for field, msgs in detail.items():
                if isinstance(msgs, list):
                    joined = ", ".join(str(m) for m in msgs if m)
                else:
                    joined = str(msgs)
                if joined:
                    parts.append(f"{field}: {joined}")
            if parts:
                return "; ".join(parts)
        if detail:
            return str(detail)

    message_dict = getattr(exc, "message_dict", None)
    if isinstance(message_dict, Mapping) and message_dict:
        parts = []
        for field, msgs in message_dict.items():
            joined = ", ".join(str(m) for m in msgs if m) if isinstance(msgs, list) else str(msgs)
            if joined:
                parts.append(f"{field}: {joined}")
        if parts:
            return "; ".join(parts)

    messages = getattr(exc, "messages", None)
    if isinstance(messages, list) and messages:
        return "; ".join(str(m) for m in messages if m)

    raw = str(exc).strip()
    if raw:
        return raw
    return f"{exc.__class__.__name__}"


def _parse_money(value, field_name: str) -> Decimal:
    try:
        parsed = Decimal(str(value)).quantize(Decimal("0.01"))
    except (InvalidOperation, ValueError, TypeError) as exc:
        raise serializers.ValidationError({field_name: "Must be a valid decimal amount."}) from exc
    return parsed


def _extract_dha_invoice_number(payload: object) -> str:
    """Extract DHA invoice identifier from an ILM preview-style payload."""
    if not isinstance(payload, Mapping):
        return ""
    invoices = payload.get("invoices")
    if not isinstance(invoices, list):
        return ""
    for invoice in invoices:
        if not isinstance(invoice, Mapping):
            continue
        candidate = str(
            invoice.get("invoice_number")
            or invoice.get("invoice_no")
            or invoice.get("invoice")
            or ""
        ).strip()
        if candidate:
            return candidate
    return ""


def _extract_preview_claim_reference(payload: object) -> str:
    """Extract DHA claim UUID/reference from an ILM preview-style payload."""
    if not isinstance(payload, Mapping):
        return ""
    candidate = str(
        payload.get("claim") or payload.get("claim_id") or payload.get("id") or ""
    ).strip()
    return candidate


def _collect_unresolved_claim_lines(claim: SHAClaim) -> list[dict[str, object]]:
    """Return claim item details for lines still missing tariff mapping."""
    unresolved = []
    items_without_tariff = claim.items.filter(tariff__isnull=True).select_related(
        "invoice_item__service"
    )
    for item in items_without_tariff:
        invoice_item = getattr(item, "invoice_item", None)
        service = getattr(invoice_item, "service", None)
        unresolved.append(
            {
                "claim_item_id": item.id,
                "description": item.description,
                "quantity": str(item.quantity),
                "unit_price": str(item.unit_price),
                "claimed_amount": str(item.claimed_amount),
                "invoice_item_id": getattr(invoice_item, "id", None),
                "service_id": getattr(service, "id", None),
                "service_name": getattr(service, "name", "") if service else "",
            }
        )
    return unresolved


def _infer_tariff_category_from_code(tariff_code: str) -> str:
    """Best-effort category inference for preview-driven tariff upserts."""
    prefix = "-".join(str(tariff_code or "").upper().split("-")[:2])
    inpatient_prefixes = {"SHA-03", "SHA-07", "SHA-13", "SHA-19", "SHA-20"}
    if prefix in inpatient_prefixes:
        return SHATariff.TariffCategory.INPATIENT
    return SHATariff.TariffCategory.OTHER
