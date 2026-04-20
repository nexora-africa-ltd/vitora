"""
Theatre / Operating Room models for Vitora HMIS.

Covers the complete perioperative journey from surgery scheduling
to post-operative recovery (PACU).

All tenant-scoped models inherit from FacilityScopedModel.
"""

from datetime import time

from django.conf import settings
from django.db import models
from django.utils import timezone

from hmis.apps.core.mixins import FacilityScopedModel, resolve_tenant_from_related
from hmis.apps.core.models import TimeStampedModel


# ---------------------------------------------------------------------------
# 1. OperatingTheatre
# ---------------------------------------------------------------------------
class OperatingTheatre(FacilityScopedModel, TimeStampedModel):
    """
    Physical operating room/theatre with equipment and capabilities.

    Inherits facility + organization FKs from FacilityScopedModel.
    """

    class TheatreType(models.TextChoices):
        GENERAL = "GENERAL", "General Surgery"
        ORTHO = "ORTHO", "Orthopedic"
        CARDIAC = "CARDIAC", "Cardiac Surgery"
        NEURO = "NEURO", "Neurosurgery"
        EYE = "EYE", "Ophthalmology"
        ENT = "ENT", "ENT Surgery"
        OBSTETRIC = "OBSTETRIC", "Obstetric/Gynecology"
        PEDIATRIC = "PEDIATRIC", "Pediatric Surgery"
        EMERGENCY = "EMERGENCY", "Emergency/Trauma"
        MINOR = "MINOR", "Minor Procedures"

    # Identity
    code = models.CharField(max_length=20, help_text='e.g. "OT-01"')
    name = models.CharField(max_length=100)
    theatre_type = models.CharField(max_length=20, choices=TheatreType.choices)
    location = models.CharField(max_length=100, blank=True, default="")

    # Capabilities
    has_laminar_flow = models.BooleanField(default=False)
    has_cath_lab = models.BooleanField(default=False)
    has_image_intensifier = models.BooleanField(default=False)
    equipment_notes = models.TextField(blank=True, default="")

    # Scheduling
    operating_hours_start = models.TimeField(default=time(8, 0))
    operating_hours_end = models.TimeField(default=time(18, 0))
    slot_duration_minutes = models.IntegerField(default=30)

    # Status
    is_active = models.BooleanField(default=True)
    maintenance_notes = models.TextField(blank=True, default="")
    scheduling_resource = models.ForeignKey(
        "scheduling.Resource",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="operating_theatres",
        limit_choices_to={"resource_type": "PLACE"},
        help_text="Linked scheduling PLACE resource for integrated theatre scheduling.",
    )

    class Meta:
        unique_together = ["facility", "code"]
        ordering = ["code"]
        verbose_name = "Operating Theatre"
        verbose_name_plural = "Operating Theatres"
        permissions = [
            ("manage_theatre_settings", "Can configure theatre setup and operating rooms"),
        ]

    def __str__(self) -> str:
        return f"{self.code} – {self.name}"


# ---------------------------------------------------------------------------
# 2. SurgeryCase
# ---------------------------------------------------------------------------
class SurgeryCase(FacilityScopedModel, TimeStampedModel):
    """
    A surgical case from booking through to PACU discharge.

    Status transitions are owned by the model (views stay thin).
    Inherits facility + organization FKs from FacilityScopedModel.
    """

    class CaseStatus(models.TextChoices):
        REQUESTED = "REQUESTED", "Requested"
        SCHEDULED = "SCHEDULED", "Scheduled"
        PRE_OP = "PRE_OP", "Pre-Operative"
        IN_THEATRE = "IN_THEATRE", "In Theatre"
        IN_SURGERY = "IN_SURGERY", "Surgery In Progress"
        IN_PACU = "IN_PACU", "In Recovery (PACU)"
        DISCHARGED = "DISCHARGED", "Discharged"
        POSTPONED = "POSTPONED", "Postponed"
        CANCELLED = "CANCELLED", "Cancelled"

    class Priority(models.TextChoices):
        ELECTIVE = "ELECTIVE", "Elective"
        URGENT = "URGENT", "Urgent"
        EMERGENCY = "EMERGENCY", "Emergency"

    class ASAClass(models.TextChoices):
        CLASS_I = "I", "ASA I – Healthy"
        CLASS_II = "II", "ASA II – Mild systemic disease"
        CLASS_III = "III", "ASA III – Severe systemic disease"
        CLASS_IV = "IV", "ASA IV – Life-threatening disease"
        CLASS_V = "V", "ASA V – Moribund"
        CLASS_VI = "VI", "ASA VI – Brain dead donor"

    class AnesthesiaType(models.TextChoices):
        GENERAL = "GENERAL", "General Anesthesia"
        SPINAL = "SPINAL", "Spinal Anesthesia"
        EPIDURAL = "EPIDURAL", "Epidural Anesthesia"
        REGIONAL = "REGIONAL", "Regional Block"
        LOCAL = "LOCAL", "Local Anesthesia"
        SEDATION = "SEDATION", "Sedation"
        COMBINED = "COMBINED", "Combined"

    class Laterality(models.TextChoices):
        LEFT = "LEFT", "Left"
        RIGHT = "RIGHT", "Right"
        BILATERAL = "BILATERAL", "Bilateral"
        NA = "NA", "Not Applicable"

    # Valid status transitions — model owns workflow logic.
    STATUS_TRANSITIONS: dict[str, list[str]] = {
        "REQUESTED": ["SCHEDULED", "CANCELLED"],
        "SCHEDULED": ["PRE_OP", "POSTPONED", "CANCELLED"],
        "PRE_OP": ["IN_THEATRE", "POSTPONED", "CANCELLED"],
        "IN_THEATRE": ["IN_SURGERY", "POSTPONED", "CANCELLED"],
        "IN_SURGERY": ["IN_PACU"],
        "IN_PACU": ["DISCHARGED"],
        "DISCHARGED": [],
        "POSTPONED": ["SCHEDULED", "CANCELLED"],
        "CANCELLED": [],
    }

    # Identity — auto-generated: SURG-YYYYMMDD-XXXX
    case_number = models.CharField(max_length=30, unique=True, editable=False)

    # Patient & encounter
    patient = models.ForeignKey(
        "patients.Patient",
        on_delete=models.PROTECT,
        related_name="surgery_cases",
    )
    encounter = models.ForeignKey(
        "encounters.Encounter",
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="surgery_cases",
    )
    admission = models.ForeignKey(
        "inpatient.Admission",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="surgery_cases",
    )

    # Procedure — FK to existing ProcedureCatalog (category=SURGICAL)
    primary_procedure = models.ForeignKey(
        "procedures.ProcedureCatalog",
        on_delete=models.PROTECT,
        related_name="primary_surgery_cases",
    )
    additional_procedures = models.ManyToManyField(
        "procedures.ProcedureCatalog",
        related_name="secondary_surgery_cases",
        blank=True,
    )
    procedure_notes = models.TextField(blank=True, default="")

    # Scheduling
    theatre = models.ForeignKey(
        OperatingTheatre,
        on_delete=models.PROTECT,
        related_name="surgery_cases",
    )
    scheduled_date = models.DateField()
    scheduled_start_time = models.TimeField()
    estimated_duration_minutes = models.IntegerField()
    priority = models.CharField(
        max_length=20,
        choices=Priority.choices,
        default=Priority.ELECTIVE,
    )

    # Clinical
    diagnosis = models.TextField()
    laterality = models.CharField(
        max_length=20,
        choices=Laterality.choices,
        default=Laterality.NA,
        blank=True,
    )
    asa_class = models.CharField(
        max_length=5,
        choices=ASAClass.choices,
        blank=True,
        default="",
    )
    anesthesia_type = models.CharField(
        max_length=20,
        choices=AnesthesiaType.choices,
        blank=True,
        default="",
    )

    # Status
    status = models.CharField(
        max_length=20,
        choices=CaseStatus.choices,
        default=CaseStatus.REQUESTED,
    )
    status_changed_at = models.DateTimeField(null=True, blank=True)
    status_changed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="surgery_case_status_changes",
    )

    # Cancellation / postponement
    cancellation_reason = models.TextField(blank=True, default="")
    postponed_to_date = models.DateField(null=True, blank=True)

    # Requesting clinician
    requesting_doctor = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="surgery_requests",
    )
    requested_at = models.DateTimeField(auto_now_add=True)

    # Billing
    total_charges = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    is_billable = models.BooleanField(default=True)

    class Meta:
        ordering = ["-scheduled_date", "-scheduled_start_time"]
        verbose_name = "Surgery Case"
        verbose_name_plural = "Surgery Cases"
        permissions = [
            ("manage_theatre", "Can manage theatre schedules and cases"),
            ("document_surgery", "Can document operative notes"),
        ]
        indexes = [
            models.Index(fields=["case_number"]),
            models.Index(fields=["status"]),
            models.Index(fields=["scheduled_date"]),
            models.Index(fields=["facility", "status"]),
            models.Index(fields=["facility", "scheduled_date"]),
        ]

    def __str__(self) -> str:
        return f"{self.case_number} – {self.patient}"

    # -- Save --

    def save(self, *args, **kwargs):  # type: ignore[override]
        if not self.case_number:
            self.case_number = self._generate_case_number()
        resolve_tenant_from_related(self, encounter_field="encounter", patient_field="patient")
        super().save(*args, **kwargs)

    def _generate_case_number(self) -> str:
        """Generate unique case number: SURG-YYYYMMDD-XXXX."""
        today = timezone.now().date()
        prefix = f"SURG-{today.strftime('%Y%m%d')}-"
        last = (
            SurgeryCase.objects.filter(case_number__startswith=prefix)
            .order_by("-case_number")
            .first()
        )
        next_num = int(last.case_number.split("-")[-1]) + 1 if last else 1
        return f"{prefix}{next_num:04d}"

    # -- Status transition methods (model owns workflow) --

    def transition_to(self, new_status: str, user=None, reason: str = "") -> None:
        """Validate and apply a status transition."""
        allowed = self.STATUS_TRANSITIONS.get(self.status, [])
        if new_status not in allowed:
            raise ValueError(
                f"Cannot transition from {self.status} to {new_status}. Allowed: {allowed}"
            )
        self.status = new_status
        self.status_changed_at = timezone.now()
        self.status_changed_by = user
        if new_status == self.CaseStatus.CANCELLED and reason:
            self.cancellation_reason = reason
        update_fields = ["status", "status_changed_at", "status_changed_by", "updated_at"]
        if reason and new_status == self.CaseStatus.CANCELLED:
            update_fields.append("cancellation_reason")
        self.save(update_fields=update_fields)

    def schedule(self, user=None) -> None:
        self.transition_to(self.CaseStatus.SCHEDULED, user=user)

    def start_pre_op(self, user=None) -> None:
        self.transition_to(self.CaseStatus.PRE_OP, user=user)

    def enter_theatre(self, user=None) -> None:
        self.transition_to(self.CaseStatus.IN_THEATRE, user=user)

    def start_surgery(self, user=None) -> None:
        self.transition_to(self.CaseStatus.IN_SURGERY, user=user)

    def end_surgery(self, user=None) -> None:
        self.transition_to(self.CaseStatus.IN_PACU, user=user)

    def discharge(self, user=None) -> None:
        self.transition_to(self.CaseStatus.DISCHARGED, user=user)

    def cancel(self, user=None, reason: str = "") -> None:
        self.transition_to(self.CaseStatus.CANCELLED, user=user, reason=reason)

    def postpone(self, user=None, postponed_to: "models.DateField | None" = None) -> None:
        self.transition_to(self.CaseStatus.POSTPONED, user=user)
        if postponed_to:
            self.postponed_to_date = postponed_to
            self.save(update_fields=["postponed_to_date", "updated_at"])


# ---------------------------------------------------------------------------
# 3. SurgicalTeamMember
# ---------------------------------------------------------------------------
class SurgicalTeamMember(TimeStampedModel):
    """
    Team assignment for a surgery case.

    Tracks all personnel involved (not FacilityScopedModel — nested under
    SurgeryCase which is already facility-scoped).
    """

    class Role(models.TextChoices):
        LEAD_SURGEON = "LEAD_SURGEON", "Lead Surgeon"
        ASSISTANT_SURGEON = "ASSISTANT_SURGEON", "Assistant Surgeon"
        ANESTHESIOLOGIST = "ANESTHESIOLOGIST", "Anesthesiologist"
        ANESTHESIA_TECH = "ANESTHESIA_TECH", "Anesthesia Technician"
        CIRCULATING_NURSE = "CIRCULATING_NURSE", "Circulating Nurse"
        SCRUB_NURSE = "SCRUB_NURSE", "Scrub Nurse"
        SCRUB_TECH = "SCRUB_TECH", "Scrub Technician"
        RECOVERY_NURSE = "RECOVERY_NURSE", "Recovery Nurse"
        OBSERVER = "OBSERVER", "Observer/Trainee"

    surgery_case = models.ForeignKey(
        SurgeryCase,
        on_delete=models.CASCADE,
        related_name="team_members",
    )
    staff_member = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="surgical_team_assignments",
    )
    role = models.CharField(max_length=30, choices=Role.choices)

    # Timing
    scrub_in_time = models.DateTimeField(null=True, blank=True)
    scrub_out_time = models.DateTimeField(null=True, blank=True)

    notes = models.TextField(blank=True, default="")

    class Meta:
        unique_together = ["surgery_case", "staff_member", "role"]
        ordering = ["role"]
        verbose_name = "Surgical Team Member"
        verbose_name_plural = "Surgical Team Members"

    def __str__(self) -> str:
        return f"{self.get_role_display()} – {self.staff_member}"


# ---------------------------------------------------------------------------
# 4. WHOSafetyChecklist
# ---------------------------------------------------------------------------
class WHOSafetyChecklist(TimeStampedModel):
    """
    WHO Surgical Safety Checklist — three phases.

    Nested under SurgeryCase (OneToOne).
    """

    surgery_case = models.OneToOneField(
        SurgeryCase,
        on_delete=models.CASCADE,
        related_name="who_checklist",
    )

    # =====================================================================
    #  SIGN-IN  (Before Anesthesia Induction)
    # =====================================================================
    sign_in_completed_at = models.DateTimeField(null=True, blank=True)
    sign_in_completed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="who_sign_ins",
    )

    # Patient confirmation
    patient_identity_confirmed = models.BooleanField(default=False)
    procedure_site_marked = models.BooleanField(default=False)
    consent_signed = models.BooleanField(default=False)

    # Anesthesia safety check
    anesthesia_machine_checked = models.BooleanField(default=False)
    pulse_oximeter_attached = models.BooleanField(default=False)

    # Allergies
    allergies_reviewed = models.BooleanField(default=False)
    allergy_notes = models.TextField(blank=True, default="")

    # Airway / aspiration risk
    difficult_airway_risk = models.BooleanField(default=False)
    aspiration_risk = models.BooleanField(default=False)
    airway_equipment_available = models.BooleanField(default=False)

    # Blood loss risk
    blood_loss_risk = models.CharField(max_length=20, blank=True, default="")
    iv_access_adequate = models.BooleanField(default=False)
    blood_products_available = models.BooleanField(default=False)

    # =====================================================================
    #  TIME-OUT  (Before Skin Incision)
    # =====================================================================
    time_out_completed_at = models.DateTimeField(null=True, blank=True)
    time_out_completed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="who_time_outs",
    )

    # Team introduction
    team_members_introduced = models.BooleanField(default=False)

    # Verbal confirmation
    patient_name_confirmed = models.BooleanField(default=False)
    procedure_confirmed = models.BooleanField(default=False)
    site_confirmed = models.BooleanField(default=False)

    # Anticipated events
    surgeon_critical_steps_discussed = models.BooleanField(default=False)
    anesthesia_concerns_discussed = models.BooleanField(default=False)
    nursing_concerns_discussed = models.BooleanField(default=False)

    # Antibiotic prophylaxis
    prophylactic_antibiotics_given = models.BooleanField(default=False)
    antibiotics_timing_within_60_min = models.BooleanField(default=False)
    antibiotics_not_applicable = models.BooleanField(default=False)

    # Imaging
    essential_imaging_displayed = models.BooleanField(default=False)
    imaging_not_applicable = models.BooleanField(default=False)

    # =====================================================================
    #  SIGN-OUT  (Before Patient Leaves)
    # =====================================================================
    sign_out_completed_at = models.DateTimeField(null=True, blank=True)
    sign_out_completed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="who_sign_outs",
    )

    # Procedure confirmation
    procedure_name_recorded = models.BooleanField(default=False)

    # Counts
    instrument_count_correct = models.BooleanField(default=False)
    sponge_count_correct = models.BooleanField(default=False)
    needle_count_correct = models.BooleanField(default=False)

    # Specimens
    specimens_labeled = models.BooleanField(default=False)
    specimen_count = models.IntegerField(default=0)

    # Equipment issues
    equipment_problems_noted = models.BooleanField(default=False)
    equipment_problems_description = models.TextField(blank=True, default="")

    # Recovery concerns
    key_recovery_concerns = models.TextField(blank=True, default="")

    class Meta:
        verbose_name = "WHO Safety Checklist"
        verbose_name_plural = "WHO Safety Checklists"

    def __str__(self) -> str:
        return f"WHO Checklist – {self.surgery_case.case_number}"

    # Convenience helpers

    @property
    def sign_in_complete(self) -> bool:
        return self.sign_in_completed_at is not None

    @property
    def time_out_complete(self) -> bool:
        return self.time_out_completed_at is not None

    @property
    def sign_out_complete(self) -> bool:
        return self.sign_out_completed_at is not None

    def complete_sign_in(self, user) -> None:
        self.sign_in_completed_at = timezone.now()
        self.sign_in_completed_by = user
        self.save(
            update_fields=[
                "sign_in_completed_at",
                "sign_in_completed_by",
                "updated_at",
            ]
        )

    def complete_time_out(self, user) -> None:
        self.time_out_completed_at = timezone.now()
        self.time_out_completed_by = user
        self.save(
            update_fields=[
                "time_out_completed_at",
                "time_out_completed_by",
                "updated_at",
            ]
        )

    def complete_sign_out(self, user) -> None:
        self.sign_out_completed_at = timezone.now()
        self.sign_out_completed_by = user
        self.save(
            update_fields=[
                "sign_out_completed_at",
                "sign_out_completed_by",
                "updated_at",
            ]
        )


# ---------------------------------------------------------------------------
# 5. AnesthesiaRecord
# ---------------------------------------------------------------------------
class AnesthesiaRecord(TimeStampedModel):
    """
    Complete anesthesia documentation for a surgery case.

    Covers pre-op assessment, intra-op monitoring, and PACU handover.
    Nested under SurgeryCase (OneToOne).
    """

    surgery_case = models.OneToOneField(
        SurgeryCase,
        on_delete=models.CASCADE,
        related_name="anesthesia_record",
    )
    anesthesiologist = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="anesthesia_records",
    )

    # -- PRE-OP ASSESSMENT --
    pre_op_assessment_at = models.DateTimeField(null=True, blank=True)

    # Airway
    mallampati_class = models.CharField(max_length=5, blank=True, default="")
    mouth_opening = models.CharField(max_length=50, blank=True, default="")
    neck_mobility = models.CharField(max_length=50, blank=True, default="")
    dentition_notes = models.TextField(blank=True, default="")

    # NPO status
    last_solid_food = models.DateTimeField(null=True, blank=True)
    last_clear_fluids = models.DateTimeField(null=True, blank=True)
    npo_confirmed = models.BooleanField(default=False)

    # Pre-medication
    premedication_given = models.TextField(blank=True, default="")

    # Consent
    anesthesia_consent_obtained = models.BooleanField(default=False)
    risks_explained = models.BooleanField(default=False)

    # -- INTRA-OP --
    induction_time = models.DateTimeField(null=True, blank=True)
    intubation_time = models.DateTimeField(null=True, blank=True)
    extubation_time = models.DateTimeField(null=True, blank=True)

    # Airway device
    airway_device = models.CharField(max_length=100, blank=True, default="")
    tube_size = models.CharField(max_length=20, blank=True, default="")
    intubation_attempts = models.IntegerField(default=1)
    intubation_difficulty = models.TextField(blank=True, default="")

    # Agents
    anesthesia_technique = models.TextField(blank=True, default="")
    induction_agents = models.TextField(blank=True, default="")
    maintenance_agents = models.TextField(blank=True, default="")
    muscle_relaxants = models.TextField(blank=True, default="")
    reversal_agents = models.TextField(blank=True, default="")

    # Fluids
    crystalloid_volume = models.IntegerField(default=0, help_text="mL")
    colloid_volume = models.IntegerField(default=0, help_text="mL")
    blood_products = models.TextField(blank=True, default="")

    # Blood loss
    estimated_blood_loss = models.IntegerField(default=0, help_text="mL")
    urine_output = models.IntegerField(default=0, help_text="mL")

    # Complications
    intraop_complications = models.TextField(blank=True, default="")

    # -- POST-OP (PACU Handover) --
    pacu_handover_at = models.DateTimeField(null=True, blank=True)
    pacu_handover_notes = models.TextField(blank=True, default="")

    # Post-op orders
    pain_management_plan = models.TextField(blank=True, default="")
    post_op_nausea_plan = models.TextField(blank=True, default="")
    other_post_op_orders = models.TextField(blank=True, default="")

    class Meta:
        verbose_name = "Anesthesia Record"
        verbose_name_plural = "Anesthesia Records"

    def __str__(self) -> str:
        return f"Anesthesia – {self.surgery_case.case_number}"


# ---------------------------------------------------------------------------
# 6. IntraOpVitalReading
# ---------------------------------------------------------------------------
class IntraOpVitalReading(TimeStampedModel):
    """Timed vital signs recorded during surgery (typically every 5 min)."""

    anesthesia_record = models.ForeignKey(
        AnesthesiaRecord,
        on_delete=models.CASCADE,
        related_name="vital_readings",
    )
    recorded_at = models.DateTimeField()
    recorded_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="intraop_vital_recordings",
    )

    # Cardiovascular
    systolic_bp = models.IntegerField(null=True, blank=True)
    diastolic_bp = models.IntegerField(null=True, blank=True)
    heart_rate = models.IntegerField(null=True, blank=True)

    # Respiratory
    respiratory_rate = models.IntegerField(null=True, blank=True)
    spo2 = models.DecimalField(max_digits=5, decimal_places=2, null=True, blank=True)
    etco2 = models.IntegerField(null=True, blank=True, help_text="End-tidal CO2")

    # Ventilator
    fio2 = models.IntegerField(null=True, blank=True, help_text="Fraction of inspired O2 (%)")
    tidal_volume = models.IntegerField(null=True, blank=True, help_text="mL")
    peak_pressure = models.IntegerField(null=True, blank=True, help_text="cmH2O")

    # Other
    temperature = models.DecimalField(max_digits=4, decimal_places=1, null=True, blank=True)

    notes = models.TextField(blank=True, default="")

    class Meta:
        ordering = ["recorded_at"]
        verbose_name = "Intra-Op Vital Reading"
        verbose_name_plural = "Intra-Op Vital Readings"

    def __str__(self) -> str:
        return f"Vitals @ {self.recorded_at}"


# ---------------------------------------------------------------------------
# 7. OperativeNote
# ---------------------------------------------------------------------------
class OperativeNote(TimeStampedModel):
    """Surgeon's operative note documenting the procedure."""

    surgery_case = models.OneToOneField(
        SurgeryCase,
        on_delete=models.CASCADE,
        related_name="operative_note",
    )
    dictated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="dictated_operative_notes",
    )

    # Timings
    incision_time = models.DateTimeField(null=True, blank=True)
    closure_time = models.DateTimeField(null=True, blank=True)

    # Procedure details
    pre_operative_diagnosis = models.TextField()
    post_operative_diagnosis = models.TextField()
    procedure_performed = models.TextField()

    # Findings & technique
    findings = models.TextField()
    technique_description = models.TextField()

    # Materials
    implants_used = models.TextField(blank=True, default="")
    drains_placed = models.TextField(blank=True, default="")
    sutures_used = models.TextField(blank=True, default="")

    # Blood loss
    estimated_blood_loss = models.IntegerField(default=0)

    # Specimens
    specimens_sent = models.TextField(blank=True, default="")
    frozen_section = models.BooleanField(default=False)
    frozen_section_result = models.TextField(blank=True, default="")

    # Complications
    intraoperative_complications = models.TextField(blank=True, default="")

    # Plan
    post_operative_plan = models.TextField(blank=True, default="")

    # Signature
    signed_at = models.DateTimeField(null=True, blank=True)
    signed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="signed_operative_notes",
    )

    class Meta:
        verbose_name = "Operative Note"
        verbose_name_plural = "Operative Notes"

    def __str__(self) -> str:
        return f"OpNote – {self.surgery_case.case_number}"

    def sign(self, user) -> None:
        self.signed_at = timezone.now()
        self.signed_by = user
        self.save(update_fields=["signed_at", "signed_by", "updated_at"])


# ---------------------------------------------------------------------------
# 8. TheatreConsumable
# ---------------------------------------------------------------------------
class TheatreConsumable(FacilityScopedModel, TimeStampedModel):
    """
    Consumables and implants used during surgery.

    References pharmacy.Drug for the item catalog.
    """

    surgery_case = models.ForeignKey(
        SurgeryCase,
        on_delete=models.CASCADE,
        related_name="consumables",
    )

    item = models.ForeignKey(
        "pharmacy.Drug",
        on_delete=models.PROTECT,
        related_name="theatre_consumables",
    )
    lot_number = models.CharField(max_length=50, blank=True, default="")
    expiry_date = models.DateField(null=True, blank=True)

    quantity_used = models.IntegerField()
    unit_cost = models.DecimalField(max_digits=10, decimal_places=2, default=0)

    added_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="theatre_consumables_added",
    )
    added_at = models.DateTimeField(auto_now_add=True)

    # Implant fields
    is_implant = models.BooleanField(default=False)
    implant_serial_number = models.CharField(max_length=100, blank=True, default="")

    class Meta:
        ordering = ["-added_at"]
        verbose_name = "Theatre Consumable"
        verbose_name_plural = "Theatre Consumables"

    def __str__(self) -> str:
        return f"{self.item} × {self.quantity_used}"

    @property
    def total_cost(self):
        return self.unit_cost * self.quantity_used


class TheatreConsumableAllocation(TimeStampedModel):
    """Batch-level stock allocations used to fulfill a theatre consumable line."""

    theatre_consumable = models.ForeignKey(
        TheatreConsumable,
        on_delete=models.CASCADE,
        related_name="allocations",
    )
    batch = models.ForeignKey(
        "pharmacy.StockBatch",
        on_delete=models.PROTECT,
        related_name="theatre_allocations",
    )
    quantity_used = models.PositiveIntegerField()
    unit_cost = models.DecimalField(max_digits=10, decimal_places=2)

    class Meta:
        ordering = ["created_at", "batch__expiry_date"]
        verbose_name = "Theatre Consumable Allocation"
        verbose_name_plural = "Theatre Consumable Allocations"

    def __str__(self) -> str:
        return f"{self.batch.batch_number} × {self.quantity_used}"


# ---------------------------------------------------------------------------
# 9. PACURecord
# ---------------------------------------------------------------------------
class PACURecord(TimeStampedModel):
    """Post-Anesthesia Care Unit (PACU) recovery record."""

    class DischargeDestination(models.TextChoices):
        WARD = "WARD", "Ward"
        ICU = "ICU", "ICU"
        DAY_CASE_DISCHARGE = "DAY_CASE_DISCHARGE", "Day Case Discharge"
        EXTENDED_OBSERVATION = "EXTENDED_OBSERVATION", "Extended Observation"

    surgery_case = models.OneToOneField(
        SurgeryCase,
        on_delete=models.CASCADE,
        related_name="pacu_record",
    )

    # Arrival
    arrival_time = models.DateTimeField()
    arriving_nurse = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="pacu_arrivals",
    )

    # Initial assessment
    initial_aldrete_score = models.IntegerField(help_text="0-10 Aldrete score")
    initial_pain_score = models.IntegerField(null=True, blank=True, help_text="0-10 NRS pain score")

    # Discharge
    discharge_time = models.DateTimeField(null=True, blank=True)
    discharge_aldrete_score = models.IntegerField(null=True, blank=True)
    discharge_destination = models.CharField(
        max_length=30,
        choices=DischargeDestination.choices,
        blank=True,
        default="",
    )

    # Complications
    nausea_vomiting = models.BooleanField(default=False)
    shivering = models.BooleanField(default=False)
    respiratory_issues = models.BooleanField(default=False)
    cardiovascular_issues = models.BooleanField(default=False)
    complications_notes = models.TextField(blank=True, default="")

    # Medications
    medications_given = models.TextField(blank=True, default="")

    # Discharge sign-off
    discharged_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="pacu_discharges",
    )
    discharge_notes = models.TextField(blank=True, default="")

    class Meta:
        verbose_name = "PACU Record"
        verbose_name_plural = "PACU Records"

    def __str__(self) -> str:
        return f"PACU – {self.surgery_case.case_number}"


# ---------------------------------------------------------------------------
# 10. PACUVitalReading
# ---------------------------------------------------------------------------
class PACUVitalReading(TimeStampedModel):
    """PACU vital signs monitoring."""

    pacu_record = models.ForeignKey(
        PACURecord,
        on_delete=models.CASCADE,
        related_name="vital_readings",
    )
    recorded_at = models.DateTimeField()
    recorded_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="pacu_vital_recordings",
    )

    # Vitals
    systolic_bp = models.IntegerField(null=True, blank=True)
    diastolic_bp = models.IntegerField(null=True, blank=True)
    heart_rate = models.IntegerField(null=True, blank=True)
    respiratory_rate = models.IntegerField(null=True, blank=True)
    spo2 = models.DecimalField(max_digits=5, decimal_places=2, null=True, blank=True)
    temperature = models.DecimalField(max_digits=4, decimal_places=1, null=True, blank=True)

    # PACU-specific
    aldrete_score = models.IntegerField(null=True, blank=True)
    pain_score = models.IntegerField(null=True, blank=True)
    sedation_level = models.CharField(max_length=50, blank=True, default="")

    notes = models.TextField(blank=True, default="")

    class Meta:
        ordering = ["recorded_at"]
        verbose_name = "PACU Vital Reading"
        verbose_name_plural = "PACU Vital Readings"

    def __str__(self) -> str:
        return f"PACU Vitals @ {self.recorded_at}"
