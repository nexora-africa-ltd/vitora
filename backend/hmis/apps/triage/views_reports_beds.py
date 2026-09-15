# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
# ruff: noqa: ARG002, F401, SIM105
"""Triage views reports beds for Vitora HMIS.

What this file is for:
- Implement views reports beds logic for the triage domain.

How to use it:
- Import classes and functions from this module in Django app code and tests.

Supported inputs/args:
- Python imports and Django ORM/runtime inputs; no standalone CLI arguments.
"""

import logging

from django.db.models import Count, Q
from django.utils import timezone
from django_filters.rest_framework import DjangoFilterBackend
from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import OpenApiParameter, extend_schema, inline_serializer
from rest_framework import filters, serializers, status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import AllowAny, BasePermission, IsAdminUser, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from hmis.apps.core.mixins import (
    NestedTenantScopeMixin,
    ReadOnCreateMixin,
    TenantScopedViewMixin,
    resolve_request_tenant,
)
from hmis.apps.core.models import AuditLog
from hmis.apps.core.permissions import (
    ReadRequiresModelPermission,
    RequiresActiveShiftPermission,
    WriteRequiresRolePermission,
    get_client_ip,
)

from .models import (
    ERBed,
    Escalation,
    TriageAssessment,
    TriageQueue,
    TriageSettings,
    TriageVitalThreshold,
    WaitingQueue,
    WaitTimeBreach,
)
from .serializers import (
    ERBedAssignPatientSerializer,
    ERBedBoardSummarySerializer,
    ERBedCreateSerializer,
    ERBedListSerializer,
    ERBedReleaseSerializer,
    ERBedSerializer,
    ERBedUpdateStatusSerializer,
    EscalationCreateSerializer,
    EscalationResolveSerializer,
    EscalationSerializer,
    TriageAssessmentCreateSerializer,
    TriageAssessmentSerializer,
    TriageCategoryCalculationSerializer,
    TriageQueueSerializer,
    TriageSettingsSerializer,
    TriageVitalThresholdSerializer,
    WaitingQueueCreateSerializer,
    WaitingQueueSerializer,
    WaitTimeBreachAcknowledgeSerializer,
    WaitTimeBreachSerializer,
)

logger = logging.getLogger(__name__)


def _broadcast_bed_update(bed: ERBed, action_name: str) -> None:
    """Broadcast bed status change to emergency WebSocket clients (fire-and-forget)."""
    try:
        import asyncio

        from channels.layers import get_channel_layer

        channel_layer = get_channel_layer()
        if channel_layer is None:
            return

        bed_data = ERBedSerializer(bed).data

        message = {
            "type": "emergency.bed.update",
            "event_type": "bed_update",
            "data": {
                "action": action_name,
                "bed": bed_data,
            },
        }

        loop = None
        try:
            loop = asyncio.get_running_loop()
        except RuntimeError:
            pass

        if loop and loop.is_running():
            asyncio.ensure_future(channel_layer.group_send("emergency_queue", message))
        else:
            new_loop = asyncio.new_event_loop()
            try:
                new_loop.run_until_complete(channel_layer.group_send("emergency_queue", message))
            finally:
                new_loop.close()
    except (
        AttributeError,
        TypeError,
        ValueError,
        RuntimeError,
        OSError,
        AssertionError,
        ImportError,
    ):
        logger.exception("Failed to broadcast bed update")


class TriageReportSummaryView(APIView):
    """
    Combined triage report summary endpoint.

    GET /api/triage/reports/
    Returns aggregated wait-time stats, volume breakdown, and LWBS stats.
    Supports date_range, area, and category filters.
    """

    permission_classes = [IsAuthenticated, ReadRequiresModelPermission, WriteRequiresRolePermission]

    KETA_TARGETS = {
        "RED": 0,
        "ORANGE": 10,
        "YELLOW": 60,
        "GREEN": 240,
        "BLUE": 240,
    }

    @extend_schema(
        parameters=[
            OpenApiParameter(name="date_range", type=str, location=OpenApiParameter.QUERY),
            OpenApiParameter(name="start_date", type=str, location=OpenApiParameter.QUERY),
            OpenApiParameter(name="end_date", type=str, location=OpenApiParameter.QUERY),
            OpenApiParameter(name="area", type=str, location=OpenApiParameter.QUERY),
            OpenApiParameter(name="category", type=str, location=OpenApiParameter.QUERY),
        ],
        responses={200: OpenApiTypes.OBJECT},
    )
    def get(self, request):
        """Get combined triage report summary."""
        import statistics
        from datetime import datetime

        # Ensure facility context is resolved (needed for APIView + DRF test client)
        resolve_request_tenant(request)

        date_range = request.query_params.get("date_range", "today")
        custom_start = request.query_params.get("start_date")
        custom_end = request.query_params.get("end_date")
        area_filter = request.query_params.get("area")
        category_filter = request.query_params.get("category")

        # Determine date boundaries
        now = timezone.now()
        today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)

        if date_range == "custom" and custom_start:
            start_date = timezone.make_aware(datetime.strptime(custom_start, "%Y-%m-%d"))
            end_date = (
                timezone.make_aware(datetime.strptime(custom_end, "%Y-%m-%d"))
                if custom_end
                else now
            )
        elif date_range == "today":
            start_date = today_start
            end_date = now
        elif date_range == "yesterday":
            start_date = today_start - timezone.timedelta(days=1)
            end_date = today_start
        elif date_range in ("week", "last_7_days"):
            start_date = now - timezone.timedelta(days=7)
            end_date = now
        elif date_range in ("month", "last_30_days"):
            start_date = now - timezone.timedelta(days=30)
            end_date = now
        elif date_range == "this_month":
            start_date = today_start.replace(day=1)
            end_date = now
        elif date_range == "last_month":
            first_of_this_month = today_start.replace(day=1)
            end_date = first_of_this_month
            start_date = (first_of_this_month - timezone.timedelta(days=1)).replace(day=1)
        elif date_range == "this_quarter":
            quarter_month = ((now.month - 1) // 3) * 3 + 1
            start_date = today_start.replace(month=quarter_month, day=1)
            end_date = now
        else:
            start_date = today_start
            end_date = now

        # Base queryset — scoped to user's facility
        facility = getattr(request, "facility", None)
        assessments = TriageAssessment.objects.filter(
            arrival_time__gte=start_date,
            arrival_time__lte=end_date,
        )
        if facility:
            assessments = assessments.filter(facility=facility)
        if area_filter:
            assessments = assessments.filter(assigned_area=area_filter)
        if category_filter:
            assessments = assessments.filter(triage_category=category_filter)

        # --- Wait time stats ---
        wait_times = []
        met_target_count = 0
        total_with_category = 0

        for a in assessments:
            if a.triage_start_time:
                wt = int((a.triage_start_time - a.arrival_time).total_seconds() / 60)
                wait_times.append(wt)
                if a.triage_category:
                    total_with_category += 1
                    if wt <= self.KETA_TARGETS.get(a.triage_category, 240):
                        met_target_count += 1

        avg_wait = round(sum(wait_times) / len(wait_times), 1) if wait_times else 0
        median_wait = round(statistics.median(wait_times), 1) if wait_times else 0
        target_met = (
            round(met_target_count / total_with_category * 100, 1)
            if total_with_category > 0
            else 100
        )

        # --- Wait times by category ---
        wait_times_by_category = []
        for cat in ["RED", "ORANGE", "YELLOW", "GREEN", "BLUE"]:
            cat_assessments = [a for a in assessments if a.triage_category == cat]
            cat_waits = [
                a.get_wait_time_minutes()
                for a in cat_assessments
                if a.get_wait_time_minutes() is not None
            ]
            target = self.KETA_TARGETS.get(cat, 240)
            exceeded = [w for w in cat_waits if w > target]

            wait_times_by_category.append(
                {
                    "category": cat,
                    "target_minutes": target,
                    "avg_wait_minutes": (
                        round(sum(cat_waits) / len(cat_waits), 1) if cat_waits else 0
                    ),
                    "median_wait_minutes": (
                        round(statistics.median(cat_waits), 1) if cat_waits else 0
                    ),
                    "exceeded_count": len(exceeded),
                    "exceeded_percentage": (
                        round(len(exceeded) / len(cat_waits) * 100, 1) if cat_waits else 0
                    ),
                    "total_count": len(cat_assessments),
                }
            )

        # --- Volume by category ---
        total = assessments.count()
        volume_qs = (
            assessments.values("triage_category").annotate(count=Count("id")).order_by("-count")
        )
        volume_by_category = [
            {
                "category": item["triage_category"],
                "count": item["count"],
                "percentage": round(item["count"] / total * 100, 1) if total else 0,
            }
            for item in volume_qs
        ]

        # --- Volume by area ---
        area_labels = dict(TriageAssessment.ASSIGNED_AREA_CHOICES)
        area_qs = assessments.values("assigned_area").annotate(count=Count("id")).order_by("-count")
        volume_by_area = [
            {
                "area": item["assigned_area"] or "UNASSIGNED",
                "area_label": area_labels.get(
                    item["assigned_area"], item["assigned_area"] or "Not assigned"
                ),
                "count": item["count"],
            }
            for item in area_qs
        ]

        # --- Staff performance ---
        from collections import defaultdict

        staff_data: dict[int, dict] = {}
        for a in assessments:
            if a.triaged_by_id and a.triage_start_time:
                uid = a.triaged_by_id
                wt = int((a.triage_start_time - a.arrival_time).total_seconds() / 60)
                if uid not in staff_data:
                    staff_data[uid] = {
                        "user_id": uid,
                        "name": "",
                        "assessment_count": 0,
                        "wait_times": [],
                        "met_target": 0,
                        "with_category": 0,
                    }
                staff_data[uid]["assessment_count"] += 1
                staff_data[uid]["wait_times"].append(wt)
                if a.triage_category:
                    staff_data[uid]["with_category"] += 1
                    if wt <= self.KETA_TARGETS.get(a.triage_category, 240):
                        staff_data[uid]["met_target"] += 1

        # Bulk-fetch usernames
        if staff_data:
            from django.contrib.auth import get_user_model

            User = get_user_model()
            users = User.objects.filter(id__in=staff_data.keys()).values(
                "id", "first_name", "last_name", "username"
            )
            user_map = {
                u["id"]: f"{u['first_name']} {u['last_name']}".strip() or u["username"]
                for u in users
            }
            for uid, sd in staff_data.items():
                sd["name"] = user_map.get(uid, f"User #{uid}")

        staff_performance = []
        for sd in sorted(staff_data.values(), key=lambda x: x["assessment_count"], reverse=True):
            wts = sd["wait_times"]
            staff_performance.append(
                {
                    "user_id": sd["user_id"],
                    "name": sd["name"],
                    "assessment_count": sd["assessment_count"],
                    "avg_wait_minutes": round(sum(wts) / len(wts), 1) if wts else 0,
                    "median_wait_minutes": round(statistics.median(wts), 1) if wts else 0,
                    "keta_compliance_pct": (
                        round(sd["met_target"] / sd["with_category"] * 100, 1)
                        if sd["with_category"] > 0
                        else 100
                    ),
                }
            )

        # --- Wait time trend (time-series) ---
        # Hourly for today/yesterday, daily for longer ranges
        use_hourly = date_range in ("today", "yesterday")
        trend_buckets: dict[str, dict[str, list[int]]] = defaultdict(lambda: defaultdict(list))

        for a in assessments:
            if a.triage_start_time and a.triage_category:
                wt = int((a.triage_start_time - a.arrival_time).total_seconds() / 60)
                if use_hourly:
                    bucket = a.arrival_time.strftime("%Y-%m-%dT%H:00:00")
                else:
                    bucket = a.arrival_time.strftime("%Y-%m-%d")
                trend_buckets[bucket][a.triage_category].append(wt)

        wait_time_trend = []
        for bucket in sorted(trend_buckets.keys()):
            for cat, wts in sorted(trend_buckets[bucket].items()):
                wait_time_trend.append(
                    {
                        "timestamp": bucket,
                        "category": cat,
                        "avg_wait_minutes": round(sum(wts) / len(wts), 1),
                        "count": len(wts),
                    }
                )

        # --- LWBS (Left Without Being Seen) stats ---
        # LWBS status lives on TriageQueue, not TriageAssessment.
        # Cross-reference via triage_assessment to get the category.
        lwbs_qs = TriageQueue.objects.filter(
            status="LEFT_WITHOUT_BEING_SEEN",
            created_at__gte=start_date,
            created_at__lte=end_date,
        )
        if facility:
            lwbs_qs = lwbs_qs.filter(
                triage_assessment__facility=facility,
            )
        lwbs_total = lwbs_qs.count()
        lwbs_rate = round(lwbs_total / total * 100, 1) if total else 0

        lwbs_wait_times = []
        for entry in lwbs_qs:
            if entry.updated_at and entry.created_at:
                wt = int((entry.updated_at - entry.created_at).total_seconds() / 60)
                lwbs_wait_times.append(wt)

        # LWBS by triage category: look up via triage_assessment FK
        lwbs_assessment_ids = lwbs_qs.values_list("triage_assessment_id", flat=True)
        lwbs_assessments_qs = TriageAssessment.objects.filter(id__in=lwbs_assessment_ids)
        lwbs_by_category = []
        for cat in ["RED", "ORANGE", "YELLOW", "GREEN", "BLUE"]:
            cat_lwbs = lwbs_assessments_qs.filter(triage_category=cat).count()
            cat_total = assessments.filter(triage_category=cat).count()
            lwbs_by_category.append(
                {
                    "category": cat,
                    "count": cat_lwbs,
                    "rate": round(cat_lwbs / cat_total * 100, 1) if cat_total else 0,
                }
            )

        return Response(
            {
                "date_range": {
                    "start": start_date.isoformat(),
                    "end": end_date.isoformat(),
                },
                "total_assessments": total,
                "avg_wait_time_minutes": avg_wait,
                "median_wait_time_minutes": median_wait,
                "target_met_percentage": target_met,
                "wait_times_by_category": wait_times_by_category,
                "volume_by_category": volume_by_category,
                "volume_by_area": volume_by_area,
                "staff_performance": staff_performance,
                "wait_time_trend": wait_time_trend,
                "lwbs_stats": {
                    "total_lwbs": lwbs_total,
                    "lwbs_rate": lwbs_rate,
                    "avg_wait_before_lwbs_minutes": (
                        round(sum(lwbs_wait_times) / len(lwbs_wait_times), 1)
                        if lwbs_wait_times
                        else 0
                    ),
                    "by_category": lwbs_by_category,
                },
            }
        )


class WaitTimesReportView(APIView):
    """
    Report endpoint for wait time statistics.
    Returns real-time wait time metrics for the triage dashboard.
    """

    permission_classes = [IsAuthenticated, ReadRequiresModelPermission, WriteRequiresRolePermission]

    # KETA target wait times by triage category (in minutes)
    KETA_TARGETS = {
        "RED": 0,  # Immediate
        "ORANGE": 10,  # Very urgent - 10 min
        "YELLOW": 60,  # Urgent - 1 hour
        "GREEN": 240,  # Non-urgent - 4 hours
        "BLUE": 240,  # Dead on arrival / administrative
    }

    @extend_schema(
        responses={200: OpenApiTypes.OBJECT},
    )
    def get(self, request):
        """Get wait time statistics."""
        import statistics

        from django.utils import timezone

        # Get date range from query params (default: today)
        date_range = request.query_params.get("date_range", "today")

        if date_range == "today":
            start_date = timezone.now().replace(hour=0, minute=0, second=0, microsecond=0)
        elif date_range == "week":
            start_date = timezone.now() - timezone.timedelta(days=7)
        elif date_range == "month":
            start_date = timezone.now() - timezone.timedelta(days=30)
        else:
            start_date = timezone.now().replace(hour=0, minute=0, second=0, microsecond=0)

        assessments = TriageAssessment.objects.filter(arrival_time__gte=start_date)

        # Calculate wait times and completion times
        wait_times = []  # arrival → triage_start (time waiting)
        completion_times = []  # arrival → triage_end (total time)
        triage_durations = []  # triage_start → triage_end (assessment duration)
        met_target_count = 0
        total_with_category = 0

        for assessment in assessments:
            # Wait time: arrival to triage start
            if assessment.triage_start_time:
                wait_delta = assessment.triage_start_time - assessment.arrival_time
                wait_minutes = int(wait_delta.total_seconds() / 60)
                wait_times.append(wait_minutes)

                # Check if wait time met KETA target for this category
                if assessment.triage_category:
                    total_with_category += 1
                    target = self.KETA_TARGETS.get(assessment.triage_category, 240)
                    if wait_minutes <= target:
                        met_target_count += 1

            # Completion time: arrival to triage end (for completed assessments)
            if assessment.triage_end_time:
                completion_delta = assessment.triage_end_time - assessment.arrival_time
                completion_times.append(int(completion_delta.total_seconds() / 60))

                # Triage duration: start to end
                if assessment.triage_start_time:
                    duration_delta = assessment.triage_end_time - assessment.triage_start_time
                    triage_durations.append(int(duration_delta.total_seconds() / 60))

        if wait_times:
            avg_wait_time = sum(wait_times) / len(wait_times)
            median_wait_time = statistics.median(wait_times)
            max_wait_time = max(wait_times)
            min_wait_time = min(wait_times)
        else:
            avg_wait_time = 0
            median_wait_time = 0
            max_wait_time = 0
            min_wait_time = 0

        # Completion stats (arrival to triage end)
        completion_stats = {
            "count": len(completion_times),
            "avg_minutes": (
                round(sum(completion_times) / len(completion_times), 1) if completion_times else 0
            ),
            "median_minutes": (
                round(statistics.median(completion_times), 1) if completion_times else 0
            ),
        }

        # Triage duration stats (how long actual assessment takes)
        triage_duration_stats = {
            "count": len(triage_durations),
            "avg_minutes": (
                round(sum(triage_durations) / len(triage_durations), 1) if triage_durations else 0
            ),
        }

        # Calculate target met percentage
        target_met_percentage = (
            (met_target_count / total_with_category * 100)
            if total_with_category > 0
            else 100  # No assessments = 100% (no violations)
        )

        # Count by category with wait stats
        category_stats = []
        for category in ["RED", "ORANGE", "YELLOW", "GREEN", "BLUE"]:
            category_assessments = [a for a in assessments if a.triage_category == category]
            category_wait_times = [
                a.get_wait_time_minutes()
                for a in category_assessments
                if a.get_wait_time_minutes() is not None
            ]

            target_time = self.KETA_TARGETS.get(category, 240)
            exceeded = [wt for wt in category_wait_times if wt > target_time]

            category_stats.append(
                {
                    "category": category,
                    "target_minutes": target_time,
                    "avg_wait_minutes": (
                        round(sum(category_wait_times) / len(category_wait_times), 1)
                        if category_wait_times
                        else 0
                    ),
                    "median_wait_minutes": (
                        round(statistics.median(category_wait_times), 1)
                        if category_wait_times
                        else 0
                    ),
                    "exceeded_count": len(exceeded),
                    "exceeded_percentage": (
                        round((len(exceeded) / len(category_wait_times)) * 100, 1)
                        if category_wait_times
                        else 0
                    ),
                    "total_count": len(category_assessments),
                }
            )

        # Calculate REAL-TIME queue wait times (patients currently waiting)
        current_queue = WaitingQueue.objects.filter(status__in=["WAITING_TRIAGE", "IN_TRIAGE"])
        current_wait_times = []
        for entry in current_queue:
            wait_minutes = int((timezone.now() - entry.check_in_time).total_seconds() / 60)
            current_wait_times.append(wait_minutes)

        current_queue_stats = {
            "count": len(current_wait_times),
            "avg_wait_minutes": (
                round(sum(current_wait_times) / len(current_wait_times), 1)
                if current_wait_times
                else 0
            ),
            "max_wait_minutes": max(current_wait_times) if current_wait_times else 0,
            "longest_waiting_patient": max(current_wait_times) if current_wait_times else 0,
        }

        return Response(
            {
                "total_assessments": assessments.count(),
                # Historical wait times (arrival → triage start)
                "avg_wait_minutes": round(avg_wait_time, 1),
                "median_wait_minutes": round(median_wait_time, 1),
                "max_wait_minutes": round(max_wait_time, 1),
                "min_wait_minutes": round(min_wait_time, 1),
                "target_met_percentage": round(target_met_percentage, 1),
                "by_category": category_stats,
                # Real-time queue stats
                "current_queue": current_queue_stats,
                # Completion time stats (arrival → triage end)
                "completion_time": completion_stats,
                # Triage duration stats (triage start → triage end)
                "triage_duration": triage_duration_stats,
            }
        )


class ReportExportView(APIView):
    """
    Export triage report data as CSV.

    Supports exporting wait-time and volume reports for a given date range.
    """

    permission_classes = [IsAuthenticated, ReadRequiresModelPermission, WriteRequiresRolePermission]

    @extend_schema(
        parameters=[
            OpenApiParameter(
                name="format",
                type=str,
                location=OpenApiParameter.QUERY,
                description="Export format: csv",
            ),
            OpenApiParameter(
                name="date_range",
                type=str,
                location=OpenApiParameter.QUERY,
                description="Date range: today, week, month",
            ),
        ],
        responses={200: OpenApiTypes.BINARY},
    )
    def get(self, request):
        """Export triage report as CSV."""
        import csv
        import io
        from datetime import datetime

        from django.http import HttpResponse
        from django.utils import timezone

        resolve_request_tenant(request)

        date_range = request.query_params.get("date_range", "today")
        custom_start = request.query_params.get("start_date")
        custom_end = request.query_params.get("end_date")

        now = timezone.now()
        today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)

        if date_range == "custom" and custom_start:
            start_date = timezone.make_aware(datetime.strptime(custom_start, "%Y-%m-%d"))
            end_date = (
                timezone.make_aware(datetime.strptime(custom_end, "%Y-%m-%d"))
                if custom_end
                else now
            )
        elif date_range == "today":
            start_date = today_start
            end_date = now
        elif date_range == "yesterday":
            start_date = today_start - timezone.timedelta(days=1)
            end_date = today_start
        elif date_range in ("week", "last_7_days"):
            start_date = now - timezone.timedelta(days=7)
            end_date = now
        elif date_range in ("month", "last_30_days"):
            start_date = now - timezone.timedelta(days=30)
            end_date = now
        elif date_range == "this_month":
            start_date = today_start.replace(day=1)
            end_date = now
        elif date_range == "last_month":
            first_of_this_month = today_start.replace(day=1)
            end_date = first_of_this_month
            start_date = (first_of_this_month - timezone.timedelta(days=1)).replace(day=1)
        elif date_range == "this_quarter":
            quarter_month = ((now.month - 1) // 3) * 3 + 1
            start_date = today_start.replace(month=quarter_month, day=1)
            end_date = now
        else:
            start_date = today_start
            end_date = now

        facility = getattr(request, "facility", None)
        assessments = TriageAssessment.objects.filter(
            arrival_time__gte=start_date,
            arrival_time__lte=end_date,
        )
        if facility:
            assessments = assessments.filter(facility=facility)

        assessments = assessments.select_related("encounter__patient", "triaged_by").order_by(
            "-arrival_time"
        )

        # Build CSV
        output = io.StringIO()
        writer = csv.writer(output)
        writer.writerow(
            [
                "MRN",
                "Patient Name",
                "Category",
                "Chief Complaint",
                "Assigned Area",
                "Arrival Time",
                "Triage Start",
                "Triage End",
                "Wait (min)",
                "Triaged By",
            ]
        )

        for a in assessments:
            patient = a.encounter.patient
            writer.writerow(
                [
                    patient.mrn,
                    f"{patient.first_name} {patient.last_name}",
                    a.triage_category,
                    a.chief_complaint[:50],
                    (
                        a.get_assigned_area_display()
                        if a.assigned_area
                        else (a.assigned_clinic.name if a.assigned_clinic else "")
                    ),
                    a.arrival_time.strftime("%Y-%m-%d %H:%M"),
                    a.triage_start_time.strftime("%Y-%m-%d %H:%M") if a.triage_start_time else "",
                    a.triage_end_time.strftime("%Y-%m-%d %H:%M") if a.triage_end_time else "",
                    a.get_wait_time_minutes(),
                    a.triaged_by.get_full_name() if a.triaged_by else "",
                ]
            )

        response = HttpResponse(output.getvalue(), content_type="text/csv")
        response["Content-Disposition"] = f'attachment; filename="triage-report-{date_range}.csv"'
        return response


class VolumeReportView(APIView):
    """
    Report endpoint for volume by category.
    """

    permission_classes = [IsAuthenticated, ReadRequiresModelPermission, WriteRequiresRolePermission]

    @extend_schema(
        responses={200: OpenApiTypes.OBJECT},
    )
    def get(self, request):
        """Get volume counts by category."""
        from django.utils import timezone

        # Get date range from query params
        today_start = timezone.now().replace(hour=0, minute=0, second=0, microsecond=0)

        assessments = TriageAssessment.objects.filter(arrival_time__gte=today_start)
        total = assessments.count()

        # Count by category — reshape keys to match frontend schema
        by_category_qs = (
            assessments.values("triage_category").annotate(count=Count("id")).order_by("-count")
        )
        by_category = [
            {
                "category": item["triage_category"],
                "count": item["count"],
                "percentage": round(item["count"] / total * 100, 1) if total else 0,
            }
            for item in by_category_qs
        ]

        # Count by area — reshape keys to match frontend schema
        area_labels = dict(TriageAssessment.ASSIGNED_AREA_CHOICES)
        by_area_qs = (
            assessments.values("assigned_area").annotate(count=Count("id")).order_by("-count")
        )
        by_area = [
            {
                "area": item["assigned_area"],
                "area_label": area_labels.get(
                    item["assigned_area"], item["assigned_area"] or "Not assigned"
                ),
                "count": item["count"],
            }
            for item in by_area_qs
        ]

        return Response(
            {
                "total": total,
                "by_category": by_category,
                "by_area": by_area,
            }
        )


# =============================================================================
# ER BED BOARD (Phase 3)
# =============================================================================


class ERBedViewSet(TenantScopedViewMixin, ReadOnCreateMixin, viewsets.ModelViewSet):
    """
    ER Bed management for the bed board.

    Provides CRUD for ER beds plus custom actions for
    assigning/releasing patients and updating bed status.
    """

    queryset = ERBed.objects.all()
    permission_classes = [IsAuthenticated, ReadRequiresModelPermission, WriteRequiresRolePermission]
    filter_backends = [DjangoFilterBackend, filters.OrderingFilter]
    filterset_fields = ["zone", "status"]
    ordering_fields = ["zone", "bed_number", "status_changed_at"]
    ordering = ["zone", "bed_number"]
    tenant_scope = "facility"

    def get_queryset(self):
        """Return ER beds scoped to the current facility."""
        qs = super().get_queryset()
        return qs.select_related(
            "current_patient",
            "current_triage_assessment",
            "status_changed_by",
        )

    def get_serializer_class(self):
        """Return appropriate serializer for each action."""
        if self.action == "list":
            return ERBedListSerializer
        if self.action == "create":
            return ERBedCreateSerializer
        if self.action == "assign_patient":
            return ERBedAssignPatientSerializer
        if self.action == "release":
            return ERBedReleaseSerializer
        if self.action == "update_status":
            return ERBedUpdateStatusSerializer
        if self.action == "summary":
            return ERBedBoardSummarySerializer
        return ERBedSerializer

    def perform_create(self, serializer):
        """Set status_changed_by and tenant context on creation."""
        serializer.save(
            status_changed_by=self.request.user,
            **self.get_tenant_save_kwargs(),
        )

    @extend_schema(
        request=ERBedAssignPatientSerializer,
        responses={200: ERBedSerializer},
        description="Assign a patient to this ER bed.",
    )
    @action(detail=True, methods=["post"], url_path="assign")
    def assign_patient(self, request, pk=None):
        """Assign a patient to this bed."""
        bed = self.get_object()
        serializer = ERBedAssignPatientSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        try:
            bed.assign_patient(
                patient=serializer.validated_data["patient"],
                triage_assessment=serializer.validated_data.get("triage_assessment"),
                user=request.user,
            )
        except ValueError as e:
            return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)

        # Audit log
        AuditLog.log(
            action="er_bed_assign",
            user=request.user,
            resource_type="ERBed",
            resource_id=bed.id,
            ip_address=get_client_ip(request),
            details={
                "bed_number": bed.bed_number,
                "zone": bed.zone,
                "patient_id": serializer.validated_data["patient"].id,
            },
        )

        _broadcast_bed_update(bed, "assign")
        return Response(ERBedSerializer(bed).data)

    @extend_schema(
        request=ERBedReleaseSerializer,
        responses={200: ERBedSerializer},
        description="Release a patient from this ER bed.",
    )
    @action(detail=True, methods=["post"], url_path="release")
    def release(self, request, pk=None):
        """Release a patient from this bed."""
        bed = self.get_object()
        serializer = ERBedReleaseSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        patient_id = bed.current_patient_id

        try:
            bed.release(
                user=request.user,
                mark_cleaning=serializer.validated_data.get("mark_cleaning", True),
            )
        except ValueError as e:
            return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)

        AuditLog.log(
            action="er_bed_release",
            user=request.user,
            resource_type="ERBed",
            resource_id=bed.id,
            ip_address=get_client_ip(request),
            details={
                "bed_number": bed.bed_number,
                "zone": bed.zone,
                "patient_id": patient_id,
                "mark_cleaning": serializer.validated_data.get("mark_cleaning", True),
            },
        )

        _broadcast_bed_update(bed, "release")
        return Response(ERBedSerializer(bed).data)

    @extend_schema(
        request=ERBedUpdateStatusSerializer,
        responses={200: ERBedSerializer},
        description="Update bed status (mark available or out of service).",
    )
    @action(detail=True, methods=["post"], url_path="update-status")
    def update_status(self, request, pk=None):
        """Update bed status."""
        bed = self.get_object()
        serializer = ERBedUpdateStatusSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        new_status = serializer.validated_data["status"]
        reason = serializer.validated_data.get("reason", "")

        try:
            if new_status == "AVAILABLE":
                bed.mark_available(user=request.user)
            elif new_status == "OUT_OF_SERVICE":
                bed.mark_out_of_service(user=request.user, reason=reason)
        except ValueError as e:
            return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)

        AuditLog.log(
            action="er_bed_status_change",
            user=request.user,
            resource_type="ERBed",
            resource_id=bed.id,
            ip_address=get_client_ip(request),
            details={
                "bed_number": bed.bed_number,
                "zone": bed.zone,
                "new_status": new_status,
                "reason": reason,
            },
        )

        _broadcast_bed_update(bed, "status_change")
        return Response(ERBedSerializer(bed).data)

    @extend_schema(
        responses={200: ERBedBoardSummarySerializer(many=True)},
        description="Get bed board summary with counts per zone.",
    )
    @action(detail=False, methods=["get"], url_path="summary")
    def summary(self, request):
        """Get bed board summary with occupancy stats per zone."""
        zone_summaries = []

        for zone_code, zone_display in ERBed.ZONE_CHOICES:
            zone_beds = ERBed.objects.filter(zone=zone_code)
            total = zone_beds.count()

            if total == 0:
                continue

            available = zone_beds.filter(status="AVAILABLE").count()
            occupied = zone_beds.filter(status="OCCUPIED").count()
            cleaning = zone_beds.filter(status="CLEANING").count()
            out_of_service = zone_beds.filter(status="OUT_OF_SERVICE").count()

            zone_summaries.append(
                {
                    "zone": zone_code,
                    "zone_display": zone_display,
                    "total_beds": total,
                    "available": available,
                    "occupied": occupied,
                    "cleaning": cleaning,
                    "out_of_service": out_of_service,
                    "occupancy_rate": round((occupied / total) * 100, 1) if total > 0 else 0,
                }
            )

        return Response(zone_summaries)

    @extend_schema(
        responses={200: ERBedSerializer(many=True)},
        parameters=[
            OpenApiParameter(
                name="zone",
                type=str,
                location=OpenApiParameter.QUERY,
                description="Filter beds by ER zone code",
            ),
        ],
        description="Get all beds for the bed board grid display.",
    )
    @action(detail=False, methods=["get"], url_path="board")
    def board(self, request):
        """
        Get all beds grouped by zone for the visual bed board.

        Returns beds organized by zone with full patient info.
        """
        queryset = self.get_queryset()
        zone = request.query_params.get("zone")
        if zone:
            queryset = queryset.filter(zone=zone)

        serializer = ERBedSerializer(queryset, many=True)

        # Group by zone for frontend convenience
        grouped: dict = {}
        for bed_data in serializer.data:
            zone_code = bed_data["zone"]
            if zone_code not in grouped:
                zone_display = dict(ERBed.ZONE_CHOICES).get(zone_code, zone_code)
                grouped[zone_code] = {
                    "zone": zone_code,
                    "zone_display": zone_display,
                    "beds": [],
                }
            grouped[zone_code]["beds"].append(bed_data)

        return Response(list(grouped.values()))

    @extend_schema(
        parameters=[
            OpenApiParameter(
                name="zone",
                type=str,
                location=OpenApiParameter.QUERY,
                description="Zone code to suggest a bed for (required)",
                required=True,
            ),
        ],
        responses={200: ERBedSerializer},
        description=(
            "Suggest the best available bed in the given ER zone. "
            "Returns the first available bed ordered by bed number, "
            "or 404 if no beds are free."
        ),
    )
    @action(detail=False, methods=["get"], url_path="suggest")
    def suggest(self, request):
        """Suggest an available bed for a given zone."""
        zone = request.query_params.get("zone")
        if not zone:
            return Response(
                {"error": "'zone' query parameter is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        valid_zones = {code for code, _ in ERBed.ZONE_CHOICES}
        if zone not in valid_zones:
            return Response(
                {"error": f"Invalid zone '{zone}'. Valid: {sorted(valid_zones)}"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        bed = ERBed.objects.filter(zone=zone, status="AVAILABLE").order_by("bed_number").first()

        if not bed:
            return Response(
                {
                    "error": f"No available beds in {dict(ERBed.ZONE_CHOICES).get(zone, zone)}.",
                    "zone": zone,
                    "available": 0,
                },
                status=status.HTTP_404_NOT_FOUND,
            )

        return Response(ERBedSerializer(bed).data)


# =============================================================================
# Phase 4: Wait Time Breach & Escalation ViewSets
# =============================================================================
