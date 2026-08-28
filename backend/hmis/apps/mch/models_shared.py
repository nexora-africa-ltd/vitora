# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
# ruff: noqa
"""Mch models shared for Vitora HMIS.

What this file is for:
- Implement models shared logic for the mch domain.

How to use it:
- Import classes and functions from this module in Django app code and tests.

Supported inputs/args:
- Python imports and Django ORM/runtime inputs; no standalone CLI arguments.
"""

from datetime import date, datetime, timedelta
from decimal import Decimal

from django.apps import apps
from django.conf import settings
from django.core.exceptions import ValidationError
from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import models
from django.utils import timezone
from simple_history.models import HistoricalRecords

from hmis.apps.core.history import HistoryMixin
from hmis.apps.core.mixins import FacilityScopedModel
from hmis.apps.core.models import TimeStampedModel
from hmis.apps.core.upload_validators import validate_image_upload as _validate_image_upload


def generate_mch_number():
    """
    Generate a unique MCH Registration Number.

    Format: MCH-YYYYMMDD-XXXX

    Returns:
        str: A unique MCH registration number string
    """
    today = datetime.now().strftime("%Y%m%d")
    prefix = f"MCH-{today}-"

    MCHRegistration = apps.get_model("mch", "MCHRegistration")

    latest = (
        MCHRegistration.objects.filter(mch_number__startswith=prefix)
        .order_by("-mch_number")
        .first()
    )

    if latest:
        last_seq = int(latest.mch_number.split("-")[-1])
        sequence = last_seq + 1
    else:
        sequence = 1

    return f"{prefix}{sequence:04d}"


def generate_hei_number():
    """
    Generate a unique HEI Follow-Up Number.

    Format: HEI-YYYYMMDD-XXXX

    Returns:
        str: A unique HEI follow-up number string
    """
    today = datetime.now().strftime("%Y%m%d")
    prefix = f"HEI-{today}-"

    HEIFollowUp = apps.get_model("mch", "HEIFollowUp")

    latest = (
        HEIFollowUp.objects.filter(hei_number__startswith=prefix).order_by("-hei_number").first()
    )

    if latest:
        last_seq = int(latest.hei_number.split("-")[-1])
        sequence = last_seq + 1
    else:
        sequence = 1

    return f"{prefix}{sequence:04d}"


# =============================================================================
# MCH Registration Model
# =============================================================================
