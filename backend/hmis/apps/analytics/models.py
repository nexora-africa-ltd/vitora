"""
Analytics & Business Intelligence models.

Provides persisted aggregate data for BI dashboards, trend analysis,
and MOH reporting.  All models inherit ``FacilityScopedModel`` to
enforce tenant isolation.

Aggregate tables are populated by nightly Celery ETL tasks
(see ``analytics.tasks``) rather than computed on each API request,
enabling fast reads for dashboards and drill-down analytics.
"""

from django.db import models
from django.utils import timezone

from hmis.apps.core.mixins import FacilityScopedModel
from hmis.apps.core.models import TimeStampedModel


class FacilityDailySummary(FacilityScopedModel, TimeStampedModel):
    """
    Daily rollup of key facility metrics.

    One row per facility per date.  Populated by the
    ``refresh_daily_analytics`` Celery task at 02:00 EAT.
    """

    date = models.DateField(help_text="Calendar date for this summary.")

    # Patient metrics
    new_patients = models.PositiveIntegerField(
        default=0, help_text="Patients registered on this date."
    )
    total_patients = models.PositiveIntegerField(
        default=0, help_text="Cumulative patient count as of this date."
    )

    # Encounter metrics
    encounters_opd = models.PositiveIntegerField(default=0)
    encounters_ipd = models.PositiveIntegerField(default=0)
    encounters_emergency = models.PositiveIntegerField(default=0)
    encounters_other = models.PositiveIntegerField(
        default=0, help_text="ANC, follow-up, specialist, etc."
    )
    encounters_total = models.PositiveIntegerField(default=0)

    # Revenue (KES)
    revenue_total = models.DecimalField(
        max_digits=14, decimal_places=2, default=0,
        help_text="Sum of completed payments on this date.",
    )
    revenue_cash = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    revenue_mpesa = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    revenue_insurance = models.DecimalField(max_digits=14, decimal_places=2, default=0)

    # Billing
    invoices_created = models.PositiveIntegerField(default=0)
    outstanding_balance = models.DecimalField(
        max_digits=14, decimal_places=2, default=0,
        help_text="Total unpaid balance across all open invoices as of this date.",
    )

    # Lab
    lab_orders_placed = models.PositiveIntegerField(default=0)
    lab_orders_completed = models.PositiveIntegerField(default=0)
    lab_critical_results = models.PositiveIntegerField(default=0)

    # Pharmacy
    prescriptions_dispensed = models.PositiveIntegerField(default=0)
    low_stock_alerts = models.PositiveIntegerField(default=0)

    # Triage
    triage_assessments = models.PositiveIntegerField(default=0)
    triage_emergency_count = models.PositiveIntegerField(default=0)
    avg_wait_time_minutes = models.DecimalField(
        max_digits=7, decimal_places=1, default=0,
        help_text="Average triage-to-consultation wait time in minutes.",
    )

    # Inpatient
    current_admissions = models.PositiveIntegerField(default=0)
    new_admissions = models.PositiveIntegerField(default=0)
    discharges = models.PositiveIntegerField(default=0)
    bed_occupancy_rate = models.DecimalField(
        max_digits=5, decimal_places=2, default=0,
        help_text="Percentage of beds occupied (0–100).",
    )

    # Patient flow KPIs
    return_patients = models.PositiveIntegerField(
        default=0, help_text="Patients with a prior encounter before this date.",
    )
    walk_ins = models.PositiveIntegerField(
        default=0, help_text="Patients registered with referral_source='self'.",
    )
    referral_ins = models.PositiveIntegerField(
        default=0, help_text="Patients registered referred from another facility.",
    )
    clinic_referrals = models.PositiveIntegerField(
        default=0, help_text="Patients referred from a clinic.",
    )
    follow_up_encounters = models.PositiveIntegerField(
        default=0, help_text="Encounters of type FOLLOW_UP.",
    )

    class Meta:
        verbose_name = "Facility Daily Summary"
        verbose_name_plural = "Facility Daily Summaries"
        unique_together = ["facility", "date"]
        ordering = ["-date"]
        indexes = [
            models.Index(fields=["facility", "date"]),
            models.Index(fields=["date"]),
        ]

    def __str__(self) -> str:
        facility_name = getattr(self.facility, "name", "?")
        return f"{facility_name} – {self.date}"


class DepartmentMonthlySummary(FacilityScopedModel, TimeStampedModel):
    """
    Monthly rollup per department within a facility.

    Departments correspond to encounter types / billing categories.
    """

    class Department(models.TextChoices):
        OPD = "OPD", "Outpatient"
        IPD = "IPD", "Inpatient"
        EMERGENCY = "EMERGENCY", "Emergency"
        PHARMACY = "PHARMACY", "Pharmacy"
        LABORATORY = "LABORATORY", "Laboratory"
        IMAGING = "IMAGING", "Imaging / Radiology"
        MCH = "MCH", "Maternal & Child Health"
        THEATRE = "THEATRE", "Theatre / Procedures"

    year = models.PositiveIntegerField()
    month = models.PositiveIntegerField(help_text="1-12")
    department = models.CharField(max_length=20, choices=Department.choices)

    # Volume
    visit_count = models.PositiveIntegerField(default=0)
    unique_patients = models.PositiveIntegerField(default=0)

    # Revenue
    revenue = models.DecimalField(max_digits=14, decimal_places=2, default=0)

    # Top diagnoses (JSON list of {code, name, count})
    top_diagnoses = models.JSONField(
        default=list, blank=True,
        help_text='Top 10 ICD-10 diagnoses, e.g. [{"code":"J06.9","name":"...","count":42}]',
    )

    # Performance
    avg_length_of_stay_days = models.DecimalField(
        max_digits=6, decimal_places=1, null=True, blank=True,
        help_text="Average LOS in days (IPD / inpatient only).",
    )

    class Meta:
        verbose_name = "Department Monthly Summary"
        verbose_name_plural = "Department Monthly Summaries"
        unique_together = ["facility", "year", "month", "department"]
        ordering = ["-year", "-month"]
        indexes = [
            models.Index(fields=["facility", "year", "month"]),
        ]

    def __str__(self) -> str:
        return f"{self.get_department_display()} – {self.year}/{self.month:02d}"


class DiagnosisTrend(FacilityScopedModel, TimeStampedModel):
    """
    Periodic ICD-10 diagnosis counts for epidemiological trending.

    Granularity is weekly or monthly depending on the ETL task.
    """

    class Granularity(models.TextChoices):
        WEEKLY = "WEEKLY", "Weekly"
        MONTHLY = "MONTHLY", "Monthly"

    icd10_code = models.CharField(max_length=10, help_text="ICD-10 code, e.g. J06.9")
    icd10_name = models.CharField(max_length=255, blank=True)
    granularity = models.CharField(max_length=10, choices=Granularity.choices)
    period_start = models.DateField(help_text="Start of the period (Monday for weekly).")
    period_end = models.DateField(help_text="End of the period (inclusive).")

    case_count = models.PositiveIntegerField(default=0)
    # Age-band breakdown (JSON: {"0-4": 5, "5-14": 12, "15-49": 30, "50+": 8})
    age_band_breakdown = models.JSONField(default=dict, blank=True)
    # Gender breakdown (JSON: {"M": 25, "F": 30})
    gender_breakdown = models.JSONField(default=dict, blank=True)

    class Meta:
        verbose_name = "Diagnosis Trend"
        verbose_name_plural = "Diagnosis Trends"
        unique_together = ["facility", "icd10_code", "granularity", "period_start"]
        ordering = ["-period_start", "-case_count"]
        indexes = [
            models.Index(fields=["facility", "period_start"]),
            models.Index(fields=["icd10_code", "period_start"]),
        ]

    def __str__(self) -> str:
        return f"{self.icd10_code} ({self.period_start} – {self.period_end}): {self.case_count}"


class PatientDemographicSnapshot(FacilityScopedModel, TimeStampedModel):
    """
    Periodic snapshot of patient demographics per facility.

    Taken monthly: age-band distribution, gender distribution,
    county distribution.
    """

    snapshot_date = models.DateField(default=timezone.localdate)

    total_patients = models.PositiveIntegerField(default=0)

    # Age-band distribution (JSON: {"0-4": 50, "5-14": 120, ...})
    age_distribution = models.JSONField(default=dict, blank=True)

    # Gender distribution (JSON: {"M": 500, "F": 600, "O": 5})
    gender_distribution = models.JSONField(default=dict, blank=True)

    # Top 10 counties (JSON list: [{"county": "Nairobi", "count": 200}, ...])
    county_distribution = models.JSONField(default=list, blank=True)

    # Referral source breakdown (JSON: {"self": 300, "clinic": 100, "other_facility": 50})
    referral_source_distribution = models.JSONField(default=dict, blank=True)

    # New vs returning patient split (JSON: {"new": 200, "return": 300})
    new_vs_return = models.JSONField(default=dict, blank=True)

    # Insurance coverage (JSON: {"sha": 150, "none": 200})
    insurance_coverage = models.JSONField(default=dict, blank=True)

    class Meta:
        verbose_name = "Patient Demographic Snapshot"
        verbose_name_plural = "Patient Demographic Snapshots"
        unique_together = ["facility", "snapshot_date"]
        ordering = ["-snapshot_date"]

    def __str__(self) -> str:
        return f"Demographics – {self.snapshot_date} ({self.total_patients} patients)"
