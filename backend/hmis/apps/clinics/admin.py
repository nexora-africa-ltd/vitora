"""Admin configuration for Clinics module."""

from django.contrib import admin

from .models import (
    Clinic,
    ClinicEnrollment,
    ClinicSchedule,
    ClinicSession,
    ClinicStaff,
    ClinicVisit,
    MonthlyClinicReport,
)


# =============================================================================
# Inline Admin Classes
# =============================================================================


class ClinicScheduleInline(admin.TabularInline):
    """Inline admin for clinic schedules."""

    model = ClinicSchedule
    extra = 0
    fields = ("day_of_week", "start_time", "end_time", "max_patients", "is_active", "notes")


class ClinicStaffInline(admin.TabularInline):
    """Inline admin for clinic staff assignments."""

    model = ClinicStaff
    extra = 0
    fields = ("user", "role", "is_primary", "start_date", "end_date", "is_active")
    raw_id_fields = ("user",)


# =============================================================================
# Model Admin Classes
# =============================================================================


@admin.register(Clinic)
class ClinicAdmin(admin.ModelAdmin):
    """Admin for Clinic model."""

    list_display = (
        "name",
        "code",
        "clinic_type",
        "status",
        "location",
        "capacity",
        "is_sensitive",
        "is_open_now",
        "is_scheduled",
    )
    list_filter = ("clinic_type", "status", "is_sensitive")
    search_fields = ("name", "code", "description", "location")
    readonly_fields = ("created_at", "updated_at")
    inlines = [ClinicScheduleInline, ClinicStaffInline]
    fieldsets = (
        (
            None,
            {
                "fields": (
                    "name",
                    "clinic_type",
                    "code",
                    "description",
                    "location",
                    "floor",
                    "capacity",
                    "status",
                ),
            },
        ),
        (
            "Service Configuration",
            {
                "fields": (
                    "requires_appointment",
                    "requires_referral",
                    "accepts_walk_ins",
                    "triage_required",
                    "default_service_fee",
                    "default_clinical_template",
                ),
            },
        ),
        (
            "Integration",
            {
                "classes": ("collapse",),
                "fields": ("sha_service_code", "dhis2_org_unit_id", "moh_code"),
            },
        ),
        (
            "Access Control",
            {
                "fields": ("is_sensitive", "required_permission"),
            },
        ),
        (
            "Eligibility Rules",
            {
                "classes": ("collapse",),
                "fields": ("eligibility_rules",),
            },
        ),
        (
            "Timestamps",
            {
                "classes": ("collapse",),
                "fields": ("created_at", "updated_at"),
            },
        ),
    )

    @admin.display(boolean=True, description="Open Now")
    def is_open_now(self, obj):
        """Check if clinic has an open session."""
        return obj.is_open_today()

    @admin.display(boolean=True, description="Scheduled Today")
    def is_scheduled(self, obj):
        """Check if clinic is scheduled today."""
        return obj.is_scheduled_today()


@admin.register(ClinicSchedule)
class ClinicScheduleAdmin(admin.ModelAdmin):
    """Admin for ClinicSchedule model."""

    list_display = ("clinic", "day_of_week", "start_time", "end_time", "max_patients", "is_active")
    list_filter = ("day_of_week", "is_active", "clinic")
    search_fields = ("clinic__name",)


@admin.register(ClinicStaff)
class ClinicStaffAdmin(admin.ModelAdmin):
    """Admin for ClinicStaff model."""

    list_display = ("user", "clinic", "role", "is_primary", "is_active", "start_date", "end_date")
    list_filter = ("role", "is_active", "is_primary", "clinic")
    search_fields = ("user__first_name", "user__last_name", "user__username", "clinic__name")
    raw_id_fields = ("user",)


@admin.register(ClinicSession)
class ClinicSessionAdmin(admin.ModelAdmin):
    """Admin for ClinicSession model."""

    list_display = (
        "clinic",
        "session_date",
        "status",
        "opened_by",
        "opened_at",
        "closed_by",
        "closed_at",
        "patients_registered",
        "patients_seen",
    )
    list_filter = ("status", "clinic", "session_date")
    search_fields = ("clinic__name",)
    readonly_fields = (
        "opened_at",
        "closed_at",
        "patients_registered",
        "patients_seen",
        "patients_waiting",
        "created_at",
        "updated_at",
    )
    raw_id_fields = ("opened_by", "closed_by")
    date_hierarchy = "session_date"


@admin.register(ClinicVisit)
class ClinicVisitAdmin(admin.ModelAdmin):
    """Admin for ClinicVisit model."""

    list_display = (
        "queue_number",
        "patient",
        "get_clinic_name",
        "status",
        "priority",
        "visit_type",
        "registered_at",
    )
    list_filter = ("status", "priority", "visit_type", "session__clinic")
    search_fields = ("patient__first_name", "patient__last_name", "patient__mrn")
    raw_id_fields = ("patient", "session", "encounter", "assigned_clinician", "registered_by")
    readonly_fields = (
        "queue_number",
        "registered_at",
        "called_at",
        "consultation_started_at",
        "completed_at",
        "created_at",
        "updated_at",
    )

    @admin.display(description="Clinic")
    def get_clinic_name(self, obj):
        """Get clinic name from session."""
        return obj.session.clinic.name if obj.session else "-"


@admin.register(ClinicEnrollment)
class ClinicEnrollmentAdmin(admin.ModelAdmin):
    """Admin for ClinicEnrollment model."""

    list_display = (
        "patient",
        "clinic",
        "status",
        "enrollment_date",
        "next_appointment_date",
    )
    list_filter = ("status", "clinic")
    search_fields = ("patient__first_name", "patient__last_name", "patient__mrn", "clinic__name")
    raw_id_fields = ("patient", "clinic", "enrolled_by")
    date_hierarchy = "enrollment_date"


@admin.register(MonthlyClinicReport)
class MonthlyClinicReportAdmin(admin.ModelAdmin):
    """Admin for MonthlyClinicReport model."""

    list_display = (
        "clinic",
        "year",
        "month",
        "total_visits",
        "unique_patients",
        "average_wait_time_minutes",
    )
    list_filter = ("clinic", "year", "month")
    search_fields = ("clinic__name",)
    readonly_fields = ("created_at", "updated_at")
