"""
Management command to load default RBAC roles for Vitora HMIS.

Sprint 1.1-1.2 Track C: RBAC Foundation - Phase 3

This command loads roles from the fixture file (roles.json) instead of
hardcoding them, ensuring a single source of truth.
"""

import json
from pathlib import Path

from django.contrib.auth.models import Group
from django.core.management.base import BaseCommand
from django.db import transaction

from hmis.apps.core.models import Role


class Command(BaseCommand):
    """Load default RBAC roles from fixture file."""

    help = "Load default RBAC roles from fixture file for Kenya hospital setup"

    def add_arguments(self, parser):
        """Add command arguments."""
        parser.add_argument(
            "--update",
            action="store_true",
            help="Update existing roles with values from fixture",
        )
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Show what would be created without actually creating",
        )
        parser.add_argument(
            "--verbose",
            action="store_true",
            help="Show detailed progress information",
        )
        parser.add_argument(
            "--fixture",
            type=str,
            default=None,
            help="Path to custom fixture file (default: core/fixtures/roles.json)",
        )

    def handle(self, *args, **options):
        """Execute the command."""
        update = options["update"]
        dry_run = options["dry_run"]
        verbose = options["verbose"]
        fixture_path = options["fixture"]

        # Load roles from fixture file
        try:
            roles_data, groups_data = self._load_fixture(fixture_path)
        except FileNotFoundError as e:
            self.stdout.write(self.style.ERROR(str(e)))
            return
        except json.JSONDecodeError as e:
            self.stdout.write(self.style.ERROR(f"Invalid JSON in fixture file: {e}"))
            return

        if dry_run:
            self.stdout.write(self.style.WARNING("DRY RUN MODE - No changes will be made"))

        # First, create Django groups
        groups_created = 0
        groups_map = {}  # pk -> Group instance

        self.stdout.write(self.style.MIGRATE_HEADING("Processing Django Groups..."))

        for group_data in groups_data:
            pk = group_data["pk"]
            name = group_data["fields"]["name"]

            if dry_run:
                if verbose:
                    self.stdout.write(f"  Would create/get group: {name}")
                groups_created += 1
            else:
                group, created = Group.objects.get_or_create(name=name)
                groups_map[pk] = group
                if created:
                    groups_created += 1
                    if verbose:
                        self.stdout.write(f"  Created group: {name}")
                elif verbose:
                    self.stdout.write(f"  Found existing group: {name}")

        # Now create/update roles
        created_count = 0
        updated_count = 0
        skipped_count = 0

        self.stdout.write(self.style.MIGRATE_HEADING("Processing Roles..."))

        for role_data in roles_data:
            fields = role_data["fields"]
            code = fields["code"]

            try:
                with transaction.atomic():
                    existing_role = Role.objects.filter(code=code).first()

                    if existing_role:
                        if update and not dry_run:
                            # Update existing role
                            self._update_role(existing_role, fields, groups_map)
                            updated_count += 1
                            if verbose:
                                self.stdout.write(f"  Updated role: {code} - {existing_role.name}")
                        else:
                            skipped_count += 1
                            if verbose:
                                self.stdout.write(f"  Skipped existing role: {code}")
                    else:
                        if dry_run:
                            self.stdout.write(f"  Would create role: {code} - {fields['name']}")
                            created_count += 1
                        else:
                            # Create new role
                            role = self._create_role(fields, groups_map)
                            created_count += 1
                            if verbose:
                                self.stdout.write(f"  Created role: {code} - {role.name}")

            except Exception as e:
                self.stdout.write(self.style.ERROR(f"Error processing role {code}: {str(e)}"))

        # Summary
        self.stdout.write("")
        if dry_run:
            self.stdout.write(
                self.style.SUCCESS(
                    f"Dry run complete. Would create {groups_created} groups and {created_count} roles."
                )
            )
        else:
            self.stdout.write(self.style.SUCCESS("Successfully loaded default roles:"))
            if groups_created > 0:
                self.stdout.write(f"  Groups created: {groups_created}")
            if created_count > 0:
                self.stdout.write(f"  Roles created: {created_count}")
            if updated_count > 0:
                self.stdout.write(f"  Roles updated: {updated_count}")
            if skipped_count > 0:
                self.stdout.write(f"  Roles skipped: {skipped_count}")

    def _load_fixture(self, custom_path=None):
        """
        Load roles and groups from fixture file.

        Returns:
            tuple: (roles_data, groups_data) - lists of role and group definitions
        """
        if custom_path:
            fixture_path = Path(custom_path)
        else:
            # Default fixture path
            fixture_path = Path(__file__).resolve().parent.parent.parent / "fixtures" / "roles.json"

        if not fixture_path.exists():
            raise FileNotFoundError(
                f"Fixture file not found: {fixture_path}\n"
                f"Expected at: hmis/apps/core/fixtures/roles.json"
            )

        self.stdout.write(f"Loading fixture from: {fixture_path}")

        with open(fixture_path) as f:
            data = json.load(f)

        # Separate groups and roles
        groups_data = [item for item in data if item["model"] == "auth.group"]
        roles_data = [item for item in data if item["model"] == "core.role"]

        self.stdout.write(f"Found {len(groups_data)} groups and {len(roles_data)} roles in fixture")

        return roles_data, groups_data

    def _create_role(self, fields, groups_map):
        """Create a new role from fixture fields."""
        # Get the Django group if referenced
        django_group = None
        if fields.get("django_group"):
            django_group = groups_map.get(fields["django_group"])
            if not django_group:
                # Fallback: create group with role name
                django_group, _ = Group.objects.get_or_create(name=fields["name"])

        # Get parent role if referenced
        parent_role = None
        if fields.get("parent_role"):
            parent_role = Role.objects.filter(pk=fields["parent_role"]).first()

        role = Role.objects.create(
            code=fields["code"],
            name=fields["name"],
            category=fields.get("category", "CLINICAL"),
            description=fields.get("description", ""),
            permissions_matrix=fields.get("permissions_matrix", {}),
            hierarchy_level=fields.get("hierarchy_level", 5),
            parent_role=parent_role,
            django_group=django_group,
            requires_license=fields.get("requires_license", False),
            license_body=fields.get("license_body", ""),
            is_active=fields.get("is_active", True),
        )

        return role

    def _update_role(self, role, fields, groups_map):
        """Update an existing role from fixture fields."""
        # Update basic fields
        role.name = fields.get("name", role.name)
        role.category = fields.get("category", role.category)
        role.description = fields.get("description", role.description)
        role.hierarchy_level = fields.get("hierarchy_level", role.hierarchy_level)
        role.requires_license = fields.get("requires_license", role.requires_license)
        role.license_body = fields.get("license_body", role.license_body)
        role.is_active = fields.get("is_active", role.is_active)

        # Merge permissions matrix (keep custom, update from fixture)
        if fields.get("permissions_matrix"):
            existing_perms = role.permissions_matrix.copy() if role.permissions_matrix else {}
            for resource, actions in fields["permissions_matrix"].items():
                existing_perms[resource] = actions
            role.permissions_matrix = existing_perms

        # Update Django group reference
        if fields.get("django_group") and fields["django_group"] in groups_map:
            role.django_group = groups_map[fields["django_group"]]

        # Update parent role
        if fields.get("parent_role"):
            role.parent_role = Role.objects.filter(pk=fields["parent_role"]).first()

        role.save()
