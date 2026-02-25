"""
Django admin configuration for the nutrition module.
"""

from django.contrib import admin

from hmis.apps.nutrition.models import DietPlan, NutritionConsultation


class DietPlanInline(admin.TabularInline):
    """Inline admin for diet plans within a consultation."""

    model = DietPlan
    extra = 0
    readonly_fields = ["plan_number", "created_at", "activated_at"]
    fields = [
        "plan_number",
        "name",
        "plan_type",
        "status",
        "start_date",
        "end_date",
    ]


@admin.register(NutritionConsultation)
class NutritionConsultationAdmin(admin.ModelAdmin):
    """Admin configuration for NutritionConsultation."""

    list_display = [
        "consultation_number",
        "patient",
        "status",
        "priority",
        "referral_reason",
        "bmi",
        "bmi_classification",
        "nutritional_status",
        "dietitian",
        "consultation_date",
    ]
    list_filter = [
        "status",
        "priority",
        "referral_reason",
        "nutritional_status",
        "bmi_classification",
        "dietitian",
    ]
    search_fields = [
        "consultation_number",
        "patient__first_name",
        "patient__last_name",
        "patient__mrn",
        "diagnosis",
    ]
    readonly_fields = [
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
    raw_id_fields = ["patient", "encounter", "dietitian", "referred_by", "clinic_visit"]
    inlines = [DietPlanInline]
    ordering = ["-consultation_date"]

    fieldsets = (
        (
            "Consultation Information",
            {
                "fields": (
                    "consultation_number",
                    "patient",
                    "encounter",
                    "clinic_visit",
                    "status",
                    "priority",
                )
            },
        ),
        (
            "Referral Details",
            {
                "fields": (
                    "referral_reason",
                    "referral_notes",
                    "diagnosis",
                    "referred_by",
                    "dietitian",
                )
            },
        ),
        (
            "Anthropometric Measurements",
            {
                "fields": (
                    "weight",
                    "height",
                    "bmi",
                    "bmi_classification",
                    "waist_circumference",
                    "hip_circumference",
                    "waist_hip_ratio",
                    "mid_upper_arm_circumference",
                    "triceps_skinfold",
                    "ideal_body_weight",
                    "percent_ideal_weight",
                )
            },
        ),
        (
            "Nutritional Assessment",
            {
                "fields": (
                    "nutritional_status",
                    "activity_level",
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
                ),
                "classes": ["collapse"],
            },
        ),
        (
            "Caloric Needs",
            {
                "fields": (
                    "basal_metabolic_rate",
                    "total_daily_energy_expenditure",
                    "recommended_calories",
                    "recommended_protein",
                    "recommended_carbs",
                    "recommended_fat",
                )
            },
        ),
        (
            "Clinical Assessment",
            {
                "fields": (
                    "clinical_signs",
                    "lab_results_summary",
                    "medical_history",
                    "medications",
                    "gi_symptoms",
                    "appetite_assessment",
                    "chewing_swallowing",
                ),
                "classes": ["collapse"],
            },
        ),
        (
            "Goals & Recommendations",
            {
                "fields": (
                    "nutrition_goals",
                    "recommendations",
                    "education_provided",
                    "follow_up_plan",
                    "follow_up_date",
                )
            },
        ),
        (
            "SHA & Billing",
            {
                "fields": (
                    "sha_claimable",
                    "sha_intervention_code",
                    "invoice",
                )
            },
        ),
        (
            "Timestamps",
            {
                "fields": (
                    "consultation_date",
                    "created_at",
                    "updated_at",
                    "completed_at",
                )
            },
        ),
    )


@admin.register(DietPlan)
class DietPlanAdmin(admin.ModelAdmin):
    """Admin configuration for DietPlan."""

    list_display = [
        "plan_number",
        "name",
        "patient",
        "plan_type",
        "status",
        "start_date",
        "end_date",
        "target_calories",
        "created_by",
        "created_at",
    ]
    list_filter = [
        "status",
        "plan_type",
        "duration_unit",
        "created_by",
    ]
    search_fields = [
        "plan_number",
        "name",
        "patient__first_name",
        "patient__last_name",
        "patient__mrn",
        "description",
    ]
    readonly_fields = [
        "plan_number",
        "created_at",
        "updated_at",
        "activated_at",
        "discontinued_at",
    ]
    raw_id_fields = ["patient", "consultation", "created_by", "updated_by"]
    ordering = ["-created_at"]

    fieldsets = (
        (
            "Plan Information",
            {
                "fields": (
                    "plan_number",
                    "patient",
                    "consultation",
                    "name",
                    "plan_type",
                    "status",
                    "description",
                    "goals",
                )
            },
        ),
        (
            "Duration",
            {
                "fields": (
                    "start_date",
                    "end_date",
                    "duration_value",
                    "duration_unit",
                )
            },
        ),
        (
            "Meal Plan",
            {
                "fields": (
                    "meal_plan",
                    "breakfast_guidelines",
                    "lunch_guidelines",
                    "dinner_guidelines",
                    "snack_guidelines",
                    "sample_menu",
                    "portion_guidelines",
                ),
                "classes": ["collapse"],
            },
        ),
        (
            "Nutritional Targets",
            {
                "fields": (
                    "target_calories",
                    "target_protein",
                    "target_carbs",
                    "target_fat",
                    "target_fiber",
                    "target_sodium",
                    "target_fluid",
                )
            },
        ),
        (
            "Restrictions",
            {
                "fields": (
                    "restrictions",
                    "foods_to_avoid",
                    "foods_to_limit",
                    "foods_to_include",
                    "allergen_restrictions",
                    "texture_modifications",
                ),
                "classes": ["collapse"],
            },
        ),
        (
            "Supplements",
            {
                "fields": (
                    "supplements",
                    "oral_nutrition_supplements",
                    "vitamin_supplements",
                    "mineral_supplements",
                ),
                "classes": ["collapse"],
            },
        ),
        (
            "Special Instructions",
            {
                "fields": (
                    "special_instructions",
                    "food_preparation_notes",
                    "timing_instructions",
                    "hydration_instructions",
                ),
                "classes": ["collapse"],
            },
        ),
        (
            "Monitoring",
            {
                "fields": (
                    "monitoring_parameters",
                    "target_outcomes",
                    "review_date",
                )
            },
        ),
        (
            "Staff & Timestamps",
            {
                "fields": (
                    "created_by",
                    "updated_by",
                    "created_at",
                    "updated_at",
                    "activated_at",
                    "discontinued_at",
                    "discontinuation_reason",
                )
            },
        ),
    )
