"""
MOH Reporting models.

Stores generated MOH 705 (outpatient morbidity), MOH 711 (integrated RH/HIV/
Malaria/Nutrition), and MOH 717 (workload) monthly reports. Each report goes
through a draft → approved → submitted lifecycle before DHIS2 submission.
"""

from django.conf import settings
from django.db import models

from hmis.apps.core.mixins import FacilityScopedModel
from hmis.apps.core.models import TimeStampedModel

# ---------------------------------------------------------------------------
# Shared choices
# ---------------------------------------------------------------------------


class MOHReportStatus(models.TextChoices):
    DRAFT = "DRAFT", "Draft"
    APPROVED = "APPROVED", "Approved"
    SUBMITTED = "SUBMITTED", "Submitted to DHIS2"
    FAILED = "FAILED", "Submission Failed"


# ---------------------------------------------------------------------------
# Abstract base
# ---------------------------------------------------------------------------


class AbstractMOHReport(FacilityScopedModel, TimeStampedModel):
    """Common fields shared by all MOH report types."""

    period_start = models.DateField(help_text="First day of the reporting month")
    period_end = models.DateField(help_text="Last day of the reporting month")
    status = models.CharField(
        max_length=20,
        choices=MOHReportStatus.choices,
        default=MOHReportStatus.DRAFT,
    )

    # Generation metadata
    generated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="%(class)s_generated",
    )
    generated_at = models.DateTimeField(null=True, blank=True)

    # Approval
    approved_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="%(class)s_approved",
    )
    approved_at = models.DateTimeField(null=True, blank=True)

    # DHIS2 submission tracking
    dhis2_submitted_at = models.DateTimeField(null=True, blank=True)
    dhis2_response = models.JSONField(default=dict, blank=True)
    dhis2_import_summary = models.JSONField(default=dict, blank=True)

    notes = models.TextField(blank=True, default="")

    class Meta:
        abstract = True

    # -- Status transition helpers ------------------------------------------

    def approve(self, user=None):  # type: ignore[override]
        from django.utils import timezone

        self.status = MOHReportStatus.APPROVED
        self.approved_by = user
        self.approved_at = timezone.now()
        self.save(
            update_fields=["status", "approved_by", "approved_at", "updated_at"]
        )

    def mark_submitted(self, dhis2_response: dict):
        from django.utils import timezone

        self.status = MOHReportStatus.SUBMITTED
        self.dhis2_submitted_at = timezone.now()
        self.dhis2_response = dhis2_response
        self.dhis2_import_summary = dhis2_response.get("importCount", {})
        self.save(
            update_fields=[
                "status",
                "dhis2_submitted_at",
                "dhis2_response",
                "dhis2_import_summary",
                "updated_at",
            ]
        )

    def mark_failed(self, error_response: dict):
        self.status = MOHReportStatus.FAILED
        self.dhis2_response = error_response
        self.save(update_fields=["status", "dhis2_response", "updated_at"])

    # -- Computed properties ------------------------------------------------

    @property
    def is_submitted(self) -> bool:
        return self.status == MOHReportStatus.SUBMITTED

    @property
    def can_edit(self) -> bool:
        return self.status in (MOHReportStatus.DRAFT, MOHReportStatus.FAILED)

    @property
    def period_label(self) -> str:
        return self.period_start.strftime("%B %Y")

    @property
    def dhis2_period(self) -> str:
        """DHIS2 monthly period format: YYYYMM."""
        return self.period_start.strftime("%Y%m")


# ---------------------------------------------------------------------------
# MOH 705 — Outpatient Morbidity
# ---------------------------------------------------------------------------


class MOH705Report(AbstractMOHReport):
    """
    Monthly outpatient morbidity tally aggregated from encounter diagnoses.

    Individual disease rows stored in :model:`MOH705DiseaseRow`.
    """

    total_visits = models.IntegerField(default=0)
    total_under_5 = models.IntegerField(default=0)
    total_5_and_above = models.IntegerField(default=0)
    revisits = models.IntegerField(default=0)
    new_cases = models.IntegerField(default=0)

    class Meta:
        verbose_name = "MOH 705 Report"
        verbose_name_plural = "MOH 705 Reports"
        unique_together = [("facility", "period_start")]
        ordering = ["-period_start"]

    def __str__(self) -> str:
        return f"MOH 705 — {self.period_label} — {getattr(self.facility, 'name', '?')}"


class MOH705DiseaseRow(models.Model):
    """Per-disease breakdown within an MOH 705 report."""

    report = models.ForeignKey(
        MOH705Report,
        on_delete=models.CASCADE,
        related_name="disease_rows",
    )
    icd10_chapter = models.IntegerField(help_text="ICD-10 chapter (1-22)")
    category_name = models.CharField(
        max_length=200, help_text="Disease category name"
    )
    cases_under_5 = models.IntegerField(default=0)
    cases_5_and_above = models.IntegerField(default=0)
    total_cases = models.IntegerField(default=0)

    class Meta:
        verbose_name = "MOH 705 Disease Row"
        verbose_name_plural = "MOH 705 Disease Rows"
        unique_together = [("report", "icd10_chapter")]
        ordering = ["icd10_chapter"]

    def __str__(self) -> str:
        return f"Ch.{self.icd10_chapter} — {self.category_name}: {self.total_cases}"


# ---------------------------------------------------------------------------
# MOH 711 — Integrated RH / HIV / Malaria / Nutrition
# ---------------------------------------------------------------------------


class MOH711Report(AbstractMOHReport):
    """
    Monthly integrated summary of reproductive health, HIV, malaria, and
    nutrition indicators.
    """

    # Reproductive health
    anc_visits = models.IntegerField(default=0)
    deliveries_normal = models.IntegerField(default=0)
    deliveries_caesarean = models.IntegerField(default=0)
    deliveries_total = models.IntegerField(default=0)
    live_births = models.IntegerField(default=0)
    still_births = models.IntegerField(default=0)

    # Malaria
    malaria_cases_under_5 = models.IntegerField(default=0)
    malaria_cases_5_and_above = models.IntegerField(default=0)
    malaria_in_pregnancy = models.IntegerField(default=0)

    # Nutrition
    children_underweight = models.IntegerField(default=0)
    children_stunted = models.IntegerField(default=0)
    children_wasted = models.IntegerField(default=0)

    # Immunisation (summary counts)
    bcg_given = models.IntegerField(default=0)
    opv_given = models.IntegerField(default=0)
    penta_given = models.IntegerField(default=0)
    measles_given = models.IntegerField(default=0)
    fully_immunised = models.IntegerField(default=0)

    class Meta:
        verbose_name = "MOH 711 Report"
        verbose_name_plural = "MOH 711 Reports"
        unique_together = [("facility", "period_start")]
        ordering = ["-period_start"]

    def __str__(self) -> str:
        return f"MOH 711 — {self.period_label} — {getattr(self.facility, 'name', '?')}"


# ---------------------------------------------------------------------------
# MOH 717 — Workload Summary
# ---------------------------------------------------------------------------


class MOH717Report(AbstractMOHReport):
    """
    Monthly facility workload summary — admissions, discharges, surgeries,
    referrals, deliveries.
    """

    # OPD
    opd_new_visits = models.IntegerField(default=0)
    opd_revisits = models.IntegerField(default=0)
    opd_total = models.IntegerField(default=0)

    # Inpatient
    admissions_total = models.IntegerField(default=0)
    discharges_total = models.IntegerField(default=0)
    inpatient_days = models.IntegerField(default=0)
    deaths_total = models.IntegerField(default=0)

    # Deliveries
    deliveries_total = models.IntegerField(default=0)
    deliveries_caesarean = models.IntegerField(default=0)

    # Theatre
    surgeries_major = models.IntegerField(default=0)
    surgeries_minor = models.IntegerField(default=0)

    # Referrals
    referrals_in = models.IntegerField(default=0)
    referrals_out = models.IntegerField(default=0)

    # Lab
    lab_tests_total = models.IntegerField(default=0)

    # Emergency
    emergency_visits = models.IntegerField(default=0)

    class Meta:
        verbose_name = "MOH 717 Report"
        verbose_name_plural = "MOH 717 Reports"
        unique_together = [("facility", "period_start")]
        ordering = ["-period_start"]

    def __str__(self) -> str:
        return f"MOH 717 — {self.period_label} — {getattr(self.facility, 'name', '?')}"


# ---------------------------------------------------------------------------
# DHIS2 data-element mapping for MOH reports
# ---------------------------------------------------------------------------


class MOHDataElementMapping(models.Model):
    """
    Maps MOH report indicators to DHIS2 data-element UIDs.

    One row per (report_type, indicator_code, environment) combination.
    """

    class ReportType(models.TextChoices):
        MOH705 = "MOH705", "MOH 705"
        MOH711 = "MOH711", "MOH 711"
        MOH717 = "MOH717", "MOH 717"

    class Environment(models.TextChoices):
        LOCAL = "local", "Local Development"
        STAGING = "staging", "Staging / UAT"
        PRODUCTION = "production", "Production (KHIS)"

    report_type = models.CharField(max_length=10, choices=ReportType.choices)
    indicator_code = models.CharField(
        max_length=60,
        help_text="Internal indicator code, e.g. 'malaria_under_5', 'opd_total'",
    )
    environment = models.CharField(
        max_length=20,
        choices=Environment.choices,
        default=Environment.LOCAL,
    )
    data_element_uid = models.CharField(
        max_length=11,
        help_text="DHIS2 dataElement UID",
    )
    short_name = models.CharField(max_length=120, blank=True, default="")
    is_active = models.BooleanField(default=True)

    class Meta:
        verbose_name = "MOH DHIS2 Mapping"
        verbose_name_plural = "MOH DHIS2 Mappings"
        unique_together = [("report_type", "indicator_code", "environment")]
        ordering = ["report_type", "indicator_code"]

    def __str__(self) -> str:
        return f"{self.report_type}/{self.indicator_code} → {self.data_element_uid}"

    @classmethod
    def get_uid(
        cls,
        report_type: str,
        indicator_code: str,
        environment: str | None = None,
    ) -> str | None:
        import os

        env = environment or os.environ.get("DHIS2_ENVIRONMENT", "local")
        mapping = (
            cls.objects.filter(
                report_type=report_type,
                indicator_code=indicator_code,
                environment=env,
                is_active=True,
            )
            .values_list("data_element_uid", flat=True)
            .first()
        )
        return mapping
