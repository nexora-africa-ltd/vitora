"""
Encounter model for Vitora HMIS.

This module defines the Encounter model and related functionality.
"""

import re
from datetime import date

from django.core.exceptions import ValidationError
from django.db import models


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
    encounter_date = models.DateField(
        default=date.today, help_text="Date of the encounter"
    )
    chief_complaint = models.TextField(help_text="Patient's chief complaint")

    # Vital signs (optional)
    temperature = models.DecimalField(
        max_digits=4,
        decimal_places=1,
        null=True,
        blank=True,
        help_text="Body temperature in Celsius",
    )
    pulse = models.IntegerField(
        null=True, blank=True, help_text="Pulse rate (beats per minute)"
    )
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

    def clean(self):
        """Validate the model fields."""
        super().clean()

        # Validate temperature range (35-45°C)
        if self.temperature is not None:
            if self.temperature < 35.0 or self.temperature > 45.0:
                raise ValidationError(
                    {"temperature": "Temperature must be between 35°C and 45°C."}
                )

        # Validate pulse range (30-200 bpm)
        if self.pulse is not None:
            if self.pulse < 30 or self.pulse > 200:
                raise ValidationError(
                    {"pulse": "Pulse must be between 30 and 200 beats per minute."}
                )

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
        if self.respiratory_rate is not None:
            if self.respiratory_rate < 8 or self.respiratory_rate > 40:
                raise ValidationError(
                    {
                        "respiratory_rate": "Respiratory rate must be between 8 and 40 breaths per minute."
                    }
                )

        # Validate weight (positive value, reasonable range 0.5-300 kg)
        if self.weight is not None:
            if self.weight <= 0 or self.weight > 300:
                raise ValidationError(
                    {"weight": "Weight must be between 0.5 and 300 kg."}
                )

        # Validate height (positive value, reasonable range 20-250 cm)
        if self.height is not None:
            if self.height <= 0 or self.height > 250:
                raise ValidationError(
                    {"height": "Height must be between 20 and 250 cm."}
                )

    def has_critical_vitals(self) -> bool:
        """
        Check if any vital signs are in critical ranges.

        Returns:
            bool: True if any vital signs are critical
        """
        # Critical temperature: < 36°C or > 39°C
        if self.temperature is not None:
            if self.temperature < 36.0 or self.temperature > 39.0:
                return True

        # Critical pulse: < 50 or > 120 bpm
        if self.pulse is not None:
            if self.pulse < 50 or self.pulse > 120:
                return True

        # Critical respiratory rate: < 12 or > 25 breaths/min
        if self.respiratory_rate is not None:
            if self.respiratory_rate < 12 or self.respiratory_rate > 25:
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

        return ", ".join(alerts) if alerts else ""

    def __str__(self) -> str:
        """String representation of the encounter."""
        return f"{self.patient.mrn} - {self.encounter_type} - {self.encounter_date}"
