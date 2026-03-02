"""
Django admin configuration for Disease Surveillance.

Provides admin interfaces for managing notifiable diseases,
viewing cases, and monitoring alerts.
"""

from django.contrib import admin
from django.utils.html import format_html

from .models import (
    DHIS2DataElementMapping,
    IDSRDiseaseSummary,
    IDSRWeeklyReport,
    IHRNotification,
    IHRNotificationStatus,
    NotifiableCase,
    NotifiableDisease,
    NotificationStatus,
    OutbreakThreshold,
    SurveillanceAlert,
)


@admin.register(NotifiableDisease)
class NotifiableDiseaseAdmin(admin.ModelAdmin):
    """Admin for NotifiableDisease model."""

    list_display = [
        "name",
        "category",
        "reporting_hours",
        "is_ihr_notifiable",
        "is_active",
        "icd10_code_count",
    ]
    list_filter = ["category", "is_active", "is_ihr_notifiable"]
    search_fields = ["name", "icd10_codes", "description"]
    ordering = ["category", "name"]
    readonly_fields = ["created_at", "updated_at"]
    fieldsets = (
        (None, {"fields": ("name", "icd10_codes", "category", "reporting_hours")}),
        (
            "Clinical Information",
            {"fields": ("description", "case_definition", "laboratory_criteria")},
        ),
        ("Settings", {"fields": ("is_ihr_notifiable", "is_active")}),
        ("Timestamps", {"fields": ("created_at", "updated_at"), "classes": ("collapse",)}),
    )

    def icd10_code_count(self, obj):
        """Return count of ICD-10 codes."""
        return len(obj.get_icd10_code_list())

    icd10_code_count.short_description = "ICD-10 Codes"


@admin.register(NotifiableCase)
class NotifiableCaseAdmin(admin.ModelAdmin):
    """Admin for NotifiableCase model."""

    list_display = [
        "id",
        "disease",
        "patient_mrn",
        "severity",
        "notification_status_badge",
        "detected_at",
        "is_overdue_badge",
        "laboratory_confirmed",
    ]
    list_filter = [
        "notification_status",
        "disease__category",
        "disease",
        "severity",
        "outcome",
        "laboratory_confirmed",
        "county",
    ]
    search_fields = [
        "patient__first_name",
        "patient__last_name",
        "patient__mrn",
        "disease__name",
    ]
    ordering = ["-detected_at"]
    readonly_fields = [
        "detected_at",
        "notification_deadline",
        "created_at",
        "updated_at",
        "is_overdue",
        "hours_until_deadline",
    ]
    raw_id_fields = ["patient", "encounter", "diagnosis", "reported_by", "notified_by"]
    fieldsets = (
        (None, {"fields": ("disease", "patient", "encounter", "diagnosis")}),
        (
            "Case Details",
            {
                "fields": (
                    "onset_date",
                    "severity",
                    "outcome",
                    "laboratory_confirmed",
                    "lab_result_date",
                )
            },
        ),
        (
            "Notification",
            {
                "fields": (
                    "notification_status",
                    "detected_at",
                    "notification_deadline",
                    "is_overdue",
                    "hours_until_deadline",
                    "notified_at",
                    "notified_by",
                )
            },
        ),
        ("Location", {"fields": ("county", "sub_county")}),
        (
            "Investigation",
            {
                "fields": (
                    "contact_tracing_initiated",
                    "contacts_identified",
                    "investigation_notes",
                )
            },
        ),
        (
            "Record Keeping",
            {"fields": ("reported_by", "created_at", "updated_at"), "classes": ("collapse",)},
        ),
    )

    def patient_mrn(self, obj):
        """Return patient MRN."""
        return obj.patient.mrn

    patient_mrn.short_description = "Patient MRN"
    patient_mrn.admin_order_field = "patient__mrn"

    def notification_status_badge(self, obj):
        """Return colored badge for notification status."""
        colors = {
            NotificationStatus.PENDING: "#f39c12",
            NotificationStatus.NOTIFIED: "#27ae60",
            NotificationStatus.ACKNOWLEDGED: "#3498db",
            NotificationStatus.INVESTIGATED: "#9b59b6",
            NotificationStatus.CLOSED: "#7f8c8d",
        }
        color = colors.get(obj.notification_status, "#95a5a6")
        return format_html(
            '<span style="background-color: {}; color: white; padding: 3px 8px; '
            'border-radius: 3px; font-size: 11px;">{}</span>',
            color,
            obj.get_notification_status_display(),
        )

    notification_status_badge.short_description = "Status"
    notification_status_badge.admin_order_field = "notification_status"

    def is_overdue_badge(self, obj):
        """Return overdue badge."""
        if obj.is_overdue:
            return format_html(
                '<span style="background-color: #e74c3c; color: white; padding: 3px 8px; '
                'border-radius: 3px; font-size: 11px;">OVERDUE</span>'
            )
        return format_html('<span style="color: #27ae60;">✓</span>')

    is_overdue_badge.short_description = "Overdue"


@admin.register(SurveillanceAlert)
class SurveillanceAlertAdmin(admin.ModelAdmin):
    """Admin for SurveillanceAlert model."""

    list_display = [
        "id",
        "case_disease",
        "alert_type",
        "is_acknowledged",
        "sent_channels",
        "created_at",
    ]
    list_filter = ["alert_type", "is_acknowledged", "sent_via_sms", "sent_via_email"]
    search_fields = ["case__disease__name", "case__patient__mrn", "message"]
    ordering = ["-created_at"]
    readonly_fields = [
        "case",
        "alert_type",
        "message",
        "created_at",
        "sent_via_websocket",
        "sent_via_sms",
        "sent_via_email",
    ]
    raw_id_fields = ["acknowledged_by"]

    def case_disease(self, obj):
        """Return disease name."""
        return obj.case.disease.name

    case_disease.short_description = "Disease"

    def sent_channels(self, obj):
        """Return channels used for alert."""
        channels = []
        if obj.sent_via_websocket:
            channels.append("WS")
        if obj.sent_via_sms:
            channels.append("SMS")
        if obj.sent_via_email:
            channels.append("Email")
        return ", ".join(channels) or "-"

    sent_channels.short_description = "Sent Via"


@admin.register(OutbreakThreshold)
class OutbreakThresholdAdmin(admin.ModelAdmin):
    """Admin for OutbreakThreshold model."""

    list_display = [
        "disease",
        "county_display",
        "case_threshold",
        "period_days",
        "is_active",
        "current_status",
    ]
    list_filter = ["is_active", "disease", "county"]
    search_fields = ["disease__name", "county__name"]
    ordering = ["disease__name", "county__name"]
    raw_id_fields = ["county"]

    def county_display(self, obj):
        """Return county name or National."""
        return obj.county.name if obj.county else "National"

    county_display.short_description = "County"

    def current_status(self, obj):
        """Return current threshold status."""
        exceeded, count = obj.check_threshold()
        if exceeded:
            return format_html(
                '<span style="background-color: #e74c3c; color: white; padding: 3px 8px; '
                'border-radius: 3px; font-size: 11px;">EXCEEDED ({}/{})</span>',
                count,
                obj.case_threshold,
            )
        return format_html(
            '<span style="color: #27ae60;">{}/{}</span>',
            count,
            obj.case_threshold,
        )

    current_status.short_description = "Status"


# ============================================================================
# IDSR Weekly Reporting Admin
# ============================================================================


class IDSRDiseaseSummaryInline(admin.TabularInline):
    """Inline admin for IDSRDiseaseSummary within weekly report."""

    model = IDSRDiseaseSummary
    extra = 0
    readonly_fields = ["total_cases", "total_deaths", "case_fatality_rate"]
    fields = [
        "disease",
        "cases_under_5",
        "cases_5_and_above",
        "total_cases",
        "deaths_under_5",
        "deaths_5_and_above",
        "total_deaths",
        "lab_confirmed",
        "is_outbreak",
    ]


@admin.register(IDSRWeeklyReport)
class IDSRWeeklyReportAdmin(admin.ModelAdmin):
    """Admin for IDSRWeeklyReport model."""

    list_display = [
        "week_label",
        "facility_name",
        "county_display",
        "total_cases",
        "total_deaths",
        "status_badge",
        "outbreak_badge",
        "generated_at",
    ]
    list_filter = ["status", "outbreak_declared", "epi_year", "county"]
    search_fields = ["facility_name", "facility_code"]
    ordering = ["-epi_year", "-epi_week"]
    readonly_fields = [
        "week_label",
        "is_submitted",
        "can_edit",
        "generated_at",
        "dhis2_submitted_at",
        "dhis2_response",
        "dhis2_import_summary",
        "created_at",
        "updated_at",
    ]
    raw_id_fields = ["county", "sub_county", "generated_by", "reviewed_by", "approved_by"]
    inlines = [IDSRDiseaseSummaryInline]
    fieldsets = (
        (
            "Week Identification",
            {"fields": ("epi_year", "epi_week", "week_label", "week_start_date", "week_end_date")},
        ),
        ("Facility", {"fields": ("facility_code", "facility_name", "county", "sub_county")}),
        (
            "Summary",
            {
                "fields": (
                    "total_cases",
                    "total_deaths",
                    "immediate_cases",
                    "lab_confirmed_cases",
                    "outbreak_declared",
                    "outbreak_diseases",
                )
            },
        ),
        (
            "Workflow",
            {
                "fields": (
                    "status",
                    "generated_at",
                    "generated_by",
                    "reviewed_at",
                    "reviewed_by",
                    "approved_at",
                    "approved_by",
                )
            },
        ),
        (
            "DHIS2 Submission",
            {
                "fields": ("dhis2_submitted_at", "dhis2_response", "dhis2_import_summary"),
                "classes": ("collapse",),
            },
        ),
        ("Notes", {"fields": ("notes",)}),
        ("Timestamps", {"fields": ("created_at", "updated_at"), "classes": ("collapse",)}),
    )

    def county_display(self, obj):
        """Return county name or dash."""
        return obj.county.name if obj.county else "-"

    county_display.short_description = "County"

    def status_badge(self, obj):
        """Return status with color badge."""
        colors = {
            "DRAFT": "#95a5a6",
            "PENDING_REVIEW": "#f39c12",
            "APPROVED": "#3498db",
            "SUBMITTED": "#27ae60",
            "FAILED": "#e74c3c",
        }
        color = colors.get(obj.status, "#95a5a6")
        return format_html(
            '<span style="background-color: {}; color: white; padding: 3px 8px; '
            'border-radius: 3px; font-size: 11px;">{}</span>',
            color,
            obj.get_status_display(),
        )

    status_badge.short_description = "Status"

    def outbreak_badge(self, obj):
        """Return outbreak indicator."""
        if obj.outbreak_declared:
            return format_html(
                '<span style="background-color: #e74c3c; color: white; padding: 3px 8px; '
                'border-radius: 3px; font-size: 11px;">🚨 OUTBREAK</span>'
            )
        return "-"

    outbreak_badge.short_description = "Outbreak"


@admin.register(DHIS2DataElementMapping)
class DHIS2DataElementMappingAdmin(admin.ModelAdmin):
    """
    Admin for DHIS2 Data Element Mappings.

    Allows managing DHIS2 data element UIDs for IDSR reporting
    without code changes. Supports multiple environments.
    """

    list_display = [
        "disease",
        "indicator_type",
        "environment",
        "data_element_uid",
        "short_name",
        "is_active",
    ]
    list_filter = [
        "environment",
        "indicator_type",
        "is_active",
        "disease__category",
    ]
    search_fields = [
        "disease__name",
        "data_element_uid",
        "short_name",
    ]
    ordering = ["disease__name", "indicator_type", "environment"]
    readonly_fields = ["created_at", "updated_at"]
    raw_id_fields = ["disease"]
    list_editable = ["data_element_uid", "is_active"]
    list_per_page = 50

    fieldsets = (
        (
            None,
            {
                "fields": (
                    "disease",
                    "indicator_type",
                    "environment",
                )
            },
        ),
        (
            "DHIS2 Mapping",
            {
                "fields": (
                    "data_element_uid",
                    "short_name",
                    "is_active",
                )
            },
        ),
        (
            "Notes",
            {
                "fields": ("notes",),
                "classes": ("collapse",),
            },
        ),
        (
            "Timestamps",
            {
                "fields": ("created_at", "updated_at"),
                "classes": ("collapse",),
            },
        ),
    )

    actions = ["duplicate_to_production", "export_mappings"]

    @admin.action(description="Duplicate selected mappings to production environment")
    def duplicate_to_production(self, request, queryset):
        """Create production copies of selected local/staging mappings."""
        created = 0
        for mapping in queryset:
            if mapping.environment != "production":
                _, was_created = DHIS2DataElementMapping.objects.get_or_create(
                    disease=mapping.disease,
                    indicator_type=mapping.indicator_type,
                    environment="production",
                    defaults={
                        "data_element_uid": f"KHIS_{mapping.data_element_uid[:7]}",
                        "short_name": mapping.short_name,
                        "is_active": False,  # Inactive until UID updated
                        "notes": f"Duplicated from {mapping.environment}. UPDATE UID!",
                    },
                )
                if was_created:
                    created += 1
        self.message_user(
            request, f"Created {created} production mapping(s). Update UIDs before activating!"
        )

    @admin.action(description="Export selected mappings as JSON")
    def export_mappings(self, request, queryset):
        """Export mappings to JSON (for backup/transfer)."""
        import json

        from django.http import HttpResponse

        data = [
            {
                "disease": m.disease.name,
                "indicator_type": m.indicator_type,
                "environment": m.environment,
                "data_element_uid": m.data_element_uid,
                "short_name": m.short_name,
                "is_active": m.is_active,
            }
            for m in queryset
        ]
        response = HttpResponse(
            json.dumps(data, indent=2),
            content_type="application/json",
        )
        response["Content-Disposition"] = 'attachment; filename="dhis2_mappings.json"'
        return response


@admin.register(IHRNotification)
class IHRNotificationAdmin(admin.ModelAdmin):
    """Admin for IHRNotification model."""

    list_display = [
        "notification_reference",
        "disease",
        "urgency_badge",
        "status_badge",
        "cases_count",
        "deaths_count",
        "county_display",
        "report_date",
        "is_overdue_badge",
    ]
    list_filter = [
        "status",
        "urgency",
        "disease",
        "is_annex2_positive",
        "county",
    ]
    search_fields = [
        "disease__name",
        "event_description",
        "who_reference_number",
        "patient__mrn",
        "patient__first_name",
        "patient__last_name",
    ]
    ordering = ["-report_date"]
    readonly_fields = [
        "notification_reference",
        "is_escalated",
        "is_who_notified",
        "hours_since_detection",
        "is_overdue",
        "created_at",
        "updated_at",
    ]
    raw_id_fields = [
        "disease",
        "case",
        "patient",
        "reported_by",
        "county_reviewed_by",
        "national_reviewed_by",
    ]
    fieldsets = (
        (
            None,
            {
                "fields": (
                    "notification_reference",
                    "disease",
                    "case",
                    "patient",
                )
            },
        ),
        (
            "Event Details",
            {
                "fields": (
                    "event_description",
                    "event_date",
                    "urgency",
                    "cases_count",
                    "deaths_count",
                    "affected_area",
                )
            },
        ),
        (
            "WHO Annex 2 Assessment",
            {
                "fields": (
                    "annex2_criteria",
                    "is_annex2_positive",
                )
            },
        ),
        (
            "Location",
            {"fields": ("county", "sub_county")},
        ),
        (
            "Status & Escalation",
            {
                "fields": (
                    "status",
                    "is_escalated",
                    "is_who_notified",
                    "hours_since_detection",
                    "is_overdue",
                )
            },
        ),
        (
            "Facility Reporting",
            {
                "fields": (
                    "reported_by",
                    "report_date",
                )
            },
        ),
        (
            "County Escalation",
            {
                "fields": (
                    "county_notified_at",
                    "county_reviewed_by",
                    "county_notes",
                ),
                "classes": ("collapse",),
            },
        ),
        (
            "National (MOH) Escalation",
            {
                "fields": (
                    "national_notified_at",
                    "national_reviewed_by",
                    "national_notes",
                ),
                "classes": ("collapse",),
            },
        ),
        (
            "WHO Notification",
            {
                "fields": (
                    "who_notified_at",
                    "who_reference_number",
                    "who_acknowledged_at",
                ),
                "classes": ("collapse",),
            },
        ),
        (
            "Risk & Response",
            {
                "fields": (
                    "risk_assessment",
                    "response_measures",
                )
            },
        ),
        (
            "Resolution",
            {
                "fields": (
                    "resolved_at",
                    "resolution_notes",
                ),
                "classes": ("collapse",),
            },
        ),
        (
            "Timestamps",
            {
                "fields": ("created_at", "updated_at"),
                "classes": ("collapse",),
            },
        ),
    )

    def county_display(self, obj):
        """Return county name or dash."""
        return obj.county.name if obj.county else "-"

    county_display.short_description = "County"

    def urgency_badge(self, obj):
        """Return colored badge for urgency."""
        colors = {
            "EMERGENCY": "#e74c3c",
            "URGENT": "#f39c12",
            "ROUTINE": "#3498db",
        }
        color = colors.get(obj.urgency, "#95a5a6")
        return format_html(
            '<span style="background-color: {}; color: white; padding: 3px 8px; '
            'border-radius: 3px; font-size: 11px;">{}</span>',
            color,
            obj.get_urgency_display(),
        )

    urgency_badge.short_description = "Urgency"

    def status_badge(self, obj):
        """Return colored badge for status."""
        colors = {
            IHRNotificationStatus.DRAFT: "#95a5a6",
            IHRNotificationStatus.PENDING_REVIEW: "#f39c12",
            IHRNotificationStatus.SUBMITTED_COUNTY: "#3498db",
            IHRNotificationStatus.ESCALATED_NATIONAL: "#9b59b6",
            IHRNotificationStatus.NOTIFIED_WHO: "#27ae60",
            IHRNotificationStatus.ACKNOWLEDGED: "#2ecc71",
            IHRNotificationStatus.CLOSED: "#7f8c8d",
            IHRNotificationStatus.REJECTED: "#e74c3c",
        }
        color = colors.get(obj.status, "#95a5a6")
        return format_html(
            '<span style="background-color: {}; color: white; padding: 3px 8px; '
            'border-radius: 3px; font-size: 11px;">{}</span>',
            color,
            obj.get_status_display(),
        )

    status_badge.short_description = "Status"

    def is_overdue_badge(self, obj):
        """Return overdue badge."""
        if obj.is_overdue:
            return format_html(
                '<span style="background-color: #e74c3c; color: white; padding: 3px 8px; '
                'border-radius: 3px; font-size: 11px;">OVERDUE</span>'
            )
        return format_html('<span style="color: #27ae60;">✓</span>')

    is_overdue_badge.short_description = "Overdue"

