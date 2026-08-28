# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
# ruff: noqa
"""Billing sha claims core for Vitora HMIS.

What this file is for:
- Implement sha claims core logic for the billing domain.

How to use it:
- Import classes and functions from this module in Django app code and tests.

Supported inputs/args:
- Python imports and Django ORM/runtime inputs; no standalone CLI arguments.
"""

from hmis.apps.billing.services.sha_claims_bundle import SHAClaimsBundleMixin
from hmis.apps.billing.services.sha_claims_resources import SHAClaimsResourcesMixin
from hmis.apps.billing.services.sha_claims_submission import SHAClaimsSubmissionMixin
from hmis.apps.billing.services.sha_claims_workflow import SHAClaimsWorkflowMixin


class SHAClaimsService(
    SHAClaimsWorkflowMixin,
    SHAClaimsBundleMixin,
    SHAClaimsResourcesMixin,
    SHAClaimsSubmissionMixin,
):
    """
    Service for SHA claims management.

    Handles claim creation, validation, packaging, and submission
    using the official Kenya Digital Superhighway API.

    Official Endpoints:
        - POST /v1/shr-med/bundle - Submit FHIR claim bundle
        - GET /v1/shr-med/claim-status?claim_id={id} - Check claim status

    Attributes:
        api_base_url: Base URL for SHA API
        auth_service: SHA authentication service
        facility_code: MFL (Master Facility List) code
        facility_level: Facility level (L1-L6)

    Example:
        >>> service = SHAClaimsService()
        >>> claim = service.create_claim_from_encounter(encounter, invoice, user)
        >>> is_valid, errors = service.validate_claim(claim)
        >>> if is_valid:
        ...     response = service.submit_claim(claim, user)
    """
