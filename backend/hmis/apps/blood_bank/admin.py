"""Blood Bank admin."""

from django.contrib import admin

from .models import BloodDonor, BloodIssue, BloodRequest, BloodUnit, CrossMatch


@admin.register(BloodDonor)
class BloodDonorAdmin(admin.ModelAdmin):
    list_display = [
        "donor_number",
        "first_name",
        "last_name",
        "blood_group",
        "is_active",
        "last_donation_date",
        "facility",
    ]
    list_filter = ["blood_group", "is_active", "facility"]
    search_fields = ["donor_number", "first_name", "last_name", "national_id"]
    raw_id_fields = ["patient", "facility", "organization"]


@admin.register(BloodUnit)
class BloodUnitAdmin(admin.ModelAdmin):
    list_display = [
        "unit_number",
        "blood_group",
        "component",
        "status",
        "collection_date",
        "expiry_date",
        "facility",
    ]
    list_filter = ["blood_group", "component", "status", "facility"]
    search_fields = ["unit_number"]
    raw_id_fields = ["donor", "facility", "organization"]


@admin.register(BloodRequest)
class BloodRequestAdmin(admin.ModelAdmin):
    list_display = [
        "request_number",
        "patient",
        "blood_group",
        "component",
        "urgency",
        "status",
        "created_at",
    ]
    list_filter = ["status", "urgency", "blood_group", "facility"]
    search_fields = ["request_number", "patient__mrn", "patient__first_name"]
    raw_id_fields = ["patient", "encounter", "requested_by", "facility", "organization"]


@admin.register(CrossMatch)
class CrossMatchAdmin(admin.ModelAdmin):
    list_display = ["blood_request", "blood_unit", "result", "performed_at", "performed_by"]
    list_filter = ["result", "facility"]
    raw_id_fields = ["blood_request", "blood_unit", "performed_by", "facility", "organization"]


@admin.register(BloodIssue)
class BloodIssueAdmin(admin.ModelAdmin):
    list_display = ["blood_unit", "blood_request", "issued_by", "issued_at", "transfusion_reaction"]
    list_filter = ["transfusion_reaction", "facility"]
    raw_id_fields = [
        "blood_request",
        "blood_unit",
        "crossmatch",
        "issued_by",
        "facility",
        "organization",
    ]
