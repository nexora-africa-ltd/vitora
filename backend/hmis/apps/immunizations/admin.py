"""Admin configuration for the immunizations app."""

from django.contrib import admin
from django.utils.html import format_html

from hmis.apps.immunizations.models import (
    AEFI,
    ColdChainEquipment,
    ImmunizationRecord,
    StockTransaction,
    TemperatureLog,
    VaccineCampaign,
    VaccineDefinition,
    VaccineIncident,
    VaccineStock,
)


@admin.register(VaccineDefinition)
class VaccineDefinitionAdmin(admin.ModelAdmin):
    list_display = [
        "code",
        "name",
        "target_population",
        "program",
        "dose_number",
        "total_doses",
        "standard_age_days",
        "is_active",
    ]
    list_filter = ["program", "target_population", "is_active", "route"]
    search_fields = ["code", "name", "disease_target"]
    ordering = ["standard_age_days", "code"]


@admin.register(ImmunizationRecord)
class ImmunizationRecordAdmin(admin.ModelAdmin):
    list_display = [
        "id",
        "patient",
        "vaccine_code",
        "dose_number",
        "status_badge",
        "scheduled_date",
        "administered_date",
        "facility",
    ]
    list_filter = ["status", "vaccine__program", "vaccine__target_population", "facility"]
    search_fields = [
        "patient__first_name",
        "patient__last_name",
        "patient__mrn",
        "vaccine__code",
    ]
    raw_id_fields = [
        "patient",
        "administered_by",
        "encounter",
        "campaign",
        "facility",
        "organization",
    ]
    ordering = ["-scheduled_date"]

    def vaccine_code(self, obj):
        return obj.vaccine.code

    vaccine_code.short_description = "Vaccine"

    def status_badge(self, obj):
        colors = {
            "SCHEDULED": "#3b82f6",
            "ADMINISTERED": "#22c55e",
            "MISSED": "#ef4444",
            "CONTRAINDICATED": "#f59e0b",
            "DEFERRED": "#6b7280",
        }
        color = colors.get(obj.status, "#6b7280")
        return format_html(
            '<span style="color: {}; font-weight: bold;">{}</span>',
            color,
            obj.get_status_display(),
        )

    status_badge.short_description = "Status"


@admin.register(VaccineCampaign)
class VaccineCampaignAdmin(admin.ModelAdmin):
    list_display = [
        "name",
        "status",
        "start_date",
        "end_date",
        "target_population",
        "target_count",
        "facility",
    ]
    list_filter = ["status", "target_population", "facility"]
    search_fields = ["name"]
    filter_horizontal = ["vaccines"]
    raw_id_fields = ["facility", "organization"]


@admin.register(AEFI)
class AEFIAdmin(admin.ModelAdmin):
    list_display = [
        "id",
        "vaccine_code",
        "report_type",
        "severity_badge",
        "outcome",
        "event_date",
        "reported_to_authorities",
        "facility",
    ]
    list_filter = [
        "report_type",
        "severity",
        "outcome",
        "reported_to_authorities",
        "vaccination_service_type",
        "facility",
    ]
    search_fields = [
        "immunization_record__vaccine__code",
        "immunization_record__patient__first_name",
        "immunization_record__patient__last_name",
        "description",
    ]
    raw_id_fields = [
        "immunization_record",
        "parent_report",
        "reported_by",
        "investigated_by",
        "vaccination_centre_county",
        "facility",
        "organization",
    ]
    readonly_fields = ["dhis2_submitted_at", "dhis2_response", "national_classification"]
    ordering = ["-event_date"]
    fieldsets = (
        (
            "Report Metadata",
            {
                "fields": ("report_type", "parent_report", "immunization_record"),
            },
        ),
        (
            "Patient Context",
            {
                "fields": ("guardian_name",),
            },
        ),
        (
            "Vaccination Centre",
            {
                "fields": (
                    "vaccination_centre_name",
                    "vaccination_centre_county",
                    "institution_mfl_code",
                    "vaccination_service_type",
                ),
            },
        ),
        (
            "Event Details",
            {
                "fields": (
                    "event_date",
                    "onset_time",
                    "event_types",
                    "other_event_type_detail",
                    "severity",
                    "description",
                ),
            },
        ),
        (
            "Outcome",
            {
                "fields": ("outcome",),
            },
        ),
        (
            "Past Medical History",
            {
                "fields": ("past_medical_history_notes",),
            },
        ),
        (
            "Action Taken",
            {
                "fields": (
                    "treatment_given",
                    "treatment_details",
                    "specimen_collected",
                    "specimen_type",
                ),
            },
        ),
        (
            "Reporter",
            {
                "fields": ("reported_by", "reported_by_designation"),
            },
        ),
        (
            "Reporting to Authorities",
            {
                "fields": ("reported_to_authorities", "report_date"),
            },
        ),
        (
            "Investigation",
            {
                "fields": ("investigated_by", "investigation_notes"),
            },
        ),
        (
            "National / DHIS2",
            {
                "fields": (
                    "national_classification",
                    "dhis2_submitted_at",
                    "dhis2_response",
                ),
            },
        ),
        (
            "Tenant",
            {
                "fields": ("facility", "organization"),
            },
        ),
    )

    def vaccine_code(self, obj):
        return obj.immunization_record.vaccine.code

    vaccine_code.short_description = "Vaccine"

    def severity_badge(self, obj):
        colors = {
            "MILD": "#22c55e",
            "MODERATE": "#f59e0b",
            "SEVERE": "#ef4444",
        }
        color = colors.get(obj.severity, "#6b7280")
        return format_html(
            '<span style="color: {}; font-weight: bold;">{}</span>',
            color,
            obj.get_severity_display(),
        )

    severity_badge.short_description = "Severity"


@admin.register(VaccineStock)
class VaccineStockAdmin(admin.ModelAdmin):
    list_display = [
        "vaccine_code",
        "batch_number",
        "quantity_on_hand",
        "quantity_received",
        "expiry_date",
        "storage_location",
        "facility",
    ]
    list_filter = ["vaccine__code", "facility"]
    search_fields = ["batch_number", "vaccine__code", "vaccine__name"]
    raw_id_fields = ["vaccine", "received_by", "facility", "organization"]

    def vaccine_code(self, obj):
        return obj.vaccine.code

    vaccine_code.short_description = "Vaccine"


class StockTransactionInline(admin.TabularInline):
    model = StockTransaction
    extra = 0
    readonly_fields = [
        "transaction_type",
        "quantity",
        "balance_after",
        "performed_by",
        "created_at",
    ]


@admin.register(ColdChainEquipment)
class ColdChainEquipmentAdmin(admin.ModelAdmin):
    list_display = ["name", "equipment_type", "serial_number", "location", "status", "facility"]
    list_filter = ["equipment_type", "status", "facility"]
    search_fields = ["name", "serial_number"]
    raw_id_fields = ["facility", "organization"]


@admin.register(TemperatureLog)
class TemperatureLogAdmin(admin.ModelAdmin):
    list_display = ["equipment", "temperature", "recorded_at", "is_excursion"]
    list_filter = ["is_excursion", "equipment"]
    raw_id_fields = ["recorded_by"]


@admin.register(VaccineIncident)
class VaccineIncidentAdmin(admin.ModelAdmin):
    list_display = [
        "title",
        "incident_type",
        "severity",
        "status",
        "occurred_at",
        "doses_affected",
        "reported_to_county",
        "facility",
    ]
    list_filter = ["incident_type", "severity", "status", "reported_to_county", "facility"]
    search_fields = ["title", "description"]
    raw_id_fields = ["reported_by", "investigated_by", "facility", "organization"]
    filter_horizontal = ["affected_equipment", "affected_batches"]
