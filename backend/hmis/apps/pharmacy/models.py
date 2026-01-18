"""
Pharmacy models for Vitora HMIS.

This module contains all pharmacy-related models including:
- Drug: Master catalog of medications
- StockBatch: Individual batches of drug stock
- StockAlert: Stock-related alerts and notifications
- Prescription: Prescriptions from encounters
- PrescriptionItem: Individual items in prescriptions
- Dispensing: Drug dispensing records
- StockAdjustment: Non-dispensing stock changes

All models follow TDD approach and Kenya healthcare requirements.
"""

from datetime import date, datetime, timedelta
from decimal import Decimal

from django.apps import apps
from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import models
from django.utils import timezone


def generate_prescription_number():
    """
    Generate a unique Prescription Number.

    Format: RX-YYYYMMDD-XXXX
    Where XXXX is a 4-digit sequential number for the day.

    Returns:
        str: A unique prescription number string
    """
    today = datetime.now().strftime("%Y%m%d")
    prefix = f"RX-{today}-"

    # Get the Prescription model via the app registry to avoid circular imports
    Prescription = apps.get_model("pharmacy", "Prescription")

    # Find the highest prescription number for today
    latest_prescription = (
        Prescription.objects.filter(prescription_number__startswith=prefix)
        .order_by("-prescription_number")
        .first()
    )

    if latest_prescription:
        # Extract the sequence number and increment
        last_sequence = int(latest_prescription.prescription_number.split("-")[-1])
        sequence = last_sequence + 1
    else:
        # First prescription of the day
        sequence = 1

    return f"{prefix}{sequence:04d}"


class Drug(models.Model):
    """Drug master catalog entry."""

    DRUG_FORMS = [
        ("TABLET", "Tablet"),
        ("CAPSULE", "Capsule"),
        ("SYRUP", "Syrup"),
        ("INJECTION", "Injection"),
        ("CREAM", "Cream"),
        ("OINTMENT", "Ointment"),
        ("DROPS", "Drops"),
        ("INHALER", "Inhaler"),
        ("SUPPOSITORY", "Suppository"),
        ("POWDER", "Powder"),
        ("SUSPENSION", "Suspension"),
        ("SOLUTION", "Solution"),
        ("GEL", "Gel"),
        ("PATCH", "Patch"),
        ("SPRAY", "Spray"),
    ]

    DRUG_CATEGORIES = [
        ("ANALGESIC", "Analgesics & Antipyretics"),
        ("ANTIBIOTIC", "Antibiotics"),
        ("ANTIMALARIAL", "Antimalarials"),
        ("ANTIRETROVIRAL", "Antiretrovirals"),
        ("ANTIHYPERTENSIVE", "Antihypertensives"),
        ("ANTIDIABETIC", "Antidiabetics"),
        ("ANTIHISTAMINE", "Antihistamines"),
        ("VITAMIN", "Vitamins & Supplements"),
        ("VACCINE", "Vaccines"),
        ("CONTRACEPTIVE", "Contraceptives"),
        ("PSYCHOTROPIC", "Psychotropic Drugs"),
        ("CONTROLLED", "Controlled Substances"),
        ("OTHER", "Other"),
    ]

    SCHEDULE_CHOICES = [
        ("OTC", "Over The Counter"),
        ("POM", "Prescription Only Medicine"),
        ("P", "Pharmacy Only"),
        ("CD", "Controlled Drug"),
    ]

    # Identity
    code = models.CharField(max_length=50, unique=True)
    generic_name = models.CharField(max_length=200)
    brand_names = models.JSONField(default=list, blank=True)

    # Classification
    category = models.CharField(max_length=30, choices=DRUG_CATEGORIES)
    form = models.CharField(max_length=20, choices=DRUG_FORMS)
    strength = models.CharField(max_length=150)  # Some strengths are long (e.g., combo packs)
    unit = models.CharField(max_length=20)

    # Scheduling
    schedule = models.CharField(max_length=10, choices=SCHEDULE_CHOICES, default="POM")
    requires_prescription = models.BooleanField(default=True)
    is_controlled = models.BooleanField(default=False)
    is_narcotic = models.BooleanField(default=False)

    # Kenya-specific
    keml_code = models.CharField(max_length=20, blank=True)
    is_essential = models.BooleanField(default=False)
    nhif_code = models.CharField(max_length=20, blank=True)

    # Inventory hints
    default_reorder_level = models.PositiveIntegerField(default=50)
    default_reorder_quantity = models.PositiveIntegerField(default=100)
    shelf_life_months = models.PositiveIntegerField(null=True, blank=True)
    storage_requirements = models.TextField(blank=True)

    # Pricing (reference only - actual price per batch)
    reference_price = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)

    # Status
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["generic_name", "strength"]
        indexes = [
            models.Index(fields=["generic_name"]),
            models.Index(fields=["category"]),
            models.Index(fields=["keml_code"]),
        ]

    def __str__(self):
        return f"{self.generic_name} {self.strength} ({self.form})"

    def get_display_name(self) -> str:
        """Return formatted display name with generic name, strength, and form."""
        return f"{self.generic_name} {self.strength} {self.get_form_display()}"

    def get_current_stock(self) -> int:
        """Get total available stock across all batches."""
        return (
            self.batches.filter(status="AVAILABLE").aggregate(
                total=models.Sum("quantity_available")
            )["total"]
            or 0
        )


class StockBatch(models.Model):
    """Individual batch of drug stock."""

    STOCK_STATUS = [
        ("AVAILABLE", "Available"),
        ("LOW", "Low Stock"),
        ("OUT_OF_STOCK", "Out of Stock"),
        ("EXPIRED", "Expired"),
        ("QUARANTINE", "Quarantine"),
        ("RECALLED", "Recalled"),
    ]

    drug = models.ForeignKey(Drug, on_delete=models.PROTECT, related_name="batches")

    # Batch identification
    batch_number = models.CharField(max_length=50)
    barcode = models.CharField(max_length=100, blank=True)

    # Quantities
    quantity_received = models.PositiveIntegerField()
    quantity_available = models.PositiveIntegerField()
    quantity_dispensed = models.PositiveIntegerField(default=0)
    quantity_damaged = models.PositiveIntegerField(default=0)
    quantity_expired = models.PositiveIntegerField(default=0)

    # Dates
    manufacture_date = models.DateField(null=True, blank=True)
    expiry_date = models.DateField()
    received_date = models.DateField()

    # Pricing
    cost_price = models.DecimalField(max_digits=10, decimal_places=2)
    selling_price = models.DecimalField(max_digits=10, decimal_places=2)

    # Source
    supplier = models.CharField(max_length=200, blank=True)
    purchase_order = models.CharField(max_length=50, blank=True)
    received_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        related_name="received_batches",
    )

    # Status
    status = models.CharField(max_length=20, choices=STOCK_STATUS, default="AVAILABLE")
    location = models.CharField(max_length=100, blank=True)

    # Tracking
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["expiry_date", "received_date"]  # FEFO ordering
        unique_together = ["drug", "batch_number"]
        indexes = [
            models.Index(fields=["expiry_date"]),
            models.Index(fields=["status"]),
        ]

    def __str__(self):
        return f"{self.drug.generic_name} - Batch {self.batch_number}"

    def is_expired(self) -> bool:
        """Check if batch is expired."""
        return self.expiry_date < date.today()

    def days_to_expiry(self) -> int:
        """Calculate days until expiry."""
        delta = self.expiry_date - date.today()
        return delta.days

    def is_low_stock(self) -> bool:
        """Check if batch is below drug's reorder level."""
        return self.quantity_available < self.drug.default_reorder_level

    def dispense(self, quantity: int) -> None:
        """
        Reduce available stock by dispensing quantity.

        Args:
            quantity: Amount to dispense

        Raises:
            ValueError: If quantity exceeds available stock
        """
        if quantity > self.quantity_available:
            raise ValueError(
                f"Cannot dispense {quantity} units. Only {self.quantity_available} available."
            )

        self.quantity_available -= quantity
        self.quantity_dispensed += quantity
        self.save()

    def return_stock(self, quantity: int) -> None:
        """
        Increase available stock from returns.

        Args:
            quantity: Amount to return
        """
        self.quantity_available += quantity
        self.quantity_dispensed -= quantity
        self.save()

    def mark_expired(self) -> None:
        """Mark batch as expired and move available quantity to expired."""
        self.quantity_expired = self.quantity_available
        self.quantity_available = 0
        self.status = "EXPIRED"
        self.save()

    def mark_damaged(self, quantity: int, reason: str = "") -> None:
        """
        Mark quantity as damaged.

        Args:
            quantity: Amount damaged
            reason: Reason for damage
        """
        if quantity > self.quantity_available:
            raise ValueError(
                f"Cannot mark {quantity} as damaged. Only {self.quantity_available} available."
            )

        self.quantity_damaged += quantity
        self.quantity_available -= quantity
        self.save()

    def get_value(self) -> Decimal:
        """Calculate total value of remaining stock based on cost price."""
        return self.quantity_available * self.cost_price


class StockAlert(models.Model):
    """Stock-related alerts and notifications."""

    ALERT_TYPES = [
        ("LOW_STOCK", "Low Stock"),
        ("OUT_OF_STOCK", "Out of Stock"),
        ("EXPIRING_SOON", "Expiring Soon"),
        ("EXPIRED", "Expired"),
        ("RECALLED", "Product Recalled"),
    ]

    ALERT_SEVERITY = [
        ("LOW", "Low"),
        ("MEDIUM", "Medium"),
        ("HIGH", "High"),
        ("CRITICAL", "Critical"),
    ]

    drug = models.ForeignKey(Drug, on_delete=models.CASCADE, related_name="alerts")
    batch = models.ForeignKey(StockBatch, on_delete=models.CASCADE, null=True, blank=True)

    alert_type = models.CharField(max_length=20, choices=ALERT_TYPES)
    severity = models.CharField(max_length=10, choices=ALERT_SEVERITY)
    message = models.TextField()

    # Resolution
    is_acknowledged = models.BooleanField(default=False)
    acknowledged_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="acknowledged_alerts",
    )
    acknowledged_at = models.DateTimeField(null=True, blank=True)

    is_resolved = models.BooleanField(default=False)
    resolved_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="resolved_alerts",
    )
    resolved_at = models.DateTimeField(null=True, blank=True)
    resolution_notes = models.TextField(blank=True)

    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-severity", "-created_at"]

    def __str__(self):
        return f"{self.alert_type} - {self.drug.generic_name}"

    def acknowledge(self, user) -> None:
        """Mark alert as acknowledged by user."""
        self.is_acknowledged = True
        self.acknowledged_by = user
        self.acknowledged_at = timezone.now()
        self.save()

    def resolve(self, user, notes: str = "") -> None:
        """Mark alert as resolved with optional notes."""
        self.is_resolved = True
        self.resolved_by = user
        self.resolved_at = timezone.now()
        self.resolution_notes = notes
        self.save()

    @classmethod
    def generate_low_stock_alerts(cls) -> list["StockAlert"]:
        """Generate alerts for drugs with low stock levels."""

        alerts = []

        # Get all drugs with total stock below reorder level
        for drug in Drug.objects.filter(is_active=True):
            total_stock = drug.get_current_stock()

            if total_stock == 0:
                # Out of stock - critical
                alert, created = cls.objects.get_or_create(
                    drug=drug,
                    alert_type="OUT_OF_STOCK",
                    is_resolved=False,
                    defaults={
                        "severity": "CRITICAL",
                        "message": f"{drug.generic_name} is completely out of stock",
                    },
                )
                if created:
                    alerts.append(alert)
            elif total_stock < drug.default_reorder_level:
                # Low stock
                alert, created = cls.objects.get_or_create(
                    drug=drug,
                    alert_type="LOW_STOCK",
                    is_resolved=False,
                    defaults={
                        "severity": "MEDIUM",
                        "message": f"{drug.generic_name} is below reorder level ({total_stock} remaining)",
                    },
                )
                if created:
                    alerts.append(alert)

        return alerts

    @classmethod
    def generate_expiry_alerts(cls) -> list["StockAlert"]:
        """Generate alerts for expiring and expired batches."""
        from django.conf import settings

        alerts = []
        expiry_warning_days = settings.PHARMACY_SETTINGS.get("EXPIRY_WARNING_DAYS", 90)
        critical_expiry_days = settings.PHARMACY_SETTINGS.get("CRITICAL_EXPIRY_DAYS", 30)

        # Get batches expiring soon or expired
        today = date.today()
        warning_date = today + timedelta(days=expiry_warning_days)
        critical_date = today + timedelta(days=critical_expiry_days)

        for batch in StockBatch.objects.filter(
            status__in=["AVAILABLE", "LOW"], quantity_available__gt=0
        ):
            if batch.expiry_date < today:
                # Expired
                alert, created = cls.objects.get_or_create(
                    drug=batch.drug,
                    batch=batch,
                    alert_type="EXPIRED",
                    is_resolved=False,
                    defaults={
                        "severity": "CRITICAL",
                        "message": f"Batch {batch.batch_number} has expired",
                    },
                )
                if created:
                    alerts.append(alert)
            elif batch.expiry_date <= critical_date:
                # Expiring within critical period
                days = batch.days_to_expiry()
                alert, created = cls.objects.get_or_create(
                    drug=batch.drug,
                    batch=batch,
                    alert_type="EXPIRING_SOON",
                    is_resolved=False,
                    defaults={
                        "severity": "HIGH",
                        "message": f"Batch {batch.batch_number} expiring in {days} days",
                    },
                )
                if created:
                    alerts.append(alert)
            elif batch.expiry_date <= warning_date:
                # Expiring within warning period
                days = batch.days_to_expiry()
                alert, created = cls.objects.get_or_create(
                    drug=batch.drug,
                    batch=batch,
                    alert_type="EXPIRING_SOON",
                    is_resolved=False,
                    defaults={
                        "severity": "MEDIUM",
                        "message": f"Batch {batch.batch_number} expiring in {days} days",
                    },
                )
                if created:
                    alerts.append(alert)

        return alerts


class Prescription(models.Model):
    """Prescription for a patient encounter."""

    PRESCRIPTION_STATUS = [
        ("PENDING", "Pending"),
        ("PARTIAL", "Partially Dispensed"),
        ("DISPENSED", "Fully Dispensed"),
        ("CANCELLED", "Cancelled"),
        ("EXPIRED", "Expired"),
    ]

    # Prescription number (auto-generated)
    prescription_number = models.CharField(
        max_length=50,
        unique=True,
        editable=False,
        help_text="Prescription Number (auto-generated, format: RX-YYYYMMDD-XXXX)",
    )

    # Links
    encounter = models.ForeignKey(
        "encounters.Encounter",
        on_delete=models.PROTECT,
        related_name="prescriptions",
        null=True,
        blank=True,
        help_text="Optional - can be null for walk-in pharmacy prescriptions",
    )
    patient = models.ForeignKey(
        "patients.Patient", on_delete=models.PROTECT, related_name="prescriptions"
    )

    # Prescriber
    prescribed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="prescriptions_written",
    )
    prescribed_at = models.DateTimeField(auto_now_add=True)

    # Validity
    valid_until = models.DateField()  # Typically 30 days from prescription

    # Status
    status = models.CharField(max_length=20, choices=PRESCRIPTION_STATUS, default="PENDING")

    # Notes
    clinical_notes = models.TextField(blank=True)  # For pharmacist

    # Tracking
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-prescribed_at"]
        indexes = [
            models.Index(fields=["prescription_number"]),
            models.Index(fields=["status"]),
        ]

    def __str__(self):
        return f"{self.prescription_number} - {self.patient}"

    def save(self, *args, **kwargs):
        """Override save to auto-generate prescription number."""
        if not self.prescription_number:
            self.prescription_number = generate_prescription_number()
        super().save(*args, **kwargs)

    def is_valid(self) -> bool:
        """Check if prescription has not expired."""
        return self.valid_until >= date.today() and self.status != "EXPIRED"

    def is_fully_dispensed(self) -> bool:
        """Check if all items have been fully dispensed."""
        for item in self.items.all():
            if not item.is_cancelled and item.quantity_dispensed < item.quantity:
                return False
        return True

    def get_remaining_items(self) -> list["PrescriptionItem"]:
        """Get items that are not fully dispensed."""
        return [
            item
            for item in self.items.all()
            if not item.is_cancelled and item.quantity_dispensed < item.quantity
        ]

    def cancel(self, reason: str) -> None:
        """Cancel prescription with reason."""
        self.status = "CANCELLED"
        for item in self.items.all():
            item.cancel(reason)
        self.save()

    def update_status(self) -> None:
        """Auto-update status based on items."""
        if self.status == "CANCELLED":
            return

        total_items = self.items.filter(is_cancelled=False).count()
        if total_items == 0:
            return

        fully_dispensed = sum(
            1
            for item in self.items.filter(is_cancelled=False)
            if item.quantity_dispensed >= item.quantity
        )
        partially_dispensed = sum(
            1
            for item in self.items.filter(is_cancelled=False)
            if 0 < item.quantity_dispensed < item.quantity
        )

        if fully_dispensed == total_items:
            self.status = "DISPENSED"
        elif partially_dispensed > 0 or fully_dispensed > 0:
            self.status = "PARTIAL"
        else:
            self.status = "PENDING"

        self.save()


class PrescriptionItem(models.Model):
    """Individual drug item in a prescription."""

    prescription = models.ForeignKey(Prescription, on_delete=models.CASCADE, related_name="items")
    drug = models.ForeignKey(Drug, on_delete=models.PROTECT)

    # Dosage instructions
    quantity = models.PositiveIntegerField()  # Total quantity to dispense
    dosage = models.CharField(max_length=100)  # e.g., "1 tablet"
    frequency = models.CharField(max_length=100)  # e.g., "3 times daily"
    duration = models.CharField(max_length=50)  # e.g., "7 days"
    route = models.CharField(max_length=50, blank=True)  # e.g., "Oral", "IV"
    instructions = models.TextField(blank=True)  # e.g., "Take after meals"

    # Dispensing tracking
    quantity_dispensed = models.PositiveIntegerField(default=0)
    is_substitutable = models.BooleanField(default=True)  # Allow generic substitution

    # Status
    is_cancelled = models.BooleanField(default=False)
    cancellation_reason = models.TextField(blank=True)

    def __str__(self):
        return f"{self.drug.generic_name} - {self.quantity} {self.drug.unit}"

    def cancel(self, reason: str) -> None:
        """Cancel prescription item with reason."""
        self.is_cancelled = True
        self.cancellation_reason = reason
        self.save()

    def remaining_quantity(self) -> int:
        """Get remaining quantity to be dispensed."""
        return self.quantity - self.quantity_dispensed


class Dispensing(models.Model):
    """Drug dispensing record."""

    prescription_item = models.ForeignKey(
        PrescriptionItem,
        on_delete=models.PROTECT,
        related_name="dispensings",
        null=True,
        blank=True,
    )

    # Direct dispense (OTC, emergency)
    patient = models.ForeignKey(
        "patients.Patient", on_delete=models.PROTECT, related_name="dispensings"
    )
    drug = models.ForeignKey(Drug, on_delete=models.PROTECT)

    # Batch tracking (FEFO)
    batch = models.ForeignKey(StockBatch, on_delete=models.PROTECT, related_name="dispensings")

    # Quantities
    quantity_dispensed = models.PositiveIntegerField()
    quantity_returned = models.PositiveIntegerField(default=0)

    # Pricing
    unit_price = models.DecimalField(max_digits=10, decimal_places=2)
    total_price = models.DecimalField(max_digits=12, decimal_places=2)
    discount = models.DecimalField(max_digits=10, decimal_places=2, default=0)

    # Instructions given
    instructions_given = models.TextField(blank=True)
    patient_counseled = models.BooleanField(default=False)

    # Dispensed by
    dispensed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="dispensings",
    )
    dispensed_at = models.DateTimeField(auto_now_add=True)

    # Verification (for controlled substances)
    verified_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="verified_dispensings",
    )
    verified_at = models.DateTimeField(null=True, blank=True)

    # Notes
    notes = models.TextField(blank=True)

    # Tracking
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-dispensed_at"]

    def __str__(self):
        return f"{self.drug.generic_name} - {self.quantity_dispensed} {self.drug.unit} to {self.patient}"

    def clean(self):
        """Validate dispensing before save."""
        super().clean()

        # Validate quantity against available stock
        if self.quantity_dispensed > self.batch.quantity_available:
            raise ValidationError(
                f"Cannot dispense {self.quantity_dispensed} units. "
                f"Only {self.batch.quantity_available} available in batch."
            )

    def save(self, *args, **kwargs):
        """Override save to update batch stock."""
        is_new = self.pk is None

        if is_new:
            # Full clean validation
            self.full_clean()

            # Reduce batch stock
            self.batch.dispense(self.quantity_dispensed)

            # Update prescription item if linked
            if self.prescription_item:
                self.prescription_item.quantity_dispensed += self.quantity_dispensed
                self.prescription_item.save()

                # Update prescription status
                self.prescription_item.prescription.update_status()

        super().save(*args, **kwargs)

    def process_return(self, quantity: int, reason: str) -> None:
        """
        Handle drug returns.

        Args:
            quantity: Amount being returned
            reason: Reason for return
        """
        if quantity > self.quantity_dispensed - self.quantity_returned:
            raise ValueError(
                f"Cannot return {quantity} units. "
                f"Only {self.quantity_dispensed - self.quantity_returned} were dispensed."
            )

        # Update return quantity
        self.quantity_returned += quantity

        # Update notes
        if self.notes:
            self.notes += f"\n\nReturn: {quantity} units - {reason}"
        else:
            self.notes = f"Return: {quantity} units - {reason}"

        self.save()

        # Restore batch stock
        self.batch.return_stock(quantity)

        # Update prescription item if linked
        if self.prescription_item:
            self.prescription_item.quantity_dispensed -= quantity
            self.prescription_item.save()

            # Update prescription status
            self.prescription_item.prescription.update_status()

    def requires_verification(self) -> bool:
        """Check if drug requires second pharmacist verification."""
        return self.drug.is_controlled

    def verify(self, user) -> None:
        """
        Second pharmacist verification for controlled drugs.

        Args:
            user: User performing verification (must be different from dispenser)
        """
        if user == self.dispensed_by:
            raise ValueError("Verification must be performed by a different user.")

        self.verified_by = user
        self.verified_at = timezone.now()
        self.save()

    def calculate_total(self) -> Decimal:
        """Calculate total price: (unit_price × quantity) - discount."""
        return (self.unit_price * self.quantity_dispensed) - self.discount


class StockAdjustment(models.Model):
    """Record of stock adjustment (non-dispensing)."""

    ADJUSTMENT_TYPES = [
        ("DAMAGE", "Damaged Stock"),
        ("LOSS", "Stock Loss/Theft"),
        ("EXPIRED", "Expired Stock"),
        ("RETURN_SUPPLIER", "Return to Supplier"),
        ("TRANSFER_OUT", "Transfer Out"),
        ("TRANSFER_IN", "Transfer In"),
        ("COUNT_CORRECTION", "Physical Count Correction"),
        ("SAMPLE", "Sample/Demo"),
    ]

    batch = models.ForeignKey(StockBatch, on_delete=models.PROTECT, related_name="adjustments")
    adjustment_type = models.CharField(max_length=20, choices=ADJUSTMENT_TYPES)

    quantity = models.IntegerField()  # Positive = increase, Negative = decrease
    reason = models.TextField()

    # Documentation
    reference_number = models.CharField(max_length=50, blank=True)  # e.g., return note number

    adjusted_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="stock_adjustments",
    )
    adjusted_at = models.DateTimeField(auto_now_add=True)

    # Approval (for significant adjustments)
    requires_approval = models.BooleanField(default=False)
    approved_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="approved_adjustments",
    )
    approved_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-adjusted_at"]

    def __str__(self):
        return f"{self.adjustment_type} - {self.quantity} units on {self.batch.batch_number}"

    def clean(self):
        """Validate adjustment before save."""
        super().clean()

        # Check if negative adjustment would make stock go below zero
        if self.quantity < 0:
            new_quantity = self.batch.quantity_available + self.quantity
            if new_quantity < 0:
                raise ValidationError(
                    f"Cannot adjust by {self.quantity}. "
                    f"Would result in negative stock ({new_quantity})."
                )

    def save(self, *args, **kwargs):
        """Override save to update batch stock."""
        is_new = self.pk is None

        if is_new:
            # Full clean validation
            self.full_clean()

            # Update batch stock
            if self.quantity < 0:
                # Negative adjustment - reduce stock
                self.batch.quantity_available += self.quantity
                self.batch.quantity_damaged += abs(self.quantity)
            else:
                # Positive adjustment - increase stock
                self.batch.quantity_available += self.quantity

            self.batch.save()

        super().save(*args, **kwargs)

    def approve(self, user) -> None:
        """
        Approve adjustment.

        Args:
            user: User approving the adjustment
        """
        self.approved_by = user
        self.approved_at = timezone.now()
        self.save()


class AlertSettings(models.Model):
    """
    Global alert configuration settings.

    Stores configuration for automated alert generation including
    thresholds for low stock and expiry warnings.

    Only one instance should exist (enforced at application level).
    """

    # Stock alert thresholds
    low_stock_threshold = models.IntegerField(
        default=100, help_text="Generate alert when stock falls below this quantity"
    )

    # Expiry warning periods (in days)
    expiry_warning_days = models.IntegerField(
        default=90, help_text="Days before expiry to generate warning alert"
    )
    expiry_critical_days = models.IntegerField(
        default=30, help_text="Days before expiry to generate critical alert"
    )

    # Email notification settings
    enable_email_notifications = models.BooleanField(
        default=False, help_text="Enable email notifications for critical alerts"
    )
    notification_email_recipients = models.TextField(
        blank=True, help_text="Comma-separated list of email addresses to notify"
    )

    # Metadata
    updated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        related_name="alert_settings_updates",
    )
    updated_at = models.DateTimeField(auto_now=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = "Alert Settings"
        verbose_name_plural = "Alert Settings"

    def __str__(self):
        return f"Alert Settings (Updated: {self.updated_at})"

    def clean(self):
        """Validate settings."""
        if self.low_stock_threshold < 0:
            raise ValidationError("Low stock threshold must be non-negative")

        if self.expiry_warning_days < 0:
            raise ValidationError("Expiry warning days must be non-negative")

        if self.expiry_critical_days < 0:
            raise ValidationError("Expiry critical days must be non-negative")

        if self.expiry_critical_days >= self.expiry_warning_days:
            raise ValidationError("Critical days should be less than warning days")

    @classmethod
    def get_settings(cls):
        """
        Get or create the singleton alert settings instance.

        Returns:
            AlertSettings: The alert settings instance
        """
        settings, created = cls.objects.get_or_create(pk=1)
        return settings
