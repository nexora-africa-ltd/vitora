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

from hmis.apps.core.mixins import FacilityScopedModel

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


class ImagingProcedure(FacilityScopedModel):
    """
    Master catalog of imaging procedures.

    Stores information about available imaging procedures including modality,
    body region, pricing, and SHA claimability. Facility-scoped so each
    facility can maintain its own catalog/pricing.
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
    code = models.CharField(max_length=50, help_text="Procedure code (unique per facility)")
    name = models.CharField(max_length=200, help_text="Full procedure name")
    modality = models.CharField(max_length=20, choices=MODALITY_CHOICES)
    body_region = models.CharField(max_length=30, choices=BODY_REGION_CHOICES)

    # Interoperability codes
    radlex_code = models.CharField(max_length=50, blank=True, help_text="RadLex Playbook ID")
    loinc_code = models.CharField(
        max_length=20, blank=True, help_text="LOINC code for interoperability"
    )

    # Requirements
    requires_contrast = models.BooleanField(default=False)
    requires_sedation = models.BooleanField(default=False)
    special_preparation = models.TextField(blank=True, help_text="Patient preparation instructions")
    turnaround_hours = models.IntegerField(
        default=24, help_text="Expected turnaround time in hours"
    )

    # Pricing & SHA
    cost = models.DecimalField(max_digits=10, decimal_places=2, default=Decimal("0.00"))
    sha_claimable = models.BooleanField(default=True, help_text="Covered by Kenya SHA")
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
        constraints = [
            models.UniqueConstraint(
                fields=["facility", "code"],
                name="unique_procedure_code_per_facility",
            ),
        ]
        indexes = [
            models.Index(fields=["code"]),
            models.Index(fields=["modality"]),
            models.Index(fields=["body_region"]),
            models.Index(fields=["is_active"]),
            models.Index(fields=["facility"]),
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
    admission = models.ForeignKey(
        "inpatient.Admission",
        on_delete=models.PROTECT,
        related_name="imaging_orders",
        null=True,
        blank=True,
        help_text="IPD admission if imaging ordered during inpatient stay",
    )
    ordered_by = models.ForeignKey(
        User,
        on_delete=models.PROTECT,
        related_name="imaging_orders",
    )

    # Order details
    priority = models.CharField(max_length=20, choices=PRIORITY_LEVELS, default="ROUTINE")
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
    total_cost = models.DecimalField(max_digits=10, decimal_places=2, default=Decimal("0.00"))
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
            raise ValidationError(f"Cannot transition from {self.status} to {new_status}")

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
    laterality = models.CharField(max_length=20, choices=LATERALITY_CHOICES, default="NA")
    specific_instructions = models.TextField(
        blank=True, help_text="Specific instructions for this procedure"
    )
    is_completed = models.BooleanField(default=False)
    completed_at = models.DateTimeField(null=True, blank=True)
    unit_cost = models.DecimalField(max_digits=10, decimal_places=2, default=Decimal("0.00"))

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

    # Equipment/modality identity (extracted from DICOM tags)
    station_name = models.CharField(
        max_length=128,
        blank=True,
        default="",
        db_index=True,
        help_text="Station name from DICOM (0008,1010) - typically the modality console hostname",
    )
    manufacturer = models.CharField(
        max_length=128,
        blank=True,
        default="",
        help_text="Manufacturer from DICOM (0008,0070)",
    )
    manufacturer_model_name = models.CharField(
        max_length=128,
        blank=True,
        default="",
        help_text="Manufacturer model name from DICOM (0008,1090)",
    )
    device_serial_number = models.CharField(
        max_length=128,
        blank=True,
        default="",
        db_index=True,
        help_text="Device serial number from DICOM (0018,1000)",
    )
    equipment = models.ForeignKey(
        "imaging.ImagingEquipment",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="studies",
        help_text="Imaging equipment that produced this study (auto-resolved from DICOM tags)",
    )

    # C-STORE ingest metadata (set when study arrives via C-STORE SCP rather than upload)
    source = models.CharField(
        max_length=20,
        choices=[
            ("UPLOAD", "Web Upload"),
            ("CSTORE", "DICOM C-STORE"),
            ("EXTERNAL", "External Import"),
        ],
        default="UPLOAD",
        db_index=True,
        help_text="How the study arrived in PACS",
    )
    calling_ae_title = models.CharField(
        max_length=16,
        blank=True,
        default="",
        help_text="Calling AE title (set for C-STORE arrivals)",
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
        null=True,
        blank=True,
        help_text="User who uploaded/imported this study (null for C-STORE arrivals)",
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


# ============================================================================
# Radiology Reporting Models (Phase D)
# ============================================================================


def generate_report_number():
    """
    Generate a unique radiology report number.

    Format: RPT-YYYYMMDD-XXXX
    Where XXXX is a 4-digit sequential number for the day.

    Returns:
        str: A unique report number string
    """
    today = datetime.now().strftime("%Y%m%d")
    prefix = f"RPT-{today}-"

    # Find the highest report number for today
    latest_report = (
        RadiologyReport.objects.filter(report_number__startswith=prefix)
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


class RadiologyReport(models.Model):
    """
    Radiology report for an imaging study.

    Represents a radiologist's interpretation of imaging findings,
    with support for:
    - Draft/Preliminary/Final/Amended workflow
    - Critical findings tracking and communication
    - Amendment history
    - PDF generation
    """

    REPORT_STATUS = [
        ("DRAFT", "Draft"),
        ("PRELIMINARY", "Preliminary"),
        ("FINAL", "Final"),
        ("AMENDED", "Amended"),
    ]

    # Valid status transitions
    STATUS_TRANSITIONS = {
        "DRAFT": ["PRELIMINARY", "FINAL"],
        "PRELIMINARY": ["FINAL"],
        "FINAL": ["AMENDED"],
        "AMENDED": ["AMENDED"],  # Can be amended multiple times
    }

    # Identity
    report_number = models.CharField(max_length=30, unique=True, editable=False)

    # Relationships
    imaging_order = models.OneToOneField(
        ImagingOrder,
        on_delete=models.PROTECT,
        related_name="report",
        help_text="The imaging order this report is for",
    )
    study = models.ForeignKey(
        DICOMStudy,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="reports",
        help_text="The DICOM study linked to this report (if available)",
    )

    # Report content
    technique = models.TextField(
        blank=True,
        default="",
        help_text="Imaging technique/protocol used",
    )
    comparison = models.TextField(
        blank=True,
        default="",
        help_text="Comparison with prior studies (if any)",
    )
    findings = models.TextField(
        help_text="Detailed radiological findings",
    )
    impression = models.TextField(
        help_text="Summary impression/conclusion",
    )
    recommendations = models.TextField(
        blank=True,
        default="",
        help_text="Recommended follow-up or additional studies",
    )

    # Critical findings workflow
    is_critical = models.BooleanField(
        default=False,
        help_text="Critical finding requiring urgent communication",
    )
    critical_finding_description = models.TextField(
        blank=True,
        default="",
        help_text="Description of the critical finding",
    )
    critical_communicated = models.BooleanField(
        default=False,
        help_text="Whether critical finding has been communicated",
    )
    critical_communicated_to = models.CharField(
        max_length=200,
        blank=True,
        default="",
        help_text="Name/identifier of person notified",
    )
    critical_communicated_method = models.CharField(
        max_length=50,
        blank=True,
        default="",
        help_text="Communication method (phone, in-person, etc.)",
    )
    critical_communicated_at = models.DateTimeField(
        null=True,
        blank=True,
        help_text="When critical finding was communicated",
    )
    critical_communicated_by = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="critical_communications",
        help_text="User who communicated the critical finding",
    )

    # Status and workflow
    status = models.CharField(
        max_length=20,
        choices=REPORT_STATUS,
        default="DRAFT",
    )

    # Reporting metadata
    reported_by = models.ForeignKey(
        User,
        on_delete=models.PROTECT,
        related_name="radiology_reports",
        help_text="Radiologist who created/owns the report",
    )
    signed_at = models.DateTimeField(
        null=True,
        blank=True,
        help_text="When the report was signed/finalized",
    )

    # Amendment tracking
    amendment_count = models.PositiveIntegerField(
        default=0,
        help_text="Number of times this report has been amended",
    )
    last_amendment_reason = models.TextField(
        blank=True,
        default="",
        help_text="Reason for the most recent amendment",
    )
    last_amended_at = models.DateTimeField(
        null=True,
        blank=True,
    )
    last_amended_by = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="amended_radiology_reports",
    )

    # Timestamps
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "Radiology Report"
        verbose_name_plural = "Radiology Reports"
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["report_number"]),
            models.Index(fields=["imaging_order"]),
            models.Index(fields=["status"]),
            models.Index(fields=["is_critical"]),
            models.Index(fields=["reported_by"]),
        ]

    def __str__(self):
        return f"{self.report_number} - {self.imaging_order.order_number}"

    def save(self, *args, **kwargs):
        """Override save to auto-generate report number."""
        if not self.pk and not self.report_number:
            self.report_number = generate_report_number()
        super().save(*args, **kwargs)

    def can_edit(self) -> bool:
        """Check if the report can still be edited."""
        return self.status in ("DRAFT", "PRELIMINARY")

    def can_sign(self) -> bool:
        """Check if the report can be signed/finalized."""
        return self.status in ("DRAFT", "PRELIMINARY")

    def can_amend(self) -> bool:
        """Check if the report can be amended."""
        return self.status in ("FINAL", "AMENDED")

    def sign(self, user: User):
        """
        Sign and finalize the report.

        Args:
            user: The radiologist signing the report

        Raises:
            ValidationError: If report cannot be signed
        """
        if not self.can_sign():
            raise ValidationError(
                f"Cannot sign report in status '{self.status}'. "
                "Only DRAFT or PRELIMINARY reports can be signed."
            )

        self.status = "FINAL"
        self.signed_at = timezone.now()
        self.save(update_fields=["status", "signed_at", "updated_at"])

        # Update the imaging order status to REPORTED
        self.imaging_order.status = "REPORTED"
        self.imaging_order.save(update_fields=["status", "status_changed_at"])

    def amend(self, user: User, reason: str, new_findings: str = None, new_impression: str = None):
        """
        Amend a finalized report.

        Args:
            user: The radiologist making the amendment
            reason: Reason for the amendment
            new_findings: Updated findings (optional)
            new_impression: Updated impression (optional)

        Raises:
            ValidationError: If report cannot be amended
        """
        if not self.can_amend():
            raise ValidationError(
                f"Cannot amend report in status '{self.status}'. "
                "Only FINAL or already AMENDED reports can be amended."
            )

        if not reason:
            raise ValidationError("Amendment reason is required.")

        # Update content if provided
        if new_findings:
            self.findings = new_findings
        if new_impression:
            self.impression = new_impression

        # Track amendment
        self.status = "AMENDED"
        self.amendment_count += 1
        self.last_amendment_reason = reason
        self.last_amended_at = timezone.now()
        self.last_amended_by = user

        self.save()

    def communicate_critical(
        self,
        user: User,
        communicated_to: str,
        method: str = "phone",
    ):
        """
        Record communication of a critical finding.

        Args:
            user: User who communicated the finding
            communicated_to: Name/identifier of person notified
            method: Communication method
        """
        self.critical_communicated = True
        self.critical_communicated_to = communicated_to
        self.critical_communicated_method = method
        self.critical_communicated_at = timezone.now()
        self.critical_communicated_by = user
        self.save()


class ReportAmendment(models.Model):
    """
    Tracks individual amendments to a radiology report.

    Provides a full audit trail of all changes made after a report
    is finalized.
    """

    report = models.ForeignKey(
        RadiologyReport,
        on_delete=models.CASCADE,
        related_name="amendments",
    )
    amendment_number = models.PositiveIntegerField(
        help_text="Sequential amendment number for this report",
    )
    reason = models.TextField(
        help_text="Reason for the amendment",
    )
    previous_findings = models.TextField(
        blank=True,
        default="",
        help_text="Findings before this amendment",
    )
    previous_impression = models.TextField(
        blank=True,
        default="",
        help_text="Impression before this amendment",
    )
    new_findings = models.TextField(
        blank=True,
        default="",
        help_text="Findings after this amendment (if changed)",
    )
    new_impression = models.TextField(
        blank=True,
        default="",
        help_text="Impression after this amendment (if changed)",
    )
    amended_by = models.ForeignKey(
        User,
        on_delete=models.PROTECT,
        related_name="report_amendments",
    )
    amended_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = "Report Amendment"
        verbose_name_plural = "Report Amendments"
        ordering = ["-amendment_number"]
        unique_together = [["report", "amendment_number"]]

    def __str__(self):
        return f"{self.report.report_number} - Amendment #{self.amendment_number}"


# ============================================================================
# Equipment Registry (Phase E)
# ============================================================================


class ImagingEquipment(FacilityScopedModel):
    """
    Registry of physical imaging equipment / modalities.

    Auto-populated from DICOM tags when studies arrive, and manually editable
    to add room/AET/maintenance metadata. Each piece of equipment is uniquely
    identified by (manufacturer, model, serial_number) when those are present,
    or by AE title as a fallback.

    Use cases:
    - QA & maintenance scheduling (calibration tracking, downtime)
    - Cost attribution per machine
    - SHA claim evidence (which machine performed which study)
    - Cold-chain-style drift monitoring (radiation output)
    """

    MODALITY_CHOICES = ImagingProcedure.MODALITY_CHOICES

    # Identity
    name = models.CharField(
        max_length=200,
        help_text="Display name (e.g., 'Siemens CT Scanner - Room 3')",
    )
    modality = models.CharField(
        max_length=20,
        choices=MODALITY_CHOICES,
        db_index=True,
        help_text="Primary modality",
    )

    # DICOM identity
    ae_title = models.CharField(
        max_length=16,
        blank=True,
        default="",
        db_index=True,
        help_text="DICOM AE Title (used for C-STORE/Worklist/MWL)",
    )
    station_name = models.CharField(
        max_length=128,
        blank=True,
        default="",
        db_index=True,
        help_text="DICOM Station Name (0008,1010)",
    )

    # Hardware identity
    manufacturer = models.CharField(max_length=128, blank=True, default="")
    model_name = models.CharField(max_length=128, blank=True, default="")
    serial_number = models.CharField(
        max_length=128,
        blank=True,
        default="",
        db_index=True,
        help_text="Manufacturer serial number (DICOM 0018,1000)",
    )
    software_versions = models.CharField(max_length=255, blank=True, default="")

    # Physical location
    room = models.CharField(max_length=100, blank=True, default="")
    scheduling_resource = models.ForeignKey(
        "scheduling.Resource",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="imaging_equipment",
        help_text="Optional link to scheduling Resource (for QA/maintenance bookings)",
    )

    # Lifecycle
    is_active = models.BooleanField(default=True, db_index=True)
    installed_date = models.DateField(null=True, blank=True)
    last_calibration_date = models.DateField(null=True, blank=True)
    next_calibration_due = models.DateField(null=True, blank=True)
    notes = models.TextField(blank=True, default="")

    # Tracking
    auto_registered = models.BooleanField(
        default=False,
        help_text="True if this record was auto-created on first study arrival",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "Imaging Equipment"
        verbose_name_plural = "Imaging Equipment"
        ordering = ["modality", "name"]
        indexes = [
            models.Index(fields=["modality", "is_active"]),
            models.Index(fields=["ae_title"]),
            models.Index(fields=["serial_number"]),
        ]

    def __str__(self):
        return f"{self.name} ({self.get_modality_display()})"

    @property
    def is_calibration_overdue(self) -> bool:
        """Return True if calibration is past due."""
        if not self.next_calibration_due:
            return False
        return self.next_calibration_due < timezone.now().date()


# ============================================================================
# Study Sharing (Phase F)
# ============================================================================


class StudyShareLink(models.Model):
    """
    A revocable, time-limited share link for an external clinician to view a study.

    Tokens are random URL-safe strings. Access via the public share endpoint is
    audited every time. Optional PIN provides a second factor.

    Kenya DPA 2019 considerations:
    - Always require an explicit purpose at creation time
    - Default expiry is 7 days, max 30 days
    - All access is audit-logged with IP
    """

    PURPOSE_CHOICES = [
        ("REFERRAL", "Referral / Second Opinion"),
        ("PATIENT_COPY", "Patient Copy"),
        ("RESEARCH", "Research (de-identified)"),
        ("INSURANCE", "Insurance / SHA Claim"),
        ("OTHER", "Other"),
    ]

    study = models.ForeignKey(
        "imaging.DICOMStudy",
        on_delete=models.CASCADE,
        related_name="share_links",
    )
    token = models.CharField(
        max_length=64,
        unique=True,
        db_index=True,
        help_text="Random URL-safe token used in the public share URL",
    )
    purpose = models.CharField(max_length=20, choices=PURPOSE_CHOICES, default="REFERRAL")
    recipient_name = models.CharField(
        max_length=200,
        blank=True,
        default="",
        help_text="Optional human-readable recipient (e.g., 'Dr. J. Mwangi, Aga Khan')",
    )
    recipient_email = models.CharField(max_length=200, blank=True, default="")
    notes = models.TextField(blank=True, default="")

    # Security
    pin_hash = models.CharField(
        max_length=128,
        blank=True,
        default="",
        help_text="Optional PIN (hashed with Django's password hasher)",
    )
    expires_at = models.DateTimeField(db_index=True)
    revoked_at = models.DateTimeField(null=True, blank=True)
    max_views = models.PositiveIntegerField(
        default=0,
        help_text="0 = unlimited; otherwise number of times the link can be opened",
    )
    view_count = models.PositiveIntegerField(default=0)

    # Permissions on what the recipient can do
    allow_download = models.BooleanField(
        default=False,
        help_text="If true, recipient may download the original DICOM ZIP",
    )

    # Tracking
    created_by = models.ForeignKey(
        User,
        on_delete=models.PROTECT,
        related_name="created_share_links",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    last_accessed_at = models.DateTimeField(null=True, blank=True)
    last_accessed_ip = models.GenericIPAddressField(null=True, blank=True)

    class Meta:
        verbose_name = "Study Share Link"
        verbose_name_plural = "Study Share Links"
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["token"]),
            models.Index(fields=["expires_at"]),
        ]

    def __str__(self):
        return f"Share {self.token[:8]}… → {self.study.study_instance_uid[:20]}…"

    @property
    def is_revoked(self) -> bool:
        return self.revoked_at is not None

    @property
    def is_expired(self) -> bool:
        return timezone.now() >= self.expires_at

    @property
    def is_view_exhausted(self) -> bool:
        return self.max_views > 0 and self.view_count >= self.max_views

    @property
    def is_usable(self) -> bool:
        return not (self.is_revoked or self.is_expired or self.is_view_exhausted)

    def revoke(self):
        """Mark this link as revoked."""
        if not self.revoked_at:
            self.revoked_at = timezone.now()
            self.save(update_fields=["revoked_at"])

    def check_pin(self, pin: str) -> bool:
        """Validate a provided PIN against the stored hash. No PIN = always True."""
        if not self.pin_hash:
            return True
        from django.contrib.auth.hashers import check_password

        return check_password(pin or "", self.pin_hash)

    def record_access(self, ip_address: str | None = None):
        """Increment view count + record access metadata."""
        from django.db.models import F

        StudyShareLink.objects.filter(pk=self.pk).update(
            view_count=F("view_count") + 1,
            last_accessed_at=timezone.now(),
            last_accessed_ip=ip_address,
        )
