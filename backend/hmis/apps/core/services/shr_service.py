"""
SHR (Shared Health Record) document sharing service.

Handles push/pull of clinical documents to/from Kenya's
Shared Health Record system via the SHA API.

Documents are shared as FHIR Bundles (IPS, Discharge Summary, Lab Report).
"""

import logging

import requests
from django.conf import settings

logger = logging.getLogger(__name__)


class SHRService:
    """Service for Shared Health Record document sharing."""

    def __init__(self):
        self.api_base_url = getattr(settings, "SHA_API_BASE_URL", "").rstrip("/")
        self.timeout = getattr(settings, "SHA_API_TIMEOUT", 30)
        endpoints = getattr(settings, "SHA_ENDPOINTS", {})
        self.submission_endpoint = endpoints.get("shr_submission", "/v1/shr-submission")
        self.summary_endpoint = endpoints.get("shr_summary", "/v1/shr/summary")

    def push_document(self, patient_cr_id: str, fhir_bundle: dict) -> dict:
        """
        Push a FHIR Bundle document to the SHR.

        Args:
            patient_cr_id: Patient's Client Registry ID
            fhir_bundle: FHIR Bundle resource dict (IPS, Discharge Summary, etc.)

        Returns:
            dict with submission result

        Raises:
            SHRError: If submission fails
        """
        if not self.api_base_url:
            logger.warning("SHA_API_BASE_URL not configured, skipping SHR push")
            return {"status": "skipped", "detail": "SHA_API_BASE_URL not configured"}

        try:
            from hmis.apps.billing.services.sha_auth import SHAAuthService

            auth_service = SHAAuthService()
            headers = auth_service.get_auth_headers()
            headers["Content-Type"] = "application/fhir+json"

            payload = {
                "patient_cr_id": patient_cr_id,
                "bundle": fhir_bundle,
            }

            response = requests.post(
                f"{self.api_base_url}{self.submission_endpoint}",
                json=payload,
                headers=headers,
                timeout=self.timeout,
            )
            response.raise_for_status()

            logger.info("SHR document pushed for patient CR %s", patient_cr_id)
            return {
                "status": "success",
                "response": response.json() if response.content else {},
            }

        except Exception as exc:
            logger.warning(
                "SHR push failed for patient CR %s: %s",
                patient_cr_id,
                exc,
            )
            return {"status": "error", "detail": str(exc)}

    def pull_summary(self, patient_cr_id: str) -> dict | None:
        """
        Pull a patient summary from the SHR.

        Args:
            patient_cr_id: Patient's Client Registry ID

        Returns:
            FHIR Bundle dict or None if not found
        """
        if not self.api_base_url:
            logger.warning("SHA_API_BASE_URL not configured, skipping SHR pull")
            return None

        try:
            from hmis.apps.billing.services.sha_auth import SHAAuthService

            auth_service = SHAAuthService()
            headers = auth_service.get_auth_headers()

            response = requests.get(
                f"{self.api_base_url}{self.summary_endpoint}",
                params={"patient_cr_id": patient_cr_id},
                headers=headers,
                timeout=self.timeout,
            )

            if response.status_code == 404:
                return None

            response.raise_for_status()

            logger.info("SHR summary retrieved for patient CR %s", patient_cr_id)
            return response.json()

        except Exception as exc:
            logger.warning(
                "SHR pull failed for patient CR %s: %s",
                patient_cr_id,
                exc,
            )
            return None
