"""
Django admin configuration for the occupational therapy module.
"""

from django.contrib import admin

from hmis.apps.occupational_therapy.models import (
    OccupationalTherapyOrder,
    OTSession,
    OTTreatmentType,
)


@admin.register(OTTreatmentType)
class OTTreatmentTypeAdmin(admin.ModelAdmin):
    """Admin configuration for OTTreatmentType."""

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
    fieldsets = [
        (
            "Identity",
            {
                "fields": ["code", "name", "description", "category"],
            },
        ),
        (
            "Session Parameters",
            {
                "fields": [
                    "typical_duration_minutes",
                    "recommended_sessions",
                    "recommended_frequency",
                ],
            },
        ),
        (
            "Pricing & SHA",
            {
                "fields": [
                    "cost_per_session",
                    "sha_claimable",
                    "sha_intervention_code",
                ],
            },
        ),
        (
            "Requirements",
            {
                "fields": [
                    "requires_equipment",
                    "equipment_needed",
                    "contraindications",
                    "precautions",
                ],
            },
        ),
        (
            "Status",
            {
                "fields": ["is_active"],
            },
        ),
    ]


class OTSessionInline(admin.TabularInline):
    """Inline admin for sessions within an order."""

    model = OTSession
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


@admin.register(OccupationalTherapyOrder)
class OccupationalTherapyOrderAdmin(admin.ModelAdmin):
    """Admin configuration for OccupationalTherapyOrder."""

    list_display = [
        "order_number",
        "patient",
        "treatment_type",
        "assessment_type",
        "status",
        "priority",
        "sessions_completed",
        "total_sessions",
        "assigned_therapist",
        "ordered_at",
    ]
    list_filter = [
        "status",
        "priority",
        "assessment_type",
        "is_paid",
        "ordered_at",
    ]
    search_fields = [
        "order_number",
        "patient__first_name",
        "patient__last_name",
        "patient__mrn",
        "clinical_indication",
    ]
    ordering = ["-ordered_at"]
    raw_id_fields = [
        "patient",
        "encounter",
        "ordered_by",
        "assigned_therapist",
    ]
    readonly_fields = [
        "order_number",
        "sessions_completed",
        "total_cost",
        "ordered_at",
        "completed_at",
    ]
    inlines = [OTSessionInline]
    fieldsets = [
        (
            "Order Info",
            {
                "fields": [
                    "order_number",
                    "patient",
                    "encounter",
                    "treatment_type",
                    "ordered_by",
                    "assigned_therapist",
                ],
            },
        ),
        (
            "Clinical Details",
            {
                "fields": [
                    "assessment_type",
                    "referral_reason",
                    "clinical_indication",
                    "relevant_history",
                    "diagnosis",
                    "precautions",
                    "contraindications",
                ],
            },
        ),
        (
            "Treatment Goals",
            {
                "fields": [
                    "treatment_goals",
                    "short_term_goals",
                    "long_term_goals",
                    "functional_limitations",
                ],
            },
        ),
        (
            "Treatment Plan",
            {
                "fields": [
                    "total_sessions",
                    "sessions_completed",
                    "frequency",
                    "priority",
                    "status",
                ],
            },
        ),
        (
            "Scheduling",
            {
                "fields": [
                    "start_date",
                    "expected_end_date",
                    "clinic_visit",
                ],
            },
        ),
        (
            "Billing",
            {
                "fields": [
                    "total_cost",
                    "is_paid",
                    "invoice",
                ],
            },
        ),
        (
            "Timestamps",
            {
                "fields": [
                    "ordered_at",
                    "completed_at",
                ],
                "classes": ["collapse"],
            },
        ),
    ]


@admin.register(OTSession)
class OTSessionAdmin(admin.ModelAdmin):
    """Admin configuration for OTSession."""

    list_display = [
        "order",
        "session_number",
        "therapist",
        "scheduled_date",
        "status",
        "outcome",
        "is_billed",
    ]
    list_filter = [
        "status",
        "outcome",
        "is_billed",
        "scheduled_date",
    ]
    search_fields = [
        "order__order_number",
        "order__patient__first_name",
        "order__patient__last_name",
        "progress_notes",
    ]
    ordering = ["scheduled_date", "session_number"]
    raw_id_fields = ["order", "therapist", "clinic_visit", "invoice_item"]
    readonly_fields = ["session_number", "created_at", "updated_at", "completed_at"]
    fieldsets = [
        (
            "Session Info",
            {
                "fields": [
                    "order",
                    "session_number",
                    "therapist",
                    "status",
                ],
            },
        ),
        (
            "Scheduling",
            {
                "fields": [
                    "scheduled_date",
                    "scheduled_time",
                    "actual_date",
                    "duration_minutes",
                ],
            },
        ),
        (
            "Pre-Session Assessment",
            {
                "fields": [
                    "pre_functional_status",
                    "pre_assessment_notes",
                    "patient_reported_changes",
                    "patient_goals_for_session",
                ],
            },
        ),
        (
            "Activities Performed",
            {
                "fields": [
                    "activities_performed",
                    "adl_activities",
                    "cognitive_exercises",
                    "sensory_activities",
                    "fine_motor_exercises",
                    "gross_motor_activities",
                    "adaptive_equipment_training",
                    "splint_orthotics",
                ],
            },
        ),
        (
            "Patient Response",
            {
                "fields": [
                    "patient_response",
                    "patient_engagement",
                ],
            },
        ),
        (
            "Post-Session Assessment",
            {
                "fields": [
                    "post_functional_status",
                    "outcome",
                    "progress_notes",
                    "goals_addressed",
                    "goals_progress",
                ],
            },
        ),
        (
            "Home Program",
            {
                "fields": [
                    "home_activities",
                    "home_activity_instructions",
                    "caregiver_education",
                    "environmental_recommendations",
                    "precautions_advised",
                ],
            },
        ),
        (
            "Follow-up",
            {
                "fields": [
                    "follow_up_recommendations",
                    "next_session_goals",
                    "equipment_recommendations",
                ],
            },
        ),
        (
            "Billing & Queue",
            {
                "fields": [
                    "clinic_visit",
                    "is_billed",
                    "invoice_item",
                ],
            },
        ),
        (
            "Timestamps",
            {
                "fields": [
                    "created_at",
                    "updated_at",
                    "completed_at",
                ],
                "classes": ["collapse"],
            },
        ),
    ]
