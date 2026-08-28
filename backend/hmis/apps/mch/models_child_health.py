# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
# ruff: noqa
"""
What this file is for: community screening, growth, immunization, and pediatric supplement/adverse event models.
How to use: imported by `hmis.apps.mch.models` compatibility shim.
Supported inputs/args: Django model classes for child health workflows.
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
        validators=[_validate_image_upload],
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
        except (
            AttributeError,
            TypeError,
            ValueError,
            RuntimeError,
            OSError,
            AssertionError,
            ImportError,
        ):
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
