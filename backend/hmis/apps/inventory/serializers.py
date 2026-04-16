"""
Serializers for Inventory app.

Separate Create/Read serializers per model following project conventions.
"""

from rest_framework import serializers

from hmis.apps.inventory.models import (
    GoodsReceiptNote,
    GRNItem,
    PurchaseOrder,
    PurchaseOrderItem,
    StockTransfer,
    StoreLocation,
    Supplier,
    TransferItem,
)

# ---------------------------------------------------------------------------
# Supplier
# ---------------------------------------------------------------------------


class SupplierSerializer(serializers.ModelSerializer):
    """Read serializer for Supplier (list + detail)."""

    class Meta:
        model = Supplier
        fields = [
            "id",
            "code",
            "name",
            "supplier_type",
            "contact_person",
            "email",
            "phone",
            "address",
            "tax_pin",
            "payment_terms",
            "lead_time_days",
            "rating",
            "is_active",
            "notes",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]


class SupplierCreateSerializer(serializers.ModelSerializer):
    """Write serializer for Supplier creation."""

    class Meta:
        model = Supplier
        fields = [
            "code",
            "name",
            "supplier_type",
            "contact_person",
            "email",
            "phone",
            "address",
            "tax_pin",
            "payment_terms",
            "lead_time_days",
            "notes",
        ]


# ---------------------------------------------------------------------------
# Purchase Order Item (nested)
# ---------------------------------------------------------------------------


class PurchaseOrderItemSerializer(serializers.ModelSerializer):
    """Read serializer for PO items."""

    drug_name = serializers.CharField(source="drug.generic_name", read_only=True)
    line_total = serializers.DecimalField(max_digits=12, decimal_places=2, read_only=True)
    is_fully_received = serializers.BooleanField(read_only=True)
    outstanding_quantity = serializers.IntegerField(read_only=True)

    class Meta:
        model = PurchaseOrderItem
        fields = [
            "id",
            "drug",
            "drug_name",
            "quantity_ordered",
            "quantity_received",
            "unit_cost",
            "line_total",
            "is_fully_received",
            "outstanding_quantity",
            "notes",
        ]
        read_only_fields = ["id", "quantity_received"]


class PurchaseOrderItemCreateSerializer(serializers.ModelSerializer):
    """Write serializer for PO items (nested create)."""

    class Meta:
        model = PurchaseOrderItem
        fields = ["drug", "quantity_ordered", "unit_cost", "notes"]


# ---------------------------------------------------------------------------
# Purchase Order
# ---------------------------------------------------------------------------


class PurchaseOrderListSerializer(serializers.ModelSerializer):
    """Compact list serializer for POs."""

    supplier_name = serializers.CharField(source="supplier.name", read_only=True)
    total_amount = serializers.DecimalField(max_digits=12, decimal_places=2, read_only=True)
    is_fully_received = serializers.BooleanField(read_only=True)
    ordered_by_name = serializers.SerializerMethodField()

    class Meta:
        model = PurchaseOrder
        fields = [
            "id",
            "po_number",
            "supplier",
            "supplier_name",
            "status",
            "order_date",
            "expected_delivery_date",
            "total_amount",
            "is_fully_received",
            "ordered_by",
            "ordered_by_name",
            "created_at",
        ]
        read_only_fields = fields

    def get_ordered_by_name(self, obj):
        if obj.ordered_by:
            return (
                f"{obj.ordered_by.first_name} {obj.ordered_by.last_name}".strip()
                or obj.ordered_by.username
            )
        return ""


class PurchaseOrderDetailSerializer(serializers.ModelSerializer):
    """Full detail serializer for a single PO."""

    supplier_name = serializers.CharField(source="supplier.name", read_only=True)
    total_amount = serializers.DecimalField(max_digits=12, decimal_places=2, read_only=True)
    is_fully_received = serializers.BooleanField(read_only=True)
    items = PurchaseOrderItemSerializer(many=True, read_only=True)
    ordered_by_name = serializers.SerializerMethodField()
    approved_by_name = serializers.SerializerMethodField()

    class Meta:
        model = PurchaseOrder
        fields = [
            "id",
            "po_number",
            "supplier",
            "supplier_name",
            "status",
            "order_date",
            "expected_delivery_date",
            "total_amount",
            "is_fully_received",
            "ordered_by",
            "ordered_by_name",
            "approved_by",
            "approved_by_name",
            "approved_at",
            "cancelled_at",
            "cancellation_reason",
            "notes",
            "items",
            "created_at",
            "updated_at",
        ]
        read_only_fields = fields

    def get_ordered_by_name(self, obj):
        if obj.ordered_by:
            return (
                f"{obj.ordered_by.first_name} {obj.ordered_by.last_name}".strip()
                or obj.ordered_by.username
            )
        return ""

    def get_approved_by_name(self, obj):
        if obj.approved_by:
            return (
                f"{obj.approved_by.first_name} {obj.approved_by.last_name}".strip()
                or obj.approved_by.username
            )
        return ""


class PurchaseOrderCreateSerializer(serializers.ModelSerializer):
    """Write serializer for PO creation with nested items."""

    items = PurchaseOrderItemCreateSerializer(many=True)

    class Meta:
        model = PurchaseOrder
        fields = [
            "supplier",
            "order_date",
            "expected_delivery_date",
            "notes",
            "items",
        ]

    def validate_items(self, value):
        if not value:
            raise serializers.ValidationError("At least one item is required.")
        return value

    def create(self, validated_data):
        items_data = validated_data.pop("items")
        po = PurchaseOrder.objects.create(**validated_data)
        for item_data in items_data:
            PurchaseOrderItem.objects.create(purchase_order=po, **item_data)
        return po


class POApproveSerializer(serializers.Serializer):
    """Action serializer for approving a PO."""

    notes = serializers.CharField(required=False, allow_blank=True, default="")


class POCancelSerializer(serializers.Serializer):
    """Action serializer for cancelling a PO."""

    reason = serializers.CharField(required=False, allow_blank=True, default="")


# ---------------------------------------------------------------------------
# GRN Item (nested)
# ---------------------------------------------------------------------------


class GRNItemSerializer(serializers.ModelSerializer):
    """Read serializer for GRN items."""

    drug_name = serializers.CharField(source="drug.generic_name", read_only=True)
    line_total = serializers.DecimalField(max_digits=12, decimal_places=2, read_only=True)
    stock_batch_id = serializers.IntegerField(
        source="stock_batch.id", read_only=True, allow_null=True
    )

    class Meta:
        model = GRNItem
        fields = [
            "id",
            "drug",
            "drug_name",
            "po_item",
            "batch_number",
            "expiry_date",
            "manufacture_date",
            "quantity_received",
            "cost_price",
            "selling_price",
            "location",
            "notes",
            "stock_batch_id",
            "line_total",
        ]
        read_only_fields = ["id", "stock_batch_id", "line_total"]


class GRNItemCreateSerializer(serializers.ModelSerializer):
    """Write serializer for GRN items (nested create)."""

    class Meta:
        model = GRNItem
        fields = [
            "drug",
            "po_item",
            "batch_number",
            "expiry_date",
            "manufacture_date",
            "quantity_received",
            "cost_price",
            "selling_price",
            "location",
            "notes",
        ]


# ---------------------------------------------------------------------------
# Goods Receipt Note
# ---------------------------------------------------------------------------


class GoodsReceiptNoteListSerializer(serializers.ModelSerializer):
    """Compact list serializer for GRNs."""

    supplier_name = serializers.CharField(source="supplier.name", read_only=True)
    po_number = serializers.CharField(
        source="purchase_order.po_number", read_only=True, allow_null=True
    )
    total_items = serializers.IntegerField(read_only=True)
    total_amount = serializers.DecimalField(max_digits=12, decimal_places=2, read_only=True)
    received_by_name = serializers.SerializerMethodField()

    class Meta:
        model = GoodsReceiptNote
        fields = [
            "id",
            "grn_number",
            "purchase_order",
            "po_number",
            "supplier",
            "supplier_name",
            "status",
            "received_date",
            "delivery_note_number",
            "total_items",
            "total_amount",
            "received_by",
            "received_by_name",
            "created_at",
        ]
        read_only_fields = fields

    def get_received_by_name(self, obj):
        if obj.received_by:
            return (
                f"{obj.received_by.first_name} {obj.received_by.last_name}".strip()
                or obj.received_by.username
            )
        return ""


class GoodsReceiptNoteDetailSerializer(serializers.ModelSerializer):
    """Full detail serializer for a single GRN."""

    supplier_name = serializers.CharField(source="supplier.name", read_only=True)
    po_number = serializers.CharField(
        source="purchase_order.po_number", read_only=True, allow_null=True
    )
    total_items = serializers.IntegerField(read_only=True)
    total_amount = serializers.DecimalField(max_digits=12, decimal_places=2, read_only=True)
    items = GRNItemSerializer(many=True, read_only=True)
    received_by_name = serializers.SerializerMethodField()
    confirmed_by_name = serializers.SerializerMethodField()

    class Meta:
        model = GoodsReceiptNote
        fields = [
            "id",
            "grn_number",
            "purchase_order",
            "po_number",
            "supplier",
            "supplier_name",
            "status",
            "received_date",
            "delivery_note_number",
            "invoice_number",
            "notes",
            "total_items",
            "total_amount",
            "items",
            "received_by",
            "received_by_name",
            "confirmed_at",
            "confirmed_by",
            "confirmed_by_name",
            "created_at",
            "updated_at",
        ]
        read_only_fields = fields

    def get_received_by_name(self, obj):
        if obj.received_by:
            return (
                f"{obj.received_by.first_name} {obj.received_by.last_name}".strip()
                or obj.received_by.username
            )
        return ""

    def get_confirmed_by_name(self, obj):
        if obj.confirmed_by:
            return (
                f"{obj.confirmed_by.first_name} {obj.confirmed_by.last_name}".strip()
                or obj.confirmed_by.username
            )
        return ""


class GoodsReceiptNoteCreateSerializer(serializers.ModelSerializer):
    """Write serializer for GRN creation with nested items."""

    items = GRNItemCreateSerializer(many=True)

    class Meta:
        model = GoodsReceiptNote
        fields = [
            "purchase_order",
            "supplier",
            "received_date",
            "delivery_note_number",
            "invoice_number",
            "notes",
            "items",
        ]

    def validate_items(self, value):
        if not value:
            raise serializers.ValidationError("At least one item is required.")
        return value

    def create(self, validated_data):
        items_data = validated_data.pop("items")
        grn = GoodsReceiptNote.objects.create(**validated_data)
        for item_data in items_data:
            GRNItem.objects.create(grn=grn, **item_data)
        return grn


# ===========================================================================
# Phase 2: Multi-Store Stock Transfers
# ===========================================================================


# ---------------------------------------------------------------------------
# Store Location
# ---------------------------------------------------------------------------


class StoreLocationSerializer(serializers.ModelSerializer):
    """Read serializer for StoreLocation."""

    managed_by_name = serializers.SerializerMethodField()

    class Meta:
        model = StoreLocation
        fields = [
            "id",
            "code",
            "name",
            "location_type",
            "is_active",
            "managed_by",
            "managed_by_name",
            "notes",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]

    def get_managed_by_name(self, obj):
        if obj.managed_by:
            return (
                f"{obj.managed_by.first_name} {obj.managed_by.last_name}".strip()
                or obj.managed_by.username
            )
        return ""


class StoreLocationCreateSerializer(serializers.ModelSerializer):
    """Write serializer for StoreLocation creation."""

    class Meta:
        model = StoreLocation
        fields = [
            "code",
            "name",
            "location_type",
            "is_active",
            "managed_by",
            "notes",
        ]


# ---------------------------------------------------------------------------
# Transfer Item (nested)
# ---------------------------------------------------------------------------


class TransferItemSerializer(serializers.ModelSerializer):
    """Read serializer for TransferItem."""

    drug_name = serializers.CharField(source="drug.generic_name", read_only=True)
    source_batch_number = serializers.CharField(source="source_batch.batch_number", read_only=True)
    destination_batch_id = serializers.IntegerField(
        source="destination_batch.id", read_only=True, allow_null=True
    )

    class Meta:
        model = TransferItem
        fields = [
            "id",
            "drug",
            "drug_name",
            "source_batch",
            "source_batch_number",
            "quantity_requested",
            "quantity_dispatched",
            "quantity_received",
            "destination_batch_id",
            "notes",
        ]
        read_only_fields = [
            "id",
            "quantity_dispatched",
            "quantity_received",
            "destination_batch_id",
        ]


class TransferItemCreateSerializer(serializers.ModelSerializer):
    """Write serializer for TransferItem (nested create)."""

    class Meta:
        model = TransferItem
        fields = ["drug", "source_batch", "quantity_requested", "notes"]


# ---------------------------------------------------------------------------
# Stock Transfer
# ---------------------------------------------------------------------------


def _user_display_name(user):
    """Return display name for a user."""
    if user:
        return f"{user.first_name} {user.last_name}".strip() or user.username
    return ""


class StockTransferListSerializer(serializers.ModelSerializer):
    """Compact list serializer for stock transfers."""

    source_facility_name = serializers.CharField(source="source_facility.name", read_only=True)
    destination_facility_name = serializers.CharField(
        source="destination_facility.name", read_only=True
    )
    total_items = serializers.IntegerField(read_only=True)
    requested_by_name = serializers.SerializerMethodField()

    class Meta:
        model = StockTransfer
        fields = [
            "id",
            "transfer_number",
            "source_facility",
            "source_facility_name",
            "source_store",
            "destination_facility",
            "destination_facility_name",
            "destination_store",
            "status",
            "request_date",
            "total_items",
            "requested_by",
            "requested_by_name",
            "created_at",
        ]
        read_only_fields = fields

    def get_requested_by_name(self, obj):
        return _user_display_name(obj.requested_by)


class StockTransferDetailSerializer(serializers.ModelSerializer):
    """Full detail serializer for a single stock transfer."""

    source_facility_name = serializers.CharField(source="source_facility.name", read_only=True)
    destination_facility_name = serializers.CharField(
        source="destination_facility.name", read_only=True
    )
    source_store_name = serializers.CharField(
        source="source_store.name", read_only=True, allow_null=True
    )
    destination_store_name = serializers.CharField(
        source="destination_store.name", read_only=True, allow_null=True
    )
    total_items = serializers.IntegerField(read_only=True)
    items = TransferItemSerializer(many=True, read_only=True)
    requested_by_name = serializers.SerializerMethodField()
    approved_by_name = serializers.SerializerMethodField()
    dispatched_by_name = serializers.SerializerMethodField()
    received_by_name = serializers.SerializerMethodField()

    class Meta:
        model = StockTransfer
        fields = [
            "id",
            "transfer_number",
            "source_facility",
            "source_facility_name",
            "source_store",
            "source_store_name",
            "destination_facility",
            "destination_facility_name",
            "destination_store",
            "destination_store_name",
            "status",
            "request_date",
            "notes",
            "cancellation_reason",
            "total_items",
            "items",
            "requested_by",
            "requested_by_name",
            "approved_by",
            "approved_by_name",
            "approved_at",
            "dispatched_by",
            "dispatched_by_name",
            "dispatched_at",
            "received_by",
            "received_by_name",
            "received_at",
            "cancelled_at",
            "created_at",
            "updated_at",
        ]
        read_only_fields = fields

    def get_requested_by_name(self, obj):
        return _user_display_name(obj.requested_by)

    def get_approved_by_name(self, obj):
        return _user_display_name(obj.approved_by)

    def get_dispatched_by_name(self, obj):
        return _user_display_name(obj.dispatched_by)

    def get_received_by_name(self, obj):
        return _user_display_name(obj.received_by)


class StockTransferCreateSerializer(serializers.ModelSerializer):
    """Write serializer for stock transfer creation with nested items."""

    items = TransferItemCreateSerializer(many=True)

    class Meta:
        model = StockTransfer
        fields = [
            "source_facility",
            "source_store",
            "destination_facility",
            "destination_store",
            "request_date",
            "notes",
            "items",
        ]

    def validate(self, data):
        if data["source_facility"] == data["destination_facility"]:
            # Same facility — stores must differ
            src_store = data.get("source_store")
            dst_store = data.get("destination_store")
            if src_store and dst_store and src_store == dst_store:
                raise serializers.ValidationError(
                    "Source and destination stores cannot be the same."
                )
        return data

    def validate_items(self, value):
        if not value:
            raise serializers.ValidationError("At least one item is required.")
        return value

    def create(self, validated_data):
        items_data = validated_data.pop("items")
        transfer = StockTransfer.objects.create(**validated_data)
        for item_data in items_data:
            TransferItem.objects.create(transfer=transfer, **item_data)
        return transfer


class TransferApproveSerializer(serializers.Serializer):
    """Action serializer for approving a transfer."""

    notes = serializers.CharField(required=False, allow_blank=True, default="")


class TransferCancelSerializer(serializers.Serializer):
    """Action serializer for cancelling a transfer."""

    reason = serializers.CharField(required=False, allow_blank=True, default="")
