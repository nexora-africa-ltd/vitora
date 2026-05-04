"""Dialysis admin."""

from django.contrib import admin

from .models import DialysisOrder, DialysisSession, VascularAccess


@admin.register(VascularAccess)
class VascularAccessAdmin(admin.ModelAdmin):
    list_display = ["patient", "access_type", "status", "site", "placed_date", "facility"]
    list_filter = ["access_type", "status", "facility"]
    search_fields = ["patient__mrn", "patient__first_name", "patient__last_name", "site"]
    raw_id_fields = ["patient", "placed_by", "facility", "organization"]


@admin.register(DialysisOrder)
class DialysisOrderAdmin(admin.ModelAdmin):
    list_display = ["patient", "dialysis_type", "frequency", "status", "start_date", "facility"]
    list_filter = ["dialysis_type", "frequency", "status", "facility"]
    search_fields = ["patient__mrn", "patient__first_name", "patient__last_name"]
    raw_id_fields = ["patient", "ordered_by", "vascular_access", "facility", "organization"]


@admin.register(DialysisSession)
class DialysisSessionAdmin(admin.ModelAdmin):
    list_display = [
        "session_number",
        "patient",
        "dialysis_type",
        "status",
        "scheduled_date",
        "machine_number",
    ]
    list_filter = ["dialysis_type", "status", "facility"]
    search_fields = ["session_number", "patient__mrn", "patient__first_name", "machine_number"]
    raw_id_fields = [
        "patient",
        "order",
        "encounter",
        "vascular_access",
        "performed_by",
        "facility",
        "organization",
    ]
