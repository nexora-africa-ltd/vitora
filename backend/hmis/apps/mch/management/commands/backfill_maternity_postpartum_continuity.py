from __future__ import annotations

from datetime import date

from django.core.management.base import BaseCommand, CommandError

from hmis.apps.mch.services.postpartum_continuity_backfill import (
    backfill_maternity_postpartum_continuity,
    write_report_file,
)


class Command(BaseCommand):
    help = "Backfill postpartum continuity workflow fields for existing maternity discharges"

    def add_arguments(self, parser):
        parser.add_argument("--dry-run", action="store_true")
        parser.add_argument("--from-date")
        parser.add_argument("--to-date")
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

        summary = backfill_maternity_postpartum_continuity(
            dry_run=options["dry_run"],
            from_date=from_date,
            to_date=to_date,
            limit=options.get("limit"),
            batch_size=options["batch_size"],
            start_after_id=options.get("start_after_id"),
        )

        if options["dry_run"]:
            self.stdout.write(self.style.WARNING("Dry run: no database changes were committed."))

        self.stdout.write(self.style.SUCCESS("Maternity postpartum continuity backfill summary"))
        self.stdout.write(f"Processed: {summary.processed}")
        self.stdout.write(f"Discharges updated: {summary.discharges_updated}")
        self.stdout.write(f"Kardex updated: {summary.kardex_updated}")
        self.stdout.write(f"Ward rounds updated: {summary.ward_rounds_updated}")
        self.stdout.write(f"Skipped: {summary.skipped}")
        self.stdout.write(f"Errors: {summary.errors}")

        if options.get("report_file"):
            path = write_report_file(options["report_file"], summary.to_dict())
            self.stdout.write(self.style.SUCCESS(f"Report written to {path}"))

        if summary.errors:
            raise CommandError("Backfill completed with errors")
