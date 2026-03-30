from django.conf import settings
from django.db import models
from django.utils import timezone

from hmis.apps.core.models import TimeStampedModel


class ProcedureCatalog(TimeStampedModel):
    """
    Master catalog of procedures that can be performed.

    Links to standard coding systems (ICHI, CPT) and defines
    consent requirements, typical consumables, and billing codes.

    NOTE: Category "SURGICAL" is reserved for the future theatre module.
    This module covers minor/outpatient procedures only.
    """

    class Category(models.TextChoices):
        MINOR = "MINOR", "Minor Procedure"
        DIAGNOSTIC = "DIAGNOSTIC", "Diagnostic Procedure"
        THERAPEUTIC = "THERAPEUTIC", "Therapeutic Procedure"
        PREVENTIVE = "PREVENTIVE", "Preventive Procedure"
        EMERGENCY = "EMERGENCY", "Emergency Procedure"
        DENTAL = "DENTAL", "Dental Procedure"
        OPHTHALMIC = "OPHTHALMIC", "Ophthalmic Procedure"
        ENT = "ENT", "ENT Procedure"
        OBSTETRIC = "OBSTETRIC", "Obstetric Procedure"
        WOUND_CARE = "WOUND_CARE", "Wound Care"
        INJECTION = "INJECTION", "Injection/Infusion"
        OTHER = "OTHER", "Other"

    class BodySystem(models.TextChoices):
        INTEGUMENTARY = "INTEGUMENTARY", "Integumentary (Skin)"
        MUSCULOSKELETAL = "MUSCULOSKELETAL", "Musculoskeletal"
        RESPIRATORY = "RESPIRATORY", "Respiratory"
        CARDIOVASCULAR = "CARDIOVASCULAR", "Cardiovascular"
        DIGESTIVE = "DIGESTIVE", "Digestive"
        URINARY = "URINARY", "Urinary"
        REPRODUCTIVE = "REPRODUCTIVE", "Reproductive"
        NERVOUS = "NERVOUS", "Nervous"
        ENDOCRINE = "ENDOCRINE", "Endocrine"
        LYMPHATIC = "LYMPHATIC", "Lymphatic"
        SENSORY = "SENSORY", "Sensory (Eye/Ear)"
        DENTAL = "DENTAL", "Dental"
        GENERAL = "GENERAL", "General/Multiple"

    class RiskLevel(models.TextChoices):
        LOW = "LOW", "Low Risk"
        MEDIUM = "MEDIUM", "Medium Risk"
        HIGH = "HIGH", "High Risk"

    # Core Fields
    code = models.CharField(
        max_length=20,
        unique=True,
        help_text="Internal procedure code (e.g., PROC-001)",
    )
    name = models.CharField(max_length=200, help_text="Procedure name")
    description = models.TextField(
        blank=True, default="", help_text="Detailed description of the procedure"
    )
    category = models.CharField(
        max_length=20, choices=Category.choices, default=Category.MINOR
    )
    body_system = models.CharField(
        max_length=20, choices=BodySystem.choices, default=BodySystem.GENERAL
    )
    risk_level = models.CharField(
        max_length=10, choices=RiskLevel.choices, default=RiskLevel.LOW
    )

    # Standard Coding (ICHI, CPT)
    ichi_code = models.CharField(
        max_length=20, blank=True, default="", help_text="ICHI procedure code (WHO standard)"
    )
    cpt_code = models.CharField(
        max_length=10, blank=True, default="", help_text="CPT procedure code (if applicable)"
    )
    icd10_pcs_code = models.CharField(
        max_length=10, blank=True, default="", help_text="ICD-10-PCS code (if applicable)"
    )

    # Consent & Requirements
    consent_required = models.BooleanField(
        default=True, help_text="Whether written consent is required"
    )
    consent_template = models.TextField(
        blank=True, default="", help_text="Default consent form text"
    )
    guardian_consent_required = models.BooleanField(
        default=False, help_text="Whether guardian consent required for minors"
    )
    witness_required = models.BooleanField(
        default=False, help_text="Whether a witness signature is required"
    )

    # Clinical Requirements
    requires_anesthesia = models.BooleanField(
        default=False, help_text="Whether anesthesia is typically required"
    )
    anesthesia_type = models.CharField(
        max_length=50,
        blank=True,
        default="",
        help_text="Type of anesthesia (local, general, sedation)",
    )
    typical_duration_minutes = models.PositiveIntegerField(
        default=30, help_text="Typical procedure duration in minutes"
    )
    requires_fasting = models.BooleanField(
        default=False, help_text="Whether pre-procedure fasting is required"
    )
    pre_procedure_instructions = models.TextField(
        blank=True, default="", help_text="Instructions for patient before procedure"
    )
    post_procedure_instructions = models.TextField(
        blank=True, default="", help_text="Instructions for patient after procedure"
    )

    # Staffing Requirements
    required_qualifications = models.TextField(
        blank=True,
        default="",
        help_text="Staff qualifications required (e.g., 'Surgeon, Nurse')",
    )
    minimum_staff_count = models.PositiveIntegerField(
        default=1, help_text="Minimum staff required"
    )

    # Billing & SHA
    billing_service = models.ForeignKey(
        "billing.Service",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="procedure_catalog_entries",
        help_text="Linked billing service for invoice generation. "
        "When set, the service unit_price and SHA code are used for billing.",
    )
    base_fee = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        null=True,
        blank=True,
        help_text="Base procedure fee (KES). Used as fallback when billing_service is not set.",
    )
    sha_tariff_code = models.CharField(
        max_length=50, blank=True, default="", help_text="SHA intervention tariff code"
    )
    sha_package_code = models.CharField(
        max_length=50, blank=True, default="", help_text="SHA package code (if bundled)"
    )

    # Follow-up
    requires_follow_up = models.BooleanField(
        default=False, help_text="Whether follow-up appointment is typically needed"
    )
    default_follow_up_days = models.PositiveIntegerField(
        default=7, help_text="Default days until follow-up"
    )
    follow_up_clinic = models.ForeignKey(
        "clinics.Clinic",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="follow_up_procedures",
        help_text="Default clinic for follow-up",
    )

    # Procedure Clinics (where this procedure can be performed)
    default_clinics = models.ManyToManyField(
        "clinics.Clinic",
        blank=True,
        related_name="procedure_catalog_entries",
        help_text="Clinics where this procedure can be performed. "
        "When set, scheduling auto-lists available slots from these clinics.",
    )

    # Status
    is_active = models.BooleanField(default=True, help_text="Whether procedure is currently offered")

    # Multi-tenancy
    organization = models.ForeignKey(
        "core.Organization",
        on_delete=models.CASCADE,
        related_name="procedure_catalog_entries",
        null=True,
        blank=True,
        help_text="Owning organization (auto-set from facility).",
    )
    facility = models.ForeignKey(
        "core.Facility",
        on_delete=models.CASCADE,
        related_name="procedure_catalog_entries",
        null=True,
        blank=True,
        help_text="Facility offering this procedure.",
    )

    class Meta:
        ordering = ["category", "name"]
        verbose_name = "Procedure Catalog Entry"
        verbose_name_plural = "Procedure Catalog"
        indexes = [
            models.Index(fields=["code"]),
            models.Index(fields=["ichi_code"]),
            models.Index(fields=["category"]),
            models.Index(fields=["facility", "is_active"]),
        ]

    def __str__(self) -> str:
        return f"{self.code} - {self.name}"

    @property
    def billing_price(self):
        """Resolve the billable price: billing_service.unit_price → base_fee → None."""
        if self.billing_service_id:
            return self.billing_service.unit_price
        return self.base_fee


class ProcedureKit(TimeStampedModel):
    """
    Standard consumable kit for a procedure.

    Defines the typical items needed for a procedure,
    allowing quick addition of all consumables.
    """

    procedure = models.ForeignKey(
        ProcedureCatalog, on_delete=models.CASCADE, related_name="kits"
    )
    name = models.CharField(
        max_length=100, help_text="Kit name (e.g., 'Standard Suturing Kit')"
    )
    description = models.TextField(blank=True, default="")
    is_default = models.BooleanField(default=False, help_text="Default kit for this procedure")
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ["procedure", "name"]
        verbose_name = "Procedure Kit"
        verbose_name_plural = "Procedure Kits"

    def __str__(self) -> str:
        return f"{self.procedure.name} - {self.name}"


class ProcedureKitItem(models.Model):
    """Individual item in a procedure kit."""

    kit = models.ForeignKey(ProcedureKit, on_delete=models.CASCADE, related_name="items")
    drug = models.ForeignKey(
        "pharmacy.Drug",
        on_delete=models.CASCADE,
        help_text="Drug/consumable item from pharmacy catalog",
    )
    quantity = models.PositiveIntegerField(default=1, help_text="Quantity needed")
    is_optional = models.BooleanField(default=False, help_text="Whether this item is optional")
    notes = models.CharField(max_length=200, blank=True, default="")

    class Meta:
        ordering = ["kit", "-is_optional", "drug__generic_name"]
        unique_together = ["kit", "drug"]

    def __str__(self) -> str:
        return f"{self.kit.name} - {self.drug.generic_name} x{self.quantity}"


class ProcedureOrder(TimeStampedModel):
    """
    Order/request for a procedure to be performed.

    Created when a clinician orders a procedure during an encounter.
    State transitions are owned by the model (codebase convention).
    """

    class Status(models.TextChoices):
        ORDERED = "ORDERED", "Ordered"
        CONSENT_PENDING = "CONSENT_PENDING", "Consent Pending"
        SCHEDULED = "SCHEDULED", "Scheduled"
        READY = "READY", "Ready to Perform"
        IN_PROGRESS = "IN_PROGRESS", "In Progress"
        COMPLETED = "COMPLETED", "Completed"
        CANCELLED = "CANCELLED", "Cancelled"

    class Priority(models.TextChoices):
        EMERGENCY = "EMERGENCY", "Emergency — Immediate"
        URGENT = "URGENT", "Urgent — Within 24 hours"
        ROUTINE = "ROUTINE", "Routine — Scheduled"
        ELECTIVE = "ELECTIVE", "Elective — Non-urgent"

    class Laterality(models.TextChoices):
        LEFT = "LEFT", "Left"
        RIGHT = "RIGHT", "Right"
        BILATERAL = "BILATERAL", "Bilateral"
        NA = "NA", "Not Applicable"

    # Core Fields
    order_number = models.CharField(
        max_length=20,
        unique=True,
        editable=False,
        help_text="Auto-generated order number (PROC-YYYYMMDD-XXXX)",
    )
    procedure = models.ForeignKey(
        ProcedureCatalog, on_delete=models.PROTECT, related_name="orders"
    )
    patient = models.ForeignKey(
        "patients.Patient", on_delete=models.CASCADE, related_name="procedure_orders"
    )

    # Context (where order originated)
    encounter = models.ForeignKey(
        "encounters.Encounter",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="procedure_orders",
        help_text="Encounter where procedure was ordered",
    )
    clinic_visit = models.ForeignKey(
        "clinics.ClinicVisit",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="procedure_orders",
        help_text="Clinic visit where procedure was ordered",
    )
    admission = models.ForeignKey(
        "inpatient.Admission",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="procedure_orders",
        help_text="If ordered for inpatient",
    )

    # Order Details
    status = models.CharField(
        max_length=20, choices=Status.choices, default=Status.ORDERED
    )
    priority = models.CharField(
        max_length=20, choices=Priority.choices, default=Priority.ROUTINE
    )
    indication = models.TextField(help_text="Clinical indication / reason for procedure")
    clinical_notes = models.TextField(
        blank=True, default="", help_text="Additional clinical notes"
    )

    # Site/Laterality
    body_site = models.CharField(
        max_length=100, blank=True, default="", help_text="Specific body site (e.g., 'Right forearm')"
    )
    laterality = models.CharField(
        max_length=20, choices=Laterality.choices, default=Laterality.NA
    )

    # Scheduling
    appointment = models.ForeignKey(
        "scheduling.Appointment",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="procedure_orders",
        help_text="Optional link to scheduling.Appointment for formal booking",
    )
    scheduled_date = models.DateField(null=True, blank=True, help_text="Scheduled procedure date")
    scheduled_time = models.TimeField(null=True, blank=True, help_text="Scheduled procedure time")
    scheduled_clinic = models.ForeignKey(
        "clinics.Clinic",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="scheduled_procedures",
        help_text="Clinic/procedure room where procedure is scheduled",
    )
    scheduled_location = models.CharField(
        max_length=100, blank=True, default="",
        help_text="Free-text location (fallback when scheduled_clinic is not set)",
    )
    estimated_duration_minutes = models.PositiveIntegerField(
        null=True, blank=True, help_text="Estimated duration (override from catalog)"
    )

    # Staff
    ordered_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="procedure_orders_created",
        help_text="Clinician who ordered the procedure",
    )
    ordered_at = models.DateTimeField(auto_now_add=True)
    assigned_performer = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="assigned_procedures",
        help_text="Staff assigned to perform",
    )

    # Cancellation
    cancelled_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="cancelled_procedure_orders",
    )
    cancelled_at = models.DateTimeField(null=True, blank=True)
    cancellation_reason = models.TextField(blank=True, default="")

    # Multi-tenancy
    organization = models.ForeignKey(
        "core.Organization",
        on_delete=models.CASCADE,
        related_name="procedure_orders",
        null=True,
        blank=True,
        help_text="Owning organization (auto-set from facility).",
    )
    facility = models.ForeignKey(
        "core.Facility",
        on_delete=models.CASCADE,
        related_name="procedure_orders",
        null=True,
        blank=True,
        help_text="Facility where procedure was ordered.",
    )

    class Meta:
        ordering = ["-ordered_at"]
        verbose_name = "Procedure Order"
        verbose_name_plural = "Procedure Orders"
        indexes = [
            models.Index(fields=["order_number"]),
            models.Index(fields=["patient", "status"]),
            models.Index(fields=["scheduled_date"]),
            models.Index(fields=["facility", "status"]),
            models.Index(fields=["scheduled_clinic", "scheduled_date", "status"]),
        ]

    def __str__(self) -> str:
        return f"{self.order_number} - {self.procedure.name} for {self.patient}"

    def save(self, *args, **kwargs):  # type: ignore[override]
        if not self.order_number:
            self.order_number = self._generate_order_number()
        super().save(*args, **kwargs)

    def _generate_order_number(self) -> str:
        """Generate unique order number: PROC-YYYYMMDD-XXXX."""
        today = timezone.now().date()
        prefix = f"PROC-{today.strftime('%Y%m%d')}-"

        last_order = (
            ProcedureOrder.objects.filter(order_number__startswith=prefix)
            .order_by("-order_number")
            .first()
        )

        if last_order:
            last_num = int(last_order.order_number.split("-")[-1])
            next_num = last_num + 1
        else:
            next_num = 1

        return f"{prefix}{next_num:04d}"

    # State-transition methods
    def request_consent(self) -> None:
        """Transition ORDERED → CONSENT_PENDING."""
        self.status = self.Status.CONSENT_PENDING
        self.save(update_fields=["status", "updated_at"])

    def schedule(
        self,
        date: "models.DateField",
        time: "models.TimeField | None" = None,
        location: str = "",
        duration: int | None = None,
        clinic=None,
    ) -> None:
        """Transition → SCHEDULED after consent obtained (or if not required).

        Args:
            date: Scheduled procedure date.
            time: Scheduled procedure time.
            location: Free-text location (fallback).
            duration: Override estimated duration.
            clinic: Clinic instance to schedule in. When set,
                auto-assigns a performer from ClinicStaff if none is set.
        """
        self.status = self.Status.SCHEDULED
        self.scheduled_date = date
        self.scheduled_time = time
        self.scheduled_location = location
        if duration:
            self.estimated_duration_minutes = duration
        if clinic is not None:
            self.scheduled_clinic = clinic

        # Auto-assign performer from clinic staff if not already set
        if self.scheduled_clinic_id and not self.assigned_performer_id:
            self.assigned_performer = self._auto_assign_performer()

        update_fields = [
            "status",
            "scheduled_date",
            "scheduled_time",
            "scheduled_location",
            "estimated_duration_minutes",
            "scheduled_clinic",
            "assigned_performer",
            "updated_at",
        ]
        self.save(update_fields=update_fields)

    def _auto_assign_performer(self):
        """Pick the least-busy eligible staff member from the scheduled clinic for the scheduled date."""
        from django.db.models import Count, Q

        from hmis.apps.clinics.models import ClinicStaff

        candidates = ClinicStaff.objects.filter(
            clinic=self.scheduled_clinic,
            role__in=["LEAD", "DOCTOR", "NURSE"],
            is_active=True,
        ).select_related("user")

        if not candidates.exists():
            return None

        # Count procedures already assigned to each candidate on the same date
        candidates = candidates.annotate(
            procedure_count=Count(
                "user__assigned_procedures",
                filter=Q(
                    user__assigned_procedures__scheduled_date=self.scheduled_date,
                    user__assigned_procedures__status__in=[
                        self.Status.SCHEDULED,
                        self.Status.READY,
                        self.Status.IN_PROGRESS,
                    ],
                ),
            )
        ).order_by("procedure_count")

        best = candidates.first()
        return best.user if best else None

    def mark_ready(self) -> None:
        """Transition SCHEDULED → READY (patient arrived, prep complete)."""
        self.status = self.Status.READY
        self.save(update_fields=["status", "updated_at"])

    def start_procedure(self, performed_by: "settings.AUTH_USER_MODEL") -> "ProcedureLog":
        """Transition READY/SCHEDULED → IN_PROGRESS and create ProcedureLog."""
        self.status = self.Status.IN_PROGRESS
        self.save(update_fields=["status", "updated_at"])

        log = ProcedureLog.objects.create(
            order=self,
            started_at=timezone.now(),
            performed_by=performed_by,
            location=self.scheduled_location,
            organization=self.organization,
            facility=self.facility,
        )
        return log

    def complete(self) -> None:
        """Transition IN_PROGRESS → COMPLETED (called by ProcedureLog.complete)."""
        self.status = self.Status.COMPLETED
        self.save(update_fields=["status", "updated_at"])

    def cancel(self, user: "settings.AUTH_USER_MODEL", reason: str) -> None:
        """Cancel the procedure order."""
        self.status = self.Status.CANCELLED
        self.cancelled_by = user
        self.cancelled_at = timezone.now()
        self.cancellation_reason = reason
        self.save(
            update_fields=[
                "status",
                "cancelled_by",
                "cancelled_at",
                "cancellation_reason",
                "updated_at",
            ]
        )

    # Computed properties
    def can_perform(self) -> tuple[bool, str]:
        """Check if procedure can be performed."""
        if self.status not in [self.Status.SCHEDULED, self.Status.READY]:
            return False, "Order not in performable status"

        if self.procedure.consent_required:
            if not hasattr(self, "consent") or self.consent.status != ProcedureConsent.Status.SIGNED:
                return False, "Consent not obtained"

        return True, "Ready to perform"

    @property
    def is_overdue(self) -> bool:
        """True if scheduled_date is in the past and still not completed."""
        if self.status in [self.Status.COMPLETED, self.Status.CANCELLED]:
            return False
        if self.scheduled_date and self.scheduled_date < timezone.now().date():
            return True
        return False


class ProcedureConsent(TimeStampedModel):
    """
    Consent record for a procedure.

    Tracks informed consent with patient signature,
    witness signature (if required), and guardian consent for minors.
    """

    class Status(models.TextChoices):
        PENDING = "PENDING", "Pending — Not yet signed"
        SIGNED = "SIGNED", "Signed — Consent given"
        DECLINED = "DECLINED", "Declined — Consent refused"
        WITHDRAWN = "WITHDRAWN", "Withdrawn — Consent withdrawn"

    class ConsentType(models.TextChoices):
        WRITTEN = "WRITTEN", "Written Consent"
        VERBAL = "VERBAL", "Verbal Consent (documented)"
        EMERGENCY = "EMERGENCY", "Emergency (implied consent)"

    order = models.OneToOneField(
        ProcedureOrder, on_delete=models.CASCADE, related_name="consent"
    )

    # Consent Details
    status = models.CharField(
        max_length=20, choices=Status.choices, default=Status.PENDING
    )
    consent_type = models.CharField(
        max_length=20, choices=ConsentType.choices, default=ConsentType.WRITTEN
    )
    consent_text = models.TextField(help_text="Full consent form text presented to patient")

    # Information Provided
    procedure_explained = models.BooleanField(
        default=False, help_text="Procedure was explained to patient"
    )
    risks_explained = models.BooleanField(
        default=False, help_text="Risks and complications were explained"
    )
    alternatives_explained = models.BooleanField(
        default=False, help_text="Alternative treatments were discussed"
    )
    questions_answered = models.BooleanField(
        default=False, help_text="Patient's questions were answered"
    )

    # Patient/Guardian Signature
    signed_by_patient = models.BooleanField(
        default=False, help_text="Whether patient signed"
    )
    patient_signature = models.TextField(
        blank=True, default="", help_text="Patient signature (base64 image or typed name)"
    )
    patient_signed_at = models.DateTimeField(null=True, blank=True)

    # For minors or incapacitated patients
    signed_by_guardian = models.BooleanField(
        default=False, help_text="Whether guardian signed (for minors)"
    )
    guardian_name = models.CharField(max_length=200, blank=True, default="")
    guardian_relationship = models.CharField(
        max_length=50,
        blank=True,
        default="",
        help_text="Relationship to patient (parent, spouse, etc.)",
    )
    guardian_id_number = models.CharField(
        max_length=50, blank=True, default="", help_text="Guardian's ID number"
    )
    guardian_signature = models.TextField(blank=True, default="")
    guardian_signed_at = models.DateTimeField(null=True, blank=True)

    # Witness
    witness_required = models.BooleanField(default=False)
    witness_name = models.CharField(max_length=200, blank=True, default="")
    witness_signature = models.TextField(blank=True, default="")
    witness_signed_at = models.DateTimeField(null=True, blank=True)
    witnessed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="witnessed_consents",
        help_text="Staff who witnessed the consent",
    )

    # Staff who obtained consent
    obtained_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="consents_obtained",
        help_text="Staff who obtained consent",
    )
    obtained_at = models.DateTimeField(null=True, blank=True)

    # Decline/Withdrawal
    decline_reason = models.TextField(
        blank=True, default="", help_text="Reason for declining/withdrawing consent"
    )
    declined_at = models.DateTimeField(null=True, blank=True)

    # Multi-tenancy
    organization = models.ForeignKey(
        "core.Organization",
        on_delete=models.CASCADE,
        related_name="procedure_consents",
        null=True,
        blank=True,
    )
    facility = models.ForeignKey(
        "core.Facility",
        on_delete=models.CASCADE,
        related_name="procedure_consents",
        null=True,
        blank=True,
    )

    class Meta:
        ordering = ["-created_at"]
        verbose_name = "Procedure Consent"
        verbose_name_plural = "Procedure Consents"

    def __str__(self) -> str:
        return f"Consent for {self.order}"

    def is_valid(self) -> bool:
        """Check if consent is valid."""
        if self.status != self.Status.SIGNED:
            return False

        if not self.procedure_explained or not self.risks_explained:
            return False

        if self.order.procedure.guardian_consent_required:
            if not self.signed_by_guardian:
                return False
        elif not self.signed_by_patient:
            return False

        if self.witness_required and not self.witness_signature:
            return False

        return True

    # State-transition methods
    def sign(self, user: "settings.AUTH_USER_MODEL") -> None:
        """Mark consent as signed."""
        self.status = self.Status.SIGNED
        self.obtained_by = user
        self.obtained_at = timezone.now()
        self.save(
            update_fields=["status", "obtained_by", "obtained_at", "updated_at"]
        )

    def decline(self, reason: str = "") -> None:
        """Mark consent as declined."""
        self.status = self.Status.DECLINED
        self.decline_reason = reason
        self.declined_at = timezone.now()
        self.save(update_fields=["status", "decline_reason", "declined_at", "updated_at"])

    def withdraw(self, reason: str = "") -> None:
        """Withdraw previously given consent."""
        self.status = self.Status.WITHDRAWN
        self.decline_reason = reason
        self.declined_at = timezone.now()
        self.save(update_fields=["status", "decline_reason", "declined_at", "updated_at"])


class ProcedureLog(TimeStampedModel):
    """
    Record of a performed procedure.

    Documents the actual performance including timing,
    staff involved, findings, and immediate outcome.
    """

    class Status(models.TextChoices):
        IN_PROGRESS = "IN_PROGRESS", "In Progress"
        COMPLETED = "COMPLETED", "Completed Successfully"
        PARTIAL = "PARTIAL", "Partially Completed"
        ABANDONED = "ABANDONED", "Abandoned"
        COMPLICATED = "COMPLICATED", "Completed with Complications"

    order = models.OneToOneField(
        ProcedureOrder, on_delete=models.CASCADE, related_name="log"
    )

    # Timing
    started_at = models.DateTimeField(help_text="Procedure start time")
    ended_at = models.DateTimeField(
        null=True, blank=True, help_text="Procedure end time"
    )
    actual_duration_minutes = models.PositiveIntegerField(
        null=True, blank=True, help_text="Actual duration in minutes"
    )

    # Staff Involved
    performed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="procedures_performed",
        help_text="Primary performer",
    )
    assistant = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="procedures_assisted",
        help_text="Assistant (if any)",
    )

    # Location
    location = models.CharField(max_length=100, help_text="Where procedure was performed")

    # Anesthesia
    anesthesia_used = models.BooleanField(default=False)
    anesthesia_type = models.CharField(max_length=50, blank=True, default="")
    anesthesia_agent = models.CharField(
        max_length=100,
        blank=True,
        default="",
        help_text="Anesthetic agent used (e.g., Lidocaine 2%)",
    )
    anesthesia_dose = models.CharField(
        max_length=50, blank=True, default="", help_text="Dose administered"
    )

    # Findings & Technique
    pre_procedure_findings = models.TextField(
        blank=True, default="", help_text="Findings before/during procedure"
    )
    technique_description = models.TextField(
        blank=True, default="", help_text="Description of technique used"
    )
    specimens_collected = models.BooleanField(
        default=False, help_text="Whether specimens were collected"
    )
    specimen_details = models.TextField(
        blank=True, default="", help_text="Details of specimens collected"
    )

    # Status & Outcome
    status = models.CharField(
        max_length=20, choices=Status.choices, default=Status.IN_PROGRESS
    )
    immediate_outcome = models.TextField(
        blank=True, default="", help_text="Immediate post-procedure notes"
    )

    # Complications
    complications_occurred = models.BooleanField(default=False)
    complication_details = models.TextField(blank=True, default="")

    # Post-Procedure
    post_procedure_instructions_given = models.BooleanField(default=False)
    post_procedure_instructions = models.TextField(
        blank=True, default="", help_text="Instructions given to patient"
    )

    # Documentation
    notes = models.TextField(blank=True, default="")

    # Multi-tenancy
    organization = models.ForeignKey(
        "core.Organization",
        on_delete=models.CASCADE,
        related_name="procedure_logs",
        null=True,
        blank=True,
    )
    facility = models.ForeignKey(
        "core.Facility",
        on_delete=models.CASCADE,
        related_name="procedure_logs",
        null=True,
        blank=True,
    )

    class Meta:
        ordering = ["-started_at"]
        verbose_name = "Procedure Log"
        verbose_name_plural = "Procedure Logs"

    def __str__(self) -> str:
        return f"Log: {self.order}"

    def save(self, *args, **kwargs):  # type: ignore[override]
        if self.started_at and self.ended_at:
            delta = self.ended_at - self.started_at
            self.actual_duration_minutes = int(delta.total_seconds() / 60)
        super().save(*args, **kwargs)

    # State-transition methods
    def complete(self, status: str = "COMPLETED", outcome: str = "") -> None:
        """Mark procedure as completed and update the parent order."""
        self.ended_at = timezone.now()
        self.status = status
        if outcome:
            self.immediate_outcome = outcome
        self.save(
            update_fields=[
                "ended_at",
                "status",
                "immediate_outcome",
                "actual_duration_minutes",
                "updated_at",
            ]
        )
        self.order.complete()

        # Auto-bill the procedure
        try:
            from hmis.apps.billing.agent import BillingAgentService

            BillingAgentService.handle_procedure_completed(self.order)
        except Exception:
            import logging

            logging.getLogger(__name__).exception(
                "Billing agent: procedure billing failed for order %s",
                self.order.order_number,
            )

    def abandon(self, reason: str = "") -> None:
        """Mark procedure as abandoned."""
        self.ended_at = timezone.now()
        self.status = self.Status.ABANDONED
        self.notes = reason
        self.save(
            update_fields=[
                "ended_at",
                "status",
                "notes",
                "actual_duration_minutes",
                "updated_at",
            ]
        )
        self.order.cancel(user=self.performed_by, reason=f"Procedure abandoned: {reason}")


class ProcedureConsumable(models.Model):
    """
    Consumables used during a procedure.

    Tracks drugs/items used for inventory management
    and billing purposes. Stock is deducted via StockBatch.
    """

    log = models.ForeignKey(
        ProcedureLog, on_delete=models.CASCADE, related_name="consumables"
    )
    drug = models.ForeignKey(
        "pharmacy.Drug",
        on_delete=models.PROTECT,
        help_text="Drug/consumable from pharmacy catalog",
    )
    batch = models.ForeignKey(
        "pharmacy.StockBatch",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        help_text="Specific batch used (for FEFO tracking)",
    )
    quantity = models.PositiveIntegerField(help_text="Quantity used")
    unit_cost = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        null=True,
        blank=True,
        help_text="Unit cost at time of use",
    )
    total_cost = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        null=True,
        blank=True,
        help_text="Total cost (quantity x unit_cost)",
    )
    notes = models.CharField(max_length=200, blank=True, default="")
    recorded_at = models.DateTimeField(auto_now_add=True)
    recorded_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True
    )

    class Meta:
        ordering = ["log", "drug__generic_name"]
        verbose_name = "Procedure Consumable"
        verbose_name_plural = "Procedure Consumables"

    def __str__(self) -> str:
        return f"{self.drug.generic_name} x{self.quantity} for {self.log.order}"

    def save(self, *args, **kwargs):  # type: ignore[override]
        if self.unit_cost and self.quantity:
            self.total_cost = self.unit_cost * self.quantity
        is_new = self.pk is None
        super().save(*args, **kwargs)

        # Deduct from inventory on first save only
        if is_new:
            self._deduct_stock()

    def _deduct_stock(self) -> None:
        """
        Deduct consumable from pharmacy stock.

        Uses StockBatch directly — the pharmacy app does NOT have a
        StockMovement model. StockBatch tracks quantity_available.
        """
        if self.batch:
            self.batch.quantity_available = max(
                0, self.batch.quantity_available - self.quantity
            )
            self.batch.save(update_fields=["quantity_available"])


class ProcedureOutcome(TimeStampedModel):
    """
    Outcome tracking for a procedure.

    Documents follow-up outcomes, healing progress,
    and any delayed complications.
    """

    class OutcomeStatus(models.TextChoices):
        SUCCESSFUL = "SUCCESSFUL", "Successful — Full recovery"
        PARTIAL_SUCCESS = "PARTIAL_SUCCESS", "Partial Success"
        HEALING = "HEALING", "Healing as expected"
        DELAYED_HEALING = "DELAYED_HEALING", "Delayed Healing"
        INFECTION = "INFECTION", "Infection"
        COMPLICATION = "COMPLICATION", "Post-procedure Complication"
        RE_PROCEDURE_NEEDED = "RE_PROCEDURE_NEEDED", "Re-procedure Needed"
        REFERRED = "REFERRED", "Referred for Further Care"

    log = models.ForeignKey(
        ProcedureLog, on_delete=models.CASCADE, related_name="outcomes"
    )
    assessment_date = models.DateField(help_text="Date of outcome assessment")
    outcome = models.CharField(max_length=30, choices=OutcomeStatus.choices)
    findings = models.TextField(help_text="Clinical findings")
    notes = models.TextField(blank=True, default="")
    assessed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="procedure_outcomes_assessed",
    )

    # Follow-up scheduling
    next_follow_up = models.DateField(null=True, blank=True)
    follow_up_notes = models.TextField(blank=True, default="")

    # Photos/images (stored as references)
    images = models.JSONField(
        null=True, blank=True, help_text="List of image file references"
    )

    # Multi-tenancy
    organization = models.ForeignKey(
        "core.Organization",
        on_delete=models.CASCADE,
        related_name="procedure_outcomes",
        null=True,
        blank=True,
    )
    facility = models.ForeignKey(
        "core.Facility",
        on_delete=models.CASCADE,
        related_name="procedure_outcomes",
        null=True,
        blank=True,
    )

    class Meta:
        ordering = ["-assessment_date"]
        verbose_name = "Procedure Outcome"
        verbose_name_plural = "Procedure Outcomes"

    def __str__(self) -> str:
        return f"Outcome: {self.log.order} - {self.get_outcome_display()}"
