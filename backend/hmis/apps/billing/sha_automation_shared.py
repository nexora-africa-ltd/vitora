# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""Billing sha automation shared for Vitora HMIS.

What this file is for:
- Implement sha automation shared logic for the billing domain.

How to use it:
- Import classes and functions from this module in Django app code and tests.

Supported inputs/args:
- Python imports and Django ORM/runtime inputs; no standalone CLI arguments.
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

__all__ = [
    "DatabaseError",
    "Decimal",
    "FieldError",
    "Q",
    "Sum",
    "append_standard_header",
    "date",
    "logger",
    "timedelta",
    "timezone",
    "_resolve_fr_code",
    "_sha_automation_handled_exceptions",
]


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
