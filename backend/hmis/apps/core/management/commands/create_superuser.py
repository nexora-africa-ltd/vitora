# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""
Management command to create a superuser for Vitora HMIS.
Used for initial setup and admin access.

On hub deployments, this also auto-creates a StaffProfile linked to the
hub's organization and facility (from HUB_ORGANIZATION_ID / HUB_FACILITY_ID
env vars, or from the first org/facility in the DB).
"""

import os
import secrets
from datetime import date

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand
from django.db import IntegrityError

User = get_user_model()


class Command(BaseCommand):
    help = "Creates a superuser account for admin access"

    def add_arguments(self, parser):
        parser.add_argument(
            "--username",
            type=str,
            default="admin",
            help="Username for the superuser (default: admin)",
        )
        parser.add_argument(
            "--email",
            type=str,
            default="admin@vitora.digital",
            help="Email for the superuser (default: admin@vitora.digital)",
        )
        parser.add_argument(
            "--password",
            type=str,
            default=None,
            help="Password for the superuser (auto-generated if not provided)",
        )
        parser.add_argument(
            "--no-profile",
            action="store_true",
            help="Skip auto-creation of StaffProfile (useful for testing).",
        )

    def handle(self, *args, **options):
        username = options["username"]
        email = options["email"]
        password = options["password"] or secrets.token_urlsafe(16)
        password_was_generated = options["password"] is None
        skip_profile = options.get("no_profile", False)

        try:
            # Check if superuser already exists
            if User.objects.filter(username=username).exists():
                user = User.objects.get(username=username)
                self.stdout.write(self.style.WARNING(f'Superuser "{username}" already exists'))
                # Still try to create profile if missing
                if not skip_profile:
                    self._ensure_staff_profile(user)
                return

            # Create superuser
            user = User.objects.create_superuser(username=username, email=email, password=password)

            self.stdout.write(self.style.SUCCESS(f'Successfully created superuser "{username}"'))
            if password_was_generated:
                self.stdout.write(
                    self.style.WARNING(
                        f"  Generated password: {password}\n"
                        "  Save this password — it cannot be recovered."
                    )
                )
            else:
                self.stdout.write(
                    self.style.WARNING("SECURITY: Change the password immediately in production!")
                )

            # Auto-create StaffProfile on hub deployments
            if not skip_profile:
                self._ensure_staff_profile(user)

        except IntegrityError as e:
            self.stdout.write(self.style.ERROR(f"Failed to create superuser: {e}"))
        except Exception as e:
            self.stdout.write(self.style.ERROR(f"Unexpected error: {e}"))

    def _ensure_staff_profile(self, user):
        """Create a StaffProfile linked to the hub's org/facility if one doesn't exist."""
        from hmis.apps.core.models import Facility, Organization, Role, StaffProfile

        # Skip if user already has a profile
        if StaffProfile.objects.filter(user=user).exists():
            self.stdout.write("  StaffProfile already exists — skipping.")
            return

        # Resolve organization
        org_id = os.getenv("HUB_ORGANIZATION_ID")
        org = None
        if org_id:
            org = Organization.objects.filter(id=org_id).first()
        if not org:
            org = Organization.objects.first()

        # Resolve facility
        facility_id = os.getenv("HUB_FACILITY_ID")
        facility = None
        if facility_id:
            facility = Facility.objects.filter(id=facility_id).first()
        if not facility:
            facility = Facility.objects.first()

        if not org:
            self.stdout.write(
                self.style.WARNING(
                    "  No organization found — StaffProfile not created.\n"
                    "  Run the setup wizard or create an org first, then re-run this command."
                )
            )
            return

        # Resolve admin role
        role = Role.objects.filter(code="ADMIN", is_active=True).first()

        StaffProfile.objects.create(
            user=user,
            employee_id=f"ADMIN-{org.id:04d}",
            organization=org,
            primary_facility=facility,
            primary_role=role,
            date_joined=date.today(),
            must_change_password=True,
        )
        self.stdout.write(
            self.style.SUCCESS(
                f"  StaffProfile created (org={org.name}, "
                f"facility={facility.name if facility else 'None'})"
            )
        )
