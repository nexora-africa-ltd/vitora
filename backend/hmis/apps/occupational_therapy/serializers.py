"""
Serializers for the occupational therapy module.

Provides REST API serialization for:
- OTTreatmentType (catalog)
- OccupationalTherapyOrder (referrals)
- OTSession (treatment sessions)
"""

from rest_framework import serializers

from hmis.apps.occupational_therapy.models import (
    OccupationalTherapyOrder,
    OTSession,
    OTTreatmentType,
)


class OTTreatmentTypeSerializer(serializers.ModelSerializer):
    """Serializer for OTTreatmentType model."""

    category_display = serializers.CharField(source="get_category_display", read_only=True)

    class Meta:
        model = OTTreatmentType
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
            "requires_equipment",
            "equipment_needed",
            "contraindications",
            "precautions",
            "is_active",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]


class OTTreatmentTypeListSerializer(serializers.ModelSerializer):
    """Lightweight serializer for treatment type lists."""

    category_display = serializers.CharField(source="get_category_display", read_only=True)

    class Meta:
        model = OTTreatmentType
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


class OTSessionSerializer(serializers.ModelSerializer):
    """Serializer for OTSession model."""

    therapist_name = serializers.SerializerMethodField()
    status_display = serializers.CharField(source="get_status_display", read_only=True)
    outcome_display = serializers.CharField(source="get_outcome_display", read_only=True)
    pre_functional_status_display = serializers.CharField(
        source="get_pre_functional_status_display", read_only=True
    )
    post_functional_status_display = serializers.CharField(
        source="get_post_functional_status_display", read_only=True
    )
    patient_engagement_display = serializers.CharField(
        source="get_patient_engagement_display", read_only=True
    )
    functional_improvement = serializers.IntegerField(read_only=True)

    class Meta:
        model = OTSession
        fields = [
            "id",
            "order",
            "therapist",
            "therapist_name",
            "session_number",
            "scheduled_date",
            "scheduled_time",
            "actual_date",
            "duration_minutes",
            "status",
            "status_display",
            # Pre-session
            "pre_functional_status",
            "pre_functional_status_display",
            "pre_assessment_notes",
            "patient_reported_changes",
            "patient_goals_for_session",
            # Activities
            "activities_performed",
            "adl_activities",
            "cognitive_exercises",
            "sensory_activities",
            "fine_motor_exercises",
            "gross_motor_activities",
            "adaptive_equipment_training",
            "splint_orthotics",
            # Response
            "patient_response",
            "patient_engagement",
            "patient_engagement_display",
            # Post-session
            "post_functional_status",
            "post_functional_status_display",
            "outcome",
            "outcome_display",
            "progress_notes",
            "goals_addressed",
            "goals_progress",
            # Home program
            "home_activities",
            "home_activity_instructions",
            "caregiver_education",
            "environmental_recommendations",
            "precautions_advised",
            # Follow-up
            "follow_up_recommendations",
            "next_session_goals",
            "equipment_recommendations",
            "clinic_visit",
            "is_billed",
            "functional_improvement",
            "created_at",
            "updated_at",
            "completed_at",
        ]
        read_only_fields = [
            "id",
            "session_number",
            "is_billed",
            "created_at",
            "updated_at",
            "completed_at",
        ]

    def get_therapist_name(self, obj):
        """Return therapist full name."""
        if obj.therapist:
            return f"{obj.therapist.first_name} {obj.therapist.last_name}".strip() or obj.therapist.username
        return None


class OTSessionCreateSerializer(serializers.ModelSerializer):
    """Serializer for creating OT sessions."""

    class Meta:
        model = OTSession
        fields = [
            "order",
            "therapist",
            "scheduled_date",
            "scheduled_time",
        ]

    def validate(self, data):
        """Validate session creation."""
        order = data.get("order")

        # Check if order is in valid state for adding sessions
        if order.status not in ["APPROVED", "IN_PROGRESS"]:
            raise serializers.ValidationError(
                {"order": f"Cannot add sessions to order with status '{order.status}'"}
            )

        return data


class OTSessionCompleteSerializer(serializers.ModelSerializer):
    """Serializer for completing an OT session."""

    class Meta:
        model = OTSession
        fields = [
            "actual_date",
            "duration_minutes",
            "pre_functional_status",
            "pre_assessment_notes",
            "activities_performed",
            "adl_activities",
            "cognitive_exercises",
            "sensory_activities",
            "fine_motor_exercises",
            "gross_motor_activities",
            "adaptive_equipment_training",
            "patient_response",
            "patient_engagement",
            "post_functional_status",
            "outcome",
            "progress_notes",
            "goals_addressed",
            "goals_progress",
            "home_activities",
            "home_activity_instructions",
            "caregiver_education",
            "environmental_recommendations",
            "follow_up_recommendations",
            "next_session_goals",
            "equipment_recommendations",
        ]


class OccupationalTherapyOrderSerializer(serializers.ModelSerializer):
    """Full serializer for OccupationalTherapyOrder model."""

    patient_name = serializers.SerializerMethodField()
    patient_mrn = serializers.CharField(source="patient.mrn", read_only=True)
    ordered_by_name = serializers.SerializerMethodField()
    assigned_therapist_name = serializers.SerializerMethodField()
    treatment_type_name = serializers.CharField(source="treatment_type.name", read_only=True)
    status_display = serializers.CharField(source="get_status_display", read_only=True)
    priority_display = serializers.CharField(source="get_priority_display", read_only=True)
    assessment_type_display = serializers.CharField(source="get_assessment_type_display", read_only=True)
    referral_reason_display = serializers.CharField(source="get_referral_reason_display", read_only=True)
    sessions = OTSessionSerializer(many=True, read_only=True)
    sessions_remaining = serializers.IntegerField(read_only=True)
    progress_percentage = serializers.FloatField(read_only=True)

    class Meta:
        model = OccupationalTherapyOrder
        fields = [
            "id",
            "order_number",
            "patient",
            "patient_name",
            "patient_mrn",
            "encounter",
            "treatment_type",
            "treatment_type_name",
            "ordered_by",
            "ordered_by_name",
            "assigned_therapist",
            "assigned_therapist_name",
            # Clinical
            "assessment_type",
            "assessment_type_display",
            "referral_reason",
            "referral_reason_display",
            "clinical_indication",
            "relevant_history",
            "diagnosis",
            "precautions",
            "contraindications",
            # Goals
            "treatment_goals",
            "short_term_goals",
            "long_term_goals",
            "functional_limitations",
            # Treatment plan
            "total_sessions",
            "sessions_completed",
            "sessions_remaining",
            "progress_percentage",
            "frequency",
            # Status
            "priority",
            "priority_display",
            "status",
            "status_display",
            # Scheduling
            "start_date",
            "expected_end_date",
            "clinic_visit",
            # Billing
            "total_cost",
            "is_paid",
            "invoice",
            # Sessions
            "sessions",
            # Timestamps
            "ordered_at",
            "completed_at",
        ]
        read_only_fields = [
            "id",
            "order_number",
            "ordered_by",
            "sessions_completed",
            "total_cost",
            "ordered_at",
            "completed_at",
        ]

    def get_patient_name(self, obj):
        """Return patient full name."""
        return f"{obj.patient.first_name} {obj.patient.last_name}"

    def get_ordered_by_name(self, obj):
        """Return ordering clinician name."""
        user = obj.ordered_by
        return f"{user.first_name} {user.last_name}".strip() or user.username

    def get_assigned_therapist_name(self, obj):
        """Return assigned therapist name."""
        if obj.assigned_therapist:
            user = obj.assigned_therapist
            return f"{user.first_name} {user.last_name}".strip() or user.username
        return None


class OccupationalTherapyOrderListSerializer(serializers.ModelSerializer):
    """Lightweight serializer for order lists."""

    patient_name = serializers.SerializerMethodField()
    patient_mrn = serializers.CharField(source="patient.mrn", read_only=True)
    treatment_type_name = serializers.CharField(source="treatment_type.name", read_only=True)
    assigned_therapist_name = serializers.SerializerMethodField()
    status_display = serializers.CharField(source="get_status_display", read_only=True)
    priority_display = serializers.CharField(source="get_priority_display", read_only=True)
    assessment_type_display = serializers.CharField(source="get_assessment_type_display", read_only=True)
    progress_percentage = serializers.FloatField(read_only=True)

    class Meta:
        model = OccupationalTherapyOrder
        fields = [
            "id",
            "order_number",
            "patient",
            "patient_name",
            "patient_mrn",
            "treatment_type",
            "treatment_type_name",
            "assessment_type",
            "assessment_type_display",
            "assigned_therapist",
            "assigned_therapist_name",
            "status",
            "status_display",
            "priority",
            "priority_display",
            "total_sessions",
            "sessions_completed",
            "progress_percentage",
            "ordered_at",
        ]

    def get_patient_name(self, obj):
        """Return patient full name."""
        return f"{obj.patient.first_name} {obj.patient.last_name}"

    def get_assigned_therapist_name(self, obj):
        """Return assigned therapist name."""
        if obj.assigned_therapist:
            user = obj.assigned_therapist
            return f"{user.first_name} {user.last_name}".strip() or user.username
        return None


class OccupationalTherapyOrderCreateSerializer(serializers.ModelSerializer):
    """Serializer for creating OT orders."""

    class Meta:
        model = OccupationalTherapyOrder
        fields = [
            "patient",
            "encounter",
            "treatment_type",
            "assessment_type",
            "referral_reason",
            "clinical_indication",
            "relevant_history",
            "diagnosis",
            "precautions",
            "contraindications",
            "treatment_goals",
            "short_term_goals",
            "long_term_goals",
            "functional_limitations",
            "total_sessions",
            "frequency",
            "priority",
            "start_date",
            "expected_end_date",
        ]

    def validate(self, data):
        """Validate order creation."""
        # Ensure patient and encounter match
        patient = data.get("patient")
        encounter = data.get("encounter")

        if encounter and patient and encounter.patient_id != patient.id:
            raise serializers.ValidationError(
                {"encounter": "Encounter must belong to the specified patient"}
            )

        return data


class OccupationalTherapyOrderUpdateStatusSerializer(serializers.Serializer):
    """Serializer for updating order status."""

    status = serializers.ChoiceField(choices=OccupationalTherapyOrder.ORDER_STATUS)
    notes = serializers.CharField(required=False, allow_blank=True)

    def validate_status(self, value):
        """Validate status transition."""
        instance = self.instance
        if instance:
            valid_transitions = instance.STATUS_TRANSITIONS.get(instance.status, [])
            if value not in valid_transitions:
                raise serializers.ValidationError(
                    f"Cannot transition from '{instance.status}' to '{value}'. "
                    f"Valid transitions: {valid_transitions}"
                )
        return value


class OccupationalTherapyOrderAssignTherapistSerializer(serializers.Serializer):
    """Serializer for assigning therapist to order."""

    def __init__(self, *args, **kwargs):
        """Initialize serializer with User queryset."""
        super().__init__(*args, **kwargs)
        from django.contrib.auth import get_user_model

        User = get_user_model()
        self.fields["assigned_therapist"] = serializers.PrimaryKeyRelatedField(
            queryset=User.objects.filter(is_active=True),
            required=True,
        )
