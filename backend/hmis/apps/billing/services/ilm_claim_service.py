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

from django.utils import timezone

from .consent_token_resolver import resolve_for_claim
from .ilm_client import IlmClient, IlmResponse
from .multipart_builder import MultipartFile, build_multipart

logger = logging.getLogger(__name__)


def _publish_safe(event_type: str, payload: dict) -> None:
    """Publish a billing event without ever breaking the calling request."""
    try:
        from hmis.apps.core.events import publish_event

        publish_event(event_type, payload)
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
# Level 2/3 facilities use a "virtual claim line" path for capitation /
# basic fee-for-service interventions (no preauth).
VIRTUAL_CLAIM_LINE_PATH = "/api/v1/claims/add_virtual_claim_line"
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
    otp: str
    patient_id: str
    intervention_codes: list[str]
    service_type: str = "OUTPATIENT"  # OUTPATIENT | INPATIENT
    admission_date: str | None = None  # ISO date, required for INPATIENT
    estimated_days_of_admission: int | None = None


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

    def __init__(self, client: IlmClient | None = None) -> None:
        self.client = client or IlmClient()

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
        body: dict[str, Any] = {
            "otp": params.otp,
            "patient_id": params.patient_id,
            "intervention_codes": list(params.intervention_codes),
            "service_type": params.service_type,
        }
        if params.service_type.upper() == "INPATIENT":
            if not params.admission_date:
                raise ValueError("admission_date is required for INPATIENT visits")
            body["admission_date"] = params.admission_date
            if params.estimated_days_of_admission is not None:
                body["estimated_days_of_admission"] = params.estimated_days_of_admission

        response = self.client.post(
            VISIT_PATH,
            json_body=body,
            facility=getattr(claim, "facility", None),
            user=user,
        )
        result = IlmClaimResult(response=response, payload=response.json)
        self._apply_visit_response(claim, result, user=user)
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
        body: dict[str, Any] = {"intervention_code": intervention_code}
        if service_name is not None:
            body["service_name"] = service_name
        if service_identifier is not None:
            body["service_identifier"] = service_identifier
        if unit_price is not None:
            body["unit_price"] = unit_price
        if quantity is not None:
            body["quantity"] = quantity
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
        user: Any = None,
    ) -> IlmClaimResult:
        result = self._post_with_consent(
            claim,
            DIAGNOSES_PATH,
            {"icd_code": icd_code, "intervention_code": intervention_code},
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

    def remove_diagnosis(self, claim: Any, *, icd_code: str, user: Any = None) -> IlmClaimResult:
        consent = resolve_for_claim(claim)
        response = self.client.patch(
            DIAGNOSES_PATH,
            json_body={"consent_token": consent.token, "icd_code": icd_code},
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

    def add_line(self, claim: Any, line: ClaimLine, *, user: Any = None) -> IlmClaimResult:
        body = {
            "intervention_code": line.intervention_code,
            "service_name": line.service_name,
            "service_identifier": line.service_identifier,
            "unit_price": line.unit_price,
            "quantity": line.quantity,
            "scheme_code": line.scheme_code,
        }
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
        self, claim: Any, *, attachment_id: str, user: Any = None
    ) -> IlmClaimResult:
        consent = resolve_for_claim(claim)
        response = self.client.patch(
            ATTACHMENTS_PATH,
            json_body={"consent_token": consent.token, "attachment_id": attachment_id},
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
        user: Any = None,
    ) -> IlmClaimResult:
        result = self._post_with_consent(
            claim, SUBMIT_PATH, {"invoice_number": invoice_number}, user=user
        )
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
        response = self.client.post(
            path,
            json_body=merged,
            consent_token=consent.token,
            facility=getattr(claim, "facility", None),
            user=user,
        )
        return IlmClaimResult(response=response, payload=response.json)

    # -----------------------------------------------------------------
    # Persistence side-effects
    # -----------------------------------------------------------------

    def _apply_visit_response(self, claim: Any, result: IlmClaimResult, *, user: Any) -> None:
        if not isinstance(result.payload, dict):
            return
        update_fields: list[str] = []
        auth_code = result.authorization_code
        if auth_code:
            self._upsert_consent_token(claim, auth_code, user=user)
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
        if not isinstance(result.payload, dict):
            return
        update_fields: list[str] = []
        if result.status_code < 400 and hasattr(claim, "status"):
            claim.status = "submitted"
            claim.submitted_at = timezone.now()
            if user and hasattr(claim, "submitted_by_id"):
                claim.submitted_by = user
                update_fields.append("submitted_by")
            update_fields += ["status", "submitted_at"]
        sha_ref = result.payload.get("sha_claim_reference") or result.payload.get("claim_id")
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

    def _upsert_consent_token(self, claim: Any, token: str, *, user: Any) -> None:
        """Persist the authorization_code returned from start_visit as a ConsentToken."""
        try:
            from hmis.apps.billing.models import ConsentToken
        except ImportError:  # pragma: no cover
            return
        encounter = getattr(claim, "encounter", None)
        if encounter is None:
            return
        existing = ConsentToken.objects.filter(
            encounter=encounter,
            consent_token=token,
        ).first()
        if existing:
            return
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
