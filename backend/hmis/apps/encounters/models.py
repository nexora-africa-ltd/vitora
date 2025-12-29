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
    short_description = models.CharField(
        max_length=255,
        blank=True,
        default="",
        help_text="Short description of the diagnosis",
    )
    description = models.CharField(
        max_length=500,
        help_text="Full description of the diagnosis",
    )
    long_description = models.TextField(
        blank=True,
        default="",
        help_text="Detailed long description of the diagnosis",
    )
    category = models.CharField(
        max_length=200,
        help_text="Disease category (e.g., Certain infectious and parasitic diseases)",
    )
    chapter = models.IntegerField(
        help_text="ICD-10 chapter number (1-22)",
    )
    is_billable = models.BooleanField(
        default=True,
        help_text="Whether this is a billable/terminal code",
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
            models.Index(fields=["short_description"]),
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

    def save(self, *args, **kwargs):
        """Ensure code is uppercased on save."""
        if self.code:
            self.code = self.code.upper()
        super().save(*args, **kwargs)


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

        Uses age-appropriate ranges for pediatric patients.

        Returns:
            bool: True if any vital signs are critical
        """
        # Check each vital using the age-aware get_vital_status method
        vitals_to_check = ["temperature", "pulse", "respiratory_rate", "spo2", "bp_systolic", "bp_diastolic"]

        for vital in vitals_to_check:
            status = self.get_vital_status(vital)
            if status == "critical":
                return True

        return False

    def get_alerts(self) -> str:
        """
        Get alert messages for critical vital signs.

        Uses age-appropriate ranges for pediatric patients.

        Returns:
            str: Alert messages for critical vitals
        """
        alerts = []
        age_suffix = " (pediatric)" if self.is_pediatric_patient() else ""

        # Temperature alerts (same for all ages)
        if self.temperature is not None:
            temp_status = self.get_vital_status("temperature")
            if temp_status == "critical":
                if self.temperature > 38.0:
                    alerts.append(f"High temperature (fever){age_suffix}")
                else:
                    alerts.append(f"Low temperature (hypothermia){age_suffix}")

        # Pulse alerts
        if self.pulse is not None:
            pulse_status = self.get_vital_status("pulse")
            if pulse_status == "critical":
                ranges = self._get_vital_ranges_for_patient()["pulse"]
                if self.pulse > ranges["normal"][1]:
                    alerts.append(f"High pulse rate (tachycardia){age_suffix}")
                else:
                    alerts.append(f"Low pulse rate (bradycardia){age_suffix}")

        # Respiratory rate alerts
        if self.respiratory_rate is not None:
            rr_status = self.get_vital_status("respiratory_rate")
            if rr_status == "critical":
                ranges = self._get_vital_ranges_for_patient()["respiratory_rate"]
                if self.respiratory_rate > ranges["normal"][1]:
                    alerts.append(f"High respiratory rate (tachypnea){age_suffix}")
                else:
                    alerts.append(f"Low respiratory rate (bradypnea){age_suffix}")

        # SpO2 alerts (same thresholds for all ages)
        if self.spo2 is not None:
            spo2_status = self.get_vital_status("spo2")
            if spo2_status == "critical":
                if float(self.spo2) < 90:
                    alerts.append(f"Severe hypoxemia (SpO2 < 90%){age_suffix}")
                else:
                    alerts.append(f"Low oxygen saturation (hypoxemia){age_suffix}")

        # Blood pressure alerts
        systolic = self.get_systolic_bp()
        diastolic = self.get_diastolic_bp()
        if systolic is not None:
            bp_status = self.get_vital_status("bp_systolic")
            if bp_status == "critical":
                ranges = self._get_vital_ranges_for_patient()["bp_systolic"]
                if systolic > ranges["normal"][1]:
                    alerts.append(f"Hypertensive crisis{age_suffix}")
                else:
                    alerts.append(f"Hypotension (low blood pressure){age_suffix}")

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

    # Vital sign ranges for status classification (Adult defaults)
    VITAL_RANGES = {
        "temperature": {
            "unit": "°C",
            "normal": (36.1, 37.2),
            "warning_low": (35.5, 36.0),
            "warning_high": (37.3, 38.0),
            "critical_low": 35.5,
            "critical_high": 38.0,
        },
        "pulse": {
            "unit": "bpm",
            "normal": (60, 100),
            "warning_low": (50, 59),
            "warning_high": (101, 120),
            "critical_low": 50,
            "critical_high": 120,
        },
        "bp_systolic": {
            "unit": "mmHg",
            "normal": (90, 120),
            "warning_low": None,  # No warning, jump to critical
            "warning_high": (121, 139),
            "critical_low": 90,  # <90 is hypotension
            "critical_high": 140,
        },
        "bp_diastolic": {
            "unit": "mmHg",
            "normal": (60, 80),
            "warning_low": None,  # No warning, jump to critical
            "warning_high": (81, 89),
            "critical_low": 60,  # <60 is hypotension
            "critical_high": 90,
        },
        "respiratory_rate": {
            "unit": "/min",
            "normal": (12, 20),
            "warning_low": None,  # No warning, <12 is critical
            "warning_high": (21, 25),
            "critical_low": 12,  # <12 is bradypnea (critical)
            "critical_high": 25,
        },
        "spo2": {
            "unit": "%",
            "normal": (95, 100),
            "warning_low": (90, 94),  # Mild hypoxemia
            "warning_high": None,
            "critical_low": 90,  # <90% is severe hypoxemia (critical)
            "critical_high": None,
        },
    }

    # Pediatric vital sign ranges by age group
    # Based on PALS (Pediatric Advanced Life Support) guidelines
    PEDIATRIC_VITAL_RANGES = {
        "newborn": {  # 0-28 days
            "pulse": {
                "unit": "bpm",
                "normal": (100, 205),
                "warning_low": (90, 99),
                "warning_high": (206, 220),
                "critical_low": 90,
                "critical_high": 220,
            },
            "respiratory_rate": {
                "unit": "/min",
                "normal": (30, 60),
                "warning_low": (26, 29),
                "warning_high": (61, 64),
                "critical_low": 26,
                "critical_high": 64,
            },
            "bp_systolic": {
                "unit": "mmHg",
                "normal": (60, 90),
                "warning_low": (50, 59),
                "warning_high": (91, 105),
                "critical_low": 50,
                "critical_high": 105,
            },
            "bp_diastolic": {
                "unit": "mmHg",
                "normal": (30, 60),
                "warning_low": (20, 29),
                "warning_high": (61, 70),
                "critical_low": 20,
                "critical_high": 70,
            },
        },
        "infant": {  # 1-12 months
            "pulse": {
                "unit": "bpm",
                "normal": (100, 180),
                "warning_low": (80, 99),
                "warning_high": (181, 200),
                "critical_low": 80,
                "critical_high": 200,
            },
            "respiratory_rate": {
                "unit": "/min",
                "normal": (30, 53),
                "warning_low": (25, 29),
                "warning_high": (54, 65),
                "critical_low": 25,
                "critical_high": 65,
            },
            "bp_systolic": {
                "unit": "mmHg",
                "normal": (72, 104),
                "warning_low": (65, 71),
                "warning_high": (105, 115),
                "critical_low": 65,
                "critical_high": 115,
            },
            "bp_diastolic": {
                "unit": "mmHg",
                "normal": (37, 56),
                "warning_low": (30, 36),
                "warning_high": (57, 70),
                "critical_low": 30,
                "critical_high": 70,
            },
        },
        "toddler": {  # 1-3 years
            "pulse": {
                "unit": "bpm",
                "normal": (98, 140),
                "warning_low": (85, 97),
                "warning_high": (141, 160),
                "critical_low": 85,
                "critical_high": 160,
            },
            "respiratory_rate": {
                "unit": "/min",
                "normal": (22, 37),
                "warning_low": (18, 21),
                "warning_high": (38, 45),
                "critical_low": 18,
                "critical_high": 45,
            },
            "bp_systolic": {
                "unit": "mmHg",
                "normal": (86, 106),
                "warning_low": (75, 85),
                "warning_high": (107, 120),
                "critical_low": 75,
                "critical_high": 120,
            },
            "bp_diastolic": {
                "unit": "mmHg",
                "normal": (42, 63),
                "warning_low": (35, 41),
                "warning_high": (64, 75),
                "critical_low": 35,
                "critical_high": 75,
            },
        },
        "preschool": {  # 3-6 years
            "pulse": {
                "unit": "bpm",
                "normal": (80, 120),
                "warning_low": (70, 79),
                "warning_high": (121, 140),
                "critical_low": 70,
                "critical_high": 140,
            },
            "respiratory_rate": {
                "unit": "/min",
                "normal": (20, 28),
                "warning_low": (16, 19),
                "warning_high": (29, 35),
                "critical_low": 16,
                "critical_high": 35,
            },
            "bp_systolic": {
                "unit": "mmHg",
                "normal": (89, 112),
                "warning_low": (80, 88),
                "warning_high": (113, 125),
                "critical_low": 80,
                "critical_high": 125,
            },
            "bp_diastolic": {
                "unit": "mmHg",
                "normal": (46, 72),
                "warning_low": (40, 45),
                "warning_high": (73, 85),
                "critical_low": 40,
                "critical_high": 85,
            },
        },
        "school_age": {  # 6-12 years
            "pulse": {
                "unit": "bpm",
                "normal": (75, 118),
                "warning_low": (65, 74),
                "warning_high": (119, 135),
                "critical_low": 65,
                "critical_high": 135,
            },
            "respiratory_rate": {
                "unit": "/min",
                "normal": (18, 25),
                "warning_low": (14, 17),
                "warning_high": (26, 32),
                "critical_low": 14,
                "critical_high": 32,
            },
            "bp_systolic": {
                "unit": "mmHg",
                "normal": (97, 120),
                "warning_low": (85, 96),
                "warning_high": (121, 135),
                "critical_low": 85,
                "critical_high": 135,
            },
            "bp_diastolic": {
                "unit": "mmHg",
                "normal": (57, 80),
                "warning_low": (50, 56),
                "warning_high": (81, 90),
                "critical_low": 50,
                "critical_high": 90,
            },
        },
        "adolescent": {  # 12-18 years (approaching adult values)
            "pulse": {
                "unit": "bpm",
                "normal": (60, 100),
                "warning_low": (50, 59),
                "warning_high": (101, 120),
                "critical_low": 50,
                "critical_high": 120,
            },
            "respiratory_rate": {
                "unit": "/min",
                "normal": (12, 20),
                "warning_low": (10, 11),
                "warning_high": (21, 25),
                "critical_low": 10,
                "critical_high": 25,
            },
            "bp_systolic": {
                "unit": "mmHg",
                "normal": (90, 120),
                "warning_low": (80, 89),
                "warning_high": (121, 139),
                "critical_low": 80,
                "critical_high": 140,
            },
            "bp_diastolic": {
                "unit": "mmHg",
                "normal": (60, 80),
                "warning_low": (50, 59),
                "warning_high": (81, 89),
                "critical_low": 50,
                "critical_high": 90,
            },
        },
    }

    # Age thresholds in days for pediatric age groups
    PEDIATRIC_AGE_THRESHOLDS = {
        "newborn": (0, 28),  # 0-28 days
        "infant": (29, 365),  # 1-12 months
        "toddler": (366, 1095),  # 1-3 years
        "preschool": (1096, 2190),  # 3-6 years
        "school_age": (2191, 4380),  # 6-12 years
        "adolescent": (4381, 6570),  # 12-18 years
    }

    def get_patient_age_days(self) -> int:
        """
        Calculate patient's age in days at time of encounter.

        Returns:
            int: Patient's age in days
        """
        if not self.patient or not self.patient.date_of_birth:
            return 0
        encounter_date = self.encounter_date or date.today()
        delta = encounter_date - self.patient.date_of_birth
        return delta.days

    def get_patient_age_years(self) -> int:
        """
        Calculate patient's age in years at time of encounter.

        Returns:
            int: Patient's age in complete years
        """
        return self.get_patient_age_days() // 365

    def is_pediatric_patient(self) -> bool:
        """
        Check if patient is pediatric (under 18 years).

        Returns:
            bool: True if patient is under 18, False otherwise
        """
        return self.get_patient_age_years() < 18

    def get_pediatric_age_group(self) -> str | None:
        """
        Determine the pediatric age group for the patient.

        Returns:
            str | None: Age group name ('newborn', 'infant', 'toddler',
                       'preschool', 'school_age', 'adolescent') or None if adult
        """
        if not self.is_pediatric_patient():
            return None

        age_days = self.get_patient_age_days()

        for group, (min_days, max_days) in self.PEDIATRIC_AGE_THRESHOLDS.items():
            if min_days <= age_days <= max_days:
                return group

        return None

    def _get_vital_ranges_for_patient(self) -> dict:
        """
        Get appropriate vital sign ranges based on patient age.

        Returns pediatric ranges for children, adult ranges for adults.

        Returns:
            dict: Vital sign ranges appropriate for patient's age
        """
        age_group = self.get_pediatric_age_group()

        if age_group is None:
            # Adult patient - use default ranges
            return self.VITAL_RANGES

        # Pediatric patient - merge pediatric ranges with defaults
        # (temperature and SpO2 are same across ages)
        pediatric_ranges = self.PEDIATRIC_VITAL_RANGES.get(age_group, {})
        merged_ranges = self.VITAL_RANGES.copy()

        for vital_name, ranges in pediatric_ranges.items():
            merged_ranges[vital_name] = ranges

        return merged_ranges

    def get_vital_status(self, vital_name: str) -> str | None:
        """
        Get status ('normal', 'warning', 'critical') for a specific vital sign.

        Uses age-appropriate ranges for pediatric patients.

        Args:
            vital_name: Name of the vital sign (temperature, pulse, bp_systolic,
                       bp_diastolic, respiratory_rate, spo2)

        Returns:
            str | None: 'normal', 'warning', or 'critical', or None if not recorded

        Raises:
            ValueError: If vital_name is not recognized
        """
        valid_vitals = list(self.VITAL_RANGES.keys())
        if vital_name not in valid_vitals:
            raise ValueError(f"Unknown vital: {vital_name}. Valid options: {valid_vitals}")

        # Get the value
        if vital_name == "temperature":
            value = float(self.temperature) if self.temperature else None
        elif vital_name == "pulse":
            value = self.pulse
        elif vital_name == "bp_systolic":
            value = self.get_systolic_bp()
        elif vital_name == "bp_diastolic":
            value = self.get_diastolic_bp()
        elif vital_name == "respiratory_rate":
            value = self.respiratory_rate
        elif vital_name == "spo2":
            value = float(self.spo2) if self.spo2 else None
        else:
            value = None

        if value is None:
            return None

        # Get age-appropriate ranges (pediatric or adult)
        all_ranges = self._get_vital_ranges_for_patient()
        ranges = all_ranges[vital_name]

        # Check critical first
        if ranges.get("critical_low") and value < ranges["critical_low"]:
            return "critical"
        if ranges.get("critical_high") and value > ranges["critical_high"]:
            return "critical"

        # Check warning
        if ranges.get("warning_low"):
            low_min, low_max = ranges["warning_low"]
            if low_min <= value <= low_max:
                return "warning"
        if ranges.get("warning_high"):
            high_min, high_max = ranges["warning_high"]
            if high_min <= value <= high_max:
                return "warning"

        # Check normal
        normal_min, normal_max = ranges["normal"]
        if normal_min <= value <= normal_max:
            return "normal"

        # Edge cases - classify as warning if not clearly critical
        return "warning"

    def get_all_vital_statuses(self) -> dict:
        """
        Get status dict for all recorded vitals.

        Returns:
            dict: Dictionary with vital name as key and dict with
                  'value', 'status', 'unit' as value (or None if not recorded)
        """
        statuses = {}

        # Temperature
        if self.temperature:
            statuses["temperature"] = {
                "value": float(self.temperature),
                "status": self.get_vital_status("temperature"),
                "unit": "°C",
            }
        else:
            statuses["temperature"] = None

        # Pulse
        if self.pulse:
            statuses["pulse"] = {
                "value": self.pulse,
                "status": self.get_vital_status("pulse"),
                "unit": "bpm",
            }
        else:
            statuses["pulse"] = None

        # Blood pressure systolic
        systolic = self.get_systolic_bp()
        if systolic:
            statuses["bp_systolic"] = {
                "value": systolic,
                "status": self.get_vital_status("bp_systolic"),
                "unit": "mmHg",
            }
        else:
            statuses["bp_systolic"] = None

        # Blood pressure diastolic
        diastolic = self.get_diastolic_bp()
        if diastolic:
            statuses["bp_diastolic"] = {
                "value": diastolic,
                "status": self.get_vital_status("bp_diastolic"),
                "unit": "mmHg",
            }
        else:
            statuses["bp_diastolic"] = None

        # Respiratory rate
        if self.respiratory_rate:
            statuses["respiratory_rate"] = {
                "value": self.respiratory_rate,
                "status": self.get_vital_status("respiratory_rate"),
                "unit": "/min",
            }
        else:
            statuses["respiratory_rate"] = None

        # SpO2
        if self.spo2:
            statuses["spo2"] = {
                "value": float(self.spo2),
                "status": self.get_vital_status("spo2"),
                "unit": "%",
            }
        else:
            statuses["spo2"] = None

        return statuses

    def get_map(self) -> int | None:
        """
        Calculate Mean Arterial Pressure from blood pressure.

        MAP = DBP + 1/3(SBP - DBP)

        Returns:
            int | None: MAP value rounded to nearest integer, or None if BP not recorded
        """
        systolic = self.get_systolic_bp()
        diastolic = self.get_diastolic_bp()

        if systolic is None or diastolic is None:
            return None

        map_value = diastolic + (systolic - diastolic) / 3
        return round(map_value)

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

    CERTAINTY_CHOICES = [
        ("confirmed", "Confirmed"),
        ("provisional", "Provisional"),
        ("ruled_out", "Ruled Out"),
        ("suspected", "Suspected"),
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
    certainty = models.CharField(
        max_length=20,
        choices=CERTAINTY_CHOICES,
        default="confirmed",
        help_text="Level of diagnostic certainty",
    )
    diagnosed_by = models.ForeignKey(
        "auth.User",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="diagnoses_made",
        help_text="Clinician who made the diagnosis",
    )
    diagnosed_at = models.DateTimeField(
        auto_now_add=True,
        help_text="When the diagnosis was made",
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
        constraints = [
            # Only one principal/primary diagnosis per encounter
            models.UniqueConstraint(
                fields=["encounter"],
                condition=models.Q(diagnosis_type="PRIMARY"),
                name="unique_primary_diagnosis_per_encounter",
            ),
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
    template = models.ForeignKey(
        "TreatmentPlanTemplate",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="treatment_plans",
        help_text="Template used to create this plan",
    )
    medications_json = models.TextField(
        blank=True,
        default="",
        help_text="Prescribed medications (JSON format for template imports)",
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

    def apply_template(self, template: "TreatmentPlanTemplate"):
        """
        Apply a treatment plan template to populate default values.

        Args:
            template: TreatmentPlanTemplate instance to apply
        """
        from datetime import timedelta

        self.template = template
        if template.default_medications:
            self.medications_json = template.default_medications
        if template.default_instructions:
            self.follow_up_instructions = template.default_instructions
        if template.follow_up_days:
            self.follow_up_date = date.today() + timedelta(days=template.follow_up_days)
        self.save()

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


class TreatmentPlanTemplate(models.Model):
    """
    Reusable treatment plan templates.

    Templates can be linked to specific diagnoses and contain
    default medications, instructions, and follow-up schedules.
    """

    name = models.CharField(
        max_length=200,
        help_text="Template name",
    )
    description = models.TextField(
        blank=True,
        default="",
        help_text="Template description",
    )
    diagnosis_codes = models.ManyToManyField(
        ICD10Code,
        blank=True,
        related_name="treatment_templates",
        help_text="Suggested diagnoses for this template",
    )
    default_medications = models.TextField(
        blank=True,
        default="",
        help_text="Default medications (JSON format)",
    )
    default_procedures = models.TextField(
        blank=True,
        default="",
        help_text="Default procedures (JSON format)",
    )
    default_instructions = models.TextField(
        blank=True,
        default="",
        help_text="Default patient instructions",
    )
    follow_up_days = models.PositiveIntegerField(
        null=True,
        blank=True,
        help_text="Suggested follow-up in days",
    )
    department = models.CharField(
        max_length=100,
        blank=True,
        default="",
        help_text="Department this template is for",
    )
    is_active = models.BooleanField(
        default=True,
        help_text="Whether this template is currently active",
    )
    created_by = models.ForeignKey(
        "auth.User",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="created_treatment_templates",
        help_text="User who created this template",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["name"]
        verbose_name = "Treatment Plan Template"
        verbose_name_plural = "Treatment Plan Templates"

    def __str__(self) -> str:
        return self.name


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
