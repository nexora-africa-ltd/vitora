"""
Imaging/Radiology models for Vitora HMIS.

This module defines models for imaging procedure management including procedure catalog,
imaging orders, order items, and future DICOM/report support.

Phase A.1: Backend Models & Catalog
"""

import logging
from datetime import datetime
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError
from django.db import models
from django.utils import timezone

logger = logging.getLogger(__name__)

User = get_user_model()


def generate_imaging_order_number():
    """
    Generate a unique imaging order number.

    Format: RAD-YYYYMMDD-XXXX
    Where XXXX is a 4-digit sequential number for the day.

    Returns:
        str: A unique imaging order number string
    """
    today = datetime.now().strftime("%Y%m%d")
    prefix = f"RAD-{today}-"

    # Find the highest order number for today
    latest_order = (
        ImagingOrder.objects.filter(order_number__startswith=prefix)
        .order_by("-order_number")
        .first()
    )

    if latest_order:
        # Extract the sequence number and increment
        last_sequence = int(latest_order.order_number.split("-")[-1])
        sequence = last_sequence + 1
    else:
        # First order of the day
        sequence = 1

    return f"{prefix}{sequence:04d}"


class ImagingProcedure(models.Model):
    """
    Master catalog of imaging procedures.

    Stores information about available imaging procedures including modality,
    body region, pricing, and SHA claimability.
    """

    MODALITY_CHOICES = [
        ("XR", "X-Ray"),
        ("US", "Ultrasound"),
        ("CT", "Computed Tomography"),
        ("MRI", "Magnetic Resonance Imaging"),
        ("NM", "Nuclear Medicine"),
        ("MG", "Mammography"),
        ("FL", "Fluoroscopy"),
        ("OTHER", "Other"),
    ]

    BODY_REGION_CHOICES = [
        ("HEAD", "Head/Brain"),
        ("NECK", "Neck"),
        ("CHEST", "Chest"),
        ("ABDOMEN", "Abdomen"),
        ("PELVIS", "Pelvis"),
        ("SPINE", "Spine"),
        ("UPPER_EXTREMITY", "Upper Extremity"),
        ("LOWER_EXTREMITY", "Lower Extremity"),
        ("WHOLE_BODY", "Whole Body"),
        ("OTHER", "Other"),
    ]

    # Identity
    code = models.CharField(max_length=50, unique=True, help_text="Unique procedure code")
    name = models.CharField(max_length=200, help_text="Full procedure name")
    modality = models.CharField(max_length=20, choices=MODALITY_CHOICES)
    body_region = models.CharField(max_length=30, choices=BODY_REGION_CHOICES)

    # Interoperability codes
    radlex_code = models.CharField(
        max_length=50, blank=True, help_text="RadLex Playbook ID"
    )
    loinc_code = models.CharField(
        max_length=20, blank=True, help_text="LOINC code for interoperability"
    )

    # Requirements
    requires_contrast = models.BooleanField(default=False)
    requires_sedation = models.BooleanField(default=False)
    special_preparation = models.TextField(
        blank=True, help_text="Patient preparation instructions"
    )
    turnaround_hours = models.IntegerField(
        default=24, help_text="Expected turnaround time in hours"
    )

    # Pricing & SHA
    cost = models.DecimalField(
        max_digits=10, decimal_places=2, default=Decimal("0.00")
    )
    sha_claimable = models.BooleanField(
        default=True, help_text="Covered by Kenya SHA"
    )
    sha_intervention_code = models.CharField(
        max_length=50, blank=True, help_text="SHA intervention code for claims"
    )

    # Availability
    is_active = models.BooleanField(default=True)
    available_in_house = models.BooleanField(default=True)

    # Timestamps
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "Imaging Procedure"
        verbose_name_plural = "Imaging Procedures"
        ordering = ["modality", "name"]
        indexes = [
            models.Index(fields=["code"]),
            models.Index(fields=["modality"]),
            models.Index(fields=["body_region"]),
            models.Index(fields=["is_active"]),
        ]

    def __str__(self):
        return f"{self.code} - {self.name}"


class ImagingOrder(models.Model):
    """
    Imaging order from clinical encounter.

    Represents an imaging request made by a clinician for a patient,
    tracking status, scheduling, and billing information.
    """

    ORDER_STATUS = [
        ("DRAFT", "Draft"),
        ("ORDERED", "Ordered"),
        ("SCHEDULED", "Scheduled"),
        ("IN_PROGRESS", "In Progress"),
        ("COMPLETED", "Completed - Pending Report"),
        ("REPORTED", "Reported"),
        ("CANCELLED", "Cancelled"),
    ]

    PRIORITY_LEVELS = [
        ("ROUTINE", "Routine"),
        ("URGENT", "Urgent"),
        ("STAT", "STAT (Immediate)"),
    ]

    # Valid status transitions
    STATUS_TRANSITIONS = {
        "DRAFT": ["ORDERED", "CANCELLED"],
        "ORDERED": ["SCHEDULED", "IN_PROGRESS", "CANCELLED"],
        "SCHEDULED": ["IN_PROGRESS", "CANCELLED"],
        "IN_PROGRESS": ["COMPLETED"],
        "COMPLETED": ["REPORTED"],
        "REPORTED": [],
        "CANCELLED": [],
    }

    # Identity - format: RAD-YYYYMMDD-XXXX
    order_number = models.CharField(max_length=30, unique=True, editable=False)

    # Relationships
    patient = models.ForeignKey(
        "patients.Patient",
        on_delete=models.PROTECT,
        related_name="imaging_orders",
    )
    encounter = models.ForeignKey(
        "encounters.Encounter",
        on_delete=models.PROTECT,
        related_name="imaging_orders",
    )
    ordered_by = models.ForeignKey(
        User,
        on_delete=models.PROTECT,
        related_name="imaging_orders",
    )

    # Order details
    priority = models.CharField(
        max_length=20, choices=PRIORITY_LEVELS, default="ROUTINE"
    )
    clinical_indication = models.TextField(help_text="Clinical reason for imaging")
    relevant_clinical_history = models.TextField(
        blank=True, help_text="Relevant clinical history for radiologist"
    )

    # Status tracking
    status = models.CharField(max_length=30, choices=ORDER_STATUS, default="DRAFT")
    status_changed_at = models.DateTimeField(auto_now=True)

    # Scheduling
    scheduled_datetime = models.DateTimeField(null=True, blank=True)
    scheduled_room = models.CharField(max_length=50, blank=True)

    # Link to scheduling system appointment
    appointment = models.OneToOneField(
        "scheduling.Appointment",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="imaging_order",
        help_text="Linked scheduling appointment",
    )

    # DICOM/PACS
    accession_number = models.CharField(
        max_length=50, blank=True, help_text="PACS accession number"
    )
    study_instance_uid = models.CharField(
        max_length=128, blank=True, help_text="DICOM Study Instance UID"
    )

    # Billing
    total_cost = models.DecimalField(
        max_digits=10, decimal_places=2, default=Decimal("0.00")
    )
    is_paid = models.BooleanField(default=False)

    # Timestamps
    ordered_at = models.DateTimeField(auto_now_add=True)
    completed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        verbose_name = "Imaging Order"
        verbose_name_plural = "Imaging Orders"
        ordering = ["-ordered_at"]
        indexes = [
            models.Index(fields=["order_number"]),
            models.Index(fields=["patient"]),
            models.Index(fields=["status"]),
            models.Index(fields=["ordered_at"]),
            models.Index(fields=["priority"]),
        ]

    def __str__(self):
        return f"{self.order_number} - {self.patient}"

    def save(self, *args, **kwargs):
        """Override save to auto-generate order number and prevent modification."""
        if not self.pk:
            # New instance - generate order number
            if not self.order_number:
                self.order_number = generate_imaging_order_number()
        else:
            # Existing instance - prevent order_number modification
            try:
                original = ImagingOrder.objects.get(pk=self.pk)
                if original.order_number:
                    self.order_number = original.order_number
            except ImagingOrder.DoesNotExist:
                pass
        super().save(*args, **kwargs)

    def calculate_total_cost(self):
        """
        Calculate total cost from all order items.

        Returns:
            Decimal: Total cost of all imaging items in the order
        """
        total = sum(item.unit_cost for item in self.items.all())
        self.total_cost = total
        self.save(update_fields=["total_cost"])
        return total

    def update_status(self, new_status, _user=None):
        """
        Update order status with validation.

        Args:
            new_status: New status value
            _user: User making the change (for audit trail, unused in model)

        Raises:
            ValidationError: If status transition is invalid
        """
        if new_status not in dict(self.ORDER_STATUS):
            raise ValidationError(f"Invalid status: {new_status}")

        valid_transitions = self.STATUS_TRANSITIONS.get(self.status, [])
        if new_status not in valid_transitions:
            raise ValidationError(
                f"Cannot transition from {self.status} to {new_status}"
            )

        self.status = new_status

        if new_status == "COMPLETED":
            self.completed_at = timezone.now()

        self.save()

    def is_complete(self):
        """
        Check if all imaging items are completed.

        Returns:
            bool: True if all order items are completed
        """
        items = self.items.all()
        if not items.exists():
            return False
        return all(item.is_completed for item in items)


class ImagingOrderItem(models.Model):
    """
    Individual imaging procedure within an order.

    Represents a specific imaging procedure requested as part of an order,
    including laterality and completion status.
    """

    LATERALITY_CHOICES = [
        ("NA", "Not Applicable"),
        ("LEFT", "Left"),
        ("RIGHT", "Right"),
        ("BILATERAL", "Bilateral"),
    ]

    order = models.ForeignKey(
        ImagingOrder,
        on_delete=models.CASCADE,
        related_name="items",
    )
    procedure = models.ForeignKey(
        ImagingProcedure,
        on_delete=models.PROTECT,
        related_name="order_items",
    )
    laterality = models.CharField(
        max_length=20, choices=LATERALITY_CHOICES, default="NA"
    )
    specific_instructions = models.TextField(
        blank=True, help_text="Specific instructions for this procedure"
    )
    is_completed = models.BooleanField(default=False)
    completed_at = models.DateTimeField(null=True, blank=True)
    unit_cost = models.DecimalField(
        max_digits=10, decimal_places=2, default=Decimal("0.00")
    )

    class Meta:
        verbose_name = "Imaging Order Item"
        verbose_name_plural = "Imaging Order Items"

    def __str__(self):
        return f"{self.order.order_number} - {self.procedure.name}"


# ============================================================================
# DICOM Models (Phase C)
# ============================================================================


class DICOMStudy(models.Model):
    """
    Represents a DICOM Study - the top-level container in the DICOM hierarchy.

    A study corresponds to a single imaging examination (e.g., a chest X-ray session).
    It may contain multiple series (e.g., PA and lateral views), each containing
    multiple instances (individual image files).

    DICOM Hierarchy: Study → Series → Instance

    Attributes:
        study_instance_uid: Globally unique DICOM Study Instance UID (0020,000D)
        patient: The patient who underwent the imaging study
        imaging_order: The imaging order that requested this study (nullable for external uploads)
        study_date: Date the study was performed (0008,0020)
        study_time: Time the study was performed (0008,0030)
        study_description: Description of the study (0008,1030)
        accession_number: PACS/RIS accession number (0008,0050)
        referring_physician_name: Name of referring physician (0008,0090)
        modality: Primary modality of the study
        institution_name: Institution where study was performed (0008,0080)
    """

    MODALITY_CHOICES = ImagingProcedure.MODALITY_CHOICES

    # DICOM UIDs
    study_instance_uid = models.CharField(
        max_length=128,
        unique=True,
        db_index=True,
        help_text="DICOM Study Instance UID (0020,000D)",
    )

    # Relationships
    patient = models.ForeignKey(
        "patients.Patient",
        on_delete=models.PROTECT,
        related_name="dicom_studies",
        help_text="Patient associated with this study",
    )
    imaging_order = models.ForeignKey(
        ImagingOrder,
        on_delete=models.PROTECT,
        related_name="dicom_studies",
        null=True,
        blank=True,
        help_text="Imaging order that initiated this study (null for external uploads)",
    )

    # DICOM metadata
    study_date = models.DateField(
        help_text="Date the study was performed (0008,0020)",
    )
    study_time = models.TimeField(
        null=True,
        blank=True,
        help_text="Time the study was performed (0008,0030)",
    )
    study_description = models.CharField(
        max_length=255,
        blank=True,
        default="",
        help_text="Study description (0008,1030)",
    )
    accession_number = models.CharField(
        max_length=64,
        blank=True,
        default="",
        db_index=True,
        help_text="Accession number for PACS/RIS (0008,0050)",
    )
    referring_physician_name = models.CharField(
        max_length=255,
        blank=True,
        default="",
        help_text="Referring physician name (0008,0090)",
    )
    modality = models.CharField(
        max_length=20,
        choices=MODALITY_CHOICES,
        help_text="Primary modality of the study",
    )
    institution_name = models.CharField(
        max_length=255,
        blank=True,
        default="",
        help_text="Institution name (0008,0080)",
    )

    # Study statistics
    number_of_series = models.PositiveIntegerField(
        default=0,
        help_text="Number of series in this study",
    )
    number_of_instances = models.PositiveIntegerField(
        default=0,
        help_text="Total number of instances across all series",
    )
    total_file_size = models.BigIntegerField(
        default=0,
        help_text="Total file size of all instances in bytes",
    )

    # Thumbnail
    thumbnail_path = models.CharField(
        max_length=500,
        blank=True,
        default="",
        help_text="Relative path to study thumbnail image",
    )

    # Tracking
    uploaded_by = models.ForeignKey(
        User,
        on_delete=models.PROTECT,
        related_name="uploaded_dicom_studies",
        help_text="User who uploaded/imported this study",
    )

    # Timestamps
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "DICOM Study"
        verbose_name_plural = "DICOM Studies"
        ordering = ["-study_date", "-created_at"]
        indexes = [
            models.Index(fields=["study_instance_uid"]),
            models.Index(fields=["patient"]),
            models.Index(fields=["accession_number"]),
            models.Index(fields=["modality"]),
            models.Index(fields=["study_date"]),
        ]

    def __str__(self):
        desc = self.study_description or "No description"
        return f"{self.modality} - {desc} ({self.study_date})"

    @property
    def storage_path(self) -> str:
        """
        Get the PACS storage directory path for this study.

        Returns:
            str: Path in format 'dicom/{study_instance_uid}/'
        """
        return f"dicom/{self.study_instance_uid}/"


class DICOMSeries(models.Model):
    """
    Represents a DICOM Series within a study.

    A series groups images acquired under the same conditions - same modality,
    same orientation, same contrast phase, etc. For example, a CT study might
    have an axial series, a coronal reconstruction series, etc.

    DICOM Hierarchy: Study → Series → Instance

    Attributes:
        series_instance_uid: Globally unique DICOM Series Instance UID (0020,000E)
        study: Parent DICOMStudy
        series_number: Series number within the study (0020,0011)
        series_description: Description of the series (0008,103E)
        modality: Modality of this series (0008,0060)
        body_part_examined: Body part examined (0018,0015)
    """

    MODALITY_CHOICES = ImagingProcedure.MODALITY_CHOICES

    # DICOM UIDs
    series_instance_uid = models.CharField(
        max_length=128,
        unique=True,
        db_index=True,
        help_text="DICOM Series Instance UID (0020,000E)",
    )

    # Relationships
    study = models.ForeignKey(
        DICOMStudy,
        on_delete=models.CASCADE,
        related_name="series_set",
        help_text="Parent DICOM study",
    )

    # DICOM metadata
    series_number = models.PositiveIntegerField(
        null=True,
        blank=True,
        help_text="Series number within study (0020,0011)",
    )
    series_description = models.CharField(
        max_length=255,
        blank=True,
        default="",
        help_text="Series description (0008,103E)",
    )
    modality = models.CharField(
        max_length=20,
        choices=MODALITY_CHOICES,
        help_text="Modality of this series (0008,0060)",
    )
    body_part_examined = models.CharField(
        max_length=100,
        blank=True,
        default="",
        help_text="Body part examined (0018,0015)",
    )

    # Series statistics
    number_of_instances = models.PositiveIntegerField(
        default=0,
        help_text="Number of instances in this series",
    )
    total_file_size = models.BigIntegerField(
        default=0,
        help_text="Total file size of all instances in bytes",
    )

    # Thumbnail
    thumbnail_path = models.CharField(
        max_length=500,
        blank=True,
        default="",
        help_text="Relative path to series thumbnail image",
    )

    # Timestamps
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "DICOM Series"
        verbose_name_plural = "DICOM Series"
        ordering = ["series_number"]
        indexes = [
            models.Index(fields=["series_instance_uid"]),
            models.Index(fields=["study"]),
            models.Index(fields=["modality"]),
        ]

    def __str__(self):
        desc = self.series_description or self.modality
        num = self.series_number or "?"
        return f"Series {num}: {desc}"

    @property
    def storage_path(self) -> str:
        """
        Get the PACS storage directory path for this series.

        Returns:
            str: Path in format 'dicom/{study_uid}/{series_uid}/'
        """
        return f"dicom/{self.study.study_instance_uid}/{self.series_instance_uid}/"


class DICOMInstance(models.Model):
    """
    Represents a single DICOM instance (image/file) within a series.

    This is the leaf level of the DICOM hierarchy — each instance corresponds
    to a single .dcm file stored on disk.

    DICOM Hierarchy: Study → Series → Instance

    Attributes:
        sop_instance_uid: Globally unique DICOM SOP Instance UID (0008,0018)
        series: Parent DICOMSeries
        sop_class_uid: SOP Class UID identifying the type of object (0008,0016)
        instance_number: Instance number within the series (0020,0013)
        file_path: Relative path to the DICOM file in PACS storage
        file_size: File size in bytes
    """

    # DICOM UIDs
    sop_instance_uid = models.CharField(
        max_length=128,
        unique=True,
        db_index=True,
        help_text="DICOM SOP Instance UID (0008,0018)",
    )
    sop_class_uid = models.CharField(
        max_length=128,
        blank=True,
        default="",
        help_text="SOP Class UID (0008,0016) — identifies the type of DICOM object",
    )

    # Relationships
    series = models.ForeignKey(
        DICOMSeries,
        on_delete=models.CASCADE,
        related_name="instances",
        help_text="Parent DICOM series",
    )

    # Instance metadata
    instance_number = models.PositiveIntegerField(
        null=True,
        blank=True,
        help_text="Instance number within series (0020,0013)",
    )

    # File storage
    file_path = models.CharField(
        max_length=500,
        help_text="Relative path to DICOM file in media/dicom/ storage",
    )
    file_size = models.BigIntegerField(
        default=0,
        help_text="File size in bytes",
    )

    # Transfer syntax
    transfer_syntax_uid = models.CharField(
        max_length=128,
        blank=True,
        default="",
        help_text="Transfer Syntax UID (0002,0010) — encoding of pixel data",
    )

    # Image dimensions (for image-type instances)
    rows = models.PositiveIntegerField(
        null=True,
        blank=True,
        help_text="Number of rows (image height) (0028,0010)",
    )
    columns = models.PositiveIntegerField(
        null=True,
        blank=True,
        help_text="Number of columns (image width) (0028,0011)",
    )
    bits_allocated = models.PositiveIntegerField(
        null=True,
        blank=True,
        help_text="Bits allocated per pixel (0028,0100)",
    )
    photometric_interpretation = models.CharField(
        max_length=50,
        blank=True,
        default="",
        help_text="Photometric interpretation (0028,0004) e.g., MONOCHROME1, MONOCHROME2, RGB",
    )

    # Thumbnail
    thumbnail_path = models.CharField(
        max_length=500,
        blank=True,
        default="",
        help_text="Relative path to instance thumbnail image",
    )

    # Timestamps
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "DICOM Instance"
        verbose_name_plural = "DICOM Instances"
        ordering = ["instance_number"]
        indexes = [
            models.Index(fields=["sop_instance_uid"]),
            models.Index(fields=["series"]),
        ]

    def __str__(self):
        num = self.instance_number or "?"
        return f"Instance {num} ({self.sop_instance_uid[:30]}...)"
