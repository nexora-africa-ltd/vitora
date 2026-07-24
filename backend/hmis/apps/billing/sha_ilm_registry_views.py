# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
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
import re

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
from hmis.apps.core.permissions import WriteRequiresRolePermission
from hmis.apps.patients.models import Patient

logger = logging.getLogger(__name__)

_HWR_REGULATORS = ("KMPDC", "COC", "PPB", "NCK", "KMLTTB", "KNDI")
_HWR_REGULATOR_FULL_TO_ABBREV = {
    "kenya medical practitioners and dentists council": "KMPDC",
    "clinical officers council": "COC",
    "pharmacy and poisons board": "PPB",
    "nursing council of kenya": "NCK",
    "kenya medical laboratory technicians and technologists board": "KMLTTB",
    "kenya nutritionists and dieticians institute": "KNDI",
}


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
    with contextlib.suppress(Exception):  # telemetry must not break the API
        publish_event(
            BillingEvents.DHA_REGISTRY_CALL_FAILED,
            "dha_registry",
            0,
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
    facility = getattr(request, "facility", None)
    if facility is not None:
        return facility

    user = getattr(request, "user", None)
    profile = getattr(user, "staff_profile", None)
    if profile is not None and getattr(profile, "primary_facility_id", None):
        return getattr(profile, "primary_facility", None)

    return getattr(user, "primary_facility", None)


def _normalize_regulator(value: str | None) -> str:
    raw = str(value or "").strip()
    if not raw:
        return ""
    upper = raw.upper()
    if upper in _HWR_REGULATORS:
        return upper
    return _HWR_REGULATOR_FULL_TO_ABBREV.get(raw.lower(), "")


def _regulator_required_for_identification_type(identification_type: str) -> bool:
    normalized = str(identification_type or "").strip().lower()
    if normalized in {"national id", "passport"}:
        return False
    return "license" in normalized


_CR_NUMBER_RE = re.compile(r"^CR\d+-\d$")

_ILM_IDENTIFIER_TYPE_ALIASES = {
    "NATIONAL ID": "National ID",
    "REFUGEE ID": "Refugee ID",
    "MANDATE NUMBER": "Mandate Number",
    "ALIEN ID": "Alien ID",
    "BIRTH CERTIFICATE": "Birth Certificate",
    "BIRTH CERTIFICATE NUMBER": "Birth Certificate",
    "BIRTH NOTIFICATION": "Birth Notification",
    "CLIENTREGISTRY ID": "ClientRegistry ID",
    "CLIENT REGISTRY ID": "ClientRegistry ID",
    "CR ID": "ClientRegistry ID",
    "CR NUMBER": "ClientRegistry ID",
    "HIE PATIENT ID": "ClientRegistry ID",
}
_ILM_IDENTIFIER_TYPE_ALLOWED = sorted(set(_ILM_IDENTIFIER_TYPE_ALIASES.values()))


def _normalize_ilm_identifier_type(value: str | None) -> str | None:
    normalized = " ".join(str(value or "").strip().upper().split())
    if not normalized:
        return None
    return _ILM_IDENTIFIER_TYPE_ALIASES.get(normalized)


def _validate_patient_id(patient_id: str) -> str | None:
    """Return an error message if patient_id doesn't look like a CR number.

    ILM expects patient_id to be the Client Registry number (format:
    CR{digits}-{check_digit}, e.g. CR1481274185029-8) returned by the
    eligibility endpoint's ``memberCrNumber`` field.
    """
    if not _CR_NUMBER_RE.match(patient_id):
        return (
            f"patient_id '{patient_id}' does not match expected CR number format "
            "(CR{{digits}}-{{digit}}). Pass the memberCrNumber from the eligibility response."
        )
    return None


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

    permission_classes = [IsAuthenticated, WriteRequiresRolePermission]

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

    permission_classes = [IsAuthenticated, WriteRequiresRolePermission]

    def get(self, request):
        idn = request.query_params.get("identification_number")
        idt_raw = request.query_params.get("identification_type")
        idt = _normalize_ilm_identifier_type(idt_raw)
        if not idn or not idt_raw:
            return Response(
                {"error": "identification_number and identification_type are required"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if idt not in _ILM_IDENTIFIER_TYPE_ALLOWED:
            return Response(
                {
                    "error": (
                        "Invalid identification_type for ILM patient lookup. "
                        f"Allowed values: {', '.join(_ILM_IDENTIFIER_TYPE_ALLOWED)}"
                    )
                },
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

    permission_classes = [IsAuthenticated, WriteRequiresRolePermission]

    def get(self, request):
        idn = request.query_params.get("identification_number")
        idt = request.query_params.get("identification_type")
        regulator_raw = request.query_params.get("regulator")
        if not idn or not idt:
            return Response(
                {"error": "identification_number and identification_type are required"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        regulator = _normalize_regulator(regulator_raw)
        if _regulator_required_for_identification_type(idt) and not regulator:
            return Response(
                {
                    "error": (
                        "regulator is required for this identification_type and must be one of: "
                        + ", ".join(_HWR_REGULATORS)
                    )
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        regulators = [regulator] if regulator else list(_HWR_REGULATORS)
        service = IlmRegistriesService()
        last_error: DHAError | None = None

        for reg in regulators:
            try:
                result = service.search_professional(
                    identification_number=idn,
                    identification_type=idt,
                    regulator=reg,
                    facility=_facility(request),
                    user=request.user,
                )
                return _result_to_response(result)
            except DHANotFoundError as exc:
                last_error = exc
                continue
            except DHAValidationError as exc:
                msg = str(exc).lower()
                if "no practitioner" in msg or "not found" in msg:
                    last_error = exc
                    continue
                return _ilm_handle_error("professional_search", exc, extra={"regulator": reg})
            except DHAError as exc:
                last_error = exc
                continue

        if last_error is not None:
            return _ilm_handle_error(
                "professional_search", last_error, extra={"regulator": regulator}
            )

        return Response(
            {"error": "No practitioner found with the provided identification"},
            status=status.HTTP_404_NOT_FOUND,
        )


# ---------------------------------------------------------------------------
# Eligibility & benefits
# ---------------------------------------------------------------------------


class IlmEligibilityView(APIView):
    """GET /api/sha/ilm/eligibility/?identification_number=&identification_type=&patient_pk="""

    permission_classes = [IsAuthenticated, WriteRequiresRolePermission]

    def get(self, request):
        idn = request.query_params.get("identification_number")
        idt_raw = request.query_params.get("identification_type")
        idt = _normalize_ilm_identifier_type(idt_raw)
        if not idn or not idt_raw:
            return Response(
                {"error": "identification_number and identification_type are required"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if idt not in _ILM_IDENTIFIER_TYPE_ALLOWED:
            return Response(
                {
                    "error": (
                        "Invalid identification_type for ILM eligibility lookup. "
                        f"Allowed values: {', '.join(_ILM_IDENTIFIER_TYPE_ALLOWED)}"
                    )
                },
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

    permission_classes = [IsAuthenticated, WriteRequiresRolePermission]

    def get(self, request):
        patient_id = request.query_params.get("patient_id")
        if not patient_id:
            return Response(
                {"error": "patient_id is required"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        fmt_err = _validate_patient_id(patient_id)
        if fmt_err:
            logger.warning("IlmBenefitsView: %s", fmt_err)
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

    permission_classes = [IsAuthenticated, WriteRequiresRolePermission]

    def get(self, request):
        patient_id = request.query_params.get("patient_id")
        if not patient_id:
            return Response(
                {"error": "patient_id is required"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        fmt_err = _validate_patient_id(patient_id)
        if fmt_err:
            logger.warning("IlmSubBenefitsView: %s", fmt_err)
        parent_benefit_code = request.query_params.get("parent_benefit_code")
        try:
            result = IlmRegistriesService().fetch_sub_benefits(
                patient_id=patient_id,
                parent_benefit_code=parent_benefit_code,
                patient=_resolve_patient(request),
                sha_member=_resolve_sha_member(request),
                facility=_facility(request),
                user=request.user,
            )
        except DHAError as exc:
            return _ilm_handle_error("sub_benefits", exc, extra={"patient_id": patient_id})
        return _result_to_response(result)


class IlmBenefitInterventionsView(APIView):
    """GET /api/sha/ilm/benefit-interventions/?patient_id=&sub_benefit_code=&patient_pk=&service_type="""

    permission_classes = [IsAuthenticated, WriteRequiresRolePermission]

    def get(self, request):
        patient_id = request.query_params.get("patient_id")
        sub_benefit_code = request.query_params.get("sub_benefit_code")
        service_type = request.query_params.get("service_type")  # "OUTPATIENT" | "INPATIENT"
        if not patient_id or not sub_benefit_code:
            return Response(
                {"error": "patient_id and sub_benefit_code are required"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        fmt_err = _validate_patient_id(patient_id)
        if fmt_err:
            logger.warning("IlmBenefitInterventionsView: %s", fmt_err)
        try:
            result = IlmRegistriesService().fetch_benefit_interventions(
                patient_id=patient_id,
                sub_benefit_code=sub_benefit_code,
                patient=_resolve_patient(request),
                sha_member=_resolve_sha_member(request),
                facility=_facility(request),
                user=request.user,
                service_type=service_type,
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

    permission_classes = [IsAuthenticated, WriteRequiresRolePermission]

    def get(self, request):
        patient_id = request.query_params.get("patient_id")
        intervention_code = request.query_params.get("intervention_code")
        if not patient_id or not intervention_code:
            return Response(
                {"error": "patient_id and intervention_code are required"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        fmt_err = _validate_patient_id(patient_id)
        if fmt_err:
            logger.warning("IlmUtilizationView: %s", fmt_err)
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

    permission_classes = [IsAuthenticated, WriteRequiresRolePermission]

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
