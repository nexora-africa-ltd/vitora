# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""
Propose administrator-reviewed ICHI mappings for a facility procedure catalogue.

Run: ``python manage.py propose_procedure_ichi_mappings --facility-id <ID> --output <path>``.
Inputs: active facility primary key, output JSON path, and optional ``--limit`` candidate count.
The command never writes mappings; an administrator must select a candidate in the UI.
"""

from __future__ import annotations

import json
from pathlib import Path

from django.core.management.base import BaseCommand, CommandError
from django.utils import timezone

from hmis.apps.billing.services.terminology import TerminologyError, TerminologyService
from hmis.apps.procedures.models import ProcedureCatalog


class Command(BaseCommand):
    """Produce an auditable ICHI candidate report without modifying procedures."""

    help = "Propose DHA ICHI mappings for uncoded facility procedure catalogue entries."

    def add_arguments(self, parser) -> None:
        """Register facility, report output, and result-limit arguments."""
        parser.add_argument("--facility-id", type=int, required=True, help="Facility primary key")
        parser.add_argument("--output", type=Path, required=True, help="JSON proposal report path")
        parser.add_argument(
            "--limit",
            type=int,
            default=5,
            help="Maximum DHA candidates to include per procedure (DHA is queried with its minimum of 25)",
        )

    def handle(self, *args, **options) -> None:
        """Search DHA terminology and write candidates for administrator review."""
        from hmis.apps.core.models import Facility

        limit = min(max(options["limit"], 1), 20)
        try:
            facility = Facility.objects.select_related("organization").get(
                pk=options["facility_id"], is_active=True
            )
        except Facility.DoesNotExist as exc:
            raise CommandError(f"Active facility {options['facility_id']} was not found.") from exc

        service = TerminologyService()
        proposals = []
        for procedure in ProcedureCatalog.objects.filter(
            facility=facility, is_active=True, ichi_code=""
        ).order_by("code"):
            try:
                candidates = service.search_ichi(procedure.name, limit=25)[:limit]
                status = "candidates_found" if candidates else "unmatched"
                error = ""
            except TerminologyError as exc:
                candidates = []
                status = "lookup_failed"
                error = str(exc)
            proposals.append(
                {
                    "procedure_id": procedure.id,
                    "local_code": procedure.code,
                    "local_name": procedure.name,
                    "status": status,
                    "error": error,
                    "candidates": [
                        {
                            "code": candidate.code,
                            "title": candidate.title,
                            "definition": candidate.definition,
                            "target": candidate.target,
                            "action": candidate.action,
                            "means": candidate.means,
                        }
                        for candidate in candidates
                    ],
                }
            )

        report = {
            "generated_at": timezone.now().isoformat(),
            "facility": {"id": facility.id, "mfl_code": facility.mfl_code, "name": facility.name},
            "review_required": True,
            "instruction": (
                "Review each candidate clinically, then assign an approved code from the "
                "Procedure Catalog UI. This report never applies mappings automatically."
            ),
            "proposals": proposals,
        }
        output = options["output"]
        output.parent.mkdir(parents=True, exist_ok=True)
        output.write_text(json.dumps(report, indent=2, sort_keys=True) + "\n", encoding="utf-8")
        self.stdout.write(
            self.style.SUCCESS(f"Wrote {len(proposals)} ICHI mapping proposal(s) to {output}.")
        )
