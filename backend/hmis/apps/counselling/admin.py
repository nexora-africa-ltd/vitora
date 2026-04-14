"""
Admin configuration for the counselling module.
"""

from django.contrib import admin
from simple_history.admin import SimpleHistoryAdmin

from hmis.apps.counselling.models import (
    CounsellingReferral,
    CounsellingSession,
    CounsellingType,
)


@admin.register(CounsellingType)
class CounsellingTypeAdmin(admin.ModelAdmin):
    """Admin for CounsellingType model."""

    list_display = [
        "code",
        "name",
        "category",
        "cost_per_session",
        "sha_claimable",
        "requires_privacy",
        "is_active",
    ]
    list_filter = ["category", "sha_claimable", "requires_privacy", "is_active"]
    search_fields = ["code", "name", "description"]
    ordering = ["category", "name"]
    readonly_fields = ["created_at", "updated_at"]

    fieldsets = [
        (None, {"fields": ["code", "name", "description", "category"]}),
        (
            "Session Parameters",
            {
                "fields": [
                    "typical_duration_minutes",
                    "recommended_sessions",
                    "recommended_frequency",
                ]
            },
        ),
        (
            "Pricing & SHA",
            {"fields": ["cost_per_session", "sha_claimable", "sha_intervention_code"]},
        ),
        (
            "Requirements",
            {
                "fields": [
                    "requires_privacy",
                    "requires_referral",
                    "min_age",
                    "max_age",
                    "gender_specific",
                ]
            },
        ),
        ("Status", {"fields": ["is_active", "created_at", "updated_at"]}),
    ]


class CounsellingSessionInline(admin.TabularInline):
    """Inline admin for CounsellingSession within referral."""

    model = CounsellingSession
    extra = 0
    readonly_fields = ["session_number", "session_sequence", "created_at", "completed_at"]
    fields = [
        "session_number",
        "session_sequence",
        "counsellor",
        "scheduled_date",
        "scheduled_time",
        "status",
        "outcome",
    ]


@admin.register(CounsellingReferral)
class CounsellingReferralAdmin(SimpleHistoryAdmin):
    """Admin for CounsellingReferral model."""

    list_display = [
        "referral_number",
        "patient",
        "reason",
        "urgency",
        "status",
        "assigned_counsellor",
        "sessions_completed",
        "total_sessions",
        "is_sensitive",
        "created_at",
    ]
    list_filter = [
        "status",
        "urgency",
        "reason",
        "is_sensitive",
        "is_paid",
        "created_at",
    ]
    search_fields = [
        "referral_number",
        "patient__first_name",
        "patient__last_name",
        "patient__mrn",
        "clinical_summary",
    ]
    ordering = ["-created_at"]
    readonly_fields = [
        "referral_number",
        "sessions_completed",
        "created_at",
        "updated_at",
        "accepted_at",
        "started_at",
        "completed_at",
    ]
    raw_id_fields = ["patient", "encounter", "referred_by", "assigned_counsellor", "completed_by"]
    inlines = [CounsellingSessionInline]

    fieldsets = [
        (
            None,
            {
                "fields": [
                    "referral_number",
                    "patient",
                    "encounter",
                    "counselling_type",
                ]
            },
        ),
        (
            "Referral Details",
            {
                "fields": [
                    "referred_by",
                    "assigned_counsellor",
                    "reason",
                    "urgency",
                    "clinical_summary",
                    "presenting_issues",
                    "goals",
                    "risk_assessment",
                ]
            },
        ),
        (
            "Status & Sessions",
            {
                "fields": [
                    "status",
                    "total_sessions",
                    "sessions_completed",
                    "is_sensitive",
                ]
            },
        ),
        ("Billing", {"fields": ["is_paid", "invoice", "clinic_visit"]}),
        (
            "Completion",
            {
                "fields": [
                    "completion_notes",
                    "cancellation_reason",
                    "completed_by",
                ]
            },
        ),
        (
            "Timestamps",
            {
                "fields": [
                    "created_at",
                    "updated_at",
                    "accepted_at",
                    "started_at",
                    "completed_at",
                ],
                "classes": ["collapse"],
            },
        ),
    ]


@admin.register(CounsellingSession)
class CounsellingSessionAdmin(SimpleHistoryAdmin):
    """Admin for CounsellingSession model."""

    list_display = [
        "session_number",
        "get_patient",
        "counsellor",
        "session_sequence",
        "scheduled_date",
        "status",
        "outcome",
        "risk_level",
        "is_billed",
    ]
    list_filter = [
        "status",
        "outcome",
        "risk_level",
        "is_sensitive",
        "is_billed",
        "scheduled_date",
    ]
    search_fields = [
        "session_number",
        "referral__referral_number",
        "referral__patient__first_name",
        "referral__patient__last_name",
        "referral__patient__mrn",
    ]
    ordering = ["scheduled_date", "session_sequence"]
    readonly_fields = [
        "session_number",
        "session_sequence",
        "created_at",
        "updated_at",
        "completed_at",
    ]
    raw_id_fields = ["referral", "counsellor"]

    fieldsets = [
        (
            None,
            {
                "fields": [
                    "session_number",
                    "referral",
                    "counsellor",
                    "session_sequence",
                ]
            },
        ),
        (
            "Scheduling",
            {
                "fields": [
                    "scheduled_date",
                    "scheduled_time",
                    "actual_date",
                    "actual_start_time",
                    "actual_end_time",
                    "duration_minutes",
                    "status",
                ]
            },
        ),
        (
            "Pre-Session",
            {
                "fields": [
                    "pre_session_mood",
                    "pre_session_notes",
                ]
            },
        ),
        (
            "Session Content",
            {
                "fields": [
                    "session_type",
                    "topics_discussed",
                    "techniques_used",
                    "client_responses",
                    "progress_notes",
                ]
            },
        ),
        (
            "Post-Session Assessment",
            {
                "fields": [
                    "post_session_mood",
                    "outcome",
                    "risk_assessment",
                    "risk_level",
                    "safety_plan",
                ]
            },
        ),
        (
            "Follow-up",
            {
                "fields": [
                    "follow_up_required",
                    "follow_up_date",
                    "homework",
                    "goals_for_next_session",
                ]
            },
        ),
        (
            "Privacy & Billing",
            {
                "fields": [
                    "confidentiality_level",
                    "is_sensitive",
                    "clinic_visit",
                    "is_billed",
                ]
            },
        ),
        (
            "Timestamps",
            {
                "fields": ["created_at", "updated_at", "completed_at"],
                "classes": ["collapse"],
            },
        ),
    ]

    @admin.display(description="Patient")
    def get_patient(self, obj):
        """Return patient name from referral."""
        if obj.referral and obj.referral.patient:
            return f"{obj.referral.patient.first_name} {obj.referral.patient.last_name}"
        return "-"
