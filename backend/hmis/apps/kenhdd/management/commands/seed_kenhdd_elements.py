# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""
Management command to seed KENHDD data elements from ``data/kenhdd_elements.json``.

Idempotent — skips elements whose ``element_id`` already exists.

DHA Compliance: Gap #33 — KENHDD Schema Validation (Sprint 3.D)
"""

from __future__ import annotations

from pathlib import Path

from django.core.management.base import BaseCommand, CommandParser

from hmis.apps.kenhdd.services.seeding import DEFAULT_ELEMENTS_PATH, seed_kenhdd_elements


class Command(BaseCommand):
    help = "Seed KENHDD data elements from data/kenhdd_elements.json"

    def add_arguments(self, parser: CommandParser) -> None:
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Preview elements without creating them",
        )
        parser.add_argument(
            "--file",
            type=str,
            default=None,
            help="Path to JSON elements file (default: data/kenhdd_elements.json)",
        )

    def handle(self, *args: object, **kwargs: object) -> None:
        dry_run: bool = bool(kwargs.get("dry_run", False))
        elements_file = kwargs.get("file") or str(DEFAULT_ELEMENTS_PATH)

        elements_path = Path(elements_file)
        if not elements_path.is_file():
            self.stderr.write(self.style.ERROR(f"Elements file not found: {elements_path}"))
            return

        try:
            result = seed_kenhdd_elements(elements_path=elements_path, dry_run=dry_run)
        except ValueError as exc:
            self.stderr.write(self.style.ERROR(f"Invalid JSON in {elements_path}: {exc}"))
            return

        created_count = result["created"]
        skipped_count = result["skipped"]
        total_count = result["total"]

        self.stdout.write(f"Loading {total_count} KENHDD elements from {elements_path.name}\n")

        self.stdout.write("")
        prefix = "DRY RUN: " if dry_run else ""
        self.stdout.write(
            self.style.SUCCESS(
                f"{prefix}KENHDD elements seeded: {created_count} created, {skipped_count} skipped"
            )
        )
