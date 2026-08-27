"""
What this file is for: ILM diagnosis synchronization and claim-line actions for SHA claims.
How to use: mixed into SHAClaimViewSet via SHAClaimILMMixin composition.
Supported inputs/args: helper methods and DRF actions for diagnosis add/remove/sync and line add/edit/remove.
"""

# ruff: noqa: ARG002

import logging
from collections.abc import Mapping

from django.db import DatabaseError
from rest_framework.decorators import action as drf_action
from rest_framework.response import Response

from hmis.apps.billing.models import SHAClaim
from hmis.apps.billing.services.dha_errors import DHAError
from hmis.apps.billing.sha_views_claims_helpers import _stringify_error

logger = logging.getLogger(__name__)


def _ilm_diagnosis_line_exceptions() -> tuple[type[Exception], ...]:
    return (
        DatabaseError,
        DHAError,
        AttributeError,
        LookupError,
        TypeError,
        ValueError,
        RuntimeError,
        ImportError,
    )


class SHAClaimILMDiagnosesLinesMixin:
    """ILM diagnosis synchronization and claim-line actions for SHA claims."""

    def _preview_payload_has_diagnoses(self, payload: object) -> bool:
        if not isinstance(payload, Mapping):
            return False
        claim_diagnoses = payload.get("claim_diagnoses")
        return isinstance(claim_diagnoses, list) and len(claim_diagnoses) > 0

    def _collect_local_diagnosis_codes(self, claim: SHAClaim) -> list[str]:
        codes: list[str] = []

        encounter = getattr(claim, "encounter", None)
        if encounter is not None:
            try:
                encounter_icd11_codes = encounter.diagnoses.exclude(icd11_code="").values_list(
                    "icd11_code", flat=True
                )
                for encounter_code in encounter_icd11_codes:
                    candidate = str(encounter_code or "").strip().upper()
                    if candidate and candidate not in codes:
                        codes.append(candidate)
            except _ilm_diagnosis_line_exceptions() as exc:
                logger.debug(
                    "Unable to collect encounter ICD-11 diagnoses for claim %s: %s",
                    claim.id,
                    _stringify_error(exc),
                )

        primary_code = str(claim.primary_diagnosis_code or "").strip().upper()
        if primary_code:
            codes.append(primary_code)

        for secondary_code in claim.secondary_diagnosis_codes or []:
            candidate = str(secondary_code or "").strip().upper()
            if candidate and candidate not in codes:
                codes.append(candidate)

        return codes

    def _filter_known_icd11_codes(self, diagnosis_codes: list[str]) -> list[str]:
        if not diagnosis_codes:
            return []

        normalized = [
            str(code or "").strip().upper() for code in diagnosis_codes if str(code or "").strip()
        ]
        if not normalized:
            return []

        try:
            from hmis.apps.billing.models import ICD11CodeReference

            active_count = ICD11CodeReference.objects.filter(is_active=True).count()
            if active_count == 0:
                return normalized

            known_codes = set(
                ICD11CodeReference.objects.filter(
                    is_active=True,
                    code__in=normalized,
                ).values_list("code", flat=True)
            )
            return [code for code in normalized if code in known_codes]
        except _ilm_diagnosis_line_exceptions():
            return normalized

    def _lookup_icd11_display(self, code: str) -> str:
        normalized = str(code or "").strip().upper()
        if not normalized:
            return ""
        try:
            from hmis.apps.billing.models import ICD11CodeReference

            ref = ICD11CodeReference.objects.filter(code=normalized, is_active=True).first()
        except _ilm_diagnosis_line_exceptions():
            ref = None
        return str(getattr(ref, "title", "") or "").strip()

    def _sync_local_diagnosis_add(self, claim: SHAClaim, *, icd_code: str, user) -> None:
        normalized = str(icd_code or "").strip().upper()
        if not normalized:
            return

        display = self._lookup_icd11_display(normalized) or normalized
        update_fields: list[str] = []

        if len(normalized) <= 10 and claim.primary_diagnosis_code != normalized:
            claim.primary_diagnosis_code = normalized
            update_fields.append("primary_diagnosis_code")

        if display and claim.primary_diagnosis_description != display:
            claim.primary_diagnosis_description = display
            update_fields.append("primary_diagnosis_description")

        secondary_codes = [
            str(code or "").strip().upper() for code in claim.secondary_diagnosis_codes or []
        ]
        cleaned_secondary = [code for code in secondary_codes if code and code != normalized]
        if cleaned_secondary != secondary_codes:
            claim.secondary_diagnosis_codes = cleaned_secondary
            update_fields.append("secondary_diagnosis_codes")

        if update_fields:
            claim.save(update_fields=[*update_fields, "updated_at"])

        encounter = getattr(claim, "encounter", None)
        if encounter is None:
            return

        try:
            from hmis.apps.encounters.models import Diagnosis

            primary = Diagnosis.objects.filter(
                encounter=encounter, diagnosis_type="PRIMARY"
            ).first()
            if primary is None:
                Diagnosis.objects.create(
                    encounter=encounter,
                    diagnosis_type="PRIMARY",
                    icd11_code=normalized[:50],
                    icd11_display=display[:500],
                    diagnosed_by=user,
                )
            else:
                primary.icd11_code = normalized[:50]
                primary.icd11_display = display[:500]
                primary.free_text_diagnosis = ""
                primary.diagnosed_by = user
                primary.save(
                    update_fields=[
                        "icd11_code",
                        "icd11_display",
                        "free_text_diagnosis",
                        "diagnosed_by",
                        "updated_at",
                    ]
                )
        except _ilm_diagnosis_line_exceptions() as exc:
            logger.warning(
                "Failed to sync encounter diagnosis after ILM add_diagnosis for claim %s: %s",
                claim.id,
                _stringify_error(exc),
            )

    def _sync_local_diagnosis_remove(self, claim: SHAClaim, *, icd_code: str) -> None:
        normalized = str(icd_code or "").strip().upper()
        if not normalized:
            return

        encounter = getattr(claim, "encounter", None)
        fallback_code = ""
        fallback_desc = ""

        if encounter is not None:
            try:
                from hmis.apps.encounters.models import Diagnosis

                Diagnosis.objects.filter(
                    encounter=encounter, icd11_code__iexact=normalized
                ).delete()
                remaining = Diagnosis.order_by_type_priority(
                    Diagnosis.objects.filter(encounter=encounter)
                ).first()
                if remaining is not None:
                    fallback_code = (
                        str(getattr(remaining, "icd11_code", "") or "").strip().upper()
                        or str(getattr(getattr(remaining, "icd10_code", None), "code", "") or "")
                        .strip()
                        .upper()
                    )
                    fallback_desc = (
                        str(getattr(remaining, "icd11_display", "") or "").strip()
                        or str(
                            getattr(getattr(remaining, "icd10_code", None), "description", "") or ""
                        ).strip()
                        or str(getattr(remaining, "free_text_diagnosis", "") or "").strip()
                    )
            except _ilm_diagnosis_line_exceptions() as exc:
                logger.warning(
                    "Failed to sync encounter diagnosis after ILM remove_diagnosis for claim %s: %s",
                    claim.id,
                    _stringify_error(exc),
                )

        secondary_codes = [
            str(code or "").strip().upper() for code in (claim.secondary_diagnosis_codes or [])
        ]
        filtered_secondary = [code for code in secondary_codes if code and code != normalized]

        next_code = fallback_code or (filtered_secondary[0] if filtered_secondary else "PENDING")
        next_desc = (
            fallback_desc
            or (
                claim.primary_diagnosis_description
                if claim.primary_diagnosis_code != normalized
                else ""
            )
            or "Awaiting diagnosis"
        )

        update_fields: list[str] = []
        if len(next_code) > 10:
            next_code = next_code[:10]
        if claim.primary_diagnosis_code != next_code:
            claim.primary_diagnosis_code = next_code
            update_fields.append("primary_diagnosis_code")
        if claim.primary_diagnosis_description != next_desc:
            claim.primary_diagnosis_description = next_desc
            update_fields.append("primary_diagnosis_description")
        if filtered_secondary != secondary_codes:
            claim.secondary_diagnosis_codes = filtered_secondary
            update_fields.append("secondary_diagnosis_codes")

        if update_fields:
            claim.save(update_fields=[*update_fields, "updated_at"])

    def _refresh_claim_form_attachment(self, claim: SHAClaim, *, user) -> None:
        try:
            from hmis.apps.billing.services.claim_form_attachment_service import (
                ClaimFormAttachmentService,
            )

            ClaimFormAttachmentService.ensure_for_claim(claim=claim, user=user)
        except _ilm_diagnosis_line_exceptions() as exc:
            logger.warning(
                "Failed to refresh claim form attachment after diagnosis update for claim %s: %s",
                claim.id,
                _stringify_error(exc),
            )

    def _sync_claim_diagnoses_to_dha(self, claim: SHAClaim, *, user) -> int:
        diagnosis_codes = self._collect_local_diagnosis_codes(claim)
        if not diagnosis_codes:
            return 0

        diagnosis_codes = self._filter_known_icd11_codes(diagnosis_codes)
        if not diagnosis_codes:
            logger.info(
                "Skipping DHA diagnosis sync for claim %s: no ICD-11 diagnosis codes available",
                claim.id,
            )
            return 0

        intervention_code = self._resolve_diagnosis_intervention_code(claim)
        if not intervention_code:
            return 0

        synced = 0
        ilm_service = self._ilm_service(facility=claim.facility)
        for diagnosis_code in diagnosis_codes:
            try:
                result = ilm_service.add_diagnosis(
                    claim,
                    icd_code=diagnosis_code,
                    intervention_code=intervention_code,
                    user=user,
                )
            except _ilm_diagnosis_line_exceptions() as exc:
                logger.warning(
                    "Failed to sync diagnosis %s to DHA for claim %s: %s",
                    diagnosis_code,
                    claim.id,
                    _stringify_error(exc),
                )
                continue

            if result.status_code < 400:
                synced += 1

        return synced

    @drf_action(detail=True, methods=["post"], url_path="ilm/diagnoses/add")
    def ilm_add_diagnosis(self, request, pk=None):
        claim = self.get_object()
        d = request.data
        if not d.get("icd_code") or not d.get("intervention_code"):
            return Response({"error": "icd_code and intervention_code required"}, status=400)
        # ECCIF 24h billing window guard
        if claim.is_emergency_claim and claim.is_time_barred:
            return Response(
                {
                    "error": "Emergency claim 24-hour billing window has expired.",
                    "code": "eccif_time_barred",
                },
                status=400,
            )
        try:
            result = self._ilm_service(facility=claim.facility).add_diagnosis(
                claim,
                icd_code=d["icd_code"],
                intervention_code=d["intervention_code"],
                practitioner_identification_number=str(
                    d.get("practitioner_identification_number", "")
                ),
                practitioner_identification_type=str(d.get("practitioner_identification_type", "")),
                practitioner_regulation_body=str(d.get("practitioner_regulation_body", "KMPDC")),
                user=request.user,
            )
        except _ilm_diagnosis_line_exceptions() as exc:
            return self._ilm_handle_error(exc)
        if int(getattr(result, "status_code", 500) or 500) < 400:
            self._sync_local_diagnosis_add(claim, icd_code=d["icd_code"], user=request.user)
            self._refresh_claim_form_attachment(claim, user=request.user)
        return self._ilm_response(result)

    @drf_action(detail=True, methods=["post"], url_path="ilm/diagnoses/remove")
    def ilm_remove_diagnosis(self, request, pk=None):
        claim = self.get_object()
        code = request.data.get("icd_code")
        intervention_code = str(request.data.get("intervention_code") or "").strip()
        if not intervention_code:
            active_intervention = (
                claim.claim_interventions.filter(status="active").order_by("created_at").first()
            )
            intervention_code = (
                str(active_intervention.intervention_code).strip() if active_intervention else ""
            )
        if not code:
            return Response({"error": "icd_code required"}, status=400)
        if not intervention_code:
            return Response({"error": "intervention_code required"}, status=400)
        try:
            result = self._ilm_service(facility=claim.facility).remove_diagnosis(
                claim,
                icd_code=code,
                intervention_code=intervention_code,
                user=request.user,
            )
        except _ilm_diagnosis_line_exceptions() as exc:
            return self._ilm_handle_error(exc)
        if int(getattr(result, "status_code", 500) or 500) < 400:
            self._sync_local_diagnosis_remove(claim, icd_code=str(code))
            self._refresh_claim_form_attachment(claim, user=request.user)
        return self._ilm_response(result)

    @drf_action(detail=True, methods=["post"], url_path="ilm/lines/add")
    def ilm_add_line(self, request, pk=None):
        from hmis.apps.billing.services.ilm_claim_service import ClaimLine

        claim = self.get_object()
        d = request.data
        # ECCIF 24h billing window guard
        if claim.is_emergency_claim and claim.is_time_barred:
            return Response(
                {
                    "error": "Emergency claim 24-hour billing window has expired.",
                    "code": "eccif_time_barred",
                },
                status=400,
            )
        try:
            line = ClaimLine(
                intervention_code=str(d["intervention_code"]),
                service_name=str(d["service_name"]),
                service_identifier=str(d["service_identifier"]),
                unit_price=str(d["unit_price"]),
                quantity=str(d["quantity"]),
                scheme_code=str(d["scheme_code"]),
            )
        except KeyError as e:
            return Response({"error": f"missing field: {e}"}, status=400)
        try:
            result = self._ilm_service(facility=claim.facility).add_line(
                claim,
                line,
                practitioner_identification_number=str(
                    d.get("practitioner_identification_number", "")
                ),
                practitioner_identification_type=str(d.get("practitioner_identification_type", "")),
                practitioner_regulation_body=str(d.get("practitioner_regulation_body", "KMPDC")),
                user=request.user,
            )
        except _ilm_diagnosis_line_exceptions() as exc:
            return self._ilm_handle_error(exc)
        return self._ilm_response(result)

    @drf_action(detail=True, methods=["post"], url_path="ilm/lines/edit")
    def ilm_edit_line(self, request, pk=None):
        claim = self.get_object()
        d = request.data
        if not d.get("claim_line_id"):
            return Response({"error": "claim_line_id required"}, status=400)
        try:
            result = self._ilm_service(facility=claim.facility).edit_line(
                claim,
                claim_line_id=str(d["claim_line_id"]),
                quantity=d.get("quantity"),
                unit_price=d.get("unit_price"),
                scheme_code=d.get("scheme_code"),
                user=request.user,
            )
        except _ilm_diagnosis_line_exceptions() as exc:
            return self._ilm_handle_error(exc)
        return self._ilm_response(result)

    @drf_action(detail=True, methods=["post"], url_path="ilm/lines/remove")
    def ilm_remove_line(self, request, pk=None):
        claim = self.get_object()
        line_id = request.data.get("claim_line_id")
        if not line_id:
            return Response({"error": "claim_line_id required"}, status=400)
        try:
            result = self._ilm_service(facility=claim.facility).remove_line(
                claim, claim_line_id=str(line_id), user=request.user
            )
        except _ilm_diagnosis_line_exceptions() as exc:
            return self._ilm_handle_error(exc)
        return self._ilm_response(result)
