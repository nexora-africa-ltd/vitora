"""
Triage models for Vitora HMIS.

This module implements the Kenya Emergency Triage Assessment (KETA) system
for patient prioritization and queue management.

Sprint 1.5-1.6 Track E: Triage Module MVP
"""

from decimal import Decimal
from datetime import timedelta
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


class TriageAssessment(models.Model):
    """
    Triage assessment linked to an encounter.
    Captures initial patient assessment and KETA priority categorization.
    """

    # Chief Complaint Categories
    CHIEF_COMPLAINT_CHOICES = [
        ("CHEST_PAIN", "Chest Pain"),
        ("DIFFICULTY_BREATHING", "Difficulty Breathing"),
        ("TRAUMA", "Trauma/Injury"),
        ("FEVER", "Fever"),
        ("ABDOMINAL_PAIN", "Abdominal Pain"),
        ("HEADACHE", "Headache"),
        ("ALTERED_CONSCIOUSNESS", "Altered Consciousness"),
        ("BLEEDING", "Bleeding"),
        ("POISONING", "Poisoning/Overdose"),
        ("OBSTETRIC", "Obstetric Emergency"),
        ("PEDIATRIC", "Pediatric Emergency"),
        ("OTHER", "Other"),
    ]

    # AVPU Mental Status Scale
    MENTAL_STATUS_CHOICES = [
        ("A", "Alert"),
        ("V", "Responds to Voice"),
        ("P", "Responds to Pain"),
        ("U", "Unresponsive"),
    ]

    # Mobility Status
    MOBILITY_CHOICES = [
        ("AMBULATORY", "Ambulatory"),
        ("WHEELCHAIR", "Wheelchair"),
        ("STRETCHER", "Stretcher"),
        ("IMMOBILE", "Immobile/Carried"),
    ]

    # Arrival Mode
    ARRIVAL_MODE_CHOICES = [
        ("WALK_IN", "Walk-in"),
        ("AMBULANCE", "Ambulance"),
        ("POLICE", "Police"),
        ("REFERRAL", "Referral from another facility"),
        ("OTHER", "Other"),
    ]

    # KETA Triage Categories (Kenya Emergency Triage Assessment)
    TRIAGE_CATEGORY_CHOICES = [
        ("RED", "Emergency - Immediate"),
        ("ORANGE", "Very Urgent - <10 min"),
        ("YELLOW", "Urgent - <60 min"),
        ("GREEN", "Standard - <240 min"),
        ("BLUE", "Non-Urgent/Referral"),
    ]

    # Care Area Assignment
    ASSIGNED_AREA_CHOICES = [
        ("ER_RESUS", "ER - Resuscitation"),
        ("ER_ACUTE", "ER - Acute Care"),
        ("ER_FAST_TRACK", "ER - Fast Track"),
        ("OBSERVATION", "Observation Unit"),
        ("OPD", "Outpatient Department"),
        ("TRAUMA", "Trauma Bay"),
        ("PEDIATRIC_ER", "Pediatric ER"),
        ("MATERNITY", "Maternity/Labor"),
        ("SPECIALTY", "Specialty Clinic"),
    ]

    # Target wait times by category (in minutes)
    TARGET_WAIT_TIMES = {
        "RED": 0,  # Immediate
        "ORANGE": 10,  # Very Urgent
        "YELLOW": 60,  # Urgent
        "GREEN": 240,  # Standard
        "BLUE": 480,  # Non-Urgent
    }

    # Category priority for sorting (lower number = higher priority)
    CATEGORY_PRIORITY = {
        "RED": 1,
        "ORANGE": 2,
        "YELLOW": 3,
        "GREEN": 4,
        "BLUE": 5,
    }

    # Core Relationship
    encounter = models.OneToOneField(
        "encounters.Encounter", on_delete=models.CASCADE, related_name="triage_assessment"
    )

    # Clinical Assessment
    chief_complaint = models.TextField(help_text="Primary reason for visit")
    chief_complaint_category = models.CharField(
        max_length=50, choices=CHIEF_COMPLAINT_CHOICES, help_text="Chief complaint category"
    )
    pain_score = models.IntegerField(
        validators=[MinValueValidator(0), MaxValueValidator(10)],
        null=True,
        blank=True,
        help_text="Pain level 0-10",
    )
    mental_status = models.CharField(
        max_length=1, choices=MENTAL_STATUS_CHOICES, help_text="AVPU mental status scale"
    )
    mobility = models.CharField(
        max_length=20, choices=MOBILITY_CHOICES, help_text="Patient mobility status"
    )
    arrival_mode = models.CharField(
        max_length=20, choices=ARRIVAL_MODE_CHOICES, default="WALK_IN", help_text="How patient arrived"
    )
    allergies_noted = models.TextField(
        blank=True,
        default="",
        help_text="Allergies noted at triage (snapshot from patient record)",
    )

    # Triage Decision
    triage_category = models.CharField(
        max_length=10, choices=TRIAGE_CATEGORY_CHOICES, help_text="Final triage category"
    )
    auto_calculated_category = models.CharField(
        max_length=10,
        choices=TRIAGE_CATEGORY_CHOICES,
        help_text="System-suggested category before nurse override",
    )
    category_override_reason = models.TextField(
        blank=True,
        default="",
        help_text="Required if nurse overrides system suggestion",
    )

    # Routing
    assigned_area = models.CharField(
        max_length=30, choices=ASSIGNED_AREA_CHOICES, help_text="Care area assignment"
    )
    assigned_clinician = models.ForeignKey(
        "auth.User",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="triage_assignments",
        help_text="Clinician assigned to this patient",
    )

    # Critical Timestamps
    arrival_time = models.DateTimeField(help_text="When patient arrived at facility")
    triage_start_time = models.DateTimeField(help_text="When triage assessment began")
    triage_end_time = models.DateTimeField(null=True, blank=True, help_text="When triage completed")
    seen_by_clinician_time = models.DateTimeField(
        null=True, blank=True, help_text="When patient was seen by clinician"
    )

    # Alerts
    alerts = models.JSONField(
        default=list, help_text="List of critical alerts generated", blank=True
    )

    # Audit
    triaged_by = models.ForeignKey(
        "auth.User",
        on_delete=models.PROTECT,
        related_name="triage_assessments_performed",
        help_text="User who performed triage",
    )

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-arrival_time"]
        verbose_name = "Triage Assessment"
        verbose_name_plural = "Triage Assessments"
        permissions = [
            ("perform_triage", "Can perform triage assessments"),
            ("view_triage_queue", "Can view triage queue"),
            ("override_triage_category", "Can override triage category"),
        ]

    def __str__(self) -> str:
        return f"Triage {self.triage_category} - {self.encounter.patient} - {self.arrival_time}"

    @property
    def category_priority(self) -> int:
        """Get numeric priority for sorting (lower = higher priority)."""
        return self.CATEGORY_PRIORITY.get(self.triage_category, 99)

    def calculate_triage_category(self) -> str:
        """
        Calculate triage category based on vitals and symptoms.
        Returns suggested KETA category (RED/ORANGE/YELLOW/GREEN/BLUE).
        """
        vitals = {}

        # Get vitals from encounter
        if hasattr(self.encounter, "spo2") and self.encounter.spo2:
            vitals["spo2"] = self.encounter.spo2
        if hasattr(self.encounter, "pulse") and self.encounter.pulse:
            vitals["heart_rate"] = self.encounter.pulse
        if hasattr(self.encounter, "blood_pressure") and self.encounter.blood_pressure:
            # Parse blood pressure (format: "120/80")
            bp_parts = self.encounter.blood_pressure.split("/")
            if len(bp_parts) == 2:
                try:
                    vitals["systolic_bp"] = int(bp_parts[0])
                    vitals["diastolic_bp"] = int(bp_parts[1])
                except ValueError:
                    pass

        # Check RED criteria (immediate)
        if self.mental_status in ["U", "P"]:
            return "RED"

        if vitals.get("spo2") and vitals["spo2"] < 90:
            return "RED"

        if vitals.get("systolic_bp"):
            if vitals["systolic_bp"] < 90 or vitals["systolic_bp"] > 180:
                return "RED"

        if vitals.get("heart_rate"):
            if vitals["heart_rate"] < 40 or vitals["heart_rate"] > 150:
                return "RED"

        # Check ORANGE criteria (very urgent)
        if self.chief_complaint_category == "CHEST_PAIN" and (
            vitals.get("systolic_bp", 0) > 140 or self.pain_score and self.pain_score >= 7
        ):
            return "ORANGE"

        if (
            self.chief_complaint_category == "DIFFICULTY_BREATHING"
            and vitals.get("spo2")
            and vitals["spo2"] < 95
        ):
            return "ORANGE"

        if self.pain_score and self.pain_score >= 9:
            return "ORANGE"

        # Check YELLOW criteria (urgent)
        if self.pain_score and self.pain_score >= 7:
            return "YELLOW"

        if self.chief_complaint_category == "FEVER" and vitals.get("spo2") and vitals["spo2"] < 95:
            return "YELLOW"

        # GREEN (standard)
        if self.chief_complaint_category in ["FEVER", "HEADACHE", "ABDOMINAL_PAIN"]:
            return "GREEN"

        # BLUE (non-urgent)
        return "BLUE"

    def get_wait_time_minutes(self) -> int:
        """Calculate time in minutes since arrival."""
        now = timezone.now()
        delta = now - self.arrival_time
        return int(delta.total_seconds() / 60)

    def is_wait_time_exceeded(self) -> bool:
        """Check if patient has exceeded target wait time for their category."""
        target = self.TARGET_WAIT_TIMES.get(self.triage_category, 240)
        wait_time = self.get_wait_time_minutes()
        return wait_time > target

    def generate_alerts(self) -> list[str]:
        """Generate alerts based on vitals and symptoms."""
        alerts = []

        # Mental status alerts
        if self.mental_status == "U":
            alerts.append("CRITICAL: Patient unresponsive (AVPU=U)")
        elif self.mental_status == "P":
            alerts.append("CRITICAL: Patient only responds to pain (AVPU=P)")
        elif self.mental_status == "V":
            alerts.append("WARNING: Patient only responds to voice (AVPU=V)")

        # Get vitals from encounter
        if hasattr(self.encounter, "spo2") and self.encounter.spo2:
            if self.encounter.spo2 < 90:
                alerts.append(f"CRITICAL: Severe hypoxemia (SpO2 {self.encounter.spo2}%)")
            elif self.encounter.spo2 < 95:
                alerts.append(f"WARNING: Low oxygen saturation (SpO2 {self.encounter.spo2}%)")

        if hasattr(self.encounter, "pulse") and self.encounter.pulse:
            if self.encounter.pulse < 40:
                alerts.append(f"CRITICAL: Severe bradycardia (HR {self.encounter.pulse} bpm)")
            elif self.encounter.pulse > 150:
                alerts.append(f"CRITICAL: Severe tachycardia (HR {self.encounter.pulse} bpm)")
            elif self.encounter.pulse < 50:
                alerts.append(f"WARNING: Bradycardia (HR {self.encounter.pulse} bpm)")
            elif self.encounter.pulse > 100:
                alerts.append(f"WARNING: Tachycardia (HR {self.encounter.pulse} bpm)")

        if hasattr(self.encounter, "blood_pressure") and self.encounter.blood_pressure:
            bp_parts = self.encounter.blood_pressure.split("/")
            if len(bp_parts) == 2:
                try:
                    systolic = int(bp_parts[0])
                    if systolic < 90:
                        alerts.append(f"CRITICAL: Severe hypotension (BP {self.encounter.blood_pressure})")
                    elif systolic > 180:
                        alerts.append(
                            f"CRITICAL: Severe hypertension (BP {self.encounter.blood_pressure})"
                        )
                    elif systolic > 140:
                        alerts.append(f"WARNING: Elevated blood pressure (BP {self.encounter.blood_pressure})")
                except ValueError:
                    pass

        # Pain score alerts
        if self.pain_score:
            if self.pain_score >= 9:
                alerts.append(f"CRITICAL: Severe pain (score {self.pain_score}/10)")
            elif self.pain_score >= 7:
                alerts.append(f"WARNING: Significant pain (score {self.pain_score}/10)")

        # Chief complaint specific alerts
        if self.chief_complaint_category == "CHEST_PAIN":
            alerts.append("ALERT: Chest pain - cardiac evaluation recommended")
        elif self.chief_complaint_category == "DIFFICULTY_BREATHING":
            alerts.append("ALERT: Difficulty breathing - respiratory assessment needed")
        elif self.chief_complaint_category == "ALTERED_CONSCIOUSNESS":
            alerts.append("ALERT: Altered consciousness - neurological assessment needed")

        return alerts


class TriageQueue(models.Model):
    """
    Active triage queue entry for a patient awaiting care.
    Removed when patient is seen by clinician or leaves.
    """

    STATUS_CHOICES = [
        ("WAITING", "Waiting"),
        ("CALLED", "Called"),
        ("WITH_CLINICIAN", "With Clinician"),
        ("COMPLETED", "Completed"),
        ("LEFT_WITHOUT_BEING_SEEN", "Left Without Being Seen (LWBS)"),
    ]

    triage_assessment = models.OneToOneField(
        TriageAssessment, on_delete=models.CASCADE, related_name="queue_entry"
    )
    position = models.IntegerField(help_text="Queue position (auto-calculated by priority)")
    status = models.CharField(max_length=30, choices=STATUS_CHOICES, default="WAITING")
    called_at = models.DateTimeField(null=True, blank=True)
    called_by = models.ForeignKey(
        "auth.User",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="queue_calls",
    )
    notes = models.TextField(blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        # Note: Ordering by category needs to be done in Python since we need priority-based sorting
        # Default ordering is by arrival time
        ordering = ["triage_assessment__arrival_time"]
        verbose_name = "Triage Queue Entry"
        verbose_name_plural = "Triage Queue Entries"

    def __str__(self) -> str:
        return f"Queue {self.position} - {self.triage_assessment.triage_category} - {self.status}"

    @classmethod
    def get_active_queue(cls, area: str = None):
        """Get active queue entries, optionally filtered by area.
        
        Returns queryset sorted by triage priority (RED first) then arrival time (FIFO).
        """
        queryset = cls.objects.exclude(status__in=["COMPLETED", "LEFT_WITHOUT_BEING_SEEN"]).select_related('triage_assessment')
        
        if area:
            queryset = queryset.filter(triage_assessment__assigned_area=area)
        
        # Convert to list and sort by priority then arrival time
        queue_list = list(queryset)
        queue_list.sort(key=lambda x: (
            x.triage_assessment.category_priority,
            x.triage_assessment.arrival_time
        ))
        
        return queue_list

    @classmethod
    def recalculate_positions(cls):
        """Recalculate all queue positions based on priority ordering."""
        active_queue = cls.get_active_queue()
        for index, entry in enumerate(active_queue, start=1):
            entry.position = index
            entry.save(update_fields=["position"])

    def mark_called(self, called_by):
        """Mark patient as called."""
        self.status = "CALLED"
        self.called_at = timezone.now()
        self.called_by = called_by
        self.save(update_fields=["status", "called_at", "called_by"])

    def mark_with_clinician(self):
        """Mark patient as with clinician, update triage timestamps."""
        self.status = "WITH_CLINICIAN"
        self.save(update_fields=["status"])
        
        # Update assessment timestamp
        self.triage_assessment.seen_by_clinician_time = timezone.now()
        self.triage_assessment.save(update_fields=["seen_by_clinician_time"])

    def mark_completed(self):
        """Mark queue entry as completed."""
        self.status = "COMPLETED"
        self.save(update_fields=["status"])

    def mark_lwbs(self, reason: str = ""):
        """Mark patient as Left Without Being Seen."""
        self.status = "LEFT_WITHOUT_BEING_SEEN"
        if reason:
            self.notes = f"{self.notes}\nLWBS Reason: {reason}".strip()
        self.save(update_fields=["status", "notes"])
