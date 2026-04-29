"""
SHA Consent Service for Vitora HMIS.

Implements the DHA HIE consent workflow:
1. Send OTP to patient via POST /send-web-otp
2. Validate OTP via POST /v4/tiberbu-validate-otp → returns consent_token
3. Start visit via POST /start_visit (when endpoint is available)

Reference: https://hie-docs.dha.go.ke/docs/userJourney
"""

import contextlib
import logging
import time
from typing import Any

import requests
from django.conf import settings

from hmis.apps.billing.models import ConsentToken, SHAMember
from hmis.apps.billing.services.sha_auth import SHAAuthService

logger = logging.getLogger(__name__)


class SHAConsentError(Exception):
    """Raised when SHA consent operations fail."""

    def __init__(self, message: str, code: str = "consent_error", details: dict | None = None):
        self.message = message
        self.code = code
        self.details = details or {}
        super().__init__(message)


class SHAConsentService:
    """
    Service for DHA patient consent verification via OTP or biometric.

    Handles the consent token acquisition flow required by the Kenya Digital
    Superhighway for SHIF and PHC claim workflows.

    Flow:
        1. send_otp() → POST /send-web-otp → otp_reference
        2. validate_otp() → POST /v4/tiberbu-validate-otp → consent_token
        3. Consent token stored on ConsentToken model for use in claim submission

    Attributes:
        auth_service: SHA authentication service for API tokens
        api_base_url: Base URL for DHA API
        timeout: Request timeout in seconds
        max_retries: Maximum retry attempts for transient failures
    """

    def __init__(self):
        """Initialize SHAConsentService with settings from Django config."""
        self.auth_service = SHAAuthService()
        auth_mode = self.auth_service.auth_mode
        if auth_mode == "ilm":
            self.api_base_url = self.auth_service.auth_base_url.rstrip("/")
        else:
            self.api_base_url = settings.SHA_API_BASE_URL.rstrip("/")
        self.timeout = settings.SHA_API_TIMEOUT
        self.max_retries = getattr(settings, "SHA_CONSENT_MAX_RETRIES", 3)

    def send_otp(
        self,
        sha_member: SHAMember,
        facility_code: str,
        user,
        facility=None,
    ) -> ConsentToken:
        """
        Send OTP to patient for consent verification.

        Calls DHA POST /send-web-otp endpoint and creates a pending ConsentToken.

        Args:
            sha_member: The SHA member to send OTP to.
            facility_code: MFL code of the facility (used as agent).
            user: The staff user initiating the consent request.
            facility: The Facility instance for tenant scoping (required).

        Returns:
            ConsentToken instance in PENDING status with otp_reference set.

        Raises:
            SHAConsentError: If OTP sending fails.
        """
        if not facility:
            raise SHAConsentError(
                "Facility is required for consent token creation",
                code="missing_facility",
            )

        identification_number = sha_member.national_id or ""
        if not identification_number:
            raise SHAConsentError(
                "SHA member has no national ID for OTP verification",
                code="missing_national_id",
            )

        payload = {
            "identification_type": "National ID",
            "identification_number": identification_number,
            "otp_type": 3,
            "agent": facility_code,
        }

        endpoint = self._get_endpoint("send_otp")
        response_data = self._make_request("POST", endpoint, json=payload)

        otp_reference = response_data.get("otp_reference", "")
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
            identification_type="National ID",
            identification_number=identification_number,
            created_by=user,
        )
        consent.save()

        logger.info(
            "OTP sent for SHA member %s (ref: %s)",
            sha_member.sha_number,
            otp_reference,
        )
        return consent

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
        encounter=None,
    ) -> dict[str, Any]:
        """
        Start a visit session with DHA using the validated consent token.

        Calls POST /start_visit (when available). Links consent to encounter.

        Args:
            consent: Validated ConsentToken instance.
            encounter: Optional encounter to link consent to.

        Returns:
            Response data from DHA start_visit endpoint.

        Raises:
            SHAConsentError: If consent is invalid or API call fails.
        """
        if not consent.is_valid:
            raise SHAConsentError(
                "Consent token is not valid (expired or not validated)",
                code="invalid_consent",
            )

        if encounter:
            consent.encounter = encounter
            consent.save(update_fields=["encounter"])

        # POST /start_visit — endpoint may not be live yet in DHA
        endpoint = self._get_endpoint("start_visit")
        if not endpoint:
            # Endpoint not yet published by DHA — log and return success
            logger.warning(
                "start_visit endpoint not configured; skipping DHA call. "
                "Consent token %s linked to encounter %s.",
                consent.id,
                encounter.id if encounter else None,
            )
            return {"status": "skipped", "reason": "endpoint_not_configured"}

        payload = {
            "consent_token": consent.consent_token,
            "patient_id": consent.identification_number,
            "facility_code": consent.facility.mfl_code if consent.facility else "",
        }

        response_data = self._make_request("POST", endpoint, json=payload)
        logger.info("Visit started for consent %s", consent.id)
        return response_data

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    def _get_endpoint(self, endpoint_name: str) -> str:
        """Get full URL for a SHA endpoint."""
        endpoints = getattr(settings, "SHA_ENDPOINTS", {})
        path = endpoints.get(endpoint_name, "")
        if not path:
            return ""
        return f"{self.api_base_url}{path}"

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
                    "Authorization": f"Bearer {token.token}",
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
                    self.auth_service.refresh_token()
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
                        f"DHA API error ({response.status_code}): "
                        f"{error_data.get('message', response.text[:200])}",
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
