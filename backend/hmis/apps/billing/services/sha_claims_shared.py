# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""Billing sha claims shared for Vitora HMIS.

What this file is for:
- Provide shared imports/constants/helpers used by split SHA claims service modules.

How to use it:
- Import from this module in split SHA claims mixins and compatibility shims.

Supported inputs/args:
- Service dependencies, model imports, and helper utilities for SHA claims workflows.
"""

import logging
from importlib import import_module

logger = logging.getLogger(__name__)


def legacy_sha_claims_module():
    """Return the compatibility shim module for patch-friendly dependency access."""
    return import_module("hmis.apps.billing.services.sha_claims")
