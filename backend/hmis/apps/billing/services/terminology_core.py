# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""Billing terminology core for Vitora HMIS.

What this file is for:
- Implement terminology core logic for the billing domain.

How to use it:
- Import classes and functions from this module in Django app code and tests.

Supported inputs/args:
- Python imports and Django ORM/runtime inputs; no standalone CLI arguments.
"""

from importlib import import_module

import requests
from django.conf import settings

from hmis.apps.billing.services.terminology_drug_loinc import TerminologyDrugLoincMixin
from hmis.apps.billing.services.terminology_ichi_utils import TerminologyIchiUtilsMixin
from hmis.apps.billing.services.terminology_interventions_icd import (
    TerminologyInterventionsICDMixin,
)
from hmis.apps.billing.services.terminology_models import TerminologyConcept
from hmis.apps.billing.services.terminology_source_registry import get_terminology_source


class TerminologyService(
    TerminologyInterventionsICDMixin,
    TerminologyDrugLoincMixin,
    TerminologyIchiUtilsMixin,
):
    """Composed terminology service class."""

    def __init__(self, use_local_fallback: bool = True):
        """
        Initialize TerminologyService.

        Args:
            use_local_fallback: If True, use local DB when API fails
        """
        self.api_base_url = settings.SHA_API_BASE_URL.rstrip("/")
        self.timeout = getattr(settings, "SHA_API_TIMEOUT", 30)
        self.use_local_fallback = use_local_fallback

        # Get endpoint paths from settings (Official Kenya Digital Superhighway paths)
        # Reference: Kenya Digital Superhighway.postman_collection.json
        endpoints = getattr(settings, "SHA_ENDPOINTS", {})
        self.interventions_endpoint = endpoints.get(
            "sha_interventions", "/terminology/v1/sha-intervention"
        )
        self.icd11_endpoint = endpoints.get("icd11", "/terminology/v1/icd11")
        self.products_endpoint = endpoints.get("drug_products", "/terminology/v1/product")
        self.components_endpoint = endpoints.get(
            "active_components", "/terminology/v1/active-component"
        )
        self.loinc_endpoint = endpoints.get("loinc", "/terminology/v1/loinc")
        self.ichi_endpoint = endpoints.get("ichi", "/terminology/v1/ichi")

        # HAPI FHIR server settings (LOINC fallback)
        self.fhir_base_url = getattr(settings, "HAPI_FHIR_BASE_URL", "http://localhost:8090/fhir")
        self.fhir_timeout = getattr(settings, "HAPI_FHIR_TIMEOUT", 10)
        self.fhir_enabled = getattr(settings, "HAPI_FHIR_ENABLED", True)

        # Initialize auth service
        terminology_module = import_module("hmis.apps.billing.services.terminology")
        self.auth_service = terminology_module.SHAAuthService()

    def search_hpt_concepts(self, query: str, *, limit: int = 50) -> list[TerminologyConcept]:
        """Search the KNHTS HPT source using the normalized Clinical Concepts API."""
        source = get_terminology_source("hpt")
        params = {**source.query_params(), "search": query, "limit": limit}
        try:
            response = requests.get(
                source.endpoint,
                params=params,
                headers={"Accept": "application/json"},
                timeout=self.timeout,
            )
            response.raise_for_status()
        except requests.RequestException as exc:
            from .terminology_models import TerminologyError

            raise TerminologyError(
                f"Failed to search HPT clinical concepts: {exc}", terminology_type="HPT"
            ) from exc

        payload = response.json()
        records = payload.get("results", []) if isinstance(payload, dict) else []
        return [
            TerminologyConcept.from_api_response(
                record,
                owner=source.owner,
                source=source.source or source.collection or "",
            )
            for record in records
            if isinstance(record, dict)
        ]

    # =========================================================================
    # Response Helpers
    # =========================================================================
