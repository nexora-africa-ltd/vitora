# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
# ruff: noqa
"""
What this file is for: MCH registration, ANC, and delivery maternal journey models.
How to use: imported by MCH model compatibility shims.
Supported inputs/args: Django model classes for maternal registration through delivery.
"""

# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
# ruff: noqa
"""
What this file is for: maternal journey models from registration through ANC, delivery, labour, and PNC.
How to use: imported by `hmis.apps.mch.models` compatibility shim.
Supported inputs/args: Django model classes for maternal care workflows.
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
from hmis.apps.core.mixins import FacilityScopedModel
from hmis.apps.core.models import TimeStampedModel
from hmis.apps.core.upload_validators import validate_image_upload as _validate_image_upload
from hmis.apps.mch.models_shared import generate_mch_number


class MCHRegistration(HistoryMixin, FacilityScopedModel, TimeStampedModel):
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
