# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""Auto-map ``LabResultTemplate.result_loinc_code`` values from LOINC data.

Purpose:
- Backfill missing result LOINC mappings for lab result parameters.
- Improve interoperability for downstream exports and standardized reporting.

Primary operations:
- Select templates with empty mappings (or all templates with ``--overwrite``).
- Match parameter names against ``LOINCCode`` using layered heuristics:
  exact long name, exact component, then contains match.
- Write matched LOINC codes to ``result_loinc_code`` unless running dry-run.
- Report matched/unmatched totals at the end of execution.

CLI options:
- ``--dry-run``: preview proposed matches without saving updates.
- ``--overwrite``: include templates that already have ``result_loinc_code``.

Arguments:
- No positional arguments.

Examples:
- ``python manage.py assign_result_loinc``
- ``python manage.py assign_result_loinc --dry-run``
- ``python manage.py assign_result_loinc --overwrite``
- ``python manage.py assign_result_loinc --dry-run --overwrite``
"""

from django.core.management.base import BaseCommand

from hmis.apps.laboratory.models import LabResultTemplate, LOINCCode


class Command(BaseCommand):
    help = "Auto-assign result_loinc_code to LabResultTemplate entries by matching parameter names to LOINC codes"

    def add_arguments(self, parser):
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Preview matches without saving",
        )
        parser.add_argument(
            "--overwrite",
            action="store_true",
            help="Overwrite existing result_loinc_code assignments",
        )

    def handle(self, *args, **options):
        dry_run = options["dry_run"]
        overwrite = options["overwrite"]

        templates = LabResultTemplate.objects.all()
        if not overwrite:
            templates = templates.filter(result_loinc_code="")

        total = templates.count()
        if total == 0:
            self.stdout.write("No templates to process.")
            return

        self.stdout.write(f"Processing {total} templates...")

        matched = 0
        unmatched = 0

        for template in templates:
            # Try exact match on parameter_name against LOINC long_common_name
            loinc = LOINCCode.objects.filter(
                long_common_name__iexact=template.parameter_name
            ).first()

            # Try component match
            if not loinc:
                loinc = LOINCCode.objects.filter(component__iexact=template.parameter_name).first()

            # Try contains match (parameter name within LOINC name)
            if not loinc and len(template.parameter_name) >= 4:
                loinc = LOINCCode.objects.filter(
                    long_common_name__icontains=template.parameter_name
                ).first()

            if loinc:
                matched += 1
                if dry_run:
                    self.stdout.write(
                        f"  ✓ {template.test_code}/{template.parameter_name} → {loinc.code} ({loinc.long_common_name})"
                    )
                else:
                    template.result_loinc_code = loinc.code
                    template.save(update_fields=["result_loinc_code"])
            else:
                unmatched += 1
                if dry_run:
                    self.stdout.write(
                        self.style.WARNING(
                            f"  ✗ {template.test_code}/{template.parameter_name} → no match"
                        )
                    )

        action = "Would assign" if dry_run else "Assigned"
        self.stdout.write(
            self.style.SUCCESS(
                f"\n{action} LOINC codes to {matched}/{total} templates. {unmatched} unmatched."
            )
        )
