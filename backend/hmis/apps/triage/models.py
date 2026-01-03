"""
Triage models for Vitora HMIS.

This module implements the Kenya Emergency Triage Assessment (KETA) system
for patient prioritization and queue management.

Sprint 1.5-1.6 Track E: Triage Module MVP
"""

from decimal import Decimal
from django.core.validators import MinValueValidator, MaxValueValidator
from django.db import models
from django.utils import timezone


class TriageVitalThreshold(models.Model):
    """
    Configurable thresholds for vital sign alerts.
    Can be customized per facility or use system defaults.
    """

    VITAL_TYPE_CHOICES = [
        ("SPO2", "Oxygen Saturation (%)"),
        ("SYSTOLIC_BP", "Systolic Blood Pressure (mmHg)"),
        ("DIASTOLIC_BP", "Diastolic Blood Pressure (mmHg)"),
        ("HEART_RATE", "Heart Rate (bpm)"),
        ("TEMPERATURE", "Temperature (°C)"),
        ("RESPIRATORY_RATE", "Respiratory Rate (breaths/min)"),
    ]

    vital_type = models.CharField(
        max_length=30,
        choices=VITAL_TYPE_CHOICES,
        unique=True,
        help_text="Type of vital sign",
    )
    critical_low = models.DecimalField(
        max_digits=6,
        decimal_places=2,
        null=True,
        blank=True,
        help_text="Value below this triggers critical alert",
    )
    warning_low = models.DecimalField(
        max_digits=6,
        decimal_places=2,
        null=True,
        blank=True,
        help_text="Value below this triggers warning",
    )
    warning_high = models.DecimalField(
        max_digits=6,
        decimal_places=2,
        null=True,
        blank=True,
        help_text="Value above this triggers warning",
    )
    critical_high = models.DecimalField(
        max_digits=6,
        decimal_places=2,
        null=True,
        blank=True,
        help_text="Value above this triggers critical alert",
    )
    is_active = models.BooleanField(default=True, help_text="Whether this threshold is active")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "Triage Vital Threshold"
        verbose_name_plural = "Triage Vital Thresholds"
        ordering = ["vital_type"]

    def __str__(self) -> str:
        return f"{self.get_vital_type_display()} Threshold"

    @classmethod
    def get_defaults(cls) -> dict:
        """Return default threshold values for all vital types."""
        return {
            "SPO2": {"critical_low": 90, "warning_low": 95},
            "SYSTOLIC_BP": {
                "critical_high": 180,
                "critical_low": 90,
                "warning_high": 140,
                "warning_low": 100,
            },
            "DIASTOLIC_BP": {"critical_high": 120, "warning_high": 90},
            "HEART_RATE": {
                "critical_high": 150,
                "critical_low": 40,
                "warning_high": 100,
                "warning_low": 50,
            },
            "TEMPERATURE": {
                "critical_high": 40.0,
                "critical_low": 35.0,
                "warning_high": 38.5,
                "warning_low": 36.0,
            },
            "RESPIRATORY_RATE": {
                "critical_high": 30,
                "critical_low": 8,
                "warning_high": 24,
                "warning_low": 10,
            },
        }

    def check_value(self, value: Decimal) -> str:
        """
        Check a vital value against thresholds.

        Args:
            value: The vital value to check

        Returns:
            str: 'critical', 'warning', or 'normal'
        """
        if value is None:
            return "normal"

        # Check critical thresholds first
        if self.critical_low is not None and value < self.critical_low:
            return "critical"
        if self.critical_high is not None and value > self.critical_high:
            return "critical"

        # Check warning thresholds
        if self.warning_low is not None and value < self.warning_low:
            return "warning"
        if self.warning_high is not None and value > self.warning_high:
            return "warning"

        return "normal"
