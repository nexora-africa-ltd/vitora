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

from django.conf import settings

from hmis.apps.billing.services.terminology_drug_loinc import TerminologyDrugLoincMixin
from hmis.apps.billing.services.terminology_ichi_utils import TerminologyIchiUtilsMixin
from hmis.apps.billing.services.terminology_interventions_icd import (
    TerminologyInterventionsICDMixin,
)


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

    # =========================================================================
    # Response Helpers
    # =========================================================================
