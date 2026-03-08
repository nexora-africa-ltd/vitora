from __future__ import annotations

import json

from django.core.management.base import BaseCommand, CommandError

from hmis.apps.mch.services.clinic_unification_validation import validate_mch_clinic_links


class Command(BaseCommand):
    help = "Validate ANC/PNC to clinic visit link coverage and dangling completed clinic visits"

    def add_arguments(self, parser):
        parser.add_argument("--json", action="store_true")

    def handle(self, *args, **options):
        result = validate_mch_clinic_links().to_dict()
        if options["json"]:
            self.stdout.write(json.dumps(result, indent=2, sort_keys=True))
            return

        self.stdout.write(self.style.SUCCESS("MCH clinic link validation summary"))
        for key, value in result["summary"].items():
            self.stdout.write(f"{key}: {value}")
        self.stdout.write(f"detail_rows: {len(result['details'])}")

        if result["details"]:
            raise CommandError("Validation found link issues")
