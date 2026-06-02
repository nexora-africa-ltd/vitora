"""Celery tasks for Quality Measures & Reporting.

Tasks:
- generate_quarterly_reports_task: Generate quarterly reports (runs quarterly)
- generate_annual_reports_task: Generate annual reports (runs annually)
- evaluate_quality_measures_task: Evaluate CQMs for all active clinics
- evaluate_clinic_measures_task: Evaluate CQMs for a single clinic (triggered by signals)
"""

from __future__ import annotations

import logging
from datetime import date

from celery import shared_task
from django.utils import timezone

from .services.reporting import generate_all_annual_reports, generate_all_quarterly_reports

logger = logging.getLogger(__name__)


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


# =============================================================================
# CQM Automated Evaluation Tasks
# =============================================================================


def _current_period(reference: date) -> tuple[int, int, str]:
    """Return (year, period, period_type) for the current month."""
    return reference.year, reference.month, "MONTHLY"


@shared_task(name="hmis.apps.quality.tasks.evaluate_quality_measures")
def evaluate_quality_measures_task(
    *, year: int | None = None, period: int | None = None, period_type: str = "MONTHLY"
) -> dict:
    """
    Evaluate all active quality measures for all clinics with active sessions.

    Runs nightly via Celery beat. Evaluates the current month by default.
    Returns summary of evaluations performed.
    """
    from hmis.apps.clinics.models import Clinic

    from .services.evaluation import evaluate_all_measures_for_clinic

    today = timezone.localdate()
    if year is None or period is None:
        year, period, period_type = _current_period(today)

    # Get all active clinics
    clinics = Clinic.objects.filter(status="ACTIVE").values_list("id", flat=True)

    total_results = 0
    clinics_evaluated = 0

    for clinic_id in clinics:
        results = evaluate_all_measures_for_clinic(clinic_id, year, period, period_type)
        if results:
            total_results += len(results)
            clinics_evaluated += 1

    logger.info(
        "CQM evaluation complete: %d results across %d clinics (period %s %d/%d)",
        total_results,
        clinics_evaluated,
        period_type,
        year,
        period,
    )

    return {
        "year": year,
        "period": period,
        "period_type": period_type,
        "clinics_evaluated": clinics_evaluated,
        "results_created_or_updated": total_results,
    }


@shared_task(name="hmis.apps.quality.tasks.evaluate_clinic_measures")
def evaluate_clinic_measures_task(clinic_id: int) -> dict:
    """
    Evaluate all quality measures for a single clinic (current period).

    Triggered asynchronously by signals when clinical data changes
    (encounters, lab results, visits completed).
    """
    from .services.evaluation import evaluate_all_measures_for_clinic

    today = timezone.localdate()
    year, period, period_type = _current_period(today)

    results = evaluate_all_measures_for_clinic(clinic_id, year, period, period_type)

    return {
        "clinic_id": clinic_id,
        "results": len(results),
        "period": f"{year}-{period:02d}",
    }
