"""DHA HIE Middleware (ILM) — pre-visit registries & eligibility views.

Wraps :class:`IlmRegistriesService` so the frontend can call the 8 read-only
DHA HIE GETs through the regular Django REST API. All eligibility/benefits
calls write a :class:`SHACoverageSnapshot` row when ``patient`` is provided.

URL prefix: ``/api/sha/ilm/...`` (mounted in ``sha_urls.py``).

Errors raised by :class:`IlmClient` are mapped via the same DHAError → HTTP
status convention used by ``SHAClaimViewSet``.
"""

from __future__ import annotations

import contextlib
import logging

from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from hmis.apps.billing.models import PatientContact, SHAMember
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
from hmis.apps.billing.services.ilm_registries_service import IlmRegistriesService
from hmis.apps.core.events import BillingEvents, publish_event
from hmis.apps.patients.models import Patient

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _ilm_handle_error(view_name: str, exc: DHAError, *, extra: dict | None = None) -> Response:
    """Map a DHAError to an HTTP response and emit a failure event."""
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
    with contextlib.suppress(Exception):  # telemetry must not break the API
        publish_event(
            BillingEvents.DHA_REGISTRY_CALL_FAILED,
            {
                "view": view_name,
                "error": exc.__class__.__name__,
                "status_code": getattr(exc, "status_code", None),
                **(extra or {}),
            },
        )
    return Response(payload, status=http)


def _resolve_patient(request) -> Patient | None:
    raw = request.query_params.get("patient_pk") or request.data.get("patient_pk")
    if not raw:
        return None
    try:
        return Patient.objects.get(pk=raw)
    except (Patient.DoesNotExist, ValueError, TypeError):
        return None


def _resolve_sha_member(request) -> SHAMember | None:
    raw = request.query_params.get("sha_member_id") or request.data.get("sha_member_id")
    if not raw:
        return None
    try:
        return SHAMember.objects.get(pk=raw)
    except (SHAMember.DoesNotExist, ValueError, TypeError):
        return None


def _facility(request):
    return getattr(request.user, "primary_facility", None)


def _result_to_response(result) -> Response:
    return Response(
        {
            "data": result.payload,
            "http_status": result.status_code,
            "snapshot_id": getattr(result, "snapshot_id", None),
        },
        status=status.HTTP_200_OK,
    )


# ---------------------------------------------------------------------------
# Registries
# ---------------------------------------------------------------------------


class IlmFacilitySearchView(APIView):
    """GET /api/sha/ilm/registries/facility-search/?identifier=&identifier_type=&name="""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        identifier = request.query_params.get("identifier")
        identifier_type = request.query_params.get("identifier_type")
        name = request.query_params.get("name")
        if not identifier or not identifier_type:
            return Response(
                {"error": "identifier and identifier_type are required"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        try:
            result = IlmRegistriesService().search_facility(
                identifier=identifier,
                identifier_type=identifier_type,
                name=name,
                facility=_facility(request),
                user=request.user,
            )
        except DHAError as exc:
            return _ilm_handle_error(
                "facility_search", exc, extra={"identifier_type": identifier_type}
            )
        return _result_to_response(result)


class IlmPatientLookupView(APIView):
    """GET /api/sha/ilm/registries/patient-lookup/?identification_number=&identification_type="""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        idn = request.query_params.get("identification_number")
        idt = request.query_params.get("identification_type")
        if not idn or not idt:
            return Response(
                {"error": "identification_number and identification_type are required"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        try:
            result = IlmRegistriesService().lookup_patient(
                identification_number=idn,
                identification_type=idt,
                facility=_facility(request),
                user=request.user,
                patient=_resolve_patient(request),
                sha_member=_resolve_sha_member(request),
            )
        except DHAError as exc:
            return _ilm_handle_error("patient_lookup", exc, extra={"identification_type": idt})
        return _result_to_response(result)


class IlmProfessionalSearchView(APIView):
    """GET /api/sha/ilm/registries/professional-search/?identification_number=&identification_type=&regulator="""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        idn = request.query_params.get("identification_number")
        idt = request.query_params.get("identification_type")
        regulator = request.query_params.get("regulator")
        if not idn or not idt or not regulator:
            return Response(
                {"error": "identification_number, identification_type and regulator are required"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        try:
            result = IlmRegistriesService().search_professional(
                identification_number=idn,
                identification_type=idt,
                regulator=regulator,
                facility=_facility(request),
                user=request.user,
            )
        except DHAError as exc:
            return _ilm_handle_error("professional_search", exc, extra={"regulator": regulator})
        return _result_to_response(result)


# ---------------------------------------------------------------------------
# Eligibility & benefits
# ---------------------------------------------------------------------------


class IlmEligibilityView(APIView):
    """GET /api/sha/ilm/eligibility/?identification_number=&identification_type=&patient_pk="""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        idn = request.query_params.get("identification_number")
        idt = request.query_params.get("identification_type")
        if not idn or not idt:
            return Response(
                {"error": "identification_number and identification_type are required"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        try:
            result = IlmRegistriesService().check_eligibility(
                identification_number=idn,
                identification_type=idt,
                patient=_resolve_patient(request),
                sha_member=_resolve_sha_member(request),
                facility=_facility(request),
                user=request.user,
            )
        except DHAError as exc:
            return _ilm_handle_error("eligibility", exc, extra={"identification_type": idt})
        return _result_to_response(result)


class IlmBenefitsView(APIView):
    """GET /api/sha/ilm/benefits/?patient_id=&fields=&is_unique_benefit=&patient_pk="""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        patient_id = request.query_params.get("patient_id")
        if not patient_id:
            return Response(
                {"error": "patient_id is required"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        is_unique_raw = request.query_params.get("is_unique_benefit")
        is_unique = None
        if is_unique_raw is not None:
            is_unique = str(is_unique_raw).lower() in {"1", "true", "yes"}
        try:
            result = IlmRegistriesService().fetch_benefits(
                patient_id=patient_id,
                fields=request.query_params.get("fields"),
                is_unique_benefit=is_unique,
                patient=_resolve_patient(request),
                sha_member=_resolve_sha_member(request),
                facility=_facility(request),
                user=request.user,
            )
        except DHAError as exc:
            return _ilm_handle_error("benefits", exc, extra={"patient_id": patient_id})
        return _result_to_response(result)


class IlmSubBenefitsView(APIView):
    """GET /api/sha/ilm/sub-benefits/?patient_id=&patient_pk="""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        patient_id = request.query_params.get("patient_id")
        if not patient_id:
            return Response(
                {"error": "patient_id is required"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        try:
            result = IlmRegistriesService().fetch_sub_benefits(
                patient_id=patient_id,
                patient=_resolve_patient(request),
                sha_member=_resolve_sha_member(request),
                facility=_facility(request),
                user=request.user,
            )
        except DHAError as exc:
            return _ilm_handle_error("sub_benefits", exc, extra={"patient_id": patient_id})
        return _result_to_response(result)


class IlmBenefitInterventionsView(APIView):
    """GET /api/sha/ilm/benefit-interventions/?patient_id=&sub_benefit_code=&patient_pk="""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        patient_id = request.query_params.get("patient_id")
        sub_benefit_code = request.query_params.get("sub_benefit_code")
        if not patient_id or not sub_benefit_code:
            return Response(
                {"error": "patient_id and sub_benefit_code are required"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        try:
            result = IlmRegistriesService().fetch_benefit_interventions(
                patient_id=patient_id,
                sub_benefit_code=sub_benefit_code,
                patient=_resolve_patient(request),
                sha_member=_resolve_sha_member(request),
                facility=_facility(request),
                user=request.user,
            )
        except DHAError as exc:
            return _ilm_handle_error(
                "benefit_interventions",
                exc,
                extra={"patient_id": patient_id, "sub_benefit_code": sub_benefit_code},
            )
        return _result_to_response(result)


class IlmUtilizationView(APIView):
    """GET /api/sha/ilm/utilization/?patient_id=&intervention_code=&patient_pk="""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        patient_id = request.query_params.get("patient_id")
        intervention_code = request.query_params.get("intervention_code")
        if not patient_id or not intervention_code:
            return Response(
                {"error": "patient_id and intervention_code are required"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        try:
            result = IlmRegistriesService().fetch_utilization(
                patient_id=patient_id,
                intervention_code=intervention_code,
                patient=_resolve_patient(request),
                sha_member=_resolve_sha_member(request),
                facility=_facility(request),
                user=request.user,
            )
        except DHAError as exc:
            return _ilm_handle_error(
                "utilization",
                exc,
                extra={"patient_id": patient_id, "intervention_code": intervention_code},
            )
        return _result_to_response(result)


# ---------------------------------------------------------------------------
# PatientContact CRUD (cached records)
# ---------------------------------------------------------------------------


class PatientContactListCreateView(APIView):
    """List/create cached DHA patient contacts.

    GET  /api/sha/ilm/patient-contacts/?patient_pk=
    POST /api/sha/ilm/patient-contacts/  body: { patient_pk, contact_type, full_name, phone, ... }

    Writes are local-only at this stage; pushing contacts to DHA HIE
    (POST /api/v1/patients/next-of-kin/contacts) will be wired in Phase 3.
    """

    permission_classes = [IsAuthenticated]

    def get(self, request):
        patient = _resolve_patient(request)
        if not patient:
            return Response({"error": "patient_pk is required"}, status=400)
        contacts = PatientContact.objects.filter(patient=patient)
        return Response(
            {
                "results": [
                    {
                        "id": c.id,
                        "patient": c.patient_id,
                        "sha_member": c.sha_member_id,
                        "contact_type": c.contact_type,
                        "full_name": c.full_name,
                        "relationship": c.relationship,
                        "phone": c.phone,
                        "email": c.email,
                        "identification_number": c.identification_number,
                        "identification_type": c.identification_type,
                        "is_otp_recipient": c.is_otp_recipient,
                        "dha_contact_id": c.dha_contact_id,
                        "fetched_at": c.fetched_at.isoformat(),
                    }
                    for c in contacts
                ]
            }
        )

    def post(self, request):
        patient = _resolve_patient(request)
        if not patient:
            return Response({"error": "patient_pk is required"}, status=400)
        data = request.data
        contact = PatientContact.objects.create(
            patient=patient,
            sha_member=_resolve_sha_member(request),
            facility=_facility(request),
            contact_type=data.get("contact_type", PatientContact.ContactType.PRIMARY),
            full_name=data.get("full_name", ""),
            relationship=data.get("relationship", ""),
            phone=data.get("phone", ""),
            email=data.get("email", ""),
            identification_number=data.get("identification_number", ""),
            identification_type=data.get("identification_type", ""),
            is_otp_recipient=bool(data.get("is_otp_recipient", False)),
            dha_contact_id=data.get("dha_contact_id", ""),
            raw_payload=data.get("raw_payload") or {},
        )
        with contextlib.suppress(Exception):  # telemetry must not break the API
            publish_event(
                BillingEvents.DHA_PATIENT_CONTACT_CREATED,
                {
                    "patient_id": patient.id,
                    "contact_id": contact.id,
                    "contact_type": contact.contact_type,
                },
            )
        return Response(
            {
                "id": contact.id,
                "patient": contact.patient_id,
                "contact_type": contact.contact_type,
                "full_name": contact.full_name,
                "phone": contact.phone,
                "is_otp_recipient": contact.is_otp_recipient,
            },
            status=status.HTTP_201_CREATED,
        )
