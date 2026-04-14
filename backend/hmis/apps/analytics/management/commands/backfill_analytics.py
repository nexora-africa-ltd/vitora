"""
Backfill analytics aggregate tables from historical data.

Usage::

    # Backfill last 90 days (default)
    python manage.py backfill_analytics

    # Backfill specific date range
    python manage.py backfill_analytics --start 2026-01-01 --end 2026-03-31

    # Dry run (show what would be processed)
    python manage.py backfill_analytics --dry-run

    # Daily summaries only
    python manage.py backfill_analytics --daily-only
"""

from __future__ import annotations

from datetime import date, timedelta

from django.core.management.base import BaseCommand
from django.utils import timezone


class Command(BaseCommand):
    help = "Backfill analytics aggregate tables from historical transactional data."

    def add_arguments(self, parser):
        parser.add_argument(
            "--start",
            type=str,
            help="Start date (YYYY-MM-DD). Default: 90 days ago.",
        )
        parser.add_argument(
            "--end",
            type=str,
            help="End date (YYYY-MM-DD). Default: yesterday.",
        )
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Show what would be processed without writing data.",
        )
        parser.add_argument(
            "--daily-only",
            action="store_true",
            help="Only backfill daily summaries (skip monthly/demographics).",
        )

    def handle(self, *args, **options):
        from hmis.apps.analytics.models import (
            DepartmentMonthlySummary,
            DiagnosisTrend,
            FacilityDailySummary,
            PatientDemographicSnapshot,
        )
        from hmis.apps.analytics.services import (
            compute_daily_summary,
            compute_demographics_snapshot,
            compute_department_monthly,
            compute_diagnosis_trends,
        )
        from hmis.apps.core.models import Facility

        today = timezone.localdate()
        start = (
            date.fromisoformat(options["start"]) if options["start"] else today - timedelta(days=90)
        )
        end = date.fromisoformat(options["end"]) if options["end"] else today - timedelta(days=1)
        dry_run = options["dry_run"]

        facilities = Facility.objects.filter(is_active=True)
        self.stdout.write(
            f"Backfilling analytics from {start} to {end} "
            f"for {facilities.count()} active facilities"
            f"{' (DRY RUN)' if dry_run else ''}"
        )

        # --- Daily summaries ---
        daily_count = 0
        current = start
        while current <= end:
            for facility in facilities:
                if dry_run:
                    self.stdout.write(f"  [dry-run] Daily: {facility.name} – {current}")
                else:
                    try:
                        defaults = compute_daily_summary(facility, current)
                        FacilityDailySummary.objects.update_or_create(
                            facility=facility,
                            date=current,
                            defaults={**defaults, "organization": facility.organization},
                        )
                        daily_count += 1
                    except Exception as e:
                        self.stderr.write(f"  ERROR: {facility.name} – {current}: {e}")
            current += timedelta(days=1)

        self.stdout.write(self.style.SUCCESS(f"Daily summaries: {daily_count} rows"))

        if options["daily_only"]:
            return

        # --- Monthly summaries ---
        monthly_count = 0
        months_seen: set[tuple[int, int]] = set()
        current = start.replace(day=1)
        while current <= end:
            ym = (current.year, current.month)
            if ym not in months_seen:
                months_seen.add(ym)
                for facility in facilities:
                    if dry_run:
                        self.stdout.write(
                            f"  [dry-run] Monthly: {facility.name} – {ym[0]}/{ym[1]:02d}"
                        )
                    else:
                        try:
                            dept_rows = compute_department_monthly(facility, ym[0], ym[1])
                            for row in dept_rows:
                                DepartmentMonthlySummary.objects.update_or_create(
                                    facility=facility,
                                    year=ym[0],
                                    month=ym[1],
                                    department=row.pop("department"),
                                    defaults={
                                        **row,
                                        "organization": facility.organization,
                                    },
                                )
                                monthly_count += 1

                            # Diagnosis trends
                            month_start = date(ym[0], ym[1], 1)
                            if ym[1] == 12:
                                month_end = date(ym[0] + 1, 1, 1) - timedelta(days=1)
                            else:
                                month_end = date(ym[0], ym[1] + 1, 1) - timedelta(days=1)
                            dx_rows = compute_diagnosis_trends(
                                facility, month_start, month_end, "MONTHLY"
                            )
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
                        except Exception as e:
                            self.stderr.write(f"  ERROR monthly: {facility.name} – {ym}: {e}")
            # Advance to next month
            if current.month == 12:
                current = current.replace(year=current.year + 1, month=1)
            else:
                current = current.replace(month=current.month + 1)

        self.stdout.write(self.style.SUCCESS(f"Monthly summaries: {monthly_count} rows"))

        # --- Demographics snapshots ---
        demo_count = 0
        for facility in facilities:
            if dry_run:
                self.stdout.write(f"  [dry-run] Demographics: {facility.name}")
            else:
                try:
                    defaults = compute_demographics_snapshot(facility, end)
                    PatientDemographicSnapshot.objects.update_or_create(
                        facility=facility,
                        snapshot_date=end,
                        defaults={**defaults, "organization": facility.organization},
                    )
                    demo_count += 1
                except Exception as e:
                    self.stderr.write(f"  ERROR demographics: {facility.name}: {e}")

        self.stdout.write(self.style.SUCCESS(f"Demographics snapshots: {demo_count} rows"))
        self.stdout.write(self.style.SUCCESS("Backfill complete."))
