"""DHA HIE Middleware (ILM) — preauth, doctor-consent & emergency views.

Phase 3 endpoints. Mounted under ``/api/sha/ilm/...`` in ``sha_urls.py``.

Errors raised by :class:`IlmClient` are mapped via the same DHAError → HTTP
convention used elsewhere in the ILM module.
"""

from __future__ import annotations

import contextlib
import logging
from typing import Any

from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from hmis.apps.billing.models import SHAClaim, SHAEmergencyClaim, SHAMember, SHAPreauth
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
    return getattr(request.user, "primary_facility", None)


def _resolve(model, request, key: str):
    raw = request.query_params.get(key) or request.data.get(key)
    if not raw:
        return None
    try:
        return model.objects.get(pk=raw)
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

    permission_classes = [IsAuthenticated]

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

    permission_classes = [IsAuthenticated]

    def post(self, request):
        consent_token = request.data.get("consent_token")
        intervention_code = request.data.get("intervention_code")
        if not consent_token or not intervention_code:
            return Response(
                {"error": "consent_token and intervention_code are required"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        patient = _resolve(Patient, request, "patient_pk")
        if not patient:
            return Response({"error": "patient_pk is required"}, status=status.HTTP_400_BAD_REQUEST)
        try:
            result = IlmPreauthService().create_preauth(
                consent_token=consent_token,
                intervention_code=intervention_code,
                extra_fields=request.data.get("extra_fields") or {},
                patient=patient,
                sha_member=_resolve(SHAMember, request, "sha_member_id"),
                claim=_resolve(SHAClaim, request, "claim_pk"),
                facility=_facility(request),
                user=request.user,
            )
        except DHAError as exc:
            return _ilm_handle_error(
                "preauth_create", exc, extra={"intervention_code": intervention_code}
            )
        return _result_to_response(result, http_status=status.HTTP_201_CREATED)


class IlmPreauthCancelView(APIView):
    """POST /api/sha/ilm/preauth/cancel/

    Body: { consent_token, intervention_code }
    """

    permission_classes = [IsAuthenticated]

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

    permission_classes = [IsAuthenticated]

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

    permission_classes = [IsAuthenticated]

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

    permission_classes = [IsAuthenticated]

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

    permission_classes = [IsAuthenticated]

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

    permission_classes = [IsAuthenticated]

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

    permission_classes = [IsAuthenticated]

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

    permission_classes = [IsAuthenticated]

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

    permission_classes = [IsAuthenticated]

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
    """GET /api/sha/ilm/preauth/local/?patient_pk=&claim_pk=

    Returns the cached SHAPreauth rows for browsing in the UI.
    At least one filter (patient_pk, claim_pk, or status) is required.
    """

    permission_classes = [IsAuthenticated]

    def get(self, request):
        patient = _resolve(Patient, request, "patient_pk")
        claim = _resolve(SHAClaim, request, "claim_pk")
        status_filter = request.query_params.get("status")

        if not patient and not claim and not status_filter:
            return Response(
                {"error": "At least one filter (patient_pk, claim_pk, or status) is required."},
                status=400,
            )

        qs = SHAPreauth.objects.all()
        if patient:
            qs = qs.filter(patient=patient)
        if claim:
            qs = qs.filter(claim=claim)
        if status_filter and status_filter in dict(SHAPreauth.Status.choices):
            qs = qs.filter(status=status_filter)
        return Response({"results": [_serialize_preauth(p) for p in qs[:200]]})


class SHAEmergencyClaimListView(APIView):
    """GET /api/sha/ilm/emergency/local/?patient_pk=&kind=

    Returns the cached SHAEmergencyClaim rows for browsing in the UI.
    """

    permission_classes = [IsAuthenticated]

    def get(self, request):
        qs = SHAEmergencyClaim.objects.all()
        patient = _resolve(Patient, request, "patient_pk")
        if patient:
            qs = qs.filter(patient=patient)
        kind = request.query_params.get("kind")
        if kind:
            qs = qs.filter(kind=kind)
        return Response({"results": [_serialize_emergency(e) for e in qs[:200]]})
