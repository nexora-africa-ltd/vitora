# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""DHA HIE Middleware (ILM) — Phase 4 lifecycle polish views.

Mounts under ``/api/sha/ilm/lifecycle/...`` and ``/api/sha/ilm/uploads/``.

Errors raised by :class:`IlmClient` are mapped via the same DHAError → HTTP
convention used elsewhere in the ILM module.
"""

from __future__ import annotations

import contextlib
import json
import logging
from pathlib import Path
from typing import Any

from rest_framework import status
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from hmis.apps.billing.facility_identifiers import resolve_fr_code
from hmis.apps.billing.models import SHAOtpRequest, SHAOtpWhitelistRequest, SHAUpload
from hmis.apps.billing.services.admission_attachment_service import AdmissionAttachmentService
from hmis.apps.billing.services.claim_form_attachment_service import ClaimFormAttachmentService
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
from hmis.apps.billing.services.ilm_lifecycle_service import (
    DischargeOtpParams,
    DischargeParams,
    EmergencyDoctorAddParams,
    EmergencyDoctorRemoveParams,
    IlmLifecycleService,
    NextOfKinParams,
    OtpWhitelistAttachment,
    OtpWhitelistParams,
    PomsfBalanceParams,
    VisitOtpParams,
)
from hmis.apps.billing.services.multipart_builder import MultipartFile
from hmis.apps.core.events import BillingEvents, publish_event
from hmis.apps.core.permissions import WriteRequiresRolePermission
from hmis.apps.patients.models import Patient

logger = logging.getLogger(__name__)

OTP_WHITELIST_ALLOWED_DOCUMENT_TYPES = {"SUPPORT_DOCUMENT"}
OTP_WHITELIST_ALLOWED_FILE_EXTENSIONS = {
    ".pdf",
    ".doc",
    ".docx",
    ".png",
    ".jpg",
    ".jpeg",
    ".webp",
}
OTP_WHITELIST_ALLOWED_MIME_TYPES = {
    "application/pdf",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "image/png",
    "image/jpeg",
    "image/webp",
}


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
            BillingEvents.DHA_LIFECYCLE_CALL_FAILED,
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


def _resolve_patient(request) -> Patient | None:
    raw = request.data.get("patient_pk") or request.query_params.get("patient_pk")
    if not raw:
        return None
    try:
        return Patient.objects.get(pk=raw)
    except (Patient.DoesNotExist, ValueError, TypeError):
        return None


def _result_to_response(
    result,
    *,
    http_status: int = status.HTTP_200_OK,
    extra: dict[str, Any] | None = None,
) -> Response:
    payload = {
        "data": result.payload,
        "http_status": result.status_code,
        "record_id": getattr(result, "record_id", None),
        "dha_external_id": getattr(result, "dha_external_id", ""),
        "correlation_id": getattr(result, "correlation_id", ""),
    }
    if extra:
        payload.update(extra)
    return Response(payload, status=http_status)


def _is_pending_whitelist_error(exc: DHAError) -> bool:
    message = str(exc).lower()
    return (
        "already existing pending request" in message
        or "kindly wait for an approval" in message
        or "already pending request" in message
    )


def _record_pending_whitelist_from_error(
    request,
    *,
    beneficiary_cr_id: str,
    reason_type: str,
    reason: str,
    biometric_attempts: int,
    response_body: Any,
) -> None:
    """Persist a local pending whitelist row when DHA rejects as already pending."""
    facility = _facility(request)
    existing = SHAOtpWhitelistRequest.objects.filter(
        beneficiary_cr_id=beneficiary_cr_id,
        status=SHAOtpWhitelistRequest.Status.REQUESTED,
        facility=facility,
    ).first()
    if existing:
        return

    payload = response_body if isinstance(response_body, dict) else {}

    SHAOtpWhitelistRequest.objects.create(
        patient=_resolve_patient(request),
        beneficiary_cr_id=beneficiary_cr_id,
        reason_type=reason_type,
        reason=reason,
        biometric_attempts=biometric_attempts,
        status=SHAOtpWhitelistRequest.Status.REQUESTED,
        dha_guid="",
        response_payload=payload,
        correlation_id="",
        requested_by=request.user,
        facility=facility,
    )


# ---------------------------------------------------------------------------
# OTP send (visit + discharge)
# ---------------------------------------------------------------------------


class IlmVisitOtpView(APIView):
    permission_classes = [IsAuthenticated, WriteRequiresRolePermission]

    def post(self, request):
        intervention_codes = request.data.get("intervention_codes")
        patient_id = request.data.get("patient_id")
        if not intervention_codes or not patient_id:
            return Response(
                {"error": "intervention_codes and patient_id are required."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if not isinstance(intervention_codes, list):
            return Response(
                {"error": "intervention_codes must be a list."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        params = VisitOtpParams(
            intervention_codes=[str(x) for x in intervention_codes],
            patient_id=str(patient_id),
            beneficiary_contact_id=str(request.data.get("beneficiary_contact_id") or ""),
        )
        facility = _facility(request)
        fr_code = resolve_fr_code(facility).value
        if not fr_code:
            return Response(
                {
                    "error": (
                        "Facility does not have a DHA Facility Registry (FR) code configured. "
                        "Set it via Admin > Facilities or the SHA_FACILITY_FR_CODE environment variable."
                    ),
                    "code": "missing_fr_code",
                },
                status=status.HTTP_400_BAD_REQUEST,
            )
        try:
            result = IlmLifecycleService(facility=facility).send_visit_otp(
                params=params,
                patient=_resolve_patient(request),
                facility=facility,
                user=request.user,
            )
        except DHAError as exc:
            return _ilm_handle_error("visit_otp", exc)
        return _result_to_response(result)


class IlmDischargeOtpView(APIView):
    permission_classes = [IsAuthenticated, WriteRequiresRolePermission]

    def post(self, request):
        consent_token = request.data.get("consent_token")
        patient_id = request.data.get("patient_id")
        if not consent_token or not patient_id:
            return Response(
                {"error": "consent_token and patient_id are required."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        params = DischargeOtpParams(consent_token=str(consent_token), patient_id=str(patient_id))
        try:
            result = IlmLifecycleService(facility=_facility(request)).send_discharge_otp(
                params=params,
                patient=_resolve_patient(request),
                facility=_facility(request),
                user=request.user,
            )
        except DHAError as exc:
            return _ilm_handle_error("discharge_otp", exc)
        return _result_to_response(result)


# ---------------------------------------------------------------------------
# Discharge
# ---------------------------------------------------------------------------


class IlmDischargeView(APIView):
    permission_classes = [IsAuthenticated, WriteRequiresRolePermission]

    def post(self, request):
        # consent_token, discharge_date, discharge_reason, invoice_number always required.
        # Either otp OR auth_guid must be provided (biometric alternative to OTP).
        required = ("consent_token", "discharge_date", "discharge_reason", "invoice_number")
        for key in required:
            if not request.data.get(key):
                return Response(
                    {"error": f"{key} is required."},
                    status=status.HTTP_400_BAD_REQUEST,
                )

        # Validate discharge_date is not in the future (DHA UAT requirement)
        from datetime import date as date_cls

        discharge_date_str = str(request.data["discharge_date"])
        try:
            discharge_date_val = date_cls.fromisoformat(discharge_date_str)
        except (ValueError, TypeError):
            return Response(
                {"error": "discharge_date must be a valid ISO date (YYYY-MM-DD)."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if discharge_date_val > date_cls.today():
            return Response(
                {
                    "error": "Discharge date cannot be in the future.",
                    "code": "future_discharge_date",
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        consent_token_val = str(request.data["consent_token"])
        from hmis.apps.billing.models import ConsentToken as CT
        from hmis.apps.billing.models import SHAClaim

        consent_obj = CT.objects.filter(consent_token=consent_token_val).first()
        claim = None
        claim_id_raw = request.data.get("claim_id")
        if claim_id_raw not in (None, ""):
            try:
                claim_id = int(claim_id_raw)
            except (TypeError, ValueError):
                return Response(
                    {"error": "claim_id must be a valid integer."},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            claim = SHAClaim.objects.filter(id=claim_id, facility=_facility(request)).first()
            if claim is None:
                return Response(
                    {"error": "Claim not found for this facility."},
                    status=status.HTTP_404_NOT_FOUND,
                )
        if consent_obj and consent_obj.encounter_id:
            claim = claim or SHAClaim.objects.filter(encounter=consent_obj.encounter).first()

        # If discharge reason is DECEASED, warn if death notification attachment is missing
        discharge_reason = str(request.data["discharge_reason"])
        if discharge_reason.upper() == "DECEASED" and claim:
            has_death_notification = claim.attachments.filter(
                attachment_type__icontains="death",
            ).exists()
            if not has_death_notification:
                return Response(
                    {
                        "error": (
                            "Discharge reason is DECEASED but no death notification "
                            "attachment found on the claim. Please upload a death "
                            "notification document before discharging."
                        ),
                        "code": "missing_death_notification",
                    },
                    status=status.HTTP_400_BAD_REQUEST,
                )

        if claim is not None:
            pending_allocations = claim.items.filter(allocation_status="pending")
            if pending_allocations.exists():
                return Response(
                    {
                        "error": (
                            "Payer allocation review is required before discharge. "
                            "Resolve SHA/patient/discount splits for all pending claim lines."
                        ),
                        "code": "allocation_pending",
                        "pending_count": pending_allocations.count(),
                    },
                    status=status.HTTP_400_BAD_REQUEST,
                )

            admission_doc_extra = {
                "critical_care_attachment_id": None,
                "critical_care_created": False,
                "critical_care_updated": False,
                "critical_care_skipped_reason": "",
                "discharge_summary_attachment_id": None,
                "discharge_summary_created": False,
                "discharge_summary_updated": False,
                "discharge_summary_skipped_reason": "",
                "claim_form_attachment_id": None,
                "claim_form_created": False,
                "claim_form_updated": False,
                "claim_form_skipped_reason": "",
            }
            try:
                from hmis.apps.billing.services.final_bill_attachment_service import (
                    FinalBillAttachmentService,
                )

                FinalBillAttachmentService.ensure_for_claim(claim=claim, user=request.user)
                admission_docs = AdmissionAttachmentService.ensure_for_claim(
                    claim=claim,
                    user=request.user,
                )
                claim_form = ClaimFormAttachmentService.ensure_for_claim(
                    claim=claim,
                    user=request.user,
                )
                admission_doc_extra = {
                    "critical_care_attachment_id": admission_docs.critical_care.attachment_id,
                    "critical_care_created": admission_docs.critical_care.created,
                    "critical_care_updated": admission_docs.critical_care.updated,
                    "critical_care_skipped_reason": admission_docs.critical_care.skipped_reason,
                    "discharge_summary_attachment_id": admission_docs.discharge_summary.attachment_id,
                    "discharge_summary_created": admission_docs.discharge_summary.created,
                    "discharge_summary_updated": admission_docs.discharge_summary.updated,
                    "discharge_summary_skipped_reason": admission_docs.discharge_summary.skipped_reason,
                    "claim_form_attachment_id": claim_form.attachment_id,
                    "claim_form_created": claim_form.created,
                    "claim_form_updated": claim_form.updated,
                    "claim_form_skipped_reason": claim_form.skipped_reason,
                }
            except Exception:  # noqa: BLE001 - best-effort guardrail
                logger.exception(
                    "Failed to auto-generate claim attachments for claim %s during discharge",
                    claim.id,
                )
                admission_doc_extra = {
                    **admission_doc_extra,
                    "critical_care_skipped_reason": "auto_generation_failed",
                    "discharge_summary_skipped_reason": "auto_generation_failed",
                    "claim_form_skipped_reason": "auto_generation_failed",
                }

        otp = str(request.data.get("otp", ""))
        auth_guid = str(request.data.get("auth_guid", ""))
        if not otp and not auth_guid:
            return Response(
                {"error": "Either otp or auth_guid is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        params = DischargeParams(
            consent_token=str(request.data["consent_token"]),
            discharge_date=str(request.data["discharge_date"]),
            discharge_reason=str(request.data["discharge_reason"]),
            invoice_number=str(request.data["invoice_number"]),
            otp=otp,
            auth_guid=auth_guid,
        )
        try:
            result = IlmLifecycleService(facility=_facility(request)).discharge_inpatient(
                params=params,
                claim=claim,
                facility=_facility(request),
                user=request.user,
            )
        except DHAError as exc:
            return _ilm_handle_error("discharge", exc)
        return _result_to_response(result, extra=admission_doc_extra if claim is not None else None)


# ---------------------------------------------------------------------------
# OTP whitelist
# ---------------------------------------------------------------------------


class IlmOtpWhitelistRequestView(APIView):
    permission_classes = [IsAuthenticated, WriteRequiresRolePermission]
    parser_classes = [MultiPartParser, FormParser, JSONParser]

    def post(self, request):
        beneficiary_cr_id = request.data.get("beneficiary_cr_id")
        facility_fr_code = request.data.get("facility_fr_code")
        if not beneficiary_cr_id or not facility_fr_code:
            return Response(
                {"error": "beneficiary_cr_id and facility_fr_code are required."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        attachments_meta = request.data.get("attachments") or []
        if isinstance(attachments_meta, str):
            try:
                parsed = json.loads(attachments_meta)
            except (TypeError, ValueError):
                parsed = []
            attachments_meta = parsed if isinstance(parsed, list) else []
        attachments = []
        files: list[MultipartFile] = []
        for meta in attachments_meta or []:
            if not isinstance(meta, dict):
                continue
            field_name = str(meta.get("file_field_name") or "")
            if not field_name:
                continue
            document_type = str(meta.get("document_type") or "SUPPORT_DOCUMENT")
            if document_type not in OTP_WHITELIST_ALLOWED_DOCUMENT_TYPES:
                return Response(
                    {
                        "error": (
                            "Invalid attachment document_type. Allowed values: "
                            + ", ".join(sorted(OTP_WHITELIST_ALLOWED_DOCUMENT_TYPES))
                        )
                    },
                    status=status.HTTP_400_BAD_REQUEST,
                )
            attachments.append(
                OtpWhitelistAttachment(
                    document_title=str(meta.get("document_title") or ""),
                    document_type=document_type,
                    file_field_name=field_name,
                )
            )
            uploaded = request.FILES.get(field_name)
            if uploaded is not None:
                file_ext = Path(str(uploaded.name or "")).suffix.lower()
                content_type = str(getattr(uploaded, "content_type", "") or "").lower()
                if file_ext not in OTP_WHITELIST_ALLOWED_FILE_EXTENSIONS:
                    return Response(
                        {
                            "error": (
                                "Unsupported attachment file extension. Allowed: "
                                + ", ".join(sorted(OTP_WHITELIST_ALLOWED_FILE_EXTENSIONS))
                            )
                        },
                        status=status.HTTP_400_BAD_REQUEST,
                    )
                if content_type and content_type not in OTP_WHITELIST_ALLOWED_MIME_TYPES:
                    return Response(
                        {
                            "error": (
                                "Unsupported attachment MIME type. Allowed: "
                                + ", ".join(sorted(OTP_WHITELIST_ALLOWED_MIME_TYPES))
                            )
                        },
                        status=status.HTTP_400_BAD_REQUEST,
                    )
                files.append(
                    MultipartFile(
                        field_name=field_name,
                        filename=uploaded.name,
                        content=uploaded.read(),
                        content_type=getattr(uploaded, "content_type", None),
                    )
                )
        try:
            biometric_attempts = int(request.data.get("biometric_attempts") or 0)
        except (TypeError, ValueError):
            return Response(
                {"error": "biometric_attempts must be an integer."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        params = OtpWhitelistParams(
            beneficiary_cr_id=str(beneficiary_cr_id),
            facility_fr_code=str(facility_fr_code),
            reason_type=str(request.data.get("reason_type") or "BIOMETRIC_FAILURE"),
            reason=str(request.data.get("reason") or ""),
            biometric_attempts=biometric_attempts,
            attachments=attachments,
        )
        try:
            result = IlmLifecycleService(facility=_facility(request)).request_otp_whitelist(
                params=params,
                files=files or None,
                patient=_resolve_patient(request),
                facility=_facility(request),
                user=request.user,
            )
        except DHAError as exc:
            if _is_pending_whitelist_error(exc):
                with contextlib.suppress(Exception):
                    _record_pending_whitelist_from_error(
                        request,
                        beneficiary_cr_id=str(beneficiary_cr_id),
                        reason_type=str(request.data.get("reason_type") or "BIOMETRIC_FAILURE"),
                        reason=str(request.data.get("reason") or ""),
                        biometric_attempts=biometric_attempts,
                        response_body=getattr(exc, "response_body", None),
                    )
            return _ilm_handle_error("otp_whitelist_request", exc)
        return _result_to_response(result, http_status=status.HTTP_201_CREATED)


class IlmOtpWhitelistCallbackView(APIView):
    permission_classes = [IsAuthenticated, WriteRequiresRolePermission]

    def get(self, request):
        beneficiary_cr_id = request.query_params.get("beneficiary_cr_id")
        if not beneficiary_cr_id:
            return Response(
                {"error": "beneficiary_cr_id is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        try:
            result = IlmLifecycleService(facility=_facility(request)).list_otp_whitelist_status(
                beneficiary_cr_id=str(beneficiary_cr_id),
                facility_fr_code=str(request.query_params.get("facility_fr_code") or ""),
                facility_id_type=str(request.query_params.get("facility_id_type") or "fr-code"),
                guid=str(request.query_params.get("guid") or ""),
                facility=_facility(request),
                user=request.user,
            )
        except DHAError as exc:
            return _ilm_handle_error("otp_whitelist_callback", exc)
        return _result_to_response(result)


# ---------------------------------------------------------------------------
# Next of kin
# ---------------------------------------------------------------------------


class IlmNextOfKinView(APIView):
    permission_classes = [IsAuthenticated, WriteRequiresRolePermission]

    def post(self, request):
        required = (
            "consent_token",
            "contact_value",
            "next_of_kin_full_name",
            "next_of_kin_id_number",
        )
        for key in required:
            if not request.data.get(key):
                return Response(
                    {"error": f"{key} is required."},
                    status=status.HTTP_400_BAD_REQUEST,
                )
        params = NextOfKinParams(
            consent_token=str(request.data["consent_token"]),
            contact_value=str(request.data["contact_value"]),
            next_of_kin_full_name=str(request.data["next_of_kin_full_name"]),
            next_of_kin_id_number=str(request.data["next_of_kin_id_number"]),
            next_of_kin_id_number_type=str(
                request.data.get("next_of_kin_id_number_type") or "National ID"
            ),
        )
        try:
            result = IlmLifecycleService(facility=_facility(request)).add_next_of_kin_contact(
                params=params,
                facility=_facility(request),
                user=request.user,
            )
        except DHAError as exc:
            return _ilm_handle_error("next_of_kin_add", exc)
        return _result_to_response(result, http_status=status.HTTP_201_CREATED)


# ---------------------------------------------------------------------------
# Emergency claim doctors
# ---------------------------------------------------------------------------


class IlmEmergencyDoctorAddView(APIView):
    permission_classes = [IsAuthenticated, WriteRequiresRolePermission]

    def post(self, request):
        consent_token = request.data.get("consent_token")
        identification_number = request.data.get("identification_number")
        if not consent_token or not identification_number:
            return Response(
                {"error": "consent_token and identification_number are required."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        try:
            result = IlmLifecycleService(facility=_facility(request)).add_emergency_claim_doctor(
                params=EmergencyDoctorAddParams(
                    consent_token=str(consent_token),
                    identification_number=str(identification_number),
                ),
                facility=_facility(request),
                user=request.user,
            )
        except DHAError as exc:
            return _ilm_handle_error("emergency_doctor_add", exc)
        return _result_to_response(result)


class IlmEmergencyDoctorRemoveView(APIView):
    permission_classes = [IsAuthenticated, WriteRequiresRolePermission]

    def delete(self, request):
        consent_token = request.data.get("consent_token")
        if not consent_token:
            return Response(
                {"error": "consent_token is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        try:
            result = IlmLifecycleService(facility=_facility(request)).remove_emergency_claim_doctor(
                params=EmergencyDoctorRemoveParams(consent_token=str(consent_token)),
                facility=_facility(request),
                user=request.user,
            )
        except DHAError as exc:
            return _ilm_handle_error("emergency_doctor_remove", exc)
        return _result_to_response(result)


# ---------------------------------------------------------------------------
# POMSF balances
# ---------------------------------------------------------------------------


class IlmPomsfBalancesView(APIView):
    permission_classes = [IsAuthenticated, WriteRequiresRolePermission]

    def get(self, request):
        patient_id = request.query_params.get("patient_id")
        policy_year = request.query_params.get("policy_year")
        if not patient_id or not policy_year:
            return Response(
                {"error": "patient_id and policy_year are required."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        try:
            result = IlmLifecycleService(facility=_facility(request)).get_pomsf_balances(
                params=PomsfBalanceParams(
                    patient_id=str(patient_id),
                    policy_year=str(policy_year),
                    principal_member_number=str(
                        request.query_params.get("principal_member_number") or ""
                    ),
                ),
                patient=_resolve_patient(request),
                facility=_facility(request),
                user=request.user,
            )
        except DHAError as exc:
            return _ilm_handle_error("pomsf_balances", exc)
        return _result_to_response(result)


# ---------------------------------------------------------------------------
# File uploads
# ---------------------------------------------------------------------------


class IlmFileUploadView(APIView):
    permission_classes = [IsAuthenticated, WriteRequiresRolePermission]
    parser_classes = [MultiPartParser, FormParser]

    def post(self, request):
        uploaded = request.FILES.get("file")
        if uploaded is None:
            return Response(
                {"error": "Multipart 'file' field is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        upload = MultipartFile(
            field_name="file",
            filename=uploaded.name,
            content=uploaded.read(),
            content_type=getattr(uploaded, "content_type", None),
        )
        try:
            result = IlmLifecycleService(facility=_facility(request)).upload_file(
                upload=upload,
                facility=_facility(request),
                user=request.user,
            )
        except DHAError as exc:
            return _ilm_handle_error("file_upload", exc)
        return _result_to_response(result, http_status=status.HTTP_201_CREATED)


class IlmFileUrlView(APIView):
    permission_classes = [IsAuthenticated, WriteRequiresRolePermission]

    def get(self, request, file_id: str):
        if not file_id:
            return Response(
                {"error": "file_id is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        try:
            result = IlmLifecycleService(facility=_facility(request)).get_upload_url(
                file_id=str(file_id),
                facility=_facility(request),
                user=request.user,
            )
        except DHAError as exc:
            return _ilm_handle_error("file_url", exc, extra={"file_id": str(file_id)})
        return _result_to_response(result)


# ---------------------------------------------------------------------------
# Local browse views
# ---------------------------------------------------------------------------


def _serialize_otp(o: SHAOtpRequest) -> dict[str, Any]:
    return {
        "id": o.id,
        "patient": o.patient_id,
        "claim": o.claim_id,
        "kind": o.kind,
        "status": o.status,
        "patient_cr_id": o.patient_cr_id,
        "intervention_codes": o.intervention_codes,
        "correlation_id": o.correlation_id,
        "sent_at": o.sent_at.isoformat() if o.sent_at else None,
        "verified_at": o.verified_at.isoformat() if o.verified_at else None,
    }


def _serialize_whitelist(w: SHAOtpWhitelistRequest) -> dict[str, Any]:
    return {
        "id": w.id,
        "patient": w.patient_id,
        "beneficiary_cr_id": w.beneficiary_cr_id,
        "reason_type": w.reason_type,
        "reason": w.reason,
        "status": w.status,
        "dha_guid": w.dha_guid,
        "biometric_attempts": w.biometric_attempts,
        "correlation_id": w.correlation_id,
        "requested_at": w.requested_at.isoformat() if w.requested_at else None,
    }


def _serialize_upload(u: SHAUpload) -> dict[str, Any]:
    return {
        "id": u.id,
        "filename": u.filename,
        "content_type": u.content_type,
        "size_bytes": u.size_bytes,
        "dha_file_id": u.dha_file_id,
        "dha_file_path": u.dha_file_path,
        "dha_download_url": u.dha_download_url,
        "correlation_id": u.correlation_id,
        "uploaded_at": u.uploaded_at.isoformat() if u.uploaded_at else None,
    }


class SHAOtpRequestListView(APIView):
    permission_classes = [IsAuthenticated, WriteRequiresRolePermission]

    def get(self, request):
        qs = SHAOtpRequest.objects.all().order_by("-sent_at")
        patient_pk = request.query_params.get("patient_pk")
        kind = request.query_params.get("kind")
        if patient_pk:
            qs = qs.filter(patient_id=patient_pk)
        if kind:
            qs = qs.filter(kind=kind)
        return Response({"results": [_serialize_otp(o) for o in qs[:200]]})


class SHAOtpWhitelistListView(APIView):
    permission_classes = [IsAuthenticated, WriteRequiresRolePermission]

    def get(self, request):
        qs = SHAOtpWhitelistRequest.objects.all().order_by("-requested_at")
        beneficiary_cr_id = request.query_params.get("beneficiary_cr_id")
        status_filter = request.query_params.get("status")
        if beneficiary_cr_id:
            qs = qs.filter(beneficiary_cr_id=beneficiary_cr_id)
        if status_filter:
            qs = qs.filter(status=status_filter)
        return Response({"results": [_serialize_whitelist(w) for w in qs[:200]]})


class SHAUploadListView(APIView):
    permission_classes = [IsAuthenticated, WriteRequiresRolePermission]

    def get(self, request):
        qs = SHAUpload.objects.all().order_by("-uploaded_at")
        dha_file_id = request.query_params.get("dha_file_id")
        if dha_file_id:
            qs = qs.filter(dha_file_id=dha_file_id)
        return Response({"results": [_serialize_upload(u) for u in qs[:200]]})
