"""
Occupational Therapy models for Vitora HMIS.

This module contains all occupational therapy-related models including:
- OTTreatmentType: Catalog of treatment/assessment types with pricing
- OccupationalTherapyOrder: Referral orders for OT services
- OTSession: Individual therapy sessions

All models follow TDD approach and Kenya healthcare requirements.
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


def generate_ot_order_number():
    """
    Generate a unique Occupational Therapy Order Number.

    Format: OT-YYYYMMDD-XXXX
    Where XXXX is a 4-digit sequential number for the day.

    Returns:
        str: A unique occupational therapy order number string
    """
    today = datetime.now().strftime("%Y%m%d")
    prefix = f"OT-{today}-"

    # Get the OccupationalTherapyOrder model via the app registry to avoid circular imports
    OccupationalTherapyOrder = apps.get_model("occupational_therapy", "OccupationalTherapyOrder")

    # Find the highest order number for today
    latest_order = (
        OccupationalTherapyOrder.objects.filter(order_number__startswith=prefix)
        .order_by("-order_number")
        .first()
    )

    if latest_order:
        # Extract the sequence number and increment
        last_sequence = int(latest_order.order_number.split("-")[-1])
        sequence = last_sequence + 1
    else:
        # First order of the day
        sequence = 1

    return f"{prefix}{sequence:04d}"


class OTTreatmentType(models.Model):
    """
    Catalog of occupational therapy treatment/assessment types.

    Stores information about available OT services including
    category, typical duration, pricing, and SHA claimability.
    """

    CATEGORY_CHOICES = [
        ("ADL_TRAINING", "Activities of Daily Living Training"),
        ("COGNITIVE_REHAB", "Cognitive Rehabilitation"),
        ("SENSORY_INTEGRATION", "Sensory Integration"),
        ("HAND_THERAPY", "Hand Therapy"),
        ("PEDIATRIC", "Pediatric OT"),
        ("WORKPLACE_REHAB", "Workplace Rehabilitation"),
        ("MENTAL_HEALTH", "Mental Health OT"),
        ("NEUROLOGICAL", "Neurological Rehabilitation"),
        ("GERIATRIC", "Geriatric OT"),
        ("ASSISTIVE_TECH", "Assistive Technology Assessment"),
        ("HOME_MODIFICATION", "Home Modification Assessment"),
        ("SPLINTING", "Splinting/Orthotics"),
        ("OTHER", "Other"),
    ]

    # Identity
    code = models.CharField(
        max_length=50,
        unique=True,
        help_text="Unique treatment type code (e.g., OT-ADL-001)",
    )
    name = models.CharField(max_length=200, help_text="Full treatment type name")
    description = models.TextField(blank=True, help_text="Detailed description of treatment")
    category = models.CharField(
        max_length=30,
        choices=CATEGORY_CHOICES,
        default="ADL_TRAINING",
    )

    # Session parameters
    typical_duration_minutes = models.PositiveIntegerField(
        default=45,
        validators=[MinValueValidator(5), MaxValueValidator(240)],
        help_text="Typical session duration in minutes",
    )
    recommended_sessions = models.PositiveIntegerField(
        default=8,
        validators=[MinValueValidator(1), MaxValueValidator(52)],
        help_text="Recommended number of sessions",
    )
    recommended_frequency = models.CharField(
        max_length=50,
        default="2x per week",
        help_text="Recommended session frequency (e.g., '2x per week', 'weekly')",
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

    # Requirements
    requires_equipment = models.BooleanField(default=False)
    equipment_needed = models.TextField(blank=True, help_text="Equipment required for treatment")
    contraindications = models.TextField(blank=True, help_text="Treatment contraindications")
    precautions = models.TextField(blank=True, help_text="Treatment precautions")

    # Availability
    is_active = models.BooleanField(default=True)

    # Timestamps
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "OT Treatment Type"
        verbose_name_plural = "OT Treatment Types"
        ordering = ["category", "name"]
        indexes = [
            models.Index(fields=["code"]),
            models.Index(fields=["category"]),
            models.Index(fields=["is_active"]),
        ]

    def __str__(self):
        return f"{self.code} - {self.name}"


class OccupationalTherapyOrder(HistoryMixin, models.Model):
    """
    Occupational Therapy referral order from clinical encounter.

    Represents an OT referral made by a clinician for a patient,
    tracking assessment type, treatment goals, scheduling, and progress.
    """

    ORDER_STATUS = [
        ("DRAFT", "Draft"),
        ("PENDING", "Pending Approval"),
        ("APPROVED", "Approved"),
        ("IN_PROGRESS", "In Progress"),
        ("COMPLETED", "Completed"),
        ("CANCELLED", "Cancelled"),
        ("ON_HOLD", "On Hold"),
    ]

    PRIORITY_LEVELS = [
        ("ROUTINE", "Routine"),
        ("URGENT", "Urgent"),
        ("STAT", "STAT (Immediate)"),
    ]

    ASSESSMENT_TYPES = [
        ("INITIAL", "Initial Assessment"),
        ("FOLLOW_UP", "Follow-up Assessment"),
        ("FUNCTIONAL", "Functional Capacity Evaluation"),
        ("COGNITIVE", "Cognitive Assessment"),
        ("SENSORY", "Sensory Processing Assessment"),
        ("ADL", "ADL Assessment"),
        ("HOME", "Home Assessment"),
        ("WORK", "Workplace Assessment"),
        ("PEDIATRIC", "Pediatric Developmental Assessment"),
        ("HAND", "Hand Function Assessment"),
        ("OTHER", "Other"),
    ]

    REFERRAL_REASONS = [
        ("POST_INJURY", "Post-Injury Rehabilitation"),
        ("POST_SURGERY", "Post-Surgical Rehabilitation"),
        ("STROKE_REHAB", "Stroke Rehabilitation"),
        ("DEVELOPMENTAL", "Developmental Delay"),
        ("COGNITIVE_DECLINE", "Cognitive Decline"),
        ("ADL_SUPPORT", "ADL Support/Training"),
        ("WORKPLACE_INJURY", "Workplace Injury"),
        ("HAND_INJURY", "Hand/Upper Limb Injury"),
        ("MENTAL_HEALTH", "Mental Health Support"),
        ("SENSORY_ISSUES", "Sensory Processing Issues"),
        ("ASSISTIVE_DEVICE", "Assistive Device Assessment"),
        ("HOME_MODIFICATION", "Home Modification Assessment"),
        ("PEDIATRIC", "Pediatric Development"),
        ("GERIATRIC", "Geriatric Care"),
        ("OTHER", "Other"),
    ]

    # Valid status transitions
    STATUS_TRANSITIONS = {
        "DRAFT": ["PENDING", "CANCELLED"],
        "PENDING": ["APPROVED", "CANCELLED"],
        "APPROVED": ["IN_PROGRESS", "CANCELLED", "ON_HOLD"],
        "IN_PROGRESS": ["COMPLETED", "CANCELLED", "ON_HOLD"],
        "ON_HOLD": ["IN_PROGRESS", "CANCELLED"],
        "COMPLETED": [],
        "CANCELLED": [],
    }

    # Identity - format: OT-YYYYMMDD-XXXX
    order_number = models.CharField(max_length=30, unique=True, editable=False)

    # Tenant scoping
    organization = models.ForeignKey(
        "core.Organization",
        on_delete=models.CASCADE,
        related_name="ot_orders",
        null=True,
        blank=True,
        help_text="Owning organization (auto-set from facility).",
    )
    facility = models.ForeignKey(
        "core.Facility",
        on_delete=models.CASCADE,
        related_name="ot_orders",
        null=True,
        blank=True,
        help_text="Facility where order was created.",
    )

    # Relationships
    patient = models.ForeignKey(
        "patients.Patient",
        on_delete=models.PROTECT,
        related_name="ot_orders",
    )
    encounter = models.ForeignKey(
        "encounters.Encounter",
        on_delete=models.PROTECT,
        related_name="ot_orders",
    )
    treatment_type = models.ForeignKey(
        OTTreatmentType,
        on_delete=models.PROTECT,
        related_name="orders",
    )
    ordered_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="ot_orders_placed",
    )
    assigned_therapist = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="ot_orders_assigned",
        help_text="Occupational therapist assigned to this order",
    )

    # Clinical details
    assessment_type = models.CharField(
        max_length=30,
        choices=ASSESSMENT_TYPES,
        default="INITIAL",
        help_text="Type of OT assessment to perform",
    )
    referral_reason = models.CharField(
        max_length=30,
        choices=REFERRAL_REASONS,
        default="OTHER",
    )
    clinical_indication = models.TextField(help_text="Clinical reason for OT referral")
    relevant_history = models.TextField(
        blank=True,
        help_text="Relevant medical/surgical/developmental history",
    )
    diagnosis = models.TextField(blank=True, help_text="Working diagnosis")
    precautions = models.TextField(blank=True, help_text="Patient-specific precautions")
    contraindications = models.TextField(
        blank=True,
        help_text="Patient-specific contraindications",
    )

    # Treatment goals
    treatment_goals = models.TextField(
        help_text="Specific, measurable treatment goals",
    )
    short_term_goals = models.TextField(
        blank=True,
        help_text="Goals to achieve within 2-4 weeks",
    )
    long_term_goals = models.TextField(
        blank=True,
        help_text="Goals to achieve by end of treatment",
    )
    functional_limitations = models.TextField(
        blank=True,
        help_text="Current functional limitations to address",
    )

    # Treatment plan
    total_sessions = models.PositiveIntegerField(
        default=8,
        validators=[MinValueValidator(1), MaxValueValidator(52)],
        help_text="Total number of sessions prescribed",
    )
    sessions_completed = models.PositiveIntegerField(
        default=0,
        help_text="Number of sessions completed",
    )
    frequency = models.CharField(
        max_length=50,
        default="2x per week",
        help_text="Treatment frequency (e.g., '2x per week', 'weekly')",
    )

    # Status tracking
    priority = models.CharField(max_length=20, choices=PRIORITY_LEVELS, default="ROUTINE")
    status = models.CharField(max_length=20, choices=ORDER_STATUS, default="DRAFT")
    status_changed_at = models.DateTimeField(auto_now=True)
    status_changed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="ot_status_changes",
    )

    # Scheduling
    start_date = models.DateField(null=True, blank=True, help_text="Treatment start date")
    expected_end_date = models.DateField(
        null=True,
        blank=True,
        help_text="Expected treatment end date",
    )

    # Clinic queue integration
    clinic_visit = models.ForeignKey(
        "clinics.ClinicVisit",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="ot_orders",
        help_text="Linked clinic visit for queue management",
    )

    # Billing
    total_cost = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        default=Decimal("0.00"),
    )
    is_paid = models.BooleanField(default=False)
    invoice = models.ForeignKey(
        "billing.Invoice",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="ot_orders",
        help_text="Linked billing invoice",
    )

    # Timestamps
    ordered_at = models.DateTimeField(auto_now_add=True)
    completed_at = models.DateTimeField(null=True, blank=True)

    # Version tracking
    history = HistoricalRecords()

    class Meta:
        verbose_name = "Occupational Therapy Order"
        verbose_name_plural = "Occupational Therapy Orders"
        ordering = ["-ordered_at"]
        indexes = [
            models.Index(fields=["order_number"]),
            models.Index(fields=["patient"]),
            models.Index(fields=["status"]),
            models.Index(fields=["ordered_at"]),
            models.Index(fields=["priority"]),
            models.Index(fields=["assigned_therapist"]),
            models.Index(fields=["assessment_type"]),
        ]
        permissions = [
            ("approve_ot_order", "Can approve occupational therapy orders"),
            ("assign_ot_therapist", "Can assign occupational therapist to orders"),
        ]

    def __str__(self):
        return f"{self.order_number} - {self.patient}"

    def save(self, *args, **kwargs):
        """Override save to auto-generate order number and calculate costs."""
        from hmis.apps.core.mixins import resolve_tenant_from_related

        resolve_tenant_from_related(self)

        if not self.pk:
            # New instance - generate order number
            if not self.order_number:
                self.order_number = generate_ot_order_number()
        else:
            # Existing instance - prevent order_number modification
            try:
                original = OccupationalTherapyOrder.objects.get(pk=self.pk)
                if original.order_number:
                    self.order_number = original.order_number
            except OccupationalTherapyOrder.DoesNotExist:
                pass

        # Calculate total cost based on sessions and treatment type
        if self.treatment_type_id:
            self.total_cost = self.treatment_type.cost_per_session * self.total_sessions

        super().save(*args, **kwargs)

    def calculate_total_cost(self):
        """
        Calculate total cost from treatment type and sessions.

        Returns:
            Decimal: Total cost of all sessions
        """
        if self.treatment_type:
            self.total_cost = self.treatment_type.cost_per_session * self.total_sessions
            self.save(update_fields=["total_cost"])
        return self.total_cost

    def update_status(self, new_status, user=None):
        """
        Update order status with validation.

        Args:
            new_status: New status value
            user: User making the change (for audit trail)

        Raises:
            ValidationError: If status transition is invalid
        """
        if new_status not in dict(self.ORDER_STATUS):
            raise ValidationError(f"Invalid status: {new_status}")

        valid_transitions = self.STATUS_TRANSITIONS.get(self.status, [])
        if new_status not in valid_transitions:
            raise ValidationError(f"Cannot transition from {self.status} to {new_status}")

        self.status = new_status
        self.status_changed_by = user
        self.status_changed_at = timezone.now()

        if new_status == "COMPLETED":
            self.completed_at = timezone.now()

        self.save()

    def update_sessions_completed(self):
        """Update sessions_completed count from related sessions."""
        self.sessions_completed = self.sessions.filter(status="COMPLETED").count()
        self.save(update_fields=["sessions_completed"])

        # Auto-complete order if all sessions done
        if self.sessions_completed >= self.total_sessions and self.status == "IN_PROGRESS":
            self.update_status("COMPLETED")

    @property
    def sessions_remaining(self):
        """Return number of remaining sessions."""
        return max(0, self.total_sessions - self.sessions_completed)

    @property
    def progress_percentage(self):
        """Return treatment progress as percentage."""
        if self.total_sessions == 0:
            return 0
        return round((self.sessions_completed / self.total_sessions) * 100, 1)


class OTSession(models.Model):
    """
    Individual occupational therapy session.

    Records details of each OT session including
    assessment, activities, progress, and outcomes.
    """

    SESSION_STATUS = [
        ("SCHEDULED", "Scheduled"),
        ("IN_PROGRESS", "In Progress"),
        ("COMPLETED", "Completed"),
        ("CANCELLED", "Cancelled"),
        ("NO_SHOW", "No Show"),
        ("RESCHEDULED", "Rescheduled"),
    ]

    OUTCOME_CHOICES = [
        ("IMPROVED", "Improved"),
        ("UNCHANGED", "Unchanged"),
        ("WORSENED", "Worsened"),
        ("GOALS_MET", "Goals Met"),
        ("PARTIAL_IMPROVEMENT", "Partial Improvement"),
    ]

    INDEPENDENCE_LEVEL = [
        ("TOTAL_ASSIST", "Total Assistance (0-24%)"),
        ("MAX_ASSIST", "Maximum Assistance (25-49%)"),
        ("MOD_ASSIST", "Moderate Assistance (50-74%)"),
        ("MIN_ASSIST", "Minimum Assistance (75-99%)"),
        ("SUPERVISION", "Supervision/Setup"),
        ("MODIFIED_IND", "Modified Independence"),
        ("INDEPENDENT", "Independent"),
    ]

    # Relationships
    order = models.ForeignKey(
        OccupationalTherapyOrder,
        on_delete=models.CASCADE,
        related_name="sessions",
    )
    therapist = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="ot_sessions",
    )

    # Session identification
    session_number = models.PositiveIntegerField(help_text="Session number in treatment course")

    # Scheduling
    scheduled_date = models.DateField(help_text="Scheduled date for session")
    scheduled_time = models.TimeField(null=True, blank=True, help_text="Scheduled time")
    actual_date = models.DateField(null=True, blank=True, help_text="Actual session date")
    duration_minutes = models.PositiveIntegerField(
        null=True,
        blank=True,
        validators=[MinValueValidator(5), MaxValueValidator(240)],
        help_text="Actual session duration in minutes",
    )

    # Status
    status = models.CharField(max_length=20, choices=SESSION_STATUS, default="SCHEDULED")

    # Pre-session assessment
    pre_functional_status = models.CharField(
        max_length=20,
        choices=INDEPENDENCE_LEVEL,
        null=True,
        blank=True,
        help_text="Independence level before session",
    )
    pre_assessment_notes = models.TextField(
        blank=True,
        help_text="Pre-session assessment notes",
    )
    patient_reported_changes = models.TextField(
        blank=True,
        help_text="Changes reported by patient since last session",
    )
    patient_goals_for_session = models.TextField(
        blank=True,
        help_text="What patient wants to achieve this session",
    )

    # Session details - Activities performed
    activities_performed = models.TextField(
        blank=True,
        help_text="Therapeutic activities performed during session",
    )
    adl_activities = models.TextField(
        blank=True,
        help_text="ADL training activities (dressing, grooming, feeding, etc.)",
    )
    cognitive_exercises = models.TextField(
        blank=True,
        help_text="Cognitive rehabilitation exercises",
    )
    sensory_activities = models.TextField(
        blank=True,
        help_text="Sensory integration activities",
    )
    fine_motor_exercises = models.TextField(
        blank=True,
        help_text="Fine motor and hand therapy exercises",
    )
    gross_motor_activities = models.TextField(
        blank=True,
        help_text="Gross motor coordination activities",
    )
    adaptive_equipment_training = models.TextField(
        blank=True,
        help_text="Assistive device/adaptive equipment training",
    )
    splint_orthotics = models.TextField(
        blank=True,
        help_text="Splint/orthotic fabrication or adjustment",
    )

    # Patient response
    patient_response = models.TextField(
        blank=True,
        help_text="Patient's response to treatment activities",
    )
    patient_engagement = models.CharField(
        max_length=20,
        choices=[
            ("EXCELLENT", "Excellent"),
            ("GOOD", "Good"),
            ("FAIR", "Fair"),
            ("POOR", "Poor"),
            ("UNCOOPERATIVE", "Uncooperative"),
        ],
        null=True,
        blank=True,
        help_text="Level of patient engagement/participation",
    )

    # Post-session assessment
    post_functional_status = models.CharField(
        max_length=20,
        choices=INDEPENDENCE_LEVEL,
        null=True,
        blank=True,
        help_text="Independence level after session",
    )
    outcome = models.CharField(
        max_length=30,
        choices=OUTCOME_CHOICES,
        null=True,
        blank=True,
    )
    progress_notes = models.TextField(blank=True, help_text="Session progress notes")
    goals_addressed = models.TextField(
        blank=True,
        help_text="Which treatment goals were addressed",
    )
    goals_progress = models.TextField(
        blank=True,
        help_text="Progress toward treatment goals",
    )

    # Home program
    home_activities = models.TextField(
        blank=True,
        help_text="Home activities/exercises prescribed",
    )
    home_activity_instructions = models.TextField(
        blank=True,
        help_text="Instructions for home activities",
    )
    caregiver_education = models.TextField(
        blank=True,
        help_text="Education provided to family/caregivers",
    )
    environmental_recommendations = models.TextField(
        blank=True,
        help_text="Home/environment modification recommendations",
    )
    precautions_advised = models.TextField(
        blank=True,
        help_text="Precautions advised to patient",
    )

    # Follow-up
    follow_up_recommendations = models.TextField(blank=True, help_text="Follow-up recommendations")
    next_session_goals = models.TextField(
        blank=True,
        help_text="Goals for next session",
    )
    equipment_recommendations = models.TextField(
        blank=True,
        help_text="Adaptive equipment recommendations",
    )

    # Clinic queue integration
    clinic_visit = models.ForeignKey(
        "clinics.ClinicVisit",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="ot_sessions",
        help_text="Linked clinic visit for queue management",
    )

    # Billing
    is_billed = models.BooleanField(default=False)
    invoice_item = models.ForeignKey(
        "billing.InvoiceItem",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="ot_sessions",
    )

    # Timestamps
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    completed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        verbose_name = "OT Session"
        verbose_name_plural = "OT Sessions"
        ordering = ["order", "session_number"]
        unique_together = [["order", "session_number"]]
        indexes = [
            models.Index(fields=["order"]),
            models.Index(fields=["therapist"]),
            models.Index(fields=["scheduled_date"]),
            models.Index(fields=["status"]),
        ]

    def __str__(self):
        return f"{self.order.order_number} - Session {self.session_number}"

    def save(self, *args, **kwargs):
        """Override save to auto-set session number and update order progress."""
        if not self.pk and not self.session_number:
            # Auto-generate session number
            last_session = self.order.sessions.order_by("-session_number").first()
            self.session_number = (last_session.session_number + 1) if last_session else 1

        super().save(*args, **kwargs)

    def complete_session(self, user=None):  # noqa: ARG002
        """
        Mark session as completed and update order progress.

        Args:
            user: User completing the session (for audit trail, reserved for future use)
        """
        if self.status == "COMPLETED":
            return  # Already completed

        self.status = "COMPLETED"
        self.actual_date = self.actual_date or date.today()
        self.completed_at = timezone.now()
        self.save()

        # Update order progress
        self.order.update_sessions_completed()

    @property
    def functional_improvement(self):
        """
        Calculate functional improvement between pre and post independence levels.

        Returns:
            int or None: Improvement level (positive = better), or None if not available
        """
        level_order = [
            "TOTAL_ASSIST",
            "MAX_ASSIST",
            "MOD_ASSIST",
            "MIN_ASSIST",
            "SUPERVISION",
            "MODIFIED_IND",
            "INDEPENDENT",
        ]

        if self.pre_functional_status and self.post_functional_status:
            try:
                pre_idx = level_order.index(self.pre_functional_status)
                post_idx = level_order.index(self.post_functional_status)
                return post_idx - pre_idx  # Positive = improvement
            except ValueError:
                return None
        return None
