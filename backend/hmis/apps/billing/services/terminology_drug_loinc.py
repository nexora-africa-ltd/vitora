# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
# ruff: noqa
"""Billing terminology drug loinc for Vitora HMIS.

What this file is for:
- Implement terminology drug loinc logic for the billing domain.

How to use it:
- Import classes and functions from this module in Django app code and tests.

Supported inputs/args:
- Python imports and Django ORM/runtime inputs; no standalone CLI arguments.
"""

import logging

import requests
from django.db.models import Q

from .sha_auth import SHAAuthError

logger = logging.getLogger(__name__)


from hmis.apps.billing.services.terminology_models import *  # noqa: F403


class TerminologyDrugLoincMixin:
    def search_drug_products(
        self,
        query: str = "",
        *,
        product_id: int | None = None,
        generic_concept_id: int | None = None,
        form_id: int | None = None,
        route_id: int | None = None,
        limit: int = 50,
    ) -> list[DrugProduct]:
        """
        Search drug products catalog via DHA HPT Registry.

        Args:
            query: Search term (brand name, generic name, PPB code, KNHTS concept ID)
            product_id: Search by specific DHA product ID
            generic_concept_id: Search by generic concept grouping
            form_id: Filter by dosage form ID
            route_id: Filter by administration route ID
            limit: Maximum results

        Returns:
            List of matching DrugProduct objects
        """
        logger.info(f"Searching drug products: query='{query}'")

        params: dict[str, str | int] = {}
        if query:
            params["search"] = query
        if product_id is not None:
            params["product_id"] = product_id
        if generic_concept_id is not None:
            params["generic_concept_id"] = generic_concept_id
        if form_id is not None:
            params["form_id"] = form_id
        if route_id is not None:
            params["route_id"] = route_id

        try:
            headers = self.auth_service.get_terminology_headers()

            response = requests.get(
                f"{self.api_base_url}{self.products_endpoint}",
                params=params,
                headers=headers,
                timeout=self.timeout,
            )

            response.raise_for_status()

            data = response.json()
            results = self._unwrap_dha_response(data, "products")
            return [DrugProduct.from_api_response(r) for r in results]

        except (SHAAuthError, requests.RequestException) as e:
            raise TerminologyError(
                f"Failed to search drug products: {str(e)}",
                terminology_type="DRUG_PRODUCTS",
            )

    def get_drug_product(self, product_id: int) -> DrugProduct:
        """
        Get a specific drug product by DHA product ID.

        Args:
            product_id: DHA product identifier (integer)

        Returns:
            DrugProduct for the specified ID

        Raises:
            CodeNotFoundError: If product not found
        """
        logger.info(f"Fetching drug product: {product_id}")

        try:
            results = self.search_drug_products(product_id=product_id)
            if not results:
                raise CodeNotFoundError(str(product_id), "DRUG_PRODUCTS")
            return results[0]

        except TerminologyError:
            raise
        except (SHAAuthError, requests.RequestException) as e:
            raise TerminologyError(
                f"Failed to fetch drug product: {str(e)}",
                terminology_type="DRUG_PRODUCTS",
            )

    # =========================================================================
    # Active Components
    # =========================================================================

    def search_active_components(
        self,
        query: str = "",
        *,
        exact_match: bool = False,
        active_component_id: int | None = None,
        limit: int = 50,
    ) -> list[ActiveComponent]:
        """
        Search active pharmaceutical components via DHA HPT Registry.

        Args:
            query: Search term (component description)
            exact_match: If True, only exact matches are returned
            active_component_id: Search by specific component ID
            limit: Maximum results

        Returns:
            List of matching ActiveComponent objects
        """
        logger.info(f"Searching active components: query='{query}'")

        params: dict[str, str | int | bool] = {}
        if query:
            params["search"] = query
        if exact_match:
            params["exact_match"] = "true"
        if active_component_id is not None:
            params["active_component_id"] = active_component_id

        try:
            headers = self.auth_service.get_terminology_headers()

            response = requests.get(
                f"{self.api_base_url}{self.components_endpoint}",
                params=params,
                headers=headers,
                timeout=self.timeout,
            )

            response.raise_for_status()

            data = response.json()
            results = self._unwrap_dha_response(data, "ac")
            return [ActiveComponent.from_api_response(r) for r in results]

        except (SHAAuthError, requests.RequestException) as e:
            raise TerminologyError(
                f"Failed to search active components: {str(e)}",
                terminology_type="ACTIVE_COMPONENTS",
            )

    # =========================================================================
    # LOINC (with FHIR and local fallback)
    # =========================================================================

    def search_loinc(
        self,
        query: str,
        limit: int = 50,
    ) -> list[RemoteLOINCCode]:
        """
        Search LOINC lab observation codes.

        Strategy: SHA/DHA API → FHIR Server → Local database fallback.

        Args:
            query: Search term
            limit: Maximum results

        Returns:
            List of RemoteLOINCCode objects
        """
        logger.info(f"Searching LOINC codes: query='{query}'")

        # Try remote SHA/DHA API first
        try:
            return self._search_loinc_remote(query, limit)
        except TerminologyError as e:
            logger.warning(f"Remote LOINC search failed: {e}")

        # Try FHIR server as secondary fallback
        if self.fhir_enabled:
            try:
                logger.info("Trying FHIR server for LOINC lookup")
                results = self._search_loinc_fhir(query, limit)
                if results:
                    return results
            except (
                AttributeError,
                TypeError,
                ValueError,
                RuntimeError,
                OSError,
                AssertionError,
                ImportError,
            ) as e:
                logger.warning(f"FHIR LOINC search failed: {e}")

        # Final fallback: local database
        if self.use_local_fallback:
            logger.info("Using local database fallback for LOINC")
            return self._search_loinc_local(query, limit)

        raise TerminologyError(
            "All LOINC sources unavailable",
            terminology_type="LOINC",
        )

    def _search_loinc_remote(
        self,
        query: str,
        limit: int,
    ) -> list[RemoteLOINCCode]:
        """Search LOINC via remote API."""
        params = {
            "search": query,
            "limit": limit,
        }

        headers = self.auth_service.get_terminology_headers()

        response = requests.get(
            f"{self.api_base_url}{self.loinc_endpoint}",
            params=params,
            headers=headers,
            timeout=self.timeout,
        )

        if response.status_code == 401:
            raise TerminologyError(
                "Authentication failed",
                status_code=401,
                terminology_type="LOINC",
            )

        response.raise_for_status()

        data = response.json()
        results = self._unwrap_dha_response(data, "loinc")
        return [RemoteLOINCCode.from_api_response(r) for r in results]

    def _search_loinc_fhir(
        self,
        query: str,
        limit: int,
    ) -> list[RemoteLOINCCode]:
        """
        Search LOINC via FHIR terminology server (HAPI FHIR).

        Uses FHIR ValueSet $expand operation or CodeSystem $lookup.
        Reference: https://www.hl7.org/fhir/terminology-service.html

        Args:
            query: Search term (component name or LOINC code)
            limit: Maximum results

        Returns:
            List of RemoteLOINCCode objects
        """
        # Try ValueSet $expand for text search
        # LOINC ValueSet: http://loinc.org/vs/top-2000-lab-observations-si
        expand_url = f"{self.fhir_base_url}/ValueSet/$expand"
        params = {
            "url": "http://loinc.org/vs",
            "filter": query,
            "count": limit,
        }

        try:
            response = requests.get(
                expand_url,
                params=params,
                headers={"Accept": "application/fhir+json"},
                timeout=self.fhir_timeout,
            )

            if response.status_code == 200:
                data = response.json()
                return self._parse_fhir_loinc_valueset(data)

            # Fallback: try CodeSystem $lookup if exact code
            if self._is_loinc_code_format(query):
                return self._lookup_loinc_code_fhir(query)

        except requests.RequestException as e:
            logger.warning(f"FHIR LOINC $expand failed: {e}")
            raise

        return []

    def _parse_fhir_loinc_valueset(self, data: dict) -> list[RemoteLOINCCode]:
        """Parse FHIR ValueSet expansion to RemoteLOINCCode list."""
        results = []
        expansion = data.get("expansion", {})
        contains = expansion.get("contains", [])

        for item in contains:
            if item.get("system") != "http://loinc.org":
                continue

            code = item.get("code", "")
            display = item.get("display", "")

            # Parse component from display (format: "Component:Property:...")
            parts = display.split(":") if ":" in display else [display]
            component = parts[0] if parts else display

            results.append(
                RemoteLOINCCode(
                    loinc_num=code,
                    component=component,
                    property=parts[1] if len(parts) > 1 else "",
                    time_aspect=parts[2] if len(parts) > 2 else "",
                    system=parts[3] if len(parts) > 3 else "",
                    scale_type=parts[4] if len(parts) > 4 else "",
                    method_type=parts[5] if len(parts) > 5 else "",
                    long_common_name=display,
                    short_name=component[:100] if component else "",
                    status="ACTIVE",
                )
            )

        return results

    def _is_loinc_code_format(self, query: str) -> bool:
        """Check if query looks like a LOINC code (e.g., '2345-7')."""
        import re

        return bool(re.match(r"^\d+-\d+$", query.strip()))

    def _lookup_loinc_code_fhir(self, code: str) -> list[RemoteLOINCCode]:
        """Lookup a specific LOINC code via FHIR CodeSystem/$lookup."""
        lookup_url = f"{self.fhir_base_url}/CodeSystem/$lookup"
        params = {
            "system": "http://loinc.org",
            "code": code,
        }

        try:
            response = requests.get(
                lookup_url,
                params=params,
                headers={"Accept": "application/fhir+json"},
                timeout=self.fhir_timeout,
            )

            if response.status_code != 200:
                return []

            data = response.json()
            parameters = data.get("parameter", [])

            # Extract values from FHIR Parameters resource
            display = ""
            for param in parameters:
                if param.get("name") == "display":
                    display = param.get("valueString", "")
                    break

            if display:
                return [
                    RemoteLOINCCode(
                        loinc_num=code,
                        component=display,
                        property="",
                        time_aspect="",
                        system="",
                        scale_type="",
                        method_type="",
                        long_common_name=display,
                        short_name=display[:100],
                        status="ACTIVE",
                    )
                ]

        except requests.RequestException as e:
            logger.warning(f"FHIR LOINC $lookup failed: {e}")

        return []

    def _search_loinc_local(
        self,
        query: str,
        limit: int,
    ) -> list[RemoteLOINCCode]:
        """Search LOINC in local database fallback."""
        try:
            from hmis.apps.laboratory.models import LOINCCode

            local_codes = LOINCCode.objects.filter(
                Q(code__icontains=query)
                | Q(component__icontains=query)
                | Q(long_common_name__icontains=query)
            )[:limit]

            return [
                RemoteLOINCCode(
                    loinc_num=c.code,
                    component=c.component,
                    property=c.property,
                    time_aspect=c.time_aspect,
                    system=c.system,
                    scale_type=c.scale_type,
                    method_type=c.method_type,
                    long_common_name=c.long_common_name,
                    short_name=c.short_name,
                    status="ACTIVE",
                )
                for c in local_codes
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
            logger.error(f"Local LOINC fallback failed: {e}")
            return []

    def get_loinc(self, loinc_num: str) -> RemoteLOINCCode:
        """
        Get a specific LOINC code.

        Strategy: SHA/DHA API → FHIR Server → Local database.

        Args:
            loinc_num: LOINC number (e.g., '2345-7')

        Returns:
            RemoteLOINCCode for the specified number

        Raises:
            CodeNotFoundError: If code not found in all sources
        """
        logger.info(f"Fetching LOINC code: {loinc_num}")

        # Try remote SHA/DHA API first
        try:
            headers = self.auth_service.get_terminology_headers()

            response = requests.get(
                f"{self.api_base_url}{self.loinc_endpoint}/{loinc_num}",
                headers=headers,
                timeout=self.timeout,
            )

            if response.status_code == 404:
                raise CodeNotFoundError(loinc_num, "LOINC")

            response.raise_for_status()

            data = response.json()
            code_data = data.get("code") or data

            return RemoteLOINCCode.from_api_response(code_data)

        except CodeNotFoundError:
            pass  # Continue to fallbacks
        except (SHAAuthError, requests.RequestException) as e:
            logger.warning(f"Remote LOINC fetch failed: {e}")

        # Try FHIR server as secondary fallback
        if self.fhir_enabled:
            try:
                results = self._lookup_loinc_code_fhir(loinc_num)
                if results:
                    return results[0]
            except (
                AttributeError,
                TypeError,
                ValueError,
                RuntimeError,
                OSError,
                AssertionError,
                ImportError,
            ) as e:
                logger.warning(f"FHIR LOINC lookup failed: {e}")

        # Final fallback: local database
        if self.use_local_fallback:
            try:
                return self._get_loinc_local(loinc_num)
            except CodeNotFoundError:
                pass

        raise CodeNotFoundError(loinc_num, "LOINC")

    def _get_loinc_local(self, loinc_num: str) -> RemoteLOINCCode:
        """Get LOINC from local database."""
        try:
            from hmis.apps.laboratory.models import LOINCCode

            c = LOINCCode.objects.get(code=loinc_num)
            return RemoteLOINCCode(
                loinc_num=c.code,
                component=c.component,
                property=c.property,
                time_aspect=c.time_aspect,
                system=c.system,
                scale_type=c.scale_type,
                method_type=c.method_type,
                long_common_name=c.long_common_name,
                short_name=c.short_name,
                status="ACTIVE",
            )
        except (
            AttributeError,
            TypeError,
            ValueError,
            RuntimeError,
            OSError,
            AssertionError,
            ImportError,
        ):
            raise CodeNotFoundError(loinc_num, "LOINC")

    # =========================================================================
    # ICHI
    # =========================================================================
