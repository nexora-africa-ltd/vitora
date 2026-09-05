# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
# ruff: noqa: E402, F401
"""Core dashboard views stats for Vitora HMIS.

What this file is for:
- Implement dashboard views stats logic for the core domain.

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
    DASHBOARD_STATS_CACHE_KEY,
    DASHBOARD_STATS_TTL,
    _dashboard_section_exceptions,
    _resolve_tenant_for_request,
)


@extend_schema(
    parameters=[
        OpenApiParameter(
            "refresh", OpenApiTypes.BOOL, description="Bypass cache and compute fresh stats"
        ),
    ],
    responses={200: OpenApiTypes.OBJECT},
)
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
    - Check-in: checked_in_today, waiting, completed_today
    - Inpatient: current_admissions, available_beds, discharged_today, occupancy_rate
    - Imaging: pending_orders, completed_today, urgent_orders
    - Emergency: active_overrides, pending_review
    - MCH: active_registrations, high_risk, deliveries_today
    - Theatre: scheduled_today, in_progress, completed_today
    - Allied Health: pending_referrals, sessions_today, open_cases
    - Org Admin: total_facilities, active_facilities, total_staff (org admins only)

    Stats are scoped to the active facility (from X-Facility-Id header).
    When no facility is set, falls back to organization-wide stats.

    Query Parameters:
        refresh (bool): Bypass cache and compute fresh stats
    """
    # Lazy-resolve tenant context (middleware can't resolve for JWT-authed
    # requests because DRF authentication runs after middleware).
    _resolve_tenant_for_request(request)

    facility = getattr(request, "facility", None)
    organization = getattr(request, "organization", None)

    # SECURITY: Refuse to return stats when no tenant scope is resolved.
    # Without this, queries would be unfiltered — leaking ALL tenant data.
    if not facility and not organization:
        return Response(
            {"error": "No facility or organization context. Please select a facility."},
            status=403,
        )

    # Scope cache key to facility (or org, or global) to prevent cross-tenant leaks
    scope_suffix = ""
    if facility:
        scope_suffix = f":f{facility.pk}"
    elif organization:
        scope_suffix = f":o{organization.pk}"
    cache_key = f"{DASHBOARD_STATS_CACHE_KEY}{scope_suffix}"

    # Check for cache bypass
    bypass_cache = request.query_params.get("refresh", "").lower() == "true"

    if not bypass_cache:
        cached_stats = cache.get(cache_key)
        if cached_stats:
            return Response(cached_stats)

    # Compute fresh statistics
    stats = _compute_dashboard_stats(facility=facility, organization=organization)

    # Cache the result
    cache.set(cache_key, stats, DASHBOARD_STATS_TTL)

    return Response(stats)


def _build_scope_filter(
    facility,
    organization,
    facility_field="facility",
    organization_field="organization",
):
    """Build a queryset filter dict for tenant scoping.

    Raises ValueError if no scope is available to prevent unfiltered queries.
    """
    if facility:
        return {facility_field: facility}
    if organization:
        return {organization_field: organization}
    raise ValueError(
        "No tenant scope available — refusing to build an unfiltered query. "
        "This is a security guard to prevent cross-tenant data leaks."
    )


def _stats_fallback(
    section: str, fallback: dict, exc: Exception, *, missing_dependency: bool
) -> dict:
    """Return a safe fallback response and emit structured diagnostics.

    This is an explicit resilience boundary for dashboard aggregation. Dashboard
    responses should remain available even when optional modules are unavailable
    or a section query fails.
    """
    if missing_dependency:
        logger.info(
            "Dashboard stats section unavailable due to missing dependency",
            extra={"section": section, "error": str(exc)},
        )
    else:
        logger.exception(
            "Dashboard stats section failed; returning fallback",
            extra={"section": section},
        )
    return fallback.copy()


def _compute_dashboard_stats(*, facility=None, organization=None) -> dict:
    """Compute all dashboard statistics from the database."""
    now = timezone.now()
    today = timezone.localdate()
    week_ago = today - timedelta(days=7)
    month_start = today.replace(day=1)

    result = {
        "timestamp": now.isoformat(),
        "cache_ttl": DASHBOARD_STATS_TTL,
        "patients": _get_patient_stats(today, week_ago, month_start, facility, organization),
        "encounters": _get_encounter_stats(today, facility, organization),
        "pharmacy": _get_pharmacy_stats(today, facility, organization),
        "laboratory": _get_laboratory_stats(today, facility, organization),
        "triage": _get_triage_stats(today, facility, organization),
        "billing": _get_billing_stats(today, facility, organization),
        "alerts": _get_alert_stats(facility, organization),
        "checkin": _get_checkin_stats(today, facility, organization),
        "inpatient": _get_inpatient_stats(today, facility, organization),
        "imaging": _get_imaging_stats(today, facility, organization),
        "emergency": _get_emergency_stats(facility, organization),
        "mch": _get_mch_stats(today, facility, organization),
        "theatre": _get_theatre_stats(today, facility, organization),
        "allied_health": _get_allied_health_stats(today, facility, organization),
        "procedures": _get_procedure_stats(today, facility, organization),
    }

    # Add org-admin stats when scoped to an organization
    if organization:
        result["org_admin"] = _get_org_admin_stats(organization)

    return result


def _get_patient_stats(today, week_ago, month_start, facility=None, organization=None) -> dict:
    """Get patient statistics."""
    from hmis.apps.patients.models import Patient

    scope = _build_scope_filter(facility, organization, facility_field="registered_at_facility")
    qs = Patient.objects.filter(**scope)

    return {
        "total": qs.count(),
        "today": qs.filter(created_at__date=today).count(),
        "this_week": qs.filter(created_at__date__gte=week_ago).count(),
        "this_month": qs.filter(created_at__date__gte=month_start).count(),
    }


def _get_encounter_stats(today, facility=None, organization=None) -> dict:
    """Get encounter statistics."""
    from hmis.apps.encounters.models import Encounter

    scope = _build_scope_filter(facility, organization)
    qs = Encounter.objects.filter(**scope)
    today_encounters = qs.filter(encounter_date=today)

    return {
        "total": qs.count(),
        "today": today_encounters.count(),
        "in_progress": today_encounters.filter(status="IN_PROGRESS").count(),
        "completed_today": today_encounters.filter(status="COMPLETED").count(),
    }


def _get_pharmacy_stats(today, facility=None, organization=None) -> dict:
    """Get pharmacy statistics."""
    try:
        from hmis.apps.pharmacy.models import InventoryItem, Prescription, StockAlert

        scope = _build_scope_filter(facility, organization)

        prescriptions_today = Prescription.objects.filter(
            created_at__date=today, status="DISPENSED", **scope
        ).count()

        pending_dispensing = Prescription.objects.filter(
            status__in=["PENDING", "PARTIALLY_DISPENSED"], **scope
        ).count()

        low_stock_items = StockAlert.objects.filter(
            is_resolved=False, alert_type="LOW_STOCK", **scope
        ).count()

        # Items expiring in next 90 days
        expiry_threshold = today + timedelta(days=90)
        expiring_soon = InventoryItem.objects.filter(
            expiry_date__lte=expiry_threshold, expiry_date__gt=today, quantity__gt=0, **scope
        ).count()

        return {
            "prescriptions_today": prescriptions_today,
            "pending_dispensing": pending_dispensing,
            "low_stock_items": low_stock_items,
            "expiring_soon": expiring_soon,
        }
    except ImportError as exc:
        return _stats_fallback(
            section="pharmacy",
            fallback={
                "prescriptions_today": 0,
                "pending_dispensing": 0,
                "low_stock_items": 0,
                "expiring_soon": 0,
            },
            exc=exc,
            missing_dependency=True,
        )
    except _dashboard_section_exceptions() as exc:
        return _stats_fallback(
            section="pharmacy",
            fallback={
                "prescriptions_today": 0,
                "pending_dispensing": 0,
                "low_stock_items": 0,
                "expiring_soon": 0,
            },
            exc=exc,
            missing_dependency=False,
        )


def _get_laboratory_stats(today, facility=None, organization=None) -> dict:
    """Get laboratory statistics."""
    try:
        from hmis.apps.laboratory.models import LabOrder, LabResult

        scope = _build_scope_filter(facility, organization)
        if facility:
            result_scope = {"order_item__lab_order__facility": facility}
        elif organization:
            result_scope = {"order_item__lab_order__organization": organization}
        else:
            raise ValueError(
                "No tenant scope available — refusing to build an unfiltered query. "
                "This is a security guard to prevent cross-tenant data leaks."
            )

        pending_tests = LabOrder.objects.filter(
            status__in=["PENDING", "SAMPLE_COLLECTED", "IN_PROGRESS"], **scope
        ).count()

        completed_today = LabOrder.objects.filter(
            status="COMPLETED", updated_at__date=today, **scope
        ).count()

        # Critical results are flagged results from today
        critical_results = LabResult.objects.filter(
            is_critical_result=True,
            entered_at__date=today,
            **result_scope,
        ).count()

        return {
            "pending_tests": pending_tests,
            "completed_today": completed_today,
            "critical_results": critical_results,
        }
    except ImportError as exc:
        return _stats_fallback(
            section="laboratory",
            fallback={"pending_tests": 0, "completed_today": 0, "critical_results": 0},
            exc=exc,
            missing_dependency=True,
        )
    except _dashboard_section_exceptions() as exc:
        return _stats_fallback(
            section="laboratory",
            fallback={"pending_tests": 0, "completed_today": 0, "critical_results": 0},
            exc=exc,
            missing_dependency=False,
        )


def _get_triage_stats(today, facility=None, organization=None) -> dict:
    """Get triage statistics."""
    try:
        from hmis.apps.triage.models import TriageAssessment

        scope = _build_scope_filter(facility, organization)
        qs = TriageAssessment.objects.filter(**scope)

        waiting = qs.filter(seen_by_clinician_time__isnull=True).count()

        emergency_count = qs.filter(
            seen_by_clinician_time__isnull=True,
            triage_category="RED",
        ).count()

        # Calculate average wait time for completed assessments today
        completed_today = qs.filter(
            seen_by_clinician_time__date=today,
            triage_start_time__isnull=False,
        )

        avg_wait_minutes = 0
        if completed_today.exists():
            # Calculate wait time as time from creation to start
            wait_times = []
            for assessment in completed_today[:100]:  # Limit for performance
                if assessment.triage_start_time and assessment.seen_by_clinician_time:
                    wait_delta = assessment.seen_by_clinician_time - assessment.triage_start_time
                    wait_times.append(wait_delta.total_seconds() / 60)

            if wait_times:
                avg_wait_minutes = round(sum(wait_times) / len(wait_times), 1)

        return {
            "waiting": waiting,
            "avg_wait_time_minutes": avg_wait_minutes,
            "emergency_count": emergency_count,
        }
    except ImportError as exc:
        return _stats_fallback(
            section="triage",
            fallback={"waiting": 0, "avg_wait_time_minutes": 0, "emergency_count": 0},
            exc=exc,
            missing_dependency=True,
        )
    except _dashboard_section_exceptions() as exc:
        return _stats_fallback(
            section="triage",
            fallback={"waiting": 0, "avg_wait_time_minutes": 0, "emergency_count": 0},
            exc=exc,
            missing_dependency=False,
        )


def _get_billing_stats(today, facility=None, organization=None) -> dict:
    """Get billing statistics."""
    try:
        from hmis.apps.billing.models import Invoice, Payment, SHAClaim

        payment_scope = _build_scope_filter(
            facility,
            organization,
            facility_field="invoice__facility",
            organization_field="invoice__organization",
        )
        invoice_scope = _build_scope_filter(facility, organization)
        sha_scope = _build_scope_filter(facility, organization)

        # Revenue today (from completed payments)
        revenue_today = Payment.objects.filter(
            payment_date__date=today,
            status=Payment.Status.COMPLETED,
            **payment_scope,
        ).aggregate(total=Sum("amount"))["total"] or Decimal("0")

        # Pending payments (unpaid invoices)
        pending_payments = Invoice.objects.filter(
            status__in=[Invoice.Status.PENDING, Invoice.Status.PARTIAL],
            **invoice_scope,
        ).aggregate(total=Sum("balance_due"))["total"] or Decimal("0")

        # SHA claims pending
        sha_claims_pending = SHAClaim.objects.filter(
            status__in=[
                SHAClaim.ClaimStatus.PENDING_SUBMISSION,
                SHAClaim.ClaimStatus.SUBMITTED,
                SHAClaim.ClaimStatus.UNDER_REVIEW,
            ],
            **sha_scope,
        ).count()

        return {
            "revenue_today": float(revenue_today),
            "pending_payments": float(pending_payments),
            "sha_claims_pending": sha_claims_pending,
        }
    except ImportError as exc:
        return _stats_fallback(
            section="billing",
            fallback={"revenue_today": 0, "pending_payments": 0, "sha_claims_pending": 0},
            exc=exc,
            missing_dependency=True,
        )
    except _dashboard_section_exceptions() as exc:
        return _stats_fallback(
            section="billing",
            fallback={"revenue_today": 0, "pending_payments": 0, "sha_claims_pending": 0},
            exc=exc,
            missing_dependency=False,
        )


def _get_alert_stats(facility=None, organization=None) -> dict:
    """Get alert statistics across all modules."""
    try:
        from hmis.apps.pharmacy.models import StockAlert

        scope = _build_scope_filter(facility, organization)
        alerts = StockAlert.objects.filter(is_resolved=False, **scope)

        return {
            "critical": alerts.filter(severity="CRITICAL").count(),
            "high": alerts.filter(severity="HIGH").count(),
            "medium": alerts.filter(severity="MEDIUM").count(),
            "total_unresolved": alerts.count(),
        }
    except ImportError as exc:
        return _stats_fallback(
            section="alerts",
            fallback={"critical": 0, "high": 0, "medium": 0, "total_unresolved": 0},
            exc=exc,
            missing_dependency=True,
        )
    except _dashboard_section_exceptions() as exc:
        return _stats_fallback(
            section="alerts",
            fallback={"critical": 0, "high": 0, "medium": 0, "total_unresolved": 0},
            exc=exc,
            missing_dependency=False,
        )


def _get_checkin_stats(today, facility=None, organization=None) -> dict:
    """Get check-in statistics."""
    try:
        from hmis.apps.checkin.models import CheckIn

        # CheckIn has no facility FK; scope through encounter__facility
        scope = _build_scope_filter(facility, organization, facility_field="encounter__facility")
        today_checkins = CheckIn.objects.filter(checked_in_at__date=today, **scope)

        return {
            "checked_in_today": today_checkins.count(),
            "waiting": today_checkins.filter(status__in=["WAITING", "IN_TRIAGE"]).count(),
            "completed_today": today_checkins.filter(status="COMPLETED").count(),
        }
    except ImportError as exc:
        return _stats_fallback(
            section="checkin",
            fallback={"checked_in_today": 0, "waiting": 0, "completed_today": 0},
            exc=exc,
            missing_dependency=True,
        )
    except _dashboard_section_exceptions() as exc:
        return _stats_fallback(
            section="checkin",
            fallback={"checked_in_today": 0, "waiting": 0, "completed_today": 0},
            exc=exc,
            missing_dependency=False,
        )


def _get_inpatient_stats(today, facility=None, organization=None) -> dict:
    """Get inpatient / bed occupancy statistics."""
    try:
        from hmis.apps.inpatient.models import Admission, Bed

        scope = _build_scope_filter(facility, organization)
        bed_scope = _build_scope_filter(facility, organization, facility_field="ward__facility")

        current_admissions = Admission.objects.filter(admission_status="ACTIVE", **scope).count()

        total_beds = Bed.objects.filter(**bed_scope).count()
        available_beds = Bed.objects.filter(status="AVAILABLE", **bed_scope).count()
        occupied_beds = Bed.objects.filter(status="OCCUPIED", **bed_scope).count()
        occupancy_rate = round((occupied_beds / total_beds * 100) if total_beds > 0 else 0, 1)

        discharged_today = Admission.objects.filter(
            admission_status="DISCHARGED", discharge_date__date=today, **scope
        ).count()

        return {
            "current_admissions": current_admissions,
            "available_beds": available_beds,
            "discharged_today": discharged_today,
            "occupancy_rate": occupancy_rate,
        }
    except ImportError as exc:
        return _stats_fallback(
            section="inpatient",
            fallback={
                "current_admissions": 0,
                "available_beds": 0,
                "discharged_today": 0,
                "occupancy_rate": 0,
            },
            exc=exc,
            missing_dependency=True,
        )
    except _dashboard_section_exceptions() as exc:
        return _stats_fallback(
            section="inpatient",
            fallback={
                "current_admissions": 0,
                "available_beds": 0,
                "discharged_today": 0,
                "occupancy_rate": 0,
            },
            exc=exc,
            missing_dependency=False,
        )


def _get_imaging_stats(today, facility=None, organization=None) -> dict:
    """Get imaging / radiology statistics."""
    try:
        from hmis.apps.imaging.models import ImagingOrder

        scope = _build_scope_filter(
            facility,
            organization,
            facility_field="encounter__facility",
            organization_field="encounter__organization",
        )

        pending_orders = ImagingOrder.objects.filter(
            status__in=["ORDERED", "SCHEDULED", "IN_PROGRESS"], **scope
        ).count()

        completed_today = ImagingOrder.objects.filter(
            status__in=["COMPLETED", "REPORTED"], completed_at__date=today, **scope
        ).count()

        urgent_orders = ImagingOrder.objects.filter(
            status__in=["ORDERED", "SCHEDULED", "IN_PROGRESS"],
            priority__in=["URGENT", "STAT"],
            **scope,
        ).count()

        return {
            "pending_orders": pending_orders,
            "completed_today": completed_today,
            "urgent_orders": urgent_orders,
        }
    except ImportError as exc:
        return _stats_fallback(
            section="imaging",
            fallback={"pending_orders": 0, "completed_today": 0, "urgent_orders": 0},
            exc=exc,
            missing_dependency=True,
        )
    except _dashboard_section_exceptions() as exc:
        return _stats_fallback(
            section="imaging",
            fallback={"pending_orders": 0, "completed_today": 0, "urgent_orders": 0},
            exc=exc,
            missing_dependency=False,
        )


def _get_emergency_stats(facility=None, organization=None) -> dict:
    """Get emergency access override statistics."""
    try:
        from hmis.apps.core.emergency_access.models import EmergencyAccess

        # EmergencyAccess has no facility FK; scope through patient
        scope = _build_scope_filter(
            facility, organization, facility_field="patient__registered_at_facility"
        )

        active_overrides = EmergencyAccess.objects.filter(status="ACTIVE", **scope).count()

        pending_review = (
            EmergencyAccess.objects.exclude(status__in=["REVIEWED", "REVOKED"])
            .filter(status__in=["ACTIVE", "EXPIRED"], **scope)
            .count()
        )

        return {
            "active_overrides": active_overrides,
            "pending_review": pending_review,
        }
    except ImportError as exc:
        return _stats_fallback(
            section="emergency",
            fallback={"active_overrides": 0, "pending_review": 0},
            exc=exc,
            missing_dependency=True,
        )
    except _dashboard_section_exceptions() as exc:
        return _stats_fallback(
            section="emergency",
            fallback={"active_overrides": 0, "pending_review": 0},
            exc=exc,
            missing_dependency=False,
        )


def _get_mch_stats(today, facility=None, organization=None) -> dict:
    """Get maternal and child health statistics."""
    try:
        from hmis.apps.mch.models import MCHRegistration

        scope = _build_scope_filter(facility, organization)
        qs = MCHRegistration.objects.filter(**scope)

        active_registrations = qs.filter(status="ACTIVE").count()

        high_risk = qs.filter(status="ACTIVE", is_high_risk=True).count()

        deliveries_today = qs.filter(status="DELIVERED", updated_at__date=today).count()

        return {
            "active_registrations": active_registrations,
            "high_risk": high_risk,
            "deliveries_today": deliveries_today,
        }
    except ImportError as exc:
        return _stats_fallback(
            section="mch",
            fallback={"active_registrations": 0, "high_risk": 0, "deliveries_today": 0},
            exc=exc,
            missing_dependency=True,
        )
    except _dashboard_section_exceptions() as exc:
        return _stats_fallback(
            section="mch",
            fallback={"active_registrations": 0, "high_risk": 0, "deliveries_today": 0},
            exc=exc,
            missing_dependency=False,
        )


def _get_theatre_stats(today, facility=None, organization=None) -> dict:
    """Get theatre / operating room statistics."""
    try:
        from hmis.apps.theatre.models import SurgeryCase

        scope = _build_scope_filter(facility, organization)
        today_cases = SurgeryCase.objects.filter(
            scheduled_date=today,
            **scope,
        )

        return {
            "scheduled_today": today_cases.filter(
                status__in=[
                    SurgeryCase.CaseStatus.SCHEDULED,
                    SurgeryCase.CaseStatus.PRE_OP,
                    SurgeryCase.CaseStatus.IN_THEATRE,
                    SurgeryCase.CaseStatus.IN_SURGERY,
                    SurgeryCase.CaseStatus.IN_PACU,
                    SurgeryCase.CaseStatus.DISCHARGED,
                ]
            ).count(),
            "in_progress": today_cases.filter(
                status__in=[
                    SurgeryCase.CaseStatus.IN_THEATRE,
                    SurgeryCase.CaseStatus.IN_SURGERY,
                ]
            ).count(),
            "completed_today": today_cases.filter(status=SurgeryCase.CaseStatus.DISCHARGED).count(),
        }
    except ImportError as exc:
        return _stats_fallback(
            section="theatre",
            fallback={"scheduled_today": 0, "in_progress": 0, "completed_today": 0},
            exc=exc,
            missing_dependency=True,
        )
    except _dashboard_section_exceptions() as exc:
        return _stats_fallback(
            section="theatre",
            fallback={"scheduled_today": 0, "in_progress": 0, "completed_today": 0},
            exc=exc,
            missing_dependency=False,
        )


def _get_procedure_stats(today, facility=None, organization=None) -> dict:
    """Get minor/outpatient procedure statistics."""
    try:
        from hmis.apps.procedures.models import ProcedureOrder

        scope = _build_scope_filter(facility, organization)
        orders = ProcedureOrder.objects.filter(**scope)

        return {
            "scheduled_today": orders.filter(
                scheduled_date=today,
                status__in=["SCHEDULED", "READY"],
            ).count(),
            "pending_consent": orders.filter(status="CONSENT_PENDING").count(),
            "in_progress": orders.filter(status="IN_PROGRESS").count(),
            "completed_today": orders.filter(
                status="COMPLETED",
                updated_at__date=today,
            ).count(),
        }
    except ImportError as exc:
        return _stats_fallback(
            section="procedures",
            fallback={
                "scheduled_today": 0,
                "pending_consent": 0,
                "in_progress": 0,
                "completed_today": 0,
            },
            exc=exc,
            missing_dependency=True,
        )
    except _dashboard_section_exceptions() as exc:
        return _stats_fallback(
            section="procedures",
            fallback={
                "scheduled_today": 0,
                "pending_consent": 0,
                "in_progress": 0,
                "completed_today": 0,
            },
            exc=exc,
            missing_dependency=False,
        )


def _get_allied_health_stats(today, facility=None, organization=None) -> dict:
    """Get allied health statistics (physio, nutrition, OT, social work)."""
    try:
        pending_referrals = 0
        sessions_today = 0
        open_cases = 0
        scope = _build_scope_filter(facility, organization)

        try:
            from hmis.apps.physiotherapy.models import PhysiotherapyOrder

            pending_referrals += PhysiotherapyOrder.objects.filter(
                status="PENDING", **scope
            ).count()
            sessions_today += PhysiotherapyOrder.objects.filter(
                status="IN_PROGRESS", status_changed_at__date=today, **scope
            ).count()
        except ImportError as exc:
            logger.info(
                "Optional allied health stats dependency unavailable",
                extra={
                    "section": "allied_health",
                    "source_module": "physiotherapy",
                    "error": str(exc),
                },
            )
        except _dashboard_section_exceptions() as exc:
            logger.exception(
                "Optional allied health stats aggregation failed",
                extra={
                    "section": "allied_health",
                    "source_module": "physiotherapy",
                    "error_class": exc.__class__.__name__,
                },
            )

        try:
            from hmis.apps.nutrition.models import NutritionConsultation

            pending_referrals += NutritionConsultation.objects.filter(
                status="PENDING", **scope
            ).count()
            sessions_today += NutritionConsultation.objects.filter(
                consultation_date__date=today, **scope
            ).count()
        except ImportError as exc:
            logger.info(
                "Optional allied health stats dependency unavailable",
                extra={
                    "section": "allied_health",
                    "source_module": "nutrition",
                    "error": str(exc),
                },
            )
        except _dashboard_section_exceptions() as exc:
            logger.exception(
                "Optional allied health stats aggregation failed",
                extra={
                    "section": "allied_health",
                    "source_module": "nutrition",
                    "error_class": exc.__class__.__name__,
                },
            )

        try:
            from hmis.apps.occupational_therapy.models import OTOrder

            pending_referrals += OTOrder.objects.filter(status="PENDING", **scope).count()
        except ImportError as exc:
            logger.info(
                "Optional allied health stats dependency unavailable",
                extra={
                    "section": "allied_health",
                    "source_module": "occupational_therapy",
                    "error": str(exc),
                },
            )
        except _dashboard_section_exceptions() as exc:
            logger.exception(
                "Optional allied health stats aggregation failed",
                extra={
                    "section": "allied_health",
                    "source_module": "occupational_therapy",
                    "error_class": exc.__class__.__name__,
                },
            )

        try:
            from hmis.apps.social_work.models import SocialWorkCase

            # SocialWorkCase has no direct tenant fields; its referral owns the facility/org scope.
            social_work_scope = _build_scope_filter(
                facility,
                organization,
                facility_field="referral__facility",
                organization_field="referral__organization",
            )
            open_cases = SocialWorkCase.objects.filter(status="OPEN", **social_work_scope).count()
        except ImportError as exc:
            logger.info(
                "Optional allied health stats dependency unavailable",
                extra={
                    "section": "allied_health",
                    "source_module": "social_work",
                    "error": str(exc),
                },
            )
        except _dashboard_section_exceptions() as exc:
            logger.exception(
                "Optional allied health stats aggregation failed",
                extra={
                    "section": "allied_health",
                    "source_module": "social_work",
                    "error_class": exc.__class__.__name__,
                },
            )

        return {
            "pending_referrals": pending_referrals,
            "sessions_today": sessions_today,
            "open_cases": open_cases,
        }
    except ImportError as exc:
        return _stats_fallback(
            section="allied_health",
            fallback={"pending_referrals": 0, "sessions_today": 0, "open_cases": 0},
            exc=exc,
            missing_dependency=True,
        )
    except _dashboard_section_exceptions() as exc:
        return _stats_fallback(
            section="allied_health",
            fallback={"pending_referrals": 0, "sessions_today": 0, "open_cases": 0},
            exc=exc,
            missing_dependency=False,
        )


def _get_org_admin_stats(organization) -> dict:
    """Get organization-level statistics for org admins."""
    try:
        from hmis.apps.core.models import Facility, StaffProfile

        facilities = Facility.objects.filter(organization=organization)
        total_facilities = facilities.count()
        active_facilities = facilities.filter(is_active=True).count()
        total_staff = StaffProfile.objects.filter(
            organization=organization, employment_status="ACTIVE"
        ).count()

        return {
            "total_facilities": total_facilities,
            "active_facilities": active_facilities,
            "total_staff": total_staff,
        }
    except ImportError as exc:
        return _stats_fallback(
            section="org_admin",
            fallback={"total_facilities": 0, "active_facilities": 0, "total_staff": 0},
            exc=exc,
            missing_dependency=True,
        )
    except _dashboard_section_exceptions() as exc:
        return _stats_fallback(
            section="org_admin",
            fallback={"total_facilities": 0, "active_facilities": 0, "total_staff": 0},
            exc=exc,
            missing_dependency=False,
        )


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
