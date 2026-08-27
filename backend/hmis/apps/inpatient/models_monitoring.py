# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
# ruff: noqa
"""
What this file is for: inpatient monitoring and medication administration models plus admission-kardex signal wiring.
How to use: imported by `hmis.apps.inpatient.models` compatibility module for model registration.
Supported inputs/args: Django model fields/methods for vitals, fluids, transfusion observations, and medication administration.
"""

from __future__ import annotations

import uuid
from datetime import timedelta
from decimal import Decimal
from typing import TYPE_CHECKING

from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError
from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import models
from django.db.models import Q
from django.db.models.signals import post_save
from django.dispatch import receiver
from django.utils import timezone

from hmis.apps.core.mixins import FacilityScopedModel
from hmis.apps.core.models import TimeStampedModel
from hmis.apps.core.pii import encrypted_pii_property

from .clearance import calculate_patient_blocking_balance
from .models_kardex import NursingKardex
from .models_ward_admission import Admission

if TYPE_CHECKING:
    from django.contrib.auth.models import AbstractUser
    from django.db.models import QuerySet

User = get_user_model()


class TemperatureReading(TimeStampedModel):
    """
    Individual temperature reading for an inpatient's temperature chart.

    Based on the Kenya hospital TPR chart form, this tracks:
    - Temperature (°C)
    - Pulse rate (BPM)
    - Respiratory rate (breaths/min)

    Readings are plotted on a chart over days of disease/admission.
    """

    admission = models.ForeignKey(
        Admission,
        on_delete=models.CASCADE,
        related_name="temperature_readings",
        help_text="Admission this reading belongs to",
    )
    recorded_at = models.DateTimeField(
        help_text="When the reading was taken",
    )
    recorded_by = models.ForeignKey(
        User,
        on_delete=models.PROTECT,
        related_name="temperature_readings",
        help_text="Nurse/clinician who recorded the reading",
    )

    # Vital signs
    temperature = models.DecimalField(
        max_digits=4,
        decimal_places=1,
        help_text="Temperature in °C (e.g., 36.5)",
        validators=[MinValueValidator(Decimal("30.0"))],
    )
    pulse = models.IntegerField(
        null=True,
        blank=True,
        help_text="Pulse rate in BPM",
        validators=[MinValueValidator(0)],
    )
    respiratory_rate = models.IntegerField(
        null=True,
        blank=True,
        help_text="Respiratory rate in breaths/min",
        validators=[MinValueValidator(0)],
    )

    notes = models.TextField(
        blank=True,
        help_text="Additional observations or notes",
    )

    class Meta(TimeStampedModel.Meta):
        ordering = ["-recorded_at"]
        verbose_name = "Temperature Reading"
        verbose_name_plural = "Temperature Readings"
        indexes = [
            models.Index(fields=["admission", "-recorded_at"]),
        ]

    def __str__(self):
        return (
            f"Temp {self.temperature}°C at {self.recorded_at:%Y-%m-%d %H:%M} "
            f"for {self.admission.patient}"
        )

    @property
    def is_febrile(self) -> bool:
        """Temperature >= 37.5°C is considered febrile."""
        return self.temperature >= Decimal("37.5")

    @property
    def is_hypothermic(self) -> bool:
        """Temperature <= 35.0°C is considered hypothermic."""
        return self.temperature <= Decimal("35.0")


class FluidBalanceSheet(TimeStampedModel):
    """Daily Ministry of Health fluid balance chart for an admission."""

    admission = models.ForeignKey(
        Admission,
        on_delete=models.CASCADE,
        related_name="fluid_balance_sheets",
        help_text="Admission this fluid balance sheet belongs to",
    )
    chart_date = models.DateField(
        help_text="Date for the 24-hour fluid balance sheet",
    )
    recorded_by = models.ForeignKey(
        User,
        on_delete=models.PROTECT,
        related_name="fluid_balance_sheets",
        help_text="User who created the sheet",
    )
    patient_weight_kg = models.DecimalField(
        max_digits=5,
        decimal_places=1,
        null=True,
        blank=True,
        validators=[MinValueValidator(Decimal("0.0"))],
        help_text="Patient weight in kilograms for this sheet",
    )
    intravenous_infusion_notes = models.TextField(
        blank=True,
        help_text="Intravenous infusion details noted on the chart",
    )
    other_instructions = models.TextField(
        blank=True,
        help_text="Other instructions recorded on the chart",
    )

    class Meta(TimeStampedModel.Meta):
        ordering = ["-chart_date", "-created_at"]
        verbose_name = "Fluid Balance Sheet"
        verbose_name_plural = "Fluid Balance Sheets"
        constraints = [
            models.UniqueConstraint(
                fields=["admission", "chart_date"],
                name="unique_fluid_balance_sheet_per_admission_day",
            )
        ]
        indexes = [models.Index(fields=["admission", "-chart_date"])]

    def __str__(self):
        return f"Fluid balance {self.chart_date:%Y-%m-%d} for {self.admission.patient}"

    def _entry_total(self, *entry_types: str) -> int:
        total = self.entries.filter(entry_type__in=entry_types).aggregate(
            total=models.Sum("amount_ml")
        )["total"]
        return int(total or 0)

    @property
    def total_intravenous_intake_ml(self) -> int:
        return self._entry_total(FluidBalanceEntry.EntryType.INTRAVENOUS)

    @property
    def total_alimentary_intake_ml(self) -> int:
        return self._entry_total(FluidBalanceEntry.EntryType.ALIMENTARY)

    @property
    def total_other_intake_ml(self) -> int:
        return self._entry_total(FluidBalanceEntry.EntryType.OTHER_INTAKE)

    @property
    def total_intake_ml(self) -> int:
        return (
            self.total_intravenous_intake_ml
            + self.total_alimentary_intake_ml
            + self.total_other_intake_ml
        )

    @property
    def total_vomit_output_ml(self) -> int:
        return self._entry_total(FluidBalanceEntry.EntryType.VOMIT)

    @property
    def total_stool_output_ml(self) -> int:
        return self._entry_total(FluidBalanceEntry.EntryType.STOOL)

    @property
    def total_nasogastric_output_ml(self) -> int:
        return self._entry_total(FluidBalanceEntry.EntryType.NASOGASTRIC)

    @property
    def total_other_output_ml(self) -> int:
        return self._entry_total(FluidBalanceEntry.EntryType.OTHER_OUTPUT)

    @property
    def total_urine_output_ml(self) -> int:
        return self._entry_total(FluidBalanceEntry.EntryType.URINE)

    @property
    def total_output_ml(self) -> int:
        return (
            self.total_vomit_output_ml
            + self.total_stool_output_ml
            + self.total_nasogastric_output_ml
            + self.total_other_output_ml
            + self.total_urine_output_ml
        )

    @property
    def net_balance_ml(self) -> int:
        return self.total_intake_ml - self.total_output_ml


class FluidBalanceEntry(TimeStampedModel):
    """Individual categorized entry within a daily fluid balance sheet."""

    class EntryType(models.TextChoices):
        INTRAVENOUS = "INTRAVENOUS", "Intravenous"
        ALIMENTARY = "ALIMENTARY", "Alimentary"
        OTHER_INTAKE = "OTHER_INTAKE", "Other Intake"
        VOMIT = "VOMIT", "Vomit"
        STOOL = "STOOL", "Stool"
        NASOGASTRIC = "NASOGASTRIC", "Naso Gastric"
        OTHER_OUTPUT = "OTHER_OUTPUT", "Other Output"
        URINE = "URINE", "Urine"

    fluid_balance_sheet = models.ForeignKey(
        FluidBalanceSheet,
        on_delete=models.CASCADE,
        related_name="entries",
        help_text="Fluid balance sheet this entry belongs to",
    )
    recorded_at = models.DateTimeField(
        help_text="When the fluid entry was recorded",
    )
    recorded_by = models.ForeignKey(
        User,
        on_delete=models.PROTECT,
        related_name="fluid_balance_entries",
        help_text="Nurse/clinician who recorded the entry",
    )
    entry_type = models.CharField(
        max_length=20,
        choices=EntryType.choices,
        help_text="Category of fluid balance entry",
    )
    item_type = models.CharField(
        max_length=100,
        blank=True,
        help_text="Type/name of fluid, feed, or output item",
    )
    bottle_number = models.CharField(
        max_length=50,
        blank=True,
        help_text="Bottle number for IV intake where applicable",
    )
    amount_ml = models.PositiveIntegerField(
        null=True,
        blank=True,
        help_text="Measured amount in mL",
    )
    specific_gravity = models.DecimalField(
        max_digits=4,
        decimal_places=3,
        null=True,
        blank=True,
        validators=[MinValueValidator(Decimal("0.000"))],
        help_text="Urine specific gravity where applicable",
    )
    notes = models.TextField(
        blank=True,
        help_text="Additional notes for this fluid balance entry",
    )

    class Meta(TimeStampedModel.Meta):
        ordering = ["-recorded_at", "-created_at"]
        verbose_name = "Fluid Balance Entry"
        verbose_name_plural = "Fluid Balance Entries"
        indexes = [
            models.Index(fields=["fluid_balance_sheet", "-recorded_at"]),
            models.Index(fields=["fluid_balance_sheet", "entry_type"]),
        ]

    def __str__(self):
        return (
            f"{self.get_entry_type_display()} at {self.recorded_at:%Y-%m-%d %H:%M} "
            f"for {self.fluid_balance_sheet.admission.patient}"
        )


class BloodTransfusionObservation(TimeStampedModel):
    """
    Blood transfusion observation chart for monitoring patient during transfusion.

    Based on the Kenya hospital blood transfusion observation form, this tracks:
    - Patient info (linked via admission)
    - Blood product details
    - Periodic vital sign observations (before, during, and after transfusion)
    - Transfusion reactions
    """

    BLOOD_PRODUCT_CHOICES = [
        ("WHOLE", "Whole Blood"),
        ("PACKED_RED_CELLS", "Packed Red Cells"),
        ("FFP", "Fresh Frozen Plasma"),
        ("PLATELETS", "Platelets"),
        ("CRYOPRECIPITATE", "Cryoprecipitate"),
        ("OTHER", "Other"),
    ]

    STATUS_CHOICES = [
        ("IN_PROGRESS", "In Progress"),
        ("COMPLETED", "Completed"),
        ("STOPPED", "Stopped - Reaction"),
        ("CANCELLED", "Cancelled"),
    ]

    admission = models.ForeignKey(
        Admission,
        on_delete=models.CASCADE,
        related_name="blood_transfusions",
        help_text="Admission this transfusion belongs to",
    )

    # Blood product details
    blood_product = models.CharField(
        max_length=30,
        choices=BLOOD_PRODUCT_CHOICES,
        help_text="Type of blood product transfused",
    )
    blood_product_other = models.CharField(
        max_length=100,
        blank=True,
        help_text="Specify if blood product is 'Other'",
    )
    blood_unit_number = models.CharField(
        max_length=50,
        help_text="Blood unit/bag number",
    )
    blood_bank_unit = models.ForeignKey(
        "blood_bank.BloodUnit",
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="inpatient_transfusions",
        help_text="Optional linked Blood Bank unit record",
    )
    blood_group = models.CharField(
        max_length=10,
        blank=True,
        help_text="Blood group of the product (e.g., A+, O-)",
    )
    amount_ml = models.PositiveIntegerField(
        help_text="Amount to be transfused in mL",
    )

    # Timing
    transfusion_date = models.DateField(
        help_text="Date of transfusion",
    )
    time_started = models.TimeField(
        null=True,
        blank=True,
        help_text="Time transfusion started",
    )
    time_ended = models.TimeField(
        null=True,
        blank=True,
        help_text="Time transfusion ended",
    )

    # Staff
    started_by = models.ForeignKey(
        User,
        on_delete=models.PROTECT,
        related_name="transfusions_started",
        help_text="Staff who started the transfusion",
    )
    counter_checked_by = models.ForeignKey(
        User,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="transfusions_counter_checked",
        help_text="Staff who counter-checked the blood product",
    )

    # Diagnosis context
    diagnosis = models.TextField(
        blank=True,
        help_text="Diagnosis/indication for transfusion",
    )

    # Status
    status = models.CharField(
        max_length=20,
        choices=STATUS_CHOICES,
        default="IN_PROGRESS",
        help_text="Current status of the transfusion",
    )

    # Blood unit expiry
    expiry_date = models.DateField(
        null=True,
        blank=True,
        help_text="Expiry date of the blood unit/bag",
    )

    # Reaction
    reaction_occurred = models.BooleanField(
        default=False,
        help_text="Whether a transfusion reaction occurred",
    )
    reaction_type = models.CharField(
        max_length=200,
        blank=True,
        help_text="Type of reaction (if any)",
    )
    reaction_action_taken = models.TextField(
        blank=True,
        help_text="Action taken in response to the reaction",
    )

    class Meta(TimeStampedModel.Meta):
        ordering = ["-transfusion_date", "-time_started"]
        verbose_name = "Blood Transfusion"
        verbose_name_plural = "Blood Transfusions"
        indexes = [
            models.Index(fields=["admission", "-transfusion_date"]),
        ]

    def __str__(self):
        product_display: str = self.get_blood_product_display()  # type: ignore[attr-defined]
        return (
            f"{product_display} ({self.amount_ml}ml) - "
            f"{self.transfusion_date} for {self.admission.patient}"
        )


class TransfusionObservationEntry(TimeStampedModel):
    """
    Individual observation entry during a blood transfusion.

    Based on the physical form, observations are taken at:
    Before transfusion, 00 min, 15 min, 45 min, 1hr 15min, 1hr 45min,
    2hr 15min, 2hr 45min, 3hr 15min, 3hr 45min, 4hr 15min, 4hr after.
    """

    OBSERVATION_INTERVAL_CHOICES = [
        ("BEFORE", "Before Transfusion"),
        ("00_MIN", "00 Minutes"),
        ("15_MIN", "15 Minutes"),
        ("45_MIN", "45 Minutes"),
        ("1HR_15MIN", "1hr 15 Minutes"),
        ("1HR_45MIN", "1hr 45 Minutes"),
        ("2HR_15MIN", "2hr 15 Minutes"),
        ("2HR_45MIN", "2hr 45 Minutes"),
        ("3HR_15MIN", "3hr 15 Minutes"),
        ("3HR_45MIN", "3hr 45 Minutes"),
        ("4HR_15MIN", "4hr 15 Minutes"),
        ("4HR_AFTER", "4hr After Transfusion"),
    ]

    transfusion = models.ForeignKey(
        BloodTransfusionObservation,
        on_delete=models.CASCADE,
        related_name="observations",
        help_text="Parent transfusion record",
    )
    observation_interval = models.CharField(
        max_length=20,
        choices=OBSERVATION_INTERVAL_CHOICES,
        help_text="Observation timing interval",
    )
    exact_time = models.TimeField(
        help_text="Exact time the observation was taken",
    )
    recorded_by = models.ForeignKey(
        User,
        on_delete=models.PROTECT,
        related_name="transfusion_observations",
        help_text="Staff who recorded this observation",
    )

    # Vital signs
    blood_pressure = models.CharField(
        max_length=20,
        blank=True,
        help_text="Blood pressure (e.g., '120/80')",
    )
    temperature = models.DecimalField(
        max_digits=4,
        decimal_places=1,
        null=True,
        blank=True,
        help_text="Temperature in °C",
    )
    pulse = models.IntegerField(
        null=True,
        blank=True,
        help_text="Pulse rate in BPM",
    )
    respiratory_rate = models.IntegerField(
        null=True,
        blank=True,
        help_text="Respiratory rate in breaths/min",
    )
    remarks = models.TextField(
        blank=True,
        help_text="Additional remarks or observations",
    )

    class Meta(TimeStampedModel.Meta):
        ordering = ["exact_time"]
        verbose_name = "Transfusion Observation Entry"
        verbose_name_plural = "Transfusion Observation Entries"
        unique_together = ["transfusion", "observation_interval"]
        indexes = [
            models.Index(fields=["transfusion", "observation_interval"]),
        ]

    def __str__(self):
        interval_display: str = self.get_observation_interval_display()  # type: ignore[attr-defined]
        return f"{interval_display} at {self.exact_time}"


class BPMonitoringReading(TimeStampedModel):
    """
    Blood pressure monitoring record for inpatients.

    Tracks periodic BP readings with associated vitals for
    patients requiring close BP monitoring (e.g., hypertension,
    pre-eclampsia, post-operative).
    """

    POSITION_CHOICES = [
        ("SITTING", "Sitting"),
        ("STANDING", "Standing"),
        ("LYING", "Lying/Supine"),
        ("LEFT_LATERAL", "Left Lateral"),
    ]

    admission = models.ForeignKey(
        Admission,
        on_delete=models.CASCADE,
        related_name="bp_readings",
        help_text="Admission this reading belongs to",
    )
    recorded_at = models.DateTimeField(
        help_text="When the reading was taken",
    )
    recorded_by = models.ForeignKey(
        User,
        on_delete=models.PROTECT,
        related_name="bp_readings",
        help_text="Nurse/clinician who recorded the reading",
    )

    # Blood pressure
    systolic = models.IntegerField(
        help_text="Systolic blood pressure (mmHg)",
        validators=[MinValueValidator(0)],
    )
    diastolic = models.IntegerField(
        help_text="Diastolic blood pressure (mmHg)",
        validators=[MinValueValidator(0)],
    )

    # Associated vitals
    pulse = models.IntegerField(
        null=True,
        blank=True,
        help_text="Pulse rate in BPM",
        validators=[MinValueValidator(0)],
    )
    position = models.CharField(
        max_length=20,
        choices=POSITION_CHOICES,
        default="SITTING",
        help_text="Patient position when reading was taken",
    )

    # Context
    arm = models.CharField(
        max_length=10,
        blank=True,
        help_text="Which arm was used (e.g., Left, Right)",
    )
    notes = models.TextField(
        blank=True,
        help_text="Additional notes (e.g., medication taken, symptoms)",
    )

    class Meta(TimeStampedModel.Meta):
        ordering = ["-recorded_at"]
        verbose_name = "BP Monitoring Reading"
        verbose_name_plural = "BP Monitoring Readings"
        indexes = [
            models.Index(fields=["admission", "-recorded_at"]),
        ]

    def __str__(self):
        return (
            f"BP {self.systolic}/{self.diastolic} at {self.recorded_at:%Y-%m-%d %H:%M} "
            f"for {self.admission.patient}"
        )

    @property
    def mean_arterial_pressure(self) -> int:
        """Calculate Mean Arterial Pressure (MAP)."""
        return round(self.diastolic + (self.systolic - self.diastolic) / 3)

    @property
    def bp_display(self) -> str:
        """Display blood pressure as string."""
        return f"{self.systolic}/{self.diastolic}"

    @property
    def is_hypertensive(self) -> bool:
        """Systolic >= 140 or diastolic >= 90."""
        return self.systolic >= 140 or self.diastolic >= 90

    @property
    def is_hypotensive(self) -> bool:
        """Systolic < 90 or diastolic < 60."""
        return self.systolic < 90 or self.diastolic < 60


class MedicationAdministration(TimeStampedModel):
    """
    Medication Administration Record (MAR) entry.

    Tracks the actual administration of medication to an inpatient
    at the bedside. Each record links to a PrescriptionItem (the order)
    and an Admission (the context).
    """

    ADMIN_STATUS_CHOICES = [
        ("SCHEDULED", "Scheduled"),
        ("GIVEN", "Given"),
        ("SKIPPED", "Skipped"),
        ("REFUSED", "Refused"),
        ("HELD", "Held"),
        ("VOMITED", "Vomited"),
    ]

    admission = models.ForeignKey(
        Admission,
        on_delete=models.CASCADE,
        related_name="medication_administrations",
        help_text="Admission this record belongs to",
    )
    prescription_item = models.ForeignKey(
        "pharmacy.PrescriptionItem",
        on_delete=models.PROTECT,
        related_name="administrations",
        help_text="The prescription item being administered",
    )
    scheduled_time = models.DateTimeField(
        help_text="When this dose is/was scheduled",
    )
    actual_time = models.DateTimeField(
        null=True,
        blank=True,
        help_text="When the dose was actually administered",
    )
    status = models.CharField(
        max_length=20,
        choices=ADMIN_STATUS_CHOICES,
        default="SCHEDULED",
        help_text="Administration status",
    )
    dose_given = models.CharField(
        max_length=100,
        blank=True,
        help_text="Actual dose administered (e.g., '500mg')",
    )
    route = models.CharField(
        max_length=50,
        blank=True,
        help_text="Route of administration (e.g., oral, IV, IM)",
    )
    administered_by = models.ForeignKey(
        User,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="medication_administrations",
        help_text="Nurse who administered/recorded",
    )
    notes = models.TextField(
        blank=True,
        help_text="Additional notes (reason for skipping, patient response)",
    )
    is_prn = models.BooleanField(
        default=False,
        help_text="Whether this is a PRN (as-needed) administration",
    )

    class Meta(TimeStampedModel.Meta):
        ordering = ["-scheduled_time"]
        verbose_name = "Medication Administration"
        verbose_name_plural = "Medication Administrations"
        indexes = [
            models.Index(fields=["admission", "-scheduled_time"]),
            models.Index(fields=["prescription_item", "-scheduled_time"]),
        ]

    def __str__(self):
        status_display: str = self.get_status_display()  # type: ignore[attr-defined]
        return (
            f"{status_display} — {self.dose_given or 'pending'} "
            f"at {self.scheduled_time:%Y-%m-%d %H:%M} "
            f"for {self.admission.patient}"
        )

    @property
    def is_overdue(self) -> bool:
        """Scheduled but not yet administered and past scheduled time."""
        if self.status != "SCHEDULED":
            return False
        return timezone.now() > self.scheduled_time

    @property
    def drug_name(self) -> str:
        """Convenience access to the drug name from the prescription item."""
        try:
            return self.prescription_item.drug.name
        except (
            AttributeError,
            TypeError,
            ValueError,
            RuntimeError,
            OSError,
            AssertionError,
            ImportError,
        ):
            return ""

    def administer(self, user, dose_given: str = "", notes: str = ""):
        """Record that this dose was given."""
        self.status = "GIVEN"
        self.actual_time = timezone.now()
        self.administered_by = user
        if dose_given:
            self.dose_given = dose_given
        if notes:
            self.notes = notes
        self.save(
            update_fields=[
                "status",
                "actual_time",
                "administered_by",
                "dose_given",
                "notes",
                "updated_at",
            ]
        )


@receiver(post_save, sender=Admission)
def create_kardex_for_admission(sender, instance, created, **kwargs):
    """
    Auto-create Nursing Kardex when an Admission is created.

    This ensures every admission has a Kardex for nursing care coordination.
    Pre-populates allergies from the patient's structured allergy records.
    """
    if created:
        # Build allergy summary from patient's active allergy records
        allergies_text = ""
        try:
            active_allergies = instance.patient.allergies.filter(status="ACTIVE").values_list(
                "substance", flat=True
            )
            if active_allergies:
                allergies_text = ", ".join(active_allergies)
        except (
            AttributeError,
            TypeError,
            ValueError,
            RuntimeError,
            OSError,
            AssertionError,
            ImportError,
        ):
            pass  # Graceful fallback if allergy model not available

        # Fallback: check latest encounter's free-text allergies field
        if not allergies_text and instance.opd_encounter:
            allergies_text = instance.opd_encounter.allergies or ""

        NursingKardex.objects.create(
            admission=instance,
            allergies=allergies_text,
            dietary_requirements="Regular",
        )
