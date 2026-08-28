# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
# ruff: noqa
"""
What this file is for: composed ILM claim service class built from focused mixins.
How to use: imported by `hmis.apps.billing.services.ilm_claim_service` compatibility shim.
Supported inputs/args: service class for DHA ILM claim operations.
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
