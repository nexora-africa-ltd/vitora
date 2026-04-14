"""
Management command to map Drug records to DHA HPT Registry codes.

Uses the TerminologyService to search the DHA product endpoint by
generic_name, then writes hpt_code (knhts_concept_id), hpt_product_id,
and ppb_code back to the Drug model.
"""

import logging

from django.core.management.base import BaseCommand
from django.utils import timezone

from hmis.apps.billing.services.terminology import TerminologyError, TerminologyService
from hmis.apps.pharmacy.models import Drug

logger = logging.getLogger(__name__)


class Command(BaseCommand):
    help = "Map Drug records to DHA HPT Registry codes via the Terminology API."

    def add_arguments(self, parser):
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Preview mappings without writing to database.",
        )
        parser.add_argument(
            "--force",
            action="store_true",
            help="Re-map drugs that already have an hpt_code.",
        )
        parser.add_argument(
            "--drug-id",
            type=int,
            help="Map a specific drug by its primary key.",
        )

    def handle(self, *args, **options):
        dry_run = options["dry_run"]
        force = options["force"]
        drug_id = options.get("drug_id")

        service = TerminologyService()
        drugs = Drug.objects.filter(is_active=True)

        if drug_id:
            drugs = drugs.filter(pk=drug_id)
        elif not force:
            drugs = drugs.filter(hpt_code="")

        total = drugs.count()
        if total == 0:
            self.stdout.write(self.style.SUCCESS("No drugs to map."))
            return

        self.stdout.write(f"Processing {total} drug(s)...")
        if dry_run:
            self.stdout.write(self.style.WARNING("DRY RUN — no changes will be saved."))

        mapped = 0
        ambiguous = 0
        failed = 0
        no_match = 0

        for drug in drugs.iterator():
            try:
                results = service.search_drug_products(drug.generic_name)
            except TerminologyError as e:
                self.stdout.write(self.style.ERROR(f"  API error for '{drug.generic_name}': {e}"))
                failed += 1
                continue

            if not results:
                self.stdout.write(f"  No HPT match: {drug.generic_name}")
                no_match += 1
                continue

            if len(results) == 1:
                product = results[0]
                self.stdout.write(
                    self.style.SUCCESS(
                        f"  Mapped: {drug.generic_name} → "
                        f"{product.knhts_concept_id} (product_id={product.product_id})"
                    )
                )
                if not dry_run:
                    drug.hpt_code = product.knhts_concept_id
                    drug.hpt_product_id = product.product_id
                    drug.ppb_code = product.ppb_registration_code
                    drug.hpt_last_synced = timezone.now()
                    drug.save(
                        update_fields=[
                            "hpt_code",
                            "hpt_product_id",
                            "ppb_code",
                            "hpt_last_synced",
                        ]
                    )
                mapped += 1
            else:
                codes = [f"{r.knhts_concept_id} ({r.brand_name})" for r in results[:5]]
                self.stdout.write(
                    self.style.WARNING(
                        f"  Ambiguous: {drug.generic_name} → "
                        f"{len(results)} matches: {', '.join(codes)}"
                    )
                )
                ambiguous += 1

        self.stdout.write("\n--- Summary ---")
        self.stdout.write(f"  Total processed: {total}")
        self.stdout.write(self.style.SUCCESS(f"  Mapped: {mapped}"))
        self.stdout.write(self.style.WARNING(f"  Ambiguous: {ambiguous}"))
        self.stdout.write(f"  No match: {no_match}")
        self.stdout.write(self.style.ERROR(f"  API errors: {failed}"))
        if dry_run:
            self.stdout.write(self.style.WARNING("DRY RUN — no changes were saved."))
