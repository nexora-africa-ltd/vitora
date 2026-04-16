"""
Management command to generate reorder suggestions based on demand forecasts.

Usage:
    python manage.py generate_reorder_suggestions --facility-id 1
    python manage.py generate_reorder_suggestions --all-facilities
"""

from django.core.management.base import BaseCommand, CommandError

from hmis.apps.core.models import Facility
from hmis.apps.inventory.services.forecasting import ReorderEngine


class Command(BaseCommand):
    help = "Generate reorder suggestions by comparing stock vs forecasted demand."

    def add_arguments(self, parser):
        parser.add_argument(
            "--facility-id",
            type=int,
            help="Facility ID to generate suggestions for.",
        )
        parser.add_argument(
            "--all-facilities",
            action="store_true",
            help="Generate suggestions for all active facilities.",
        )

    def handle(self, *args, **options):
        facility_ids = self._resolve_facilities(options)
        total = 0

        for fid in facility_ids:
            engine = ReorderEngine(facility_id=fid)
            count = engine.generate_suggestions()
            total += count
            if count:
                self.stdout.write(f"  facility={fid}: {count} suggestion(s)")

        self.stdout.write(self.style.SUCCESS(f"Generated {total} reorder suggestion(s)."))

    def _resolve_facilities(self, options) -> list[int]:
        if options["all_facilities"]:
            return list(Facility.objects.filter(is_active=True).values_list("pk", flat=True))
        if options["facility_id"]:
            if not Facility.objects.filter(pk=options["facility_id"]).exists():
                raise CommandError(f"Facility {options['facility_id']} does not exist.")
            return [options["facility_id"]]
        raise CommandError("Specify --facility-id or --all-facilities.")
