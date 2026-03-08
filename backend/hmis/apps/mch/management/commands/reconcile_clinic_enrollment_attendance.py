from __future__ import annotations

from django.core.management.base import BaseCommand

from hmis.apps.mch.services.clinic_unification_backfill import (
    reconcile_anc_enrollment_attendance,
    write_report_file,
)


class Command(BaseCommand):
    help = "Recompute ANC enrollment attendance totals from canonical clinic visits"

    def add_arguments(self, parser):
        parser.add_argument("--dry-run", action="store_true")
        parser.add_argument("--clinic-id", type=int)
        parser.add_argument("--limit", type=int)
        parser.add_argument("--report-file")

    def handle(self, *args, **options):
        records = reconcile_anc_enrollment_attendance(
            dry_run=options["dry_run"],
            clinic_id=options.get("clinic_id"),
            limit=options.get("limit"),
        )
        changed = [record for record in records if record.changed]

        self.stdout.write(self.style.SUCCESS("ANC enrollment reconciliation summary"))
        self.stdout.write(f"Checked: {len(records)}")
        self.stdout.write(f"Changed: {len(changed)}")
        self.stdout.write(f"Dry run: {'yes' if options['dry_run'] else 'no'}")

        if options.get("report_file"):
            path = write_report_file(
                options["report_file"],
                [record.__dict__ for record in records],
            )
            self.stdout.write(self.style.SUCCESS(f"Report written to {path}"))
