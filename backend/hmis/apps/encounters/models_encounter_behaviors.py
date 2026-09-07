# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
# ruff: noqa: F401, F811, F821
"""Encounters models encounter behaviors for Vitora HMIS.

What this file is for:
- Implement models encounter behaviors logic for the encounters domain.

How to use it:
- Import classes and functions from this module in Django app code and tests.

Supported inputs/args:
- Python imports and Django ORM/runtime inputs; no standalone CLI arguments.
"""

import logging
import re
import uuid
from datetime import date, timedelta

from django.core.exceptions import ValidationError
from django.core.validators import RegexValidator
from django.db import models
from django.utils import timezone
from simple_history.models import HistoricalRecords

from hmis.apps.core.history import HistoryMixin
from hmis.apps.core.mixins import FacilityScopedModel, resolve_tenant_from_related
from hmis.apps.core.models import TimeStampedModel

logger = logging.getLogger(__name__)

# ICD-10 code format validator
icd10_code_validator = RegexValidator(
    regex=r"^[A-Z]\d{2}(\.\d{1,2})?$",
    message="ICD-10 code must be in format: Letter + 2 digits (e.g., A09) "
    "or Letter + 2 digits + decimal + 1-2 digits (e.g., J18.9)",
)


class EncounterBehaviorMixin:
    def can_enter_consultation(self) -> bool:
        """
        Check if the encounter can enter consultation queue.

        Returns True if:
        - Triage is COMPLETED
        - Triage is BYPASSED (for optional triage)
        - Triage is NOT_APPLICABLE (for not required triage)

        Returns False if:
        - Triage is PENDING and requirement is MANDATORY
        - Triage is IN_PROGRESS
        - Triage is PENDING and requirement is OPTIONAL (must bypass or complete)

        Returns:
            bool: True if can enter consultation, False otherwise
        """
        return self.triage_status in ("COMPLETED", "BYPASSED", "NOT_APPLICABLE")

    def begin_consultation(self) -> "Encounter":
        """
        Start consultation for this encounter.

        Sets consultation_status to IN_PROGRESS and records the start time.
        This is the single source of truth for starting consultations,
        called by both the Encounter API and ClinicVisit workflows.

        Raises:
            ValueError: If encounter cannot enter consultation (triage required)
                or consultation is already in progress/completed.

        Returns:
            Encounter: Self, for method chaining.
        """
        from django.utils import timezone

        if not self.can_enter_consultation():
            raise ValueError("Encounter cannot enter consultation. Triage may be required.")

        if self.consultation_status == "IN_PROGRESS":
            raise ValueError("Consultation is already in progress.")

        if self.consultation_status == "COMPLETED":
            raise ValueError("Consultation is already completed.")

        self.consultation_status = "IN_PROGRESS"
        self.consultation_started_at = timezone.now()
        self.save(update_fields=["consultation_status", "consultation_started_at"])

        return self

    def has_critical_vitals(self) -> bool:
        """
        Check if any vital signs are in critical ranges.

        Uses age-appropriate ranges for pediatric patients.

        Returns:
            bool: True if any vital signs are critical
        """
        # Check each vital using the age-aware get_vital_status method
        vitals_to_check = [
            "temperature",
            "pulse",
            "respiratory_rate",
            "spo2",
            "systolic_bp",
            "diastolic_bp",
        ]

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

        # Temperature alerts (aligned with triage thresholds)
        if self.temperature is not None:
            temp_status = self.get_vital_status("temperature")
            if temp_status == "critical":
                if float(self.temperature) >= 40.0:
                    alerts.append(f"High fever / Hyperpyrexia{age_suffix}")
                else:
                    alerts.append(f"Severe hypothermia{age_suffix}")

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

        # SpO2 alerts (critical threshold same for all ages: <90%)
        if self.spo2 is not None:
            spo2_val = float(self.spo2)
            spo2_status = self.get_vital_status("spo2")
            if spo2_status == "critical":
                alerts.append(
                    f"CRITICAL: Severe hypoxemia (SpO2 {spo2_val:.0f}% < 90%) - urgent evaluation needed{age_suffix}"
                )
            elif spo2_status == "warning" and spo2_val < 92:
                alerts.append(
                    f"Low oxygen saturation (SpO2 {spo2_val:.0f}%) - medical advice recommended{age_suffix}"
                )

        # Blood pressure alerts
        systolic = self.get_systolic_bp()
        _ = self.get_diastolic_bp()  # Calculated but not yet used in alerts
        if systolic is not None:
            bp_status = self.get_vital_status("systolic_bp")
            if bp_status == "critical":
                ranges = self._get_vital_ranges_for_patient()["systolic_bp"]
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
        bmi = float(self.weight) / (height_m**2)
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

    # =========================================================================
    # Encounter Status Workflow Methods (Sprint 1.1-1.2)
    # =========================================================================

    # Valid status transitions (Sprint 2 - Enhanced State Machine)
    VALID_TRANSITIONS = {
        "CREATED": {"CHECKED_IN", "CANCELLED"},
        "CHECKED_IN": {"TRIAGED", "IN_PROGRESS", "CANCELLED"},
        "TRIAGED": {"IN_PROGRESS", "CANCELLED"},
        "IN_PROGRESS": {"ON_HOLD", "ORDERS_PLACED", "READY_TO_CLOSE", "CANCELLED"},
        "ON_HOLD": {"IN_PROGRESS", "CANCELLED"},
        "ORDERS_PLACED": {"RESULTS_PENDING", "READY_TO_CLOSE"},
        "RESULTS_PENDING": {"READY_TO_CLOSE"},
        "READY_TO_CLOSE": {"CLOSED"},
        "CLOSED": set(),  # Terminal state - immutable
        "CANCELLED": set(),  # Terminal state
    }

    def has_vitals(self) -> bool:
        """
        Check if any vital signs have been recorded for this encounter.

        Returns True if at least one of the core vital sign fields has a value:
        temperature, pulse, blood_pressure, respiratory_rate, or spo2.

        Returns:
            bool: True if vitals have been recorded, False otherwise
        """
        return any(
            [
                self.temperature is not None,
                self.pulse is not None,
                self.blood_pressure,  # Non-empty string
                self.respiratory_rate is not None,
                self.spo2 is not None,
            ]
        )

    def can_edit(self) -> bool:
        """
        Check if the encounter can be edited.

        CLOSED and CANCELLED encounters are immutable.
        All other statuses allow editing.

        Returns:
            bool: True if the encounter can be edited, False otherwise
        """
        return self.status not in ("CLOSED", "CANCELLED")

    def is_valid_transition(self, new_status: str) -> bool:
        """
        Check if a status transition is valid.

        Args:
            new_status: The target status to transition to

        Returns:
            bool: True if the transition is valid, False otherwise
        """
        return new_status in self.VALID_TRANSITIONS.get(self.status, set())

    def start_progress(self) -> None:
        """
        Transition encounter to IN_PROGRESS.

        Raises:
            ValidationError: If the encounter cannot transition to IN_PROGRESS
        """
        from django.core.exceptions import ValidationError

        if not self.is_valid_transition("IN_PROGRESS"):
            raise ValidationError(
                f"Cannot start progress on encounter with status '{self.status}'. "
                "Only CREATED, CHECKED_IN, TRIAGED, or ON_HOLD encounters can be started."
            )

        self.status = "IN_PROGRESS"
        self.save(update_fields=["status", "updated_at"])

    def finalize(self, user) -> None:
        """
        Finalize/close the encounter.

        Sets status to CLOSED, records the finalizing user and timestamp.
        Creates an audit log entry for the status change.

        Validates that the encounter has sufficient clinical documentation
        (treatment plan, diagnosis, prescription) OR has an explicit disposition.
        ADVICE_ONLY and LEFT_AMA dispositions require disposition_notes.

        Args:
            user: The user who is finalizing the encounter

        Raises:
            ValidationError: If the encounter is already CLOSED, CANCELLED,
                           or lacks required documentation/disposition.
        """
        from django.core.exceptions import ValidationError
        from django.utils import timezone

        from hmis.apps.core.models import AuditLog

        if self.status == "CLOSED":
            raise ValidationError(
                "Encounter is already closed. Closed encounters cannot be finalized again."
            )

        if self.status == "CANCELLED":
            raise ValidationError(
                "Cannot finalize a cancelled encounter. Cancelled encounters are terminal."
            )

        # Validate documentation requirements
        self._validate_close_requirements()

        old_status = self.status
        self.status = "CLOSED"
        self.finalized_by = user
        self.finalized_at = timezone.now()
        self.save(update_fields=["status", "finalized_by", "finalized_at", "updated_at"])

        try:
            from hmis.apps.billing.services.automation_rules import BillingAutomationRuleService

            BillingAutomationRuleService.apply_checkout(self)
        except (
            AttributeError,
            TypeError,
            ValueError,
            RuntimeError,
            OSError,
            AssertionError,
            ImportError,
        ):
            logger.exception(
                "Billing automation rules failed for encounter checkout %s",
                self.id,
            )

        # Create audit log entry
        AuditLog.log(
            action="encounter_finalize",
            user=user,
            resource_type="Encounter",
            resource_id=self.id,
            ip_address=None,
            user_agent="",
            patient_id=self.patient_id,
            details={
                "old_status": old_status,
                "new_status": "CLOSED",
                "encounter_type": self.encounter_type,
            },
        )

    def mark_disposition_manual(self) -> None:
        """Mark disposition provenance as manual after clinician edits."""
        target_source = (
            "MANUAL" if (self.disposition or (self.disposition_notes or "").strip()) else ""
        )
        if self.disposition_source == target_source:
            return
        self.disposition_source = target_source
        self.save(update_fields=["disposition_source", "updated_at"])

    def apply_auto_disposition(
        self,
        *,
        disposition: str,
        source: str,
        trigger: str,
        note: str = "",
    ) -> bool:
        """Apply an auto-derived disposition unless a clinician has manually overridden it."""
        old_disposition = self.disposition
        old_disposition_notes = self.disposition_notes or ""
        old_source = self.disposition_source

        if self.status in {"CLOSED", "CANCELLED"}:
            return False
        if self.disposition_source == "MANUAL":
            return False

        update_fields: list[str] = []

        if self.disposition != disposition:
            self.disposition = disposition
            update_fields.append("disposition")

        if self.disposition_source != source:
            self.disposition_source = source
            update_fields.append("disposition_source")

        stripped_note = note.strip()
        if stripped_note:
            existing_notes = (self.disposition_notes or "").strip()
            if stripped_note not in existing_notes:
                self.disposition_notes = (
                    f"{existing_notes}\n{stripped_note}" if existing_notes else stripped_note
                )
                update_fields.append("disposition_notes")

        if not update_fields:
            return False

        self.save(update_fields=[*update_fields, "updated_at"])

        from hmis.apps.core.models import AuditLog

        AuditLog.log(
            action="encounter_disposition_auto_set",
            user=None,
            resource_type="Encounter",
            resource_id=self.id,
            patient_id=self.patient_id,
            facility=getattr(self, "facility", None),
            organization=getattr(self, "organization", None),
            details={
                "trigger": trigger,
                "old": {
                    "disposition": old_disposition,
                    "disposition_notes": old_disposition_notes,
                    "disposition_source": old_source,
                },
                "new": {
                    "disposition": self.disposition,
                    "disposition_notes": self.disposition_notes or "",
                    "disposition_source": self.disposition_source,
                },
            },
        )
        return True

    def cancel(self, reason: str = "") -> None:
        """
        Cancel the encounter.

        Sets status to CANCELLED and records the reason.

        Args:
            reason: The reason for cancellation

        Raises:
            ValidationError: If the encounter is already CLOSED or CANCELLED
        """
        from django.core.exceptions import ValidationError

        if self.status == "CLOSED":
            raise ValidationError(
                "Cannot cancel a closed encounter. Closed encounters require a correction workflow."
            )

        if self.status == "CANCELLED":
            # Already cancelled, no action needed
            return

        if not self.is_valid_transition("CANCELLED"):
            raise ValidationError(f"Cannot cancel encounter with status '{self.status}'.")

        self.status = "CANCELLED"
        self.cancellation_reason = reason
        self.save(update_fields=["status", "cancellation_reason", "updated_at"])

    def _validate_close_requirements(self) -> None:
        """
        Validate that the encounter has sufficient documentation before closing.

        An encounter can be closed if ANY of the following are true:
        - Has at least one diagnosis
        - Has a treatment plan
        - Has at least one prescription
        - Has disposition set to ADVICE_ONLY, REFERRED, ADMITTED, FOLLOW_UP_SCHEDULED, or LEFT_AMA

        For ADVICE_ONLY and LEFT_AMA dispositions, disposition_notes are required.
        For REFERRED disposition without other documentation, notes are required.

        Raises:
            ValidationError: If documentation requirements are not met.
        """
        from django.core.exceptions import ValidationError

        # Check for clinical documentation
        has_diagnosis = self.diagnoses.exists()
        has_treatment_plan = hasattr(self, "treatment_plan") and self.treatment_plan is not None
        has_prescription = self.prescriptions.exists() if hasattr(self, "prescriptions") else False

        has_documentation = has_diagnosis or has_treatment_plan or has_prescription

        # Check disposition-based closure
        dispositions_requiring_notes = {"ADVICE_ONLY", "LEFT_AMA"}
        dispositions_allowing_close = {
            "ADVICE_ONLY",
            "REFERRED",
            "ADMITTED",
            "FOLLOW_UP_SCHEDULED",
            "LEFT_AMA",
            "TREATED_DISCHARGED",
        }

        if has_documentation:
            # Has clinical documentation, can close without explicit disposition
            return

        # No clinical documentation - need explicit disposition
        if not self.disposition:
            raise ValidationError(
                "Cannot close encounter without clinical documentation (diagnosis, treatment plan, or prescription). "
                "Either add documentation or set a disposition (e.g., 'Advice Only', 'Referred')."
            )

        if self.disposition not in dispositions_allowing_close:
            raise ValidationError(
                f"Disposition '{self.disposition}' is not sufficient to close without clinical documentation."
            )

        # Check notes requirement for specific dispositions
        if self.disposition in dispositions_requiring_notes and not self.disposition_notes:
            disposition_display = dict(self.DISPOSITION_CHOICES).get(
                self.disposition, self.disposition
            )
            raise ValidationError(
                f"'{disposition_display}' disposition requires disposition notes documenting the advice given."
            )

        # REFERRED without other documentation needs notes
        if self.disposition == "REFERRED" and not self.disposition_notes:
            raise ValidationError(
                "Referred encounters require disposition notes specifying the referral details."
            )

    def get_spo2_interpretation(self) -> dict | None:
        """
        Get SpO2 interpretation with age-appropriate classification and disclaimer.

        Returns:
            dict | None: Dictionary with classification, status, message and disclaimer,
                        or None if SpO2 not recorded.
        """
        if self.spo2 is None:
            return None

        spo2_val = float(self.spo2)
        status = self.get_vital_status("spo2")
        age_group = self.get_pediatric_age_group()

        # Determine classification based on value
        if spo2_val >= 97:
            classification = "Normal (Ideal)"
        elif spo2_val >= 95:
            classification = "Normal"
        elif spo2_val >= 92:
            classification = "Mildly low - monitor"
        elif spo2_val >= 90:
            classification = "Low - medical advice recommended"
        else:
            classification = "CRITICAL - urgent evaluation needed"

        # Build interpretation message
        if age_group == "infant":
            age_note = (
                "For infants (<1yr): values 92-94% are borderline and often monitored closely."
            )
        elif age_group in ("newborn", "toddler", "preschool", "school_age", "adolescent"):
            age_note = "Children may compensate well even with low SpO2. Watch for symptoms: fast breathing, chest retractions, blue lips/nails, lethargy."
        else:
            age_note = (
                "Adults: persistent SpO2 <92% or any reading <90% warrants medical attention."
            )

        return {
            "value": spo2_val,
            "status": status,
            "classification": classification,
            "age_group_note": age_note,
            "altitude_disclaimer": (
                "Note: SpO2 readings can be affected by altitude. At higher elevations (>2500m/8000ft), "
                "normal SpO2 may be 1-5% lower than at sea level. Patients acclimatized to high altitude "
                "may have baseline SpO2 of 90-95% which is normal for their location."
            ),
            "when_to_seek_help": (
                "Seek medical help if: SpO2 persistently below 92%, any reading below 90%, "
                "rapid drop from normal, breathing difficulty, chest pain, confusion, or bluish color."
            ),
        }

    # Vital sign ranges for status classification (Adult defaults)
    # Temperature aligned with triage thresholds:
    # - Normal: 36-37.5°C
    # - Warning low: 32-36°C (mild 35-36, moderate 32-35)
    # - Warning high: 37.6-39.9°C (low-grade 37.6-38.4, moderate 38.5-39.9)
    # - Critical low: <32°C (severe hypothermia)
    # - Critical high: ≥40°C (high fever / hyperpyrexia)
    VITAL_RANGES = {
        "temperature": {
            "unit": "°C",
            "normal": (36.0, 37.5),
            "warning_low": (32.0, 35.9),
            "warning_high": (37.6, 39.9),
            "critical_low": 32.0,
            "critical_high": 40.0,
        },
        "pulse": {
            "unit": "bpm",
            "normal": (60, 100),
            "warning_low": (50, 59),
            "warning_high": (101, 120),
            "critical_low": 50,
            "critical_high": 120,
        },
        "systolic_bp": {
            "unit": "mmHg",
            "normal": (90, 120),
            "warning_low": None,  # No warning, jump to critical
            "warning_high": (121, 139),
            "critical_low": 90,  # <90 is hypotension
            "critical_high": 140,
        },
        "diastolic_bp": {
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
            "warning_low": (90, 94),  # Mildly low - monitor, especially if symptoms
            "warning_high": None,
            "critical_low": 90,  # <90% is critical - requires urgent evaluation
            "critical_high": None,
        },
    }

    # Age-specific SpO2 ranges (used in addition to base ranges)
    # Note: SpO2 interpretation should also consider altitude
    SPO2_AGE_RANGES = {
        "infant": {  # < 1 year
            "normal": (95, 100),
            "borderline": (92, 94),  # Often monitored closely
            "critical": 90,  # <90% requires urgent care
        },
        "child": {  # 1-17 years
            "normal": (95, 100),
            "mildly_low": (92, 94),  # Monitor, especially if symptoms
            "low": (90, 91),  # Medical advice recommended
            "critical": 90,  # <90% requires urgent evaluation
        },
        "adult": {  # ≥18 years
            "normal": (95, 100),
            "mildly_low": (92, 94),  # Monitor, especially if symptoms
            "low": (90, 91),  # Medical advice recommended
            "critical": 90,  # <90% requires urgent evaluation
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
            "systolic_bp": {
                "unit": "mmHg",
                "normal": (60, 90),
                "warning_low": (50, 59),
                "warning_high": (91, 105),
                "critical_low": 50,
                "critical_high": 105,
            },
            "diastolic_bp": {
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
            "systolic_bp": {
                "unit": "mmHg",
                "normal": (72, 104),
                "warning_low": (65, 71),
                "warning_high": (105, 115),
                "critical_low": 65,
                "critical_high": 115,
            },
            "diastolic_bp": {
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
            "systolic_bp": {
                "unit": "mmHg",
                "normal": (86, 106),
                "warning_low": (75, 85),
                "warning_high": (107, 120),
                "critical_low": 75,
                "critical_high": 120,
            },
            "diastolic_bp": {
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
            "systolic_bp": {
                "unit": "mmHg",
                "normal": (89, 112),
                "warning_low": (80, 88),
                "warning_high": (113, 125),
                "critical_low": 80,
                "critical_high": 125,
            },
            "diastolic_bp": {
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
            "systolic_bp": {
                "unit": "mmHg",
                "normal": (97, 120),
                "warning_low": (85, 96),
                "warning_high": (121, 135),
                "critical_low": 85,
                "critical_high": 135,
            },
            "diastolic_bp": {
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
            "systolic_bp": {
                "unit": "mmHg",
                "normal": (90, 120),
                "warning_low": (80, 89),
                "warning_high": (121, 139),
                "critical_low": 80,
                "critical_high": 140,
            },
            "diastolic_bp": {
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
        if isinstance(encounter_date, str):
            try:
                encounter_date = date.fromisoformat(encounter_date)
            except ValueError:
                return 0

        dob = self.patient.date_of_birth
        if isinstance(dob, str):
            try:
                dob = date.fromisoformat(dob)
            except ValueError:
                return 0

        delta = encounter_date - dob
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
            vital_name: Name of the vital sign (temperature, pulse, systolic_bp,
                       diastolic_bp, respiratory_rate, spo2)

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
        elif vital_name == "systolic_bp":
            value = self.get_systolic_bp()
        elif vital_name == "diastolic_bp":
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
        if ranges.get("critical_high") and value >= ranges["critical_high"]:
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
            statuses["systolic_bp"] = {
                "value": systolic,
                "status": self.get_vital_status("systolic_bp"),
                "unit": "mmHg",
            }
        else:
            statuses["systolic_bp"] = None

        # Blood pressure diastolic
        diastolic = self.get_diastolic_bp()
        if diastolic:
            statuses["diastolic_bp"] = {
                "value": diastolic,
                "status": self.get_vital_status("diastolic_bp"),
                "unit": "mmHg",
            }
        else:
            statuses["diastolic_bp"] = None

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

        # Include MAP in statuses
        map_value = self.get_map()
        if map_value is not None:
            statuses["map"] = {
                "value": map_value,
                "status": self.get_map_status(),
                "unit": "mmHg",
            }
        else:
            statuses["map"] = None

        return statuses

    # MAP (Mean Arterial Pressure) ranges by age group
    # Based on clinical guidelines for organ perfusion
    # Reference: Pediatric and Adult Critical Care Guidelines
    MAP_RANGES_BY_AGE = {
        "adult": {  # ≥18 years
            "normal": (70, 100),
            "warning_low": (65, 69),
            "warning_high": (101, 105),
            "critical_low": 65,
            "critical_high": 120,
            "emergency_low": 55,
            "emergency_high": 130,
        },
        "adolescent": {  # 13-17 years
            "normal": (65, 95),
            "warning_low": (60, 64),
            "warning_high": (96, 100),
            "critical_low": 60,
            "critical_high": 115,
            "emergency_low": 50,
            "emergency_high": 125,
        },
        "school_age": {  # 6-12 years
            "normal": (60, 90),
            "warning_low": (55, 59),
            "warning_high": (91, 95),
            "critical_low": 55,
            "critical_high": 110,
            "emergency_low": 45,
            "emergency_high": 120,
        },
        "young_child": {  # 1-5 years
            "normal": (55, 85),
            "warning_low": (50, 54),
            "warning_high": (86, 90),
            "critical_low": 50,
            "critical_high": 100,
            "emergency_low": 40,
            "emergency_high": 110,
        },
        "infant": {  # 1-12 months
            "normal": (45, 70),
            "warning_low": (40, 44),
            "warning_high": (71, 75),
            "critical_low": 40,
            "critical_high": 90,
            "emergency_low": 30,
            "emergency_high": 100,
        },
        "neonate": {  # <1 month
            "normal": (40, 60),
            "warning_low": (35, 39),
            "warning_high": (61, 65),
            "critical_low": 35,
            "critical_high": 80,
            "emergency_low": 25,
            "emergency_high": 90,
        },
    }

    # Default MAP ranges for backward compatibility (adult values)
    MAP_RANGES = {
        "normal": (70, 100),
        "low": (65, 69),
        "high": (101, 105),
        "critical_low": 65,
        "critical_high": 120,
    }

    def _get_map_age_group(self) -> str:
        """Get age group for MAP thresholds."""
        age_years = self.get_patient_age_years()
        if age_years >= 18:
            return "adult"
        if age_years >= 13:
            return "adolescent"
        if age_years >= 6:
            return "school_age"
        if age_years >= 1:
            return "young_child"
        age_days = self.get_patient_age_days()
        if age_days >= 29:
            return "infant"
        return "neonate"

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

    def get_map_status(self) -> str | None:
        """
        Get status classification for Mean Arterial Pressure.
        Uses age-adjusted thresholds for accurate assessment.

        Status values:
        - 'normal': Within normal range for age
        - 'warning': Slightly abnormal, monitor closely
        - 'critical': Requires immediate attention
        - 'emergency': Life-threatening, immediate intervention needed

        Returns:
            str | None: Status string, or None if BP not recorded
        """
        map_value = self.get_map()

        if map_value is None:
            return None

        # Get age-appropriate ranges
        age_group = self._get_map_age_group()
        ranges = self.MAP_RANGES_BY_AGE.get(age_group, self.MAP_RANGES_BY_AGE["adult"])

        # Check emergency first (most severe)
        if map_value < ranges["emergency_low"]:
            return "emergency"
        if map_value > ranges["emergency_high"]:
            return "emergency"

        # Check critical
        if map_value < ranges["critical_low"]:
            return "critical"
        if map_value > ranges["critical_high"]:
            return "critical"

        # Check normal
        normal_min, normal_max = ranges["normal"]
        if normal_min <= map_value <= normal_max:
            return "normal"

        # Check warning (between normal and critical)
        warning_low_min, warning_low_max = ranges["warning_low"]
        if warning_low_min <= map_value <= warning_low_max:
            return "warning"

        warning_high_min, warning_high_max = ranges["warning_high"]
        if warning_high_min <= map_value <= warning_high_max:
            return "warning"

        # Edge case - classify as warning
        return "warning"

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

    # =========================================================================
    # Billing Integration Methods (Sprint 1.5-1.6)
    # =========================================================================

    def get_invoice(self):
        """
        Get or create the invoice associated with this encounter.

        Returns:
            Invoice: The invoice for this encounter, or None if none exists.
        """
        from hmis.apps.billing.models import Invoice

        return Invoice.objects.filter(encounter=self).first()

    def add_service(self, service, quantity: int = 1):
        """
        Add a service to this encounter's invoice.

        Creates an InvoiceItem linked to the encounter's invoice.
        If the same service already exists, updates the quantity.

        Args:
            service: The Service instance to add
            quantity: The quantity of the service (default 1)

        Returns:
            InvoiceItem: The created or updated invoice item

        Raises:
            ValidationError: If the encounter is completed or has no invoice
        """
        from decimal import Decimal

        from django.core.exceptions import ValidationError

        from hmis.apps.billing.models import Invoice, InvoiceItem

        # Validate encounter status
        if self.status == "COMPLETED":
            raise ValidationError("Cannot add services to a completed encounter.")

        # Get the encounter's invoice
        invoice = self.get_invoice()
        if not invoice:
            raise ValidationError("Encounter has no associated invoice.")

        # Check if invoice is editable
        if invoice.status not in [Invoice.Status.DRAFT]:
            raise ValidationError(f"Cannot add services to invoice with status '{invoice.status}'.")

        # Check if same service already exists on this invoice
        existing_item = invoice.items.filter(service=service).first()

        if existing_item:
            # Update quantity
            existing_item.quantity += quantity
            existing_item.line_total = (existing_item.quantity * existing_item.unit_price).quantize(
                Decimal("0.01")
            )
            existing_item.save(update_fields=["quantity", "line_total", "updated_at"])
            item = existing_item
        else:
            # Create new invoice item
            item = InvoiceItem.objects.create(
                invoice=invoice,
                item_type=InvoiceItem.ItemType.SERVICE,
                service=service,
                description=service.name,
                quantity=quantity,
                unit_price=service.unit_price,
                line_total=(service.unit_price * Decimal(str(quantity))).quantize(Decimal("0.01")),
            )

        # Recalculate invoice totals
        invoice.calculate_totals()
        invoice.save(
            update_fields=[
                "subtotal",
                "tax_amount",
                "discount_amount",
                "total_amount",
                "balance_due",
                "updated_at",
            ]
        )

        return item

    def complete(self):
        """
        Complete the encounter and finalize its invoice.

        Changes the encounter status to COMPLETED and the associated
        invoice status from DRAFT to PENDING.

        Raises:
            ValidationError: If the encounter is already completed
        """
        from django.core.exceptions import ValidationError

        from hmis.apps.billing.models import Invoice

        if self.status == "COMPLETED":
            raise ValidationError("Encounter is already completed.")

        # Change encounter status
        self.status = "COMPLETED"
        self.save(update_fields=["status", "updated_at"])

        # Finalize the invoice
        invoice = self.get_invoice()
        if invoice and invoice.status == Invoice.Status.DRAFT:
            invoice.status = Invoice.Status.PENDING
            invoice.save(update_fields=["status", "updated_at"])
