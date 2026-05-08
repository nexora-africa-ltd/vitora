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

from hmis.apps.core.mixins import FacilityScopedModel
from hmis.apps.core.upload_validators import validate_document_upload as _validate_document_upload

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


class TestCatalog(FacilityScopedModel):
    """Laboratory test catalog, scoped per facility."""

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
    code = models.CharField(max_length=50, help_text="Internal test code")
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

    # Validation requirements (Phase L2)
    requires_clinical_signoff = models.BooleanField(
        default=False,
        help_text="Whether this test requires pathologist/clinical sign-off in addition to technical validation",
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
        constraints = [
            models.UniqueConstraint(
                fields=["facility", "code"],
                name="unique_test_code_per_facility",
            ),
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


SPECIMEN_TYPES = TestCatalog.SPECIMEN_TYPES


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


class LabOrder(FacilityScopedModel):
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
        "patients.Patient",
        on_delete=models.PROTECT,
        related_name="lab_orders",
        null=True,
        blank=True,
        help_text="HMIS patient (null for walk-in/external standalone orders)",
    )
    encounter = models.ForeignKey(
        "encounters.Encounter",
        on_delete=models.PROTECT,
        related_name="lab_orders",
        null=True,
        blank=True,
        help_text="Clinical encounter (null for standalone lab orders)",
    )
    # Walk-in patient details (used when patient FK is null)
    walkin_patient_name = models.CharField(
        max_length=200, blank=True, help_text="Walk-in patient full name"
    )
    walkin_patient_id = models.CharField(
        max_length=50, blank=True, help_text="Walk-in patient national ID or other identifier"
    )
    walkin_patient_phone = models.CharField(
        max_length=20, blank=True, help_text="Walk-in patient phone number"
    )
    walkin_patient_dob = models.DateField(
        null=True, blank=True, help_text="Walk-in patient date of birth"
    )
    walkin_patient_gender = models.CharField(
        max_length=1,
        blank=True,
        choices=[("M", "Male"), ("F", "Female"), ("O", "Other")],
        help_text="Walk-in patient gender",
    )
    is_walkin = models.BooleanField(
        default=False, help_text="True if this is a standalone/walk-in order without HMIS patient"
    )
    admission = models.ForeignKey(
        "inpatient.Admission",
        on_delete=models.PROTECT,
        related_name="lab_orders",
        null=True,
        blank=True,
        help_text="IPD admission if lab ordered during inpatient stay",
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
    requisition_pdf = models.FileField(
        upload_to="lab_requisitions/%Y/%m/",
        blank=True,
        null=True,
        help_text="Generated PDF requisition form",
    )
    sample_type = models.CharField(
        max_length=100, blank=True, help_text="Type of sample required (e.g., Blood, Urine)"
    )

    # Billing
    total_cost = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    is_paid = models.BooleanField(default=False)
    bill_patient = models.BooleanField(
        default=True,
        help_text="Whether to auto-bill the patient. Defaults to False for external lab orders.",
    )

    # Cancellation tracking
    cancellation_reason = models.TextField(blank=True, help_text="Reason for cancellation")
    cancelled_by = models.ForeignKey(
        User,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="cancelled_lab_orders",
        help_text="User who cancelled the order",
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
        patient_str = self.patient or self.walkin_patient_name or "Walk-in"
        return f"{self.order_number} - {patient_str}"

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
                queue.collect_sample(user)
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

    def update_status_from_items(self):
        """
        Advance order status based on item statuses.

        Called automatically when item statuses change.
        - Any item IN_PROGRESS → order IN_PROGRESS (if currently SPECIMEN_COLLECTED)
        - All items COMPLETED → order COMPLETED (if currently IN_PROGRESS)
        """
        if self.status == "SPECIMEN_COLLECTED":
            has_in_progress = self.items.filter(status__in=["IN_PROGRESS", "COMPLETED"]).exists()
            if has_in_progress:
                self.status = "IN_PROGRESS"
                self.save(update_fields=["status"])
        elif self.status == "IN_PROGRESS":
            all_completed = (
                self.items.exists()
                and not self.items.exclude(status__in=["COMPLETED", "CANCELLED"]).exists()
            )
            if all_completed:
                self.status = "COMPLETED"
                self.completed_at = timezone.now()
                self.save(update_fields=["status", "completed_at"])

    def get_turnaround_time(self):
        """
        Calculate time from order to completion.

        Returns:
            timedelta or None: Time taken from order to completion
        """
        if self.completed_at:
            return self.completed_at - self.ordered_at
        return None

    def add_test(self, test_catalog, quantity: int = 1):
        """
        Add a test to this lab order and optionally create an invoice item.

        Creates a LabOrderItem linked to the test catalog. If the order has
        an encounter with an invoice, automatically creates an InvoiceItem.
        For standalone/walk-in orders (no encounter), only creates the order item.

        Args:
            test_catalog: The TestCatalog instance to add
            quantity: The quantity of the test (default 1)

        Returns:
            LabOrderItem: The created lab order item

        Raises:
            ValidationError: If the order is completed/cancelled
        """
        from decimal import Decimal

        # Validate order status
        if self.status in ["COMPLETED", "CANCELLED", "REJECTED"]:
            raise ValidationError(f"Cannot add tests to a {self.status.lower()} order.")

        # Create lab order item
        order_item = LabOrderItem.objects.create(
            lab_order=self,
            test=test_catalog,
            unit_cost=test_catalog.cost,
        )

        # Only bill if there's an encounter (skip for standalone/walk-in orders)
        if self.encounter_id:
            try:
                from hmis.apps.billing.models import Invoice, InvoiceItem

                invoice = Invoice.objects.filter(encounter=self.encounter).first()
                if invoice and invoice.status == Invoice.Status.DRAFT:
                    line_total = (test_catalog.cost * Decimal(str(quantity))).quantize(
                        Decimal("0.01")
                    )
                    InvoiceItem.objects.create(
                        invoice=invoice,
                        item_type=InvoiceItem.ItemType.LAB,
                        lab_order=self,
                        description=test_catalog.name,
                        quantity=quantity,
                        unit_price=test_catalog.cost,
                        line_total=line_total,
                        sha_code=test_catalog.loinc_code or "",
                    )
                    invoice.calculate_totals()
                    invoice.save(
                        update_fields=[
                            "subtotal",
                            "tax_amount",
                            "discount_amount",
                            "total_amount",
                            "balance_due",
                            "updated_at",
                        ]
                    )
            except Exception:
                logger.warning("Could not create invoice item for order %s", self.order_number)

        # Update order total cost
        self.calculate_total_cost()

        return order_item

    def cancel(self, user, reason: str):
        """
        Cancel the lab order and remove associated invoice items.

        Args:
            user: The user cancelling the order
            reason: The reason for cancellation

        Raises:
            ValidationError: If the order cannot be cancelled
        """
        # Validate order can be cancelled
        if self.status in ["COMPLETED", "CANCELLED"]:
            raise ValidationError(f"Cannot cancel a {self.status.lower()} order.")

        if self.status == "IN_PROGRESS" and self.items.filter(result__isnull=False).exists():
            # Check if any results have been entered
            raise ValidationError("Cannot cancel order with existing results.")

        # Store cancellation details
        self.status = "CANCELLED"
        self.cancellation_reason = reason
        self.cancelled_by = user
        self.cancelled_at = timezone.now()
        self.save(
            update_fields=[
                "status",
                "cancellation_reason",
                "cancelled_by",
                "cancelled_at",
                "updated_at",
            ]
        )

        # Remove invoice items if encounter exists (skip for standalone orders)
        if self.encounter_id:
            try:
                from hmis.apps.billing.models import Invoice

                invoice = Invoice.objects.filter(encounter=self.encounter).first()
                if invoice and invoice.status == Invoice.Status.DRAFT:
                    deleted_count, _ = invoice.items.filter(lab_order=self).delete()
                    if deleted_count > 0:
                        invoice.calculate_totals()
                        invoice.save(
                            update_fields=[
                                "subtotal",
                                "tax_amount",
                                "discount_amount",
                                "total_amount",
                                "balance_due",
                                "updated_at",
                            ]
                        )
            except Exception:
                logger.warning(
                    "Could not remove invoice items for cancelled order %s",
                    self.order_number,
                )

        # Cancel all order items
        self.items.update(status="CANCELLED")

        # Cancel all order items
        self.items.update(status="CANCELLED")


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

    def update_status_from_result(self):
        """
        Advance item status based on its result state.

        Called automatically when a result is created or verified.
        - Result entered → IN_PROGRESS
        - Result verified → COMPLETED
        Then cascades to the parent LabOrder.
        """
        if not self.has_result():
            return

        result = self.result
        if result.verification_status == "VERIFIED" and self.status != "COMPLETED":
            self.status = "COMPLETED"
            self.save(update_fields=["status"])
        elif self.status == "PENDING":
            self.status = "IN_PROGRESS"
            self.save(update_fields=["status"])

        self.lab_order.update_status_from_items()


class Specimen(models.Model):
    """Physical laboratory sample."""

    STATUS_CHOICES = [
        ("PENDING", "Pending Collection"),
        ("COLLECTED", "Collected"),
        ("RECEIVED", "Received at Lab"),
        ("PROCESSING", "Processing"),
        ("REJECTED", "Rejected"),
        ("STORED", "Stored"),
        ("DISPOSED", "Disposed"),
    ]

    # Identity
    barcode = models.CharField(max_length=50, unique=True, db_index=True)
    specimen_type = models.CharField(max_length=30, choices=SPECIMEN_TYPES)
    container_type = models.CharField(max_length=50, blank=True)

    # Linkage
    lab_order = models.ForeignKey(LabOrder, on_delete=models.CASCADE, related_name="specimens")
    order_items = models.ManyToManyField(LabOrderItem, related_name="specimens")

    # Collection
    collected_by = models.ForeignKey(User, null=True, on_delete=models.SET_NULL, related_name="+")
    collected_at = models.DateTimeField(null=True, blank=True)
    collection_site = models.CharField(max_length=100, blank=True)

    # Lab receipt
    received_by = models.ForeignKey(User, null=True, on_delete=models.SET_NULL, related_name="+")
    received_at = models.DateTimeField(null=True, blank=True)

    # Status
    status = models.CharField(
        max_length=20,
        choices=STATUS_CHOICES,
        default="PENDING",
    )
    rejection_reason = models.TextField(blank=True)

    # Storage
    storage_location = models.CharField(max_length=100, blank=True)
    storage_temperature = models.CharField(max_length=20, blank=True)

    # Audit
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["barcode"]),
            models.Index(fields=["status"]),
            models.Index(fields=["collected_at"]),
        ]

    def __str__(self):
        return f"{self.barcode} - {self.lab_order.order_number}"


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

    # Common lab result units
    RESULT_UNITS = [
        # Concentrations
        ("g/dL", "g/dL"),
        ("g/L", "g/L"),
        ("mg/dL", "mg/dL"),
        ("mg/L", "mg/L"),
        ("µg/dL", "µg/dL"),
        ("µg/L", "µg/L"),
        ("ng/dL", "ng/dL"),
        ("ng/mL", "ng/mL"),
        ("pg/mL", "pg/mL"),
        # Molar concentrations
        ("mmol/L", "mmol/L"),
        ("µmol/L", "µmol/L"),
        ("nmol/L", "nmol/L"),
        ("mEq/L", "mEq/L"),
        # Enzyme activity
        ("U/L", "U/L"),
        ("IU/L", "IU/L"),
        ("mU/L", "mU/L"),
        # Cell counts
        ("cells/µL", "cells/µL"),
        ("x10^9/L", "x10⁹/L"),
        ("x10^12/L", "x10¹²/L"),
        ("x10^6/µL", "x10⁶/µL"),
        ("/µL", "/µL"),
        # Percentages
        ("%", "%"),
        # Time
        ("sec", "seconds"),
        ("min", "minutes"),
        # Other
        ("mm/hr", "mm/hr"),
        ("mOsm/kg", "mOsm/kg"),
        ("ratio", "ratio"),
        ("index", "index"),
        ("titer", "titer"),
        ("copies/mL", "copies/mL"),
        ("CFU/mL", "CFU/mL"),
    ]

    # Relationships
    order_item = models.OneToOneField(LabOrderItem, on_delete=models.CASCADE, related_name="result")
    specimen = models.ForeignKey(
        Specimen,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="results",
    )

    # Result data
    numeric_value = models.DecimalField(max_digits=15, decimal_places=4, null=True, blank=True)
    text_value = models.TextField(blank=True)
    option_value = models.CharField(max_length=100, blank=True, help_text="For predefined options")
    result_unit = models.CharField(
        max_length=20, choices=RESULT_UNITS, blank=True, help_text="Unit of measurement"
    )

    # Reference range tracking (NEW - Phase 1.3)
    reference_low = models.DecimalField(
        max_digits=12,
        decimal_places=4,
        null=True,
        blank=True,
        help_text="Lower bound of reference range",
    )
    reference_high = models.DecimalField(
        max_digits=12,
        decimal_places=4,
        null=True,
        blank=True,
        help_text="Upper bound of reference range",
    )
    reference_range_text = models.CharField(
        max_length=100, blank=True, help_text="Human-readable reference range"
    )

    # Interpretation
    result_flag = models.CharField(max_length=20, choices=RESULT_FLAGS, blank=True)
    interpretation = models.TextField(blank=True, help_text="Pathologist notes")
    is_critical_result = models.BooleanField(
        default=False, help_text="Requires immediate attention"
    )

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
    original_value = models.CharField(
        max_length=100, blank=True, help_text="Original value before amendment"
    )
    amended_by = models.ForeignKey(
        User,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="amended_results",
        help_text="User who amended result",
    )
    amended_at = models.DateTimeField(null=True, blank=True, help_text="When result was amended")

    # External results
    is_external_result = models.BooleanField(default=False)
    external_result_attachment = models.FileField(
        upload_to="lab_results/",
        null=True,
        blank=True,
        validators=[_validate_document_upload],
    )
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

    def verify(self, user, validation_type: str = "TECHNICAL", comment: str = ""):
        """
        Mark result as verified via technical validation.

        For backward compatibility, this creates a technical validation
        and updates overall status. Use add_validation() for explicit
        two-stage validation.

        Args:
            user: User verifying the result
            validation_type: TECHNICAL or CLINICAL (default: TECHNICAL)
            comment: Optional comment for the validation
        """
        # Create validation record
        self.add_validation(
            validation_type=validation_type,
            status="APPROVED",
            validated_by=user,
            comment=comment,
        )
        # Update derived fields for backward compatibility
        self._update_verification_status()

    def add_validation(
        self,
        validation_type: str,
        status: str,
        validated_by,
        comment: str = "",
    ):
        """
        Add a validation record (technical or clinical).

        Args:
            validation_type: TECHNICAL or CLINICAL
            status: APPROVED, REJECTED, or PENDING
            validated_by: User performing the validation
            comment: Optional comment

        Returns:
            ResultValidation: The created validation record
        """
        return ResultValidation.objects.create(
            result=self,
            validation_type=validation_type,
            status=status,
            validated_by=validated_by,
            comment=comment,
        )

    def _update_verification_status(self):
        """
        Derive verification_status from validations.

        Business rules:
        - If any validation is REJECTED → REJECTED
        - If test requires clinical sign-off and no CLINICAL approval → UNVERIFIED
        - If no TECHNICAL approval → UNVERIFIED
        - If all required validations are APPROVED → VERIFIED
        """
        validations = self.validations.all()

        # Check for rejections first
        if validations.filter(status="REJECTED").exists():
            self.verification_status = "REJECTED"
            # Set verified_by to the rejecting user
            rejection = validations.filter(status="REJECTED").order_by("-validated_at").first()
            if rejection:
                self.verified_by = rejection.validated_by
                self.verified_at = rejection.validated_at
            self.save(update_fields=["verification_status", "verified_by", "verified_at"])
            return

        # Check for technical approval
        technical_approved = validations.filter(
            validation_type="TECHNICAL", status="APPROVED"
        ).exists()

        # Check if clinical sign-off is required
        requires_clinical = self.order_item.test.requires_clinical_signoff
        clinical_approved = validations.filter(
            validation_type="CLINICAL", status="APPROVED"
        ).exists()

        # Determine final status
        if technical_approved and (not requires_clinical or clinical_approved):
            self.verification_status = "VERIFIED"
            # Set verified_by to the most recent approver
            last_approval = validations.filter(status="APPROVED").order_by("-validated_at").first()
            if last_approval:
                self.verified_by = last_approval.validated_by
                self.verified_at = last_approval.validated_at
        else:
            self.verification_status = "UNVERIFIED"
            self.verified_by = None
            self.verified_at = None

        self.save(update_fields=["verification_status", "verified_by", "verified_at"])

        # Cascade status to parent item and order
        self.order_item.update_status_from_result()

    def get_validation_summary(self) -> dict:
        """
        Get summary of all validations for this result.

        Returns:
            dict: Validation summary including status and requirements
        """
        validations = self.validations.all()
        requires_clinical = self.order_item.test.requires_clinical_signoff

        technical = validations.filter(validation_type="TECHNICAL").first()
        clinical = validations.filter(validation_type="CLINICAL").first()

        return {
            "requires_clinical_signoff": requires_clinical,
            "technical_validation": {
                "status": technical.status if technical else "PENDING",
                "validated_by": (
                    technical.validated_by.get_full_name()
                    if technical and technical.validated_by
                    else None
                ),
                "validated_at": technical.validated_at if technical else None,
                "comment": technical.comment if technical else "",
            },
            "clinical_validation": (
                {
                    "status": clinical.status if clinical else "PENDING",
                    "validated_by": (
                        clinical.validated_by.get_full_name()
                        if clinical and clinical.validated_by
                        else None
                    ),
                    "validated_at": clinical.validated_at if clinical else None,
                    "comment": clinical.comment if clinical else "",
                }
                if requires_clinical
                else None
            ),
        }


class ResultValidation(models.Model):
    """
    Validation/approval record for a lab result.

    Supports two-stage validation workflow:
    - Technical validation: Lab technician reviews result accuracy
    - Clinical sign-off: Pathologist approves interpretation (for complex tests)

    Phase L2 implementation as per lis-evolution.md
    """

    class ValidationType(models.TextChoices):
        TECHNICAL = "TECHNICAL", "Technical Review"
        CLINICAL = "CLINICAL", "Clinical Sign-off"

    class ValidationStatus(models.TextChoices):
        PENDING = "PENDING", "Pending"
        APPROVED = "APPROVED", "Approved"
        REJECTED = "REJECTED", "Rejected"

    result = models.ForeignKey(
        LabResult,
        on_delete=models.CASCADE,
        related_name="validations",
    )
    validation_type = models.CharField(
        max_length=20,
        choices=ValidationType.choices,
    )
    status = models.CharField(
        max_length=20,
        choices=ValidationStatus.choices,
        default=ValidationStatus.PENDING,
    )
    validated_by = models.ForeignKey(
        User,
        on_delete=models.PROTECT,
        related_name="result_validations",
    )
    validated_at = models.DateTimeField(auto_now_add=True)
    comment = models.TextField(blank=True)

    class Meta:
        verbose_name = "Result Validation"
        verbose_name_plural = "Result Validations"
        ordering = ["-validated_at"]
        # Ensure only one validation per type per result
        constraints = [
            models.UniqueConstraint(
                fields=["result", "validation_type"],
                name="unique_validation_per_type",
            )
        ]
        indexes = [
            models.Index(fields=["result", "validation_type"]),
        ]

    def __str__(self):
        return f"{self.get_validation_type_display()} - {self.get_status_display()} for Result #{self.result_id}"


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
    address = models.TextField(blank=True)
    contact_person = models.CharField(max_length=100, blank=True)
    phone = models.CharField(max_length=20, blank=True)
    email = models.EmailField(blank=True)
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
