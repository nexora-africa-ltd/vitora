"""
Nutrition/Dietetics models for Vitora HMIS.

This module contains all nutrition-related models including:
- NutritionConsultation: Assessment, BMI calculation, recommendations
- DietPlan: Meal plans, restrictions, supplements

All models follow TDD approach and Kenya healthcare requirements.
DHA Compliance Phase 2 - Allied Health Modules.
"""

from datetime import date, datetime
from decimal import Decimal

from django.apps import apps
from django.conf import settings
from django.core.exceptions import ValidationError
from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import models
from django.utils import timezone
from simple_history.models import HistoricalRecords

from hmis.apps.core.history import HistoryMixin
from hmis.apps.core.mixins import FacilityScopedModel


def generate_nutrition_consultation_number():
    """
    Generate a unique Nutrition Consultation Number.

    Format: NUT-YYYYMMDD-XXXX
    Where XXXX is a 4-digit sequential number for the day.

    Returns:
        str: A unique nutrition consultation number string
    """
    today = datetime.now().strftime("%Y%m%d")
    prefix = f"NUT-{today}-"

    # Get the NutritionConsultation model via the app registry to avoid circular imports
    NutritionConsultation = apps.get_model("nutrition", "NutritionConsultation")

    # Find the highest consultation number for today
    latest_consultation = (
        NutritionConsultation.objects.filter(consultation_number__startswith=prefix)
        .order_by("-consultation_number")
        .first()
    )

    if latest_consultation:
        # Extract the sequence number and increment
        last_sequence = int(latest_consultation.consultation_number.split("-")[-1])
        sequence = last_sequence + 1
    else:
        # First consultation of the day
        sequence = 1

    return f"{prefix}{sequence:04d}"


def generate_diet_plan_number():
    """
    Generate a unique Diet Plan Number.

    Format: DIET-YYYYMMDD-XXXX
    Where XXXX is a 4-digit sequential number for the day.

    Returns:
        str: A unique diet plan number string
    """
    today = datetime.now().strftime("%Y%m%d")
    prefix = f"DIET-{today}-"

    # Get the DietPlan model via the app registry to avoid circular imports
    DietPlan = apps.get_model("nutrition", "DietPlan")

    # Find the highest plan number for today
    latest_plan = (
        DietPlan.objects.filter(plan_number__startswith=prefix).order_by("-plan_number").first()
    )

    if latest_plan:
        # Extract the sequence number and increment
        last_sequence = int(latest_plan.plan_number.split("-")[-1])
        sequence = last_sequence + 1
    else:
        # First plan of the day
        sequence = 1

    return f"{prefix}{sequence:04d}"


class NutritionConsultation(HistoryMixin, FacilityScopedModel):
    """
    Nutrition consultation/assessment model.

    Represents a nutrition assessment performed by a dietitian/nutritionist
    for a patient, tracking anthropometric measurements, dietary assessment,
    and recommendations.
    """

    CONSULTATION_STATUS = [
        ("DRAFT", "Draft"),
        ("PENDING", "Pending Review"),
        ("IN_PROGRESS", "In Progress"),
        ("COMPLETED", "Completed"),
        ("CANCELLED", "Cancelled"),
    ]

    PRIORITY_LEVELS = [
        ("ROUTINE", "Routine"),
        ("URGENT", "Urgent"),
        ("STAT", "STAT (Immediate)"),
    ]

    REFERRAL_REASONS = [
        ("WEIGHT_MANAGEMENT", "Weight Management"),
        ("DIABETES", "Diabetes Management"),
        ("CARDIOVASCULAR", "Cardiovascular Disease"),
        ("RENAL", "Renal Disease/CKD"),
        ("GI_DISORDERS", "GI Disorders"),
        ("EATING_DISORDER", "Eating Disorder"),
        ("MALNUTRITION", "Malnutrition (SAM/MAM)"),
        ("PREGNANCY", "Pregnancy/Prenatal"),
        ("PEDIATRIC", "Pediatric Nutrition"),
        ("ONCOLOGY", "Oncology Support"),
        ("FOOD_ALLERGY", "Food Allergy Management"),
        ("TUBE_FEEDING", "Tube Feeding/Enteral Nutrition"),
        ("TPN", "Total Parenteral Nutrition"),
        ("SPORTS", "Sports Nutrition"),
        ("GENERAL", "General Nutrition Counseling"),
        ("OTHER", "Other"),
    ]

    BMI_CLASSIFICATION = [
        ("UNDERWEIGHT_SEVERE", "Severe Underweight (<16.0)"),
        ("UNDERWEIGHT_MODERATE", "Moderate Underweight (16.0-16.9)"),
        ("UNDERWEIGHT_MILD", "Mild Underweight (17.0-18.4)"),
        ("NORMAL", "Normal Weight (18.5-24.9)"),
        ("OVERWEIGHT", "Overweight (25.0-29.9)"),
        ("OBESE_CLASS_I", "Obese Class I (30.0-34.9)"),
        ("OBESE_CLASS_II", "Obese Class II (35.0-39.9)"),
        ("OBESE_CLASS_III", "Obese Class III (≥40.0)"),
    ]

    NUTRITIONAL_STATUS = [
        ("WELL_NOURISHED", "Well Nourished"),
        ("MILD_MALNUTRITION", "Mild Malnutrition"),
        ("MODERATE_MALNUTRITION", "Moderate Malnutrition"),
        ("SEVERE_MALNUTRITION", "Severe Malnutrition"),
        ("OVERNUTRITION", "Over-nutrition"),
        ("AT_RISK", "At Nutritional Risk"),
    ]

    ACTIVITY_LEVELS = [
        ("SEDENTARY", "Sedentary (little/no exercise)"),
        ("LIGHT", "Light (1-3 days/week)"),
        ("MODERATE", "Moderate (3-5 days/week)"),
        ("ACTIVE", "Active (6-7 days/week)"),
        ("VERY_ACTIVE", "Very Active (intense exercise daily)"),
    ]

    # Valid status transitions
    STATUS_TRANSITIONS = {
        "DRAFT": ["PENDING", "IN_PROGRESS", "CANCELLED"],
        "PENDING": ["IN_PROGRESS", "CANCELLED"],
        "IN_PROGRESS": ["COMPLETED", "CANCELLED"],
        "COMPLETED": [],  # Terminal state
        "CANCELLED": [],  # Terminal state
    }

    # Identity
    consultation_number = models.CharField(
        max_length=20,
        unique=True,
        editable=False,
        help_text="Auto-generated consultation number",
    )

    # Patient & Encounter
    patient = models.ForeignKey(
        "patients.Patient",
        on_delete=models.PROTECT,
        related_name="nutrition_consultations",
    )
    encounter = models.ForeignKey(
        "encounters.Encounter",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="nutrition_consultations",
    )
    clinic_visit = models.ForeignKey(
        "clinics.ClinicVisit",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="nutrition_consultations",
    )

    # Status & Priority
    status = models.CharField(
        max_length=20,
        choices=CONSULTATION_STATUS,
        default="DRAFT",
    )
    priority = models.CharField(
        max_length=20,
        choices=PRIORITY_LEVELS,
        default="ROUTINE",
    )

    # Referral Information
    referral_reason = models.CharField(
        max_length=30,
        choices=REFERRAL_REASONS,
        default="GENERAL",
    )
    referral_notes = models.TextField(blank=True, help_text="Additional referral details")
    diagnosis = models.TextField(blank=True, help_text="Relevant diagnoses")

    # ==================== Anthropometric Measurements ====================
    # These can be pulled from the encounter or entered fresh
    weight = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        null=True,
        blank=True,
        validators=[MinValueValidator(Decimal("0.5")), MaxValueValidator(Decimal("500"))],
        help_text="Weight in kg",
    )
    height = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        null=True,
        blank=True,
        validators=[MinValueValidator(Decimal("20")), MaxValueValidator(Decimal("300"))],
        help_text="Height in cm",
    )
    bmi = models.DecimalField(
        max_digits=4,
        decimal_places=1,
        null=True,
        blank=True,
        editable=False,
        help_text="Calculated BMI (kg/m²)",
    )
    bmi_classification = models.CharField(
        max_length=30,
        choices=BMI_CLASSIFICATION,
        blank=True,
        editable=False,
    )

    # Additional anthropometrics
    waist_circumference = models.DecimalField(
        max_digits=5,
        decimal_places=1,
        null=True,
        blank=True,
        help_text="Waist circumference in cm",
    )
    hip_circumference = models.DecimalField(
        max_digits=5,
        decimal_places=1,
        null=True,
        blank=True,
        help_text="Hip circumference in cm",
    )
    waist_hip_ratio = models.DecimalField(
        max_digits=4,
        decimal_places=2,
        null=True,
        blank=True,
        editable=False,
        help_text="Calculated waist-to-hip ratio",
    )
    mid_upper_arm_circumference = models.DecimalField(
        max_digits=4,
        decimal_places=1,
        null=True,
        blank=True,
        validators=[MinValueValidator(Decimal("5")), MaxValueValidator(Decimal("60"))],
        help_text="MUAC in cm (important for malnutrition screening)",
    )
    triceps_skinfold = models.DecimalField(
        max_digits=4,
        decimal_places=1,
        null=True,
        blank=True,
        help_text="Triceps skinfold thickness in mm",
    )
    ideal_body_weight = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        null=True,
        blank=True,
        editable=False,
        help_text="Calculated ideal body weight in kg",
    )
    percent_ideal_weight = models.DecimalField(
        max_digits=5,
        decimal_places=1,
        null=True,
        blank=True,
        editable=False,
        help_text="Percentage of ideal body weight",
    )

    # ==================== Nutritional Assessment ====================
    nutritional_status = models.CharField(
        max_length=30,
        choices=NUTRITIONAL_STATUS,
        blank=True,
    )
    activity_level = models.CharField(
        max_length=20,
        choices=ACTIVITY_LEVELS,
        default="SEDENTARY",
    )

    # Dietary Assessment
    dietary_history = models.TextField(
        blank=True,
        help_text="Current dietary patterns and habits",
    )
    food_preferences = models.TextField(
        blank=True,
        help_text="Food preferences and cultural considerations",
    )
    food_allergies = models.TextField(
        blank=True,
        help_text="Known food allergies and intolerances",
    )
    food_intolerances = models.TextField(
        blank=True,
        help_text="Food intolerances (lactose, gluten, etc.)",
    )
    current_diet = models.TextField(
        blank=True,
        help_text="Description of current diet",
    )
    meals_per_day = models.PositiveIntegerField(
        null=True,
        blank=True,
        validators=[MinValueValidator(1), MaxValueValidator(10)],
        help_text="Number of meals per day",
    )
    snacks_per_day = models.PositiveIntegerField(
        null=True,
        blank=True,
        validators=[MinValueValidator(0), MaxValueValidator(10)],
        help_text="Number of snacks per day",
    )
    fluid_intake = models.CharField(
        max_length=100,
        blank=True,
        help_text="Estimated daily fluid intake",
    )
    alcohol_consumption = models.CharField(
        max_length=100,
        blank=True,
        help_text="Alcohol consumption patterns",
    )
    supplement_use = models.TextField(
        blank=True,
        help_text="Current supplements being taken",
    )

    # ==================== Caloric Needs ====================
    basal_metabolic_rate = models.DecimalField(
        max_digits=7,
        decimal_places=2,
        null=True,
        blank=True,
        editable=False,
        help_text="Calculated BMR in kcal/day",
    )
    total_daily_energy_expenditure = models.DecimalField(
        max_digits=7,
        decimal_places=2,
        null=True,
        blank=True,
        editable=False,
        help_text="Calculated TDEE in kcal/day",
    )
    recommended_calories = models.PositiveIntegerField(
        null=True,
        blank=True,
        help_text="Recommended daily caloric intake",
    )
    recommended_protein = models.DecimalField(
        max_digits=5,
        decimal_places=1,
        null=True,
        blank=True,
        help_text="Recommended daily protein in grams",
    )
    recommended_carbs = models.DecimalField(
        max_digits=5,
        decimal_places=1,
        null=True,
        blank=True,
        help_text="Recommended daily carbohydrates in grams",
    )
    recommended_fat = models.DecimalField(
        max_digits=5,
        decimal_places=1,
        null=True,
        blank=True,
        help_text="Recommended daily fat in grams",
    )

    # ==================== Clinical Assessment ====================
    clinical_signs = models.TextField(
        blank=True,
        help_text="Clinical signs of nutritional deficiencies",
    )
    lab_results_summary = models.TextField(
        blank=True,
        help_text="Relevant laboratory results (albumin, prealbumin, etc.)",
    )
    medical_history = models.TextField(
        blank=True,
        help_text="Relevant medical history",
    )
    medications = models.TextField(
        blank=True,
        help_text="Current medications that may affect nutrition",
    )
    gi_symptoms = models.TextField(
        blank=True,
        help_text="GI symptoms (nausea, vomiting, diarrhea, constipation)",
    )
    appetite_assessment = models.CharField(
        max_length=50,
        blank=True,
        help_text="Good, Fair, Poor, Very Poor",
    )
    chewing_swallowing = models.TextField(
        blank=True,
        help_text="Assessment of chewing/swallowing ability",
    )

    # ==================== Goals & Recommendations ====================
    nutrition_goals = models.TextField(
        blank=True,
        help_text="Nutrition intervention goals",
    )
    recommendations = models.TextField(
        blank=True,
        help_text="Detailed nutrition recommendations",
    )
    education_provided = models.TextField(
        blank=True,
        help_text="Education topics covered",
    )
    follow_up_plan = models.TextField(
        blank=True,
        help_text="Follow-up recommendations",
    )
    follow_up_date = models.DateField(
        null=True,
        blank=True,
        help_text="Recommended follow-up date",
    )

    # ==================== Staff & Timestamps ====================
    dietitian = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="nutrition_consultations_conducted",
        null=True,
        blank=True,
        help_text="Assigned dietitian/nutritionist",
    )
    referred_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="nutrition_referrals_made",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    consultation_date = models.DateTimeField(default=timezone.now)
    completed_at = models.DateTimeField(null=True, blank=True)

    # Invoice link for billing integration
    invoice = models.ForeignKey(
        "billing.Invoice",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="nutrition_consultations",
    )

    # SHA (Social Health Authority) claimability
    sha_claimable = models.BooleanField(default=True)
    sha_intervention_code = models.CharField(
        max_length=50,
        blank=True,
        help_text="SHA intervention code for claims",
    )

    # History tracking
    history = HistoricalRecords()

    class Meta:
        verbose_name = "Nutrition Consultation"
        verbose_name_plural = "Nutrition Consultations"
        ordering = ["-consultation_date"]
        indexes = [
            models.Index(fields=["consultation_number"]),
            models.Index(fields=["patient", "status"]),
            models.Index(fields=["dietitian", "status"]),
            models.Index(fields=["consultation_date"]),
        ]

    def __str__(self):
        return f"{self.consultation_number} - {self.patient}"

    def save(self, *args, **kwargs):
        from hmis.apps.core.mixins import resolve_tenant_from_related

        resolve_tenant_from_related(self)

        # Generate consultation number on creation
        if not self.consultation_number:
            self.consultation_number = generate_nutrition_consultation_number()

        # Calculate BMI if weight and height are available
        if self.weight and self.height:
            height_m = float(self.height) / 100
            self.bmi = round(float(self.weight) / (height_m**2), 1)
            self._update_bmi_classification()

        # Calculate waist-hip ratio
        if self.waist_circumference and self.hip_circumference:
            self.waist_hip_ratio = round(
                float(self.waist_circumference) / float(self.hip_circumference), 2
            )

        # Calculate ideal body weight (Devine formula)
        if self.height and self.patient:
            self._calculate_ideal_body_weight()

        # Calculate BMR and TDEE
        if self.weight and self.height and self.patient:
            self._calculate_energy_needs()

        # Set completed_at timestamp
        if self.status == "COMPLETED" and not self.completed_at:
            self.completed_at = timezone.now()

        super().save(*args, **kwargs)

    def _update_bmi_classification(self):
        """Update BMI classification based on calculated BMI."""
        if self.bmi is None:
            self.bmi_classification = ""
            return

        bmi = float(self.bmi)
        if bmi < 16.0:
            self.bmi_classification = "UNDERWEIGHT_SEVERE"
        elif bmi < 17.0:
            self.bmi_classification = "UNDERWEIGHT_MODERATE"
        elif bmi < 18.5:
            self.bmi_classification = "UNDERWEIGHT_MILD"
        elif bmi < 25.0:
            self.bmi_classification = "NORMAL"
        elif bmi < 30.0:
            self.bmi_classification = "OVERWEIGHT"
        elif bmi < 35.0:
            self.bmi_classification = "OBESE_CLASS_I"
        elif bmi < 40.0:
            self.bmi_classification = "OBESE_CLASS_II"
        else:
            self.bmi_classification = "OBESE_CLASS_III"

    def _calculate_ideal_body_weight(self):
        """Calculate ideal body weight using Devine formula."""
        if not self.height or not self.patient:
            return

        height_inches = float(self.height) / 2.54  # Convert cm to inches
        height_over_5ft = max(0, height_inches - 60)

        # Devine formula: different for male and female
        if self.patient.gender == "M":
            ibw = 50 + 2.3 * height_over_5ft
        else:
            ibw = 45.5 + 2.3 * height_over_5ft

        self.ideal_body_weight = round(Decimal(str(ibw)), 2)

        # Calculate percent of ideal body weight
        if self.weight and self.ideal_body_weight > 0:
            self.percent_ideal_weight = round(
                (float(self.weight) / float(self.ideal_body_weight)) * 100, 1
            )

    def _calculate_energy_needs(self):
        """Calculate BMR and TDEE using Mifflin-St Jeor equation."""
        if not self.weight or not self.height or not self.patient:
            return

        # Get patient age
        try:
            age = self._calculate_age()
            if not age:
                return
        except Exception:
            return

        weight = float(self.weight)
        height = float(self.height)

        # Mifflin-St Jeor equation
        if self.patient.gender == "M":
            bmr = (10 * weight) + (6.25 * height) - (5 * age) + 5
        else:
            bmr = (10 * weight) + (6.25 * height) - (5 * age) - 161

        self.basal_metabolic_rate = round(Decimal(str(bmr)), 2)

        # Calculate TDEE based on activity level
        activity_multipliers = {
            "SEDENTARY": 1.2,
            "LIGHT": 1.375,
            "MODERATE": 1.55,
            "ACTIVE": 1.725,
            "VERY_ACTIVE": 1.9,
        }
        multiplier = activity_multipliers.get(self.activity_level, 1.2)
        tdee = bmr * multiplier
        self.total_daily_energy_expenditure = round(Decimal(str(tdee)), 2)

    def _calculate_age(self):
        """Calculate patient age from date of birth."""
        if not self.patient or not self.patient.date_of_birth:
            return None
        today = date.today()
        dob = self.patient.date_of_birth
        age = today.year - dob.year
        if (today.month, today.day) < (dob.month, dob.day):
            age -= 1
        return age

    def can_transition_to(self, new_status: str) -> bool:
        """Check if status transition is valid."""
        allowed = self.STATUS_TRANSITIONS.get(self.status, [])
        return new_status in allowed

    def transition_status(self, new_status: str, user=None):  # noqa: ARG002
        """
        Transition consultation status with validation.

        Args:
            new_status: Target status
            user: User performing the transition (for audit logging)

        Raises:
            ValidationError: If transition is not allowed
        """
        if not self.can_transition_to(new_status):
            raise ValidationError(f"Cannot transition from '{self.status}' to '{new_status}'")
        self.status = new_status
        self.save()

    def sync_anthropometrics_from_encounter(self):
        """Pull anthropometric measurements from linked encounter."""
        if not self.encounter:
            return False

        updated = False
        if self.encounter.weight and not self.weight:
            self.weight = self.encounter.weight
            updated = True
        if self.encounter.height and not self.height:
            self.height = self.encounter.height
            updated = True

        if updated:
            self.save()
        return updated

    def get_muac_classification(self) -> str | None:
        """
        Get MUAC-based malnutrition classification.

        WHO guidelines for adults:
        - Normal: > 23.0 cm
        - Mild malnutrition: 22.0-23.0 cm
        - Moderate malnutrition: 19.0-21.9 cm
        - Severe malnutrition: < 19.0 cm
        """
        if not self.mid_upper_arm_circumference:
            return None

        muac = float(self.mid_upper_arm_circumference)
        if muac < 19.0:
            return "SEVERE_MALNUTRITION"
        elif muac < 22.0:
            return "MODERATE_MALNUTRITION"
        elif muac < 23.0:
            return "MILD_MALNUTRITION"
        else:
            return "WELL_NOURISHED"


class DietPlan(HistoryMixin, models.Model):
    """
    Diet plan model for nutrition interventions.

    Represents a meal plan created by a dietitian for a patient,
    including dietary restrictions, supplements, and follow-up.
    """

    PLAN_STATUS = [
        ("DRAFT", "Draft"),
        ("ACTIVE", "Active"),
        ("ON_HOLD", "On Hold"),
        ("COMPLETED", "Completed"),
        ("DISCONTINUED", "Discontinued"),
    ]

    PLAN_TYPE = [
        ("THERAPEUTIC", "Therapeutic Diet"),
        ("WEIGHT_LOSS", "Weight Loss"),
        ("WEIGHT_GAIN", "Weight Gain"),
        ("DIABETIC", "Diabetic Diet"),
        ("RENAL", "Renal Diet"),
        ("CARDIAC", "Cardiac/Heart Healthy"),
        ("LOW_SODIUM", "Low Sodium"),
        ("LOW_FAT", "Low Fat"),
        ("HIGH_PROTEIN", "High Protein"),
        ("HIGH_FIBER", "High Fiber"),
        ("GLUTEN_FREE", "Gluten-Free"),
        ("LACTOSE_FREE", "Lactose-Free"),
        ("ENTERAL", "Enteral Nutrition"),
        ("PARENTERAL", "Parenteral Nutrition"),
        ("PREGNANCY", "Pregnancy/Prenatal"),
        ("PEDIATRIC", "Pediatric"),
        ("GERIATRIC", "Geriatric"),
        ("VEGETARIAN", "Vegetarian"),
        ("VEGAN", "Vegan"),
        ("GENERAL_HEALTHY", "General Healthy Eating"),
        ("OTHER", "Other"),
    ]

    DURATION_UNITS = [
        ("DAYS", "Days"),
        ("WEEKS", "Weeks"),
        ("MONTHS", "Months"),
        ("INDEFINITE", "Indefinite"),
    ]

    # Identity
    plan_number = models.CharField(
        max_length=20,
        unique=True,
        editable=False,
        help_text="Auto-generated diet plan number",
    )

    # Links
    patient = models.ForeignKey(
        "patients.Patient",
        on_delete=models.PROTECT,
        related_name="diet_plans",
    )
    consultation = models.ForeignKey(
        NutritionConsultation,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="diet_plans",
    )

    # Plan Details
    name = models.CharField(
        max_length=200,
        help_text="Name/title of the diet plan",
    )
    plan_type = models.CharField(
        max_length=30,
        choices=PLAN_TYPE,
        default="GENERAL_HEALTHY",
    )
    status = models.CharField(
        max_length=20,
        choices=PLAN_STATUS,
        default="DRAFT",
    )
    description = models.TextField(
        blank=True,
        help_text="Overview of the diet plan",
    )
    goals = models.TextField(
        blank=True,
        help_text="Goals of this diet plan",
    )

    # Duration
    start_date = models.DateField(default=date.today)
    end_date = models.DateField(null=True, blank=True)
    duration_value = models.PositiveIntegerField(
        null=True,
        blank=True,
        help_text="Duration number",
    )
    duration_unit = models.CharField(
        max_length=20,
        choices=DURATION_UNITS,
        default="WEEKS",
    )

    # ==================== Meal Plan ====================
    meal_plan = models.TextField(
        blank=True,
        help_text="Detailed meal plan description",
    )
    breakfast_guidelines = models.TextField(
        blank=True,
        help_text="Breakfast recommendations",
    )
    lunch_guidelines = models.TextField(
        blank=True,
        help_text="Lunch recommendations",
    )
    dinner_guidelines = models.TextField(
        blank=True,
        help_text="Dinner recommendations",
    )
    snack_guidelines = models.TextField(
        blank=True,
        help_text="Snack recommendations",
    )
    sample_menu = models.TextField(
        blank=True,
        help_text="Sample daily menu",
    )
    portion_guidelines = models.TextField(
        blank=True,
        help_text="Portion size guidelines",
    )

    # ==================== Nutritional Targets ====================
    target_calories = models.PositiveIntegerField(
        null=True,
        blank=True,
        help_text="Daily caloric target",
    )
    target_protein = models.DecimalField(
        max_digits=5,
        decimal_places=1,
        null=True,
        blank=True,
        help_text="Daily protein target in grams",
    )
    target_carbs = models.DecimalField(
        max_digits=5,
        decimal_places=1,
        null=True,
        blank=True,
        help_text="Daily carbohydrate target in grams",
    )
    target_fat = models.DecimalField(
        max_digits=5,
        decimal_places=1,
        null=True,
        blank=True,
        help_text="Daily fat target in grams",
    )
    target_fiber = models.DecimalField(
        max_digits=5,
        decimal_places=1,
        null=True,
        blank=True,
        help_text="Daily fiber target in grams",
    )
    target_sodium = models.PositiveIntegerField(
        null=True,
        blank=True,
        help_text="Daily sodium limit in mg",
    )
    target_fluid = models.PositiveIntegerField(
        null=True,
        blank=True,
        help_text="Daily fluid target in ml",
    )

    # ==================== Restrictions ====================
    restrictions = models.TextField(
        blank=True,
        help_text="General dietary restrictions",
    )
    foods_to_avoid = models.TextField(
        blank=True,
        help_text="Specific foods to avoid",
    )
    foods_to_limit = models.TextField(
        blank=True,
        help_text="Foods to limit/moderate",
    )
    foods_to_include = models.TextField(
        blank=True,
        help_text="Foods to include/encourage",
    )
    allergen_restrictions = models.TextField(
        blank=True,
        help_text="Allergen-specific restrictions",
    )
    texture_modifications = models.CharField(
        max_length=100,
        blank=True,
        help_text="Texture modifications (pureed, soft, etc.)",
    )

    # ==================== Supplements ====================
    supplements = models.TextField(
        blank=True,
        help_text="Recommended supplements",
    )
    oral_nutrition_supplements = models.TextField(
        blank=True,
        help_text="ONS recommendations (e.g., Ensure, Glucerna)",
    )
    vitamin_supplements = models.TextField(
        blank=True,
        help_text="Vitamin supplementation",
    )
    mineral_supplements = models.TextField(
        blank=True,
        help_text="Mineral supplementation",
    )

    # ==================== Special Instructions ====================
    special_instructions = models.TextField(
        blank=True,
        help_text="Additional special instructions",
    )
    food_preparation_notes = models.TextField(
        blank=True,
        help_text="Notes on food preparation",
    )
    timing_instructions = models.TextField(
        blank=True,
        help_text="Meal timing instructions",
    )
    hydration_instructions = models.TextField(
        blank=True,
        help_text="Hydration guidance",
    )

    # ==================== Monitoring ====================
    monitoring_parameters = models.TextField(
        blank=True,
        help_text="Parameters to monitor (weight, labs, etc.)",
    )
    target_outcomes = models.TextField(
        blank=True,
        help_text="Expected outcomes/targets",
    )
    review_date = models.DateField(
        null=True,
        blank=True,
        help_text="Next review date",
    )

    # ==================== Staff & Timestamps ====================
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="diet_plans_created",
    )
    updated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="diet_plans_updated",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    activated_at = models.DateTimeField(null=True, blank=True)
    discontinued_at = models.DateTimeField(null=True, blank=True)
    discontinuation_reason = models.TextField(blank=True)

    # History tracking
    history = HistoricalRecords()

    class Meta:
        verbose_name = "Diet Plan"
        verbose_name_plural = "Diet Plans"
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["plan_number"]),
            models.Index(fields=["patient", "status"]),
            models.Index(fields=["start_date", "end_date"]),
        ]

    def __str__(self):
        return f"{self.plan_number} - {self.name}"

    def save(self, *args, **kwargs):
        # Generate plan number on creation
        if not self.plan_number:
            self.plan_number = generate_diet_plan_number()

        # Set activated_at timestamp
        if self.status == "ACTIVE" and not self.activated_at:
            self.activated_at = timezone.now()

        # Set discontinued_at timestamp
        if self.status == "DISCONTINUED" and not self.discontinued_at:
            self.discontinued_at = timezone.now()

        super().save(*args, **kwargs)

    @property
    def is_active(self) -> bool:
        """Check if diet plan is currently active."""
        if self.status != "ACTIVE":
            return False
        today = date.today()
        if self.end_date and today > self.end_date:
            return False
        return today >= self.start_date

    @property
    def days_remaining(self) -> int | None:
        """Calculate days remaining in the diet plan."""
        if not self.end_date:
            return None
        today = date.today()
        if today > self.end_date:
            return 0
        return (self.end_date - today).days

    def activate(self, user=None):
        """Activate the diet plan."""
        if self.status not in ["DRAFT", "ON_HOLD"]:
            raise ValidationError(f"Cannot activate diet plan with status '{self.status}'")
        self.status = "ACTIVE"
        self.activated_at = timezone.now()
        if user:
            self.updated_by = user
        self.save()

    def discontinue(self, reason: str, user=None):
        """Discontinue the diet plan."""
        if self.status in ["COMPLETED", "DISCONTINUED"]:
            raise ValidationError(f"Cannot discontinue diet plan with status '{self.status}'")
        self.status = "DISCONTINUED"
        self.discontinued_at = timezone.now()
        self.discontinuation_reason = reason
        if user:
            self.updated_by = user
        self.save()
