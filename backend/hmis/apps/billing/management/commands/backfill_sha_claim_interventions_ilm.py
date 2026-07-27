from __future__ import annotations

import re
from dataclasses import dataclass
from decimal import Decimal, InvalidOperation
from typing import Any

from django.core.management.base import BaseCommand, CommandError

from hmis.apps.billing.models import SHAClaimIntervention
from hmis.apps.billing.services.dha_errors import DHAError
from hmis.apps.billing.services.ilm_registries_service import IlmRegistriesService

_CR_NUMBER_RE = re.compile(r"^CR\d+-\d$")
_SUB_BENEFIT_RE = re.compile(r"^SHA-\d+-SC-\d+$")
_PARENT_FROM_INTERVENTION_RE = re.compile(r"^(SHA-\d+)-")


@dataclass
class _ResolutionResult:
    payload: dict[str, Any] | None
    sub_benefit_code: str | None


class Command(BaseCommand):
    help = (
        "Backfill SHAClaimIntervention metadata from ILM benefits endpoints "
        "(sub-benefits + benefit-interventions)."
    )

    def add_arguments(self, parser):
        parser.add_argument("--claim-id", type=int, default=None, help="Process one SHA claim ID")
        parser.add_argument(
            "--intervention-id",
            type=int,
            default=None,
            help="Process one SHAClaimIntervention ID",
        )
        parser.add_argument(
            "--limit",
            type=int,
            default=None,
            help="Maximum number of interventions to scan",
        )
        parser.add_argument(
            "--max-sub-benefits",
            type=int,
            default=25,
            help="Max sub-benefit buckets to scan per intervention (default: 25)",
        )
        parser.add_argument(
            "--allow-broad-fallback",
            action="store_true",
            help="If parent/hint misses, scan all patient sub-benefits",
        )
        parser.add_argument(
            "--overwrite",
            action="store_true",
            help="Overwrite non-empty fields instead of only filling blanks",
        )
        parser.add_argument(
            "--include-complete",
            action="store_true",
            help="Include rows that already look fully populated",
        )
        parser.add_argument(
            "--commit",
            action="store_true",
            help="Persist changes (default is dry-run)",
        )

    def handle(self, *args, **options):
        claim_id = options["claim_id"]
        intervention_id = options["intervention_id"]
        limit = options["limit"]
        max_sub_benefits = max(1, min(int(options["max_sub_benefits"]), 200))
        allow_broad_fallback = bool(options["allow_broad_fallback"])
        overwrite = bool(options["overwrite"])
        include_complete = bool(options["include_complete"])
        commit = bool(options["commit"])

        if claim_id and intervention_id:
            raise CommandError("Use either --claim-id or --intervention-id, not both")

        qs = SHAClaimIntervention.objects.select_related(
            "claim",
            "claim__patient",
            "claim__sha_member",
            "claim__facility",
        ).filter(status="active")
        if claim_id:
            qs = qs.filter(claim_id=claim_id)
            if not qs.exists():
                raise CommandError(f"No active claim interventions found for claim {claim_id}")
        if intervention_id:
            qs = qs.filter(pk=intervention_id)
            if not qs.exists():
                raise CommandError(f"SHAClaimIntervention {intervention_id} not found")

        qs = qs.order_by("claim_id", "id")

        mode = "COMMIT" if commit else "DRY-RUN"
        self.stdout.write(f"ILM claim-intervention backfill mode: {mode}")
        self.stdout.write(f"Max sub-benefits per intervention: {max_sub_benefits}")
        self.stdout.write(f"Broad fallback enabled: {allow_broad_fallback}")
        self.stdout.write(f"Overwrite enabled: {overwrite}")

        scanned = 0
        eligible = 0
        resolved = 0
        updated = 0
        skipped_no_cr = 0
        skipped_no_match = 0
        skipped_not_needed = 0
        failed = 0

        service = IlmRegistriesService()
        count_for_limit = 0

        for row in qs.iterator(chunk_size=200):
            if limit is not None and count_for_limit >= limit:
                break
            count_for_limit += 1
            scanned += 1

            if not include_complete and not self._needs_backfill(row):
                skipped_not_needed += 1
                continue
            eligible += 1

            claim = row.claim
            patient_id = self._resolve_patient_cr_number(claim)
            if not patient_id:
                skipped_no_cr += 1
                self.stdout.write(
                    self.style.WARNING(
                        f"skip id={row.id} claim={row.claim_id} code={row.intervention_code}: "
                        "missing patient CR number"
                    )
                )
                continue

            try:
                resolution = self._resolve_intervention_payload(
                    service=service,
                    row=row,
                    patient_id=patient_id,
                    max_sub_benefits=max_sub_benefits,
                    allow_broad_fallback=allow_broad_fallback,
                )
            except DHAError as exc:
                failed += 1
                self.stdout.write(
                    self.style.ERROR(
                        f"fail id={row.id} claim={row.claim_id} code={row.intervention_code}: {exc}"
                    )
                )
                continue

            if not resolution.payload:
                skipped_no_match += 1
                self.stdout.write(
                    self.style.WARNING(
                        f"no-match id={row.id} claim={row.claim_id} code={row.intervention_code}"
                    )
                )
                continue

            resolved += 1
            update_values = self._build_updates(
                row=row,
                payload=resolution.payload,
                sub_benefit_code=resolution.sub_benefit_code,
                overwrite=overwrite,
            )

            if not update_values:
                continue

            if commit:
                for key, value in update_values.items():
                    setattr(row, key, value)
                row.save(update_fields=list(update_values.keys()) + ["updated_at"])

            updated += 1
            self.stdout.write(
                self.style.SUCCESS(
                    f"update id={row.id} claim={row.claim_id} code={row.intervention_code} "
                    f"fields={','.join(sorted(update_values.keys()))}"
                )
            )

        self.stdout.write("")
        self.stdout.write(f"Scanned: {scanned}")
        self.stdout.write(f"Eligible for backfill: {eligible}")
        self.stdout.write(f"Resolved from ILM: {resolved}")
        self.stdout.write(f"Updated rows: {updated}")
        self.stdout.write(f"Skipped (already complete): {skipped_not_needed}")
        self.stdout.write(f"Skipped (missing CR): {skipped_no_cr}")
        self.stdout.write(f"Skipped (no ILM match): {skipped_no_match}")
        self.stdout.write(f"Failures: {failed}")
        if not commit:
            self.stdout.write(
                self.style.WARNING("Dry-run only. Re-run with --commit to persist updates.")
            )

    def _needs_backfill(self, row: SHAClaimIntervention) -> bool:
        if not str(row.payment_mechanism or "").strip():
            return True
        if not str(row.access_point or "").strip():
            return True
        if not row.required_document_types:
            return True
        if not str(getattr(row, "fund", "") or "").strip() and not list(
            getattr(row, "schemes", []) or []
        ):
            return True
        tariffs = [
            row.tariff_amount,
            row.level2_tariff,
            row.level3_tariff,
            row.level4_tariff,
            row.level5_tariff,
            row.level6_tariff,
        ]
        return all(value is None for value in tariffs)

    def _resolve_patient_cr_number(self, claim) -> str:
        patient_cr = str(getattr(claim.patient, "cr_number", "") or "").strip().upper()
        if _CR_NUMBER_RE.match(patient_cr):
            return patient_cr

        sha_number = str(
            getattr(getattr(claim, "sha_member", None), "sha_number", "") or ""
        ).strip()
        if sha_number.startswith("SHA-"):
            candidate = f"CR{sha_number[4:]}"
            if _CR_NUMBER_RE.match(candidate):
                return candidate

        if _CR_NUMBER_RE.match(sha_number.upper()):
            return sha_number.upper()

        return ""

    def _resolve_intervention_payload(
        self,
        *,
        service: IlmRegistriesService,
        row: SHAClaimIntervention,
        patient_id: str,
        max_sub_benefits: int,
        allow_broad_fallback: bool,
    ) -> _ResolutionResult:
        claim = row.claim
        intervention_code = str(row.intervention_code or "").strip()
        if not intervention_code:
            return _ResolutionResult(payload=None, sub_benefit_code=None)

        attempted_sub_benefits: set[str] = set()

        def _query_sub(sub_code: str) -> dict[str, Any] | None:
            if not sub_code or sub_code in attempted_sub_benefits:
                return None
            attempted_sub_benefits.add(sub_code)
            result = service.fetch_benefit_interventions(
                patient_id=patient_id,
                sub_benefit_code=sub_code,
                patient=claim.patient,
                sha_member=claim.sha_member,
                facility=claim.facility,
                user=None,
            )
            for item in self._extract_ilm_results(result.payload):
                code = self._get_str(item, "code", "interventionCode", "intervention_code")
                if code == intervention_code:
                    return item
            return None

        hint = str(row.benefit_code or "").strip().upper()
        if _SUB_BENEFIT_RE.match(hint):
            match = _query_sub(hint)
            if match is not None:
                return _ResolutionResult(payload=match, sub_benefit_code=hint)

        parent = self._derive_parent_benefit_code(intervention_code)
        hinted_parent = str(row.benefit_code or "").strip().upper()
        if hinted_parent.startswith("SHA-") and "-SC-" not in hinted_parent:
            parent = hinted_parent

        sub_codes = self._fetch_sub_benefit_codes(
            service=service,
            claim=claim,
            patient_id=patient_id,
            parent_benefit_code=parent or None,
        )

        for sub_code in sub_codes[:max_sub_benefits]:
            match = _query_sub(sub_code)
            if match is not None:
                return _ResolutionResult(payload=match, sub_benefit_code=sub_code)

        if allow_broad_fallback and not sub_codes:
            broad_sub_codes = self._fetch_sub_benefit_codes(
                service=service,
                claim=claim,
                patient_id=patient_id,
                parent_benefit_code=None,
            )
            for sub_code in broad_sub_codes[:max_sub_benefits]:
                match = _query_sub(sub_code)
                if match is not None:
                    return _ResolutionResult(payload=match, sub_benefit_code=sub_code)

        return _ResolutionResult(payload=None, sub_benefit_code=None)

    def _fetch_sub_benefit_codes(
        self,
        *,
        service: IlmRegistriesService,
        claim,
        patient_id: str,
        parent_benefit_code: str | None,
    ) -> list[str]:
        result = service.fetch_sub_benefits(
            patient_id=patient_id,
            parent_benefit_code=parent_benefit_code,
            patient=claim.patient,
            sha_member=claim.sha_member,
            facility=claim.facility,
            user=None,
        )
        found: list[str] = []
        for item in self._extract_ilm_results(result.payload):
            code = self._get_str(item, "subBenefitCode", "sub_benefit_code", "code")
            if code and code not in found:
                found.append(code)
        return found

    def _build_updates(
        self,
        *,
        row: SHAClaimIntervention,
        payload: dict[str, Any],
        sub_benefit_code: str | None,
        overwrite: bool,
    ) -> dict[str, Any]:
        updates: dict[str, Any] = {}

        intervention_name = self._get_str(payload, "name", "intervention_name", "interventionName")
        if (
            intervention_name
            and (overwrite or not str(row.intervention_name or "").strip())
            and row.intervention_name != intervention_name
        ):
            updates["intervention_name"] = intervention_name[:255]

        parent_benefit = self._derive_parent_benefit_code(row.intervention_code)
        if (
            parent_benefit
            and (overwrite or not str(row.benefit_code or "").strip())
            and row.benefit_code != parent_benefit
        ):
            updates["benefit_code"] = parent_benefit[:10]

        payment_mechanism = self._normalize_payment_mechanism(
            self._get_str(payload, "paymentMechanism", "payment_mechanism")
        )
        if (
            payment_mechanism
            and (overwrite or not str(row.payment_mechanism or "").strip())
            and row.payment_mechanism != payment_mechanism
        ):
            updates["payment_mechanism"] = payment_mechanism

        access_point = self._normalize_access_point(
            self._get_str(payload, "accessPoint", "access_point")
        )
        if (
            access_point
            and (overwrite or not str(row.access_point or "").strip())
            and row.access_point != access_point
        ):
            updates["access_point"] = access_point

        docs = self._extract_document_types(payload)
        if (
            docs
            and (overwrite or not row.required_document_types)
            and list(row.required_document_types or []) != docs
        ):
            updates["required_document_types"] = docs

        fund = self._get_str(payload, "fund")
        if fund and (overwrite or not str(row.fund or "").strip()) and row.fund != fund:
            updates["fund"] = fund[:128]

        intervention_fund = self._get_str(payload, "interventionFund", "intervention_fund")
        if (
            intervention_fund
            and (overwrite or not str(row.intervention_fund or "").strip())
            and row.intervention_fund != intervention_fund
        ):
            updates["intervention_fund"] = intervention_fund[:128]

        supported_scheme = self._get_str(payload, "supportedScheme", "supported_scheme")
        if (
            supported_scheme
            and (overwrite or not str(row.supported_scheme or "").strip())
            and row.supported_scheme != supported_scheme
        ):
            updates["supported_scheme"] = supported_scheme[:128]

        schemes = self._extract_schemes(payload)
        if (
            schemes
            and (overwrite or not list(row.schemes or []))
            and list(row.schemes or []) != schemes
        ):
            updates["schemes"] = schemes

        if (
            overwrite
            or not isinstance(getattr(row, "intervention_payload", None), dict)
            or not row.intervention_payload
        ):
            updates["intervention_payload"] = payload

        tariff_amount = self._parse_decimal(
            payload.get("tariff_amount")
            or payload.get("tariffAmount")
            or payload.get("overallTariff")
            or payload.get("overall_tariff")
        )
        if (
            tariff_amount is not None
            and (overwrite or row.tariff_amount is None)
            and row.tariff_amount != tariff_amount
        ):
            updates["tariff_amount"] = tariff_amount

        for db_key, value in self._extract_level_tariffs(payload).items():
            existing = getattr(row, db_key)
            if value is None:
                continue
            if (overwrite or existing is None) and existing != value:
                updates[db_key] = value

        # Only flip booleans to True unless overwrite is explicitly requested.
        for db_key, source in {
            "needs_preauth": self._extract_needs_preauth(payload),
            "needs_manual_preauth_approval": self._to_bool(
                payload.get("needsManualPreauthApproval")
                or payload.get("needs_manual_preauth_approval")
            ),
            "is_surgical_preauth": self._to_bool(
                payload.get("isSurgicalPreauth")
                or payload.get("is_surgical_preauth")
                or payload.get("requires_surgical_preauth")
            ),
            "is_renal_preauth": self._to_bool(
                payload.get("isRenalPreauth")
                or payload.get("is_renal_preauth")
                or payload.get("requires_renal_preauth")
            ),
            "is_oncology_preauth": self._to_bool(
                payload.get("isOncologyPreauth")
                or payload.get("is_oncology_preauth")
                or payload.get("requires_oncology_preauth")
            ),
            "is_imaging_preauth": self._to_bool(
                payload.get("isImagingPreauth")
                or payload.get("is_imaging_preauth")
                or payload.get("requires_radiology_preauth")
            ),
            "is_optical_preauth": self._to_bool(
                payload.get("isOpticalPreauth")
                or payload.get("is_optical_preauth")
                or payload.get("requires_optical_preauth")
            ),
        }.items():
            current = bool(getattr(row, db_key))
            if source is None:
                continue
            if overwrite:
                if current != bool(source):
                    updates[db_key] = bool(source)
            elif source and not current:
                updates[db_key] = True

        if (
            sub_benefit_code
            and not str(row.benefit_code or "").strip()
            and "benefit_code" not in updates
        ):
            parent = sub_benefit_code.split("-SC-", 1)[0]
            if parent:
                updates["benefit_code"] = parent[:10]

        return updates

    @staticmethod
    def _extract_ilm_results(payload: object) -> list[dict[str, Any]]:
        queue: list[object] = [payload]
        while queue:
            current = queue.pop(0)
            if isinstance(current, list):
                return [item for item in current if isinstance(item, dict)]
            if not isinstance(current, dict):
                continue
            for key in ("results", "data", "interventions", "benefits", "items"):
                value = current.get(key)
                if isinstance(value, list):
                    return [item for item in value if isinstance(item, dict)]
                if isinstance(value, dict):
                    queue.append(value)
        return []

    @staticmethod
    def _get_str(payload: dict[str, Any], *keys: str) -> str:
        for key in keys:
            value = payload.get(key)
            if isinstance(value, str) and value.strip():
                return value.strip()
        return ""

    @staticmethod
    def _derive_parent_benefit_code(intervention_code: str) -> str:
        match = _PARENT_FROM_INTERVENTION_RE.match(str(intervention_code or "").strip().upper())
        return match.group(1) if match else ""

    @staticmethod
    def _parse_decimal(value: Any) -> Decimal | None:
        if value in (None, ""):
            return None
        try:
            return Decimal(str(value))
        except (InvalidOperation, TypeError, ValueError):
            return None

    def _extract_level_tariffs(self, payload: dict[str, Any]) -> dict[str, Decimal | None]:
        return {
            "level2_tariff": self._parse_decimal(
                payload.get("level2Tariff") or payload.get("level_2_tariff")
            ),
            "level3_tariff": self._parse_decimal(
                payload.get("level3Tariff") or payload.get("level_3_tariff")
            ),
            "level4_tariff": self._parse_decimal(
                payload.get("level4Tariff") or payload.get("level_4_tariff")
            ),
            "level5_tariff": self._parse_decimal(
                payload.get("level5Tariff") or payload.get("level_5_tariff")
            ),
            "level6_tariff": self._parse_decimal(
                payload.get("level6Tariff") or payload.get("level_6_tariff")
            ),
        }

    def _extract_document_types(self, payload: dict[str, Any]) -> list[str]:
        candidates = [
            payload.get("requiredPreauthDocumentTypes"),
            payload.get("required_preauth_document_types"),
            payload.get("required_document_types"),
            payload.get("applicable_document_types"),
            payload.get("document_types"),
        ]
        merged: list[str] = []
        for candidate in candidates:
            if not isinstance(candidate, list):
                continue
            for item in candidate:
                text = str(item or "").strip().upper()
                if text and text not in merged:
                    merged.append(text)
        return merged

    def _extract_schemes(self, payload: dict[str, Any]) -> list[str]:
        candidates = payload.get("schemes")
        if not isinstance(candidates, list):
            return []
        normalized: list[str] = []
        for item in candidates:
            text = str(item or "").strip().upper()
            if text and text not in normalized:
                normalized.append(text)
        return normalized

    def _extract_needs_preauth(self, payload: dict[str, Any]) -> bool | None:
        direct = self._to_bool(payload.get("needsPreauth") or payload.get("needs_preauth"))
        if direct is not None:
            return direct

        flags = [
            payload.get("requires_surgical_preauth"),
            payload.get("requires_renal_preauth"),
            payload.get("requires_oncology_preauth"),
            payload.get("requires_radiology_preauth"),
            payload.get("requires_optical_preauth"),
            payload.get("needs_manual_preauth_approval"),
        ]
        parsed = [self._to_bool(flag) for flag in flags]
        parsed = [value for value in parsed if value is not None]
        if not parsed:
            return None
        return any(parsed)

    @staticmethod
    def _to_bool(value: Any) -> bool | None:
        if isinstance(value, bool):
            return value
        if isinstance(value, (int, float)):
            return bool(value)
        if isinstance(value, str):
            text = value.strip().lower()
            if text in {"1", "true", "yes", "y"}:
                return True
            if text in {"0", "false", "no", "n"}:
                return False
        return None

    @staticmethod
    def _normalize_payment_mechanism(value: str) -> str:
        text = str(value or "").strip().upper()
        if not text:
            return ""
        compact = text.replace(" ", "_").replace("-", "_")
        if compact in {"PER_DIEM", "PERDAY", "PER_DIEMS"} or text == "PER DIEM":
            return "PER_DIEM"
        if compact in {"FEE_FOR_SERVICE", "FIXED_FEE_FOR_SERVICE"}:
            return "FEE_FOR_SERVICE"
        if compact == "CAPITATION":
            return "CAPITATION"
        return ""

    @staticmethod
    def _normalize_access_point(value: str) -> str:
        text = str(value or "").strip().upper()
        if not text:
            return ""
        if text in {"BOTH", "OP_AND_IP", "OP AND IP", "IP AND OP"}:
            return "BOTH"
        has_op = "OP" in text
        has_ip = "IP" in text
        if has_op and has_ip:
            return "BOTH"
        if text == "OP" or has_op:
            return "OP"
        if text == "IP" or has_ip:
            return "IP"
        return ""
