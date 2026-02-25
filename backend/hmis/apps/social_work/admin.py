"""
Django admin configuration for the social work module.
"""

from django.contrib import admin

from hmis.apps.social_work.models import (
    CaseNote,
    SocialWorkCase,
    SocialWorkIntervention,
    SocialWorkReferral,
)


class CaseNoteInline(admin.TabularInline):
    """Inline admin for case notes within a case."""

    model = CaseNote
    extra = 0
    readonly_fields = ["created_at", "author"]
    fields = [
        "note_type",
        "contact_date",
        "contact_method",
        "subject",
        "author",
        "is_confidential",
    ]


class InterventionInline(admin.TabularInline):
    """Inline admin for interventions within a case."""

    model = SocialWorkIntervention
    extra = 0
    readonly_fields = ["created_at", "provided_by"]
    fields = [
        "intervention_type",
        "status",
        "planned_date",
        "outcome_rating",
        "provided_by",
    ]


@admin.register(SocialWorkReferral)
class SocialWorkReferralAdmin(admin.ModelAdmin):
    """Admin configuration for SocialWorkReferral."""

    list_display = [
        "referral_number",
        "patient",
        "reason",
        "urgency",
        "status",
        "assigned_worker",
        "is_sensitive",
        "created_at",
    ]
    list_filter = [
        "status",
        "urgency",
        "reason",
        "is_sensitive",
        "created_at",
    ]
    search_fields = [
        "referral_number",
        "patient__first_name",
        "patient__last_name",
        "patient__mrn",
        "clinical_summary",
    ]
    readonly_fields = [
        "referral_number",
        "created_at",
        "updated_at",
        "accepted_at",
        "completed_at",
    ]
    ordering = ["-created_at"]
    raw_id_fields = ["patient", "encounter", "referred_by", "assigned_worker", "clinic_visit"]
    fieldsets = [
        (
            "Referral Info",
            {
                "fields": [
                    "referral_number",
                    "patient",
                    "encounter",
                    "referred_by",
                    "assigned_worker",
                ],
            },
        ),
        (
            "Clinical Details",
            {
                "fields": [
                    "reason",
                    "urgency",
                    "clinical_summary",
                    "presenting_issues",
                    "specific_requests",
                    "risk_factors",
                ],
            },
        ),
        (
            "Status",
            {
                "fields": [
                    "status",
                    "status_changed_at",
                    "status_changed_by",
                ],
            },
        ),
        (
            "Privacy",
            {
                "fields": [
                    "is_sensitive",
                    "confidentiality_notes",
                ],
                "classes": ["collapse"],
            },
        ),
        (
            "External Referral",
            {
                "fields": [
                    "external_agency",
                    "external_contact",
                ],
                "classes": ["collapse"],
            },
        ),
        (
            "Timestamps",
            {
                "fields": [
                    "created_at",
                    "updated_at",
                    "accepted_at",
                    "completed_at",
                ],
                "classes": ["collapse"],
            },
        ),
    ]

    def get_queryset(self, request):
        """Filter sensitive referrals based on permissions."""
        qs = super().get_queryset(request)
        if not request.user.has_perm("social_work.view_sensitive_sw_referral"):
            qs = qs.filter(is_sensitive=False)
        return qs


@admin.register(SocialWorkCase)
class SocialWorkCaseAdmin(admin.ModelAdmin):
    """Admin configuration for SocialWorkCase."""

    list_display = [
        "case_number",
        "patient",
        "case_type",
        "risk_level",
        "priority",
        "status",
        "assigned_worker",
        "is_sensitive",
        "next_review_date",
        "opened_at",
    ]
    list_filter = [
        "status",
        "case_type",
        "risk_level",
        "priority",
        "is_sensitive",
        "confidentiality_level",
        "opened_at",
    ]
    search_fields = [
        "case_number",
        "patient__first_name",
        "patient__last_name",
        "patient__mrn",
        "title",
        "presenting_problem",
    ]
    readonly_fields = [
        "case_number",
        "opened_at",
        "updated_at",
        "closed_at",
    ]
    ordering = ["-opened_at"]
    raw_id_fields = [
        "patient",
        "referral",
        "assigned_worker",
        "secondary_worker",
        "supervisor",
    ]
    filter_horizontal = ["access_restricted_to"]
    inlines = [CaseNoteInline, InterventionInline]
    fieldsets = [
        (
            "Case Info",
            {
                "fields": [
                    "case_number",
                    "patient",
                    "referral",
                    "case_type",
                    "title",
                ],
            },
        ),
        (
            "Assignment",
            {
                "fields": [
                    "assigned_worker",
                    "secondary_worker",
                    "supervisor",
                ],
            },
        ),
        (
            "Assessment",
            {
                "fields": [
                    "presenting_problem",
                    "assessment",
                    "psychosocial_history",
                    "family_composition",
                    "support_systems",
                    "strengths",
                    "barriers",
                    "safety_assessment",
                ],
            },
        ),
        (
            "Risk & Priority",
            {
                "fields": [
                    "risk_level",
                    "priority",
                ],
            },
        ),
        (
            "Goals & Planning",
            {
                "fields": [
                    "goals",
                    "intervention_plan",
                ],
            },
        ),
        (
            "Outcome",
            {
                "fields": [
                    "outcome",
                    "outcome_rating",
                ],
                "classes": ["collapse"],
            },
        ),
        (
            "Status",
            {
                "fields": [
                    "status",
                    "status_changed_at",
                    "status_changed_by",
                ],
            },
        ),
        (
            "Privacy & Access",
            {
                "fields": [
                    "is_sensitive",
                    "confidentiality_level",
                    "access_restricted_to",
                ],
                "classes": ["collapse"],
            },
        ),
        (
            "Follow-up",
            {
                "fields": [
                    "next_review_date",
                    "follow_up_frequency",
                ],
            },
        ),
        (
            "Timestamps",
            {
                "fields": [
                    "opened_at",
                    "updated_at",
                    "closed_at",
                ],
                "classes": ["collapse"],
            },
        ),
    ]

    def get_queryset(self, request):
        """Filter sensitive cases based on permissions."""
        qs = super().get_queryset(request)
        if not request.user.has_perm("social_work.view_sensitive_sw_case"):
            qs = qs.filter(is_sensitive=False)
        return qs


@admin.register(CaseNote)
class CaseNoteAdmin(admin.ModelAdmin):
    """Admin configuration for CaseNote."""

    list_display = [
        "case",
        "note_type",
        "subject",
        "contact_date",
        "author",
        "follow_up_required",
        "is_confidential",
    ]
    list_filter = [
        "note_type",
        "contact_method",
        "follow_up_required",
        "is_confidential",
        "contact_date",
    ]
    search_fields = [
        "case__case_number",
        "subject",
        "content",
    ]
    readonly_fields = ["created_at", "updated_at"]
    ordering = ["-contact_date"]
    raw_id_fields = ["case", "author"]
    fieldsets = [
        (
            "Note Info",
            {
                "fields": [
                    "case",
                    "author",
                    "note_type",
                    "contact_date",
                    "contact_method",
                    "duration_minutes",
                ],
            },
        ),
        (
            "Content",
            {
                "fields": [
                    "subject",
                    "content",
                    "participant_names",
                ],
            },
        ),
        (
            "Follow-up",
            {
                "fields": [
                    "follow_up_required",
                    "follow_up_actions",
                    "follow_up_date",
                ],
            },
        ),
        (
            "Privacy",
            {
                "fields": ["is_confidential"],
            },
        ),
        (
            "Timestamps",
            {
                "fields": ["created_at", "updated_at"],
                "classes": ["collapse"],
            },
        ),
    ]


@admin.register(SocialWorkIntervention)
class SocialWorkInterventionAdmin(admin.ModelAdmin):
    """Admin configuration for SocialWorkIntervention."""

    list_display = [
        "case",
        "intervention_type",
        "status",
        "planned_date",
        "completion_date",
        "outcome_rating",
        "provided_by",
        "cost",
    ]
    list_filter = [
        "intervention_type",
        "status",
        "outcome_rating",
        "planned_date",
    ]
    search_fields = [
        "case__case_number",
        "description",
        "objectives",
        "external_agency",
    ]
    readonly_fields = ["created_at", "updated_at"]
    ordering = ["-created_at"]
    raw_id_fields = ["case", "provided_by"]
    fieldsets = [
        (
            "Intervention Info",
            {
                "fields": [
                    "case",
                    "provided_by",
                    "intervention_type",
                    "description",
                    "objectives",
                    "activities",
                ],
            },
        ),
        (
            "Status & Dates",
            {
                "fields": [
                    "status",
                    "planned_date",
                    "start_date",
                    "completion_date",
                ],
            },
        ),
        (
            "Outcome",
            {
                "fields": [
                    "outcome",
                    "outcome_rating",
                    "client_feedback",
                ],
            },
        ),
        (
            "External Agency",
            {
                "fields": [
                    "external_agency",
                    "external_contact",
                ],
                "classes": ["collapse"],
            },
        ),
        (
            "Cost",
            {
                "fields": [
                    "cost",
                    "cost_source",
                ],
                "classes": ["collapse"],
            },
        ),
        (
            "Timestamps",
            {
                "fields": ["created_at", "updated_at"],
                "classes": ["collapse"],
            },
        ),
    ]
