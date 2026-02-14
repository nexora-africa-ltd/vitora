"""
Management command to generate beds for wards.

This command creates missing bed records for wards that have capacity
but fewer bed records than their capacity allows.

Usage:
    # Generate beds for all wards with missing beds
    python manage.py generate_ward_beds

    # Generate beds for a specific ward by code
    python manage.py generate_ward_beds --ward MED-01

    # Dry run to see what would be created
    python manage.py generate_ward_beds --dry-run
"""

from django.core.management.base import BaseCommand, CommandError

from hmis.apps.inpatient.models import Ward


class Command(BaseCommand):
    """Generate bed records for wards with capacity but missing beds."""

    help = "Generate bed records for wards that have capacity but missing bed records"

    def add_arguments(self, parser):
        """Add command arguments."""
        parser.add_argument(
            "--ward",
            type=str,
            help="Ward code to generate beds for (e.g., MED-01). If not provided, all wards are processed.",
        )
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Show what would be created without actually creating beds",
        )

    def handle(self, *args, **options):
        """Execute the command."""
        ward_code = options.get("ward")
        dry_run = options.get("dry_run", False)

        if ward_code:
            # Process single ward
            try:
                ward = Ward.objects.get(code=ward_code)
                wards = [ward]
            except Ward.DoesNotExist:
                raise CommandError(f"Ward with code '{ward_code}' not found")
        else:
            # Process all active wards
            wards = Ward.objects.filter(is_active=True)

        total_created = 0
        wards_processed = 0

        for ward in wards:
            existing_beds = ward.beds.count()
            beds_needed = ward.capacity - existing_beds

            if beds_needed > 0:
                wards_processed += 1

                if dry_run:
                    self.stdout.write(
                        f"  {ward.code}: Would create {beds_needed} beds "
                        f"(current: {existing_beds}, capacity: {ward.capacity})"
                    )
                else:
                    created = ward.generate_missing_beds()
                    total_created += created
                    self.stdout.write(
                        self.style.SUCCESS(
                            f"  {ward.code}: Created {created} beds "
                            f"(now: {ward.beds.count()}/{ward.capacity})"
                        )
                    )

        if dry_run:
            self.stdout.write(
                self.style.WARNING(
                    f"\nDry run complete. {wards_processed} ward(s) would have beds created."
                )
            )
        else:
            self.stdout.write(
                self.style.SUCCESS(
                    f"\nDone! Created {total_created} bed(s) across {wards_processed} ward(s)."
                )
            )
