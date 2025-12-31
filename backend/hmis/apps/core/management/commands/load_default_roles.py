"""
Management command to load default RBAC roles for Vitora HMIS.

Sprint 1.1-1.2 Track C: RBAC Foundation - Phase 3
"""

from django.contrib.auth.models import Group
from django.core.management.base import BaseCommand
from django.db import transaction

from hmis.apps.core.models import Role


class Command(BaseCommand):
    """Load default RBAC roles with permission matrices."""

    help = "Load default RBAC roles for Kenya hospital setup"

    def add_arguments(self, parser):
        """Add command arguments."""
        parser.add_argument(
            "--update",
            action="store_true",
            help="Update existing roles with default values",
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

    def handle(self, *args, **options):
        """Execute the command."""
        update = options["update"]
        dry_run = options["dry_run"]
        verbose = options["verbose"]

        # Default roles configuration
        default_roles = self._get_default_roles()

        if dry_run:
            self.stdout.write(
                self.style.WARNING("DRY RUN MODE - No changes will be made")
            )

        created_count = 0
        updated_count = 0
        skipped_count = 0

        for role_data in default_roles:
            code = role_data["code"]

            try:
                with transaction.atomic():
                    existing_role = Role.objects.filter(code=code).first()

                    if existing_role:
                        if update and not dry_run:
                            # Update existing role
                            # For permissions_matrix, merge instead of replace
                            existing_perms = existing_role.permissions_matrix.copy()
                            
                            for key, value in role_data.items():
                                if key != "code":  # Don't update code
                                    if key == "permissions_matrix":
                                        # Merge permissions - keep custom ones, update default ones
                                        for resource, actions in value.items():
                                            existing_perms[resource] = actions
                                        setattr(existing_role, key, existing_perms)
                                    else:
                                        setattr(existing_role, key, value)
                            existing_role.save()

                            # Ensure Django group exists
                            self._ensure_django_group(existing_role)

                            updated_count += 1
                            if verbose:
                                self.stdout.write(
                                    f"  Updated role: {code} - {existing_role.name}"
                                )
                        else:
                            skipped_count += 1
                            if verbose:
                                self.stdout.write(
                                    f"  Skipped existing role: {code}"
                                )
                    else:
                        if dry_run:
                            self.stdout.write(
                                f"  Would create role: {code} - {role_data['name']}"
                            )
                            created_count += 1
                        else:
                            # Create new role
                            role = Role.objects.create(**role_data)

                            # Create linked Django group
                            self._ensure_django_group(role)

                            created_count += 1
                            if verbose:
                                self.stdout.write(
                                    f"  Created role: {code} - {role.name}"
                                )

            except Exception as e:
                self.stdout.write(
                    self.style.ERROR(
                        f"Error processing role {code}: {str(e)}"
                    )
                )

        # Summary
        if dry_run:
            self.stdout.write(
                self.style.SUCCESS(
                    f"\nDry run complete. Would create {created_count} roles."
                )
            )
        else:
            self.stdout.write(
                self.style.SUCCESS(
                    f"\nSuccessfully loaded default roles:"
                )
            )
            if created_count > 0:
                self.stdout.write(f"  Created: {created_count}")
            if updated_count > 0:
                self.stdout.write(f"  Updated: {updated_count}")
            if skipped_count > 0:
                self.stdout.write(f"  Skipped: {skipped_count}")

    def _ensure_django_group(self, role):
        """Ensure Django Group exists for role."""
        if not role.django_group:
            group, created = Group.objects.get_or_create(name=role.name)
            role.django_group = group
            role.save()

    def _get_default_roles(self):
        """Get default roles configuration."""
        return [
            {
                "code": "ADMIN",
                "name": "System Administrator",
                "category": "ADMINISTRATIVE",
                "hierarchy_level": 0,
                "requires_license": False,
                "permissions_matrix": {
                    "Patient": {
                        "create": True,
                        "read": True,
                        "update": True,
                        "delete": True,
                        "view_sensitive": True,
                    },
                    "Encounter": {
                        "create": True,
                        "read": True,
                        "update": True,
                        "delete": True,
                    },
                    "StaffProfile": {
                        "create": True,
                        "read": True,
                        "update": True,
                        "delete": True,
                    },
                    "Role": {
                        "create": True,
                        "read": True,
                        "update": True,
                        "delete": True,
                    },
                    "Department": {
                        "create": True,
                        "read": True,
                        "update": True,
                        "delete": True,
                    },
                    "AuditLog": {
                        "create": False,
                        "read": True,
                        "update": False,
                        "delete": False,
                    },
                },
            },
            {
                "code": "DOCTOR",
                "name": "Medical Doctor",
                "category": "CLINICAL",
                "hierarchy_level": 2,
                "requires_license": True,
                "license_body": "KMPDB",
                "permissions_matrix": {
                    "Patient": {
                        "create": True,
                        "read": True,
                        "update": True,
                        "delete": False,
                        "view_sensitive": True,
                    },
                    "Encounter": {
                        "create": True,
                        "read": True,
                        "update": True,
                        "delete": False,
                    },
                    "LabOrder": {
                        "create": True,
                        "read": True,
                        "update": True,
                        "delete": False,
                    },
                    "Prescription": {
                        "create": True,
                        "read": True,
                        "update": True,
                        "delete": False,
                    },
                },
            },
            {
                "code": "NURSE",
                "name": "Registered Nurse",
                "category": "CLINICAL",
                "hierarchy_level": 3,
                "requires_license": True,
                "license_body": "NCK",
                "permissions_matrix": {
                    "Patient": {
                        "create": True,
                        "read": True,
                        "update": True,
                        "delete": False,
                        "view_sensitive": False,
                    },
                    "Encounter": {
                        "create": True,
                        "read": True,
                        "update": True,
                        "delete": False,
                    },
                    "LabOrder": {
                        "create": False,
                        "read": True,
                        "update": False,
                        "delete": False,
                    },
                },
            },
            {
                "code": "CLINICAL_OFFICER",
                "name": "Clinical Officer",
                "category": "CLINICAL",
                "hierarchy_level": 3,
                "requires_license": True,
                "license_body": "KMPDB",
                "permissions_matrix": {
                    "Patient": {
                        "create": True,
                        "read": True,
                        "update": True,
                        "delete": False,
                        "view_sensitive": True,
                    },
                    "Encounter": {
                        "create": True,
                        "read": True,
                        "update": True,
                        "delete": False,
                    },
                    "LabOrder": {
                        "create": True,
                        "read": True,
                        "update": False,
                        "delete": False,
                    },
                },
            },
            {
                "code": "LAB_TECH",
                "name": "Laboratory Technician",
                "category": "TECHNICAL",
                "hierarchy_level": 4,
                "requires_license": True,
                "license_body": "KMLTTB",
                "permissions_matrix": {
                    "Patient": {
                        "create": False,
                        "read": True,
                        "update": False,
                        "delete": False,
                        "view_sensitive": False,
                    },
                    "LabOrder": {
                        "create": False,
                        "read": True,
                        "update": False,
                        "delete": False,
                    },
                    "LabResult": {
                        "create": True,
                        "read": True,
                        "update": True,
                        "delete": False,
                    },
                },
            },
            {
                "code": "PHARMACIST",
                "name": "Pharmacist",
                "category": "TECHNICAL",
                "hierarchy_level": 4,
                "requires_license": True,
                "license_body": "PPB",
                "permissions_matrix": {
                    "Patient": {
                        "create": False,
                        "read": True,
                        "update": False,
                        "delete": False,
                        "view_sensitive": False,
                    },
                    "Prescription": {
                        "create": False,
                        "read": True,
                        "update": True,
                        "delete": False,
                    },
                    "DrugDispensing": {
                        "create": True,
                        "read": True,
                        "update": True,
                        "delete": False,
                    },
                    "PharmacyInventory": {
                        "create": True,
                        "read": True,
                        "update": True,
                        "delete": True,
                    },
                },
            },
            {
                "code": "RECEPTIONIST",
                "name": "Receptionist",
                "category": "ADMINISTRATIVE",
                "hierarchy_level": 5,
                "requires_license": False,
                "permissions_matrix": {
                    "Patient": {
                        "create": True,
                        "read": True,
                        "update": True,
                        "delete": False,
                        "view_sensitive": False,
                    },
                    "Encounter": {
                        "create": False,
                        "read": True,
                        "update": False,
                        "delete": False,
                    },
                },
            },
            {
                "code": "RECORDS_CLERK",
                "name": "Medical Records Clerk",
                "category": "ADMINISTRATIVE",
                "hierarchy_level": 5,
                "requires_license": False,
                "permissions_matrix": {
                    "Patient": {
                        "create": True,
                        "read": True,
                        "update": True,
                        "delete": False,
                        "view_sensitive": False,
                    },
                    "Encounter": {
                        "create": False,
                        "read": True,
                        "update": False,
                        "delete": False,
                    },
                },
            },
            {
                "code": "CHW",
                "name": "Community Health Worker",
                "category": "CLINICAL",
                "hierarchy_level": 6,
                "requires_license": False,
                "permissions_matrix": {
                    "Patient": {
                        "create": True,
                        "read": True,
                        "update": True,
                        "delete": False,
                        "view_sensitive": False,
                    },
                    "Encounter": {
                        "create": True,
                        "read": True,
                        "update": False,
                        "delete": False,
                    },
                },
            },
        ]
