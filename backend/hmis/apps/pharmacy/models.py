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

from datetime import date, timedelta
from decimal import Decimal
from typing import List, Tuple

from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import models
from django.utils import timezone


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
    strength = models.CharField(max_length=50)
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
    reference_price = models.DecimalField(
        max_digits=10, decimal_places=2, null=True, blank=True
    )

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
        return self.batches.filter(status="AVAILABLE").aggregate(
            total=models.Sum("quantity_available")
        )["total"] or 0


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
            raise ValueError(f"Cannot mark {quantity} as damaged. Only {self.quantity_available} available.")
        
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
    batch = models.ForeignKey(
        StockBatch, on_delete=models.CASCADE, null=True, blank=True
    )

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
    def generate_low_stock_alerts(cls) -> List["StockAlert"]:
        """Generate alerts for drugs with low stock levels."""
        from django.conf import settings
        
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
                    }
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
                    }
                )
                if created:
                    alerts.append(alert)
        
        return alerts

    @classmethod
    def generate_expiry_alerts(cls) -> List["StockAlert"]:
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
            status__in=["AVAILABLE", "LOW"],
            quantity_available__gt=0
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
                    }
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
                    }
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
                    }
                )
                if created:
                    alerts.append(alert)
        
        return alerts

