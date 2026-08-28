# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
# ruff: noqa
"""Mch models maternal labour pnc for Vitora HMIS.

What this file is for:
- Implement models maternal labour pnc logic for the mch domain.

How to use it:
- Import classes and functions from this module in Django app code and tests.

Supported inputs/args:
- Python imports and Django ORM/runtime inputs; no standalone CLI arguments.
"""

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
from hmis.apps.mch.models_maternal_journey import ANCVisit, MCHRegistration
from hmis.apps.mch.models_shared import generate_mch_number


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
            except (
                AttributeError,
                TypeError,
                ValueError,
                RuntimeError,
                OSError,
                AssertionError,
                ImportError,
            ):
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
