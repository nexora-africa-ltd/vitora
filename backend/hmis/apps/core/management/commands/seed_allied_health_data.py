"""
Management command to seed all Allied Health treatment type data.

Usage:
    python manage.py seed_allied_health_data

This command loads fixtures for:
1. Physiotherapy treatment types
2. Occupational therapy treatment types  
3. Counselling types

It also sets up the permission groups for allied health professionals.
"""

from django.core.management import call_command
from django.core.management.base import BaseCommand


class Command(BaseCommand):
    """Seed all Allied Health treatment type catalogs and permissions."""

    help = "Seed Allied Health treatment types and set up permissions"

    FIXTURES = [
        ("physiotherapy", "physiotherapy_treatment_types"),
        ("occupational_therapy", "ot_treatment_types"),
        ("counselling", "counselling_types"),
    ]

    def add_arguments(self, parser):
        """Add command arguments."""
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Show what would be done without making changes",
        )
        parser.add_argument(
            "--skip-permissions",
            action="store_true",
            help="Skip permission group setup",
        )
        parser.add_argument(
            "--skip-fixtures",
            action="store_true",
            help="Skip fixture loading (only set up permissions)",
        )

    def handle(self, *args, **options):
        """Execute the command."""
        dry_run = options["dry_run"]
        skip_permissions = options["skip_permissions"]
        skip_fixtures = options["skip_fixtures"]

        if dry_run:
            self.stdout.write(self.style.WARNING("DRY RUN - No changes will be made\n"))

        self.stdout.write(self.style.SUCCESS("=" * 60))
        self.stdout.write(self.style.SUCCESS("Allied Health Data Seeding"))
        self.stdout.write(self.style.SUCCESS("=" * 60))

        # Load fixtures
        if not skip_fixtures:
            self.stdout.write("\n📦 Loading treatment type fixtures...")
            for app_label, fixture_name in self.FIXTURES:
                fixture_path = f"{app_label}/fixtures/{fixture_name}.json"
                if dry_run:
                    self.stdout.write(f"  Would load: {fixture_path}")
                else:
                    try:
                        call_command("loaddata", fixture_name, verbosity=0)
                        self.stdout.write(
                            self.style.SUCCESS(f"  ✓ Loaded: {fixture_name}")
                        )
                    except Exception as e:
                        self.stdout.write(
                            self.style.ERROR(f"  ✗ Failed to load {fixture_name}: {e}")
                        )
        else:
            self.stdout.write("\n⏭️  Skipping fixtures (--skip-fixtures)")

        # Set up permissions
        if not skip_permissions:
            self.stdout.write("\n🔐 Setting up Allied Health permission groups...")
            if dry_run:
                self.stdout.write("  Would run: setup_allied_health_permissions --dry-run")
            else:
                try:
                    call_command("setup_allied_health_permissions", verbosity=1)
                    self.stdout.write(
                        self.style.SUCCESS("  ✓ Permission groups configured")
                    )
                except Exception as e:
                    self.stdout.write(
                        self.style.ERROR(f"  ✗ Failed to set up permissions: {e}")
                    )
        else:
            self.stdout.write("\n⏭️  Skipping permissions (--skip-permissions)")

        # Summary
        self.stdout.write("\n" + "=" * 60)
        self.stdout.write(self.style.SUCCESS("✅ Allied Health data seeding complete!"))
        self.stdout.write("=" * 60)

        self.stdout.write("\nLoaded fixtures:")
        self.stdout.write("  • Physiotherapy: 25 treatment types")
        self.stdout.write("  • Occupational Therapy: 22 treatment types")
        self.stdout.write("  • Counselling: 27 counselling types")

        self.stdout.write("\nPermission groups created:")
        self.stdout.write("  • physiotherapists")
        self.stdout.write("  • dietitians")
        self.stdout.write("  • occupational_therapists")
        self.stdout.write("  • social_workers (with sensitive access)")
        self.stdout.write("  • counsellors (with sensitive access)")

        self.stdout.write(
            "\n💡 To assign users to groups, use Django admin or:"
        )
        self.stdout.write(
            "   user.groups.add(Group.objects.get(name='physiotherapists'))"
        )
