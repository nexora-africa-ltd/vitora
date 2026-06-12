# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""Seed a local hub database from a cloud activation response."""

from django.core.management.base import BaseCommand

from hmis.apps.licensing.bootstrap import load_activation_response, seed_from_activation_payload


class Command(BaseCommand):
    """Create/update Organization and Facility mirrors from activation JSON."""

    help = (
        "Seed local Organization and Facility rows from a licensing activation response JSON file."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            "--response-file",
            required=True,
            help="Path to the JSON response returned by /api/licensing/activate/.",
        )

    def handle(self, *args, **options):
        payload = load_activation_response(options["response_file"])
        organization, facility = seed_from_activation_payload(payload)
        self.stdout.write(
            self.style.SUCCESS(
                f"Seeded organization {organization.id} ({organization.name}) "
                f"and facility {facility.id} ({facility.name})."
            )
        )
