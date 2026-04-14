"""Celery tasks for Quality Measures & Reporting.

Tasks:
- generate_quarterly_reports_task: Generate quarterly reports (runs quarterly)
- generate_annual_reports_task: Generate annual reports (runs annually)
"""

from __future__ import annotations

from datetime import date

from celery import shared_task
from django.utils import timezone

from .services.reporting import generate_all_annual_reports, generate_all_quarterly_reports


def _previous_quarter(reference: date) -> tuple[int, int]:
    """Return (year, quarter) for the quarter before the reference date."""
    current_month = reference.month
    current_year = reference.year

    if current_month <= 3:
        # Q1 → previous is Q4 of last year
        return current_year - 1, 4
    elif current_month <= 6:
        return current_year, 1
    elif current_month <= 9:
        return current_year, 2
    else:
        return current_year, 3


@shared_task(name="hmis.apps.quality.tasks.generate_quarterly_reports")
def generate_quarterly_reports_task(*, year: int | None = None, quarter: int | None = None) -> int:
    """Generate quarterly reports for all clinics.

    If year/quarter not provided, generates for the previous quarter.

    Returns number of reports generated.
    """
    if year is None or quarter is None:
        year, quarter = _previous_quarter(timezone.localdate())

    reports = generate_all_quarterly_reports(year=year, quarter=quarter)
    return len(reports)


@shared_task(name="hmis.apps.quality.tasks.generate_annual_reports")
def generate_annual_reports_task(*, year: int | None = None) -> int:
    """Generate annual reports for all clinics.

    If year not provided, generates for the previous year.

    Returns number of reports generated.
    """
    if year is None:
        year = timezone.localdate().year - 1

    reports = generate_all_annual_reports(year=year)
    return len(reports)
