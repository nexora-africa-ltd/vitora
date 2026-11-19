# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""
Tests for the management-command inventory utility.

Run: cd backend && poetry run pytest tests/core/test_list_commands_command.py --no-cov
Inputs: invokes Django's command registry only; no network or fixture data required.
"""

import json
from io import StringIO

from django.core.management import call_command


def test_default_listing_is_concise_without_command_arguments():
    """The normal text view shows a command summary without every parser option."""
    output = StringIO()

    call_command("list_commands", "--command", "check_pii_integrity", stdout=output)

    rendered = output.getvalue()
    assert "check_pii_integrity" in rendered
    assert "hmis.apps.core" in rendered
    assert "--model" not in rendered
    assert "--fail-fast" not in rendered


def test_argument_output_requires_the_explicit_with_args_option():
    """Detailed parser options appear only when operators request them."""
    output = StringIO()

    call_command(
        "list_commands",
        "--command",
        "check_pii_integrity",
        "--with-args",
        stdout=output,
    )

    rendered = output.getvalue()
    assert "--model" in rendered
    assert "--fail-fast" in rendered


def test_json_output_is_machine_readable_and_can_filter_to_custom_commands():
    """The JSON view exposes command metadata without framework-only commands."""
    output = StringIO()

    call_command(
        "list_commands",
        "--custom-only",
        "--command",
        "check_pii_integrity",
        "--format",
        "json",
        "--with-args",
        stdout=output,
    )

    commands = json.loads(output.getvalue())
    assert len(commands) == 1
    assert commands[0]["name"] == "check_pii_integrity"
    assert commands[0]["source"].startswith("hmis.")
    assert "--model" in {option["flags"] for option in commands[0]["arguments"]}


def test_custom_command_inventory_excludes_framework_commands():
    """The dedicated custom inventory lists only hmis.* commands."""
    output = StringIO()

    call_command("list_custom_commands", stdout=output)

    rendered = output.getvalue()
    assert "check_pii_integrity" in rendered
    assert "migrate  [django.core]" not in rendered


def test_command_args_displays_only_the_requested_command_arguments():
    """The argument command provides an explicit, focused parser inspection."""
    output = StringIO()

    call_command("command_args", "check_pii_integrity", stdout=output)

    rendered = output.getvalue()
    assert "check_pii_integrity" in rendered
    assert "--model" in rendered
    assert "--fail-fast" in rendered


def test_unavailable_optional_command_is_reported_without_failing_inventory():
    """Incompatible optional commands are reported instead of aborting the list."""
    output = StringIO()

    call_command("list_commands", "--command", "mail_debug", stdout=output)

    rendered = output.getvalue()
    assert "mail_debug" in rendered
    assert "Unavailable:" in rendered
    assert "asyncore" in rendered
