"""
Serializers for the nutrition module.

Provides REST API serialization for:
- NutritionConsultation (assessments)
- DietPlan (meal plans)
"""

from rest_framework import serializers

from hmis.apps.nutrition.models import DietPlan, NutritionConsultation

# ============================================================================
# Nutrition Consultation Serializers
# ============================================================================


class NutritionConsultationSerializer(serializers.ModelSerializer):
    """Full serializer for NutritionConsultation model."""

    patient_name = serializers.SerializerMethodField()
    patient_mrn = serializers.CharField(source="patient.mrn", read_only=True)
    dietitian_name = serializers.SerializerMethodField()
    referred_by_name = serializers.SerializerMethodField()
    status_display = serializers.CharField(source="get_status_display", read_only=True)
    priority_display = serializers.CharField(source="get_priority_display", read_only=True)
    referral_reason_display = serializers.CharField(
        source="get_referral_reason_display", read_only=True
    )
    bmi_classification_display = serializers.CharField(
        source="get_bmi_classification_display", read_only=True
    )
    nutritional_status_display = serializers.CharField(
        source="get_nutritional_status_display", read_only=True
    )
    activity_level_display = serializers.CharField(
        source="get_activity_level_display", read_only=True
    )
    muac_classification = serializers.SerializerMethodField()
    age = serializers.SerializerMethodField()
    diet_plan_count = serializers.SerializerMethodField()

    class Meta:
        model = NutritionConsultation
        fields = [
            # Identity
            "id",
            "consultation_number",
            # Patient & Encounter
            "patient",
            "patient_name",
            "patient_mrn",
            "encounter",
            "clinic_visit",
            # Status
            "status",
            "status_display",
            "priority",
            "priority_display",
            # Referral
            "referral_reason",
            "referral_reason_display",
            "referral_notes",
            "diagnosis",
            # Anthropometrics
            "weight",
            "height",
            "bmi",
            "bmi_classification",
            "bmi_classification_display",
            "waist_circumference",
            "hip_circumference",
            "waist_hip_ratio",
            "mid_upper_arm_circumference",
            "triceps_skinfold",
            "ideal_body_weight",
            "percent_ideal_weight",
            "muac_classification",
            # Nutritional Assessment
            "nutritional_status",
            "nutritional_status_display",
            "activity_level",
            "activity_level_display",
            "dietary_history",
            "food_preferences",
            "food_allergies",
            "food_intolerances",
            "current_diet",
            "meals_per_day",
            "snacks_per_day",
            "fluid_intake",
            "alcohol_consumption",
            "supplement_use",
            # Caloric Needs
            "basal_metabolic_rate",
            "total_daily_energy_expenditure",
            "recommended_calories",
            "recommended_protein",
            "recommended_carbs",
            "recommended_fat",
            # Clinical Assessment
            "clinical_signs",
            "lab_results_summary",
            "medical_history",
            "medications",
            "gi_symptoms",
            "appetite_assessment",
            "chewing_swallowing",
            # Goals & Recommendations
            "nutrition_goals",
            "recommendations",
            "education_provided",
            "follow_up_plan",
            "follow_up_date",
            # Staff
            "dietitian",
            "dietitian_name",
            "referred_by",
            "referred_by_name",
            "age",
            "diet_plan_count",
            # SHA
            "sha_claimable",
            "sha_intervention_code",
            "invoice",
            # Timestamps
            "consultation_date",
            "created_at",
            "updated_at",
            "completed_at",
        ]
        read_only_fields = [
            "id",
            "consultation_number",
            "bmi",
            "bmi_classification",
            "waist_hip_ratio",
            "ideal_body_weight",
            "percent_ideal_weight",
            "basal_metabolic_rate",
            "total_daily_energy_expenditure",
            "created_at",
            "updated_at",
            "completed_at",
        ]

    def get_patient_name(self, obj):
        """Return patient full name."""
        return f"{obj.patient.first_name} {obj.patient.last_name}".strip()

    def get_dietitian_name(self, obj):
        """Return dietitian full name."""
        if obj.dietitian:
            name = f"{obj.dietitian.first_name} {obj.dietitian.last_name}".strip()
            return name or obj.dietitian.username
        return None

    def get_referred_by_name(self, obj):
        """Return referrer full name."""
        if obj.referred_by:
            name = f"{obj.referred_by.first_name} {obj.referred_by.last_name}".strip()
            return name or obj.referred_by.username
        return None

    def get_muac_classification(self, obj):
        """Return MUAC-based classification."""
        return obj.get_muac_classification()

    def get_age(self, obj):
        """Return patient age."""
        return obj._calculate_age()

    def get_diet_plan_count(self, obj):
        """Return count of associated diet plans."""
        return obj.diet_plans.count()


class NutritionConsultationListSerializer(serializers.ModelSerializer):
    """Lightweight serializer for consultation lists."""

    patient_name = serializers.SerializerMethodField()
    patient_mrn = serializers.CharField(source="patient.mrn", read_only=True)
    dietitian_name = serializers.SerializerMethodField()
    status_display = serializers.CharField(source="get_status_display", read_only=True)
    priority_display = serializers.CharField(source="get_priority_display", read_only=True)
    referral_reason_display = serializers.CharField(
        source="get_referral_reason_display", read_only=True
    )
    bmi_classification_display = serializers.CharField(
        source="get_bmi_classification_display", read_only=True
    )

    class Meta:
        model = NutritionConsultation
        fields = [
            "id",
            "consultation_number",
            "patient",
            "patient_name",
            "patient_mrn",
            "status",
            "status_display",
            "priority",
            "priority_display",
            "referral_reason",
            "referral_reason_display",
            "bmi",
            "bmi_classification",
            "bmi_classification_display",
            "nutritional_status",
            "dietitian",
            "dietitian_name",
            "consultation_date",
            "follow_up_date",
        ]

    def get_patient_name(self, obj):
        """Return patient full name."""
        return f"{obj.patient.first_name} {obj.patient.last_name}".strip()

    def get_dietitian_name(self, obj):
        """Return dietitian full name."""
        if obj.dietitian:
            name = f"{obj.dietitian.first_name} {obj.dietitian.last_name}".strip()
            return name or obj.dietitian.username
        return None


class NutritionConsultationCreateSerializer(serializers.ModelSerializer):
    """Serializer for creating nutrition consultations."""

    class Meta:
        model = NutritionConsultation
        fields = [
            "patient",
            "encounter",
            "clinic_visit",
            "priority",
            "referral_reason",
            "referral_notes",
            "diagnosis",
            "dietitian",
            # Anthropometrics (optional on create)
            "weight",
            "height",
            "waist_circumference",
            "hip_circumference",
            "mid_upper_arm_circumference",
            "triceps_skinfold",
            # Basic assessment
            "activity_level",
            "dietary_history",
            "food_allergies",
            "food_intolerances",
        ]

    def validate(self, data):
        """Validate consultation creation."""
        patient = data.get("patient")
        encounter = data.get("encounter")

        # Validate encounter belongs to patient
        if encounter and patient and encounter.patient_id != patient.id:
            raise serializers.ValidationError(
                {"encounter": "Encounter does not belong to this patient"}
            )

        return data


class NutritionConsultationUpdateStatusSerializer(serializers.Serializer):
    """Serializer for updating consultation status."""

    status = serializers.ChoiceField(choices=NutritionConsultation.CONSULTATION_STATUS)
    notes = serializers.CharField(required=False, allow_blank=True)

    def validate_status(self, value):
        """Validate status transition."""
        consultation = self.instance
        if not consultation.can_transition_to(value):
            raise serializers.ValidationError(
                f"Cannot transition from '{consultation.status}' to '{value}'"
            )
        return value


class NutritionConsultationAssignDietitianSerializer(serializers.Serializer):
    """Serializer for assigning a dietitian to a consultation."""

    dietitian = serializers.IntegerField(help_text="Dietitian user ID")

    def validate_dietitian(self, value):
        """Validate dietitian exists and is active."""
        from django.contrib.auth import get_user_model
        User = get_user_model()
        try:
            user = User.objects.get(pk=value, is_active=True)
            return user
        except User.DoesNotExist as err:
            raise serializers.ValidationError("Dietitian not found or inactive") from err


# ============================================================================
# Diet Plan Serializers
# ============================================================================


class DietPlanSerializer(serializers.ModelSerializer):
    """Full serializer for DietPlan model."""

    patient_name = serializers.SerializerMethodField()
    patient_mrn = serializers.CharField(source="patient.mrn", read_only=True)
    created_by_name = serializers.SerializerMethodField()
    updated_by_name = serializers.SerializerMethodField()
    status_display = serializers.CharField(source="get_status_display", read_only=True)
    plan_type_display = serializers.CharField(source="get_plan_type_display", read_only=True)
    duration_unit_display = serializers.CharField(
        source="get_duration_unit_display", read_only=True
    )
    is_active = serializers.BooleanField(read_only=True)
    days_remaining = serializers.IntegerField(read_only=True)
    consultation_number = serializers.CharField(
        source="consultation.consultation_number", read_only=True, allow_null=True
    )

    class Meta:
        model = DietPlan
        fields = [
            # Identity
            "id",
            "plan_number",
            # Links
            "patient",
            "patient_name",
            "patient_mrn",
            "consultation",
            "consultation_number",
            # Plan Details
            "name",
            "plan_type",
            "plan_type_display",
            "status",
            "status_display",
            "description",
            "goals",
            # Duration
            "start_date",
            "end_date",
            "duration_value",
            "duration_unit",
            "duration_unit_display",
            # Meal Plan
            "meal_plan",
            "breakfast_guidelines",
            "lunch_guidelines",
            "dinner_guidelines",
            "snack_guidelines",
            "sample_menu",
            "portion_guidelines",
            # Nutritional Targets
            "target_calories",
            "target_protein",
            "target_carbs",
            "target_fat",
            "target_fiber",
            "target_sodium",
            "target_fluid",
            # Restrictions
            "restrictions",
            "foods_to_avoid",
            "foods_to_limit",
            "foods_to_include",
            "allergen_restrictions",
            "texture_modifications",
            # Supplements
            "supplements",
            "oral_nutrition_supplements",
            "vitamin_supplements",
            "mineral_supplements",
            # Special Instructions
            "special_instructions",
            "food_preparation_notes",
            "timing_instructions",
            "hydration_instructions",
            # Monitoring
            "monitoring_parameters",
            "target_outcomes",
            "review_date",
            # Staff
            "created_by",
            "created_by_name",
            "updated_by",
            "updated_by_name",
            # Status helpers
            "is_active",
            "days_remaining",
            # Timestamps
            "created_at",
            "updated_at",
            "activated_at",
            "discontinued_at",
            "discontinuation_reason",
        ]
        read_only_fields = [
            "id",
            "plan_number",
            "is_active",
            "days_remaining",
            "created_at",
            "updated_at",
            "activated_at",
            "discontinued_at",
        ]

    def get_patient_name(self, obj):
        """Return patient full name."""
        return f"{obj.patient.first_name} {obj.patient.last_name}".strip()

    def get_created_by_name(self, obj):
        """Return creator full name."""
        if obj.created_by:
            name = f"{obj.created_by.first_name} {obj.created_by.last_name}".strip()
            return name or obj.created_by.username
        return None

    def get_updated_by_name(self, obj):
        """Return updater full name."""
        if obj.updated_by:
            name = f"{obj.updated_by.first_name} {obj.updated_by.last_name}".strip()
            return name or obj.updated_by.username
        return None


class DietPlanListSerializer(serializers.ModelSerializer):
    """Lightweight serializer for diet plan lists."""

    patient_name = serializers.SerializerMethodField()
    patient_mrn = serializers.CharField(source="patient.mrn", read_only=True)
    status_display = serializers.CharField(source="get_status_display", read_only=True)
    plan_type_display = serializers.CharField(source="get_plan_type_display", read_only=True)
    is_active = serializers.BooleanField(read_only=True)
    days_remaining = serializers.IntegerField(read_only=True)

    class Meta:
        model = DietPlan
        fields = [
            "id",
            "plan_number",
            "patient",
            "patient_name",
            "patient_mrn",
            "name",
            "plan_type",
            "plan_type_display",
            "status",
            "status_display",
            "start_date",
            "end_date",
            "is_active",
            "days_remaining",
            "review_date",
            "created_at",
        ]

    def get_patient_name(self, obj):
        """Return patient full name."""
        return f"{obj.patient.first_name} {obj.patient.last_name}".strip()


class DietPlanCreateSerializer(serializers.ModelSerializer):
    """Serializer for creating diet plans."""

    class Meta:
        model = DietPlan
        fields = [
            "patient",
            "consultation",
            "name",
            "plan_type",
            "description",
            "goals",
            "start_date",
            "end_date",
            "duration_value",
            "duration_unit",
            # Nutritional Targets
            "target_calories",
            "target_protein",
            "target_carbs",
            "target_fat",
            "target_fiber",
            "target_sodium",
            "target_fluid",
            # Meal Plan
            "meal_plan",
            "breakfast_guidelines",
            "lunch_guidelines",
            "dinner_guidelines",
            "snack_guidelines",
            # Restrictions
            "restrictions",
            "foods_to_avoid",
            "foods_to_limit",
            "foods_to_include",
            # Supplements
            "supplements",
        ]

    def validate(self, data):
        """Validate diet plan creation."""
        patient = data.get("patient")
        consultation = data.get("consultation")

        # Validate consultation belongs to patient
        if consultation and patient and consultation.patient_id != patient.id:
            raise serializers.ValidationError(
                {"consultation": "Consultation does not belong to this patient"}
            )

        # Validate dates
        start_date = data.get("start_date")
        end_date = data.get("end_date")
        if start_date and end_date and end_date < start_date:
            raise serializers.ValidationError(
                {"end_date": "End date cannot be before start date"}
            )

        return data


class DietPlanDiscontinueSerializer(serializers.Serializer):
    """Serializer for discontinuing a diet plan."""

    reason = serializers.CharField(
        required=True,
        min_length=10,
        help_text="Reason for discontinuation (minimum 10 characters)",
    )
