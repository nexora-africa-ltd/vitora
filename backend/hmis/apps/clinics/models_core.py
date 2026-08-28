# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""Clinics models core for Vitora HMIS.

What this file is for:
- Implement models core logic for the clinics domain.

How to use it:
- Import classes and functions from this module in Django app code and tests.

Supported inputs/args:
- Python imports and Django ORM/runtime inputs; no standalone CLI arguments.
"""

from django.conf import settings
from django.db import models
from django.utils import timezone

from hmis.apps.core.mixins import FacilityScopedModel
from hmis.apps.core.models import TimeStampedModel

# =============================================================================
# Clinic Model - Organizational Unit / Service Delivery Point
# =============================================================================


class Clinic(FacilityScopedModel, TimeStampedModel):
    """
    Represents a clinical service delivery point.

    A clinic is an organizational unit where specific healthcare services
    are provided. Each clinic has its own queue, staff, and protocols.
    """

    # =========================================================================
    # Clinic Type Choices
    # =========================================================================
    CLINIC_TYPE_CHOICES = [
        # Primary Care
        ("GENERAL_OPD", "General OPD"),
        ("FILTER_CLINIC", "Filter/Screening Clinic"),
        # Maternal & Child Health
        ("ANC", "Antenatal Clinic"),
        ("PNC", "Postnatal Clinic"),
        ("FP", "Family Planning Clinic"),
        ("CWC", "Child Welfare Clinic"),
        ("IMMUNIZATION", "Immunization Clinic"),
        ("NUTRITION", "Nutrition Clinic"),
        # Specialized Clinics
        ("DENTAL", "Dental Clinic"),
        ("EYE", "Eye/Ophthalmology Clinic"),
        ("ENT", "ENT Clinic"),
        ("SURGICAL", "Surgical Outpatient Clinic"),
        ("ORTHO", "Orthopedic Clinic"),
        ("PHYSIO", "Physiotherapy Clinic"),
        ("OT", "Occupational Therapy Clinic"),
        ("SOCIAL_WORK", "Social Work Services"),
        ("COUNSELLING", "Counselling Services"),
        ("DERM", "Dermatology Clinic"),
        # Chronic Care
        ("CCC", "Comprehensive Care Clinic (HIV)"),
        ("TB", "TB Clinic"),
        ("DIABETIC", "Diabetic Clinic"),
        ("HYPERTENSION", "Hypertension Clinic"),
        ("MENTAL_HEALTH", "Mental Health Clinic"),
        ("ONCOLOGY", "Oncology Clinic"),
        ("DIALYSIS", "Dialysis Unit"),
        # Other
        ("PROCEDURE", "Procedure Room"),
        ("DRESSING", "Dressing/Wound Care"),
        ("INJECTION", "Injection Room"),
        ("OTHER", "Other Clinic"),
    ]

    # =========================================================================
    # Status Choices
    # =========================================================================
    STATUS_CHOICES = [
        ("ACTIVE", "Active"),
        ("INACTIVE", "Inactive"),
        ("TEMPORARILY_CLOSED", "Temporarily Closed"),
    ]

    # =========================================================================
    # Core Fields
    # =========================================================================
    name = models.CharField(
        max_length=100,
        help_text="Display name of the clinic (e.g., 'CCC Clinic')",
    )
    clinic_type = models.CharField(
        max_length=30,
        choices=CLINIC_TYPE_CHOICES,
        help_text="Type/category of clinic",
    )
    code = models.CharField(
        max_length=20,
        help_text="Clinic code, unique per facility (e.g., 'CCC-001', 'DENTAL-001')",
    )
    description = models.TextField(
        blank=True,
        default="",
        help_text="Description of services provided",
    )

    # =========================================================================
    # Location & Capacity
    # =========================================================================
    location = models.CharField(
        max_length=100,
        blank=True,
        default="",
        help_text="Physical location (e.g., 'Block A, Room 12')",
    )
    floor = models.CharField(
        max_length=20,
        blank=True,
        default="",
        help_text="Floor/level",
    )
    capacity = models.PositiveIntegerField(
        default=1,
        help_text="Number of patients that can be seen simultaneously",
    )
    department = models.ForeignKey(
        "core.Department",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="clinics",
        help_text="Department this clinic belongs to (e.g., Outpatient, MCH)",
    )

    # =========================================================================
    # Operational Settings
    # =========================================================================
    status = models.CharField(
        max_length=20,
        choices=STATUS_CHOICES,
        default="ACTIVE",
    )
    requires_appointment = models.BooleanField(
        default=False,
        help_text="Whether patients need prior appointment",
    )
    requires_referral = models.BooleanField(
        default=False,
        help_text="Whether patients need referral from another clinic",
    )
    accepts_walk_ins = models.BooleanField(
        default=True,
        help_text="Whether walk-in patients are accepted",
    )
    triage_required = models.BooleanField(
        default=True,
        help_text="Whether triage is required before this clinic",
    )

    # =========================================================================
    # Eligibility Rules (JSON)
    # =========================================================================
    eligibility_rules = models.JSONField(
        null=True,
        blank=True,
        help_text="""
        Eligibility criteria for this clinic. Example:
        {
            "min_age": 0,
            "max_age": 5,
            "gender": ["F"],
            "conditions": ["pregnancy"],
            "required_enrollments": ["ANC_PROGRAM"]
        }
        """,
    )

    # =========================================================================
    # Billing & SHA Integration
    # =========================================================================
    default_service_fee = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        null=True,
        blank=True,
        help_text="Default consultation fee",
    )
    sha_service_code = models.CharField(
        max_length=50,
        blank=True,
        default="",
        help_text="SHA tariff code for claims",
    )

    # =========================================================================
    # DHIS2 Integration
    # =========================================================================
    dhis2_org_unit_id = models.CharField(
        max_length=50,
        blank=True,
        default="",
        help_text="DHIS2 organizational unit ID for reporting",
    )
    moh_code = models.CharField(
        max_length=20,
        blank=True,
        default="",
        help_text="MOH service code (for MOH 711/747 reporting)",
    )

    # =========================================================================
    # Default Templates
    # =========================================================================
    default_clinical_template = models.ForeignKey(
        "clinical_templates.ClinicalTemplate",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="default_for_clinics",
        help_text="Default clinical template for encounters in this clinic",
    )

    # =========================================================================
    # Sensitive Access (CCC, Mental Health)
    # =========================================================================
    is_sensitive = models.BooleanField(
        default=False,
        help_text="Whether this clinic handles sensitive data (HIV, GBV, Mental Health)",
    )
    required_permission = models.CharField(
        max_length=100,
        blank=True,
        default="",
        help_text="Permission required to access this clinic's data",
    )

    # =========================================================================
    # Scheduling Integration
    # =========================================================================
    scheduling_resource = models.OneToOneField(
        "scheduling.Resource",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="clinic",
        help_text="Linked scheduling resource (auto-created for PLACE type)",
    )

    class Meta:
        """Meta options for Clinic model."""

        ordering = ["name"]
        verbose_name = "Clinic"
        verbose_name_plural = "Clinics"
        constraints = [
            models.UniqueConstraint(
                fields=["facility", "code"],
                name="unique_clinic_code_per_facility",
            ),
        ]
        permissions = [
            ("view_ccc_clinic", "Can view CCC (HIV) clinic data"),
            ("view_mental_health_clinic", "Can view Mental Health clinic data"),
            ("manage_clinic_staff", "Can manage clinic staff assignments"),
            ("manage_clinic_schedule", "Can manage clinic schedules"),
        ]

    def __str__(self):
        """Return string representation."""
        return f"{self.name} ({self.get_clinic_type_display()})"

    def is_scheduled_today(self):
        """Check if clinic is scheduled to operate today based on schedule."""
        today = timezone.localdate()
        return self.schedules.filter(
            day_of_week=today.weekday(),
            is_active=True,
        ).exists()

    def is_open_today(self):
        """Check if clinic has an OPEN session today.

        A clinic is considered 'open' only when a staff member has explicitly
        opened the session for the day, not merely because it is scheduled.
        """
        today = timezone.localdate()
        return self.sessions.filter(
            session_date=today,
            status="OPEN",
        ).exists()

    def get_current_session(self):
        """Get or create today's clinic session."""
        from hmis.apps.clinics.models import ClinicSession

        today = timezone.localdate()
        session, _ = ClinicSession.objects.get_or_create(
            clinic=self,
            session_date=today,
            defaults={
                "status": "OPEN",
                "facility": self.facility,
                "organization": self.organization,
            },
        )
        return session

    def get_or_create_session(self, session_date):
        """Get or create a clinic session for a specific date."""
        from hmis.apps.clinics.models import ClinicSession

        session, created = ClinicSession.objects.get_or_create(
            clinic=self,
            session_date=session_date,
            defaults={
                "status": "SCHEDULED",
                "facility": self.facility,
                "organization": self.organization,
            },
        )
        return session, created


# =============================================================================
# ClinicRoom Model - Room-Clinic association
# =============================================================================


class ClinicRoom(TimeStampedModel):
    """
    Associates rooms (PLACE resources) with clinics.

    A room can be linked to multiple clinics (e.g., a shared procedure room).
    A clinic can have multiple rooms (e.g., General OPD has Rooms 1-4).
    """

    clinic = models.ForeignKey(
        Clinic,
        on_delete=models.CASCADE,
        related_name="clinic_rooms",
    )
    room = models.ForeignKey(
        "scheduling.Resource",
        on_delete=models.CASCADE,
        related_name="clinic_rooms",
        limit_choices_to={"resource_type": "PLACE"},
        help_text="Room (PLACE resource) linked to this clinic",
    )
    is_default = models.BooleanField(
        default=False,
        help_text="Whether this is a default room for the clinic",
    )
    display_order = models.PositiveIntegerField(
        default=0,
        help_text="Display order for room listing",
    )

    class Meta:
        """Meta options for ClinicRoom model."""

        ordering = ["display_order", "room__name"]
        verbose_name = "Clinic Room"
        verbose_name_plural = "Clinic Rooms"
        constraints = [
            models.UniqueConstraint(
                fields=["clinic", "room"],
                name="unique_clinic_room",
            ),
        ]

    def __str__(self):
        """Return string representation."""
        return f"{self.clinic.name} - {self.room.name}"


# =============================================================================
# ClinicSchedule Model - Operating Hours
# =============================================================================


class ClinicSchedule(TimeStampedModel):
    """
    Operating schedule for a clinic.

    Defines which days and times a clinic operates.
    """

    DAY_CHOICES = [
        (0, "Monday"),
        (1, "Tuesday"),
        (2, "Wednesday"),
        (3, "Thursday"),
        (4, "Friday"),
        (5, "Saturday"),
        (6, "Sunday"),
    ]

    clinic = models.ForeignKey(
        Clinic,
        on_delete=models.CASCADE,
        related_name="schedules",
    )
    day_of_week = models.IntegerField(
        choices=DAY_CHOICES,
        help_text="Day of the week (0=Monday, 6=Sunday)",
    )
    start_time = models.TimeField(
        help_text="Opening time",
    )
    end_time = models.TimeField(
        help_text="Closing time",
    )
    max_patients = models.PositiveIntegerField(
        default=50,
        help_text="Maximum patients per session",
    )
    is_active = models.BooleanField(
        default=True,
    )
    notes = models.CharField(
        max_length=200,
        blank=True,
        default="",
        help_text="E.g., 'ANC on Mondays only'",
    )

    class Meta:
        """Meta options for ClinicSchedule model."""

        ordering = ["clinic", "day_of_week", "start_time"]
        unique_together = ["clinic", "day_of_week", "start_time"]
        verbose_name = "Clinic Schedule"
        verbose_name_plural = "Clinic Schedules"

    def __str__(self):
        """Return string representation."""
        return (
            f"{self.clinic.name} - {self.get_day_of_week_display()} "
            f"{self.start_time}-{self.end_time}"
        )


# =============================================================================
# ClinicStaff Model - Staff Assignments
# =============================================================================


class ClinicStaff(TimeStampedModel):
    """
    Staff assignment to clinics.

    Tracks which staff members work in which clinics.
    """

    ROLE_CHOICES = [
        ("LEAD", "Clinic Lead/In-Charge"),
        ("DOCTOR", "Doctor/Clinical Officer"),
        ("NURSE", "Nurse"),
        ("COUNSELOR", "Counselor"),
        ("NUTRITIONIST", "Nutritionist"),
        ("CLERK", "Clerk/Receptionist"),
        ("OTHER", "Other"),
    ]

    clinic = models.ForeignKey(
        Clinic,
        on_delete=models.CASCADE,
        related_name="staff_assignments",
    )
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="clinic_assignments",
    )
    role = models.CharField(
        max_length=20,
        choices=ROLE_CHOICES,
        default="DOCTOR",
    )
    is_primary = models.BooleanField(
        default=False,
        help_text="Primary clinic for this staff member",
    )
    start_date = models.DateField(
        help_text="Assignment start date",
    )
    end_date = models.DateField(
        null=True,
        blank=True,
        help_text="Assignment end date (null = ongoing)",
    )
    is_active = models.BooleanField(
        default=True,
    )

    class Meta:
        """Meta options for ClinicStaff model."""

        ordering = ["clinic", "role", "user__last_name"]
        unique_together = ["clinic", "user", "role"]
        verbose_name = "Clinic Staff Assignment"
        verbose_name_plural = "Clinic Staff Assignments"

    def __str__(self):
        """Return string representation."""
        return f"{self.user.get_full_name()} - {self.clinic.name} ({self.get_role_display()})"


# =============================================================================
# ClinicSession Model - Daily Operations
# =============================================================================
