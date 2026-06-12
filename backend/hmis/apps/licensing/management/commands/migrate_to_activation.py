# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""
Migrate an existing hub (installed with manual IDs) to the activation-driven flow.

Usage:
    python manage.py migrate_to_activation \
        --hub-id="reception-hub-1" \
        --license-token="<jwt from cloud admin>"

This command:
1. Verifies the license token is valid
2. Calls the cloud's check-in endpoint to register this hub
3. Writes SYNC_SERVER_URL and LICENSE_TOKEN to the .env file
4. Confirms the hub is now ready for bidirectional sync
"""

from __future__ import annotations

import os
from pathlib import Path

import requests
from django.conf import settings
from django.core.management.base import BaseCommand, CommandError


class Command(BaseCommand):
    """Migrate an existing hub to the activation-driven sync flow."""

    help = "Migrate a legacy hub (manual IDs) to activation-driven sync."

    def add_arguments(self, parser):
        parser.add_argument(
            "--hub-id",
            required=True,
            help="The HUB_ID from the existing .env (must match cloud Installation record)",
        )
        parser.add_argument(
            "--license-token",
            required=True,
            help="License JWT provided by cloud admin for this hub",
        )
        parser.add_argument(
            "--sync-url",
            default="https://api.vitora.digital/api/sync",
            help="Cloud sync URL (default: https://api.vitora.digital/api/sync)",
        )
        parser.add_argument(
            "--env-file",
            default="",
            help="Path to .env file to update (default: auto-detect from HUB_DATA_DIR or BASE_DIR)",
        )

    def handle(self, *args, **options):
        hub_id = options["hub_id"]
        license_token = options["license_token"]
        sync_url = options["sync_url"]
        env_file = options["env_file"]

        # Resolve env file path
        if not env_file:
            data_dir = getattr(settings, "HUB_DATA_DIR", "")
            if data_dir:
                env_file = str(Path(data_dir).parent / ".env")
            else:
                env_file = str(Path(settings.BASE_DIR) / ".env")

        env_path = Path(env_file)

        # Verify the token by calling check-in
        self.stdout.write(f"Verifying license token for hub '{hub_id}'...")
        base_url = sync_url.rstrip("/").rsplit("/sync", 1)[0]

        try:
            response = requests.post(
                f"{base_url}/licensing/check-in/",
                json={"installation_id": hub_id},
                headers={
                    "Authorization": f"Bearer {license_token}",
                    "Content-Type": "application/json",
                },
                timeout=30,
            )
        except requests.RequestException as exc:
            raise CommandError(f"Cannot reach cloud: {exc}") from exc

        if response.status_code == 200:
            self.stdout.write(self.style.SUCCESS("License token is valid."))
        elif response.status_code == 401:
            raise CommandError(
                "License token is invalid or expired. Get a fresh one from cloud admin."
            )
        else:
            self.stdout.write(
                self.style.WARNING(
                    f"Check-in returned {response.status_code} — proceeding anyway "
                    "(cloud may not have the check-in endpoint yet)."
                )
            )

        # Update .env file
        if env_path.exists():
            content = env_path.read_text()
        else:
            content = ""

        updates = {
            "SYNC_SERVER_URL": sync_url,
            "LICENSE_TOKEN": license_token,
        }

        for key, value in updates.items():
            if f"{key}=" in content:
                # Replace existing line
                lines = content.split("\n")
                content = "\n".join(
                    f"{key}={value}" if line.startswith(f"{key}=") else line for line in lines
                )
            else:
                # Append
                content = content.rstrip("\n") + f"\n{key}={value}\n"

        env_path.write_text(content)
        # Restrict permissions on Linux
        if os.name != "nt":
            os.chmod(env_path, 0o600)

        self.stdout.write(
            self.style.SUCCESS(f"Updated {env_path} with SYNC_SERVER_URL and LICENSE_TOKEN.")
        )
        self.stdout.write(
            self.style.SUCCESS(
                f"Hub '{hub_id}' is now configured for cloud sync. "
                "Restart the service to begin syncing."
            )
        )
