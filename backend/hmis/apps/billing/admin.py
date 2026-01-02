"""
Django admin configuration for billing app.
"""

from django.contrib import admin
from django.utils.html import format_html

from .models import (
    CreditNote,
    Invoice,
    InvoiceItem,
    Payment,
    Receipt,
    Service,
    ServiceCategory,
)


class InvoiceItemInline(admin.TabularInline):
    """Inline admin for InvoiceItem on Invoice page."""

    model = InvoiceItem
    extra = 0
    fields = ["service", "description", "quantity", "unit_price", "line_total"]
    readonly_fields = ["line_total"]
    autocomplete_fields = ["service"]


@admin.register(ServiceCategory)
class ServiceCategoryAdmin(admin.ModelAdmin):
    """Admin configuration for ServiceCategory model."""

    list_display = ["name", "code", "description_short", "is_active"]
    list_filter = ["is_active"]
    search_fields = ["name", "code", "description"]
    ordering = ["name"]

    @admin.display(description="Description")
    def description_short(self, obj):
        """Return truncated description."""
        if obj.description:
            return (
                obj.description[:50] + "..."
                if len(obj.description) > 50
                else obj.description
            )
        return "-"


@admin.register(Service)
class ServiceAdmin(admin.ModelAdmin):
    """Admin configuration for Service model."""

    list_display = [
        "name",
        "category",
        "code",
        "unit_price",
        "sha_code",
        "is_available",
        "is_active",
    ]
    list_filter = ["category", "is_available", "is_active"]
    search_fields = ["name", "code", "sha_code", "description"]
    ordering = ["name"]
    autocomplete_fields = ["category"]

    fieldsets = (
        (
            "Service Information",
            {"fields": ("name", "code", "category", "description")},
        ),
        (
            "Pricing",
            {"fields": ("unit_price",)},
        ),
        (
            "SHA Integration",
            {"fields": ("sha_code",)},
        ),
        (
            "Availability",
            {"fields": ("is_available", "is_active")},
        ),
    )


@admin.register(Invoice)
class InvoiceAdmin(admin.ModelAdmin):
    """Admin configuration for Invoice model."""

    list_display = [
        "invoice_number",
        "patient",
        "status",
        "invoice_date",
        "due_date",
        "subtotal",
        "balance_display",
    ]
    list_filter = ["status", "invoice_date", "due_date"]
    search_fields = [
        "invoice_number",
        "patient__mrn",
        "patient__first_name",
        "patient__last_name",
        "sha_claim_number",
    ]
    readonly_fields = [
        "invoice_number",
        "subtotal",
        "discount_amount",
        "insurance_amount",
        "total_amount",
        "paid_amount",
        "balance",
        "created_at",
        "updated_at",
    ]
    ordering = ["-invoice_date", "-created_at"]
    autocomplete_fields = ["patient", "encounter"]
    inlines = [InvoiceItemInline]
    date_hierarchy = "invoice_date"

    fieldsets = (
        (
            "Invoice Information",
            {"fields": ("invoice_number", "patient", "encounter", "invoice_date", "due_date")},
        ),
        (
            "Amounts",
            {
                "fields": (
                    "subtotal",
                    "discount_amount",
                    "insurance_amount",
                    "total_amount",
                    "paid_amount",
                    "balance",
                )
            },
        ),
        (
            "Status & Notes",
            {"fields": ("status", "notes", "cancellation_reason")},
        ),
        (
            "SHA Integration",
            {"fields": ("sha_claim_number",), "classes": ("collapse",)},
        ),
        (
            "Timestamps",
            {
                "fields": ("created_at", "updated_at"),
                "classes": ("collapse",),
            },
        ),
    )

    @admin.display(description="Balance")
    def balance_display(self, obj):
        """Display balance with color coding."""
        balance = obj.balance
        if balance > 0:
            return format_html(
                '<span style="color: red; font-weight: bold;">{}</span>',
                f"KSh {balance:,.2f}",
            )
        return format_html('<span style="color: green;">Paid</span>')


@admin.register(Payment)
class PaymentAdmin(admin.ModelAdmin):
    """Admin configuration for Payment model."""

    list_display = [
        "payment_reference",
        "invoice",
        "payment_method",
        "amount",
        "status",
        "payment_date",
    ]
    list_filter = ["payment_method", "status", "payment_date"]
    search_fields = [
        "payment_reference",
        "invoice__invoice_number",
        "invoice__patient__mrn",
        "mpesa_receipt",
    ]
    readonly_fields = [
        "payment_reference",
        "received_by",
        "processed_at",
        "created_at",
        "updated_at",
    ]
    ordering = ["-payment_date", "-created_at"]
    autocomplete_fields = ["invoice"]
    date_hierarchy = "payment_date"

    fieldsets = (
        (
            "Payment Information",
            {"fields": ("payment_reference", "invoice", "payment_method", "amount", "payment_date")},
        ),
        (
            "M-Pesa Details",
            {
                "fields": ("mpesa_receipt", "mpesa_phone", "mpesa_transaction_id"),
                "classes": ("collapse",),
            },
        ),
        (
            "Status & Processing",
            {"fields": ("status", "received_by", "processed_at", "notes")},
        ),
        (
            "Timestamps",
            {
                "fields": ("created_at", "updated_at"),
                "classes": ("collapse",),
            },
        ),
    )


@admin.register(Receipt)
class ReceiptAdmin(admin.ModelAdmin):
    """Admin configuration for Receipt model."""

    list_display = [
        "receipt_number",
        "payment",
        "patient_name",
        "amount",
        "issued_date",
        "is_void",
    ]
    list_filter = ["is_void", "issued_date"]
    search_fields = [
        "receipt_number",
        "patient_name",
        "payment__payment_reference",
        "payment__invoice__invoice_number",
    ]
    readonly_fields = [
        "receipt_number",
        "payment",
        "patient_name",
        "amount",
        "amount_words",
        "issued_by",
        "issued_date",
        "created_at",
        "updated_at",
    ]
    ordering = ["-issued_date", "-created_at"]
    date_hierarchy = "issued_date"

    fieldsets = (
        (
            "Receipt Information",
            {"fields": ("receipt_number", "payment", "patient_name", "amount", "amount_words")},
        ),
        (
            "Facility Details",
            {"fields": ("facility_name", "facility_address", "facility_phone")},
        ),
        (
            "Status & Issuance",
            {"fields": ("is_void", "void_reason", "issued_by", "issued_date")},
        ),
        (
            "Timestamps",
            {
                "fields": ("created_at", "updated_at"),
                "classes": ("collapse",),
            },
        ),
    )


@admin.register(CreditNote)
class CreditNoteAdmin(admin.ModelAdmin):
    """Admin configuration for CreditNote model."""

    list_display = [
        "credit_note_number",
        "invoice",
        "amount",
        "status",
        "reason",
        "requested_date",
    ]
    list_filter = ["status", "reason", "requested_date", "approved_date"]
    search_fields = [
        "credit_note_number",
        "invoice__invoice_number",
        "invoice__patient__mrn",
    ]
    readonly_fields = [
        "credit_note_number",
        "requested_by",
        "requested_date",
        "approved_by",
        "approved_date",
        "created_at",
        "updated_at",
    ]
    ordering = ["-requested_date", "-created_at"]
    autocomplete_fields = ["invoice"]
    date_hierarchy = "requested_date"

    fieldsets = (
        (
            "Credit Note Information",
            {"fields": ("credit_note_number", "invoice", "amount", "reason")},
        ),
        (
            "Request Details",
            {"fields": ("requested_by", "requested_date", "notes")},
        ),
        (
            "Approval Details",
            {"fields": ("status", "approved_by", "approved_date", "approval_notes")},
        ),
        (
            "Refund Details",
            {"fields": ("refund_processed", "refund_date", "refund_reference")},
        ),
        (
            "Timestamps",
            {
                "fields": ("created_at", "updated_at"),
                "classes": ("collapse",),
            },
        ),
    )
