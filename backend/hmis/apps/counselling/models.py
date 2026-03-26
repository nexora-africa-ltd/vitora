"""
Counselling models for Vitora HMIS.

This module contains all counselling-related models including:
- CounsellingType: Catalog of counselling types with pricing
- CounsellingReferral: Referral orders from clinical encounters
- CounsellingSession: Individual counselling sessions

All models follow TDD approach and Kenya healthcare requirements.
Session types include: HIV, Mental Health, Family Planning, General.
"""

from datetime import date, datetime
from decimal import Decimal

from django.apps import apps
from django.conf import settings
from django.core.exceptions import ValidationError
from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import models
from django.utils import timezone
from simple_history.models import HistoricalRecords

from hmis.apps.core.history import HistoryMixin


def generate_counselling_referral_number():
    """
    Generate a unique Counselling Referral Number.

    Format: COUNS-YYYYMMDD-XXXX
    Where XXXX is a 4-digit sequential number for the day.

    Returns:
        str: A unique counselling referral number string
    """
    today = datetime.now().strftime("%Y%m%d")
    prefix = f"COUNS-{today}-"

    # Get the CounsellingReferral model via app registry to avoid circular imports
    CounsellingReferral = apps.get_model("counselling", "CounsellingReferral")

    # Find the highest referral number for today
    latest_referral = (
        CounsellingReferral.objects.filter(referral_number__startswith=prefix)
        .order_by("-referral_number")
        .first()
    )

    if latest_referral:
        # Extract the sequence number and increment
        last_sequence = int(latest_referral.referral_number.split("-")[-1])
        sequence = last_sequence + 1
    else:
        # First referral of the day
        sequence = 1

    return f"{prefix}{sequence:04d}"


def generate_session_number():
    """
    Generate a unique Counselling Session Number.

    Format: CS-YYYYMMDD-XXXX
    Where XXXX is a 4-digit sequential number for the day.

    Returns:
        str: A unique counselling session number string
    """
    today = datetime.now().strftime("%Y%m%d")
    prefix = f"CS-{today}-"

    # Get the CounsellingSession model via app registry to avoid circular imports
    CounsellingSession = apps.get_model("counselling", "CounsellingSession")

    # Find the highest session number for today
    latest_session = (
        CounsellingSession.objects.filter(session_number__startswith=prefix)
        .order_by("-session_number")
        .first()
    )

    if latest_session:
        # Extract the sequence number and increment
        last_sequence = int(latest_session.session_number.split("-")[-1])
        sequence = last_sequence + 1
    else:
        # First session of the day
        sequence = 1

    return f"{prefix}{sequence:04d}"


class CounsellingType(models.Model):
    """
    Catalog of counselling types.

    Stores information about available counselling services including
    category, typical duration, pricing, and SHA claimability.
    Primary categories: HIV, Mental Health, Family Planning, General.
    """

    CATEGORY_CHOICES = [
        ("HIV", "HIV/AIDS Counselling"),
        ("MENTAL_HEALTH", "Mental Health Counselling"),
        ("FAMILY_PLANNING", "Family Planning Counselling"),
        ("GENERAL", "General Counselling"),
        ("SUBSTANCE_ABUSE", "Substance Abuse Counselling"),
        ("GRIEF", "Grief and Bereavement Counselling"),
        ("TRAUMA", "Trauma Counselling"),
        ("RELATIONSHIP", "Relationship/Marriage Counselling"),
        ("ADOLESCENT", "Adolescent Counselling"),
        ("PRENATAL", "Prenatal/Antenatal Counselling"),
        ("POSTNATAL", "Postnatal Counselling"),
        ("NUTRITION", "Nutrition Counselling"),
        ("CHRONIC_ILLNESS", "Chronic Illness Counselling"),
        ("PALLIATIVE", "Palliative Care Counselling"),
        ("OTHER", "Other"),
    ]

    # Identity
    code = models.CharField(
        max_length=50,
        unique=True,
        help_text="Unique counselling type code (e.g., CT-HIV-001)",
    )
    name = models.CharField(max_length=200, help_text="Full counselling type name")
    description = models.TextField(blank=True, help_text="Detailed description of counselling service")
    category = models.CharField(
        max_length=30,
        choices=CATEGORY_CHOICES,
        default="GENERAL",
    )

    # Session parameters
    typical_duration_minutes = models.PositiveIntegerField(
        default=45,
        validators=[MinValueValidator(15), MaxValueValidator(180)],
        help_text="Typical session duration in minutes",
    )
    recommended_sessions = models.PositiveIntegerField(
        default=4,
        validators=[MinValueValidator(1), MaxValueValidator(52)],
        help_text="Recommended number of sessions",
    )
    recommended_frequency = models.CharField(
        max_length=50,
        default="1x per week",
        help_text="Recommended session frequency (e.g., '1x per week', 'bi-weekly')",
    )

    # Pricing & SHA
    cost_per_session = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        default=Decimal("0.00"),
        help_text="Cost per session in KES",
    )
    sha_claimable = models.BooleanField(default=True, help_text="Covered by Kenya SHA")
    sha_intervention_code = models.CharField(
        max_length=50,
        blank=True,
        help_text="SHA intervention code for claims",
    )

    # Privacy considerations
    requires_privacy = models.BooleanField(
        default=False,
        help_text="Requires enhanced privacy handling (e.g., HIV, Mental Health)",
    )

    # Requirements
    requires_referral = models.BooleanField(
        default=False,
        help_text="Requires clinical referral before booking",
    )
    min_age = models.PositiveIntegerField(
        null=True,
        blank=True,
        help_text="Minimum patient age for this counselling type",
    )
    max_age = models.PositiveIntegerField(
        null=True,
        blank=True,
        help_text="Maximum patient age for this counselling type",
    )
    gender_specific = models.CharField(
        max_length=10,
        blank=True,
        choices=[("M", "Male only"), ("F", "Female only")],
        help_text="Gender restriction if applicable",
    )

    # Availability
    is_active = models.BooleanField(default=True)

    # Timestamps
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "Counselling Type"
        verbose_name_plural = "Counselling Types"
        ordering = ["category", "name"]
        indexes = [
            models.Index(fields=["code"]),
            models.Index(fields=["category"]),
            models.Index(fields=["is_active"]),
        ]

    def __str__(self):
        return f"{self.code} - {self.name}"


class CounsellingReferral(HistoryMixin, models.Model):
    """
    Counselling referral from a clinical encounter.

    Represents a counselling referral made by a clinician for a patient,
    tracking referral reason, urgency, and assignment to counsellor.
    """

    REFERRAL_STATUS = [
        ("DRAFT", "Draft"),
        ("PENDING", "Pending Review"),
        ("ACCEPTED", "Accepted"),
        ("IN_PROGRESS", "In Progress"),
        ("COMPLETED", "Completed"),
        ("CANCELLED", "Cancelled"),
        ("NO_SHOW", "Patient No Show"),
    ]

    URGENCY_LEVELS = [
        ("ROUTINE", "Routine"),
        ("URGENT", "Urgent (within 24 hours)"),
        ("EMERGENCY", "Emergency (immediate - crisis intervention)"),
    ]

    REFERRAL_REASONS = [
        ("HIV_DIAGNOSIS", "New HIV Diagnosis"),
        ("HIV_ADHERENCE", "HIV Treatment Adherence Support"),
        ("HIV_PARTNER", "HIV Partner Notification"),
        ("HIV_PMTCT", "HIV PMTCT Support"),
        ("DEPRESSION", "Depression"),
        ("ANXIETY", "Anxiety/Panic Disorder"),
        ("PTSD", "Post-Traumatic Stress Disorder"),
        ("SUICIDAL", "Suicidal Ideation/Self-harm"),
        ("PSYCHOSIS", "Psychosis/Psychiatry Evaluation"),
        ("SUBSTANCE_ABUSE", "Substance Abuse"),
        ("FAMILY_PLANNING", "Family Planning Counselling"),
        ("PREGNANCY", "Pregnancy-related Counselling"),
        ("GRIEF", "Grief and Bereavement"),
        ("RELATIONSHIP", "Relationship/Marriage Issues"),
        ("CHRONIC_ILLNESS", "Chronic Illness Support"),
        ("ADOLESCENT", "Adolescent Issues"),
        ("GBV", "Gender-Based Violence"),
        ("STRESS", "Stress Management"),
        ("OTHER", "Other"),
    ]

    # Sensitive referral reasons requiring enhanced privacy
    SENSITIVE_REASONS = ["HIV_DIAGNOSIS", "HIV_ADHERENCE", "HIV_PARTNER", "HIV_PMTCT", "SUICIDAL", "PSYCHOSIS", "GBV"]

    # Mental health related reasons for mental health encounter integration
    MENTAL_HEALTH_REASONS = ["DEPRESSION", "ANXIETY", "PTSD", "SUICIDAL", "PSYCHOSIS", "SUBSTANCE_ABUSE"]

    # Valid status transitions
    STATUS_TRANSITIONS = {
        "DRAFT": ["PENDING", "CANCELLED"],
        "PENDING": ["ACCEPTED", "CANCELLED"],
        "ACCEPTED": ["IN_PROGRESS", "CANCELLED", "NO_SHOW"],
        "IN_PROGRESS": ["COMPLETED", "CANCELLED", "NO_SHOW"],
        "COMPLETED": [],
        "CANCELLED": [],
        "NO_SHOW": ["PENDING"],  # Can be rescheduled
    }

    # Identity - format: COUNS-YYYYMMDD-XXXX
    referral_number = models.CharField(max_length=30, unique=True, editable=False)

    # Tenant scoping
    organization = models.ForeignKey(
        "core.Organization",
        on_delete=models.CASCADE,
        related_name="counselling_referrals",
        null=True,
        blank=True,
        help_text="Owning organization (auto-set from facility).",
    )
    facility = models.ForeignKey(
        "core.Facility",
        on_delete=models.CASCADE,
        related_name="counselling_referrals",
        null=True,
        blank=True,
        help_text="Facility where referral was created.",
    )

    # Relationships
    patient = models.ForeignKey(
        "patients.Patient",
        on_delete=models.PROTECT,
        related_name="counselling_referrals",
    )
    encounter = models.ForeignKey(
        "encounters.Encounter",
        on_delete=models.PROTECT,
        related_name="counselling_referrals",
        null=True,
        blank=True,
        help_text="Source encounter (optional for direct referrals)",
    )
    counselling_type = models.ForeignKey(
        CounsellingType,
        on_delete=models.PROTECT,
        related_name="referrals",
        null=True,
        blank=True,
        help_text="Specific counselling type requested",
    )
    referred_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="counselling_referrals_made",
        help_text="Clinician who made the referral",
    )
    assigned_counsellor = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="counselling_referrals_assigned",
        help_text="Counsellor assigned to this referral",
    )

    # Referral details
    reason = models.CharField(
        max_length=30,
        choices=REFERRAL_REASONS,
        help_text="Primary reason for referral",
    )
    urgency = models.CharField(
        max_length=20,
        choices=URGENCY_LEVELS,
        default="ROUTINE",
    )
    clinical_summary = models.TextField(
        help_text="Summary of patient's clinical situation",
    )
    presenting_issues = models.TextField(
        help_text="Current issues prompting counselling need",
    )
    goals = models.TextField(
        blank=True,
        help_text="Goals for counselling intervention",
    )
    risk_assessment = models.TextField(
        blank=True,
        help_text="Risk assessment notes (e.g., suicide risk, harm to self/others)",
    )

    # Status tracking
    status = models.CharField(
        max_length=20,
        choices=REFERRAL_STATUS,
        default="DRAFT",
    )

    # Privacy - automatically set for sensitive referrals
    is_sensitive = models.BooleanField(
        default=False,
        help_text="Requires sensitive access permission",
    )

    # Sessions
    total_sessions = models.PositiveIntegerField(
        default=4,
        validators=[MinValueValidator(1), MaxValueValidator(52)],
        help_text="Total number of sessions prescribed",
    )
    sessions_completed = models.PositiveIntegerField(
        default=0,
        help_text="Number of sessions completed",
    )

    # Billing
    is_paid = models.BooleanField(default=False)
    invoice = models.ForeignKey(
        "billing.Invoice",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="counselling_referrals",
    )

    # Clinic visit integration
    clinic_visit = models.ForeignKey(
        "clinics.ClinicVisit",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="counselling_referrals",
        help_text="Clinic visit for queue management",
    )

    # Timestamps
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    accepted_at = models.DateTimeField(null=True, blank=True)
    started_at = models.DateTimeField(null=True, blank=True)
    completed_at = models.DateTimeField(null=True, blank=True)
    completed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="counselling_referrals_completed",
    )

    # Notes
    completion_notes = models.TextField(blank=True, help_text="Summary notes upon completion")
    cancellation_reason = models.TextField(blank=True, help_text="Reason for cancellation if applicable")

    # Version tracking
    history = HistoricalRecords()

    class Meta:
        verbose_name = "Counselling Referral"
        verbose_name_plural = "Counselling Referrals"
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["referral_number"]),
            models.Index(fields=["patient", "status"]),
            models.Index(fields=["assigned_counsellor", "status"]),
            models.Index(fields=["status"]),
            models.Index(fields=["urgency"]),
            models.Index(fields=["created_at"]),
            models.Index(fields=["is_sensitive"]),
        ]
        permissions = [
            ("view_sensitive_counselling_referral", "Can view sensitive counselling referrals"),
        ]

    def __str__(self):
        return f"{self.referral_number} - {self.patient}"

    def save(self, *args, **kwargs):
        """Override save to generate referral number and handle sensitive flags."""
        from hmis.apps.core.mixins import resolve_tenant_from_related
        resolve_tenant_from_related(self)

        # Generate referral number only on creation
        if not self.pk:
            if not self.referral_number:
                self.referral_number = generate_counselling_referral_number()
        else:
            # Prevent modifying referral number after creation
            if self.pk:
                original = CounsellingReferral.objects.filter(pk=self.pk).values_list('referral_number', flat=True).first()
                if original and self.referral_number != original:
                    self.referral_number = original

        # Auto-mark sensitive for sensitive reasons
        if self.reason in self.SENSITIVE_REASONS:
            self.is_sensitive = True
            # Also mark patient as sensitive
            if self.patient and not self.patient.is_sensitive:
                self.patient.is_sensitive = True
                self.patient.save(update_fields=["is_sensitive"])

        # Auto-mark sensitive if counselling type requires privacy
        if self.counselling_type and self.counselling_type.requires_privacy:
            self.is_sensitive = True

        super().save(*args, **kwargs)

    def update_status(self, new_status, user=None):
        """
        Update referral status with validation.

        Args:
            new_status: The new status to transition to
            user: The user making the change

        Raises:
            ValidationError: If the transition is not allowed
        """
        allowed_transitions = self.STATUS_TRANSITIONS.get(self.status, [])

        if new_status not in allowed_transitions:
            raise ValidationError(
                f"Cannot transition from '{self.status}' to '{new_status}'. "
                f"Allowed transitions: {allowed_transitions}"
            )

        old_status = self.status
        self.status = new_status
        now = timezone.now()

        # Set timestamps based on status
        if new_status == "ACCEPTED" and not self.accepted_at:
            self.accepted_at = now
        elif new_status == "IN_PROGRESS" and not self.started_at:
            self.started_at = now
        elif new_status == "COMPLETED":
            self.completed_at = now
            if user:
                self.completed_by = user

        self.save()

        return old_status

    @property
    def is_mental_health_related(self):
        """Check if this referral is mental health related."""
        return self.reason in self.MENTAL_HEALTH_REASONS

    @property
    def is_hiv_related(self):
        """Check if this referral is HIV related."""
        return self.reason in ["HIV_DIAGNOSIS", "HIV_ADHERENCE", "HIV_PARTNER", "HIV_PMTCT"]

    @property
    def requires_immediate_attention(self):
        """Check if this referral requires immediate attention."""
        return self.urgency == "EMERGENCY" or self.reason in ["SUICIDAL", "GBV"]

    @property
    def completion_percentage(self):
        """Calculate session completion percentage."""
        if self.total_sessions == 0:
            return 0
        return round((self.sessions_completed / self.total_sessions) * 100, 1)


class CounsellingSession(HistoryMixin, models.Model):
    """
    Individual counselling session record.

    Tracks details of each counselling session including
    notes, outcomes, and follow-up requirements.
    """

    SESSION_STATUS = [
        ("SCHEDULED", "Scheduled"),
        ("IN_PROGRESS", "In Progress"),
        ("COMPLETED", "Completed"),
        ("CANCELLED", "Cancelled"),
        ("NO_SHOW", "Patient No Show"),
        ("RESCHEDULED", "Rescheduled"),
    ]

    OUTCOME_CHOICES = [
        ("GOOD_PROGRESS", "Good Progress"),
        ("MODERATE_PROGRESS", "Moderate Progress"),
        ("LIMITED_PROGRESS", "Limited Progress"),
        ("NO_PROGRESS", "No Progress"),
        ("DETERIORATION", "Deterioration"),
        ("CRISIS_RESOLVED", "Crisis Resolved"),
        ("CRISIS_ONGOING", "Crisis Ongoing"),
        ("NEEDS_REFERRAL", "Needs Specialist Referral"),
        ("PENDING_ASSESSMENT", "Pending Assessment"),
    ]

    FOLLOW_UP_CHOICES = [
        ("CONTINUE", "Continue Sessions as Planned"),
        ("EXTEND", "Extend Number of Sessions"),
        ("REDUCE", "Reduce Session Frequency"),
        ("REFER_PSYCHIATRY", "Refer to Psychiatry"),
        ("REFER_SOCIAL_WORK", "Refer to Social Work"),
        ("REFER_PHYSICIAN", "Refer to Physician"),
        ("DISCHARGE", "Ready for Discharge"),
        ("CRISIS_PLAN", "Implement Crisis Plan"),
        ("NONE", "No Follow-up Required"),
    ]

    CONFIDENTIALITY_LEVELS = [
        ("STANDARD", "Standard Confidentiality"),
        ("RESTRICTED", "Restricted Access"),
        ("HIGHLY_RESTRICTED", "Highly Restricted (HIV/Mental Health)"),
    ]

    # Identity - format: CS-YYYYMMDD-XXXX
    session_number = models.CharField(max_length=30, unique=True, editable=False)

    # Relationships
    referral = models.ForeignKey(
        CounsellingReferral,
        on_delete=models.PROTECT,
        related_name="sessions",
    )
    counsellor = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="counselling_sessions",
        help_text="Counsellor who conducted the session",
    )

    # Session ordering
    session_sequence = models.PositiveIntegerField(
        default=1,
        help_text="Session number in the series (1, 2, 3...)",
    )

    # Scheduling
    scheduled_date = models.DateField(help_text="Scheduled date for the session")
    scheduled_time = models.TimeField(
        null=True,
        blank=True,
        help_text="Scheduled time for the session",
    )
    actual_date = models.DateField(
        null=True,
        blank=True,
        help_text="Actual date when session occurred",
    )
    actual_start_time = models.TimeField(
        null=True,
        blank=True,
        help_text="Actual start time of session",
    )
    actual_end_time = models.TimeField(
        null=True,
        blank=True,
        help_text="Actual end time of session",
    )
    duration_minutes = models.PositiveIntegerField(
        null=True,
        blank=True,
        validators=[MinValueValidator(5), MaxValueValidator(180)],
        help_text="Actual session duration in minutes",
    )

    # Status
    status = models.CharField(
        max_length=20,
        choices=SESSION_STATUS,
        default="SCHEDULED",
    )

    # Pre-session assessment
    pre_session_mood = models.PositiveIntegerField(
        null=True,
        blank=True,
        validators=[MinValueValidator(1), MaxValueValidator(10)],
        help_text="Patient's self-reported mood before session (1-10)",
    )
    pre_session_notes = models.TextField(
        blank=True,
        help_text="Notes on patient's presentation before session",
    )

    # Session content
    session_type = models.CharField(
        max_length=50,
        blank=True,
        help_text="Type of session (e.g., 'Individual', 'Group', 'Family')",
    )
    topics_discussed = models.TextField(
        blank=True,
        help_text="Main topics covered in the session",
    )
    techniques_used = models.TextField(
        blank=True,
        help_text="Therapeutic techniques/interventions used",
    )
    client_responses = models.TextField(
        blank=True,
        help_text="Patient's responses and reactions during session",
    )
    progress_notes = models.TextField(
        blank=True,
        help_text="Detailed progress notes from the session",
    )

    # Post-session assessment
    post_session_mood = models.PositiveIntegerField(
        null=True,
        blank=True,
        validators=[MinValueValidator(1), MaxValueValidator(10)],
        help_text="Patient's self-reported mood after session (1-10)",
    )
    outcome = models.CharField(
        max_length=30,
        choices=OUTCOME_CHOICES,
        blank=True,
        help_text="Session outcome assessment",
    )

    # Risk assessment (especially for mental health)
    risk_assessment = models.TextField(
        blank=True,
        help_text="Risk assessment notes (suicide, self-harm, harm to others)",
    )
    risk_level = models.CharField(
        max_length=20,
        choices=[
            ("NONE", "No Risk"),
            ("LOW", "Low Risk"),
            ("MODERATE", "Moderate Risk"),
            ("HIGH", "High Risk"),
            ("IMMINENT", "Imminent Risk"),
        ],
        default="NONE",
        help_text="Current risk level assessment",
    )
    safety_plan = models.TextField(
        blank=True,
        help_text="Safety plan if applicable",
    )

    # Follow-up
    follow_up_required = models.CharField(
        max_length=30,
        choices=FOLLOW_UP_CHOICES,
        default="CONTINUE",
        help_text="Recommended follow-up action",
    )
    follow_up_date = models.DateField(
        null=True,
        blank=True,
        help_text="Recommended next session date",
    )
    homework = models.TextField(
        blank=True,
        help_text="Homework or tasks assigned to patient",
    )
    goals_for_next_session = models.TextField(
        blank=True,
        help_text="Goals to work on in next session",
    )

    # Confidentiality
    confidentiality_level = models.CharField(
        max_length=20,
        choices=CONFIDENTIALITY_LEVELS,
        default="STANDARD",
        help_text="Confidentiality level for this session's notes",
    )
    is_sensitive = models.BooleanField(
        default=False,
        help_text="Contains sensitive information requiring restricted access",
    )

    # Billing
    clinic_visit = models.ForeignKey(
        "clinics.ClinicVisit",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="counselling_sessions",
        help_text="Associated clinic visit for billing",
    )
    is_billed = models.BooleanField(default=False)

    # Timestamps
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    completed_at = models.DateTimeField(null=True, blank=True)

    # Version tracking
    history = HistoricalRecords()

    class Meta:
        verbose_name = "Counselling Session"
        verbose_name_plural = "Counselling Sessions"
        ordering = ["referral", "session_sequence"]
        indexes = [
            models.Index(fields=["session_number"]),
            models.Index(fields=["referral", "session_sequence"]),
            models.Index(fields=["counsellor", "scheduled_date"]),
            models.Index(fields=["status"]),
            models.Index(fields=["scheduled_date"]),
            models.Index(fields=["is_sensitive"]),
        ]
        permissions = [
            ("view_sensitive_counselling_session", "Can view sensitive counselling sessions"),
        ]

    def __str__(self):
        return f"{self.session_number} - Session {self.session_sequence}"

    def save(self, *args, **kwargs):
        """Override save to generate session number and inherit sensitivity."""
        # Generate session number only on creation
        if not self.pk:
            if not self.session_number:
                self.session_number = generate_session_number()
        else:
            # Prevent modifying session number after creation
            if self.pk:
                original = CounsellingSession.objects.filter(pk=self.pk).values_list('session_number', flat=True).first()
                if original and self.session_number != original:
                    self.session_number = original

        # Inherit sensitivity from referral
        if self.referral and self.referral.is_sensitive:
            self.is_sensitive = True
            self.confidentiality_level = "HIGHLY_RESTRICTED"

        # Set session sequence if not set
        if not self.pk and not self._state.adding:
            pass  # Updating existing
        elif not self.session_sequence or self.session_sequence == 0:
            # Get the next session sequence for this referral
            max_sequence = (
                CounsellingSession.objects.filter(referral=self.referral)
                .aggregate(max_seq=models.Max("session_sequence"))
                .get("max_seq") or 0
            )
            self.session_sequence = max_sequence + 1

        super().save(*args, **kwargs)

    def complete(self, user=None):
        """
        Mark session as completed and update referral.

        Args:
            user: The user completing the session
        """
        if self.status == "COMPLETED":
            raise ValidationError("Session is already completed")

        self.status = "COMPLETED"
        self.completed_at = timezone.now()

        if not self.actual_date:
            self.actual_date = date.today()

        self.save()

        # Update referral session count
        self.referral.sessions_completed = CounsellingSession.objects.filter(
            referral=self.referral,
            status="COMPLETED",
        ).count()

        # Check if all sessions completed
        if self.referral.sessions_completed >= self.referral.total_sessions:
            if self.referral.status == "IN_PROGRESS":
                self.referral.status = "COMPLETED"
                self.referral.completed_at = timezone.now()
                if user:
                    self.referral.completed_by = user

        self.referral.save()

    @property
    def mood_improvement(self):
        """Calculate mood improvement from pre to post session."""
        if self.pre_session_mood and self.post_session_mood:
            return self.post_session_mood - self.pre_session_mood
        return None

    @property
    def is_overdue(self):
        """Check if scheduled session is overdue."""
        if self.status in ["COMPLETED", "CANCELLED", "NO_SHOW"]:
            return False
        return self.scheduled_date < date.today()
