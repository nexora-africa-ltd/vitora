# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""
Displays accepted arguments for one Django management command.

Run: python manage.py command_args <command>
Inputs: command is the registered Django management-command name to inspect.
"""

from django.core.management import call_command
from django.core.management.base import BaseCommand


class Command(BaseCommand):
    """Render detailed parser options for a selected management command."""

    help = "Show accepted arguments for a management command."

    def add_arguments(self, parser) -> None:
        """Accept one registered management-command name."""
        parser.add_argument("command_name", help="Management command name to inspect.")

    def handle(self, *args, **options) -> None:
        """Delegate detailed rendering to the main inventory command."""
        call_command(
            "list_commands",
            "--command",
            options["command_name"],
            "--with-args",
            stdout=self.stdout,
        )
