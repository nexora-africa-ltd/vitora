# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
# ruff: noqa
"""Mch models hei for Vitora HMIS.

What this file is for:
- Implement models hei logic for the mch domain.

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
from hmis.apps.mch.models_maternal_journey import MCHRegistration
from hmis.apps.mch.models_shared import generate_hei_number


class HEIFollowUp(HistoryMixin, TimeStampedModel):
    """
    HIV-Exposed Infant follow-up tracking.

    Tracks infants born to HIV-positive mothers: ARV prophylaxis,
    PCR testing schedule, and final HIV status determination.
    """

    STATUS_CHOICES = [
        ("ACTIVE", "Active Follow-up"),
        ("CONFIRMED_NEGATIVE", "Confirmed HIV-Negative"),
        ("CONFIRMED_POSITIVE", "Confirmed HIV-Positive"),
        ("LOST_TO_FOLLOW_UP", "Lost to Follow-up"),
        ("TRANSFERRED", "Transferred Out"),
        ("DECEASED", "Deceased"),
    ]

    ART_STATUS_CHOICES = [
        ("ON_ART", "On ART"),
        ("NOT_ON_ART", "Not on ART"),
        ("UNKNOWN", "Unknown"),
    ]

    ARV_PROPHYLAXIS_CHOICES = [
        ("NVP", "Nevirapine (NVP)"),
        ("AZT", "Zidovudine (AZT)"),
        ("NVP_AZT", "NVP + AZT"),
        ("NONE", "None"),
    ]

    BREASTFEEDING_STATUS_CHOICES = [
        ("EXCLUSIVE", "Exclusive Breastfeeding"),
        ("MIXED", "Mixed Feeding"),
        ("FORMULA", "Formula Feeding"),
        ("STOPPED", "Stopped Breastfeeding"),
    ]

    # Auto-generated number
    hei_number = models.CharField(
        max_length=30,
        unique=True,
        editable=False,
        default=generate_hei_number,
        help_text="Auto-generated HEI follow-up number (HEI-YYYYMMDD-XXXX)",
    )

    # Infant
    infant = models.ForeignKey(
        "patients.Patient",
        on_delete=models.PROTECT,
        related_name="hei_followups",
        help_text="Infant patient record",
    )

    # Link to mother's MCH registration
    mch_registration = models.ForeignKey(
        MCHRegistration,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="hei_followups",
        help_text="Mother's MCH registration",
    )

    # Enrollment
    enrollment_date = models.DateField(
        default=date.today,
        help_text="Date of HEI enrollment",
    )
    status = models.CharField(
        max_length=30,
        choices=STATUS_CHOICES,
        default="ACTIVE",
    )

    # Mother's HIV details
    mother_art_status = models.CharField(
        max_length=20,
        choices=ART_STATUS_CHOICES,
        default="UNKNOWN",
        help_text="Mother's ART status",
    )

    # Infant ARV prophylaxis
    infant_arv_prophylaxis = models.CharField(
        max_length=10,
        choices=ARV_PROPHYLAXIS_CHOICES,
        default="NONE",
        help_text="Infant ARV prophylaxis regimen",
    )
    arv_start_date = models.DateField(
        null=True,
        blank=True,
        help_text="Date ARV prophylaxis was started",
    )
    arv_end_date = models.DateField(
        null=True,
        blank=True,
        help_text="Date ARV prophylaxis was stopped",
    )

    # Feeding
    breastfeeding_status = models.CharField(
        max_length=20,
        choices=BREASTFEEDING_STATUS_CHOICES,
        default="EXCLUSIVE",
    )

    # Cotrimoxazole
    cotrimoxazole_prophylaxis = models.BooleanField(
        default=False,
        help_text="Whether infant is on cotrimoxazole prophylaxis",
    )
    cotrimoxazole_start_date = models.DateField(
        null=True,
        blank=True,
    )

    # Sensitive access (always set for HEI records)
    is_sensitive = models.BooleanField(
        default=True,
        help_text="HEI records are always sensitive",
    )

    # Staff
    enrolled_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="hei_enrollments_created",
    )

    # Notes
    notes = models.TextField(
        blank=True,
        default="",
    )

    # Audit trail
    history = HistoricalRecords()

    class Meta:
        ordering = ["-enrollment_date"]
        verbose_name = "HEI Follow-Up"
        verbose_name_plural = "HEI Follow-Ups"
        permissions = [
            ("view_sensitive_hei_followup", "Can view sensitive HEI follow-ups"),
        ]

    def __str__(self):
        return f"{self.hei_number} - {self.infant}"

    def save(self, *args, **kwargs):
        """Ensure HEI records are always sensitive."""
        self.is_sensitive = True
        if not self.hei_number:
            self.hei_number = generate_hei_number()
        super().save(*args, **kwargs)


class HEIPCRTest(TimeStampedModel):
    """
    PCR test record for HIV-exposed infants.

    Standard schedule: #1 at 6 weeks, #2 at 9 months, #3 confirmatory.
    """

    RESULT_CHOICES = [
        ("POSITIVE", "Positive"),
        ("NEGATIVE", "Negative"),
        ("INDETERMINATE", "Indeterminate"),
        ("PENDING", "Pending"),
    ]

    hei_followup = models.ForeignKey(
        HEIFollowUp,
        on_delete=models.PROTECT,
        related_name="pcr_tests",
        help_text="HEI follow-up record",
    )

    # Test details
    test_number = models.PositiveSmallIntegerField(
        validators=[MinValueValidator(1), MaxValueValidator(5)],
        help_text="PCR test number (1=6 weeks, 2=9 months, 3=confirmatory)",
    )
    scheduled_date = models.DateField(
        help_text="Scheduled date for the test",
    )
    actual_date = models.DateField(
        null=True,
        blank=True,
        help_text="Actual date test was performed",
    )
    result = models.CharField(
        max_length=20,
        choices=RESULT_CHOICES,
        default="PENDING",
    )

    # Lab reference
    lab_reference = models.CharField(
        max_length=100,
        blank=True,
        default="",
        help_text="Laboratory reference/order number",
    )

    # Notes
    notes = models.TextField(
        blank=True,
        default="",
    )

    class Meta:
        ordering = ["hei_followup", "test_number"]
        verbose_name = "HEI PCR Test"
        verbose_name_plural = "HEI PCR Tests"
        unique_together = ["hei_followup", "test_number"]

    def __str__(self):
        return (
            f"PCR #{self.test_number} - {self.hei_followup.hei_number} "
            f"({self.get_result_display()})"
        )
