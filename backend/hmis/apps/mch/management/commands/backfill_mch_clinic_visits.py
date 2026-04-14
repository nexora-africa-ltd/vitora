from __future__ import annotations

from datetime import date

from django.core.management.base import BaseCommand, CommandError

from hmis.apps.mch.services.clinic_unification_backfill import (
    backfill_mch_clinic_visits,
    write_report_file,
)


class Command(BaseCommand):
    help = "Backfill ANC/PNC visits with linked clinic visits"

    def add_arguments(self, parser):
        parser.add_argument("--module", choices=["anc", "pnc"], required=True)
        parser.add_argument("--dry-run", action="store_true")
        parser.add_argument("--from-date")
        parser.add_argument("--to-date")
        parser.add_argument("--clinic-id", type=int)
        parser.add_argument("--limit", type=int)
        parser.add_argument("--batch-size", type=int, default=100)
        parser.add_argument("--start-after-id", type=int)
        parser.add_argument("--report-file")

    def handle(self, *args, **options):
        try:
            from_date = (
                date.fromisoformat(options["from_date"]) if options.get("from_date") else None
            )
            to_date = date.fromisoformat(options["to_date"]) if options.get("to_date") else None
        except ValueError as exc:  # pragma: no cover - CLI parsing branch
            raise CommandError(str(exc)) from exc

        summary = backfill_mch_clinic_visits(
            module=options["module"],
            dry_run=options["dry_run"],
            from_date=from_date,
            to_date=to_date,
            clinic_id=options.get("clinic_id"),
            limit=options.get("limit"),
            batch_size=options["batch_size"],
            start_after_id=options.get("start_after_id"),
        )

        self.stdout.write(self.style.SUCCESS(f"Backfill summary for {summary.module.upper()}"))
        self.stdout.write(f"Processed: {summary.processed}")
        self.stdout.write(f"Linked existing: {summary.linked_existing}")
        self.stdout.write(f"Created synthetic: {summary.created_synthetic}")
        self.stdout.write(f"Skipped: {summary.skipped}")
        self.stdout.write(f"Errors: {summary.errors}")

        if options.get("report_file"):
            path = write_report_file(options["report_file"], summary.to_dict()["records"])
            self.stdout.write(self.style.SUCCESS(f"Report written to {path}"))

        if summary.errors:
            raise CommandError("Backfill completed with errors")
