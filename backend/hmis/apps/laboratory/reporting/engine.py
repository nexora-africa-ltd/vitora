"""
Enhanced TAT & SLA reporting engine.

Provides percentile-based TAT reporting, SLA compliance calculations,
breach detection, and technician efficiency metrics.
"""

from __future__ import annotations

from datetime import date, datetime, time, timedelta

from django.core.exceptions import ValidationError
from django.db.models import Avg, Count, Q, Sum
from django.db.models.functions import TruncDate
from django.utils import timezone

from .models import TATSnapshot, WorkloadSnapshot


def _ensure_date_range(start_date: date, end_date: date):
    if start_date > end_date:
        raise ValidationError({"end": "End date must be on or after start date."})

    tz = timezone.get_current_timezone()
    start_dt = datetime.combine(start_date, time.min)
    end_dt = datetime.combine(end_date + timedelta(days=1), time.min)

    if timezone.is_naive(start_dt):
        start_dt = timezone.make_aware(start_dt, tz)
    if timezone.is_naive(end_dt):
        end_dt = timezone.make_aware(end_dt, tz)

    return start_dt, end_dt


def _percentile(values: list[float], p: int) -> float | None:
    """Compute the p-th percentile from a sorted list of floats."""
    if not values:
        return None
    values = sorted(values)
    k = (len(values) - 1) * (p / 100.0)
    f_idx = int(k)
    c_idx = f_idx + 1
    if c_idx >= len(values):
        return round(values[f_idx], 2)
    d = k - f_idx
    return round(values[f_idx] * (1 - d) + values[c_idx] * d, 2)


class TATReportingEngine:
    """Enhanced TAT reporting with percentiles and SLA compliance."""

    @staticmethod
    def sla_compliance_report(facility_id: int, start_date: date, end_date: date) -> dict:
        """SLA compliance report with breach counts and percentiles."""
        start_dt, end_dt = _ensure_date_range(start_date, end_date)

        snapshots = TATSnapshot.objects.filter(
            facility_id=facility_id,
            ordered_at__gte=start_dt,
            ordered_at__lt=end_dt,
            tat_total__isnull=False,
        )

        total = snapshots.count()
        breaches = snapshots.filter(is_breach=True).count()
        compliance_rate = round(((total - breaches) / total) * 100, 2) if total > 0 else 100.0

        # Overall percentiles
        all_totals = list(snapshots.values_list("tat_total", flat=True))

        # By priority
        by_priority = []
        for priority in ["STAT", "URGENT", "ROUTINE"]:
            priority_qs = snapshots.filter(priority=priority)
            p_count = priority_qs.count()
            p_breaches = priority_qs.filter(is_breach=True).count()
            p_totals = list(priority_qs.values_list("tat_total", flat=True))
            if p_count > 0:
                by_priority.append(
                    {
                        "priority": priority,
                        "count": p_count,
                        "breaches": p_breaches,
                        "compliance_rate": round(((p_count - p_breaches) / p_count) * 100, 2),
                        "avg_minutes": round(sum(p_totals) / len(p_totals), 2),
                        "p50_minutes": _percentile(p_totals, 50),
                        "p90_minutes": _percentile(p_totals, 90),
                        "p95_minutes": _percentile(p_totals, 95),
                    }
                )

        # By test (top 20 by volume)
        by_test_qs = (
            snapshots.values("test__code", "test__name")
            .annotate(
                count=Count("id"),
                breaches=Count("id", filter=Q(is_breach=True)),
                avg_total=Avg("tat_total"),
            )
            .order_by("-count")[:20]
        )
        by_test = []
        for row in by_test_qs:
            count = row["count"]
            b = row["breaches"]
            by_test.append(
                {
                    "test_code": row["test__code"],
                    "test_name": row["test__name"],
                    "count": count,
                    "breaches": b,
                    "compliance_rate": round(((count - b) / count) * 100, 2) if count else 100.0,
                    "avg_minutes": round(row["avg_total"], 2) if row["avg_total"] else None,
                }
            )

        # Segment averages
        segment_avgs = snapshots.aggregate(
            avg_order_to_collect=Avg("tat_order_to_collect"),
            avg_collect_to_receive=Avg("tat_collect_to_receive"),
            avg_receive_to_result=Avg("tat_receive_to_result"),
            avg_result_to_verify=Avg("tat_result_to_verify"),
            avg_total=Avg("tat_total"),
        )

        return {
            "start": start_date.isoformat(),
            "end": end_date.isoformat(),
            "summary": {
                "total_orders": total,
                "breaches": breaches,
                "compliance_rate": compliance_rate,
                "avg_total_minutes": round(segment_avgs["avg_total"], 2)
                if segment_avgs["avg_total"]
                else None,
                "p50_minutes": _percentile(all_totals, 50),
                "p90_minutes": _percentile(all_totals, 90),
                "p95_minutes": _percentile(all_totals, 95),
            },
            "segments": {
                "avg_order_to_collect": round(segment_avgs["avg_order_to_collect"], 2)
                if segment_avgs["avg_order_to_collect"]
                else None,
                "avg_collect_to_receive": round(segment_avgs["avg_collect_to_receive"], 2)
                if segment_avgs["avg_collect_to_receive"]
                else None,
                "avg_receive_to_result": round(segment_avgs["avg_receive_to_result"], 2)
                if segment_avgs["avg_receive_to_result"]
                else None,
                "avg_result_to_verify": round(segment_avgs["avg_result_to_verify"], 2)
                if segment_avgs["avg_result_to_verify"]
                else None,
            },
            "by_priority": by_priority,
            "by_test": by_test,
        }

    @staticmethod
    def tat_trend_report(facility_id: int, start_date: date, end_date: date) -> dict:
        """Daily TAT trend (avg and p90) for the period."""
        start_dt, end_dt = _ensure_date_range(start_date, end_date)

        snapshots = TATSnapshot.objects.filter(
            facility_id=facility_id,
            ordered_at__gte=start_dt,
            ordered_at__lt=end_dt,
            tat_total__isnull=False,
        )

        # Group by day
        by_day_qs = (
            snapshots.annotate(day=TruncDate("ordered_at"))
            .values("day")
            .annotate(
                count=Count("id"),
                breaches=Count("id", filter=Q(is_breach=True)),
                avg_total=Avg("tat_total"),
            )
            .order_by("day")
        )

        daily_data = []
        for row in by_day_qs:
            day_str = row["day"].isoformat()
            # Get p90 for this day
            day_totals = list(
                snapshots.filter(ordered_at__date=row["day"]).values_list("tat_total", flat=True)
            )
            daily_data.append(
                {
                    "date": day_str,
                    "count": row["count"],
                    "breaches": row["breaches"],
                    "avg_minutes": round(row["avg_total"], 2) if row["avg_total"] else None,
                    "p90_minutes": _percentile(day_totals, 90),
                }
            )

        return {
            "start": start_date.isoformat(),
            "end": end_date.isoformat(),
            "daily": daily_data,
        }

    @staticmethod
    def active_breaches(facility_id: int) -> dict:
        """Currently active (in-progress) orders that have breached SLA."""
        from hmis.apps.laboratory.models import LabOrder

        now = timezone.now()
        in_progress = LabOrder.objects.filter(
            facility_id=facility_id,
            status__in=["ORDERED", "SPECIMEN_COLLECTED", "IN_PROGRESS"],
        ).select_related("facility")

        breached = []
        for order in in_progress:
            elapsed = (now - order.ordered_at).total_seconds() / 60.0
            # Check SLA target
            first_item = order.items.select_related("test").first()
            if not first_item:
                continue
            from .models import TATSLATarget

            sla = TATSLATarget.objects.filter(
                facility=order.facility,
                test=first_item.test,
                priority=order.priority or "ROUTINE",
                is_active=True,
            ).first()

            target_minutes = None
            if sla:
                target_minutes = sla.target_total_minutes
            elif first_item.test.turnaround_hours:
                target_minutes = first_item.test.turnaround_hours * 60

            if target_minutes and elapsed > target_minutes:
                breached.append(
                    {
                        "order_number": order.order_number,
                        "order_id": order.pk,
                        "test_code": first_item.test.code,
                        "test_name": first_item.test.name,
                        "priority": order.priority,
                        "status": order.status,
                        "elapsed_minutes": round(elapsed, 1),
                        "target_minutes": target_minutes,
                        "breach_minutes": round(elapsed - target_minutes, 1),
                        "patient_name": str(order.patient) if order.patient else None,
                        "ordered_at": order.ordered_at.isoformat(),
                    }
                )

        breached.sort(key=lambda x: x["breach_minutes"], reverse=True)
        return {
            "count": len(breached),
            "breaches": breached,
        }

    @staticmethod
    def technician_efficiency(facility_id: int, start_date: date, end_date: date) -> dict:
        """Per-technician efficiency: avg TAT, volume, breach rate."""
        start_dt, end_dt = _ensure_date_range(start_date, end_date)

        snapshots = TATSnapshot.objects.filter(
            facility_id=facility_id,
            ordered_at__gte=start_dt,
            ordered_at__lt=end_dt,
        )

        # By resulted_by
        by_tech = (
            snapshots.filter(resulted_by__isnull=False)
            .values(
                "resulted_by",
                "resulted_by__first_name",
                "resulted_by__last_name",
                "resulted_by__username",
            )
            .annotate(
                results_entered=Count("id"),
                avg_receive_to_result=Avg("tat_receive_to_result"),
                breaches=Count("id", filter=Q(is_breach=True)),
            )
            .order_by("-results_entered")
        )

        technicians = []
        for row in by_tech:
            name = (
                f"{row['resulted_by__first_name']} {row['resulted_by__last_name']}".strip()
                or row["resulted_by__username"]
            )
            count = row["results_entered"]
            technicians.append(
                {
                    "technician_id": row["resulted_by"],
                    "technician_name": name,
                    "results_entered": count,
                    "avg_entry_time_minutes": round(row["avg_receive_to_result"], 2)
                    if row["avg_receive_to_result"]
                    else None,
                    "breaches": row["breaches"],
                    "breach_rate": round((row["breaches"] / count) * 100, 2) if count else 0,
                }
            )

        return {
            "start": start_date.isoformat(),
            "end": end_date.isoformat(),
            "technicians": technicians,
        }

    @staticmethod
    def workload_kpi_report(facility_id: int, start_date: date, end_date: date) -> dict:
        """Aggregated workload KPIs from WorkloadSnapshot records."""
        snapshots = WorkloadSnapshot.objects.filter(
            facility_id=facility_id,
            date__gte=start_date,
            date__lte=end_date,
        )

        totals = snapshots.aggregate(
            total_entered=Sum("tests_entered"),
            total_verified=Sum("tests_verified"),
            total_collected=Sum("specimens_collected"),
            total_rejected=Sum("specimens_rejected"),
            total_critical=Sum("critical_results_count"),
            total_critical_compliant=Sum("critical_notified_within_30min"),
            avg_entry_time=Avg("avg_entry_time_minutes"),
            avg_verify_time=Avg("avg_verify_time_minutes"),
        )

        total_collected = (totals["total_collected"] or 0) + (totals["total_rejected"] or 0)
        rejection_rate = (
            round(((totals["total_rejected"] or 0) / total_collected) * 100, 2)
            if total_collected > 0
            else 0.0
        )
        critical_total = totals["total_critical"] or 0
        critical_compliance = (
            round(((totals["total_critical_compliant"] or 0) / critical_total) * 100, 2)
            if critical_total > 0
            else 100.0
        )

        # By technician
        by_tech = (
            snapshots.values(
                "technician",
                "technician__first_name",
                "technician__last_name",
                "technician__username",
            )
            .annotate(
                total_entered=Sum("tests_entered"),
                total_verified=Sum("tests_verified"),
                total_rejected=Sum("specimens_rejected"),
                avg_entry=Avg("avg_entry_time_minutes"),
            )
            .order_by("-total_entered")
        )

        technicians = []
        for row in by_tech:
            name = (
                f"{row['technician__first_name']} {row['technician__last_name']}".strip()
                or row["technician__username"]
            )
            technicians.append(
                {
                    "technician_id": row["technician"],
                    "technician_name": name,
                    "tests_entered": row["total_entered"] or 0,
                    "tests_verified": row["total_verified"] or 0,
                    "specimens_rejected": row["total_rejected"] or 0,
                    "avg_entry_time_minutes": round(row["avg_entry"], 2)
                    if row["avg_entry"]
                    else None,
                }
            )

        # Daily trend
        by_day = (
            snapshots.values("date")
            .annotate(
                entered=Sum("tests_entered"),
                verified=Sum("tests_verified"),
            )
            .order_by("date")
        )

        return {
            "start": start_date.isoformat(),
            "end": end_date.isoformat(),
            "totals": {
                "tests_entered": totals["total_entered"] or 0,
                "tests_verified": totals["total_verified"] or 0,
                "specimens_collected": totals["total_collected"] or 0,
                "specimens_rejected": totals["total_rejected"] or 0,
                "rejection_rate": rejection_rate,
                "critical_results": critical_total,
                "critical_compliance_rate": critical_compliance,
                "avg_entry_time_minutes": round(totals["avg_entry_time"], 2)
                if totals["avg_entry_time"]
                else None,
                "avg_verify_time_minutes": round(totals["avg_verify_time"], 2)
                if totals["avg_verify_time"]
                else None,
            },
            "by_technician": technicians,
            "by_day": [
                {
                    "date": row["date"].isoformat(),
                    "tests_entered": row["entered"] or 0,
                    "tests_verified": row["verified"] or 0,
                }
                for row in by_day
            ],
        }
