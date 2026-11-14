# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
# ruff: noqa: E402, F405
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

from .dha_errors import DHAError
from .sha_auth import SHAAuthError

logger = logging.getLogger(__name__)

ICHI_MIN_LIMIT = 25
ICHI_MAX_LIMIT = 200


def _sanitize_log_field(value: object) -> str:
    text = str(value)
    return text.replace("\r", " ").replace("\n", " ")


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
        limit = min(max(limit, ICHI_MIN_LIMIT), ICHI_MAX_LIMIT)
        logger.info("Searching ICHI codes: query=%s", _sanitize_log_field(query))

        params = {
            "search": query,
            "limit": limit,
        }

        try:
            if self.auth_service.auth_mode == "ilm":
                from .ilm_client import IlmClient
                from .terminology_source_registry import get_terminology_source

                source = get_terminology_source("ichi")
                response = IlmClient(auth_service=self.auth_service).get(
                    "/api/v1/clinical/concepts",
                    params={**source.query_params(), **params},
                )
                data = response.json
                results = data.get("results", data) if isinstance(data, dict) else data
                return [ICHICode.from_api_response(result) for result in results]

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
        except DHAError as e:
            raise TerminologyError(
                f"Failed to search ICHI codes: {e}",
                status_code=e.status_code or 0,
                terminology_type="ICHI",
            ) from e

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
        logger.info("Fetching ICHI code: %s", _sanitize_log_field(code))

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
