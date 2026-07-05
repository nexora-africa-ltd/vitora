# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""
SHA Consent Service for Vitora HMIS.

Implements the DHA HIE consent workflow:
1. Send OTP to patient via POST /api/v1/claims/otp (ILM middleware)
2. Start visit via POST /api/v1/claims/visit (ILM middleware)

In ILM mode all DHA calls go through the ILM middleware; the legacy Tiberbu
consent endpoints are no longer used.

Reference: https://hie-docs.dha.go.ke/docs/userJourney
"""

import contextlib
import logging
import time
from datetime import timedelta
from typing import Any

import requests
from django.conf import settings
from django.utils import timezone

from hmis.apps.billing.models import ConsentToken, SHAMember
from hmis.apps.billing.services.dha_errors import DHAError
from hmis.apps.billing.services.ilm_client import IlmClient
from hmis.apps.billing.services.sha_auth import SHAAuthService

logger = logging.getLogger(__name__)


class SHAConsentError(Exception):
    """Raised when SHA consent operations fail."""

    def __init__(self, message: str, code: str = "consent_error", details: dict | None = None):
        self.message = message
        self.code = code
        self.details = details or {}
        super().__init__(message)


def _user_facing_dha_message(exc: DHAError) -> str:
    """Return a clean, user-facing message from a DHA/ILM error.

    Falls back to the exception message if no cleaner text can be extracted.
    """
    # Prefer the already-extracted message from IlmClient, which handles
    # nested "Edi Error" objects and arrays.
    message = exc.message
    if message and not message.startswith(("POST ", "GET ", "PUT ", "DELETE ", "PATCH ")):
        return message
    # If IlmClient's message still contains HTTP noise, try the raw body.
    body = exc.response_body
    if isinstance(body, dict):
        from hmis.apps.billing.services.ilm_client import _extract_message

        extracted = _extract_message(body, "")
        if extracted:
            return extracted
    return message or "DHA request failed"


def _dha_error_code(exc: DHAError) -> str:
    """Map a DHA error to a stable error code for the UI."""
    from hmis.apps.billing.services.dha_errors import (
        DHAConflictError,
        DHANotFoundError,
        DHARateLimitedError,
        DHATimeoutError,
        DHAUnauthorizedError,
    )

    if isinstance(exc, DHAUnauthorizedError):
        return "dha_unauthorized"
    if isinstance(exc, DHANotFoundError):
        return "dha_not_found"
    if isinstance(exc, DHAConflictError):
        return "dha_conflict"
    if isinstance(exc, DHATimeoutError):
        return "dha_timeout"
    if isinstance(exc, DHARateLimitedError):
        return "dha_rate_limited"
    if exc.status_code == 400:
        return "dha_validation"
    if exc.status_code == 422:
        return "dha_validation"
    return "dha_error"


class SHAConsentService:
    """
    Service for DHA patient consent verification via OTP or biometric.

    Handles the consent token acquisition flow required by the Kenya Digital
    Superhighway for SHIF and PHC claim workflows.

    Flow (ILM mode):
        1. send_otp() → POST /api/v1/claims/otp → otp_reference
        2. start_visit() → POST /api/v1/claims/visit → consent_token + visit
        3. Consent token stored on ConsentToken model for use in claim submission

    Attributes:
        auth_service: SHA authentication service for API tokens
        api_base_url: Base URL for DHA API
        timeout: Request timeout in seconds
        max_retries: Maximum retry attempts for transient failures
    """

    # Tiberbu-hosted endpoints that must use SHA_TIBERBU_BASE_URL
    _TIBERBU_ENDPOINTS = {"send_otp", "validate_otp"}

    def __init__(self, facility=None):
        """Initialize SHAConsentService with settings from Django config.

        Args:
            facility: Optional Facility instance. If provided and the facility has
                      SHA credentials configured, those take priority over global settings.
        """
        self.auth_service = SHAAuthService(facility=facility)
        auth_mode = self.auth_service.auth_mode
        if auth_mode == "ilm":
            self.api_base_url = self.auth_service.auth_base_url.rstrip("/")
            self.ilm_client = IlmClient(facility=facility)
        else:
            self.api_base_url = settings.SHA_API_BASE_URL.rstrip("/")
            self.ilm_client = None
        # Tiberbu consent endpoints are only used in legacy mode.
        self.tiberbu_base_url = getattr(settings, "SHA_TIBERBU_BASE_URL", self.api_base_url).rstrip(
            "/"
        )
        self.timeout = settings.SHA_API_TIMEOUT
        self.max_retries = getattr(settings, "SHA_CONSENT_MAX_RETRIES", 3)

    def send_otp(
        self,
        sha_member: SHAMember,
        facility_code: str,
        user,
        facility=None,
        intervention_codes: list[str] | None = None,
    ) -> ConsentToken:
        """
        Send OTP to patient for consent verification.

        In ILM mode this calls the ILM middleware POST /api/v1/claims/otp.
        In legacy mode it calls the Tiberbu /send-web-otp endpoint.

        Idempotent: if a PENDING consent token was already created in the last
        5 minutes (e.g. by the auto-consent automation), returns it without
        sending a duplicate OTP to the patient.

        Args:
            sha_member: The SHA member to send OTP to.
            facility_code: MFL code of the facility (used as agent).
            user: The staff user initiating the consent request.
            facility: The Facility instance for tenant scoping (required).
            intervention_codes: SHA intervention codes for the OTP (ILM mode only).

        Returns:
            ConsentToken instance in PENDING status with otp_reference set.

        Raises:
            SHAConsentError: If OTP sending fails.
        """

        from django.utils import timezone

        if not facility:
            raise SHAConsentError(
                "Facility is required for consent token creation",
                code="missing_facility",
            )

        if self.auth_service.auth_mode == "ilm":
            # ILM mode expects the DHA Client Registry ID (e.g. CR0127974703399-5).
            identification_number = self._sha_number_to_cr_id(sha_member.sha_number)
            identification_type = "CR Number"
            if not identification_number:
                identification_number = sha_member.national_id or ""
                identification_type = "National ID"
        else:
            # Legacy mode uses the national ID directly.
            identification_number = sha_member.national_id or ""
            identification_type = "National ID"
        if not identification_number:
            raise SHAConsentError(
                "SHA member has no national ID or SHA number for OTP verification",
                code="missing_national_id",
            )

        # Idempotency: reuse any PENDING consent token from today for this member.
        today_start = timezone.now().replace(hour=0, minute=0, second=0, microsecond=0)
        existing_pending = (
            ConsentToken.objects.filter(
                sha_member=sha_member,
                facility=facility,
                status=ConsentToken.ConsentStatus.PENDING,
                created_at__gte=today_start,
            )
            .order_by("-created_at")
            .first()
        )

        if existing_pending:
            logger.info(
                "Reusing existing PENDING consent token %s for member %s (sent %s ago)",
                existing_pending.pk,
                sha_member.pk,
                timezone.now() - existing_pending.created_at,
            )
            return existing_pending

        if self.auth_service.auth_mode == "ilm":
            try:
                response_data = self._send_otp_ilm(
                    sha_member=sha_member,
                    patient_cr_id=identification_number,
                    facility=facility,
                    intervention_codes=intervention_codes,
                    user=user,
                )
            except DHAError as exc:
                raise SHAConsentError(
                    _user_facing_dha_message(exc),
                    code=_dha_error_code(exc),
                    details={
                        "dha_status_code": exc.status_code,
                        "dha_path": exc.path,
                        "dha_response": exc.response_body,
                    },
                ) from exc
        else:
            payload = {
                "identification_type": "National ID",
                "identification_number": sha_member.national_id or "",
                "otp_type": 3,
                "agent": facility_code,
            }
            endpoint = self._get_endpoint("send_otp")
            response_data = self._make_request("POST", endpoint, json=payload)

        otp_reference = response_data.get("otp_reference") or response_data.get("otpReference", "")
        if not otp_reference:
            raise SHAConsentError(
                "DHA did not return an OTP reference",
                code="no_otp_reference",
                details=response_data,
            )

        # Create pending consent token
        consent = ConsentToken(
            patient=sha_member.patient,
            sha_member=sha_member,
            facility=facility,
            organization=facility.organization,
            consent_method=ConsentToken.ConsentMethod.OTP,
            status=ConsentToken.ConsentStatus.PENDING,
            otp_reference=otp_reference,
            identification_type=identification_type,
            identification_number=identification_number,
            intervention_codes=intervention_codes or [],
            created_by=user,
        )
        consent.save()

        logger.info(
            "OTP sent for SHA member %s (ref: %s)",
            sha_member.sha_number,
            otp_reference,
        )
        return consent

    @staticmethod
    def _sha_number_to_cr_id(sha_number: str) -> str:
        """Convert internal SHA-XXXX-N format to DHA Client Registry CR format.

        SHA-0127974703399-5 → CR0127974703399-5
        """
        if sha_number.startswith("SHA-"):
            return f"CR{sha_number[4:]}"
        if sha_number.startswith("CR"):
            return sha_number
        return sha_number

    def _send_otp_ilm(
        self,
        *,
        sha_member: SHAMember,
        patient_cr_id: str,
        facility: Any,
        intervention_codes: list[str] | None,
        user: Any,
    ) -> dict[str, Any]:
        """Send an OTP via the ILM middleware POST /api/v1/claims/otp."""
        from hmis.apps.billing.services.ilm_lifecycle_service import (
            IlmLifecycleService,
            VisitOtpParams,
        )

        codes = list(intervention_codes) if intervention_codes else ["SHA-01-001"]
        params = VisitOtpParams(
            intervention_codes=codes,
            patient_id=patient_cr_id,
        )
        service = IlmLifecycleService(client=self.ilm_client)
        result = service.send_visit_otp(
            params=params,
            patient=sha_member.patient,
            sha_member=sha_member,
            facility=facility,
            user=user,
        )
        payload = result.payload if isinstance(result.payload, dict) else {}
        return payload

    def validate_otp(
        self,
        consent: ConsentToken,
        otp_code: str,
        encrypted_pin: str = "",
    ) -> ConsentToken:
        """
        Validate OTP and obtain consent token from DHA.

        Calls DHA POST /v4/tiberbu-validate-otp with the OTP code and
        updates the ConsentToken with the returned consent_token.

        Args:
            consent: The ConsentToken instance (in PENDING status).
            otp_code: The OTP code entered by the patient.
            encrypted_pin: Optional encrypted PIN for additional verification.

        Returns:
            Updated ConsentToken with status=VALIDATED and consent_token set.

        Raises:
            SHAConsentError: If OTP validation fails.
        """
        if consent.status != ConsentToken.ConsentStatus.PENDING:
            raise SHAConsentError(
                f"Cannot validate consent in {consent.status} status",
                code="invalid_status",
            )

        payload: dict[str, Any] = {
            "agent": consent.facility.mfl_code if consent.facility else "",
            "otp_record": consent.otp_reference,
            "otp": otp_code,
        }
        if encrypted_pin:
            payload["encrypted_pin"] = encrypted_pin

        endpoint = self._get_endpoint("validate_otp")
        if self.auth_service.auth_mode == "ilm":
            # In ILM mode OTP validation is performed by the middleware
            # start_visit endpoint; there is no standalone validate-otp step.
            raise SHAConsentError(
                "OTP validation is not a standalone step in ILM mode; "
                "use start_visit to validate the OTP and start the visit.",
                code="ilm_validate_otp_not_supported",
            )

        response_data = self._make_request("POST", endpoint, json=payload)

        status_value = response_data.get("status", "").lower()
        if status_value != "success":
            consent.mark_failed()
            raise SHAConsentError(
                response_data.get("message", "OTP validation failed"),
                code="otp_validation_failed",
                details=response_data,
            )

        # Extract consent token from response
        # DHA returns the token in different fields depending on the action
        token = (
            response_data.get("consent_token")
            or response_data.get("token")
            or response_data.get("action", "")
        )

        # Default expiry: 1 hour (DHA standard)
        expires_in = int(response_data.get("expires_in", 3600))
        consent.mark_validated(token=token, expires_in_seconds=expires_in)

        logger.info(
            "Consent validated for patient %s (method: OTP)",
            consent.patient_id,
        )
        return consent

    def start_visit(
        self,
        consent: ConsentToken,
        otp_code: str = "",
        auth_guid: str = "",
        intervention_codes: list[str] | None = None,
        service_type: str = "outpatient",
        admission_date: str = "",
        estimated_days_of_admission: int = 0,
        encounter=None,
    ) -> dict[str, Any]:
        """
        Start a visit session with DHA.

        Calls POST /api/v1/claims/visit — the DHA combined endpoint that
        validates the OTP (or biometric auth_guid) and starts the visit
        in a single call.

        DHA accepts either `otp` (OTP consent) or `auth_guid` (biometric
        consent) — exactly one must be provided.

        Args:
            consent: ConsentToken instance (PENDING or VALIDATED).
            otp_code: The OTP code entered by the patient (OTP flow).
            auth_guid: Biometric authorization GUID (biometric flow).
            intervention_codes: List of SHA intervention codes for this visit.
            service_type: Type of service (outpatient, inpatient, emergency).
            admission_date: Admission date (ISO format). Defaults to today.
            estimated_days_of_admission: Expected length of stay (days).
            encounter: Optional encounter to link consent to.

        Returns:
            Response data from DHA start_visit endpoint.

        Raises:
            SHAConsentError: If API call fails or consent state is invalid.
        """
        if not otp_code and not auth_guid:
            raise SHAConsentError(
                "Either otp_code or auth_guid must be provided",
                code="missing_consent_credential",
            )
        if otp_code and auth_guid:
            raise SHAConsentError(
                "Provide either otp_code or auth_guid, not both",
                code="ambiguous_consent_credential",
            )
        if consent.status not in (
            ConsentToken.ConsentStatus.PENDING,
            ConsentToken.ConsentStatus.VALIDATED,
        ):
            raise SHAConsentError(
                f"Cannot start visit with consent in {consent.status} status",
                code="invalid_consent_status",
            )

        if encounter:
            consent.encounter = encounter
            consent.save(update_fields=["encounter"])

        endpoint = self._get_endpoint("start_visit")
        if not endpoint:
            logger.warning(
                "start_visit endpoint not configured; skipping DHA call. "
                "Consent token %s linked to encounter %s.",
                consent.id,
                encounter.id if encounter else None,
            )
            return {"status": "skipped", "reason": "endpoint_not_configured"}

        from datetime import date as date_cls

        # Use the identification_number stored on the consent token directly.
        # This is the DHA Client Registry ID (e.g. CR0127974703399-5).
        patient_cr_id = consent.identification_number

        codes = intervention_codes or []
        CAPITATED_PREFIXES = ("SHA-12-", "SHA-08-001", "SHA-08-002", "SHA-08-003")

        if self.auth_service.auth_mode == "ilm":
            try:
                return self._start_visit_ilm(
                    consent=consent,
                    otp_code=otp_code,
                    auth_guid=auth_guid,
                    codes=codes,
                    service_type=service_type,
                    admission_date=admission_date,
                    estimated_days_of_admission=estimated_days_of_admission,
                    endpoint=endpoint,
                )
            except DHAError as exc:
                raise SHAConsentError(
                    _user_facing_dha_message(exc),
                    code=_dha_error_code(exc),
                    details={
                        "dha_status_code": exc.status_code,
                        "dha_path": exc.path,
                        "dha_response": exc.response_body,
                    },
                ) from exc

        # Legacy mode ---------------------------------------------------------
        all_capitated = bool(codes) and all(
            any(c.startswith(p) for p in CAPITATED_PREFIXES) for c in codes
        )
        if all_capitated:
            if otp_code and consent.status == ConsentToken.ConsentStatus.PENDING:
                self.validate_otp(consent=consent, otp_code=otp_code)
            elif consent.status == ConsentToken.ConsentStatus.PENDING:
                consent.mark_validated(
                    token=consent.consent_token or auth_guid or "capitated-visit",
                    expires_in_seconds=3600,
                )
            return {
                "status": "validated",
                "reason": "capitated_interventions",
                "consent_token": consent.consent_token,
                "message": "Capitated interventions validated. No DHA visit needed.",
            }

        resolved_service_type = (service_type or "outpatient").upper()
        inpatient_prefixes = ("SHA-07", "SHA-19", "SHA-03", "SHA-13", "SHA-20")
        if resolved_service_type == "OUTPATIENT" and codes:
            for code in codes:
                prefix = "-".join(code.split("-")[:2])
                if prefix in inpatient_prefixes:
                    resolved_service_type = "INPATIENT"
                    break

        payload: dict[str, Any] = {
            "admission_date": admission_date or date_cls.today().isoformat(),
            "intervention_codes": codes,
            "patient_id": patient_cr_id,
            "service_type": resolved_service_type,
        }
        if resolved_service_type != "OUTPATIENT":
            payload["estimated_days_of_admission"] = estimated_days_of_admission or 1
        if otp_code:
            payload["otp"] = otp_code
        else:
            payload["auth_guid"] = auth_guid

        response_data = self._make_request("POST", endpoint, json=payload)
        self._persist_consent_token(consent, response_data)
        logger.info("Visit started for consent %s (patient: %s)", consent.id, consent.patient_id)
        return response_data

    def _start_visit_ilm(
        self,
        *,
        consent: ConsentToken,
        otp_code: str,
        auth_guid: str,
        codes: list[str],
        service_type: str,
        admission_date: str,
        estimated_days_of_admission: int,
        endpoint: str,
    ) -> dict[str, Any]:
        """Start a visit via the ILM middleware POST /api/v1/claims/visit.

        This is the canonical DHA endpoint documented for starting a visit:
        it accepts either an ``otp`` or ``auth_guid`` and creates the virtual
        claim in a single call. The caller's intervention codes are passed
        through unchanged; if they are all capitated codes the service type is
        set to ``CAPITATION`` because the middleware rejects capitated codes
        under ``OUTPATIENT``.
        """
        from datetime import date as date_cls

        # In ILM mode we pass the caller's intervention codes through unchanged.
        # Capitated codes (SHA-12-xxx / SHA-08-001/002/003) must be sent with
        # service_type "CAPITATION"; sending them as "OUTPATIENT" causes
        # "intervention X is not supported for service type OUTPATIENT".
        CAPITATED_PREFIXES = ("SHA-12-", "SHA-08-001", "SHA-08-002", "SHA-08-003")
        all_capitated = bool(codes) and all(
            any(c.startswith(p) for p in CAPITATED_PREFIXES) for c in codes
        )
        if all_capitated:
            resolved_service_type = "CAPITATION"
        else:
            resolved_service_type = (service_type or "outpatient").upper()
            inpatient_prefixes = ("SHA-07", "SHA-19", "SHA-03", "SHA-13", "SHA-20")
            if resolved_service_type == "OUTPATIENT" and codes:
                for code in codes:
                    prefix = "-".join(code.split("-")[:2])
                    if prefix in inpatient_prefixes:
                        resolved_service_type = "INPATIENT"
                        break

        body: dict[str, Any] = {
            "patient_id": consent.identification_number,
            "intervention_codes": codes,
            "service_type": resolved_service_type,
        }
        body["admission_date"] = admission_date or date_cls.today().isoformat()
        if resolved_service_type != "OUTPATIENT":
            body["estimated_days_of_admission"] = estimated_days_of_admission or 1
        if otp_code:
            body["otp"] = otp_code
        else:
            body["auth_guid"] = auth_guid

        response = self.ilm_client.post(
            endpoint,
            json_body=body,
            facility=consent.facility,
            user=None,
        )
        response_data = response.json if isinstance(response.json, dict) else {}
        self._persist_consent_token(consent, response_data)
        logger.info(
            "ILM visit started for consent %s (patient: %s)",
            consent.id,
            consent.patient_id,
        )
        return response_data

    def _persist_consent_token(self, consent: ConsentToken, response_data: dict[str, Any]) -> None:
        """Persist a consent token returned by DHA, if any."""
        returned_token = response_data.get("consent_token") or response_data.get("token", "")
        if returned_token and not consent.consent_token:
            expires_in = int(response_data.get("expires_in", 3600))
            consent.mark_validated(token=returned_token, expires_in_seconds=expires_in)
        elif consent.status == ConsentToken.ConsentStatus.PENDING:
            consent.mark_validated(
                token=consent.consent_token or "visit-started",
                expires_in_seconds=3600,
            )

    def authorize_biometric(
        self,
        sha_member: SHAMember,
        workstation_id: str,
        agent_national_id: str,
        user,
        facility=None,
    ) -> dict[str, Any]:
        """
        Initiate biometric authorization via DHA HIE.

        Calls POST /api/v1/claims/authorize with workstationID and agent
        national_id. Returns auth_guid and iframe_url for fingerprint capture.

        Args:
            sha_member: The SHA member to authorize.
            workstation_id: Hardware Server workstation identifier.
            agent_national_id: National ID of the biometrics agent (staff).
            user: The staff user initiating the request.
            facility: The Facility instance for tenant scoping.

        Returns:
            Dict with auth_guid, iframe_url, and status from DHA.

        Raises:
            SHAConsentError: If the authorize call fails.
        """
        if not facility:
            raise SHAConsentError(
                "Facility is required for biometric authorization",
                code="facility_required",
            )

        endpoint = self._get_endpoint("authorize_biometric")
        if not endpoint:
            raise SHAConsentError(
                "Biometric authorize endpoint not configured",
                code="endpoint_not_configured",
            )

        patient_id = sha_member.national_id or sha_member.sha_number
        payload = {
            "patient_id": patient_id,
            "workstationID": workstation_id,
            "national_id": agent_national_id,
        }

        response_data = self._make_request("POST", endpoint, json=payload)

        auth_guid = response_data.get("auth_guid") or response_data.get("guid", "")
        iframe_url = response_data.get("iframe_url") or response_data.get("url", "")

        if not auth_guid:
            raise SHAConsentError(
                "DHA did not return auth_guid for biometric authorization",
                code="missing_auth_guid",
                details=response_data,
            )

        # Create a ConsentToken in PENDING with BIOMETRIC method
        consent = ConsentToken.objects.create(
            patient=sha_member.patient,
            sha_member=sha_member,
            consent_method=ConsentToken.ConsentMethod.BIOMETRIC,
            status=ConsentToken.ConsentStatus.PENDING,
            otp_reference=auth_guid,  # Legacy field kept for backwards compat
            auth_guid=auth_guid,
            iframe_url=iframe_url,
            iframe_expires_at=timezone.now() + timedelta(minutes=10),
            identification_number=agent_national_id,
            created_by=user,
            facility=facility,
            organization=facility.organization if hasattr(facility, "organization") else None,
        )

        logger.info(
            "Biometric authorization initiated for consent %s (auth_guid: %s)",
            consent.id,
            auth_guid,
        )

        return {
            "consent_id": consent.id,
            "auth_guid": auth_guid,
            "iframe_url": iframe_url,
            "iframe_expires_at": consent.iframe_expires_at.isoformat(),
            "status": "PENDING",
        }

    def get_authorization_status(self, auth_guid: str) -> dict[str, Any]:
        """
        Poll DHA for biometric authorization status.

        Calls GET /api/v1/claims/authorize/{auth_guid} to check if the
        fingerprint verification has completed.

        Args:
            auth_guid: The authorization GUID returned by authorize_biometric.

        Returns:
            Dict with status (PENDING, AUTHORIZED, FAILED, EXPIRED).

        Raises:
            SHAConsentError: If the status check fails.
        """
        endpoint = self._get_endpoint("authorize_biometric")
        if not endpoint:
            raise SHAConsentError(
                "Biometric authorize endpoint not configured",
                code="endpoint_not_configured",
            )

        url = f"{endpoint}/{auth_guid}"
        response_data = self._make_request("GET", url)

        status_value = response_data.get("status", "PENDING")

        # If AUTHORIZED, update the corresponding ConsentToken
        if status_value == "AUTHORIZED":
            consent = ConsentToken.objects.filter(
                otp_reference=auth_guid,
                consent_method=ConsentToken.ConsentMethod.BIOMETRIC,
            ).first()
            if consent and consent.status == ConsentToken.ConsentStatus.PENDING:
                token = response_data.get("consent_token") or auth_guid
                consent.mark_validated(token=token, expires_in_seconds=3600)
                logger.info(
                    "Biometric consent %s authorized (auth_guid: %s)", consent.id, auth_guid
                )

        return {
            "auth_guid": auth_guid,
            "status": status_value,
            "consent_token": response_data.get("consent_token", ""),
        }

    def cancel_authorization(self, auth_guid: str) -> dict[str, Any]:
        """
        Cancel a pending biometric authorization.

        Used when the iframe expires (10-min window) or when the user
        wants to abort and start fresh. Calls DELETE on the DHA authorize
        endpoint and marks the local ConsentToken as FAILED.

        Args:
            auth_guid: The authorization GUID to cancel.

        Returns:
            Dict with auth_guid and final status.

        Raises:
            SHAConsentError: If the cancel call fails.
        """
        endpoint = self._get_endpoint("authorize_biometric")
        if not endpoint:
            raise SHAConsentError(
                "Biometric authorize endpoint not configured",
                code="endpoint_not_configured",
            )

        url = f"{endpoint}/{auth_guid}/cancel"
        with contextlib.suppress(SHAConsentError):
            self._make_request("POST", url)

        # Mark the local ConsentToken as FAILED
        consent = ConsentToken.objects.filter(
            auth_guid=auth_guid,
            consent_method=ConsentToken.ConsentMethod.BIOMETRIC,
        ).first()
        if not consent:
            # Fallback: look by otp_reference (legacy records)
            consent = ConsentToken.objects.filter(
                otp_reference=auth_guid,
                consent_method=ConsentToken.ConsentMethod.BIOMETRIC,
            ).first()

        if consent and consent.status == ConsentToken.ConsentStatus.PENDING:
            consent.mark_failed()
            logger.info("Biometric consent %s cancelled (auth_guid: %s)", consent.id, auth_guid)

        return {
            "auth_guid": auth_guid,
            "status": "CANCELLED",
        }

    def get_beneficiary_contacts(self, beneficiary_cr_id: str) -> list[dict[str, Any]]:
        """
        Retrieve masked beneficiary contacts from DHA HIE.

        Calls GET /api/v1/patients/contacts to get the list of registered
        contacts (with masked phone numbers like "+254714***898") and their
        IDs. The user can then select which contact to send the OTP to.

        Args:
            beneficiary_cr_id: The patient's Client Registry ID.

        Returns:
            List of contact dicts with id, masked value, contact type.

        Raises:
            SHAConsentError: If the contacts API call fails.
        """
        endpoint = self._get_endpoint("patient_contacts")
        if not endpoint:
            raise SHAConsentError(
                "Patient contacts endpoint not configured",
                code="endpoint_not_configured",
            )

        url = f"{endpoint}?patient_id={beneficiary_cr_id}"
        response_data = self._make_request("GET", url)

        # DHA returns {contacts: [...]} or a flat list
        contacts = (
            response_data
            if isinstance(response_data, list)
            else response_data.get("contacts", response_data.get("results", []))
        )

        return contacts

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    def _get_endpoint(self, endpoint_name: str) -> str:
        """Get full URL for a SHA endpoint."""
        endpoints = getattr(settings, "SHA_ENDPOINTS", {})
        path = endpoints.get(endpoint_name, "")
        if not path:
            return ""
        base = (
            self.tiberbu_base_url if endpoint_name in self._TIBERBU_ENDPOINTS else self.api_base_url
        )
        return f"{base}{path}"

    def _make_request(
        self,
        method: str,
        url: str,
        max_retries: int | None = None,
        **kwargs,
    ) -> dict[str, Any]:
        """
        Make an authenticated HTTP request to DHA API with retry logic.

        Args:
            method: HTTP method (GET, POST, etc.)
            url: Full URL to call.
            max_retries: Override for max retry attempts.
            **kwargs: Additional arguments passed to requests.

        Returns:
            Parsed JSON response.

        Raises:
            SHAConsentError: On request failure after retries.
        """
        if not url:
            raise SHAConsentError("Endpoint URL is empty", code="no_endpoint")

        retries = max_retries if max_retries is not None else self.max_retries

        for attempt in range(retries):
            try:
                token = self.auth_service.get_token()
                headers = {
                    "Authorization": f"Bearer {token}",
                    "Content-Type": "application/json",
                    "Accept": "application/json",
                }

                response = requests.request(
                    method,
                    url,
                    headers=headers,
                    timeout=self.timeout,
                    **kwargs,
                )

                if response.status_code == 401 and attempt < retries - 1:
                    # Token expired — refresh and retry
                    self.auth_service.get_token(force_refresh=True)
                    continue

                if response.status_code >= 500 and attempt < retries - 1:
                    # Server error — retry with backoff
                    time.sleep(2**attempt)
                    continue

                if response.status_code >= 400:
                    error_data = {}
                    with contextlib.suppress(ValueError, requests.exceptions.JSONDecodeError):
                        error_data = response.json()
                    raise SHAConsentError(
                        self._extract_dha_error_message(
                            response.status_code, error_data, response.text
                        ),
                        code=f"http_{response.status_code}",
                        details=error_data,
                    )

                return response.json()

            except requests.exceptions.Timeout:
                if attempt < retries - 1:
                    time.sleep(2**attempt)
                    continue
                raise SHAConsentError(
                    "DHA API request timed out",
                    code="timeout",
                )
            except requests.exceptions.ConnectionError:
                if attempt < retries - 1:
                    time.sleep(2**attempt)
                    continue
                raise SHAConsentError(
                    "Cannot connect to DHA API",
                    code="connection_error",
                )
            except SHAConsentError:
                raise
            except Exception as e:
                raise SHAConsentError(
                    f"Unexpected error calling DHA API: {e}",
                    code="unexpected_error",
                ) from e

        raise SHAConsentError("Max retries exceeded", code="max_retries")

    @staticmethod
    def _extract_dha_error_message(status_code: int, error_data: dict, raw_text: str) -> str:
        """Extract a human-readable message from DHA's nested error responses.

        DHA returns errors in several shapes:
        - {"message": "..."}
        - {"error": "..."}
        - {"error": ["..."]}
        - {"Edi Error": {"error": ["..."]}}
        - {"detail": "..."}
        - Raw text fallback
        """
        # 1. Top-level message or error string
        if error_data.get("message"):
            return str(error_data["message"])
        if isinstance(error_data.get("error"), str):
            return str(error_data["error"])

        # 2. Top-level error list
        if isinstance(error_data.get("error"), list):
            return "; ".join(str(e) for e in error_data["error"])

        # 3. Nested error objects (e.g. {"Edi Error": {"error": ["..."]}})
        for _key, val in error_data.items():
            if isinstance(val, dict):
                nested_errors = val.get("error") or val.get("errors") or val.get("message")
                if isinstance(nested_errors, list):
                    return "; ".join(str(e) for e in nested_errors)
                if isinstance(nested_errors, str):
                    return nested_errors

        # 4. detail field (DRF-style)
        if error_data.get("detail"):
            return str(error_data["detail"])

        # 5. Fallback to raw text
        return raw_text[:300] if raw_text else f"DHA API error ({status_code})"
