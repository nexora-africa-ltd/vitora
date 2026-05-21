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
from hmis.apps.core.pii import encrypted_pii_property

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
# Payment Terms (configurable options)
# ---------------------------------------------------------------------------


class PaymentTerm(OrganizationScopedModel, TimeStampedModel):
    """
    Configurable payment term options for supplier contracts.

    Organization-scoped: shared across all facilities in the org.
    Managed from billing settings.
    """

    code = models.CharField(
        max_length=50,
        help_text="Short code e.g. NET30, COD",
    )
    name = models.CharField(
        max_length=100,
        help_text="Display name e.g. 'Net 30 Days', 'Cash on Delivery'",
    )
    days = models.PositiveIntegerField(
        default=0,
        help_text="Number of days until payment is due. 0 = immediate.",
    )
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ["days", "name"]
        constraints = [
            models.UniqueConstraint(
                fields=["organization", "code"],
                name="unique_payment_term_per_org",
            ),
        ]

    def __str__(self):
        return self.name


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
    email_encrypted = models.TextField(default="", blank=True)
    email = encrypted_pii_property("email")
    phone_encrypted = models.TextField(default="", blank=True)
    phone = encrypted_pii_property("phone")
    address_encrypted = models.TextField(default="", blank=True)
    address = encrypted_pii_property("address")

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
    payment_term = models.ForeignKey(
        "inventory.PaymentTerm",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="suppliers",
        help_text="Configurable payment term from billing settings.",
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
                supplier=self.supplier,
                purchase_order=self.purchase_order,
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


def generate_stock_count_number():
    """Generate a unique Stock Count number: SC-YYYYMMDD-XXXX."""
    today = datetime.now().strftime("%Y%m%d")
    prefix = f"SC-{today}-"
    StockCount = apps.get_model("inventory", "StockCount")
    latest = (
        StockCount.objects.filter(count_number__startswith=prefix).order_by("-count_number").first()
    )
    sequence = int(latest.count_number.split("-")[-1]) + 1 if latest else 1
    return f"{prefix}{sequence:04d}"


# ---------------------------------------------------------------------------
# Stock Count
# ---------------------------------------------------------------------------


class StockCountType(models.TextChoices):
    FULL = "FULL", "Full Count"
    CYCLE = "CYCLE", "Cycle Count"
    SPOT = "SPOT", "Spot Check"


class StockCountStatus(models.TextChoices):
    DRAFT = "DRAFT", "Draft"
    IN_PROGRESS = "IN_PROGRESS", "In Progress"
    COMPLETED = "COMPLETED", "Completed"
    APPROVED = "APPROVED", "Approved"
    CANCELLED = "CANCELLED", "Cancelled"


class StockCount(FacilityScopedModel, TimeStampedModel):
    """
    Physical stock count / cycle count session.

    Workflow: DRAFT → IN_PROGRESS → COMPLETED → APPROVED
                ↘───────────↘──────────→ CANCELLED
    """

    count_number = models.CharField(
        max_length=30,
        unique=True,
        editable=False,
        default=generate_stock_count_number,
    )
    count_type = models.CharField(
        max_length=10,
        choices=StockCountType.choices,
        default=StockCountType.CYCLE,
    )
    store_location = models.ForeignKey(
        StoreLocation,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="stock_counts",
        help_text="Null = facility main store.",
    )
    status = models.CharField(
        max_length=15,
        choices=StockCountStatus.choices,
        default=StockCountStatus.DRAFT,
    )

    # Users
    started_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="stock_counts_started",
    )
    approved_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="stock_counts_approved",
    )

    # Dates
    started_at = models.DateTimeField(null=True, blank=True)
    completed_at = models.DateTimeField(null=True, blank=True)
    approved_at = models.DateTimeField(null=True, blank=True)

    notes = models.TextField(blank=True)

    class Meta:
        ordering = ["-created_at"]
        permissions = [
            ("approve_stock_count", "Can approve stock counts"),
        ]

    def __str__(self):
        return f"{self.count_number} ({self.get_count_type_display()})"

    # -- Computed properties --------------------------------------------------

    @property
    def total_items_counted(self):
        return self.items.exclude(counted_quantity__isnull=True).count()

    @property
    def total_discrepancies(self):
        """Count of items where counted_quantity != system_quantity."""
        counted = self.items.exclude(counted_quantity__isnull=True)
        return counted.exclude(counted_quantity=models.F("system_quantity")).count()

    # -- State-transition methods ---------------------------------------------

    def start(self):
        """DRAFT → IN_PROGRESS."""
        if self.status != StockCountStatus.DRAFT:
            raise ValidationError("Only DRAFT stock counts can be started.")
        if not self.items.exists():
            raise ValidationError("Cannot start a stock count with no items.")
        self.status = StockCountStatus.IN_PROGRESS
        self.started_at = timezone.now()
        self.save(update_fields=["status", "started_at", "updated_at"])

    def complete(self):
        """IN_PROGRESS → COMPLETED."""
        if self.status != StockCountStatus.IN_PROGRESS:
            raise ValidationError("Only IN_PROGRESS stock counts can be completed.")
        # All items must have been counted
        uncounted = self.items.filter(counted_quantity__isnull=True).count()
        if uncounted > 0:
            raise ValidationError(f"{uncounted} item(s) have not been counted yet.")
        self.status = StockCountStatus.COMPLETED
        self.completed_at = timezone.now()
        self.save(update_fields=["status", "completed_at", "updated_at"])

    def approve(self, user):
        """
        COMPLETED → APPROVED.

        Creates StockAdjustment(COUNT_CORRECTION) for each item with a variance.
        """
        if self.status != StockCountStatus.COMPLETED:
            raise ValidationError("Only COMPLETED stock counts can be approved.")

        StockAdjustment = apps.get_model("pharmacy", "StockAdjustment")

        for item in self.items.select_related("batch").exclude(
            counted_quantity=models.F("system_quantity")
        ):
            variance = item.counted_quantity - item.system_quantity
            StockAdjustment.objects.create(
                batch=item.batch,
                adjustment_type="COUNT_CORRECTION",
                quantity=variance,
                reason=(
                    f"Stock count {self.count_number}: "
                    f"system={item.system_quantity}, counted={item.counted_quantity}. "
                    f"{item.variance_reason}"
                ),
                reference_number=self.count_number,
                adjusted_by=user,
            )

        self.status = StockCountStatus.APPROVED
        self.approved_by = user
        self.approved_at = timezone.now()
        self.save(update_fields=["status", "approved_by", "approved_at", "updated_at"])

    def cancel(self):
        """Any non-terminal → CANCELLED."""
        terminal = {StockCountStatus.APPROVED, StockCountStatus.CANCELLED}
        if self.status in terminal:
            raise ValidationError("Cannot cancel an approved or already-cancelled count.")
        self.status = StockCountStatus.CANCELLED
        self.save(update_fields=["status", "updated_at"])

    def generate_items(self):
        """
        Auto-populate StockCountItems from current StockBatches.

        Only for DRAFT counts. Snapshots system_quantity from each batch.
        """
        if self.status != StockCountStatus.DRAFT:
            raise ValidationError("Items can only be generated for DRAFT counts.")

        StockBatch = apps.get_model("pharmacy", "StockBatch")

        # Get batches at the facility (optionally filtered by store)
        batches = StockBatch.objects.filter(
            facility=self.facility,
            status="AVAILABLE",
            quantity_available__gt=0,
        )

        created = 0
        for batch in batches.select_related("drug"):
            _, is_new = StockCountItem.objects.get_or_create(
                stock_count=self,
                batch=batch,
                defaults={
                    "drug": batch.drug,
                    "system_quantity": batch.quantity_available,
                },
            )
            if is_new:
                created += 1
        return created


# ---------------------------------------------------------------------------
# Stock Count Item
# ---------------------------------------------------------------------------


class StockCountItem(TimeStampedModel):
    """Individual line item in a stock count — one per batch."""

    stock_count = models.ForeignKey(
        StockCount,
        on_delete=models.CASCADE,
        related_name="items",
    )
    drug = models.ForeignKey(
        "pharmacy.Drug",
        on_delete=models.PROTECT,
        related_name="stock_count_items",
    )
    batch = models.ForeignKey(
        "pharmacy.StockBatch",
        on_delete=models.PROTECT,
        related_name="stock_count_items",
    )

    # Snapshot at count start
    system_quantity = models.PositiveIntegerField(
        help_text="System quantity at time of count generation.",
    )

    # Physical count result
    counted_quantity = models.PositiveIntegerField(
        null=True,
        blank=True,
        help_text="Actual physical count. Null until counted.",
    )
    variance_reason = models.TextField(
        blank=True,
        help_text="Required explanation when counted ≠ system.",
    )

    # Who counted
    counted_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="stock_items_counted",
    )
    counted_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["drug__generic_name"]
        constraints = [
            models.UniqueConstraint(
                fields=["stock_count", "batch"],
                name="unique_count_item_per_batch",
            ),
        ]

    def __str__(self):
        return f"{self.drug.generic_name} batch {self.batch.batch_number}"

    @property
    def variance(self):
        """Difference between counted and system quantity."""
        if self.counted_quantity is None:
            return None
        return self.counted_quantity - self.system_quantity

    @property
    def has_discrepancy(self):
        if self.counted_quantity is None:
            return False
        return self.counted_quantity != self.system_quantity


# ===========================================================================
# Phase 5: KRA eTIMS Integration
# ===========================================================================


class ETIMSEnvironment(models.TextChoices):
    SANDBOX = "SANDBOX", "Sandbox"
    PRODUCTION = "PRODUCTION", "Production"


class ETIMSReceiptType(models.TextChoices):
    """KRA receipt types per TIS specification §4.1."""

    NORMAL = "N", "Normal"
    COPY = "C", "Copy"
    TRAINING = "T", "Training"
    PROFORMA = "P", "Proforma"


class ETIMSTransactionType(models.TextChoices):
    """KRA transaction types per TIS specification §4.2."""

    SALE = "S", "Sale"
    CREDIT_NOTE = "NC", "Credit Note"


class ETIMSReceiptLabel(models.TextChoices):
    """Combined receipt type + transaction type labels per §4.3."""

    NS = "NS", "Normal Sale"
    NC = "NC", "Normal Credit Note"
    CS = "CS", "Copy Sale"
    CC = "CC", "Copy Credit Note"
    TS = "TS", "Training Sale"
    TC = "TC", "Training Credit Note"
    PS = "PS", "Proforma Sale"


class ETIMSInvoiceStatus(models.TextChoices):
    PENDING = "PENDING", "Pending"
    SUBMITTED = "SUBMITTED", "Submitted"
    CONFIRMED = "CONFIRMED", "Confirmed"
    FAILED = "FAILED", "Failed"
    CANCELLED = "CANCELLED", "Cancelled"


def _dash_separate(value: str, chunk_size: int = 4) -> str:
    """Separate a string by dash after every chunk_size characters (§6.23.6/7)."""
    if not value:
        return ""
    return "-".join(value[i : i + chunk_size] for i in range(0, len(value), chunk_size))


class ETIMSConfig(FacilityScopedModel, TimeStampedModel):
    """
    KRA eTIMS configuration per facility (singleton per facility).

    Stores KRA branch credentials and connection settings.
    The api_key is stored encrypted via the KMS provider.
    """

    bhf_id = models.CharField(
        max_length=3,
        help_text="Branch (BHF) ID assigned by KRA, e.g. '00'.",
    )
    dvc_srl_no = models.CharField(
        max_length=50,
        help_text="Device serial number from KRA.",
    )
    tin = models.CharField(
        max_length=15,
        help_text="Tax Identification Number (TIN).",
    )
    api_base_url = models.URLField(
        help_text="eTIMS API base URL (sandbox or production).",
    )
    api_key_encrypted = models.TextField(
        blank=True,
        help_text="Encrypted eTIMS communication key (set via property).",
    )
    is_active = models.BooleanField(default=False)
    last_sync_at = models.DateTimeField(null=True, blank=True)
    environment = models.CharField(
        max_length=12,
        choices=ETIMSEnvironment.choices,
        default=ETIMSEnvironment.SANDBOX,
    )

    # Receipt counters per type (§6.3 - uninterrupted ascending per receipt type)
    counter_ns = models.PositiveIntegerField(default=0, help_text="Next NS receipt counter.")
    counter_nc = models.PositiveIntegerField(default=0, help_text="Next NC receipt counter.")
    counter_cs = models.PositiveIntegerField(default=0, help_text="Next CS receipt counter.")
    counter_cc = models.PositiveIntegerField(default=0, help_text="Next CC receipt counter.")
    counter_ts = models.PositiveIntegerField(default=0, help_text="Next TS receipt counter.")
    counter_tc = models.PositiveIntegerField(default=0, help_text="Next TC receipt counter.")
    counter_ps = models.PositiveIntegerField(default=0, help_text="Next PS receipt counter.")

    class Meta:
        verbose_name = "eTIMS Configuration"
        verbose_name_plural = "eTIMS Configurations"
        ordering = ["-created_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["facility"],
                name="unique_etims_config_per_facility",
            ),
        ]
        permissions = [
            ("manage_etims", "Can manage eTIMS configuration"),
        ]

    def __str__(self):
        return f"eTIMS Config – TIN {self.tin} ({self.environment})"

    @property
    def api_key(self):
        """Decrypt and return the API key."""
        if not self.api_key_encrypted:
            return ""
        from hmis.apps.core.kms import get_kms_provider

        return get_kms_provider().decrypt_string(self.api_key_encrypted)

    @api_key.setter
    def api_key(self, value):
        """Encrypt and store the API key."""
        if not value:
            self.api_key_encrypted = ""
            return
        from hmis.apps.core.kms import get_kms_provider

        self.api_key_encrypted = get_kms_provider().encrypt_string(value)

    def get_next_receipt_number(self, receipt_label: str) -> int:
        """
        Atomically increment and return the next receipt number for a label.

        Per KRA TIS spec §6.3 — uninterrupted ascending per receipt type.
        Uses select_for_update to prevent race conditions.
        """
        counter_field = f"counter_{receipt_label.lower()}"
        if not hasattr(self, counter_field):
            raise ValueError(f"Invalid receipt label: {receipt_label}")
        # Refresh with lock
        locked = ETIMSConfig.objects.select_for_update().get(pk=self.pk)
        current = getattr(locked, counter_field)
        next_num = current + 1
        setattr(locked, counter_field, next_num)
        locked.save(update_fields=[counter_field, "updated_at"])
        # Update self
        setattr(self, counter_field, next_num)
        return next_num


class ETIMSInvoice(FacilityScopedModel, TimeStampedModel):
    """
    Tracks submission of a billing invoice to KRA eTIMS.

    Each billing Invoice that requires eTIMS reporting gets one ETIMSInvoice
    record that tracks its submission lifecycle:
    PENDING → SUBMITTED → CONFIRMED (or FAILED with retries).
    """

    invoice = models.ForeignKey(
        "billing.Invoice",
        on_delete=models.PROTECT,
        related_name="etims_submissions",
    )
    dispensing = models.ForeignKey(
        "pharmacy.Dispensing",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="etims_submissions",
        help_text="Optional: dispensing that triggered this submission.",
    )

    # Receipt classification (§4.1-4.3)
    receipt_type = models.CharField(
        max_length=2,
        choices=ETIMSReceiptType.choices,
        default=ETIMSReceiptType.NORMAL,
        help_text="KRA receipt type: N, C, T, P.",
    )
    transaction_type = models.CharField(
        max_length=2,
        choices=ETIMSTransactionType.choices,
        default=ETIMSTransactionType.SALE,
        help_text="KRA transaction type: S or NC.",
    )
    receipt_label = models.CharField(
        max_length=2,
        choices=ETIMSReceiptLabel.choices,
        default=ETIMSReceiptLabel.NS,
        help_text="Combined receipt label (NS, NC, CS, CC, TS, TC, PS).",
    )

    # Credit note reference (§6.16, §14)
    original_etims_invoice = models.ForeignKey(
        "self",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="credit_notes",
        help_text="Original invoice for credit notes (NC/CC).",
    )
    original_cu_invoice_number = models.CharField(
        max_length=100,
        blank=True,
        help_text="Original CU invoice number for credit note reference.",
    )

    # Buyer identification (§3d, §5.1.3)
    buyer_pin = models.CharField(
        max_length=15,
        blank=True,
        help_text="Buyer's KRA PIN (optional per §5.1.3).",
    )

    # Receipt counter per type (from config, stored for audit)
    receipt_type_counter = models.PositiveIntegerField(
        default=0,
        help_text="Sequential counter per receipt type (§6.3).",
    )

    etims_receipt_number = models.CharField(
        max_length=100,
        blank=True,
        help_text="Receipt number returned by KRA on confirmation.",
    )
    etims_internal_data = models.JSONField(
        default=dict,
        blank=True,
        help_text="Raw response data from KRA for audit trail.",
    )

    # SCU response fields (§5.3)
    scu_id = models.CharField(
        max_length=50,
        blank=True,
        help_text="SCU/CU ID from OSCU/VSCU response (§5.3.1).",
    )
    scu_datetime = models.DateTimeField(
        null=True,
        blank=True,
        help_text="Date/time stamped by OSCU/VSCU (§5.3.2).",
    )
    scu_receipt_counter = models.PositiveIntegerField(
        default=0,
        help_text="Receipt counter per type from SCU (§5.3.4).",
    )
    scu_total_counter = models.PositiveIntegerField(
        default=0,
        help_text="Total receipt counter from SCU (§5.3.5).",
    )
    scu_internal_data = models.CharField(
        max_length=200,
        blank=True,
        help_text="Internal data string from SCU (§5.3.6 / §6.23.6).",
    )
    scu_receipt_signature = models.CharField(
        max_length=200,
        blank=True,
        help_text="Digital receipt signature from SCU (§5.3.6 / §6.23.7).",
    )
    qr_code_data = models.TextField(
        blank=True,
        help_text="QR code string per §6.23.8: date#time#cu_number#cu_receipt_number#internal_data#signature.",
    )

    # EJ Data submission status (§5.5)
    ej_data_sent = models.BooleanField(
        default=False,
        help_text="Whether electronic journal data was sent for this receipt.",
    )

    status = models.CharField(
        max_length=12,
        choices=ETIMSInvoiceStatus.choices,
        default=ETIMSInvoiceStatus.PENDING,
    )
    submitted_at = models.DateTimeField(null=True, blank=True)
    confirmed_at = models.DateTimeField(null=True, blank=True)
    error_message = models.TextField(blank=True)
    retry_count = models.IntegerField(default=0)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"eTIMS {self.invoice.invoice_number} [{self.receipt_label}] – {self.get_status_display()}"

    @property
    def cu_invoice_number(self) -> str:
        """Format: {SCU_ID}/{receipt_number} per §6.23.4."""
        if self.scu_id and self.etims_receipt_number:
            return f"{self.scu_id}/{self.etims_receipt_number}"
        return ""

    @property
    def formatted_internal_data(self) -> str:
        """Internal data separated by dash after every 4th char (§6.23.6)."""
        return _dash_separate(self.scu_internal_data)

    @property
    def formatted_receipt_signature(self) -> str:
        """Receipt signature separated by dash after every 4th char (§6.23.7)."""
        return _dash_separate(self.scu_receipt_signature)

    def generate_qr_code_data(self) -> str:
        """Generate QR code string per §6.23.8."""
        if not self.scu_datetime or not self.scu_id:
            return ""
        date_str = self.scu_datetime.strftime("%d%m%Y")
        time_str = self.scu_datetime.strftime("%H%M%S")
        return (
            f"{date_str}#{time_str}#{self.scu_id}"
            f"#{self.etims_receipt_number}#{self.scu_internal_data}#{self.scu_receipt_signature}"
        )

    def mark_submitted(self, response_data=None):
        """PENDING → SUBMITTED."""
        self.status = ETIMSInvoiceStatus.SUBMITTED
        self.submitted_at = timezone.now()
        if response_data:
            self.etims_internal_data = response_data
        self.save(update_fields=["status", "submitted_at", "etims_internal_data", "updated_at"])

    def mark_confirmed(self, receipt_number, response_data=None, scu_data=None):
        """SUBMITTED → CONFIRMED with full SCU response data (§5.3)."""
        self.status = ETIMSInvoiceStatus.CONFIRMED
        self.confirmed_at = timezone.now()
        self.etims_receipt_number = receipt_number
        if response_data:
            self.etims_internal_data = response_data
        # Store SCU response fields
        if scu_data:
            self.scu_id = scu_data.get("scu_id", "")
            if scu_data.get("scu_datetime"):
                self.scu_datetime = scu_data["scu_datetime"]
            self.scu_receipt_counter = scu_data.get("receipt_type_counter", 0)
            self.scu_total_counter = scu_data.get("total_counter", 0)
            self.scu_internal_data = scu_data.get("internal_data", "")
            self.scu_receipt_signature = scu_data.get("receipt_signature", "")
        # Generate QR code
        self.qr_code_data = self.generate_qr_code_data()
        self.save(
            update_fields=[
                "status",
                "confirmed_at",
                "etims_receipt_number",
                "etims_internal_data",
                "scu_id",
                "scu_datetime",
                "scu_receipt_counter",
                "scu_total_counter",
                "scu_internal_data",
                "scu_receipt_signature",
                "qr_code_data",
                "updated_at",
            ]
        )

    def mark_failed(self, error_message):
        """Mark as FAILED with error details."""
        self.status = ETIMSInvoiceStatus.FAILED
        self.error_message = error_message
        self.retry_count += 1
        self.save(update_fields=["status", "error_message", "retry_count", "updated_at"])

    def mark_cancelled(self):
        """Mark as CANCELLED (manual user action)."""
        self.status = ETIMSInvoiceStatus.CANCELLED
        self.save(update_fields=["status", "updated_at"])


class ETIMSItem(TimeStampedModel):
    """Individual line item in an eTIMS invoice submission."""

    etims_invoice = models.ForeignKey(
        ETIMSInvoice,
        on_delete=models.CASCADE,
        related_name="items",
    )
    item_code = models.CharField(
        max_length=50,
        help_text="HS code or KRA item classification code.",
    )
    item_name = models.CharField(max_length=255)
    quantity = models.DecimalField(max_digits=10, decimal_places=2)
    unit_price = models.DecimalField(max_digits=12, decimal_places=2)
    tax_amount = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    total = models.DecimalField(max_digits=12, decimal_places=2)

    class Meta:
        ordering = ["id"]

    def __str__(self):
        return f"{self.item_name} x{self.quantity}"


class ETIMSDailyReportType(models.TextChoices):
    """KRA daily report types (§6.5, §15, §16)."""

    X_REPORT = "X", "X Daily Report (interim)"
    Z_REPORT = "Z", "Z Daily Report (end of day)"


class ETIMSDailyReport(FacilityScopedModel, TimeStampedModel):
    """
    X and Z daily reports per KRA TIS specification (§6.5, §15-16).

    Z report = end-of-day summary (00:00:00 to 23:59:59).
    X report = summary since last Z report to present.
    """

    report_type = models.CharField(
        max_length=1,
        choices=ETIMSDailyReportType.choices,
    )
    report_date = models.DateField(help_text="Date the report covers.")
    report_number = models.PositiveIntegerField(help_text="Sequential Z/X report number.")

    # Sales summary (§15.1.5 / §16.1.5)
    total_ns_amount = models.DecimalField(
        max_digits=14,
        decimal_places=2,
        default=0,
        help_text="Total sales amount for all NS receipts, including tax.",
    )
    total_ns_count = models.PositiveIntegerField(default=0, help_text="Number of NS receipts.")

    # Credit notes (§15.1.8-9 / §16.1.8-9)
    total_nc_amount = models.DecimalField(
        max_digits=14,
        decimal_places=2,
        default=0,
        help_text="Total credit note amount for all NC receipts (negative).",
    )
    total_nc_count = models.PositiveIntegerField(default=0, help_text="Number of NC receipts.")

    # Tax breakdown per rate (§15.1.10-11 / §16.1.10-11) — 5 tax slots A-E
    taxable_amount_a = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    tax_amount_a = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    taxable_amount_b = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    tax_amount_b = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    taxable_amount_c = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    tax_amount_c = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    taxable_amount_d = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    tax_amount_d = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    taxable_amount_e = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    tax_amount_e = models.DecimalField(max_digits=14, decimal_places=2, default=0)

    # Other counts (§15.1.12-20)
    opening_deposit = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    total_items_sold = models.PositiveIntegerField(default=0)
    total_cs_cc_count = models.PositiveIntegerField(default=0, help_text="Copy receipts count.")
    total_cs_cc_amount = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    total_ts_tc_count = models.PositiveIntegerField(default=0, help_text="Training receipts count.")
    total_ts_tc_amount = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    total_ps_count = models.PositiveIntegerField(default=0, help_text="Proforma receipts count.")
    total_ps_amount = models.DecimalField(max_digits=14, decimal_places=2, default=0)

    # Payment breakdown (§15.1.17)
    payment_cash = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    payment_mpesa = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    payment_insurance = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    payment_other = models.DecimalField(max_digits=14, decimal_places=2, default=0)

    # Discounts (§15.1.18)
    total_discounts = models.DecimalField(max_digits=14, decimal_places=2, default=0)

    # Incomplete sales (§15.1.20)
    incomplete_sales_count = models.PositiveIntegerField(default=0)

    generated_at = models.DateTimeField(auto_now_add=True)
    generated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
    )

    class Meta:
        ordering = ["-report_date", "-report_number"]
        constraints = [
            models.UniqueConstraint(
                fields=["facility", "report_type", "report_date", "report_number"],
                name="unique_etims_daily_report",
            ),
        ]

    def __str__(self):
        return f"{self.get_report_type_display()} #{self.report_number} – {self.report_date}"


# ===========================================================================
# Phase 6: Predictive Analytics / Demand Forecasting
# ===========================================================================


class ForecastMethod(models.TextChoices):
    MOVING_AVERAGE = "MOVING_AVERAGE", "Moving Average"
    EXPONENTIAL_SMOOTHING = "EXPONENTIAL_SMOOTHING", "Exponential Smoothing"
    SEASONAL = "SEASONAL", "Seasonal"


class ReorderUrgency(models.TextChoices):
    CRITICAL = "CRITICAL", "Critical"
    HIGH = "HIGH", "High"
    MEDIUM = "MEDIUM", "Medium"
    LOW = "LOW", "Low"


class ReorderStatus(models.TextChoices):
    PENDING = "PENDING", "Pending"
    CONVERTED_TO_PO = "CONVERTED_TO_PO", "Converted to PO"
    DISMISSED = "DISMISSED", "Dismissed"


class ConsumptionRecord(FacilityScopedModel, TimeStampedModel):
    """
    Aggregated consumption data for a drug over a period.

    Auto-generated from Dispensing and StockAdjustment records by management
    commands or Celery tasks. Used as input for demand forecasting.
    """

    drug = models.ForeignKey(
        "pharmacy.Drug",
        on_delete=models.PROTECT,
        related_name="consumption_records",
    )
    period_start = models.DateField()
    period_end = models.DateField()
    quantity_dispensed = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        default=0,
        help_text="Total quantity dispensed in the period.",
    )
    quantity_transferred = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        default=0,
        help_text="Net transfer quantity (out - in) in the period.",
    )
    quantity_adjusted = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        default=0,
        help_text="Net adjustment quantity (damage, loss, expiry) in the period.",
    )

    class Meta:
        ordering = ["-period_end"]
        constraints = [
            models.UniqueConstraint(
                fields=["facility", "drug", "period_start", "period_end"],
                name="unique_consumption_per_drug_period",
            ),
        ]

    def __str__(self):
        return f"{self.drug.generic_name} consumption {self.period_start} – {self.period_end}"

    @property
    def total_consumption(self):
        """Total units consumed in the period (dispensed + outbound adjustments)."""
        return self.quantity_dispensed + self.quantity_adjusted

    @property
    def average_daily_consumption(self):
        """Average daily consumption based on period length."""
        days = (self.period_end - self.period_start).days
        if days <= 0:
            return self.total_consumption
        return self.total_consumption / days


class DemandForecast(FacilityScopedModel, TimeStampedModel):
    """
    Predicted demand for a drug over a future period.

    Generated by the forecasting service using historical ConsumptionRecords.
    """

    drug = models.ForeignKey(
        "pharmacy.Drug",
        on_delete=models.PROTECT,
        related_name="demand_forecasts",
    )
    forecast_date = models.DateField(
        help_text="Date this forecast was generated.",
    )
    period_months = models.PositiveIntegerField(
        default=3,
        help_text="Forecast horizon in months (e.g. 3, 6, 12).",
    )
    predicted_demand = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        help_text="Predicted total demand for the period.",
    )
    confidence_lower = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        null=True,
        blank=True,
        help_text="Lower bound of 95% confidence interval.",
    )
    confidence_upper = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        null=True,
        blank=True,
        help_text="Upper bound of 95% confidence interval.",
    )
    method = models.CharField(
        max_length=25,
        choices=ForecastMethod.choices,
        default=ForecastMethod.MOVING_AVERAGE,
    )
    reorder_point = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        null=True,
        blank=True,
        help_text="Computed: lead_time_demand + safety_stock.",
    )
    suggested_order_quantity = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        null=True,
        blank=True,
    )
    generated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="demand_forecasts_generated",
        help_text="User who triggered generation, or null for system-generated.",
    )

    class Meta:
        ordering = ["-forecast_date", "-created_at"]

    def __str__(self):
        return f"{self.drug.generic_name} forecast {self.forecast_date} ({self.period_months}m)"


class ReorderSuggestion(FacilityScopedModel, TimeStampedModel):
    """
    Suggested reorder for a drug based on demand forecast vs current stock.

    Can be converted into a PurchaseOrder via the convert_to_po action.
    """

    drug = models.ForeignKey(
        "pharmacy.Drug",
        on_delete=models.PROTECT,
        related_name="reorder_suggestions",
    )
    supplier = models.ForeignKey(
        "inventory.Supplier",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="reorder_suggestions",
    )
    current_stock = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        help_text="Stock on hand at time of suggestion.",
    )
    reorder_point = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        help_text="Stock level that triggers a reorder.",
    )
    suggested_quantity = models.DecimalField(
        max_digits=12,
        decimal_places=2,
    )
    urgency = models.CharField(
        max_length=10,
        choices=ReorderUrgency.choices,
        default=ReorderUrgency.MEDIUM,
    )
    status = models.CharField(
        max_length=18,
        choices=ReorderStatus.choices,
        default=ReorderStatus.PENDING,
    )
    purchase_order = models.ForeignKey(
        "inventory.PurchaseOrder",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="reorder_suggestions",
        help_text="Set when converted to a PO.",
    )

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return (
            f"{self.drug.generic_name} – {self.get_urgency_display()} "
            f"({self.suggested_quantity} units)"
        )

    def dismiss(self):
        """Mark suggestion as dismissed."""
        self.status = ReorderStatus.DISMISSED
        self.save(update_fields=["status", "updated_at"])

    def mark_converted(self, purchase_order):
        """Link to a PO and mark as converted."""
        self.status = ReorderStatus.CONVERTED_TO_PO
        self.purchase_order = purchase_order
        self.save(update_fields=["status", "purchase_order", "updated_at"])
