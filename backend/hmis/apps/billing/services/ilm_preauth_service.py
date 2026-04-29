"""DHA HIE Middleware (ILM) — preauthorisation, doctor-consent & emergency.

Phase 3 implementation. Wraps the 10 ``/api/v1/...`` operations that govern:

Preauths (5):
* ``GET    /api/v1/preauths``                          — fetch by consent_token
* ``POST   /api/v1/preauths``                          — create (multipart)
* ``POST   /api/v1/preauth/cancel``                    — cancel (singular path,
                                                         falls back to plural
                                                         ``/api/v1/preauths/cancel``
                                                         on 404)
* ``DELETE /api/v1/preauths/diagnoses/{icd_code}``     — remove diagnosis
* ``DELETE /api/v1/preauths/doctors``                  — remove doctor

Doctor consent (1):
* ``POST   /api/v1/claims/doctor-consent``             — request doctor consent

Emergency (4):
* ``POST   /api/v1/claims/emergency``                  — open emergency claim
* ``GET    /api/v1/claims/emergency/protocols``        — list protocols
* ``POST   /api/v1/claims/emergency/protocols``        — apply protocol (multipart)
* ``POST   /api/v1/claims/emt``                        — create EMT claim

Each method goes through :class:`IlmClient` so retries, audit and PII
redaction are uniform. Side-effects on :class:`SHAPreauth` /
:class:`SHAEmergencyClaim` are best-effort and never break the API call.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Any

from django.utils import timezone

from .dha_errors import DHANotFoundError
from .ilm_client import IlmClient, IlmResponse
from .multipart_builder import MultipartFile, build_multipart

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Endpoint paths
# ---------------------------------------------------------------------------

PREAUTH_LIST_PATH = "/api/v1/preauths"
PREAUTH_CREATE_PATH = "/api/v1/preauths"
PREAUTH_CANCEL_PATH = "/api/v1/preauth/cancel"
PREAUTH_CANCEL_FALLBACK_PATH = "/api/v1/preauths/cancel"
PREAUTH_DIAGNOSES_PATH_TPL = "/api/v1/preauths/diagnoses/{icd_code}"
PREAUTH_DOCTORS_PATH = "/api/v1/preauths/doctors"

DOCTOR_CONSENT_PATH = "/api/v1/claims/doctor-consent"

EMERGENCY_PATH = "/api/v1/claims/emergency"
EMERGENCY_PROTOCOLS_PATH = "/api/v1/claims/emergency/protocols"
EMT_PATH = "/api/v1/claims/emt"


def _publish_safe(event_type: str, payload: dict) -> None:
    """Publish a billing event without ever breaking the calling request."""
    try:
        from hmis.apps.core.events import publish_event

        publish_event(event_type, payload)
    except Exception:  # pragma: no cover
        logger.exception("Failed to publish DHA HIE preauth event %s", event_type)


# ---------------------------------------------------------------------------
# Request payload dataclasses
# ---------------------------------------------------------------------------


@dataclass
class DoctorConsentParams:
    consent_token: str
    intervention_code: str
    practitioner_registration_number: str
    identification_number: str
    identification_type: str = "registration_number"
    regulation_body: str = "KMPDC"
    request_type: str = "PREAUTH_DOCTOR_APPROVAL_REQUEST"
    service_type: str = ""
    emergency_claim_id: str = ""
    created: str = ""


@dataclass
class EmergencyVisitParams:
    interventions: list[str]
    brought_by: str = "RELATIVE"
    mode_of_arrival: str = "AMBULANCE"
    beneficiary_cr_id: str = ""
    identification_number: str = ""
    notes: str = ""
    otp: str = ""
    reference_number: str = ""


@dataclass
class EmergencyProtocolParams:
    consent_token: str
    protocol_code: str
    intervention_code: str
    unit_price: float
    quantity: int
    diagnoses: str = ""  # comma-separated ICD codes per spec


@dataclass
class EmtAttachment:
    document_title: str
    document_type: str  # e.g. DISCHARGE_SUMMARY
    file_field_name: str


@dataclass
class EmtVisitParams:
    beneficiary_cr_id: str
    case_number: str
    consent_token: str
    diagnoses: list[str]
    interventions: list[str]
    practitioner_reg_number: str
    provider_registration_number: str
    protocol_code: str
    otp: str = ""
    attachments: list[EmtAttachment] | None = None


# ---------------------------------------------------------------------------
# Result wrapper
# ---------------------------------------------------------------------------


@dataclass
class IlmPreauthResult:
    response: IlmResponse
    payload: Any = None
    record_id: int | None = None  # local SHAPreauth / SHAEmergencyClaim PK

    @property
    def status_code(self) -> int:
        return self.response.status_code

    @property
    def correlation_id(self) -> str:
        return str(self.response.headers.get("X-Correlation-Id") or "")

    @property
    def dha_external_id(self) -> str:
        if isinstance(self.payload, dict):
            for key in ("preauth_id", "claim_id", "id", "emergency_claim_id"):
                value = self.payload.get(key)
                if value:
                    return str(value)
        return ""


# ---------------------------------------------------------------------------
# Service
# ---------------------------------------------------------------------------


class IlmPreauthService:
    """Per-action wrapper around DHA HIE preauth, doctor-consent & emergency."""

    def __init__(self, client: IlmClient | None = None) -> None:
        self.client = client or IlmClient()

    # =====================================================================
    # Preauths
    # =====================================================================

    def fetch_preauth(
        self,
        *,
        consent_token: str,
        facility: Any = None,
        user: Any = None,
        preauth: Any = None,
    ) -> IlmPreauthResult:
        response = self.client.get(
            PREAUTH_LIST_PATH,
            params={"consent_token": consent_token},
            consent_token=consent_token,
            facility=facility,
            user=user,
        )
        result = IlmPreauthResult(response=response, payload=response.json)
        if preauth is not None:
            self._stamp_preauth_response(preauth, result, save_status=False)
        from hmis.apps.core.events import BillingEvents

        _publish_safe(
            BillingEvents.DHA_PREAUTH_FETCHED,
            {
                "consent_token_present": bool(consent_token),
                "preauth_id": getattr(preauth, "pk", None),
                "facility_id": getattr(facility, "id", None),
                "http_status": response.status_code,
            },
        )
        return result

    def create_preauth(
        self,
        *,
        consent_token: str,
        intervention_code: str,
        files: list[MultipartFile] | None = None,
        extra_fields: dict[str, Any] | None = None,
        patient: Any = None,
        sha_member: Any = None,
        claim: Any = None,
        facility: Any = None,
        user: Any = None,
    ) -> IlmPreauthResult:
        data: dict[str, Any] = {
            "consent_token": consent_token,
            "intervention_code": intervention_code,
        }
        if extra_fields:
            data.update({k: ("" if v is None else str(v)) for k, v in extra_fields.items()})
        multipart = build_multipart(files) if files else None
        response = self.client.post(
            PREAUTH_CREATE_PATH,
            data=data,
            files=multipart,
            consent_token=consent_token,
            facility=facility,
            user=user,
        )
        result = IlmPreauthResult(response=response, payload=response.json)
        record = self._upsert_preauth(
            consent_token=consent_token,
            intervention_code=intervention_code,
            patient=patient,
            sha_member=sha_member,
            claim=claim,
            facility=facility,
            user=user,
            result=result,
            request_payload=data,
            new_status="submitted",
        )
        if record is not None:
            result.record_id = record.pk
        from hmis.apps.core.events import BillingEvents

        _publish_safe(
            BillingEvents.DHA_PREAUTH_CREATED,
            {
                "preauth_id": result.record_id,
                "intervention_code": intervention_code,
                "claim_id": getattr(claim, "pk", None),
                "patient_id": getattr(patient, "pk", None),
                "facility_id": getattr(facility, "id", None),
                "dha_external_id": result.dha_external_id,
                "http_status": response.status_code,
            },
        )
        return result

    def cancel_preauth(
        self,
        *,
        consent_token: str,
        intervention_code: str,
        facility: Any = None,
        user: Any = None,
        preauth: Any = None,
    ) -> IlmPreauthResult:
        body = {"consent_token": consent_token, "intervention_code": intervention_code}
        # OpenAPI says singular `/preauth/cancel`; Postman uses plural.
        # Try singular first; on 404 fall back to plural.
        try:
            response = self.client.post(
                PREAUTH_CANCEL_PATH,
                json_body=body,
                consent_token=consent_token,
                facility=facility,
                user=user,
            )
        except DHANotFoundError:
            logger.info("Preauth cancel singular path 404 — falling back to plural")
            response = self.client.post(
                PREAUTH_CANCEL_FALLBACK_PATH,
                json_body=body,
                consent_token=consent_token,
                facility=facility,
                user=user,
            )
        result = IlmPreauthResult(response=response, payload=response.json)
        record = self._mark_cancelled(
            consent_token=consent_token,
            intervention_code=intervention_code,
            user=user,
            preauth=preauth,
            result=result,
        )
        if record is not None:
            result.record_id = record.pk
        from hmis.apps.core.events import BillingEvents

        _publish_safe(
            BillingEvents.DHA_PREAUTH_CANCELLED,
            {
                "preauth_id": result.record_id,
                "intervention_code": intervention_code,
                "facility_id": getattr(facility, "id", None),
                "http_status": response.status_code,
            },
        )
        return result

    def remove_preauth_diagnosis(
        self,
        *,
        consent_token: str,
        intervention_code: str,
        icd_code: str,
        facility: Any = None,
        user: Any = None,
    ) -> IlmPreauthResult:
        body = {
            "consent_token": consent_token,
            "icd_code": icd_code,
            "intervention_code": intervention_code,
        }
        response = self.client.delete(
            PREAUTH_DIAGNOSES_PATH_TPL.format(icd_code=icd_code),
            json_body=body,
            consent_token=consent_token,
            facility=facility,
            user=user,
        )
        result = IlmPreauthResult(response=response, payload=response.json)
        from hmis.apps.core.events import BillingEvents

        _publish_safe(
            BillingEvents.DHA_PREAUTH_DIAGNOSIS_REMOVED,
            {
                "intervention_code": intervention_code,
                "icd_code": icd_code,
                "facility_id": getattr(facility, "id", None),
                "http_status": response.status_code,
            },
        )
        return result

    def remove_preauth_doctor(
        self,
        *,
        consent_token: str,
        intervention_code: str,
        practitioner_registration_number: str,
        facility: Any = None,
        user: Any = None,
    ) -> IlmPreauthResult:
        body = {
            "consent_token": consent_token,
            "intervention_code": intervention_code,
            "practitioner_registration_number": practitioner_registration_number,
        }
        response = self.client.delete(
            PREAUTH_DOCTORS_PATH,
            json_body=body,
            consent_token=consent_token,
            facility=facility,
            user=user,
        )
        result = IlmPreauthResult(response=response, payload=response.json)
        from hmis.apps.core.events import BillingEvents

        _publish_safe(
            BillingEvents.DHA_PREAUTH_DOCTOR_REMOVED,
            {
                "intervention_code": intervention_code,
                "practitioner_registration_number": practitioner_registration_number,
                "facility_id": getattr(facility, "id", None),
                "http_status": response.status_code,
            },
        )
        return result

    # =====================================================================
    # Preauth Doctor Consent
    # =====================================================================

    def request_doctor_consent(
        self,
        params: DoctorConsentParams,
        *,
        facility: Any = None,
        user: Any = None,
        preauth: Any = None,
    ) -> IlmPreauthResult:
        body: dict[str, Any] = {
            "consent_token": params.consent_token,
            "intervention_code": params.intervention_code,
            "practitioner_registration_number": params.practitioner_registration_number,
            "identification_number": params.identification_number,
            "identification_type": params.identification_type,
            "regulation_body": params.regulation_body,
            "request_type": params.request_type,
        }
        if params.service_type:
            body["service_type"] = params.service_type
        if params.emergency_claim_id:
            body["emergency_claim_id"] = params.emergency_claim_id
        if params.created:
            body["created"] = params.created
        response = self.client.post(
            DOCTOR_CONSENT_PATH,
            json_body=body,
            consent_token=params.consent_token,
            facility=facility,
            user=user,
        )
        result = IlmPreauthResult(response=response, payload=response.json)
        if preauth is not None and response.status_code < 400:
            try:
                preauth.doctor_consent_state = "REQUESTED"
                preauth.save(update_fields=["doctor_consent_state", "updated_at"])
            except Exception:  # pragma: no cover - persistence best-effort
                logger.exception("Failed to update preauth.doctor_consent_state")
        from hmis.apps.core.events import BillingEvents

        _publish_safe(
            BillingEvents.DHA_PREAUTH_DOCTOR_CONSENT_REQUESTED,
            {
                "preauth_id": getattr(preauth, "pk", None),
                "intervention_code": params.intervention_code,
                "practitioner_registration_number": params.practitioner_registration_number,
                "facility_id": getattr(facility, "id", None),
                "http_status": response.status_code,
            },
        )
        return result

    # =====================================================================
    # Emergency
    # =====================================================================

    def open_emergency_claim(
        self,
        params: EmergencyVisitParams,
        *,
        patient: Any = None,
        sha_member: Any = None,
        facility: Any = None,
        user: Any = None,
    ) -> IlmPreauthResult:
        body: dict[str, Any] = {
            "interventions": list(params.interventions),
            "brought_by": params.brought_by,
            "mode_of_arrival": params.mode_of_arrival,
        }
        for key in (
            "beneficiary_cr_id",
            "identification_number",
            "notes",
            "otp",
            "reference_number",
        ):
            value = getattr(params, key)
            if value:
                body[key] = value
        response = self.client.post(
            EMERGENCY_PATH,
            json_body=body,
            facility=facility,
            user=user,
        )
        result = IlmPreauthResult(response=response, payload=response.json)
        record = self._upsert_emergency_claim(
            kind="emergency",
            params_dict={
                "reference_number": params.reference_number,
                "beneficiary_cr_id": params.beneficiary_cr_id,
                "brought_by": params.brought_by,
                "mode_of_arrival": params.mode_of_arrival,
                "notes": params.notes,
                "interventions": list(params.interventions),
            },
            patient=patient,
            sha_member=sha_member,
            facility=facility,
            user=user,
            result=result,
            request_payload=body,
        )
        if record is not None:
            result.record_id = record.pk
        from hmis.apps.core.events import BillingEvents

        _publish_safe(
            BillingEvents.DHA_EMERGENCY_OPENED,
            {
                "emergency_claim_id": result.record_id,
                "patient_id": getattr(patient, "pk", None),
                "facility_id": getattr(facility, "id", None),
                "interventions": list(params.interventions),
                "dha_external_id": result.dha_external_id,
                "http_status": response.status_code,
            },
        )
        return result

    def list_emergency_protocols(
        self,
        *,
        active: str,
        intervention_code: str,
        facility: Any = None,
        user: Any = None,
    ) -> IlmPreauthResult:
        response = self.client.get(
            EMERGENCY_PROTOCOLS_PATH,
            params={"active": active, "intervention_code": intervention_code},
            facility=facility,
            user=user,
        )
        result = IlmPreauthResult(response=response, payload=response.json)
        from hmis.apps.core.events import BillingEvents

        _publish_safe(
            BillingEvents.DHA_EMERGENCY_PROTOCOL_LISTED,
            {
                "intervention_code": intervention_code,
                "facility_id": getattr(facility, "id", None),
                "http_status": response.status_code,
            },
        )
        return result

    def apply_emergency_protocol(
        self,
        params: EmergencyProtocolParams,
        *,
        files: list[MultipartFile] | None = None,
        emergency_claim: Any = None,
        facility: Any = None,
        user: Any = None,
    ) -> IlmPreauthResult:
        data: dict[str, Any] = {
            "consent_token": params.consent_token,
            "protocol_code": params.protocol_code,
            "intervention_code": params.intervention_code,
            "unit_price": str(params.unit_price),
            "quantity": str(params.quantity),
            "diagnoses": params.diagnoses,
        }
        multipart = build_multipart(files) if files else None
        response = self.client.post(
            EMERGENCY_PROTOCOLS_PATH,
            data=data,
            files=multipart,
            consent_token=params.consent_token,
            facility=facility,
            user=user,
        )
        result = IlmPreauthResult(response=response, payload=response.json)
        from hmis.apps.core.events import BillingEvents

        _publish_safe(
            BillingEvents.DHA_EMERGENCY_PROTOCOL_APPLIED,
            {
                "emergency_claim_id": getattr(emergency_claim, "pk", None),
                "protocol_code": params.protocol_code,
                "intervention_code": params.intervention_code,
                "facility_id": getattr(facility, "id", None),
                "http_status": response.status_code,
            },
        )
        return result

    def create_emt_claim(
        self,
        params: EmtVisitParams,
        *,
        patient: Any = None,
        sha_member: Any = None,
        facility: Any = None,
        user: Any = None,
    ) -> IlmPreauthResult:
        body: dict[str, Any] = {
            "beneficiary_cr_id": params.beneficiary_cr_id,
            "case_number": params.case_number,
            "consent_token": params.consent_token,
            "diagnoses": list(params.diagnoses),
            "interventions": list(params.interventions),
            "practitioner_reg_number": params.practitioner_reg_number,
            "provider_registration_number": params.provider_registration_number,
            "protocol_code": params.protocol_code,
        }
        if params.otp:
            body["otp"] = params.otp
        if params.attachments:
            body["attachments"] = [
                {
                    "document_title": a.document_title,
                    "document_type": a.document_type,
                    "file_field_name": a.file_field_name,
                }
                for a in params.attachments
            ]
        response = self.client.post(
            EMT_PATH,
            json_body=body,
            consent_token=params.consent_token,
            facility=facility,
            user=user,
        )
        result = IlmPreauthResult(response=response, payload=response.json)
        record = self._upsert_emergency_claim(
            kind="emt",
            params_dict={
                "case_number": params.case_number,
                "beneficiary_cr_id": params.beneficiary_cr_id,
                "interventions": list(params.interventions),
                "diagnoses": list(params.diagnoses),
            },
            patient=patient,
            sha_member=sha_member,
            facility=facility,
            user=user,
            result=result,
            request_payload=body,
            consent_token=params.consent_token,
        )
        if record is not None:
            result.record_id = record.pk
        from hmis.apps.core.events import BillingEvents

        _publish_safe(
            BillingEvents.DHA_EMT_CLAIM_CREATED,
            {
                "emergency_claim_id": result.record_id,
                "case_number": params.case_number,
                "facility_id": getattr(facility, "id", None),
                "dha_external_id": result.dha_external_id,
                "http_status": response.status_code,
            },
        )
        return result

    # =====================================================================
    # Persistence helpers
    # =====================================================================

    def _upsert_preauth(
        self,
        *,
        consent_token: str,
        intervention_code: str,
        patient: Any,
        sha_member: Any,
        claim: Any,
        facility: Any,
        user: Any,
        result: IlmPreauthResult,
        request_payload: dict[str, Any],
        new_status: str,
    ):
        if patient is None:
            return None
        from hmis.apps.billing.models import SHAPreauth

        try:
            obj, _created = SHAPreauth.objects.get_or_create(
                consent_token=consent_token,
                intervention_code=intervention_code,
                defaults={
                    "patient": patient,
                    "sha_member": sha_member,
                    "claim": claim,
                    "facility": facility,
                    "requested_by": user if getattr(user, "is_authenticated", False) else None,
                    "request_payload": request_payload,
                    "response_payload": result.payload or {},
                    "correlation_id": result.correlation_id,
                    "dha_external_id": result.dha_external_id[:64],
                    "status": new_status,
                    "submitted_at": timezone.now() if new_status == "submitted" else None,
                },
            )
            if not _created:
                obj.request_payload = request_payload
                obj.response_payload = result.payload or {}
                obj.correlation_id = result.correlation_id or obj.correlation_id
                ext = result.dha_external_id
                if ext:
                    obj.dha_external_id = ext[:64]
                if result.status_code < 400:
                    obj.status = new_status
                    obj.submitted_at = obj.submitted_at or timezone.now()
                obj.save()
            return obj
        except Exception:  # pragma: no cover
            logger.exception("Failed to upsert SHAPreauth")
            return None

    def _stamp_preauth_response(
        self, preauth: Any, result: IlmPreauthResult, *, save_status: bool
    ) -> None:
        try:
            preauth.response_payload = result.payload or {}
            if result.correlation_id:
                preauth.correlation_id = result.correlation_id
            if save_status and result.status_code < 400:
                preauth.status = "submitted"
            preauth.save(
                update_fields=[
                    "response_payload",
                    "correlation_id",
                    "status",
                    "updated_at",
                ]
            )
        except Exception:  # pragma: no cover
            logger.exception("Failed to stamp preauth response")

    def _mark_cancelled(
        self,
        *,
        consent_token: str,
        intervention_code: str,
        user: Any,
        preauth: Any,
        result: IlmPreauthResult,
    ):
        from hmis.apps.billing.models import SHAPreauth

        if preauth is None:
            preauth = SHAPreauth.objects.filter(
                consent_token=consent_token,
                intervention_code=intervention_code,
            ).first()
        if preauth is None or result.status_code >= 400:
            return preauth
        try:
            preauth.status = "cancelled"
            preauth.cancelled_at = timezone.now()
            if user and getattr(user, "is_authenticated", False):
                preauth.decided_by = user
            preauth.response_payload = result.payload or {}
            preauth.correlation_id = result.correlation_id or preauth.correlation_id
            preauth.save()
        except Exception:  # pragma: no cover
            logger.exception("Failed to mark preauth cancelled")
        return preauth

    def _upsert_emergency_claim(
        self,
        *,
        kind: str,
        params_dict: dict[str, Any],
        patient: Any,
        sha_member: Any,
        facility: Any,
        user: Any,
        result: IlmPreauthResult,
        request_payload: dict[str, Any],
        consent_token: str = "",
    ):
        from hmis.apps.billing.models import SHAEmergencyClaim

        try:
            return SHAEmergencyClaim.objects.create(
                kind=kind,
                patient=patient,
                sha_member=sha_member,
                facility=facility,
                consent_token=consent_token,
                reference_number=params_dict.get("reference_number", "") or "",
                case_number=params_dict.get("case_number", "") or "",
                beneficiary_cr_id=params_dict.get("beneficiary_cr_id", "") or "",
                brought_by=params_dict.get("brought_by", "") or "",
                mode_of_arrival=params_dict.get("mode_of_arrival", "") or "",
                interventions=params_dict.get("interventions", []) or [],
                diagnoses=params_dict.get("diagnoses", []) or [],
                notes=params_dict.get("notes", "") or "",
                request_payload=request_payload,
                response_payload=result.payload or {},
                correlation_id=result.correlation_id,
                dha_external_id=result.dha_external_id[:64],
                status="submitted" if result.status_code < 400 else "open",
                opened_by=user if getattr(user, "is_authenticated", False) else None,
            )
        except Exception:  # pragma: no cover
            logger.exception("Failed to persist SHAEmergencyClaim")
            return None
