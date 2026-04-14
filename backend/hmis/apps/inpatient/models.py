"""
Inpatient models for Vitora HMIS.

Sprint 1.5-1.6 Track D: Inpatient Foundation

This module implements the core IPD models including:
- Ward: Hospital wards for inpatient care
- Bed: Individual beds within wards
- AdmissionRecommendation: OPD → IPD admission recommendations
- Admission: Inpatient admission records
- WardRound: Daily ward round documentation
- NursingKardex: Nursing care coordination
- ShiftHandover: Ward shift handovers
- Transfer: Patient transfers between wards
- Discharge: Patient discharge records
"""

from __future__ import annotations

from datetime import timedelta
from decimal import Decimal
from typing import TYPE_CHECKING

from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError
from django.core.validators import MinValueValidator
from django.db import models
from django.db.models import Q
from django.utils import timezone

from hmis.apps.core.mixins import FacilityScopedModel
from hmis.apps.core.models import TimeStampedModel

if TYPE_CHECKING:
    from django.contrib.auth.models import AbstractUser
    from django.db.models import QuerySet

User = get_user_model()


def default_recommendation_expiry():
    return timezone.now() + timedelta(hours=24)


MATERNITY_CONTINUITY_ACTION_CHOICES = [
    ("NONE", "No Continuity Action"),
    ("CONTINUE_POSTPARTUM_OBSERVATION", "Continue Postpartum Observation"),
    ("SCHEDULE_EARLY_PNC", "Schedule Early PNC"),
    ("ROUTE_TO_PNC_QUEUE", "Route To PNC Queue"),
]

MATERNITY_DISCHARGE_CONTINUITY_ACTIONS = {
    "SCHEDULE_EARLY_PNC",
    "ROUTE_TO_PNC_QUEUE",
}

MATERNITY_CONTINUITY_STATUS_CHOICES = [
    ("NOT_APPLICABLE", "Not Applicable"),
    ("SCHEDULED", "Scheduled"),
    ("QUEUED", "Queued"),
]


class Ward(TimeStampedModel):
    """
    Hospital ward for inpatient care.

    Represents a physical ward within the hospital with bed capacity
    and daily charging rates.

    Attributes:
        name: Unique ward name (e.g., "Medical Ward 1")
        code: Unique ward code (e.g., "MED-01")
        ward_type: Type of ward (MEDICAL, SURGICAL, etc.)
        floor: Floor location (optional)
        capacity: Total bed count
        description: Ward description (optional)
        is_active: Whether ward is currently active
        daily_rate: Bed charge per day
    """

    # Type hints for reverse relations
    beds: QuerySet[Bed]
    admissions: QuerySet[Admission]
    transfers_out: QuerySet[Transfer]
    transfers_in: QuerySet[Transfer]
    shift_handovers: QuerySet[ShiftHandover]

    WARD_TYPE_CHOICES = [
        ("MEDICAL", "Medical Ward"),
        ("SURGICAL", "Surgical Ward"),
        ("PEDIATRIC", "Pediatric Ward"),
        ("MATERNITY", "Maternity Ward"),
        ("ICU", "Intensive Care Unit"),
        ("ISOLATION", "Isolation Ward"),
    ]

    # Compatibility constraints
    GENDER_RESTRICTION_CHOICES = [
        ("ANY", "Any Gender"),
        ("MALE_ONLY", "Male Only"),
        ("FEMALE_ONLY", "Female Only"),
    ]

    # Default age ranges by ward type (applied only on create, and only for unset values)
    WARD_TYPE_AGE_DEFAULTS = {
        "PEDIATRIC": {"min_age_years": 0, "max_age_years": 14},
        "MATERNITY": {"min_age_years": 12, "max_age_years": 55},
    }

    # Ward type → auto-applied capability defaults (on create or ward_type change)
    WARD_TYPE_CAPABILITY_DEFAULTS: dict[str, dict[str, object]] = {
        "MATERNITY": {
            "maternity_designated": True,
            "gender_restriction": "FEMALE_ONLY",
        },
        "ISOLATION": {
            "isolation_capable": True,
        },
        "ICU": {
            "oxygen_equipped": True,
            "ventilator_capable": True,
            "isolation_capable": True,
        },
        "PEDIATRIC": {},  # age defaults handled separately via WARD_TYPE_AGE_DEFAULTS
    }

    organization = models.ForeignKey(
        "core.Organization",
        on_delete=models.CASCADE,
        related_name="wards",
        null=True,
        blank=True,
        help_text="Owning organization (auto-set from facility).",
    )
    facility = models.ForeignKey(
        "core.Facility",
        on_delete=models.CASCADE,
        related_name="wards",
        null=True,
        blank=True,
        help_text="Facility where this ward is located.",
    )
    name = models.CharField(
        max_length=100,
        unique=True,
        help_text="Unique ward name (e.g., 'Medical Ward 1')",
    )
    code = models.CharField(
        max_length=20,
        unique=True,
        help_text="Unique ward code (e.g., 'MED-01')",
    )
    ward_type = models.CharField(
        max_length=20,
        choices=WARD_TYPE_CHOICES,
        help_text="Type of ward",
    )
    floor = models.CharField(
        max_length=50,
        blank=True,
        default="",
        help_text="Floor location",
    )
    capacity = models.PositiveIntegerField(
        validators=[MinValueValidator(1)],
        help_text="Total bed count (must be positive)",
    )
    description = models.TextField(
        blank=True,
        default="",
        help_text="Ward description",
    )
    is_active = models.BooleanField(
        default=True,
        help_text="Whether ward is currently active",
    )
    daily_rate = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        validators=[MinValueValidator(Decimal("0.01"))],
        help_text="Bed charge per day (must be positive)",
    )

    # NEW: Gender constraints
    gender_restriction = models.CharField(
        max_length=20,
        choices=GENDER_RESTRICTION_CHOICES,
        default="ANY",
        help_text="Gender restriction for patient admission",
    )

    # NEW: Age constraints (null = no restriction)
    min_age_years = models.PositiveIntegerField(
        null=True,
        blank=True,
        help_text="Minimum patient age in years (null = no minimum)",
    )
    max_age_years = models.PositiveIntegerField(
        null=True,
        blank=True,
        help_text="Maximum patient age in years (null = no maximum)",
    )

    # NEW: Isolation capability
    isolation_capable = models.BooleanField(
        default=False,
        help_text="Whether ward can handle isolation patients",
    )

    # NEW: Special equipment/capability flags
    oxygen_equipped = models.BooleanField(
        default=False,
        help_text="Whether beds have oxygen supply",
    )
    ventilator_capable = models.BooleanField(
        default=False,
        help_text="Whether ward supports ventilated patients",
    )
    maternity_designated = models.BooleanField(
        default=False,
        help_text="Whether ward is designated for maternity patients (enforces female-only admission)",
    )

    # Phase C: Smart Allocation
    emergency_buffer_percent = models.PositiveIntegerField(
        default=0,
        help_text="Percentage of beds reserved for emergency admissions (0-100)",
    )

    # Scheduling Integration
    scheduling_resource = models.OneToOneField(
        "scheduling.Resource",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="ward",
        help_text="Linked scheduling resource (auto-created for PLACE type)",
    )

    class Meta(TimeStampedModel.Meta):
        """Meta options for Ward model."""

        ordering = ["name"]
        verbose_name = "Ward"
        verbose_name_plural = "Wards"

    def __str__(self):
        """Return string representation."""
        return f"{self.name} ({self.code})"

    def clean(self):
        """Validate ward data."""
        super().clean()
        if self.emergency_buffer_percent > 100:
            raise ValidationError(
                {"emergency_buffer_percent": "Buffer percentage cannot exceed 100."}
            )

    def save(self, *args, **kwargs):
        """Auto-populate compatibility defaults and create beds on ward creation."""
        is_new = self.pk is None

        # Auto-apply age defaults for known ward types (on create only, if unset)
        if is_new and self.ward_type in self.WARD_TYPE_AGE_DEFAULTS:
            defaults = self.WARD_TYPE_AGE_DEFAULTS[self.ward_type]
            if self.min_age_years is None:
                self.min_age_years = defaults.get("min_age_years")
            if self.max_age_years is None:
                self.max_age_years = defaults.get("max_age_years")

        # Auto-apply capability defaults from ward type
        capability_defaults = self.WARD_TYPE_CAPABILITY_DEFAULTS.get(self.ward_type, {})
        for field_name, default_value in capability_defaults.items():
            current = getattr(self, field_name, None)
            # For booleans: only set if currently False (don't override explicit True)
            # For choice fields: only set if currently at the neutral default
            if isinstance(default_value, bool):
                if not current:
                    setattr(self, field_name, default_value)
            elif field_name == "gender_restriction" and current == "ANY":
                setattr(self, field_name, default_value)

        # Maternity-designated wards must always be female-only
        if self.maternity_designated and self.gender_restriction != "FEMALE_ONLY":
            self.gender_restriction = "FEMALE_ONLY"

        super().save(*args, **kwargs)

        # Auto-generate beds for new wards
        if is_new and self.capacity > 0:
            self._generate_beds()

    def _generate_beds(self, start_number: int = 1) -> int:
        """
        Generate bed records up to ward capacity.

        Args:
            start_number: Starting bed number (default 1)

        Returns:
            Number of beds created
        """
        # Import here to avoid circular import at module level
        existing_count = self.beds.count()
        beds_to_create = self.capacity - existing_count

        if beds_to_create <= 0:
            return 0

        # Create beds with sequential numbering
        beds = []
        for i in range(beds_to_create):
            bed_num = existing_count + i + start_number
            beds.append(
                Bed(
                    ward=self,
                    bed_number=f"B-{bed_num:03d}",
                    status="AVAILABLE",
                )
            )

        Bed.objects.bulk_create(beds)
        return len(beds)

    def generate_missing_beds(self) -> int:
        """
        Generate any missing beds to match capacity.

        Returns:
            Number of beds created
        """
        return self._generate_beds()

    @property
    def available_beds(self) -> int:
        """
        Count of available beds (capacity minus occupied, cleaning, maintenance, reserved).

        Returns:
            Number of available beds
        """
        occupied = self.beds.filter(status="OCCUPIED").count()
        cleaning = self.beds.filter(status="CLEANING").count()
        maintenance = self.beds.filter(status="MAINTENANCE").count()
        reserved = self.beds.filter(status="RESERVED").count()
        return max(0, self.capacity - occupied - cleaning - maintenance - reserved)

    @property
    def total_beds(self) -> int:
        """
        Total bed capacity of this ward.

        Returns:
            Ward capacity (total number of beds)
        """
        return self.capacity

    @property
    def occupied_beds(self) -> int:
        """
        Count of beds with status OCCUPIED.

        Returns:
            Number of beds in OCCUPIED status
        """
        return self.beds.filter(status="OCCUPIED").count()

    @property
    def occupancy_rate(self) -> float:
        """
        Current occupancy percentage based on capacity.

        Returns:
            Occupancy rate as percentage (0-100)
        """
        if self.capacity == 0:
            return 0.0

        occupied_beds = self.beds.filter(status="OCCUPIED").count()
        return round((occupied_beds / self.capacity) * 100, 2)


class Bed(TimeStampedModel):
    """
    Individual bed within a ward.

    Represents a single bed that can be assigned to patients.
    Tracks bed status and maintains audit trail of status changes.

    Attributes:
        ward: Parent ward
        bed_number: Bed identifier within ward (e.g., "B-101")
        status: Current bed status (AVAILABLE, OCCUPIED, etc.)
        bed_type: Type of bed (optional)
        notes: Additional notes (e.g., maintenance reason)
        status_changed_at: When status last changed
        status_changed_by: User who changed status
    """

    BED_STATUS_CHOICES = [
        ("AVAILABLE", "Available"),
        ("OCCUPIED", "Occupied"),
        ("CLEANING", "Cleaning In Progress"),
        ("MAINTENANCE", "Under Maintenance"),
        ("RESERVED", "Reserved"),
    ]

    ward = models.ForeignKey(
        Ward,
        on_delete=models.CASCADE,
        related_name="beds",
        help_text="Parent ward",
    )
    bed_number = models.CharField(
        max_length=20,
        help_text="Bed identifier (e.g., 'B-101')",
    )
    status = models.CharField(
        max_length=20,
        choices=BED_STATUS_CHOICES,
        default="AVAILABLE",
        help_text="Current bed status",
    )
    bed_type = models.CharField(
        max_length=50,
        blank=True,
        default="",
        help_text="Type of bed (e.g., 'Standard', 'ICU')",
    )
    notes = models.TextField(
        blank=True,
        default="",
        help_text="Additional notes (maintenance reason, etc.)",
    )
    status_changed_at = models.DateTimeField(
        auto_now=True,
        help_text="When status last changed",
    )
    status_changed_by = models.ForeignKey(
        User,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="bed_status_changes",
        help_text="User who changed status",
    )

    class Meta(TimeStampedModel.Meta):
        """Meta options for Bed model."""

        unique_together = ["ward", "bed_number"]
        ordering = ["ward", "bed_number"]
        verbose_name = "Bed"
        verbose_name_plural = "Beds"

    def __str__(self):
        """Return string representation."""
        return f"{self.ward.code} - {self.bed_number}"

    def mark_occupied(self, user):
        """
        Transition bed to OCCUPIED status.

        Args:
            user: User performing the action

        Raises:
            ValueError: If bed is not available
        """
        if self.status not in ["AVAILABLE", "RESERVED"]:
            raise ValueError(f"Cannot occupy bed with status {self.status}")

        self.status = "OCCUPIED"
        self.status_changed_by = user
        self.save()

    def mark_available(self, user):
        """
        Transition bed to AVAILABLE status.

        Args:
            user: User performing the action
        """
        self.status = "AVAILABLE"
        self.status_changed_by = user
        self.notes = ""
        self.save()

    def mark_cleaning(self, user, reason=""):
        """
        Transition bed to CLEANING status with housekeeping context.

        Args:
            user: User performing the action
            reason: Reason or note for turnover workflow
        """
        self.status = "CLEANING"
        self.status_changed_by = user
        self.notes = reason
        self.save()

    def mark_maintenance(self, user, reason):
        """
        Transition bed to MAINTENANCE status with reason.

        Args:
            user: User performing the action
            reason: Reason for maintenance
        """
        self.status = "MAINTENANCE"
        self.status_changed_by = user
        self.notes = reason
        self.save()

    def mark_reserved(self, user, duration_hours=24):
        """
        Transition bed to RESERVED status with expiry.

        Args:
            user: User performing the action
            duration_hours: Reservation duration (default 24 hours)
        """
        self.status = "RESERVED"
        self.status_changed_by = user
        self.save()


class AdmissionRecommendation(TimeStampedModel):
    """
    Clinician recommendation for patient admission from OPD.

    Captures the clinician's recommendation to admit a patient from
    OPD to IPD, including clinical reasoning and urgency.

    Attributes:
        encounter: OPD encounter that generated this recommendation
        recommended_by: Clinician making the recommendation
        reason: Clinical reason for admission
        provisional_diagnosis: ICD-10 code for provisional diagnosis
        provisional_diagnosis_text: Text description of diagnosis
        urgency: Urgency level (ROUTINE, URGENT, EMERGENCY)
        preferred_ward_type: Preferred ward type (optional)
        status: Current status (PENDING, ACCEPTED, DECLINED, EXPIRED)
        expires_at: Expiration time (default 24 hours)
        resolved_at: When recommendation was accepted/declined
        resolved_by: User who resolved the recommendation
        decline_reason: Reason if recommendation was declined
    """

    STATUS_CHOICES = [
        ("PENDING", "Pending"),
        ("ACCEPTED", "Accepted"),
        ("DECLINED", "Declined"),
        ("EXPIRED", "Expired"),
    ]

    URGENCY_CHOICES = [
        ("ROUTINE", "Routine"),
        ("URGENT", "Urgent"),
        ("EMERGENCY", "Emergency"),
    ]

    encounter = models.OneToOneField(
        "encounters.Encounter",
        on_delete=models.CASCADE,
        related_name="admission_recommendation",
        help_text="OPD encounter that generated this recommendation",
    )
    recommended_by = models.ForeignKey(
        User,
        on_delete=models.PROTECT,
        related_name="admission_recommendations_made",
        help_text="Clinician making the recommendation",
    )
    reason = models.TextField(
        help_text="Clinical reason for admission",
    )
    provisional_diagnosis = models.CharField(
        max_length=10,
        help_text="ICD-10 code for provisional diagnosis",
    )
    provisional_diagnosis_text = models.CharField(
        max_length=255,
        help_text="Text description of diagnosis",
    )
    urgency = models.CharField(
        max_length=20,
        choices=URGENCY_CHOICES,
        default="ROUTINE",
        help_text="Urgency level",
    )
    preferred_ward_type = models.CharField(
        max_length=20,
        blank=True,
        default="",
        help_text="Preferred ward type (optional)",
    )
    status = models.CharField(
        max_length=20,
        choices=STATUS_CHOICES,
        default="PENDING",
        help_text="Current status",
    )
    expires_at = models.DateTimeField(
        default=default_recommendation_expiry,
        help_text="Expiration time (default 24 hours from creation)",
    )

    # Resolution
    resolved_at = models.DateTimeField(
        null=True,
        blank=True,
        help_text="When recommendation was accepted/declined",
    )
    resolved_by = models.ForeignKey(
        User,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="admission_recommendations_resolved",
        help_text="User who resolved the recommendation",
    )
    decline_reason = models.TextField(
        blank=True,
        default="",
        help_text="Reason if recommendation was declined",
    )

    class Meta(TimeStampedModel.Meta):
        """Meta options for AdmissionRecommendation model."""

        ordering = ["-created_at"]
        verbose_name = "Admission Recommendation"
        verbose_name_plural = "Admission Recommendations"

    def __str__(self):
        """Return string representation."""
        return f"Admission Recommendation for {self.encounter.patient} - {self.status}"

    def accept(self, user):
        """
        Mark recommendation as accepted.

        Args:
            user: User accepting the recommendation

        Raises:
            ValueError: If recommendation already resolved
        """
        if self.status in ["ACCEPTED", "DECLINED"]:
            raise ValueError("Recommendation already resolved")

        self.status = "ACCEPTED"
        self.resolved_by = user
        self.resolved_at = timezone.now()
        self.save()

    def decline(self, user, reason):
        """
        Mark recommendation as declined with reason.

        Args:
            user: User declining the recommendation
            reason: Reason for declining

        Raises:
            ValueError: If recommendation already resolved
        """
        if self.status in ["ACCEPTED", "DECLINED"]:
            raise ValueError("Recommendation already resolved")

        self.status = "DECLINED"
        self.resolved_by = user
        self.resolved_at = timezone.now()
        self.decline_reason = reason
        self.save()

    def is_expired(self) -> bool:
        """True if current time is past expires_at."""
        return timezone.now() > self.expires_at


class Admission(TimeStampedModel):
    """
    Inpatient admission record.

    Represents a patient's admission to the inpatient department,
    linking OPD/IPD encounters, bed assignment, and insurance details.

    Attributes:
        patient: Patient being admitted
        opd_encounter: Optional OPD encounter that led to admission
        ipd_encounter: IPD encounter for this admission
        recommendation: Optional admission recommendation
        admission_number: Unique admission number (ADM-YYYYMMDD-XXXX)
        admission_date: Date and time of admission
        admitting_diagnosis: ICD-10 code for admitting diagnosis
        admitting_diagnosis_text: Text description of diagnosis
        admitting_officer: User who processed the admission
        attending_doctor: Doctor attending the patient
        ward: Ward where patient is admitted
        bed: Specific bed assigned
        admission_status: Current admission status
        payer_type: Type of payer (CASH, SHA, CORPORATE)
        insurance_details: JSON field for insurance information
        discharge_date: Date and time of discharge (if applicable)
    """

    # Type hints for reverse relations
    ward_rounds: QuerySet[WardRound]
    transfers: QuerySet[Transfer]

    STATUS_CHOICES = [
        ("ACTIVE", "Active"),
        ("DISCHARGED", "Discharged"),
        ("TRANSFERRED_OUT", "Transferred Out"),
        ("DECEASED", "Deceased"),
        ("ABSCONDED", "Absconded"),
    ]

    PAYER_TYPE_CHOICES = [
        ("CASH", "Cash"),
        ("SHA", "SHA Insurance"),
        ("CORPORATE", "Corporate"),
    ]

    # Tenant scoping
    organization = models.ForeignKey(
        "core.Organization",
        on_delete=models.CASCADE,
        related_name="admissions",
        null=True,
        blank=True,
        help_text="Owning organization (auto-set from facility).",
    )
    facility = models.ForeignKey(
        "core.Facility",
        on_delete=models.CASCADE,
        related_name="admissions",
        null=True,
        blank=True,
        help_text="Facility where patient is admitted.",
    )

    # Patient and encounter linkage
    patient = models.ForeignKey(
        "patients.Patient",
        on_delete=models.PROTECT,
        related_name="admissions",
        help_text="Patient being admitted",
    )
    opd_encounter = models.ForeignKey(
        "encounters.Encounter",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="admission_from_opd",
        help_text="OPD encounter that led to admission (if applicable)",
    )
    mch_registration = models.ForeignKey(
        "mch.MCHRegistration",
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="admissions",
        help_text="Pregnancy registration linked to this maternity admission",
    )
    ipd_encounter = models.OneToOneField(
        "encounters.Encounter",
        on_delete=models.PROTECT,
        related_name="admission",
        help_text="IPD encounter for this admission",
    )
    recommendation = models.OneToOneField(
        AdmissionRecommendation,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="admission",
        help_text="Admission recommendation (if from OPD)",
    )

    # Admission details
    admission_number = models.CharField(
        max_length=50,
        unique=True,
        editable=False,
        help_text="Unique admission number (ADM-YYYYMMDD-XXXX)",
    )
    admission_date = models.DateTimeField(
        help_text="Date and time of admission",
    )
    admitting_diagnosis = models.CharField(
        max_length=10,
        help_text="ICD-10 code for admitting diagnosis",
    )
    admitting_diagnosis_text = models.CharField(
        max_length=255,
        help_text="Text description of diagnosis",
    )
    admitting_officer = models.ForeignKey(
        User,
        on_delete=models.PROTECT,
        related_name="admissions_processed",
        help_text="User who processed the admission",
    )
    attending_doctor = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="patients_attending",
        help_text="Doctor attending the patient",
    )

    # Location
    ward = models.ForeignKey(
        Ward,
        on_delete=models.PROTECT,
        related_name="admissions",
        help_text="Ward where patient is admitted",
    )
    bed = models.ForeignKey(
        Bed,
        on_delete=models.PROTECT,
        related_name="admissions",
        help_text="Specific bed assigned",
    )

    # Status
    admission_status = models.CharField(
        max_length=20,
        choices=STATUS_CHOICES,
        default="ACTIVE",
        help_text="Current admission status",
    )

    # Insurance/payment
    payer_type = models.CharField(
        max_length=20,
        choices=PAYER_TYPE_CHOICES,
        help_text="Type of payer",
    )
    insurance_details = models.JSONField(
        default=dict,
        blank=True,
        help_text="Insurance information (for SHA/Corporate)",
    )

    # NEW: Constraint override tracking
    constraint_override = models.BooleanField(
        default=False,
        help_text="Whether compatibility constraints were overridden",
    )
    constraint_override_reason = models.TextField(
        blank=True,
        default="",
        help_text="Reason for overriding compatibility constraints",
    )
    constraint_violations = models.JSONField(
        default=list,
        blank=True,
        help_text="List of violated constraints at admission time",
    )

    # Timestamps
    discharge_date = models.DateTimeField(
        null=True,
        blank=True,
        help_text="Date and time of discharge",
    )

    # Phase C: Smart Allocation — predicted discharge planning
    expected_discharge_date = models.DateTimeField(
        null=True,
        blank=True,
        help_text="Clinician-set expected discharge date for bed planning",
    )

    class Meta(TimeStampedModel.Meta):
        """Meta options for Admission model."""

        ordering = ["-admission_date"]
        verbose_name = "Admission"
        verbose_name_plural = "Admissions"
        constraints = [
            # Only ONE active admission per patient at a time
            models.UniqueConstraint(
                fields=["patient"],
                condition=models.Q(admission_status="ACTIVE"),
                name="unique_active_admission_per_patient",
            ),
            # Only ONE active admission per bed at a time
            models.UniqueConstraint(
                fields=["bed"],
                condition=models.Q(admission_status="ACTIVE"),
                name="unique_active_admission_per_bed",
            ),
        ]
        permissions = [
            ("receive_critical_alerts", "Can receive critical ward-compatibility alerts"),
        ]

    def __str__(self):
        """Return string representation."""
        return f"{self.admission_number} - {self.patient} ({self.ward.code})"

    def save(self, *args, **kwargs):
        """Override save to auto-generate admission number and update bed status."""
        # Generate admission number if not set
        if not self.admission_number:
            self.admission_number = self.generate_admission_number()

        # Call parent save
        super().save(*args, **kwargs)

        # Update bed status to OCCUPIED
        if self.bed.status != "OCCUPIED":
            self.bed.status = "OCCUPIED"
            self.bed.status_changed_by = self.admitting_officer
            self.bed.save()

    def clean(self):
        """Validate admission data."""
        from django.core.exceptions import ValidationError

        # Check for duplicate active admission
        if self.admission_status == "ACTIVE":
            existing = Admission.objects.filter(
                patient=self.patient, admission_status="ACTIVE"
            ).exclude(pk=self.pk)

            if existing.exists():
                raise ValidationError("Patient already has an active admission")

    def generate_admission_number(self):
        """
        Auto-generate admission number in format: ADM-YYYYMMDD-XXXX.

        Returns:
            Unique admission number string
        """
        import re

        from django.db.models import Max

        today = self.admission_date.strftime("%Y%m%d")
        prefix = f"ADM-{today}-"

        # Get the last admission number for today
        last_admission = Admission.objects.filter(admission_number__startswith=prefix).aggregate(
            Max("admission_number")
        )["admission_number__max"]

        if last_admission:
            # Extract sequence number and increment
            match = re.search(r"-(\d{4})$", last_admission)
            if match:
                sequence = int(match.group(1)) + 1
            else:
                sequence = 1
        else:
            sequence = 1

        return f"{prefix}{sequence:04d}"

    @property
    def length_of_stay(self) -> int:
        """
        Calculate length of stay in days.

        Returns:
            Number of days between admission and discharge (or current date)
        """
        end_date = self.discharge_date if self.discharge_date else timezone.now()
        delta = end_date - self.admission_date
        return delta.days

    @property
    def status(self) -> str:
        """Backward-compatible alias for admission_status."""
        return self.admission_status

    @status.setter
    def status(self, value: str) -> None:
        self.admission_status = value


class Discharge(TimeStampedModel):
    """
    Patient discharge record.

    Documents the discharge of a patient from inpatient care,
    including clinical summary, medications, follow-up plans, and clearances.

    Attributes:
        admission: Admission being discharged
        discharge_type: Type of discharge (NORMAL, AGAINST_ADVICE, etc.)
        discharge_date: Date and time of discharge
        discharged_by: User who processed the discharge
        admission_diagnosis: ICD-10 code from admission
        final_diagnosis: ICD-10 code at discharge
        final_diagnosis_text: Text description of final diagnosis
        procedures_performed: Summary of procedures during stay
        treatment_summary: Overall treatment summary
        discharge_medications: JSON list of discharge medications
        follow_up_date: Date for follow-up appointment
        follow_up_instructions: Instructions for follow-up
        referral_facility: Facility if transferred
        referral_reason: Reason for referral
        patient_instructions: Instructions for patient
        pharmacy_cleared: Pharmacy clearance status
        billing_cleared: Billing clearance status
        lab_results_acknowledged: Lab results reviewed
    """

    DISCHARGE_TYPE_CHOICES = [
        ("NORMAL", "Normal Discharge"),
        ("AGAINST_ADVICE", "Discharge Against Medical Advice"),
        ("TRANSFERRED", "Transferred to Another Facility"),
        ("DECEASED", "Deceased"),
        ("ABSCONDED", "Absconded"),
    ]

    admission = models.OneToOneField(
        Admission,
        on_delete=models.CASCADE,
        related_name="discharge",
        help_text="Admission being discharged",
    )

    # Discharge details
    discharge_type = models.CharField(
        max_length=20,
        choices=DISCHARGE_TYPE_CHOICES,
        help_text="Type of discharge",
    )
    discharge_date = models.DateTimeField(
        help_text="Date and time of discharge",
    )
    discharged_by = models.ForeignKey(
        User,
        on_delete=models.PROTECT,
        related_name="discharges_processed",
        help_text="User who processed the discharge",
    )

    # Clinical summary
    admission_diagnosis = models.CharField(
        max_length=10,
        help_text="ICD-10 code from admission",
    )
    final_diagnosis = models.CharField(
        max_length=10,
        help_text="ICD-10 code at discharge",
    )
    final_diagnosis_text = models.CharField(
        max_length=255,
        help_text="Text description of final diagnosis",
    )
    procedures_performed = models.TextField(
        blank=True,
        default="",
        help_text="Summary of procedures performed during stay",
    )
    treatment_summary = models.TextField(
        help_text="Overall treatment summary",
    )

    # Discharge medications
    discharge_medications = models.JSONField(
        default=list,
        blank=True,
        help_text="List of discharge medications with dosage and instructions",
    )

    maternity_continuity_action = models.CharField(
        max_length=40,
        choices=MATERNITY_CONTINUITY_ACTION_CHOICES,
        default="NONE",
        help_text="Structured postpartum continuity action for maternity discharges",
    )
    maternity_continuity_status = models.CharField(
        max_length=20,
        choices=MATERNITY_CONTINUITY_STATUS_CHOICES,
        default="NOT_APPLICABLE",
        help_text="Outcome of the postpartum continuity action",
    )
    pnc_clinic_visit = models.ForeignKey(
        "clinics.ClinicVisit",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="discharge_continuity_routes",
        help_text="PNC clinic visit created directly from maternity discharge",
    )
    pnc_appointment = models.ForeignKey(
        "scheduling.Appointment",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="discharge_continuity_appointments",
        help_text="Scheduled PNC follow-up appointment created from maternity discharge",
    )

    # Follow-up
    follow_up_date = models.DateField(
        null=True,
        blank=True,
        help_text="Date for follow-up appointment",
    )
    follow_up_instructions = models.TextField(
        blank=True,
        default="",
        help_text="Instructions for follow-up care",
    )

    # Referrals
    referral_facility = models.CharField(
        max_length=255,
        blank=True,
        default="",
        help_text="Facility name if transferred",
    )
    referral_reason = models.TextField(
        blank=True,
        default="",
        help_text="Reason for referral/transfer",
    )

    # Patient instructions
    patient_instructions = models.TextField(
        help_text="Discharge instructions for patient",
    )

    # Clearances
    pharmacy_cleared = models.BooleanField(
        default=False,
        help_text="Pharmacy clearance obtained",
    )
    billing_cleared = models.BooleanField(
        default=False,
        help_text="Billing clearance obtained",
    )
    lab_results_acknowledged = models.BooleanField(
        default=False,
        help_text="Lab results reviewed and acknowledged",
    )

    class Meta(TimeStampedModel.Meta):
        """Meta options for Discharge model."""

        ordering = ["-discharge_date"]
        verbose_name = "Discharge"
        verbose_name_plural = "Discharges"

    def __str__(self):
        """Return string representation."""
        return f"Discharge: {self.admission.admission_number} - {self.discharge_type}"

    def save(self, *args, **kwargs):
        """Override save to update admission and bed status, auto-create death record."""
        is_new = self._state.adding
        # Call parent save first
        super().save(*args, **kwargs)

        # Update admission status and discharge date
        if self.discharge_type == "DECEASED":
            self.admission.admission_status = "DECEASED"
        elif self.discharge_type == "ABSCONDED":
            self.admission.admission_status = "ABSCONDED"
        elif self.discharge_type == "TRANSFERRED":
            self.admission.admission_status = "TRANSFERRED_OUT"
        else:
            self.admission.admission_status = "DISCHARGED"

        self.admission.discharge_date = self.discharge_date
        self.admission.save()

        # Move bed into housekeeping turnover workflow
        bed = self.admission.bed
        if bed.status == "OCCUPIED":
            bed.mark_cleaning(
                self.discharged_by,
                reason=f"Patient discharged on {self.discharge_date.isoformat()} - awaiting housekeeping",
            )

        # Auto-create DeathRecord for deceased discharges
        if is_new and self.discharge_type == "DECEASED":
            self._create_death_record()

    def _create_death_record(self):
        """Create a DeathRecord linked to this discharge's admission."""
        from hmis.apps.patients.models import DeathRecord

        patient = self.admission.patient
        # Skip if patient already has a death record (e.g., created manually first)
        if hasattr(patient, "death_record"):
            return

        ward_name = ""
        if self.admission.ward:
            ward_name = self.admission.ward.name
        elif self.admission.bed and self.admission.bed.ward:
            ward_name = self.admission.bed.ward.name

        DeathRecord.objects.create(
            patient=patient,
            date_of_death=self.discharge_date.date(),
            time_of_death=self.discharge_date.time(),
            manner_of_death="NATURAL",
            place_of_death="INPATIENT",
            place_of_death_detail=ward_name,
            notification_source="INPATIENT_DISCHARGE",
            primary_cause=self.final_diagnosis_text or "To be determined",
            primary_cause_icd10=None,
            admission=self.admission,
            encounter=self.admission.ipd_encounter,
            recorded_by=self.discharged_by,
            notes=f"Auto-created from inpatient discharge {self.admission.admission_number}",
        )

    def clean(self):
        """Validate discharge data."""
        from django.core.exceptions import ValidationError

        # Validate discharge date is not before admission date
        if self.discharge_date < self.admission.admission_date:
            raise ValidationError("Discharge date cannot be before admission date")

        # Automated clearance validation for normal discharges.
        # The DischargeSerializer also performs this check at the API layer;
        # keeping it here ensures model-level integrity for non-API callers.
        if self.discharge_type == "NORMAL":
            from decimal import Decimal

            from hmis.apps.billing.models import Invoice
            from hmis.apps.laboratory.models import LabOrder
            from hmis.apps.pharmacy.models import Prescription

            errors = {}

            # Billing
            unpaid = Invoice.objects.filter(
                encounter=self.admission.ipd_encounter,
            ).exclude(
                status__in=[
                    Invoice.Status.PAID,
                    Invoice.Status.CANCELLED,
                    Invoice.Status.WRITTEN_OFF,
                ]
            )
            outstanding = sum((inv.balance_due for inv in unpaid), Decimal("0.00"))
            if outstanding > 0:
                errors["billing_cleared"] = (
                    f"Cannot discharge: KES {outstanding:,.2f} outstanding balance"
                )

            # Pharmacy
            rx_q = Q(admission=self.admission) | Q(encounter=self.admission.ipd_encounter)
            if self.admission.opd_encounter_id:
                rx_q |= Q(encounter=self.admission.opd_encounter)
            pending_rx = (
                Prescription.objects.filter(rx_q)
                .exclude(status__in=["DISPENSED", "CANCELLED"])
                .distinct()
            )
            if pending_rx.exists():
                errors["pharmacy_cleared"] = (
                    f"Cannot discharge: {pending_rx.count()} prescription(s) not yet dispensed"
                )

            # Laboratory
            lab_q = Q(admission=self.admission) | Q(encounter=self.admission.ipd_encounter)
            if self.admission.opd_encounter_id:
                lab_q |= Q(encounter=self.admission.opd_encounter)
            pending_labs = (
                LabOrder.objects.filter(lab_q)
                .exclude(status__in=["COMPLETED", "CANCELLED"])
                .distinct()
            )
            if pending_labs.exists():
                errors["lab_results_acknowledged"] = (
                    f"Cannot discharge: {pending_labs.count()} lab order(s) with pending results"
                )

            if errors:
                raise ValidationError(errors)

    @property
    def length_of_stay(self) -> int:
        """
        Calculate length of stay in days.

        Returns:
            Number of days between admission and discharge
        """
        delta = self.discharge_date - self.admission.admission_date
        return delta.days


class DischargeDiagnosis(TimeStampedModel):
    """
    Individual diagnosis recorded at discharge.

    Each Discharge can have multiple diagnoses with different roles:
    - PRIMARY: the principal condition treated during the admission
    - SECONDARY: comorbidities managed during the stay
    - COMPLICATION: conditions that arose during admission

    ICD-10 or ICD-11 codes accepted. SHA claims integration pulls
    primary and secondary diagnoses from these records.
    """

    class DiagnosisRole(models.TextChoices):
        PRIMARY = "PRIMARY", "Primary Diagnosis"
        SECONDARY = "SECONDARY", "Secondary Diagnosis"
        COMPLICATION = "COMPLICATION", "Complication"

    discharge = models.ForeignKey(
        Discharge,
        on_delete=models.CASCADE,
        related_name="diagnoses",
        help_text="Discharge this diagnosis belongs to",
    )
    role = models.CharField(
        max_length=15,
        choices=DiagnosisRole.choices,
        help_text="Role of this diagnosis (PRIMARY, SECONDARY, COMPLICATION)",
    )
    code = models.CharField(
        max_length=20,
        help_text="ICD-10 or ICD-11 code",
    )
    description = models.CharField(
        max_length=500,
        help_text="Diagnosis description text",
    )

    class Meta(TimeStampedModel.Meta):
        ordering = ["role", "id"]
        verbose_name = "Discharge Diagnosis"
        verbose_name_plural = "Discharge Diagnoses"
        constraints = [
            models.UniqueConstraint(
                fields=["discharge", "role"],
                condition=models.Q(role="PRIMARY"),
                name="unique_primary_diagnosis_per_discharge",
            ),
        ]

    def __str__(self) -> str:
        return f"{self.get_role_display()}: {self.code} - {self.description}"


class Transfer(TimeStampedModel):
    """
    Patient transfer between wards.

    Documents the transfer of a patient from one ward to another,
    with automatic bed status updates and admission tracking.

    Attributes:
        admission: Admission being transferred
        source_ward: Ward patient is transferring from
        source_bed: Bed patient is leaving
        destination_ward: Ward patient is transferring to
        destination_bed: Bed patient is moving to
        reason: Reason for transfer
        reason_details: Additional details about transfer
        transferred_by: User who processed the transfer
        transfer_date: Date and time of transfer
        clinical_handover_notes: Clinical information for receiving team
    """

    TRANSFER_REASON_CHOICES = [
        ("STEP_UP", "Step Up Care (e.g., to ICU)"),
        ("STEP_DOWN", "Step Down Care"),
        ("SPECIALTY", "Specialty Care"),
        ("BED_MANAGEMENT", "Bed Management"),
        ("PATIENT_REQUEST", "Patient Request"),
        ("OTHER", "Other"),
    ]

    admission = models.ForeignKey(
        Admission,
        on_delete=models.CASCADE,
        related_name="transfers",
        help_text="Admission being transferred",
    )

    # Source
    source_ward = models.ForeignKey(
        Ward,
        on_delete=models.PROTECT,
        related_name="transfers_out",
        help_text="Ward patient is transferring from",
    )
    source_bed = models.ForeignKey(
        Bed,
        on_delete=models.PROTECT,
        related_name="transfers_out",
        help_text="Bed patient is leaving",
    )

    # Destination
    destination_ward = models.ForeignKey(
        Ward,
        on_delete=models.PROTECT,
        related_name="transfers_in",
        help_text="Ward patient is transferring to",
    )
    destination_bed = models.ForeignKey(
        Bed,
        on_delete=models.PROTECT,
        related_name="transfers_in",
        help_text="Bed patient is moving to",
    )

    # Details
    reason = models.CharField(
        max_length=20,
        choices=TRANSFER_REASON_CHOICES,
        help_text="Reason for transfer",
    )
    reason_details = models.TextField(
        blank=True,
        default="",
        help_text="Additional details about transfer reason",
    )
    transferred_by = models.ForeignKey(
        User,
        on_delete=models.PROTECT,
        related_name="transfers_processed",
        help_text="User who processed the transfer",
    )
    transfer_date = models.DateTimeField(
        help_text="Date and time of transfer",
    )

    # Handover
    clinical_handover_notes = models.TextField(
        help_text="Clinical information for receiving team",
    )

    class Meta(TimeStampedModel.Meta):
        """Meta options for Transfer model."""

        ordering = ["-transfer_date"]
        verbose_name = "Transfer"
        verbose_name_plural = "Transfers"

    def __str__(self):
        """Return string representation."""
        return f"Transfer: {self.admission.admission_number} - {self.source_ward.name} → {self.destination_ward.name}"

    def save(self, *args, **kwargs):
        """Override save to update bed and admission status."""
        # Call parent save first
        super().save(*args, **kwargs)

        # Move source bed into housekeeping turnover workflow
        if self.source_bed.status == "OCCUPIED":
            self.source_bed.mark_cleaning(
                self.transferred_by,
                reason=(
                    f"Patient transferred to {self.destination_ward.code} on "
                    f"{self.transfer_date.isoformat()} - awaiting housekeeping"
                ),
            )

        # Update destination bed status to OCCUPIED
        if self.destination_bed.status == "AVAILABLE":
            self.destination_bed.status = "OCCUPIED"
            self.destination_bed.status_changed_by = self.transferred_by
            self.destination_bed.save()

        # Update admission's current ward and bed
        self.admission.ward = self.destination_ward
        self.admission.bed = self.destination_bed
        self.admission.save()

    def clean(self):
        """Validate transfer data."""
        from django.core.exceptions import ValidationError

        # Prevent transfer within same ward
        if self.source_ward == self.destination_ward:
            raise ValidationError("Cannot transfer patient within the same ward")

        # Validate destination bed is available
        if self.destination_bed.status != "AVAILABLE":
            raise ValidationError("Destination bed must be available")

        # Validate transfer date is not before admission date
        if self.transfer_date < self.admission.admission_date:
            raise ValidationError("Transfer date cannot be before admission date")


class WardRound(TimeStampedModel):
    """Daily ward round documentation using SOAP notes format."""

    CONDITION_STATUS_CHOICES = [
        ("STABLE", "Stable"),
        ("IMPROVING", "Improving"),
        ("DETERIORATING", "Deteriorating"),
        ("CRITICAL", "Critical"),
    ]

    REVIEW_TYPE_CHOICES = [
        ("WARD_ROUND", "Scheduled Ward Round"),
        ("URGENT_REVIEW", "Urgent Review"),
        ("CONSULTANT_REVIEW", "Consultant Review"),
        ("TRANSFER_REVIEW", "Transfer Assessment"),
        ("PRE_DISCHARGE", "Pre-Discharge Assessment"),
    ]

    admission = models.ForeignKey(Admission, on_delete=models.CASCADE, related_name="ward_rounds")
    round_date = models.DateField()
    round_time = models.TimeField()
    conducted_by = models.ForeignKey(User, on_delete=models.PROTECT)

    # Review type - differentiates scheduled rounds from urgent/consultant reviews
    review_type = models.CharField(
        max_length=20,
        choices=REVIEW_TYPE_CHOICES,
        default="WARD_ROUND",
        help_text="Type of review being conducted",
    )

    # Link to review request (if this fulfills a pending request)
    review_request = models.ForeignKey(
        "ReviewRequest",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="ward_rounds",
        help_text="Review request this ward round fulfills (if applicable)",
    )

    # SOAP notes
    subjective = models.TextField(help_text="Patient complaints, symptoms")
    objective = models.TextField(help_text="Examination findings, vitals, observations")
    assessment = models.TextField(help_text="Clinical assessment, diagnosis updates")
    plan = models.TextField(help_text="Treatment plan, orders, next steps")

    maternity_continuity_action = models.CharField(
        max_length=40,
        choices=MATERNITY_CONTINUITY_ACTION_CHOICES,
        default="NONE",
        help_text="Planned postpartum continuity step captured during ward review",
    )
    maternity_continuity_notes = models.TextField(
        blank=True,
        default="",
        help_text="Postpartum continuity notes for the next nursing or discharge workflow step",
    )

    # Patient condition tracking
    condition_status = models.CharField(max_length=20, choices=CONDITION_STATUS_CHOICES)

    # Consultant review flags
    requires_consultant_review = models.BooleanField(default=False)
    consultant_specialty = models.CharField(max_length=100, blank=True)

    class Meta(TimeStampedModel.Meta):
        ordering = ["-round_date", "-round_time"]
        verbose_name = "Ward Round"
        verbose_name_plural = "Ward Rounds"

    def __str__(self):
        return f"Ward Round - {self.admission.patient} on {self.round_date}"

    def clean(self):
        """Validate ward round data."""
        super().clean()

        # Validate round date is not in the future
        from datetime import date

        if self.round_date and self.round_date > date.today():
            raise ValidationError({"round_date": "Round date cannot be in the future"})


class ReviewRequest(TimeStampedModel):
    """
    Request for patient review (urgent, consultant, or scheduled).

    Tracks pending review requests that need attention. When fulfilled,
    links to the WardRound that addresses the request.
    """

    URGENCY_CHOICES = [
        ("ROUTINE", "Routine"),
        ("URGENT", "Urgent"),
        ("STAT", "STAT (Immediate)"),
    ]

    REVIEW_TYPE_CHOICES = [
        ("URGENT_REVIEW", "Urgent Review"),
        ("CONSULTANT_REVIEW", "Consultant Review"),
        ("TRANSFER_REVIEW", "Transfer Assessment"),
        ("PRE_DISCHARGE", "Pre-Discharge Assessment"),
    ]

    STATUS_CHOICES = [
        ("PENDING", "Pending"),
        ("IN_PROGRESS", "In Progress"),
        ("COMPLETED", "Completed"),
        ("CANCELLED", "Cancelled"),
    ]

    admission = models.ForeignKey(
        Admission,
        on_delete=models.CASCADE,
        related_name="review_requests",
        help_text="Admission requiring review",
    )
    review_type = models.CharField(
        max_length=20,
        choices=REVIEW_TYPE_CHOICES,
        help_text="Type of review requested",
    )
    urgency = models.CharField(
        max_length=20,
        choices=URGENCY_CHOICES,
        default="ROUTINE",
        help_text="Urgency level of the review",
    )
    reason = models.TextField(
        help_text="Clinical reason for review request",
    )
    requested_by = models.ForeignKey(
        User,
        on_delete=models.PROTECT,
        related_name="review_requests_made",
        help_text="User who requested the review",
    )
    requested_at = models.DateTimeField(
        auto_now_add=True,
        help_text="When the review was requested",
    )

    # For consultant reviews
    consultant_specialty = models.CharField(
        max_length=100,
        blank=True,
        help_text="Specialty required (for consultant reviews)",
    )
    assigned_to = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="review_requests_assigned",
        help_text="Clinician assigned to handle this review",
    )

    # Status tracking
    status = models.CharField(
        max_length=20,
        choices=STATUS_CHOICES,
        default="PENDING",
        help_text="Current status of the review request",
    )
    acknowledged_at = models.DateTimeField(
        null=True,
        blank=True,
        help_text="When the request was acknowledged",
    )
    acknowledged_by = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="review_requests_acknowledged",
        help_text="User who acknowledged the request",
    )
    completed_at = models.DateTimeField(
        null=True,
        blank=True,
        help_text="When the review was completed",
    )

    # Notes
    clinical_context = models.TextField(
        blank=True,
        help_text="Additional clinical context (e.g., latest vitals, observations)",
    )
    cancellation_reason = models.TextField(
        blank=True,
        help_text="Reason for cancellation (if cancelled)",
    )

    class Meta(TimeStampedModel.Meta):
        ordering = ["-requested_at"]
        verbose_name = "Review Request"
        verbose_name_plural = "Review Requests"

    def __str__(self):
        return f"{self.get_review_type_display()} - {self.admission.patient} ({self.status})"

    def acknowledge(self, user: AbstractUser) -> None:
        """Mark the review request as acknowledged/in progress."""
        self.status = "IN_PROGRESS"
        self.acknowledged_at = timezone.now()
        self.acknowledged_by = user
        if not self.assigned_to:
            self.assigned_to = user
        self.save()

    def complete(self) -> None:
        """Mark the review request as completed."""
        self.status = "COMPLETED"
        self.completed_at = timezone.now()
        self.save()

    def cancel(self, reason: str) -> None:
        """Cancel the review request with a reason."""
        self.status = "CANCELLED"
        self.cancellation_reason = reason
        self.save()

    @property
    def is_overdue(self) -> bool:
        """Check if request is overdue based on urgency."""
        if self.status != "PENDING":
            return False

        now = timezone.now()
        time_since_request = now - self.requested_at

        # STAT: overdue if pending > 30 minutes
        if self.urgency == "STAT":
            return time_since_request > timedelta(minutes=30)
        # URGENT: overdue if pending > 2 hours
        elif self.urgency == "URGENT":
            return time_since_request > timedelta(hours=2)
        # ROUTINE: overdue if pending > 24 hours
        else:
            return time_since_request > timedelta(hours=24)


class NursingKardex(models.Model):
    """
    Nursing Kardex for inpatient care coordination.

    One-to-one relationship with Admission. Auto-created when admission is saved.
    Contains nursing care plan, risk assessments, and related shift/handover notes.
    """

    RISK_CHOICES = [
        ("LOW", "Low"),
        ("MODERATE", "Moderate"),
        ("HIGH", "High"),
    ]

    admission = models.OneToOneField(
        Admission,
        on_delete=models.CASCADE,
        related_name="kardex",
        help_text="One Kardex per admission",
    )

    # Basic care information
    mobility_status = models.CharField(
        max_length=100,
        blank=True,
        help_text="Patient mobility status (e.g., Ambulatory, Wheelchair, Bedridden)",
    )
    dietary_requirements = models.CharField(
        max_length=200, blank=True, help_text="Dietary requirements (e.g., Regular, Diabetic, NPO)"
    )
    allergies = models.TextField(blank=True, help_text="Known allergies")
    iv_access = models.CharField(
        max_length=200, blank=True, help_text="IV access details (e.g., Right arm IV cannula)"
    )
    maternity_continuity_action = models.CharField(
        max_length=40,
        choices=MATERNITY_CONTINUITY_ACTION_CHOICES,
        default="NONE",
        help_text="Current postpartum continuity action the nursing team is working toward",
    )
    maternity_continuity_notes = models.TextField(
        blank=True,
        help_text="Operational postpartum continuity notes for nursing handoff and discharge workflow",
    )

    # Legacy nursing care plan fields (deprecated - use care_plan_entries instead)
    nursing_problems = models.TextField(
        blank=True,
        help_text="DEPRECATED: Use care_plan_entries. Identified nursing problems/diagnoses",
    )
    interventions = models.TextField(
        blank=True,
        help_text="DEPRECATED: Use care_plan_entries. Nursing interventions and care activities",
    )
    monitoring_requirements = models.TextField(
        blank=True,
        help_text="DEPRECATED: Use care_plan_entries. What to monitor and how often",
    )
    care_task_frequency = models.TextField(
        blank=True,
        help_text="DEPRECATED: Use care_plan_entries. Frequency of care tasks",
    )

    # Risk assessments (CharFields with choices)
    fall_risk = models.CharField(
        max_length=20, choices=RISK_CHOICES, default="LOW", help_text="Patient fall risk level"
    )
    pressure_sore_risk = models.CharField(
        max_length=20,
        choices=RISK_CHOICES,
        default="LOW",
        help_text="Patient pressure sore risk level",
    )

    # Isolation requirements
    isolation_required = models.BooleanField(
        default=False, help_text="Whether patient requires isolation"
    )
    isolation_type = models.CharField(
        max_length=100, blank=True, help_text="Type of isolation (e.g., Contact, Droplet, Airborne)"
    )

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name_plural = "Nursing Kardexes"
        ordering = ["-created_at"]

    def __str__(self):
        return f"Kardex for {self.admission.patient} - Admission {self.admission.admission_number}"


class NursingCarePlanEntry(models.Model):
    """
    Individual nursing care plan entry (one row on the 24-hour care plan form).

    Follows the ADPIE nursing process structure matching the Kenya physical form:
    Assessment → Diagnosis → Planning → Implementation → Evaluation.

    Each entry represents a single nursing problem/diagnosis with its complete
    care plan, tracked with date/time and the recording nurse.
    """

    STATUS_CHOICES = [
        ("ACTIVE", "Active"),
        ("ONGOING", "Ongoing"),
        ("RESOLVED", "Resolved"),
        ("DISCONTINUED", "Discontinued"),
    ]

    # Terminal statuses — entries in these states cannot be further updated
    TERMINAL_STATUSES = {"RESOLVED", "DISCONTINUED"}

    kardex = models.ForeignKey(
        NursingKardex,
        on_delete=models.CASCADE,
        related_name="care_plan_entries",
        help_text="Parent Kardex for this care plan entry",
    )

    # DATE & TIME
    recorded_at = models.DateTimeField(help_text="Date and time the entry was recorded")
    recorded_by = models.ForeignKey(
        User,
        on_delete=models.PROTECT,
        related_name="nursing_care_plan_entries",
        help_text="Nurse who recorded this entry",
    )

    # ASSESSMENT (cluster of cues)
    assessment = models.TextField(help_text="Assessment findings / cluster of cues observed")

    # NURSING DIAGNOSIS
    nursing_diagnosis = models.TextField(help_text="Nursing diagnosis derived from assessment")

    # GOAL AND OUTCOME CRITERIA
    goal_and_outcome_criteria = models.TextField(
        help_text="Expected goals and measurable outcome criteria"
    )

    # NURSING PLAN OF ACTION/INTERVENTION
    plan_of_action = models.TextField(help_text="Nursing plan of action / planned interventions")

    # SCIENTIFIC RATIONALE
    scientific_rationale = models.TextField(
        help_text="Scientific rationale for the planned interventions"
    )

    # IMPLEMENTATION
    implementation = models.TextField(
        blank=True,
        help_text="What was actually implemented / carried out",
    )

    # EVALUATION
    evaluation = models.TextField(
        blank=True,
        help_text="Evaluation of whether goals and outcomes were met",
    )

    # Status tracking
    status = models.CharField(
        max_length=20,
        choices=STATUS_CHOICES,
        default="ACTIVE",
        help_text="Current status of this care plan entry",
    )

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "Nursing Care Plan Entry"
        verbose_name_plural = "Nursing Care Plan Entries"
        ordering = ["-recorded_at"]
        indexes = [
            models.Index(fields=["kardex", "-recorded_at"]),
            models.Index(fields=["status"]),
        ]

    def __str__(self):
        return (
            f"Care Plan: {self.nursing_diagnosis[:50]} "
            f"({self.get_status_display()}) - {self.recorded_at:%Y-%m-%d %H:%M}"
        )


class KardexShiftNote(models.Model):
    """
    Individual shift note entry in Kardex (append-only design).

    Nurses add notes throughout their shift documenting patient status,
    care provided, and observations. Notes are immutable once created
    (timestamp auto-set on creation and cannot be changed).
    """

    SHIFT_CHOICES = [
        ("DAY", "Day Shift"),
        ("NIGHT", "Night Shift"),
    ]

    kardex = models.ForeignKey(
        NursingKardex,
        on_delete=models.CASCADE,
        related_name="shift_notes",
        help_text="Kardex this note belongs to",
    )
    shift = models.CharField(
        max_length=10, choices=SHIFT_CHOICES, help_text="Which shift this note is from"
    )
    nurse = models.ForeignKey(
        User, on_delete=models.PROTECT, help_text="Nurse who created this note"
    )
    content = models.TextField(
        help_text="Shift note content - observations, care provided, patient status"
    )
    timestamp = models.DateTimeField(
        auto_now_add=True, help_text="When this note was created (immutable)"
    )

    class Meta:
        ordering = ["-timestamp"]
        indexes = [
            models.Index(fields=["kardex", "-timestamp"]),
            models.Index(fields=["shift", "-timestamp"]),
        ]

    def __str__(self):
        return f"{self.shift} shift note by {self.nurse.username} at {self.timestamp}"


class KardexHandoverNote(models.Model):
    """
    Handover notes for shift transitions.

    Documents pending tasks, escalations, and important information
    to be communicated between outgoing and incoming nursing staff.
    """

    kardex = models.ForeignKey(
        NursingKardex,
        on_delete=models.CASCADE,
        related_name="handover_notes",
        help_text="Kardex this handover belongs to",
    )
    outgoing_nurse = models.ForeignKey(
        User,
        on_delete=models.PROTECT,
        related_name="kardex_handovers_given",
        help_text="Nurse ending their shift",
    )
    incoming_nurse = models.ForeignKey(
        User,
        on_delete=models.PROTECT,
        related_name="kardex_handovers_received",
        help_text="Nurse starting their shift",
    )
    shift_ending = models.CharField(max_length=10, help_text="Which shift is ending (DAY/NIGHT)")
    pending_tasks = models.TextField(help_text="Tasks that need completion in next shift")
    escalations = models.TextField(
        blank=True, help_text="Issues escalated to doctors or management"
    )
    acknowledged_at = models.DateTimeField(
        null=True, blank=True, help_text="When incoming nurse acknowledged the handover"
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["kardex", "-created_at"]),
        ]

    def __str__(self):
        status = "✓ Acknowledged" if self.acknowledged_at else "Pending"
        return f"Handover from {self.outgoing_nurse.username} to {self.incoming_nurse.username} - {status}"


class InpatientConsumableUsage(TimeStampedModel):
    """Recorded inpatient use of a stocked consumable from pharmacy inventory."""

    admission = models.ForeignKey(
        Admission,
        on_delete=models.CASCADE,
        related_name="consumable_usages",
        help_text="Admission where the consumable was used",
    )
    drug = models.ForeignKey(
        "pharmacy.Drug",
        on_delete=models.PROTECT,
        related_name="inpatient_consumable_usages",
        help_text="Consumable item used during admission",
    )
    batch = models.ForeignKey(
        "pharmacy.StockBatch",
        on_delete=models.PROTECT,
        related_name="inpatient_consumable_usages",
        help_text="Stock batch debited for this usage",
    )
    quantity_used = models.PositiveIntegerField(
        validators=[MinValueValidator(1)],
        help_text="Quantity consumed from stock",
    )
    notes = models.TextField(blank=True, help_text="Optional usage notes")
    used_by = models.ForeignKey(
        User,
        on_delete=models.PROTECT,
        related_name="recorded_inpatient_consumable_usages",
        help_text="User who recorded the consumable use",
    )
    used_at = models.DateTimeField(default=timezone.now)

    is_reversed = models.BooleanField(default=False)
    reversed_by = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="reversed_inpatient_consumable_usages",
    )
    reversed_at = models.DateTimeField(null=True, blank=True)
    reverse_reason = models.TextField(blank=True)

    class Meta:
        ordering = ["-used_at", "-created_at"]
        indexes = [
            models.Index(fields=["admission", "-used_at"]),
            models.Index(fields=["drug", "-used_at"]),
            models.Index(fields=["is_reversed"]),
        ]

    def __str__(self):
        return (
            f"{self.drug.generic_name} x{self.quantity_used} for "
            f"{self.admission.admission_number}"
        )

    def clean(self):
        super().clean()

        if self.batch_id and self.drug_id and self.batch.drug_id != self.drug_id:
            raise ValidationError({"batch": "Selected batch does not belong to the selected drug."})

        if self.pk is None and self.batch_id and self.quantity_used > self.batch.quantity_available:
            raise ValidationError(
                {
                    "quantity_used": (
                        f"Cannot use {self.quantity_used} units. "
                        f"Only {self.batch.quantity_available} available in batch."
                    )
                }
            )

    def save(self, *args, **kwargs):
        is_new = self.pk is None

        if self.batch_id and not self.drug_id:
            self.drug = self.batch.drug

        if is_new:
            self.full_clean()
            self.batch.dispense(self.quantity_used)

        super().save(*args, **kwargs)

    def reverse(self, user: AbstractUser, reason: str) -> None:
        """Reverse a previously recorded consumable usage and restore stock."""
        if self.is_reversed:
            raise ValueError("This consumable usage has already been reversed.")

        if not reason.strip():
            raise ValueError("A reversal reason is required.")

        self.batch.return_stock(self.quantity_used)
        self.is_reversed = True
        self.reversed_by = user
        self.reversed_at = timezone.now()
        self.reverse_reason = reason.strip()
        self.save()


class ShiftHandover(TimeStampedModel):
    """
    Formal ward-level shift handover record.

    Documents shift handovers between nursing teams for ward-level patient care
    coordination. Tracks patient counts, critical cases, and pending tasks.

    Attributes:
        ward: Hospital ward where handover occurs
        shift_date: Date of the shift
        shift_ending: Shift that is ending (DAY, EVENING, NIGHT)
        outgoing_nurse: Nurse handing over shift
        incoming_nurse: Nurse receiving handover
        total_patients: Total patient count in ward
        critical_patients: Number of critical/unstable patients
        new_admissions: Number of new admissions during shift
        discharges_pending: Number of pending discharges
        general_notes: General shift notes
        acknowledged_at: When incoming nurse acknowledged handover
    """

    SHIFT_CHOICES = [
        ("DAY", "Day Shift (07:00-15:00)"),
        ("EVENING", "Evening Shift (15:00-23:00)"),
        ("NIGHT", "Night Shift (23:00-07:00)"),
    ]

    ward = models.ForeignKey(
        Ward,
        on_delete=models.CASCADE,
        related_name="shift_handovers",
        help_text="Ward where handover occurs",
    )
    shift_date = models.DateField(help_text="Date of the shift")
    shift_ending = models.CharField(
        max_length=10, choices=SHIFT_CHOICES, help_text="Shift that is ending"
    )
    outgoing_nurse = models.ForeignKey(
        User,
        on_delete=models.PROTECT,
        related_name="handovers_given",
        help_text="Nurse handing over shift",
    )
    incoming_nurse = models.ForeignKey(
        User,
        on_delete=models.PROTECT,
        related_name="handovers_received",
        help_text="Nurse receiving handover",
    )

    # Patient counts
    total_patients = models.PositiveIntegerField(help_text="Total patient count in ward")
    critical_patients = models.PositiveIntegerField(
        default=0, help_text="Number of critical/unstable patients"
    )
    new_admissions = models.PositiveIntegerField(
        default=0, help_text="Number of new admissions during shift"
    )
    discharges_pending = models.PositiveIntegerField(
        default=0, help_text="Number of pending discharges"
    )

    # Notes
    general_notes = models.TextField(blank=True, help_text="General shift notes and observations")
    acknowledged_at = models.DateTimeField(
        null=True, blank=True, help_text="When incoming nurse acknowledged handover"
    )

    class Meta(TimeStampedModel.Meta):
        ordering = ["-shift_date", "-created_at"]
        unique_together = ["ward", "shift_date", "shift_ending"]
        indexes = [
            models.Index(fields=["ward", "-shift_date"]),
            models.Index(fields=["shift_date", "shift_ending"]),
        ]

    def __str__(self) -> str:
        # get_shift_ending_display() is auto-generated by Django for choice fields
        shift_display: str = self.get_shift_ending_display()  # type: ignore[attr-defined]
        return f"{self.ward.name} - {shift_display} - {self.shift_date}"

    @property
    def is_acknowledged(self) -> bool:
        """Check if handover has been acknowledged."""
        return self.acknowledged_at is not None

    def acknowledge(self, user: AbstractUser) -> None:
        """
        Acknowledge handover receipt.

        Args:
            user: User acknowledging the handover (should be incoming_nurse)
        """
        self.acknowledged_at = timezone.now()
        self.save(update_fields=["acknowledged_at"])

    def auto_populate_counts(self) -> None:
        """
        Auto-populate patient counts from ward data.

        Queries current ward admissions to calculate:
        - Total patients
        - Critical patients (based on ward round condition status)
        - New admissions today
        - Discharges pending
        """

        # Get all active admissions in this ward
        active_admissions = Admission.objects.filter(ward=self.ward, discharge__isnull=True)

        self.total_patients = active_admissions.count()

        # Count new admissions for this shift date
        self.new_admissions = active_admissions.filter(admission_date__date=self.shift_date).count()

        # Count critical patients (patients with DETERIORATING status in latest ward round)
        critical_count = 0
        for admission in active_admissions:
            latest_round = admission.ward_rounds.order_by("-round_date").first()
            if latest_round and latest_round.condition_status == "DETERIORATING":
                critical_count += 1
        self.critical_patients = critical_count

        # Count pending discharges (admissions with recent discharge recommendations)
        # TODO : This is a simplified count - could be enhanced with actual discharge orders
        self.discharges_pending = 0  # Placeholder - implement based on your workflow

        self.save()


class SupervisorAlertAcknowledgment(TimeStampedModel):
    """
    Acknowledgment record for supervisor critical violation alerts.

    Tracks when supervisors acknowledge critical constraint violations
    that were overridden during admission.

    Attributes:
        admission: Admission with critical violation(s)
        acknowledged_by: Supervisor who acknowledged the alert
        acknowledged_at: When the alert was acknowledged
        notes: Optional notes from the supervisor
    """

    admission = models.OneToOneField(
        Admission,
        on_delete=models.CASCADE,
        related_name="alert_acknowledgment",
        help_text="Admission with critical violation(s)",
    )
    acknowledged_by = models.ForeignKey(
        User,
        on_delete=models.PROTECT,
        related_name="inpatient_acknowledged_alerts",
        help_text="Supervisor who acknowledged the alert",
    )
    acknowledged_at = models.DateTimeField(
        auto_now_add=True,
        help_text="When the alert was acknowledged",
    )
    notes = models.TextField(
        blank=True,
        default="",
        help_text="Optional notes from the supervisor",
    )

    class Meta(TimeStampedModel.Meta):
        ordering = ["-acknowledged_at"]
        verbose_name = "Supervisor Alert Acknowledgment"
        verbose_name_plural = "Supervisor Alert Acknowledgments"

    def __str__(self):
        return f"Alert acknowledged for {self.admission.admission_number} by {self.acknowledged_by.username}"


# ============================================================================
# Observation Charts
# ============================================================================


class TemperatureReading(TimeStampedModel):
    """
    Individual temperature reading for an inpatient's temperature chart.

    Based on the Kenya hospital TPR chart form, this tracks:
    - Temperature (°C)
    - Pulse rate (BPM)
    - Respiratory rate (breaths/min)

    Readings are plotted on a chart over days of disease/admission.
    """

    admission = models.ForeignKey(
        Admission,
        on_delete=models.CASCADE,
        related_name="temperature_readings",
        help_text="Admission this reading belongs to",
    )
    recorded_at = models.DateTimeField(
        help_text="When the reading was taken",
    )
    recorded_by = models.ForeignKey(
        User,
        on_delete=models.PROTECT,
        related_name="temperature_readings",
        help_text="Nurse/clinician who recorded the reading",
    )

    # Vital signs
    temperature = models.DecimalField(
        max_digits=4,
        decimal_places=1,
        help_text="Temperature in °C (e.g., 36.5)",
        validators=[MinValueValidator(Decimal("30.0"))],
    )
    pulse = models.IntegerField(
        null=True,
        blank=True,
        help_text="Pulse rate in BPM",
        validators=[MinValueValidator(0)],
    )
    respiratory_rate = models.IntegerField(
        null=True,
        blank=True,
        help_text="Respiratory rate in breaths/min",
        validators=[MinValueValidator(0)],
    )

    notes = models.TextField(
        blank=True,
        help_text="Additional observations or notes",
    )

    class Meta(TimeStampedModel.Meta):
        ordering = ["-recorded_at"]
        verbose_name = "Temperature Reading"
        verbose_name_plural = "Temperature Readings"
        indexes = [
            models.Index(fields=["admission", "-recorded_at"]),
        ]

    def __str__(self):
        return (
            f"Temp {self.temperature}°C at {self.recorded_at:%Y-%m-%d %H:%M} "
            f"for {self.admission.patient}"
        )

    @property
    def is_febrile(self) -> bool:
        """Temperature >= 37.5°C is considered febrile."""
        return self.temperature >= Decimal("37.5")

    @property
    def is_hypothermic(self) -> bool:
        """Temperature <= 35.0°C is considered hypothermic."""
        return self.temperature <= Decimal("35.0")


class FluidBalanceSheet(TimeStampedModel):
    """Daily Ministry of Health fluid balance chart for an admission."""

    admission = models.ForeignKey(
        Admission,
        on_delete=models.CASCADE,
        related_name="fluid_balance_sheets",
        help_text="Admission this fluid balance sheet belongs to",
    )
    chart_date = models.DateField(
        help_text="Date for the 24-hour fluid balance sheet",
    )
    recorded_by = models.ForeignKey(
        User,
        on_delete=models.PROTECT,
        related_name="fluid_balance_sheets",
        help_text="User who created the sheet",
    )
    patient_weight_kg = models.DecimalField(
        max_digits=5,
        decimal_places=1,
        null=True,
        blank=True,
        validators=[MinValueValidator(Decimal("0.0"))],
        help_text="Patient weight in kilograms for this sheet",
    )
    intravenous_infusion_notes = models.TextField(
        blank=True,
        help_text="Intravenous infusion details noted on the chart",
    )
    other_instructions = models.TextField(
        blank=True,
        help_text="Other instructions recorded on the chart",
    )

    class Meta(TimeStampedModel.Meta):
        ordering = ["-chart_date", "-created_at"]
        verbose_name = "Fluid Balance Sheet"
        verbose_name_plural = "Fluid Balance Sheets"
        constraints = [
            models.UniqueConstraint(
                fields=["admission", "chart_date"],
                name="unique_fluid_balance_sheet_per_admission_day",
            )
        ]
        indexes = [models.Index(fields=["admission", "-chart_date"])]

    def __str__(self):
        return f"Fluid balance {self.chart_date:%Y-%m-%d} for {self.admission.patient}"

    def _entry_total(self, *entry_types: str) -> int:
        total = self.entries.filter(entry_type__in=entry_types).aggregate(
            total=models.Sum("amount_ml")
        )["total"]
        return int(total or 0)

    @property
    def total_intravenous_intake_ml(self) -> int:
        return self._entry_total(FluidBalanceEntry.EntryType.INTRAVENOUS)

    @property
    def total_alimentary_intake_ml(self) -> int:
        return self._entry_total(FluidBalanceEntry.EntryType.ALIMENTARY)

    @property
    def total_other_intake_ml(self) -> int:
        return self._entry_total(FluidBalanceEntry.EntryType.OTHER_INTAKE)

    @property
    def total_intake_ml(self) -> int:
        return (
            self.total_intravenous_intake_ml
            + self.total_alimentary_intake_ml
            + self.total_other_intake_ml
        )

    @property
    def total_vomit_output_ml(self) -> int:
        return self._entry_total(FluidBalanceEntry.EntryType.VOMIT)

    @property
    def total_stool_output_ml(self) -> int:
        return self._entry_total(FluidBalanceEntry.EntryType.STOOL)

    @property
    def total_nasogastric_output_ml(self) -> int:
        return self._entry_total(FluidBalanceEntry.EntryType.NASOGASTRIC)

    @property
    def total_other_output_ml(self) -> int:
        return self._entry_total(FluidBalanceEntry.EntryType.OTHER_OUTPUT)

    @property
    def total_urine_output_ml(self) -> int:
        return self._entry_total(FluidBalanceEntry.EntryType.URINE)

    @property
    def total_output_ml(self) -> int:
        return (
            self.total_vomit_output_ml
            + self.total_stool_output_ml
            + self.total_nasogastric_output_ml
            + self.total_other_output_ml
            + self.total_urine_output_ml
        )

    @property
    def net_balance_ml(self) -> int:
        return self.total_intake_ml - self.total_output_ml


class FluidBalanceEntry(TimeStampedModel):
    """Individual categorized entry within a daily fluid balance sheet."""

    class EntryType(models.TextChoices):
        INTRAVENOUS = "INTRAVENOUS", "Intravenous"
        ALIMENTARY = "ALIMENTARY", "Alimentary"
        OTHER_INTAKE = "OTHER_INTAKE", "Other Intake"
        VOMIT = "VOMIT", "Vomit"
        STOOL = "STOOL", "Stool"
        NASOGASTRIC = "NASOGASTRIC", "Naso Gastric"
        OTHER_OUTPUT = "OTHER_OUTPUT", "Other Output"
        URINE = "URINE", "Urine"

    fluid_balance_sheet = models.ForeignKey(
        FluidBalanceSheet,
        on_delete=models.CASCADE,
        related_name="entries",
        help_text="Fluid balance sheet this entry belongs to",
    )
    recorded_at = models.DateTimeField(
        help_text="When the fluid entry was recorded",
    )
    recorded_by = models.ForeignKey(
        User,
        on_delete=models.PROTECT,
        related_name="fluid_balance_entries",
        help_text="Nurse/clinician who recorded the entry",
    )
    entry_type = models.CharField(
        max_length=20,
        choices=EntryType.choices,
        help_text="Category of fluid balance entry",
    )
    item_type = models.CharField(
        max_length=100,
        blank=True,
        help_text="Type/name of fluid, feed, or output item",
    )
    bottle_number = models.CharField(
        max_length=50,
        blank=True,
        help_text="Bottle number for IV intake where applicable",
    )
    amount_ml = models.PositiveIntegerField(
        null=True,
        blank=True,
        help_text="Measured amount in mL",
    )
    specific_gravity = models.DecimalField(
        max_digits=4,
        decimal_places=3,
        null=True,
        blank=True,
        validators=[MinValueValidator(Decimal("0.000"))],
        help_text="Urine specific gravity where applicable",
    )
    notes = models.TextField(
        blank=True,
        help_text="Additional notes for this fluid balance entry",
    )

    class Meta(TimeStampedModel.Meta):
        ordering = ["-recorded_at", "-created_at"]
        verbose_name = "Fluid Balance Entry"
        verbose_name_plural = "Fluid Balance Entries"
        indexes = [
            models.Index(fields=["fluid_balance_sheet", "-recorded_at"]),
            models.Index(fields=["fluid_balance_sheet", "entry_type"]),
        ]

    def __str__(self):
        return (
            f"{self.get_entry_type_display()} at {self.recorded_at:%Y-%m-%d %H:%M} "
            f"for {self.fluid_balance_sheet.admission.patient}"
        )


class BloodTransfusionObservation(TimeStampedModel):
    """
    Blood transfusion observation chart for monitoring patient during transfusion.

    Based on the Kenya hospital blood transfusion observation form, this tracks:
    - Patient info (linked via admission)
    - Blood product details
    - Periodic vital sign observations (before, during, and after transfusion)
    - Transfusion reactions
    """

    BLOOD_PRODUCT_CHOICES = [
        ("WHOLE", "Whole Blood"),
        ("PACKED_RED_CELLS", "Packed Red Cells"),
        ("FFP", "Fresh Frozen Plasma"),
        ("PLATELETS", "Platelets"),
        ("CRYOPRECIPITATE", "Cryoprecipitate"),
        ("OTHER", "Other"),
    ]

    STATUS_CHOICES = [
        ("IN_PROGRESS", "In Progress"),
        ("COMPLETED", "Completed"),
        ("STOPPED", "Stopped - Reaction"),
        ("CANCELLED", "Cancelled"),
    ]

    admission = models.ForeignKey(
        Admission,
        on_delete=models.CASCADE,
        related_name="blood_transfusions",
        help_text="Admission this transfusion belongs to",
    )

    # Blood product details
    blood_product = models.CharField(
        max_length=30,
        choices=BLOOD_PRODUCT_CHOICES,
        help_text="Type of blood product transfused",
    )
    blood_product_other = models.CharField(
        max_length=100,
        blank=True,
        help_text="Specify if blood product is 'Other'",
    )
    blood_unit_number = models.CharField(
        max_length=50,
        help_text="Blood unit/bag number",
    )
    blood_group = models.CharField(
        max_length=10,
        blank=True,
        help_text="Blood group of the product (e.g., A+, O-)",
    )
    amount_ml = models.PositiveIntegerField(
        help_text="Amount to be transfused in mL",
    )

    # Timing
    transfusion_date = models.DateField(
        help_text="Date of transfusion",
    )
    time_started = models.TimeField(
        null=True,
        blank=True,
        help_text="Time transfusion started",
    )
    time_ended = models.TimeField(
        null=True,
        blank=True,
        help_text="Time transfusion ended",
    )

    # Staff
    started_by = models.ForeignKey(
        User,
        on_delete=models.PROTECT,
        related_name="transfusions_started",
        help_text="Staff who started the transfusion",
    )
    counter_checked_by = models.ForeignKey(
        User,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="transfusions_counter_checked",
        help_text="Staff who counter-checked the blood product",
    )

    # Diagnosis context
    diagnosis = models.TextField(
        blank=True,
        help_text="Diagnosis/indication for transfusion",
    )

    # Status
    status = models.CharField(
        max_length=20,
        choices=STATUS_CHOICES,
        default="IN_PROGRESS",
        help_text="Current status of the transfusion",
    )

    # Blood unit expiry
    expiry_date = models.DateField(
        null=True,
        blank=True,
        help_text="Expiry date of the blood unit/bag",
    )

    # Reaction
    reaction_occurred = models.BooleanField(
        default=False,
        help_text="Whether a transfusion reaction occurred",
    )
    reaction_type = models.CharField(
        max_length=200,
        blank=True,
        help_text="Type of reaction (if any)",
    )
    reaction_action_taken = models.TextField(
        blank=True,
        help_text="Action taken in response to the reaction",
    )

    class Meta(TimeStampedModel.Meta):
        ordering = ["-transfusion_date", "-time_started"]
        verbose_name = "Blood Transfusion"
        verbose_name_plural = "Blood Transfusions"
        indexes = [
            models.Index(fields=["admission", "-transfusion_date"]),
        ]

    def __str__(self):
        product_display: str = self.get_blood_product_display()  # type: ignore[attr-defined]
        return (
            f"{product_display} ({self.amount_ml}ml) - "
            f"{self.transfusion_date} for {self.admission.patient}"
        )


class TransfusionObservationEntry(TimeStampedModel):
    """
    Individual observation entry during a blood transfusion.

    Based on the physical form, observations are taken at:
    Before transfusion, 00 min, 15 min, 45 min, 1hr 15min, 1hr 45min,
    2hr 15min, 2hr 45min, 3hr 15min, 3hr 45min, 4hr 15min, 4hr after.
    """

    OBSERVATION_INTERVAL_CHOICES = [
        ("BEFORE", "Before Transfusion"),
        ("00_MIN", "00 Minutes"),
        ("15_MIN", "15 Minutes"),
        ("45_MIN", "45 Minutes"),
        ("1HR_15MIN", "1hr 15 Minutes"),
        ("1HR_45MIN", "1hr 45 Minutes"),
        ("2HR_15MIN", "2hr 15 Minutes"),
        ("2HR_45MIN", "2hr 45 Minutes"),
        ("3HR_15MIN", "3hr 15 Minutes"),
        ("3HR_45MIN", "3hr 45 Minutes"),
        ("4HR_15MIN", "4hr 15 Minutes"),
        ("4HR_AFTER", "4hr After Transfusion"),
    ]

    transfusion = models.ForeignKey(
        BloodTransfusionObservation,
        on_delete=models.CASCADE,
        related_name="observations",
        help_text="Parent transfusion record",
    )
    observation_interval = models.CharField(
        max_length=20,
        choices=OBSERVATION_INTERVAL_CHOICES,
        help_text="Observation timing interval",
    )
    exact_time = models.TimeField(
        help_text="Exact time the observation was taken",
    )
    recorded_by = models.ForeignKey(
        User,
        on_delete=models.PROTECT,
        related_name="transfusion_observations",
        help_text="Staff who recorded this observation",
    )

    # Vital signs
    blood_pressure = models.CharField(
        max_length=20,
        blank=True,
        help_text="Blood pressure (e.g., '120/80')",
    )
    temperature = models.DecimalField(
        max_digits=4,
        decimal_places=1,
        null=True,
        blank=True,
        help_text="Temperature in °C",
    )
    pulse = models.IntegerField(
        null=True,
        blank=True,
        help_text="Pulse rate in BPM",
    )
    respiratory_rate = models.IntegerField(
        null=True,
        blank=True,
        help_text="Respiratory rate in breaths/min",
    )
    remarks = models.TextField(
        blank=True,
        help_text="Additional remarks or observations",
    )

    class Meta(TimeStampedModel.Meta):
        ordering = ["exact_time"]
        verbose_name = "Transfusion Observation Entry"
        verbose_name_plural = "Transfusion Observation Entries"
        unique_together = ["transfusion", "observation_interval"]
        indexes = [
            models.Index(fields=["transfusion", "observation_interval"]),
        ]

    def __str__(self):
        interval_display: str = self.get_observation_interval_display()  # type: ignore[attr-defined]
        return f"{interval_display} at {self.exact_time}"


class BPMonitoringReading(TimeStampedModel):
    """
    Blood pressure monitoring record for inpatients.

    Tracks periodic BP readings with associated vitals for
    patients requiring close BP monitoring (e.g., hypertension,
    pre-eclampsia, post-operative).
    """

    POSITION_CHOICES = [
        ("SITTING", "Sitting"),
        ("STANDING", "Standing"),
        ("LYING", "Lying/Supine"),
        ("LEFT_LATERAL", "Left Lateral"),
    ]

    admission = models.ForeignKey(
        Admission,
        on_delete=models.CASCADE,
        related_name="bp_readings",
        help_text="Admission this reading belongs to",
    )
    recorded_at = models.DateTimeField(
        help_text="When the reading was taken",
    )
    recorded_by = models.ForeignKey(
        User,
        on_delete=models.PROTECT,
        related_name="bp_readings",
        help_text="Nurse/clinician who recorded the reading",
    )

    # Blood pressure
    systolic = models.IntegerField(
        help_text="Systolic blood pressure (mmHg)",
        validators=[MinValueValidator(0)],
    )
    diastolic = models.IntegerField(
        help_text="Diastolic blood pressure (mmHg)",
        validators=[MinValueValidator(0)],
    )

    # Associated vitals
    pulse = models.IntegerField(
        null=True,
        blank=True,
        help_text="Pulse rate in BPM",
        validators=[MinValueValidator(0)],
    )
    position = models.CharField(
        max_length=20,
        choices=POSITION_CHOICES,
        default="SITTING",
        help_text="Patient position when reading was taken",
    )

    # Context
    arm = models.CharField(
        max_length=10,
        blank=True,
        help_text="Which arm was used (e.g., Left, Right)",
    )
    notes = models.TextField(
        blank=True,
        help_text="Additional notes (e.g., medication taken, symptoms)",
    )

    class Meta(TimeStampedModel.Meta):
        ordering = ["-recorded_at"]
        verbose_name = "BP Monitoring Reading"
        verbose_name_plural = "BP Monitoring Readings"
        indexes = [
            models.Index(fields=["admission", "-recorded_at"]),
        ]

    def __str__(self):
        return (
            f"BP {self.systolic}/{self.diastolic} at {self.recorded_at:%Y-%m-%d %H:%M} "
            f"for {self.admission.patient}"
        )

    @property
    def mean_arterial_pressure(self) -> int:
        """Calculate Mean Arterial Pressure (MAP)."""
        return round(self.diastolic + (self.systolic - self.diastolic) / 3)

    @property
    def bp_display(self) -> str:
        """Display blood pressure as string."""
        return f"{self.systolic}/{self.diastolic}"

    @property
    def is_hypertensive(self) -> bool:
        """Systolic >= 140 or diastolic >= 90."""
        return self.systolic >= 140 or self.diastolic >= 90

    @property
    def is_hypotensive(self) -> bool:
        """Systolic < 90 or diastolic < 60."""
        return self.systolic < 90 or self.diastolic < 60


class MedicationAdministration(TimeStampedModel):
    """
    Medication Administration Record (MAR) entry.

    Tracks the actual administration of medication to an inpatient
    at the bedside. Each record links to a PrescriptionItem (the order)
    and an Admission (the context).
    """

    ADMIN_STATUS_CHOICES = [
        ("SCHEDULED", "Scheduled"),
        ("GIVEN", "Given"),
        ("SKIPPED", "Skipped"),
        ("REFUSED", "Refused"),
        ("HELD", "Held"),
        ("VOMITED", "Vomited"),
    ]

    admission = models.ForeignKey(
        Admission,
        on_delete=models.CASCADE,
        related_name="medication_administrations",
        help_text="Admission this record belongs to",
    )
    prescription_item = models.ForeignKey(
        "pharmacy.PrescriptionItem",
        on_delete=models.PROTECT,
        related_name="administrations",
        help_text="The prescription item being administered",
    )
    scheduled_time = models.DateTimeField(
        help_text="When this dose is/was scheduled",
    )
    actual_time = models.DateTimeField(
        null=True,
        blank=True,
        help_text="When the dose was actually administered",
    )
    status = models.CharField(
        max_length=20,
        choices=ADMIN_STATUS_CHOICES,
        default="SCHEDULED",
        help_text="Administration status",
    )
    dose_given = models.CharField(
        max_length=100,
        blank=True,
        help_text="Actual dose administered (e.g., '500mg')",
    )
    route = models.CharField(
        max_length=50,
        blank=True,
        help_text="Route of administration (e.g., oral, IV, IM)",
    )
    administered_by = models.ForeignKey(
        User,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="medication_administrations",
        help_text="Nurse who administered/recorded",
    )
    notes = models.TextField(
        blank=True,
        help_text="Additional notes (reason for skipping, patient response)",
    )
    is_prn = models.BooleanField(
        default=False,
        help_text="Whether this is a PRN (as-needed) administration",
    )

    class Meta(TimeStampedModel.Meta):
        ordering = ["-scheduled_time"]
        verbose_name = "Medication Administration"
        verbose_name_plural = "Medication Administrations"
        indexes = [
            models.Index(fields=["admission", "-scheduled_time"]),
            models.Index(fields=["prescription_item", "-scheduled_time"]),
        ]

    def __str__(self):
        status_display: str = self.get_status_display()  # type: ignore[attr-defined]
        return (
            f"{status_display} — {self.dose_given or 'pending'} "
            f"at {self.scheduled_time:%Y-%m-%d %H:%M} "
            f"for {self.admission.patient}"
        )

    @property
    def is_overdue(self) -> bool:
        """Scheduled but not yet administered and past scheduled time."""
        if self.status != "SCHEDULED":
            return False
        return timezone.now() > self.scheduled_time

    @property
    def drug_name(self) -> str:
        """Convenience access to the drug name from the prescription item."""
        try:
            return self.prescription_item.drug.name
        except Exception:
            return ""

    def administer(self, user, dose_given: str = "", notes: str = ""):
        """Record that this dose was given."""
        self.status = "GIVEN"
        self.actual_time = timezone.now()
        self.administered_by = user
        if dose_given:
            self.dose_given = dose_given
        if notes:
            self.notes = notes
        self.save(
            update_fields=[
                "status",
                "actual_time",
                "administered_by",
                "dose_given",
                "notes",
                "updated_at",
            ]
        )


# ============================================================================
# Signals
# ============================================================================

from django.db.models.signals import post_save
from django.dispatch import receiver


@receiver(post_save, sender=Admission)
def create_kardex_for_admission(sender, instance, created, **kwargs):
    """
    Auto-create Nursing Kardex when an Admission is created.

    This ensures every admission has a Kardex for nursing care coordination.
    Pre-populates allergies from the patient's structured allergy records.
    """
    if created:
        # Build allergy summary from patient's active allergy records
        allergies_text = ""
        try:
            active_allergies = instance.patient.allergies.filter(status="ACTIVE").values_list(
                "substance", flat=True
            )
            if active_allergies:
                allergies_text = ", ".join(active_allergies)
        except Exception:
            pass  # Graceful fallback if allergy model not available

        # Fallback: check latest encounter's free-text allergies field
        if not allergies_text and instance.opd_encounter:
            allergies_text = instance.opd_encounter.allergies or ""

        NursingKardex.objects.create(
            admission=instance,
            allergies=allergies_text,
            dietary_requirements="Regular",
        )


# ============================================================================
# Adverse Transfusion Reaction (ATR) — PPB Form FOM20/MIP/PMS/SOP/001
# ============================================================================


class GeneralReaction(models.TextChoices):
    FEVER = "FEVER", "Fever"
    CHILLS_RIGORS = "CHILLS_RIGORS", "Chills/Rigors"
    FLUSHING = "FLUSHING", "Flushing"
    NAUSEA_VOMITING = "NAUSEA_VOMITING", "Nausea/Vomiting"


class DermatologicalReaction(models.TextChoices):
    URTICARIA = "URTICARIA", "Urticaria"
    OTHER_SKIN_RASH = "OTHER_SKIN_RASH", "Other Skin Rash"


class CardiacRespiratoryReaction(models.TextChoices):
    CHEST_PAIN = "CHEST_PAIN", "Chest Pain"
    DYSPNOEA = "DYSPNOEA", "Dyspnoea"
    HYPOTENSION = "HYPOTENSION", "Hypotension"
    TACHYCARDIA = "TACHYCARDIA", "Tachycardia"


class RenalReaction(models.TextChoices):
    HAEMOGLOBINURIA = "HAEMOGLOBINURIA", "Haemoglobinuria (Dark Urine)"
    OLIGURIA = "OLIGURIA", "Oliguria"
    ANURIA = "ANURIA", "Anuria"


class HaematologicalReaction(models.TextChoices):
    UNEXPLAINED_BLEEDING = "UNEXPLAINED_BLEEDING", "Unexplained Bleeding"


class HemolysisResult(models.TextChoices):
    PRESENT = "PRESENT", "Present"
    ABSENT = "ABSENT", "Absent"
    EQUIVOCAL = "EQUIVOCAL", "Equivocal"


class HemolysisSeverity(models.TextChoices):
    MILD = "MILD", "Mild"
    MODERATE = "MODERATE", "Moderate"
    MARKED = "MARKED", "Marked"


class AgglutinationResult(models.TextChoices):
    PRESENT = "PRESENT", "Present"
    ABSENT = "ABSENT", "Absent"


class CompatibilityResult(models.TextChoices):
    COMPATIBLE = "COMPATIBLE", "Compatible"
    INCOMPATIBLE = "INCOMPATIBLE", "Incompatible"


class DonorHemolysisResult(models.TextChoices):
    PRESENT = "PRESENT", "Present"
    ABSENT = "ABSENT", "Absent"


class CausalityAssessment(models.TextChoices):
    YES = "YES", "Yes"
    NO = "NO", "No"
    INCONCLUSIVE = "INCONCLUSIVE", "Inconclusive"


class ATRStatus(models.TextChoices):
    DRAFT = "DRAFT", "Draft"
    PENDING_REVIEW = "PENDING_REVIEW", "Pending Review"
    SUBMITTED = "SUBMITTED", "Submitted to PPB"
    ACKNOWLEDGED = "ACKNOWLEDGED", "Acknowledged by PPB"


class ObstetricStatus(models.TextChoices):
    NA = "NA", "N/A"
    GRAVID = "GRAVID", "Gravid"
    PARA = "PARA", "Para"


class AdverseTransfusionReaction(FacilityScopedModel, TimeStampedModel):
    """
    Adverse Transfusion Reaction report aligned with Kenya MOH/PPB form
    FOM20/MIP/PMS/SOP/001.

    This is the detailed regulatory report created after a blood transfusion
    reaction is detected. The existing ``BloodTransfusionObservation.mark_reaction()``
    is the immediate clinical stop; this model captures the full PPB-mandated
    investigation and reporting data.

    Sections follow the physical form layout:
    1. Patient Information (linked via transfusion → admission → patient)
    2. Reaction Information (structured checkboxes per category)
    3. Vital Signs (auto-populated from observation entries)
    4. Component Information (from parent transfusion record)
    5. Lab Investigation (filled by transfusion manager)
    6. Reporter Details
    7. PPB Tracking
    """

    # ── Section 1: Source event ──────────────────────────────────────────
    transfusion = models.OneToOneField(
        BloodTransfusionObservation,
        on_delete=models.CASCADE,
        related_name="adverse_reaction_report",
        help_text="Blood transfusion that triggered this reaction report",
    )

    # ── Lab order link (integrates with lab module workflow) ─────────────
    lab_order = models.OneToOneField(
        "laboratory.LabOrder",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="atr_report",
        help_text="Lab order created for post-transfusion investigation",
    )

    # ── Section 1: Patient history ───────────────────────────────────────
    pre_transfusion_hb = models.DecimalField(
        max_digits=4,
        decimal_places=1,
        null=True,
        blank=True,
        help_text="Pre-transfusion haemoglobin (g/dL)",
    )
    obstetric_status = models.CharField(
        max_length=10,
        choices=ObstetricStatus.choices,
        default=ObstetricStatus.NA,
        help_text="Obstetric history status",
    )
    gravida = models.PositiveIntegerField(
        null=True,
        blank=True,
        help_text="Number of pregnancies (if obstetric status is Gravid)",
    )
    para = models.PositiveIntegerField(
        null=True,
        blank=True,
        help_text="Number of deliveries (if obstetric status is Para)",
    )
    previous_transfusion = models.BooleanField(
        null=True,
        blank=True,
        help_text="Has the patient had a previous transfusion?",
    )
    previous_transfusion_comment = models.TextField(
        blank=True,
        help_text="Details of previous transfusions",
    )
    previous_reactions = models.BooleanField(
        null=True,
        blank=True,
        help_text="Has the patient had previous transfusion reactions?",
    )
    previous_reactions_comment = models.TextField(
        blank=True,
        help_text="Details of previous reactions",
    )
    current_medications = models.TextField(
        blank=True,
        help_text="Current medications at time of transfusion",
    )

    # ── Section 2: Reaction categories (JSONField checkbox lists) ────────
    general_reactions = models.JSONField(
        default=list,
        blank=True,
        help_text="General reactions: Fever, Chills/Rigors, Flushing, Nausea/Vomiting",
    )
    dermatological_reactions = models.JSONField(
        default=list,
        blank=True,
        help_text="Dermatological reactions: Urticaria, Other Skin Rash",
    )
    cardiac_respiratory_reactions = models.JSONField(
        default=list,
        blank=True,
        help_text="Cardiac/Respiratory: Chest Pain, Dyspnoea, Hypotension, Tachycardia",
    )
    renal_reactions = models.JSONField(
        default=list,
        blank=True,
        help_text="Renal: Haemoglobinuria, Oliguria, Anuria",
    )
    haematological_reactions = models.JSONField(
        default=list,
        blank=True,
        help_text="Haematological: Unexplained Bleeding",
    )
    other_reactions = models.TextField(
        blank=True,
        help_text="Other reactions not listed above (free text)",
    )

    # ── Section 3: Vital signs snapshot ──────────────────────────────────
    vitals_at_start_bp = models.CharField(max_length=20, blank=True)
    vitals_at_start_temp = models.DecimalField(
        max_digits=4, decimal_places=1, null=True, blank=True
    )
    vitals_at_start_pulse = models.IntegerField(null=True, blank=True)
    vitals_at_start_rr = models.IntegerField(null=True, blank=True)

    vitals_during_bp = models.CharField(max_length=20, blank=True)
    vitals_during_temp = models.DecimalField(max_digits=4, decimal_places=1, null=True, blank=True)
    vitals_during_pulse = models.IntegerField(null=True, blank=True)
    vitals_during_rr = models.IntegerField(null=True, blank=True)

    vitals_at_stop_bp = models.CharField(max_length=20, blank=True)
    vitals_at_stop_temp = models.DecimalField(max_digits=4, decimal_places=1, null=True, blank=True)
    vitals_at_stop_pulse = models.IntegerField(null=True, blank=True)
    vitals_at_stop_rr = models.IntegerField(null=True, blank=True)

    # ── Section 5: Lab Investigation ─────────────────────────────────────
    recipient_supernatant_hemolysis = models.CharField(
        max_length=15,
        choices=HemolysisResult.choices,
        blank=True,
        help_text="Recipient's blood supernatant hemolysis",
    )
    recipient_hemolysis_severity = models.CharField(
        max_length=10,
        choices=HemolysisSeverity.choices,
        blank=True,
        help_text="If hemolysis present, severity",
    )
    recipient_agglutination = models.CharField(
        max_length=10,
        choices=AgglutinationResult.choices,
        blank=True,
        help_text="Recipient's blood agglutination",
    )
    haematological_results = models.JSONField(
        default=dict,
        blank=True,
        help_text="Haematological results: {wbc, hb, rbc, hct, mcv, mch, mchc, plt}",
    )
    blood_film_rbc = models.TextField(
        blank=True,
        help_text="Blood film RBC findings",
    )
    blood_film_wbc = models.TextField(
        blank=True,
        help_text="Blood film WBC findings",
    )
    blood_film_plt = models.TextField(
        blank=True,
        help_text="Blood film platelet findings",
    )
    donor_supernatant_hemolysis = models.CharField(
        max_length=10,
        choices=DonorHemolysisResult.choices,
        blank=True,
        help_text="Donor blood supernatant hemolysis",
    )
    donor_pack_age = models.CharField(
        max_length=50,
        blank=True,
        help_text="Age of the donor blood pack",
    )
    culture_donor_pack_results = models.TextField(
        blank=True,
        help_text="Culture results for donor pack",
    )
    culture_recipient_blood_results = models.TextField(
        blank=True,
        help_text="Culture results for recipient blood",
    )
    compatibility_saline_rt = models.CharField(
        max_length=15,
        choices=CompatibilityResult.choices,
        blank=True,
        help_text="Compatibility testing: Saline RT",
    )
    compatibility_saline_37 = models.CharField(
        max_length=15,
        choices=CompatibilityResult.choices,
        blank=True,
        help_text="Compatibility testing: Saline 37°C",
    )
    compatibility_ahg = models.CharField(
        max_length=15,
        choices=CompatibilityResult.choices,
        blank=True,
        help_text="Compatibility testing: AHG",
    )
    compatibility_albumin_37 = models.CharField(
        max_length=15,
        choices=CompatibilityResult.choices,
        blank=True,
        help_text="Compatibility testing: Albumin 37°C",
    )
    enzyme_treated_cells_result = models.TextField(
        blank=True,
        help_text="Enzyme-treated cells compatibility result",
    )
    anti_a_titres = models.CharField(
        max_length=50,
        blank=True,
        help_text="Anti-A titres (for group O → A/B/AB transfusions)",
    )
    anti_b_titres = models.CharField(
        max_length=50,
        blank=True,
        help_text="Anti-B titres (for group O → A/B/AB transfusions)",
    )
    urinalysis = models.TextField(
        blank=True,
        help_text="Urinalysis results",
    )
    evaluation_diagnosis = models.TextField(
        blank=True,
        help_text="Evaluation diagnosis after investigation",
    )
    reaction_related_to_transfusion = models.CharField(
        max_length=15,
        choices=CausalityAssessment.choices,
        blank=True,
        help_text="Was the adverse reaction related to the transfusion?",
    )

    # ── Section 6: Reporter details ──────────────────────────────────────
    initial_reporter = models.ForeignKey(
        User,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="atr_reports",
        help_text="Staff who initially reported the reaction",
    )
    initial_reporter_cadre = models.CharField(
        max_length=100,
        blank=True,
        help_text="Cadre/designation of the initial reporter",
    )
    initial_reporter_mobile = models.CharField(
        max_length=20,
        blank=True,
        help_text="Mobile number of the initial reporter",
    )
    initial_reporter_email = models.EmailField(
        blank=True,
        help_text="Email of the initial reporter",
    )
    report_date = models.DateField(
        help_text="Date the ATR report was created",
    )
    ppb_submitter_name = models.CharField(
        max_length=200,
        blank=True,
        help_text="Name of person submitting to PPB (if different from reporter)",
    )
    ppb_submitter_cadre = models.CharField(
        max_length=100,
        blank=True,
        help_text="Cadre/designation of the PPB submitter",
    )
    ppb_submitter_mobile = models.CharField(
        max_length=20,
        blank=True,
        help_text="Mobile number of the PPB submitter",
    )
    ppb_submitter_email = models.EmailField(
        blank=True,
        help_text="Email of the PPB submitter",
    )
    submission_date = models.DateField(
        null=True,
        blank=True,
        help_text="Date the form was submitted to PPB",
    )

    # ── Section 7: PPB tracking ──────────────────────────────────────────
    status = models.CharField(
        max_length=20,
        choices=ATRStatus.choices,
        default=ATRStatus.DRAFT,
        help_text="Regulatory submission status",
    )
    adr_report_number = models.CharField(
        max_length=50,
        blank=True,
        help_text="PPB-assigned ADR report number",
    )
    vigiflow_entry_number = models.CharField(
        max_length=50,
        blank=True,
        help_text="PPB Vigiflow entry number",
    )
    ppb_date_received = models.DateField(
        null=True,
        blank=True,
        help_text="Date PPB received the report",
    )

    class Meta(TimeStampedModel.Meta):
        ordering = ["-report_date", "-created_at"]
        verbose_name = "Adverse Transfusion Reaction"
        verbose_name_plural = "Adverse Transfusion Reactions"
        indexes = [
            models.Index(fields=["transfusion"]),
            models.Index(fields=["status", "-report_date"]),
        ]

    def __str__(self):
        patient = self.transfusion.admission.patient
        return f"ATR #{self.id} — {patient} ({self.report_date})"

    def auto_populate_vitals(self):
        """Pull vital signs from linked TransfusionObservationEntry records."""
        entries = self.transfusion.observations.all()
        entry_map = {e.observation_interval: e for e in entries}

        # At start = BEFORE observation
        before = entry_map.get("BEFORE")
        if before:
            self.vitals_at_start_bp = before.blood_pressure or ""
            self.vitals_at_start_temp = before.temperature
            self.vitals_at_start_pulse = before.pulse
            self.vitals_at_start_rr = before.respiratory_rate

        # During = 15_MIN observation (closest to the standard "During 15min" on the form)
        during = entry_map.get("15_MIN")
        if during:
            self.vitals_during_bp = during.blood_pressure or ""
            self.vitals_during_temp = during.temperature
            self.vitals_during_pulse = during.pulse
            self.vitals_during_rr = during.respiratory_rate

        # At stop = last observation entry by exact_time
        if entries.exists():
            last_entry = entries.order_by("-exact_time").first()
            if last_entry and last_entry.observation_interval not in ("BEFORE", "15_MIN"):
                self.vitals_at_stop_bp = last_entry.blood_pressure or ""
                self.vitals_at_stop_temp = last_entry.temperature
                self.vitals_at_stop_pulse = last_entry.pulse
                self.vitals_at_stop_rr = last_entry.respiratory_rate

    def create_lab_order(self, user):
        """
        Create a lab order for post-transfusion investigation.

        Ordered tests (per MOH form section 4):
        - CBC/FBC (WBC, HB, RBC, HCT, MCV, MCH, MCHC, PLT)
        - BG (Blood Grouping — for crossmatch)
        - UA (Urinalysis — for hemoglobinuria)

        Returns the created LabOrder, or raises ValidationError if one already exists.
        """
        from hmis.apps.laboratory.models import LabOrder, LabOrderItem, TestCatalog

        if self.lab_order_id:
            raise ValidationError("A lab order has already been created for this ATR report.")

        admission = self.transfusion.admission
        patient = admission.patient
        encounter = admission.ipd_encounter

        # Determine which tests to order per MOH form section 4:
        # Item 3: CBC (haematological results + blood film)
        # Items 6-7: Blood culture (donor pack + recipient blood)
        # Item 11: Urinalysis (hemoglobinuria check)
        ATR_TEST_CODES = ["CBC", "BCULTURE", "UA"]
        tests = TestCatalog.objects.filter(code__in=ATR_TEST_CODES, is_active=True)
        if not tests.exists():
            raise ValidationError(
                "No matching lab tests found in the catalog. "
                "Ensure CBC, BCULTURE, and UA tests are configured."
            )

        order = LabOrder.objects.create(
            patient=patient,
            encounter=encounter,
            admission=admission,
            ordered_by=user,
            order_type="IN_HOUSE",
            priority="STAT",
            clinical_notes=(
                f"Post-transfusion reaction investigation (ATR #{self.id}). "
                f"Blood product: {self.transfusion.get_blood_product_display()}, "
                f"Unit: {self.transfusion.blood_unit_number}. "
                f"Reactions: {', '.join(self.reaction_categories_display)}."
            ),
            facility=self.facility,
            organization=self.organization,
        )

        for test in tests:
            LabOrderItem.objects.create(
                lab_order=order,
                test=test,
                unit_cost=test.cost,
                special_instructions="ATR investigation — urgent post-transfusion reaction workup",
            )

        order.calculate_total_cost()

        self.lab_order = order
        self.save(update_fields=["lab_order", "updated_at"])

        return order

    def populate_from_lab_results(self):
        """
        Pull verified lab results from the linked lab order into the ATR
        lab investigation fields.

        Maps:
        - CBC/FBC results → haematological_results JSON + blood_film fields
        - UA results → urinalysis text
        - Does NOT overwrite manually-entered fields.

        Returns True if any fields were updated.
        """
        if not self.lab_order_id:
            return False

        updated = False
        results_by_code: dict[str, object] = {}

        for item in self.lab_order.items.select_related("test", "result").all():
            if hasattr(item, "result") and item.result.verification_status == "VERIFIED":
                results_by_code[item.test.code] = item.result

        # Map CBC/FBC results → haematological_results
        haem_map = {
            "WBC": "wbc",
            "HB": "hb",
            "PLT": "plt",
        }
        cbc_result = results_by_code.get("CBC") or results_by_code.get("FBC")
        if cbc_result:
            current = self.haematological_results or {}
            if cbc_result.text_value:
                # If result is a text blob, store it directly
                if not current:
                    self.haematological_results = {"notes": cbc_result.text_value}
                    updated = True
            elif cbc_result.numeric_value is not None:
                # Single numeric value from a non-panel CBC
                pass  # Handled by individual components below

        # Individual hematology components (if ordered separately or as panel items)
        for code, key in haem_map.items():
            result = results_by_code.get(code)
            if result and result.numeric_value is not None:
                current = self.haematological_results or {}
                if not current.get(key):
                    current[key] = str(result.numeric_value)
                    self.haematological_results = current
                    updated = True

        # Urinalysis → urinalysis field
        ua_result = results_by_code.get("UA")
        if ua_result and not self.urinalysis:
            value = ua_result.text_value or (
                str(ua_result.numeric_value) if ua_result.numeric_value is not None else ""
            )
            if value:
                self.urinalysis = value
                updated = True

        # Blood culture → culture fields (items 6 & 7 on MOH form)
        bculture_result = results_by_code.get("BCULTURE")
        if bculture_result:
            value = bculture_result.text_value or (
                str(bculture_result.numeric_value)
                if bculture_result.numeric_value is not None
                else ""
            )
            if value:
                if not self.culture_donor_pack_results:
                    self.culture_donor_pack_results = value
                    updated = True
                if not self.culture_recipient_blood_results:
                    self.culture_recipient_blood_results = value
                    updated = True

        update_fields = ["updated_at"]
        if updated:
            update_fields.extend(
                [
                    "haematological_results",
                    "urinalysis",
                    "culture_donor_pack_results",
                    "culture_recipient_blood_results",
                ]
            )
            self.save(update_fields=update_fields)

        return updated

    def submit_to_ppb(self, user=None, notes=""):
        """Transition status to SUBMITTED and record submission details."""
        if self.status in (ATRStatus.SUBMITTED, ATRStatus.ACKNOWLEDGED):
            raise ValidationError("This ATR report has already been submitted.")

        self.status = ATRStatus.SUBMITTED
        self.submission_date = timezone.now().date()
        if user and not self.ppb_submitter_name:
            self.ppb_submitter_name = user.get_full_name() or user.username
        self.save(
            update_fields=[
                "status",
                "submission_date",
                "ppb_submitter_name",
                "updated_at",
            ]
        )

    def mark_acknowledged(self, adr_number: str, vigiflow_number: str = ""):
        """Record PPB acknowledgment after submission."""
        if self.status != ATRStatus.SUBMITTED:
            raise ValidationError("ATR must be in SUBMITTED status to be acknowledged.")

        self.status = ATRStatus.ACKNOWLEDGED
        self.adr_report_number = adr_number
        self.vigiflow_entry_number = vigiflow_number
        self.ppb_date_received = timezone.now().date()
        self.save(
            update_fields=[
                "status",
                "adr_report_number",
                "vigiflow_entry_number",
                "ppb_date_received",
                "updated_at",
            ]
        )

    @property
    def has_lab_investigation(self) -> bool:
        """Return True if any lab investigation field has been filled."""
        lab_fields = [
            self.recipient_supernatant_hemolysis,
            self.recipient_agglutination,
            self.donor_supernatant_hemolysis,
            self.compatibility_saline_rt,
            self.compatibility_saline_37,
            self.compatibility_ahg,
            self.compatibility_albumin_37,
            self.urinalysis,
            self.evaluation_diagnosis,
            self.reaction_related_to_transfusion,
            self.culture_donor_pack_results,
            self.culture_recipient_blood_results,
            self.blood_film_rbc,
            self.blood_film_wbc,
            self.blood_film_plt,
            self.enzyme_treated_cells_result,
        ]
        if any(lab_fields):
            return True
        if self.haematological_results and self.haematological_results != {}:
            return True
        return False

    @property
    def reaction_categories_display(self) -> list[str]:
        """Return flattened list of all selected reaction labels."""
        labels: list[str] = []
        for val in self.general_reactions or []:
            labels.append(GeneralReaction(val).label)
        for val in self.dermatological_reactions or []:
            labels.append(DermatologicalReaction(val).label)
        for val in self.cardiac_respiratory_reactions or []:
            labels.append(CardiacRespiratoryReaction(val).label)
        for val in self.renal_reactions or []:
            labels.append(RenalReaction(val).label)
        for val in self.haematological_reactions or []:
            labels.append(HaematologicalReaction(val).label)
        if self.other_reactions:
            labels.append(self.other_reactions)
        return labels


# =============================================================================
# Discharge Template Configuration
# =============================================================================


class DischargeTemplateLayout(models.TextChoices):
    """Layout preset for discharge summary print templates."""

    STANDARD = "STANDARD", "Standard (narrative layout)"
    STRUCTURED = "STRUCTURED", "Structured (labelled fields in grid)"
    MINIMAL = "MINIMAL", "Minimal (compact single-page)"


class DischargeTemplate(FacilityScopedModel, TimeStampedModel):
    """
    Configurable discharge summary print template.

    Each facility can have multiple templates and set one as default.
    Templates control:
    - Which sections appear on the printed summary
    - Section ordering
    - Print layout variant (narrative, grid, compact)
    - Custom facility header text

    The combination (facility, name) must be unique so facilities
    can maintain multiple named templates without collisions.
    """

    name = models.CharField(
        max_length=120,
        help_text="Human-readable template name, e.g. 'Maternity Discharge'",
    )
    layout = models.CharField(
        max_length=20,
        choices=DischargeTemplateLayout.choices,
        default=DischargeTemplateLayout.STANDARD,
        help_text="Print layout variant (standard narrative, structured grid, minimal).",
    )
    is_default = models.BooleanField(
        default=False,
        help_text="Whether this is the default template for the facility.",
    )
    is_active = models.BooleanField(
        default=True,
        help_text="Inactive templates are hidden from the print selector.",
    )

    # Section configuration stored as JSON list:
    #  [
    #    {"key": "hospital_course", "label": "Hospital Course", "enabled": true},
    #    {"key": "investigations", "label": "Investigations Done", "enabled": true},
    #    ...
    #  ]
    sections = models.JSONField(
        default=list,
        blank=True,
        help_text=(
            "Ordered list of section configs. "
            "Each entry: {key, label, enabled}. "
            "The key maps to a content source (AI section id or model field)."
        ),
    )

    # Optional overrides printed on the document header
    header_title = models.CharField(
        max_length=200,
        blank=True,
        default="",
        help_text="Override document title (default: 'Discharge Summary').",
    )
    header_subtitle = models.CharField(
        max_length=200,
        blank=True,
        default="",
        help_text="Subtitle line printed below the facility name.",
    )
    show_signature_lines = models.BooleanField(
        default=True,
        help_text="Whether to include signature lines on the printed document.",
    )
    show_qr_code = models.BooleanField(
        default=True,
        help_text="Whether to include a QR code for document verification.",
    )

    class Meta(TimeStampedModel.Meta):
        ordering = ["-is_default", "name"]
        verbose_name = "Discharge Template"
        verbose_name_plural = "Discharge Templates"
        constraints = [
            models.UniqueConstraint(
                fields=["facility", "name"],
                name="unique_discharge_template_per_facility",
            ),
        ]

    def __str__(self) -> str:
        return f"{self.name} ({self.get_layout_display()})"

    def save(self, *args, **kwargs):
        # If marking as default, unset other defaults for the same facility.
        if self.is_default and self.facility_id:
            DischargeTemplate.objects.filter(
                facility=self.facility,
                is_default=True,
            ).exclude(
                pk=self.pk
            ).update(is_default=False)
        # Populate default sections when none are specified.
        if not self.sections:
            self.sections = self.get_default_sections()
        super().save(*args, **kwargs)

    @staticmethod
    def get_default_sections() -> list[dict]:
        """Return the default section configuration for a new template."""
        return [
            {"key": "patient_demographics", "label": "Patient Information", "enabled": True},
            {"key": "admission_details", "label": "Admission Details", "enabled": True},
            {"key": "diagnosis", "label": "Diagnosis", "enabled": True},
            {"key": "history", "label": "History", "enabled": True},
            {"key": "hospital_course", "label": "Hospital Course", "enabled": True},
            {"key": "physical_examination", "label": "Physical Examination", "enabled": True},
            {"key": "investigations", "label": "Investigations Done", "enabled": True},
            {"key": "management", "label": "Management", "enabled": True},
            {"key": "condition_at_discharge", "label": "Condition at Discharge", "enabled": True},
            {"key": "discharge_medications", "label": "Discharge Medications", "enabled": True},
            {"key": "discharge_instructions", "label": "Discharge Instructions", "enabled": True},
            {"key": "follow_up", "label": "Follow-up / TCA", "enabled": True},
        ]
