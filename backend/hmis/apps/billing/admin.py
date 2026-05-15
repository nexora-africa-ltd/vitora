"""
Django admin configuration for billing app.
"""

from django.contrib import admin
from django.utils.html import format_html

from .models import (
    CreditNote,
    FacilityBillingConfig,
    ICD11CodeReference,
    Invoice,
    InvoiceItem,
    InvoicePayer,
    Payment,
    PaymentPoint,
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


class InvoicePayerInline(admin.TabularInline):
    """Inline admin for InvoicePayer on Invoice page."""

    model = InvoicePayer
    extra = 0
    fields = [
        "priority",
        "payer_type",
        "provider_name",
        "member_number",
        "allocated_amount",
        "approved_amount",
        "paid_amount",
        "status",
    ]
    readonly_fields = ["created_at"]


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
            return obj.description[:50] + "..." if len(obj.description) > 50 else obj.description
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
        "is_active",
    ]
    list_filter = ["category", "is_active"]
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
            {"fields": ("is_active",)},
        ),
    )


@admin.register(ICD11CodeReference)
class ICD11CodeReferenceAdmin(admin.ModelAdmin):
    """Admin configuration for the local ICD-11 fallback catalog."""

    list_display = ["code", "title", "chapter_no", "class_kind", "is_leaf", "is_active"]
    list_filter = ["chapter_no", "class_kind", "is_leaf", "is_residual", "is_active"]
    search_fields = ["code", "title", "description"]
    ordering = ["code"]


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
        "amount_paid",
        "balance_due",
        "created_at",
        "updated_at",
    ]
    ordering = ["-invoice_date", "-created_at"]
    autocomplete_fields = ["patient", "encounter"]
    inlines = [InvoiceItemInline, InvoicePayerInline]
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
                    "amount_paid",
                    "balance_due",
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
        balance = obj.balance_due
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
        "payment_point",
        "method",
        "amount",
        "status",
        "payment_date",
    ]
    list_filter = ["method", "status", "payment_date"]
    search_fields = [
        "payment_reference",
        "invoice__invoice_number",
        "invoice__patient__mrn",
        "mpesa_receipt_number",
    ]
    readonly_fields = [
        "payment_reference",
        "received_by",
        "processed_at",
        "created_at",
        "updated_at",
    ]
    ordering = ["-payment_date", "-created_at"]
    autocomplete_fields = ["invoice", "payment_point"]
    date_hierarchy = "payment_date"

    fieldsets = (
        (
            "Payment Information",
            {
                "fields": (
                    "payment_reference",
                    "invoice",
                    "payment_point",
                    "method",
                    "amount",
                    "payment_date",
                )
            },
        ),
        (
            "M-Pesa Details",
            {
                "fields": ("mpesa_receipt_number", "mpesa_phone", "mpesa_transaction_id"),
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


@admin.register(PaymentPoint)
class PaymentPointAdmin(admin.ModelAdmin):
    """Admin configuration for PaymentPoint model."""

    list_display = [
        "name",
        "code",
        "method",
        "till_number",
        "paybill_number",
        "bank_name",
        "bank_account_number",
        "is_active",
    ]
    list_filter = ["method", "is_active"]
    search_fields = [
        "name",
        "code",
        "till_number",
        "paybill_number",
        "bank_name",
        "bank_account_number",
    ]
    ordering = ["method", "name"]
    readonly_fields = ["created_at", "updated_at", "created_by"]

    fieldsets = (
        (
            "Payment Point",
            {"fields": ("name", "code", "method", "is_active")},
        ),
        (
            "M-Pesa",
            {
                "fields": ("till_number", "paybill_number", "paybill_account_number"),
                "classes": ("collapse",),
            },
        ),
        (
            "Bank",
            {
                "fields": ("bank_name", "bank_branch", "bank_account_name", "bank_account_number"),
                "classes": ("collapse",),
            },
        ),
        (
            "Notes",
            {"fields": ("notes",)},
        ),
        (
            "Audit",
            {"fields": ("created_by", "created_at", "updated_at"), "classes": ("collapse",)},
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
        "receipt_date",
        "is_voided",
    ]
    list_filter = ["is_voided", "receipt_date"]
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
        "amount_in_words",
        "issued_by",
        "receipt_date",
        "created_at",
    ]
    ordering = ["-receipt_date", "-created_at"]
    date_hierarchy = "receipt_date"

    fieldsets = (
        (
            "Receipt Information",
            {"fields": ("receipt_number", "payment", "patient_name", "amount", "amount_in_words")},
        ),
        (
            "Facility Details",
            {"fields": ("facility_name", "facility_address", "facility_phone")},
        ),
        (
            "Status & Issuance",
            {"fields": ("is_voided", "void_reason", "issued_by", "receipt_date")},
        ),
        (
            "Timestamps",
            {
                "fields": ("created_at",),
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
        "created_at",
    ]
    list_filter = ["status", "reason", "created_at", "approved_at"]
    search_fields = [
        "credit_note_number",
        "invoice__invoice_number",
        "invoice__patient__mrn",
    ]
    readonly_fields = [
        "credit_note_number",
        "requested_by",
        "created_at",
        "approved_by",
        "approved_at",
        "updated_at",
    ]
    ordering = ["-created_at"]
    autocomplete_fields = ["invoice"]
    date_hierarchy = "created_at"

    fieldsets = (
        (
            "Credit Note Information",
            {"fields": ("credit_note_number", "invoice", "amount", "reason")},
        ),
        (
            "Request Details",
            {"fields": ("requested_by", "created_at", "reason_detail")},
        ),
        (
            "Approval Details",
            {"fields": ("status", "approved_by", "approved_at")},
        ),
        (
            "Refund Details",
            {"fields": ("refund_method", "refunded_at", "refund_reference")},
        ),
        (
            "Timestamps",
            {
                "fields": ("updated_at",),
                "classes": ("collapse",),
            },
        ),
    )


@admin.register(FacilityBillingConfig)
class FacilityBillingConfigAdmin(admin.ModelAdmin):
    """Admin configuration for FacilityBillingConfig model."""

    list_display = [
        "facility",
        "default_payment_type",
        "sha_accreditation_badge",
        "sha_contract_active_badge",
        "sha_contract_end",
    ]
    list_filter = [
        "sha_accreditation_status",
        "default_payment_type",
    ]
    search_fields = [
        "facility__name",
        "facility__mfl_code",
        "sha_contract_number",
    ]
    raw_id_fields = ["facility"]

    fieldsets = (
        (
            "Facility",
            {"fields": ("facility",)},
        ),
        (
            "Billing Defaults",
            {
                "fields": (
                    "default_payment_type",
                    "default_due_days",
                    "auto_finalize_on_checkout",
                    "tax_rate",
                ),
            },
        ),
        (
            "SHA Accreditation",
            {
                "fields": (
                    "sha_accreditation_status",
                    "sha_accreditation_date",
                    "sha_accreditation_expiry",
                ),
            },
        ),
        (
            "SHA Contract",
            {
                "fields": (
                    "sha_contract_number",
                    "sha_contract_start",
                    "sha_contract_end",
                    "sha_service_level",
                    "sha_max_claim_amount",
                ),
            },
        ),
        (
            "Fee Schedule",
            {
                "fields": ("fee_schedule_name", "fee_schedule_override"),
                "classes": ("collapse",),
            },
        ),
        (
            "Collection Accounts",
            {
                "fields": (
                    "mpesa_paybill",
                    "mpesa_account_ref",
                    "bank_name",
                    "bank_account_number",
                    "bank_branch",
                ),
                "classes": ("collapse",),
            },
        ),
        (
            "M-Pesa API Credentials",
            {
                "fields": (
                    "mpesa_consumer_key",
                    "mpesa_consumer_secret",
                    "mpesa_passkey",
                    "mpesa_shortcode",
                    "mpesa_callback_url",
                    "mpesa_environment",
                ),
                "classes": ("collapse",),
                "description": "Per-facility Daraja API credentials. Leave blank to use global settings.",
            },
        ),
    )

    @admin.display(description="SHA Accredited")
    def sha_accreditation_badge(self, obj):
        if obj.is_sha_accredited:
            return format_html('<span style="color: green;">&#10004; Accredited</span>')
        status_display = obj.get_sha_accreditation_status_display()
        return format_html('<span style="color: gray;">{}</span>', status_display)

    @admin.display(description="Contract Active")
    def sha_contract_active_badge(self, obj):
        if obj.is_sha_contract_active:
            days = obj.sha_contract_days_remaining
            if days is not None and days <= 30:
                return format_html('<span style="color: orange;">&#9888; {} days left</span>', days)
            return format_html('<span style="color: green;">&#10004; Active</span>')
        return format_html('<span style="color: gray;">&#10008; Inactive</span>')


# ---------------------------------------------------------------------------
# DHA HIE Middleware (ILM) — SHAClaim admin polish
# ---------------------------------------------------------------------------
from .models import (  # noqa: E402
    PatientContact,
    SHAClaim,
    SHAClaimAttachment,
    SHAClaimItem,
    SHACoverageSnapshot,
)


class SHAClaimItemInline(admin.TabularInline):
    model = SHAClaimItem
    extra = 0
    fields = ("description", "quantity", "unit_price", "claimed_amount")
    readonly_fields = ("claimed_amount",)


class SHAClaimAttachmentInline(admin.TabularInline):
    model = SHAClaimAttachment
    extra = 0
    fields = ("attachment_type", "name", "uploaded_by", "created_at")
    readonly_fields = ("created_at",)


@admin.register(SHAClaim)
class SHAClaimAdmin(admin.ModelAdmin):
    """Admin for SHA claims with DHA HIE Middleware (ILM) tracking fields."""

    list_display = (
        "claim_number",
        "patient",
        "facility",
        "status",
        "dha_status_badge",
        "claimed_amount",
        "service_date",
        "submitted_at",
    )
    list_filter = (
        "status",
        "claim_type",
        "claim_flow",
        "last_dha_status",
        "facility",
        "submission_method",
    )
    search_fields = (
        "claim_number",
        "sha_claim_reference",
        "dha_external_id",
        "dha_correlation_id",
        "patient__first_name",
        "patient__last_name",
    )
    raw_id_fields = (
        "patient",
        "sha_member",
        "encounter",
        "invoice",
        "facility",
        "submitted_by",
        "created_by",
        "parent_claim",
    )
    readonly_fields = (
        "claim_number",
        "sha_claim_reference",
        "dha_external_id",
        "dha_correlation_id",
        "last_dha_status",
        "last_dha_payload_at",
        "dha_visit_started_at",
        "submitted_at",
        "created_at",
        "updated_at",
    )
    inlines = [SHAClaimItemInline, SHAClaimAttachmentInline]
    fieldsets = (
        (
            "Identifiers",
            {
                "fields": (
                    "claim_number",
                    "sha_claim_reference",
                    "facility",
                    "patient",
                    "sha_member",
                    "encounter",
                    "invoice",
                )
            },
        ),
        (
            "Claim",
            {
                "fields": (
                    "claim_type",
                    "claim_flow",
                    "status",
                    "service_date",
                    "admission_date",
                    "discharge_date",
                    "primary_diagnosis_code",
                    "primary_diagnosis_description",
                    "claimed_amount",
                    "approved_amount",
                    "paid_amount",
                )
            },
        ),
        (
            "DHA HIE Middleware (ILM)",
            {
                "fields": (
                    "dha_external_id",
                    "dha_correlation_id",
                    "last_dha_status",
                    "last_dha_payload_at",
                    "dha_visit_started_at",
                ),
                "description": "Tracking fields populated by IlmClaimService calls.",
            },
        ),
        (
            "Audit",
            {
                "fields": (
                    "created_by",
                    "submitted_by",
                    "submitted_at",
                    "created_at",
                    "updated_at",
                )
            },
        ),
    )

    @admin.display(description="DHA Status", ordering="last_dha_status")
    def dha_status_badge(self, obj):
        status = obj.last_dha_status or ""
        if not status:
            return format_html('<span style="color: gray;">—</span>')
        colors = {
            "VISIT_STARTED": "blue",
            "SUBMITTED": "green",
            "CLOSED": "orange",
        }
        return format_html(
            '<span style="color: {};">{}</span>', colors.get(status, "black"), status
        )


# ============================================================================
# DHA HIE Middleware (ILM) — Phase 2 caches
# ============================================================================


@admin.register(PatientContact)
class PatientContactAdmin(admin.ModelAdmin):
    list_display = (
        "id",
        "patient",
        "contact_type",
        "full_name",
        "phone",
        "is_otp_recipient",
        "fetched_at",
    )
    list_filter = ("contact_type", "is_otp_recipient")
    search_fields = (
        "patient__mrn",
        "full_name",
        "phone",
        "identification_number",
        "dha_contact_id",
    )
    raw_id_fields = ("patient", "sha_member", "facility", "organization")
    readonly_fields = ("fetched_at",)


@admin.register(SHACoverageSnapshot)
class SHACoverageSnapshotAdmin(admin.ModelAdmin):
    list_display = (
        "id",
        "patient",
        "snapshot_type",
        "is_eligible",
        "member_cr_number",
        "http_status",
        "fetched_at",
    )
    list_filter = ("snapshot_type", "is_eligible", "http_status")
    search_fields = (
        "patient__mrn",
        "member_cr_number",
        "sub_benefit_code",
        "intervention_code",
        "correlation_id",
    )
    raw_id_fields = ("patient", "sha_member", "facility", "organization", "fetched_by")
    readonly_fields = ("fetched_at", "fetched_by", "correlation_id", "http_status", "payload")


# ---------------------------------------------------------------------------
# DHA HIE Middleware (ILM) — Phase 3 preauth & emergency admin
# ---------------------------------------------------------------------------
from .models import SHAEmergencyClaim, SHAPreauth  # noqa: E402


@admin.register(SHAPreauth)
class SHAPreauthAdmin(admin.ModelAdmin):
    list_display = (
        "id",
        "patient",
        "claim",
        "intervention_code",
        "status",
        "doctor_consent_state",
        "dha_external_id",
        "submitted_at",
        "decided_at",
    )
    list_filter = ("status", "doctor_consent_state")
    search_fields = (
        "patient__mrn",
        "intervention_code",
        "dha_external_id",
        "consent_token",
        "correlation_id",
    )
    raw_id_fields = (
        "patient",
        "sha_member",
        "claim",
        "facility",
        "organization",
        "requested_by",
        "decided_by",
    )
    readonly_fields = (
        "created_at",
        "updated_at",
        "submitted_at",
        "decided_at",
        "cancelled_at",
        "correlation_id",
        "request_payload",
        "response_payload",
    )


@admin.register(SHAEmergencyClaim)
class SHAEmergencyClaimAdmin(admin.ModelAdmin):
    list_display = (
        "id",
        "kind",
        "status",
        "patient",
        "reference_number",
        "case_number",
        "dha_external_id",
        "created_at",
    )
    list_filter = ("kind", "status")
    search_fields = (
        "reference_number",
        "case_number",
        "beneficiary_cr_id",
        "dha_external_id",
        "correlation_id",
        "patient__mrn",
    )
    raw_id_fields = (
        "patient",
        "sha_member",
        "claim",
        "facility",
        "organization",
        "opened_by",
    )
    readonly_fields = (
        "created_at",
        "updated_at",
        "correlation_id",
        "request_payload",
        "response_payload",
    )


# ============================================================================
# DHA HIE Middleware (ILM) — Phase 4 lifecycle polish admin
# ============================================================================
from .models import SHAOtpRequest, SHAOtpWhitelistRequest, SHAUpload  # noqa: E402


@admin.register(SHAOtpRequest)
class SHAOtpRequestAdmin(admin.ModelAdmin):
    list_display = ("id", "kind", "status", "patient_cr_id", "patient", "facility", "sent_at")
    list_filter = ("kind", "status", "facility")
    search_fields = ("patient_cr_id", "consent_token", "correlation_id")
    raw_id_fields = ("patient", "sha_member", "claim", "facility", "organization", "sent_by")
    readonly_fields = ("response_payload", "correlation_id", "sent_at", "verified_at")


@admin.register(SHAOtpWhitelistRequest)
class SHAOtpWhitelistRequestAdmin(admin.ModelAdmin):
    list_display = ("id", "beneficiary_cr_id", "status", "reason_type", "facility", "requested_at")
    list_filter = ("status", "reason_type", "facility")
    search_fields = ("beneficiary_cr_id", "dha_guid", "reason", "correlation_id")
    raw_id_fields = ("patient", "facility", "organization", "requested_by")
    readonly_fields = ("response_payload", "correlation_id", "dha_guid", "requested_at")


@admin.register(SHAUpload)
class SHAUploadAdmin(admin.ModelAdmin):
    list_display = ("id", "filename", "dha_file_id", "size_bytes", "facility", "uploaded_at")
    list_filter = ("facility",)
    search_fields = ("filename", "dha_file_id", "correlation_id")
    raw_id_fields = ("facility", "organization", "uploaded_by")
    readonly_fields = (
        "response_payload",
        "correlation_id",
        "dha_file_id",
        "dha_file_path",
        "dha_download_url",
        "uploaded_at",
    )


from .models import SHADhaPrescription  # noqa: E402


@admin.register(SHADhaPrescription)
class SHADhaPrescriptionAdmin(admin.ModelAdmin):
    list_display = (
        "id",
        "intervention_code",
        "status",
        "patient",
        "dha_external_id",
        "facility",
        "created_at",
        "dispensed_at",
    )
    list_filter = ("status", "facility")
    search_fields = (
        "intervention_code",
        "identification_number",
        "dha_external_id",
        "dha_guid",
        "correlation_id",
    )
    raw_id_fields = ("patient", "encounter", "claim", "facility", "organization", "created_by")
    readonly_fields = (
        "response_payload",
        "dispense_payload",
        "correlation_id",
        "dha_external_id",
        "dha_guid",
        "created_at",
        "dispensed_at",
    )
