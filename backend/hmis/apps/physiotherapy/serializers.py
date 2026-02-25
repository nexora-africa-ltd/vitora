"""
Serializers for the physiotherapy module.

Provides REST API serialization for:
- PhysiotherapyTreatmentType (catalog)
- PhysiotherapyOrder (referrals)
- PhysiotherapySession (treatment sessions)
"""

from rest_framework import serializers

from hmis.apps.physiotherapy.models import (
    PhysiotherapyOrder,
    PhysiotherapySession,
    PhysiotherapyTreatmentType,
)


class PhysiotherapyTreatmentTypeSerializer(serializers.ModelSerializer):
    """Serializer for PhysiotherapyTreatmentType model."""

    category_display = serializers.CharField(source="get_category_display", read_only=True)

    class Meta:
        model = PhysiotherapyTreatmentType
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


class PhysiotherapyTreatmentTypeListSerializer(serializers.ModelSerializer):
    """Lightweight serializer for treatment type lists."""

    category_display = serializers.CharField(source="get_category_display", read_only=True)

    class Meta:
        model = PhysiotherapyTreatmentType
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


class PhysiotherapySessionSerializer(serializers.ModelSerializer):
    """Serializer for PhysiotherapySession model."""

    therapist_name = serializers.SerializerMethodField()
    status_display = serializers.CharField(source="get_status_display", read_only=True)
    outcome_display = serializers.CharField(source="get_outcome_display", read_only=True)
    pain_improvement = serializers.IntegerField(read_only=True)

    class Meta:
        model = PhysiotherapySession
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
            "pre_pain_score",
            "pre_assessment_notes",
            "patient_reported_changes",
            "interventions",
            "exercises_performed",
            "modalities_used",
            "patient_response",
            "post_pain_score",
            "outcome",
            "outcome_display",
            "progress_notes",
            "home_exercises",
            "home_exercise_instructions",
            "precautions_advised",
            "follow_up_recommendations",
            "next_session_goals",
            "clinic_visit",
            "is_billed",
            "pain_improvement",
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


class PhysiotherapySessionCreateSerializer(serializers.ModelSerializer):
    """Serializer for creating physiotherapy sessions."""

    class Meta:
        model = PhysiotherapySession
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

        # Check if max sessions reached
        current_sessions = order.sessions.count()
        if current_sessions >= order.total_sessions:
            raise serializers.ValidationError(
                {"order": f"Order already has maximum {order.total_sessions} sessions scheduled"}
            )

        return data


class PhysiotherapySessionCompleteSerializer(serializers.ModelSerializer):
    """Serializer for completing a physiotherapy session."""

    class Meta:
        model = PhysiotherapySession
        fields = [
            "actual_date",
            "duration_minutes",
            "pre_pain_score",
            "pre_assessment_notes",
            "patient_reported_changes",
            "interventions",
            "exercises_performed",
            "modalities_used",
            "patient_response",
            "post_pain_score",
            "outcome",
            "progress_notes",
            "home_exercises",
            "home_exercise_instructions",
            "precautions_advised",
            "follow_up_recommendations",
            "next_session_goals",
        ]

    def validate(self, data):
        """Validate session completion."""
        instance = self.instance
        if instance and instance.status == "COMPLETED":
            raise serializers.ValidationError("Session is already completed")
        return data


class PhysiotherapyOrderSerializer(serializers.ModelSerializer):
    """Serializer for PhysiotherapyOrder model."""

    patient_name = serializers.SerializerMethodField()
    patient_mrn = serializers.CharField(source="patient.mrn", read_only=True)
    treatment_type_name = serializers.CharField(source="treatment_type.name", read_only=True)
    treatment_type_code = serializers.CharField(source="treatment_type.code", read_only=True)
    ordered_by_name = serializers.SerializerMethodField()
    assigned_therapist_name = serializers.SerializerMethodField()
    status_display = serializers.CharField(source="get_status_display", read_only=True)
    priority_display = serializers.CharField(source="get_priority_display", read_only=True)
    referral_reason_display = serializers.CharField(
        source="get_referral_reason_display", read_only=True
    )
    sessions_remaining = serializers.IntegerField(read_only=True)
    progress_percentage = serializers.FloatField(read_only=True)
    sessions = PhysiotherapySessionSerializer(many=True, read_only=True)

    class Meta:
        model = PhysiotherapyOrder
        fields = [
            "id",
            "order_number",
            "patient",
            "patient_name",
            "patient_mrn",
            "encounter",
            "treatment_type",
            "treatment_type_name",
            "treatment_type_code",
            "ordered_by",
            "ordered_by_name",
            "assigned_therapist",
            "assigned_therapist_name",
            "referral_reason",
            "referral_reason_display",
            "clinical_indication",
            "relevant_history",
            "diagnosis",
            "precautions",
            "contraindications",
            "total_sessions",
            "sessions_completed",
            "frequency",
            "treatment_goals",
            "priority",
            "priority_display",
            "status",
            "status_display",
            "status_changed_at",
            "start_date",
            "expected_end_date",
            "clinic_visit",
            "total_cost",
            "is_paid",
            "invoice",
            "sessions_remaining",
            "progress_percentage",
            "sessions",
            "ordered_at",
            "completed_at",
        ]
        read_only_fields = [
            "id",
            "order_number",
            "ordered_by",
            "sessions_completed",
            "status_changed_at",
            "total_cost",
            "is_paid",
            "ordered_at",
            "completed_at",
        ]

    def get_patient_name(self, obj):
        """Return patient full name."""
        return f"{obj.patient.first_name} {obj.patient.last_name}"

    def get_ordered_by_name(self, obj):
        """Return ordering clinician name."""
        if obj.ordered_by:
            return f"{obj.ordered_by.first_name} {obj.ordered_by.last_name}".strip() or obj.ordered_by.username
        return None

    def get_assigned_therapist_name(self, obj):
        """Return assigned therapist name."""
        if obj.assigned_therapist:
            return f"{obj.assigned_therapist.first_name} {obj.assigned_therapist.last_name}".strip() or obj.assigned_therapist.username
        return None


class PhysiotherapyOrderCreateSerializer(serializers.ModelSerializer):
    """Serializer for creating physiotherapy orders."""

    class Meta:
        model = PhysiotherapyOrder
        fields = [
            "patient",
            "encounter",
            "treatment_type",
            "referral_reason",
            "clinical_indication",
            "relevant_history",
            "diagnosis",
            "precautions",
            "contraindications",
            "total_sessions",
            "frequency",
            "treatment_goals",
            "priority",
            "assigned_therapist",
            "start_date",
            "expected_end_date",
        ]

    def validate(self, data):
        """Validate order creation."""
        patient = data.get("patient")
        encounter = data.get("encounter")

        # Ensure encounter belongs to patient
        if encounter and encounter.patient_id != patient.id:
            raise serializers.ValidationError(
                {"encounter": "Encounter does not belong to specified patient"}
            )

        return data

    def create(self, validated_data):
        """Create order with ordered_by from request user."""
        validated_data["ordered_by"] = self.context["request"].user
        return super().create(validated_data)


class PhysiotherapyOrderListSerializer(serializers.ModelSerializer):
    """Lightweight serializer for order lists."""

    patient_name = serializers.SerializerMethodField()
    patient_mrn = serializers.CharField(source="patient.mrn", read_only=True)
    treatment_type_name = serializers.CharField(source="treatment_type.name", read_only=True)
    status_display = serializers.CharField(source="get_status_display", read_only=True)
    priority_display = serializers.CharField(source="get_priority_display", read_only=True)
    progress_percentage = serializers.FloatField(read_only=True)
    assigned_therapist_name = serializers.SerializerMethodField()

    class Meta:
        model = PhysiotherapyOrder
        fields = [
            "id",
            "order_number",
            "patient",
            "patient_name",
            "patient_mrn",
            "treatment_type_name",
            "status",
            "status_display",
            "priority",
            "priority_display",
            "total_sessions",
            "sessions_completed",
            "progress_percentage",
            "assigned_therapist_name",
            "ordered_at",
        ]

    def get_patient_name(self, obj):
        """Return patient full name."""
        return f"{obj.patient.first_name} {obj.patient.last_name}"

    def get_assigned_therapist_name(self, obj):
        """Return assigned therapist name."""
        if obj.assigned_therapist:
            return f"{obj.assigned_therapist.first_name} {obj.assigned_therapist.last_name}".strip() or obj.assigned_therapist.username
        return None


class PhysiotherapyOrderUpdateStatusSerializer(serializers.Serializer):
    """Serializer for updating order status."""

    status = serializers.ChoiceField(choices=PhysiotherapyOrder.ORDER_STATUS)
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


class PhysiotherapyOrderAssignTherapistSerializer(serializers.Serializer):
    """Serializer for assigning therapist to order."""

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        from django.contrib.auth import get_user_model

        User = get_user_model()
        self.fields["assigned_therapist"] = serializers.PrimaryKeyRelatedField(
            queryset=User.objects.filter(is_active=True),
            required=True,
        )
