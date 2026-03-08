from __future__ import annotations

import json

from django.core.management.base import BaseCommand, CommandError

from hmis.apps.mch.services.clinic_unification_validation import validate_enrollment_attendance_counts


class Command(BaseCommand):
    help = "Validate stored ANC enrollment counters against canonical linked clinic visits"

    def add_arguments(self, parser):
        parser.add_argument("--json", action="store_true")

    def handle(self, *args, **options):
        result = validate_enrollment_attendance_counts().to_dict()
        if options["json"]:
            self.stdout.write(json.dumps(result, indent=2, sort_keys=True))
            return

        self.stdout.write(self.style.SUCCESS("Enrollment attendance validation summary"))
        for key, value in result["summary"].items():
            self.stdout.write(f"{key}: {value}")

        if result["details"]:
            raise CommandError("Enrollment attendance mismatches detected")
