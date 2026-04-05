"""Immunization coverage calculation services."""

from datetime import date

from django.db.models import Count, Q

from hmis.apps.immunizations.models import ImmunizationRecord


def calculate_coverage(
    vaccine_code: str,
    start_date: date | None = None,
    end_date: date | None = None,
) -> dict:
    """
    Calculate immunization coverage for a specific vaccine.

    Returns the total scheduled/administered count and coverage percentage.

    Args:
        vaccine_code: VaccineDefinition.code to calculate coverage for.
        start_date: Optional start date filter (on scheduled_date).
        end_date: Optional end date filter (on scheduled_date).

    Returns:
        Dict with keys: vaccine_code, total, administered, missed,
        scheduled, coverage_pct
    """
    qs = ImmunizationRecord.objects.filter(vaccine__code=vaccine_code)

    if start_date:
        qs = qs.filter(scheduled_date__gte=start_date)
    if end_date:
        qs = qs.filter(scheduled_date__lte=end_date)

    stats = qs.aggregate(
        total=Count("id"),
        administered=Count("id", filter=Q(status="ADMINISTERED")),
        missed=Count("id", filter=Q(status="MISSED")),
        scheduled=Count("id", filter=Q(status="SCHEDULED")),
    )

    total = stats["total"] or 0
    administered = stats["administered"] or 0
    coverage_pct = round((administered / total) * 100, 1) if total > 0 else 0.0

    return {
        "vaccine_code": vaccine_code,
        "total": total,
        "administered": administered,
        "missed": stats["missed"] or 0,
        "scheduled": stats["scheduled"] or 0,
        "coverage_pct": coverage_pct,
    }
