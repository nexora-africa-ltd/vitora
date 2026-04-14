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
from hmis.apps.core.mixins import FacilityScopedModel, resolve_tenant_from_related
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
    """
    MOH AEFI Reporting Form — specific reaction types (checkbox-style).

    The Ministry of Health form uses checkboxes for these specific types.
    Multiple types can be selected per AEFI report, so the AEFI model stores
    event_types as a JSONField list rather than a single CharField choice.
    """

    BCG_LYMPHADENITIS = "BCG_LYMPHADENITIS", "BCG Lymphadenitis"
    INJECTION_SITE_ABSCESS = "INJECTION_SITE_ABSCESS", "Injection Site Abscess"
    CONVULSION = "CONVULSION", "Convulsion"
    HIGH_FEVER = "HIGH_FEVER", "High Fever"
    SEVERE_LOCAL_REACTION = "SEVERE_LOCAL_REACTION", "Severe Local Reaction"
    GENERALIZED_URTICARIA = "GENERALIZED_URTICARIA", "Generalized Urticaria (Hives)"
    ANAPHYLAXIS = "ANAPHYLAXIS", "Anaphylaxis"
    ENCEPHALOPATHY = "ENCEPHALOPATHY", "Encephalopathy / Encephalitis / Meningitis"
    PARALYSIS = "PARALYSIS", "Paralysis"
    TOXIC_SHOCK = "TOXIC_SHOCK", "Toxic Shock"
    OTHER = "OTHER", "Other"


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


class AEFIReportType(models.TextChoices):
    INITIAL = "INITIAL", "Initial Report"
    FOLLOW_UP = "FOLLOW_UP", "Follow-up Report"


class VaccinationServiceType(models.TextChoices):
    STATIC = "STATIC", "Static"
    MASS = "MASS", "Mass Campaign"
    OUTREACH = "OUTREACH", "Outreach"


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

    # Billing & SHA
    billing_service = models.ForeignKey(
        "billing.Service",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="vaccine_definitions",
        help_text="Linked billing service for invoice generation. "
        "When set, the service unit_price and SHA code are used for billing.",
    )
    base_fee = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        null=True,
        blank=True,
        help_text="Base vaccine fee (KES). Used as fallback when billing_service is not set.",
    )
    sha_tariff_code = models.CharField(
        max_length=50,
        blank=True,
        default="",
        help_text="SHA intervention tariff code for vaccine billing",
    )

    class Meta:
        ordering = ["standard_age_days", "code"]
        verbose_name = "Vaccine Definition"
        verbose_name_plural = "Vaccine Definitions"

    def __str__(self):
        return f"{self.code} - {self.name}"

    @property
    def billing_price(self):
        """Resolve the billable price: billing_service.unit_price → base_fee → None."""
        if self.billing_service_id:
            return self.billing_service.unit_price
        return self.base_fee


# =============================================================================
# VaccineCampaign
# =============================================================================


class VaccineCampaign(FacilityScopedModel, TimeStampedModel):
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


class ImmunizationRecord(HistoryMixin, FacilityScopedModel, TimeStampedModel):
    """
    Immunization record for any patient (child or adult).

    Enhanced from MCH-only model:
    - unique_together on (patient, vaccine, dose_number) instead of (patient, vaccine)
      to support multi-dose adult series and boosters
    - Optional link to encounter and campaign
    - Facility/org auto-resolved from encounter or patient on save.
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

    # Vaccine manufacturer (captured at administration time)
    vaccine_manufacturer = models.CharField(
        max_length=200,
        blank=True,
        default="",
        help_text="Vaccine manufacturer name (from stock or manual entry)",
    )

    # Diluent details (MOH AEFI form — required for reconstituted vaccines)
    diluent_batch_number = models.CharField(
        max_length=50,
        blank=True,
        default="",
        help_text="Diluent batch/lot number",
    )
    diluent_manufacturer = models.CharField(
        max_length=200,
        blank=True,
        default="",
        help_text="Diluent manufacturer name",
    )
    diluent_expiry_date = models.DateField(
        null=True,
        blank=True,
        help_text="Diluent expiry date",
    )

    # Service type (MOH AEFI form — static, mass, outreach)
    vaccination_service_type = models.CharField(
        max_length=10,
        choices=VaccinationServiceType.choices,
        default=VaccinationServiceType.STATIC,
        help_text="Type of vaccination service (static, mass campaign, outreach)",
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

    def save(self, *args, **kwargs):
        resolve_tenant_from_related(self, encounter_field="encounter", patient_field="patient")
        # Auto-set vaccination service type from campaign
        if self.campaign_id and self.vaccination_service_type == VaccinationServiceType.STATIC:
            self.vaccination_service_type = VaccinationServiceType.MASS
        super().save(*args, **kwargs)

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


class AEFI(HistoryMixin, FacilityScopedModel, TimeStampedModel):
    """
    Adverse Event Following Immunization report.

    Aligned with the Kenya Ministry of Health AEFI Reporting Form
    (National Vaccines and Immunization Program). Supports:
    - Multiple reaction types (checkboxes per MOH form)
    - Initial and follow-up reports
    - Vaccination centre details (auto-populated from facility)
    - Action taken (treatment, specimen collection)
    - DHIS2 AEFI Tracker submission
    """

    immunization_record = models.ForeignKey(
        ImmunizationRecord,
        on_delete=models.PROTECT,
        related_name="aefi_reports",
        help_text="The immunization that caused the adverse event",
    )

    # --- Report type (MOH: Initial Report / Follow-up Report) ---
    report_type = models.CharField(
        max_length=10,
        choices=AEFIReportType.choices,
        default=AEFIReportType.INITIAL,
        help_text="Initial or follow-up report",
    )
    parent_report = models.ForeignKey(
        "self",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="follow_ups",
        help_text="Parent AEFI report (for follow-up reports)",
    )

    # --- Patient context (MOH: Guardian name) ---
    guardian_name = models.CharField(
        max_length=200,
        blank=True,
        default="",
        help_text="Name of guardian (if patient is a child)",
    )

    # --- Vaccination centre (MOH: auto-populated from facility) ---
    vaccination_centre_name = models.CharField(
        max_length=200,
        blank=True,
        default="",
        help_text="Vaccination centre name (auto-populated from facility)",
    )
    vaccination_centre_county = models.ForeignKey(
        "core.County",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="+",
        help_text="County of vaccination centre",
    )
    institution_mfl_code = models.CharField(
        max_length=20,
        blank=True,
        default="",
        help_text="Institution Master Facility List code",
    )
    vaccination_service_type = models.CharField(
        max_length=10,
        choices=VaccinationServiceType.choices,
        blank=True,
        default="",
        help_text="Type of vaccination service (static, mass, outreach)",
    )

    # --- Event details (MOH: onset date + time, AEFI types as checkboxes) ---
    event_date = models.DateField(
        default=date.today,
        help_text="Date adverse event was observed",
    )
    onset_time = models.TimeField(
        null=True,
        blank=True,
        help_text="Time of onset (if known)",
    )
    event_types = models.JSONField(
        default=list,
        help_text="List of AEFI event types (multi-select per MOH form checkboxes)",
    )
    other_event_type_detail = models.CharField(
        max_length=200,
        blank=True,
        default="",
        help_text="Specify if 'Other' event type is selected",
    )
    severity = models.CharField(
        max_length=10,
        choices=AEFISeverity.choices,
    )
    description = models.TextField(
        help_text="Brief details on the event including timeline of occurrence",
    )

    # --- Outcome (MOH: Recovered / Recovering / Not recovered / Unknown / Died) ---
    outcome = models.CharField(
        max_length=20,
        choices=AEFIOutcome.choices,
        default=AEFIOutcome.UNKNOWN,
    )

    # --- Past medical history (MOH: allergies, concomitant meds, pregnancy) ---
    past_medical_history_notes = models.TextField(
        blank=True,
        default="",
        help_text="Past medical history including allergies, concomitant medication/vaccine, "
        "concomitant illness, other cases, pregnancy status",
    )

    # --- Action taken (MOH: treatment given, specimen collected) ---
    treatment_given = models.BooleanField(
        default=False,
        help_text="Whether treatment was given",
    )
    treatment_details = models.TextField(
        blank=True,
        default="",
        help_text="Treatment given (specify)",
    )
    specimen_collected = models.BooleanField(
        default=False,
        help_text="Whether specimen was collected for investigation",
    )
    specimen_type = models.CharField(
        max_length=200,
        blank=True,
        default="",
        help_text="Type(s) of specimen collected",
    )

    # --- Reporter (MOH: Name of Person Reporting + Designation) ---
    reported_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="aefi_reported",
        help_text="Person who reported the AEFI",
    )
    reported_by_designation = models.CharField(
        max_length=100,
        blank=True,
        default="",
        help_text="Designation of the person reporting",
    )

    # --- Reporting to authorities ---
    reported_to_authorities = models.BooleanField(
        default=False,
        help_text="Whether reported to national authorities",
    )
    report_date = models.DateField(
        null=True,
        blank=True,
        help_text="Date reported to authorities",
    )

    # --- Investigation ---
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

    # --- National classification (filled at national level, synced from DHIS2) ---
    national_classification = models.CharField(
        max_length=200,
        blank=True,
        default="",
        help_text="Final classification of AEFI (to be filled at national level)",
    )

    # --- DHIS2 integration ---
    dhis2_submitted_at = models.DateTimeField(
        null=True,
        blank=True,
        help_text="Timestamp of DHIS2 AEFI Tracker submission",
    )
    dhis2_response = models.JSONField(
        null=True,
        blank=True,
        help_text="DHIS2 API response from submission",
    )

    # Audit trail
    history = HistoricalRecords()

    class Meta:
        ordering = ["-event_date"]
        verbose_name = "AEFI Report"
        verbose_name_plural = "AEFI Reports"

    def __str__(self):
        types_display = ", ".join(self.event_types) if self.event_types else "Unknown"
        return (
            f"AEFI [{types_display}] - {self.immunization_record.vaccine.code} ({self.event_date})"
        )

    def save(self, *args, **kwargs):
        # Auto-populate facility info on first save
        if not self.vaccination_centre_name and self.facility:
            self.vaccination_centre_name = self.facility.name
            self.institution_mfl_code = self.facility.mfl_code
            if hasattr(self.facility, "county") and self.facility.county:
                self.vaccination_centre_county = self.facility.county
        # Default vaccination_service_type from the immunization record
        if not self.vaccination_service_type and self.immunization_record_id:
            self.vaccination_service_type = self.immunization_record.vaccination_service_type
        super().save(*args, **kwargs)

    def submit_to_authorities(self, user=None, notes: str = "") -> None:  # noqa: ARG002
        """Mark as reported to authorities. Enqueues async DHIS2 Tracker submission."""
        from django.utils import timezone as tz

        self.reported_to_authorities = True
        self.report_date = tz.now().date()
        update_fields = ["reported_to_authorities", "report_date"]
        if notes:
            self.investigation_notes = notes
            update_fields.append("investigation_notes")
        self.save(update_fields=update_fields)

        # Enqueue async DHIS2 submission (fails silently if Celery/Redis unavailable)
        try:
            from hmis.apps.immunizations.tasks import submit_aefi_to_dhis2

            submit_aefi_to_dhis2.delay(self.pk)
        except Exception:  # noqa: BLE001
            import logging

            logging.getLogger(__name__).warning(
                "Could not enqueue DHIS2 submission for AEFI %s (Celery may be offline)",
                self.pk,
            )

    @property
    def is_severe_or_death(self) -> bool:
        """Whether this AEFI requires immediate escalation."""
        return self.severity == AEFISeverity.SEVERE or AEFIOutcome.DEATH in (self.outcome,)


# =============================================================================
# Stock Management Enums
# =============================================================================


class StockTransactionType(models.TextChoices):
    RECEIVE = "RECEIVE", "Received"
    ISSUE = "ISSUE", "Issued / Administered"
    WASTAGE = "WASTAGE", "Wastage"
    ADJUSTMENT = "ADJUSTMENT", "Adjustment"
    TRANSFER_IN = "TRANSFER_IN", "Transfer In"
    TRANSFER_OUT = "TRANSFER_OUT", "Transfer Out"
    EXPIRED = "EXPIRED", "Expired"


class ColdChainEquipmentType(models.TextChoices):
    FRIDGE = "FRIDGE", "Refrigerator"
    FREEZER = "FREEZER", "Freezer"
    COLD_BOX = "COLD_BOX", "Cold Box"
    VACCINE_CARRIER = "VACCINE_CARRIER", "Vaccine Carrier"
    COLD_ROOM = "COLD_ROOM", "Cold Room"


class ColdChainEquipmentStatus(models.TextChoices):
    OPERATIONAL = "OPERATIONAL", "Operational"
    FAULTY = "FAULTY", "Faulty"
    DECOMMISSIONED = "DECOMMISSIONED", "Decommissioned"
    UNDER_REPAIR = "UNDER_REPAIR", "Under Repair"


class IncidentType(models.TextChoices):
    POWER_OUTAGE = "POWER_OUTAGE", "Power Outage"
    COLD_CHAIN_BREAK = "COLD_CHAIN_BREAK", "Cold Chain Break"
    EQUIPMENT_FAILURE = "EQUIPMENT_FAILURE", "Equipment Failure"
    STOCK_DAMAGE = "STOCK_DAMAGE", "Stock Damage"
    THEFT = "THEFT", "Theft / Loss"
    EXPIRED_STOCK = "EXPIRED_STOCK", "Expired Stock"
    OTHER = "OTHER", "Other"


class IncidentSeverity(models.TextChoices):
    LOW = "LOW", "Low"
    MEDIUM = "MEDIUM", "Medium"
    HIGH = "HIGH", "High"
    CRITICAL = "CRITICAL", "Critical"


class IncidentStatus(models.TextChoices):
    OPEN = "OPEN", "Open"
    INVESTIGATING = "INVESTIGATING", "Investigating"
    RESOLVED = "RESOLVED", "Resolved"
    CLOSED = "CLOSED", "Closed"


# =============================================================================
# Vaccine Stock
# =============================================================================


class VaccineStock(FacilityScopedModel, TimeStampedModel):
    """
    Vaccine batch inventory tracking.

    Each record represents a batch of a specific vaccine held at the facility.
    Stock is decremented when vaccines are administered (linked to ImmunizationRecord).
    """

    vaccine = models.ForeignKey(
        VaccineDefinition,
        on_delete=models.PROTECT,
        related_name="stock_batches",
        help_text="Vaccine this batch belongs to",
    )
    batch_number = models.CharField(
        max_length=50,
        help_text="Manufacturer batch/lot number",
    )
    quantity_received = models.PositiveIntegerField(
        help_text="Original quantity received (doses)",
    )
    quantity_on_hand = models.PositiveIntegerField(
        help_text="Current quantity available (doses)",
    )
    expiry_date = models.DateField(
        help_text="Batch expiry date",
    )
    manufacturer = models.CharField(
        max_length=200,
        blank=True,
        default="",
        help_text="Manufacturer name",
    )
    supplier = models.CharField(
        max_length=200,
        blank=True,
        default="",
        help_text="Supplier / source (e.g., KEMSA, WHO, direct)",
    )
    received_date = models.DateField(
        help_text="Date batch was received at facility",
    )
    received_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="vaccine_stock_received",
    )
    storage_location = models.CharField(
        max_length=100,
        blank=True,
        default="",
        help_text="Storage location (e.g., Main Fridge, Cold Room A)",
    )
    vvm_status = models.CharField(
        max_length=20,
        blank=True,
        default="",
        help_text="Vaccine Vial Monitor status at receipt (Stage 1-4)",
    )
    min_stock_level = models.PositiveIntegerField(
        default=10,
        help_text="Minimum stock level before alert",
    )
    notes = models.TextField(
        blank=True,
        default="",
    )

    class Meta:
        ordering = ["expiry_date"]
        verbose_name = "Vaccine Stock Batch"
        verbose_name_plural = "Vaccine Stock Batches"
        unique_together = ["vaccine", "batch_number"]

    def __str__(self):
        return f"{self.vaccine.code} batch {self.batch_number} ({self.quantity_on_hand} doses)"

    @property
    def is_expired(self) -> bool:
        return self.expiry_date < date.today()

    @property
    def is_low_stock(self) -> bool:
        return self.quantity_on_hand <= self.min_stock_level

    @property
    def is_near_expiry(self) -> bool:
        """Within 30 days of expiry."""
        if self.is_expired:
            return False
        return (self.expiry_date - date.today()).days <= 30


class StockTransaction(TimeStampedModel):
    """
    Individual stock transaction (receive, issue, wastage, adjust, transfer).

    Every stock movement is recorded as a transaction for full audit trail.
    """

    stock = models.ForeignKey(
        VaccineStock,
        on_delete=models.PROTECT,
        related_name="transactions",
    )
    transaction_type = models.CharField(
        max_length=20,
        choices=StockTransactionType.choices,
    )
    quantity = models.IntegerField(
        help_text="Positive for additions, negative for reductions",
    )
    balance_after = models.PositiveIntegerField(
        help_text="Stock balance after this transaction",
    )
    reference = models.CharField(
        max_length=200,
        blank=True,
        default="",
        help_text="Reference (e.g., immunization record ID, transfer doc number)",
    )
    immunization_record = models.ForeignKey(
        ImmunizationRecord,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="stock_transactions",
        help_text="Linked immunization record (for ISSUE transactions)",
    )
    performed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="stock_transactions",
    )
    reason = models.TextField(
        blank=True,
        default="",
        help_text="Reason for wastage/adjustment",
    )
    notes = models.TextField(
        blank=True,
        default="",
    )

    class Meta:
        ordering = ["-created_at"]
        verbose_name = "Stock Transaction"
        verbose_name_plural = "Stock Transactions"

    def __str__(self):
        return (
            f"{self.get_transaction_type_display()} {abs(self.quantity)} "
            f"{self.stock.vaccine.code} ({self.stock.batch_number})"
        )


# =============================================================================
# Cold Chain Equipment & Monitoring
# =============================================================================


class ColdChainEquipment(FacilityScopedModel, TimeStampedModel):
    """
    Cold chain equipment inventory (fridges, freezers, cold boxes).

    Tracks equipment assets used for vaccine storage.
    """

    name = models.CharField(
        max_length=200,
        help_text="Equipment name/label (e.g., Main Fridge 1)",
    )
    equipment_type = models.CharField(
        max_length=20,
        choices=ColdChainEquipmentType.choices,
    )
    model_number = models.CharField(
        max_length=100,
        blank=True,
        default="",
    )
    serial_number = models.CharField(
        max_length=100,
        unique=True,
        help_text="Unique manufacturer serial number or asset tag",
    )
    manufacturer = models.CharField(
        max_length=200,
        blank=True,
        default="",
    )
    location = models.CharField(
        max_length=200,
        blank=True,
        default="",
        help_text="Physical location in facility",
    )
    capacity_litres = models.DecimalField(
        max_digits=6,
        decimal_places=1,
        null=True,
        blank=True,
        help_text="Storage capacity in litres",
    )
    min_temp = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        default=2.0,
        help_text="Minimum acceptable temperature (\u00b0C)",
    )
    max_temp = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        default=8.0,
        help_text="Maximum acceptable temperature (\u00b0C)",
    )
    status = models.CharField(
        max_length=20,
        choices=ColdChainEquipmentStatus.choices,
        default=ColdChainEquipmentStatus.OPERATIONAL,
    )
    installation_date = models.DateField(
        null=True,
        blank=True,
    )
    last_maintenance_date = models.DateField(
        null=True,
        blank=True,
    )
    next_maintenance_date = models.DateField(
        null=True,
        blank=True,
    )
    power_source = models.CharField(
        max_length=100,
        blank=True,
        default="",
        help_text="Power source (e.g., Mains, Solar, Gas)",
    )
    has_backup_power = models.BooleanField(
        default=False,
        help_text="Equipment has backup power source",
    )
    notes = models.TextField(
        blank=True,
        default="",
    )

    class Meta:
        ordering = ["name"]
        verbose_name = "Cold Chain Equipment"
        verbose_name_plural = "Cold Chain Equipment"

    def __str__(self):
        return f"{self.name} ({self.get_equipment_type_display()})"


class TemperatureLog(TimeStampedModel):
    """
    Temperature reading for cold chain equipment.

    Should be recorded at regular intervals (e.g., twice daily).
    Readings outside the min/max range trigger alerts.
    """

    equipment = models.ForeignKey(
        ColdChainEquipment,
        on_delete=models.CASCADE,
        related_name="temperature_logs",
    )
    temperature = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        help_text="Temperature reading in \u00b0C",
    )
    recorded_at = models.DateTimeField(
        help_text="When the reading was taken",
    )
    recorded_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="temperature_logs_recorded",
    )
    is_excursion = models.BooleanField(
        default=False,
        help_text="Temperature outside acceptable range",
    )
    action_taken = models.TextField(
        blank=True,
        default="",
        help_text="Action taken if excursion detected",
    )

    class Meta:
        ordering = ["-recorded_at"]
        verbose_name = "Temperature Log"
        verbose_name_plural = "Temperature Logs"

    def __str__(self):
        return f"{self.equipment.name}: {self.temperature}\u00b0C at {self.recorded_at}"

    def save(self, *args, **kwargs):
        """Auto-flag excursions based on equipment min/max temp."""
        if self.equipment_id:
            eq = self.equipment
            self.is_excursion = self.temperature < eq.min_temp or self.temperature > eq.max_temp
        super().save(*args, **kwargs)


# =============================================================================
# Vaccine Incident Reporting
# =============================================================================


class VaccineIncident(HistoryMixin, FacilityScopedModel, TimeStampedModel):
    """
    Incident report for vaccine-related events.

    Captures power outages, cold chain breaks, stock damage, equipment failures,
    and other events that may affect vaccine viability.
    """

    title = models.CharField(
        max_length=200,
        help_text="Brief description of the incident",
    )
    incident_type = models.CharField(
        max_length=30,
        choices=IncidentType.choices,
    )
    severity = models.CharField(
        max_length=10,
        choices=IncidentSeverity.choices,
        default=IncidentSeverity.MEDIUM,
    )
    status = models.CharField(
        max_length=20,
        choices=IncidentStatus.choices,
        default=IncidentStatus.OPEN,
    )
    description = models.TextField(
        help_text="Detailed description of the incident",
    )

    # Timing
    occurred_at = models.DateTimeField(
        help_text="When the incident occurred",
    )
    resolved_at = models.DateTimeField(
        null=True,
        blank=True,
        help_text="When the incident was resolved",
    )
    duration_minutes = models.PositiveIntegerField(
        null=True,
        blank=True,
        help_text="Duration of the incident in minutes",
    )

    # Affected assets
    affected_equipment = models.ManyToManyField(
        ColdChainEquipment,
        blank=True,
        related_name="incidents",
        help_text="Cold chain equipment affected",
    )
    affected_batches = models.ManyToManyField(
        VaccineStock,
        blank=True,
        related_name="incidents",
        help_text="Vaccine batches affected",
    )
    doses_affected = models.PositiveIntegerField(
        default=0,
        help_text="Estimated number of vaccine doses affected",
    )
    doses_lost = models.PositiveIntegerField(
        default=0,
        help_text="Number of vaccine doses lost/wasted due to incident",
    )

    # Corrective actions
    corrective_actions = models.TextField(
        blank=True,
        default="",
        help_text="Actions taken to resolve the incident",
    )
    preventive_actions = models.TextField(
        blank=True,
        default="",
        help_text="Actions taken to prevent recurrence",
    )

    # Reporting
    reported_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="vaccine_incidents_reported",
    )
    investigated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="vaccine_incidents_investigated",
    )
    reported_to_county = models.BooleanField(
        default=False,
        help_text="Reported to county health office",
    )

    # Audit trail
    history = HistoricalRecords()

    class Meta:
        ordering = ["-occurred_at"]
        verbose_name = "Vaccine Incident"
        verbose_name_plural = "Vaccine Incidents"

    def __str__(self):
        return f"{self.get_incident_type_display()}: {self.title}"
