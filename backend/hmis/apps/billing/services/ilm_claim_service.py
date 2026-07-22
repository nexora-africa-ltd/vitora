# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""DHA HIE Middleware (ILM) claim build & dispatch service.

Implements the 15 ``/api/v1/claims/*`` operations defined in the Postman
collection (``docs/dha/hie-integrations-uat-api.postman_collection.json``)
under "Claims and Preauth / {Start Visit, Interventions, Billing,
Claim Dispatch}".

Each public method:

* Resolves the consent token via :mod:`consent_token_resolver` (start_visit
  is the exception — it takes the raw OTP).
* Sends the request through :class:`IlmClient` so that retries, audit logs
  and PII redaction are handled centrally.
* Persists the returned DHA identifiers back onto the :class:`SHAClaim`
  instance so downstream lifecycle calls (preview/submit/close) can find
  them.

This service intentionally does **not** speak FHIR — that's
:class:`SHAClaimsService` (the legacy ``/v1/shr-med/bundle`` flow). The
two coexist while the migration to ILM completes.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from typing import Any

from django.conf import settings
from django.db import models
from django.utils import timezone

from .consent_token_resolver import ConsentTokenExpiredError, resolve_for_claim
from .dha_errors import DHAValidationError
from .ilm_client import IlmClient, IlmResponse
from .multipart_builder import MultipartFile, build_multipart

logger = logging.getLogger(__name__)

# Values the DHA API accepts for practitioner_regulation_body
_DHA_VALID_REGULATORS = frozenset({"KMPDC", "COC", "PPB", "NCK", "KMLTTB", "KNDI"})


def _normalise_regulator(raw: str, default: str = "KMPDC") -> str:
    """Convert a full licensing-body name into the abbreviation DHA expects."""
    if not raw:
        return default
    stripped = raw.strip()
    if stripped in _DHA_VALID_REGULATORS:
        return stripped
    mapping: dict[str, str] = getattr(settings, "_DHA_REGULATOR_FULL_TO_ABBREV", {})
    return mapping.get(stripped, default)


def _publish_safe(event_type: str, payload: dict) -> None:
    """Publish a billing event without ever breaking the calling request."""
    try:
        from hmis.apps.core.events import publish_event

        aggregate_id = payload.get("claim_id") or payload.get("patient_id") or ""
        publish_event(event_type, "SHAClaim", aggregate_id, payload)
    except Exception:  # pragma: no cover
        logger.exception("Failed to publish DHA HIE event %s", event_type)


def _claim_event_payload(claim: Any, result: IlmClaimResult, **extra: Any) -> dict:
    return {
        "claim_id": getattr(claim, "pk", None),
        "claim_number": getattr(claim, "claim_number", ""),
        "facility_id": getattr(claim, "facility_id", None),
        "patient_id": getattr(claim, "patient_id", None),
        "status": getattr(claim, "status", ""),
        "dha_external_id": getattr(claim, "dha_external_id", ""),
        "dha_correlation_id": getattr(claim, "dha_correlation_id", ""),
        "http_status": result.status_code,
        **extra,
    }


# ---------------------------------------------------------------------------
# Endpoint paths (mirrors Postman collection)
# ---------------------------------------------------------------------------

VISIT_PATH = "/api/v1/claims/visit"
INTERVENTIONS_PATH = "/api/v1/claims/interventions"
INTERVENTION_SWITCH_PATH = "/api/v1/claims/interventions/switch"
INTERVENTION_RESTORE_PATH = "/api/v1/claims/interventions/restore"
INTERVENTION_RETIRE_PATH = "/api/v1/claims/interventions/retire"
# PHC (Primary Healthcare Fund) — Scenario C in DHA HIE user-journey spec.
# Level 2/3 facilities use the same `/claims/lines` endpoint as the standard
# billing flow to add a "virtual claim line" for capitation / basic
# fee-for-service interventions (no preauth). The DHA HIE UAT Postman
# collection ("Claims and Preauth / Billing / Add Virtual Claim Line")
# routes this through `/api/v1/claims/lines`.
VIRTUAL_CLAIM_LINE_PATH = "/api/v1/claims/lines"
DIAGNOSES_PATH = "/api/v1/claims/diagnoses"
LINES_PATH = "/api/v1/claims/lines"
LINES_EDIT_PATH = "/api/v1/claims/lines/edit"
ATTACHMENTS_PATH = "/api/v1/claims/attachments"
PREVIEW_PATH = "/api/v1/claims/preview"
PREVIEW_PAYER_PATH = "/adapter/facade/edi/v1/claims/claims"
SUBMIT_PATH = "/api/v1/claims/submit"
CLOSE_PATH = "/api/v1/claims/close"


# ---------------------------------------------------------------------------
# Request payload dataclasses (typed shapes, easier to test)
# ---------------------------------------------------------------------------


@dataclass
class StartVisitParams:
    otp: str = ""
    auth_guid: str = ""  # Biometric authorization GUID (alternative to OTP)
    patient_id: str = ""
    intervention_codes: list[str] = field(default_factory=list)
    service_type: str = "OUTPATIENT"  # OUTPATIENT | INPATIENT
    admission_date: str | None = None  # ISO date, required for INPATIENT
    estimated_days_of_admission: int | None = None
    # Practitioner (doctor) details — required per DHA 2026-06 spec.
    # Can be provided here or on add_line/add_diagnosis as a fallback.
    practitioner_identification_number: str = ""
    practitioner_identification_type: str = ""  # e.g. "National ID"
    practitioner_regulation_body: str = "KMPDC"


@dataclass
class ClaimLine:
    intervention_code: str
    service_name: str
    service_identifier: str
    unit_price: str
    quantity: str
    scheme_code: str


@dataclass
class CloseClaimParams:
    cancel_reason_type: str  # WRONG_PATIENT | NO_SERVICE_GIVEN | WRONG_BENEFIT |
    #                         EXPIRED_VISIT | EXHAUSTED_BENEFIT | TIME_BARRED |
    #                         OTHER_REASONS
    cancel_reason_text: str = ""


@dataclass
class IlmClaimResult:
    """Lightweight wrapper returned from each service method."""

    response: IlmResponse
    payload: Any = field(default=None)

    @property
    def status_code(self) -> int:
        return self.response.status_code

    @property
    def authorization_code(self) -> str | None:
        if isinstance(self.payload, dict):
            return self.payload.get("authorization_code") or self.payload.get("consent_token")
        return None

    @property
    def claim_line_id(self) -> str | None:
        if isinstance(self.payload, dict):
            return (
                self.payload.get("claim_line_id")
                or self.payload.get("id")
                or (self.payload.get("data") or {}).get("claim_line_id")
                if isinstance(self.payload.get("data"), dict)
                else self.payload.get("id")
            )
        return None


class IlmClaimService:
    """Per-action wrapper around the DHA ILM ``/api/v1/claims/*`` endpoints."""

    def __init__(self, client: IlmClient | None = None, *, facility: Any = None) -> None:
        self.client = client or IlmClient(facility=facility)

    # -----------------------------------------------------------------
    # Start Visit (the only call that does NOT take a consent_token —
    # it RETURNS the authorization_code that becomes the consent_token).
    # -----------------------------------------------------------------

    def start_visit(
        self,
        claim: Any,
        params: StartVisitParams,
        *,
        user: Any = None,
    ) -> IlmClaimResult:
        # DHA accepts either otp (OTP consent) or auth_guid (biometric consent)
        if not params.otp and not params.auth_guid:
            raise ValueError("Either otp or auth_guid must be provided")
        if params.otp and params.auth_guid:
            raise ValueError("Provide either otp or auth_guid, not both")

        # ---------------------------------------------------------------
        # Capitated codes (SHA-12-xxx / SHA-08-001/002/003) are handled by
        # the middleware under service_type "CAPITATION". Non-capitated
        # visits use the caller's service type. Mixed lists fall back to
        # filtering capitated codes out to avoid "not supported for service
        # type OUTPATIENT" errors.
        # ---------------------------------------------------------------
        CAPITATED_PREFIXES = ("SHA-12-", "SHA-08-001", "SHA-08-002", "SHA-08-003")
        all_capitated = bool(params.intervention_codes) and all(
            any(c.startswith(p) for p in CAPITATED_PREFIXES) for c in params.intervention_codes
        )
        if all_capitated:
            codes = list(params.intervention_codes)
            service_type = "CAPITATION"
        else:
            codes = [
                c
                for c in params.intervention_codes
                if not any(c.startswith(p) for p in CAPITATED_PREFIXES)
            ]
            if not codes and params.intervention_codes:
                codes = ["SHA-06-001"]
            service_type = params.service_type

        body: dict[str, Any] = {
            "patient_id": params.patient_id,
            "intervention_codes": codes,
            "service_type": service_type,
        }
        if params.otp:
            body["otp"] = params.otp
        else:
            body["auth_guid"] = params.auth_guid
        if service_type.upper() == "INPATIENT":
            if not params.admission_date:
                raise ValueError("admission_date is required for INPATIENT visits")
            body["admission_date"] = params.admission_date
            if params.estimated_days_of_admission is not None:
                body["estimated_days_of_admission"] = params.estimated_days_of_admission

        # Practitioner details (DHA 2026-06 requirement: every claim needs a doctor)
        if params.practitioner_identification_number:
            body["practitioner_identification_number"] = params.practitioner_identification_number
            body["practitioner_identification_type"] = (
                params.practitioner_identification_type or "National ID"
            )
            body["practitioner_regulation_body"] = _normalise_regulator(
                params.practitioner_regulation_body
            )

        # Sandbox biometric — skip DHA call, create a mock session locally.
        # In sandbox the biometric auth_guid is randomly generated (not from DHA),
        # so DHA's start_visit would reject it as unrecognised. OTP visits always
        # call DHA (the OTP was issued by DHA and is valid).
        is_sandbox_biometric = (
            params.auth_guid and getattr(settings, "ENVIRONMENT", "development") != "production"
        )
        if is_sandbox_biometric:
            # In non-production environments biometric auth_guid is randomly
            # generated (no fingerprint scanner). We cannot call DHA with it
            # because DHA has no matching biometric session. Instead, fall
            # through to the real DHA call using OTP, or if no OTP is
            # available, make a real call with the auth_guid anyway — DHA
            # UAT may accept it.
            import os
            import uuid

            is_uat = os.environ.get("DHA_HIE_IS_UAT", "").lower() in ("1", "true", "yes")
            # In UAT with DHA connectivity, always attempt the real DHA call.
            # The sandbox UUID shortcut was preventing real visit creation.
            if is_uat and params.otp:
                # OTP flow — call DHA with real OTP (validated earlier).
                logger.info(
                    "Sandbox biometric with OTP for claim %s — calling real DHA start_visit",
                    getattr(claim, "pk", None),
                )
                # Fall through to the real DHA call below.
            elif is_uat:
                # Biometric-only in UAT — DHA may reject the fake auth_guid,
                # but try anyway since OTP isn't available.
                logger.warning(
                    "Sandbox biometric without OTP for claim %s — "
                    "attempting real DHA call with fake auth_guid (may fail)",
                    getattr(claim, "pk", None),
                )
                # Fall through to the real DHA call below.
            else:
                # Local dev (no DHA connectivity) — mock the entire call.
                fake_auth_code = str(uuid.uuid4())
                fake_response = IlmResponse(
                    status_code=200,
                    headers={},
                    json={"authorization_code": fake_auth_code, "status": "success"},
                    text=('{"authorization_code":"' + fake_auth_code + '","status":"success"}'),
                    elapsed_ms=0,
                )
                result = IlmClaimResult(response=fake_response, payload=fake_response.json)
                self._apply_visit_response(claim, result, params=params, user=user)
                for code in codes:
                    self._persist_intervention(claim, code, result)
                from hmis.apps.core.events import BillingEvents

                _publish_safe(
                    BillingEvents.DHA_CLAIM_VISIT_STARTED,
                    _claim_event_payload(
                        claim,
                        result,
                        service_type=params.service_type,
                        intervention_codes=list(params.intervention_codes),
                        authorization_code=fake_auth_code,
                    ),
                )
                logger.info(
                    "Sandbox start_visit for claim %s — auth_code=%s",
                    getattr(claim, "pk", None),
                    fake_auth_code,
                )
                return result

        # Use the Keycloak OAuth2 Bearer token for start_visit; the ILM
        # middleware accepts it (unlike the self-signed HS256 JWT which
        # it cannot verify).
        response = self.client.post(
            VISIT_PATH,
            json_body=body,
            facility=getattr(claim, "facility", None),
            user=user,
        )
        result = IlmClaimResult(response=response, payload=response.json)
        self._apply_visit_response(claim, result, params=params, user=user)
        # Persist the intervention codes locally so the claim reflects the
        # active interventions immediately after visit start.
        for code in codes:
            self._persist_intervention(claim, code, result)
        from hmis.apps.core.events import BillingEvents

        _publish_safe(
            BillingEvents.DHA_CLAIM_VISIT_STARTED,
            _claim_event_payload(
                claim,
                result,
                service_type=params.service_type,
                intervention_codes=list(params.intervention_codes),
                authorization_code=result.authorization_code,
            ),
        )
        return result

    # -----------------------------------------------------------------
    # Interventions
    # -----------------------------------------------------------------

    def add_intervention(
        self, claim: Any, intervention_code: str, *, user: Any = None
    ) -> IlmClaimResult:
        # Capitated codes (SHA-12-xxx, SHA-08-001/002/003) are not supported
        # by DHA's standard interventions endpoint. Redirect to the virtual
        # claim line endpoint which handles them correctly.
        CAPITATED_PREFIXES = ("SHA-12-", "SHA-08-001", "SHA-08-002", "SHA-08-003")
        if any(intervention_code.startswith(p) for p in CAPITATED_PREFIXES):
            logger.info(
                "Redirecting capitated code %s to virtual claim line endpoint for claim %s.",
                intervention_code,
                getattr(claim, "pk", None),
            )
            return self.add_virtual_claim_line(
                claim, intervention_code=intervention_code, user=user
            )

        result = self._post_with_consent(
            claim,
            INTERVENTIONS_PATH,
            {"intervention_code": intervention_code},
            user=user,
        )
        self._persist_intervention(claim, intervention_code, result)
        self._emit_intervention_event(
            claim, result, action="added", intervention_code=intervention_code
        )
        return result

    def switch_intervention(
        self,
        claim: Any,
        *,
        existing_intervention_code: str,
        new_intervention_code: str,
        retain_bill_items: bool = False,
        bill_from: str | None = None,
        bill_to: str | None = None,
        user: Any = None,
    ) -> IlmClaimResult:
        body: dict[str, Any] = {
            "existing_intervention_code": existing_intervention_code,
            "new_intervention_code": new_intervention_code,
            "retain_bill_items": retain_bill_items,
        }
        if retain_bill_items:
            if not (bill_from and bill_to):
                raise ValueError("bill_from and bill_to are required when retain_bill_items=True")
            body["bill_from"] = bill_from
            body["bill_to"] = bill_to
        result = self._post_with_consent(claim, INTERVENTION_SWITCH_PATH, body, user=user)
        self._emit_intervention_event(
            claim,
            result,
            action="switched",
            existing_intervention_code=existing_intervention_code,
            new_intervention_code=new_intervention_code,
        )
        return result

    def restore_intervention(
        self, claim: Any, intervention_code: str, *, user: Any = None
    ) -> IlmClaimResult:
        result = self._post_with_consent(
            claim,
            INTERVENTION_RESTORE_PATH,
            {"intervention_code": intervention_code},
            user=user,
        )
        self._update_intervention_status(claim, intervention_code, "active")
        self._emit_intervention_event(
            claim, result, action="restored", intervention_code=intervention_code
        )
        return result

    def retire_intervention(
        self, claim: Any, intervention_code: str, *, user: Any = None
    ) -> IlmClaimResult:
        result = self._post_with_consent(
            claim,
            INTERVENTION_RETIRE_PATH,
            {"intervention_code": intervention_code},
            user=user,
        )
        self._update_intervention_status(claim, intervention_code, "retired")
        self._emit_intervention_event(
            claim, result, action="retired", intervention_code=intervention_code
        )
        return result

    # -----------------------------------------------------------------
    # PHC virtual claim line (DHA user-journey Scenario C)
    # -----------------------------------------------------------------

    def add_virtual_claim_line(
        self,
        claim: Any,
        *,
        intervention_code: str,
        service_name: str | None = None,
        service_identifier: str | None = None,
        unit_price: str | None = None,
        quantity: str | None = None,
        scheme_code: str | None = None,
        extra: dict[str, Any] | None = None,
        user: Any = None,
    ) -> IlmClaimResult:
        """Add a PHC (Primary Healthcare Fund) virtual claim line.

        Used by Level 2/3 facilities for capitation and basic
        fee-for-service interventions. Skips preauthorization — direct
        submission after consent is sufficient. See DHA HIE user-journey
        Scenario C.
        """
        if unit_price is None:
            try:
                from hmis.apps.billing.models import SHATariff

                tariff = SHATariff.objects.filter(code=intervention_code, is_active=True).first()
                if tariff is not None:
                    unit_price = str(tariff.sha_amount)
                else:
                    unit_price = "0.01"
            except Exception:
                unit_price = "0.01"
        if quantity is None:
            quantity = "1"
        body: dict[str, Any] = {
            "intervention_code": intervention_code,
            "unit_price": unit_price,
            "quantity": quantity,
        }
        if service_name is not None:
            body["service_name"] = service_name
        if service_identifier is not None:
            body["service_identifier"] = service_identifier
        if scheme_code is not None:
            body["scheme_code"] = scheme_code
        if extra:
            body.update(extra)
        result = self._post_with_consent(claim, VIRTUAL_CLAIM_LINE_PATH, body, user=user)
        self._emit_intervention_event(
            claim,
            result,
            action="virtual_line_added",
            intervention_code=intervention_code,
            phc=True,
        )
        return result

    # -----------------------------------------------------------------
    # Diagnoses
    # -----------------------------------------------------------------

    def add_diagnosis(
        self,
        claim: Any,
        *,
        icd_code: str,
        intervention_code: str,
        practitioner_identification_number: str = "",
        practitioner_identification_type: str = "",
        practitioner_regulation_body: str = "KMPDC",
        user: Any = None,
    ) -> IlmClaimResult:
        body: dict[str, Any] = {"icd_code": icd_code, "intervention_code": intervention_code}
        if practitioner_identification_number:
            body["practitioner_identification_number"] = practitioner_identification_number
            body["practitioner_identification_type"] = (
                practitioner_identification_type or "National ID"
            )
            body["practitioner_regulation_body"] = _normalise_regulator(
                practitioner_regulation_body
            )
        result = self._post_with_consent(
            claim,
            DIAGNOSES_PATH,
            body,
            user=user,
        )
        self._emit_diagnosis_event(
            claim,
            result,
            action="added",
            icd_code=icd_code,
            intervention_code=intervention_code,
        )
        return result

    def remove_diagnosis(
        self,
        claim: Any,
        *,
        icd_code: str,
        intervention_code: str,
        user: Any = None,
    ) -> IlmClaimResult:
        consent = resolve_for_claim(claim)
        response = self.client.patch(
            DIAGNOSES_PATH,
            json_body={
                "consent_token": consent.token,
                "icd_code": icd_code,
                "intervention_code": intervention_code,
            },
            consent_token=consent.token,
            facility=getattr(claim, "facility", None),
            user=user,
        )
        result = IlmClaimResult(response=response, payload=response.json)
        self._emit_diagnosis_event(claim, result, action="removed", icd_code=icd_code)
        return result

    # -----------------------------------------------------------------
    # Lines
    # -----------------------------------------------------------------

    def add_line(
        self,
        claim: Any,
        line: ClaimLine,
        *,
        practitioner_identification_number: str = "",
        practitioner_identification_type: str = "",
        practitioner_regulation_body: str = "KMPDC",
        user: Any = None,
    ) -> IlmClaimResult:
        body: dict[str, Any] = {
            "intervention_code": line.intervention_code,
            "service_name": line.service_name,
            "service_identifier": line.service_identifier,
            "unit_price": line.unit_price,
            "quantity": line.quantity,
            "scheme_code": line.scheme_code,
        }
        if practitioner_identification_number:
            body["practitioner_identification_number"] = practitioner_identification_number
            body["practitioner_identification_type"] = (
                practitioner_identification_type or "National ID"
            )
            body["practitioner_regulation_body"] = _normalise_regulator(
                practitioner_regulation_body
            )
        result = self._post_with_consent(claim, LINES_PATH, body, user=user)
        self._emit_line_event(
            claim, result, action="added", intervention_code=line.intervention_code
        )
        return result

    def edit_line(
        self,
        claim: Any,
        *,
        claim_line_id: str,
        quantity: int | None = None,
        unit_price: str | None = None,
        scheme_code: str | None = None,
        user: Any = None,
    ) -> IlmClaimResult:
        consent = resolve_for_claim(claim)
        body: dict[str, Any] = {"consent_token": consent.token, "claim_line_id": claim_line_id}
        if quantity is not None:
            body["quantity"] = quantity
        if unit_price is not None:
            body["unit_price"] = unit_price
        if scheme_code is not None:
            body["scheme_code"] = scheme_code
        response = self.client.patch(
            LINES_EDIT_PATH,
            json_body=body,
            consent_token=consent.token,
            facility=getattr(claim, "facility", None),
            user=user,
        )
        result = IlmClaimResult(response=response, payload=response.json)
        self._emit_line_event(claim, result, action="edited", claim_line_id=claim_line_id)
        return result

    def remove_line(self, claim: Any, *, claim_line_id: str, user: Any = None) -> IlmClaimResult:
        consent = resolve_for_claim(claim)
        response = self.client.patch(
            LINES_PATH,
            json_body={"consent_token": consent.token, "claim_line_id": claim_line_id},
            consent_token=consent.token,
            facility=getattr(claim, "facility", None),
            user=user,
        )
        result = IlmClaimResult(response=response, payload=response.json)
        self._emit_line_event(claim, result, action="removed", claim_line_id=claim_line_id)
        return result

    # -----------------------------------------------------------------
    # Attachments
    # -----------------------------------------------------------------

    def add_attachment(
        self,
        claim: Any,
        files: list[MultipartFile],
        *,
        extra_fields: dict[str, Any] | None = None,
        user: Any = None,
    ) -> IlmClaimResult:
        consent = resolve_for_claim(claim)
        multipart = build_multipart(files)
        data = {"consent_token": consent.token}
        if extra_fields:
            data.update({k: str(v) for k, v in extra_fields.items()})
        response = self.client.post(
            ATTACHMENTS_PATH,
            data=data,
            files=multipart,
            consent_token=consent.token,
            facility=getattr(claim, "facility", None),
            user=user,
        )
        result = IlmClaimResult(response=response, payload=response.json)
        self._emit_attachment_event(claim, result, action="added", file_count=len(files))
        return result

    def remove_attachment(
        self,
        claim: Any,
        *,
        attachment_id: str,
        intervention_code: str,
        user: Any = None,
    ) -> IlmClaimResult:
        consent = resolve_for_claim(claim)
        body = {
            "consent_token": consent.token,
            "attachment_id": attachment_id,
            "intervention_code": intervention_code,
        }
        response = self.client.patch(
            ATTACHMENTS_PATH,
            json_body=body,
            consent_token=consent.token,
            facility=getattr(claim, "facility", None),
            user=user,
        )
        result = IlmClaimResult(response=response, payload=response.json)
        self._emit_attachment_event(claim, result, action="removed", attachment_id=attachment_id)
        return result

    # -----------------------------------------------------------------
    # Preview / Submit / Close
    # -----------------------------------------------------------------

    def preview(self, claim: Any, *, user: Any = None) -> IlmClaimResult:
        result = self._post_with_consent(claim, PREVIEW_PATH, {}, user=user)
        from hmis.apps.core.events import BillingEvents

        _publish_safe(
            BillingEvents.DHA_CLAIM_PREVIEWED,
            _claim_event_payload(claim, result),
        )
        return result

    def preview_payer_claim(self, claim: Any, *, user: Any = None) -> IlmClaimResult:
        """Fetch the payer's adjudication view of this claim from DHA.

        Calls POST /adapter/facade/edi/v1/claims/claims with consent_token.
        Returns the full payer claim object including workflowState,
        processing_notes, and invoice_flags.
        """
        result = self._post_with_consent(claim, PREVIEW_PAYER_PATH, {}, user=user)
        # Persist payer adjudication metadata back to the claim if available
        payload = result.payload or {}
        payer_state = payload.get("workflowState") or payload.get("payer_claim_status")
        if payer_state and hasattr(claim, "last_dha_status"):
            claim.last_dha_status = payer_state
            claim.last_dha_payload_at = timezone.now()
            claim.save(update_fields=["last_dha_status", "last_dha_payload_at"])
        return result

    def submit(
        self,
        claim: Any,
        *,
        invoice_number: str,
        otp: str = "",
        discharge_auth_guid: str = "",
        discharge_reason: str = "",
        notes: str = "",
        practitioner_identification_number: str = "",
        practitioner_identification_type: str = "",
        practitioner_regulation_body: str = "KMPDC",
        user: Any = None,
    ) -> IlmClaimResult:
        body: dict[str, Any] = {"invoice_number": invoice_number}
        # Outpatient discharge consent (DHA 2026-06: OTP or biometrics required)
        if otp:
            body["otp"] = otp
        elif discharge_auth_guid:
            body["discharge_auth_guid"] = discharge_auth_guid
        if discharge_reason:
            body["discharge_reason"] = discharge_reason
        if notes:
            body["notes"] = notes
        # Practitioner details (fallback if not provided at start_visit)
        if practitioner_identification_number:
            body["practitioner_identification_number"] = practitioner_identification_number
            body["practitioner_identification_type"] = (
                practitioner_identification_type or "National ID"
            )
            body["practitioner_regulation_body"] = _normalise_regulator(
                practitioner_regulation_body
            )
        result = self._post_with_consent(claim, SUBMIT_PATH, body, user=user)
        self._apply_submit_response(claim, result, user=user)
        from hmis.apps.core.events import BillingEvents

        _publish_safe(
            BillingEvents.DHA_CLAIM_SUBMITTED,
            _claim_event_payload(
                claim,
                result,
                invoice_number=invoice_number,
                sha_claim_reference=getattr(claim, "sha_claim_reference", ""),
            ),
        )
        return result

    def close(
        self,
        claim: Any,
        params: CloseClaimParams,
        *,
        user: Any = None,
    ) -> IlmClaimResult:
        body = {
            "cancel_reason_type": params.cancel_reason_type,
            "cancel_reason_text": params.cancel_reason_text,
        }
        result = self._post_with_consent(claim, CLOSE_PATH, body, user=user)
        self._apply_close_response(claim, result, user=user)
        from hmis.apps.core.events import BillingEvents

        _publish_safe(
            BillingEvents.DHA_CLAIM_CLOSED,
            _claim_event_payload(
                claim,
                result,
                cancel_reason_type=params.cancel_reason_type,
                cancel_reason_text=params.cancel_reason_text,
            ),
        )
        return result

    # -----------------------------------------------------------------
    # Internal helpers
    # -----------------------------------------------------------------

    def _post_with_consent(
        self,
        claim: Any,
        path: str,
        body: dict[str, Any],
        *,
        user: Any = None,
    ) -> IlmClaimResult:
        consent = resolve_for_claim(claim)
        merged = {"consent_token": consent.token, **body}
        try:
            response = self.client.post(
                path,
                json_body=merged,
                consent_token=consent.token,
                facility=getattr(claim, "facility", None),
                user=user,
            )
        except DHAValidationError as exc:
            msg = (exc.message or "").lower()
            if (
                "no valid active" in msg
                and ("visit" in msg or "claim" in msg)
                and ("submitted" in msg or "closed" in msg or "doesn't exist" in msg)
            ):
                # DHA no longer recognizes this consent token as having an
                # active visit. Clear our local visit-started flag so the
                # frontend re-shows the consent + start-visit flow.
                if getattr(claim, "dha_visit_started_at", None) is not None:
                    claim.dha_visit_started_at = None
                    claim.save(update_fields=["dha_visit_started_at"])
                    logger.info(
                        "Cleared dha_visit_started_at for claim %s — DHA visit no longer active",
                        getattr(claim, "pk", None),
                    )
                raise ConsentTokenExpiredError(
                    "The consent token for this visit is no longer valid on DHA's side. "
                    "Please restart the visit to obtain a fresh authorization token."
                ) from exc
            raise
        return IlmClaimResult(response=response, payload=response.json)

    # -----------------------------------------------------------------
    # Persistence side-effects
    # -----------------------------------------------------------------

    def _apply_visit_response(
        self,
        claim: Any,
        result: IlmClaimResult,
        *,
        params: StartVisitParams,
        user: Any,
    ) -> None:
        if not isinstance(result.payload, dict):
            return
        update_fields: list[str] = []
        auth_code = result.authorization_code
        if auth_code:
            self._link_or_create_consent_token(claim, params, auth_code, user=user)
        external_id = result.payload.get("claim_id") or result.payload.get("dha_claim_id")
        if external_id and hasattr(claim, "dha_external_id"):
            claim.dha_external_id = str(external_id)[:64]
            update_fields.append("dha_external_id")
        if hasattr(claim, "dha_visit_started_at"):
            claim.dha_visit_started_at = timezone.now()
            update_fields.append("dha_visit_started_at")
        self._stamp_dha_status(claim, "VISIT_STARTED", result, update_fields)
        if update_fields:
            claim.save(update_fields=update_fields)

    def _apply_submit_response(self, claim: Any, result: IlmClaimResult, *, user: Any) -> None:
        update_fields: list[str] = []
        if result.status_code < 400 and hasattr(claim, "status"):
            claim.status = "submitted"
            claim.submitted_at = timezone.now()
            if user and hasattr(claim, "submitted_by_id"):
                claim.submitted_by = user
                update_fields.append("submitted_by")
            update_fields += ["status", "submitted_at"]
        payload = result.payload if isinstance(result.payload, dict) else {}
        sha_ref = payload.get("sha_claim_reference") or payload.get("claim_id")
        if sha_ref and hasattr(claim, "sha_claim_reference"):
            claim.sha_claim_reference = str(sha_ref)[:50]
            update_fields.append("sha_claim_reference")
        self._stamp_dha_status(claim, "SUBMITTED", result, update_fields)
        if update_fields:
            claim.save(update_fields=list(set(update_fields)))

    def _apply_close_response(self, claim: Any, result: IlmClaimResult, *, user: Any) -> None:
        if result.status_code >= 400:
            return
        update_fields: list[str] = []
        if hasattr(claim, "status"):
            claim.status = "written_off"
            update_fields.append("status")
        self._stamp_dha_status(claim, "CLOSED", result, update_fields)
        if update_fields:
            claim.save(update_fields=list(set(update_fields)))

    # -----------------------------------------------------------------
    # Intervention persistence helpers
    # -----------------------------------------------------------------

    def _persist_intervention(
        self, claim: Any, intervention_code: str, result: IlmClaimResult
    ) -> None:
        """Persist intervention data from HIE response to SHAClaimIntervention."""
        if result.status_code >= 400:
            return
        try:
            from hmis.apps.billing.models import SHAClaimIntervention

            payload = result.payload if isinstance(result.payload, dict) else {}
            # Extract document_types from response (DHA returns this per intervention)
            document_types = payload.get("document_types") or []
            intervention_name = payload.get("intervention_name") or payload.get("name") or ""
            dha_id = payload.get("id") or payload.get("intervention_id") or ""
            tariff_amount = payload.get("tariff_amount") or payload.get("overall_tariff")
            benefit_code = intervention_code.rsplit("-", 1)[0] if "-" in intervention_code else ""

            # DHA routing flags (from /api/v1/patients/benefits/interventions)
            payment_mechanism = (
                payload.get("paymentMechanism") or payload.get("payment_mechanism") or ""
            )
            access_point = payload.get("accessPoint") or payload.get("access_point") or ""
            needs_preauth = bool(payload.get("needsPreauth", False))
            needs_manual = bool(payload.get("needsManualPreauthApproval", False))

            SHAClaimIntervention.objects.update_or_create(
                claim=claim,
                intervention_code=intervention_code,
                defaults={
                    "intervention_name": str(intervention_name)[:255],
                    "benefit_code": str(benefit_code)[:10],
                    "status": "active",
                    "required_document_types": list(document_types),
                    "dha_intervention_id": str(dha_id)[:64],
                    "tariff_amount": tariff_amount,
                    # Routing flags
                    "payment_mechanism": str(payment_mechanism)[:20],
                    "access_point": str(access_point)[:4],
                    "needs_preauth": needs_preauth,
                    "needs_manual_preauth_approval": needs_manual,
                    "is_surgical_preauth": bool(payload.get("isSurgicalPreauth", False)),
                    "is_renal_preauth": bool(payload.get("isRenalPreauth", False)),
                    "is_oncology_preauth": bool(payload.get("isOncologyPreauth", False)),
                    "is_imaging_preauth": bool(payload.get("isImagingPreauth", False)),
                    "is_optical_preauth": bool(payload.get("isOpticalPreauth", False)),
                    # Level tariffs
                    "level2_tariff": payload.get("level2Tariff"),
                    "level3_tariff": payload.get("level3Tariff"),
                    "level4_tariff": payload.get("level4Tariff"),
                    "level5_tariff": payload.get("level5Tariff"),
                    "level6_tariff": payload.get("level6Tariff"),
                },
            )
        except Exception:
            logger.exception(
                "Failed to persist intervention %s for claim %s",
                intervention_code,
                getattr(claim, "pk", None),
            )

    def _update_intervention_status(
        self, claim: Any, intervention_code: str, new_status: str
    ) -> None:
        """Update status of a persisted intervention."""
        try:
            from hmis.apps.billing.models import SHAClaimIntervention

            SHAClaimIntervention.objects.filter(
                claim=claim,
                intervention_code=intervention_code,
            ).update(status=new_status)
        except Exception:
            logger.exception(
                "Failed to update intervention status %s → %s for claim %s",
                intervention_code,
                new_status,
                getattr(claim, "pk", None),
            )

    # -----------------------------------------------------------------
    # Event helpers
    # -----------------------------------------------------------------

    def _emit_intervention_event(self, claim: Any, result: IlmClaimResult, **extra: Any) -> None:
        from hmis.apps.core.events import BillingEvents

        _publish_safe(
            BillingEvents.DHA_CLAIM_INTERVENTION_CHANGED,
            _claim_event_payload(claim, result, **extra),
        )

    def _emit_diagnosis_event(self, claim: Any, result: IlmClaimResult, **extra: Any) -> None:
        from hmis.apps.core.events import BillingEvents

        _publish_safe(
            BillingEvents.DHA_CLAIM_DIAGNOSIS_CHANGED,
            _claim_event_payload(claim, result, **extra),
        )

    def _emit_line_event(self, claim: Any, result: IlmClaimResult, **extra: Any) -> None:
        from hmis.apps.core.events import BillingEvents

        _publish_safe(
            BillingEvents.DHA_CLAIM_LINE_CHANGED,
            _claim_event_payload(claim, result, **extra),
        )

    def _emit_attachment_event(self, claim: Any, result: IlmClaimResult, **extra: Any) -> None:
        from hmis.apps.core.events import BillingEvents

        _publish_safe(
            BillingEvents.DHA_CLAIM_ATTACHMENT_CHANGED,
            _claim_event_payload(claim, result, **extra),
        )

    def _stamp_dha_status(
        self,
        claim: Any,
        status: str,
        result: IlmClaimResult,
        update_fields: list[str],
    ) -> None:
        if hasattr(claim, "last_dha_status"):
            claim.last_dha_status = status
            update_fields.append("last_dha_status")
        if hasattr(claim, "last_dha_payload_at"):
            claim.last_dha_payload_at = timezone.now()
            update_fields.append("last_dha_payload_at")
        if hasattr(claim, "dha_correlation_id"):
            cid = result.response.headers.get("X-Correlation-Id", "")
            if cid:
                claim.dha_correlation_id = cid[:64]
                update_fields.append("dha_correlation_id")

    def _link_or_create_consent_token(
        self,
        claim: Any,
        params: StartVisitParams,
        token: str,
        *,
        user: Any,
    ) -> None:
        """Link the encounter to the consent token used to start the visit.

        For biometric flow the original biometric consent token (matched by
        auth_guid) must remain the active token; start_visit's authorization_code
        is not a consent token and must not replace it.

        For OTP flow the pending OTP token for this patient/member is validated
        and linked to the encounter.
        """
        try:
            from hmis.apps.billing.models import ConsentToken
        except ImportError:  # pragma: no cover
            return
        encounter = getattr(claim, "encounter", None)
        if encounter is None:
            return

        consent = None
        if params.auth_guid:
            # Biometric: match the token that was authorized with this auth_guid.
            consent = (
                ConsentToken.objects.filter(
                    auth_guid=params.auth_guid,
                    consent_method=ConsentToken.ConsentMethod.BIOMETRIC,
                )
                .order_by("-created_at")
                .first()
            )
            logger.info(
                "_link_or_create_consent_token biometric auth_guid=%s matched=%s",
                params.auth_guid,
                consent.pk if consent else None,
            )
            # Fallback: any validated biometric token for this patient/member.
            if consent is None:
                consent = (
                    ConsentToken.objects.filter(
                        patient=claim.patient,
                        sha_member=claim.sha_member,
                        consent_method=ConsentToken.ConsentMethod.BIOMETRIC,
                        status=ConsentToken.ConsentStatus.VALIDATED,
                    )
                    .order_by("-validated_at")
                    .first()
                )
                logger.info(
                    "_link_or_create_consent_token biometric fallback patient=%s matched=%s",
                    getattr(claim.patient, "pk", None),
                    consent.pk if consent else None,
                )
        elif params.otp:
            # OTP: match a pending OTP token for this patient/member.
            consent = (
                ConsentToken.objects.filter(
                    patient=claim.patient,
                    sha_member=claim.sha_member,
                    consent_method=ConsentToken.ConsentMethod.OTP,
                )
                .filter(
                    models.Q(status=ConsentToken.ConsentStatus.PENDING)
                    | models.Q(status=ConsentToken.ConsentStatus.VALIDATED)
                )
                .order_by("-created_at")
                .first()
            )
            logger.info(
                "_link_or_create_consent_token otp matched=%s",
                consent.pk if consent else None,
            )

        if consent:
            update_fields: list[str] = []
            if consent.status != ConsentToken.ConsentStatus.VALIDATED:
                consent.status = ConsentToken.ConsentStatus.VALIDATED
                update_fields.append("status")
            # OTP: the authorization_code returned by start_visit becomes
            # the consent_token for all subsequent calls (add_intervention,
            # submit, etc.). Always store the latest token from DHA.
            if token and consent.consent_token != token:
                consent.consent_token = token
                update_fields.append("consent_token")
            if not consent.validated_at:
                consent.validated_at = timezone.now()
                update_fields.append("validated_at")
            if update_fields:
                consent.save(update_fields=update_fields)
            if consent.encounter_id != encounter.pk:
                consent.encounter = encounter
                consent.save(update_fields=["encounter"])
            # Ensure no stale tokens (e.g. old authorization_code tokens from a
            # previous start_visit bug) are linked to this encounter.
            deleted, _ = (
                ConsentToken.objects.filter(encounter=encounter).exclude(pk=consent.pk).delete()
            )
            if deleted:
                logger.info(
                    "_link_or_create_consent_token deleted %s stale token(s) for encounter=%s",
                    deleted,
                    encounter.pk,
                )
            return

        # Fallback: create a new validated token (emergency/no prior consent flow).
        ConsentToken.objects.create(
            patient=claim.patient,
            sha_member=claim.sha_member,
            encounter=encounter,
            facility=getattr(claim, "facility", None),
            consent_method=ConsentToken.ConsentMethod.OTP,
            status=ConsentToken.ConsentStatus.VALIDATED,
            identification_number=getattr(claim.patient, "national_id", "") or "",
            consent_token=token,
            validated_at=timezone.now(),
            created_by=user or claim.created_by,
        )
