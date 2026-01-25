# Clinics Module Implementation Plan

**Version**: 1.0
**Created**: January 24, 2026
**Status**: Proposed
**Target Phase**: Phase 2 (Sprint 2.1-2.4)

---

## Executive Summary

This document outlines the implementation plan for a standalone **Clinics Module** in Vitora HMIS. The module treats clinics as first-class organizational units (service delivery points) rather than encounter types, enabling proper queue management, staff assignment, and DHIS2 reporting.

### Why a Separate Module?

| Concern | Encounter-Based Approach | Clinic Module Approach |
|---------|--------------------------|------------------------|
| **Queue Management** | Single consultation queue becomes congested | Each clinic has its own queue |
| **Staff Routing** | Doctors see all encounter types | Staff assigned to specific clinics |
| **Templates** | Generic templates for all | Clinic-specific protocols (e.g., CCC has ART adherence forms) |
| **DHIS2 Reporting** | Map encounter_type → dataset | Map clinic → organizational unit (proper hierarchy) |
| **Physical Space** | No concept of rooms/locations | Clinics have rooms, equipment, capacity |
| **Scheduling** | No operating hours | Clinic sessions with schedules |

---

## 1. Architecture Overview

### 1.1 Module Relationship Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           PATIENT FLOW                                       │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Registration → Triage → Clinic Assignment → Clinic Queue → Consultation   │
│                                                                             │
│  ┌──────────┐    ┌──────────┐    ┌──────────────┐    ┌──────────────────┐  │
│  │ Patient  │───▶│ Triage   │───▶│ ClinicVisit  │───▶│    Encounter     │  │
│  │ (exists) │    │ (exists) │    │   (NEW)      │    │    (exists)      │  │
│  └──────────┘    └──────────┘    └──────┬───────┘    └──────────────────┘  │
│                                         │                                   │
│                                         ▼                                   │
│                                  ┌──────────────┐                           │
│                                  │ClinicSession │                           │
│                                  │   (NEW)      │                           │
│                                  └──────┬───────┘                           │
│                                         │                                   │
│                                         ▼                                   │
│                                  ┌──────────────┐                           │
│                                  │    Clinic    │                           │
│                                  │   (NEW)      │                           │
│                                  └──────────────┘                           │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 1.2 Data Model Hierarchy

```
Clinic (Organizational Unit)
├── ClinicSession (Daily Operation)
│   └── ClinicVisit (Patient in Queue)
│       └── Encounter (Clinical Documentation)
│           ├── Diagnosis
│           ├── TreatmentPlan
│           ├── Prescription
│           └── LabOrder
├── ClinicTemplate (Protocols)
├── ClinicStaff (Assignment)
└── ClinicSchedule (Operating Hours)
```

---

## 2. Data Models

### 2.1 Clinic Model

```python
# backend/hmis/apps/clinics/models.py

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
        help_text="Display name of the clinic (e.g., 'CCC Clinic')"
    )
    clinic_type = models.CharField(
        max_length=30,
        choices=CLINIC_TYPE_CHOICES,
        help_text="Type/category of clinic"
    )
    code = models.CharField(
        max_length=20,
        unique=True,
        help_text="Unique clinic code (e.g., 'CCC-001', 'DENTAL-001')"
    )
    description = models.TextField(
        blank=True,
        default="",
        help_text="Description of services provided"
    )

    # =========================================================================
    # Location & Capacity
    # =========================================================================
    location = models.CharField(
        max_length=100,
        blank=True,
        default="",
        help_text="Physical location (e.g., 'Block A, Room 12')"
    )
    floor = models.CharField(
        max_length=20,
        blank=True,
        default="",
        help_text="Floor/level"
    )
    capacity = models.PositiveIntegerField(
        default=1,
        help_text="Number of patients that can be seen simultaneously"
    )

    # =========================================================================
    # Operational Settings
    # =========================================================================
    status = models.CharField(
        max_length=20,
        choices=STATUS_CHOICES,
        default="ACTIVE"
    )
    requires_appointment = models.BooleanField(
        default=False,
        help_text="Whether patients need prior appointment"
    )
    requires_referral = models.BooleanField(
        default=False,
        help_text="Whether patients need referral from another clinic"
    )
    accepts_walk_ins = models.BooleanField(
        default=True,
        help_text="Whether walk-in patients are accepted"
    )
    triage_required = models.BooleanField(
        default=True,
        help_text="Whether triage is required before this clinic"
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
        """
    )

    # =========================================================================
    # Billing & SHA Integration
    # =========================================================================
    default_service_fee = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        null=True,
        blank=True,
        help_text="Default consultation fee"
    )
    sha_service_code = models.CharField(
        max_length=50,
        blank=True,
        default="",
        help_text="SHA tariff code for claims"
    )

    # =========================================================================
    # DHIS2 Integration
    # =========================================================================
    dhis2_org_unit_id = models.CharField(
        max_length=50,
        blank=True,
        default="",
        help_text="DHIS2 organizational unit ID for reporting"
    )
    moh_code = models.CharField(
        max_length=20,
        blank=True,
        default="",
        help_text="MOH service code (for MOH 711/747 reporting)"
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
        help_text="Default clinical template for encounters in this clinic"
    )

    # =========================================================================
    # Sensitive Access (CCC, Mental Health)
    # =========================================================================
    is_sensitive = models.BooleanField(
        default=False,
        help_text="Whether this clinic handles sensitive data (HIV, GBV, Mental Health)"
    )
    required_permission = models.CharField(
        max_length=100,
        blank=True,
        default="",
        help_text="Permission required to access this clinic's data"
    )

    class Meta:
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
        return f"{self.name} ({self.get_clinic_type_display()})"

    def is_open_today(self):
        """Check if clinic is operating today based on schedule."""
        from django.utils import timezone
        today = timezone.now().date()
        return self.schedules.filter(
            day_of_week=today.weekday(),
            is_active=True
        ).exists()

    def get_current_session(self):
        """Get or create today's clinic session."""
        from django.utils import timezone
        today = timezone.now().date()
        session, _ = ClinicSession.objects.get_or_create(
            clinic=self,
            session_date=today,
            defaults={"status": "OPEN"}
        )
        return session


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
        related_name="schedules"
    )
    day_of_week = models.IntegerField(
        choices=DAY_CHOICES,
        help_text="Day of the week (0=Monday, 6=Sunday)"
    )
    start_time = models.TimeField(
        help_text="Opening time"
    )
    end_time = models.TimeField(
        help_text="Closing time"
    )
    max_patients = models.PositiveIntegerField(
        default=50,
        help_text="Maximum patients per session"
    )
    is_active = models.BooleanField(
        default=True
    )
    notes = models.CharField(
        max_length=200,
        blank=True,
        default="",
        help_text="E.g., 'ANC on Mondays only'"
    )

    class Meta:
        ordering = ["clinic", "day_of_week", "start_time"]
        unique_together = ["clinic", "day_of_week", "start_time"]
        verbose_name = "Clinic Schedule"
        verbose_name_plural = "Clinic Schedules"

    def __str__(self):
        return f"{self.clinic.name} - {self.get_day_of_week_display()} {self.start_time}-{self.end_time}"


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
        related_name="staff_assignments"
    )
    user = models.ForeignKey(
        "auth.User",
        on_delete=models.CASCADE,
        related_name="clinic_assignments"
    )
    role = models.CharField(
        max_length=20,
        choices=ROLE_CHOICES,
        default="DOCTOR"
    )
    is_primary = models.BooleanField(
        default=False,
        help_text="Primary clinic for this staff member"
    )
    start_date = models.DateField(
        help_text="Assignment start date"
    )
    end_date = models.DateField(
        null=True,
        blank=True,
        help_text="Assignment end date (null = ongoing)"
    )
    is_active = models.BooleanField(
        default=True
    )

    class Meta:
        ordering = ["clinic", "role", "user__last_name"]
        unique_together = ["clinic", "user", "role"]
        verbose_name = "Clinic Staff Assignment"
        verbose_name_plural = "Clinic Staff Assignments"

    def __str__(self):
        return f"{self.user.get_full_name()} - {self.clinic.name} ({self.get_role_display()})"
```

### 2.2 Clinic Session Model

```python
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
        related_name="sessions"
    )
    session_date = models.DateField(
        help_text="Date of this clinic session"
    )
    status = models.CharField(
        max_length=20,
        choices=STATUS_CHOICES,
        default="SCHEDULED"
    )
    opened_at = models.DateTimeField(
        null=True,
        blank=True,
        help_text="When the session was opened"
    )
    closed_at = models.DateTimeField(
        null=True,
        blank=True,
        help_text="When the session was closed"
    )
    opened_by = models.ForeignKey(
        "auth.User",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="opened_clinic_sessions"
    )
    closed_by = models.ForeignKey(
        "auth.User",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="closed_clinic_sessions"
    )
    notes = models.TextField(
        blank=True,
        default="",
        help_text="Session notes (e.g., issues, supply shortages)"
    )

    # Session statistics (computed)
    patients_registered = models.PositiveIntegerField(default=0)
    patients_seen = models.PositiveIntegerField(default=0)
    patients_waiting = models.PositiveIntegerField(default=0)

    class Meta:
        ordering = ["-session_date", "clinic"]
        unique_together = ["clinic", "session_date"]
        verbose_name = "Clinic Session"
        verbose_name_plural = "Clinic Sessions"

    def __str__(self):
        return f"{self.clinic.name} - {self.session_date}"

    def open_session(self, user):
        """Open the clinic session."""
        from django.utils import timezone
        self.status = "OPEN"
        self.opened_at = timezone.now()
        self.opened_by = user
        self.save()

    def close_session(self, user):
        """Close the clinic session."""
        from django.utils import timezone
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
```

### 2.3 Clinic Visit Model (Queue Entry)

```python
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
        related_name="visits"
    )
    patient = models.ForeignKey(
        "patients.Patient",
        on_delete=models.CASCADE,
        related_name="clinic_visits"
    )

    # =========================================================================
    # Queue Management
    # =========================================================================
    queue_number = models.PositiveIntegerField(
        help_text="Queue number for this session"
    )
    status = models.CharField(
        max_length=20,
        choices=STATUS_CHOICES,
        default="REGISTERED"
    )
    priority = models.CharField(
        max_length=20,
        choices=PRIORITY_CHOICES,
        default="STANDARD"
    )
    visit_type = models.CharField(
        max_length=20,
        choices=VISIT_TYPE_CHOICES,
        default="NEW"
    )
    source = models.CharField(
        max_length=20,
        choices=SOURCE_CHOICES,
        default="TRIAGE"
    )

    # =========================================================================
    # Timestamps
    # =========================================================================
    registered_at = models.DateTimeField(
        auto_now_add=True,
        help_text="When patient was added to clinic queue"
    )
    called_at = models.DateTimeField(
        null=True,
        blank=True,
        help_text="When patient was called"
    )
    consultation_started_at = models.DateTimeField(
        null=True,
        blank=True,
        help_text="When consultation started"
    )
    completed_at = models.DateTimeField(
        null=True,
        blank=True,
        help_text="When visit was completed"
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
        help_text="Encounter created for this visit"
    )
    triage_assessment = models.ForeignKey(
        "triage.TriageAssessment",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="clinic_visits",
        help_text="Triage assessment that routed patient here"
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
        help_text="If referred, the source clinic visit"
    )
    referred_to_clinic = models.ForeignKey(
        Clinic,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="incoming_referrals",
        help_text="Clinic patient was referred to"
    )
    referral_reason = models.TextField(
        blank=True,
        default="",
        help_text="Reason for referral"
    )

    # =========================================================================
    # Staff Assignment
    # =========================================================================
    assigned_clinician = models.ForeignKey(
        "auth.User",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="assigned_clinic_visits",
        help_text="Clinician assigned to see this patient"
    )
    registered_by = models.ForeignKey(
        "auth.User",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="registered_clinic_visits",
        help_text="Staff who registered the visit"
    )

    # =========================================================================
    # Chief Complaint (from triage or direct entry)
    # =========================================================================
    chief_complaint = models.TextField(
        blank=True,
        default="",
        help_text="Chief complaint / reason for visit"
    )
    notes = models.TextField(
        blank=True,
        default="",
        help_text="Additional notes"
    )

    # =========================================================================
    # Billing
    # =========================================================================
    consultation_fee_charged = models.BooleanField(
        default=False,
        help_text="Whether consultation fee has been charged"
    )
    billing_line_item = models.ForeignKey(
        "billing.BillingLineItem",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="clinic_visits",
        help_text="Associated billing line item"
    )

    class Meta:
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
                name="unique_queue_number_per_session"
            ),
        ]

    def __str__(self):
        return f"{self.patient} - {self.session.clinic.name} #{self.queue_number}"

    def save(self, *args, **kwargs):
        # Auto-assign queue number if not set
        if not self.queue_number:
            last_visit = ClinicVisit.objects.filter(
                session=self.session
            ).order_by("-queue_number").first()
            self.queue_number = (last_visit.queue_number + 1) if last_visit else 1
        super().save(*args, **kwargs)

    def call_patient(self, clinician):
        """Call patient for consultation."""
        from django.utils import timezone
        self.status = "CALLED"
        self.called_at = timezone.now()
        self.assigned_clinician = clinician
        self.save()

    def start_consultation(self):
        """Start consultation - creates encounter if needed."""
        from django.utils import timezone
        from hmis.apps.encounters.models import Encounter

        self.status = "IN_CONSULTATION"
        self.consultation_started_at = timezone.now()

        # Create encounter if not exists
        if not self.encounter:
            self.encounter = Encounter.objects.create(
                patient=self.patient,
                encounter_type=self._map_clinic_to_encounter_type(),
                chief_complaint=self.chief_complaint or "See clinic notes",
                triage_status="COMPLETED" if self.triage_assessment else "NOT_APPLICABLE",
            )

        self.save()
        return self.encounter

    def complete_visit(self):
        """Mark visit as completed."""
        from django.utils import timezone
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
        from django.utils import timezone
        if self.consultation_started_at:
            end = self.consultation_started_at
        else:
            end = timezone.now()
        delta = end - self.registered_at
        return int(delta.total_seconds() / 60)
```

### 2.4 Clinic Enrollment Model (For Chronic Care)

```python
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
        related_name="enrollments"
    )
    patient = models.ForeignKey(
        "patients.Patient",
        on_delete=models.CASCADE,
        related_name="clinic_enrollments"
    )

    # Enrollment details
    enrollment_number = models.CharField(
        max_length=50,
        blank=True,
        default="",
        help_text="Clinic-specific ID (e.g., CCC number, ANC number)"
    )
    enrollment_date = models.DateField(
        help_text="Date of enrollment"
    )
    status = models.CharField(
        max_length=30,
        choices=STATUS_CHOICES,
        default="ACTIVE"
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
        """
    )

    # Scheduling
    next_appointment = models.DateField(
        null=True,
        blank=True,
        help_text="Next scheduled visit"
    )
    appointment_interval_days = models.PositiveIntegerField(
        default=30,
        help_text="Default days between appointments"
    )

    # Tracking
    enrolled_by = models.ForeignKey(
        "auth.User",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="clinic_enrollments_created"
    )
    last_visit_date = models.DateField(
        null=True,
        blank=True,
        help_text="Date of last clinic visit"
    )
    total_visits = models.PositiveIntegerField(
        default=0,
        help_text="Total visits since enrollment"
    )

    # Outcome tracking
    outcome_date = models.DateField(
        null=True,
        blank=True,
        help_text="Date of outcome (completion, transfer, etc.)"
    )
    outcome_reason = models.TextField(
        blank=True,
        default="",
        help_text="Reason for outcome"
    )
    transfer_facility = models.CharField(
        max_length=200,
        blank=True,
        default="",
        help_text="Facility transferred to (if applicable)"
    )

    class Meta:
        ordering = ["-enrollment_date"]
        verbose_name = "Clinic Enrollment"
        verbose_name_plural = "Clinic Enrollments"
        unique_together = ["clinic", "patient", "enrollment_date"]

    def __str__(self):
        return f"{self.patient} - {self.clinic.name} ({self.enrollment_number or 'No ID'})"

    def is_overdue(self):
        """Check if patient is overdue for appointment."""
        from django.utils import timezone
        if not self.next_appointment:
            return False
        return self.next_appointment < timezone.now().date()

    def days_since_last_visit(self):
        """Calculate days since last visit."""
        from django.utils import timezone
        if not self.last_visit_date:
            return None
        return (timezone.now().date() - self.last_visit_date).days

    def record_visit(self, visit_date=None):
        """Record a clinic visit."""
        from django.utils import timezone
        visit_date = visit_date or timezone.now().date()
        self.last_visit_date = visit_date
        self.total_visits += 1
        self.next_appointment = visit_date + timezone.timedelta(days=self.appointment_interval_days)
        self.save()
```

---

## 3. API Endpoints

### 3.1 Clinic Endpoints

```
# Clinics
GET    /api/clinics/                           # List all clinics
POST   /api/clinics/                           # Create clinic (admin)
GET    /api/clinics/{id}/                      # Get clinic details
PATCH  /api/clinics/{id}/                      # Update clinic
DELETE /api/clinics/{id}/                      # Delete clinic (admin)

# Clinic Sessions
GET    /api/clinics/{id}/sessions/             # List sessions for clinic
POST   /api/clinics/{id}/sessions/             # Create session
GET    /api/clinics/{id}/sessions/today/       # Get today's session
POST   /api/clinics/{id}/sessions/today/open/  # Open today's session
POST   /api/clinics/{id}/sessions/today/close/ # Close today's session

# Clinic Queue
GET    /api/clinics/{id}/queue/                # Get current queue
POST   /api/clinics/{id}/queue/                # Add patient to queue
GET    /api/clinics/{id}/queue/stats/          # Queue statistics

# Clinic Visits
GET    /api/clinic-visits/                     # List all visits (filtered)
POST   /api/clinic-visits/                     # Create visit
GET    /api/clinic-visits/{id}/                # Get visit details
PATCH  /api/clinic-visits/{id}/                # Update visit
POST   /api/clinic-visits/{id}/call/           # Call patient
POST   /api/clinic-visits/{id}/start/          # Start consultation
POST   /api/clinic-visits/{id}/complete/       # Complete visit
POST   /api/clinic-visits/{id}/refer/          # Refer to another clinic

# Clinic Enrollments
GET    /api/clinic-enrollments/                # List enrollments
POST   /api/clinic-enrollments/                # Create enrollment
GET    /api/clinic-enrollments/{id}/           # Get enrollment
PATCH  /api/clinic-enrollments/{id}/           # Update enrollment
GET    /api/clinic-enrollments/overdue/        # Get overdue patients
GET    /api/clinic-enrollments/defaulters/     # Get defaulters

# Clinic Staff
GET    /api/clinics/{id}/staff/                # List clinic staff
POST   /api/clinics/{id}/staff/                # Assign staff
DELETE /api/clinics/{id}/staff/{user_id}/      # Remove staff

# Clinic Schedule
GET    /api/clinics/{id}/schedule/             # Get clinic schedule
POST   /api/clinics/{id}/schedule/             # Add schedule entry
PATCH  /api/clinics/{id}/schedule/{id}/        # Update schedule
DELETE /api/clinics/{id}/schedule/{id}/        # Delete schedule
```

### 3.2 Patient Flow API

```python
# POST /api/triage/{id}/route-to-clinic/
{
    "clinic_id": 5,
    "priority": "STANDARD",
    "notes": "Referred for eye examination"
}

# Response: ClinicVisit created
{
    "id": 123,
    "queue_number": 15,
    "clinic": {"id": 5, "name": "Eye Clinic"},
    "status": "WAITING",
    "estimated_wait_minutes": 45
}
```

---

## 4. Frontend Implementation

### 4.1 Navigation Structure

```
Dashboard
├── Patients
├── Triage
├── Clinics ▾ (NEW)
│   ├── General OPD
│   ├── Welfare / MCH
│   │   ├── ANC Clinic
│   │   ├── PNC Clinic
│   │   ├── Child Welfare (CWC)
│   │   ├── Immunization
│   │   └── Family Planning
│   ├── Eye Clinic
│   ├── Dental Clinic
│   ├── Surgical Clinic
│   ├── Chronic Care ▾
│   │   ├── CCC (HIV)
│   │   ├── Diabetic Clinic
│   │   ├── Hypertension Clinic
│   │   └── TB Clinic
│   └── All Clinics (Admin View)
├── Encounters
├── Inpatient
├── Pharmacy
├── Diagnostics ▾
│   ├── Laboratory
│   └── Imaging
├── Finance ▾
│   ├── Billing
│   └── Transactions
└── Admin
```

### 4.2 Page Structure

```
web-app/app/(dashboard)/clinics/
├── page.tsx                     # Clinics overview/list
├── layout.tsx                   # Clinics layout with sidebar
├── [clinicId]/
│   ├── page.tsx                 # Clinic dashboard (queue view)
│   ├── queue/
│   │   └── page.tsx             # Queue management
│   ├── patients/
│   │   └── page.tsx             # Enrolled patients
│   ├── sessions/
│   │   └── page.tsx             # Session history
│   ├── staff/
│   │   └── page.tsx             # Staff assignments
│   ├── schedule/
│   │   └── page.tsx             # Schedule management
│   ├── reports/
│   │   └── page.tsx             # Clinic reports
│   └── settings/
│       └── page.tsx             # Clinic settings
├── enrollments/
│   ├── page.tsx                 # All enrollments
│   ├── overdue/
│   │   └── page.tsx             # Overdue patients
│   └── defaulters/
│       └── page.tsx             # Defaulter tracking
└── mch/                         # MCH-specific pages
    ├── anc/
    │   └── page.tsx             # ANC register
    ├── cwc/
    │   └── page.tsx             # CWC growth monitoring
    └── immunization/
        └── page.tsx             # Immunization register
```

### 4.3 Key Components

```typescript
// Clinic Queue Component
interface ClinicQueueProps {
  clinicId: number;
  sessionDate?: Date;
}

// Features:
// - Real-time queue updates (WebSocket)
// - Priority-based sorting (RED → ORANGE → YELLOW → GREEN → BLUE)
// - Call patient button
// - Wait time display
// - Quick stats (waiting, in consultation, completed)

// Clinic Visit Card
interface ClinicVisitCardProps {
  visit: ClinicVisit;
  onCall: () => void;
  onStart: () => void;
  onComplete: () => void;
  onRefer: () => void;
}

// Enrollment Form (CCC, ANC, Diabetic)
interface EnrollmentFormProps {
  clinic: Clinic;
  patient: Patient;
  enrollmentType: 'CCC' | 'ANC' | 'DIABETIC' | 'TB';
}
```

### 4.4 Clinic Dashboard Wireframe

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  Eye Clinic - January 24, 2026                          [Open Session] [⚙️] │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐           │
│  │  WAITING    │ │ IN CONSULT  │ │  COMPLETED  │ │  AVG WAIT   │           │
│  │     12      │ │      2      │ │     15      │ │   25 min    │           │
│  └─────────────┘ └─────────────┘ └─────────────┘ └─────────────┘           │
│                                                                             │
│  ┌───────────────────────────────────────────────────────────────────────┐ │
│  │  QUEUE                                                   [+ Add Patient]│ │
│  ├───────────────────────────────────────────────────────────────────────┤ │
│  │  #  │ Patient          │ Priority │ Wait  │ Chief Complaint │ Actions  │ │
│  ├─────┼──────────────────┼──────────┼───────┼─────────────────┼──────────┤ │
│  │  1  │ Jane Wanjiku     │ 🔴 RED   │ 5m    │ Eye injury      │ [Call]   │ │
│  │  2  │ John Kamau       │ 🟡 YELLOW│ 15m   │ Blurred vision  │ [Call]   │ │
│  │  3  │ Mary Akinyi      │ 🟢 GREEN │ 25m   │ Routine checkup │ [Call]   │ │
│  │  4  │ Peter Omondi     │ 🟢 GREEN │ 30m   │ Eye strain      │ [Call]   │ │
│  │  ... │ ...             │ ...      │ ...   │ ...             │ ...      │ │
│  └───────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
│  ┌───────────────────────────────────────────────────────────────────────┐ │
│  │  IN CONSULTATION                                                       │ │
│  ├───────────────────────────────────────────────────────────────────────┤ │
│  │  🟠 Alice Njeri - Dr. Otieno - Started 10:15 (15 min)      [Complete] │ │
│  │  🟢 Bob Mwangi - Dr. Achieng - Started 10:20 (10 min)      [Complete] │ │
│  └───────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 5. Integration Points

### 5.1 Triage → Clinic Routing

```python
# After triage assessment, route patient to appropriate clinic
class TriageAssessment:
    def route_to_clinic(self, clinic_id, user):
        """Route triaged patient to specified clinic."""
        from hmis.apps.clinics.models import Clinic, ClinicVisit

        clinic = Clinic.objects.get(id=clinic_id)
        session = clinic.get_current_session()

        visit = ClinicVisit.objects.create(
            session=session,
            patient=self.patient,
            triage_assessment=self,
            priority=self._map_keta_to_priority(),
            chief_complaint=self.chief_complaint_text,
            source="TRIAGE",
            registered_by=user,
        )

        return visit

    def _map_keta_to_priority(self):
        """Map KETA category to clinic priority."""
        mapping = {
            "RED": "EMERGENCY",
            "ORANGE": "URGENT",
            "YELLOW": "PRIORITY",
            "GREEN": "STANDARD",
            "BLUE": "NON_URGENT",
        }
        return mapping.get(self.keta_category, "STANDARD")
```

### 5.2 Clinic Visit → Encounter

```python
# When consultation starts, create/link encounter
visit.start_consultation()  # Creates Encounter if not exists

# Encounter now has clinic context
encounter = visit.encounter
encounter.clinic_visit  # Back-reference to ClinicVisit
```

### 5.3 Clinic → Billing

```python
# Auto-generate billing when consultation starts
def start_consultation(self):
    # ... create encounter ...

    # Generate consultation fee
    if not self.consultation_fee_charged and self.session.clinic.default_service_fee:
        from hmis.apps.billing.models import BillingLineItem, Invoice

        # Get or create invoice for patient
        invoice = Invoice.get_or_create_for_patient(self.patient)

        self.billing_line_item = BillingLineItem.objects.create(
            invoice=invoice,
            service_type="CONSULTATION",
            description=f"{self.session.clinic.name} Consultation",
            quantity=1,
            unit_price=self.session.clinic.default_service_fee,
            clinic_visit=self,
        )
        self.consultation_fee_charged = True
        self.save()
```

### 5.4 Clinic → SHA Claims

```python
# Claims bundle includes clinic context
def build_claim_bundle(encounter):
    clinic = getattr(encounter, 'clinic_visit', None)
    if clinic:
        return {
            "resourceType": "Claim",
            "facility": {
                "identifier": clinic.session.clinic.sha_service_code
            },
            "item": [
                {
                    "service": {
                        "coding": [{
                            "system": "https://sha.go.ke/tariff",
                            "code": clinic.session.clinic.sha_service_code
                        }]
                    }
                }
            ]
        }
```

---

## 6. DHIS2/KHIS Reporting

### 6.1 Aggregate Data Flow

```
ClinicVisit (raw)
    → ClinicSession (daily aggregate)
        → MonthlyClinicReport (MOH 711 format)
            → DHIS2 Push (aggregate API)
```

### 6.2 Report Models

```python
class MonthlyClinicReport(models.Model):
    """
    Monthly aggregate report for DHIS2/KHIS submission.
    """
    clinic = models.ForeignKey(Clinic, on_delete=models.CASCADE)
    report_month = models.DateField(help_text="First day of report month")

    # Aggregates
    total_visits = models.PositiveIntegerField(default=0)
    new_patients = models.PositiveIntegerField(default=0)
    return_patients = models.PositiveIntegerField(default=0)

    # Age/sex disaggregation (JSON)
    disaggregation = models.JSONField(
        null=True,
        help_text="""
        {
            "male_under_5": 10,
            "male_5_to_14": 15,
            "male_15_plus": 25,
            "female_under_5": 12,
            "female_5_to_14": 18,
            "female_15_plus": 30
        }
        """
    )

    # Status
    STATUS_CHOICES = [
        ("DRAFT", "Draft"),
        ("VALIDATED", "Validated"),
        ("SUBMITTED", "Submitted to DHIS2"),
    ]
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default="DRAFT")
    submitted_at = models.DateTimeField(null=True, blank=True)
    dhis2_response = models.JSONField(null=True, blank=True)
```

---

## 7. Implementation Phases

### Phase 2.1 (Weeks 1-2): Core Models & API

- [x] Create `clinics` Django app
- [x] Implement Clinic, ClinicSession, ClinicVisit models
- [x] Create migrations
- [x] Implement serializers and viewsets
- [x] Write unit tests (target: 50+ tests)
- [x] Seed initial clinic data (General OPD, Eye, Dental, CCC, MCH clinics)

### Phase 2.2 (Weeks 3-4): Queue Management

- [x] Implement queue numbering logic
- [x] Add call/start/complete actions
- [x] Implement referral flow between clinics
- [x] Add WebSocket support for real-time queue updates
- [x] Write queue management tests

### Phase 2.3 (Weeks 5-6): Frontend - Clinic Pages

- [x] Create clinic navigation structure
- [x] Implement clinic dashboard page
- [x] Build queue management component
- [x] Add patient call/start/complete UI
- [x] Implement clinic settings pages

### Phase 2.4 (Weeks 7-8): Enrollments & Chronic Care

- [x] Implement ClinicEnrollment model
- [ ] Add CCC-specific fields and forms
- [ ] Add ANC-specific fields and forms
- [x] Implement defaulter tracking
- [x] Build enrollment management UI

### Phase 2.5 (Weeks 9-10): Integration & Reporting

- [x] Integrate with Triage routing
- [x] Integrate with Billing
- [x] Implement monthly aggregate reports
- [ ] Add DHIS2 export functionality
- [x] E2E testing

---

## 8. Testing Strategy

### 8.1 Unit Tests (Target: 150+)

```python
# tests/test_clinics/test_models.py
class TestClinicModel:
    def test_create_clinic(self): ...
    def test_clinic_is_open_today(self): ...
    def test_get_current_session(self): ...

class TestClinicVisitModel:
    def test_auto_queue_number(self): ...
    def test_call_patient(self): ...
    def test_start_consultation_creates_encounter(self): ...
    def test_complete_visit(self): ...
    def test_refer_to_clinic(self): ...
    def test_wait_time_calculation(self): ...

class TestClinicEnrollmentModel:
    def test_is_overdue(self): ...
    def test_record_visit_updates_next_appointment(self): ...
```

### 8.2 API Tests (Target: 80+)

```python
# tests/test_clinics/test_api.py
class TestClinicAPI:
    def test_list_clinics(self): ...
    def test_get_clinic_queue(self): ...
    def test_add_patient_to_queue(self): ...
    def test_call_patient(self): ...
    def test_start_consultation(self): ...
    def test_complete_visit(self): ...
    def test_refer_patient(self): ...
```

### 8.3 E2E Tests (Target: 15+ scenarios)

```gherkin
# web-app/features/clinics/queue-management.feature
Feature: Clinic Queue Management

  Scenario: Add patient to clinic queue after triage
    Given I am logged in as a triage nurse
    And patient "John Doe" has completed triage with category "GREEN"
    When I route patient to "Eye Clinic"
    Then patient should appear in Eye Clinic queue
    And queue number should be assigned

  Scenario: Call patient from queue
    Given I am logged in as a doctor assigned to "Eye Clinic"
    And there are 5 patients in the queue
    When I click "Call" on the first patient
    Then patient status should change to "CALLED"
    And patient should be assigned to me
```

---

## 9. Migration Plan

### 9.1 Data Migration from Existing Encounters

```python
# Migrate existing encounter_type-based encounters to clinic visits
def migrate_encounters_to_clinics():
    """
    For existing encounters with clinic-like types (ANC, PAEDIATRIC, etc.),
    create corresponding ClinicVisit records for reporting continuity.
    """
    clinic_type_mapping = {
        "ANC": "ANC",
        "PAEDIATRIC": "CWC",
        "CHRONIC_STABLE": "DIABETIC",  # or determine from diagnosis
        # ...
    }

    for encounter in Encounter.objects.filter(
        encounter_type__in=clinic_type_mapping.keys()
    ):
        clinic = Clinic.objects.get(clinic_type=clinic_type_mapping[encounter.encounter_type])
        session, _ = ClinicSession.objects.get_or_create(
            clinic=clinic,
            session_date=encounter.encounter_date
        )
        ClinicVisit.objects.create(
            session=session,
            patient=encounter.patient,
            encounter=encounter,
            status="COMPLETED",
            completed_at=encounter.created_at,
        )
```

---

## 10. Success Criteria

| Metric | Target |
|--------|--------|
| Unit test coverage | ≥80% |
| API response time (queue) | <200ms |
| Queue update latency (WebSocket) | <1s |
| Clinic setup time | <5 min per clinic |
| Patient routing time (triage → clinic) | <30s |
| DHIS2 export success rate | ≥99% |

---

## Appendix A: Clinic Types Reference

| Clinic Type | MOH Code | DHIS2 Dataset | Requires Enrollment |
|-------------|----------|---------------|---------------------|
| General OPD | OPD | MOH 705A | No |
| ANC | ANC | MOH 711 | Yes |
| PNC | PNC | MOH 711 | Yes |
| CWC | CWC | MOH 711 | Yes |
| Immunization | EPI | MOH 710 | No |
| CCC (HIV) | CCC | MOH 731 | Yes |
| TB | TB | MOH 711 | Yes |
| Diabetic | NCD | MOH 711 | Yes |
| Dental | DENT | MOH 705A | No |
| Eye | OPH | MOH 705A | No |

---

## Appendix B: Related Documents

- [Procedures Module Implementation Plan](procedures-module-implementation-plan.md)
- [ROADMAP.md](../ROADMAP.md)
- [encounters-consultation-queue-plan.md](encounters-consultation-queue-plan.md)
- [ideal-patient-flow.md](ideal-patient-flow.md)

---

**Document Status**: Draft
**Next Review**: January 31, 2026
**Owner**: thande788
