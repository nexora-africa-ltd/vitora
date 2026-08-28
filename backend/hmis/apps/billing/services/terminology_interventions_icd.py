# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
# ruff: noqa: E402, F405
"""Billing terminology interventions icd for Vitora HMIS.

What this file is for:
- Implement terminology interventions icd logic for the billing domain.

How to use it:
- Import classes and functions from this module in Django app code and tests.

Supported inputs/args:
- Python imports and Django ORM/runtime inputs; no standalone CLI arguments.
"""

import logging

import requests
from django.db.models import Q

from .intervention_fallback import get_local_intervention, search_local_interventions
from .sha_auth import SHAAuthError

logger = logging.getLogger(__name__)


from hmis.apps.billing.services.terminology_models import *  # noqa: F403


class TerminologyInterventionsICDMixin:
    @staticmethod
    def _unwrap_dha_response(response_json: dict, data_key: str) -> list[dict]:
        """
        Unwrap the standard DHA API response envelope.

        DHA APIs wrap responses in: { IsSuccess, Message, Errors, Data: { <key>: [...], count } }
        This helper extracts the list from Data[key], with fallback for
        alternate response formats.
        """
        # Check for DHA envelope format
        if "IsSuccess" in response_json:
            if not response_json.get("IsSuccess"):
                errors = response_json.get("Errors", [])
                message = response_json.get("Message", "Unknown error")
                logger.warning("DHA API returned IsSuccess=false: %s, errors=%s", message, errors)
                return []
            data = response_json.get("Data", {})
            if isinstance(data, dict):
                results = data.get(data_key, [])
                if isinstance(results, list):
                    return results
                return [results] if results else []
            return []

        # Fallback: try direct key access (older format or mocked responses)
        results = (
            response_json.get(data_key)
            or response_json.get("results")
            or response_json.get("data")
            or []
        )
        if isinstance(results, dict):
            return [results]
        return results if isinstance(results, list) else []

    # =========================================================================
    # SHA Interventions
    # =========================================================================

    def search_interventions(
        self,
        query: str,
        facility_level: int | None = None,
        category: str | None = None,
        limit: int = 50,
        force_remote: bool = False,
    ) -> list[InterventionCode]:
        """
        Search SHA interventions catalog.

        Uses local-first strategy: serves from local JSONL data for speed,
        falls back to DHA API only when local data is unavailable or
        force_remote=True.

        Args:
            query: Search term (name or code)
            facility_level: Filter by minimum facility level (1-6)
            category: Filter by category
            limit: Maximum results to return
            force_remote: If True, skip local and call DHA API directly

        Returns:
            List of matching InterventionCode objects

        Raises:
            TerminologyError: If search fails and no fallback available

        Example:
            >>> results = service.search_interventions('consultation')
            >>> print(f"Found {len(results)} interventions")
        """
        logger.info(f"Searching SHA interventions: query='{query}'")

        # Local-first: serve from JSONL unless forced remote
        if not force_remote:
            local_results, _ = search_local_interventions(
                query=query,
                facility_level=facility_level,
                category=category,
                limit=limit,
            )
            if local_results:
                logger.debug(
                    "Served %d interventions from local store for query='%s'",
                    len(local_results),
                    query,
                )
                return [InterventionCode(**kwargs) for kwargs in local_results]
            # Local store empty (missing JSONL or no matches) — try remote
            logger.info("Local store returned no results, trying DHA API")

        # Remote DHA API
        params = {
            "search": query,
            "limit": limit,
        }
        if facility_level is not None:
            params["facility_level"] = facility_level
        if category:
            params["category"] = category

        try:
            headers = self.auth_service.get_terminology_headers()

            response = requests.get(
                f"{self.api_base_url}{self.interventions_endpoint}",
                params=params,
                headers=headers,
                timeout=self.timeout,
            )

            if response.status_code == 401:
                raise TerminologyError(
                    "Authentication failed",
                    status_code=401,
                    terminology_type="SHA_INTERVENTIONS",
                )

            response.raise_for_status()

            data = response.json()
            results = self._unwrap_dha_response(data, "shaInterventions")
            return [InterventionCode.from_api_response(r) for r in results]

        except SHAAuthError as e:
            raise TerminologyError(
                f"Authentication error: {str(e)}",
                status_code=e.status_code,
                terminology_type="SHA_INTERVENTIONS",
            )
        except requests.Timeout:
            raise TerminologyError(
                "Request timed out",
                terminology_type="SHA_INTERVENTIONS",
            )
        except requests.RequestException as e:
            raise TerminologyError(
                f"Request failed: {str(e)}",
                terminology_type="SHA_INTERVENTIONS",
            )

    def get_intervention(self, code: str, force_remote: bool = False) -> InterventionCode:
        """
        Get a specific SHA intervention by code.

        Uses local-first strategy: checks local JSONL data first,
        falls back to DHA API if not found locally or force_remote=True.

        Args:
            code: SHA intervention code
            force_remote: If True, skip local and call DHA API directly

        Returns:
            InterventionCode for the specified code

        Raises:
            CodeNotFoundError: If code not found in local or remote
            TerminologyError: If remote request fails and code not available locally
        """
        logger.info(f"Fetching SHA intervention: {code}")

        # Local-first: check JSONL store
        if not force_remote:
            local = get_local_intervention(code)
            if local:
                logger.debug("Served intervention '%s' from local store", code)
                return InterventionCode(**local)
            # Not found locally — try remote
            logger.info("Intervention '%s' not in local store, trying DHA API", code)

        # Remote DHA API
        try:
            headers = self.auth_service.get_terminology_headers()

            response = requests.get(
                f"{self.api_base_url}{self.interventions_endpoint}/{code}",
                headers=headers,
                timeout=self.timeout,
            )

            if response.status_code == 404:
                raise CodeNotFoundError(code, "SHA_INTERVENTIONS")

            response.raise_for_status()

            data = response.json()
            intervention_data = data.get("intervention") or data

            return InterventionCode.from_api_response(intervention_data)

        except (SHAAuthError, requests.RequestException) as e:
            raise TerminologyError(
                f"Failed to fetch intervention: {str(e)}",
                terminology_type="SHA_INTERVENTIONS",
            )

    def get_interventions_for_facility_level(
        self,
        facility_level: int,
    ) -> list[InterventionCode]:
        """
        Get all interventions available at a facility level.

        Args:
            facility_level: Facility level (1-6)

        Returns:
            List of InterventionCode available at that level
        """
        return self.search_interventions(
            query="",
            facility_level=facility_level,
            limit=1000,
        )

    # =========================================================================
    # ICD-11
    # =========================================================================

    def search_icd11(
        self,
        query: str,
        chapter: str | None = None,
        limit: int = 50,
    ) -> list[ICD11Code]:
        """
        Search ICD-11 disease codes.

        Args:
            query: Search term (title or code)
            chapter: Filter by ICD-11 chapter
            limit: Maximum results

        Returns:
            List of matching ICD11Code objects

        Raises:
            TerminologyError: If search fails
        """
        logger.info(f"Searching ICD-11: query='{query}'")

        try:
            return self._search_icd11_remote(query, chapter, limit)
        except TerminologyError as e:
            logger.warning(f"Remote ICD-11 search failed: {e}")

        if self.use_local_fallback:
            logger.info("Using local database fallback for ICD-11")
            return self._search_icd11_local(query, limit)

        raise TerminologyError(
            "All ICD-11 sources unavailable",
            terminology_type="ICD11",
        )

    def _search_icd11_remote(
        self,
        query: str,
        chapter: str | None,
        limit: int,
    ) -> list[ICD11Code]:
        """Search ICD-11 via remote DHA API."""

        params = {
            "search": query,
            "limit": limit,
        }
        if chapter:
            params["chapter"] = chapter

        try:
            headers = self.auth_service.get_terminology_headers()

            response = requests.get(
                f"{self.api_base_url}{self.icd11_endpoint}",
                params=params,
                headers=headers,
                timeout=self.timeout,
            )

            if response.status_code == 401:
                raise TerminologyError(
                    "Authentication failed",
                    status_code=401,
                    terminology_type="ICD11",
                )

            response.raise_for_status()

            data = response.json()
            results = self._unwrap_dha_response(data, "icd11")
            return [ICD11Code.from_api_response(r) for r in results]

        except SHAAuthError as e:
            raise TerminologyError(
                f"Authentication error: {str(e)}",
                status_code=e.status_code,
                terminology_type="ICD11",
            )
        except requests.RequestException as e:
            raise TerminologyError(
                f"Request failed: {str(e)}",
                terminology_type="ICD11",
            )

    def _search_icd11_local(
        self,
        query: str,
        limit: int,
    ) -> list[ICD11Code]:
        """Search ICD-11 in the local database fallback."""
        try:
            from hmis.apps.billing.models import ICD11CodeReference

            local_codes = ICD11CodeReference.objects.filter(
                Q(code__icontains=query)
                | Q(title__icontains=query)
                | Q(description__icontains=query),
                is_active=True,
            ).order_by("code")[:limit]

            return [
                ICD11Code(
                    code=code.code,
                    title=code.title,
                    description=code.description or code.title,
                    chapter=code.chapter or code.chapter_no,
                    is_leaf=code.is_leaf,
                    raw_data={
                        "source": "local_icd11_database",
                        "entity_id": code.entity_id,
                        "class_kind": code.class_kind,
                    },
                )
                for code in local_codes
            ]
        except (
            AttributeError,
            TypeError,
            ValueError,
            RuntimeError,
            OSError,
            AssertionError,
            ImportError,
        ) as e:
            logger.error(f"Local ICD-11 fallback failed: {e}")
            return []

    def get_icd11(self, code: str) -> ICD11Code:
        """
        Get a specific ICD-11 code.

        Args:
            code: ICD-11 code (e.g., '1A00')

        Returns:
            ICD11Code for the specified code

        Raises:
            CodeNotFoundError: If code not found
        """
        logger.info(f"Fetching ICD-11 code: {code}")

        try:
            return self._get_icd11_remote(code)
        except CodeNotFoundError:
            pass
        except TerminologyError as e:
            logger.warning(f"Remote ICD-11 fetch failed: {e}")

        if self.use_local_fallback:
            try:
                return self._get_icd11_local(code)
            except CodeNotFoundError:
                pass

        raise CodeNotFoundError(code, "ICD11")

    def _get_icd11_remote(self, code: str) -> ICD11Code:
        """Get a specific ICD-11 code via remote DHA API."""

        try:
            headers = self.auth_service.get_terminology_headers()

            response = requests.get(
                f"{self.api_base_url}{self.icd11_endpoint}/{code}",
                headers=headers,
                timeout=self.timeout,
            )

            if response.status_code == 404:
                raise CodeNotFoundError(code, "ICD11")

            response.raise_for_status()

            data = response.json()
            code_data = data.get("code") or data

            return ICD11Code.from_api_response(code_data)

        except (SHAAuthError, requests.RequestException) as e:
            raise TerminologyError(
                f"Failed to fetch ICD-11 code: {str(e)}",
                terminology_type="ICD11",
            )

    def _get_icd11_local(self, code: str) -> ICD11Code:
        """Get ICD-11 from the local database fallback."""
        from hmis.apps.billing.models import ICD11CodeReference

        try:
            local_code = ICD11CodeReference.objects.get(code=code.upper(), is_active=True)
        except ICD11CodeReference.DoesNotExist as exc:
            raise CodeNotFoundError(code, "ICD11") from exc

        return ICD11Code(
            code=local_code.code,
            title=local_code.title,
            description=local_code.description or local_code.title,
            chapter=local_code.chapter or local_code.chapter_no,
            is_leaf=local_code.is_leaf,
            raw_data={
                "source": "local_icd11_database",
                "entity_id": local_code.entity_id,
                "class_kind": local_code.class_kind,
            },
        )

    # =========================================================================
    # Drug Products
    # =========================================================================
