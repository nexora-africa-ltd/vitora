"""Celery tasks for Clinics.

Priority 3: monthly clinic reports aggregation.
"""

from __future__ import annotations

from datetime import date

from celery import shared_task
from django.utils import timezone

from .services.reporting import generate_all_clinic_reports


def _previous_year_month(reference: date) -> tuple[int, int]:
    if reference.month == 1:
        return reference.year - 1, 12
    return reference.year, reference.month - 1


@shared_task(name="hmis.apps.clinics.tasks.generate_monthly_clinic_reports")
def generate_monthly_clinic_reports(*, year: int | None = None, month: int | None = None) -> int:
    """Generate monthly clinic reports.

    If year/month are not provided, generates reports for the previous month
    relative to `timezone.localdate()`.

    Returns number of reports generated.
    """

    if year is None or month is None:
        year, month = _previous_year_month(timezone.localdate())

    reports = generate_all_clinic_reports(year=year, month=month)
    return len(list(reports))
