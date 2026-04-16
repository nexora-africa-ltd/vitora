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
    Supplier,
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
