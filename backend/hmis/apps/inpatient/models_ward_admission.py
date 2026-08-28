# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
# ruff: noqa: ARG002, F401, F821, SIM108
"""Inpatient models ward admission for Vitora HMIS.

What this file is for:
- Implement models ward admission logic for the inpatient domain.

How to use it:
- Import classes and functions from this module in Django app code and tests.

Supported inputs/args:
- Python imports and Django ORM/runtime inputs; no standalone CLI arguments.
"""

from __future__ import annotations

import uuid
from datetime import timedelta
from decimal import Decimal
from typing import TYPE_CHECKING

from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError
from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import models
from django.db.models import Q
from django.utils import timezone

from hmis.apps.core.mixins import FacilityScopedModel
from hmis.apps.core.models import TimeStampedModel
from hmis.apps.core.pii import encrypted_pii_property

from .clearance import calculate_patient_blocking_balance

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


class Ward(FacilityScopedModel, TimeStampedModel):
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
        ("HDU", "High Dependency Unit"),
        ("ICU", "Intensive Care Unit"),
        ("NBU", "Newborn Unit"),
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
        "NBU": {"min_age_years": 0, "max_age_years": 1},
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
        "HDU": {
            "oxygen_equipped": True,
            "ventilator_capable": False,
            "isolation_capable": True,
        },
        "NBU": {
            "oxygen_equipped": True,
            "ventilator_capable": False,
            "isolation_capable": True,
        },
        "PEDIATRIC": {},  # age defaults handled separately via WARD_TYPE_AGE_DEFAULTS
    }

    name = models.CharField(
        max_length=100,
        help_text="Ward name (e.g., 'Medical Ward 1'), unique per facility",
    )
    code = models.CharField(
        max_length=20,
        help_text="Ward code (e.g., 'MED-01'), unique per facility",
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
        constraints = [
            models.UniqueConstraint(
                fields=["code", "facility"],
                name="unique_ward_code_per_facility",
            ),
            models.UniqueConstraint(
                fields=["name", "facility"],
                name="unique_ward_name_per_facility",
            ),
        ]

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


class Admission(FacilityScopedModel, TimeStampedModel):
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

    public_id = models.UUIDField(
        default=uuid.uuid4,
        unique=True,
        db_index=True,
        editable=False,
        help_text="Stable public UUID for external APIs and links.",
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
            # Unique admission number per facility
            models.UniqueConstraint(
                fields=["facility", "admission_number"],
                name="unique_admission_number_per_facility",
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

        # Get the last admission number for today within the same facility
        last_admission = Admission.objects.filter(
            admission_number__startswith=prefix,
            facility=self.facility,
        ).aggregate(Max("admission_number"))["admission_number__max"]

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
    follow_up_appointment = models.ForeignKey(
        "scheduling.Appointment",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="discharge_follow_ups",
        help_text="Scheduled follow-up appointment created from discharge",
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

        self._close_ipd_encounter()

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

    def _close_ipd_encounter(self):
        """Close the linked IPD encounter when the inpatient stay ends."""
        encounter = getattr(self.admission, "ipd_encounter", None)
        if encounter is None or encounter.status in {"CLOSED", "CANCELLED"}:
            return

        disposition_map = {
            "NORMAL": "TREATED_DISCHARGED",
            "ROUTINE": "TREATED_DISCHARGED",
            "AGAINST_ADVICE": "LEFT_AMA",
            "ABSCONDED": "LEFT_AMA",
            "TRANSFERRED": "REFERRED",
        }

        update_fields = ["status", "finalized_by", "finalized_at", "updated_at"]
        encounter.status = "CLOSED"
        encounter.finalized_by = self.discharged_by
        encounter.finalized_at = self.discharge_date
        discharge_note = f"Inpatient discharge outcome: {self.discharge_type}"
        if encounter.disposition_notes != discharge_note:
            encounter.disposition_notes = discharge_note
            update_fields.append("disposition_notes")

        disposition = disposition_map.get(self.discharge_type)
        if disposition and encounter.disposition != disposition:
            encounter.disposition = disposition
            update_fields.append("disposition")

        encounter.save(update_fields=update_fields)

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
            billing_balance = calculate_patient_blocking_balance(unpaid)
            outstanding = billing_balance["outstanding_amount"]
            if outstanding > 0:
                errors["billing_cleared"] = (
                    f"Cannot discharge: KES {outstanding:,.2f} patient-responsible outstanding balance"
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


class DischargeDraft(TimeStampedModel):
    """Persisted draft discharge summary for an active admission."""

    admission = models.OneToOneField(
        Admission,
        on_delete=models.CASCADE,
        related_name="discharge_draft",
        help_text="Admission this draft discharge belongs to",
    )
    discharge_type = models.CharField(
        max_length=20,
        choices=Discharge.DISCHARGE_TYPE_CHOICES,
        default="NORMAL",
    )
    diagnoses = models.JSONField(
        default=list,
        blank=True,
        help_text="Draft diagnosis entries (PRIMARY/SECONDARY/COMPLICATION)",
    )
    procedures_performed = models.TextField(blank=True, default="")
    treatment_summary = models.TextField(blank=True, default="")
    discharge_medications = models.JSONField(default=list, blank=True)
    maternity_continuity_action = models.CharField(
        max_length=40,
        choices=MATERNITY_CONTINUITY_ACTION_CHOICES,
        default="NONE",
    )
    follow_up_date = models.DateField(null=True, blank=True)
    follow_up_instructions = models.TextField(blank=True, default="")
    referral_facility = models.CharField(max_length=255, blank=True, default="")
    referral_reason = models.TextField(blank=True, default="")
    patient_instructions = models.TextField(blank=True, default="")
    generation_mode = models.CharField(max_length=20, blank=True, default="generate")
    created_by = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="created_discharge_drafts",
    )
    updated_by = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="updated_discharge_drafts",
    )

    class Meta(TimeStampedModel.Meta):
        ordering = ["-updated_at"]
        verbose_name = "Discharge Draft"
        verbose_name_plural = "Discharge Drafts"

    def __str__(self):
        return f"Draft: {self.admission.admission_number}"
