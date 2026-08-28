# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
# ruff: noqa
"""Billing sha claims shared for Vitora HMIS.

What this file is for:
- Implement sha claims shared logic for the billing domain.

How to use it:
- Import classes and functions from this module in Django app code and tests.

Supported inputs/args:
- Python imports and Django ORM/runtime inputs; no standalone CLI arguments.
"""

import logging
from importlib import import_module

logger = logging.getLogger(__name__)


def legacy_sha_claims_module():
    """Return the compatibility shim module for patch-friendly dependency access."""
    return import_module("hmis.apps.billing.services.sha_claims")
