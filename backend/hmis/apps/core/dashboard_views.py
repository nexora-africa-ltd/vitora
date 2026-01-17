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
    today = now.date()
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
