"""
Inventory models for Vitora HMIS.

Phase 1: Procurement Foundation
- Supplier: Vendor/manufacturer catalog (org-scoped)
- PurchaseOrder: Procurement requests with approval workflow (facility-scoped)
- PurchaseOrderItem: Line items on a purchase order
- GoodsReceiptNote: Receiving records for incoming stock (facility-scoped)
- GRNItem: Line items on a goods receipt, linked to created StockBatches
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


def generate_po_number():
    """Generate a unique Purchase Order number: PO-YYYYMMDD-XXXX."""
    today = datetime.now().strftime("%Y%m%d")
    prefix = f"PO-{today}-"
    PurchaseOrder = apps.get_model("inventory", "PurchaseOrder")
    latest = (
        PurchaseOrder.objects.filter(po_number__startswith=prefix).order_by("-po_number").first()
    )
    sequence = int(latest.po_number.split("-")[-1]) + 1 if latest else 1
    return f"{prefix}{sequence:04d}"


def generate_grn_number():
    """Generate a unique Goods Receipt Note number: GRN-YYYYMMDD-XXXX."""
    today = datetime.now().strftime("%Y%m%d")
    prefix = f"GRN-{today}-"
    GoodsReceiptNote = apps.get_model("inventory", "GoodsReceiptNote")
    latest = (
        GoodsReceiptNote.objects.filter(grn_number__startswith=prefix)
        .order_by("-grn_number")
        .first()
    )
    sequence = int(latest.grn_number.split("-")[-1]) + 1 if latest else 1
    return f"{prefix}{sequence:04d}"


# ---------------------------------------------------------------------------
# Supplier
# ---------------------------------------------------------------------------


class SupplierType(models.TextChoices):
    MANUFACTURER = "MANUFACTURER", "Manufacturer"
    DISTRIBUTOR = "DISTRIBUTOR", "Distributor"
    WHOLESALER = "WHOLESALER", "Wholesaler"
    GOVERNMENT = "GOVERNMENT", "Government (KEMSA)"


class Supplier(OrganizationScopedModel, TimeStampedModel):
    """
    Vendor/manufacturer in the procurement chain.

    Organization-scoped: supplier relationships are shared across all facilities.
    """

    code = models.CharField(max_length=50)
    name = models.CharField(max_length=255)
    supplier_type = models.CharField(
        max_length=20,
        choices=SupplierType.choices,
        default=SupplierType.DISTRIBUTOR,
    )

    # Contact
    contact_person = models.CharField(max_length=200, blank=True)
    email = models.EmailField(blank=True)
    phone = models.CharField(max_length=30, blank=True)
    address = models.TextField(blank=True)

    # Kenya regulatory
    tax_pin = models.CharField(
        max_length=20,
        blank=True,
        help_text="KRA PIN for tax invoicing.",
    )

    # Business terms
    payment_terms = models.CharField(
        max_length=100,
        blank=True,
        help_text="e.g. Net 30, Cash on Delivery",
    )
    lead_time_days = models.PositiveIntegerField(
        default=7,
        help_text="Average delivery lead time in days.",
    )
    rating = models.DecimalField(
        max_digits=3,
        decimal_places=2,
        default=0,
        help_text="Supplier rating 0.00-5.00",
    )
    is_active = models.BooleanField(default=True)
    notes = models.TextField(blank=True)

    class Meta:
        ordering = ["name"]
        constraints = [
            models.UniqueConstraint(
                fields=["organization", "code"],
                name="unique_supplier_code_per_org",
            ),
        ]

    def __str__(self):
        return f"{self.code} - {self.name}"


# ---------------------------------------------------------------------------
# Purchase Order
# ---------------------------------------------------------------------------


class PurchaseOrderStatus(models.TextChoices):
    DRAFT = "DRAFT", "Draft"
    SUBMITTED = "SUBMITTED", "Submitted"
    APPROVED = "APPROVED", "Approved"
    PARTIALLY_RECEIVED = "PARTIALLY_RECEIVED", "Partially Received"
    RECEIVED = "RECEIVED", "Received"
    CANCELLED = "CANCELLED", "Cancelled"


class PurchaseOrder(FacilityScopedModel, TimeStampedModel):
    """
    Purchase order for procuring drugs/supplies from a supplier.

    Facility-scoped: each facility places its own orders.
    """

    po_number = models.CharField(
        max_length=30,
        unique=True,
        editable=False,
        default=generate_po_number,
    )
    supplier = models.ForeignKey(
        "inventory.Supplier",
        on_delete=models.PROTECT,
        related_name="purchase_orders",
    )
    status = models.CharField(
        max_length=25,
        choices=PurchaseOrderStatus.choices,
        default=PurchaseOrderStatus.DRAFT,
    )

    # Users
    ordered_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="purchase_orders_created",
    )
    approved_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="purchase_orders_approved",
    )

    # Dates
    order_date = models.DateField(default=timezone.now)
    expected_delivery_date = models.DateField(null=True, blank=True)
    approved_at = models.DateTimeField(null=True, blank=True)
    cancelled_at = models.DateTimeField(null=True, blank=True)

    # Notes
    notes = models.TextField(blank=True)
    cancellation_reason = models.TextField(blank=True)

    class Meta:
        ordering = ["-order_date", "-created_at"]
        permissions = [
            ("approve_purchase_order", "Can approve purchase orders"),
        ]

    def __str__(self):
        return f"{self.po_number} ({self.supplier.name})"

    # -- Computed properties --------------------------------------------------

    @property
    def total_amount(self):
        """Sum of (quantity_ordered * unit_cost) for all items."""
        from django.db.models import F, Sum

        result = self.items.aggregate(total=Sum(F("quantity_ordered") * F("unit_cost")))
        return result["total"] or 0

    @property
    def is_fully_received(self):
        """True if every item's quantity_received >= quantity_ordered."""
        return (
            self.items.exists()
            and not self.items.filter(quantity_received__lt=models.F("quantity_ordered")).exists()
        )

    # -- State-transition methods ---------------------------------------------

    def submit(self):
        """DRAFT → SUBMITTED."""
        if self.status != PurchaseOrderStatus.DRAFT:
            raise ValidationError("Only DRAFT purchase orders can be submitted.")
        if not self.items.exists():
            raise ValidationError("Cannot submit a purchase order with no items.")
        self.status = PurchaseOrderStatus.SUBMITTED
        self.save(update_fields=["status", "updated_at"])

    def approve(self, user):
        """SUBMITTED → APPROVED."""
        if self.status != PurchaseOrderStatus.SUBMITTED:
            raise ValidationError("Only SUBMITTED purchase orders can be approved.")
        self.status = PurchaseOrderStatus.APPROVED
        self.approved_by = user
        self.approved_at = timezone.now()
        self.save(update_fields=["status", "approved_by", "approved_at", "updated_at"])

    def cancel(self, user, reason=""):
        """Any non-terminal status → CANCELLED."""
        terminal = {PurchaseOrderStatus.RECEIVED, PurchaseOrderStatus.CANCELLED}
        if self.status in terminal:
            raise ValidationError("Cannot cancel a received or already-cancelled PO.")
        self.status = PurchaseOrderStatus.CANCELLED
        self.approved_by = user
        self.cancelled_at = timezone.now()
        self.cancellation_reason = reason
        self.save(
            update_fields=[
                "status",
                "approved_by",
                "cancelled_at",
                "cancellation_reason",
                "updated_at",
            ]
        )

    def update_receipt_status(self):
        """Recalculate status after goods are received."""
        if self.status in {
            PurchaseOrderStatus.DRAFT,
            PurchaseOrderStatus.SUBMITTED,
            PurchaseOrderStatus.CANCELLED,
        }:
            return
        if self.is_fully_received:
            self.status = PurchaseOrderStatus.RECEIVED
        else:
            self.status = PurchaseOrderStatus.PARTIALLY_RECEIVED
        self.save(update_fields=["status", "updated_at"])


# ---------------------------------------------------------------------------
# Purchase Order Item
# ---------------------------------------------------------------------------


class PurchaseOrderItem(TimeStampedModel):
    """Line item on a purchase order."""

    purchase_order = models.ForeignKey(
        PurchaseOrder,
        on_delete=models.CASCADE,
        related_name="items",
    )
    drug = models.ForeignKey(
        "pharmacy.Drug",
        on_delete=models.PROTECT,
        related_name="purchase_order_items",
    )
    quantity_ordered = models.PositiveIntegerField()
    quantity_received = models.PositiveIntegerField(default=0)
    unit_cost = models.DecimalField(max_digits=10, decimal_places=2)
    notes = models.CharField(max_length=255, blank=True)

    class Meta:
        ordering = ["id"]

    def __str__(self):
        return f"{self.drug.generic_name} x{self.quantity_ordered}"

    @property
    def line_total(self):
        return self.quantity_ordered * self.unit_cost

    @property
    def is_fully_received(self):
        return self.quantity_received >= self.quantity_ordered

    @property
    def outstanding_quantity(self):
        return max(0, self.quantity_ordered - self.quantity_received)


# ---------------------------------------------------------------------------
# Goods Receipt Note
# ---------------------------------------------------------------------------


class GRNStatus(models.TextChoices):
    DRAFT = "DRAFT", "Draft"
    CONFIRMED = "CONFIRMED", "Confirmed"
    CANCELLED = "CANCELLED", "Cancelled"


class GoodsReceiptNote(FacilityScopedModel, TimeStampedModel):
    """
    Record of physically receiving goods from a supplier.

    Confirming a GRN creates StockBatch records and updates PO item received quantities.
    """

    grn_number = models.CharField(
        max_length=30,
        unique=True,
        editable=False,
        default=generate_grn_number,
    )
    purchase_order = models.ForeignKey(
        PurchaseOrder,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="goods_receipts",
        help_text="Linked PO. Null for ad-hoc (donation/emergency) receipts.",
    )
    supplier = models.ForeignKey(
        "inventory.Supplier",
        on_delete=models.PROTECT,
        related_name="goods_receipts",
    )
    status = models.CharField(
        max_length=15,
        choices=GRNStatus.choices,
        default=GRNStatus.DRAFT,
    )

    # Users
    received_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="goods_receipts_received",
    )

    # Dates & references
    received_date = models.DateField(default=timezone.now)
    delivery_note_number = models.CharField(max_length=50, blank=True)
    invoice_number = models.CharField(max_length=50, blank=True)
    notes = models.TextField(blank=True)

    # Confirmation
    confirmed_at = models.DateTimeField(null=True, blank=True)
    confirmed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="goods_receipts_confirmed",
    )

    class Meta:
        ordering = ["-received_date", "-created_at"]

    def __str__(self):
        return f"{self.grn_number} ({self.supplier.name})"

    @property
    def total_items(self):
        return self.items.count()

    @property
    def total_amount(self):
        from django.db.models import F, Sum

        result = self.items.aggregate(total=Sum(F("quantity_received") * F("cost_price")))
        return result["total"] or 0

    def confirm(self, user):
        """
        DRAFT → CONFIRMED.

        Creates a pharmacy.StockBatch for each GRN item and updates the linked
        PurchaseOrderItem.quantity_received.
        """
        if self.status != GRNStatus.DRAFT:
            raise ValidationError("Only DRAFT goods receipts can be confirmed.")
        if not self.items.exists():
            raise ValidationError("Cannot confirm a GRN with no items.")

        StockBatch = apps.get_model("pharmacy", "StockBatch")

        for item in self.items.select_related("drug", "po_item"):
            # Create StockBatch
            batch = StockBatch.objects.create(
                drug=item.drug,
                batch_number=item.batch_number,
                quantity_received=item.quantity_received,
                quantity_available=item.quantity_received,
                expiry_date=item.expiry_date,
                manufacture_date=item.manufacture_date,
                received_date=self.received_date,
                cost_price=item.cost_price,
                selling_price=item.selling_price,
                supplier=self.supplier.name,
                purchase_order=self.purchase_order.po_number if self.purchase_order else "",
                received_by=user,
                location=item.location,
                organization=self.organization,
                facility=self.facility,
            )
            item.stock_batch = batch
            item.save(update_fields=["stock_batch", "updated_at"])

            # Update PO item received quantity
            if item.po_item:
                item.po_item.quantity_received = (
                    models.F("quantity_received") + item.quantity_received
                )
                item.po_item.save(update_fields=["quantity_received", "updated_at"])
                item.po_item.refresh_from_db()

        # Update GRN status
        self.status = GRNStatus.CONFIRMED
        self.confirmed_at = timezone.now()
        self.confirmed_by = user
        self.save(update_fields=["status", "confirmed_at", "confirmed_by", "updated_at"])

        # Update PO receipt status
        if self.purchase_order:
            self.purchase_order.update_receipt_status()

    def cancel(self):
        """DRAFT → CANCELLED."""
        if self.status != GRNStatus.DRAFT:
            raise ValidationError("Only DRAFT goods receipts can be cancelled.")
        self.status = GRNStatus.CANCELLED
        self.save(update_fields=["status", "updated_at"])


# ---------------------------------------------------------------------------
# GRN Item
# ---------------------------------------------------------------------------


class GRNItem(TimeStampedModel):
    """Line item on a goods receipt note."""

    grn = models.ForeignKey(
        GoodsReceiptNote,
        on_delete=models.CASCADE,
        related_name="items",
    )
    drug = models.ForeignKey(
        "pharmacy.Drug",
        on_delete=models.PROTECT,
        related_name="grn_items",
    )
    po_item = models.ForeignKey(
        PurchaseOrderItem,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="grn_items",
        help_text="Linked PO item. Null for ad-hoc receipts.",
    )

    # Batch details
    batch_number = models.CharField(max_length=100)
    expiry_date = models.DateField()
    manufacture_date = models.DateField(null=True, blank=True)

    # Quantities & pricing
    quantity_received = models.PositiveIntegerField()
    cost_price = models.DecimalField(max_digits=10, decimal_places=2)
    selling_price = models.DecimalField(max_digits=10, decimal_places=2)

    # Storage
    location = models.CharField(
        max_length=100,
        blank=True,
        help_text="Shelf/bin location.",
    )
    notes = models.CharField(max_length=255, blank=True)

    # Created StockBatch (set on GRN confirm)
    stock_batch = models.ForeignKey(
        "pharmacy.StockBatch",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="grn_items",
    )

    class Meta:
        ordering = ["id"]

    def __str__(self):
        return f"{self.drug.generic_name} batch {self.batch_number} x{self.quantity_received}"

    @property
    def line_total(self):
        return self.quantity_received * self.cost_price


# ===========================================================================
# Phase 2: Multi-Store Stock Transfers
# ===========================================================================

# ---------------------------------------------------------------------------
# Auto-number generator
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
