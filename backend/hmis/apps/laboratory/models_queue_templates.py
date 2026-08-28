# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
# ruff: noqa: DJ012, E402, F405
"""Laboratory models queue templates for Vitora HMIS.

What this file is for:
- Implement models queue templates logic for the laboratory domain.

How to use it:
- Import classes and functions from this module in Django app code and tests.

Supported inputs/args:
- Python imports and Django ORM/runtime inputs; no standalone CLI arguments.
"""

import logging
from datetime import datetime

from django.contrib.auth import get_user_model
from django.db import models
from django.utils import timezone

logger = logging.getLogger(__name__)

User = get_user_model()


def generate_queue_number():
    """
    Generate a unique laboratory queue number.

    Format: LAB-YYYYMMDD-XXXX
    Where XXXX is a 4-digit sequential number for the day.

    Returns:
        str: A unique lab queue number string
    """
    today = datetime.now().strftime("%Y%m%d")
    prefix = f"LAB-{today}-"

    # Import here to avoid circular imports
    from hmis.apps.laboratory.models import LabQueue

    # Find the highest queue number for today
    latest_queue = (
        LabQueue.objects.filter(queue_number__startswith=prefix).order_by("-queue_number").first()
    )

    if latest_queue:
        # Extract the sequence number and increment
        last_sequence = int(latest_queue.queue_number.split("-")[-1])
        sequence = last_sequence + 1
    else:
        # First queue entry of the day
        sequence = 1

    return f"{prefix}{sequence:04d}"


from hmis.apps.laboratory.models_orders_results import *  # noqa: F403


class LabQueue(models.Model):
    """Lab queue entry for in-house processing."""

    class Priority(models.TextChoices):
        ROUTINE = "ROUTINE", "Routine"
        URGENT = "URGENT", "Urgent"
        STAT = "STAT", "STAT (Emergency)"

    class QueueStatus(models.TextChoices):
        PENDING = "PENDING", "Pending Collection"
        COLLECTED = "COLLECTED", "Sample Collected"
        PROCESSING = "PROCESSING", "Processing"
        REVIEW = "REVIEW", "Pending Review"
        RELEASED = "RELEASED", "Results Released"

    # Priority order mapping for sorting
    PRIORITY_ORDER = {
        "STAT": 1,
        "URGENT": 2,
        "ROUTINE": 3,
    }

    id = models.BigAutoField(primary_key=True)

    # Linkage
    lab_order = models.OneToOneField(LabOrder, on_delete=models.CASCADE, related_name="queue_entry")
    specimen = models.OneToOneField(
        Specimen,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="queue_entry",
    )

    # Queue management
    queue_number = models.CharField(max_length=20, unique=True, editable=False)
    priority = models.CharField(max_length=20, choices=Priority.choices, default=Priority.ROUTINE)
    priority_order = models.IntegerField(default=3, editable=False)
    queue_status = models.CharField(
        max_length=20, choices=QueueStatus.choices, default=QueueStatus.PENDING
    )

    # Assignment
    assigned_technician = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="assigned_lab_orders",
    )

    # Sample tracking
    sample_type = models.CharField(max_length=50)
    sample_id = models.CharField(max_length=50, blank=True)
    collected_at = models.DateTimeField(null=True, blank=True)
    collected_by = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="samples_collected",
    )

    # Processing
    processing_started_at = models.DateTimeField(null=True, blank=True)
    processing_completed_at = models.DateTimeField(null=True, blank=True)

    # Review/Release
    reviewed_by = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="lab_results_reviewed",
    )
    reviewed_at = models.DateTimeField(null=True, blank=True)
    released_at = models.DateTimeField(null=True, blank=True)

    # Notes
    technician_notes = models.TextField(blank=True)
    rejection_reason = models.TextField(blank=True)

    # Audit
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "Lab Queue"
        verbose_name_plural = "Lab Queue"
        ordering = ["priority_order", "created_at"]
        indexes = [
            models.Index(fields=["queue_number"]),
            models.Index(fields=["queue_status", "priority_order"]),
            models.Index(fields=["assigned_technician", "queue_status"]),
        ]

    def __str__(self):
        return f"{self.queue_number} - {self.lab_order.patient}"

    def save(self, *args, **kwargs):
        """Override save to auto-generate queue number and set priority order."""
        if not self.queue_number:
            self.queue_number = generate_queue_number()

        # Set priority_order for sorting
        self.priority_order = self.PRIORITY_ORDER.get(self.priority, 3)

        super().save(*args, **kwargs)

    def assign_to(self, technician):
        """
        Assign queue entry to a lab technician.

        Args:
            technician: User to assign the queue entry to
        """
        self.assigned_technician = technician
        self.save(update_fields=["assigned_technician"])

    def _ensure_specimen(self) -> Specimen:
        if self.specimen_id:
            return self.specimen

        first_item = self.lab_order.items.first()
        specimen_type = self.sample_type or (
            first_item.test.specimen_type if first_item else "BLOOD"
        )
        barcode = self.sample_id or self.queue_number

        status_map = {
            self.QueueStatus.PENDING: "PENDING",
            self.QueueStatus.COLLECTED: "COLLECTED",
            self.QueueStatus.PROCESSING: "PROCESSING",
            self.QueueStatus.REVIEW: "PROCESSING",
            self.QueueStatus.RELEASED: "PROCESSING",
        }

        specimen = Specimen.objects.create(
            barcode=barcode,
            specimen_type=specimen_type,
            lab_order=self.lab_order,
            collected_by=self.collected_by,
            collected_at=self.collected_at,
            status=status_map.get(self.queue_status, "PENDING"),
        )
        specimen.order_items.add(*self.lab_order.items.all())
        self.specimen = specimen
        self.save(update_fields=["specimen"])
        return specimen

    def collect_sample(self, collector, sample_id="", barcode: str | None = None):
        """
        Record sample collection.

        Args:
            collector: User who collected the sample
            sample_id: Barcode or tube ID
        """
        resolved_barcode = barcode if barcode is not None else sample_id
        self.sample_id = resolved_barcode
        self.collected_by = collector
        self.collected_at = timezone.now()
        self.queue_status = self.QueueStatus.COLLECTED
        self.save(update_fields=["sample_id", "collected_by", "collected_at", "queue_status"])

        specimen = self._ensure_specimen()
        if resolved_barcode and specimen.barcode != resolved_barcode:
            specimen.barcode = resolved_barcode
        specimen.collected_by = collector
        specimen.collected_at = self.collected_at
        specimen.status = "COLLECTED"
        specimen.save(update_fields=["barcode", "collected_by", "collected_at", "status"])

    def start_processing(self):
        """Mark queue entry as processing."""
        self.queue_status = self.QueueStatus.PROCESSING
        self.processing_started_at = timezone.now()
        self.save(update_fields=["queue_status", "processing_started_at"])

        specimen = self._ensure_specimen()
        if specimen.status != "PROCESSING":
            specimen.status = "PROCESSING"
            specimen.save(update_fields=["status"])

    def submit_for_review(self):
        """Submit results for review."""
        self.queue_status = self.QueueStatus.REVIEW
        self.processing_completed_at = timezone.now()
        self.save(update_fields=["queue_status", "processing_completed_at"])

        specimen = self._ensure_specimen()
        if specimen.status != "PROCESSING":
            specimen.status = "PROCESSING"
            specimen.save(update_fields=["status"])

    def release_results(self, reviewer):
        """
        Approve and release results.

        Args:
            reviewer: User reviewing and releasing results
        """
        self.queue_status = self.QueueStatus.RELEASED
        self.reviewed_by = reviewer
        self.reviewed_at = timezone.now()
        self.released_at = timezone.now()
        self.save(update_fields=["queue_status", "reviewed_by", "reviewed_at", "released_at"])

    def reject_sample(self, reason):
        """
        Reject sample with reason.

        Args:
            reason: Rejection reason
        """
        self.rejection_reason = reason
        self.save(update_fields=["rejection_reason"])

        specimen = self._ensure_specimen()
        specimen.status = "REJECTED"
        specimen.rejection_reason = reason
        specimen.save(update_fields=["status", "rejection_reason"])

    def get_turnaround_time(self):
        """
        Calculate TAT from order to release.

        Returns:
            timedelta or None: Time taken from creation to release
        """
        if self.released_at:
            return self.released_at - self.created_at
        return None


class LabResultTemplate(models.Model):
    """Template for lab test parameters with reference ranges."""

    id = models.BigAutoField(primary_key=True)

    # Test identification
    test_code = models.CharField(max_length=20, help_text="LOINC or internal test code")
    test_name = models.CharField(max_length=200)

    # Parameter details
    parameter_code = models.CharField(max_length=20, help_text="LOINC component code")
    parameter_name = models.CharField(max_length=100)
    unit = models.CharField(max_length=50)

    # Result LOINC code — the specific LOINC for this observation/result parameter
    # e.g. a CBC order (58410-2) has result parameters: Hemoglobin (718-7), WBC (6690-2), etc.
    result_loinc_code = models.CharField(
        max_length=20,
        blank=True,
        default="",
        help_text="LOINC code for this specific result observation (e.g. 718-7 for Hemoglobin)",
    )

    # Reference ranges by demographic
    # Stored as JSON for flexibility
    reference_ranges = models.JSONField(
        default=dict,
        help_text="Reference ranges by demographics: adult_male, adult_female, pediatric, default",
    )
    # Example: {
    #   "adult_male": {"low": 4.5, "high": 5.5},
    #   "adult_female": {"low": 4.0, "high": 5.0},
    #   "pediatric": {"low": 3.5, "high": 5.0},
    #   "default": {"low": 4.0, "high": 5.5}
    # }

    # Critical values
    critical_low = models.DecimalField(
        max_digits=12, decimal_places=4, null=True, blank=True, help_text="Critical low threshold"
    )
    critical_high = models.DecimalField(
        max_digits=12, decimal_places=4, null=True, blank=True, help_text="Critical high threshold"
    )

    # Display
    display_order = models.IntegerField(default=0, help_text="Order in which to display parameter")
    is_active = models.BooleanField(default=True)

    class Meta:
        verbose_name = "Lab Result Template"
        verbose_name_plural = "Lab Result Templates"
        ordering = ["test_code", "display_order"]
        unique_together = ["test_code", "parameter_code"]
        indexes = [
            models.Index(fields=["test_code"]),
            models.Index(fields=["parameter_code"]),
        ]

    def __str__(self):
        return f"{self.test_code} - {self.parameter_name}"

    def get_reference_range(self, patient):
        """
        Get appropriate reference range for patient demographics.

        Args:
            patient: Patient instance

        Returns:
            tuple: (low, high) reference range values, or (None, None) if not found
        """
        from hmis.apps.patients.models import Patient

        if not isinstance(patient, Patient):
            return (None, None)

        # Determine category based on age and gender
        age = patient.age if hasattr(patient, "age") else None

        # Check age first (pediatric takes precedence)
        if age is not None and age < 18:
            category = "pediatric"
        elif patient.gender == "M":
            category = "adult_male"
        elif patient.gender == "F":
            category = "adult_female"
        else:
            category = "default"

        # Try to get the range for the determined category
        range_data = self.reference_ranges.get(category)

        # Fallback to default if category not found
        if not range_data:
            range_data = self.reference_ranges.get("default")

        # Return the range values or (None, None)
        if range_data:
            return (range_data.get("low"), range_data.get("high"))

        return (None, None)


# ============================================================================
# Lab Result Attachments (Sprint 1.5-1.6 Track B Phase 1.4)
# ============================================================================


class LabResultAttachment(models.Model):
    """
    Scanned or uploaded lab result document.

    Supports external lab results, scanned reports, images, and graphs.
    Files are validated for type (PDF, PNG, JPG, TIFF) and size (<10MB).
    """

    class AttachmentType(models.TextChoices):
        SCANNED_RESULT = "scanned", "Scanned Result"
        EXTERNAL_REPORT = "external", "External Lab Report"
        GRAPH = "graph", "Result Graph"
        IMAGE = "image", "Lab Image"
        OTHER = "other", "Other"

    id = models.BigAutoField(primary_key=True)

    # Linkage
    lab_order = models.ForeignKey(
        "LabOrder",
        on_delete=models.CASCADE,
        related_name="attachments",
        help_text="Lab order this attachment belongs to",
    )

    # File
    file = models.FileField(
        upload_to="lab_results/%Y/%m/", help_text="Uploaded file (PDF, PNG, JPG, TIFF)"
    )
    filename = models.CharField(max_length=255, help_text="Original filename")
    file_type = models.CharField(max_length=50, help_text="MIME type of the file")
    file_size = models.IntegerField(help_text="File size in bytes")

    # Metadata
    attachment_type = models.CharField(
        max_length=20, choices=AttachmentType.choices, help_text="Type of attachment"
    )
    description = models.CharField(max_length=255, blank=True, help_text="Optional description")

    # Audit
    uploaded_by = models.ForeignKey(
        User, on_delete=models.PROTECT, help_text="User who uploaded the file"
    )
    uploaded_at = models.DateTimeField(auto_now_add=True, help_text="When file was uploaded")

    class Meta:
        ordering = ["-uploaded_at"]
        verbose_name = "Lab Result Attachment"
        verbose_name_plural = "Lab Result Attachments"

    def save(self, *args, **kwargs):
        """Auto-populate file metadata on save."""
        if self.file:
            self.filename = self.file.name
            self.file_type = self._get_mime_type()
            self.file_size = self.file.size
        super().save(*args, **kwargs)

    def _get_mime_type(self) -> str:
        """
        Determine MIME type from file.

        Returns:
            str: MIME type (e.g., 'application/pdf', 'image/png')
        """
        import mimetypes

        mime_type, _ = mimetypes.guess_type(self.file.name)
        return mime_type or "application/octet-stream"

    def __str__(self):
        return f"{self.attachment_type}: {self.filename} for Order {self.lab_order.order_number}"


# ============================================================================
# Phase L3 — Analyzer Integration Support
# ============================================================================
