# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
# ruff: noqa
"""Billing sha automation core for Vitora HMIS.

What this file is for:
- Implement sha automation core logic for the billing domain.

How to use it:
- Import classes and functions from this module in Django app code and tests.

Supported inputs/args:
- Python imports and Django ORM/runtime inputs; no standalone CLI arguments.
"""

from hmis.apps.billing.sha_automation_claims import SHAClaimAutomationClaimsMixin
from hmis.apps.billing.sha_automation_documents import SHAClaimAutomationDocumentsMixin
from hmis.apps.billing.sha_automation_ops import SHAClaimAutomationOpsMixin


class SHAClaimAutomationService(
    SHAClaimAutomationClaimsMixin,
    SHAClaimAutomationDocumentsMixin,
    SHAClaimAutomationOpsMixin,
):
    """Composed SHA automation service."""
