"""
Django admin configuration for the physiotherapy module.
"""

from django.contrib import admin

from hmis.apps.physiotherapy.models import (
    PhysiotherapyOrder,
    PhysiotherapySession,
    PhysiotherapyTreatmentType,
)


@admin.register(PhysiotherapyTreatmentType)
class PhysiotherapyTreatmentTypeAdmin(admin.ModelAdmin):
    """Admin configuration for PhysiotherapyTreatmentType."""

    list_display = [
        "code",
        "name",
        "category",
        "cost_per_session",
        "sha_claimable",
        "is_active",
    ]
    list_filter = ["category", "sha_claimable", "is_active"]
    search_fields = ["code", "name", "description"]
    ordering = ["category", "name"]


class PhysiotherapySessionInline(admin.TabularInline):
    """Inline admin for sessions within an order."""

    model = PhysiotherapySession
    extra = 0
    readonly_fields = ["session_number", "created_at", "completed_at"]
    fields = [
        "session_number",
        "scheduled_date",
        "status",
        "therapist",
        "outcome",
        "is_billed",
    ]


@admin.register(PhysiotherapyOrder)
class PhysiotherapyOrderAdmin(admin.ModelAdmin):
    """Admin configuration for PhysiotherapyOrder."""

    list_display = [
        "order_number",
        "patient",
        "treatment_type",
        "status",
        "priority",
        "sessions_completed",
        "total_sessions",
        "assigned_therapist",
        "ordered_at",
    ]
    list_filter = ["status", "priority", "treatment_type", "assigned_therapist"]
    search_fields = [
        "order_number",
        "patient__first_name",
        "patient__last_name",
        "patient__mrn",
    ]
    readonly_fields = ["order_number", "ordered_at", "completed_at", "total_cost"]
    raw_id_fields = ["patient", "encounter", "ordered_by", "assigned_therapist"]
    inlines = [PhysiotherapySessionInline]
    ordering = ["-ordered_at"]

    fieldsets = (
        (
            "Order Information",
            {
                "fields": (
                    "order_number",
                    "patient",
                    "encounter",
                    "treatment_type",
                    "status",
                    "priority",
                )
            },
        ),
        (
            "Clinical Details",
            {
                "fields": (
                    "referral_reason",
                    "clinical_indication",
                    "relevant_history",
                    "diagnosis",
                    "precautions",
                    "contraindications",
                )
            },
        ),
        (
            "Treatment Plan",
            {
                "fields": (
                    "total_sessions",
                    "sessions_completed",
                    "frequency",
                    "treatment_goals",
                    "start_date",
                    "expected_end_date",
                )
            },
        ),
        (
            "Assignment",
            {
                "fields": (
                    "ordered_by",
                    "assigned_therapist",
                )
            },
        ),
        (
            "Billing",
            {
                "fields": (
                    "total_cost",
                    "is_paid",
                    "invoice",
                )
            },
        ),
        (
            "Timestamps",
            {
                "fields": (
                    "ordered_at",
                    "completed_at",
                ),
                "classes": ("collapse",),
            },
        ),
    )


@admin.register(PhysiotherapySession)
class PhysiotherapySessionAdmin(admin.ModelAdmin):
    """Admin configuration for PhysiotherapySession."""

    list_display = [
        "order",
        "session_number",
        "scheduled_date",
        "status",
        "therapist",
        "outcome",
        "is_billed",
    ]
    list_filter = ["status", "outcome", "is_billed", "therapist"]
    search_fields = [
        "order__order_number",
        "order__patient__first_name",
        "order__patient__last_name",
    ]
    readonly_fields = ["session_number", "created_at", "updated_at", "completed_at"]
    raw_id_fields = ["order", "therapist"]
    ordering = ["order", "session_number"]

    fieldsets = (
        (
            "Session Information",
            {
                "fields": (
                    "order",
                    "session_number",
                    "therapist",
                    "status",
                )
            },
        ),
        (
            "Scheduling",
            {
                "fields": (
                    "scheduled_date",
                    "scheduled_time",
                    "actual_date",
                    "duration_minutes",
                )
            },
        ),
        (
            "Pre-Session Assessment",
            {
                "fields": (
                    "pre_pain_score",
                    "pre_assessment_notes",
                    "patient_reported_changes",
                )
            },
        ),
        (
            "Session Details",
            {
                "fields": (
                    "interventions",
                    "exercises_performed",
                    "modalities_used",
                    "patient_response",
                )
            },
        ),
        (
            "Post-Session Assessment",
            {
                "fields": (
                    "post_pain_score",
                    "outcome",
                    "progress_notes",
                )
            },
        ),
        (
            "Home Program",
            {
                "fields": (
                    "home_exercises",
                    "home_exercise_instructions",
                    "precautions_advised",
                ),
                "classes": ("collapse",),
            },
        ),
        (
            "Follow-up",
            {
                "fields": (
                    "follow_up_recommendations",
                    "next_session_goals",
                ),
                "classes": ("collapse",),
            },
        ),
        (
            "Billing",
            {
                "fields": (
                    "is_billed",
                    "invoice_item",
                )
            },
        ),
        (
            "Timestamps",
            {
                "fields": (
                    "created_at",
                    "updated_at",
                    "completed_at",
                ),
                "classes": ("collapse",),
            },
        ),
    )
