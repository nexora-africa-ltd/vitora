"""DHA HIE Middleware (ILM) — Phase 5 ePrescription views.

Mounts under ``/api/sha/ilm/prescriptions/...``.

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

from hmis.apps.billing.models import SHADhaPrescription
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
from hmis.apps.billing.services.ilm_prescription_service import (
    CreateDispenseParams,
    CreatePrescriptionParams,
    DispenseDoctor,
    DispenseProduct,
    IlmPrescriptionService,
    PrescriptionItem,
    RemovePrescriptionDoctorParams,
)
from hmis.apps.core.events import BillingEvents, publish_event
from hmis.apps.core.permissions import WriteRequiresRolePermission
from hmis.apps.encounters.models import Encounter
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
            BillingEvents.DHA_PRESCRIPTION_CALL_FAILED,
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


def _resolve_encounter(request) -> Encounter | None:
    raw = request.data.get("encounter_pk")
    if not raw:
        return None
    try:
        return Encounter.objects.get(pk=raw)
    except (Encounter.DoesNotExist, ValueError, TypeError):
        return None


def _resolve_prescription(pk: Any) -> SHADhaPrescription | None:
    if not pk:
        return None
    try:
        return SHADhaPrescription.objects.filter(pk=pk).first()
    except (ValueError, TypeError):
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
# Preview
# ---------------------------------------------------------------------------


class IlmPrescriptionPreviewView(APIView):
    permission_classes = [IsAuthenticated, WriteRequiresRolePermission]

    def get(self, request):
        consent_token = request.query_params.get("consent_token")
        if not consent_token:
            return Response(
                {"error": "consent_token is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        try:
            result = IlmPrescriptionService().preview_prescription(
                consent_token=consent_token,
                patient=_resolve_patient(request),
                facility=_facility(request),
                user=request.user,
            )
        except DHAError as exc:
            return _ilm_handle_error("preview", exc)
        return _result_to_response(result)


# ---------------------------------------------------------------------------
# Create
# ---------------------------------------------------------------------------


class IlmPrescriptionCreateView(APIView):
    permission_classes = [IsAuthenticated, WriteRequiresRolePermission]

    REQUIRED_FIELDS = ("consent_token", "intervention_code", "identification_number", "items")

    def post(self, request):
        missing = [f for f in self.REQUIRED_FIELDS if not request.data.get(f)]
        if missing:
            return Response(
                {"error": f"Missing required fields: {', '.join(missing)}"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        items_raw = request.data.get("items")
        if not isinstance(items_raw, list) or not items_raw:
            return Response(
                {"error": "items must be a non-empty list."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        try:
            items = [self._build_item(it) for it in items_raw]
        except (KeyError, TypeError, ValueError) as exc:
            return Response(
                {"error": f"Invalid item: {exc}"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        params = CreatePrescriptionParams(
            consent_token=str(request.data["consent_token"]),
            intervention_code=str(request.data["intervention_code"]),
            identification_number=str(request.data["identification_number"]),
            identification_type=str(request.data.get("identification_type") or ""),
            regulation_body=str(request.data.get("regulation_body") or ""),
            items=items,
        )
        try:
            result = IlmPrescriptionService().create_prescription(
                params=params,
                patient=_resolve_patient(request),
                encounter=_resolve_encounter(request),
                facility=_facility(request),
                user=request.user,
            )
        except DHAError as exc:
            return _ilm_handle_error("create", exc)
        return _result_to_response(result, http_status=status.HTTP_201_CREATED)

    @staticmethod
    def _build_item(raw: dict) -> PrescriptionItem:
        return PrescriptionItem(
            generic_concept_code=str(raw["generic_concept_code"]),
            dose_quantity=float(raw["dose_quantity"]),
            dose_unit=str(raw["dose_unit"]),
            frequency=int(raw["frequency"]),
            duration=int(raw["duration"]),
            duration_unit=str(raw["duration_unit"]),
            period_unit=str(raw["period_unit"]),
            start_date=str(raw["start_date"]),
            end_date=str(raw.get("end_date") or ""),
            additional_instruction=str(raw.get("additional_instruction") or ""),
            patient_instruction=str(raw.get("patient_instruction") or ""),
            needs_refill=bool(raw.get("needs_refill") or False),
            refill_count=int(raw.get("refill_count") or 0),
        )


# ---------------------------------------------------------------------------
# Dispense
# ---------------------------------------------------------------------------


class IlmPrescriptionDispenseView(APIView):
    permission_classes = [IsAuthenticated, WriteRequiresRolePermission]

    REQUIRED_FIELDS = ("consent_token", "intervention_code", "actual_products")

    def post(self, request):
        missing = [f for f in self.REQUIRED_FIELDS if not request.data.get(f)]
        if missing:
            return Response(
                {"error": f"Missing required fields: {', '.join(missing)}"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        products_raw = request.data.get("actual_products")
        if not isinstance(products_raw, list) or not products_raw:
            return Response(
                {"error": "actual_products must be a non-empty list."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        doctors_raw = request.data.get("doctors") or []
        if not isinstance(doctors_raw, list):
            return Response(
                {"error": "doctors must be a list."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        try:
            actual_products = [
                DispenseProduct(
                    actual_product_code=str(p["actual_product_code"]),
                    medication_price=float(p["medication_price"]),
                    total_quantity=int(p["total_quantity"]),
                )
                for p in products_raw
            ]
            doctors = [
                DispenseDoctor(
                    identification_number=str(d["identification_number"]),
                    identification_type=str(d.get("identification_type") or ""),
                )
                for d in doctors_raw
            ]
        except (KeyError, TypeError, ValueError) as exc:
            return Response(
                {"error": f"Invalid payload: {exc}"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        params = CreateDispenseParams(
            consent_token=str(request.data["consent_token"]),
            intervention_code=str(request.data["intervention_code"]),
            actual_products=actual_products,
            doctors=doctors,
        )
        prescription = _resolve_prescription(request.data.get("prescription_pk"))
        try:
            result = IlmPrescriptionService().create_dispense(
                params=params,
                prescription=prescription,
                facility=_facility(request),
                user=request.user,
            )
        except DHAError as exc:
            return _ilm_handle_error("dispense", exc)
        return _result_to_response(result, http_status=status.HTTP_201_CREATED)


# ---------------------------------------------------------------------------
# Remove prescribing doctor
# ---------------------------------------------------------------------------


class IlmPrescriptionRemoveDoctorView(APIView):
    permission_classes = [IsAuthenticated, WriteRequiresRolePermission]

    REQUIRED_FIELDS = (
        "consent_token",
        "intervention_code",
        "practitioner_registration_number",
    )

    def delete(self, request):
        missing = [f for f in self.REQUIRED_FIELDS if not request.data.get(f)]
        if missing:
            return Response(
                {"error": f"Missing required fields: {', '.join(missing)}"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        params = RemovePrescriptionDoctorParams(
            consent_token=str(request.data["consent_token"]),
            intervention_code=str(request.data["intervention_code"]),
            practitioner_registration_number=str(request.data["practitioner_registration_number"]),
        )
        try:
            result = IlmPrescriptionService().remove_prescription_doctor(
                params=params,
                facility=_facility(request),
                user=request.user,
            )
        except DHAError as exc:
            return _ilm_handle_error("remove_doctor", exc)
        return _result_to_response(result)


# ---------------------------------------------------------------------------
# Local browse
# ---------------------------------------------------------------------------


def _serialize_prescription(obj: SHADhaPrescription) -> dict:
    return {
        "id": obj.pk,
        "patient": obj.patient_id,
        "encounter": obj.encounter_id,
        "claim": obj.claim_id,
        "facility": obj.facility_id,
        "status": obj.status,
        "intervention_code": obj.intervention_code,
        "identification_number": obj.identification_number,
        "identification_type": obj.identification_type,
        "regulation_body": obj.regulation_body,
        "items": obj.items,
        "dha_external_id": obj.dha_external_id,
        "dha_guid": obj.dha_guid,
        "correlation_id": obj.correlation_id,
        "created_at": obj.created_at.isoformat() if obj.created_at else None,
        "dispensed_at": obj.dispensed_at.isoformat() if obj.dispensed_at else None,
    }


class SHADhaPrescriptionListView(APIView):
    permission_classes = [IsAuthenticated, WriteRequiresRolePermission]

    def get(self, request):
        qs = SHADhaPrescription.objects.all()
        patient_pk = request.query_params.get("patient_pk")
        if patient_pk:
            qs = qs.filter(patient_id=patient_pk)
        status_param = request.query_params.get("status")
        if status_param:
            qs = qs.filter(status=status_param)
        intervention = request.query_params.get("intervention_code")
        if intervention:
            qs = qs.filter(intervention_code=intervention)
        rows = list(qs.order_by("-created_at")[:200])
        return Response({"results": [_serialize_prescription(r) for r in rows]})
