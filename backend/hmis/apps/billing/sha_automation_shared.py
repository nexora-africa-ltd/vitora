# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
# ruff: noqa
"""
What this file is for: shared helpers/constants for SHA automation service modules.
How to use: imported by split SHA automation modules and compatibility shim.
Supported inputs/args: helper functions and logger setup for SHA automation flows.
"""

# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""
SHA Claims Workflow Automation Service for Vitora HMIS.

Implements automated claim lifecycle management:
1. Auto-trigger consent at check-in (queue addition)
2. Auto-start visit on encounter creation for SHA-eligible patients
3. Auto-populate interventions from clinical actions (lab, pharmacy, procedures)
4. Auto-attach digital documents to claims
5. Automated remittance fetch and reconciliation
6. Smart query response workflow (assignment + escalation)
7. Batch validation and bulk submission
8. Eligibility pre-check and caching at registration
9. Auto-submit preauth for routine procedures
10. End-of-day claims digest generation
"""

import logging
from datetime import date, timedelta
from decimal import Decimal

from django.core.exceptions import FieldError
from django.db import DatabaseError
from django.db.models import Q, Sum
from django.utils import timezone

from hmis.apps.billing.facility_identifiers import resolve_fr_code
from hmis.apps.billing.services.document_context import append_standard_header

logger = logging.getLogger(__name__)


def _sha_automation_handled_exceptions() -> tuple[type[Exception], ...]:
    return (
        DatabaseError,
        FieldError,
        AttributeError,
        LookupError,
        TypeError,
        ValueError,
        RuntimeError,
        ImportError,
        OSError,
        ConnectionError,
    )


def _resolve_fr_code(facility):
    """Resolve the DHA Facility Registry (FR) code for a facility.

    Priority: billing_config.sha_facility_fr_code > facility.dha_fr_code > fallback.
    Returns an empty string if none can be resolved.
    """
    if facility is None:
        return ""
    return resolve_fr_code(facility, allow_settings_fallback=False).value
