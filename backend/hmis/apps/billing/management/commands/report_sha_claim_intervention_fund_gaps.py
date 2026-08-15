"""Report SHA claim interventions still missing fund/schemes metadata.

This command identifies interventions that remain incomplete after ILM backfill
so operations can run targeted remediation.

How to run:
    python manage.py report_sha_claim_intervention_fund_gaps [options]

Arguments:
    None.

Options:
    --claim-id (int): Filter report to one SHA claim.
    --intervention-id (int): Filter report to one intervention row.
    --include-retired: Include retired rows (default scans active only).
    --only-both-missing: Report only rows missing both fund and schemes.
    --limit (int): Maximum rows to print. Default: 500.
    --json: Emit machine-readable JSON output.

Behavior notes:
- Rejects using ``--claim-id`` and ``--intervention-id`` together.
- Prints target claim IDs to feed backfill reruns.
"""

from __future__ import annotations

import json

from django.core.management.base import BaseCommand, CommandError

from hmis.apps.billing.models import SHAClaimIntervention


class Command(BaseCommand):
    """Django command entrypoint for SHA intervention metadata gap reporting."""

    help = (
        "Report SHA claim interventions still missing fund/schemes metadata "
        "after ILM backfill so ops can re-run targeted claims."
    )

    def add_arguments(self, parser):
        parser.add_argument("--claim-id", type=int, default=None, help="Filter to one claim ID")
        parser.add_argument(
            "--intervention-id",
            type=int,
            default=None,
            help="Filter to one SHAClaimIntervention ID",
        )
        parser.add_argument(
            "--include-retired",
            action="store_true",
            help="Include retired interventions (default: active only)",
        )
        parser.add_argument(
            "--only-both-missing",
            action="store_true",
            help="Only show rows where both fund and schemes are missing",
        )
        parser.add_argument(
            "--limit",
            type=int,
            default=500,
            help="Maximum rows to print (default: 500)",
        )
        parser.add_argument(
            "--json",
            action="store_true",
            help="Print machine-readable JSON output",
        )

    def handle(self, *args, **options):
        claim_id = options["claim_id"]
        intervention_id = options["intervention_id"]
        include_retired = bool(options["include_retired"])
        only_both_missing = bool(options["only_both_missing"])
        as_json = bool(options["json"])
        limit = max(1, int(options["limit"]))

        if claim_id and intervention_id:
            raise CommandError("Use either --claim-id or --intervention-id, not both")

        qs = SHAClaimIntervention.objects.select_related("claim", "claim__patient").order_by(
            "claim_id", "id"
        )
        if not include_retired:
            qs = qs.filter(status="active")
        if claim_id:
            qs = qs.filter(claim_id=claim_id)
            if not qs.exists():
                raise CommandError(f"No interventions found for claim {claim_id}")
        if intervention_id:
            qs = qs.filter(pk=intervention_id)
            if not qs.exists():
                raise CommandError(f"SHAClaimIntervention {intervention_id} not found")

        rows: list[dict] = []
        claim_ids: set[int] = set()
        scanned = 0

        for row in qs.iterator(chunk_size=500):
            scanned += 1
            fund_missing = self._is_fund_missing(row)
            schemes_missing = self._is_schemes_missing(row)
            if only_both_missing:
                if not (fund_missing and schemes_missing):
                    continue
            elif not (fund_missing or schemes_missing):
                continue

            claim_ids.add(row.claim_id)
            rows.append(
                {
                    "claim_id": row.claim_id,
                    "intervention_id": row.id,
                    "intervention_code": row.intervention_code,
                    "status": row.status,
                    "patient_cr_number": str(getattr(row.claim.patient, "cr_number", "") or ""),
                    "missing_fund": fund_missing,
                    "missing_schemes": schemes_missing,
                    "fund": row.fund,
                    "intervention_fund": row.intervention_fund,
                    "supported_scheme": row.supported_scheme,
                    "schemes": list(row.schemes or []),
                }
            )
            if len(rows) >= limit:
                break

        if as_json:
            payload = {
                "scanned": scanned,
                "reported": len(rows),
                "target_claim_count": len(claim_ids),
                "target_claim_ids": sorted(claim_ids),
                "rows": rows,
            }
            self.stdout.write(json.dumps(payload, indent=2, sort_keys=True))
            return

        self.stdout.write("SHA claim interventions metadata gap report")
        self.stdout.write(f"Scanned rows: {scanned}")
        self.stdout.write(f"Reported rows: {len(rows)}")
        self.stdout.write(f"Target claim count: {len(claim_ids)}")

        if not rows:
            self.stdout.write(self.style.SUCCESS("No fund/schemes metadata gaps found."))
            return

        self.stdout.write("")
        for item in rows:
            missing: list[str] = []
            if item["missing_fund"]:
                missing.append("fund")
            if item["missing_schemes"]:
                missing.append("schemes")
            missing_label = ",".join(missing)
            self.stdout.write(
                " - claim={claim_id} intervention_id={intervention_id} code={intervention_code} "
                "missing={missing} patient_cr={patient_cr_number}".format(
                    claim_id=item["claim_id"],
                    intervention_id=item["intervention_id"],
                    intervention_code=item["intervention_code"],
                    missing=missing_label,
                    patient_cr_number=item["patient_cr_number"] or "-",
                )
            )

        self.stdout.write("")
        claims_csv = ",".join(str(cid) for cid in sorted(claim_ids))
        self.stdout.write("Re-run backfill for targeted claims:")
        self.stdout.write(
            "  python manage.py backfill_sha_claim_interventions_ilm "
            "--claim-id <CLAIM_ID> --allow-broad-fallback --commit"
        )
        self.stdout.write(f"Claim IDs with gaps: {claims_csv}")

    @staticmethod
    def _is_fund_missing(row: SHAClaimIntervention) -> bool:
        return not any(
            [
                str(row.fund or "").strip(),
                str(row.intervention_fund or "").strip(),
                str(row.supported_scheme or "").strip(),
            ]
        )

    @staticmethod
    def _is_schemes_missing(row: SHAClaimIntervention) -> bool:
        return not bool(list(row.schemes or []))
