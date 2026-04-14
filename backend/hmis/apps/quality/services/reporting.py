"""Quarterly and annual report aggregation services.

Aggregates MonthlyClinicReports into quarterly/annual reports.
"""

from __future__ import annotations

from decimal import Decimal
from typing import TYPE_CHECKING

from django.db import transaction

from hmis.apps.clinics.models import Clinic, MonthlyClinicReport
from hmis.apps.quality.models import AnnualReport, QuarterlyReport

if TYPE_CHECKING:
    from django.contrib.auth.models import AbstractUser


# Fields to aggregate (sum) from monthly reports
_AGGREGATE_FIELDS = [
    "total_visits",
    "new_visits",
    "revisits",
    "priority_red",
    "priority_orange",
    "priority_yellow",
    "priority_green",
    "priority_blue",
    "male_visits",
    "female_visits",
    "under_5_visits",
    "under_18_visits",
    "adult_visits",
    "over_60_visits",
    "new_enrollments",
    "active_enrollments",
    "defaulters",
    "anc_first_visits",
    "anc_revisits",
    "deliveries",
]

_REVENUE_FIELDS = [
    "total_revenue",
    "sha_claims_amount",
    "cash_amount",
]


def _quarter_months(quarter: int) -> list[int]:
    """Return the 3 months for a given quarter (1-4)."""
    start = (quarter - 1) * 3 + 1
    return [start, start + 1, start + 2]


def _aggregate_monthly_reports(
    monthly_reports: list[MonthlyClinicReport],
) -> dict:
    """Sum up aggregate fields from a list of MonthlyClinicReports."""
    defaults: dict = {}

    for field in _AGGREGATE_FIELDS:
        defaults[field] = sum(getattr(r, field, 0) for r in monthly_reports)

    for field in _REVENUE_FIELDS:
        defaults[field] = sum((getattr(r, field, None) or Decimal("0.00")) for r in monthly_reports)

    return defaults


def generate_quarterly_report(
    clinic: Clinic,
    year: int,
    quarter: int,
    *,
    user: AbstractUser | None = None,
) -> QuarterlyReport:
    """Generate (or update) a quarterly report for a clinic.

    Aggregates MonthlyClinicReports for the 3 months in the quarter.
    """
    months = _quarter_months(quarter)

    monthly_reports = list(
        MonthlyClinicReport.objects.filter(
            clinic=clinic,
            year=year,
            month__in=months,
        )
    )

    defaults = _aggregate_monthly_reports(monthly_reports)
    defaults["generated_by"] = user

    with transaction.atomic():
        report, _created = QuarterlyReport.objects.update_or_create(
            clinic=clinic,
            year=year,
            quarter=quarter,
            defaults=defaults,
        )
        # Link the monthly reports
        report.monthly_reports.set(monthly_reports)

    return report


def generate_all_quarterly_reports(
    year: int,
    quarter: int,
    *,
    user: AbstractUser | None = None,
) -> list[QuarterlyReport]:
    """Generate quarterly reports for all clinics."""
    reports = []
    for clinic in Clinic.objects.all():
        reports.append(generate_quarterly_report(clinic, year, quarter, user=user))
    return reports


def generate_annual_report(
    clinic: Clinic,
    year: int,
    *,
    user: AbstractUser | None = None,
) -> AnnualReport:
    """Generate (or update) an annual report for a clinic.

    Aggregates the 4 QuarterlyReports for the year. If quarterly reports
    don't exist, falls back to aggregating monthly reports directly.
    """
    quarterly_reports = list(
        QuarterlyReport.objects.filter(
            clinic=clinic,
            year=year,
        )
    )

    if quarterly_reports:
        # Aggregate from quarterly reports
        defaults: dict = {}
        for field in _AGGREGATE_FIELDS:
            defaults[field] = sum(getattr(r, field, 0) for r in quarterly_reports)
        for field in _REVENUE_FIELDS:
            defaults[field] = sum(
                (getattr(r, field, None) or Decimal("0.00")) for r in quarterly_reports
            )
    else:
        # Fallback: aggregate directly from monthly reports
        monthly_reports = list(MonthlyClinicReport.objects.filter(clinic=clinic, year=year))
        defaults = _aggregate_monthly_reports(monthly_reports)

    defaults["generated_by"] = user

    with transaction.atomic():
        report, _created = AnnualReport.objects.update_or_create(
            clinic=clinic,
            year=year,
            defaults=defaults,
        )
        if quarterly_reports:
            report.quarterly_reports.set(quarterly_reports)

    return report


def generate_all_annual_reports(
    year: int,
    *,
    user: AbstractUser | None = None,
) -> list[AnnualReport]:
    """Generate annual reports for all clinics."""
    reports = []
    for clinic in Clinic.objects.all():
        reports.append(generate_annual_report(clinic, year, user=user))
    return reports
