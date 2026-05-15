"""Admin configuration for the insurance app."""

from django.contrib import admin
from django.utils.html import format_html

from hmis.apps.insurance.models import (
    InsuranceClaim,
    InsuranceClaimItem,
    InsurancePlan,
    InsurancePreauth,
    InsuranceProvider,
    InsuranceProviderConfig,
    InsuranceRemittance,
    InsuranceRemittanceLine,
    PatientInsurance,
    PayerTariff,
)

STATUS_COLORS = {
    "active": "#28a745",
    "suspended": "#ffc107",
    "inactive": "#6c757d",
    "discontinued": "#6c757d",
    "expired": "#dc3545",
    "cancelled": "#dc3545",
    "pending_verification": "#17a2b8",
    # Claims
    "draft": "#6c757d",
    "submitted": "#17a2b8",
    "acknowledged": "#17a2b8",
    "under_review": "#17a2b8",
    "query": "#ffc107",
    "approved": "#28a745",
    "partially_approved": "#20c997",
    "rejected": "#dc3545",
    "paid": "#28a745",
    "partially_paid": "#20c997",
    "appealed": "#ffc107",
    "written_off": "#6c757d",
    "pending_preauth": "#ffc107",
    "preauth_approved": "#28a745",
    "preauth_denied": "#dc3545",
    # Preauth
    "denied": "#dc3545",
    # Remittance
    "received": "#17a2b8",
    "reconciled": "#28a745",
    "partial": "#ffc107",
    "disputed": "#dc3545",
}


def colored_status(status_value):
    color = STATUS_COLORS.get(status_value, "#6c757d")
    return format_html(
        '<span style="color:{}; font-weight:bold;">{}</span>',
        color,
        status_value.replace("_", " ").title(),
    )


class InsurancePlanInline(admin.TabularInline):
    model = InsurancePlan
    extra = 0
    fields = ["name", "code", "plan_type", "coverage_type", "status"]


@admin.register(InsuranceProvider)
class InsuranceProviderAdmin(admin.ModelAdmin):
    list_display = ["name", "code", "provider_type", "status_badge", "organization", "created_at"]
    list_filter = ["provider_type", "status", "organization"]
    search_fields = ["name", "code", "contact_person"]
    raw_id_fields = ["organization"]
    inlines = [InsurancePlanInline]

    @admin.display(description="Status")
    def status_badge(self, obj):
        return colored_status(obj.status)


@admin.register(InsurancePlan)
class InsurancePlanAdmin(admin.ModelAdmin):
    list_display = [
        "name",
        "code",
        "provider",
        "plan_type",
        "coverage_type",
        "default_copay_percent",
        "status_badge",
    ]
    list_filter = ["plan_type", "coverage_type", "status", "provider"]
    search_fields = ["name", "code", "provider__name"]
    raw_id_fields = ["provider", "organization"]

    @admin.display(description="Status")
    def status_badge(self, obj):
        return colored_status(obj.status)


@admin.register(PatientInsurance)
class PatientInsuranceAdmin(admin.ModelAdmin):
    list_display = [
        "patient",
        "provider",
        "plan",
        "member_number",
        "member_type",
        "status_badge",
        "valid_from",
        "valid_to",
        "is_primary",
    ]
    list_filter = ["status", "member_type", "is_primary", "provider"]
    search_fields = ["member_number", "patient__first_name", "patient__last_name"]
    raw_id_fields = ["patient", "plan", "provider", "principal_member", "organization"]

    @admin.display(description="Status")
    def status_badge(self, obj):
        return colored_status(obj.status)


@admin.register(InsuranceProviderConfig)
class InsuranceProviderConfigAdmin(admin.ModelAdmin):
    list_display = [
        "provider",
        "facility",
        "accreditation_status",
        "api_enabled",
        "submission_format",
    ]
    list_filter = ["accreditation_status", "api_enabled", "submission_format"]
    raw_id_fields = ["provider", "facility", "organization"]


class InsuranceClaimItemInline(admin.TabularInline):
    model = InsuranceClaimItem
    extra = 0
    fields = [
        "service_description",
        "service_code",
        "quantity",
        "unit_price",
        "claimed_amount",
        "approved_amount",
        "status",
    ]


@admin.register(InsuranceClaim)
class InsuranceClaimAdmin(admin.ModelAdmin):
    list_display = [
        "claim_number",
        "provider",
        "patient",
        "claim_type",
        "status_badge",
        "total_amount",
        "approved_amount",
        "paid_amount",
        "submission_date",
    ]
    list_filter = ["status", "claim_type", "provider"]
    search_fields = ["claim_number", "patient__first_name", "patient__last_name"]
    raw_id_fields = [
        "invoice",
        "patient_insurance",
        "provider",
        "patient",
        "encounter",
        "preauth",
        "submitted_by",
        "reviewed_by",
        "facility",
        "organization",
    ]
    inlines = [InsuranceClaimItemInline]

    @admin.display(description="Status")
    def status_badge(self, obj):
        return colored_status(obj.status)


@admin.register(InsurancePreauth)
class InsurancePreauthAdmin(admin.ModelAdmin):
    list_display = [
        "preauth_number",
        "provider",
        "patient",
        "preauth_type",
        "status_badge",
        "estimated_cost",
        "approved_amount",
    ]
    list_filter = ["status", "preauth_type", "provider"]
    search_fields = ["preauth_number", "patient__first_name", "patient__last_name"]
    raw_id_fields = [
        "patient_insurance",
        "provider",
        "patient",
        "submitted_by",
        "reviewed_by",
        "facility",
        "organization",
    ]

    @admin.display(description="Status")
    def status_badge(self, obj):
        return colored_status(obj.status)


class InsuranceRemittanceLineInline(admin.TabularInline):
    model = InsuranceRemittanceLine
    extra = 0
    fields = ["claim_number", "member_number", "paid_amount", "deductions", "net_amount"]
    raw_id_fields = ["claim"]


@admin.register(InsuranceRemittance)
class InsuranceRemittanceAdmin(admin.ModelAdmin):
    list_display = [
        "remittance_number",
        "provider",
        "remittance_date",
        "total_amount",
        "reconciled_amount",
        "status_badge",
    ]
    list_filter = ["status", "provider"]
    search_fields = ["remittance_number"]
    raw_id_fields = ["provider", "facility", "organization"]
    inlines = [InsuranceRemittanceLineInline]

    @admin.display(description="Status")
    def status_badge(self, obj):
        return colored_status(obj.status)


@admin.register(PayerTariff)
class PayerTariffAdmin(admin.ModelAdmin):
    list_display = [
        "provider",
        "service_code",
        "payer_code",
        "tariff_amount",
        "facility_charge",
        "requires_preauth",
        "effective_from",
    ]
    list_filter = ["provider", "requires_preauth"]
    search_fields = ["service_code", "payer_code", "payer_description"]
    raw_id_fields = ["provider", "plan", "service", "organization"]
