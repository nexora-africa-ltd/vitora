"""DHA HIE Middleware (ILM) — ePrescriptions (Phase 5).

Wraps the four ``/api/v1/prescriptions...`` operations:

* ``GET    /api/v1/prescriptions``            — preview prescription
* ``POST   /api/v1/prescriptions``            — create prescription
* ``POST   /api/v1/prescriptions/dispenses``  — record dispense
* ``DELETE /api/v1/prescriptions/doctors``    — remove prescribing doctor

Each method goes through :class:`IlmClient` so retries, audit and PII
redaction are uniform. Side-effects on :class:`SHADhaPrescription`
are best-effort and never break the API call.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from typing import Any

from django.utils import timezone

from .ilm_client import IlmClient, IlmResponse

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Endpoint paths
# ---------------------------------------------------------------------------

PRESCRIPTIONS_PATH = "/api/v1/prescriptions"
PRESCRIPTION_DISPENSES_PATH = "/api/v1/prescriptions/dispenses"
PRESCRIPTION_DOCTORS_PATH = "/api/v1/prescriptions/doctors"


def _publish_safe(event_type: str, payload: dict) -> None:
    """Publish a billing event without ever breaking the calling request."""
    try:
        from hmis.apps.core.events import publish_event

        publish_event(event_type, payload)
    except Exception:  # pragma: no cover
        logger.exception("Failed to publish DHA HIE prescription event %s", event_type)


# ---------------------------------------------------------------------------
# Request payload dataclasses
# ---------------------------------------------------------------------------


@dataclass
class PrescriptionItem:
    generic_concept_code: str
    dose_quantity: float
    dose_unit: str
    frequency: int
    duration: int
    duration_unit: str
    period_unit: str
    start_date: str
    end_date: str = ""
    additional_instruction: str = ""
    patient_instruction: str = ""
    needs_refill: bool = False
    refill_count: int = 0


@dataclass
class CreatePrescriptionParams:
    consent_token: str
    intervention_code: str
    identification_number: str
    items: list[PrescriptionItem] = field(default_factory=list)
    identification_type: str = ""
    regulation_body: str = ""


@dataclass
class DispenseDoctor:
    identification_number: str
    identification_type: str = ""


@dataclass
class DispenseProduct:
    actual_product_code: str
    medication_price: float
    total_quantity: int


@dataclass
class CreateDispenseParams:
    consent_token: str
    intervention_code: str
    actual_products: list[DispenseProduct] = field(default_factory=list)
    doctors: list[DispenseDoctor] = field(default_factory=list)


@dataclass
class RemovePrescriptionDoctorParams:
    consent_token: str
    intervention_code: str
    practitioner_registration_number: str


# ---------------------------------------------------------------------------
# Result wrapper
# ---------------------------------------------------------------------------


@dataclass
class IlmPrescriptionResult:
    response: IlmResponse
    payload: Any = None
    record_id: int | None = None  # local audit row PK if any

    @property
    def status_code(self) -> int:
        return self.response.status_code

    @property
    def correlation_id(self) -> str:
        return str(self.response.headers.get("X-Correlation-Id") or "")

    @property
    def dha_external_id(self) -> str:
        if isinstance(self.payload, dict):
            for key in ("guid", "id", "prescription_id"):
                value = self.payload.get(key)
                if value:
                    return str(value)
        return ""


# ---------------------------------------------------------------------------
# Service
# ---------------------------------------------------------------------------


class IlmPrescriptionService:
    """Per-action wrapper around DHA HIE ePrescription operations."""

    def __init__(self, client: IlmClient | None = None) -> None:
        self.client = client or IlmClient()

    # ---------------------------------------------------------------- preview

    def preview_prescription(
        self,
        *,
        consent_token: str,
        patient: Any = None,
        facility: Any = None,
        user: Any = None,
    ) -> IlmPrescriptionResult:
        response = self.client.get(
            PRESCRIPTIONS_PATH,
            params={"consent_token": consent_token},
            consent_token=consent_token,
            facility=facility,
            user=user,
        )
        payload = response.json
        _publish_safe(
            "billing.dha_prescription.fetched",
            {
                "consent_token": consent_token,
                "patient_id": getattr(patient, "pk", None),
                "facility_id": getattr(facility, "pk", None),
                "status_code": response.status_code,
                "correlation_id": response.headers.get("X-Correlation-Id", ""),
            },
        )
        return IlmPrescriptionResult(response=response, payload=payload)

    # ---------------------------------------------------------------- create

    def create_prescription(
        self,
        *,
        params: CreatePrescriptionParams,
        patient: Any = None,
        encounter: Any = None,
        claim: Any = None,
        facility: Any = None,
        user: Any = None,
    ) -> IlmPrescriptionResult:
        body: dict[str, Any] = {
            "consent_token": params.consent_token,
            "intervention_code": params.intervention_code,
            "identification_number": params.identification_number,
            "items": [self._serialize_item(it) for it in params.items],
        }
        if params.identification_type:
            body["identification_type"] = params.identification_type
        if params.regulation_body:
            body["regulation_body"] = params.regulation_body

        response = self.client.post(
            PRESCRIPTIONS_PATH,
            json_body=body,
            consent_token=params.consent_token,
            facility=facility,
            user=user,
        )
        payload = response.json
        record = self._record_prescription(
            params=params,
            response=response,
            payload=payload,
            patient=patient,
            encounter=encounter,
            claim=claim,
            facility=facility,
            user=user,
        )
        _publish_safe(
            "billing.dha_prescription.created",
            {
                "record_id": record.pk if record else None,
                "intervention_code": params.intervention_code,
                "patient_id": getattr(patient, "pk", None),
                "facility_id": getattr(facility, "pk", None),
                "status_code": response.status_code,
                "correlation_id": response.headers.get("X-Correlation-Id", ""),
            },
        )
        return IlmPrescriptionResult(
            response=response, payload=payload, record_id=record.pk if record else None
        )

    # ---------------------------------------------------------------- dispense

    def create_dispense(
        self,
        *,
        params: CreateDispenseParams,
        prescription: Any = None,
        facility: Any = None,
        user: Any = None,
    ) -> IlmPrescriptionResult:
        body: dict[str, Any] = {
            "consent_token": params.consent_token,
            "intervention_code": params.intervention_code,
            "actual_products": [
                {
                    "actual_product_code": p.actual_product_code,
                    "medication_price": p.medication_price,
                    "total_quantity": p.total_quantity,
                }
                for p in params.actual_products
            ],
            "doctors": [
                {
                    "identification_number": d.identification_number,
                    **(
                        {"identification_type": d.identification_type}
                        if d.identification_type
                        else {}
                    ),
                }
                for d in params.doctors
            ],
        }
        response = self.client.post(
            PRESCRIPTION_DISPENSES_PATH,
            json_body=body,
            consent_token=params.consent_token,
            facility=facility,
            user=user,
        )
        payload = response.json
        record = self._mark_dispensed(
            prescription=prescription,
            params=params,
            response=response,
            payload=payload,
        )
        _publish_safe(
            "billing.dha_prescription.dispensed",
            {
                "record_id": record.pk if record else None,
                "intervention_code": params.intervention_code,
                "facility_id": getattr(facility, "pk", None),
                "status_code": response.status_code,
                "correlation_id": response.headers.get("X-Correlation-Id", ""),
            },
        )
        return IlmPrescriptionResult(
            response=response, payload=payload, record_id=record.pk if record else None
        )

    # -------------------------------------------------------- remove doctor

    def remove_prescription_doctor(
        self,
        *,
        params: RemovePrescriptionDoctorParams,
        facility: Any = None,
        user: Any = None,
    ) -> IlmPrescriptionResult:
        body = {
            "consent_token": params.consent_token,
            "intervention_code": params.intervention_code,
            "practitioner_registration_number": params.practitioner_registration_number,
        }
        response = self.client.delete(
            PRESCRIPTION_DOCTORS_PATH,
            json_body=body,
            consent_token=params.consent_token,
            facility=facility,
            user=user,
        )
        payload = response.json
        _publish_safe(
            "billing.dha_prescription.doctor_removed",
            {
                "intervention_code": params.intervention_code,
                "practitioner_registration_number": params.practitioner_registration_number,
                "facility_id": getattr(facility, "pk", None),
                "status_code": response.status_code,
                "correlation_id": response.headers.get("X-Correlation-Id", ""),
            },
        )
        return IlmPrescriptionResult(response=response, payload=payload)

    # ====================================================================
    # Helpers
    # ====================================================================

    @staticmethod
    def _serialize_item(item: PrescriptionItem) -> dict[str, Any]:
        body: dict[str, Any] = {
            "generic_concept_code": item.generic_concept_code,
            "dose_quantity": item.dose_quantity,
            "dose_unit": item.dose_unit,
            "frequency": item.frequency,
            "duration": item.duration,
            "duration_unit": item.duration_unit,
            "period_unit": item.period_unit,
            "start_date": item.start_date,
        }
        if item.end_date:
            body["end_date"] = item.end_date
        if item.additional_instruction:
            body["additional_instruction"] = item.additional_instruction
        if item.patient_instruction:
            body["patient_instruction"] = item.patient_instruction
        if item.needs_refill:
            body["needs_refill"] = True
            body["refill_count"] = item.refill_count
        return body

    def _record_prescription(
        self,
        *,
        params: CreatePrescriptionParams,
        response: IlmResponse,
        payload: Any,
        patient: Any,
        encounter: Any,
        claim: Any,
        facility: Any,
        user: Any,
    ):
        try:
            from hmis.apps.billing.models import SHADhaPrescription

            external_id = ""
            guid = ""
            if isinstance(payload, dict):
                external_id = str(payload.get("id") or payload.get("prescription_id") or "")
                guid = str(payload.get("guid") or "")
            status = (
                SHADhaPrescription.Status.CREATED
                if 200 <= response.status_code < 300
                else SHADhaPrescription.Status.FAILED
            )
            return SHADhaPrescription.objects.create(
                patient=patient if patient and getattr(patient, "pk", None) else None,
                encounter=encounter if encounter and getattr(encounter, "pk", None) else None,
                claim=claim if claim and getattr(claim, "pk", None) else None,
                facility=facility,
                consent_token=params.consent_token,
                intervention_code=params.intervention_code,
                identification_number=params.identification_number,
                identification_type=params.identification_type,
                regulation_body=params.regulation_body,
                items=[self._serialize_item(i) for i in params.items],
                status=status,
                dha_external_id=external_id,
                dha_guid=guid,
                response_payload=payload if isinstance(payload, dict) else {},
                correlation_id=str(response.headers.get("X-Correlation-Id") or ""),
                created_by=user if user and getattr(user, "pk", None) else None,
            )
        except Exception:  # pragma: no cover - audit best-effort
            logger.exception("Failed to record SHADhaPrescription")
            return None

    def _mark_dispensed(
        self,
        *,
        prescription: Any,
        params: CreateDispenseParams,
        response: IlmResponse,
        payload: Any,
    ):
        if not prescription or not getattr(prescription, "pk", None):
            return None
        try:
            from hmis.apps.billing.models import SHADhaPrescription

            obj = SHADhaPrescription.objects.filter(pk=prescription.pk).first()
            if not obj:
                return None
            obj.status = (
                SHADhaPrescription.Status.DISPENSED
                if 200 <= response.status_code < 300
                else SHADhaPrescription.Status.FAILED
            )
            obj.dispense_payload = payload if isinstance(payload, dict) else {}
            obj.dispensed_at = timezone.now()
            obj.save(update_fields=["status", "dispense_payload", "dispensed_at"])
            return obj
        except Exception:  # pragma: no cover
            logger.exception("Failed to mark SHADhaPrescription dispensed")
            return None
