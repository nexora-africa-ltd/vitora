"""Django admin configuration for inventory models."""

from django.contrib import admin
from django.utils.html import format_html

from .models import (
    GoodsReceiptNote,
    GRNItem,
    PurchaseOrder,
    PurchaseOrderItem,
    StockCount,
    StockCountItem,
    StockTransfer,
    StoreLocation,
    Supplier,
    TransferItem,
    WardStock,
    WardStockTransaction,
)


class PurchaseOrderItemInline(admin.TabularInline):
    model = PurchaseOrderItem
    extra = 0
    raw_id_fields = ("drug",)
    readonly_fields = ("quantity_received",)


class GRNItemInline(admin.TabularInline):
    model = GRNItem
    extra = 0
    raw_id_fields = ("drug", "po_item", "stock_batch")
    readonly_fields = ("stock_batch",)


@admin.register(Supplier)
class SupplierAdmin(admin.ModelAdmin):
    list_display = (
        "id",
        "code",
        "name",
        "supplier_type",
        "contact_person",
        "phone",
        "is_active",
        "rating",
        "lead_time_days",
        "organization",
        "created_at",
    )
    list_filter = ("supplier_type", "is_active", "organization")
    search_fields = ("code", "name", "contact_person", "tax_pin")
    raw_id_fields = ("organization",)


@admin.register(PurchaseOrder)
class PurchaseOrderAdmin(admin.ModelAdmin):
    list_display = (
        "id",
        "po_number",
        "supplier",
        "colored_status",
        "order_date",
        "expected_delivery_date",
        "ordered_by",
        "approved_by",
        "facility",
        "created_at",
    )
    list_filter = ("status", "facility", "supplier")
    search_fields = ("po_number", "supplier__name")
    raw_id_fields = ("supplier", "ordered_by", "approved_by", "facility", "organization")
    date_hierarchy = "order_date"
    inlines = [PurchaseOrderItemInline]

    @admin.display(description="Status")
    def colored_status(self, obj):
        colors = {
            "DRAFT": "#6b7280",
            "SUBMITTED": "#3b82f6",
            "APPROVED": "#10b981",
            "PARTIALLY_RECEIVED": "#f59e0b",
            "RECEIVED": "#059669",
            "CANCELLED": "#ef4444",
        }
        color = colors.get(obj.status, "#6b7280")
        return format_html(
            '<span style="color: {}; font-weight: bold;">{}</span>',
            color,
            obj.get_status_display(),
        )


@admin.register(GoodsReceiptNote)
class GoodsReceiptNoteAdmin(admin.ModelAdmin):
    list_display = (
        "id",
        "grn_number",
        "supplier",
        "colored_status",
        "purchase_order",
        "received_date",
        "received_by",
        "confirmed_by",
        "facility",
        "created_at",
    )
    list_filter = ("status", "facility", "supplier")
    search_fields = ("grn_number", "supplier__name", "delivery_note_number")
    raw_id_fields = (
        "supplier",
        "purchase_order",
        "received_by",
        "confirmed_by",
        "facility",
        "organization",
    )
    date_hierarchy = "received_date"
    inlines = [GRNItemInline]

    @admin.display(description="Status")
    def colored_status(self, obj):
        colors = {
            "DRAFT": "#6b7280",
            "CONFIRMED": "#10b981",
            "CANCELLED": "#ef4444",
        }
        color = colors.get(obj.status, "#6b7280")
        return format_html(
            '<span style="color: {}; font-weight: bold;">{}</span>',
            color,
            obj.get_status_display(),
        )


# ===========================================================================
# Phase 2: Multi-Store Stock Transfers
# ===========================================================================


@admin.register(StoreLocation)
class StoreLocationAdmin(admin.ModelAdmin):
    list_display = (
        "id",
        "code",
        "name",
        "location_type",
        "is_active",
        "managed_by",
        "facility",
        "created_at",
    )
    list_filter = ("location_type", "is_active", "facility")
    search_fields = ("code", "name")
    raw_id_fields = ("managed_by", "facility", "organization")


class TransferItemInline(admin.TabularInline):
    model = TransferItem
    extra = 0
    raw_id_fields = ("drug", "source_batch", "destination_batch")
    readonly_fields = ("destination_batch",)


@admin.register(StockTransfer)
class StockTransferAdmin(admin.ModelAdmin):
    list_display = (
        "id",
        "transfer_number",
        "source_facility",
        "destination_facility",
        "colored_status",
        "request_date",
        "requested_by",
        "organization",
        "created_at",
    )
    list_filter = ("status", "source_facility", "destination_facility")
    search_fields = ("transfer_number",)
    raw_id_fields = (
        "source_facility",
        "destination_facility",
        "source_store",
        "destination_store",
        "requested_by",
        "approved_by",
        "dispatched_by",
        "received_by",
        "organization",
    )
    date_hierarchy = "request_date"
    inlines = [TransferItemInline]

    @admin.display(description="Status")
    def colored_status(self, obj):
        colors = {
            "DRAFT": "#6b7280",
            "REQUESTED": "#3b82f6",
            "APPROVED": "#10b981",
            "IN_TRANSIT": "#f59e0b",
            "RECEIVED": "#059669",
            "CANCELLED": "#ef4444",
        }
        color = colors.get(obj.status, "#6b7280")
        return format_html(
            '<span style="color: {}; font-weight: bold;">{}</span>',
            color,
            obj.get_status_display(),
        )


# ===========================================================================
# Phase 3: Ward / Satellite Stock
# ===========================================================================


class WardStockTransactionInline(admin.TabularInline):
    model = WardStockTransaction
    extra = 0
    raw_id_fields = ("batch", "patient", "performed_by")
    readonly_fields = ("created_at",)


@admin.register(WardStock)
class WardStockAdmin(admin.ModelAdmin):
    list_display = (
        "id",
        "store_location",
        "drug",
        "ward",
        "quantity_available",
        "par_level",
        "max_level",
        "is_below_par",
        "facility",
        "updated_at",
    )
    list_filter = ("facility", "store_location", "ward")
    search_fields = ("drug__brand_name", "drug__generic_name")
    raw_id_fields = ("store_location", "drug", "ward", "facility", "organization")
    inlines = [WardStockTransactionInline]


@admin.register(WardStockTransaction)
class WardStockTransactionAdmin(admin.ModelAdmin):
    list_display = (
        "id",
        "ward_stock",
        "transaction_type",
        "quantity",
        "performed_by",
        "created_at",
    )
    list_filter = ("transaction_type",)
    search_fields = ("ward_stock__drug__brand_name",)
    raw_id_fields = ("ward_stock", "batch", "patient", "performed_by")


# ===========================================================================
# Phase 4: Stock Reconciliation & Cycle Counting
# ===========================================================================


class StockCountItemInline(admin.TabularInline):
    model = StockCountItem
    extra = 0
    raw_id_fields = ("drug", "batch", "counted_by")
    readonly_fields = ("system_quantity", "counted_at")


@admin.register(StockCount)
class StockCountAdmin(admin.ModelAdmin):
    list_display = (
        "id",
        "count_number",
        "count_type",
        "colored_status",
        "store_location",
        "started_by",
        "approved_by",
        "facility",
        "created_at",
    )
    list_filter = ("status", "count_type", "facility")
    search_fields = ("count_number",)
    raw_id_fields = (
        "store_location",
        "started_by",
        "approved_by",
        "facility",
        "organization",
    )
    date_hierarchy = "created_at"
    inlines = [StockCountItemInline]

    @admin.display(description="Status")
    def colored_status(self, obj):
        colors = {
            "DRAFT": "#6b7280",
            "IN_PROGRESS": "#3b82f6",
            "COMPLETED": "#f59e0b",
            "APPROVED": "#10b981",
            "CANCELLED": "#ef4444",
        }
        color = colors.get(obj.status, "#6b7280")
        return format_html(
            '<span style="color: {}; font-weight: bold;">{}</span>',
            color,
            obj.get_status_display(),
        )
