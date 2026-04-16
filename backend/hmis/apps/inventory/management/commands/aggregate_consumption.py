"""
Management command to aggregate consumption data from Dispensing and
StockAdjustment records into ConsumptionRecord summaries.

Usage:
    python manage.py aggregate_consumption --facility-id 1
    python manage.py aggregate_consumption --facility-id 1 --months 3
    python manage.py aggregate_consumption --all-facilities --months 1
"""

from datetime import date, timedelta

from django.core.management.base import BaseCommand, CommandError

from hmis.apps.core.models import Facility
from hmis.apps.inventory.services.forecasting import ConsumptionAggregator


class Command(BaseCommand):
    help = "Aggregate dispensing/adjustment data into ConsumptionRecord rows."

    def add_arguments(self, parser):
        parser.add_argument(
            "--facility-id",
            type=int,
            help="Facility ID to aggregate for.",
        )
        parser.add_argument(
            "--all-facilities",
            action="store_true",
            help="Aggregate for all active facilities.",
        )
        parser.add_argument(
            "--months",
            type=int,
            default=1,
            help="Number of past months to aggregate (default: 1).",
        )
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Show what would be aggregated without writing.",
        )

    def handle(self, *args, **options):
        facility_ids = self._resolve_facilities(options)
        months = options["months"]
        dry_run = options["dry_run"]

        today = date.today()
        total_records = 0

        for fid in facility_ids:
            for m in range(months):
                period_end = today.replace(day=1) - timedelta(days=1 + 30 * m)
                period_start = period_end.replace(day=1)

                if dry_run:
                    self.stdout.write(
                        f"  [DRY RUN] facility={fid} period={period_start}–{period_end}"
                    )
                    continue

                agg = ConsumptionAggregator(facility_id=fid)
                count = agg.aggregate(period_start, period_end)
                total_records += count
                if count:
                    self.stdout.write(
                        f"  facility={fid} period={period_start}–{period_end}: {count} records"
                    )

        if dry_run:
            self.stdout.write(self.style.WARNING("Dry run — no records created."))
        else:
            self.stdout.write(
                self.style.SUCCESS(f"Aggregated {total_records} consumption record(s).")
            )

    def _resolve_facilities(self, options) -> list[int]:
        if options["all_facilities"]:
            return list(Facility.objects.filter(is_active=True).values_list("pk", flat=True))
        if options["facility_id"]:
            if not Facility.objects.filter(pk=options["facility_id"]).exists():
                raise CommandError(f"Facility {options['facility_id']} does not exist.")
            return [options["facility_id"]]
        raise CommandError("Specify --facility-id or --all-facilities.")
