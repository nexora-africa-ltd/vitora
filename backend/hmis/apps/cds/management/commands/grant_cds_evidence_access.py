# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""Grant a dedicated integration account read-only CDS evidence access.

Run: ``python manage.py grant_cds_evidence_access --username <username>``.
Inputs: an existing Django username. The command grants only
``cds.view_cdsalert`` and does not grant CDS rule or alert mutation permissions.
"""

from __future__ import annotations

from django.contrib.auth import get_user_model
from django.contrib.auth.models import Permission
from django.core.management.base import BaseCommand, CommandError, CommandParser


class Command(BaseCommand):
    """Grant the minimum Django permission for CDS evidence reads."""

    help = "Grant cds.view_cdsalert to a dedicated integration reader account."

    def add_arguments(self, parser: CommandParser) -> None:
        """Register the target integration-account username."""
        parser.add_argument("--username", required=True)

    def handle(self, *args, **options) -> None:
        """Grant the read-only CDS alert permission to the named user."""
        User = get_user_model()
        username = options["username"]
        try:
            user = User.objects.get(username=username)
        except User.DoesNotExist as exc:
            raise CommandError(f"User '{username}' does not exist.") from exc
        permission = Permission.objects.get(content_type__app_label="cds", codename="view_cdsalert")
        user.user_permissions.add(permission)
        self.stdout.write(self.style.SUCCESS(f"Granted cds.view_cdsalert to '{username}'."))
