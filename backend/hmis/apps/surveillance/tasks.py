"""
Celery tasks for Disease Surveillance.

Includes:
- IDSR Weekly Report generation (Sunday midnight)
- Overdue case checking
- Outbreak threshold monitoring
"""

from __future__ import annotations

import logging

from celery import shared_task
from django.utils import timezone

logger = logging.getLogger(__name__)


@shared_task(name="hmis.apps.surveillance.tasks.generate_idsr_weekly_report")
def generate_idsr_weekly_report(
    epi_year: int | None = None,
    epi_week: int | None = None,
) -> dict:
    """
    Generate IDSR weekly report.

    If epi_year/epi_week are not provided, generates report for the
    previous epidemiological week (for scheduled Sunday midnight runs).

    Args:
        epi_year: Epidemiological year (optional)
        epi_week: Epidemiological week number (optional)

    Returns:
        dict with report details
    """
    from .services import IDSRReportingService

    try:
        if epi_year is not None and epi_week is not None:
            # Generate for specific week
            _, _, week_start, week_end = IDSRReportingService.get_epi_week()
            # Calculate correct week dates
            from datetime import timedelta

            current_year, current_week, _, _ = IDSRReportingService.get_epi_week()

            # Calculate delta weeks
            if epi_year == current_year:
                delta_weeks = current_week - epi_week
            else:
                # Simplified: assume within same year for now
                delta_weeks = 0

            today = timezone.localdate()
            target_date = today - timedelta(weeks=delta_weeks)
            _, _, week_start, week_end = IDSRReportingService.get_epi_week(target_date)

            report = IDSRReportingService.generate_weekly_report(
                epi_year=epi_year,
                epi_week=epi_week,
                week_start=week_start,
                week_end=week_end,
            )
        else:
            # Generate for previous week (default for scheduled task)
            report = IDSRReportingService.generate_previous_week_report()

        logger.info(
            f"Generated IDSR report: W{report.epi_week:02d}/{report.epi_year} - "
            f"{report.total_cases} cases"
        )

        return {
            "report_id": report.id,
            "epi_year": report.epi_year,
            "epi_week": report.epi_week,
            "total_cases": report.total_cases,
            "total_deaths": report.total_deaths,
            "disease_count": report.disease_summaries.count(),
            "status": report.status,
        }

    except Exception as e:
        logger.error(f"Failed to generate IDSR report: {e}")
        raise


@shared_task(name="hmis.apps.surveillance.tasks.check_overdue_notifications")
def check_overdue_notifications() -> dict:
    """
    Check for cases that have passed notification deadline.

    Creates overdue alerts for cases not notified on time.

    Returns:
        dict with count of newly overdue cases
    """
    from .services import SurveillanceService

    try:
        overdue_cases = SurveillanceService.check_overdue_cases()

        if overdue_cases:
            logger.warning(f"Found {len(overdue_cases)} overdue notifications")

        return {
            "overdue_count": len(overdue_cases),
            "cases": [
                {"id": case.id, "disease": case.disease.name}
                for case in overdue_cases
            ],
        }

    except Exception as e:
        logger.error(f"Failed to check overdue notifications: {e}")
        raise


@shared_task(name="hmis.apps.surveillance.tasks.check_outbreak_thresholds")
def check_outbreak_thresholds() -> dict:
    """
    Check all active outbreak thresholds for exceedance.

    Creates outbreak alerts if any thresholds are exceeded.

    Returns:
        dict with outbreak status
    """
    from .models import OutbreakThreshold
    from .services import SurveillanceService

    try:
        thresholds = OutbreakThreshold.objects.filter(is_active=True)
        exceeded = []

        for threshold in thresholds:
            is_exceeded, count = threshold.check_threshold()
            if is_exceeded:
                exceeded.append({
                    "disease": threshold.disease.name,
                    "county": threshold.county.name if threshold.county else "National",
                    "count": count,
                    "threshold": threshold.case_threshold,
                })
                # Create outbreak alert
                SurveillanceService.check_outbreak_thresholds(
                    threshold.disease, threshold.county
                )

        if exceeded:
            logger.warning(f"Outbreak thresholds exceeded: {len(exceeded)}")

        return {
            "thresholds_checked": thresholds.count(),
            "exceeded": exceeded,
        }

    except Exception as e:
        logger.error(f"Failed to check outbreak thresholds: {e}")
        raise


@shared_task(name="hmis.apps.surveillance.tasks.submit_idsr_to_dhis2")
def submit_idsr_to_dhis2(report_id: int) -> dict:
    """
    Submit an approved IDSR report to DHIS2.

    Args:
        report_id: ID of the IDSRWeeklyReport to submit

    Returns:
        dict with submission result
    """
    from .models import IDSRWeeklyReport
    from .services import IDSRReportingService

    try:
        report = IDSRWeeklyReport.objects.get(id=report_id)

        if report.status != "APPROVED":
            return {
                "success": False,
                "error": f"Report must be approved before submission (current: {report.status})",
            }

        result = IDSRReportingService.submit_to_dhis2(report)

        return {
            "success": report.status == "SUBMITTED",
            "report_id": report_id,
            "dhis2_response": result,
        }

    except IDSRWeeklyReport.DoesNotExist:
        logger.error(f"IDSR report {report_id} not found")
        return {"success": False, "error": f"Report {report_id} not found"}
    except Exception as e:
        logger.error(f"Failed to submit IDSR report to DHIS2: {e}")
        raise
