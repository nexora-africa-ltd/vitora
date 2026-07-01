# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""
LOINC Terminology Validation Service for Vitora HMIS.

Provides validation and lookup of LOINC codes via:
1. Local LOINCCode cache (fast, offline)
2. External LOINC FHIR Terminology Server (https://fhir.loinc.org)

Environment:
    LOINC_FHIR_URL: Base URL (default: https://fhir.loinc.org)
    LOINC_USERNAME: Loinc.org credentials (required for external API)
    LOINC_PASSWORD: Loinc.org credentials
"""

import logging
from typing import Any

import httpx
from django.conf import settings

logger = logging.getLogger(__name__)

DEFAULT_LOINC_URL = "https://fhir.loinc.org"


class LOINCTerminologyService:
    """
    LOINC terminology service with local fallback.

    When credentials are configured, queries the official LOINC FHIR
    Terminology Server. Otherwise falls back to local LOINCCode cache.
    """

    def __init__(self):
        self.base_url = getattr(settings, "LOINC_FHIR_URL", DEFAULT_LOINC_URL)
        self.username = getattr(settings, "LOINC_USERNAME", "")
        self.password = getattr(settings, "LOINC_PASSWORD", "")
        self.timeout = getattr(settings, "LOINC_TIMEOUT", 10)

    @property
    def is_external_available(self) -> bool:
        """Check if external LOINC API credentials are configured."""
        return bool(self.username and self.password)

    def validate_code(self, code: str) -> bool:
        """
        Validate that a LOINC code exists.

        Args:
            code: LOINC code (e.g., "718-7")

        Returns:
            True if code is valid.
        """
        result = self.lookup(code)
        return result is not None

    def lookup(self, code: str) -> dict[str, Any] | None:
        """
        Look up a LOINC code and return its official details.

        Args:
            code: LOINC code

        Returns:
            Dict with code, component, property, system, scale, display, or None.
        """
        if not code:
            return None

        # Try local first
        local = self._lookup_local(code)
        if local:
            return local

        # Try external
        if self.is_external_available:
            return self._lookup_external(code)

        return None

    def search(self, term: str, limit: int = 20) -> list[dict[str, Any]]:
        """
        Search LOINC codes by name/component.

        Args:
            term: Search text
            limit: Max results

        Returns:
            List of dicts with code, component, display.
        """
        if not term or len(term.strip()) < 2:
            return []

        # Try external first if available
        if self.is_external_available:
            results = self._search_external(term, limit)
            if results:
                return results

        # Fallback to local
        return self._search_local(term, limit)

    # --- Local methods ---

    def _lookup_local(self, code: str) -> dict[str, Any] | None:
        from hmis.apps.laboratory.models import LOINCCode

        try:
            loinc = LOINCCode.objects.get(code=code)
            return {
                "code": loinc.code,
                "component": getattr(loinc, "component", ""),
                "property": getattr(loinc, "property", ""),
                "time_aspect": getattr(loinc, "time_aspect", ""),
                "system": getattr(loinc, "system", ""),
                "scale_type": getattr(loinc, "scale_type", ""),
                "method_type": getattr(loinc, "method_type", ""),
                "display": getattr(loinc, "long_common_name", "")
                or getattr(loinc, "component", ""),
            }
        except Exception:
            return None

    def _search_local(self, term: str, limit: int) -> list[dict[str, Any]]:
        from hmis.apps.laboratory.models import LOINCCode

        qs = LOINCCode.objects.filter(component__icontains=term)[:limit]

        return [
            {
                "code": loinc.code,
                "component": getattr(loinc, "component", ""),
                "display": getattr(loinc, "long_common_name", "")
                or getattr(loinc, "component", ""),
            }
            for loinc in qs
        ]

    # --- External FHIR Terminology Server methods ---

    def _lookup_external(self, code: str) -> dict[str, Any] | None:
        url = f"{self.base_url}/CodeSystem/$lookup"
        params = {
            "system": "http://loinc.org",
            "code": code,
        }
        try:
            with httpx.Client(timeout=self.timeout, auth=(self.username, self.password)) as client:
                resp = client.get(url, params=params)
                if resp.status_code == 404:
                    return None
                resp.raise_for_status()
                data = resp.json()
        except (httpx.HTTPError, Exception) as e:
            logger.error(f"LOINC lookup failed for {code}: {e}")
            return None

        # Parse FHIR Parameters response
        result: dict[str, Any] = {"code": code}
        for param in data.get("parameter", []):
            name = param.get("name", "")
            value = param.get("valueString", "")
            if name == "display":
                result["display"] = value
            elif name == "property":
                # Property sub-parameters
                prop_code = ""
                prop_value = ""
                for sub in param.get("part", []):
                    if sub.get("name") == "code":
                        prop_code = sub.get("valueCode", "")
                    elif sub.get("name") == "value":
                        prop_value = sub.get("valueString", sub.get("valueCode", ""))
                if prop_code:
                    result[prop_code] = prop_value

        return result if "display" in result else None

    def _search_external(self, term: str, limit: int) -> list[dict[str, Any]]:
        url = f"{self.base_url}/ValueSet/$expand"
        params = {
            "url": "http://loinc.org/vs",
            "filter": term,
            "count": limit,
        }
        try:
            with httpx.Client(timeout=self.timeout, auth=(self.username, self.password)) as client:
                resp = client.get(url, params=params)
                resp.raise_for_status()
                data = resp.json()
        except (httpx.HTTPError, Exception) as e:
            logger.error(f"LOINC search failed for '{term}': {e}")
            return []

        results = []
        expansion = data.get("expansion", {})
        for contains in expansion.get("contains", []):
            results.append(
                {
                    "code": contains.get("code", ""),
                    "display": contains.get("display", ""),
                    "component": contains.get("display", ""),
                }
            )
        return results
