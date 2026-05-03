"""DHA HIE Middleware (ILM) — Phase 4 lifecycle polish views.

Mounts under ``/api/sha/ilm/lifecycle/...`` and ``/api/sha/ilm/uploads/``.

Errors raised by :class:`IlmClient` are mapped via the same DHAError → HTTP
convention used elsewhere in the ILM module.
"""

from __future__ import annotations

import contextlib
import logging
from typing import Any

from rest_framework import status
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from hmis.apps.billing.models import SHAOtpRequest, SHAOtpWhitelistRequest, SHAUpload
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
        http = status.HTTP_401_UNAUTHORIZED
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
    return getattr(request.user, "primary_facility", None)


def _resolve_patient(request) -> Patient | None:
    raw = request.data.get("patient_pk") or request.query_params.get("patient_pk")
    if not raw:
        return None
    try:
        return Patient.objects.get(pk=raw)
    except (Patient.DoesNotExist, ValueError, TypeError):
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


# ---------------------------------------------------------------------------
# OTP send (visit + discharge)
# ---------------------------------------------------------------------------


class IlmVisitOtpView(APIView):
    permission_classes = [IsAuthenticated]

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
        try:
            result = IlmLifecycleService().send_visit_otp(
                params=params,
                patient=_resolve_patient(request),
                facility=_facility(request),
                user=request.user,
            )
        except DHAError as exc:
            return _ilm_handle_error("visit_otp", exc)
        return _result_to_response(result)


class IlmDischargeOtpView(APIView):
    permission_classes = [IsAuthenticated]

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
            result = IlmLifecycleService().send_discharge_otp(
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
    permission_classes = [IsAuthenticated]

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
            result = IlmLifecycleService().discharge_inpatient(
                params=params,
                facility=_facility(request),
                user=request.user,
            )
        except DHAError as exc:
            return _ilm_handle_error("discharge", exc)
        return _result_to_response(result)


# ---------------------------------------------------------------------------
# OTP whitelist
# ---------------------------------------------------------------------------


class IlmOtpWhitelistRequestView(APIView):
    permission_classes = [IsAuthenticated]
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
            attachments_meta = []  # frontend should send JSON list
        attachments = []
        files: list[MultipartFile] = []
        for meta in attachments_meta or []:
            if not isinstance(meta, dict):
                continue
            field_name = str(meta.get("file_field_name") or "")
            if not field_name:
                continue
            attachments.append(
                OtpWhitelistAttachment(
                    document_title=str(meta.get("document_title") or ""),
                    document_type=str(meta.get("document_type") or "SUPPORT_DOCUMENT"),
                    file_field_name=field_name,
                )
            )
            uploaded = request.FILES.get(field_name)
            if uploaded is not None:
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
            result = IlmLifecycleService().request_otp_whitelist(
                params=params,
                files=files or None,
                patient=_resolve_patient(request),
                facility=_facility(request),
                user=request.user,
            )
        except DHAError as exc:
            return _ilm_handle_error("otp_whitelist_request", exc)
        return _result_to_response(result, http_status=status.HTTP_201_CREATED)


class IlmOtpWhitelistCallbackView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        beneficiary_cr_id = request.query_params.get("beneficiary_cr_id")
        if not beneficiary_cr_id:
            return Response(
                {"error": "beneficiary_cr_id is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        try:
            result = IlmLifecycleService().list_otp_whitelist_status(
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
    permission_classes = [IsAuthenticated]

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
            result = IlmLifecycleService().add_next_of_kin_contact(
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
    permission_classes = [IsAuthenticated]

    def post(self, request):
        consent_token = request.data.get("consent_token")
        identification_number = request.data.get("identification_number")
        if not consent_token or not identification_number:
            return Response(
                {"error": "consent_token and identification_number are required."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        try:
            result = IlmLifecycleService().add_emergency_claim_doctor(
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
    permission_classes = [IsAuthenticated]

    def delete(self, request):
        consent_token = request.data.get("consent_token")
        if not consent_token:
            return Response(
                {"error": "consent_token is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        try:
            result = IlmLifecycleService().remove_emergency_claim_doctor(
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
    permission_classes = [IsAuthenticated]

    def get(self, request):
        patient_id = request.query_params.get("patient_id")
        policy_year = request.query_params.get("policy_year")
        if not patient_id or not policy_year:
            return Response(
                {"error": "patient_id and policy_year are required."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        try:
            result = IlmLifecycleService().get_pomsf_balances(
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
    permission_classes = [IsAuthenticated]
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
            result = IlmLifecycleService().upload_file(
                upload=upload,
                facility=_facility(request),
                user=request.user,
            )
        except DHAError as exc:
            return _ilm_handle_error("file_upload", exc)
        return _result_to_response(result, http_status=status.HTTP_201_CREATED)


class IlmFileUrlView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, file_id: str):
        if not file_id:
            return Response(
                {"error": "file_id is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        try:
            result = IlmLifecycleService().get_upload_url(
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
    permission_classes = [IsAuthenticated]

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
    permission_classes = [IsAuthenticated]

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
    permission_classes = [IsAuthenticated]

    def get(self, request):
        qs = SHAUpload.objects.all().order_by("-uploaded_at")
        dha_file_id = request.query_params.get("dha_file_id")
        if dha_file_id:
            qs = qs.filter(dha_file_id=dha_file_id)
        return Response({"results": [_serialize_upload(u) for u in qs[:200]]})
