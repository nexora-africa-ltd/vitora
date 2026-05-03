"""
SHA Pre-authorization Service for Vitora HMIS.

Implements the DHA HIE pre-authorization workflow:
1. Submit preauth request via POST /v1/preauth/request
2. Poll status via GET /v1/preauth/{ref}/status until FINALISED
3. Guard claim submission on valid preauth

Reference: https://hie-docs.dha.go.ke/docs/userJourney
"""

import contextlib
import logging
import time
from datetime import date
from decimal import Decimal
from typing import Any

import requests
from django.conf import settings
from django.utils import timezone

from hmis.apps.billing.models import ConsentToken, PreauthRequest, SHAClaim
from hmis.apps.billing.services.sha_auth import SHAAuthService

logger = logging.getLogger(__name__)


class SHAPreauthError(Exception):
    """Raised when SHA pre-authorization operations fail."""

    def __init__(self, message: str, code: str = "preauth_error", details: dict | None = None):
        self.message = message
        self.code = code
        self.details = details or {}
        super().__init__(message)


class SHAPreauthService:
    """
    Service for DHA pre-authorization request lifecycle.

    Handles submission and polling of pre-authorization requests required
    for SHIF claims where tariffs have requires_preauthorization=True.

    Flow:
        1. submit_preauth() → POST /v1/preauth/request → preauth_reference
        2. poll_status() → GET /v1/preauth/{ref}/status → decision update
        3. Claim submission guarded by is_preauth_valid()

    Attributes:
        auth_service: SHA authentication service for API tokens
        api_base_url: Base URL for DHA API
        timeout: Request timeout in seconds
        max_retries: Maximum retry attempts
    """

    def __init__(self):
        """Initialize SHAPreauthService with settings from Django config."""
        self.auth_service = SHAAuthService()
        auth_mode = self.auth_service.auth_mode
        if auth_mode == "ilm":
            self.api_base_url = self.auth_service.auth_base_url.rstrip("/")
        else:
            self.api_base_url = settings.SHA_API_BASE_URL.rstrip("/")
        self.timeout = settings.SHA_API_TIMEOUT
        self.max_retries = getattr(settings, "SHA_PREAUTH_MAX_RETRIES", 3)

    def submit_preauth(
        self,
        claim: SHAClaim,
        consent: ConsentToken,
        procedure_code: str,
        diagnosis_codes: list[str],
        estimated_cost: Decimal,
        scheduled_date: date,
        clinical_notes: str = "",
        user=None,
    ) -> PreauthRequest:
        """
        Submit pre-authorization request to DHA.

        Args:
            claim: The SHA claim requiring pre-authorization.
            consent: Valid consent token for this visit.
            procedure_code: SHA tariff code for the procedure.
            diagnosis_codes: List of ICD-10 codes justifying the procedure.
            estimated_cost: Estimated cost in KES.
            scheduled_date: Planned procedure date.
            clinical_notes: Clinical justification text.
            user: Staff user submitting the request.

        Returns:
            PreauthRequest instance with reference from DHA.

        Raises:
            SHAPreauthError: If submission fails.
        """
        if not consent.is_valid:
            raise SHAPreauthError(
                "Consent token is not valid",
                code="invalid_consent",
            )

        sha_member = claim.sha_member
        if not sha_member:
            raise SHAPreauthError(
                "Claim has no linked SHA member",
                code="no_sha_member",
            )

        payload = {
            "sha_number": sha_member.sha_number,
            "procedure_code": procedure_code,
            "diagnosis_codes": diagnosis_codes,
            "estimated_cost": float(estimated_cost),
            "scheduled_date": scheduled_date.isoformat(),
            "clinical_notes": clinical_notes,
            "consent_token": consent.consent_token,
        }

        endpoint = self._get_endpoint("preauth_submit")
        response_data = self._make_request("POST", endpoint, json=payload)

        preauth_reference = response_data.get("preauth_reference", "")
        decision = response_data.get("decision", "pending_review").upper()
        if decision == "PENDING_REVIEW":
            decision = "PENDING"

        # Create PreauthRequest record — inherit facility/org from the claim
        preauth = PreauthRequest(
            claim=claim,
            patient=claim.patient,
            sha_member=sha_member,
            consent_token=consent,
            facility=claim.facility,
            organization=claim.organization,
            preauth_reference=preauth_reference,
            procedure_code=procedure_code,
            diagnosis_codes=diagnosis_codes,
            estimated_cost=estimated_cost,
            scheduled_date=scheduled_date,
            clinical_notes=clinical_notes,
            decision=decision,
            submitted_at=timezone.now(),
            created_by=user,
        )

        # If immediately approved
        if decision == "APPROVED":
            preauth.approved_amount = Decimal(str(response_data.get("approved_amount", 0)))
            valid_until = response_data.get("valid_until")
            if valid_until:
                preauth.valid_until = date.fromisoformat(valid_until)

        preauth.save()

        # Update claim preauth fields (denormalized summary)
        if preauth_reference:
            claim.preauth_number = preauth_reference
            claim.preauth_date = timezone.now().date()
            if preauth.valid_until:
                claim.preauth_valid_until = preauth.valid_until
            claim.save(update_fields=["preauth_number", "preauth_date", "preauth_valid_until"])

        logger.info(
            "Preauth submitted for claim %s (ref: %s, decision: %s)",
            claim.claim_number,
            preauth_reference,
            decision,
        )
        return preauth

    def poll_status(self, preauth: PreauthRequest) -> PreauthRequest:
        """
        Poll DHA for pre-authorization status update.

        Args:
            preauth: PreauthRequest to check status for.

        Returns:
            Updated PreauthRequest instance.

        Raises:
            SHAPreauthError: If polling fails.
        """
        if not preauth.preauth_reference:
            raise SHAPreauthError(
                "Cannot poll preauth without a reference",
                code="no_reference",
            )

        endpoint_template = self._get_endpoint("preauth_status")
        if not endpoint_template:
            raise SHAPreauthError(
                "Preauth status endpoint not configured",
                code="no_endpoint",
            )

        # Replace {ref} placeholder with actual reference
        endpoint = endpoint_template.replace("{ref}", preauth.preauth_reference)

        response_data = self._make_request("GET", endpoint)
        preauth.update_from_poll(response_data)

        logger.info(
            "Preauth %s polled (decision: %s, poll_count: %d)",
            preauth.preauth_reference,
            preauth.decision,
            preauth.poll_count,
        )
        return preauth

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
            SHAPreauthError: On request failure after retries.
        """
        if not url:
            raise SHAPreauthError("Endpoint URL is empty", code="no_endpoint")

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
                    self.auth_service.get_token(force_refresh=True)
                    continue

                if response.status_code >= 500 and attempt < retries - 1:
                    time.sleep(2**attempt)
                    continue

                if response.status_code >= 400:
                    error_data = {}
                    with contextlib.suppress(ValueError, requests.exceptions.JSONDecodeError):
                        error_data = response.json()
                    raise SHAPreauthError(
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
                raise SHAPreauthError("DHA API request timed out", code="timeout")
            except requests.exceptions.ConnectionError:
                if attempt < retries - 1:
                    time.sleep(2**attempt)
                    continue
                raise SHAPreauthError("Cannot connect to DHA API", code="connection_error")
            except SHAPreauthError:
                raise
            except Exception as e:
                raise SHAPreauthError(
                    f"Unexpected error calling DHA API: {e}",
                    code="unexpected_error",
                ) from e

        raise SHAPreauthError("Max retries exceeded", code="max_retries")
