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
    ]
    list_filter = ["status", "vaccine__program", "vaccine__target_population"]
    search_fields = [
        "patient__first_name",
        "patient__last_name",
        "patient__mrn",
        "vaccine__code",
    ]
    raw_id_fields = ["patient", "administered_by", "encounter", "campaign"]
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
    list_display = ["name", "status", "start_date", "end_date", "target_population", "target_count"]
    list_filter = ["status", "target_population"]
    search_fields = ["name"]
    filter_horizontal = ["vaccines"]


@admin.register(AEFI)
class AEFIAdmin(admin.ModelAdmin):
    list_display = [
        "id",
        "vaccine_code",
        "event_type",
        "severity",
        "outcome",
        "event_date",
        "reported_to_authorities",
    ]
    list_filter = ["event_type", "severity", "outcome", "reported_to_authorities"]
    raw_id_fields = ["immunization_record", "investigated_by"]
    ordering = ["-event_date"]

    def vaccine_code(self, obj):
        return obj.immunization_record.vaccine.code

    vaccine_code.short_description = "Vaccine"


@admin.register(VaccineStock)
class VaccineStockAdmin(admin.ModelAdmin):
    list_display = [
        "vaccine_code",
        "batch_number",
        "quantity_on_hand",
        "quantity_received",
        "expiry_date",
        "storage_location",
    ]
    list_filter = ["vaccine__code"]
    search_fields = ["batch_number", "vaccine__code", "vaccine__name"]
    raw_id_fields = ["vaccine", "received_by"]

    def vaccine_code(self, obj):
        return obj.vaccine.code

    vaccine_code.short_description = "Vaccine"


class StockTransactionInline(admin.TabularInline):
    model = StockTransaction
    extra = 0
    readonly_fields = ["transaction_type", "quantity", "balance_after", "performed_by", "created_at"]


@admin.register(ColdChainEquipment)
class ColdChainEquipmentAdmin(admin.ModelAdmin):
    list_display = ["name", "equipment_type", "serial_number", "location", "status"]
    list_filter = ["equipment_type", "status"]
    search_fields = ["name", "serial_number"]


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
    ]
    list_filter = ["incident_type", "severity", "status", "reported_to_county"]
    search_fields = ["title", "description"]
    raw_id_fields = ["reported_by", "investigated_by"]
    filter_horizontal = ["affected_equipment", "affected_batches"]
