"""
Clinic models for Vitora HMIS.

This module contains:
- Clinic: Organizational unit / service delivery point
- ClinicSchedule: Operating schedule for clinics
- ClinicStaff: Staff assignments to clinics
- ClinicSession: Daily clinic operations
- ClinicVisit: Patient queue entry
- ClinicEnrollment: Chronic care program enrollment

Implements Phase 2.1 of the Clinics Module Implementation Plan.
"""

from datetime import timedelta

from django.conf import settings
from django.db import models
from django.utils import timezone

from hmis.apps.core.models import TimeStampedModel


# =============================================================================
# Clinic Model - Organizational Unit / Service Delivery Point
# =============================================================================


class Clinic(TimeStampedModel):
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
        unique=True,
        help_text="Unique clinic code (e.g., 'CCC-001', 'DENTAL-001')",
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

    class Meta:
        """Meta options for Clinic model."""

        ordering = ["name"]
        verbose_name = "Clinic"
        verbose_name_plural = "Clinics"
        permissions = [
            ("view_ccc_clinic", "Can view CCC (HIV) clinic data"),
            ("view_mental_health_clinic", "Can view Mental Health clinic data"),
            ("manage_clinic_staff", "Can manage clinic staff assignments"),
            ("manage_clinic_schedule", "Can manage clinic schedules"),
        ]

    def __str__(self):
        """Return string representation."""
        return f"{self.name} ({self.get_clinic_type_display()})"

    def is_open_today(self):
        """Check if clinic is operating today based on schedule."""
        today = timezone.now().date()
        return self.schedules.filter(
            day_of_week=today.weekday(),
            is_active=True,
        ).exists()

    def get_current_session(self):
        """Get or create today's clinic session."""
        today = timezone.now().date()
        session, _ = ClinicSession.objects.get_or_create(
            clinic=self,
            session_date=today,
            defaults={"status": "OPEN"},
        )
        return session


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
        return (
            f"{self.user.get_full_name()} - {self.clinic.name} "
            f"({self.get_role_display()})"
        )


# =============================================================================
# ClinicSession Model - Daily Operations
# =============================================================================


class ClinicSession(TimeStampedModel):
    """
    Represents a single day's operation of a clinic.

    Each clinic has one session per day. Sessions track:
    - Patients seen
    - Staff on duty
    - Session statistics
    """

    STATUS_CHOICES = [
        ("SCHEDULED", "Scheduled"),
        ("OPEN", "Open"),
        ("CLOSED", "Closed"),
        ("CANCELLED", "Cancelled"),
    ]

    clinic = models.ForeignKey(
        Clinic,
        on_delete=models.CASCADE,
        related_name="sessions",
    )
    session_date = models.DateField(
        help_text="Date of this clinic session",
    )
    status = models.CharField(
        max_length=20,
        choices=STATUS_CHOICES,
        default="SCHEDULED",
    )
    opened_at = models.DateTimeField(
        null=True,
        blank=True,
        help_text="When the session was opened",
    )
    closed_at = models.DateTimeField(
        null=True,
        blank=True,
        help_text="When the session was closed",
    )
    opened_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="opened_clinic_sessions",
    )
    closed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="closed_clinic_sessions",
    )
    notes = models.TextField(
        blank=True,
        default="",
        help_text="Session notes (e.g., issues, supply shortages)",
    )

    # Session statistics (computed)
    patients_registered = models.PositiveIntegerField(default=0)
    patients_seen = models.PositiveIntegerField(default=0)
    patients_waiting = models.PositiveIntegerField(default=0)

    class Meta:
        """Meta options for ClinicSession model."""

        ordering = ["-session_date", "clinic"]
        unique_together = ["clinic", "session_date"]
        verbose_name = "Clinic Session"
        verbose_name_plural = "Clinic Sessions"

    def __str__(self):
        """Return string representation."""
        return f"{self.clinic.name} - {self.session_date}"

    def open_session(self, user):
        """Open the clinic session."""
        self.status = "OPEN"
        self.opened_at = timezone.now()
        self.opened_by = user
        self.save()

    def close_session(self, user):
        """Close the clinic session."""
        self.status = "CLOSED"
        self.closed_at = timezone.now()
        self.closed_by = user
        self.save()

    def update_statistics(self):
        """Update session statistics from visits."""
        visits = self.visits.all()
        self.patients_registered = visits.count()
        self.patients_seen = visits.filter(status="COMPLETED").count()
        self.patients_waiting = visits.filter(
            status__in=["WAITING", "CALLED"]
        ).count()
        self.save(
            update_fields=["patients_registered", "patients_seen", "patients_waiting"]
        )


# =============================================================================
# ClinicVisit Model - Queue Entry
# =============================================================================


class ClinicVisit(TimeStampedModel):
    """
    Represents a patient's visit to a specific clinic.

    This is the queue entry - tracks the patient's journey through
    the clinic from arrival to consultation completion.
    """

    # =========================================================================
    # Status Choices (Queue States)
    # =========================================================================
    STATUS_CHOICES = [
        ("REGISTERED", "Registered - In queue"),
        ("WAITING", "Waiting to be called"),
        ("CALLED", "Called - Patient summoned"),
        ("IN_CONSULTATION", "In Consultation"),
        ("COMPLETED", "Completed"),
        ("REFERRED", "Referred to another clinic"),
        ("NO_SHOW", "No Show"),
        ("CANCELLED", "Cancelled"),
    ]

    # =========================================================================
    # Priority Choices
    # =========================================================================
    PRIORITY_CHOICES = [
        ("EMERGENCY", "Emergency (RED)"),
        ("URGENT", "Urgent (ORANGE)"),
        ("PRIORITY", "Priority (YELLOW)"),
        ("STANDARD", "Standard (GREEN)"),
        ("NON_URGENT", "Non-urgent (BLUE)"),
    ]

    # =========================================================================
    # Visit Type Choices
    # =========================================================================
    VISIT_TYPE_CHOICES = [
        ("NEW", "New Patient"),
        ("RETURN", "Return Visit"),
        ("FOLLOW_UP", "Follow-up"),
        ("REFERRAL", "Referral from another clinic"),
        ("SCHEDULED", "Scheduled Appointment"),
        ("EMERGENCY", "Emergency"),
    ]

    # =========================================================================
    # Source Choices
    # =========================================================================
    SOURCE_CHOICES = [
        ("TRIAGE", "From Triage"),
        ("DIRECT", "Direct to Clinic"),
        ("REFERRAL", "Referral from Clinic"),
        ("APPOINTMENT", "Scheduled Appointment"),
        ("INPATIENT", "From Inpatient Ward"),
    ]

    # =========================================================================
    # Core Fields
    # =========================================================================
    session = models.ForeignKey(
        ClinicSession,
        on_delete=models.CASCADE,
        related_name="visits",
    )
    patient = models.ForeignKey(
        "patients.Patient",
        on_delete=models.CASCADE,
        related_name="clinic_visits",
    )

    # =========================================================================
    # Queue Management
    # =========================================================================
    queue_number = models.PositiveIntegerField(
        help_text="Queue number for this session",
    )
    status = models.CharField(
        max_length=20,
        choices=STATUS_CHOICES,
        default="REGISTERED",
    )
    priority = models.CharField(
        max_length=20,
        choices=PRIORITY_CHOICES,
        default="STANDARD",
    )
    visit_type = models.CharField(
        max_length=20,
        choices=VISIT_TYPE_CHOICES,
        default="NEW",
    )
    source = models.CharField(
        max_length=20,
        choices=SOURCE_CHOICES,
        default="TRIAGE",
    )

    # =========================================================================
    # Timestamps
    # =========================================================================
    registered_at = models.DateTimeField(
        auto_now_add=True,
        help_text="When patient was added to clinic queue",
    )
    called_at = models.DateTimeField(
        null=True,
        blank=True,
        help_text="When patient was called",
    )
    consultation_started_at = models.DateTimeField(
        null=True,
        blank=True,
        help_text="When consultation started",
    )
    completed_at = models.DateTimeField(
        null=True,
        blank=True,
        help_text="When visit was completed",
    )

    # =========================================================================
    # Clinical Links
    # =========================================================================
    encounter = models.OneToOneField(
        "encounters.Encounter",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="clinic_visit",
        help_text="Encounter created for this visit",
    )
    triage_assessment = models.ForeignKey(
        "triage.TriageAssessment",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="clinic_visits",
        help_text="Triage assessment that routed patient here",
    )

    # =========================================================================
    # Referral Tracking
    # =========================================================================
    referred_from = models.ForeignKey(
        "self",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="referrals_out",
        help_text="If referred, the source clinic visit",
    )
    referred_to_clinic = models.ForeignKey(
        Clinic,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="incoming_referrals",
        help_text="Clinic patient was referred to",
    )
    referral_reason = models.TextField(
        blank=True,
        default="",
        help_text="Reason for referral",
    )

    # =========================================================================
    # Staff Assignment
    # =========================================================================
    assigned_clinician = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="assigned_clinic_visits",
        help_text="Clinician assigned to see this patient",
    )
    registered_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="registered_clinic_visits",
        help_text="Staff who registered the visit",
    )

    # =========================================================================
    # Chief Complaint (from triage or direct entry)
    # =========================================================================
    chief_complaint = models.TextField(
        blank=True,
        default="",
        help_text="Chief complaint / reason for visit",
    )
    notes = models.TextField(
        blank=True,
        default="",
        help_text="Additional notes",
    )

    # =========================================================================
    # Billing
    # =========================================================================
    consultation_fee_charged = models.BooleanField(
        default=False,
        help_text="Whether consultation fee has been charged",
    )
    billing_line_item = models.ForeignKey(
        "billing.InvoiceItem",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="clinic_visits",
        help_text="Associated billing line item",
    )

    class Meta:
        """Meta options for ClinicVisit model."""

        ordering = ["session", "priority", "queue_number"]
        verbose_name = "Clinic Visit"
        verbose_name_plural = "Clinic Visits"
        indexes = [
            models.Index(fields=["session", "status"]),
            models.Index(fields=["patient", "session"]),
            models.Index(fields=["status", "priority"]),
        ]
        constraints = [
            models.UniqueConstraint(
                fields=["session", "queue_number"],
                name="unique_queue_number_per_session",
            ),
        ]

    def __str__(self):
        """Return string representation."""
        return f"{self.patient} - {self.session.clinic.name} #{self.queue_number}"

    def save(self, *args, **kwargs):
        """Override save to auto-assign queue number if not set."""
        if not self.queue_number:
            last_visit = (
                ClinicVisit.objects.filter(session=self.session)
                .order_by("-queue_number")
                .first()
            )
            self.queue_number = (last_visit.queue_number + 1) if last_visit else 1
        super().save(*args, **kwargs)

    def call_patient(self, clinician):
        """Call patient for consultation."""
        self.status = "CALLED"
        self.called_at = timezone.now()
        self.assigned_clinician = clinician
        self.save()

    def start_consultation(self):
        """Start consultation - creates encounter if needed."""
        from hmis.apps.encounters.models import Encounter

        self.status = "IN_CONSULTATION"
        self.consultation_started_at = timezone.now()

        # Create encounter if not exists
        if not self.encounter:
            self.encounter = Encounter.objects.create(
                patient=self.patient,
                encounter_type=self._map_clinic_to_encounter_type(),
                chief_complaint=self.chief_complaint or "See clinic notes",
                triage_status=(
                    "COMPLETED" if self.triage_assessment else "NOT_APPLICABLE"
                ),
            )

        self.save()
        return self.encounter

    def complete_visit(self):
        """Mark visit as completed."""
        self.status = "COMPLETED"
        self.completed_at = timezone.now()
        self.save()
        self.session.update_statistics()

    def refer_to_clinic(self, target_clinic, reason, user):
        """Refer patient to another clinic."""
        self.status = "REFERRED"
        self.referred_to_clinic = target_clinic
        self.referral_reason = reason
        self.save()

        # Create visit in target clinic
        target_session = target_clinic.get_current_session()
        new_visit = ClinicVisit.objects.create(
            session=target_session,
            patient=self.patient,
            visit_type="REFERRAL",
            source="REFERRAL",
            referred_from=self,
            chief_complaint=f"Referred from {self.session.clinic.name}: {reason}",
            priority=self.priority,
            registered_by=user,
        )
        return new_visit

    def _map_clinic_to_encounter_type(self):
        """Map clinic type to encounter type."""
        mapping = {
            "GENERAL_OPD": "OPD",
            "ANC": "ANC",
            "CWC": "PAEDIATRIC",
            "CCC": "CHRONIC_STABLE",
            "DIABETIC": "CHRONIC_STABLE",
            "HYPERTENSION": "CHRONIC_STABLE",
            "DENTAL": "SPECIALIST_CLINIC",
            "EYE": "SPECIALIST_CLINIC",
            "SURGICAL": "PROCEDURE",
            "PROCEDURE": "PROCEDURE",
        }
        return mapping.get(self.session.clinic.clinic_type, "OPD")

    @property
    def wait_time_minutes(self):
        """Calculate current wait time in minutes."""
        if self.consultation_started_at:
            end = self.consultation_started_at
        else:
            end = timezone.now()
        delta = end - self.registered_at
        return int(delta.total_seconds() / 60)


# =============================================================================
# ClinicEnrollment Model - Chronic Care Programs
# =============================================================================


class ClinicEnrollment(TimeStampedModel):
    """
    Patient enrollment in a clinic program.

    Used for clinics that require ongoing enrollment (CCC, ANC, Diabetic, etc.)
    rather than one-off visits.
    """

    STATUS_CHOICES = [
        ("ACTIVE", "Active"),
        ("COMPLETED", "Completed/Graduated"),
        ("TRANSFERRED_OUT", "Transferred Out"),
        ("LOST_TO_FOLLOW_UP", "Lost to Follow-up"),
        ("DECEASED", "Deceased"),
        ("SUSPENDED", "Suspended"),
    ]

    clinic = models.ForeignKey(
        Clinic,
        on_delete=models.CASCADE,
        related_name="enrollments",
    )
    patient = models.ForeignKey(
        "patients.Patient",
        on_delete=models.CASCADE,
        related_name="clinic_enrollments",
    )

    # Enrollment details
    enrollment_number = models.CharField(
        max_length=50,
        blank=True,
        default="",
        help_text="Clinic-specific ID (e.g., CCC number, ANC number)",
    )
    enrollment_date = models.DateField(
        help_text="Date of enrollment",
    )
    status = models.CharField(
        max_length=30,
        choices=STATUS_CHOICES,
        default="ACTIVE",
    )

    # Clinical data specific to enrollment type
    enrollment_data = models.JSONField(
        null=True,
        blank=True,
        help_text="""
        Clinic-specific enrollment data. Examples:

        CCC: {
            "art_start_date": "2024-01-15",
            "current_regimen": "TDF/3TC/DTG",
            "who_stage": 2,
            "cd4_baseline": 350
        }

        ANC: {
            "lmp": "2025-09-01",
            "edd": "2026-06-08",
            "gravida": 2,
            "parity": 1
        }

        Diabetic: {
            "diagnosis_date": "2020-05-15",
            "diabetes_type": "Type 2",
            "current_medications": ["Metformin 500mg BD"]
        }
        """,
    )

    # Scheduling
    next_appointment = models.DateField(
        null=True,
        blank=True,
        help_text="Next scheduled visit",
    )
    appointment_interval_days = models.PositiveIntegerField(
        default=30,
        help_text="Default days between appointments",
    )

    # Tracking
    enrolled_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="clinic_enrollments_created",
    )
    last_visit_date = models.DateField(
        null=True,
        blank=True,
        help_text="Date of last clinic visit",
    )
    total_visits = models.PositiveIntegerField(
        default=0,
        help_text="Total visits since enrollment",
    )

    # Outcome tracking
    outcome_date = models.DateField(
        null=True,
        blank=True,
        help_text="Date of outcome (completion, transfer, etc.)",
    )
    outcome_reason = models.TextField(
        blank=True,
        default="",
        help_text="Reason for outcome",
    )
    transfer_facility = models.CharField(
        max_length=200,
        blank=True,
        default="",
        help_text="Facility transferred to (if applicable)",
    )

    class Meta:
        """Meta options for ClinicEnrollment model."""

        ordering = ["-enrollment_date"]
        verbose_name = "Clinic Enrollment"
        verbose_name_plural = "Clinic Enrollments"
        unique_together = ["clinic", "patient", "enrollment_date"]

    def __str__(self):
        """Return string representation."""
        return (
            f"{self.patient} - {self.clinic.name} "
            f"({self.enrollment_number or 'No ID'})"
        )

    def is_overdue(self):
        """Check if patient is overdue for appointment."""
        if not self.next_appointment:
            return False
        return self.next_appointment < timezone.now().date()

    def days_since_last_visit(self):
        """Calculate days since last visit."""
        if not self.last_visit_date:
            return None
        return (timezone.now().date() - self.last_visit_date).days

    def record_visit(self, visit_date=None):
        """Record a clinic visit."""
        visit_date = visit_date or timezone.now().date()
        self.last_visit_date = visit_date
        self.total_visits += 1
        self.next_appointment = visit_date + timedelta(
            days=self.appointment_interval_days
        )
        self.save()
