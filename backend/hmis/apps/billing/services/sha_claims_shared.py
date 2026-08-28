# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
# ruff: noqa
"""
What this file is for: shared imports and globals for split SHA claims service modules.
How to use: imported by split SHA claims mixin modules and compatibility shim.
Supported inputs/args: service dependencies, model imports, and logger configuration.
"""

# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""
SHA Claims Service for Vitora HMIS.

This module handles SHA (Social Health Authority) claims creation,
validation, packaging (FHIR format), and submission.

Reference: docs/sha-claims-bundle-validation-report.md
Official FHIR Bundle Spec: docs/sha-guides/claims.md
Official Endpoints:
    - Submit: POST /v1/shr-med/bundle
    - Status: GET /v1/shr-med/claim-status?claim_id={claim_id}

FHIR Bundle Requirements (SHA MIS):
    - Bundle type: "message"
    - Required resources: Organization, Patient, Coverage, Claim
    - Diagnosis coding: ICD-11 (not ICD-10)
    - Patient ID: SHA CR Number
    - Coverage: Must include scheme extensions (CAT-SHA-001)
"""

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


def legacy_sha_claims_module():
    """Return the compatibility shim module for patch-friendly dependency access."""
    return import_module("hmis.apps.billing.services.sha_claims")
