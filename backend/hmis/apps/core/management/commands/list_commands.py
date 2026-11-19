# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""
Lists Django management commands and the arguments each command accepts.

Run:
    python manage.py list_commands
    python manage.py list_commands --custom-only
    python manage.py list_commands --command hub_sync --format json

Inputs:
    --command NAME       Repeatable command-name filter.
    --custom-only        Limit output to Vitora hmis.* commands.
    --with-args          Include accepted parser arguments.
    --format {text,json} Choose human-readable or machine-readable output.
"""

from __future__ import annotations

import argparse
import json
from typing import Any

from django.core.management import get_commands, load_command_class
from django.core.management.base import BaseCommand, CommandError


class Command(BaseCommand):
    """Inventory installed Django management commands without running them."""

    help = "List management commands and their accepted arguments."

    def add_arguments(self, parser) -> None:
        """Register inventory filters and output controls."""
        parser.add_argument(
            "--command",
            action="append",
            dest="command_names",
            metavar="NAME",
            help="Only include this command name (repeatable).",
        )
        parser.add_argument(
            "--custom-only",
            action="store_true",
            help="Only include commands implemented in Vitora's hmis.* apps.",
        )
        parser.add_argument(
            "--with-args",
            action="store_true",
            help="Include accepted parser arguments for every listed command.",
        )
        parser.add_argument(
            "--format",
            choices=("text", "json"),
            default="text",
            help="Output format (default: text).",
        )

    @staticmethod
    def _argument_metadata(action: argparse.Action) -> dict[str, Any]:
        """Return a JSON-safe description of one argparse action."""
        flags = " ".join(action.option_strings) if action.option_strings else action.dest
        choices = list(action.choices) if action.choices else None
        default = None if action.default is argparse.SUPPRESS else repr(action.default)
        return {
            "flags": flags,
            "required": action.required,
            "metavar": action.metavar,
            "nargs": action.nargs,
            "choices": choices,
            "default": default,
            "help": None if action.help is argparse.SUPPRESS else action.help,
        }

    def handle(self, *args, **options) -> None:
        """Render selected command parsers without executing command handlers."""
        requested_names = set(options["command_names"] or [])
        commands: list[dict[str, Any]] = []

        for name, source in sorted(get_commands().items()):
            if requested_names and name not in requested_names:
                continue
            if options["custom_only"] and not source.startswith("hmis."):
                continue

            inspection_error: str | None = None
            try:
                command = load_command_class(source, name)
                help_text = command.help
                arguments = []
                if options["with_args"]:
                    parser = command.create_parser("manage.py", name)
                    arguments = [self._argument_metadata(action) for action in parser._actions]
            except (AttributeError, ImportError, ModuleNotFoundError, TypeError, ValueError) as exc:
                # Optional packages can register commands incompatible with the
                # installed Python version. Inventory must remain useful.
                inspection_error = f"{type(exc).__name__}: {exc}"
                help_text = None
                arguments = []

            commands.append(
                {
                    "name": name,
                    "source": source,
                    "help": help_text,
                    "arguments": arguments,
                    "inspection_error": inspection_error,
                }
            )

        missing = requested_names - {command["name"] for command in commands}
        if missing:
            missing_list = ", ".join(sorted(missing))
            raise CommandError(f"Unknown or excluded command(s): {missing_list}")

        if options["format"] == "json":
            self.stdout.write(json.dumps(commands, indent=2, sort_keys=True, default=str))
            return

        for command in commands:
            self.stdout.write(f"{command['name']}  [{command['source']}]")
            if command["inspection_error"]:
                self.stdout.write(
                    self.style.WARNING(f"  Unavailable: {command['inspection_error']}")
                )
                continue
            if command["help"]:
                self.stdout.write(f"  {command['help']}")
            if options["with_args"]:
                for argument in command["arguments"]:
                    details = []
                    if argument["metavar"]:
                        details.append(f"value: {argument['metavar']}")
                    if argument["choices"]:
                        details.append(f"choices: {', '.join(map(str, argument['choices']))}")
                    if argument["required"]:
                        details.append("required")
                    if argument["default"] not in (None, "None"):
                        details.append(f"default: {argument['default']}")
                    description = argument["help"] or ""
                    suffix = f" — {description}" if description else ""
                    annotation = f" ({'; '.join(details)})" if details else ""
                    self.stdout.write(f"  {argument['flags']}{annotation}{suffix}")
