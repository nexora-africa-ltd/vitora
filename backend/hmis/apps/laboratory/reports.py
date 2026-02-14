"""
Lab reporting services for operational analytics.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime, time, timedelta

from django.core.exceptions import ValidationError
from django.db.models import Avg, Count, DurationField, ExpressionWrapper, F, Q
from django.db.models.functions import TruncDate
from django.utils import timezone

from .models import LabOrder, LabQueue, LabResult


@dataclass(frozen=True)
class DateTimeRange:
    start: datetime
    end: datetime


def _ensure_date_range(start_date: date, end_date: date) -> DateTimeRange:
    if start_date > end_date:
        raise ValidationError({"end": "End date must be on or after start date."})

    tz = timezone.get_current_timezone()
    start_dt = datetime.combine(start_date, time.min)
    end_dt = datetime.combine(end_date + timedelta(days=1), time.min)

    if timezone.is_naive(start_dt):
        start_dt = timezone.make_aware(start_dt, tz)
    if timezone.is_naive(end_dt):
        end_dt = timezone.make_aware(end_dt, tz)

    return DateTimeRange(start=start_dt, end=end_dt)


class LabReportService:
    """Operational lab reporting utilities."""

    @staticmethod
    def turnaround_time_report(start_date: date, end_date: date) -> dict:
        """Report TAT using result entry/verification and queue timestamps.

        TAT definitions:
        - Result TAT: `verified_at - entered_at` for verified results.
        - Queue TAT: `released_at - collected_at` for released samples.
        - Processing TAT: `released_at - processing_started_at` for released samples.
        """

        date_range = _ensure_date_range(start_date, end_date)
        tat_expr = ExpressionWrapper(
            F("verified_at") - F("entered_at"), output_field=DurationField()
        )

        results = LabResult.objects.filter(
            entered_at__gte=date_range.start,
            entered_at__lt=date_range.end,
            verified_at__isnull=False,
        )

        by_test = list(
            results.values("order_item__test__code", "order_item__test__name")
            .annotate(result_count=Count("id"), avg_tat=Avg(tat_expr))
            .order_by("order_item__test__name")
        )

        by_priority = list(
            results.values("order_item__lab_order__priority")
            .annotate(result_count=Count("id"), avg_tat=Avg(tat_expr))
            .order_by("order_item__lab_order__priority")
        )

        overall = results.aggregate(result_count=Count("id"), avg_tat=Avg(tat_expr))

        queue_released = LabQueue.objects.filter(
            created_at__gte=date_range.start,
            created_at__lt=date_range.end,
            released_at__isnull=False,
        )

        collect_tat_expr = ExpressionWrapper(
            F("released_at") - F("collected_at"), output_field=DurationField()
        )
        processing_tat_expr = ExpressionWrapper(
            F("released_at") - F("processing_started_at"), output_field=DurationField()
        )

        queue_collect_stats = queue_released.filter(collected_at__isnull=False).aggregate(
            released_count=Count("id"), avg_tat=Avg(collect_tat_expr)
        )
        queue_processing_stats = queue_released.filter(
            processing_started_at__isnull=False
        ).aggregate(avg_tat=Avg(processing_tat_expr))

        def _duration_hours(value):
            if value is None:
                return None
            return round(value.total_seconds() / 3600, 2)

        return {
            "start": start_date.isoformat(),
            "end": end_date.isoformat(),
            "overall": {
                "results_verified": overall.get("result_count", 0) or 0,
                "avg_result_tat_hours": _duration_hours(overall.get("avg_tat")),
            },
            "by_test": [
                {
                    "test_code": row["order_item__test__code"],
                    "test_name": row["order_item__test__name"],
                    "result_count": row["result_count"],
                    "avg_tat_hours": _duration_hours(row.get("avg_tat")),
                }
                for row in by_test
            ],
            "by_priority": [
                {
                    "priority": row["order_item__lab_order__priority"],
                    "result_count": row["result_count"],
                    "avg_tat_hours": _duration_hours(row.get("avg_tat")),
                }
                for row in by_priority
            ],
            "queue_tat": {
                "released_count": queue_collect_stats.get("released_count", 0) or 0,
                "avg_collect_to_release_hours": _duration_hours(
                    queue_collect_stats.get("avg_tat")
                ),
                "avg_processing_to_release_hours": _duration_hours(
                    queue_processing_stats.get("avg_tat")
                ),
            },
        }

    @staticmethod
    def workload_report(start_date: date, end_date: date) -> dict:
        """Report workload by day and technician.

        Uses `entered_at` and `verified_at` for daily volumes.
        """

        date_range = _ensure_date_range(start_date, end_date)

        entered_results = LabResult.objects.filter(
            entered_at__gte=date_range.start,
            entered_at__lt=date_range.end,
        )

        verified_results = LabResult.objects.filter(
            verified_at__isnull=False,
            verified_at__gte=date_range.start,
            verified_at__lt=date_range.end,
        )

        entered_by_day = entered_results.annotate(day=TruncDate("entered_at")).values(
            "day"
        )
        entered_by_day = entered_by_day.annotate(tests_entered=Count("id"))

        verified_by_day = verified_results.annotate(day=TruncDate("verified_at")).values(
            "day"
        )
        verified_by_day = verified_by_day.annotate(tests_verified=Count("id"))

        daily = {}
        for row in entered_by_day:
            day_key = row["day"].isoformat()
            daily[day_key] = {
                "date": day_key,
                "tests_entered": row["tests_entered"],
                "tests_verified": 0,
            }
        for row in verified_by_day:
            day_key = row["day"].isoformat()
            daily.setdefault(
                day_key, {"date": day_key, "tests_entered": 0, "tests_verified": 0}
            )
            daily[day_key]["tests_verified"] = row["tests_verified"]

        entered_by_tech = entered_results.values(
            "entered_by",
            "entered_by__first_name",
            "entered_by__last_name",
            "entered_by__username",
        ).annotate(entered_count=Count("id"))

        verified_by_tech = verified_results.filter(verified_by__isnull=False).values(
            "verified_by",
            "verified_by__first_name",
            "verified_by__last_name",
            "verified_by__username",
        ).annotate(verified_count=Count("id"))

        tech_stats = {}
        for row in entered_by_tech:
            tech_id = row["entered_by"]
            name = _format_user_name(
                row["entered_by__first_name"],
                row["entered_by__last_name"],
                row["entered_by__username"],
            )
            tech_stats[tech_id] = {
                "technician_id": tech_id,
                "technician_name": name,
                "entered_count": row["entered_count"],
                "verified_count": 0,
            }

        for row in verified_by_tech:
            tech_id = row["verified_by"]
            name = _format_user_name(
                row["verified_by__first_name"],
                row["verified_by__last_name"],
                row["verified_by__username"],
            )
            tech_stats.setdefault(
                tech_id,
                {
                    "technician_id": tech_id,
                    "technician_name": name,
                    "entered_count": 0,
                    "verified_count": 0,
                },
            )
            tech_stats[tech_id]["verified_count"] = row["verified_count"]

        return {
            "start": start_date.isoformat(),
            "end": end_date.isoformat(),
            "totals": {
                "tests_entered": entered_results.count(),
                "tests_verified": verified_results.count(),
            },
            "by_day": sorted(daily.values(), key=lambda item: item["date"]),
            "by_technician": sorted(tech_stats.values(), key=lambda item: item["technician_name"]),
        }

    @staticmethod
    def critical_values_report(start_date: date, end_date: date) -> dict:
        """Report counts of critical results."""

        date_range = _ensure_date_range(start_date, end_date)

        critical_results = LabResult.objects.filter(
            entered_at__gte=date_range.start,
            entered_at__lt=date_range.end,
        ).filter(Q(result_flag__in=["CRITICAL_LOW", "CRITICAL_HIGH"]) | Q(is_critical_result=True))

        by_test = list(
            critical_results.values("order_item__test__code", "order_item__test__name")
            .annotate(critical_count=Count("id"))
            .order_by("order_item__test__name")
        )

        return {
            "start": start_date.isoformat(),
            "end": end_date.isoformat(),
            "total_critical": critical_results.count(),
            "by_test": [
                {
                    "test_code": row["order_item__test__code"],
                    "test_name": row["order_item__test__name"],
                    "critical_count": row["critical_count"],
                }
                for row in by_test
            ],
        }

    @staticmethod
    def sample_rejection_report(start_date: date, end_date: date) -> dict:
        """Report sample rejection rate and reasons.

        Uses `LabOrder.ordered_at` to count total orders and rejections,
        and `LabQueue.rejection_reason` for reason breakdowns.
        """

        date_range = _ensure_date_range(start_date, end_date)

        orders_in_range = LabOrder.objects.filter(
            ordered_at__gte=date_range.start,
            ordered_at__lt=date_range.end,
        )

        rejected_orders = orders_in_range.filter(status="REJECTED")

        reasons = (
            LabQueue.objects.filter(
                lab_order__ordered_at__gte=date_range.start,
                lab_order__ordered_at__lt=date_range.end,
            )
            .exclude(rejection_reason="")
            .values("rejection_reason")
            .annotate(count=Count("id"))
            .order_by("rejection_reason")
        )

        total_orders = orders_in_range.count()
        rejected_count = rejected_orders.count()
        rejection_rate = 0.0
        if total_orders:
            rejection_rate = round((rejected_count / total_orders) * 100, 2)

        return {
            "start": start_date.isoformat(),
            "end": end_date.isoformat(),
            "total_orders": total_orders,
            "rejected_orders": rejected_count,
            "rejection_rate": rejection_rate,
            "reasons": [
                {"reason": row["rejection_reason"], "count": row["count"]}
                for row in reasons
            ],
        }


def _format_user_name(first_name: str | None, last_name: str | None, username: str | None) -> str:
    full_name = " ".join(part for part in [first_name or "", last_name or ""] if part).strip()
    return full_name or (username or "")
