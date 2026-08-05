"""Backfill payer_slade_code for known providers."""

from django.core.management.base import BaseCommand

from hmis.apps.insurance.models import InsuranceProviderConfig
from hmis.apps.insurance.payer_mappings import infer_healthcloud_payer_slade_code


class Command(BaseCommand):
    help = "Backfill HealthCloud payer_slade_code using known provider-name mappings"

    def add_arguments(self, parser):
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Show updates without persisting.",
        )

    def handle(self, *args, **options):
        dry_run = options["dry_run"]
        updated = 0

        qs = InsuranceProviderConfig.objects.select_related("provider", "facility").all()
        for cfg in qs:
            if cfg.payer_slade_code is not None:
                continue
            inferred = infer_healthcloud_payer_slade_code(cfg.provider)
            if inferred is None:
                continue

            if dry_run:
                self.stdout.write(
                    f"[DRY RUN] facility={cfg.facility_id} provider='{cfg.provider.name}' -> payer_slade_code={inferred}"
                )
            else:
                cfg.payer_slade_code = inferred
                cfg.save(update_fields=["payer_slade_code", "updated_at"])
                self.stdout.write(
                    self.style.SUCCESS(
                        f"Updated facility={cfg.facility_id} provider='{cfg.provider.name}' -> payer_slade_code={inferred}"
                    )
                )
            updated += 1

        self.stdout.write(self.style.SUCCESS(f"Done. Matched configs: {updated}"))
