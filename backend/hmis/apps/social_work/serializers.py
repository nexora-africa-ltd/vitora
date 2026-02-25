"""
Serializers for the social work module.

Provides REST API serialization for:
- SocialWorkReferral (referrals from clinical encounters)
- SocialWorkCase (case management)
- CaseNote (progress notes)
- SocialWorkIntervention (interventions applied)
"""

from rest_framework import serializers

from hmis.apps.social_work.models import (
    CaseNote,
    SocialWorkCase,
    SocialWorkIntervention,
    SocialWorkReferral,
)


class SocialWorkReferralSerializer(serializers.ModelSerializer):
    """Full serializer for SocialWorkReferral model."""

    patient_name = serializers.SerializerMethodField()
    patient_mrn = serializers.CharField(source="patient.mrn", read_only=True)
    referred_by_name = serializers.SerializerMethodField()
    assigned_worker_name = serializers.SerializerMethodField()
    status_display = serializers.CharField(source="get_status_display", read_only=True)
    urgency_display = serializers.CharField(source="get_urgency_display", read_only=True)
    reason_display = serializers.CharField(source="get_reason_display", read_only=True)
    is_gbv_case = serializers.BooleanField(read_only=True)
    requires_immediate_attention = serializers.BooleanField(read_only=True)

    class Meta:
        model = SocialWorkReferral
        fields = [
            "id",
            "referral_number",
            "patient",
            "patient_name",
            "patient_mrn",
            "encounter",
            "referred_by",
            "referred_by_name",
            "assigned_worker",
            "assigned_worker_name",
            "reason",
            "reason_display",
            "urgency",
            "urgency_display",
            "clinical_summary",
            "presenting_issues",
            "specific_requests",
            "risk_factors",
            "status",
            "status_display",
            "is_sensitive",
            "confidentiality_notes",
            "external_agency",
            "external_contact",
            "clinic_visit",
            "created_at",
            "updated_at",
            "accepted_at",
            "completed_at",
            "is_gbv_case",
            "requires_immediate_attention",
        ]
        read_only_fields = [
            "id",
            "referral_number",
            "created_at",
            "updated_at",
            "accepted_at",
            "completed_at",
        ]

    def get_patient_name(self, obj):
        """Return patient full name."""
        return f"{obj.patient.first_name} {obj.patient.last_name}"

    def get_referred_by_name(self, obj):
        """Return referring user's name."""
        if obj.referred_by:
            return f"{obj.referred_by.first_name} {obj.referred_by.last_name}".strip() or obj.referred_by.username
        return None

    def get_assigned_worker_name(self, obj):
        """Return assigned social worker's name."""
        if obj.assigned_worker:
            return f"{obj.assigned_worker.first_name} {obj.assigned_worker.last_name}".strip() or obj.assigned_worker.username
        return None


class SocialWorkReferralListSerializer(serializers.ModelSerializer):
    """Lightweight serializer for referral lists."""

    patient_name = serializers.SerializerMethodField()
    patient_mrn = serializers.CharField(source="patient.mrn", read_only=True)
    assigned_worker_name = serializers.SerializerMethodField()
    status_display = serializers.CharField(source="get_status_display", read_only=True)
    urgency_display = serializers.CharField(source="get_urgency_display", read_only=True)
    reason_display = serializers.CharField(source="get_reason_display", read_only=True)
    requires_immediate_attention = serializers.BooleanField(read_only=True)

    class Meta:
        model = SocialWorkReferral
        fields = [
            "id",
            "referral_number",
            "patient",
            "patient_name",
            "patient_mrn",
            "reason",
            "reason_display",
            "urgency",
            "urgency_display",
            "status",
            "status_display",
            "assigned_worker",
            "assigned_worker_name",
            "is_sensitive",
            "created_at",
            "requires_immediate_attention",
        ]

    def get_patient_name(self, obj):
        """Return patient full name."""
        return f"{obj.patient.first_name} {obj.patient.last_name}"

    def get_assigned_worker_name(self, obj):
        """Return assigned social worker's name."""
        if obj.assigned_worker:
            return f"{obj.assigned_worker.first_name} {obj.assigned_worker.last_name}".strip() or obj.assigned_worker.username
        return None


class SocialWorkReferralCreateSerializer(serializers.ModelSerializer):
    """Serializer for creating referrals."""

    class Meta:
        model = SocialWorkReferral
        fields = [
            "patient",
            "encounter",
            "reason",
            "urgency",
            "clinical_summary",
            "presenting_issues",
            "specific_requests",
            "risk_factors",
            "confidentiality_notes",
        ]

    def validate(self, data):
        """Validate referral creation."""
        patient = data.get("patient")
        encounter = data.get("encounter")

        # If encounter provided, ensure it belongs to the patient
        if encounter and encounter.patient != patient:
            raise serializers.ValidationError(
                {"encounter": "Encounter does not belong to the specified patient."}
            )

        return data


class SocialWorkReferralUpdateStatusSerializer(serializers.Serializer):
    """Serializer for updating referral status."""

    status = serializers.ChoiceField(choices=SocialWorkReferral.REFERRAL_STATUS)
    notes = serializers.CharField(required=False, allow_blank=True)
    external_agency = serializers.CharField(required=False, allow_blank=True)
    external_contact = serializers.CharField(required=False, allow_blank=True)


class SocialWorkReferralAssignWorkerSerializer(serializers.Serializer):
    """Serializer for assigning social worker to referral."""

    assigned_worker = serializers.IntegerField()

    def validate_assigned_worker(self, value):
        """Validate and return the user instance."""
        from django.contrib.auth import get_user_model
        User = get_user_model()
        try:
            user = User.objects.get(id=value, is_active=True)
            return user
        except User.DoesNotExist as err:
            raise serializers.ValidationError("User not found or inactive.") from err


# ==================== SOCIAL WORK CASE SERIALIZERS ====================


class SocialWorkCaseSerializer(serializers.ModelSerializer):
    """Full serializer for SocialWorkCase model."""

    patient_name = serializers.SerializerMethodField()
    patient_mrn = serializers.CharField(source="patient.mrn", read_only=True)
    assigned_worker_name = serializers.SerializerMethodField()
    supervisor_name = serializers.SerializerMethodField()
    status_display = serializers.CharField(source="get_status_display", read_only=True)
    case_type_display = serializers.CharField(source="get_case_type_display", read_only=True)
    risk_level_display = serializers.CharField(source="get_risk_level_display", read_only=True)
    priority_display = serializers.CharField(source="get_priority_display", read_only=True)
    is_open = serializers.BooleanField(read_only=True)
    days_open = serializers.IntegerField(read_only=True)
    is_overdue_for_review = serializers.BooleanField(read_only=True)
    notes_count = serializers.SerializerMethodField()
    interventions_count = serializers.SerializerMethodField()

    class Meta:
        model = SocialWorkCase
        fields = [
            "id",
            "case_number",
            "patient",
            "patient_name",
            "patient_mrn",
            "referral",
            "assigned_worker",
            "assigned_worker_name",
            "secondary_worker",
            "supervisor",
            "supervisor_name",
            "case_type",
            "case_type_display",
            "title",
            "presenting_problem",
            "assessment",
            "psychosocial_history",
            "family_composition",
            "support_systems",
            "strengths",
            "barriers",
            "safety_assessment",
            "risk_level",
            "risk_level_display",
            "priority",
            "priority_display",
            "goals",
            "intervention_plan",
            "outcome",
            "outcome_rating",
            "status",
            "status_display",
            "is_sensitive",
            "confidentiality_level",
            "next_review_date",
            "follow_up_frequency",
            "opened_at",
            "updated_at",
            "closed_at",
            "is_open",
            "days_open",
            "is_overdue_for_review",
            "notes_count",
            "interventions_count",
        ]
        read_only_fields = [
            "id",
            "case_number",
            "opened_at",
            "updated_at",
            "closed_at",
        ]

    def get_patient_name(self, obj):
        """Return patient full name."""
        return f"{obj.patient.first_name} {obj.patient.last_name}"

    def get_assigned_worker_name(self, obj):
        """Return assigned social worker's name."""
        if obj.assigned_worker:
            return f"{obj.assigned_worker.first_name} {obj.assigned_worker.last_name}".strip() or obj.assigned_worker.username
        return None

    def get_supervisor_name(self, obj):
        """Return supervisor's name."""
        if obj.supervisor:
            return f"{obj.supervisor.first_name} {obj.supervisor.last_name}".strip() or obj.supervisor.username
        return None

    def get_notes_count(self, obj):
        """Return count of case notes."""
        return obj.notes.count()

    def get_interventions_count(self, obj):
        """Return count of interventions."""
        return obj.interventions.count()


class SocialWorkCaseListSerializer(serializers.ModelSerializer):
    """Lightweight serializer for case lists."""

    patient_name = serializers.SerializerMethodField()
    patient_mrn = serializers.CharField(source="patient.mrn", read_only=True)
    assigned_worker_name = serializers.SerializerMethodField()
    status_display = serializers.CharField(source="get_status_display", read_only=True)
    case_type_display = serializers.CharField(source="get_case_type_display", read_only=True)
    risk_level_display = serializers.CharField(source="get_risk_level_display", read_only=True)
    is_overdue_for_review = serializers.BooleanField(read_only=True)

    class Meta:
        model = SocialWorkCase
        fields = [
            "id",
            "case_number",
            "patient",
            "patient_name",
            "patient_mrn",
            "case_type",
            "case_type_display",
            "title",
            "risk_level",
            "risk_level_display",
            "status",
            "status_display",
            "assigned_worker",
            "assigned_worker_name",
            "is_sensitive",
            "next_review_date",
            "opened_at",
            "is_overdue_for_review",
        ]

    def get_patient_name(self, obj):
        """Return patient full name."""
        return f"{obj.patient.first_name} {obj.patient.last_name}"

    def get_assigned_worker_name(self, obj):
        """Return assigned social worker's name."""
        if obj.assigned_worker:
            return f"{obj.assigned_worker.first_name} {obj.assigned_worker.last_name}".strip() or obj.assigned_worker.username
        return None


class SocialWorkCaseCreateSerializer(serializers.ModelSerializer):
    """Serializer for creating cases."""

    class Meta:
        model = SocialWorkCase
        fields = [
            "patient",
            "referral",
            "case_type",
            "title",
            "presenting_problem",
            "goals",
            "risk_level",
            "priority",
        ]

    def validate(self, data):
        """Validate case creation."""
        referral = data.get("referral")
        patient = data.get("patient")

        # If referral provided, ensure it belongs to the patient
        if referral and referral.patient != patient:
            raise serializers.ValidationError(
                {"referral": "Referral does not belong to the specified patient."}
            )

        return data


class SocialWorkCaseClosureSerializer(serializers.Serializer):
    """Serializer for closing a case."""

    status = serializers.ChoiceField(
        choices=[
            ("CLOSED_RESOLVED", "Closed - Resolved"),
            ("CLOSED_TRANSFERRED", "Closed - Transferred"),
            ("CLOSED_LOST_CONTACT", "Closed - Lost Contact"),
            ("CLOSED_DECEASED", "Closed - Deceased"),
        ]
    )
    outcome = serializers.CharField()
    outcome_rating = serializers.ChoiceField(
        choices=[
            ("FULLY_ACHIEVED", "Goals Fully Achieved"),
            ("PARTIALLY_ACHIEVED", "Goals Partially Achieved"),
            ("NOT_ACHIEVED", "Goals Not Achieved"),
            ("ONGOING", "Ongoing Progress"),
        ]
    )


# ==================== CASE NOTE SERIALIZERS ====================


class CaseNoteSerializer(serializers.ModelSerializer):
    """Serializer for CaseNote model."""

    author_name = serializers.SerializerMethodField()
    note_type_display = serializers.CharField(source="get_note_type_display", read_only=True)
    contact_method_display = serializers.CharField(source="get_contact_method_display", read_only=True)

    class Meta:
        model = CaseNote
        fields = [
            "id",
            "case",
            "author",
            "author_name",
            "note_type",
            "note_type_display",
            "contact_date",
            "contact_method",
            "contact_method_display",
            "duration_minutes",
            "subject",
            "content",
            "participant_names",
            "follow_up_required",
            "follow_up_actions",
            "follow_up_date",
            "is_confidential",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]

    def get_author_name(self, obj):
        """Return author's name."""
        if obj.author:
            return f"{obj.author.first_name} {obj.author.last_name}".strip() or obj.author.username
        return None


class CaseNoteCreateSerializer(serializers.ModelSerializer):
    """Serializer for creating case notes."""

    class Meta:
        model = CaseNote
        fields = [
            "case",
            "note_type",
            "contact_date",
            "contact_method",
            "duration_minutes",
            "subject",
            "content",
            "participant_names",
            "follow_up_required",
            "follow_up_actions",
            "follow_up_date",
            "is_confidential",
        ]


# ==================== INTERVENTION SERIALIZERS ====================


class SocialWorkInterventionSerializer(serializers.ModelSerializer):
    """Serializer for SocialWorkIntervention model."""

    provided_by_name = serializers.SerializerMethodField()
    intervention_type_display = serializers.CharField(
        source="get_intervention_type_display", read_only=True
    )
    status_display = serializers.CharField(source="get_status_display", read_only=True)
    outcome_rating_display = serializers.CharField(
        source="get_outcome_rating_display", read_only=True
    )

    class Meta:
        model = SocialWorkIntervention
        fields = [
            "id",
            "case",
            "provided_by",
            "provided_by_name",
            "intervention_type",
            "intervention_type_display",
            "description",
            "objectives",
            "activities",
            "status",
            "status_display",
            "planned_date",
            "start_date",
            "completion_date",
            "outcome",
            "outcome_rating",
            "outcome_rating_display",
            "client_feedback",
            "external_agency",
            "external_contact",
            "cost",
            "cost_source",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]

    def get_provided_by_name(self, obj):
        """Return provider's name."""
        if obj.provided_by:
            return f"{obj.provided_by.first_name} {obj.provided_by.last_name}".strip() or obj.provided_by.username
        return None


class SocialWorkInterventionCreateSerializer(serializers.ModelSerializer):
    """Serializer for creating interventions."""

    class Meta:
        model = SocialWorkIntervention
        fields = [
            "case",
            "intervention_type",
            "description",
            "objectives",
            "planned_date",
            "external_agency",
            "external_contact",
            "cost",
            "cost_source",
        ]


class SocialWorkInterventionCompleteSerializer(serializers.Serializer):
    """Serializer for completing an intervention."""

    outcome = serializers.CharField()
    outcome_rating = serializers.ChoiceField(
        choices=[
            ("SUCCESSFUL", "Successful"),
            ("PARTIALLY_SUCCESSFUL", "Partially Successful"),
            ("UNSUCCESSFUL", "Unsuccessful"),
        ]
    )
    client_feedback = serializers.CharField(required=False, allow_blank=True)
    activities = serializers.CharField(required=False, allow_blank=True)
