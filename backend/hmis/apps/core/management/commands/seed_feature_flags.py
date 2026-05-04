"""
Seed Feature Flags — creates or updates the canonical set of feature flags.

Idempotent: uses get_or_create so it can be re-run safely in any environment.

Usage:
    python manage.py seed_feature_flags
    python manage.py seed_feature_flags --enable-all   # enable all flags (for demo/staging)
"""

from django.core.management.base import BaseCommand

# Canonical set of DB-based feature flags.
# default_enabled: whether the flag should be enabled by default on first creation.
FEATURE_FLAGS = [
    {
        "name": "smart_autopopulate",
        "description": (
            "Enable AI/CDS smart autopopulation: suggests auto-fill values for "
            "clinical fields using TibaBot CDS engine. Requires user confirmation."
        ),
        "default_enabled": False,
    },
    {
        "name": "MCH_LINK_CLINIC_VISITS",
        "description": (
            "Auto-link MCH ANC/PNC visits to canonical clinic visits. "
            "When enabled, creating an MCH visit also creates a corresponding ClinicVisit record."
        ),
        "default_enabled": False,
    },
    {
        "name": "MCH_DERIVE_ENROLLMENT_FROM_CLINIC_VISITS",
        "description": (
            "Derive MCH program enrollment counts from clinic visit records. "
            "When enabled, enrollment status is computed from existing visits rather than explicit registration."
        ),
        "default_enabled": False,
    },
]


class Command(BaseCommand):
    help = "Seed the canonical set of feature flags (idempotent)"

    def add_arguments(self, parser):
        parser.add_argument(
            "--enable-all",
            action="store_true",
            help="Enable all feature flags (useful for demo/staging environments)",
        )

    def handle(self, *args, **options):
        from hmis.apps.core.models import FeatureFlag

        enable_all = options["enable_all"]
        created_count = 0
        updated_count = 0

        for flag_def in FEATURE_FLAGS:
            is_enabled = enable_all or flag_def["default_enabled"]

            obj, created = FeatureFlag.objects.get_or_create(
                name=flag_def["name"],
                defaults={
                    "description": flag_def["description"],
                    "is_enabled": is_enabled,
                },
            )

            if created:
                created_count += 1
                self.stdout.write(
                    self.style.SUCCESS(f"  Created: {obj.name} (enabled={obj.is_enabled})")
                )
            else:
                # Update description if changed, but don't override is_enabled
                # (admin may have toggled it manually)
                changes = []
                if obj.description != flag_def["description"]:
                    obj.description = flag_def["description"]
                    changes.append("description")

                if enable_all and not obj.is_enabled:
                    obj.is_enabled = True
                    changes.append("is_enabled")

                if changes:
                    obj.save(update_fields=changes + ["updated_at"])
                    updated_count += 1
                    self.stdout.write(
                        self.style.WARNING(f"  Updated: {obj.name} (fields: {', '.join(changes)})")
                    )
                else:
                    self.stdout.write(f"  Exists:  {obj.name} (enabled={obj.is_enabled})")

        self.stdout.write(
            self.style.SUCCESS(
                f"\nDone. Created: {created_count}, Updated: {updated_count}, "
                f"Total flags: {len(FEATURE_FLAGS)}"
            )
        )
