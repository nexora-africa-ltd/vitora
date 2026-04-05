"""
Immunizations app models for Vitora HMIS.

Standalone immunization management supporting:
- KEPI (Kenya Expanded Programme on Immunization) for children
- Adult routine vaccines (Hepatitis B, Td boosters, HPV)
- Campaign vaccines (COVID-19, Polio mop-up)
- Occupational / travel vaccines
- AEFI (Adverse Event Following Immunization) reporting
- Mass vaccination campaigns

Replaces the MCH-only vaccine models with a facility-wide solution.
"""

from datetime import date

from django.conf import settings
from django.db import models
from simple_history.models import HistoricalRecords

from hmis.apps.core.history import HistoryMixin
from hmis.apps.core.models import TimeStampedModel

# =============================================================================
# Enums
# =============================================================================


class TargetPopulation(models.TextChoices):
    INFANT = "INFANT", "Infant (0-11 months)"
    CHILD = "CHILD", "Child (1-9 years)"
    ADOLESCENT = "ADOLESCENT", "Adolescent (10-17 years)"
    ADULT = "ADULT", "Adult (18+ years)"
    ALL = "ALL", "All Ages"


class VaccineProgram(models.TextChoices):
    KEPI = "KEPI", "Kenya Expanded Programme on Immunization"
    ROUTINE = "ROUTINE", "Routine (Non-KEPI)"
    CAMPAIGN = "CAMPAIGN", "Mass Campaign"
    OCCUPATIONAL = "OCCUPATIONAL", "Occupational"
    TRAVEL = "TRAVEL", "Travel"
    CATCH_UP = "CATCH_UP", "Catch-Up"


class VaccineRoute(models.TextChoices):
    ORAL = "ORAL", "Oral"
    IM = "IM", "Intramuscular"
    SC = "SC", "Subcutaneous"
    ID = "ID", "Intradermal"


class ImmunizationStatus(models.TextChoices):
    SCHEDULED = "SCHEDULED", "Scheduled"
    ADMINISTERED = "ADMINISTERED", "Administered"
    MISSED = "MISSED", "Missed"
    CONTRAINDICATED = "CONTRAINDICATED", "Contraindicated"
    DEFERRED = "DEFERRED", "Deferred"


class AdministrationSite(models.TextChoices):
    LEFT_ARM = "LEFT_ARM", "Left Upper Arm"
    RIGHT_ARM = "RIGHT_ARM", "Right Upper Arm"
    LEFT_THIGH = "LEFT_THIGH", "Left Thigh"
    RIGHT_THIGH = "RIGHT_THIGH", "Right Thigh"
    ORAL = "ORAL", "Oral"


class CampaignStatus(models.TextChoices):
    PLANNED = "PLANNED", "Planned"
    ACTIVE = "ACTIVE", "Active"
    COMPLETED = "COMPLETED", "Completed"
    CANCELLED = "CANCELLED", "Cancelled"


class AEFIEventType(models.TextChoices):
    LOCAL_REACTION = "LOCAL_REACTION", "Local Reaction"
    SYSTEMIC_REACTION = "SYSTEMIC_REACTION", "Systemic Reaction"
    SEVERE = "SEVERE", "Severe Adverse Event"
    DEATH = "DEATH", "Death"


class AEFISeverity(models.TextChoices):
    MILD = "MILD", "Mild"
    MODERATE = "MODERATE", "Moderate"
    SEVERE = "SEVERE", "Severe"


class AEFIOutcome(models.TextChoices):
    RECOVERED = "RECOVERED", "Recovered"
    RECOVERING = "RECOVERING", "Recovering"
    NOT_RECOVERED = "NOT_RECOVERED", "Not Recovered"
    SEQUELAE = "SEQUELAE", "Recovered with Sequelae"
    DEATH = "DEATH", "Death"
    UNKNOWN = "UNKNOWN", "Unknown"


# =============================================================================
# VaccineDefinition
# =============================================================================


class VaccineDefinition(TimeStampedModel):
    """
    Vaccine reference data supporting KEPI + adult + campaign vaccines.

    Enhanced from the MCH-only Vaccine model to support:
    - Target population filtering (INFANT, CHILD, ADOLESCENT, ADULT, ALL)
    - Program categorization (KEPI, ROUTINE, CAMPAIGN, OCCUPATIONAL, TRAVEL)
    - Multi-dose series with configurable intervals
    - Age eligibility windows
    """

    code = models.CharField(
        max_length=30,
        unique=True,
        help_text="Vaccine code (e.g., BCG, PENTA1, COVID19_PF, HEPB_ADULT)",
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

    # Age-based scheduling (for KEPI / pediatric)
    standard_age_days = models.PositiveIntegerField(
        default=0,
        help_text="Standard age for administration in days from birth (KEPI only)",
    )

    # Administration
    route = models.CharField(
        max_length=5,
        choices=VaccineRoute.choices,
        blank=True,
        default="",
        help_text="Route of administration",
    )

    # Series / dosing
    dose_number = models.PositiveSmallIntegerField(
        default=1,
        help_text="Dose number in the series (e.g., 1 for Penta1, 2 for Penta2)",
    )
    total_doses = models.PositiveSmallIntegerField(
        default=1,
        help_text="Total doses in the series (e.g., 3 for Hep B adult)",
    )
    series_name = models.CharField(
        max_length=50,
        blank=True,
        default="",
        help_text="Name of the vaccine series (e.g., 'Pentavalent' for Penta1/2/3)",
    )
    interval_days = models.PositiveIntegerField(
        default=0,
        help_text="Minimum days between doses in a multi-dose series",
    )

    # Population & program
    target_population = models.CharField(
        max_length=20,
        choices=TargetPopulation.choices,
        default=TargetPopulation.INFANT,
        help_text="Target population for this vaccine",
    )
    program = models.CharField(
        max_length=20,
        choices=VaccineProgram.choices,
        default=VaccineProgram.KEPI,
        help_text="Vaccination program this belongs to",
    )

    # Age eligibility (for non-KEPI vaccines)
    min_age_days = models.PositiveIntegerField(
        default=0,
        help_text="Minimum age in days for eligibility (0 = no minimum)",
    )
    max_age_days = models.PositiveIntegerField(
        default=0,
        help_text="Maximum age in days for eligibility (0 = no maximum)",
    )

    is_active = models.BooleanField(
        default=True,
        help_text="Whether this vaccine is currently active",
    )

    class Meta:
        ordering = ["standard_age_days", "code"]
        verbose_name = "Vaccine Definition"
        verbose_name_plural = "Vaccine Definitions"

    def __str__(self):
        return f"{self.code} - {self.name}"


# =============================================================================
# VaccineCampaign
# =============================================================================


class VaccineCampaign(TimeStampedModel):
    """
    Mass vaccination campaign (e.g., COVID-19, Polio mop-up).

    Tracks campaign metadata, target populations, and links to
    vaccines being administered in the campaign.
    """

    name = models.CharField(
        max_length=200,
        help_text="Campaign name",
    )
    description = models.TextField(
        blank=True,
        default="",
    )
    start_date = models.DateField(
        help_text="Campaign start date",
    )
    end_date = models.DateField(
        help_text="Campaign end date",
    )
    target_population = models.CharField(
        max_length=20,
        choices=TargetPopulation.choices,
        default=TargetPopulation.ALL,
        help_text="Target population for this campaign",
    )
    vaccines = models.ManyToManyField(
        VaccineDefinition,
        blank=True,
        related_name="campaigns",
        help_text="Vaccines administered in this campaign",
    )
    status = models.CharField(
        max_length=20,
        choices=CampaignStatus.choices,
        default=CampaignStatus.PLANNED,
    )
    target_count = models.PositiveIntegerField(
        default=0,
        help_text="Target number of people to vaccinate",
    )

    class Meta:
        ordering = ["-start_date"]
        verbose_name = "Vaccine Campaign"
        verbose_name_plural = "Vaccine Campaigns"

    def __str__(self):
        return f"{self.name} ({self.get_status_display()})"

    @property
    def is_running(self) -> bool:
        """Whether the campaign is active and within date range."""
        if self.status != CampaignStatus.ACTIVE:
            return False
        today = date.today()
        return self.start_date <= today <= self.end_date


# =============================================================================
# ImmunizationRecord
# =============================================================================


class ImmunizationRecord(HistoryMixin, TimeStampedModel):
    """
    Immunization record for any patient (child or adult).

    Enhanced from MCH-only model:
    - unique_together on (patient, vaccine, dose_number) instead of (patient, vaccine)
      to support multi-dose adult series and boosters
    - Optional link to encounter and campaign
    """

    patient = models.ForeignKey(
        "patients.Patient",
        on_delete=models.PROTECT,
        related_name="immunization_records",
        help_text="Patient receiving the vaccine",
    )
    vaccine = models.ForeignKey(
        VaccineDefinition,
        on_delete=models.PROTECT,
        related_name="immunization_records",
        help_text="Vaccine administered/scheduled",
    )

    # Schedule
    scheduled_date = models.DateField(
        help_text="Scheduled date for administration",
    )
    administered_date = models.DateField(
        null=True,
        blank=True,
        help_text="Actual date of administration",
    )
    status = models.CharField(
        max_length=20,
        choices=ImmunizationStatus.choices,
        default=ImmunizationStatus.SCHEDULED,
    )

    # Dose tracking
    dose_number = models.PositiveSmallIntegerField(
        default=1,
        help_text="Dose number in series",
    )

    # Administration details
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
        choices=AdministrationSite.choices,
        help_text="Administration site",
    )

    # Staff
    administered_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="immunizations_given",
        help_text="Healthcare worker who administered the vaccine",
    )

    # Next dose
    next_dose_date = models.DateField(
        null=True,
        blank=True,
        help_text="Next dose date if multi-dose series",
    )

    # Optional links
    encounter = models.ForeignKey(
        "encounters.Encounter",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="immunization_records",
        help_text="Clinical encounter during which this was administered",
    )
    campaign = models.ForeignKey(
        VaccineCampaign,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="immunization_records",
        help_text="Campaign this immunization is part of",
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
        unique_together = ["patient", "vaccine", "dose_number"]

    def __str__(self):
        return (
            f"{self.vaccine.code} dose {self.dose_number} - "
            f"{self.patient} ({self.get_status_display()})"
        )

    @property
    def is_overdue(self) -> bool:
        """Check if vaccination is overdue."""
        if self.status != ImmunizationStatus.SCHEDULED:
            return False
        return self.scheduled_date < date.today()

    @property
    def days_overdue(self) -> int | None:
        """Days past scheduled date."""
        if not self.is_overdue:
            return None
        return (date.today() - self.scheduled_date).days


# =============================================================================
# AEFI (Adverse Event Following Immunization)
# =============================================================================


class AEFI(HistoryMixin, TimeStampedModel):
    """
    Adverse Event Following Immunization report.

    Standardized form for reporting vaccine adverse events
    to national authorities per KEPI / pharmacovigilance guidelines.
    """

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
        choices=AEFIEventType.choices,
    )
    severity = models.CharField(
        max_length=10,
        choices=AEFISeverity.choices,
    )
    description = models.TextField(
        help_text="Description of the adverse event",
    )

    # Outcome
    outcome = models.CharField(
        max_length=20,
        choices=AEFIOutcome.choices,
        default=AEFIOutcome.UNKNOWN,
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
        related_name="aefi_investigations",
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
