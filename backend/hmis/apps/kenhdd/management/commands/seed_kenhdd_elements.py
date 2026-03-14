"""
Management command to seed KENHDD data elements from ``data/kenhdd_elements.json``.

Idempotent — skips elements whose ``element_id`` already exists.

DHA Compliance: Gap #33 — KENHDD Schema Validation (Sprint 3.D)
"""

from __future__ import annotations

import json
from pathlib import Path

from django.core.management.base import BaseCommand, CommandParser

from hmis.apps.kenhdd.models import KENHDDDataElement

DEFAULT_ELEMENTS_PATH = (
    Path(__file__).resolve().parents[5] / "data" / "kenhdd_elements.json"
)


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
            self.stderr.write(
                self.style.ERROR(f"Elements file not found: {elements_path}")
            )
            return

        with open(elements_path, encoding="utf-8") as fh:
            try:
                elements_data: list[dict] = json.load(fh)
            except json.JSONDecodeError as exc:
                self.stderr.write(
                    self.style.ERROR(f"Invalid JSON in {elements_path}: {exc}")
                )
                return

        self.stdout.write(
            f"Loading {len(elements_data)} KENHDD elements from {elements_path.name}\n"
        )

        created_count = 0
        skipped_count = 0

        for elem in elements_data:
            element_id = elem.get("element_id", "")
            if not element_id:
                self.stderr.write(
                    self.style.ERROR("  SKIP: entry missing 'element_id' field")
                )
                continue

            if KENHDDDataElement.objects.filter(element_id=element_id).exists():
                skipped_count += 1
                self.stdout.write(
                    self.style.WARNING(f"  SKIP: {element_id} — already exists")
                )
                continue

            if dry_run:
                self.stdout.write(
                    self.style.SUCCESS(
                        f"  WOULD CREATE: {element_id} — "
                        f"{elem.get('name', '?')} [{elem.get('resource_type', '?')}]"
                    )
                )
                created_count += 1
                continue

            KENHDDDataElement.objects.create(
                element_id=element_id,
                name=elem.get("name", element_id),
                description=elem.get("description", ""),
                resource_type=elem.get("resource_type", "PATIENT"),
                model_field=elem.get("model_field", ""),
                requirement_level=elem.get("requirement_level", "OPTIONAL"),
                data_type=elem.get("data_type", "STRING"),
                coding_system=elem.get("coding_system", ""),
                max_length=elem.get("max_length"),
                format_pattern=elem.get("format_pattern", ""),
                condition_expression=elem.get("condition_expression", ""),
            )
            created_count += 1
            self.stdout.write(
                self.style.SUCCESS(
                    f"  CREATED: {element_id} — "
                    f"{elem.get('name', element_id)} [{elem.get('resource_type', '?')}]"
                )
            )

        self.stdout.write("")
        prefix = "DRY RUN: " if dry_run else ""
        self.stdout.write(
            self.style.SUCCESS(
                f"{prefix}KENHDD elements seeded: "
                f"{created_count} created, {skipped_count} skipped"
            )
        )
