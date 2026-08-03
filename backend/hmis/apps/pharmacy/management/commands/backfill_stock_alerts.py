"""Backfill low/out-of-stock alerts across facilities.

This command is safe to run multiple times. It only creates unresolved alerts
that do not already exist.
"""

from django.core.management.base import BaseCommand

from hmis.apps.pharmacy.models import StockAlert


class Command(BaseCommand):
    help = (
        "Generate missing LOW_STOCK / OUT_OF_STOCK alerts for all facilities "
        "based on current inventory state."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            "--facility-id",
            type=int,
            help="Optional facility ID to backfill a single facility.",
        )

    def handle(self, *args, **options):
        facility_id = options.get("facility_id")

        scope = f"facility {facility_id}" if facility_id else "all facilities"
        self.stdout.write(f"Backfilling stock alerts for {scope}...")

        before_count = StockAlert.objects.filter(
            alert_type__in=["LOW_STOCK", "OUT_OF_STOCK"],
            is_resolved=False,
        ).count()

        created = StockAlert.generate_low_stock_alerts(facility_id=facility_id)

        after_qs = StockAlert.objects.filter(
            alert_type__in=["LOW_STOCK", "OUT_OF_STOCK"],
            is_resolved=False,
        )
        if facility_id:
            after_qs = after_qs.filter(facility_id=facility_id)

        created_low = sum(1 for a in created if a.alert_type == "LOW_STOCK")
        created_oos = sum(1 for a in created if a.alert_type == "OUT_OF_STOCK")

        self.stdout.write(self.style.SUCCESS("Backfill completed."))
        self.stdout.write(f"Created alerts: {len(created)}")
        self.stdout.write(f"  - LOW_STOCK: {created_low}")
        self.stdout.write(f"  - OUT_OF_STOCK: {created_oos}")
        self.stdout.write(f"Open low/out-of-stock alerts in scope: {after_qs.count()}")
        self.stdout.write(f"Open low/out-of-stock alerts (global before run): {before_count}")
