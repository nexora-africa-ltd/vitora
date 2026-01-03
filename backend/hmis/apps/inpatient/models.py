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

from decimal import Decimal
from django.contrib.auth import get_user_model
from django.core.validators import MinValueValidator
from django.db import models

from hmis.apps.core.models import TimeStampedModel

User = get_user_model()


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

    WARD_TYPE_CHOICES = [
        ("MEDICAL", "Medical Ward"),
        ("SURGICAL", "Surgical Ward"),
        ("PEDIATRIC", "Pediatric Ward"),
        ("MATERNITY", "Maternity Ward"),
        ("ICU", "Intensive Care Unit"),
        ("ISOLATION", "Isolation Ward"),
    ]

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

    class Meta:
        """Meta options for Ward model."""

        ordering = ["name"]
        verbose_name = "Ward"
        verbose_name_plural = "Wards"

    def __str__(self):
        """Return string representation."""
        return f"{self.name} ({self.code})"

    @property
    def available_beds(self) -> int:
        """
        Count of beds with status AVAILABLE.

        Returns:
            Number of beds in AVAILABLE status
        """
        return self.beds.filter(status="AVAILABLE").count()

    @property
    def occupancy_rate(self) -> float:
        """
        Current occupancy percentage.

        Returns:
            Occupancy rate as percentage (0-100)
        """
        total_beds = self.beds.count()
        if total_beds == 0:
            return 0.0

        occupied_beds = self.beds.filter(status="OCCUPIED").count()
        return round((occupied_beds / total_beds) * 100, 2)


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

    class Meta:
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
