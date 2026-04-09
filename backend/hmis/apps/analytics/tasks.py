"""
Analytics Celery tasks.

Scheduled ETL tasks that populate analytics aggregate tables
from transactional data.
"""

from __future__ import annotations

import logging
from datetime import date, timedelta

from celery import shared_task
from django.utils import timezone

logger = logging.getLogger(__name__)


@shared_task(
    name="hmis.apps.analytics.tasks.refresh_daily_analytics",
    max_retries=2,
    default_retry_delay=300,
)
def refresh_daily_analytics(target_date_iso: str | None = None):
    """
    Compute and persist daily summaries for all active facilities.

    Runs nightly at 02:00 EAT.  Processes yesterday by default.
    """
    from hmis.apps.analytics.models import FacilityDailySummary
    from hmis.apps.analytics.services import compute_daily_summary
    from hmis.apps.core.models import Facility

    if target_date_iso:
        target_date = date.fromisoformat(target_date_iso)
    else:
        target_date = timezone.localdate() - timedelta(days=1)

    facilities = Facility.objects.filter(is_active=True)
    created = 0
    updated = 0

    for facility in facilities:
        try:
            defaults = compute_daily_summary(facility, target_date)
            _, was_created = FacilityDailySummary.objects.update_or_create(
                facility=facility,
                date=target_date,
                defaults={**defaults, "organization": facility.organization},
            )
            if was_created:
                created += 1
            else:
                updated += 1
        except Exception:
            logger.exception(
                "Failed to compute daily summary for facility=%s date=%s",
                facility.pk,
                target_date,
            )

    logger.info(
        "Daily analytics for %s: %d created, %d updated across %d facilities",
        target_date,
        created,
        updated,
        facilities.count(),
    )
    return {"date": str(target_date), "created": created, "updated": updated}


@shared_task(
    name="hmis.apps.analytics.tasks.refresh_monthly_analytics",
    max_retries=2,
    default_retry_delay=600,
)
def refresh_monthly_analytics(year: int | None = None, month: int | None = None):
    """
    Compute and persist monthly department summaries and diagnosis trends.

    Runs on the 1st of each month at 03:00 EAT, processing the previous month.
    """
    from hmis.apps.analytics.models import DepartmentMonthlySummary, DiagnosisTrend
    from hmis.apps.analytics.services import compute_department_monthly, compute_diagnosis_trends
    from hmis.apps.core.models import Facility

    today = timezone.localdate()
    if year is None or month is None:
        # Previous month
        first_of_this_month = today.replace(day=1)
        last_month = first_of_this_month - timedelta(days=1)
        year = last_month.year
        month = last_month.month

    month_start = date(year, month, 1)
    if month == 12:
        month_end = date(year + 1, 1, 1) - timedelta(days=1)
    else:
        month_end = date(year, month + 1, 1) - timedelta(days=1)

    facilities = Facility.objects.filter(is_active=True)
    dept_count = 0
    dx_count = 0

    for facility in facilities:
        try:
            # Department summaries
            dept_rows = compute_department_monthly(facility, year, month)
            for row in dept_rows:
                DepartmentMonthlySummary.objects.update_or_create(
                    facility=facility,
                    year=year,
                    month=month,
                    department=row.pop("department"),
                    defaults={**row, "organization": facility.organization},
                )
                dept_count += 1

            # Diagnosis trends (monthly granularity)
            dx_rows = compute_diagnosis_trends(facility, month_start, month_end, "MONTHLY")
            for row in dx_rows:
                DiagnosisTrend.objects.update_or_create(
                    facility=facility,
                    icd10_code=row["icd10_code"],
                    granularity="MONTHLY",
                    period_start=month_start,
                    defaults={
                        **row,
                        "organization": facility.organization,
                    },
                )
                dx_count += 1
        except Exception:
            logger.exception(
                "Failed monthly analytics for facility=%s %d/%02d",
                facility.pk,
                year,
                month,
            )

    logger.info(
        "Monthly analytics for %d/%02d: %d dept summaries, %d diagnosis trends",
        year,
        month,
        dept_count,
        dx_count,
    )
    return {
        "year": year,
        "month": month,
        "department_summaries": dept_count,
        "diagnosis_trends": dx_count,
    }


@shared_task(
    name="hmis.apps.analytics.tasks.refresh_demographics_snapshot",
    max_retries=2,
    default_retry_delay=600,
)
def refresh_demographics_snapshot():
    """
    Compute and persist patient demographic snapshots.

    Runs monthly on the 1st at 04:00 EAT.
    """
    from hmis.apps.analytics.models import PatientDemographicSnapshot
    from hmis.apps.analytics.services import compute_demographics_snapshot
    from hmis.apps.core.models import Facility

    snapshot_date = timezone.localdate()
    facilities = Facility.objects.filter(is_active=True)
    count = 0

    for facility in facilities:
        try:
            defaults = compute_demographics_snapshot(facility, snapshot_date)
            PatientDemographicSnapshot.objects.update_or_create(
                facility=facility,
                snapshot_date=snapshot_date,
                defaults={**defaults, "organization": facility.organization},
            )
            count += 1
        except Exception:
            logger.exception(
                "Failed demographics snapshot for facility=%s", facility.pk
            )

    logger.info("Demographics snapshots: %d facilities processed", count)
    return {"snapshot_date": str(snapshot_date), "facilities": count}
