"""Import ICD-11 reference codes from the WHO CSV export."""

import csv
import os
import re

from django.core.management.base import BaseCommand, CommandError

from hmis.apps.billing.models import ICD11CodeReference


class Command(BaseCommand):
    help = "Import ICD-11 codes from a WHO linearization CSV export"

    def add_arguments(self, parser):
        parser.add_argument("csv_file", type=str, help="Path to the ICD-11 CSV file")
        parser.add_argument(
            "--clear",
            action="store_true",
            help="Clear existing ICD-11 codes before importing",
        )
        parser.add_argument(
            "--update",
            action="store_true",
            help="Update existing codes instead of skipping them",
        )

    def handle(self, *args, **options):
        csv_file = options["csv_file"]
        clear_existing = options["clear"]
        update_existing = options["update"]

        if not os.path.exists(csv_file):
            raise CommandError(f"CSV file not found: {csv_file}")

        if clear_existing:
            count = ICD11CodeReference.objects.count()
            ICD11CodeReference.objects.all().delete()
            self.stdout.write(self.style.WARNING(f"Cleared {count} existing ICD-11 codes"))

        created_count = 0
        updated_count = 0
        skipped_count = 0
        error_count = 0

        with open(csv_file, encoding="utf-8", newline="") as handle:
            reader = csv.DictReader(handle)

            required_columns = {"8Y", "Title", "ClassKind", "ChapterNo", "isLeaf", "IsResidual"}
            if not required_columns.issubset(set(reader.fieldnames or [])):
                missing = required_columns - set(reader.fieldnames or [])
                raise CommandError(f"Missing required columns: {missing}")

            for row_num, row in enumerate(reader, start=2):
                try:
                    code = self._normalize_code(row.get("8Y", ""))
                    title = (row.get("Title") or "").strip()
                    class_kind = (row.get("ClassKind") or "").strip().lower()

                    if class_kind != "category" or not code or not title:
                        skipped_count += 1
                        continue

                    defaults = {
                        "title": title,
                        "description": title,
                        "chapter": (row.get("ChapterNo") or "").strip(),
                        "chapter_no": (row.get("ChapterNo") or "").strip(),
                        "class_kind": class_kind,
                        "depth_in_kind": self._to_int(row.get("DepthInKind")),
                        "entity_id": self._extract_entity_id(row.get("Foundation URI", "")),
                        "foundation_uri": (row.get("Foundation URI") or "").strip(),
                        "linearization_uri": (row.get("Linearization (release) URI") or "").strip(),
                        "is_leaf": self._to_bool(row.get("isLeaf")),
                        "is_residual": self._to_bool(row.get("IsResidual")),
                        "is_active": True,
                    }

                    existing = ICD11CodeReference.objects.filter(code=code).first()
                    if existing:
                        if update_existing:
                            for field, value in defaults.items():
                                setattr(existing, field, value)
                            existing.save()
                            updated_count += 1
                        else:
                            skipped_count += 1
                    else:
                        ICD11CodeReference.objects.create(code=code, **defaults)
                        created_count += 1
                except Exception as exc:
                    self.stderr.write(self.style.ERROR(f"Row {row_num}: {exc}"))
                    error_count += 1

        self.stdout.write("")
        self.stdout.write(self.style.SUCCESS("ICD-11 import complete:"))
        self.stdout.write(f"  Created: {created_count}")
        self.stdout.write(f"  Updated: {updated_count}")
        self.stdout.write(f"  Skipped: {skipped_count}")
        if error_count > 0:
            self.stdout.write(self.style.ERROR(f"  Errors: {error_count}"))
        self.stdout.write(f"\nTotal ICD-11 codes in database: {ICD11CodeReference.objects.count()}")

    def _normalize_code(self, raw_code: str) -> str:
        code = (raw_code or "").strip().upper()
        if not code:
            return ""

        scientific_notation_match = re.match(r"^(\d)\.0+E\+(\d+)$", code)
        if scientific_notation_match:
            return f"{scientific_notation_match.group(1)}E{scientific_notation_match.group(2)}"

        return code

    def _to_bool(self, value: str | None) -> bool:
        return (value or "").strip().lower() in {"true", "1", "yes"}

    def _to_int(self, value: str | None) -> int:
        try:
            return int((value or "0").strip())
        except ValueError:
            return 0

    def _extract_entity_id(self, foundation_uri: str) -> str:
        uri = (foundation_uri or "").strip()
        return uri.rstrip("/").split("/")[-1] if uri else ""
