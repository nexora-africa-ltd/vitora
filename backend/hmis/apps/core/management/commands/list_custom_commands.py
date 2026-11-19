# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""
Lists only Vitora's custom Django management commands.

Run: python manage.py list_custom_commands
Inputs: none. Use ``list_commands --custom-only --with-args`` for a detailed,
machine-readable inventory with accepted arguments.
"""

from django.core.management import call_command
from django.core.management.base import BaseCommand


class Command(BaseCommand):
    """Render the concise Vitora command inventory."""

    help = "List Vitora custom management commands."

    def handle(self, *args, **options) -> None:
        """Delegate filtering and formatting to the main inventory command."""
        call_command("list_commands", "--custom-only", stdout=self.stdout)
