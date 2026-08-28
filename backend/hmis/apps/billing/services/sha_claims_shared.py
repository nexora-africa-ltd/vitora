# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""Billing sha claims shared for Vitora HMIS.

What this file is for:
- Provide shared imports/constants/helpers used by split SHA claims service modules.

How to use it:
- Import from this module in split SHA claims mixins and compatibility shims.

Supported inputs/args:
- Service dependencies, model imports, and helper utilities for SHA claims workflows.
"""

from __future__ import annotations

import contextlib
import logging
import uuid
from collections.abc import Mapping
from datetime import date
from importlib import import_module

import requests
from django.conf import settings
from django.core.exceptions import ValidationError
from django.utils import timezone

from hmis.apps.billing.facility_identifiers import resolve_fr_code
from hmis.apps.billing.models import SHAClaim, SHAClaimItem
from hmis.apps.billing.services.sha_auth import SHAAuthError, SHAAuthService
from hmis.apps.billing.services.sha_eligibility import SHAEligibilityService
from hmis.apps.billing.services.sha_flow_router import determine_flow
from hmis.apps.core.models import AuditLog
from hmis.apps.core.sync import ConnectivityChecker, SyncManager

logger = logging.getLogger(__name__)

__all__ = [
    "AuditLog",
    "ConnectivityChecker",
    "contextlib",
    "Mapping",
    "SHAAuthError",
    "SHAAuthService",
    "SHAClaim",
    "SHAClaimItem",
    "SHAEligibilityService",
    "SyncManager",
    "ValidationError",
    "date",
    "determine_flow",
    "legacy_sha_claims_module",
    "logger",
    "requests",
    "resolve_fr_code",
    "settings",
    "timezone",
    "uuid",
]


def legacy_sha_claims_module():
    """Return the compatibility shim module for patch-friendly dependency access."""
    return import_module("hmis.apps.billing.services.sha_claims")
