# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
# ruff: noqa
"""Billing terminology ichi utils for Vitora HMIS.

What this file is for:
- Implement terminology ichi utils logic for the billing domain.

How to use it:
- Import classes and functions from this module in Django app code and tests.

Supported inputs/args:
- Python imports and Django ORM/runtime inputs; no standalone CLI arguments.
"""

import logging

import requests

from .sha_auth import SHAAuthError

logger = logging.getLogger(__name__)


from hmis.apps.billing.services.terminology_models import *  # noqa: F403


class TerminologyIchiUtilsMixin:
    def search_ichi(
        self,
        query: str,
        limit: int = 50,
    ) -> list[ICHICode]:
        """
        Search ICHI intervention codes.

        Args:
            query: Search term
            limit: Maximum results

        Returns:
            List of matching ICHICode objects
        """
        logger.info(f"Searching ICHI codes: query='{query}'")

        params = {
            "search": query,
            "limit": limit,
        }

        try:
            headers = self.auth_service.get_terminology_headers()

            response = requests.get(
                f"{self.api_base_url}{self.ichi_endpoint}",
                params=params,
                headers=headers,
                timeout=self.timeout,
            )

            response.raise_for_status()

            data = response.json()
            results = self._unwrap_dha_response(data, "ichi")
            return [ICHICode.from_api_response(r) for r in results]

        except (SHAAuthError, requests.RequestException) as e:
            raise TerminologyError(
                f"Failed to search ICHI codes: {str(e)}",
                terminology_type="ICHI",
            )

    def get_ichi(self, code: str) -> ICHICode:
        """
        Get a specific ICHI code.

        Args:
            code: ICHI code

        Returns:
            ICHICode for the specified code

        Raises:
            CodeNotFoundError: If code not found
        """
        logger.info(f"Fetching ICHI code: {code}")

        try:
            headers = self.auth_service.get_terminology_headers()

            response = requests.get(
                f"{self.api_base_url}{self.ichi_endpoint}/{code}",
                headers=headers,
                timeout=self.timeout,
            )

            if response.status_code == 404:
                raise CodeNotFoundError(code, "ICHI")

            response.raise_for_status()

            data = response.json()
            code_data = data.get("code") or data

            return ICHICode.from_api_response(code_data)

        except (SHAAuthError, requests.RequestException) as e:
            raise TerminologyError(
                f"Failed to fetch ICHI code: {str(e)}",
                terminology_type="ICHI",
            )

    # =========================================================================
    # Utility Methods
    # =========================================================================

    def is_configured(self) -> bool:
        """
        Check if Terminology service is properly configured.

        Returns:
            True if service can be used
        """
        return bool(self.api_base_url and self.auth_service.is_configured())

    def validate_intervention_for_facility(
        self,
        intervention_code: str,
        facility_level: int,
    ) -> tuple[bool, str | None]:
        """
        Validate an intervention is available at facility level.

        Args:
            intervention_code: SHA intervention code
            facility_level: Facility level (1-6)

        Returns:
            Tuple of (is_valid, error_message)
        """
        try:
            intervention = self.get_intervention(intervention_code)

            if not intervention.is_active:
                return False, f"Intervention {intervention_code} is not active"

            if intervention.facility_level and facility_level < intervention.facility_level:
                return False, (
                    f"Intervention {intervention_code} requires minimum "
                    f"Level {intervention.facility_level} facility"
                )

            return True, None

        except CodeNotFoundError:
            return False, f"Intervention {intervention_code} not found"
        except TerminologyError as e:
            return False, str(e)
