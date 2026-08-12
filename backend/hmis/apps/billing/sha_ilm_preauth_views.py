# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""DHA HIE Middleware (ILM) — preauth, doctor-consent & emergency views.

Phase 3 endpoints. Mounted under ``/api/sha/ilm/...`` in ``sha_urls.py``.

Errors raised by :class:`IlmClient` are mapped via the same DHAError → HTTP
convention used elsewhere in the ILM module.
"""

from __future__ import annotations

import contextlib
import hashlib
import json
import logging
import os
from typing import Any

from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from hmis.apps.billing.models import SHAClaim, SHAEmergencyClaim, SHAMember, SHAPreauth
from hmis.apps.billing.services.consent_token_resolver import (
    ConsentTokenExpiredError,
    ConsentTokenNotFoundError,
    resolve_for_claim,
)
from hmis.apps.billing.services.dha_errors import (
    DHAClientError,
    DHAError,
    DHANotFoundError,
    DHARateLimitedError,
    DHAServerError,
    DHATimeoutError,
    DHATransportError,
    DHAUnauthorizedError,
    DHAValidationError,
)
from hmis.apps.billing.services.ilm_preauth_service import (
    DoctorConsentParams,
    EmergencyProtocolParams,
    EmergencyVisitParams,
    EmtAttachment,
    EmtVisitParams,
    IlmPreauthService,
)
from hmis.apps.billing.services.multipart_builder import MultipartFile
from hmis.apps.core.events import BillingEvents, publish_event
from hmis.apps.core.permissions import ReadRequiresModelPermission, WriteRequiresRolePermission
from hmis.apps.patients.models import Patient

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _ilm_handle_error(view_name: str, exc: DHAError, *, extra: dict | None = None) -> Response:
    payload = {
        "error": exc.__class__.__name__,
        "message": str(exc),
        "status_code": getattr(exc, "status_code", None),
    }
    if isinstance(exc, DHAValidationError):
        http = status.HTTP_400_BAD_REQUEST
    elif isinstance(exc, DHAUnauthorizedError):
        http = status.HTTP_502_BAD_GATEWAY
    elif isinstance(exc, DHANotFoundError):
        http = status.HTTP_404_NOT_FOUND
    elif isinstance(exc, DHARateLimitedError):
        http = status.HTTP_429_TOO_MANY_REQUESTS
    elif isinstance(exc, DHAClientError):
        http = status.HTTP_400_BAD_REQUEST
    elif isinstance(exc, (DHAServerError, DHATimeoutError, DHATransportError)):
        http = status.HTTP_502_BAD_GATEWAY
    else:
        http = status.HTTP_500_INTERNAL_SERVER_ERROR
    with contextlib.suppress(Exception):
        publish_event(
            BillingEvents.DHA_PREAUTH_CALL_FAILED,
            {
                "view": view_name,
                "error": exc.__class__.__name__,
                "status_code": getattr(exc, "status_code", None),
                **(extra or {}),
            },
        )
    return Response(payload, status=http)


def _facility(request):
    facility = getattr(request, "facility", None)
    if facility is not None:
        return facility

    user = getattr(request, "user", None)
    profile = getattr(user, "staff_profile", None)
    if profile is not None and getattr(profile, "primary_facility_id", None):
        return getattr(profile, "primary_facility", None)

    return getattr(user, "primary_facility", None)


def _resolve(model, request, key: str):
    raw = request.query_params.get(key) or request.data.get(key)
    if not raw:
        return None
    try:
        # Tenant-scope: restrict lookups to the user's facility/organization
        facility = _facility(request)
        org = getattr(request.user, "organization", None)
        qs = model.objects.all()
        if facility and hasattr(model, "facility_id"):
            qs = qs.filter(facility=facility)
        elif org and hasattr(model, "organization_id"):
            qs = qs.filter(organization=org)
        return qs.get(pk=raw)
    except (model.DoesNotExist, ValueError, TypeError):
        return None


def _result_to_response(result, *, http_status: int = status.HTTP_200_OK) -> Response:
    return Response(
        {
            "data": result.payload,
            "http_status": result.status_code,
            "record_id": getattr(result, "record_id", None),
            "dha_external_id": getattr(result, "dha_external_id", ""),
            "correlation_id": getattr(result, "correlation_id", ""),
        },
        status=http_status,
    )


def _to_preauth_document_type_for_claim(claim: SHAClaim, attachment: Any) -> str:
    local_type = str(getattr(attachment, "attachment_type", "") or "other").strip().lower()
    mapping = {
        "medical_report": "MEDICAL_REPORT",
        "lab_report": "LAB_ORDER",
        "radiology_report": "RADIOLOGY_REQUEST",
        "prescription": "PRESCRIPTION",
        "discharge_summary": "DISCHARGE_SUMMARY",
        "operative_notes": "THEATRE_LIST",
        "clinical_notes": "CLINICAL_DOCUMENTATION",
        "preauth_approval": "CLINICAL_DOCUMENTATION",
        "invoice": "INTERIM_BILL",
    }
    doc_type = mapping.get(local_type, "OTHER")
    if doc_type == "INTERIM_BILL" and claim.claim_type == SHAClaim.ClaimType.INPATIENT:
        return "FINAL_BILL"
    return doc_type


def _extract_preauth_attachments_from_claim(
    claim: SHAClaim,
) -> tuple[list[MultipartFile], list[dict[str, str]]]:
    multipart_files: list[MultipartFile] = []
    attachments_meta: list[dict[str, str]] = []
    seen_signatures: set[str] = set()

    for idx, attachment in enumerate(claim.attachments.all(), start=1):
        file_field_name = f"preauth_file_{idx}"
        filename = (
            str(getattr(attachment, "original_filename", "") or "").strip()
            or os.path.basename(str(getattr(getattr(attachment, "file", None), "name", "") or ""))
            or f"attachment-{attachment.id}.bin"
        )
        file_obj = getattr(attachment, "file", None)
        if not file_obj:
            continue
        file_obj.open("rb")
        try:
            content = file_obj.read()
        finally:
            file_obj.close()
        if not content:
            continue

        checksum = str(getattr(attachment, "checksum", "") or "").strip().lower()
        if not checksum:
            checksum = hashlib.sha256(content).hexdigest()
        fallback_signature = f"{filename.lower()}:{len(content)}:{str(getattr(attachment, 'mime_type', '') or '').lower()}"
        signature = checksum or fallback_signature
        if signature in seen_signatures:
            continue
        seen_signatures.add(signature)

        multipart_files.append(
            MultipartFile(
                field_name=file_field_name,
                filename=filename,
                content=content,
                content_type=str(
                    getattr(attachment, "mime_type", "") or "application/octet-stream"
                ),
            )
        )
        attachments_meta.append(
            {
                "file_field_name": file_field_name,
                "document_title": str(getattr(attachment, "name", "") or filename),
                "document_type": _to_preauth_document_type_for_claim(claim, attachment),
            }
        )

    return multipart_files, attachments_meta


def _has_preauth_attachments(value: Any) -> bool:
    if isinstance(value, list):
        return len(value) > 0
    if isinstance(value, str):
        text = value.strip()
        if not text:
            return False
        return text != "[]"
    return bool(value)


def _normalize_preauth_attachments_meta(value: Any) -> list[dict[str, str]]:
    if not isinstance(value, list):
        return []
    normalized: list[dict[str, str]] = []
    for entry in value:
        if not isinstance(entry, dict):
            continue
        field_name = str(entry.get("file_field_name") or "").strip()
        if not field_name:
            continue
        item: dict[str, str] = {
            "file_field_name": field_name,
            "document_title": str(entry.get("document_title") or "").strip() or field_name,
            "document_type": str(entry.get("document_type") or "").strip() or "OTHER",
        }
        attachment_id = entry.get("attachment_id")
        if isinstance(attachment_id, int) or (
            isinstance(attachment_id, str) and attachment_id.isdigit()
        ):
            item["attachment_id"] = str(attachment_id)
        checksum = str(entry.get("checksum") or "").strip().lower()
        if checksum:
            item["checksum"] = checksum
        normalized.append(item)
    return normalized


def _normalize_attachment_ids(value: Any) -> tuple[list[int], list[str]]:
    if value is None:
        return [], []

    raw_items: list[Any] = value if isinstance(value, list) else [value]

    normalized: list[int] = []
    errors: list[str] = []
    seen: set[int] = set()

    for raw in raw_items:
        try:
            parsed = int(str(raw).strip())
        except (TypeError, ValueError):
            errors.append(f"Invalid attachment_id '{raw}'")
            continue
        if parsed <= 0:
            errors.append(f"Invalid attachment_id '{raw}'")
            continue
        if parsed in seen:
            continue
        seen.add(parsed)
        normalized.append(parsed)

    return normalized, errors


def _multipart_signature(file: MultipartFile) -> str:
    digest = hashlib.sha256(file.content).hexdigest()
    content_type = str(file.content_type or "").strip().lower()
    return f"{digest}:{len(file.content)}:{content_type}"


def _dedupe_and_reindex_preauth_payload(
    *,
    files: list[MultipartFile],
    attachments_meta: list[dict[str, str]],
) -> tuple[list[MultipartFile], list[dict[str, str]]]:
    meta_by_field: dict[str, dict[str, str]] = {
        str(row.get("file_field_name") or "").strip(): row
        for row in attachments_meta
        if str(row.get("file_field_name") or "").strip()
    }

    deduped_files: list[MultipartFile] = []
    deduped_meta: list[dict[str, str]] = []
    seen: set[str] = set()

    for item in files:
        signature = _multipart_signature(item)
        if signature in seen:
            continue
        seen.add(signature)

        next_idx = len(deduped_files) + 1
        new_field_name = f"preauth_file_{next_idx}"
        deduped_files.append(
            MultipartFile(
                field_name=new_field_name,
                filename=item.filename,
                content=item.content,
                content_type=item.content_type,
            )
        )

        source_meta = meta_by_field.get(item.field_name, {})
        deduped_meta.append(
            {
                "file_field_name": new_field_name,
                "document_title": str(source_meta.get("document_title") or item.filename),
                "document_type": str(source_meta.get("document_type") or "OTHER"),
                **{
                    key: str(value)
                    for key, value in source_meta.items()
                    if key not in {"file_field_name", "document_title", "document_type"}
                    and str(value).strip()
                },
            }
        )

    return deduped_files, deduped_meta


def _extract_selected_preauth_attachments_from_claim(
    claim: SHAClaim,
    attachment_ids: list[int],
) -> tuple[list[MultipartFile], list[dict[str, str]], list[dict[str, Any]], list[str]]:
    if not attachment_ids:
        return [], [], [], []

    selected = {
        attachment.id: attachment for attachment in claim.attachments.filter(id__in=attachment_ids)
    }

    files: list[MultipartFile] = []
    meta: list[dict[str, str]] = []
    resolved: list[dict[str, Any]] = []
    errors: list[str] = []

    for idx, attachment_id in enumerate(attachment_ids, start=1):
        attachment = selected.get(attachment_id)
        if attachment is None:
            errors.append(f"Attachment {attachment_id} was not found on this claim")
            continue

        file_obj = getattr(attachment, "file", None)
        if not file_obj:
            errors.append(f"Attachment {attachment_id} has no file")
            continue
        file_obj.open("rb")
        try:
            content = file_obj.read()
        finally:
            file_obj.close()
        if not content:
            errors.append(f"Attachment {attachment_id} is empty")
            continue

        filename = (
            str(getattr(attachment, "original_filename", "") or "").strip()
            or os.path.basename(str(getattr(file_obj, "name", "") or ""))
            or f"attachment-{attachment_id}.bin"
        )
        checksum = str(getattr(attachment, "checksum", "") or "").strip().lower()
        if not checksum:
            checksum = hashlib.sha256(content).hexdigest()
        field_name = f"selected_claim_attachment_{idx}"
        document_type = _to_preauth_document_type_for_claim(claim, attachment)

        files.append(
            MultipartFile(
                field_name=field_name,
                filename=filename,
                content=content,
                content_type=str(
                    getattr(attachment, "mime_type", "") or "application/octet-stream"
                ),
            )
        )
        meta.append(
            {
                "file_field_name": field_name,
                "document_title": str(getattr(attachment, "name", "") or filename),
                "document_type": document_type,
                "attachment_id": str(attachment_id),
                "checksum": checksum,
            }
        )
        resolved.append(
            {
                "id": attachment_id,
                "title": str(getattr(attachment, "name", "") or filename),
                "doc_type": document_type,
                "checksum": checksum,
            }
        )

    return files, meta, resolved, errors


def _serialize_preauth(p: SHAPreauth) -> dict[str, Any]:
    return {
        "id": p.id,
        "claim": p.claim_id,
        "patient": p.patient_id,
        "sha_member": p.sha_member_id,
        "consent_token": p.consent_token,
        "intervention_code": p.intervention_code,
        "status": p.status,
        "dha_external_id": p.dha_external_id,
        "correlation_id": p.correlation_id,
        "doctor_consent_state": p.doctor_consent_state,
        "diagnoses": p.diagnoses,
        "submitted_at": p.submitted_at.isoformat() if p.submitted_at else None,
        "decided_at": p.decided_at.isoformat() if p.decided_at else None,
        "cancelled_at": p.cancelled_at.isoformat() if p.cancelled_at else None,
        "created_at": p.created_at.isoformat(),
    }


def _serialize_emergency(e: SHAEmergencyClaim) -> dict[str, Any]:
    return {
        "id": e.id,
        "kind": e.kind,
        "patient": e.patient_id,
        "sha_member": e.sha_member_id,
        "claim": e.claim_id,
        "consent_token": e.consent_token,
        "reference_number": e.reference_number,
        "case_number": e.case_number,
        "beneficiary_cr_id": e.beneficiary_cr_id,
        "brought_by": e.brought_by,
        "mode_of_arrival": e.mode_of_arrival,
        "status": e.status,
        "dha_external_id": e.dha_external_id,
        "correlation_id": e.correlation_id,
        "interventions": e.interventions,
        "diagnoses": e.diagnoses,
        "notes": e.notes,
        "created_at": e.created_at.isoformat(),
    }


# ===========================================================================
# Preauth endpoints
# ===========================================================================


class IlmPreauthFetchView(APIView):
    """GET /api/sha/ilm/preauth/?consent_token="""

    permission_classes = [IsAuthenticated, WriteRequiresRolePermission, ReadRequiresModelPermission]

    def get(self, request):
        consent_token = request.query_params.get("consent_token")
        if not consent_token:
            return Response(
                {"error": "consent_token is required"}, status=status.HTTP_400_BAD_REQUEST
            )
        preauth = SHAPreauth.objects.filter(consent_token=consent_token).first()
        try:
            result = IlmPreauthService().fetch_preauth(
                consent_token=consent_token,
                facility=_facility(request),
                user=request.user,
                preauth=preauth,
            )
        except DHAError as exc:
            return _ilm_handle_error("preauth_fetch", exc)
        return _result_to_response(result)


class IlmPreauthCreateView(APIView):
    """POST /api/sha/ilm/preauth/

    JSON body (multipart not currently supported via the proxy; files must
    be uploaded ahead of time to /api/v1/uploads):

        {
          "consent_token": "...",
          "intervention_code": "...",
          "patient_pk": 1,
          "claim_pk": 12,         # optional
          "sha_member_id": 5,     # optional
          "extra_fields": { ... } # forwarded as form data
        }
    """

    permission_classes = [IsAuthenticated, WriteRequiresRolePermission, ReadRequiresModelPermission]

    def post(self, request):
        consent_token = str(request.data.get("consent_token") or "").strip()
        intervention_code = request.data.get("intervention_code")
        if not intervention_code:
            return Response(
                {"error": "intervention_code is required"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        patient = _resolve(Patient, request, "patient_pk")
        if not patient:
            return Response({"error": "patient_pk is required"}, status=status.HTTP_400_BAD_REQUEST)
        claim = _resolve(SHAClaim, request, "claim_pk")

        resolved_claim_token = ""
        if claim is not None:
            try:
                resolved_claim_token = resolve_for_claim(claim).token
            except (ConsentTokenNotFoundError, ConsentTokenExpiredError):
                resolved_claim_token = ""

        if not consent_token:
            consent_token = resolved_claim_token

        if not consent_token:
            return Response(
                {
                    "error": (
                        "consent_token is required unless claim_pk resolves to a valid consent token"
                    )
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        if resolved_claim_token and consent_token != resolved_claim_token:
            return Response(
                {
                    "error": (
                        "Provided consent_token does not match the active consent token "
                        "for the linked claim"
                    )
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        raw_extra_fields = request.data.get("extra_fields") or {}
        if isinstance(raw_extra_fields, str):
            try:
                raw_extra_fields = json.loads(raw_extra_fields)
            except json.JSONDecodeError:
                raw_extra_fields = {}
        extra_fields = dict(raw_extra_fields) if isinstance(raw_extra_fields, dict) else {}

        explicit_attachment_ids_value = extra_fields.get("attachment_ids")
        if explicit_attachment_ids_value is None:
            explicit_attachment_ids_value = request.data.get("attachment_ids")
        explicit_attachment_ids, attachment_id_errors = _normalize_attachment_ids(
            explicit_attachment_ids_value
        )
        if attachment_id_errors:
            return Response(
                {
                    "error": "invalid_attachment_ids",
                    "attachments": attachment_id_errors,
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        multipart_files: list[MultipartFile] | None = None
        uploaded_files: list[MultipartFile] = []
        uploaded_meta = _normalize_preauth_attachments_meta(extra_fields.get("attachments"))
        for field_name, uploaded in request.FILES.items():
            content = uploaded.read()
            if not content:
                continue
            uploaded_files.append(
                MultipartFile(
                    field_name=field_name,
                    filename=str(getattr(uploaded, "name", "") or field_name),
                    content=content,
                    content_type=str(
                        getattr(uploaded, "content_type", "") or "application/octet-stream"
                    ),
                )
            )
        if uploaded_files:
            if not uploaded_meta:
                uploaded_meta = [
                    {
                        "file_field_name": f.field_name,
                        "document_title": f.filename,
                        "document_type": "OTHER",
                    }
                    for f in uploaded_files
                ]
            multipart_files, normalized_meta = _dedupe_and_reindex_preauth_payload(
                files=uploaded_files,
                attachments_meta=uploaded_meta,
            )
            extra_fields["attachments"] = normalized_meta

        if claim and explicit_attachment_ids:
            selected_files, selected_meta, _, selected_errors = (
                _extract_selected_preauth_attachments_from_claim(claim, explicit_attachment_ids)
            )
            if selected_errors:
                return Response(
                    {
                        "error": "invalid_attachment_ids",
                        "attachments": selected_errors,
                        "invalid_attachment_ids": explicit_attachment_ids,
                    },
                    status=status.HTTP_400_BAD_REQUEST,
                )

            if multipart_files:
                merged_files, merged_meta = _dedupe_and_reindex_preauth_payload(
                    files=[*multipart_files, *selected_files],
                    attachments_meta=[
                        *_normalize_preauth_attachments_meta(extra_fields.get("attachments")),
                        *selected_meta,
                    ],
                )
                multipart_files = merged_files
                extra_fields["attachments"] = merged_meta
            else:
                merged_files, merged_meta = _dedupe_and_reindex_preauth_payload(
                    files=selected_files,
                    attachments_meta=selected_meta,
                )
                multipart_files = merged_files
                extra_fields["attachments"] = merged_meta
        # Strict explicit mode: never implicitly include all claim attachments.
        # Back-compat legacy mode can opt-in with fallback_claim_attachments=true.
        fallback_claim_attachments = str(
            request.data.get("fallback_claim_attachments") or ""
        ).strip().lower() in {"1", "true", "yes"}
        if (
            claim
            and fallback_claim_attachments
            and not uploaded_files
            and not explicit_attachment_ids
        ):
            claim_files, attachments_meta = _extract_preauth_attachments_from_claim(claim)
            if claim_files and attachments_meta:
                logger.warning(
                    "ILM preauth create using legacy attachment fallback for claim=%s",
                    claim.id,
                )
                merged_files, merged_meta = _dedupe_and_reindex_preauth_payload(
                    files=claim_files,
                    attachments_meta=attachments_meta,
                )
                multipart_files = merged_files
                extra_fields["attachments"] = merged_meta

        extra_fields.pop("attachment_ids", None)
        extra_fields.pop("fallback_claim_attachments", None)

        resolved_meta = _normalize_preauth_attachments_meta(extra_fields.get("attachments"))
        extra_fields["attachments"] = [
            {
                "file_field_name": row["file_field_name"],
                "document_title": row["document_title"],
                "document_type": row["document_type"],
            }
            for row in resolved_meta
        ]

        resolved_attachment_payload = [
            {
                "id": int(row["attachment_id"])
                if str(row.get("attachment_id", "")).isdigit()
                else None,
                "title": row.get("document_title", ""),
                "doc_type": row.get("document_type", "OTHER"),
                "checksum": row.get("checksum", ""),
            }
            for row in resolved_meta
        ]

        try:
            result = IlmPreauthService().create_preauth(
                consent_token=consent_token,
                intervention_code=intervention_code,
                files=multipart_files,
                extra_fields=extra_fields,
                patient=patient,
                sha_member=_resolve(SHAMember, request, "sha_member_id"),
                claim=claim,
                facility=_facility(request),
                user=request.user,
            )
        except DHAValidationError as exc:
            msg = (exc.message or "").lower()
            if (
                "consent token" in msg
                and "visit" in msg
                and ("doesnt exist" in msg or "doesn't exist" in msg)
            ):
                # DHA no longer recognizes this token as having an active visit.
                # Clear our local flag so the frontend re-shows the consent flow.
                if claim is not None and getattr(claim, "dha_visit_started_at", None) is not None:
                    claim.dha_visit_started_at = None
                    claim.save(update_fields=["dha_visit_started_at"])
                return Response(
                    {
                        "error": "DHAValidationError",
                        "code": "dha_visit_not_started",
                        "message": (
                            "The linked consent token does not have an active DHA visit. "
                            "Please collect a fresh consent or start the visit before submitting the preauth."
                        ),
                        "status_code": exc.status_code,
                    },
                    status=status.HTTP_400_BAD_REQUEST,
                )
            return _ilm_handle_error(
                "preauth_create", exc, extra={"intervention_code": intervention_code}
            )
        except DHAError as exc:
            return _ilm_handle_error(
                "preauth_create", exc, extra={"intervention_code": intervention_code}
            )
        response = _result_to_response(result, http_status=status.HTTP_201_CREATED)
        response.data["resolved_attachments"] = resolved_attachment_payload
        return response


class IlmPreauthCancelView(APIView):
    """POST /api/sha/ilm/preauth/cancel/

    Body: { consent_token, intervention_code }
    """

    permission_classes = [IsAuthenticated, WriteRequiresRolePermission, ReadRequiresModelPermission]

    def post(self, request):
        consent_token = request.data.get("consent_token")
        intervention_code = request.data.get("intervention_code")
        if not consent_token or not intervention_code:
            return Response(
                {"error": "consent_token and intervention_code are required"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        preauth = SHAPreauth.objects.filter(
            consent_token=consent_token, intervention_code=intervention_code
        ).first()
        try:
            result = IlmPreauthService().cancel_preauth(
                consent_token=consent_token,
                intervention_code=intervention_code,
                facility=_facility(request),
                user=request.user,
                preauth=preauth,
            )
        except DHAError as exc:
            return _ilm_handle_error(
                "preauth_cancel", exc, extra={"intervention_code": intervention_code}
            )
        return _result_to_response(result)


class IlmPreauthRemoveDiagnosisView(APIView):
    """DELETE /api/sha/ilm/preauth/diagnoses/{icd_code}/

    Body: { consent_token, intervention_code }
    """

    permission_classes = [IsAuthenticated, WriteRequiresRolePermission, ReadRequiresModelPermission]

    def delete(self, request, icd_code: str):
        consent_token = request.data.get("consent_token")
        intervention_code = request.data.get("intervention_code")
        if not consent_token or not intervention_code:
            return Response(
                {"error": "consent_token and intervention_code are required"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        try:
            result = IlmPreauthService().remove_preauth_diagnosis(
                consent_token=consent_token,
                intervention_code=intervention_code,
                icd_code=icd_code,
                facility=_facility(request),
                user=request.user,
            )
        except DHAError as exc:
            return _ilm_handle_error(
                "preauth_remove_diagnosis",
                exc,
                extra={"icd_code": icd_code, "intervention_code": intervention_code},
            )
        return _result_to_response(result)


class IlmPreauthRemoveDoctorView(APIView):
    """DELETE /api/sha/ilm/preauth/doctors/

    Body: { consent_token, intervention_code, practitioner_registration_number }
    """

    permission_classes = [IsAuthenticated, WriteRequiresRolePermission, ReadRequiresModelPermission]

    def delete(self, request):
        consent_token = request.data.get("consent_token")
        intervention_code = request.data.get("intervention_code")
        prn = request.data.get("practitioner_registration_number")
        if not (consent_token and intervention_code and prn):
            return Response(
                {
                    "error": (
                        "consent_token, intervention_code and "
                        "practitioner_registration_number are required"
                    )
                },
                status=status.HTTP_400_BAD_REQUEST,
            )
        try:
            result = IlmPreauthService().remove_preauth_doctor(
                consent_token=consent_token,
                intervention_code=intervention_code,
                practitioner_registration_number=prn,
                facility=_facility(request),
                user=request.user,
            )
        except DHAError as exc:
            return _ilm_handle_error("preauth_remove_doctor", exc)
        return _result_to_response(result)


# ===========================================================================
# Doctor consent
# ===========================================================================


class IlmDoctorConsentView(APIView):
    """POST /api/sha/ilm/preauth/doctor-consent/"""

    permission_classes = [IsAuthenticated, WriteRequiresRolePermission, ReadRequiresModelPermission]

    def post(self, request):
        required = (
            "consent_token",
            "intervention_code",
            "practitioner_registration_number",
            "identification_number",
        )
        missing = [k for k in required if not request.data.get(k)]
        if missing:
            return Response(
                {"error": f"missing required fields: {', '.join(missing)}"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        params = DoctorConsentParams(
            consent_token=request.data["consent_token"],
            intervention_code=request.data["intervention_code"],
            practitioner_registration_number=request.data["practitioner_registration_number"],
            identification_number=request.data["identification_number"],
            identification_type=request.data.get("identification_type", "registration_number"),
            regulation_body=request.data.get("regulation_body", "KMPDC"),
            request_type=request.data.get("request_type", "PREAUTH_DOCTOR_APPROVAL_REQUEST"),
            service_type=request.data.get("service_type", ""),
            emergency_claim_id=request.data.get("emergency_claim_id", ""),
            created=request.data.get("created", ""),
        )
        preauth = SHAPreauth.objects.filter(
            consent_token=params.consent_token,
            intervention_code=params.intervention_code,
        ).first()
        try:
            result = IlmPreauthService().request_doctor_consent(
                params,
                facility=_facility(request),
                user=request.user,
                preauth=preauth,
            )
        except DHAError as exc:
            return _ilm_handle_error("doctor_consent", exc)
        return _result_to_response(result)


class IlmDoctorConsentPollView(APIView):
    """GET /api/sha/ilm/preauth/doctor-consent/poll/?preauth_id=

    Polls DHA for the latest doctor-consent state on a preauth by re-fetching
    the preauth via ILM. Returns the updated local SHAPreauth record.

    Used by the frontend to auto-poll every ~10s while doctor_consent_state
    is REQUESTED (awaiting doctor approval on Practice360).
    """

    permission_classes = [IsAuthenticated, WriteRequiresRolePermission, ReadRequiresModelPermission]

    def get(self, request):
        preauth_id = request.query_params.get("preauth_id")
        if not preauth_id:
            return Response({"error": "preauth_id is required"}, status=status.HTTP_400_BAD_REQUEST)
        try:
            preauth = SHAPreauth.objects.get(pk=preauth_id)
        except (SHAPreauth.DoesNotExist, ValueError):
            return Response({"error": "preauth not found"}, status=status.HTTP_404_NOT_FOUND)

        # Re-fetch from DHA to get the latest state
        try:
            result = IlmPreauthService().fetch_preauth(
                consent_token=preauth.consent_token,
                facility=_facility(request),
                user=request.user,
                preauth=preauth,
            )
        except DHAError as exc:
            return _ilm_handle_error("doctor_consent_poll", exc)

        # Parse DHA response for doctor consent state update
        dha_data = result.payload
        if isinstance(dha_data, dict):
            new_state = dha_data.get("doctor_consent_state", "")
            # DHA may return states: APPROVED, REJECTED, PENDING, REQUESTED
            if new_state and new_state != preauth.doctor_consent_state:
                preauth.doctor_consent_state = new_state
                preauth.save(update_fields=["doctor_consent_state", "updated_at"])
            # Also check if preauth status changed (e.g. approved after doctor consent)
            new_status = dha_data.get("status", "")
            if (
                new_status
                and new_status in dict(SHAPreauth.Status.choices)
                and new_status != preauth.status
            ):
                preauth.status = new_status
                preauth.save(update_fields=["status", "updated_at"])

        return Response(_serialize_preauth(preauth))


# ===========================================================================
# Emergency
# ===========================================================================


class IlmEmergencyOpenView(APIView):
    """POST /api/sha/ilm/emergency/

    Body mirrors DHA spec; ``patient_pk`` / ``sha_member_id`` are optional
    local linking fields.
    """

    permission_classes = [IsAuthenticated, WriteRequiresRolePermission, ReadRequiresModelPermission]

    def post(self, request):
        interventions = request.data.get("interventions") or []
        if not isinstance(interventions, list) or not interventions:
            return Response(
                {"error": "interventions (non-empty list) is required"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        params = EmergencyVisitParams(
            interventions=[str(x) for x in interventions],
            brought_by=request.data.get("brought_by", "RELATIVE"),
            mode_of_arrival=request.data.get("mode_of_arrival", "AMBULANCE"),
            beneficiary_cr_id=request.data.get("beneficiary_cr_id", ""),
            identification_number=request.data.get("identification_number", ""),
            notes=request.data.get("notes", ""),
            otp=request.data.get("otp", ""),
            reference_number=request.data.get("reference_number", ""),
        )
        try:
            result = IlmPreauthService().open_emergency_claim(
                params,
                patient=_resolve(Patient, request, "patient_pk"),
                sha_member=_resolve(SHAMember, request, "sha_member_id"),
                facility=_facility(request),
                user=request.user,
            )
        except DHAError as exc:
            return _ilm_handle_error("emergency_open", exc)
        return _result_to_response(result, http_status=status.HTTP_201_CREATED)


class IlmEmergencyProtocolsListView(APIView):
    """GET /api/sha/ilm/emergency/protocols/?active=&intervention_code="""

    permission_classes = [IsAuthenticated, WriteRequiresRolePermission, ReadRequiresModelPermission]

    def get(self, request):
        active = request.query_params.get("active")
        intervention_code = request.query_params.get("intervention_code")
        if not active or not intervention_code:
            return Response(
                {"error": "active and intervention_code are required"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        try:
            result = IlmPreauthService().list_emergency_protocols(
                active=active,
                intervention_code=intervention_code,
                facility=_facility(request),
                user=request.user,
            )
        except DHAError as exc:
            return _ilm_handle_error(
                "emergency_protocols_list",
                exc,
                extra={"intervention_code": intervention_code},
            )
        return _result_to_response(result)


class IlmEmergencyProtocolApplyView(APIView):
    """POST /api/sha/ilm/emergency/protocols/

    Body: { consent_token, protocol_code, intervention_code, unit_price, quantity, diagnoses }
    """

    permission_classes = [IsAuthenticated, WriteRequiresRolePermission, ReadRequiresModelPermission]

    def post(self, request):
        required = (
            "consent_token",
            "protocol_code",
            "intervention_code",
            "unit_price",
            "quantity",
        )
        missing = [k for k in required if request.data.get(k) is None]
        if missing:
            return Response(
                {"error": f"missing required fields: {', '.join(missing)}"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        try:
            params = EmergencyProtocolParams(
                consent_token=str(request.data["consent_token"]),
                protocol_code=str(request.data["protocol_code"]),
                intervention_code=str(request.data["intervention_code"]),
                unit_price=float(request.data["unit_price"]),
                quantity=int(request.data["quantity"]),
                diagnoses=str(request.data.get("diagnoses", "")),
            )
        except (TypeError, ValueError) as exc:
            return Response({"error": f"invalid payload: {exc}"}, status=400)
        emergency_claim = _resolve(SHAEmergencyClaim, request, "emergency_claim_pk")
        try:
            result = IlmPreauthService().apply_emergency_protocol(
                params,
                emergency_claim=emergency_claim,
                facility=_facility(request),
                user=request.user,
            )
        except DHAError as exc:
            return _ilm_handle_error(
                "emergency_protocol_apply",
                exc,
                extra={"protocol_code": params.protocol_code},
            )
        return _result_to_response(result)


class IlmEmtCreateView(APIView):
    """POST /api/sha/ilm/emt/"""

    permission_classes = [IsAuthenticated, WriteRequiresRolePermission, ReadRequiresModelPermission]

    def post(self, request):
        required = (
            "beneficiary_cr_id",
            "case_number",
            "consent_token",
            "diagnoses",
            "interventions",
            "practitioner_reg_number",
            "provider_registration_number",
            "protocol_code",
        )
        missing = [k for k in required if not request.data.get(k)]
        if missing:
            return Response(
                {"error": f"missing required fields: {', '.join(missing)}"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        attachments_raw = request.data.get("attachments") or []
        attachments = []
        if isinstance(attachments_raw, list):
            for a in attachments_raw:
                if not isinstance(a, dict):
                    continue
                try:
                    attachments.append(
                        EmtAttachment(
                            document_title=str(a["document_title"]),
                            document_type=str(a["document_type"]),
                            file_field_name=str(a["file_field_name"]),
                        )
                    )
                except KeyError:
                    return Response(
                        {
                            "error": (
                                "attachment items require document_title, "
                                "document_type, file_field_name"
                            )
                        },
                        status=400,
                    )
        params = EmtVisitParams(
            beneficiary_cr_id=str(request.data["beneficiary_cr_id"]),
            case_number=str(request.data["case_number"]),
            consent_token=str(request.data["consent_token"]),
            diagnoses=[str(x) for x in (request.data.get("diagnoses") or [])],
            interventions=[str(x) for x in (request.data.get("interventions") or [])],
            practitioner_reg_number=str(request.data["practitioner_reg_number"]),
            provider_registration_number=str(request.data["provider_registration_number"]),
            protocol_code=str(request.data["protocol_code"]),
            otp=str(request.data.get("otp", "")),
            attachments=attachments or None,
        )
        try:
            result = IlmPreauthService().create_emt_claim(
                params,
                patient=_resolve(Patient, request, "patient_pk"),
                sha_member=_resolve(SHAMember, request, "sha_member_id"),
                facility=_facility(request),
                user=request.user,
            )
        except DHAError as exc:
            return _ilm_handle_error("emt_create", exc, extra={"case_number": params.case_number})
        return _result_to_response(result, http_status=status.HTTP_201_CREATED)


# ===========================================================================
# Local browse endpoints (no DHA round-trip)
# ===========================================================================


class SHAPreauthListView(APIView):
    """GET /api/sha/ilm/preauth/local/?patient_pk=&claim_pk=&status=

    Returns the cached SHAPreauth rows for browsing in the UI.
    Scoped to the user's facility.
    """

    permission_classes = [IsAuthenticated, WriteRequiresRolePermission, ReadRequiresModelPermission]

    def get(self, request):
        from hmis.apps.core.models import AuditLog

        patient = _resolve(Patient, request, "patient_pk")
        claim = _resolve(SHAClaim, request, "claim_pk")
        status_filter = request.query_params.get("status")

        # Scope to user's facility
        facility = _facility(request)
        qs = SHAPreauth.objects.all()
        if facility:
            qs = qs.filter(facility=facility)

        if patient:
            qs = qs.filter(patient=patient)
        if claim:
            qs = qs.filter(claim=claim)
        if status_filter and status_filter in dict(SHAPreauth.Status.choices):
            qs = qs.filter(status=status_filter)

        results = [_serialize_preauth(p) for p in qs[:200]]

        # Audit log access
        with contextlib.suppress(Exception):
            AuditLog.log(
                action="preauth_list_view",
                user=request.user,
                resource_type="SHAPreauth",
                resource_id=0,
                ip_address=request.META.get("REMOTE_ADDR", ""),
                details={
                    "count": len(results),
                    "filters": {
                        "patient_pk": getattr(patient, "pk", None),
                        "status": status_filter,
                    },
                },
            )

        return Response({"results": results})


class SHAPreauthDetailView(APIView):
    """GET /api/sha/ilm/preauth/local/<int:pk>/

    Returns a single SHAPreauth record by ID (scoped to user's facility).
    """

    permission_classes = [IsAuthenticated, WriteRequiresRolePermission, ReadRequiresModelPermission]

    def get(self, request, pk: int):
        from hmis.apps.core.models import AuditLog

        facility = _facility(request)
        qs = SHAPreauth.objects.all()
        if facility:
            qs = qs.filter(facility=facility)
        try:
            preauth = qs.get(pk=pk)
        except (SHAPreauth.DoesNotExist, ValueError):
            return Response({"error": "Preauth not found"}, status=status.HTTP_404_NOT_FOUND)

        with contextlib.suppress(Exception):
            AuditLog.log(
                action="preauth_detail_view",
                user=request.user,
                resource_type="SHAPreauth",
                resource_id=pk,
                ip_address=request.META.get("REMOTE_ADDR", ""),
                details={"intervention_code": preauth.intervention_code},
            )

        return Response(_serialize_preauth(preauth))


class SHAEmergencyClaimListView(APIView):
    """GET /api/sha/ilm/emergency/local/?patient_pk=&kind=

    Returns the cached SHAEmergencyClaim rows for browsing in the UI.
    Scoped to the user's facility.
    """

    permission_classes = [IsAuthenticated, WriteRequiresRolePermission, ReadRequiresModelPermission]

    def get(self, request):
        from hmis.apps.core.models import AuditLog

        facility = _facility(request)
        qs = SHAEmergencyClaim.objects.all()
        if facility:
            qs = qs.filter(facility=facility)

        patient = _resolve(Patient, request, "patient_pk")
        if patient:
            qs = qs.filter(patient=patient)
        kind = request.query_params.get("kind")
        if kind:
            qs = qs.filter(kind=kind)

        results = [_serialize_emergency(e) for e in qs[:200]]

        with contextlib.suppress(Exception):
            AuditLog.log(
                action="emergency_claim_list_view",
                user=request.user,
                resource_type="SHAEmergencyClaim",
                resource_id=0,
                ip_address=request.META.get("REMOTE_ADDR", ""),
                details={"count": len(results)},
            )

        return Response({"results": results})
