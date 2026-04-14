"""
Maternal & Child Health (MCH) models for Vitora HMIS.

This module contains all MCH-related models including:
- MCHRegistration: Pregnancy record / MCH card, linked to ClinicEnrollment (ANC)
- ANCVisit: Antenatal care visit tracking (up to 10 contacts per WHO)
- Delivery: Delivery record with baby details & outcomes
- PNCVisit: Postnatal care visit tracking
- GrowthMeasurement: Pediatric growth monitoring with WHO Z-scores
- Vaccine: KEPI immunization schedule reference data
- ImmunizationRecord: Child immunization tracking
- VitaminASupplement: Vitamin A supplementation tracking
- AEFI: Adverse Event Following Immunization reporting
- HEIFollowUp: HIV-Exposed Infant follow-up
- HEIPCRTest: PCR test scheduling and result tracking

All models follow TDD approach and Kenya healthcare requirements.
DHA Compliance Phase 2 - Sprint 2.B: MCH & Growth Charts.
"""

from datetime import date, datetime, timedelta
from decimal import Decimal

from django.apps import apps
from django.conf import settings
from django.core.exceptions import ValidationError
from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import models
from django.utils import timezone
from simple_history.models import HistoricalRecords

from hmis.apps.core.history import HistoryMixin
from hmis.apps.core.models import TimeStampedModel

# =============================================================================
# Number Generation Helpers
# =============================================================================


def generate_mch_number():
    """
    Generate a unique MCH Registration Number.

    Format: MCH-YYYYMMDD-XXXX

    Returns:
        str: A unique MCH registration number string
    """
    today = datetime.now().strftime("%Y%m%d")
    prefix = f"MCH-{today}-"

    MCHRegistration = apps.get_model("mch", "MCHRegistration")

    latest = (
        MCHRegistration.objects.filter(mch_number__startswith=prefix)
        .order_by("-mch_number")
        .first()
    )

    if latest:
        last_seq = int(latest.mch_number.split("-")[-1])
        sequence = last_seq + 1
    else:
        sequence = 1

    return f"{prefix}{sequence:04d}"


def generate_hei_number():
    """
    Generate a unique HEI Follow-Up Number.

    Format: HEI-YYYYMMDD-XXXX

    Returns:
        str: A unique HEI follow-up number string
    """
    today = datetime.now().strftime("%Y%m%d")
    prefix = f"HEI-{today}-"

    HEIFollowUp = apps.get_model("mch", "HEIFollowUp")

    latest = (
        HEIFollowUp.objects.filter(hei_number__startswith=prefix).order_by("-hei_number").first()
    )

    if latest:
        last_seq = int(latest.hei_number.split("-")[-1])
        sequence = last_seq + 1
    else:
        sequence = 1

    return f"{prefix}{sequence:04d}"


# =============================================================================
# MCH Registration Model
# =============================================================================


class MCHRegistration(HistoryMixin, TimeStampedModel):
    """
    Pregnancy registration / MCH card.

    Links to the existing ClinicEnrollment (ANC type) to reuse ANC fields:
    gravida, parity, LMP, EDD, blood group, HIV status, rhesus, etc.

    Tracks the full pregnancy journey: registration → ANC visits → delivery → PNC.
    """

    STATUS_CHOICES = [
        ("ACTIVE", "Active (ANC)"),
        ("DELIVERED", "Delivered"),
        ("POSTNATAL", "Postnatal Care"),
        ("COMPLETED", "Completed"),
        ("TRANSFERRED_OUT", "Transferred Out"),
        ("LOST_TO_FOLLOW_UP", "Lost to Follow-up"),
        ("DECEASED", "Deceased"),
    ]

    STATUS_TRANSITIONS = {
        "ACTIVE": ["DELIVERED", "POSTNATAL", "TRANSFERRED_OUT", "LOST_TO_FOLLOW_UP", "DECEASED"],
        "DELIVERED": ["POSTNATAL", "TRANSFERRED_OUT", "DECEASED"],
        "POSTNATAL": ["COMPLETED", "TRANSFERRED_OUT", "LOST_TO_FOLLOW_UP", "DECEASED"],
        "COMPLETED": [],
        "TRANSFERRED_OUT": [],
        "LOST_TO_FOLLOW_UP": ["ACTIVE"],
        "DECEASED": [],
    }

    # Auto-generated number
    mch_number = models.CharField(
        max_length=30,
        unique=True,
        editable=False,
        default=generate_mch_number,
        help_text="Auto-generated MCH registration number (MCH-YYYYMMDD-XXXX)",
    )

    # Tenant scoping
    organization = models.ForeignKey(
        "core.Organization",
        on_delete=models.CASCADE,
        related_name="mch_registrations",
        null=True,
        blank=True,
        help_text="Owning organization (auto-set from facility).",
    )
    facility = models.ForeignKey(
        "core.Facility",
        on_delete=models.CASCADE,
        related_name="mch_registrations",
        null=True,
        blank=True,
        help_text="Facility where registration was created.",
    )

    # Mother
    mother = models.ForeignKey(
        "patients.Patient",
        on_delete=models.PROTECT,
        related_name="mch_registrations",
        help_text="Mother / pregnant woman",
    )

    # Link to ANC enrollment (contains gravida, parity, LMP, EDD, blood group, etc.)
    anc_enrollment = models.ForeignKey(
        "clinics.ClinicEnrollment",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="mch_registrations",
        help_text="ANC clinic enrollment with pregnancy details",
    )

    # Baby (linked post-delivery)
    baby = models.ForeignKey(
        "patients.Patient",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="mch_registration_as_baby",
        help_text="Baby patient record (linked after delivery)",
    )

    # Registration details
    registration_date = models.DateField(
        default=date.today,
        help_text="Date of MCH registration",
    )
    status = models.CharField(
        max_length=30,
        choices=STATUS_CHOICES,
        default="ACTIVE",
    )

    # Risk assessment
    is_high_risk = models.BooleanField(
        default=False,
        help_text="Whether this is a high-risk pregnancy",
    )
    risk_factors = models.TextField(
        blank=True,
        default="",
        help_text="Description of risk factors if applicable",
    )

    # SHA / Linda Jamii
    sha_claimable = models.BooleanField(
        default=True,
        help_text="Whether this registration is SHA claimable",
    )
    linda_jamii_beneficiary = models.BooleanField(
        default=False,
        help_text="Whether the mother is a Linda Jamii beneficiary (free maternity)",
    )

    gbv_related = models.BooleanField(
        default=False,
        help_text="Whether this registration is GBV-related (auto-sets sensitivity)",
    )

    # Sensitive access (auto-set for HIV+)
    is_sensitive = models.BooleanField(
        default=False,
        help_text="Auto-set for HIV-positive pregnancies",
    )

    # Staff
    registered_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="mch_registrations_created",
    )

    # Notes
    notes = models.TextField(
        blank=True,
        default="",
        help_text="Additional notes",
    )

    # Tracking
    completed_at = models.DateTimeField(null=True, blank=True)

    # Audit trail
    history = HistoricalRecords()

    class Meta:
        ordering = ["-registration_date", "-created_at"]
        verbose_name = "MCH Registration"
        verbose_name_plural = "MCH Registrations"
        permissions = [
            ("view_sensitive_mch_registration", "Can view sensitive MCH registrations"),
        ]

    def __str__(self):
        return f"{self.mch_number} - {self.mother}"

    def save(self, *args, **kwargs):
        """Override save for auto-sensitivity and MCH number generation."""
        from hmis.apps.core.mixins import resolve_tenant_from_related

        resolve_tenant_from_related(self, encounter_field=None, patient_field="mother")

        if not self.mch_number:
            self.mch_number = generate_mch_number()

        # Auto-set sensitivity for HIV-positive pregnancies or GBV-related records
        if self.gbv_related or self.anc_enrollment and self.anc_enrollment.hiv_status == "POSITIVE":
            self.is_sensitive = True

        # Auto-detect high-risk from enrollment
        if self.anc_enrollment and self.anc_enrollment.high_risk_pregnancy:
            self.is_high_risk = True
            if self.anc_enrollment.high_risk_factors and not self.risk_factors:
                self.risk_factors = self.anc_enrollment.high_risk_factors

        super().save(*args, **kwargs)

    def can_transition_to(self, new_status: str) -> bool:
        """Check if transition to new_status is allowed."""
        allowed = self.STATUS_TRANSITIONS.get(self.status, [])
        return new_status in allowed

    def transition_status(self, new_status: str) -> None:
        """Transition to a new status with validation."""
        if not self.can_transition_to(new_status):
            raise ValidationError(
                f"Cannot transition from '{self.status}' to '{new_status}'. "
                f"Allowed transitions: {self.STATUS_TRANSITIONS.get(self.status, [])}"
            )
        self.status = new_status
        if new_status == "COMPLETED":
            self.completed_at = timezone.now()
        self.save()

    def _gestation_at_delivery(self):
        """Return (weeks, days) at delivery if delivered, else None."""
        if self.status not in ("DELIVERED", "POSTNATAL", "COMPLETED"):
            return None
        delivery = self.deliveries.order_by("-delivery_date").first()
        if not delivery or not self.anc_enrollment or not self.anc_enrollment.lmp:
            return None
        total_days = (delivery.delivery_date - self.anc_enrollment.lmp).days
        return (total_days // 7, total_days % 7)

    @property
    def gestation_display(self) -> str:
        """Return gestation display; freezes at delivery date once delivered."""
        frozen = self._gestation_at_delivery()
        if frozen is not None:
            weeks, days = frozen
            return f"{weeks} weeks {days} days (at delivery)"
        if self.anc_enrollment:
            return self.anc_enrollment.gestation_display()
        return "Unknown"

    @property
    def edd(self):
        """Return EDD from linked ANC enrollment."""
        if self.anc_enrollment:
            return self.anc_enrollment.edd
        return None

    @property
    def trimester(self):
        """Return trimester; freezes at delivery date once delivered."""
        frozen = self._gestation_at_delivery()
        if frozen is not None:
            weeks = frozen[0]
            if weeks <= 12:
                return 1
            elif weeks <= 27:
                return 2
            return 3
        if self.anc_enrollment:
            return self.anc_enrollment.trimester()
        return None

    @property
    def anc_visit_count(self) -> int:
        """Return count of ANC visits."""
        return self.anc_visits.count()

    @property
    def pnc_visit_count(self) -> int:
        """Return count of PNC visits."""
        return self.pnc_visits.count()

    @property
    def baby_count(self) -> int:
        """Return count of babies from completed deliveries."""
        return self.deliveries.filter(
            status="COMPLETED",
            baby_patient__isnull=False,
        ).count()

    @property
    def all_babies(self):
        """Return all baby Patient objects from completed deliveries."""
        from hmis.apps.patients.models import Patient

        baby_ids = self.deliveries.filter(
            status="COMPLETED",
            baby_patient__isnull=False,
        ).values_list("baby_patient_id", flat=True)
        return Patient.objects.filter(id__in=baby_ids)

    @property
    def is_multiple_pregnancy(self) -> bool:
        """Return True if this registration has more than one baby."""
        return self.baby_count > 1

    @property
    def inter_pregnancy_interval_days(self) -> int | None:
        """
        Return days since the previous pregnancy's delivery for the same mother.

        WHO recommends >= 730 days (24 months) between pregnancies.
        Returns None if this is the first pregnancy or no prior delivery date found.
        """
        previous = (
            MCHRegistration.objects.filter(
                mother=self.mother,
                status__in=["DELIVERED", "POSTNATAL", "COMPLETED"],
                registration_date__lt=self.registration_date,
            )
            .exclude(pk=self.pk)
            .order_by("-registration_date")
            .first()
        )
        if not previous:
            return None

        last_delivery = previous.deliveries.order_by("-delivery_date").first()
        if not last_delivery:
            return None

        return (self.registration_date - last_delivery.delivery_date).days

    @classmethod
    def suggested_obstetric_history(cls, mother_id: int) -> dict:
        """
        Calculate suggested gravida/parity from historical MCH registrations.

        Gravida = total pregnancies (including current active ones).
        Parity = number of pregnancies that reached viability (delivered).

        Returns dict with suggested_gravida, suggested_parity, and pregnancy_count.
        """
        all_registrations = cls.objects.filter(mother_id=mother_id)
        total = all_registrations.count()
        delivered = all_registrations.filter(
            status__in=["DELIVERED", "POSTNATAL", "COMPLETED"],
        ).count()

        return {
            "suggested_gravida": total + 1,  # +1 for the new registration being created
            "suggested_parity": delivered,
            "previous_pregnancies": total,
        }


# =============================================================================
# ANC Visit Model
# =============================================================================


class ANCVisit(HistoryMixin, TimeStampedModel):
    """
    Antenatal Care visit record.

    WHO recommends 8+ contacts (Kenya targets 4+ ANC visits minimum).
    Tracks clinical data, investigations, supplements per visit.
    """

    PRESENTATION_CHOICES = [
        ("CEPHALIC", "Cephalic"),
        ("BREECH", "Breech"),
        ("TRANSVERSE", "Transverse"),
        ("OBLIQUE", "Oblique"),
        ("UNKNOWN", "Unknown"),
    ]

    LIE_CHOICES = [
        ("LONGITUDINAL", "Longitudinal"),
        ("TRANSVERSE", "Transverse"),
        ("OBLIQUE", "Oblique"),
    ]

    URINE_CHOICES = [
        ("NEGATIVE", "Negative"),
        ("TRACE", "Trace"),
        ("1+", "1+"),
        ("2+", "2+"),
        ("3+", "3+"),
        ("4+", "4+"),
    ]

    registration = models.ForeignKey(
        MCHRegistration,
        on_delete=models.PROTECT,
        related_name="anc_visits",
        help_text="MCH registration this visit belongs to",
    )

    encounter = models.ForeignKey(
        "encounters.Encounter",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="anc_visits",
        help_text="Clinical encounter for this visit",
    )
    clinic_visit = models.OneToOneField(
        "clinics.ClinicVisit",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="anc_visit",
        help_text="Canonical clinic visit for this attended ANC consultation",
    )

    # Visit details
    visit_number = models.PositiveSmallIntegerField(
        validators=[MinValueValidator(1), MaxValueValidator(20)],
        help_text="Sequential visit number (1-20, WHO recommends 8+)",
    )
    visit_date = models.DateField(
        default=date.today,
        help_text="Date of ANC visit",
    )
    gestation_weeks = models.PositiveSmallIntegerField(
        null=True,
        blank=True,
        help_text="Gestation in weeks at time of visit",
    )

    # Maternal vital signs
    weight = models.DecimalField(
        max_digits=5,
        decimal_places=1,
        null=True,
        blank=True,
        validators=[MinValueValidator(Decimal("20.0")), MaxValueValidator(Decimal("300.0"))],
        help_text="Weight in kg",
    )
    blood_pressure = models.CharField(
        max_length=10,
        blank=True,
        default="",
        help_text="Blood pressure in format '120/80'",
    )

    # Obstetric examination
    fundal_height = models.DecimalField(
        max_digits=4,
        decimal_places=1,
        null=True,
        blank=True,
        validators=[MinValueValidator(Decimal("5.0")), MaxValueValidator(Decimal("50.0"))],
        help_text="Fundal height in cm",
    )
    fetal_heart_rate = models.PositiveSmallIntegerField(
        null=True,
        blank=True,
        validators=[MinValueValidator(80), MaxValueValidator(200)],
        help_text="Fetal heart rate in BPM (normal: 110-160)",
    )
    presentation = models.CharField(
        max_length=20,
        blank=True,
        default="",
        choices=PRESENTATION_CHOICES,
        help_text="Fetal presentation",
    )
    lie = models.CharField(
        max_length=20,
        blank=True,
        default="",
        choices=LIE_CHOICES,
        help_text="Fetal lie",
    )
    fetal_movements = models.BooleanField(
        null=True,
        blank=True,
        help_text="Whether fetal movements are present",
    )

    # Urine analysis
    urine_protein = models.CharField(
        max_length=10,
        blank=True,
        default="",
        choices=URINE_CHOICES,
        help_text="Urine protein level",
    )
    urine_glucose = models.CharField(
        max_length=10,
        blank=True,
        default="",
        choices=URINE_CHOICES,
        help_text="Urine glucose level",
    )

    # Investigations
    hb_level = models.DecimalField(
        max_digits=4,
        decimal_places=1,
        null=True,
        blank=True,
        validators=[MinValueValidator(Decimal("3.0")), MaxValueValidator(Decimal("20.0"))],
        help_text="Haemoglobin level in g/dL",
    )
    blood_sugar = models.DecimalField(
        max_digits=5,
        decimal_places=1,
        null=True,
        blank=True,
        help_text="Blood sugar in mmol/L",
    )
    hiv_test_done = models.BooleanField(
        default=False,
        help_text="Whether HIV test was done at this visit",
    )
    syphilis_test_done = models.BooleanField(
        default=False,
        help_text="Whether syphilis test was done at this visit",
    )

    # Supplements & prophylaxis
    iron_folate_given = models.BooleanField(
        default=False,
        help_text="Iron-folate supplement given",
    )
    calcium_given = models.BooleanField(
        default=False,
        help_text="Calcium supplement given",
    )
    deworming_given = models.BooleanField(
        default=False,
        help_text="Deworming medication given",
    )
    tetanus_toxoid_dose = models.PositiveSmallIntegerField(
        null=True,
        blank=True,
        validators=[MaxValueValidator(5)],
        help_text="Tetanus toxoid dose number given (1-5)",
    )

    # Scheduling & notes
    next_visit_date = models.DateField(
        null=True,
        blank=True,
        help_text="Next scheduled ANC visit date",
    )
    notes = models.TextField(
        blank=True,
        default="",
        help_text="Clinical notes",
    )

    # Staff
    conducted_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="anc_visits_conducted",
    )

    # Audit trail
    history = HistoricalRecords()

    class Meta:
        ordering = ["registration", "visit_number"]
        verbose_name = "ANC Visit"
        verbose_name_plural = "ANC Visits"
        unique_together = ["registration", "visit_number"]

    def __str__(self):
        return f"ANC Visit {self.visit_number} - {self.registration.mch_number}"

    def save(self, *args, **kwargs):
        """Auto-calculate gestation weeks from enrollment LMP."""
        if not self.gestation_weeks and self.registration.anc_enrollment:
            enrollment = self.registration.anc_enrollment
            if enrollment.lmp:
                days = (self.visit_date - enrollment.lmp).days
                self.gestation_weeks = max(0, days // 7)
        super().save(*args, **kwargs)

    @property
    def is_fetal_heart_rate_normal(self) -> bool | None:
        """Check if fetal heart rate is in normal range (110-160 BPM)."""
        if self.fetal_heart_rate is None:
            return None
        return 110 <= self.fetal_heart_rate <= 160

    def get_alerts(self) -> list[str]:
        """Return list of clinical alerts for this visit."""
        alerts = []
        if self.fetal_heart_rate:
            if self.fetal_heart_rate < 110:
                alerts.append(f"Fetal bradycardia: {self.fetal_heart_rate} BPM")
            elif self.fetal_heart_rate > 160:
                alerts.append(f"Fetal tachycardia: {self.fetal_heart_rate} BPM")

        if self.urine_protein and self.urine_protein not in ("NEGATIVE", "TRACE", ""):
            alerts.append(f"Proteinuria: {self.urine_protein}")

        if self.hb_level and self.hb_level < Decimal("10.0"):
            alerts.append(f"Anaemia: Hb {self.hb_level} g/dL")

        return alerts


# =============================================================================
# Delivery Model
# =============================================================================


class Delivery(HistoryMixin, TimeStampedModel):
    """
    Delivery record.

    Records delivery details, outcomes, and baby information.
    Auto-creates baby Patient record via signals when completed.
    """

    DELIVERY_TYPE_CHOICES = [
        ("SVD", "Spontaneous Vaginal Delivery"),
        ("ASSISTED_VAGINAL", "Assisted Vaginal Delivery"),
        ("ELECTIVE_CS", "Elective Cesarean Section"),
        ("EMERGENCY_CS", "Emergency Cesarean Section"),
        ("VACUUM", "Vacuum Extraction"),
        ("FORCEPS", "Forceps Delivery"),
    ]

    DELIVERY_OUTCOME_CHOICES = [
        ("LIVE_BIRTH", "Live Birth"),
        ("STILLBIRTH", "Stillbirth"),
        ("NEONATAL_DEATH", "Neonatal Death"),
        ("MATERNAL_DEATH", "Maternal Death"),
    ]

    PLACE_OF_DELIVERY_CHOICES = [
        ("FACILITY", "Health Facility"),
        ("HOME", "Home"),
        ("EN_ROUTE", "En Route to Facility"),
    ]

    STATUS_CHOICES = [
        ("PENDING", "Pending"),
        ("COMPLETED", "Completed"),
        ("REFERRED", "Referred"),
    ]

    GENDER_CHOICES = [
        ("M", "Male"),
        ("F", "Female"),
        ("O", "Other"),
    ]

    registration = models.ForeignKey(
        MCHRegistration,
        on_delete=models.PROTECT,
        related_name="deliveries",
        help_text="MCH registration this delivery belongs to",
    )
    partograph = models.OneToOneField(
        "mch.LabourPartograph",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="delivery",
        help_text="Labour partograph that culminated in this delivery",
    )
    admission = models.ForeignKey(
        "inpatient.Admission",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="deliveries",
        help_text="Maternity admission linked to this delivery",
    )

    # Delivery details
    delivery_date = models.DateField(
        default=date.today,
        help_text="Date of delivery",
    )
    delivery_time = models.TimeField(
        null=True,
        blank=True,
        help_text="Time of delivery",
    )
    delivery_type = models.CharField(
        max_length=30,
        choices=DELIVERY_TYPE_CHOICES,
        help_text="Type of delivery",
    )
    delivery_outcome = models.CharField(
        max_length=30,
        choices=DELIVERY_OUTCOME_CHOICES,
        help_text="Delivery outcome",
    )
    place_of_delivery = models.CharField(
        max_length=20,
        choices=PLACE_OF_DELIVERY_CHOICES,
        default="FACILITY",
        help_text="Place of delivery",
    )
    status = models.CharField(
        max_length=20,
        choices=STATUS_CHOICES,
        default="PENDING",
    )

    # Staff
    delivered_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="deliveries_conducted",
    )

    # Baby details
    baby_gender = models.CharField(
        max_length=1,
        choices=GENDER_CHOICES,
        blank=True,
        default="",
        help_text="Baby's gender",
    )
    birth_weight = models.DecimalField(
        max_digits=4,
        decimal_places=2,
        null=True,
        blank=True,
        validators=[MinValueValidator(Decimal("0.30")), MaxValueValidator(Decimal("8.00"))],
        help_text="Birth weight in kg",
    )
    apgar_score_1min = models.PositiveSmallIntegerField(
        null=True,
        blank=True,
        validators=[MaxValueValidator(10)],
        help_text="APGAR score at 1 minute (0-10)",
    )
    apgar_score_5min = models.PositiveSmallIntegerField(
        null=True,
        blank=True,
        validators=[MaxValueValidator(10)],
        help_text="APGAR score at 5 minutes (0-10)",
    )
    apgar_score_10min = models.PositiveSmallIntegerField(
        null=True,
        blank=True,
        validators=[MaxValueValidator(10)],
        help_text="APGAR score at 10 minutes (0-10)",
    )
    resuscitation_done = models.BooleanField(
        default=False,
        help_text="Whether neonatal resuscitation was performed",
    )

    # Baby patient record (auto-created via signal on delivery completion)
    baby_patient = models.ForeignKey(
        "patients.Patient",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="birth_delivery_record",
        help_text="Baby's patient record (auto-created on COMPLETED)",
    )

    # Complications
    maternal_complications = models.TextField(
        blank=True,
        default="",
        help_text="Maternal complications during delivery",
    )
    neonatal_complications = models.TextField(
        blank=True,
        default="",
        help_text="Neonatal complications",
    )
    blood_loss_ml = models.PositiveIntegerField(
        null=True,
        blank=True,
        help_text="Estimated blood loss in mL",
    )
    placenta_complete = models.BooleanField(
        default=True,
        help_text="Whether placenta was delivered complete",
    )

    # Notes
    notes = models.TextField(
        blank=True,
        default="",
    )

    # Audit trail
    history = HistoricalRecords()

    class Meta:
        ordering = ["-delivery_date"]
        verbose_name = "Delivery"
        verbose_name_plural = "Deliveries"

    def __str__(self):
        return (
            f"Delivery {self.delivery_date} - "
            f"{self.registration.mch_number} ({self.get_delivery_outcome_display()})"
        )

    def clean(self):
        """Validate linkage consistency across pregnancy, labour, and admission."""
        errors: dict[str, str] = {}

        if self.partograph_id:
            if self.partograph.registration_id != self.registration_id:
                errors["partograph"] = "Labour partograph must belong to the same MCH registration."
            if (
                self.admission_id
                and self.partograph.admission_id
                and self.partograph.admission_id != self.admission_id
            ):
                errors["admission"] = (
                    "Delivery admission must match the linked labour partograph admission."
                )

            # Validate delivery time falls within partograph window
            if self.delivery_date and self.delivery_time:
                delivery_dt = (
                    timezone.make_aware(
                        datetime.combine(self.delivery_date, self.delivery_time),
                        timezone.get_current_timezone(),
                    )
                    if timezone.is_naive(datetime.combine(self.delivery_date, self.delivery_time))
                    else datetime.combine(self.delivery_date, self.delivery_time)
                )
                partograph_start = self.partograph.started_at
                partograph_end = self.partograph.completed_at or timezone.now()
                # Allow 1h buffer for documentation lag
                buffer = timedelta(hours=1)
                if delivery_dt < partograph_start - buffer:
                    errors["delivery_time"] = (
                        f"Delivery time ({delivery_dt:%H:%M}) is before the partograph "
                        f"started ({partograph_start:%H:%M})."
                    )
                if delivery_dt > partograph_end + buffer:
                    errors["delivery_time"] = (
                        f"Delivery time ({delivery_dt:%H:%M}) is after the partograph "
                        f"completed ({partograph_end:%H:%M})."
                    )

        if self.admission_id:
            if self.admission.patient_id != self.registration.mother_id:
                errors["admission"] = "Admission patient must match the MCH registration mother."
            if (
                self.admission.mch_registration_id
                and self.admission.mch_registration_id != self.registration_id
            ):
                errors["admission"] = "Admission must belong to the same MCH registration."

        if errors:
            raise ValidationError(errors)

    def save(self, *args, **kwargs):
        """Keep delivery admission aligned with the linked labour record when possible."""
        if self.partograph_id and not self.admission_id and self.partograph.admission_id:
            self.admission_id = self.partograph.admission_id
        super().save(*args, **kwargs)

    @property
    def is_low_birth_weight(self) -> bool | None:
        """Check if birth weight < 2.5 kg."""
        if self.birth_weight is None:
            return None
        return self.birth_weight < Decimal("2.50")

    @property
    def is_macrosomia(self) -> bool | None:
        """Check if birth weight > 4.0 kg."""
        if self.birth_weight is None:
            return None
        return self.birth_weight > Decimal("4.00")

    def get_alerts(self) -> list[str]:
        """Return list of alerts for this delivery."""
        alerts = []
        if self.is_low_birth_weight:
            alerts.append(f"Low birth weight: {self.birth_weight} kg")
        if self.is_macrosomia:
            alerts.append(f"Macrosomia: {self.birth_weight} kg")
        if self.apgar_score_1min is not None and self.apgar_score_1min < 7:
            alerts.append(f"Low APGAR at 1 min: {self.apgar_score_1min}")
        if self.apgar_score_5min is not None and self.apgar_score_5min < 7:
            alerts.append(f"Low APGAR at 5 min: {self.apgar_score_5min}")
        if self.blood_loss_ml and self.blood_loss_ml > 500:
            alerts.append(f"Postpartum haemorrhage: {self.blood_loss_ml} mL")
        if not self.placenta_complete:
            alerts.append("Incomplete placenta - retained products risk")
        return alerts


# =============================================================================
# Labour Partograph Models
# =============================================================================


class LabourPartograph(HistoryMixin, TimeStampedModel):
    """Labour monitoring record with chartable partograph observations."""

    STATUS_CHOICES = [
        ("ACTIVE", "Active"),
        ("COMPLETED", "Completed"),
        ("REFERRED", "Referred"),
    ]

    MEMBRANE_STATUS_CHOICES = [
        ("INTACT", "Intact"),
        ("RUPTURED", "Ruptured"),
        ("UNKNOWN", "Unknown"),
    ]

    LIQUOR_CHOICES = [
        ("CLEAR", "Clear"),
        ("MECONIUM", "Meconium stained"),
        ("BLOOD_STAINED", "Blood stained"),
        ("OFFENSIVE", "Offensive"),
        ("UNKNOWN", "Unknown"),
    ]

    registration = models.ForeignKey(
        MCHRegistration,
        on_delete=models.CASCADE,
        related_name="labour_partographs",
        help_text="MCH registration being monitored in labour",
    )
    encounter = models.ForeignKey(
        "encounters.Encounter",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="labour_partographs",
        help_text="Linked clinical encounter, if available",
    )
    admission = models.ForeignKey(
        "inpatient.Admission",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="labour_partographs",
        help_text="Linked inpatient admission, if mother is admitted",
    )
    started_at = models.DateTimeField(
        default=timezone.now,
        help_text="When labour monitoring started",
    )
    status = models.CharField(
        max_length=20,
        choices=STATUS_CHOICES,
        default="ACTIVE",
        help_text="Current labour monitoring status",
    )
    parity = models.PositiveSmallIntegerField(
        null=True,
        blank=True,
        help_text="Maternal parity at labour onset",
    )
    gestation_weeks = models.PositiveSmallIntegerField(
        null=True,
        blank=True,
        validators=[MinValueValidator(20), MaxValueValidator(45)],
        help_text="Gestation in weeks at labour onset",
    )
    membrane_status = models.CharField(
        max_length=20,
        choices=MEMBRANE_STATUS_CHOICES,
        blank=True,
        default="",
        help_text="Whether membranes are intact or ruptured",
    )
    liquor = models.CharField(
        max_length=20,
        choices=LIQUOR_CHOICES,
        blank=True,
        default="",
        help_text="Liquor appearance when membranes rupture",
    )
    notes = models.TextField(
        blank=True,
        default="",
        help_text="General labour notes",
    )
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="labour_partographs_created",
    )
    completed_at = models.DateTimeField(
        null=True,
        blank=True,
        help_text="When the labour partograph was closed",
    )

    history = HistoricalRecords()

    class Meta:
        ordering = ["-started_at"]
        verbose_name = "Labour Partograph"
        verbose_name_plural = "Labour Partographs"

    def __str__(self):
        return f"Partograph {self.registration.mch_number} ({self.status})"

    def clean(self):
        """Validate labour-to-admission linkage consistency."""
        errors: dict[str, str] = {}

        if self.admission_id:
            if self.admission.patient_id != self.registration.mother_id:
                errors["admission"] = "Admission patient must match the MCH registration mother."
            if (
                self.admission.mch_registration_id
                and self.admission.mch_registration_id != self.registration_id
            ):
                errors["admission"] = "Admission must belong to the same MCH registration."
            if (
                self.encounter_id
                and self.admission.opd_encounter_id
                and self.admission.opd_encounter_id != self.encounter_id
            ):
                errors["encounter"] = (
                    "Labour encounter must match the linked admission OPD encounter when both are set."
                )

        if errors:
            raise ValidationError(errors)

    def save(self, *args, **kwargs):
        if self.parity is None and self.registration.anc_enrollment:
            self.parity = self.registration.anc_enrollment.para

        if self.gestation_weeks is None and self.registration.anc_enrollment:
            enrollment = self.registration.anc_enrollment
            weeks = enrollment.gestation_weeks()
            if weeks is None and enrollment.edd:
                # Derive from EDD: gestation at labour start = 40 - weeks_until_edd
                ref_date = (self.started_at or timezone.now()).date()
                days_until_edd = (enrollment.edd - ref_date).days
                weeks = max(0, (280 - days_until_edd) // 7)
            self.gestation_weeks = weeks

        if self.status != "ACTIVE" and self.completed_at is None:
            self.completed_at = timezone.now()

        if self.status == "ACTIVE":
            self.completed_at = None

        super().save(*args, **kwargs)

    @property
    def latest_observation(self):
        return self.observations.order_by("-observation_time").first()


class LabourPartographObservation(HistoryMixin, TimeStampedModel):
    """Single charted labour observation on a partograph timeline."""

    MOULDING_CHOICES = [
        ("0", "None"),
        ("+", "+"),
        ("++", "++"),
        ("+++", "+++"),
    ]

    partograph = models.ForeignKey(
        LabourPartograph,
        on_delete=models.CASCADE,
        related_name="observations",
        help_text="Partograph this observation belongs to",
    )
    observation_time = models.DateTimeField(
        help_text="Time this observation was taken",
    )
    recorded_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="labour_partograph_observations",
    )
    fetal_heart_rate = models.PositiveSmallIntegerField(
        null=True,
        blank=True,
        validators=[MinValueValidator(80), MaxValueValidator(200)],
        help_text="Fetal heart rate in beats per minute",
    )
    cervical_dilation_cm = models.DecimalField(
        max_digits=3,
        decimal_places=1,
        null=True,
        blank=True,
        validators=[MinValueValidator(Decimal("0.0")), MaxValueValidator(Decimal("10.0"))],
        help_text="Cervical dilation in cm",
    )
    descent_fifths = models.PositiveSmallIntegerField(
        null=True,
        blank=True,
        validators=[MinValueValidator(0), MaxValueValidator(5)],
        help_text="Descent of head in fifths palpable abdominally",
    )
    contractions_per_10_min = models.PositiveSmallIntegerField(
        null=True,
        blank=True,
        validators=[MinValueValidator(0), MaxValueValidator(10)],
        help_text="Number of contractions in 10 minutes",
    )
    contraction_duration_seconds = models.PositiveSmallIntegerField(
        null=True,
        blank=True,
        validators=[MinValueValidator(0), MaxValueValidator(180)],
        help_text="Approximate contraction duration in seconds",
    )
    contraction_intensity = models.CharField(
        max_length=10,
        choices=[
            ("MILD", "Mild"),
            ("MODERATE", "Moderate"),
            ("STRONG", "Strong"),
        ],
        blank=True,
        default="",
        help_text="Contraction strength: mild, moderate, or strong",
    )
    moulding = models.CharField(
        max_length=3,
        choices=MOULDING_CHOICES,
        blank=True,
        default="",
        help_text="Fetal skull moulding grade",
    )
    maternal_pulse = models.PositiveSmallIntegerField(
        null=True,
        blank=True,
        validators=[MinValueValidator(0), MaxValueValidator(250)],
        help_text="Maternal pulse rate",
    )
    maternal_blood_pressure = models.CharField(
        max_length=10,
        blank=True,
        default="",
        help_text="Maternal blood pressure in format 120/80",
    )
    maternal_temperature = models.DecimalField(
        max_digits=4,
        decimal_places=1,
        null=True,
        blank=True,
        validators=[MinValueValidator(Decimal("30.0")), MaxValueValidator(Decimal("45.0"))],
        help_text="Maternal temperature in °C",
    )
    urine_volume_ml = models.PositiveIntegerField(
        null=True,
        blank=True,
        help_text="Measured urine volume in mL",
    )
    urine_protein = models.CharField(
        max_length=10,
        blank=True,
        default="",
        choices=ANCVisit.URINE_CHOICES,
        help_text="Urine protein result",
    )
    urine_acetone = models.CharField(
        max_length=10,
        blank=True,
        default="",
        choices=ANCVisit.URINE_CHOICES,
        help_text="Urine acetone result",
    )
    oxytocin_drops_per_min = models.PositiveSmallIntegerField(
        null=True,
        blank=True,
        help_text="Oxytocin infusion rate in drops per minute",
    )
    medications = models.TextField(
        blank=True,
        default="",
        help_text="Medications or interventions given",
    )
    notes = models.TextField(
        blank=True,
        default="",
        help_text="Additional labour notes",
    )

    history = HistoricalRecords()

    class Meta:
        ordering = ["observation_time"]
        verbose_name = "Labour Partograph Observation"
        verbose_name_plural = "Labour Partograph Observations"
        indexes = [models.Index(fields=["partograph", "observation_time"])]

    def __str__(self):
        return (
            f"Observation {self.observation_time:%Y-%m-%d %H:%M} "
            f"for {self.partograph.registration.mch_number}"
        )

    @staticmethod
    def _ensure_datetime(value):
        """Coerce a string or datetime to a timezone-aware datetime, or return None."""
        if value is None:
            return None
        if isinstance(value, str):
            from django.utils.dateparse import parse_datetime as _parse

            value = _parse(value)
            if value is None:
                return None
        if isinstance(value, datetime) and timezone.is_naive(value):
            value = timezone.make_aware(value, timezone.get_current_timezone())
        return value

    def get_alerts(self) -> list[str]:
        alerts = []
        dilation_value = self.cervical_dilation_cm
        if dilation_value not in (None, "") and not isinstance(dilation_value, Decimal):
            try:
                dilation_value = Decimal(str(dilation_value))
            except Exception:
                dilation_value = None

        if self.fetal_heart_rate is not None:
            if self.fetal_heart_rate < 110:
                alerts.append(f"Fetal bradycardia: {self.fetal_heart_rate} BPM")
            elif self.fetal_heart_rate > 160:
                alerts.append(f"Fetal tachycardia: {self.fetal_heart_rate} BPM")

        if dilation_value is not None and dilation_value >= Decimal("8.0"):
            alerts.append(f"Advanced labour: {dilation_value} cm")

        if self.urine_protein and self.urine_protein not in ("", "NEGATIVE", "TRACE"):
            alerts.append(f"Proteinuria: {self.urine_protein}")

        # WHO alert / action line check
        if dilation_value is not None and dilation_value >= Decimal("4.0"):
            self._check_who_lines(dilation_value, alerts)

        # Urine completeness: flag if >4h since last urine assessment
        self._check_urine_gap(alerts)

        return alerts

    def _check_urine_gap(self, alerts: list[str]) -> None:
        """Flag if >4 hours have passed since last urine assessment."""
        obs_time = self._ensure_datetime(self.observation_time)
        if obs_time is None:
            return

        last_urine = (
            self.partograph.observations.filter(
                observation_time__lt=self.observation_time,
                urine_volume_ml__isnull=False,
            )
            .order_by("-observation_time")
            .values_list("observation_time", flat=True)
            .first()
        )
        if last_urine is None:
            # Check hours since partograph start
            started = self._ensure_datetime(self.partograph.started_at)
            if started is None:
                return
            hours = (obs_time - started).total_seconds() / 3600
            if hours >= 4 and self.urine_volume_ml is None:
                alerts.append("Urine assessment overdue (>4h since admission)")
        elif self.urine_volume_ml is None:
            hours = (obs_time - last_urine).total_seconds() / 3600
            if hours >= 4:
                alerts.append(f"Urine assessment overdue ({hours:.0f}h since last)")

    def _check_who_lines(self, dilation_value: Decimal, alerts: list[str]) -> None:
        """Check dilation progress against the WHO alert and action lines.

        Alert line: starts at 4 cm at the time the first observation >= 4 cm
        is recorded, then rises at 1 cm/hr.
        Action line: 4 hours to the right of the alert line.
        """
        obs_time = self._ensure_datetime(self.observation_time)
        if obs_time is None:
            return

        first_active = (
            self.partograph.observations.filter(
                cervical_dilation_cm__gte=Decimal("4.0"),
            )
            .order_by("observation_time")
            .values_list("observation_time", flat=True)
            .first()
        )
        if first_active is None:
            return
        hours_elapsed = (obs_time - first_active).total_seconds() / 3600
        if hours_elapsed < 0:
            return
        expected_alert = Decimal("4.0") + Decimal(str(round(hours_elapsed, 2)))
        expected_action = Decimal("4.0") + Decimal(str(round(max(0, hours_elapsed - 4), 2)))

        if hours_elapsed >= 4 and dilation_value < min(expected_action, Decimal("10.0")):
            alerts.append(
                f"Crossed ACTION line: expected ≥{min(expected_action, Decimal('10.0')):.1f} cm, "
                f"actual {dilation_value} cm"
            )
        elif dilation_value < min(expected_alert, Decimal("10.0")):
            alerts.append(
                f"Crossed ALERT line: expected ≥{min(expected_alert, Decimal('10.0')):.1f} cm, "
                f"actual {dilation_value} cm"
            )

        return alerts


# =============================================================================
# PNC Visit Model
# =============================================================================


class PNCVisit(HistoryMixin, TimeStampedModel):
    """
    Postnatal Care visit record.

    Standard schedule: within 48hrs, 3-7 days, 8-14 days, 6 weeks post-delivery.
    Assesses both mother and baby.
    """

    LOCHIA_CHOICES = [
        ("NORMAL", "Normal"),
        ("HEAVY", "Heavy"),
        ("FOUL_SMELLING", "Foul Smelling"),
        ("ABSENT", "Absent"),
    ]

    BREAST_CONDITION_CHOICES = [
        ("NORMAL", "Normal"),
        ("ENGORGED", "Engorged"),
        ("MASTITIS", "Mastitis"),
        ("CRACKED_NIPPLES", "Cracked Nipples"),
        ("ABSCESS", "Abscess"),
    ]

    CORD_STATUS_CHOICES = [
        ("CLEAN", "Clean"),
        ("INFECTED", "Infected"),
        ("SEPARATED", "Separated"),
    ]

    BREASTFEEDING_STATUS_CHOICES = [
        ("EXCLUSIVE", "Exclusive Breastfeeding"),
        ("MIXED", "Mixed Feeding"),
        ("FORMULA", "Formula Feeding"),
        ("NOT_FEEDING", "Not Feeding"),
    ]

    MOOD_CHOICES = [
        ("NORMAL", "Normal"),
        ("MILDLY_LOW", "Mildly Low Mood"),
        ("DEPRESSED", "Possibly Depressed"),
        ("SEVERELY_DEPRESSED", "Severely Depressed - Requires Referral"),
    ]

    registration = models.ForeignKey(
        MCHRegistration,
        on_delete=models.PROTECT,
        related_name="pnc_visits",
        help_text="MCH registration this PNC visit belongs to",
    )

    encounter = models.ForeignKey(
        "encounters.Encounter",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="pnc_visits",
    )
    admission = models.ForeignKey(
        "inpatient.Admission",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="pnc_visits",
        help_text="Linked postpartum admission, if this PNC visit follows inpatient care",
    )
    discharge = models.ForeignKey(
        "inpatient.Discharge",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="pnc_visits",
        help_text="Linked inpatient discharge that this PNC follow-up references",
    )
    clinic_visit = models.OneToOneField(
        "clinics.ClinicVisit",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="pnc_visit",
        help_text="Canonical clinic visit for this attended PNC consultation",
    )

    # Visit details
    visit_number = models.PositiveSmallIntegerField(
        validators=[MinValueValidator(1), MaxValueValidator(10)],
        help_text="PNC visit number (1=within 48hrs, 2=3-7d, 3=8-14d, 4=6wks)",
    )
    visit_date = models.DateField(
        default=date.today,
        help_text="Date of PNC visit",
    )
    days_postpartum = models.PositiveSmallIntegerField(
        null=True,
        blank=True,
        editable=False,
        help_text="Auto-calculated days since delivery",
    )

    # Mother assessment
    blood_pressure = models.CharField(
        max_length=10,
        blank=True,
        default="",
        help_text="Blood pressure in format '120/80'",
    )
    temperature = models.DecimalField(
        max_digits=4,
        decimal_places=1,
        null=True,
        blank=True,
        validators=[MinValueValidator(Decimal("34.0")), MaxValueValidator(Decimal("42.0"))],
        help_text="Temperature in °C",
    )
    uterine_involution = models.TextField(
        blank=True,
        default="",
        help_text="Uterine involution assessment",
    )
    lochia = models.CharField(
        max_length=20,
        blank=True,
        default="",
        choices=LOCHIA_CHOICES,
        help_text="Lochia assessment",
    )
    breast_condition = models.CharField(
        max_length=30,
        blank=True,
        default="",
        choices=BREAST_CONDITION_CHOICES,
        help_text="Breast condition",
    )
    mood_assessment = models.CharField(
        max_length=30,
        blank=True,
        default="",
        choices=MOOD_CHOICES,
        help_text="Postpartum depression screening",
    )

    # Baby assessment
    baby_weight = models.DecimalField(
        max_digits=4,
        decimal_places=2,
        null=True,
        blank=True,
        validators=[MinValueValidator(Decimal("0.30")), MaxValueValidator(Decimal("15.00"))],
        help_text="Baby weight in kg",
    )
    baby_temperature = models.DecimalField(
        max_digits=4,
        decimal_places=1,
        null=True,
        blank=True,
        validators=[MinValueValidator(Decimal("34.0")), MaxValueValidator(Decimal("42.0"))],
        help_text="Baby temperature in °C",
    )
    cord_status = models.CharField(
        max_length=20,
        blank=True,
        default="",
        choices=CORD_STATUS_CHOICES,
        help_text="Umbilical cord status",
    )
    breastfeeding_status = models.CharField(
        max_length=20,
        blank=True,
        default="",
        choices=BREASTFEEDING_STATUS_CHOICES,
        help_text="Breastfeeding status",
    )

    # Family planning
    family_planning_counselling = models.BooleanField(
        default=False,
        help_text="Whether family planning counselling was provided",
    )
    contraceptive_given = models.CharField(
        max_length=100,
        blank=True,
        default="",
        help_text="Contraceptive method provided (if any)",
    )

    # Staff & notes
    conducted_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="pnc_visits_conducted",
    )
    notes = models.TextField(
        blank=True,
        default="",
    )

    # Audit trail
    history = HistoricalRecords()

    class Meta:
        ordering = ["registration", "visit_number"]
        verbose_name = "PNC Visit"
        verbose_name_plural = "PNC Visits"
        unique_together = ["registration", "visit_number"]

    def __str__(self):
        return f"PNC Visit {self.visit_number} - {self.registration.mch_number}"

    def clean(self):
        """Validate postpartum continuity across pregnancy, admission, and discharge."""
        errors: dict[str, str] = {}

        linked_admission = self.admission
        if self.discharge_id:
            discharge_admission = self.discharge.admission
            if linked_admission and discharge_admission.id != linked_admission.id:
                errors["discharge"] = (
                    "Discharge must belong to the same admission linked to this PNC visit."
                )
            linked_admission = discharge_admission

        if linked_admission:
            if linked_admission.patient_id != self.registration.mother_id:
                errors["admission"] = "Admission patient must match the MCH registration mother."
            if (
                linked_admission.mch_registration_id
                and linked_admission.mch_registration_id != self.registration_id
            ):
                errors["admission"] = "Admission must belong to the same MCH registration."

        if self.discharge_id and self.discharge.admission.patient_id != self.registration.mother_id:
            errors["discharge"] = (
                "Discharge admission patient must match the MCH registration mother."
            )

        if errors:
            raise ValidationError(errors)

    def save(self, *args, **kwargs):
        """Auto-calculate days postpartum from delivery date."""
        if self.discharge_id and not self.admission_id:
            self.admission = self.discharge.admission
        deliveries = self.registration.deliveries.filter(status="COMPLETED")
        if deliveries.exists():
            latest_delivery = deliveries.order_by("-delivery_date").first()
            if latest_delivery:
                self.days_postpartum = (self.visit_date - latest_delivery.delivery_date).days
        super().save(*args, **kwargs)

    def get_alerts(self) -> list[str]:
        """Return list of alerts for this PNC visit."""
        alerts = []
        if self.lochia == "FOUL_SMELLING":
            alerts.append("Foul-smelling lochia - possible infection")
        if self.breast_condition in ("MASTITIS", "ABSCESS"):
            alerts.append(f"Breast condition: {self.get_breast_condition_display()}")
        if self.cord_status == "INFECTED":
            alerts.append("Infected umbilical cord")
        if self.mood_assessment in ("DEPRESSED", "SEVERELY_DEPRESSED"):
            alerts.append(f"Postpartum depression screening: {self.get_mood_assessment_display()}")
        if self.temperature and self.temperature >= Decimal("38.0"):
            alerts.append(f"Maternal fever: {self.temperature}°C")
        if self.baby_temperature and self.baby_temperature >= Decimal("38.0"):
            alerts.append(f"Baby fever: {self.baby_temperature}°C")
        return alerts


# =============================================================================
# Community Screening Model
# =============================================================================


class CommunityScreening(HistoryMixin, TimeStampedModel):
    """Community outreach screening record captured by CHWs in the field."""

    SCREENING_TYPE_CHOICES = [
        ("MALNUTRITION", "Malnutrition Screening"),
        ("TB_CONTACT", "TB Contact Tracing"),
        ("MALARIA_RDT", "Malaria RDT"),
    ]

    MALARIA_RDT_RESULT_CHOICES = [
        ("positive", "Positive"),
        ("negative", "Negative"),
        ("invalid", "Invalid"),
        ("not_done", "Not Done"),
    ]

    patient = models.ForeignKey(
        "patients.Patient",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="community_screenings",
        help_text="Linked patient record if the client already exists in HMIS.",
    )
    patient_name_snapshot = models.CharField(
        max_length=200,
        blank=True,
        default="",
        help_text="Name captured during the outreach visit when no patient record is linked.",
    )
    patient_mrn_snapshot = models.CharField(
        max_length=50,
        blank=True,
        default="",
        help_text="MRN snapshot captured at time of screening.",
    )
    screening_type = models.CharField(
        max_length=20,
        choices=SCREENING_TYPE_CHOICES,
        help_text="Type of community screening performed.",
    )
    screening_date = models.DateField(
        default=date.today,
        help_text="Date the field screening was conducted.",
    )
    chu_name = models.CharField(
        max_length=150,
        blank=True,
        default="",
        help_text="Community Health Unit (CHU) name.",
    )
    territory = models.CharField(
        max_length=150,
        blank=True,
        default="",
        help_text="Village, cluster, or territory covered during the visit.",
    )
    result_summary = models.CharField(
        max_length=255,
        blank=True,
        default="",
        help_text="Compact summary derived from the screening findings.",
    )
    notes = models.TextField(
        blank=True,
        default="",
        help_text="Free-text outreach notes or referral details.",
    )
    muac_mm = models.PositiveIntegerField(
        null=True,
        blank=True,
        validators=[MinValueValidator(50), MaxValueValidator(400)],
        help_text="MUAC in millimetres for malnutrition screening.",
    )
    edema_present = models.BooleanField(
        null=True,
        blank=True,
        help_text="Whether bilateral oedema was present.",
    )
    fever_present = models.BooleanField(
        null=True,
        blank=True,
        help_text="Whether the client had fever during malaria screening.",
    )
    cough_duration_days = models.PositiveIntegerField(
        null=True,
        blank=True,
        validators=[MaxValueValidator(365)],
        help_text="Number of days of cough during TB contact tracing.",
    )
    household_contact_name = models.CharField(
        max_length=200,
        blank=True,
        default="",
        help_text="Household or index contact associated with TB tracing.",
    )
    malaria_rdt_result = models.CharField(
        max_length=20,
        blank=True,
        default="",
        choices=MALARIA_RDT_RESULT_CHOICES,
        help_text="Malaria rapid diagnostic test result.",
    )
    malaria_treatment_referred = models.BooleanField(
        null=True,
        blank=True,
        help_text="Whether treatment or referral was made after malaria screening.",
    )
    tb_referral_made = models.BooleanField(
        null=True,
        blank=True,
        help_text="Whether TB referral was made.",
    )
    location = models.JSONField(
        null=True,
        blank=True,
        help_text="Captured GPS coordinates and accuracy metadata.",
    )
    photo = models.FileField(
        upload_to="community_screenings/%Y/%m/",
        null=True,
        blank=True,
        help_text="Optional field photo attached to the screening record.",
    )
    captured_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="community_screenings_captured",
    )

    history = HistoricalRecords()

    class Meta:
        ordering = ["-screening_date", "-created_at"]
        verbose_name = "Community Screening"
        verbose_name_plural = "Community Screenings"
        indexes = [
            models.Index(fields=["screening_type", "screening_date"]),
            models.Index(fields=["patient", "updated_at"]),
        ]

    def __str__(self):
        return f"{self.get_screening_type_display()} - {self.patient_name or 'Unlinked client'} ({self.screening_date})"

    @property
    def patient_name(self) -> str | None:
        if self.patient:
            return f"{self.patient.first_name} {self.patient.last_name}".strip()
        return self.patient_name_snapshot or None

    @property
    def patient_mrn(self) -> str | None:
        if self.patient:
            return self.patient.mrn
        return self.patient_mrn_snapshot or None

    def build_result_summary(self) -> str:
        if self.screening_type == "MALNUTRITION":
            parts = [f"MUAC {self.muac_mm if self.muac_mm is not None else 'n/a'} mm"]
            if self.edema_present:
                parts.append("edema present")
            return " · ".join(parts)

        if self.screening_type == "TB_CONTACT":
            parts = []
            if self.cough_duration_days is not None:
                parts.append(f"{self.cough_duration_days} day cough")
            if self.household_contact_name:
                parts.append(f"contact {self.household_contact_name}")
            return " · ".join(parts) or "TB contact screening recorded"

        result = self.malaria_rdt_result or "not_done"
        return f"RDT {result.replace('_', ' ')}"

    def save(self, *args, **kwargs):
        if self.patient:
            self.patient_name_snapshot = self.patient_name_snapshot or self.patient_name or ""
            self.patient_mrn_snapshot = self.patient_mrn_snapshot or self.patient_mrn or ""
        self.result_summary = self.build_result_summary()
        super().save(*args, **kwargs)


# =============================================================================
# Growth Measurement Model
# =============================================================================


class GrowthMeasurement(HistoryMixin, TimeStampedModel):
    """
    Pediatric growth measurement with WHO Z-score calculation.

    Tracks weight, height/length, head circumference, and MUAC.
    Auto-calculates WHO Z-scores on save.
    """

    MUAC_CLASSIFICATION_CHOICES = [
        ("NORMAL", "Normal"),
        ("MAM", "Moderate Acute Malnutrition"),
        ("SAM", "Severe Acute Malnutrition"),
    ]

    NUTRITIONAL_STATUS_CHOICES = [
        ("NORMAL", "Normal"),
        ("MILD_UNDERWEIGHT", "Mild Underweight"),
        ("MODERATE_UNDERWEIGHT", "Moderate Underweight"),
        ("SEVERE_UNDERWEIGHT", "Severe Underweight"),
        ("OVERWEIGHT", "Overweight"),
        ("OBESE", "Obese"),
    ]

    patient = models.ForeignKey(
        "patients.Patient",
        on_delete=models.PROTECT,
        related_name="growth_measurements",
        help_text="Child patient",
    )

    encounter = models.ForeignKey(
        "encounters.Encounter",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="growth_measurements",
    )

    measured_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="growth_measurements_recorded",
    )

    # Measurement details
    measurement_date = models.DateField(
        default=date.today,
        help_text="Date of measurement",
    )
    age_in_days = models.PositiveIntegerField(
        editable=False,
        null=True,
        blank=True,
        help_text="Age in days at time of measurement (auto-calculated)",
    )

    # Anthropometric measurements
    weight = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        null=True,
        blank=True,
        validators=[MinValueValidator(Decimal("0.30")), MaxValueValidator(Decimal("100.00"))],
        help_text="Weight in kg",
    )
    height = models.DecimalField(
        max_digits=5,
        decimal_places=1,
        null=True,
        blank=True,
        validators=[MinValueValidator(Decimal("20.0")), MaxValueValidator(Decimal("200.0"))],
        help_text="Height/length in cm (length for <2yr, height for ≥2yr)",
    )
    head_circumference = models.DecimalField(
        max_digits=4,
        decimal_places=1,
        null=True,
        blank=True,
        validators=[MinValueValidator(Decimal("20.0")), MaxValueValidator(Decimal("65.0"))],
        help_text="Head circumference in cm",
    )
    muac = models.DecimalField(
        max_digits=4,
        decimal_places=1,
        null=True,
        blank=True,
        validators=[MinValueValidator(Decimal("5.0")), MaxValueValidator(Decimal("40.0"))],
        help_text="Mid-Upper Arm Circumference in cm",
    )

    # WHO Z-scores (auto-calculated on save)
    weight_for_age_z = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        null=True,
        blank=True,
        editable=False,
        help_text="Weight-for-age Z-score",
    )
    height_for_age_z = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        null=True,
        blank=True,
        editable=False,
        help_text="Height/length-for-age Z-score",
    )
    weight_for_height_z = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        null=True,
        blank=True,
        editable=False,
        help_text="Weight-for-height Z-score",
    )
    bmi_for_age_z = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        null=True,
        blank=True,
        editable=False,
        help_text="BMI-for-age Z-score",
    )
    head_circumference_for_age_z = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        null=True,
        blank=True,
        editable=False,
        help_text="Head circumference-for-age Z-score",
    )

    # Classification (auto-set on save)
    muac_classification = models.CharField(
        max_length=10,
        blank=True,
        default="",
        choices=MUAC_CLASSIFICATION_CHOICES,
        help_text="MUAC-based malnutrition classification",
    )
    nutritional_status = models.CharField(
        max_length=30,
        blank=True,
        default="",
        choices=NUTRITIONAL_STATUS_CHOICES,
        help_text="Overall nutritional status from Z-scores",
    )

    # Notes
    notes = models.TextField(
        blank=True,
        default="",
    )

    # Audit trail
    history = HistoricalRecords()

    class Meta:
        ordering = ["-measurement_date"]
        verbose_name = "Growth Measurement"
        verbose_name_plural = "Growth Measurements"

    def __str__(self):
        return f"Growth {self.measurement_date} - {self.patient}"

    def save(self, *args, **kwargs):
        """Auto-calculate age, Z-scores, and classifications on save."""
        # Calculate age in days
        if self.patient and self.patient.date_of_birth:
            self.age_in_days = (self.measurement_date - self.patient.date_of_birth).days

        # Calculate Z-scores
        self._calculate_z_scores()

        # Classify MUAC
        self._classify_muac()

        # Classify nutritional status from Z-scores
        self._classify_nutritional_status()

        super().save(*args, **kwargs)

    def _calculate_z_scores(self):
        """Calculate WHO Z-scores using the growth calculator service."""
        if not self.age_in_days or not self.patient:
            return

        try:
            from hmis.apps.mch.services.growth import WHOGrowthCalculator

            calculator = WHOGrowthCalculator()
            sex = self.patient.gender  # 'M' or 'F'

            if self.weight:
                self.weight_for_age_z = calculator.weight_for_age_z(
                    float(self.weight), self.age_in_days, sex
                )

            if self.height:
                self.height_for_age_z = calculator.height_for_age_z(
                    float(self.height), self.age_in_days, sex
                )

            if self.weight and self.height:
                self.weight_for_height_z = calculator.weight_for_height_z(
                    float(self.weight), float(self.height), sex
                )

                # BMI-for-age
                height_m = float(self.height) / 100
                if height_m > 0:
                    bmi = float(self.weight) / (height_m**2)
                    self.bmi_for_age_z = calculator.bmi_for_age_z(bmi, self.age_in_days, sex)

            if self.head_circumference:
                self.head_circumference_for_age_z = calculator.head_circumference_for_age_z(
                    float(self.head_circumference), self.age_in_days, sex
                )
        except Exception:
            # Z-score calculation is optional; don't prevent saving
            pass

    def _classify_muac(self):
        """Classify MUAC for children 6-59 months."""
        if not self.muac or not self.age_in_days:
            return

        age_months = self.age_in_days / 30.44  # Average days per month

        if 6 <= age_months <= 59:
            muac_cm = float(self.muac)
            if muac_cm < 11.5:
                self.muac_classification = "SAM"
            elif muac_cm < 12.5:
                self.muac_classification = "MAM"
            else:
                self.muac_classification = "NORMAL"

    def _classify_nutritional_status(self):
        """Classify overall nutritional status from Z-scores.

        Uses weight-for-age Z-score for children ≤10y.
        Falls back to BMI-for-age Z-score for children >10y
        (WHO does not provide weight-for-age after 10 years).
        """
        z = self.weight_for_age_z
        if z is None:
            z = self.bmi_for_age_z
        if z is None:
            return

        z_float = float(z)
        if z_float < -3:
            self.nutritional_status = "SEVERE_UNDERWEIGHT"
        elif z_float < -2:
            self.nutritional_status = "MODERATE_UNDERWEIGHT"
        elif z_float < -1:
            self.nutritional_status = "MILD_UNDERWEIGHT"
        elif z_float <= 1:
            self.nutritional_status = "NORMAL"
        elif z_float <= 2:
            self.nutritional_status = "OVERWEIGHT"
        else:
            self.nutritional_status = "OBESE"

    def has_critical_flag(self) -> bool:
        """Return True if any Z-score < -3 (severe) or MUAC indicates SAM."""
        if self.muac_classification == "SAM":
            return True
        for z in [
            self.weight_for_age_z,
            self.height_for_age_z,
            self.weight_for_height_z,
            self.bmi_for_age_z,
        ]:
            if z is not None and float(z) < -3:
                return True
        return False

    def get_alerts(self) -> list[str]:
        """Return list of growth alerts."""
        alerts = []
        if self.muac_classification == "SAM":
            alerts.append(f"SEVERE ACUTE MALNUTRITION: MUAC {self.muac} cm")
        elif self.muac_classification == "MAM":
            alerts.append(f"Moderate acute malnutrition: MUAC {self.muac} cm")

        if self.weight_for_age_z is not None and float(self.weight_for_age_z) < -3:
            alerts.append(f"Severely underweight: WAZ {self.weight_for_age_z}")
        if self.height_for_age_z is not None and float(self.height_for_age_z) < -3:
            alerts.append(f"Severe stunting: HAZ {self.height_for_age_z}")
        if self.weight_for_height_z is not None and float(self.weight_for_height_z) < -3:
            alerts.append(f"Severe wasting: WHZ {self.weight_for_height_z}")

        return alerts


# =============================================================================
# KEPI Immunization Models
# =============================================================================


class Vaccine(TimeStampedModel):
    """
    Vaccine reference data for Kenya Expanded Programme on Immunization (KEPI).

    Seeded via management command from kepi_schedule.json.
    """

    ROUTE_CHOICES = [
        ("ORAL", "Oral"),
        ("IM", "Intramuscular"),
        ("SC", "Subcutaneous"),
        ("ID", "Intradermal"),
    ]

    code = models.CharField(
        max_length=30,
        unique=True,
        help_text="Vaccine code (e.g., BCG, PENTA1, OPV0)",
    )
    name = models.CharField(
        max_length=200,
        help_text="Full vaccine name",
    )
    description = models.TextField(
        blank=True,
        default="",
        help_text="Description and notes",
    )
    disease_target = models.CharField(
        max_length=200,
        blank=True,
        default="",
        help_text="Disease(s) targeted",
    )
    standard_age_days = models.PositiveIntegerField(
        help_text="Standard age for administration in days from birth",
    )
    route = models.CharField(
        max_length=5,
        choices=ROUTE_CHOICES,
        blank=True,
        default="",
        help_text="Route of administration",
    )
    dose_number = models.PositiveSmallIntegerField(
        default=1,
        help_text="Dose number in the series (e.g., 1 for Penta1, 2 for Penta2)",
    )
    series_name = models.CharField(
        max_length=50,
        blank=True,
        default="",
        help_text="Name of the vaccine series (e.g., 'Pentavalent' for Penta1/2/3)",
    )
    is_active = models.BooleanField(
        default=True,
        help_text="Whether this vaccine is currently in the KEPI schedule",
    )

    class Meta:
        ordering = ["standard_age_days", "code"]
        verbose_name = "Vaccine"
        verbose_name_plural = "Vaccines"

    def __str__(self):
        return f"{self.code} - {self.name}"


class ImmunizationRecord(HistoryMixin, TimeStampedModel):
    """
    Child immunization record.

    Tracks scheduled and administered vaccines per KEPI schedule.
    """

    STATUS_CHOICES = [
        ("SCHEDULED", "Scheduled"),
        ("ADMINISTERED", "Administered"),
        ("MISSED", "Missed"),
        ("CONTRAINDICATED", "Contraindicated"),
        ("DEFERRED", "Deferred"),
    ]

    SITE_CHOICES = [
        ("LEFT_ARM", "Left Upper Arm"),
        ("RIGHT_ARM", "Right Upper Arm"),
        ("LEFT_THIGH", "Left Thigh"),
        ("RIGHT_THIGH", "Right Thigh"),
        ("ORAL", "Oral"),
    ]

    patient = models.ForeignKey(
        "patients.Patient",
        on_delete=models.PROTECT,
        related_name="immunizations",
        help_text="Child patient",
    )
    vaccine = models.ForeignKey(
        Vaccine,
        on_delete=models.PROTECT,
        related_name="immunization_records",
        help_text="Vaccine administered/scheduled",
    )

    # Schedule
    scheduled_date = models.DateField(
        help_text="Scheduled date for administration (DOB + standard_age_days)",
    )
    administered_date = models.DateField(
        null=True,
        blank=True,
        help_text="Actual date of administration",
    )
    status = models.CharField(
        max_length=20,
        choices=STATUS_CHOICES,
        default="SCHEDULED",
    )

    # Administration details
    dose_number = models.PositiveSmallIntegerField(
        default=1,
        help_text="Dose number in series",
    )
    batch_number = models.CharField(
        max_length=50,
        blank=True,
        default="",
        help_text="Vaccine batch number",
    )
    lot_number = models.CharField(
        max_length=50,
        blank=True,
        default="",
        help_text="Vaccine lot number",
    )
    expiry_date = models.DateField(
        null=True,
        blank=True,
        help_text="Vaccine expiry date",
    )
    site = models.CharField(
        max_length=20,
        blank=True,
        default="",
        choices=SITE_CHOICES,
        help_text="Administration site",
    )

    # Staff
    administered_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="immunizations_administered",
    )

    # Next dose
    next_dose_date = models.DateField(
        null=True,
        blank=True,
        help_text="Next dose date if multi-dose series",
    )

    # Notes
    notes = models.TextField(
        blank=True,
        default="",
    )

    # Audit trail
    history = HistoricalRecords()

    class Meta:
        ordering = ["patient", "scheduled_date"]
        verbose_name = "Immunization Record"
        verbose_name_plural = "Immunization Records"
        unique_together = ["patient", "vaccine"]

    def __str__(self):
        return f"{self.vaccine.code} - {self.patient} ({self.get_status_display()})"

    @property
    def is_overdue(self) -> bool:
        """Check if vaccination is overdue."""
        if self.status != "SCHEDULED":
            return False
        return self.scheduled_date < date.today()

    @property
    def days_overdue(self) -> int | None:
        """Days past scheduled date."""
        if not self.is_overdue:
            return None
        return (date.today() - self.scheduled_date).days


class VitaminASupplement(TimeStampedModel):
    """
    Vitamin A supplementation record.

    Per KEPI: 100,000 IU at 6 months, 200,000 IU at 12 and 18 months.
    """

    DOSE_CHOICES = [
        ("100000", "100,000 IU"),
        ("200000", "200,000 IU"),
    ]

    patient = models.ForeignKey(
        "patients.Patient",
        on_delete=models.PROTECT,
        related_name="vitamin_a_supplements",
    )
    administered_date = models.DateField(
        default=date.today,
        help_text="Date of administration",
    )
    dose = models.CharField(
        max_length=10,
        choices=DOSE_CHOICES,
        help_text="Dose administered",
    )
    administered_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="vitamin_a_given",
    )
    notes = models.TextField(
        blank=True,
        default="",
    )

    class Meta:
        ordering = ["-administered_date"]
        verbose_name = "Vitamin A Supplement"
        verbose_name_plural = "Vitamin A Supplements"

    def __str__(self):
        return f"Vitamin A {self.dose} IU - {self.patient} ({self.administered_date})"


class AEFI(HistoryMixin, TimeStampedModel):
    """
    Adverse Event Following Immunization report.

    Standardized form for reporting vaccine adverse events
    to national authorities per KEPI guidelines.
    """

    EVENT_TYPE_CHOICES = [
        ("LOCAL_REACTION", "Local Reaction"),
        ("SYSTEMIC_REACTION", "Systemic Reaction"),
        ("SEVERE", "Severe Adverse Event"),
        ("DEATH", "Death"),
    ]

    SEVERITY_CHOICES = [
        ("MILD", "Mild"),
        ("MODERATE", "Moderate"),
        ("SEVERE", "Severe"),
    ]

    OUTCOME_CHOICES = [
        ("RECOVERED", "Recovered"),
        ("RECOVERING", "Recovering"),
        ("NOT_RECOVERED", "Not Recovered"),
        ("SEQUELAE", "Recovered with Sequelae"),
        ("DEATH", "Death"),
        ("UNKNOWN", "Unknown"),
    ]

    immunization_record = models.ForeignKey(
        ImmunizationRecord,
        on_delete=models.PROTECT,
        related_name="aefi_reports",
        help_text="The immunization that caused the adverse event",
    )

    # Event details
    event_date = models.DateField(
        default=date.today,
        help_text="Date adverse event was observed",
    )
    event_type = models.CharField(
        max_length=30,
        choices=EVENT_TYPE_CHOICES,
    )
    severity = models.CharField(
        max_length=10,
        choices=SEVERITY_CHOICES,
    )
    description = models.TextField(
        help_text="Description of the adverse event",
    )

    # Outcome
    outcome = models.CharField(
        max_length=20,
        choices=OUTCOME_CHOICES,
        default="UNKNOWN",
    )

    # Reporting
    reported_to_authorities = models.BooleanField(
        default=False,
        help_text="Whether reported to national authorities",
    )
    report_date = models.DateField(
        null=True,
        blank=True,
        help_text="Date reported to authorities",
    )

    # Investigation
    investigated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="aefi_investigated",
    )
    investigation_notes = models.TextField(
        blank=True,
        default="",
    )

    # Audit trail
    history = HistoricalRecords()

    class Meta:
        ordering = ["-event_date"]
        verbose_name = "AEFI Report"
        verbose_name_plural = "AEFI Reports"

    def __str__(self):
        return (
            f"AEFI {self.get_event_type_display()} - "
            f"{self.immunization_record.vaccine.code} ({self.event_date})"
        )


# =============================================================================
# HIV-Exposed Infant (HEI) Models
# =============================================================================


class HEIFollowUp(HistoryMixin, TimeStampedModel):
    """
    HIV-Exposed Infant follow-up tracking.

    Tracks infants born to HIV-positive mothers: ARV prophylaxis,
    PCR testing schedule, and final HIV status determination.
    """

    STATUS_CHOICES = [
        ("ACTIVE", "Active Follow-up"),
        ("CONFIRMED_NEGATIVE", "Confirmed HIV-Negative"),
        ("CONFIRMED_POSITIVE", "Confirmed HIV-Positive"),
        ("LOST_TO_FOLLOW_UP", "Lost to Follow-up"),
        ("TRANSFERRED", "Transferred Out"),
        ("DECEASED", "Deceased"),
    ]

    ART_STATUS_CHOICES = [
        ("ON_ART", "On ART"),
        ("NOT_ON_ART", "Not on ART"),
        ("UNKNOWN", "Unknown"),
    ]

    ARV_PROPHYLAXIS_CHOICES = [
        ("NVP", "Nevirapine (NVP)"),
        ("AZT", "Zidovudine (AZT)"),
        ("NVP_AZT", "NVP + AZT"),
        ("NONE", "None"),
    ]

    BREASTFEEDING_STATUS_CHOICES = [
        ("EXCLUSIVE", "Exclusive Breastfeeding"),
        ("MIXED", "Mixed Feeding"),
        ("FORMULA", "Formula Feeding"),
        ("STOPPED", "Stopped Breastfeeding"),
    ]

    # Auto-generated number
    hei_number = models.CharField(
        max_length=30,
        unique=True,
        editable=False,
        default=generate_hei_number,
        help_text="Auto-generated HEI follow-up number (HEI-YYYYMMDD-XXXX)",
    )

    # Infant
    infant = models.ForeignKey(
        "patients.Patient",
        on_delete=models.PROTECT,
        related_name="hei_followups",
        help_text="Infant patient record",
    )

    # Link to mother's MCH registration
    mch_registration = models.ForeignKey(
        MCHRegistration,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="hei_followups",
        help_text="Mother's MCH registration",
    )

    # Enrollment
    enrollment_date = models.DateField(
        default=date.today,
        help_text="Date of HEI enrollment",
    )
    status = models.CharField(
        max_length=30,
        choices=STATUS_CHOICES,
        default="ACTIVE",
    )

    # Mother's HIV details
    mother_art_status = models.CharField(
        max_length=20,
        choices=ART_STATUS_CHOICES,
        default="UNKNOWN",
        help_text="Mother's ART status",
    )

    # Infant ARV prophylaxis
    infant_arv_prophylaxis = models.CharField(
        max_length=10,
        choices=ARV_PROPHYLAXIS_CHOICES,
        default="NONE",
        help_text="Infant ARV prophylaxis regimen",
    )
    arv_start_date = models.DateField(
        null=True,
        blank=True,
        help_text="Date ARV prophylaxis was started",
    )
    arv_end_date = models.DateField(
        null=True,
        blank=True,
        help_text="Date ARV prophylaxis was stopped",
    )

    # Feeding
    breastfeeding_status = models.CharField(
        max_length=20,
        choices=BREASTFEEDING_STATUS_CHOICES,
        default="EXCLUSIVE",
    )

    # Cotrimoxazole
    cotrimoxazole_prophylaxis = models.BooleanField(
        default=False,
        help_text="Whether infant is on cotrimoxazole prophylaxis",
    )
    cotrimoxazole_start_date = models.DateField(
        null=True,
        blank=True,
    )

    # Sensitive access (always set for HEI records)
    is_sensitive = models.BooleanField(
        default=True,
        help_text="HEI records are always sensitive",
    )

    # Staff
    enrolled_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="hei_enrollments_created",
    )

    # Notes
    notes = models.TextField(
        blank=True,
        default="",
    )

    # Audit trail
    history = HistoricalRecords()

    class Meta:
        ordering = ["-enrollment_date"]
        verbose_name = "HEI Follow-Up"
        verbose_name_plural = "HEI Follow-Ups"
        permissions = [
            ("view_sensitive_hei_followup", "Can view sensitive HEI follow-ups"),
        ]

    def __str__(self):
        return f"{self.hei_number} - {self.infant}"

    def save(self, *args, **kwargs):
        """Ensure HEI records are always sensitive."""
        self.is_sensitive = True
        if not self.hei_number:
            self.hei_number = generate_hei_number()
        super().save(*args, **kwargs)


class HEIPCRTest(TimeStampedModel):
    """
    PCR test record for HIV-exposed infants.

    Standard schedule: #1 at 6 weeks, #2 at 9 months, #3 confirmatory.
    """

    RESULT_CHOICES = [
        ("POSITIVE", "Positive"),
        ("NEGATIVE", "Negative"),
        ("INDETERMINATE", "Indeterminate"),
        ("PENDING", "Pending"),
    ]

    hei_followup = models.ForeignKey(
        HEIFollowUp,
        on_delete=models.PROTECT,
        related_name="pcr_tests",
        help_text="HEI follow-up record",
    )

    # Test details
    test_number = models.PositiveSmallIntegerField(
        validators=[MinValueValidator(1), MaxValueValidator(5)],
        help_text="PCR test number (1=6 weeks, 2=9 months, 3=confirmatory)",
    )
    scheduled_date = models.DateField(
        help_text="Scheduled date for the test",
    )
    actual_date = models.DateField(
        null=True,
        blank=True,
        help_text="Actual date test was performed",
    )
    result = models.CharField(
        max_length=20,
        choices=RESULT_CHOICES,
        default="PENDING",
    )

    # Lab reference
    lab_reference = models.CharField(
        max_length=100,
        blank=True,
        default="",
        help_text="Laboratory reference/order number",
    )

    # Notes
    notes = models.TextField(
        blank=True,
        default="",
    )

    class Meta:
        ordering = ["hei_followup", "test_number"]
        verbose_name = "HEI PCR Test"
        verbose_name_plural = "HEI PCR Tests"
        unique_together = ["hei_followup", "test_number"]

    def __str__(self):
        return (
            f"PCR #{self.test_number} - {self.hei_followup.hei_number} "
            f"({self.get_result_display()})"
        )
