"""
Billing services module.

This module exports all billing-related services including:
- SHA Claims and Eligibility
- M-Pesa payment integration
- DHA API integrations (Client Registry, Terminology, Search)
"""
from .mpesa import MpesaService
from .sha import SHAClaimsService as SHAClaimsServiceStub
from .sha_auth import SHAAuthService, SHAAuthError, SHAToken
from .sha_claims import SHAClaimsService
from .sha_eligibility import SHAEligibilityService

# DHA API Services
from .client_registry import (
    ClientRegistryService,
    ClientRegistryClient,
    ClientRegistryError,
    ClientNotFoundError,
    ClientRegistrationError,
    DuplicateClientError,
)
from .terminology import (
    TerminologyService,
    TerminologyError,
    CodeNotFoundError,
    InterventionCode,
    ICD11Code,
    DrugProduct,
    ActiveComponent,
    RemoteLOINCCode,
    ICHICode,
)
from .dha_search import (
    DHASearchService,
    SearchError,
    FacilityInfo,
    PractitionerInfo,
)

__all__ = [
    # Core SHA services
    'SHAClaimsService',
    'SHAClaimsServiceStub',
    'SHAEligibilityService',
    'SHAAuthService',
    'SHAAuthError',
    'SHAToken',
    # Payment
    'MpesaService',
    # Client Registry
    'ClientRegistryService',
    'ClientRegistryClient',
    'ClientRegistryError',
    'ClientNotFoundError',
    'ClientRegistrationError',
    'DuplicateClientError',
    # Terminology
    'TerminologyService',
    'TerminologyError',
    'CodeNotFoundError',
    'InterventionCode',
    'ICD11Code',
    'DrugProduct',
    'ActiveComponent',
    'RemoteLOINCCode',
    'ICHICode',
    # Search
    'DHASearchService',
    'SearchError',
    'FacilityInfo',
    'PractitionerInfo',
]
