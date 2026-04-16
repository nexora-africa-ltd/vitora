"""Django admin configuration for inventory models."""

from django.contrib import admin
from django.utils.html import format_html

from .models import GoodsReceiptNote, GRNItem, PurchaseOrder, PurchaseOrderItem, Supplier


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
