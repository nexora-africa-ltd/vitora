# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
# ruff: noqa: E402
"""Laboratory models reference settings for Vitora HMIS.

What this file is for:
- Implement models reference settings logic for the laboratory domain.

How to use it:
- Import classes and functions from this module in Django app code and tests.

Supported inputs/args:
- Python imports and Django ORM/runtime inputs; no standalone CLI arguments.
"""

import logging
from datetime import datetime

from django.contrib.auth import get_user_model
from django.db import models

from hmis.apps.core.mixins import FacilityScopedModel
from hmis.apps.core.pii import encrypted_pii_property

logger = logging.getLogger(__name__)

User = get_user_model()


from hmis.apps.laboratory.models_instruments_reports import *  # noqa: F403
from hmis.apps.laboratory.models_orders_results import *  # noqa: F403
from hmis.apps.laboratory.models_queue_templates import *  # noqa: F403


class SpecimenRejectionReason(FacilityScopedModel):
    """Predefined reasons for specimen rejection."""

    code = models.CharField(max_length=30, db_index=True)
    name = models.CharField(max_length=100)
    description = models.TextField(blank=True)
    requires_recollection = models.BooleanField(
        default=True, help_text="Whether this rejection reason requires a new specimen"
    )
    is_active = models.BooleanField(default=True)
    display_order = models.PositiveIntegerField(default=0)

    class Meta:
        verbose_name = "Specimen Rejection Reason"
        verbose_name_plural = "Specimen Rejection Reasons"
        ordering = ["display_order", "name"]
        constraints = [
            models.UniqueConstraint(
                fields=["facility", "code"], name="unique_rejection_reason_per_facility"
            ),
        ]

    def __str__(self):
        return self.name


class ResultCommentTemplate(FacilityScopedModel):
    """Pre-canned interpretive comments for lab results."""

    class Category(models.TextChoices):
        GENERAL = "GENERAL", "General"
        CRITICAL = "CRITICAL", "Critical Value"
        FOLLOW_UP = "FOLLOW_UP", "Follow-up"
        METHODOLOGY = "METHODOLOGY", "Methodology Note"
        QUALITY = "QUALITY", "Quality Note"

    code = models.CharField(max_length=30, db_index=True)
    name = models.CharField(max_length=100)
    text = models.TextField(help_text="The comment text to insert into results")
    category = models.CharField(max_length=20, choices=Category.choices, default=Category.GENERAL)
    applicable_tests = models.ManyToManyField(
        "laboratory.TestCatalog",
        blank=True,
        related_name="comment_templates",
        help_text="Limit to specific tests; blank = available for all",
    )
    is_active = models.BooleanField(default=True)
    display_order = models.PositiveIntegerField(default=0)

    class Meta:
        verbose_name = "Result Comment Template"
        verbose_name_plural = "Result Comment Templates"
        ordering = ["category", "display_order", "name"]
        constraints = [
            models.UniqueConstraint(
                fields=["facility", "code"], name="unique_comment_template_per_facility"
            ),
        ]

    def __str__(self):
        return f"[{self.get_category_display()}] {self.name}"


class ReferralLab(FacilityScopedModel):
    """External/outsourced laboratories for send-out tests."""

    code = models.CharField(max_length=30, db_index=True)
    name = models.CharField(max_length=200)
    address_encrypted = models.TextField(default="", blank=True)
    address = encrypted_pii_property("address")
    contact_person = models.CharField(max_length=100, blank=True)
    phone_encrypted = models.TextField(default="", blank=True)
    phone = encrypted_pii_property("phone")
    email_encrypted = models.TextField(default="", blank=True)
    email = encrypted_pii_property("email")
    website = models.URLField(blank=True)
    tests_offered = models.TextField(
        blank=True, help_text="Comma-separated test codes or description"
    )
    default_tat_days = models.PositiveIntegerField(
        default=7, help_text="Expected turnaround time in days"
    )
    courier_schedule = models.CharField(
        max_length=200, blank=True, help_text="e.g. 'Mon/Wed/Fri 8am pickup'"
    )
    notes = models.TextField(blank=True)
    is_active = models.BooleanField(default=True)

    class Meta:
        verbose_name = "Referral Lab"
        verbose_name_plural = "Referral Labs"
        ordering = ["name"]
        constraints = [
            models.UniqueConstraint(
                fields=["facility", "code"], name="unique_referral_lab_per_facility"
            ),
        ]

    def __str__(self):
        return self.name


class LabBarcodeConfig(FacilityScopedModel):
    """Facility-level barcode generation configuration."""

    class BarcodeFormat(models.TextChoices):
        CODE128 = "CODE128", "Code 128"
        CODE39 = "CODE39", "Code 39"
        QR = "QR", "QR Code"

    prefix = models.CharField(
        max_length=10, default="SP", help_text="Prefix for generated barcodes"
    )
    sequence_length = models.PositiveIntegerField(
        default=6, help_text="Number of digits in sequence portion (e.g. 6 → SP-000001)"
    )
    include_date = models.BooleanField(
        default=True, help_text="Include date segment (e.g. SP-20260506-000001)"
    )
    date_format = models.CharField(
        max_length=20, default="YYYYMMDD", help_text="Date format in barcode (YYYYMMDD or YYMMDD)"
    )
    separator = models.CharField(max_length=1, default="-", help_text="Separator character")
    barcode_format = models.CharField(
        max_length=10, choices=BarcodeFormat.choices, default=BarcodeFormat.CODE128
    )
    current_sequence = models.PositiveIntegerField(
        default=0, help_text="Current sequence counter (auto-incremented)"
    )

    class Meta:
        verbose_name = "Lab Barcode Configuration"
        verbose_name_plural = "Lab Barcode Configurations"
        constraints = [
            models.UniqueConstraint(fields=["facility"], name="one_barcode_config_per_facility"),
        ]

    def __str__(self):
        return f"Barcode Config ({self.prefix})"

    def generate_next_barcode(self) -> str:
        """Generate the next barcode and increment counter."""
        self.current_sequence += 1
        seq = str(self.current_sequence).zfill(self.sequence_length)
        parts = [self.prefix]
        if self.include_date:
            today = datetime.now()
            if self.date_format == "YYMMDD":
                parts.append(today.strftime("%y%m%d"))
            else:
                parts.append(today.strftime("%Y%m%d"))
        parts.append(seq)
        barcode = self.separator.join(parts)
        self.save(update_fields=["current_sequence"])
        return barcode


class LabWorkflowSettings(FacilityScopedModel):
    """Facility-level lab workflow preferences."""

    # Result release
    auto_release_normal_results = models.BooleanField(
        default=False, help_text="Automatically release results within normal range"
    )
    require_double_verification_critical = models.BooleanField(
        default=True, help_text="Require two verifiers for critical results"
    )

    # Printing
    auto_print_on_verify = models.BooleanField(
        default=False, help_text="Automatically print report when result is verified"
    )
    auto_print_labels_on_collect = models.BooleanField(
        default=True, help_text="Print specimen labels when sample is collected"
    )

    # Notifications
    notify_clinician_on_critical = models.BooleanField(
        default=True, help_text="Send alert to ordering clinician for critical results"
    )
    notify_clinician_on_complete = models.BooleanField(
        default=False, help_text="Notify ordering clinician when all results are ready"
    )

    # Specimen
    require_specimen_receipt = models.BooleanField(
        default=True, help_text="Require explicit specimen receipt before processing"
    )
    specimen_rejection_requires_supervisor = models.BooleanField(
        default=False, help_text="Require supervisor approval to reject specimens"
    )

    # TAT
    tat_warning_threshold_percent = models.PositiveIntegerField(
        default=75, help_text="Show TAT warning when this % of target elapsed"
    )

    # Ordering
    allow_duplicate_orders = models.BooleanField(
        default=False, help_text="Allow duplicate test orders for same patient within 24h"
    )
    require_clinical_notes = models.BooleanField(
        default=False, help_text="Make clinical notes mandatory on lab orders"
    )

    class Meta:
        verbose_name = "Lab Workflow Settings"
        verbose_name_plural = "Lab Workflow Settings"
        constraints = [
            models.UniqueConstraint(fields=["facility"], name="one_workflow_settings_per_facility"),
        ]

    def __str__(self):
        return f"Workflow Settings (Facility #{self.facility_id})"
