from __future__ import annotations

import json

from django.core.management.base import BaseCommand

from hmis.apps.mch.services.clinic_unification_validation import get_unification_metrics


class Command(BaseCommand):
    help = "Emit Stage 0 observability metrics for MCH and clinic flow unification"

    def add_arguments(self, parser):
        parser.add_argument("--json", action="store_true")

    def handle(self, *args, **options):
        metrics = get_unification_metrics()
        if options["json"]:
            self.stdout.write(json.dumps(metrics, indent=2, sort_keys=True))
            return

        self.stdout.write(self.style.SUCCESS("MCH clinic unification metrics"))
        for key, value in metrics.items():
            self.stdout.write(f"{key}: {value}")
