# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
# ruff: noqa
"""Laboratory models instruments reports for Vitora HMIS.

What this file is for:
- Implement models instruments reports logic for the laboratory domain.

How to use it:
- Import classes and functions from this module in Django app code and tests.

Supported inputs/args:
- Python imports and Django ORM/runtime inputs; no standalone CLI arguments.
"""

import logging
from datetime import datetime

from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError
from django.db import models
from django.utils import timezone

from hmis.apps.core.mixins import FacilityScopedModel

logger = logging.getLogger(__name__)

User = get_user_model()


from hmis.apps.laboratory.models_orders_results import *  # noqa: F403
from hmis.apps.laboratory.models_queue_templates import *  # noqa: F403


class Instrument(FacilityScopedModel):
    """
    Laboratory analyzer/instrument registry.

    Tracks laboratory equipment that can produce test results, supporting
    various integration protocols (HL7 MLLP, ASTM, FHIR, or manual entry).

    This enables:
    - Audit trail: "Which machine produced this result?"
    - Error recovery: Re-parse raw messages if needed
    - Analytics: Machine performance, QC tracking
    """

    class InterfaceType(models.TextChoices):
        HL7_MLLP = "HL7_MLLP", "HL7 v2 over MLLP"
        ASTM = "ASTM", "ASTM/LIS2-A2"
        FHIR = "FHIR", "FHIR R4"
        MANUAL = "MANUAL", "Manual Entry"

    # Identity
    code = models.CharField(
        max_length=50,
        unique=True,
        db_index=True,
        help_text="Unique instrument identifier code",
    )
    name = models.CharField(max_length=200, help_text="Full instrument name")
    manufacturer = models.CharField(max_length=100, blank=True, help_text="Equipment manufacturer")
    model = models.CharField(max_length=100, blank=True, help_text="Model number/name")
    serial_number = models.CharField(max_length=100, blank=True, help_text="Serial number")
    department = models.CharField(
        max_length=50,
        blank=True,
        help_text="Lab department (e.g., Hematology, Chemistry)",
    )

    # Status
    is_active = models.BooleanField(default=True, help_text="Whether instrument is operational")

    # Integration configuration
    interface_type = models.CharField(
        max_length=20,
        choices=InterfaceType.choices,
        default=InterfaceType.MANUAL,
        help_text="Communication protocol type",
    )
    integration_config = models.JSONField(
        default=dict,
        blank=True,
        help_text="Integration settings: host, port, encoding, etc.",
    )

    # Audit
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "Instrument"
        verbose_name_plural = "Instruments"
        ordering = ["department", "name"]
        indexes = [
            models.Index(fields=["code"]),
            models.Index(fields=["is_active"]),
        ]

    def __str__(self):
        return f"{self.code} - {self.name}"


class AnalyzerRun(models.Model):
    """
    Raw data from analyzer for a specimen.

    Stores the original instrument message and parsed payload for audit,
    error recovery, and analytics purposes.

    Status flow: RECEIVED -> PARSED -> APPLIED (or ERROR at any point)
    """

    class Status(models.TextChoices):
        RECEIVED = "RECEIVED", "Message Received"
        PARSED = "PARSED", "Parsed Successfully"
        APPLIED = "APPLIED", "Results Applied"
        ERROR = "ERROR", "Parse Error"

    # Relationships
    specimen = models.ForeignKey(
        Specimen,
        on_delete=models.CASCADE,
        related_name="analyzer_runs",
        help_text="Specimen this run is for",
    )
    instrument = models.ForeignKey(
        Instrument,
        on_delete=models.PROTECT,
        related_name="analyzer_runs",
        help_text="Instrument that produced this run",
    )
    operator = models.ForeignKey(
        User,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="analyzer_runs_operated",
        help_text="Lab technician operating the instrument (null for automated runs)",
    )

    # Timing
    run_datetime = models.DateTimeField(help_text="When the analyzer run occurred")

    # Raw data
    raw_message = models.TextField(help_text="Raw HL7/ASTM/FHIR message from instrument")
    raw_payload = models.JSONField(
        default=dict,
        blank=True,
        help_text="Parsed message data in structured format",
    )

    # Status
    status = models.CharField(
        max_length=20,
        choices=Status.choices,
        default=Status.RECEIVED,
        help_text="Processing status of this run",
    )
    error_message = models.TextField(blank=True, help_text="Error details if parsing failed")

    # Audit
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = "Analyzer Run"
        verbose_name_plural = "Analyzer Runs"
        ordering = ["-run_datetime"]
        indexes = [
            models.Index(fields=["status"]),
            models.Index(fields=["run_datetime"]),
            models.Index(fields=["instrument", "status"]),
        ]

    def __str__(self):
        return f"{self.instrument.code} - {self.specimen.barcode} ({self.status})"

    def mark_error(self, error_message: str) -> None:
        """Mark this run as failed with an error message."""
        self.status = self.Status.ERROR
        self.error_message = error_message
        self.save(update_fields=["status", "error_message"])

    def mark_parsed(self, payload: dict) -> None:
        """Mark this run as successfully parsed with extracted data."""
        self.status = self.Status.PARSED
        self.raw_payload = payload
        self.save(update_fields=["status", "raw_payload"])

    def mark_applied(self) -> None:
        """Mark this run as applied (results created from this run)."""
        self.status = self.Status.APPLIED
        self.save(update_fields=["status"])


# ============================================================================
# Phase L4 — Diagnostic Report Output
# ============================================================================


def generate_report_number():
    """
    Generate a unique diagnostic report number.

    Format: RPT-YYYYMMDD-XXXX
    Where XXXX is a 4-digit sequential number for the day.

    Returns:
        str: A unique report number string
    """
    today = datetime.now().strftime("%Y%m%d")
    prefix = f"RPT-{today}-"

    # Find the highest report number for today
    latest_report = (
        DiagnosticReport.objects.filter(report_number__startswith=prefix)
        .order_by("-report_number")
        .first()
    )

    if latest_report:
        # Extract the sequence number and increment
        last_sequence = int(latest_report.report_number.split("-")[-1])
        sequence = last_sequence + 1
    else:
        # First report of the day
        sequence = 1

    return f"{prefix}{sequence:04d}"


class DiagnosticReport(models.Model):
    """
    Final patient-facing lab report (Phase L4).

    Represents a formal diagnostic report that can be issued to patients,
    with support for PDF generation, status workflow (draft → final → amended),
    and FHIR mapping capability.
    """

    class Status(models.TextChoices):
        DRAFT = "DRAFT", "Draft"
        PRELIMINARY = "PRELIMINARY", "Preliminary"
        FINAL = "FINAL", "Final"
        AMENDED = "AMENDED", "Amended"
        CANCELLED = "CANCELLED", "Cancelled"

    # Identity
    report_number = models.CharField(max_length=30, unique=True, editable=False)

    # Relationships
    lab_order = models.ForeignKey(
        LabOrder,
        on_delete=models.CASCADE,
        related_name="reports",
        help_text="Lab order this report is for",
    )
    supersedes = models.ForeignKey(
        "self",
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="superseding_reports",
        help_text="Earlier report superseded by this report revision",
    )

    # Status
    status = models.CharField(
        max_length=20,
        choices=Status.choices,
        default=Status.DRAFT,
        help_text="Report workflow status",
    )

    # Sign-off
    issued_by = models.ForeignKey(
        User,
        on_delete=models.PROTECT,
        related_name="issued_reports",
        help_text="User who issued the report",
    )
    issued_at = models.DateTimeField(
        null=True,
        blank=True,
        help_text="When the report was finalized",
    )

    # Content (optional: can generate from results)
    conclusion = models.TextField(
        blank=True,
        help_text="Summary/conclusion of the report",
    )
    clinical_info = models.TextField(
        blank=True,
        help_text="Clinical information/context provided with order",
    )

    # Amendment tracking
    amended_by = models.ForeignKey(
        User,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="amended_reports",
        help_text="User who last amended the report",
    )
    amended_at = models.DateTimeField(
        null=True,
        blank=True,
        help_text="When the report was last amended",
    )

    # Cancellation tracking
    cancellation_reason = models.TextField(
        blank=True,
        help_text="Reason for cancellation",
    )

    # Output
    pdf_file = models.FileField(
        upload_to="lab_reports/%Y/%m/",
        null=True,
        blank=True,
        help_text="Generated PDF report file",
    )

    # FHIR
    fhir_resource_id = models.CharField(
        max_length=100,
        blank=True,
        help_text="FHIR DiagnosticReport resource ID",
    )

    # Audit
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "Diagnostic Report"
        verbose_name_plural = "Diagnostic Reports"
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["report_number"]),
            models.Index(fields=["status"]),
            models.Index(fields=["lab_order"]),
            models.Index(fields=["supersedes"]),
            models.Index(fields=["issued_at"]),
        ]

    def __str__(self):
        return f"{self.report_number} - {self.lab_order.order_number}"

    def save(self, *args, **kwargs):
        """Override save to auto-generate report number."""
        if not self.report_number:
            self.report_number = generate_report_number()
        super().save(*args, **kwargs)

    @property
    def is_finalized(self) -> bool:
        """Check if report is finalized (FINAL or AMENDED)."""
        return self.status in [self.Status.FINAL, self.Status.AMENDED]

    def finalize(self) -> None:
        """
        Finalize the report, setting status to FINAL and issued_at timestamp.

        Raises:
            ValidationError: If report is already finalized.
        """
        if self.status == self.Status.FINAL:
            raise ValidationError("Report is already final.")
        if self.status == self.Status.CANCELLED:
            raise ValidationError("Cannot finalize a cancelled report.")
        if self.lab_order.status != "COMPLETED":
            raise ValidationError(
                "Cannot finalize report before the related lab order is completed."
            )

        self.status = self.Status.FINAL
        self.issued_at = timezone.now()
        self.save(update_fields=["status", "issued_at"])

    def amend(self, new_conclusion: str, amended_by: User) -> None:
        """
        Amend a finalized report with a new conclusion.

        Args:
            new_conclusion: Updated conclusion text
            amended_by: User making the amendment

        Raises:
            ValidationError: If report is not finalized.
        """
        if self.status not in [self.Status.FINAL, self.Status.AMENDED]:
            raise ValidationError(
                "Only finalized (FINAL or AMENDED) reports can be amended. "
                "Draft reports should be updated directly."
            )

        self.status = self.Status.AMENDED
        self.conclusion = new_conclusion
        self.amended_by = amended_by
        self.amended_at = timezone.now()
        self.save(update_fields=["status", "conclusion", "amended_by", "amended_at"])

    def cancel(self, reason: str) -> None:
        """
        Cancel the report with a reason.

        Args:
            reason: Reason for cancellation

        Raises:
            ValidationError: If report is already cancelled.
        """
        if self.status == self.Status.CANCELLED:
            raise ValidationError("Report is already cancelled.")

        self.status = self.Status.CANCELLED
        self.cancellation_reason = reason
        self.save(update_fields=["status", "cancellation_reason"])


# =============================================================================
# Lab Settings Models
# =============================================================================
