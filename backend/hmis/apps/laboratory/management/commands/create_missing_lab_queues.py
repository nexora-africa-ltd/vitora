"""
Management command to create missing LabQueue entries for existing orders.

This is useful for migrating existing data or fixing any orders that
were created before the auto-creation signal was added.
"""

from django.core.management.base import BaseCommand
from django.db import transaction

from hmis.apps.laboratory.models import LabOrder, LabQueue


class Command(BaseCommand):
    """Create missing LabQueue entries for existing in-house lab orders."""

    help = "Create LabQueue entries for in-house lab orders that don't have one"

    def add_arguments(self, parser):
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Show what would be created without making changes",
        )

    def handle(self, *args, **options):
        dry_run = options["dry_run"]

        # Find in-house orders without queue entries
        orders_without_queue = LabOrder.objects.filter(order_type="IN_HOUSE").exclude(
            queue_entry__isnull=False
        )

        count = orders_without_queue.count()
        self.stdout.write(f"Found {count} in-house orders without queue entries")

        if dry_run:
            self.stdout.write(self.style.WARNING("DRY RUN - no changes made"))
            for order in orders_without_queue[:10]:
                self.stdout.write(f"  Would create queue for: {order.order_number}")
            if count > 10:
                self.stdout.write(f"  ... and {count - 10} more")
            return

        created = 0
        errors = 0

        with transaction.atomic():
            for order in orders_without_queue:
                try:
                    # Get specimen type from first order item
                    first_item = order.items.first()
                    specimen_type = first_item.test.specimen_type if first_item else "BLOOD"

                    LabQueue.objects.create(
                        lab_order=order,
                        priority=order.priority,
                        sample_type=specimen_type,
                        queue_status="PENDING",
                    )
                    created += 1
                    self.stdout.write(f"  Created queue for: {order.order_number}")
                except Exception as e:
                    errors += 1
                    self.stderr.write(
                        self.style.ERROR(f"  Failed to create queue for {order.order_number}: {e}")
                    )

        self.stdout.write(
            self.style.SUCCESS(f"\nCreated {created} queue entries ({errors} errors)")
        )
