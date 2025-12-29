"""
Encounter model for Vitora HMIS.

This module defines the Encounter model and related functionality,
including ICD-10 diagnosis codes and treatment plans.

Sprint 1.1-1.2: Enhanced encounter management with diagnosis and treatment tracking.
"""

import re
from datetime import date

from django.core.exceptions import ValidationError
from django.core.validators import RegexValidator
from django.db import models


# ICD-10 code format validator
icd10_code_validator = RegexValidator(
    regex=r"^[A-Z]\d{2}(\.\d{1,2})?$",
    message="ICD-10 code must be in format: Letter + 2 digits (e.g., A09) "
    "or Letter + 2 digits + decimal + 1-2 digits (e.g., J18.9)",
)


class ICD10Code(models.Model):
    """
    ICD-10 diagnosis code reference model.

    International Classification of Diseases, 10th Revision codes
    used for standardized diagnosis coding.

    Attributes:
        code: ICD-10 code (e.g., A09, J18.9)
        description: Full description of the diagnosis
        category: Disease category
        chapter: ICD-10 chapter number (1-22)
    """

    code = models.CharField(
        max_length=10,
        unique=True,
        validators=[icd10_code_validator],
        help_text="ICD-10 code (e.g., A09, J18.9)",
    )
    description = models.CharField(
        max_length=500,
        help_text="Full description of the diagnosis",
    )
    category = models.CharField(
        max_length=200,
        help_text="Disease category (e.g., Certain infectious and parasitic diseases)",
    )
    chapter = models.IntegerField(
        help_text="ICD-10 chapter number (1-22)",
    )
    is_active = models.BooleanField(
        default=True,
        help_text="Whether this code is currently active/valid",
    )

    class Meta:
        ordering = ["code"]
        verbose_name = "ICD-10 Code"
        verbose_name_plural = "ICD-10 Codes"
        indexes = [
            models.Index(fields=["code"]),
            models.Index(fields=["chapter"]),
        ]

    def __str__(self) -> str:
        return f"{self.code} - {self.description}"

    def clean(self):
        """Validate ICD-10 code format."""
        super().clean()
        if self.code:
            # Uppercase the code
            self.code = self.code.upper()
            # Validate format
            if not re.match(r"^[A-Z]\d{2}(\.\d{1,2})?$", self.code):
                raise ValidationError(
                    {
                        "code": "ICD-10 code must be in format: Letter + 2 digits (e.g., A09) "
                        "or Letter + 2 digits + decimal + 1-2 digits (e.g., J18.9)"
                    }
                )


class Encounter(models.Model):
    """
    Encounter model representing a patient encounter/visit.

    Attributes:
        patient: Foreign key to Patient model
        encounter_type: Type of encounter (OPD/IPD/EMERGENCY)
        encounter_date: Date of the encounter
        chief_complaint: Patient's main complaint
        temperature: Body temperature in Celsius
        pulse: Pulse rate (beats per minute)
        blood_pressure: Blood pressure (systolic/diastolic format)
        respiratory_rate: Respiratory rate (breaths per minute)
        weight: Patient weight in kg
        height: Patient height in cm
        notes: Additional clinical notes
        created_at: Timestamp when the record was created
        updated_at: Timestamp when the record was last updated
    """

    ENCOUNTER_TYPE_CHOICES = [
        ("OPD", "Outpatient Department"),
        ("IPD", "Inpatient Department"),
        ("EMERGENCY", "Emergency"),
    ]

    # Required fields
    patient = models.ForeignKey(
        "patients.Patient",
        on_delete=models.CASCADE,
        related_name="encounters",
        help_text="Patient associated with this encounter",
    )
    encounter_type = models.CharField(
        max_length=20, choices=ENCOUNTER_TYPE_CHOICES, help_text="Type of encounter"
    )
    encounter_date = models.DateField(default=date.today, help_text="Date of the encounter")
    chief_complaint = models.TextField(help_text="Patient's chief complaint")

    # Vital signs (optional)
    temperature = models.DecimalField(
        max_digits=4,
        decimal_places=1,
        null=True,
        blank=True,
        help_text="Body temperature in Celsius",
    )
    pulse = models.IntegerField(null=True, blank=True, help_text="Pulse rate (beats per minute)")
    blood_pressure = models.CharField(
        max_length=20,
        blank=True,
        default="",
        help_text="Blood pressure (e.g., 120/80)",
    )
    respiratory_rate = models.IntegerField(
        null=True, blank=True, help_text="Respiratory rate (breaths per minute)"
    )
    weight = models.DecimalField(
        max_digits=5,
        decimal_places=1,
        null=True,
        blank=True,
        help_text="Patient weight in kg",
    )
    height = models.DecimalField(
        max_digits=5,
        decimal_places=1,
        null=True,
        blank=True,
        help_text="Patient height in cm",
    )
    spo2 = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        null=True,
        blank=True,
        help_text="Oxygen saturation percentage (SpO2)",
    )

    # Medical History Section
    allergies = models.TextField(
        blank=True,
        default="",
        help_text="Known allergies (medications, food, environmental)",
    )
    chronic_conditions = models.TextField(
        blank=True,
        default="",
        help_text="Chronic conditions (e.g., Diabetes, Hypertension, Asthma)",
    )
    current_medications = models.TextField(
        blank=True,
        default="",
        help_text="Current medications with dosage",
    )
    past_surgeries = models.TextField(
        blank=True,
        default="",
        help_text="Past surgical procedures with dates",
    )
    family_history = models.TextField(
        blank=True,
        default="",
        help_text="Relevant family medical history",
    )
    social_history = models.TextField(
        blank=True,
        default="",
        help_text="Social history (smoking, alcohol, occupation, lifestyle)",
    )

    # Clinical notes
    notes = models.TextField(blank=True, default="", help_text="Additional clinical notes")

    # Timestamps
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        """Meta options for Encounter model."""

        ordering = ["-encounter_date", "-created_at"]
        indexes = [
            models.Index(fields=["patient", "-encounter_date"]),
            models.Index(fields=["encounter_type"]),
            models.Index(fields=["encounter_date"]),
        ]
        verbose_name = "Encounter"
        verbose_name_plural = "Encounters"

    def __str__(self) -> str:
        """String representation of the encounter."""
        return f"{self.patient.mrn} - {self.encounter_type} - {self.encounter_date}"

    def clean(self):
        """Validate the model fields."""
        super().clean()

        # Validate temperature range (35-45°C)
        if self.temperature is not None and (self.temperature < 35.0 or self.temperature > 45.0):
            raise ValidationError({"temperature": "Temperature must be between 35°C and 45°C."})

        # Validate pulse range (30-200 bpm)
        if self.pulse is not None and (self.pulse < 30 or self.pulse > 200):
            raise ValidationError({"pulse": "Pulse must be between 30 and 200 beats per minute."})

        # Validate blood pressure format
        if self.blood_pressure:
            bp_pattern = r"^\d{2,3}/\d{2,3}$"
            if not re.match(bp_pattern, self.blood_pressure):
                raise ValidationError(
                    {
                        "blood_pressure": "Blood pressure must be in format 'systolic/diastolic' (e.g., 120/80)."
                    }
                )

        # Validate respiratory rate (8-40 breaths/min)
        if self.respiratory_rate is not None and (
            self.respiratory_rate < 8 or self.respiratory_rate > 40
        ):
            raise ValidationError(
                {
                    "respiratory_rate": "Respiratory rate must be between 8 and 40 breaths per minute."
                }
            )

        # Validate weight (positive value, reasonable range 0.5-300 kg)
        if self.weight is not None and (self.weight <= 0 or self.weight > 300):
            raise ValidationError({"weight": "Weight must be between 0.5 and 300 kg."})

        # Validate height (positive value, reasonable range 20-250 cm)
        if self.height is not None and (self.height <= 0 or self.height > 250):
            raise ValidationError({"height": "Height must be between 20 and 250 cm."})

        # Validate SpO2 (0-100%)
        if self.spo2 is not None and (self.spo2 < 0 or self.spo2 > 100):
            raise ValidationError({"spo2": "SpO2 must be between 0 and 100%."})

    def has_critical_vitals(self) -> bool:
        """
        Check if any vital signs are in critical ranges.

        Returns:
            bool: True if any vital signs are critical
        """
        # Critical temperature: < 36°C or > 39°C
        if self.temperature is not None and (self.temperature < 36.0 or self.temperature > 39.0):
            return True

        # Critical pulse: < 50 or > 120 bpm
        if self.pulse is not None and (self.pulse < 50 or self.pulse > 120):
            return True

        # Critical respiratory rate: < 12 or > 25 breaths/min
        if self.respiratory_rate is not None and (
            self.respiratory_rate < 12 or self.respiratory_rate > 25
        ):
            return True

        # Critical SpO2: < 95% (hypoxemia)
        if self.spo2 is not None and self.spo2 < 95:
            return True

        # Critical blood pressure: Hypertensive crisis (>=180/120) or Hypotension (<90/60)
        systolic = self.get_systolic_bp()
        diastolic = self.get_diastolic_bp()
        if systolic is not None and diastolic is not None:
            if systolic >= 180 or diastolic >= 120:
                return True
            if systolic < 90 or diastolic < 60:
                return True

        return False

    def get_alerts(self) -> str:
        """
        Get alert messages for critical vital signs.

        Returns:
            str: Alert messages for critical vitals
        """
        alerts = []

        if self.temperature is not None:
            if self.temperature > 39.0:
                alerts.append("High temperature (fever)")
            elif self.temperature < 36.0:
                alerts.append("Low temperature (hypothermia)")

        if self.pulse is not None:
            if self.pulse > 120:
                alerts.append("High pulse rate (tachycardia)")
            elif self.pulse < 50:
                alerts.append("Low pulse rate (bradycardia)")

        if self.respiratory_rate is not None:
            if self.respiratory_rate > 25:
                alerts.append("High respiratory rate (tachypnea)")
            elif self.respiratory_rate < 12:
                alerts.append("Low respiratory rate (bradypnea)")

        if self.spo2 is not None:
            if self.spo2 < 90:
                alerts.append("Severe hypoxemia (SpO2 < 90%)")
            elif self.spo2 < 95:
                alerts.append("Low oxygen saturation (hypoxemia)")

        # Blood pressure alerts
        systolic = self.get_systolic_bp()
        diastolic = self.get_diastolic_bp()
        if systolic is not None and diastolic is not None:
            if systolic >= 180 or diastolic >= 120:
                alerts.append("Hypertensive crisis (BP >= 180/120)")
            elif systolic < 90 or diastolic < 60:
                alerts.append("Hypotension (low blood pressure)")

        return ", ".join(alerts) if alerts else ""

    def get_systolic_bp(self) -> int | None:
        """
        Extract systolic blood pressure from blood_pressure string.

        Returns:
            int | None: Systolic BP value or None if not set
        """
        if not self.blood_pressure:
            return None
        try:
            parts = self.blood_pressure.split("/")
            return int(parts[0]) if len(parts) == 2 else None
        except (ValueError, IndexError):
            return None

    def get_diastolic_bp(self) -> int | None:
        """
        Extract diastolic blood pressure from blood_pressure string.

        Returns:
            int | None: Diastolic BP value or None if not set
        """
        if not self.blood_pressure:
            return None
        try:
            parts = self.blood_pressure.split("/")
            return int(parts[1]) if len(parts) == 2 else None
        except (ValueError, IndexError):
            return None

    def calculate_bmi(self) -> float | None:
        """
        Calculate Body Mass Index from weight and height.

        BMI = weight (kg) / height (m)^2

        Returns:
            float | None: BMI value or None if weight/height missing
        """
        if not self.weight or not self.height:
            return None
        height_m = float(self.height) / 100  # Convert cm to m
        bmi = float(self.weight) / (height_m ** 2)
        return round(bmi, 1)

    def get_bmi_classification(self) -> str | None:
        """
        Get BMI classification based on WHO standards.

        Returns:
            str | None: BMI classification or None if BMI cannot be calculated
        """
        bmi = self.calculate_bmi()
        if bmi is None:
            return None
        if bmi < 18.5:
            return "Underweight"
        elif bmi < 25:
            return "Normal"
        elif bmi < 30:
            return "Overweight"
        else:
            return "Obese"

    def get_vitals_summary(self) -> str:
        """
        Get a formatted summary of all vital signs.

        Returns:
            str: Formatted vitals summary
        """
        parts = []
        if self.temperature:
            parts.append(f"Temp: {self.temperature}°C")
        if self.pulse:
            parts.append(f"Pulse: {self.pulse} bpm")
        if self.blood_pressure:
            parts.append(f"BP: {self.blood_pressure} mmHg")
        if self.respiratory_rate:
            parts.append(f"RR: {self.respiratory_rate}/min")
        if self.spo2:
            parts.append(f"SpO2: {self.spo2}%")
        if self.weight:
            parts.append(f"Weight: {self.weight} kg")
        if self.height:
            parts.append(f"Height: {self.height} cm")
        bmi = self.calculate_bmi()
        if bmi:
            parts.append(f"BMI: {bmi} ({self.get_bmi_classification()})")
        return " | ".join(parts) if parts else "No vitals recorded"

    def get_primary_diagnosis(self):
        """
        Get the primary diagnosis for this encounter.

        Returns:
            Diagnosis | None: The primary diagnosis or None if not set
        """
        return self.diagnoses.filter(diagnosis_type="PRIMARY").first()

    def get_diagnosis_codes_display(self) -> str:
        """
        Get all diagnosis codes as a comma-separated string.

        Returns:
            str: Comma-separated diagnosis codes
        """
        codes = []
        for diagnosis in self.diagnoses.all():
            if diagnosis.icd10_code:
                codes.append(diagnosis.icd10_code.code)
            elif diagnosis.free_text_diagnosis:
                codes.append(f"[{diagnosis.free_text_diagnosis[:20]}...]")
        return ", ".join(codes) if codes else "No diagnoses"

    @property
    def has_treatment_plan(self) -> bool:
        """Check if encounter has a treatment plan."""
        return hasattr(self, "treatment_plan") and self.treatment_plan is not None

    def get_treatment_summary(self) -> str:
        """
        Get summary of treatment plan including medications.

        Returns:
            str: Summary of treatment plan
        """
        if not self.has_treatment_plan:
            return "No treatment plan"

        plan = self.treatment_plan
        parts = []

        # Medication count
        med_count = plan.medications.count()
        parts.append(f"Medications: {med_count}")

        # Follow-up info
        if plan.follow_up_date:
            parts.append(f"Follow-up: {plan.follow_up_date}")

        return " | ".join(parts) if parts else "Treatment plan created"


class Diagnosis(models.Model):
    """
    Diagnosis model linking encounters to ICD-10 codes.

    Supports primary, secondary, differential, and working diagnoses.
    Also supports free-text diagnosis when ICD-10 code is not known.

    Attributes:
        encounter: Foreign key to Encounter
        icd10_code: Foreign key to ICD10Code (optional)
        diagnosis_type: Type of diagnosis (PRIMARY, SECONDARY, etc.)
        free_text_diagnosis: Free-text diagnosis when code unknown
        notes: Additional clinical notes
        created_at: Timestamp when diagnosed
    """

    DIAGNOSIS_TYPE_CHOICES = [
        ("PRIMARY", "Primary Diagnosis"),
        ("SECONDARY", "Secondary Diagnosis"),
        ("DIFFERENTIAL", "Differential Diagnosis"),
        ("WORKING", "Working Diagnosis"),
    ]

    # Ordering priority for diagnosis types
    DIAGNOSIS_TYPE_PRIORITY = {
        "PRIMARY": 0,
        "SECONDARY": 1,
        "DIFFERENTIAL": 2,
        "WORKING": 3,
    }

    encounter = models.ForeignKey(
        Encounter,
        on_delete=models.CASCADE,
        related_name="diagnoses",
        help_text="Encounter this diagnosis belongs to",
    )
    icd10_code = models.ForeignKey(
        ICD10Code,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="diagnoses",
        help_text="ICD-10 code for this diagnosis",
    )
    diagnosis_type = models.CharField(
        max_length=20,
        choices=DIAGNOSIS_TYPE_CHOICES,
        help_text="Type of diagnosis",
    )
    free_text_diagnosis = models.CharField(
        max_length=500,
        blank=True,
        default="",
        help_text="Free-text diagnosis when ICD-10 code is unknown",
    )
    notes = models.TextField(
        blank=True,
        default="",
        help_text="Additional clinical notes about the diagnosis",
    )
    is_confirmed = models.BooleanField(
        default=False,
        help_text="Whether the diagnosis has been confirmed",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        # Note: For proper ordering by diagnosis_type priority, use
        # Diagnosis.objects.order_by_type() or annotate with Case/When
        ordering = ["created_at"]
        verbose_name = "Diagnosis"
        verbose_name_plural = "Diagnoses"
        indexes = [
            models.Index(fields=["encounter", "diagnosis_type"]),
        ]

    @classmethod
    def order_by_type_priority(cls, queryset):
        """Order diagnoses by type priority (PRIMARY first, then SECONDARY, etc.)."""
        from django.db.models import Case, When, Value, IntegerField

        return queryset.annotate(
            type_priority=Case(
                When(diagnosis_type="PRIMARY", then=Value(0)),
                When(diagnosis_type="SECONDARY", then=Value(1)),
                When(diagnosis_type="DIFFERENTIAL", then=Value(2)),
                When(diagnosis_type="WORKING", then=Value(3)),
                default=Value(4),
                output_field=IntegerField(),
            )
        ).order_by("type_priority", "created_at")

    def __str__(self) -> str:
        code_str = self.icd10_code.code if self.icd10_code else self.free_text_diagnosis[:30]
        return f"{code_str} ({self.diagnosis_type})"

    def clean(self):
        """Validate diagnosis constraints."""
        super().clean()

        # Either ICD-10 code or free text must be provided
        if not self.icd10_code and not self.free_text_diagnosis:
            raise ValidationError(
                "Either ICD-10 code or free-text diagnosis must be provided."
            )

        # Check for existing primary diagnosis
        if self.diagnosis_type == "PRIMARY":
            existing_primary = Diagnosis.objects.filter(
                encounter=self.encounter,
                diagnosis_type="PRIMARY",
            ).exclude(pk=self.pk)
            if existing_primary.exists():
                raise ValidationError(
                    {"diagnosis_type": "This encounter already has a primary diagnosis."}
                )

    def save(self, *args, **kwargs):
        """Save with validation."""
        self.full_clean()
        super().save(*args, **kwargs)


class TreatmentPlan(models.Model):
    """
    Treatment plan for an encounter.

    Each encounter can have one treatment plan that includes
    clinical notes, follow-up instructions, and medications.
    """

    STATUS_CHOICES = [
        ("ACTIVE", "Active"),
        ("COMPLETED", "Completed"),
        ("CANCELLED", "Cancelled"),
    ]

    encounter = models.OneToOneField(
        Encounter,
        on_delete=models.CASCADE,
        related_name="treatment_plan",
        help_text="Encounter this treatment plan belongs to",
    )
    clinical_notes = models.TextField(
        blank=True,
        default="",
        help_text="Clinical notes and assessment",
    )
    follow_up_instructions = models.TextField(
        blank=True,
        default="",
        help_text="Follow-up instructions for patient",
    )
    follow_up_date = models.DateField(
        null=True,
        blank=True,
        help_text="Scheduled follow-up date",
    )
    status = models.CharField(
        max_length=20,
        choices=STATUS_CHOICES,
        default="ACTIVE",
        help_text="Status of the treatment plan",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]
        verbose_name = "Treatment Plan"
        verbose_name_plural = "Treatment Plans"

    def __str__(self) -> str:
        return f"Treatment Plan for Encounter {self.encounter_id}"

    @property
    def has_follow_up(self) -> bool:
        """Check if treatment plan has a follow-up scheduled."""
        return self.follow_up_date is not None

    def clean(self):
        """Validate treatment plan constraints."""
        super().clean()

        # Check for existing treatment plan (for updates via forms)
        if not self.pk:
            existing = TreatmentPlan.objects.filter(encounter=self.encounter)
            if existing.exists():
                raise ValidationError(
                    "This encounter already has a treatment plan."
                )

    def save(self, *args, **kwargs):
        """Save with validation."""
        self.full_clean()
        super().save(*args, **kwargs)


class Medication(models.Model):
    """
    Medication prescription within a treatment plan.

    Records prescribed medications including dosage, frequency,
    duration, and special instructions.
    """

    ROUTE_CHOICES = [
        ("ORAL", "Oral"),
        ("IV", "Intravenous"),
        ("IM", "Intramuscular"),
        ("SC", "Subcutaneous"),
        ("TOPICAL", "Topical"),
        ("INHALED", "Inhaled"),
        ("RECTAL", "Rectal"),
        ("OPHTHALMIC", "Ophthalmic"),
        ("OTIC", "Otic"),
        ("NASAL", "Nasal"),
        ("OTHER", "Other"),
    ]

    treatment_plan = models.ForeignKey(
        TreatmentPlan,
        on_delete=models.CASCADE,
        related_name="medications",
        help_text="Treatment plan this medication belongs to",
    )
    name = models.CharField(
        max_length=200,
        help_text="Medication name",
    )
    dosage = models.CharField(
        max_length=100,
        help_text="Dosage (e.g., 500mg)",
    )
    frequency = models.CharField(
        max_length=100,
        blank=True,
        default="",
        help_text="Frequency (e.g., Three times daily, TDS, BD)",
    )
    duration = models.CharField(
        max_length=100,
        blank=True,
        default="",
        help_text="Duration (e.g., 7 days)",
    )
    route = models.CharField(
        max_length=20,
        choices=ROUTE_CHOICES,
        default="ORAL",
        help_text="Route of administration",
    )
    quantity = models.PositiveIntegerField(
        null=True,
        blank=True,
        help_text="Quantity to dispense",
    )
    instructions = models.TextField(
        blank=True,
        default="",
        help_text="Special instructions (e.g., Take with food)",
    )
    start_date = models.DateField(
        null=True,
        blank=True,
        help_text="Start date of medication",
    )
    end_date = models.DateField(
        null=True,
        blank=True,
        help_text="End date of medication",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["name"]
        verbose_name = "Medication"
        verbose_name_plural = "Medications"

    def __str__(self) -> str:
        return f"{self.name} {self.dosage}"

    @property
    def is_active(self) -> bool:
        """
        Check if medication is currently active.

        A medication is active if:
        - No end date is set, OR
        - End date is today or in the future
        """
        from datetime import date as date_type

        if self.end_date is None:
            return True
        return self.end_date >= date_type.today()

    def clean(self):
        """Validate medication fields."""
        super().clean()

        if not self.name:
            raise ValidationError({"name": "Medication name is required."})

    def save(self, *args, **kwargs):
        """Save with validation."""
        self.full_clean()
        super().save(*args, **kwargs)
