"""
Dashboard Statistics API views.

Provides real-time statistics for the HMIS dashboard with caching
to maintain fast response times while reflecting actual database state.
"""

from datetime import timedelta
from decimal import Decimal

from django.core.cache import cache
from django.db.models import Sum
from django.utils import timezone
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

# Cache configuration
DASHBOARD_STATS_CACHE_KEY = "dashboard_stats"
DASHBOARD_STATS_TTL = 300  # 5 minutes


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def dashboard_stats(request):
    """
    Get dashboard statistics.

    Returns aggregated statistics across all modules:
    - Patients: total, today, this_week, this_month
    - Encounters: total, today, in_progress, completed_today
    - Pharmacy: prescriptions_today, pending_dispensing, low_stock, expiring
    - Laboratory: pending_tests, completed_today, critical_results
    - Triage: waiting, avg_wait_time, emergency_count
    - Billing: revenue_today, pending_payments, sha_claims_pending
    - Alerts: critical, high, medium, total_unresolved

    Query Parameters:
        refresh (bool): Bypass cache and compute fresh stats
    """
    # Check for cache bypass
    bypass_cache = request.query_params.get("refresh", "").lower() == "true"

    if not bypass_cache:
        cached_stats = cache.get(DASHBOARD_STATS_CACHE_KEY)
        if cached_stats:
            return Response(cached_stats)

    # Compute fresh statistics
    stats = _compute_dashboard_stats()

    # Cache the result
    cache.set(DASHBOARD_STATS_CACHE_KEY, stats, DASHBOARD_STATS_TTL)

    return Response(stats)


def _compute_dashboard_stats() -> dict:
    """Compute all dashboard statistics from the database."""
    now = timezone.now()
    # Use localdate() to get the date in the configured TIME_ZONE (Africa/Nairobi)
    # This ensures dashboard stats match what users expect locally
    today = timezone.localdate()
    week_ago = today - timedelta(days=7)
    month_start = today.replace(day=1)

    return {
        "timestamp": now.isoformat(),
        "cache_ttl": DASHBOARD_STATS_TTL,
        "patients": _get_patient_stats(today, week_ago, month_start),
        "encounters": _get_encounter_stats(today),
        "pharmacy": _get_pharmacy_stats(today),
        "laboratory": _get_laboratory_stats(today),
        "triage": _get_triage_stats(today),
        "billing": _get_billing_stats(today),
        "alerts": _get_alert_stats(),
    }


def _get_patient_stats(today, week_ago, month_start) -> dict:
    """Get patient statistics."""
    from hmis.apps.patients.models import Patient

    return {
        "total": Patient.objects.count(),
        "today": Patient.objects.filter(created_at__date=today).count(),
        "this_week": Patient.objects.filter(created_at__date__gte=week_ago).count(),
        "this_month": Patient.objects.filter(created_at__date__gte=month_start).count(),
    }


def _get_encounter_stats(today) -> dict:
    """Get encounter statistics."""
    from hmis.apps.encounters.models import Encounter

    today_encounters = Encounter.objects.filter(encounter_date=today)

    return {
        "total": Encounter.objects.count(),
        "today": today_encounters.count(),
        "in_progress": today_encounters.filter(status="IN_PROGRESS").count(),
        "completed_today": today_encounters.filter(status="COMPLETED").count(),
    }


def _get_pharmacy_stats(today) -> dict:
    """Get pharmacy statistics."""
    try:
        from hmis.apps.pharmacy.models import InventoryItem, Prescription, StockAlert

        prescriptions_today = Prescription.objects.filter(
            created_at__date=today, status="DISPENSED"
        ).count()

        pending_dispensing = Prescription.objects.filter(
            status__in=["PENDING", "PARTIALLY_DISPENSED"]
        ).count()

        low_stock_items = StockAlert.objects.filter(resolved=False, alert_type="LOW_STOCK").count()

        # Items expiring in next 90 days
        expiry_threshold = today + timedelta(days=90)
        expiring_soon = InventoryItem.objects.filter(
            expiry_date__lte=expiry_threshold, expiry_date__gt=today, quantity__gt=0
        ).count()

        return {
            "prescriptions_today": prescriptions_today,
            "pending_dispensing": pending_dispensing,
            "low_stock_items": low_stock_items,
            "expiring_soon": expiring_soon,
        }
    except Exception:
        # Return zeros if pharmacy module not available
        return {
            "prescriptions_today": 0,
            "pending_dispensing": 0,
            "low_stock_items": 0,
            "expiring_soon": 0,
        }


def _get_laboratory_stats(today) -> dict:
    """Get laboratory statistics."""
    try:
        from hmis.apps.laboratory.models import LabOrder, LabResult

        pending_tests = LabOrder.objects.filter(
            status__in=["PENDING", "SAMPLE_COLLECTED", "IN_PROGRESS"]
        ).count()

        completed_today = LabOrder.objects.filter(
            status="COMPLETED", updated_at__date=today
        ).count()

        # Critical results are flagged results from today
        critical_results = LabResult.objects.filter(
            is_abnormal=True, created_at__date=today
        ).count()

        return {
            "pending_tests": pending_tests,
            "completed_today": completed_today,
            "critical_results": critical_results,
        }
    except Exception:
        return {
            "pending_tests": 0,
            "completed_today": 0,
            "critical_results": 0,
        }


def _get_triage_stats(today) -> dict:
    """Get triage statistics."""
    try:
        from hmis.apps.triage.models import TriageAssessment

        waiting = TriageAssessment.objects.filter(status="WAITING").count()

        emergency_count = TriageAssessment.objects.filter(
            status="WAITING", category="EMERGENCY"
        ).count()

        # Calculate average wait time for completed assessments today
        completed_today = TriageAssessment.objects.filter(
            status="COMPLETED", updated_at__date=today, started_at__isnull=False
        )

        avg_wait_minutes = 0
        if completed_today.exists():
            # Calculate wait time as time from creation to start
            wait_times = []
            for assessment in completed_today[:100]:  # Limit for performance
                if assessment.started_at and assessment.created_at:
                    wait_delta = assessment.started_at - assessment.created_at
                    wait_times.append(wait_delta.total_seconds() / 60)

            if wait_times:
                avg_wait_minutes = round(sum(wait_times) / len(wait_times), 1)

        return {
            "waiting": waiting,
            "avg_wait_time_minutes": avg_wait_minutes,
            "emergency_count": emergency_count,
        }
    except Exception:
        return {
            "waiting": 0,
            "avg_wait_time_minutes": 0,
            "emergency_count": 0,
        }


def _get_billing_stats(today) -> dict:
    """Get billing statistics."""
    try:
        from hmis.apps.billing.models import Invoice, Payment, SHAClaim

        # Revenue today (from completed payments)
        revenue_today = Payment.objects.filter(
            payment_date__date=today, status="COMPLETED"
        ).aggregate(total=Sum("amount"))["total"] or Decimal("0")

        # Pending payments (unpaid invoices)
        pending_payments = Invoice.objects.filter(
            status__in=["PENDING", "PARTIALLY_PAID"]
        ).aggregate(total=Sum("balance_due"))["total"] or Decimal("0")

        # SHA claims pending
        sha_claims_pending = SHAClaim.objects.filter(
            status__in=["PENDING", "SUBMITTED", "UNDER_REVIEW"]
        ).count()

        return {
            "revenue_today": float(revenue_today),
            "pending_payments": float(pending_payments),
            "sha_claims_pending": sha_claims_pending,
        }
    except Exception:
        return {
            "revenue_today": 0,
            "pending_payments": 0,
            "sha_claims_pending": 0,
        }


def _get_alert_stats() -> dict:
    """Get alert statistics across all modules."""
    try:
        from hmis.apps.pharmacy.models import StockAlert

        alerts = StockAlert.objects.filter(resolved=False)

        return {
            "critical": alerts.filter(severity="CRITICAL").count(),
            "high": alerts.filter(severity="HIGH").count(),
            "medium": alerts.filter(severity="MEDIUM").count(),
            "total_unresolved": alerts.count(),
        }
    except Exception:
        return {
            "critical": 0,
            "high": 0,
            "medium": 0,
            "total_unresolved": 0,
        }


# =============================================================================
# Patient Volume History API
# =============================================================================

# Cache configuration for patient volume
PATIENT_VOLUME_CACHE_PREFIX = "patient_volume"
PATIENT_VOLUME_CACHE_TTL = 300  # 5 minutes
MAX_DATE_RANGE_DAYS = 90  # Data retention limit

# All encounter types from the system
ENCOUNTER_TYPES = [
    "OPD",
    "IPD",
    "EMERGENCY",
    "ANC",
    "PAEDIATRIC",
    "DIALYSIS",
    "ONCOLOGY",
    "SCHEDULED_OPD",
    "FOLLOW_UP",
    "CONSULTANT_REVIEW",
    "CHRONIC_STABLE",
    "SPECIALIST_CLINIC",
    "PROCEDURE",
    "DAY_CASE",
    "WARD_ROUND",
    "DISCHARGE_REVIEW",
]


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

    from django.db.models import Count
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
    from django.db.models import Count, Sum

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


# =============================================================================
# Activity Feed API
# =============================================================================

ACTIVITY_FEED_CACHE_KEY = "activity_feed"
ACTIVITY_FEED_TTL = 60  # 1 minute (shorter TTL for real-time feel)


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def activity_feed(request):
    """
    Get recent activity feed for dashboard.

    Returns a paginated list of recent activities across all modules.

    Query Parameters:
        limit (int): Number of items to return (default: 20, max: 100)
        offset (int): Pagination offset (default: 0)
        types (str): Comma-separated list of activity types to filter
        actions (str): Comma-separated list of actions to filter
        refresh (bool): Bypass cache and fetch fresh data
    """
    # Parse parameters
    try:
        limit = min(int(request.query_params.get("limit", 20)), 100)
        if limit < 1:
            limit = 20
    except (ValueError, TypeError):
        limit = 20

    try:
        offset = max(int(request.query_params.get("offset", 0)), 0)
    except (ValueError, TypeError):
        offset = 0

    types_param = request.query_params.get("types", "")
    types_filter = [t.strip() for t in types_param.split(",") if t.strip()] if types_param else None

    actions_param = request.query_params.get("actions", "")
    actions_filter = (
        [a.strip() for a in actions_param.split(",") if a.strip()] if actions_param else None
    )

    bypass_cache = request.query_params.get("refresh", "").lower() == "true"

    # Build cache key
    cache_key = f"{ACTIVITY_FEED_CACHE_KEY}:{limit}:{offset}:{types_param}:{actions_param}"

    if not bypass_cache:
        cached_result = cache.get(cache_key)
        if cached_result:
            return Response(cached_result)

    # Fetch activity data
    result = _get_activity_feed(limit, offset, types_filter, actions_filter, request)

    # Cache the result
    cache.set(cache_key, result, ACTIVITY_FEED_TTL)

    return Response(result)


def _get_activity_feed(
    limit: int, offset: int, types_filter: list, actions_filter: list, _request
) -> dict:
    """
    Fetch activity feed data from the database.

    Args:
        limit: Maximum number of items to return
        offset: Pagination offset
        types_filter: List of activity types to filter by
        actions_filter: List of actions to filter by
        request: The HTTP request object (for building URLs)

    Returns:
        dict: Activity feed data with count, next link, and results
    """
    from hmis.apps.core.models import ActivityFeed

    # Build queryset
    queryset = ActivityFeed.objects.select_related("user").order_by("-timestamp")

    if types_filter:
        queryset = queryset.filter(activity_type__in=types_filter)

    if actions_filter:
        queryset = queryset.filter(action__in=actions_filter)

    # Get total count
    total_count = queryset.count()

    # Paginate
    activities = queryset[offset : offset + limit]

    # Build next link
    next_offset = offset + limit
    if next_offset < total_count:
        next_link = f"/api/core/dashboard/activity-feed/?limit={limit}&offset={next_offset}"
        if types_filter:
            next_link += f"&types={','.join(types_filter)}"
        if actions_filter:
            next_link += f"&actions={','.join(actions_filter)}"
    else:
        next_link = None

    # Format results
    results = []
    for activity in activities:
        results.append(_format_activity(activity))

    return {
        "count": total_count,
        "next": next_link,
        "results": results,
    }


def _format_activity(activity) -> dict:
    """
    Format an ActivityFeed entry for API response.

    Args:
        activity: ActivityFeed model instance

    Returns:
        dict: Formatted activity data
    """
    # Format user info
    user_info = None
    if activity.user:
        full_name = activity.user.get_full_name()
        name = full_name if full_name.strip() else activity.user.username
        user_info = {
            "id": activity.user.id,
            "name": name,
        }

    # Generate resource href
    href = _get_resource_href(activity.resource_type, activity.resource_id)

    return {
        "id": f"act_{activity.id}",
        "type": activity.activity_type,
        "action": activity.action,
        "title": activity.title,
        "description": activity.description,
        "timestamp": activity.timestamp.isoformat(),
        "user": user_info,
        "resource": {
            "type": activity.resource_type,
            "id": activity.resource_id,
            "href": href,
        },
    }


def _get_resource_href(resource_type: str, resource_id: int) -> str:
    """
    Generate the frontend URL for a resource.

    Args:
        resource_type: Type of resource (Patient, Encounter, etc.)
        resource_id: ID of the resource

    Returns:
        str: Frontend URL path for the resource
    """
    resource_type_lower = resource_type.lower()

    href_mappings = {
        "patient": f"/patients/{resource_id}",
        "encounter": f"/encounters/{resource_id}",
        "laborder": f"/laboratory/orders/{resource_id}",
        "labresult": f"/laboratory/results/{resource_id}",
        "prescription": f"/pharmacy/prescriptions/{resource_id}",
        "invoice": f"/billing/invoices/{resource_id}",
        "payment": f"/billing/payments/{resource_id}",
        "triageassessment": f"/triage/{resource_id}",
        "admission": f"/inpatient/admissions/{resource_id}",
        "appointment": f"/appointments/{resource_id}",
        "inventoryitem": f"/pharmacy/inventory/{resource_id}",
        "stockalert": f"/pharmacy/alerts/{resource_id}",
    }

    return href_mappings.get(resource_type_lower, f"/{resource_type_lower}s/{resource_id}")
