"""
Serializers for the counselling module.

Provides REST API serialization for:
- CounsellingType (catalog)
- CounsellingReferral (referrals)
- CounsellingSession (sessions)
"""

from rest_framework import serializers

from hmis.apps.counselling.models import (
    CounsellingReferral,
    CounsellingSession,
    CounsellingType,
)


class CounsellingTypeSerializer(serializers.ModelSerializer):
    """Serializer for CounsellingType model."""

    category_display = serializers.CharField(source="get_category_display", read_only=True)

    class Meta:
        model = CounsellingType
        fields = [
            "id",
            "code",
            "name",
            "description",
            "category",
            "category_display",
            "typical_duration_minutes",
            "recommended_sessions",
            "recommended_frequency",
            "cost_per_session",
            "sha_claimable",
            "sha_intervention_code",
            "requires_privacy",
            "requires_referral",
            "min_age",
            "max_age",
            "gender_specific",
            "is_active",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]


class CounsellingTypeListSerializer(serializers.ModelSerializer):
    """Lightweight serializer for counselling type lists."""

    category_display = serializers.CharField(source="get_category_display", read_only=True)

    class Meta:
        model = CounsellingType
        fields = [
            "id",
            "code",
            "name",
            "category",
            "category_display",
            "cost_per_session",
            "sha_claimable",
            "is_active",
        ]


class CounsellingSessionSerializer(serializers.ModelSerializer):
    """Serializer for CounsellingSession model."""

    counsellor_name = serializers.SerializerMethodField()
    status_display = serializers.CharField(source="get_status_display", read_only=True)
    outcome_display = serializers.CharField(source="get_outcome_display", read_only=True)
    follow_up_display = serializers.CharField(source="get_follow_up_required_display", read_only=True)
    risk_level_display = serializers.CharField(source="get_risk_level_display", read_only=True)
    mood_improvement = serializers.IntegerField(read_only=True)
    is_overdue = serializers.BooleanField(read_only=True)

    class Meta:
        model = CounsellingSession
        fields = [
            "id",
            "session_number",
            "referral",
            "counsellor",
            "counsellor_name",
            "session_sequence",
            "scheduled_date",
            "scheduled_time",
            "actual_date",
            "actual_start_time",
            "actual_end_time",
            "duration_minutes",
            "status",
            "status_display",
            "pre_session_mood",
            "pre_session_notes",
            "session_type",
            "topics_discussed",
            "techniques_used",
            "client_responses",
            "progress_notes",
            "post_session_mood",
            "outcome",
            "outcome_display",
            "risk_assessment",
            "risk_level",
            "risk_level_display",
            "safety_plan",
            "follow_up_required",
            "follow_up_display",
            "follow_up_date",
            "homework",
            "goals_for_next_session",
            "confidentiality_level",
            "is_sensitive",
            "clinic_visit",
            "is_billed",
            "mood_improvement",
            "is_overdue",
            "created_at",
            "updated_at",
            "completed_at",
        ]
        read_only_fields = [
            "id",
            "session_number",
            "session_sequence",
            "is_billed",
            "created_at",
            "updated_at",
            "completed_at",
        ]

    def get_counsellor_name(self, obj):
        """Return counsellor full name."""
        if obj.counsellor:
            return f"{obj.counsellor.first_name} {obj.counsellor.last_name}".strip() or obj.counsellor.username
        return None


class CounsellingSessionCreateSerializer(serializers.ModelSerializer):
    """Serializer for creating counselling sessions."""

    class Meta:
        model = CounsellingSession
        fields = [
            "referral",
            "counsellor",
            "scheduled_date",
            "scheduled_time",
            "session_type",
        ]

    def validate(self, data):
        """Validate session creation."""
        referral = data.get("referral")

        # Check if referral is in valid state
        if referral.status not in ["ACCEPTED", "IN_PROGRESS"]:
            raise serializers.ValidationError(
                {"referral": f"Cannot add sessions to referral with status '{referral.status}'"}
            )

        return data


class CounsellingSessionCompleteSerializer(serializers.ModelSerializer):
    """Serializer for completing a counselling session."""

    class Meta:
        model = CounsellingSession
        fields = [
            "actual_date",
            "actual_start_time",
            "actual_end_time",
            "duration_minutes",
            "pre_session_mood",
            "pre_session_notes",
            "topics_discussed",
            "techniques_used",
            "client_responses",
            "progress_notes",
            "post_session_mood",
            "outcome",
            "risk_assessment",
            "risk_level",
            "safety_plan",
            "follow_up_required",
            "follow_up_date",
            "homework",
            "goals_for_next_session",
        ]

    def validate(self, data):
        """Validate session completion."""
        instance = self.instance

        if instance and instance.status == "COMPLETED":
            raise serializers.ValidationError("Session is already completed")

        # Ensure progress notes are provided
        if not data.get("progress_notes") and not (instance and instance.progress_notes):
            raise serializers.ValidationError(
                {"progress_notes": "Progress notes are required to complete a session"}
            )

        return data


class CounsellingSessionListSerializer(serializers.ModelSerializer):
    """Lightweight serializer for session lists."""

    counsellor_name = serializers.SerializerMethodField()
    status_display = serializers.CharField(source="get_status_display", read_only=True)
    patient_name = serializers.SerializerMethodField()

    class Meta:
        model = CounsellingSession
        fields = [
            "id",
            "session_number",
            "referral",
            "counsellor_name",
            "patient_name",
            "session_sequence",
            "scheduled_date",
            "scheduled_time",
            "status",
            "status_display",
            "is_sensitive",
        ]

    def get_counsellor_name(self, obj):
        """Return counsellor full name."""
        if obj.counsellor:
            return f"{obj.counsellor.first_name} {obj.counsellor.last_name}".strip() or obj.counsellor.username
        return None

    def get_patient_name(self, obj):
        """Return patient name from referral."""
        if obj.referral and obj.referral.patient:
            return f"{obj.referral.patient.first_name} {obj.referral.patient.last_name}"
        return None


class CounsellingReferralSerializer(serializers.ModelSerializer):
    """Full serializer for CounsellingReferral model."""

    referred_by_name = serializers.SerializerMethodField()
    assigned_counsellor_name = serializers.SerializerMethodField()
    patient_name = serializers.SerializerMethodField()
    patient_mrn = serializers.SerializerMethodField()
    status_display = serializers.CharField(source="get_status_display", read_only=True)
    urgency_display = serializers.CharField(source="get_urgency_display", read_only=True)
    reason_display = serializers.CharField(source="get_reason_display", read_only=True)
    counselling_type_name = serializers.SerializerMethodField()
    is_mental_health_related = serializers.BooleanField(read_only=True)
    is_hiv_related = serializers.BooleanField(read_only=True)
    requires_immediate_attention = serializers.BooleanField(read_only=True)
    completion_percentage = serializers.FloatField(read_only=True)
    sessions = CounsellingSessionListSerializer(many=True, read_only=True)

    class Meta:
        model = CounsellingReferral
        fields = [
            "id",
            "referral_number",
            "patient",
            "patient_name",
            "patient_mrn",
            "encounter",
            "counselling_type",
            "counselling_type_name",
            "referred_by",
            "referred_by_name",
            "assigned_counsellor",
            "assigned_counsellor_name",
            "reason",
            "reason_display",
            "urgency",
            "urgency_display",
            "clinical_summary",
            "presenting_issues",
            "goals",
            "risk_assessment",
            "status",
            "status_display",
            "is_sensitive",
            "is_mental_health_related",
            "is_hiv_related",
            "requires_immediate_attention",
            "total_sessions",
            "sessions_completed",
            "completion_percentage",
            "is_paid",
            "invoice",
            "clinic_visit",
            "completion_notes",
            "cancellation_reason",
            "sessions",
            "created_at",
            "updated_at",
            "accepted_at",
            "started_at",
            "completed_at",
            "completed_by",
        ]
        read_only_fields = [
            "id",
            "referral_number",
            "sessions_completed",
            "accepted_at",
            "started_at",
            "completed_at",
            "completed_by",
            "created_at",
            "updated_at",
        ]

    def get_referred_by_name(self, obj):
        """Return referrer full name."""
        if obj.referred_by:
            name = f"{obj.referred_by.first_name} {obj.referred_by.last_name}".strip()
            return name or obj.referred_by.username
        return None

    def get_assigned_counsellor_name(self, obj):
        """Return assigned counsellor full name."""
        if obj.assigned_counsellor:
            name = f"{obj.assigned_counsellor.first_name} {obj.assigned_counsellor.last_name}".strip()
            return name or obj.assigned_counsellor.username
        return None

    def get_patient_name(self, obj):
        """Return patient full name."""
        if obj.patient:
            return f"{obj.patient.first_name} {obj.patient.last_name}"
        return None

    def get_patient_mrn(self, obj):
        """Return patient MRN."""
        if obj.patient:
            return obj.patient.mrn
        return None

    def get_counselling_type_name(self, obj):
        """Return counselling type name."""
        if obj.counselling_type:
            return obj.counselling_type.name
        return None


class CounsellingReferralListSerializer(serializers.ModelSerializer):
    """Lightweight serializer for referral lists."""

    patient_name = serializers.SerializerMethodField()
    patient_mrn = serializers.SerializerMethodField()
    status_display = serializers.CharField(source="get_status_display", read_only=True)
    urgency_display = serializers.CharField(source="get_urgency_display", read_only=True)
    reason_display = serializers.CharField(source="get_reason_display", read_only=True)
    assigned_counsellor_name = serializers.SerializerMethodField()
    completion_percentage = serializers.FloatField(read_only=True)

    class Meta:
        model = CounsellingReferral
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
            "assigned_counsellor",
            "assigned_counsellor_name",
            "total_sessions",
            "sessions_completed",
            "completion_percentage",
            "is_sensitive",
            "created_at",
        ]

    def get_patient_name(self, obj):
        """Return patient full name."""
        if obj.patient:
            return f"{obj.patient.first_name} {obj.patient.last_name}"
        return None

    def get_patient_mrn(self, obj):
        """Return patient MRN."""
        if obj.patient:
            return obj.patient.mrn
        return None

    def get_assigned_counsellor_name(self, obj):
        """Return assigned counsellor full name."""
        if obj.assigned_counsellor:
            name = f"{obj.assigned_counsellor.first_name} {obj.assigned_counsellor.last_name}".strip()
            return name or obj.assigned_counsellor.username
        return None


class CounsellingReferralCreateSerializer(serializers.ModelSerializer):
    """Serializer for creating counselling referrals."""

    class Meta:
        model = CounsellingReferral
        fields = [
            "patient",
            "encounter",
            "counselling_type",
            "reason",
            "urgency",
            "clinical_summary",
            "presenting_issues",
            "goals",
            "risk_assessment",
            "total_sessions",
        ]

    def validate(self, data):
        """Validate referral creation."""
        patient = data.get("patient")
        counselling_type = data.get("counselling_type")

        # Validate age restrictions if counselling type has them
        if counselling_type and patient:
            patient_age = patient.age if hasattr(patient, "age") else None

            if patient_age is not None:
                if counselling_type.min_age and patient_age < counselling_type.min_age:
                    raise serializers.ValidationError(
                        {"counselling_type": f"Patient must be at least {counselling_type.min_age} years old"}
                    )
                if counselling_type.max_age and patient_age > counselling_type.max_age:
                    raise serializers.ValidationError(
                        {"counselling_type": f"Patient must be under {counselling_type.max_age} years old"}
                    )

            # Validate gender restrictions
            if counselling_type.gender_specific and patient.gender != counselling_type.gender_specific:
                raise serializers.ValidationError(
                    {"counselling_type": f"This counselling type is for {counselling_type.get_gender_specific_display()} patients only"}
                )

        return data


class CounsellingReferralUpdateStatusSerializer(serializers.Serializer):
    """Serializer for updating referral status."""

    status = serializers.ChoiceField(choices=CounsellingReferral.REFERRAL_STATUS)
    notes = serializers.CharField(required=False, allow_blank=True)


class CounsellingReferralAssignCounsellorSerializer(serializers.Serializer):
    """Serializer for assigning a counsellor to a referral."""

    from django.contrib.auth import get_user_model

    assigned_counsellor = serializers.PrimaryKeyRelatedField(
        queryset=get_user_model().objects.all()
    )


class CounsellingReferralGenerateSessionsSerializer(serializers.Serializer):
    """Serializer for generating sessions for a referral."""

    num_sessions = serializers.IntegerField(min_value=1, max_value=52, required=False)
    start_date = serializers.DateField(required=False)
    frequency_days = serializers.IntegerField(min_value=1, max_value=30, default=7)
