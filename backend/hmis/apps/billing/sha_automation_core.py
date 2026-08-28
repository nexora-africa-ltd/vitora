# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
# ruff: noqa
"""
What this file is for: composed SHA claim automation service class from focused mixins.
How to use: imported by `hmis.apps.billing.sha_automation` compatibility shim.
Supported inputs/args: service class only; methods accept claim/patient/encounter IDs and optional users.
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
