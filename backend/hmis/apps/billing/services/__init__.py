"""
Billing services module.

This module exports all billing-related services including:
- SHA Claims and Eligibility
- M-Pesa payment integration
- DHA API integrations (Client Registry, Terminology, Search)
"""

# DHA API Services
from .client_registry import (
    ClientNotFoundError,
    ClientRegistrationError,
    ClientRegistryClient,
    ClientRegistryError,
    ClientRegistryService,
    DuplicateClientError,
)
from .dha_search import DHASearchService, FacilityInfo, PractitionerInfo, SearchError
from .mpesa import MpesaService
from .sha import SHAClaimsService as SHAClaimsServiceStub
from .sha_auth import SHAAuthError, SHAAuthService, SHAToken
from .sha_claims import SHAClaimsService
from .sha_eligibility import SHAEligibilityService
from .terminology import (
    ActiveComponent,
    CodeNotFoundError,
    ComponentLink,
    DrugProduct,
    ICD11Code,
    ICHICode,
    InterventionCode,
    RemoteLOINCCode,
    TerminologyError,
    TerminologyService,
)

__all__ = [
    # Core SHA services
    "SHAClaimsService",
    "SHAClaimsServiceStub",
    "SHAEligibilityService",
    "SHAAuthService",
    "SHAAuthError",
    "SHAToken",
    # Payment
    "MpesaService",
    # Client Registry
    "ClientRegistryService",
    "ClientRegistryClient",
    "ClientRegistryError",
    "ClientNotFoundError",
    "ClientRegistrationError",
    "DuplicateClientError",
    # Terminology
    "TerminologyService",
    "TerminologyError",
    "CodeNotFoundError",
    "InterventionCode",
    "ICD11Code",
    "DrugProduct",
    "ActiveComponent",
    "ComponentLink",
    "RemoteLOINCCode",
    "ICHICode",
    # Search
    "DHASearchService",
    "SearchError",
    "FacilityInfo",
    "PractitionerInfo",
]
