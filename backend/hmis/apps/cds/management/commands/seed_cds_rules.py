"""
Management command to seed initial CDS rules from ``data/cds_rules.json``.

Seeds the following rule categories:
- Vital sign alerts (temperature, pulse, SpO2, blood pressure, respiratory rate)
- Drug-allergy interaction (generic prescribing check)
- Drug-drug interactions (common interactions)
- Critical lab values (potassium, sodium, glucose, hemoglobin, creatinine)

Rules are loaded from ``data/cds_rules.json`` so that clinicians can add /
edit rules without touching Python code.
"""

from __future__ import annotations

import json
from pathlib import Path

from django.core.management.base import BaseCommand, CommandParser

from hmis.apps.cds.models import CDSRule, CDSRuleStatus

# Default location of the JSON rules file (relative to the backend root)
DEFAULT_RULES_PATH = Path(__file__).resolve().parents[5] / "data" / "cds_rules.json"


class Command(BaseCommand):
    help = "Seed CDS rules from data/cds_rules.json (vital signs, drug-allergy, drug-drug, critical lab values)"

    def add_arguments(self, parser: CommandParser) -> None:
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Preview rules without creating them",
        )
        parser.add_argument(
            "--activate",
            action="store_true",
            help="Also activate all seeded rules (default: created as DRAFT)",
        )
        parser.add_argument(
            "--file",
            type=str,
            default=None,
            help="Path to JSON rules file (default: data/cds_rules.json)",
        )

    def handle(self, *args: object, **kwargs: object) -> None:
        dry_run = kwargs.get("dry_run", False)
        activate = kwargs.get("activate", False)
        rules_file = kwargs.get("file") or str(DEFAULT_RULES_PATH)

        rules_path = Path(rules_file)
        if not rules_path.is_file():
            self.stderr.write(self.style.ERROR(f"Rules file not found: {rules_path}"))
            return

        with open(rules_path, encoding="utf-8") as fh:
            try:
                rules_data: list[dict] = json.load(fh)
            except json.JSONDecodeError as exc:
                self.stderr.write(self.style.ERROR(f"Invalid JSON in {rules_path}: {exc}"))
                return

        self.stdout.write(f"Loading {len(rules_data)} rules from {rules_path.name}\n")

        created_count = 0
        skipped_count = 0

        for rule_data in rules_data:
            code = rule_data.get("code", "")
            if not code:
                self.stderr.write(self.style.ERROR("  SKIP: rule entry missing 'code' field"))
                continue

            exists = CDSRule.objects.filter(code=code).exists()

            if exists:
                skipped_count += 1
                self.stdout.write(self.style.WARNING(f"  SKIP: {code} — already exists"))
                continue

            if dry_run:
                self.stdout.write(self.style.SUCCESS(
                    f"  WOULD CREATE: {code} — {rule_data.get('name', '?')} [{rule_data.get('category', '?')}]"
                ))
                created_count += 1
                continue

            status_val = CDSRuleStatus.ACTIVE if activate else CDSRuleStatus.DRAFT
            CDSRule.objects.create(
                code=code,
                name=rule_data.get("name", code),
                description=rule_data.get("description", ""),
                category=rule_data.get("category", "GUIDELINE"),
                priority=rule_data.get("priority", "MEDIUM"),
                evidence_level=rule_data.get("evidence_level", "D"),
                status=status_val,
                condition=rule_data.get("condition", {}),
                action_type=rule_data.get("action_type", "ALERT"),
                action_message=rule_data.get("action_message", ""),
                suggestion=rule_data.get("suggestion", ""),
                references=rule_data.get("references", []),
                metadata=rule_data.get("metadata", {}),
            )
            created_count += 1
            self.stdout.write(self.style.SUCCESS(
                f"  CREATED: {code} — {rule_data.get('name', code)} [{status_val}]"
            ))

        self.stdout.write("")
        prefix = "DRY RUN: " if dry_run else ""
        self.stdout.write(self.style.SUCCESS(
            f"{prefix}CDS rules seeded: {created_count} created, {skipped_count} skipped"
        ))
