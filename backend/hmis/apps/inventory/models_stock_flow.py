# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
# ruff: noqa
"""Inventory models stock flow for Vitora HMIS.

What this file is for:
- Implement models stock flow logic for the inventory domain.

How to use it:
- Import classes and functions from this module in Django app code and tests.

Supported inputs/args:
- Python imports and Django ORM/runtime inputs; no standalone CLI arguments.
"""

from datetime import datetime

from django.apps import apps
from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import models
from django.utils import timezone

from hmis.apps.core.mixins import FacilityScopedModel, OrganizationScopedModel
from hmis.apps.core.models import TimeStampedModel

# ---------------------------------------------------------------------------
# Auto-number generators
# ---------------------------------------------------------------------------


def generate_transfer_number():
    """Generate a unique Stock Transfer number: TRF-YYYYMMDD-XXXX."""
    today = datetime.now().strftime("%Y%m%d")
    prefix = f"TRF-{today}-"
    StockTransfer = apps.get_model("inventory", "StockTransfer")
    latest = (
        StockTransfer.objects.filter(transfer_number__startswith=prefix)
        .order_by("-transfer_number")
        .first()
    )
    sequence = int(latest.transfer_number.split("-")[-1]) + 1 if latest else 1
    return f"{prefix}{sequence:04d}"


# ---------------------------------------------------------------------------
# Store Location
# ---------------------------------------------------------------------------


from hmis.apps.inventory.models_procurement import *  # noqa: F403


class StoreLocationType(models.TextChoices):
    MAIN_STORE = "MAIN_STORE", "Main Store"
    SATELLITE_PHARMACY = "SATELLITE_PHARMACY", "Satellite Pharmacy"
    WARD_STORE = "WARD_STORE", "Ward Store"
    THEATRE_STORE = "THEATRE_STORE", "Theatre Store"
    LAB_STORE = "LAB_STORE", "Lab Store"


class StoreLocation(FacilityScopedModel, TimeStampedModel):
    """
    Named storage location within a facility.

    Enables sub-facility inventory tracking — e.g. Main Store, Ward A Store,
    Theatre, Satellite Pharmacy.
    """

    code = models.CharField(max_length=50)
    name = models.CharField(max_length=255)
    location_type = models.CharField(
        max_length=25,
        choices=StoreLocationType.choices,
        default=StoreLocationType.MAIN_STORE,
    )
    is_active = models.BooleanField(default=True)
    managed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="managed_stores",
    )
    notes = models.TextField(blank=True)

    class Meta:
        ordering = ["name"]
        constraints = [
            models.UniqueConstraint(
                fields=["facility", "code"],
                name="unique_store_code_per_facility",
            ),
        ]

    def __str__(self):
        return f"{self.code} - {self.name}"


# ---------------------------------------------------------------------------
# Stock Transfer
# ---------------------------------------------------------------------------


class TransferStatus(models.TextChoices):
    DRAFT = "DRAFT", "Draft"
    REQUESTED = "REQUESTED", "Requested"
    APPROVED = "APPROVED", "Approved"
    IN_TRANSIT = "IN_TRANSIT", "In Transit"
    RECEIVED = "RECEIVED", "Received"
    CANCELLED = "CANCELLED", "Cancelled"


class StockTransfer(OrganizationScopedModel, TimeStampedModel):
    """
    Transfer of stock between facilities or stores within the same organization.

    Organization-scoped: transfers can cross facility boundaries.

    Workflow: DRAFT → REQUESTED → APPROVED → IN_TRANSIT → RECEIVED
                 ↘─────────↘──────────↘──────────→ CANCELLED
    """

    transfer_number = models.CharField(
        max_length=30,
        unique=True,
        editable=False,
        default=generate_transfer_number,
    )

    # Source
    source_facility = models.ForeignKey(
        "core.Facility",
        on_delete=models.PROTECT,
        related_name="outgoing_transfers",
    )
    source_store = models.ForeignKey(
        StoreLocation,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="outgoing_transfers",
    )

    # Destination
    destination_facility = models.ForeignKey(
        "core.Facility",
        on_delete=models.PROTECT,
        related_name="incoming_transfers",
    )
    destination_store = models.ForeignKey(
        StoreLocation,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="incoming_transfers",
    )

    status = models.CharField(
        max_length=20,
        choices=TransferStatus.choices,
        default=TransferStatus.DRAFT,
    )

    # Users
    requested_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="transfers_requested",
    )
    approved_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="transfers_approved",
    )
    dispatched_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="transfers_dispatched",
    )
    received_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="transfers_received",
    )

    # Dates
    request_date = models.DateField(default=timezone.now)
    approved_at = models.DateTimeField(null=True, blank=True)
    dispatched_at = models.DateTimeField(null=True, blank=True)
    received_at = models.DateTimeField(null=True, blank=True)
    cancelled_at = models.DateTimeField(null=True, blank=True)

    # Notes
    notes = models.TextField(blank=True)
    cancellation_reason = models.TextField(blank=True)

    class Meta:
        ordering = ["-request_date", "-created_at"]
        permissions = [
            ("approve_stock_transfer", "Can approve stock transfers"),
        ]

    def __str__(self):
        return f"{self.transfer_number} ({self.source_facility} → {self.destination_facility})"

    @property
    def total_items(self):
        return self.items.count()

    # -- State-transition methods ---------------------------------------------

    def submit(self):
        """DRAFT → REQUESTED."""
        if self.status != TransferStatus.DRAFT:
            raise ValidationError("Only DRAFT transfers can be submitted.")
        if not self.items.exists():
            raise ValidationError("Cannot submit a transfer with no items.")
        self.status = TransferStatus.REQUESTED
        self.save(update_fields=["status", "updated_at"])

    def approve(self, user):
        """REQUESTED → APPROVED."""
        if self.status != TransferStatus.REQUESTED:
            raise ValidationError("Only REQUESTED transfers can be approved.")
        self.status = TransferStatus.APPROVED
        self.approved_by = user
        self.approved_at = timezone.now()
        self.save(update_fields=["status", "approved_by", "approved_at", "updated_at"])

    def dispatch(self, user):
        """
        APPROVED → IN_TRANSIT.

        Creates TRANSFER_OUT StockAdjustment records to deduct source stock.
        """
        if self.status != TransferStatus.APPROVED:
            raise ValidationError("Only APPROVED transfers can be dispatched.")

        StockAdjustment = apps.get_model("pharmacy", "StockAdjustment")

        for item in self.items.select_related("source_batch"):
            qty = item.quantity_dispatched or item.quantity_requested
            if qty > item.source_batch.quantity_available:
                raise ValidationError(
                    f"Insufficient stock for {item.drug}: "
                    f"requested {qty}, available {item.source_batch.quantity_available}."
                )
            # StockAdjustment.save() auto-updates batch.quantity_available
            StockAdjustment.objects.create(
                batch=item.source_batch,
                adjustment_type="TRANSFER_OUT",
                quantity=-qty,
                reason=f"Transfer {self.transfer_number} to {self.destination_facility}",
                reference_number=self.transfer_number,
                adjusted_by=user,
            )
            item.quantity_dispatched = qty
            item.save(update_fields=["quantity_dispatched", "updated_at"])

        self.status = TransferStatus.IN_TRANSIT
        self.dispatched_by = user
        self.dispatched_at = timezone.now()
        self.save(update_fields=["status", "dispatched_by", "dispatched_at", "updated_at"])

    def receive(self, user):
        """
        IN_TRANSIT → RECEIVED.

        Creates new StockBatch records at the destination facility for each item.
        """
        if self.status != TransferStatus.IN_TRANSIT:
            raise ValidationError("Only IN_TRANSIT transfers can be received.")

        StockBatch = apps.get_model("pharmacy", "StockBatch")

        for item in self.items.select_related("source_batch", "drug"):
            qty = item.quantity_received or item.quantity_dispatched
            src = item.source_batch

            # Append transfer number to batch_number to satisfy unique_together
            dest_batch_number = f"{src.batch_number}-{self.transfer_number}"

            # Create batch at destination
            batch = StockBatch.objects.create(
                drug=item.drug,
                batch_number=dest_batch_number,
                quantity_received=qty,
                quantity_available=qty,
                expiry_date=src.expiry_date,
                manufacture_date=src.manufacture_date,
                received_date=timezone.now().date(),
                cost_price=src.cost_price,
                selling_price=src.selling_price,
                supplier=src.supplier,
                purchase_order=src.purchase_order,
                received_by=user,
                location=src.location,
                organization=self.organization,
                facility=self.destination_facility,
            )
            item.destination_batch = batch
            item.quantity_received = qty
            item.save(update_fields=["destination_batch", "quantity_received", "updated_at"])

        self.status = TransferStatus.RECEIVED
        self.received_by = user
        self.received_at = timezone.now()
        self.save(update_fields=["status", "received_by", "received_at", "updated_at"])

    def cancel(self, _user=None, reason=""):
        """Any non-terminal status → CANCELLED."""
        terminal = {TransferStatus.RECEIVED, TransferStatus.CANCELLED}
        if self.status in terminal:
            raise ValidationError("Cannot cancel a received or already-cancelled transfer.")
        if self.status == TransferStatus.IN_TRANSIT:
            raise ValidationError(
                "Cannot cancel an in-transit transfer. Receive it first, then reverse."
            )
        self.status = TransferStatus.CANCELLED
        self.cancelled_at = timezone.now()
        self.cancellation_reason = reason
        self.save(update_fields=["status", "cancelled_at", "cancellation_reason", "updated_at"])


# ---------------------------------------------------------------------------
# Transfer Item
# ---------------------------------------------------------------------------


class TransferItem(TimeStampedModel):
    """Line item on a stock transfer."""

    transfer = models.ForeignKey(
        StockTransfer,
        on_delete=models.CASCADE,
        related_name="items",
    )
    drug = models.ForeignKey(
        "pharmacy.Drug",
        on_delete=models.PROTECT,
        related_name="transfer_items",
    )
    source_batch = models.ForeignKey(
        "pharmacy.StockBatch",
        on_delete=models.PROTECT,
        related_name="transfer_out_items",
    )
    quantity_requested = models.PositiveIntegerField()
    quantity_dispatched = models.PositiveIntegerField(default=0)
    quantity_received = models.PositiveIntegerField(default=0)

    # Created at destination (set on receive)
    destination_batch = models.ForeignKey(
        "pharmacy.StockBatch",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="transfer_in_items",
    )
    notes = models.CharField(max_length=255, blank=True)

    class Meta:
        ordering = ["id"]

    def __str__(self):
        return f"{self.drug.generic_name} x{self.quantity_requested}"


# ===========================================================================
# Phase 3: Ward / Satellite Stock Management
# ===========================================================================


class WardStock(FacilityScopedModel, TimeStampedModel):
    """
    Tracks stock levels at a ward or satellite store.

    Each row represents one drug at one store location. Par-level and max-level
    drive automatic replenishment alerts.
    """

    store_location = models.ForeignKey(
        StoreLocation,
        on_delete=models.CASCADE,
        related_name="ward_stocks",
    )
    drug = models.ForeignKey(
        "pharmacy.Drug",
        on_delete=models.PROTECT,
        related_name="ward_stocks",
    )
    ward = models.ForeignKey(
        "inpatient.Ward",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="ward_stocks",
        help_text="Optional link to inpatient ward.",
    )

    quantity_available = models.PositiveIntegerField(default=0)
    par_level = models.PositiveIntegerField(
        default=10,
        help_text="Minimum stock level — triggers replenishment alert.",
    )
    max_level = models.PositiveIntegerField(
        default=100,
        help_text="Maximum stock level for this location.",
    )

    last_replenished_at = models.DateTimeField(null=True, blank=True)
    last_counted_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["store_location", "drug"]
        constraints = [
            models.UniqueConstraint(
                fields=["store_location", "drug"],
                name="unique_ward_stock_per_drug_location",
            ),
        ]

    def __str__(self):
        return f"{self.drug.generic_name} @ {self.store_location.name}"

    @property
    def is_below_par(self):
        """True if quantity is at or below par level."""
        return self.quantity_available <= self.par_level

    @property
    def is_above_max(self):
        """True if quantity exceeds max level."""
        return self.quantity_available > self.max_level

    @property
    def reorder_quantity(self):
        """Suggested quantity to bring stock up to max level."""
        if self.quantity_available >= self.max_level:
            return 0
        return self.max_level - self.quantity_available


# ---------------------------------------------------------------------------
# Ward Stock Transaction
# ---------------------------------------------------------------------------


class WardTransactionType(models.TextChoices):
    REPLENISH = "REPLENISH", "Replenish"
    CONSUME = "CONSUME", "Consume"
    RETURN = "RETURN", "Return to Store"
    ADJUSTMENT = "ADJUSTMENT", "Adjustment"
    COUNT_CORRECTION = "COUNT_CORRECTION", "Count Correction"


class WardStockTransaction(TimeStampedModel):
    """
    Ledger of stock movements at a ward/satellite store.

    Positive quantity = stock in (replenish, return, positive adjustment).
    Negative quantity = stock out (consume, negative adjustment).
    """

    ward_stock = models.ForeignKey(
        WardStock,
        on_delete=models.CASCADE,
        related_name="transactions",
    )
    transaction_type = models.CharField(
        max_length=20,
        choices=WardTransactionType.choices,
    )
    quantity = models.IntegerField(
        help_text="Positive = in, negative = out.",
    )

    # Optional source/context
    batch = models.ForeignKey(
        "pharmacy.StockBatch",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="ward_transactions",
    )
    patient = models.ForeignKey(
        "patients.Patient",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="ward_stock_consumptions",
        help_text="Patient consuming the item (for CONSUME type).",
    )

    performed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="ward_stock_transactions",
    )
    performed_at = models.DateTimeField(default=timezone.now)
    notes = models.TextField(blank=True)

    class Meta:
        ordering = ["-performed_at"]

    def __str__(self):
        return f"{self.get_transaction_type_display()} {self.quantity:+d} — {self.ward_stock}"

    def save(self, *args, **kwargs):
        """Update WardStock.quantity_available on create."""
        is_new = self.pk is None
        super().save(*args, **kwargs)
        if is_new:
            ws = self.ward_stock
            ws.quantity_available = max(0, ws.quantity_available + self.quantity)
            update_fields = ["quantity_available", "updated_at"]
            if self.transaction_type == WardTransactionType.REPLENISH:
                ws.last_replenished_at = self.performed_at
                update_fields.append("last_replenished_at")
            elif self.transaction_type == WardTransactionType.COUNT_CORRECTION:
                ws.last_counted_at = self.performed_at
                update_fields.append("last_counted_at")
            ws.save(update_fields=update_fields)


# ===========================================================================
# Phase 4: Stock Reconciliation & Cycle Counting
# ===========================================================================

# ---------------------------------------------------------------------------
# Auto-number generator
# ---------------------------------------------------------------------------
