"""
Django admin configuration for Disease Surveillance.

Provides admin interfaces for managing notifiable diseases,
viewing cases, and monitoring alerts.
"""

from django.contrib import admin
from django.utils.html import format_html

from .models import (
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
