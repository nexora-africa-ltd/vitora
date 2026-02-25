"""
Social Work models for Vitora HMIS.

This module contains all social work-related models including:
- SocialWorkReferral: Referral orders from clinical encounters
- SocialWorkCase: Case management with assessments and interventions
- CaseNote: Progress notes for ongoing cases
- SocialWorkIntervention: Specific interventions applied

All models follow TDD approach and Kenya healthcare requirements.
GBV cases have enhanced privacy protection.
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


def generate_sw_referral_number():
    """
    Generate a unique Social Work Referral Number.

    Format: SW-YYYYMMDD-XXXX
    Where XXXX is a 4-digit sequential number for the day.

    Returns:
        str: A unique social work referral number string
    """
    today = datetime.now().strftime("%Y%m%d")
    prefix = f"SW-{today}-"

    # Get the SocialWorkReferral model via app registry to avoid circular imports
    SocialWorkReferral = apps.get_model("social_work", "SocialWorkReferral")

    # Find the highest referral number for today
    latest_referral = (
        SocialWorkReferral.objects.filter(referral_number__startswith=prefix)
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


def generate_case_number():
    """
    Generate a unique Social Work Case Number.

    Format: SWC-YYYYMMDD-XXXX
    Where XXXX is a 4-digit sequential number for the day.

    Returns:
        str: A unique social work case number string
    """
    today = datetime.now().strftime("%Y%m%d")
    prefix = f"SWC-{today}-"

    # Get the SocialWorkCase model via app registry to avoid circular imports
    SocialWorkCase = apps.get_model("social_work", "SocialWorkCase")

    # Find the highest case number for today
    latest_case = (
        SocialWorkCase.objects.filter(case_number__startswith=prefix)
        .order_by("-case_number")
        .first()
    )

    if latest_case:
        # Extract the sequence number and increment
        last_sequence = int(latest_case.case_number.split("-")[-1])
        sequence = last_sequence + 1
    else:
        # First case of the day
        sequence = 1

    return f"{prefix}{sequence:04d}"


class SocialWorkReferral(HistoryMixin, models.Model):
    """
    Social Work referral from a clinical encounter.

    Represents a social work referral made by a clinician for a patient,
    tracking referral reason, urgency, and assignment to social worker.
    """

    REFERRAL_STATUS = [
        ("DRAFT", "Draft"),
        ("PENDING", "Pending Review"),
        ("ACCEPTED", "Accepted"),
        ("IN_PROGRESS", "In Progress"),
        ("COMPLETED", "Completed"),
        ("CANCELLED", "Cancelled"),
        ("REFERRED_OUT", "Referred to External Agency"),
    ]

    URGENCY_LEVELS = [
        ("ROUTINE", "Routine"),
        ("URGENT", "Urgent (within 24 hours)"),
        ("EMERGENCY", "Emergency (immediate)"),
    ]

    REFERRAL_REASONS = [
        ("GBV", "Gender-Based Violence"),
        ("CHILD_ABUSE", "Child Abuse/Neglect"),
        ("CHILD_PROTECTION", "Child Protection"),
        ("ELDER_ABUSE", "Elder Abuse"),
        ("MENTAL_HEALTH", "Mental Health Support"),
        ("SUBSTANCE_ABUSE", "Substance Abuse"),
        ("FINANCIAL_HARDSHIP", "Financial Hardship"),
        ("HOUSING", "Housing Assistance"),
        ("DISCHARGE_PLANNING", "Discharge Planning"),
        ("GRIEF_BEREAVEMENT", "Grief and Bereavement"),
        ("FAMILY_CONFLICT", "Family Conflict"),
        ("CAREGIVER_SUPPORT", "Caregiver Support"),
        ("CHRONIC_ILLNESS", "Chronic Illness Support"),
        ("DISABILITY_SUPPORT", "Disability Support"),
        ("HIV_SUPPORT", "HIV/AIDS Support"),
        ("PREGNANCY_SUPPORT", "Pregnancy/MCH Support"),
        ("REFUGEE_ASYLUM", "Refugee/Asylum Seeker Support"),
        ("HUMAN_TRAFFICKING", "Human Trafficking"),
        ("LEGAL_ASSISTANCE", "Legal Assistance"),
        ("OTHER", "Other"),
    ]

    # GBV/sensitive case types requiring enhanced privacy
    SENSITIVE_REASONS = ["GBV", "CHILD_ABUSE", "CHILD_PROTECTION", "ELDER_ABUSE", "HUMAN_TRAFFICKING"]

    # Valid status transitions
    STATUS_TRANSITIONS = {
        "DRAFT": ["PENDING", "CANCELLED"],
        "PENDING": ["ACCEPTED", "CANCELLED", "REFERRED_OUT"],
        "ACCEPTED": ["IN_PROGRESS", "CANCELLED", "REFERRED_OUT"],
        "IN_PROGRESS": ["COMPLETED", "CANCELLED", "REFERRED_OUT"],
        "COMPLETED": [],
        "CANCELLED": [],
        "REFERRED_OUT": [],
    }

    # Identity - format: SW-YYYYMMDD-XXXX
    referral_number = models.CharField(max_length=30, unique=True, editable=False)

    # Relationships
    patient = models.ForeignKey(
        "patients.Patient",
        on_delete=models.PROTECT,
        related_name="social_work_referrals",
    )
    encounter = models.ForeignKey(
        "encounters.Encounter",
        on_delete=models.PROTECT,
        related_name="social_work_referrals",
        null=True,
        blank=True,
        help_text="Source encounter (optional for direct referrals)",
    )
    referred_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="sw_referrals_made",
        help_text="Clinician who made the referral",
    )
    assigned_worker = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="sw_referrals_assigned",
        help_text="Social worker assigned to this referral",
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
        help_text="Clinical background and context for referral",
    )
    presenting_issues = models.TextField(
        help_text="Current issues/concerns requiring social work intervention",
    )
    specific_requests = models.TextField(
        blank=True,
        help_text="Specific actions or assessments requested",
    )
    risk_factors = models.TextField(
        blank=True,
        help_text="Identified risk factors or safety concerns",
    )

    # Status tracking
    status = models.CharField(max_length=20, choices=REFERRAL_STATUS, default="DRAFT")
    status_changed_at = models.DateTimeField(auto_now=True)
    status_changed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="sw_status_changes",
    )

    # Privacy/Sensitivity
    is_sensitive = models.BooleanField(
        default=False,
        help_text="Enhanced privacy (auto-set for GBV/abuse cases)",
    )
    confidentiality_notes = models.TextField(
        blank=True,
        help_text="Special confidentiality requirements",
    )

    # External referral (if referred out)
    external_agency = models.CharField(
        max_length=200,
        blank=True,
        help_text="External agency name if referred out",
    )
    external_contact = models.CharField(
        max_length=200,
        blank=True,
        help_text="External contact person/details",
    )

    # Clinic queue integration
    clinic_visit = models.ForeignKey(
        "clinics.ClinicVisit",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="sw_referrals",
        help_text="Linked clinic visit for queue management",
    )

    # Timestamps
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    accepted_at = models.DateTimeField(null=True, blank=True)
    completed_at = models.DateTimeField(null=True, blank=True)

    # Version tracking
    history = HistoricalRecords()

    class Meta:
        verbose_name = "Social Work Referral"
        verbose_name_plural = "Social Work Referrals"
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["referral_number"]),
            models.Index(fields=["patient"]),
            models.Index(fields=["status"]),
            models.Index(fields=["urgency"]),
            models.Index(fields=["reason"]),
            models.Index(fields=["assigned_worker"]),
            models.Index(fields=["is_sensitive"]),
            models.Index(fields=["created_at"]),
        ]
        permissions = [
            ("accept_sw_referral", "Can accept social work referrals"),
            ("assign_social_worker", "Can assign social workers to referrals"),
            ("view_sensitive_sw_referral", "Can view sensitive SW referrals (GBV, abuse)"),
        ]

    def __str__(self):
        return f"{self.referral_number} - {self.patient}"

    def save(self, *args, **kwargs):
        """Override save to auto-generate referral number and set sensitivity."""
        if not self.pk:
            # New instance - generate referral number
            if not self.referral_number:
                self.referral_number = generate_sw_referral_number()

            # Auto-set sensitivity for GBV/abuse cases
            if self.reason in self.SENSITIVE_REASONS:
                self.is_sensitive = True
                # Also mark patient record as sensitive
                if self.patient and not self.patient.is_sensitive:
                    self.patient.is_sensitive = True
                    self.patient.save(update_fields=["is_sensitive"])
        else:
            # Existing instance - prevent referral_number modification
            try:
                original = SocialWorkReferral.objects.get(pk=self.pk)
                if original.referral_number:
                    self.referral_number = original.referral_number
            except SocialWorkReferral.DoesNotExist:
                pass

        super().save(*args, **kwargs)

    def update_status(self, new_status, user=None):
        """
        Update referral status with validation.

        Args:
            new_status: New status value
            user: User making the change (for audit trail)

        Raises:
            ValidationError: If status transition is invalid
        """
        if new_status not in dict(self.REFERRAL_STATUS):
            raise ValidationError(f"Invalid status: {new_status}")

        valid_transitions = self.STATUS_TRANSITIONS.get(self.status, [])
        if new_status not in valid_transitions:
            raise ValidationError(f"Cannot transition from {self.status} to {new_status}")

        self.status = new_status
        self.status_changed_by = user
        self.status_changed_at = timezone.now()

        if new_status == "ACCEPTED":
            self.accepted_at = timezone.now()
        elif new_status == "COMPLETED":
            self.completed_at = timezone.now()

        self.save()

    @property
    def is_gbv_case(self):
        """Check if this is a GBV-related referral."""
        return self.reason == "GBV"

    @property
    def requires_immediate_attention(self):
        """Check if referral requires immediate attention."""
        return self.urgency == "EMERGENCY" or self.reason in ["GBV", "CHILD_ABUSE", "HUMAN_TRAFFICKING"]


class SocialWorkCase(HistoryMixin, models.Model):
    """
    Social Work Case for ongoing case management.

    Represents an ongoing social work case with assessments,
    interventions, and outcomes tracking.
    """

    CASE_STATUS = [
        ("OPEN", "Open"),
        ("IN_PROGRESS", "In Progress"),
        ("ON_HOLD", "On Hold"),
        ("CLOSED_RESOLVED", "Closed - Resolved"),
        ("CLOSED_TRANSFERRED", "Closed - Transferred"),
        ("CLOSED_LOST_CONTACT", "Closed - Lost Contact"),
        ("CLOSED_DECEASED", "Closed - Deceased"),
    ]

    CASE_TYPES = [
        ("GBV", "Gender-Based Violence"),
        ("CHILD_PROTECTION", "Child Protection"),
        ("ELDER_CARE", "Elder Care"),
        ("MENTAL_HEALTH", "Mental Health"),
        ("SUBSTANCE_ABUSE", "Substance Abuse"),
        ("FINANCIAL", "Financial/Material Support"),
        ("DISCHARGE", "Discharge Planning"),
        ("GRIEF", "Grief/Bereavement"),
        ("FAMILY", "Family Support"),
        ("CHRONIC_ILLNESS", "Chronic Illness"),
        ("HIV_SUPPORT", "HIV/AIDS Support"),
        ("DISABILITY", "Disability Support"),
        ("GENERAL", "General Support"),
    ]

    RISK_LEVELS = [
        ("LOW", "Low Risk"),
        ("MODERATE", "Moderate Risk"),
        ("HIGH", "High Risk"),
        ("CRITICAL", "Critical Risk"),
    ]

    PRIORITY_LEVELS = [
        ("LOW", "Low"),
        ("MEDIUM", "Medium"),
        ("HIGH", "High"),
        ("URGENT", "Urgent"),
    ]

    # Sensitive case types requiring enhanced privacy
    SENSITIVE_TYPES = ["GBV", "CHILD_PROTECTION", "ELDER_CARE"]

    # Identity - format: SWC-YYYYMMDD-XXXX
    case_number = models.CharField(max_length=30, unique=True, editable=False)

    # Relationships
    patient = models.ForeignKey(
        "patients.Patient",
        on_delete=models.PROTECT,
        related_name="social_work_cases",
    )
    referral = models.ForeignKey(
        SocialWorkReferral,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="cases",
        help_text="Originating referral (if any)",
    )
    assigned_worker = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="sw_cases_assigned",
        help_text="Primary social worker assigned",
    )
    secondary_worker = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="sw_cases_secondary",
        help_text="Secondary/backup social worker",
    )
    supervisor = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="sw_cases_supervised",
        help_text="Supervising social worker",
    )

    # Case details
    case_type = models.CharField(max_length=30, choices=CASE_TYPES)
    title = models.CharField(
        max_length=200,
        help_text="Brief case title/description",
    )
    presenting_problem = models.TextField(
        help_text="Detailed description of presenting problem",
    )

    # Assessment
    assessment = models.TextField(
        blank=True,
        help_text="Social work assessment findings",
    )
    psychosocial_history = models.TextField(
        blank=True,
        help_text="Patient's psychosocial history",
    )
    family_composition = models.TextField(
        blank=True,
        help_text="Family structure and dynamics",
    )
    support_systems = models.TextField(
        blank=True,
        help_text="Available support systems (family, community, etc.)",
    )
    strengths = models.TextField(
        blank=True,
        help_text="Patient/family strengths identified",
    )
    barriers = models.TextField(
        blank=True,
        help_text="Barriers to achieving goals",
    )
    safety_assessment = models.TextField(
        blank=True,
        help_text="Safety assessment findings (especially for GBV/abuse)",
    )

    # Risk and priority
    risk_level = models.CharField(
        max_length=20,
        choices=RISK_LEVELS,
        default="LOW",
    )
    priority = models.CharField(
        max_length=20,
        choices=PRIORITY_LEVELS,
        default="MEDIUM",
    )

    # Goals and planning
    goals = models.TextField(
        help_text="Case goals and objectives",
    )
    intervention_plan = models.TextField(
        blank=True,
        help_text="Planned interventions and action steps",
    )

    # Outcome
    outcome = models.TextField(
        blank=True,
        help_text="Case outcome summary",
    )
    outcome_rating = models.CharField(
        max_length=20,
        blank=True,
        choices=[
            ("FULLY_ACHIEVED", "Goals Fully Achieved"),
            ("PARTIALLY_ACHIEVED", "Goals Partially Achieved"),
            ("NOT_ACHIEVED", "Goals Not Achieved"),
            ("ONGOING", "Ongoing Progress"),
        ],
    )

    # Status tracking
    status = models.CharField(max_length=30, choices=CASE_STATUS, default="OPEN")
    status_changed_at = models.DateTimeField(auto_now=True)
    status_changed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="sw_case_status_changes",
    )

    # Privacy/Sensitivity
    is_sensitive = models.BooleanField(
        default=False,
        help_text="Enhanced privacy (auto-set for GBV/abuse cases)",
    )
    confidentiality_level = models.CharField(
        max_length=20,
        default="STANDARD",
        choices=[
            ("STANDARD", "Standard"),
            ("RESTRICTED", "Restricted (need-to-know)"),
            ("HIGHLY_RESTRICTED", "Highly Restricted (supervisor approval)"),
        ],
    )
    access_restricted_to = models.ManyToManyField(
        settings.AUTH_USER_MODEL,
        blank=True,
        related_name="restricted_sw_cases",
        help_text="Users who can access this case (if restricted)",
    )

    # Follow-up
    next_review_date = models.DateField(
        null=True,
        blank=True,
        help_text="Next scheduled case review date",
    )
    follow_up_frequency = models.CharField(
        max_length=50,
        blank=True,
        help_text="Recommended follow-up frequency (e.g., weekly, monthly)",
    )

    # Timestamps
    opened_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    closed_at = models.DateTimeField(null=True, blank=True)

    # Version tracking
    history = HistoricalRecords()

    class Meta:
        verbose_name = "Social Work Case"
        verbose_name_plural = "Social Work Cases"
        ordering = ["-opened_at"]
        indexes = [
            models.Index(fields=["case_number"]),
            models.Index(fields=["patient"]),
            models.Index(fields=["status"]),
            models.Index(fields=["case_type"]),
            models.Index(fields=["risk_level"]),
            models.Index(fields=["assigned_worker"]),
            models.Index(fields=["is_sensitive"]),
            models.Index(fields=["opened_at"]),
            models.Index(fields=["next_review_date"]),
        ]
        permissions = [
            ("close_sw_case", "Can close social work cases"),
            ("view_sensitive_sw_case", "Can view sensitive SW cases (GBV, abuse)"),
            ("supervise_sw_case", "Can supervise social work cases"),
        ]

    def __str__(self):
        return f"{self.case_number} - {self.patient}"

    def save(self, *args, **kwargs):
        """Override save to auto-generate case number and set sensitivity."""
        if not self.pk:
            # New instance - generate case number
            if not self.case_number:
                self.case_number = generate_case_number()

            # Auto-set sensitivity for GBV/abuse cases
            if self.case_type in self.SENSITIVE_TYPES:
                self.is_sensitive = True
                self.confidentiality_level = "RESTRICTED"
                # Also mark patient record as sensitive
                if self.patient and not self.patient.is_sensitive:
                    self.patient.is_sensitive = True
                    self.patient.save(update_fields=["is_sensitive"])
        else:
            # Existing instance - prevent case_number modification
            try:
                original = SocialWorkCase.objects.get(pk=self.pk)
                if original.case_number:
                    self.case_number = original.case_number
            except SocialWorkCase.DoesNotExist:
                pass

        super().save(*args, **kwargs)

    def update_status(self, new_status, user=None):
        """
        Update case status with validation.

        Args:
            new_status: New status value
            user: User making the change (for audit trail)

        Raises:
            ValidationError: If status is invalid
        """
        if new_status not in dict(self.CASE_STATUS):
            raise ValidationError(f"Invalid status: {new_status}")

        self.status = new_status
        self.status_changed_by = user
        self.status_changed_at = timezone.now()

        if new_status.startswith("CLOSED"):
            self.closed_at = timezone.now()

        self.save()

    def close_case(self, outcome, outcome_rating, user=None, status="CLOSED_RESOLVED"):
        """
        Close the case with outcome documentation.

        Args:
            outcome: Outcome summary text
            outcome_rating: One of FULLY_ACHIEVED, PARTIALLY_ACHIEVED, NOT_ACHIEVED, ONGOING
            user: User closing the case
            status: Closure status (default: CLOSED_RESOLVED)
        """
        self.outcome = outcome
        self.outcome_rating = outcome_rating
        self.update_status(status, user=user)

    @property
    def is_open(self):
        """Check if case is still open."""
        return self.status in ["OPEN", "IN_PROGRESS", "ON_HOLD"]

    @property
    def days_open(self):
        """Return number of days case has been open."""
        end_date = self.closed_at or timezone.now()
        return (end_date - self.opened_at).days

    @property
    def is_overdue_for_review(self):
        """Check if case is overdue for review."""
        if not self.next_review_date:
            return False
        return date.today() > self.next_review_date


class CaseNote(models.Model):
    """
    Progress notes for a social work case.

    Records ongoing interactions, sessions, and progress updates.
    """

    NOTE_TYPES = [
        ("CONTACT", "Client Contact"),
        ("ASSESSMENT", "Assessment Note"),
        ("INTERVENTION", "Intervention Note"),
        ("PROGRESS", "Progress Note"),
        ("CONSULTATION", "Consultation Note"),
        ("COLLATERAL", "Collateral Contact"),
        ("SUPERVISION", "Supervision Note"),
        ("DISCHARGE", "Discharge Note"),
        ("CLOSURE", "Case Closure Note"),
    ]

    CONTACT_METHODS = [
        ("IN_PERSON", "In Person"),
        ("PHONE", "Phone Call"),
        ("VIDEO", "Video Call"),
        ("HOME_VISIT", "Home Visit"),
        ("HOSPITAL", "Hospital Visit"),
        ("EMAIL", "Email"),
        ("SMS", "SMS/Text"),
        ("OTHER", "Other"),
    ]

    # Relationships
    case = models.ForeignKey(
        SocialWorkCase,
        on_delete=models.CASCADE,
        related_name="notes",
    )
    author = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="sw_notes_authored",
    )

    # Note details
    note_type = models.CharField(max_length=20, choices=NOTE_TYPES)
    contact_date = models.DateField(default=date.today)
    contact_method = models.CharField(
        max_length=20,
        choices=CONTACT_METHODS,
        default="IN_PERSON",
    )
    duration_minutes = models.PositiveIntegerField(
        null=True,
        blank=True,
        validators=[MinValueValidator(1), MaxValueValidator(480)],
        help_text="Duration of contact in minutes",
    )

    # Content
    subject = models.CharField(max_length=200, help_text="Note subject/title")
    content = models.TextField(help_text="Note content")
    participant_names = models.TextField(
        blank=True,
        help_text="Names of other participants (if any)",
    )

    # Follow-up
    follow_up_required = models.BooleanField(default=False)
    follow_up_actions = models.TextField(
        blank=True,
        help_text="Required follow-up actions",
    )
    follow_up_date = models.DateField(
        null=True,
        blank=True,
        help_text="Target date for follow-up",
    )

    # Privacy
    is_confidential = models.BooleanField(
        default=False,
        help_text="Restricts visibility to case team only",
    )

    # Timestamps
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "Case Note"
        verbose_name_plural = "Case Notes"
        ordering = ["-contact_date", "-created_at"]
        indexes = [
            models.Index(fields=["case"]),
            models.Index(fields=["note_type"]),
            models.Index(fields=["contact_date"]),
            models.Index(fields=["author"]),
        ]

    def __str__(self):
        return f"{self.note_type} - {self.subject} ({self.contact_date})"


class SocialWorkIntervention(models.Model):
    """
    Specific intervention applied in a social work case.

    Tracks individual interventions with their status and outcome.
    """

    INTERVENTION_TYPES = [
        ("COUNSELLING", "Counselling"),
        ("CRISIS_INTERVENTION", "Crisis Intervention"),
        ("SAFETY_PLANNING", "Safety Planning"),
        ("RESOURCE_LINKING", "Resource Linking/Referral"),
        ("FINANCIAL_ASSISTANCE", "Financial Assistance"),
        ("MATERIAL_SUPPORT", "Material Support (food, clothing, etc.)"),
        ("HOUSING_SUPPORT", "Housing Support"),
        ("LEGAL_ADVOCACY", "Legal Advocacy"),
        ("EDUCATIONAL_SUPPORT", "Educational Support"),
        ("VOCATIONAL_SUPPORT", "Vocational/Employment Support"),
        ("FAMILY_MEDIATION", "Family Mediation"),
        ("CHILD_PROTECTION", "Child Protection Action"),
        ("GBV_SUPPORT", "GBV Support Services"),
        ("MENTAL_HEALTH", "Mental Health Referral/Support"),
        ("SUBSTANCE_ABUSE", "Substance Abuse Referral/Support"),
        ("CAREGIVER_TRAINING", "Caregiver Training/Education"),
        ("DISCHARGE_PLANNING", "Discharge Planning"),
        ("FOLLOW_UP", "Follow-up Support"),
        ("OTHER", "Other"),
    ]

    INTERVENTION_STATUS = [
        ("PLANNED", "Planned"),
        ("IN_PROGRESS", "In Progress"),
        ("COMPLETED", "Completed"),
        ("CANCELLED", "Cancelled"),
        ("UNSUCCESSFUL", "Unsuccessful"),
    ]

    OUTCOME_RATINGS = [
        ("SUCCESSFUL", "Successful"),
        ("PARTIALLY_SUCCESSFUL", "Partially Successful"),
        ("UNSUCCESSFUL", "Unsuccessful"),
        ("PENDING", "Pending/Ongoing"),
    ]

    # Relationships
    case = models.ForeignKey(
        SocialWorkCase,
        on_delete=models.CASCADE,
        related_name="interventions",
    )
    provided_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="sw_interventions_provided",
    )

    # Intervention details
    intervention_type = models.CharField(max_length=30, choices=INTERVENTION_TYPES)
    description = models.TextField(help_text="Description of the intervention")
    objectives = models.TextField(
        blank=True,
        help_text="Specific objectives for this intervention",
    )
    activities = models.TextField(
        blank=True,
        help_text="Activities performed as part of intervention",
    )

    # Status
    status = models.CharField(
        max_length=20,
        choices=INTERVENTION_STATUS,
        default="PLANNED",
    )
    planned_date = models.DateField(
        null=True,
        blank=True,
        help_text="Planned date for intervention",
    )
    start_date = models.DateField(
        null=True,
        blank=True,
        help_text="Actual start date",
    )
    completion_date = models.DateField(
        null=True,
        blank=True,
        help_text="Completion date",
    )

    # Outcome
    outcome = models.TextField(
        blank=True,
        help_text="Outcome description",
    )
    outcome_rating = models.CharField(
        max_length=20,
        choices=OUTCOME_RATINGS,
        blank=True,
    )
    client_feedback = models.TextField(
        blank=True,
        help_text="Feedback from client/family",
    )

    # External referral (if applicable)
    external_agency = models.CharField(
        max_length=200,
        blank=True,
        help_text="External agency involved (if any)",
    )
    external_contact = models.CharField(
        max_length=200,
        blank=True,
        help_text="External contact person",
    )

    # Cost (if material/financial assistance)
    cost = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        default=Decimal("0.00"),
        help_text="Cost of intervention (if applicable)",
    )
    cost_source = models.CharField(
        max_length=100,
        blank=True,
        help_text="Source of funding (hospital fund, NGO, etc.)",
    )

    # Timestamps
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "Social Work Intervention"
        verbose_name_plural = "Social Work Interventions"
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["case"]),
            models.Index(fields=["intervention_type"]),
            models.Index(fields=["status"]),
            models.Index(fields=["planned_date"]),
        ]

    def __str__(self):
        return f"{self.get_intervention_type_display()} - {self.case.case_number}"

    def complete(self, outcome, outcome_rating):
        """
        Mark intervention as completed with outcome.

        Args:
            outcome: Outcome description
            outcome_rating: One of SUCCESSFUL, PARTIALLY_SUCCESSFUL, UNSUCCESSFUL
        """
        self.status = "COMPLETED"
        self.completion_date = date.today()
        self.outcome = outcome
        self.outcome_rating = outcome_rating
        self.save()
