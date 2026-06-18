# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""
Management command to create a superuser for Vitora HMIS.
Used for initial setup and admin access.

On hub deployments, this also auto-creates a StaffProfile linked to the
hub's organization and facility (from HUB_ORGANIZATION_ID / HUB_FACILITY_ID
env vars, or from the first org/facility in the DB).

Cloud-aware conflict prevention:
  - Reads ``cloud_users.json`` manifest (written by ``seed_from_activation``)
    to detect username collisions with cloud accounts.
  - When cloud admin accounts exist, offers to skip local creation.
  - On hub settings, uses ``HUB_USER_PK_OFFSET`` to avoid PK collisions
    with cloud-assigned user IDs.
"""

import json
import os
import secrets
from datetime import date
from pathlib import Path

from django.conf import settings
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
        parser.add_argument(
            "--force",
            action="store_true",
            help="Skip cloud-admin check and always create local superuser.",
        )
        parser.add_argument(
            "--reset-password",
            action="store_true",
            help="Reset the password if the superuser already exists.",
        )

    def handle(self, *args, **options):
        username = options["username"]
        email = options["email"]
        password = options["password"] or secrets.token_urlsafe(16)
        password_was_generated = options["password"] is None
        skip_profile = options.get("no_profile", False)
        force = options.get("force", False)
        reset_password = options.get("reset_password", False)

        # Avoid duplicate-email rejection when using the default placeholder
        # and a user with that email already exists.
        if email == "admin@vitora.digital" and username != "admin":
            email = f"{username}@vitora.digital"

        cloud_users = self._load_cloud_users_manifest()

        # --- Cloud-admin skip offer ---
        if cloud_users and not force:
            cloud_admins = [
                u
                for u in cloud_users
                if u.get("is_superuser") or u.get("role_code") in ("ADMIN", "ORG-ADMIN", "OWNER")
            ]
            if cloud_admins:
                names = ", ".join(u["username"] for u in cloud_admins)
                self.stdout.write(
                    self.style.WARNING(
                        f"\n  Cloud already has admin account(s): {names}\n"
                        "  These will sync to this hub automatically.\n"
                        "  You can skip local superuser creation if you prefer\n"
                        "  to use cloud credentials after the first sync.\n"
                    )
                )
                try:
                    answer = input("  Create a local admin anyway? [y/N] ").strip().lower()
                except EOFError:
                    answer = ""
                if answer not in ("y", "yes"):
                    self.stdout.write("  Skipped local superuser creation.")
                    return

        # --- Username collision check ---
        cloud_usernames = {u["username"].lower() for u in cloud_users}
        if username.lower() in cloud_usernames and not force:
            self.stdout.write(
                self.style.ERROR(
                    f'  Username "{username}" already exists in the cloud.\n'
                    "  Choose a different username to avoid sync conflicts,\n"
                    "  or re-run with --force to create anyway."
                )
            )
            return

        try:
            # Check if superuser already exists locally
            if User.objects.filter(username=username).exists():
                user = User.objects.get(username=username)
                self.stdout.write(self.style.WARNING(f'Superuser "{username}" already exists'))
                fields_to_update = []
                if not user.is_superuser:
                    user.is_superuser = True
                    fields_to_update.append("is_superuser")
                if not user.is_staff:
                    user.is_staff = True
                    fields_to_update.append("is_staff")
                if not user.is_active:
                    user.is_active = True
                    fields_to_update.append("is_active")
                if email and user.email != email:
                    user.email = email
                    fields_to_update.append("email")
                if reset_password or options["password"] is not None:
                    user.set_password(password)
                    fields_to_update.append("password")
                if fields_to_update:
                    user.save(update_fields=fields_to_update)
                    self.stdout.write(self.style.SUCCESS(f'  Updated superuser "{username}"'))
                if reset_password and password_was_generated:
                    self.stdout.write(
                        self.style.WARNING(
                            f"  Generated password: {password}\n"
                            "  Save this password -- it cannot be recovered."
                        )
                    )
                elif reset_password or options["password"] is not None:
                    self.stdout.write(self.style.WARNING("  Password reset for existing user."))
                if not skip_profile:
                    self._ensure_staff_profile(user)
                return

            # Allocate PK from hub offset range to avoid cloud PK collisions
            explicit_pk = self._allocate_hub_pk()

            # Create superuser
            if explicit_pk is not None:
                user = User(
                    pk=explicit_pk,
                    username=username,
                    email=email,
                    is_superuser=True,
                    is_staff=True,
                    is_active=True,
                )
                user.set_password(password)
                user.save()
            else:
                user = User.objects.create_superuser(
                    username=username, email=email, password=password
                )

            self.stdout.write(self.style.SUCCESS(f'Successfully created superuser "{username}"'))
            if password_was_generated:
                self.stdout.write(
                    self.style.WARNING(
                        f"  Generated password: {password}\n"
                        "  Save this password -- it cannot be recovered."
                    )
                )
            else:
                self.stdout.write(
                    self.style.WARNING("SECURITY: Change the password immediately in production!")
                )

            if not skip_profile:
                self._ensure_staff_profile(user)

        except IntegrityError as e:
            self.stdout.write(self.style.ERROR(f"Failed to create superuser: {e}"))
        except Exception as e:
            self.stdout.write(self.style.ERROR(f"Unexpected error: {e}"))

    # ------------------------------------------------------------------
    # Cloud user manifest helpers
    # ------------------------------------------------------------------

    @staticmethod
    def _load_cloud_users_manifest() -> list[dict]:
        """Load ``cloud_users.json`` written by ``seed_from_activation``."""
        data_dir = os.getenv("HUB_DATA_DIR", "")
        if not data_dir:
            return []
        manifest = Path(data_dir) / "cloud_users.json"
        if not manifest.exists():
            return []
        try:
            return json.loads(manifest.read_text())
        except (json.JSONDecodeError, OSError):
            return []

    @staticmethod
    def _allocate_hub_pk() -> int | None:
        """Return the next available PK in the hub-local range.

        Returns ``None`` when not running on hub settings (i.e. when
        ``HUB_USER_PK_OFFSET`` is not configured), in which case the
        caller should let Django auto-assign the PK.
        """
        offset = getattr(settings, "HUB_USER_PK_OFFSET", 0)
        if not offset:
            return None
        from django.db.models import Max

        max_pk = User.objects.filter(pk__gte=offset).aggregate(m=Max("pk"))["m"]
        return (max_pk + 1) if max_pk is not None else offset

    # ------------------------------------------------------------------
    # StaffProfile creation
    # ------------------------------------------------------------------

    def _ensure_staff_profile(self, user):
        """Create a StaffProfile linked to the hub's org/facility if one doesn't exist."""
        from hmis.apps.core.models import Facility, Organization, Role, StaffProfile

        if StaffProfile.objects.filter(user=user).exists():
            self.stdout.write("  StaffProfile already exists -- skipping.")
            return

        org_id = os.getenv("HUB_ORGANIZATION_ID")
        org = None
        if org_id:
            org = Organization.objects.filter(id=org_id).first()
        if not org:
            org = Organization.objects.first()

        facility_id = os.getenv("HUB_FACILITY_ID")
        facility = None
        if facility_id:
            facility = Facility.objects.filter(id=facility_id).first()
        if not facility:
            facility = Facility.objects.first()

        if not org:
            self.stdout.write(
                self.style.WARNING(
                    "  No organization found -- StaffProfile not created.\n"
                    "  Run the setup wizard or create an org first, then re-run this command."
                )
            )
            return

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
