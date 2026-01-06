"""
Laboratory models for Vitora HMIS.

This module defines models for laboratory test management including test catalog,
lab orders, order items, results, and LOINC codes for interoperability.

Sprint 1.3-1.4 Track B: Lab/Investigations Foundation
"""

import logging
from datetime import datetime

from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError
from django.db import models
from django.utils import timezone

logger = logging.getLogger(__name__)

User = get_user_model()


def generate_lab_order_number():
    """
    Generate a unique laboratory order number.

    Format: LAB-YYYYMMDD-XXXX
    Where XXXX is a 4-digit sequential number for the day.

    Returns:
        str: A unique lab order number string
    """
    today = datetime.now().strftime("%Y%m%d")
    prefix = f"LAB-{today}-"

    # Find the highest order number for today
    latest_order = (
        LabOrder.objects.filter(order_number__startswith=prefix).order_by("-order_number").first()
    )

    if latest_order:
        # Extract the sequence number and increment
        last_sequence = int(latest_order.order_number.split("-")[-1])
        sequence = last_sequence + 1
    else:
        # First order of the day
        sequence = 1

    return f"{prefix}{sequence:04d}"


class TestCatalog(models.Model):
    """Laboratory test master catalog."""

    TEST_CATEGORIES = [
        ("HEMATOLOGY", "Hematology"),
        ("CHEMISTRY", "Clinical Chemistry"),
        ("MICROBIOLOGY", "Microbiology"),
        ("SEROLOGY", "Serology"),
        ("PARASITOLOGY", "Parasitology"),
        ("IMMUNOLOGY", "Immunology"),
        ("URINALYSIS", "Urinalysis"),
        ("HISTOPATHOLOGY", "Histopathology"),
        ("CYTOLOGY", "Cytology"),
        ("MOLECULAR", "Molecular Diagnostics"),
        ("OTHER", "Other"),
    ]

    SPECIMEN_TYPES = [
        ("BLOOD", "Whole Blood"),
        ("SERUM", "Serum"),
        ("PLASMA", "Plasma"),
        ("URINE", "Urine"),
        ("STOOL", "Stool"),
        ("CSF", "Cerebrospinal Fluid"),
        ("SPUTUM", "Sputum"),
        ("SWAB", "Swab"),
        ("TISSUE", "Tissue"),
        ("ASPIRATE", "Aspirate"),
        ("OTHER", "Other"),
    ]

    RESULT_TYPES = [
        ("NUMERIC", "Numeric Value"),
        ("TEXT", "Text Result"),
        ("OPTIONS", "Predefined Options"),
        ("PANEL", "Multi-component Panel"),
    ]

    # Identity
    code = models.CharField(max_length=50, unique=True, help_text="Internal test code")
    name = models.CharField(max_length=200, help_text="Full test name")
    short_name = models.CharField(max_length=50, help_text="Test abbreviation")
    loinc_code = models.CharField(
        max_length=20, null=True, blank=True, help_text="LOINC code for interoperability"
    )

    # Classification
    category = models.CharField(max_length=30, choices=TEST_CATEGORIES)
    specimen_type = models.CharField(max_length=20, choices=SPECIMEN_TYPES)

    # Requirements
    requires_fasting = models.BooleanField(default=False)
    special_instructions = models.TextField(blank=True)
    turnaround_hours = models.IntegerField(
        default=24, help_text="Expected turnaround time in hours"
    )

    # Availability
    available_in_house = models.BooleanField(default=True)
    external_lab_partner = models.CharField(max_length=100, blank=True)

    # Pricing
    cost = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    sha_claimable = models.BooleanField(default=True, help_text="Covered by Kenya SHA")

    # Result configuration
    result_type = models.CharField(max_length=20, choices=RESULT_TYPES)
    result_unit = models.CharField(max_length=30, blank=True, help_text='e.g., "mg/dL", "mmol/L"')
    normal_range_male = models.CharField(max_length=50, blank=True, help_text='e.g., "4.5-5.5"')
    normal_range_female = models.CharField(max_length=50, blank=True)
    normal_range_child = models.CharField(max_length=50, blank=True)
    result_options = models.JSONField(
        default=list, blank=True, help_text="For OPTIONS type results"
    )

    # Panel components (for PANEL type)
    is_panel = models.BooleanField(default=False)
    panel_components = models.ManyToManyField("self", symmetrical=False, blank=True)

    # Status
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "Test Catalog"
        verbose_name_plural = "Test Catalogs"
        ordering = ["category", "name"]
        indexes = [
            models.Index(fields=["code"]),
            models.Index(fields=["loinc_code"]),
            models.Index(fields=["category"]),
        ]

    def __str__(self):
        return f"{self.code} - {self.name}"

    def get_normal_range(self, patient):
        """
        Get appropriate normal range based on patient's gender and age.

        Args:
            patient: Patient instance

        Returns:
            str: Normal range string or empty string if not defined
        """
        from hmis.apps.patients.models import Patient

        if not isinstance(patient, Patient):
            return ""

        # Check age first (child takes precedence)
        age = patient.age if hasattr(patient, "age") else None
        if age is not None and age < 18 and self.normal_range_child:
            return self.normal_range_child

        # Then check gender
        if patient.gender == "M" and self.normal_range_male:
            return self.normal_range_male
        elif patient.gender == "F" and self.normal_range_female:
            return self.normal_range_female

        # Fallback to male range if no gender-specific range
        return self.normal_range_male or self.normal_range_female or ""

    def is_result_abnormal(self, value, patient):
        """
        Check if a numeric result is outside normal range.

        Args:
            value: Numeric test result
            patient: Patient instance

        Returns:
            bool: True if result is abnormal, False otherwise
        """
        normal_range = self.get_normal_range(patient)
        if not normal_range or value is None:
            return False

        try:
            value = float(value)
            # Parse range (e.g., "4.5-5.5")
            if "-" in normal_range:
                low, high = normal_range.split("-")
                low_val = float(low.strip())
                high_val = float(high.strip())
                return value < low_val or value > high_val
        except (ValueError, AttributeError):
            # If the range or value cannot be parsed, treat the result as not abnormal
            logger.debug(
                "Unable to parse normal range '%s' or value '%s' for test '%s'; treating as not abnormal.",
                normal_range,
                value,
                getattr(self, "name", self.pk),
            )

        return False

    def get_panel_tests(self):
        """
        Get component tests if this is a panel.

        Returns:
            QuerySet: Panel component tests
        """
        if self.is_panel:
            return self.panel_components.all()
        return TestCatalog.objects.none()


class LOINCCode(models.Model):
    """LOINC code reference for lab test interoperability."""

    code = models.CharField(max_length=20, unique=True, primary_key=True)
    component = models.CharField(max_length=200, help_text="What is measured")
    property = models.CharField(max_length=50, help_text="Mass, volume, etc.")
    time_aspect = models.CharField(max_length=50, help_text="Point vs duration")
    system = models.CharField(max_length=100, help_text="Specimen type")
    scale_type = models.CharField(max_length=50, help_text="Quantitative, ordinal, etc.")
    method_type = models.CharField(max_length=100, blank=True)
    long_common_name = models.CharField(max_length=300)
    short_name = models.CharField(max_length=100)

    class Meta:
        verbose_name = "LOINC Code"
        verbose_name_plural = "LOINC Codes"
        ordering = ["code"]

    def __str__(self):
        return f"{self.code} - {self.short_name}"


class LabOrder(models.Model):
    """Laboratory test order from clinical encounter."""

    ORDER_TYPES = [
        ("IN_HOUSE", "In-House Processing"),
        ("EXTERNAL", "External Lab Referral"),
    ]

    ORDER_STATUS = [
        ("DRAFT", "Draft"),
        ("ORDERED", "Ordered"),
        ("SPECIMEN_COLLECTED", "Specimen Collected"),
        ("IN_PROGRESS", "In Progress"),
        ("COMPLETED", "Completed"),
        ("CANCELLED", "Cancelled"),
        ("REJECTED", "Rejected"),
    ]

    PRIORITY_LEVELS = [
        ("ROUTINE", "Routine"),
        ("URGENT", "Urgent"),
        ("STAT", "STAT (Immediate)"),
    ]

    # Valid status transitions
    STATUS_TRANSITIONS = {
        "DRAFT": ["ORDERED", "CANCELLED"],
        "ORDERED": ["SPECIMEN_COLLECTED", "CANCELLED", "REJECTED"],
        "SPECIMEN_COLLECTED": ["IN_PROGRESS", "REJECTED"],
        "IN_PROGRESS": ["COMPLETED"],
        "COMPLETED": [],
        "CANCELLED": [],
        "REJECTED": [],
    }

    # Identity
    order_number = models.CharField(max_length=30, unique=True, editable=False)

    # Relationships
    patient = models.ForeignKey(
        "patients.Patient", on_delete=models.PROTECT, related_name="lab_orders"
    )
    encounter = models.ForeignKey(
        "encounters.Encounter", on_delete=models.PROTECT, related_name="lab_orders"
    )
    ordered_by = models.ForeignKey(User, on_delete=models.PROTECT, related_name="lab_orders")

    # Order details
    order_type = models.CharField(max_length=20, choices=ORDER_TYPES, default="IN_HOUSE")
    external_lab = models.CharField(
        max_length=100, blank=True, help_text="External lab name if applicable"
    )
    priority = models.CharField(max_length=20, choices=PRIORITY_LEVELS, default="ROUTINE")
    clinical_notes = models.TextField(blank=True, help_text="Clinical context for laboratory")

    # Status tracking
    status = models.CharField(max_length=30, choices=ORDER_STATUS, default="DRAFT")
    status_changed_at = models.DateTimeField(auto_now=True)
    status_changed_by = models.ForeignKey(
        User, null=True, on_delete=models.SET_NULL, related_name="lab_status_changes"
    )

    # Specimen tracking
    specimen_collected = models.BooleanField(default=False)
    specimen_collected_at = models.DateTimeField(null=True, blank=True)
    specimen_collected_by = models.ForeignKey(
        User, null=True, blank=True, on_delete=models.SET_NULL, related_name="specimens_collected"
    )

    # External lab details
    external_requisition_sent = models.BooleanField(default=False)
    external_requisition_date = models.DateTimeField(null=True, blank=True)
    external_accession_number = models.CharField(max_length=50, blank=True)
    requisition_pdf = models.FileField(upload_to='lab_requisitions/%Y/%m/', blank=True, null=True, help_text="Generated PDF requisition form")
    sample_type = models.CharField(max_length=100, blank=True, help_text="Type of sample required (e.g., Blood, Urine)")

    # Billing
    total_cost = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    is_paid = models.BooleanField(default=False)

    # Cancellation tracking
    cancellation_reason = models.TextField(blank=True, help_text="Reason for cancellation")
    cancelled_by = models.ForeignKey(
        User, null=True, blank=True, on_delete=models.SET_NULL, related_name="cancelled_lab_orders", help_text="User who cancelled the order"
    )
    cancelled_at = models.DateTimeField(null=True, blank=True, help_text="When order was cancelled")

    # Timestamps
    ordered_at = models.DateTimeField(auto_now_add=True)
    completed_at = models.DateTimeField(null=True, blank=True)

    # Audit
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "Lab Order"
        verbose_name_plural = "Lab Orders"
        ordering = ["-ordered_at"]
        indexes = [
            models.Index(fields=["order_number"]),
            models.Index(fields=["patient"]),
            models.Index(fields=["status"]),
            models.Index(fields=["ordered_at"]),
        ]

    def __str__(self):
        return f"{self.order_number} - {self.patient}"

    def save(self, *args, **kwargs):
        """Override save to auto-generate order number."""
        if not self.order_number:
            self.order_number = generate_lab_order_number()
        super().save(*args, **kwargs)

    def calculate_total_cost(self):
        """
        Calculate total cost from all order items.

        Returns:
            Decimal: Total cost of all tests in the order
        """
        total = sum(item.unit_cost for item in self.items.all())
        self.total_cost = total
        self.save(update_fields=["total_cost"])
        return total

    def update_status(self, new_status, user):
        """
        Update order status with validation.

        Args:
            new_status: New status value
            user: User making the change

        Raises:
            ValidationError: If status transition is invalid
        """
        if new_status not in dict(self.ORDER_STATUS):
            raise ValidationError(f"Invalid status: {new_status}")

        valid_transitions = self.STATUS_TRANSITIONS.get(self.status, [])
        if new_status not in valid_transitions:
            raise ValidationError(f"Cannot transition from {self.status} to {new_status}")

        self.status = new_status
        self.status_changed_by = user

        if new_status == "COMPLETED":
            self.completed_at = timezone.now()

        self.save()

    def mark_specimen_collected(self, user):
        """
        Record specimen collection.

        Args:
            user: User who collected the specimen
        """
        self.specimen_collected = True
        self.specimen_collected_at = timezone.now()
        self.specimen_collected_by = user
        self.update_status("SPECIMEN_COLLECTED", user)
        
        # Also update the LabQueue if it exists (SSOT)
        try:
            queue = self.queue_entry
            if queue.queue_status == "PENDING":
                queue.queue_status = "COLLECTED"
                queue.collected_at = timezone.now()
                queue.collected_by = user
                queue.save(update_fields=["queue_status", "collected_at", "collected_by", "updated_at"])
        except LabQueue.DoesNotExist:
            pass

    def get_pending_results(self):
        """
        Get order items without results.

        Returns:
            QuerySet: Order items that don't have results yet
        """
        return self.items.filter(result__isnull=True)

    def is_complete(self):
        """
        Check if all tests have results.

        Returns:
            bool: True if all order items have results
        """
        return self.items.exists() and not self.get_pending_results().exists()

    def get_turnaround_time(self):
        """
        Calculate time from order to completion.

        Returns:
            timedelta or None: Time taken from order to completion
        """
        if self.completed_at:
            return self.completed_at - self.ordered_at
        return None


class LabOrderItem(models.Model):
    """Individual test within a lab order."""

    ITEM_STATUS = [
        ("PENDING", "Pending"),
        ("IN_PROGRESS", "In Progress"),
        ("COMPLETED", "Completed"),
        ("CANCELLED", "Cancelled"),
    ]

    lab_order = models.ForeignKey(LabOrder, on_delete=models.CASCADE, related_name="items")
    test = models.ForeignKey(TestCatalog, on_delete=models.PROTECT)

    # Status
    status = models.CharField(max_length=20, choices=ITEM_STATUS, default="PENDING")

    # Pricing at time of order (snapshot)
    unit_cost = models.DecimalField(max_digits=10, decimal_places=2)

    # Special instructions for this specific test
    special_instructions = models.TextField(blank=True)

    # Timestamps
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "Lab Order Item"
        verbose_name_plural = "Lab Order Items"
        ordering = ["created_at"]

    def __str__(self):
        return f"{self.lab_order.order_number} - {self.test.name}"

    def save(self, *args, **kwargs):
        """Override save to auto-populate unit_cost from test catalog."""
        if not self.unit_cost:
            self.unit_cost = self.test.cost
        super().save(*args, **kwargs)

    def has_result(self):
        """
        Check if result exists for this item.

        Returns:
            bool: True if result exists
        """
        return hasattr(self, "result")


class LabResult(models.Model):
    """Laboratory test result."""

    RESULT_FLAGS = [
        ("NORMAL", "Normal"),
        ("LOW", "Low"),
        ("HIGH", "High"),
        ("CRITICAL_LOW", "Critical Low"),
        ("CRITICAL_HIGH", "Critical High"),
        ("ABNORMAL", "Abnormal"),
        ("POSITIVE", "Positive"),
        ("NEGATIVE", "Negative"),
    ]

    VERIFICATION_STATUS = [
        ("UNVERIFIED", "Unverified"),
        ("VERIFIED", "Verified"),
        ("REJECTED", "Rejected"),
    ]

    # Relationships
    order_item = models.OneToOneField(LabOrderItem, on_delete=models.CASCADE, related_name="result")

    # Result data
    numeric_value = models.DecimalField(max_digits=15, decimal_places=4, null=True, blank=True)
    text_value = models.TextField(blank=True)
    option_value = models.CharField(max_length=100, blank=True, help_text="For predefined options")

    # Reference range tracking (NEW - Phase 1.3)
    reference_low = models.DecimalField(max_digits=12, decimal_places=4, null=True, blank=True, help_text="Lower bound of reference range")
    reference_high = models.DecimalField(max_digits=12, decimal_places=4, null=True, blank=True, help_text="Upper bound of reference range")
    reference_range_text = models.CharField(max_length=100, blank=True, help_text="Human-readable reference range")

    # Interpretation
    result_flag = models.CharField(max_length=20, choices=RESULT_FLAGS, blank=True)
    interpretation = models.TextField(blank=True, help_text="Pathologist notes")
    is_critical_result = models.BooleanField(default=False, help_text="Requires immediate attention")

    # Method/Equipment tracking (NEW - Phase 1.3)
    method = models.CharField(max_length=100, blank=True, help_text="Testing methodology used")
    equipment = models.CharField(max_length=100, blank=True, help_text="Analyzer or equipment used")

    # Verification
    verification_status = models.CharField(
        max_length=20, choices=VERIFICATION_STATUS, default="UNVERIFIED"
    )
    verified_by = models.ForeignKey(
        User, null=True, blank=True, on_delete=models.SET_NULL, related_name="verified_results"
    )
    verified_at = models.DateTimeField(null=True, blank=True)

    # Result entry
    entered_by = models.ForeignKey(User, on_delete=models.PROTECT, related_name="entered_results")
    entered_at = models.DateTimeField(auto_now_add=True)

    # Amendment tracking (NEW - Phase 1.3)
    is_amended = models.BooleanField(default=False, help_text="Result has been amended")
    amendment_reason = models.TextField(blank=True, help_text="Reason for amendment")
    original_value = models.CharField(max_length=100, blank=True, help_text="Original value before amendment")
    amended_by = models.ForeignKey(
        User, null=True, blank=True, on_delete=models.SET_NULL, related_name="amended_results", help_text="User who amended result"
    )
    amended_at = models.DateTimeField(null=True, blank=True, help_text="When result was amended")

    # External results
    is_external_result = models.BooleanField(default=False)
    external_result_attachment = models.FileField(upload_to="lab_results/", null=True, blank=True)
    external_result_date = models.DateField(null=True, blank=True)

    # Audit
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "Lab Result"
        verbose_name_plural = "Lab Results"
        ordering = ["-entered_at"]
        indexes = [
            models.Index(fields=["verification_status"]),
        ]

    def __str__(self):
        return f"Result for {self.order_item.test.name}"

    def auto_flag_result(self):
        """
        Automatically determine flag based on normal ranges.

        This method checks the numeric value against the patient's normal range
        and sets appropriate flags (NORMAL, LOW, HIGH, CRITICAL_LOW, CRITICAL_HIGH).
        """
        if self.numeric_value is None:
            return

        test = self.order_item.test
        patient = self.order_item.lab_order.patient
        normal_range = test.get_normal_range(patient)

        if not normal_range or "-" not in normal_range:
            return

        try:
            low, high = normal_range.split("-")
            low_val = float(low.strip())
            high_val = float(high.strip())
            value = float(self.numeric_value)

            # Calculate critical thresholds (20% beyond normal)
            range_width = high_val - low_val
            critical_low = low_val - (range_width * 0.2)
            critical_high = high_val + (range_width * 0.2)

            if value < critical_low:
                self.result_flag = "CRITICAL_LOW"
            elif value < low_val:
                self.result_flag = "LOW"
            elif value > critical_high:
                self.result_flag = "CRITICAL_HIGH"
            elif value > high_val:
                self.result_flag = "HIGH"
            else:
                self.result_flag = "NORMAL"

            self.save(update_fields=["result_flag"])
        except (ValueError, AttributeError):
            pass

    def is_critical(self):
        """
        Check if result is critically abnormal.

        Returns:
            bool: True if result is critically low or high
        """
        return self.result_flag in ["CRITICAL_LOW", "CRITICAL_HIGH"]

    def get_formatted_value(self):
        """
        Return result with unit.

        Returns:
            str: Formatted result value with unit
        """
        test = self.order_item.test

        if self.numeric_value is not None:
            unit = test.result_unit or ""
            return f"{self.numeric_value} {unit}".strip()
        elif self.text_value:
            return self.text_value
        elif self.option_value:
            return self.option_value

        return ""

    def verify(self, user):
        """
        Mark result as verified.

        Args:
            user: User verifying the result
        """
        self.verification_status = "VERIFIED"
        self.verified_by = user
        self.verified_at = timezone.now()
        self.save()


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

    def collect_sample(self, collector, sample_id=""):
        """
        Record sample collection.

        Args:
            collector: User who collected the sample
            sample_id: Barcode or tube ID
        """
        self.sample_id = sample_id
        self.collected_by = collector
        self.collected_at = timezone.now()
        self.queue_status = self.QueueStatus.COLLECTED
        self.save(update_fields=["sample_id", "collected_by", "collected_at", "queue_status"])

    def start_processing(self):
        """Mark queue entry as processing."""
        self.queue_status = self.QueueStatus.PROCESSING
        self.processing_started_at = timezone.now()
        self.save(update_fields=["queue_status", "processing_started_at"])

    def submit_for_review(self):
        """Submit results for review."""
        self.queue_status = self.QueueStatus.REVIEW
        self.processing_completed_at = timezone.now()
        self.save(update_fields=["queue_status", "processing_completed_at"])

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
        SCANNED_RESULT = 'scanned', 'Scanned Result'
        EXTERNAL_REPORT = 'external', 'External Lab Report'
        GRAPH = 'graph', 'Result Graph'
        IMAGE = 'image', 'Lab Image'
        OTHER = 'other', 'Other'

    id = models.BigAutoField(primary_key=True)

    # Linkage
    lab_order = models.ForeignKey(
        'LabOrder',
        on_delete=models.CASCADE,
        related_name='attachments',
        help_text="Lab order this attachment belongs to"
    )

    # File
    file = models.FileField(
        upload_to='lab_results/%Y/%m/',
        help_text="Uploaded file (PDF, PNG, JPG, TIFF)"
    )
    filename = models.CharField(
        max_length=255,
        help_text="Original filename"
    )
    file_type = models.CharField(
        max_length=50,
        help_text="MIME type of the file"
    )
    file_size = models.IntegerField(
        help_text="File size in bytes"
    )

    # Metadata
    attachment_type = models.CharField(
        max_length=20,
        choices=AttachmentType.choices,
        help_text="Type of attachment"
    )
    description = models.CharField(
        max_length=255,
        blank=True,
        help_text="Optional description"
    )

    # Audit
    uploaded_by = models.ForeignKey(
        User,
        on_delete=models.PROTECT,
        help_text="User who uploaded the file"
    )
    uploaded_at = models.DateTimeField(
        auto_now_add=True,
        help_text="When file was uploaded"
    )

    class Meta:
        ordering = ['-uploaded_at']
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
        return mime_type or 'application/octet-stream'

    def __str__(self):
        return f"{self.attachment_type}: {self.filename} for Order {self.lab_order.order_number}"
