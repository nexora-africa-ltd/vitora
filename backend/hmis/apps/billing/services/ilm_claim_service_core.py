# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""Billing ilm claim service core for Vitora HMIS.

What this file is for:
- Implement ilm claim service core logic for the billing domain.

How to use it:
- Import classes and functions from this module in Django app code and tests.

Supported inputs/args:
- Python imports and Django ORM/runtime inputs; no standalone CLI arguments.
"""

from hmis.apps.billing.services.ilm_claim_service_clinical import IlmClaimClinicalMixin
from hmis.apps.billing.services.ilm_claim_service_interventions import IlmClaimInterventionsMixin
from hmis.apps.billing.services.ilm_claim_service_lifecycle import IlmClaimLifecycleMixin
from hmis.apps.billing.services.ilm_claim_service_visit import IlmClaimVisitMixin


class IlmClaimService(
    IlmClaimVisitMixin,
    IlmClaimInterventionsMixin,
    IlmClaimClinicalMixin,
    IlmClaimLifecycleMixin,
):
    """Composed ILM claim service class."""
