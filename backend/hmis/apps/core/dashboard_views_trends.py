# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
# ruff: noqa: E402, F401, F811, F821
"""Core dashboard views trends for Vitora HMIS.

What this file is for:
- Implement dashboard views trends logic for the core domain.

How to use it:
- Import classes and functions from this module in Django app code and tests.

Supported inputs/args:
- Python imports and Django ORM/runtime inputs; no standalone CLI arguments.
"""

"""
Dashboard Statistics API views.

Provides real-time statistics for the HMIS dashboard with caching
to maintain fast response times while reflecting actual database state.

Stats are scoped to the active facility (via ``request.facility``,
resolved by ``TenantMiddleware`` from the ``X-Facility-Id`` header).
When no facility context is available, stats are org-wide or global.
"""

import logging
from datetime import timedelta
from decimal import Decimal

from django.core.cache import cache
from django.core.exceptions import FieldError
from django.db import DatabaseError
from django.db.models import Count, Sum
from django.utils import timezone
from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from hmis.apps.core.mixins import resolve_request_tenant

logger = logging.getLogger(__name__)


from hmis.apps.core.dashboard_views_shared import (
    _dashboard_section_exceptions,
    _resolve_tenant_for_request,
)
from hmis.apps.core.dashboard_views_stats import (
    ENCOUNTER_TYPES,
    MAX_DATE_RANGE_DAYS,
    PATIENT_VOLUME_CACHE_PREFIX,
    PATIENT_VOLUME_CACHE_TTL,
)


@extend_schema(
    parameters=[
        OpenApiParameter(
            "start_date", OpenApiTypes.DATE, description="Start date (YYYY-MM-DD)", required=True
        ),
        OpenApiParameter(
            "end_date", OpenApiTypes.DATE, description="End date (YYYY-MM-DD)", required=True
        ),
        OpenApiParameter(
            "granularity", OpenApiTypes.STR, description="'day', 'week', or 'month'", required=False
        ),
        OpenApiParameter("refresh", OpenApiTypes.BOOL, description="Bypass cache", required=False),
    ],
    responses={200: OpenApiTypes.OBJECT},
)
@api_view(["GET"])
@permission_classes([IsAuthenticated])
def patient_volume_history(request):
    """
    Get patient volume history for dashboard charts.

    Returns historical patient registration and encounter data aggregated
    by date with configurable granularity.

    Query Parameters:
        start_date (required): Start date in YYYY-MM-DD format
        end_date (required): End date in YYYY-MM-DD format
        granularity (optional): 'day' (default), 'week', or 'month'
        refresh (optional): Set to 'true' to bypass cache

    Data Retention: Maximum 90 days range.

    Response:
        {
            "date_range": {"start": "2026-01-01", "end": "2026-01-07"},
            "granularity": "day",
            "data": [
                {
                    "date": "2026-01-01",
                    "registrations": 12,
                    "encounters": 45,
                    "by_type": {"OPD": 32, "IPD": 8, "EMERGENCY": 5, ...}
                },
                ...
            ]
        }
    """
    from datetime import datetime

    # Extract and validate parameters
    start_date_str = request.query_params.get("start_date")
    end_date_str = request.query_params.get("end_date")
    granularity = request.query_params.get("granularity", "day")
    bypass_cache = request.query_params.get("refresh", "").lower() == "true"

    # Validate required parameters
    if not start_date_str:
        return Response(
            {"error": "start_date parameter is required"},
            status=400,
        )
    if not end_date_str:
        return Response(
            {"error": "end_date parameter is required"},
            status=400,
        )

    # Validate date format
    try:
        start_date = datetime.strptime(start_date_str, "%Y-%m-%d").date()
        end_date = datetime.strptime(end_date_str, "%Y-%m-%d").date()
    except ValueError:
        return Response(
            {"error": "Invalid date format. Use YYYY-MM-DD"},
            status=400,
        )

    # Validate date range
    if start_date > end_date:
        return Response(
            {"error": "start_date must be before or equal to end_date"},
            status=400,
        )

    # Validate date range doesn't exceed retention limit
    date_range_days = (end_date - start_date).days
    if date_range_days > MAX_DATE_RANGE_DAYS:
        return Response(
            {"error": f"Date range cannot exceed {MAX_DATE_RANGE_DAYS} days"},
            status=400,
        )

    # Validate granularity
    valid_granularities = ["day", "week", "month"]
    if granularity not in valid_granularities:
        return Response(
            {"error": f"Invalid granularity. Must be one of: {', '.join(valid_granularities)}"},
            status=400,
        )

    # Check cache
    cache_key = f"{PATIENT_VOLUME_CACHE_PREFIX}:{start_date_str}:{end_date_str}:{granularity}"
    if not bypass_cache:
        cached_data = cache.get(cache_key)
        if cached_data:
            return Response(cached_data)

    # Compute volume data
    data = _compute_patient_volume(start_date, end_date, granularity)

    response_data = {
        "date_range": {"start": start_date_str, "end": end_date_str},
        "granularity": granularity,
        "data": data,
    }

    # Cache the result
    cache.set(cache_key, response_data, PATIENT_VOLUME_CACHE_TTL)

    return Response(response_data)


def _compute_patient_volume(start_date, end_date, granularity: str) -> list:
    """
    Compute patient volume data for the given date range.

    Args:
        start_date: Start date
        end_date: End date
        granularity: 'day', 'week', or 'month'

    Returns:
        List of dicts with date, registrations, encounters, and by_type breakdown
    """
    from collections import defaultdict

    from django.db.models.functions import TruncDate, TruncMonth, TruncWeek

    from hmis.apps.encounters.models import Encounter
    from hmis.apps.patients.models import Patient

    # For patient registrations (DateTimeField created_at), use truncation functions
    trunc_func_datetime = {
        "day": TruncDate,
        "week": TruncWeek,
        "month": TruncMonth,
    }[granularity]

    # Get patient registrations by date (created_at is DateTimeField)
    registrations_qs = (
        Patient.objects.filter(created_at__date__gte=start_date, created_at__date__lte=end_date)
        .annotate(period=trunc_func_datetime("created_at"))
        .values("period")
        .annotate(count=Count("id"))
    )
    registrations_by_period = {str(r["period"]): r["count"] for r in registrations_qs}

    # For encounters (encounter_date is DateField, not DateTimeField)
    # We need different grouping strategy
    if granularity == "day":
        # Direct grouping by encounter_date field
        encounters_qs = (
            Encounter.objects.filter(encounter_date__gte=start_date, encounter_date__lte=end_date)
            .values("encounter_date")
            .annotate(count=Count("id"))
        )
        encounters_by_period = {str(e["encounter_date"]): e["count"] for e in encounters_qs}

        # Encounters by type and date
        encounters_by_type_qs = (
            Encounter.objects.filter(encounter_date__gte=start_date, encounter_date__lte=end_date)
            .values("encounter_date", "encounter_type")
            .annotate(count=Count("id"))
        )
        type_breakdown: dict = defaultdict(lambda: defaultdict(int))
        for item in encounters_by_type_qs:
            period_str = str(item["encounter_date"])
            type_breakdown[period_str][item["encounter_type"]] = item["count"]
    else:
        # For week/month granularity, we need to aggregate in Python
        # since encounter_date is DateField and TruncWeek/TruncMonth expect DateTimeField
        encounters_raw = Encounter.objects.filter(
            encounter_date__gte=start_date, encounter_date__lte=end_date
        ).values("encounter_date", "encounter_type")

        encounters_by_period: dict = defaultdict(int)
        type_breakdown: dict = defaultdict(lambda: defaultdict(int))

        for enc in encounters_raw:
            period = _get_period_for_date(enc["encounter_date"], granularity)
            period_str = str(period)
            encounters_by_period[period_str] += 1
            type_breakdown[period_str][enc["encounter_type"]] += 1

    # Generate all periods in range (fill gaps with zeros)
    periods = _generate_periods(start_date, end_date, granularity)

    # Build result
    result = []
    for period_date in periods:
        period_str = str(period_date)

        # Build by_type with all encounter types (zeros for missing)
        by_type = {et: type_breakdown[period_str].get(et, 0) for et in ENCOUNTER_TYPES}

        result.append(
            {
                "date": period_str,
                "registrations": registrations_by_period.get(period_str, 0),
                "encounters": encounters_by_period.get(period_str, 0),
                "by_type": by_type,
            }
        )

    return result


def _get_period_for_date(d, granularity: str):
    """Get the period start date for a given date based on granularity."""
    from datetime import timedelta

    if granularity == "day":
        return d
    elif granularity == "week":
        # Return Monday of the week
        days_since_monday = d.weekday()
        return d - timedelta(days=days_since_monday)
    elif granularity == "month":
        # Return first of month
        return d.replace(day=1)
    return d


def _generate_periods(start_date, end_date, granularity: str) -> list:
    """Generate all period dates between start and end based on granularity."""
    from datetime import timedelta

    periods = []
    current = start_date

    if granularity == "day":
        while current <= end_date:
            periods.append(current)
            current += timedelta(days=1)
    elif granularity == "week":
        # Align to week start (Monday)

        # Move to Monday of the start week
        days_since_monday = current.weekday()
        week_start = current - timedelta(days=days_since_monday)
        current = week_start

        while current <= end_date:
            periods.append(current)
            current += timedelta(weeks=1)
    elif granularity == "month":
        # Start from first of month
        current = current.replace(day=1)
        while current <= end_date:
            periods.append(current)
            # Move to next month
            if current.month == 12:
                current = current.replace(year=current.year + 1, month=1)
            else:
                current = current.replace(month=current.month + 1)

    return periods


# =============================================================================
# Revenue Breakdown API
# =============================================================================

# Cache configuration for revenue breakdown
REVENUE_BREAKDOWN_CACHE_PREFIX = "revenue_breakdown"
REVENUE_BREAKDOWN_CACHE_TTL = 300  # 5 minutes

# Valid group_by options
VALID_GROUP_BY_OPTIONS = ["category", "item_type", "payment_method"]


@extend_schema(
    parameters=[
        OpenApiParameter(
            "start_date", OpenApiTypes.DATE, description="Start date (YYYY-MM-DD)", required=True
        ),
        OpenApiParameter(
            "end_date", OpenApiTypes.DATE, description="End date (YYYY-MM-DD)", required=True
        ),
        OpenApiParameter(
            "group_by",
            OpenApiTypes.STR,
            description="'category', 'item_type', or 'payment_method'",
            required=False,
        ),
        OpenApiParameter("refresh", OpenApiTypes.BOOL, description="Bypass cache", required=False),
    ],
    responses={200: OpenApiTypes.OBJECT},
)
@api_view(["GET"])
@permission_classes([IsAuthenticated])
def revenue_breakdown(request):
    """
    Get revenue breakdown by category, item type, or payment method.

    Returns aggregated revenue data from completed payments for dashboard charts.

    Query Parameters:
        start_date (required): Start date in YYYY-MM-DD format
        end_date (required): End date in YYYY-MM-DD format
        group_by (optional): 'category' (default), 'item_type', or 'payment_method'
        refresh (optional): Set to 'true' to bypass cache

    Data Retention: Maximum 90 days range.

    Response:
        {
            "date_range": {"start": "2026-01-01", "end": "2026-01-07"},
            "total_revenue": 145200.00,
            "currency": "KES",
            "breakdown": [
                {
                    "name": "Consultation",
                    "amount": 45000.00,
                    "percentage": 31.0,
                    "transaction_count": 120
                },
                ...
            ]
        }
    """
    from datetime import datetime

    # Get query parameters
    start_date_str = request.query_params.get("start_date")
    end_date_str = request.query_params.get("end_date")
    group_by = request.query_params.get("group_by", "category")
    bypass_cache = request.query_params.get("refresh", "").lower() == "true"

    # Validate required parameters
    if not start_date_str:
        return Response(
            {"error": "start_date is required (YYYY-MM-DD format)"},
            status=400,
        )

    if not end_date_str:
        return Response(
            {"error": "end_date is required (YYYY-MM-DD format)"},
            status=400,
        )

    # Parse dates
    try:
        start_date = datetime.strptime(start_date_str, "%Y-%m-%d").date()
        end_date = datetime.strptime(end_date_str, "%Y-%m-%d").date()
    except ValueError:
        return Response(
            {"error": "Invalid date format. Use YYYY-MM-DD"},
            status=400,
        )

    # Validate date range
    if start_date > end_date:
        return Response(
            {"error": "start_date must be before or equal to end_date"},
            status=400,
        )

    # Enforce 90-day limit
    date_diff = (end_date - start_date).days
    if date_diff > MAX_DATE_RANGE_DAYS:
        return Response(
            {"error": f"Date range cannot exceed {MAX_DATE_RANGE_DAYS} days"},
            status=400,
        )

    # Validate group_by
    if group_by not in VALID_GROUP_BY_OPTIONS:
        return Response(
            {
                "error": f"Invalid group_by value. Must be one of: {', '.join(VALID_GROUP_BY_OPTIONS)}"
            },
            status=400,
        )

    # Check cache
    cache_key = f"{REVENUE_BREAKDOWN_CACHE_PREFIX}:{start_date_str}:{end_date_str}:{group_by}"
    if not bypass_cache:
        cached_data = cache.get(cache_key)
        if cached_data:
            return Response(cached_data)

    # Compute revenue breakdown
    result = _compute_revenue_breakdown(start_date, end_date, group_by)

    # Cache the result
    cache.set(cache_key, result, REVENUE_BREAKDOWN_CACHE_TTL)

    return Response(result)


def _compute_revenue_breakdown(start_date, end_date, group_by: str) -> dict:
    """Compute revenue breakdown from the database."""
    from django.db.models import Sum

    try:
        from hmis.apps.billing.models import InvoiceItem, Payment
    except ImportError:
        # Billing module not available
        return {
            "date_range": {"start": start_date.isoformat(), "end": end_date.isoformat()},
            "total_revenue": 0,
            "currency": "KES",
            "breakdown": [],
        }

    # Filter completed payments in date range
    payments = Payment.objects.filter(
        status="completed",
        payment_date__date__gte=start_date,
        payment_date__date__lte=end_date,
    )

    # Determine grouping field based on group_by parameter
    if group_by == "category":
        # Group by service category via invoice items
        # We need to aggregate through invoice -> items -> service -> category
        breakdown_data = (
            InvoiceItem.objects.filter(
                invoice__payments__in=payments,
                invoice__payments__status="completed",
            )
            .values("service__category__name")
            .annotate(
                amount=Sum("line_total"),
                transaction_count=Count("id", distinct=True),
            )
            .order_by("-amount")
        )

        breakdown = []
        for item in breakdown_data:
            name = item["service__category__name"] or "Uncategorized"
            breakdown.append(
                {
                    "name": name,
                    "amount": float(item["amount"] or 0),
                    "transaction_count": item["transaction_count"],
                }
            )

    elif group_by == "item_type":
        # Group by invoice item type (service, pharmacy, lab, etc.)
        breakdown_data = (
            InvoiceItem.objects.filter(
                invoice__payments__in=payments,
                invoice__payments__status="completed",
            )
            .values("item_type")
            .annotate(
                amount=Sum("line_total"),
                transaction_count=Count("id", distinct=True),
            )
            .order_by("-amount")
        )

        breakdown = []
        for item in breakdown_data:
            name = item["item_type"] or "Unknown"
            breakdown.append(
                {
                    "name": name,
                    "amount": float(item["amount"] or 0),
                    "transaction_count": item["transaction_count"],
                }
            )

    elif group_by == "payment_method":
        # Group by payment method
        breakdown_data = (
            payments.values("method")
            .annotate(
                amount=Sum("amount"),
                transaction_count=Count("id"),
            )
            .order_by("-amount")
        )

        breakdown = []
        for item in breakdown_data:
            name = item["method"] or "Unknown"
            breakdown.append(
                {
                    "name": name,
                    "amount": float(item["amount"] or 0),
                    "transaction_count": item["transaction_count"],
                }
            )
    else:
        breakdown = []

    # Calculate total revenue
    total_revenue = sum(item["amount"] for item in breakdown) if breakdown else 0

    # Calculate percentages
    for item in breakdown:
        if total_revenue > 0:
            item["percentage"] = round(item["amount"] / total_revenue * 100, 1)
        else:
            item["percentage"] = 0

    return {
        "date_range": {"start": start_date.isoformat(), "end": end_date.isoformat()},
        "total_revenue": total_revenue,
        "currency": "KES",
        "breakdown": breakdown,
    }
