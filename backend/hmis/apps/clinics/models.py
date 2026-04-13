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
from decimal import Decimal

from django.conf import settings
from django.core.validators import MaxValueValidator, MinValueValidator
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
    organization = models.ForeignKey(
        "core.Organization",
        on_delete=models.CASCADE,
        related_name="clinics",
        null=True,
        blank=True,
        help_text="Owning organization (auto-set from facility).",
    )
    facility = models.ForeignKey(
        "core.Facility",
        on_delete=models.CASCADE,
        related_name="clinics",
        null=True,
        blank=True,
        help_text="Facility where this clinic operates.",
    )
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
        return f"{self.user.get_full_name()} - {self.clinic.name} " f"({self.get_role_display()})"


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

    organization = models.ForeignKey(
        "core.Organization",
        on_delete=models.CASCADE,
        related_name="clinic_sessions",
        null=True,
        blank=True,
        help_text="Owning organization (auto-set from facility).",
    )
    facility = models.ForeignKey(
        "core.Facility",
        on_delete=models.CASCADE,
        related_name="clinic_sessions",
        null=True,
        blank=True,
        help_text="Facility where this session runs.",
    )
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

    def save(self, *args, **kwargs):
        """Auto-resolve tenant from parent clinic."""
        if not self.facility_id and self.clinic_id:
            try:
                clinic = self.clinic
                if clinic.facility_id:
                    self.facility_id = clinic.facility_id
                if clinic.organization_id:
                    self.organization_id = clinic.organization_id
            except Exception:
                pass
        if self.facility_id and not self.organization_id:
            try:
                if self.facility and self.facility.organization_id:
                    self.organization_id = self.facility.organization_id
            except Exception:
                pass
        super().save(*args, **kwargs)

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
        self.patients_waiting = visits.filter(status__in=["WAITING", "CALLED"]).count()
        self.save(update_fields=["patients_registered", "patients_seen", "patients_waiting"])


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
    organization = models.ForeignKey(
        "core.Organization",
        on_delete=models.CASCADE,
        related_name="clinic_visits",
        null=True,
        blank=True,
        help_text="Owning organization (auto-set from facility).",
    )
    facility = models.ForeignKey(
        "core.Facility",
        on_delete=models.CASCADE,
        related_name="clinic_visits",
        null=True,
        blank=True,
        help_text="Facility where this visit occurred.",
    )
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
    source_module = models.CharField(
        max_length=30,
        blank=True,
        default="",
        help_text="Source module or workflow that created this visit (for traceability)",
    )
    source_record_id = models.PositiveIntegerField(
        null=True,
        blank=True,
        help_text="Source record identifier used during live linking and backfill reconciliation",
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
        related_name="clinic_visit_o2o",
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
    # Room Assignment (set when patient is called)
    # =========================================================================
    room = models.ForeignKey(
        "scheduling.Resource",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="clinic_visits",
        limit_choices_to={"resource_type": "PLACE"},
        help_text="Room assigned to this visit (auto-set from clinician's active shift)",
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
            # Prevent duplicate active visits for same patient in same session
            models.UniqueConstraint(
                fields=["session", "patient"],
                condition=models.Q(
                    status__in=["REGISTERED", "WAITING", "CALLED", "IN_CONSULTATION"]
                ),
                name="unique_active_patient_per_session",
            ),
        ]

    def __str__(self):
        """Return string representation."""
        return f"{self.patient} - {self.session.clinic.name} #{self.queue_number}"

    def save(self, *args, **kwargs):
        """Override save to auto-assign queue number and tenant fields."""
        if not self.queue_number:
            last_visit = (
                ClinicVisit.objects.filter(session=self.session).order_by("-queue_number").first()
            )
            self.queue_number = (last_visit.queue_number + 1) if last_visit else 1

        # Auto-resolve tenant from session (Strategy B)
        if not self.facility_id and self.session_id:
            try:
                session = self.session
                if session.facility_id:
                    self.facility_id = session.facility_id
                if session.organization_id:
                    self.organization_id = session.organization_id
            except Exception:
                pass
        if self.facility_id and not self.organization_id:
            try:
                if self.facility and self.facility.organization_id:
                    self.organization_id = self.facility.organization_id
            except Exception:
                pass

        super().save(*args, **kwargs)

        # Backward compatibility:
        # If a ClinicVisit is linked to an Encounter via the legacy OneToOne field,
        # ensure the new Encounter.clinic_visit FK is kept in sync for reporting.
        if self.encounter_id:
            from hmis.apps.encounters.models import Encounter

            Encounter.objects.filter(pk=self.encounter_id).exclude(clinic_visit_id=self.pk).update(
                clinic_visit_id=self.pk
            )

    def call_patient(self, clinician):
        """Call patient for consultation.

        Auto-assigns the room from the clinician's active shift for this clinic.
        """
        self.status = "CALLED"
        self.called_at = timezone.now()
        self.assigned_clinician = clinician

        # Auto-assign room from clinician's active shift
        from hmis.apps.scheduling.models import Shift

        active_shift = (
            Shift.objects.filter(
                staff_resource__staff_profile__user=clinician,
                shift_date=timezone.localdate(),
                status__in=["ACTIVE", "ON_BREAK"],
                clinic=self.session.clinic,
                room__isnull=False,
            )
            .select_related("room")
            .first()
        )
        if active_shift:
            self.room = active_shift.room

        self.save()

    def ensure_consultation_encounter(self, existing_encounter=None):
        """Ensure this clinic visit is linked to a consultation-ready encounter."""
        from hmis.apps.encounters.models import Encounter

        from hmis.apps.clinics.services.template_routing import resolve_default_clinical_template

        resolved_template = resolve_default_clinical_template(self.session.clinic)
        encounter = self.encounter or existing_encounter

        if not encounter:
            encounter_data = {
                "patient": self.patient,
                "encounter_type": self._map_clinic_to_encounter_type(),
                "chief_complaint": self.chief_complaint or "See clinic notes",
                "triage_status": ("COMPLETED" if self.triage_assessment else "NOT_APPLICABLE"),
                "clinic_visit": self,
                "clinical_template": resolved_template,
            }

            if getattr(self, "facility_id", None):
                encounter_data["facility"] = self.facility
            if getattr(self, "organization_id", None):
                encounter_data["organization"] = self.organization

            if self.triage_assessment:
                ta = self.triage_assessment
                if ta.temperature is not None:
                    encounter_data["temperature"] = ta.temperature
                if ta.heart_rate is not None:
                    encounter_data["pulse"] = ta.heart_rate
                if ta.respiratory_rate is not None:
                    encounter_data["respiratory_rate"] = ta.respiratory_rate
                if ta.spo2 is not None:
                    encounter_data["spo2"] = ta.spo2
                if ta.weight is not None:
                    encounter_data["weight"] = ta.weight
                if ta.systolic_bp is not None and ta.diastolic_bp is not None:
                    encounter_data["blood_pressure"] = f"{ta.systolic_bp}/{ta.diastolic_bp}"
                encounter_data["vitals_source"] = "TRIAGE"
                encounter_data["vitals_recorded_at"] = ta.triage_end_time or ta.created_at
                if ta.triaged_by:
                    encounter_data["vitals_recorded_by"] = ta.triaged_by

            encounter = Encounter.objects.create(**encounter_data)

        encounter_updates = []
        if encounter.clinic_visit_id != self.id:
            encounter.clinic_visit = self
            encounter_updates.append("clinic_visit")

        if encounter.triage_status not in ("COMPLETED", "BYPASSED", "NOT_APPLICABLE"):
            encounter.triage_status = "COMPLETED" if self.triage_assessment else "NOT_APPLICABLE"
            encounter_updates.append("triage_status")

        if not encounter.chief_complaint and self.chief_complaint:
            encounter.chief_complaint = self.chief_complaint
            encounter_updates.append("chief_complaint")

        if encounter.clinical_template_id is None and resolved_template is not None:
            encounter.clinical_template = resolved_template
            encounter_updates.append("clinical_template")

        if encounter_updates:
            encounter.save(update_fields=encounter_updates)

        if self.encounter_id != encounter.id:
            self.encounter = encounter
            self.save(update_fields=["encounter"])

        return encounter

    def start_consultation(self, user=None):
        """
        Start consultation - creates encounter and generates billing.

        Args:
            user: Optional user initiating the consultation (for billing audit)

        Returns:
            Encounter: The created or existing encounter

        This method:
        1. Creates an Encounter if one doesn't exist
        2. Copies vitals from triage assessment if available
        3. Generates an Invoice for the consultation fee if not already charged
        4. Links the billing to the clinic visit
        """
        self.status = "IN_CONSULTATION"
        self.consultation_started_at = timezone.now()
        encounter = self.ensure_consultation_encounter()

        # Sync encounter consultation status (single source of truth)
        # This ensures the encounter is removed from the consultation queue
        if encounter.consultation_status not in ("IN_PROGRESS", "COMPLETED"):
            encounter.begin_consultation()

        # Generate billing if consultation fee not already charged
        if not self.consultation_fee_charged:
            self._generate_consultation_billing(user=user)

        self.save()
        return encounter

    def _generate_consultation_billing(self, user=None):
        """
        Generate billing for consultation fee.

        Creates or uses existing invoice and adds consultation fee line item.
        """
        from hmis.apps.billing.services.clinic_billing import create_consultation_invoice

        # The service will mark this visit as charged and link billing line item.
        create_consultation_invoice(self, created_by=user)

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
        end = self.consultation_started_at if self.consultation_started_at else timezone.now()
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

    # =========================================================================
    # CCC (HIV) Specific Fields
    # =========================================================================
    art_start_date = models.DateField(
        null=True,
        blank=True,
        help_text="Date ART was initiated",
    )
    current_art_regimen = models.CharField(
        max_length=100,
        blank=True,
        default="",
        help_text="Current ART regimen (e.g., TDF/3TC/DTG)",
    )
    art_regimen_line = models.CharField(
        max_length=20,
        blank=True,
        default="",
        choices=[
            ("FIRST_LINE", "First Line"),
            ("SECOND_LINE", "Second Line"),
            ("THIRD_LINE", "Third Line"),
        ],
        help_text="ART regimen line",
    )
    who_clinical_stage = models.PositiveSmallIntegerField(
        null=True,
        blank=True,
        choices=[(1, "Stage 1"), (2, "Stage 2"), (3, "Stage 3"), (4, "Stage 4")],
        help_text="WHO clinical stage at enrollment",
    )
    baseline_cd4_count = models.PositiveIntegerField(
        null=True,
        blank=True,
        help_text="CD4 count at enrollment (cells/µL)",
    )
    latest_cd4_count = models.PositiveIntegerField(
        null=True,
        blank=True,
        help_text="Most recent CD4 count (cells/µL)",
    )
    latest_cd4_date = models.DateField(
        null=True,
        blank=True,
        help_text="Date of most recent CD4 count",
    )
    latest_viral_load = models.PositiveIntegerField(
        null=True,
        blank=True,
        help_text="Most recent viral load (copies/mL)",
    )
    latest_viral_load_date = models.DateField(
        null=True,
        blank=True,
        help_text="Date of most recent viral load test",
    )
    viral_load_suppressed = models.BooleanField(
        null=True,
        blank=True,
        help_text="Is viral load suppressed (<1000 copies/mL)?",
    )

    # =========================================================================
    # ANC (Antenatal) Specific Fields
    # =========================================================================
    gravida = models.PositiveSmallIntegerField(
        null=True,
        blank=True,
        help_text="Number of pregnancies (including current)",
    )
    para = models.PositiveSmallIntegerField(
        null=True,
        blank=True,
        help_text="Number of births (live or stillborn >= 28 weeks)",
    )
    lmp = models.DateField(
        null=True,
        blank=True,
        help_text="Last Menstrual Period date",
    )
    edd = models.DateField(
        null=True,
        blank=True,
        help_text="Expected Date of Delivery (calculated from LMP)",
    )
    height_cm = models.DecimalField(
        max_digits=5,
        decimal_places=1,
        null=True,
        blank=True,
        help_text="Mother's height in cm (for BMI calculation)",
    )
    blood_group = models.CharField(
        max_length=5,
        blank=True,
        default="",
        choices=[
            ("A+", "A+"),
            ("A-", "A-"),
            ("B+", "B+"),
            ("B-", "B-"),
            ("AB+", "AB+"),
            ("AB-", "AB-"),
            ("O+", "O+"),
            ("O-", "O-"),
        ],
        help_text="Mother's blood group",
    )
    rhesus_factor = models.CharField(
        max_length=10,
        blank=True,
        default="",
        choices=[("POSITIVE", "Positive"), ("NEGATIVE", "Negative")],
        help_text="Rhesus factor",
    )
    hiv_status = models.CharField(
        max_length=20,
        blank=True,
        default="",
        choices=[
            ("POSITIVE", "Positive"),
            ("NEGATIVE", "Negative"),
            ("UNKNOWN", "Unknown"),
        ],
        help_text="HIV status for ANC",
    )
    partner_hiv_status = models.CharField(
        max_length=20,
        blank=True,
        default="",
        choices=[
            ("POSITIVE", "Positive"),
            ("NEGATIVE", "Negative"),
            ("UNKNOWN", "Unknown"),
            ("NOT_TESTED", "Not Tested"),
        ],
        help_text="Partner HIV status",
    )
    previous_cesarean = models.BooleanField(
        default=False,
        help_text="History of previous cesarean section",
    )
    high_risk_pregnancy = models.BooleanField(
        default=False,
        help_text="Is this a high-risk pregnancy?",
    )
    high_risk_factors = models.TextField(
        blank=True,
        default="",
        help_text="List of high-risk factors if applicable",
    )

    # =========================================================================
    # Diabetic Clinic Specific Fields
    # =========================================================================
    diabetes_type = models.CharField(
        max_length=20,
        blank=True,
        default="",
        choices=[
            ("TYPE_1", "Type 1"),
            ("TYPE_2", "Type 2"),
            ("GESTATIONAL", "Gestational"),
            ("OTHER", "Other"),
        ],
        help_text="Type of diabetes",
    )
    diabetes_diagnosis_date = models.DateField(
        null=True,
        blank=True,
        help_text="Date diabetes was diagnosed",
    )
    latest_hba1c = models.DecimalField(
        max_digits=4,
        decimal_places=1,
        null=True,
        blank=True,
        help_text="Most recent HbA1c (%)",
    )
    latest_hba1c_date = models.DateField(
        null=True,
        blank=True,
        help_text="Date of most recent HbA1c test",
    )
    latest_fbs = models.DecimalField(
        max_digits=5,
        decimal_places=1,
        null=True,
        blank=True,
        help_text="Latest Fasting Blood Sugar (mmol/L)",
    )
    latest_fbs_date = models.DateField(
        null=True,
        blank=True,
        help_text="Date of latest FBS test",
    )
    on_insulin = models.BooleanField(
        default=False,
        help_text="Is patient on insulin?",
    )
    diabetes_complications = models.TextField(
        blank=True,
        default="",
        help_text="Known diabetes complications (retinopathy, nephropathy, etc.)",
    )

    # =========================================================================
    # Alert/Notification Tracking
    # =========================================================================
    last_reminder_sent = models.DateTimeField(
        null=True,
        blank=True,
        help_text="When the last appointment reminder was sent",
    )
    missed_appointment_alerts = models.PositiveIntegerField(
        default=0,
        help_text="Number of missed appointment alerts sent",
    )

    class Meta:
        """Meta options for ClinicEnrollment model."""

        ordering = ["-enrollment_date"]
        verbose_name = "Clinic Enrollment"
        verbose_name_plural = "Clinic Enrollments"
        unique_together = ["clinic", "patient", "enrollment_date"]

    def __str__(self):
        """Return string representation."""
        return f"{self.patient} - {self.clinic.name} " f"({self.enrollment_number or 'No ID'})"

    def save(self, *args, **kwargs):
        """Override save to auto-generate enrollment number if not set."""
        if not self.enrollment_number:
            self.enrollment_number = self._generate_enrollment_number()
        super().save(*args, **kwargs)

    def _generate_enrollment_number(self) -> str:
        """
        Generate a unique enrollment number based on clinic type.

        Format: {PREFIX}-{YYYYMMDD}-{SEQUENCE}
        Examples: ANC-20260219-0001, CCC-20260219-0001, DM-20260219-0001

        The prefix is derived from the clinic code or type:
        - ANC clinics → "ANC"
        - CCC/HIV clinics → "CCC"
        - Diabetic clinics → "DM"
        - Other → First 3 chars of clinic code uppercase
        """
        from datetime import date

        # Determine prefix based on clinic type/code
        clinic_code = (self.clinic.code or "").upper()
        clinic_type = (self.clinic.clinic_type or "").upper()

        if "ANC" in clinic_code or "ANTENATAL" in clinic_type or clinic_type == "MCH":
            prefix = "ANC"
        elif "CCC" in clinic_code or "HIV" in clinic_type:
            prefix = "CCC"
        elif "DIAB" in clinic_code or "DIAB" in clinic_type:
            prefix = "DM"
        elif "TB" in clinic_code or "TB" in clinic_type:
            prefix = "TB"
        elif "HYP" in clinic_code or "HYPERTENSION" in clinic_type:
            prefix = "HTN"
        else:
            # Use first 3 characters of clinic code, or "ENR" as fallback
            prefix = clinic_code[:3] if len(clinic_code) >= 3 else "ENR"

        # Date component
        today = date.today()
        date_str = today.strftime("%Y%m%d")

        # Get sequence number for this prefix and date
        today_prefix = f"{prefix}-{date_str}-"
        last_enrollment = (
            ClinicEnrollment.objects.filter(enrollment_number__startswith=today_prefix)
            .order_by("-enrollment_number")
            .first()
        )

        if last_enrollment:
            try:
                last_seq = int(last_enrollment.enrollment_number.split("-")[-1])
                next_seq = last_seq + 1
            except (ValueError, IndexError):
                next_seq = 1
        else:
            next_seq = 1

        return f"{prefix}-{date_str}-{next_seq:04d}"

    def is_overdue(self):
        """Check if patient is overdue for appointment."""
        if not self.next_appointment:
            return False
        return self.next_appointment < timezone.localdate()

    def days_since_last_visit(self):
        """Calculate days since last visit."""
        if not self.last_visit_date:
            return None
        return (timezone.localdate() - self.last_visit_date).days

    def record_visit(self, visit_date=None):
        """Record a clinic visit."""
        visit_date = visit_date or timezone.localdate()
        self.last_visit_date = visit_date
        self.total_visits += 1
        self.next_appointment = visit_date + timedelta(days=self.appointment_interval_days)
        self.save()

    # =========================================================================
    # CCC (HIV) Helper Methods
    # =========================================================================

    def update_viral_load(self, viral_load: int, test_date=None):
        """
        Update viral load result.

        Args:
            viral_load: Viral load in copies/mL
            test_date: Date of test (defaults to today)
        """
        test_date = test_date or timezone.localdate()
        self.latest_viral_load = viral_load
        self.latest_viral_load_date = test_date
        # Suppressed = less than 1000 copies/mL per WHO guidelines
        self.viral_load_suppressed = viral_load < 1000
        self.save(
            update_fields=["latest_viral_load", "latest_viral_load_date", "viral_load_suppressed"]
        )

    def update_cd4_count(self, cd4_count: int, test_date=None):
        """
        Update CD4 count result.

        Args:
            cd4_count: CD4 count in cells/µL
            test_date: Date of test (defaults to today)
        """
        test_date = test_date or timezone.localdate()
        self.latest_cd4_count = cd4_count
        self.latest_cd4_date = test_date
        self.save(update_fields=["latest_cd4_count", "latest_cd4_date"])

    def is_virally_suppressed(self) -> bool:
        """Check if patient is virally suppressed (<1000 copies/mL)."""
        if self.viral_load_suppressed is not None:
            return self.viral_load_suppressed
        if self.latest_viral_load is not None:
            return self.latest_viral_load < 1000
        return False

    def viral_load_due(self) -> bool:
        """
        Check if viral load is due (> 6 months since last test).

        Returns True if:
        - Never tested
        - Last test > 6 months ago
        """
        if not self.latest_viral_load_date:
            return True
        months_since = (timezone.localdate() - self.latest_viral_load_date).days / 30
        return months_since >= 6

    def cd4_due(self) -> bool:
        """
        Check if CD4 count is due (> 6 months since last test).

        Returns True if:
        - Never tested
        - Last test > 6 months ago
        """
        if not self.latest_cd4_date:
            return True
        months_since = (timezone.localdate() - self.latest_cd4_date).days / 30
        return months_since >= 6

    def days_on_art(self) -> int | None:
        """Calculate days since ART initiation."""
        if not self.art_start_date:
            return None
        return (timezone.localdate() - self.art_start_date).days

    # =========================================================================
    # ANC (Antenatal) Helper Methods
    # =========================================================================

    def calculate_edd(self) -> None:
        """Calculate Expected Date of Delivery from LMP using Naegele's rule."""
        if self.lmp:
            # Naegele's rule: LMP + 1 year - 3 months + 7 days
            # Simplified: LMP + 280 days
            self.edd = self.lmp + timedelta(days=280)
            self.save(update_fields=["edd"])

    def gestation_weeks(self) -> int | None:
        """
        Calculate current gestation in weeks from LMP.

        Returns None if LMP is not set.
        """
        if not self.lmp:
            return None
        days = (timezone.localdate() - self.lmp).days
        return days // 7

    def gestation_days(self) -> int | None:
        """Calculate gestation in days from LMP."""
        if not self.lmp:
            return None
        return (timezone.localdate() - self.lmp).days

    def gestation_display(self) -> str:
        """
        Return gestation in 'X weeks Y days' format.

        Example: '28 weeks 3 days'
        """
        if not self.lmp:
            return "Unknown"
        days = (timezone.localdate() - self.lmp).days
        weeks = days // 7
        remaining_days = days % 7
        return f"{weeks} weeks {remaining_days} days"

    def trimester(self) -> int | None:
        """
        Determine current trimester.

        Returns:
            1: First trimester (0-12 weeks)
            2: Second trimester (13-27 weeks)
            3: Third trimester (28+ weeks)
            None: If LMP not set
        """
        weeks = self.gestation_weeks()
        if weeks is None:
            return None
        if weeks <= 12:
            return 1
        elif weeks <= 27:
            return 2
        return 3

    def is_term(self) -> bool:
        """Check if pregnancy is at term (>= 37 weeks)."""
        weeks = self.gestation_weeks()
        return weeks is not None and weeks >= 37

    def days_to_edd(self) -> int | None:
        """Calculate days remaining to EDD."""
        if not self.edd:
            return None
        return (self.edd - timezone.localdate()).days

    # =========================================================================
    # Diabetic Clinic Helper Methods
    # =========================================================================

    def update_hba1c(self, hba1c: float, test_date=None):
        """
        Update HbA1c result.

        Args:
            hba1c: HbA1c percentage
            test_date: Date of test (defaults to today)
        """
        from decimal import Decimal

        test_date = test_date or timezone.localdate()
        self.latest_hba1c = Decimal(str(hba1c))
        self.latest_hba1c_date = test_date
        self.save(update_fields=["latest_hba1c", "latest_hba1c_date"])

    def update_fbs(self, fbs: float, test_date=None):
        """
        Update Fasting Blood Sugar result.

        Args:
            fbs: FBS in mmol/L
            test_date: Date of test (defaults to today)
        """
        from decimal import Decimal

        test_date = test_date or timezone.localdate()
        self.latest_fbs = Decimal(str(fbs))
        self.latest_fbs_date = test_date
        self.save(update_fields=["latest_fbs", "latest_fbs_date"])

    def hba1c_controlled(self) -> bool | None:
        """
        Check if HbA1c is within target (<7% for most patients).

        Returns None if not tested.
        """
        if self.latest_hba1c is None:
            return None
        return self.latest_hba1c < 7

    def hba1c_due(self) -> bool:
        """
        Check if HbA1c is due (> 3 months since last test).

        Returns True if:
        - Never tested
        - Last test > 3 months ago
        """
        if not self.latest_hba1c_date:
            return True
        months_since = (timezone.localdate() - self.latest_hba1c_date).days / 30
        return months_since >= 3

    # =========================================================================
    # General Chronic Care Methods
    # =========================================================================

    def days_overdue(self) -> int | None:
        """Calculate days overdue for next appointment."""
        if not self.next_appointment:
            return None
        delta = timezone.localdate() - self.next_appointment
        return max(0, delta.days)

    def is_defaulter(self) -> bool:
        """
        Check if patient is a defaulter.

        A defaulter is someone who has missed 2+ appointment cycles.
        """
        if not self.next_appointment:
            return False
        days_overdue = self.days_overdue()
        if days_overdue is None:
            return False
        return days_overdue >= (self.appointment_interval_days * 2)

    def enrollment_type(self) -> str:
        """
        Determine enrollment type based on clinic type.

        Returns: 'CCC', 'ANC', 'DIABETIC', 'HYPERTENSION', 'TB', or 'GENERAL'
        """
        clinic_type = self.clinic.clinic_type
        type_mapping = {
            "CCC": "CCC",
            "ANC": "ANC",
            "PNC": "ANC",
            "DIABETIC": "DIABETIC",
            "HYPERTENSION": "HYPERTENSION",
            "TB": "TB",
        }
        return type_mapping.get(clinic_type, "GENERAL")

    def get_clinic_specific_summary(self) -> dict:
        """
        Get a summary of clinic-specific data based on enrollment type.

        Returns a dictionary with relevant data for the clinic type.
        """
        enrollment_type = self.enrollment_type()

        if enrollment_type == "CCC":
            return {
                "type": "CCC",
                "art_start_date": self.art_start_date,
                "current_regimen": self.current_art_regimen,
                "regimen_line": self.art_regimen_line,
                "who_stage": self.who_clinical_stage,
                "days_on_art": self.days_on_art(),
                "latest_cd4": self.latest_cd4_count,
                "cd4_date": self.latest_cd4_date,
                "cd4_due": self.cd4_due(),
                "latest_viral_load": self.latest_viral_load,
                "viral_load_date": self.latest_viral_load_date,
                "viral_load_suppressed": self.is_virally_suppressed(),
                "viral_load_due": self.viral_load_due(),
            }
        elif enrollment_type == "ANC":
            return {
                "type": "ANC",
                "gravida": self.gravida,
                "para": self.para,
                "lmp": self.lmp,
                "edd": self.edd,
                "gestation_weeks": self.gestation_weeks(),
                "gestation_display": self.gestation_display(),
                "trimester": self.trimester(),
                "days_to_edd": self.days_to_edd(),
                "blood_group": self.blood_group,
                "hiv_status": self.hiv_status,
                "high_risk": self.high_risk_pregnancy,
                "high_risk_factors": self.high_risk_factors,
            }
        elif enrollment_type == "DIABETIC":
            return {
                "type": "DIABETIC",
                "diabetes_type": self.diabetes_type,
                "diagnosis_date": self.diabetes_diagnosis_date,
                "on_insulin": self.on_insulin,
                "latest_hba1c": self.latest_hba1c,
                "hba1c_date": self.latest_hba1c_date,
                "hba1c_controlled": self.hba1c_controlled(),
                "hba1c_due": self.hba1c_due(),
                "latest_fbs": self.latest_fbs,
                "fbs_date": self.latest_fbs_date,
                "complications": self.diabetes_complications,
            }
        else:
            return {
                "type": enrollment_type,
                "enrollment_data": self.enrollment_data,
            }


class ClinicProgramAttendance(TimeStampedModel):
    """Idempotent attendance ledger for enrollment summaries derived from clinic visits."""

    enrollment = models.ForeignKey(
        ClinicEnrollment,
        on_delete=models.CASCADE,
        related_name="attendance_events",
    )
    clinic_visit = models.OneToOneField(
        ClinicVisit,
        on_delete=models.CASCADE,
        related_name="program_attendance",
    )
    attendance_date = models.DateField(
        help_text="Canonical attendance date derived from the linked clinic visit",
    )
    source_module = models.CharField(
        max_length=30,
        blank=True,
        default="",
        help_text="Clinical module that generated the attendance event",
    )
    source_record_id = models.PositiveIntegerField(
        null=True,
        blank=True,
        help_text="Clinical payload id associated with this attendance event",
    )

    class Meta:
        ordering = ["-attendance_date", "-created_at"]
        verbose_name = "Clinic Program Attendance"
        verbose_name_plural = "Clinic Program Attendance"
        indexes = [
            models.Index(fields=["enrollment", "attendance_date"]),
            models.Index(fields=["source_module", "source_record_id"]),
        ]

    def __str__(self):
        return (
            f"{self.enrollment.patient} - {self.enrollment.clinic.name} "
            f"({self.attendance_date})"
        )


# =============================================================================
# MonthlyClinicReport Model - Monthly Aggregates (Priority 3)
# =============================================================================


class MonthlyClinicReport(TimeStampedModel):
    """Monthly aggregate statistics for DHIS2/KHIS reporting."""

    clinic = models.ForeignKey(Clinic, on_delete=models.CASCADE, related_name="monthly_reports")
    year = models.PositiveIntegerField()
    month = models.PositiveIntegerField(validators=[MinValueValidator(1), MaxValueValidator(12)])

    # Visit Statistics
    total_visits = models.PositiveIntegerField(default=0)
    new_visits = models.PositiveIntegerField(default=0)
    revisits = models.PositiveIntegerField(default=0)

    # By Priority
    priority_red = models.PositiveIntegerField(default=0)
    priority_orange = models.PositiveIntegerField(default=0)
    priority_yellow = models.PositiveIntegerField(default=0)
    priority_green = models.PositiveIntegerField(default=0)
    priority_blue = models.PositiveIntegerField(default=0)

    # Demographics
    male_visits = models.PositiveIntegerField(default=0)
    female_visits = models.PositiveIntegerField(default=0)
    under_5_visits = models.PositiveIntegerField(default=0)
    under_18_visits = models.PositiveIntegerField(default=0)
    adult_visits = models.PositiveIntegerField(default=0)
    over_60_visits = models.PositiveIntegerField(default=0)

    # Chronic Care (for CCC, Diabetic, etc.)
    new_enrollments = models.PositiveIntegerField(default=0)
    active_enrollments = models.PositiveIntegerField(default=0)
    defaulters = models.PositiveIntegerField(default=0)

    # ANC Specific (for MCH clinics)
    anc_first_visits = models.PositiveIntegerField(default=0)
    anc_revisits = models.PositiveIntegerField(default=0)
    deliveries = models.PositiveIntegerField(default=0)

    # Revenue
    total_revenue = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal("0.00"))
    sha_claims_amount = models.DecimalField(
        max_digits=12, decimal_places=2, default=Decimal("0.00")
    )
    cash_amount = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal("0.00"))

    # DHIS2 Sync
    dhis2_submitted = models.BooleanField(default=False)
    dhis2_submitted_at = models.DateTimeField(null=True, blank=True)
    dhis2_response = models.JSONField(null=True, blank=True)

    class Meta:
        unique_together = ["clinic", "year", "month"]
        ordering = ["-year", "-month", "clinic__name"]

    def __str__(self) -> str:
        return f"{self.clinic.name} - {self.year}-{self.month:02d}"
