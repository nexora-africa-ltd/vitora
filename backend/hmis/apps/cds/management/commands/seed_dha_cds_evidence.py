# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""Seed one synthetic, evidence-based CDS alert for DHA field-lab evidence.

Run: ``python manage.py seed_dha_cds_evidence --encounter-id <id> --confirm-synthetic``.
Inputs: an existing DHA-only synthetic encounter ID and the mandatory confirmation
flag. The command creates or reuses only the named synthetic CDS rule and alert.
"""

from __future__ import annotations

from django.core.management.base import BaseCommand, CommandError, CommandParser
from django.db import transaction

from hmis.apps.cds.models import CDSAlert, CDSAlertStatus, CDSRule, CDSRuleStatus
from hmis.apps.encounters.models import Encounter

RULE_CODE = "DHA-SYNTHETIC-CDS-FEVER-001"


class Command(BaseCommand):
    """Create a DHA-only evidence-backed fever intervention alert."""

    help = "Seed a synthetic evidence-based CDS intervention for DHA certification evidence."

    def add_arguments(self, parser: CommandParser) -> None:
        """Register required synthetic encounter and safety confirmation inputs."""
        parser.add_argument("--encounter-id", type=int, required=True)
        parser.add_argument(
            "--confirm-synthetic",
            action="store_true",
            help="Required acknowledgement that the encounter is DHA synthetic data.",
        )

    @transaction.atomic
    def handle(self, *args, **options) -> None:
        """Create or reuse one rule and its encounter-scoped CDS alert."""
        if not options["confirm_synthetic"]:
            raise CommandError("Refusing to seed CDS evidence without --confirm-synthetic.")
        encounter_id = options["encounter_id"]
        try:
            encounter = Encounter.objects.select_related("patient", "organization", "facility").get(
                pk=encounter_id
            )
        except Encounter.DoesNotExist as exc:
            raise CommandError(f"Encounter {encounter_id} does not exist.") from exc

        rule, _ = CDSRule.objects.update_or_create(
            code=RULE_CODE,
            defaults={
                "name": "DHA synthetic high-temperature intervention",
                "description": "Synthetic DHA field-lab CDS evidence rule; not for clinical deployment.",
                "category": "VITAL_SIGN",
                "priority": "HIGH",
                "evidence_level": "A",
                "status": CDSRuleStatus.ACTIVE,
                "condition": {
                    "type": "vital_range",
                    "vital": "temperature",
                    "max": 38.0,
                    "max_label": "Fever",
                },
                "action_type": "SUGGEST",
                "action_message": "Synthetic DHA evidence: temperature {value}°C requires assessment.",
                "suggestion": "Assess the synthetic patient for infection and follow local fever management guidance.",
                "references": [
                    "Kenya Clinical Guidelines 2022 — Fever Management",
                    "WHO Integrated Management guidelines",
                ],
                "metadata": {"dha_synthetic": True, "purpose": "FUNC-CDS-001 evidence"},
            },
        )
        alert, created = CDSAlert.objects.get_or_create(
            rule=rule,
            encounter=encounter,
            defaults={
                "patient": encounter.patient,
                "organization": encounter.organization,
                "facility": encounter.facility,
                "priority": rule.priority,
                "status": CDSAlertStatus.PENDING,
                "message": "Synthetic high-temperature CDS trigger (39.5°C).",
                "suggestion": rule.suggestion,
                "details": {
                    "vital": "temperature",
                    "value": 39.5,
                    "threshold": 38.0,
                    "dha_synthetic": True,
                },
            },
        )
        action = "Created" if created else "Reused"
        self.stdout.write(
            self.style.SUCCESS(
                f"{action} DHA synthetic CDS alert {alert.id} for encounter {encounter.id}; rule={rule.code}."
            )
        )
