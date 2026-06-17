# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""Seed a local hub database from a cloud activation response."""

import json
import os
from pathlib import Path

from django.core.management import call_command
from django.core.management.base import BaseCommand

from hmis.apps.licensing.bootstrap import (
    load_activation_response,
    seed_bootstrap_data,
    seed_cloud_users,
    seed_from_activation_payload,
)


class Command(BaseCommand):
    """Create/update Organization and Facility mirrors from activation JSON."""

    help = (
        "Seed local Organization and Facility rows from a licensing activation response JSON file. "
        "Also loads Kenya location data and bootstrap departments/roles."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            "--response-file",
            required=True,
            help="Path to the JSON response returned by /api/licensing/activate/.",
        )
        parser.add_argument(
            "--skip-locations",
            action="store_true",
            help="Skip loading Kenya county location data.",
        )

    def handle(self, *args, **options):
        payload = load_activation_response(options["response_file"])

        # Load Kenya locations first (counties/subcounties/wards)
        if not options["skip_locations"]:
            self._load_kenya_locations()

        # Seed org and facility
        organization, facility = seed_from_activation_payload(payload)
        self.stdout.write(
            self.style.SUCCESS(
                f"Seeded organization {organization.id} ({organization.name}) "
                f"and facility {facility.id} ({facility.name})."
            )
        )

        # Seed bootstrap data (departments, roles)
        bootstrap = payload.get("bootstrap") or {}
        if bootstrap:
            counts = seed_bootstrap_data(bootstrap, organization=organization, facility=facility)
            self.stdout.write(
                self.style.SUCCESS(
                    f"Seeded {counts['departments']} department(s) and {counts['roles']} role(s)."
                )
            )

        # Seed cloud user placeholders + save manifest for createsuperuser
        users_data = bootstrap.get("users") or []
        if users_data:
            user_counts = seed_cloud_users(users_data, organization=organization, facility=facility)
            self.stdout.write(
                self.style.SUCCESS(
                    f"Seeded {user_counts['created']} cloud user placeholder(s) "
                    f"({user_counts['skipped']} already existed)."
                )
            )
            # Save manifest so createsuperuser can check for username conflicts
            data_dir = os.getenv("HUB_DATA_DIR", str(Path.cwd()))
            manifest_path = Path(data_dir) / "cloud_users.json"
            manifest_path.write_text(json.dumps(users_data, indent=2))
            self.stdout.write(f"Cloud user manifest saved to {manifest_path}")

    def _load_kenya_locations(self):
        """Load Kenya county data from bundled CSV if counties table is empty."""
        from hmis.apps.core.models import County

        if County.objects.exists():
            self.stdout.write("Kenya locations already loaded, skipping.")
            return

        # Find the CSV file relative to the manage.py location
        base_dir = Path(os.getcwd())
        csv_candidates = [
            base_dir / "data" / "kenya_locations.csv",
            Path(__file__).resolve().parent.parent.parent.parent.parent
            / "data"
            / "kenya_locations.csv",
        ]
        csv_path = None
        for candidate in csv_candidates:
            if candidate.exists():
                csv_path = candidate
                break

        if csv_path:
            self.stdout.write(f"Loading Kenya locations from {csv_path}...")
            call_command("import_kenya_locations", str(csv_path))
        else:
            self.stdout.write(
                self.style.WARNING(
                    "Kenya locations CSV not found. Counties will be created from activation data only."
                )
            )
