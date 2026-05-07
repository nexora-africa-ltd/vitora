"""
Models for Worksheets & Label Generation.
Phase L5.3 of Vitora LIS Implementation Plan.

Provides:
- Batch worksheet generation (grouped by analyzer/section)
- Barcode label configuration and generation
- Worklist export (CSV/PDF for manual analyzers)
"""

from django.contrib.auth import get_user_model
from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import models
from django.utils import timezone

from hmis.apps.core.mixins import FacilityScopedModel
from hmis.apps.core.models import TimeStampedModel

User = get_user_model()


# =============================================================================
# Worksheet Template
# =============================================================================


class WorksheetTemplate(FacilityScopedModel, TimeStampedModel):
    """
    Defines a worksheet layout for a specific lab section or analyzer.
    Worksheets group pending specimens into printable batch lists.
    """

    class GroupBy(models.TextChoices):
        ANALYZER = "ANALYZER", "By Analyzer"
        SECTION = "SECTION", "By Section/Category"
        PRIORITY = "PRIORITY", "By Priority"
        SPECIMEN_TYPE = "SPECIMEN_TYPE", "By Specimen Type"

    class ExportFormat(models.TextChoices):
        PDF = "PDF", "PDF"
        CSV = "CSV", "CSV"
        ZPL = "ZPL", "ZPL (Zebra Label)"

    name = models.CharField(max_length=200, help_text="Template name (e.g., 'Chemistry Worklist')")
    description = models.TextField(blank=True)
    group_by = models.CharField(
        max_length=20,
        choices=GroupBy.choices,
        default=GroupBy.SECTION,
    )
    section_filter = models.CharField(
        max_length=30,
        blank=True,
        help_text="Restrict to a specific test category (e.g., HEMATOLOGY)",
    )
    instrument = models.ForeignKey(
        "laboratory.Instrument",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="worksheet_templates",
        help_text="Restrict to tests run on a specific analyzer",
    )
    include_qc_slots = models.BooleanField(
        default=True,
        help_text="Include QC material slots in the worksheet",
    )
    max_specimens_per_page = models.IntegerField(
        default=30,
        validators=[MinValueValidator(5), MaxValueValidator(100)],
    )
    default_export_format = models.CharField(
        max_length=10,
        choices=ExportFormat.choices,
        default=ExportFormat.PDF,
    )
    columns = models.JSONField(
        default=list,
        blank=True,
        help_text='Columns to include, e.g., ["specimen_barcode", "patient_name", "test_name", "priority"]',
    )
    is_active = models.BooleanField(default=True)

    class Meta:
        verbose_name = "Worksheet Template"
        verbose_name_plural = "Worksheet Templates"
        ordering = ["name"]
        constraints = [
            models.UniqueConstraint(
                fields=["facility", "name"],
                name="unique_worksheet_template_per_facility",
            )
        ]

    def __str__(self):
        return f"{self.name} ({self.get_group_by_display()})"


# =============================================================================
# Worksheet (Generated Batch)
# =============================================================================


class Worksheet(FacilityScopedModel, TimeStampedModel):
    """
    A generated worksheet instance containing a batch of specimens/tests.
    """

    class Status(models.TextChoices):
        DRAFT = "DRAFT", "Draft"
        PRINTED = "PRINTED", "Printed"
        IN_PROGRESS = "IN_PROGRESS", "In Progress"
        COMPLETED = "COMPLETED", "Completed"

    template = models.ForeignKey(
        WorksheetTemplate,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="worksheets",
    )
    worksheet_number = models.CharField(max_length=30, unique=True, editable=False)
    title = models.CharField(max_length=200)
    status = models.CharField(
        max_length=20,
        choices=Status.choices,
        default=Status.DRAFT,
    )
    generated_by = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        related_name="generated_worksheets",
    )
    generated_at = models.DateTimeField(default=timezone.now)
    printed_at = models.DateTimeField(null=True, blank=True)
    specimen_count = models.IntegerField(default=0)
    export_format = models.CharField(
        max_length=10,
        choices=WorksheetTemplate.ExportFormat.choices,
        default=WorksheetTemplate.ExportFormat.PDF,
    )
    notes = models.TextField(blank=True)

    class Meta:
        verbose_name = "Worksheet"
        verbose_name_plural = "Worksheets"
        ordering = ["-generated_at"]

    def __str__(self):
        return f"{self.worksheet_number} - {self.title}"

    def save(self, *args, **kwargs):
        if not self.worksheet_number:
            self.worksheet_number = self._generate_number()
        super().save(*args, **kwargs)

    def _generate_number(self):
        today = timezone.now().strftime("%Y%m%d")
        prefix = f"WS-{today}-"
        last = (
            Worksheet.objects.filter(worksheet_number__startswith=prefix)
            .order_by("-worksheet_number")
            .values_list("worksheet_number", flat=True)
            .first()
        )
        seq = int(last.split("-")[-1]) + 1 if last else 1
        return f"{prefix}{seq:04d}"

    def mark_printed(self):
        self.status = self.Status.PRINTED
        self.printed_at = timezone.now()
        self.save(update_fields=["status", "printed_at"])


class WorksheetItem(FacilityScopedModel, TimeStampedModel):
    """
    A single specimen/test entry on a worksheet.
    """

    worksheet = models.ForeignKey(
        Worksheet,
        on_delete=models.CASCADE,
        related_name="items",
    )
    order_item = models.ForeignKey(
        "laboratory.LabOrderItem",
        on_delete=models.CASCADE,
        related_name="worksheet_items",
    )
    specimen = models.ForeignKey(
        "laboratory.Specimen",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="worksheet_items",
    )
    position = models.IntegerField(
        default=0,
        help_text="Position/sequence on the worksheet",
    )
    is_qc_slot = models.BooleanField(
        default=False,
        help_text="True if this slot is reserved for QC material",
    )

    class Meta:
        verbose_name = "Worksheet Item"
        verbose_name_plural = "Worksheet Items"
        ordering = ["position"]
        constraints = [
            models.UniqueConstraint(
                fields=["worksheet", "order_item"],
                name="unique_item_per_worksheet",
            )
        ]

    def __str__(self):
        return f"WS#{self.worksheet_id} pos {self.position}"


# =============================================================================
# Label Template
# =============================================================================


class LabelTemplate(FacilityScopedModel, TimeStampedModel):
    """
    Configurable label format for specimen tubes and slides.
    Supports ZPL (Zebra printers) and generic PDF.
    """

    class LabelFormat(models.TextChoices):
        ZPL = "ZPL", "ZPL (Zebra)"
        PDF = "PDF", "PDF (Generic)"

    class LabelType(models.TextChoices):
        SPECIMEN = "SPECIMEN", "Specimen Tube"
        SLIDE = "SLIDE", "Microscopy Slide"
        BLOCK = "BLOCK", "Histology Block"
        CONTAINER = "CONTAINER", "Sample Container"

    name = models.CharField(max_length=200)
    label_type = models.CharField(
        max_length=20,
        choices=LabelType.choices,
        default=LabelType.SPECIMEN,
    )
    label_format = models.CharField(
        max_length=10,
        choices=LabelFormat.choices,
        default=LabelFormat.ZPL,
    )
    width_mm = models.IntegerField(
        default=50,
        validators=[MinValueValidator(10), MaxValueValidator(200)],
    )
    height_mm = models.IntegerField(
        default=25,
        validators=[MinValueValidator(5), MaxValueValidator(100)],
    )
    zpl_template = models.TextField(
        blank=True,
        help_text="ZPL command template with placeholders: {barcode}, {patient_name}, {mrn}, {test_name}, {collected_at}, {specimen_type}",
    )
    include_fields = models.JSONField(
        default=list,
        blank=True,
        help_text='Fields to print, e.g., ["barcode", "patient_name", "mrn", "test_name", "collected_at"]',
    )
    barcode_format = models.CharField(
        max_length=20,
        default="CODE128",
        help_text="Barcode symbology: CODE128, QR, DATAMATRIX",
    )
    is_default = models.BooleanField(
        default=False,
        help_text="Default template for this label type at this facility",
    )
    is_active = models.BooleanField(default=True)

    class Meta:
        verbose_name = "Label Template"
        verbose_name_plural = "Label Templates"
        ordering = ["name"]

    def __str__(self):
        return f"{self.name} ({self.get_label_format_display()})"


# =============================================================================
# Label Print Job
# =============================================================================


class LabelPrintJob(FacilityScopedModel, TimeStampedModel):
    """
    Tracks a batch label printing request.
    """

    class Status(models.TextChoices):
        PENDING = "PENDING", "Pending"
        GENERATED = "GENERATED", "Generated"
        PRINTED = "PRINTED", "Printed"
        FAILED = "FAILED", "Failed"

    template = models.ForeignKey(
        LabelTemplate,
        on_delete=models.SET_NULL,
        null=True,
        related_name="print_jobs",
    )
    status = models.CharField(
        max_length=20,
        choices=Status.choices,
        default=Status.PENDING,
    )
    label_count = models.IntegerField(default=0)
    generated_by = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        related_name="label_print_jobs",
    )
    generated_at = models.DateTimeField(null=True, blank=True)
    printed_at = models.DateTimeField(null=True, blank=True)
    output_data = models.TextField(
        blank=True,
        help_text="Generated ZPL commands or base64-encoded PDF",
    )
    error_message = models.TextField(blank=True)

    class Meta:
        verbose_name = "Label Print Job"
        verbose_name_plural = "Label Print Jobs"
        ordering = ["-created_at"]

    def __str__(self):
        return f"Label Job #{self.pk} ({self.label_count} labels)"

    def mark_generated(self, output: str, count: int):
        self.status = self.Status.GENERATED
        self.output_data = output
        self.label_count = count
        self.generated_at = timezone.now()
        self.save(update_fields=["status", "output_data", "label_count", "generated_at"])

    def mark_printed(self):
        self.status = self.Status.PRINTED
        self.printed_at = timezone.now()
        self.save(update_fields=["status", "printed_at"])

    def mark_failed(self, error: str):
        self.status = self.Status.FAILED
        self.error_message = error
        self.save(update_fields=["status", "error_message"])


class LabelPrintJobItem(FacilityScopedModel, TimeStampedModel):
    """
    Individual specimen label in a print job.
    """

    print_job = models.ForeignKey(
        LabelPrintJob,
        on_delete=models.CASCADE,
        related_name="items",
    )
    specimen = models.ForeignKey(
        "laboratory.Specimen",
        on_delete=models.CASCADE,
        related_name="label_items",
    )
    order_item = models.ForeignKey(
        "laboratory.LabOrderItem",
        on_delete=models.CASCADE,
        related_name="label_items",
    )
    copies = models.IntegerField(
        default=1,
        validators=[MinValueValidator(1), MaxValueValidator(10)],
    )
    label_data = models.JSONField(
        default=dict,
        blank=True,
        help_text="Rendered label data (barcode value, patient name, etc.)",
    )

    class Meta:
        verbose_name = "Label Print Job Item"
        verbose_name_plural = "Label Print Job Items"
        ordering = ["pk"]

    def __str__(self):
        return f"Label for Specimen #{self.specimen_id}"
