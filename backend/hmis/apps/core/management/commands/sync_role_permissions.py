"""
Management command to sync Role permissions_matrix to Django Group permissions.

This bridges the custom RBAC permissions_matrix with Django's built-in permission system.
"""

from django.core.management.base import BaseCommand

from hmis.apps.core.models import Role
from hmis.apps.core.role_permissions_sync import (
    ACTION_MAPPING,
    CUSTOM_ACTIONS,
    MODEL_MAPPING,
    MODEL_SUFFIXED_ACTIONS,
    sync_role_group_permissions,
)

# Re-export constants so any code that imports from this module still works.
__all__ = [
    "MODEL_MAPPING",
    "ACTION_MAPPING",
    "CUSTOM_ACTIONS",
    "MODEL_SUFFIXED_ACTIONS",
]


class Command(BaseCommand):
    """Sync Role permissions_matrix to Django Group permissions."""

    help = "Sync Role permissions_matrix to linked Django Groups"

    def add_arguments(self, parser):
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Show what would be done without making changes",
        )

    def handle(self, *args, **options):
        dry_run = options["dry_run"]

        if dry_run:
            self.stdout.write(self.style.WARNING("DRY RUN - No changes will be made"))

        roles = Role.objects.filter(django_group__isnull=False).select_related("django_group")

        for role in roles:
            self.stdout.write(f"\nProcessing role: {role.name}")

            if not role.permissions_matrix:
                self.stdout.write(self.style.WARNING("  No permissions_matrix defined"))
                continue

            if dry_run:
                self.stdout.write(f"  Would sync permissions for group \"{role.django_group.name}\"")
            else:
                count = sync_role_group_permissions(role)
                self.stdout.write(
                    self.style.SUCCESS(
                        f'  Synced {count} permissions to group "{role.django_group.name}"'
                    )
                )

        self.stdout.write(self.style.SUCCESS("\nDone!"))
