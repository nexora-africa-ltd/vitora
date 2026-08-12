# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""Backfill Django user group membership from StaffProfile.primary_role."""

from django.core.management.base import BaseCommand

from hmis.apps.core.models import Role, StaffProfile
from hmis.apps.core.role_permissions_sync import ensure_role_django_group


class Command(BaseCommand):
    help = (
        "Ensure each staff user's Django groups include the group linked to their "
        "StaffProfile.primary_role."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Show planned changes without writing to DB.",
        )
        parser.add_argument(
            "--strict",
            action="store_true",
            help=(
                "Remove all role-linked groups before adding the primary-role group. "
                "Use with care if users intentionally hold multiple role groups."
            ),
        )

    def handle(self, *args, **options):
        dry_run = options["dry_run"]
        strict = options["strict"]

        if dry_run:
            self.stdout.write(self.style.WARNING("DRY RUN - no changes will be made"))

        role_group_ids = set(
            Role.objects.exclude(django_group__isnull=True).values_list(
                "django_group_id", flat=True
            )
        )

        profiles = StaffProfile.objects.select_related("user", "primary_role").all()
        total = profiles.count()
        changed = 0

        for profile in profiles:
            if not profile.user_id or not profile.primary_role_id:
                continue

            target_group = ensure_role_django_group(profile.primary_role)
            current_ids = set(profile.user.groups.values_list("id", flat=True))
            next_ids = set(current_ids)

            if strict:
                next_ids -= role_group_ids
            next_ids.add(target_group.id)

            if next_ids == current_ids:
                continue

            changed += 1
            username = profile.user.username
            if dry_run:
                self.stdout.write(
                    f"Would update user={username}: groups {sorted(current_ids)} -> {sorted(next_ids)}"
                )
            else:
                profile.user.groups.set(next_ids)
                self.stdout.write(
                    self.style.SUCCESS(
                        f"Updated user={username}: groups {sorted(current_ids)} -> {sorted(next_ids)}"
                    )
                )

        summary = f"Processed {total} staff profiles. Updated {changed} user group memberships."
        if dry_run:
            self.stdout.write(self.style.WARNING(summary))
        else:
            self.stdout.write(self.style.SUCCESS(summary))
