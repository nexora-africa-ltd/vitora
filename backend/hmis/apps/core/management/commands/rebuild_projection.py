"""
Management command to rebuild read-model projections from EventStore.

Usage:
    # Rebuild a specific projection
    python manage.py rebuild_projection ClinicQueueProjection

    # Rebuild scoped to a facility
    python manage.py rebuild_projection WardOccupancyProjection --facility-id=1

    # List all registered projections
    python manage.py rebuild_projection --list

    # Rebuild all projections
    python manage.py rebuild_projection --all
"""

from django.core.management.base import BaseCommand

from hmis.apps.core.projections.registry import get_projection_registry


class Command(BaseCommand):
    help = "Rebuild read-model projections by replaying events from the EventStore."

    def add_arguments(self, parser):
        parser.add_argument(
            "name",
            nargs="?",
            help="Name of the projection to rebuild (e.g. ClinicQueueProjection)",
        )
        parser.add_argument(
            "--list",
            action="store_true",
            help="List all registered projections",
        )
        parser.add_argument(
            "--all",
            action="store_true",
            help="Rebuild all registered projections",
        )
        parser.add_argument(
            "--facility-id",
            type=int,
            help="Scope rebuild to a specific facility",
        )

    def handle(self, *args, **options):
        # Ensure projections are registered
        _ensure_registered()

        registry = get_projection_registry()

        if options["list"]:
            projections = registry.all()
            if not projections:
                self.stdout.write("No projections registered.")
                return
            self.stdout.write("Registered projections:")
            for name, proj in projections.items():
                self.stdout.write(f"  {name} — events: {', '.join(proj.event_types)}")
            return

        filters = {}
        if options.get("facility_id"):
            filters["facility_id"] = options["facility_id"]

        if options["all"]:
            projections = registry.all()
            if not projections:
                self.stdout.write("No projections registered.")
                return
            total = 0
            for name, proj in projections.items():
                count = proj.rebuild(**filters)
                total += count
                self.stdout.write(self.style.SUCCESS(f"  {name}: {count} events processed"))
            self.stdout.write(self.style.SUCCESS(f"Rebuilt all projections: {total} total events"))
            return

        name = options.get("name")
        if not name:
            self.stderr.write("Provide a projection name, --list, or --all.")
            return

        projection = registry.get(name)
        if not projection:
            self.stderr.write(
                f"Projection '{name}' not found. Use --list to see available projections."
            )
            return

        count = projection.rebuild(**filters)
        self.stdout.write(self.style.SUCCESS(f"Rebuilt {name}: {count} events processed"))


def _ensure_registered():
    """Import the setup module to register all projections."""
    from hmis.apps.core.projections import setup  # noqa: F401
