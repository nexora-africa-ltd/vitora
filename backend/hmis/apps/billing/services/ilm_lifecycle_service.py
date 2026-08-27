# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""DHA HIE Middleware (ILM) — lifecycle polish (OTP, discharge, NoK, etc.).

Phase 4 implementation. Wraps the ~10 ``/api/v1/...`` operations that
round out the inpatient / discharge / OTP whitelist flow.

OTP & Discharge:
* ``POST   /api/v1/claims/otp``                — visit OTP (intervention_codes)
* ``POST   /api/v1/claims/otp/discharge``      — discharge OTP
* ``POST   /api/v1/claims/discharge``          — finalize discharge
* ``POST   /api/v1/patients/otp-whitelists``   — request OTP whitelist (multipart)
* ``GET    /api/v1/patients/otp-whitelists/callback`` — fetch whitelist status

Patient & claim helpers:
* ``POST   /api/v1/patients/next-of-kin/contacts`` — add NoK contact
* ``POST   /api/v1/claims/doctors``            — add emergency claim doctor
* ``DELETE /api/v1/claims/doctors``            — remove emergency claim doctor
* ``GET    /api/v1/patients/pomsf-balances``   — POMSF benefit balances

File uploads:
* ``POST   /api/v1/uploads``                   — upload a file (multipart)
* ``GET    /api/v1/uploads/{file_id}``         — pre-signed download URL

Each method goes through :class:`IlmClient` so retries, audit and PII
redaction are uniform. Side-effects on :class:`SHAOtpRequest`,
:class:`SHAOtpWhitelistRequest` and :class:`SHAUpload` are best-effort
and never break the API call.
"""

from __future__ import annotations

import json
import logging
from dataclasses import dataclass, field
from datetime import date as date_cls
from typing import Any

from django.utils import timezone

from .ilm_client import IlmClient, IlmResponse
from .multipart_builder import MultipartFile, build_multipart

logger = logging.getLogger(__name__)


def _compact_discharge_snapshot(payload: Any) -> dict[str, Any]:
    """Keep only discharge-relevant DHA fields for local claim snapshotting."""
    if not isinstance(payload, dict):
        return {}

    source = payload.get("data") if isinstance(payload.get("data"), dict) else payload
    if not isinstance(source, dict):
        return {}

    keep_keys = {
        "id",
        "workflow_state",
        "claim_auth_status",
        "service_type",
        "scheme_code",
        "scheme_name",
        "patient_number",
        "member_number",
        "provider_name",
        "visit_start",
        "visit_end",
        "admitted_on",
        "discharged_on",
        "discharge_reason",
        "authorization_code",
        "authorization_guid",
        "invoice_id",
        "invoice_number",
        "number_of_invoices",
        "diagnoses_count",
        "claim_attachments_count",
        "invoice_attachments_count",
        "total_claim_amount",
        "total_claim_net_amount",
        "total_claim_copay",
        "total_claim_discount",
        "total_claim_splits",
    }
    snapshot = {k: source.get(k) for k in keep_keys if k in source}

    interventions = source.get("interventions")
    if isinstance(interventions, list):
        snapshot["intervention_codes"] = [
            str(item.get("intervention_code"))
            for item in interventions
            if isinstance(item, dict) and item.get("intervention_code")
        ]

    invoices = source.get("invoices")
    if isinstance(invoices, list):
        snapshot["invoice_numbers"] = [
            str(item.get("invoice_number"))
            for item in invoices
            if isinstance(item, dict) and item.get("invoice_number")
        ]

    return snapshot


# ---------------------------------------------------------------------------
# Endpoint paths
# ---------------------------------------------------------------------------

OTP_VISIT_PATH = "/api/v1/claims/otp"
OTP_DISCHARGE_PATH = "/api/v1/claims/otp/discharge"
DISCHARGE_PATH = "/api/v1/claims/discharge"
OTP_WHITELIST_PATH = "/api/v1/patients/otp-whitelists"
OTP_WHITELIST_CALLBACK_PATH = "/api/v1/patients/otp-whitelists/callback"
NEXT_OF_KIN_PATH = "/api/v1/patients/next-of-kin/contacts"
EMERGENCY_DOCTORS_PATH = "/api/v1/claims/doctors"
POMSF_BALANCES_PATH = "/api/v1/patients/pomsf-balances"
UPLOADS_PATH = "/api/v1/uploads"
UPLOAD_DETAIL_PATH_TPL = "/api/v1/uploads/{file_id}"


def _publish_safe(event_type: str, payload: dict) -> None:
    """Publish a billing event without ever breaking the calling request."""
    try:
        from hmis.apps.core.events import publish_event

        aggregate_id = payload.get("claim_id") or payload.get("patient_id") or ""
        publish_event(event_type, "SHAClaim", aggregate_id, payload)
    except (
        AttributeError,
        TypeError,
        ValueError,
        RuntimeError,
        OSError,
        AssertionError,
        ImportError,
    ):  # pragma: no cover
        logger.exception("Failed to publish DHA HIE lifecycle event %s", event_type)


# ---------------------------------------------------------------------------
# Request payload dataclasses
# ---------------------------------------------------------------------------


@dataclass
class VisitOtpParams:
    intervention_codes: list[str]
    patient_id: str  # CR identifier
    beneficiary_contact_id: str = ""


@dataclass
class DischargeOtpParams:
    consent_token: str
    patient_id: str  # CR identifier


@dataclass
class DischargeParams:
    consent_token: str
    discharge_date: str  # ISO 8601 yyyy-mm-dd
    discharge_reason: str  # RECOVERED | DECEASED | TRANSFERRED | DAMA | ...
    invoice_number: str
    otp: str = ""
    auth_guid: str = ""  # Biometric auth GUID (alternative to OTP)


@dataclass
class OtpWhitelistAttachment:
    document_title: str
    document_type: str  # e.g. SUPPORT_DOCUMENT
    file_field_name: str


@dataclass
class OtpWhitelistParams:
    beneficiary_cr_id: str
    facility_fr_code: str
    reason_type: str = "BIOMETRIC_FAILURE"
    reason: str = ""
    biometric_attempts: int = 0
    attachments: list[OtpWhitelistAttachment] = field(default_factory=list)


@dataclass
class NextOfKinParams:
    consent_token: str
    contact_value: str
    next_of_kin_full_name: str
    next_of_kin_id_number: str
    next_of_kin_id_number_type: str = "National ID"


@dataclass
class EmergencyDoctorAddParams:
    consent_token: str
    identification_number: str


@dataclass
class EmergencyDoctorRemoveParams:
    consent_token: str


@dataclass
class PomsfBalanceParams:
    patient_id: str
    policy_year: str
    principal_member_number: str = ""


# ---------------------------------------------------------------------------
# Result wrapper
# ---------------------------------------------------------------------------


@dataclass
class IlmLifecycleResult:
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
            for key in ("file_id", "id", "guid", "claim_id"):
                value = self.payload.get(key)
                if value:
                    return str(value)
        return ""


# ---------------------------------------------------------------------------
# Service
# ---------------------------------------------------------------------------


class IlmLifecycleService:
    """Per-action wrapper around DHA HIE lifecycle polish operations."""

    def __init__(self, client: IlmClient | None = None, facility: Any = None) -> None:
        self.client = client or IlmClient(facility=facility)

    # =====================================================================
    # OTP send (visit + discharge)
    # =====================================================================

    def send_visit_otp(
        self,
        *,
        params: VisitOtpParams,
        patient: Any = None,
        sha_member: Any = None,
        claim: Any = None,
        facility: Any = None,
        user: Any = None,
    ) -> IlmLifecycleResult:
        body: dict[str, Any] = {
            "intervention_codes": list(params.intervention_codes),
            "patient_id": params.patient_id,
        }
        if params.beneficiary_contact_id:
            body["beneficiary_contact_id"] = params.beneficiary_contact_id
        response = self.client.post(
            OTP_VISIT_PATH,
            json_body=body,
            facility=facility,
            user=user,
        )
        result = IlmLifecycleResult(response=response, payload=response.json)
        record = self._record_otp(
            kind="visit",
            consent_token="",
            patient_cr_id=params.patient_id,
            intervention_codes=list(params.intervention_codes),
            response=result,
            patient=patient,
            sha_member=sha_member,
            claim=claim,
            facility=facility,
            user=user,
        )
        if record is not None:
            result.record_id = record.pk

        from hmis.apps.core.events import BillingEvents

        _publish_safe(
            BillingEvents.DHA_VISIT_OTP_SENT,
            {
                "patient_id": getattr(patient, "id", None),
                "patient_cr_id": params.patient_id,
                "intervention_codes": list(params.intervention_codes),
                "facility_id": getattr(facility, "id", None),
                "http_status": response.status_code,
                "record_id": result.record_id,
            },
        )
        return result

    def send_discharge_otp(
        self,
        *,
        params: DischargeOtpParams,
        patient: Any = None,
        sha_member: Any = None,
        claim: Any = None,
        facility: Any = None,
        user: Any = None,
    ) -> IlmLifecycleResult:
        body = {"consent_token": params.consent_token, "patient_id": params.patient_id}
        response = self.client.post(
            OTP_DISCHARGE_PATH,
            json_body=body,
            consent_token=params.consent_token,
            facility=facility,
            user=user,
        )
        result = IlmLifecycleResult(response=response, payload=response.json)
        record = self._record_otp(
            kind="discharge",
            consent_token=params.consent_token,
            patient_cr_id=params.patient_id,
            intervention_codes=[],
            response=result,
            patient=patient,
            sha_member=sha_member,
            claim=claim,
            facility=facility,
            user=user,
        )
        if record is not None:
            result.record_id = record.pk

        from hmis.apps.core.events import BillingEvents

        _publish_safe(
            BillingEvents.DHA_DISCHARGE_OTP_SENT,
            {
                "patient_id": getattr(patient, "id", None),
                "patient_cr_id": params.patient_id,
                "consent_token_present": bool(params.consent_token),
                "facility_id": getattr(facility, "id", None),
                "http_status": response.status_code,
                "record_id": result.record_id,
            },
        )
        return result

    # =====================================================================
    # Discharge
    # =====================================================================

    def discharge_inpatient(
        self,
        *,
        params: DischargeParams,
        claim: Any = None,
        facility: Any = None,
        user: Any = None,
    ) -> IlmLifecycleResult:
        normalized_discharge_date = self._normalize_discharge_datetime(params.discharge_date)
        body: dict[str, str] = {
            "consent_token": params.consent_token,
            "discharge_date": normalized_discharge_date,
            "discharge_reason": params.discharge_reason,
            "invoice_number": params.invoice_number,
        }
        if params.auth_guid:
            body["auth_guid"] = params.auth_guid
        else:
            body["otp"] = params.otp
        response = self.client.post(
            DISCHARGE_PATH,
            json_body=body,
            consent_token=params.consent_token,
            facility=facility,
            user=user,
        )
        result = IlmLifecycleResult(response=response, payload=response.json)

        from hmis.apps.core.events import BillingEvents

        _publish_safe(
            BillingEvents.DHA_DISCHARGE_COMPLETED,
            {
                "consent_token_present": bool(params.consent_token),
                "invoice_number": params.invoice_number,
                "discharge_reason": params.discharge_reason,
                "claim_id": getattr(claim, "id", None),
                "facility_id": getattr(facility, "id", None),
                "http_status": response.status_code,
            },
        )

        if claim is not None and result.status_code < 400:
            update_fields: list[str] = []
            snapshot = _compact_discharge_snapshot(result.payload)
            discharge_date_raw = str(params.discharge_date or "").strip()
            if hasattr(claim, "discharge_date") and discharge_date_raw:
                date_part = discharge_date_raw.split("T", 1)[0]
                try:
                    claim.discharge_date = date_cls.fromisoformat(date_part)
                    update_fields.append("discharge_date")
                except ValueError:
                    pass
            if hasattr(claim, "status") and str(getattr(claim, "status", "")) in {
                "draft",
                "validated",
                "pending_submission",
            }:
                claim.status = "submitted"
                update_fields.append("status")
            if hasattr(claim, "submitted_at") and not getattr(claim, "submitted_at", None):
                claim.submitted_at = timezone.now()
                update_fields.append("submitted_at")
            if (
                user
                and hasattr(claim, "submitted_by_id")
                and not getattr(claim, "submitted_by_id", None)
            ):
                claim.submitted_by = user
                update_fields.append("submitted_by")
            if hasattr(claim, "dha_discharge_snapshot"):
                claim.dha_discharge_snapshot = snapshot
                update_fields.append("dha_discharge_snapshot")
            if hasattr(claim, "last_dha_status"):
                status_value = str(snapshot.get("workflow_state") or "").strip()
                if status_value:
                    claim.last_dha_status = status_value[:32]
                    update_fields.append("last_dha_status")
                elif "status" in update_fields:
                    claim.last_dha_status = "SUBMITTED"
                    update_fields.append("last_dha_status")
            if hasattr(claim, "last_dha_payload_at"):
                claim.last_dha_payload_at = timezone.now()
                update_fields.append("last_dha_payload_at")
            if hasattr(claim, "dha_external_id"):
                external_id = str(snapshot.get("id") or "").strip()
                if external_id:
                    claim.dha_external_id = external_id[:64]
                    update_fields.append("dha_external_id")
            if hasattr(claim, "dha_invoice_number"):
                invoice_number = str(snapshot.get("invoice_number") or "").strip()
                if invoice_number:
                    claim.dha_invoice_number = invoice_number[:64]
                    update_fields.append("dha_invoice_number")
            if hasattr(claim, "dha_correlation_id"):
                correlation_id = str(result.correlation_id or "").strip()
                if correlation_id:
                    claim.dha_correlation_id = correlation_id[:64]
                    update_fields.append("dha_correlation_id")

            if update_fields:
                claim.save(update_fields=list(dict.fromkeys([*update_fields, "updated_at"])))

        return result

    @staticmethod
    def _normalize_discharge_datetime(value: str) -> str:
        """Normalize discharge date to RFC3339 datetime expected by DHA.

        Accepts either:
        - ISO date: YYYY-MM-DD
        - ISO datetime: YYYY-MM-DDTHH:MM:SS[Z|±HH:MM]

        Returns RFC3339 datetime string, using end-of-day UTC for date-only
        inputs so same-day admissions do not fail "admission ahead of discharge"
        validation on DHA side.
        """
        raw = str(value or "").strip()
        if not raw:
            return raw

        if "T" in raw:
            return raw

        try:
            parsed_date = date_cls.fromisoformat(raw)
        except ValueError:
            return raw

        return f"{parsed_date.isoformat()}T23:59:59Z"

    # =====================================================================
    # OTP whitelist
    # =====================================================================

    def request_otp_whitelist(
        self,
        *,
        params: OtpWhitelistParams,
        files: list[MultipartFile] | None = None,
        patient: Any = None,
        facility: Any = None,
        user: Any = None,
    ) -> IlmLifecycleResult:
        reason = (params.reason or "").strip()
        if not reason:
            reason = f"Reason type: {params.reason_type}"

        data: dict[str, Any] = {
            "beneficiary_cr_id": params.beneficiary_cr_id,
            "facility_fr_code": params.facility_fr_code,
            "reason_type": params.reason_type,
            "reason": reason,
            "biometric_attempts": str(params.biometric_attempts),
        }
        # DHA requires `attachments` metadata even when empty
        attachments_meta = (
            [
                {
                    "document_title": a.document_title,
                    "document_type": a.document_type,
                    "file_field_name": a.file_field_name,
                }
                for a in params.attachments
            ]
            if params.attachments
            else []
        )
        data["attachments"] = attachments_meta
        # DHA always expects multipart/form-data for this endpoint, even without
        # attachments.  Encode all form fields as multipart tuples so that
        # requests uses multipart encoding (files={} is falsy and won't work).
        multipart_fields: dict[str, Any] = {}
        for key, value in data.items():
            if isinstance(value, list):
                multipart_fields[key] = (None, json.dumps(value), "application/json")
            else:
                multipart_fields[key] = (None, str(value))
        # Merge actual file uploads
        if files:
            multipart_fields.update(build_multipart(files))
        response = self.client.post(
            OTP_WHITELIST_PATH,
            files=multipart_fields,
            facility=facility,
            user=user,
        )
        result = IlmLifecycleResult(response=response, payload=response.json)
        record = self._record_otp_whitelist(
            params=params,
            response=result,
            patient=patient,
            facility=facility,
            user=user,
        )
        if record is not None:
            result.record_id = record.pk

        from hmis.apps.core.events import BillingEvents

        _publish_safe(
            BillingEvents.DHA_OTP_WHITELIST_REQUESTED,
            {
                "beneficiary_cr_id": params.beneficiary_cr_id,
                "reason_type": params.reason_type,
                "facility_id": getattr(facility, "id", None),
                "http_status": response.status_code,
                "record_id": result.record_id,
            },
        )
        return result

    def list_otp_whitelist_status(
        self,
        *,
        beneficiary_cr_id: str,
        facility_fr_code: str = "",
        facility_id_type: str = "fr-code",
        guid: str = "",
        facility: Any = None,
        user: Any = None,
    ) -> IlmLifecycleResult:
        params: dict[str, Any] = {"beneficiary_cr_id": beneficiary_cr_id}
        headers: dict[str, str] = {}
        if facility_fr_code:
            # Some ILM deployments expect facility_fr_code while others use
            # facility_id + facility_id_type. Send both for compatibility.
            params["facility_fr_code"] = facility_fr_code
            params["facility_id"] = facility_fr_code
            params["facility_id_type"] = facility_id_type
            headers = {
                "X-Facility-Id": facility_fr_code,
                "X-Facility-Id-Type": facility_id_type,
            }
        if guid:
            params["guid"] = guid
        response = self.client.get(
            OTP_WHITELIST_CALLBACK_PATH,
            params=params,
            headers=headers or None,
            facility=facility,
            user=user,
        )
        result = IlmLifecycleResult(response=response, payload=response.json)

        from hmis.apps.core.events import BillingEvents

        _publish_safe(
            BillingEvents.DHA_OTP_WHITELIST_FETCHED,
            {
                "beneficiary_cr_id": beneficiary_cr_id,
                "facility_id": getattr(facility, "id", None),
                "http_status": response.status_code,
            },
        )
        return result

    # =====================================================================
    # Next of kin
    # =====================================================================

    def add_next_of_kin_contact(
        self,
        *,
        params: NextOfKinParams,
        facility: Any = None,
        user: Any = None,
    ) -> IlmLifecycleResult:
        body = {
            "consent_token": params.consent_token,
            "contact_value": params.contact_value,
            "next_of_kin_full_name": params.next_of_kin_full_name,
            "next_of_kin_id_number": params.next_of_kin_id_number,
            "next_of_kin_id_number_type": params.next_of_kin_id_number_type,
        }
        response = self.client.post(
            NEXT_OF_KIN_PATH,
            json_body=body,
            consent_token=params.consent_token,
            facility=facility,
            user=user,
        )
        result = IlmLifecycleResult(response=response, payload=response.json)

        from hmis.apps.core.events import BillingEvents

        _publish_safe(
            BillingEvents.DHA_NEXT_OF_KIN_ADDED,
            {
                "consent_token_present": bool(params.consent_token),
                "facility_id": getattr(facility, "id", None),
                "http_status": response.status_code,
            },
        )
        return result

    # =====================================================================
    # Emergency claim doctors
    # =====================================================================

    def add_emergency_claim_doctor(
        self,
        *,
        params: EmergencyDoctorAddParams,
        facility: Any = None,
        user: Any = None,
    ) -> IlmLifecycleResult:
        body = {
            "consent_token": params.consent_token,
            "identification_number": params.identification_number,
        }
        response = self.client.post(
            EMERGENCY_DOCTORS_PATH,
            json_body=body,
            consent_token=params.consent_token,
            facility=facility,
            user=user,
        )
        result = IlmLifecycleResult(response=response, payload=response.json)

        from hmis.apps.core.events import BillingEvents

        _publish_safe(
            BillingEvents.DHA_EMERGENCY_DOCTOR_ADDED,
            {
                "consent_token_present": bool(params.consent_token),
                "facility_id": getattr(facility, "id", None),
                "http_status": response.status_code,
            },
        )
        return result

    def remove_emergency_claim_doctor(
        self,
        *,
        params: EmergencyDoctorRemoveParams,
        facility: Any = None,
        user: Any = None,
    ) -> IlmLifecycleResult:
        body = {"consent_token": params.consent_token}
        response = self.client.delete(
            EMERGENCY_DOCTORS_PATH,
            json_body=body,
            consent_token=params.consent_token,
            facility=facility,
            user=user,
        )
        result = IlmLifecycleResult(response=response, payload=response.json)

        from hmis.apps.core.events import BillingEvents

        _publish_safe(
            BillingEvents.DHA_EMERGENCY_DOCTOR_REMOVED,
            {
                "consent_token_present": bool(params.consent_token),
                "facility_id": getattr(facility, "id", None),
                "http_status": response.status_code,
            },
        )
        return result

    # =====================================================================
    # POMSF balances
    # =====================================================================

    def get_pomsf_balances(
        self,
        *,
        params: PomsfBalanceParams,
        patient: Any = None,
        facility: Any = None,
        user: Any = None,
    ) -> IlmLifecycleResult:
        query: dict[str, Any] = {
            "patient_id": params.patient_id,
            "policy_year": params.policy_year,
        }
        if params.principal_member_number:
            query["principal_member_number"] = params.principal_member_number
        response = self.client.get(
            POMSF_BALANCES_PATH,
            params=query,
            facility=facility,
            user=user,
        )
        result = IlmLifecycleResult(response=response, payload=response.json)

        from hmis.apps.core.events import BillingEvents

        _publish_safe(
            BillingEvents.DHA_POMSF_BALANCE_FETCHED,
            {
                "patient_id": getattr(patient, "id", None),
                "patient_cr_id": params.patient_id,
                "policy_year": params.policy_year,
                "facility_id": getattr(facility, "id", None),
                "http_status": response.status_code,
            },
        )
        return result

    # =====================================================================
    # File uploads
    # =====================================================================

    def upload_file(
        self,
        *,
        upload: MultipartFile,
        facility: Any = None,
        user: Any = None,
    ) -> IlmLifecycleResult:
        multipart = build_multipart([upload])
        response = self.client.post(
            UPLOADS_PATH,
            files=multipart,
            facility=facility,
            user=user,
        )
        result = IlmLifecycleResult(response=response, payload=response.json)
        record = self._record_upload(
            upload=upload,
            result=result,
            facility=facility,
            user=user,
        )
        if record is not None:
            result.record_id = record.pk

        from hmis.apps.core.events import BillingEvents

        _publish_safe(
            BillingEvents.DHA_FILE_UPLOADED,
            {
                "filename": upload.filename,
                "content_type": getattr(upload, "content_type", "") or "",
                "facility_id": getattr(facility, "id", None),
                "http_status": response.status_code,
                "dha_file_id": result.dha_external_id,
                "record_id": result.record_id,
            },
        )
        return result

    def get_upload_url(
        self,
        *,
        file_id: str,
        facility: Any = None,
        user: Any = None,
    ) -> IlmLifecycleResult:
        path = UPLOAD_DETAIL_PATH_TPL.format(file_id=file_id)
        response = self.client.get(path, facility=facility, user=user)
        result = IlmLifecycleResult(response=response, payload=response.json)

        # Patch any local SHAUpload row with the latest URL
        try:
            from hmis.apps.billing.models import SHAUpload

            upload = SHAUpload.objects.filter(dha_file_id=file_id).first()
            if upload and isinstance(result.payload, dict):
                url = (
                    result.payload.get("url")
                    or result.payload.get("download_url")
                    or result.payload.get("presigned_url")
                    or ""
                )
                if url:
                    upload.dha_download_url = str(url)
                    upload.response_payload = result.payload
                    upload.save(update_fields=["dha_download_url", "response_payload"])
                    result.record_id = upload.pk
        except (
            AttributeError,
            TypeError,
            RuntimeError,
            OSError,
            AssertionError,
        ):  # pragma: no cover
            logger.exception("Failed to update SHAUpload URL for file_id=%s", file_id)

        from hmis.apps.core.events import BillingEvents

        _publish_safe(
            BillingEvents.DHA_FILE_URL_GENERATED,
            {
                "dha_file_id": file_id,
                "facility_id": getattr(facility, "id", None),
                "http_status": response.status_code,
                "record_id": result.record_id,
            },
        )
        return result

    # =====================================================================
    # Local persistence helpers
    # =====================================================================

    def _record_otp(
        self,
        *,
        kind: str,
        consent_token: str,
        patient_cr_id: str,
        intervention_codes: list[str],
        response: IlmLifecycleResult,
        patient: Any,
        sha_member: Any,
        claim: Any,
        facility: Any,
        user: Any,
    ) -> Any:
        try:
            from hmis.apps.billing.models import SHAOtpRequest

            row = SHAOtpRequest.objects.create(
                patient=patient,
                sha_member=sha_member,
                claim=claim,
                kind=kind,
                status=SHAOtpRequest.Status.SENT,
                consent_token=consent_token,
                patient_cr_id=patient_cr_id,
                intervention_codes=intervention_codes,
                response_payload=response.payload if isinstance(response.payload, dict) else {},
                correlation_id=response.correlation_id,
                sent_by=user,
                sent_at=timezone.now(),
                facility=facility,
            )
            return row
        except (
            AttributeError,
            TypeError,
            RuntimeError,
            OSError,
            AssertionError,
        ):  # pragma: no cover
            logger.exception("Failed to record SHAOtpRequest")
            return None

    def _record_otp_whitelist(
        self,
        *,
        params: OtpWhitelistParams,
        response: IlmLifecycleResult,
        patient: Any,
        facility: Any,
        user: Any,
    ) -> Any:
        try:
            from hmis.apps.billing.models import SHAOtpWhitelistRequest

            guid = ""
            if isinstance(response.payload, dict):
                guid = str(response.payload.get("guid") or response.payload.get("id") or "")
            row = SHAOtpWhitelistRequest.objects.create(
                patient=patient,
                beneficiary_cr_id=params.beneficiary_cr_id,
                reason_type=params.reason_type,
                reason=params.reason,
                biometric_attempts=params.biometric_attempts,
                status=SHAOtpWhitelistRequest.Status.REQUESTED,
                dha_guid=guid,
                response_payload=response.payload if isinstance(response.payload, dict) else {},
                correlation_id=response.correlation_id,
                requested_by=user,
                requested_at=timezone.now(),
                facility=facility,
            )
            return row
        except (
            AttributeError,
            TypeError,
            RuntimeError,
            OSError,
            AssertionError,
        ):  # pragma: no cover
            logger.exception("Failed to record SHAOtpWhitelistRequest")
            return None

    def _record_upload(
        self,
        *,
        upload: MultipartFile,
        result: IlmLifecycleResult,
        facility: Any,
        user: Any,
    ) -> Any:
        try:
            from hmis.apps.billing.models import SHAUpload

            file_path = ""
            url = ""
            if isinstance(result.payload, dict):
                file_path = str(result.payload.get("path") or result.payload.get("file_path") or "")
                url = str(result.payload.get("url") or result.payload.get("download_url") or "")
            size = 0
            content = getattr(upload, "content", None)
            if isinstance(content, (bytes, bytearray)):
                size = len(content)
            else:
                size_attr = getattr(content, "size", None)
                if isinstance(size_attr, int):
                    size = size_attr
            row = SHAUpload.objects.create(
                filename=upload.filename,
                content_type=getattr(upload, "content_type", "") or "",
                size_bytes=size,
                dha_file_id=result.dha_external_id,
                dha_file_path=file_path,
                dha_download_url=url,
                response_payload=result.payload if isinstance(result.payload, dict) else {},
                correlation_id=result.correlation_id,
                uploaded_by=user,
                uploaded_at=timezone.now(),
                facility=facility,
            )
            return row
        except (
            AttributeError,
            TypeError,
            RuntimeError,
            OSError,
            AssertionError,
        ):  # pragma: no cover
            logger.exception("Failed to record SHAUpload")
            return None
