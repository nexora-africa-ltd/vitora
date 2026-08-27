"""
What this file is for: ILM intervention and visit lifecycle methods for SHA claims.
How to use: mixed into SHAClaimViewSet via SHAClaimILMMixin composition.
Supported inputs/args: DRF ILM action payloads for start/sync/switch/restore/retire/purge and intervention helpers.
"""

# ruff: noqa: ARG002

import logging
from collections.abc import Mapping
from typing import cast

from django.utils import timezone
from rest_framework import status
from rest_framework.decorators import action as drf_action
from rest_framework.response import Response

from hmis.apps.billing.models import ConsentToken, SHAClaim
from hmis.apps.billing.sha_views_claims_helpers import _stringify_error

logger = logging.getLogger(__name__)


class SHAClaimILMInterventionsMixin:
    """ILM intervention and visit lifecycle methods for SHA claims."""

    def _resolve_claim_intervention_codes(self, claim: SHAClaim) -> list[str]:
        """Return ordered candidate intervention codes for claim-linked DHA calls.

        Priority:
        1. Most recent non-cancelled preauth intervention code.
        2. Active claim intervention codes.
        3. Intervention codes stored on the active consent token.
        """
        ordered_codes: list[str] = []

        def _append_code(value: str) -> None:
            code = str(value or "").strip().upper()
            if code and code not in ordered_codes:
                ordered_codes.append(code)

        latest_preauth = claim.preauths.exclude(status="cancelled").order_by("-created_at").first()
        if latest_preauth and latest_preauth.intervention_code:
            _append_code(latest_preauth.intervention_code)

        active_codes = (
            claim.claim_interventions.filter(status="active")
            .order_by("-updated_at", "-created_at", "id")
            .values_list("intervention_code", flat=True)
        )
        for code in active_codes:
            _append_code(code)

        from hmis.apps.billing.services.consent_token_resolver import resolve_for_claim

        try:
            consent = resolve_for_claim(claim)
            consent_obj = (
                ConsentToken.objects.filter(consent_token=consent.token)
                .order_by("-validated_at")
                .first()
            )
            for code in consent_obj.intervention_codes if consent_obj else []:
                _append_code(code)
        except Exception as exc:  # noqa: S110 - best-effort fallback
            logger.debug(
                "Consent-token intervention fallback failed for claim %s: %s",
                claim.id,
                exc,
            )

        return ordered_codes

    def _resolve_claim_intervention_code(self, claim: SHAClaim) -> str:
        """Return best intervention code candidate for claim-linked DHA calls."""
        codes = self._resolve_claim_intervention_codes(claim)
        return codes[0] if codes else ""

    def _resolve_diagnosis_intervention_code(self, claim: SHAClaim) -> str:
        code = self._resolve_claim_intervention_code(claim)
        if code:
            return code
        # Legacy fallback for the best-effort DHA diagnosis sync path.
        # Attachments use _resolve_claim_intervention_code directly and require
        # a real visit intervention, so they do not fall back to hardcoded codes.
        if claim.claim_type == SHAClaim.ClaimType.INPATIENT:
            return "SHA-07-001"
        return "SHA-01-001"

    @staticmethod
    def _extract_preview_intervention_codes(payload: object) -> set[str]:
        """Return normalized intervention codes present in a DHA preview payload."""
        preview_payload = payload if isinstance(payload, Mapping) else {}
        if isinstance(preview_payload.get("payload"), Mapping):
            preview_payload = preview_payload.get("payload")
        elif isinstance(preview_payload.get("data"), Mapping):
            preview_payload = preview_payload.get("data")

        interventions = (
            preview_payload.get("interventions") if isinstance(preview_payload, Mapping) else []
        )
        if not isinstance(interventions, list):
            return set()

        codes: set[str] = set()
        for item in interventions:
            if not isinstance(item, Mapping):
                continue
            code = str(
                item.get("intervention_code")
                or item.get("interventionCode")
                or item.get("code")
                or ""
            ).strip()
            if code:
                codes.add(code.upper())
        return codes

    def _sync_missing_interventions_to_dha(
        self,
        claim: SHAClaim,
        *,
        user,
        strict_preview: bool,
    ) -> dict[str, object]:
        """Ensure active local claim interventions are present on DHA for the current visit."""
        ilm_service = self._ilm_service(facility=claim.facility)

        local_codes: list[str] = []
        for code in (
            claim.claim_interventions.filter(status="active")
            .order_by("-updated_at", "-created_at", "id")
            .values_list("intervention_code", flat=True)
        ):
            normalized = str(code or "").strip().upper()
            if normalized and normalized not in local_codes:
                local_codes.append(normalized)

        summary: dict[str, object] = {
            "ok": True,
            "local_active_codes": local_codes,
            "remote_codes": [],
            "missing_before_sync": [],
            "added": [],
            "already_present": [],
            "failed": [],
            "preview_status_code": None,
        }

        if not local_codes:
            return summary

        preview_result = ilm_service.preview(claim, user=user)
        summary["preview_status_code"] = preview_result.status_code
        if preview_result.status_code >= 400:
            payload = preview_result.payload if isinstance(preview_result.payload, Mapping) else {}
            message = str(
                payload.get("error")
                or payload.get("message")
                or payload.get("detail")
                or "DHA preview failed"
            )
            summary["ok"] = False
            summary["error"] = message
            if strict_preview:
                raise ValueError(message)
            return summary

        remote_codes = self._extract_preview_intervention_codes(preview_result.payload)
        summary["remote_codes"] = sorted(remote_codes)
        missing_codes = [code for code in local_codes if code not in remote_codes]
        summary["missing_before_sync"] = missing_codes

        for code in missing_codes:
            try:
                result = ilm_service.add_intervention(claim, code, user=user)
                if result.status_code < 400:
                    cast(list[str], summary["added"]).append(code)
                    continue

                payload = result.payload if isinstance(result.payload, Mapping) else {}
                message = str(
                    payload.get("error")
                    or payload.get("message")
                    or payload.get("detail")
                    or "Failed to add intervention"
                )
                lowered = message.lower()
                if "already" in lowered or "exists" in lowered or "duplicate" in lowered:
                    cast(list[str], summary["already_present"]).append(code)
                    continue
                cast(list[dict[str, str]], summary["failed"]).append(
                    {"code": code, "error": message}
                )
            except Exception as exc:  # noqa: BLE001 - continue syncing other interventions
                cast(list[dict[str, str]], summary["failed"]).append(
                    {"code": code, "error": _stringify_error(exc)}
                )

        if cast(list[dict[str, str]], summary["failed"]):
            summary["ok"] = False
        return summary

    @drf_action(detail=True, methods=["post"], url_path="ilm/start-visit")
    def ilm_start_visit(self, request, pk=None):
        """Start a DHA HIE visit. POST /api/sha/claims/{id}/ilm/start-visit/"""
        from hmis.apps.billing.services.ilm_claim_service import StartVisitParams

        claim = self.get_object()
        d = request.data

        def _as_bool(value) -> bool:
            if isinstance(value, bool):
                return value
            if value is None:
                return False
            return str(value).strip().lower() in {"1", "true", "yes", "on"}

        try:
            params = StartVisitParams(
                otp=str(d.get("otp", "")),
                auth_guid=str(d.get("auth_guid", "")),
                reuse_existing_consent=_as_bool(d.get("reuse_existing_consent", False)),
                patient_id=str(d.get("patient_id", "")),
                intervention_codes=list(d.get("intervention_codes") or []),
                service_type=str(d.get("service_type", "OUTPATIENT")),
                admission_date=d.get("admission_date"),
                estimated_days_of_admission=d.get("estimated_days_of_admission"),
                practitioner_identification_number=str(
                    d.get("practitioner_identification_number", "")
                ),
                practitioner_identification_type=str(d.get("practitioner_identification_type", "")),
                practitioner_regulation_body=str(d.get("practitioner_regulation_body", "KMPDC")),
            )
        except Exception as e:
            return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)
        try:
            result = self._ilm_service(facility=claim.facility).start_visit(
                claim, params, user=request.user
            )
        except Exception as exc:
            return self._ilm_handle_error(exc)
        return self._ilm_response(result)

    @drf_action(detail=True, methods=["post"], url_path="ilm/interventions/add")
    def ilm_add_intervention(self, request, pk=None):
        claim = self.get_object()
        code = request.data.get("intervention_code")
        if not code:
            return Response(
                {"error": "intervention_code required"}, status=status.HTTP_400_BAD_REQUEST
            )
        try:
            result = self._ilm_service(facility=claim.facility).add_intervention(
                claim, code, user=request.user
            )
        except Exception as exc:
            return self._ilm_handle_error(exc)
        return self._ilm_response(result)

    @drf_action(detail=True, methods=["post"], url_path="ilm/interventions/sync")
    def ilm_sync_interventions(self, request, pk=None):
        """Ensure active local interventions exist on DHA for the current consent token."""
        claim = self.get_object()
        try:
            summary = self._sync_missing_interventions_to_dha(
                claim,
                user=request.user,
                strict_preview=True,
            )
        except Exception as exc:
            return self._ilm_handle_error(exc)
        return Response(summary, status=status.HTTP_200_OK)

    @drf_action(detail=True, methods=["post"], url_path="ilm/interventions/switch")
    def ilm_switch_intervention(self, request, pk=None):
        claim = self.get_object()
        d = request.data
        try:
            result = self._ilm_service(facility=claim.facility).switch_intervention(
                claim,
                existing_intervention_code=d["existing_intervention_code"],
                new_intervention_code=d["new_intervention_code"],
                retain_bill_items=bool(
                    d.get("retain_bill_items", d.get("retain_existing_claim", False))
                ),
                bill_from=d.get("bill_from"),
                bill_to=d.get("bill_to"),
                user=request.user,
            )
        except KeyError as e:
            return Response({"error": f"missing field: {e}"}, status=400)
        except Exception as exc:
            return self._ilm_handle_error(exc)
        return self._ilm_response(result)

    @drf_action(detail=True, methods=["post"], url_path="ilm/interventions/restore")
    def ilm_restore_intervention(self, request, pk=None):
        claim = self.get_object()
        code = request.data.get("intervention_code")
        if not code:
            return Response({"error": "intervention_code required"}, status=400)
        try:
            result = self._ilm_service(facility=claim.facility).restore_intervention(
                claim, code, user=request.user
            )
        except Exception as exc:
            return self._ilm_handle_error(exc)
        return self._ilm_response(result)

    @drf_action(detail=True, methods=["post"], url_path="ilm/interventions/retire")
    def ilm_retire_intervention(self, request, pk=None):
        claim = self.get_object()
        code = request.data.get("intervention_code")
        if not code:
            return Response({"error": "intervention_code required"}, status=400)
        try:
            result = self._ilm_service(facility=claim.facility).retire_intervention(
                claim, code, user=request.user
            )
        except Exception as exc:
            return self._ilm_handle_error(exc)
        return self._ilm_response(result)

    @drf_action(detail=True, methods=["post"], url_path="ilm/interventions/purge")
    def ilm_purge_intervention(self, request, pk=None):
        """Hard-delete a retired intervention row after admin confirmation.

        This is intentionally local-only and restricted to admin users.
        """
        if not (
            getattr(request.user, "is_staff", False) or getattr(request.user, "is_superuser", False)
        ):
            return Response(
                {"error": "Admin privileges required to purge interventions."}, status=403
            )

        claim = self.get_object()
        code = request.data.get("intervention_code")
        if not code:
            return Response({"error": "intervention_code required"}, status=400)

        from hmis.apps.billing.models import SHAClaimIntervention

        intervention = SHAClaimIntervention.objects.filter(
            claim=claim, intervention_code=str(code).strip()
        ).first()
        if intervention is None:
            return Response({"error": "Intervention not found on this claim."}, status=404)
        if intervention.status != SHAClaimIntervention.InterventionStatus.RETIRED:
            return Response(
                {"error": "Only retired interventions can be purged."},
                status=400,
            )

        intervention_code = intervention.intervention_code
        intervention.delete()
        return Response(
            {
                "success": True,
                "message": f"Intervention {intervention_code} purged from local claim rows.",
                "intervention_code": intervention_code,
            },
            status=status.HTTP_200_OK,
        )

    @drf_action(detail=True, methods=["post"], url_path="ilm/restart-visit-session")
    def ilm_restart_visit_session(self, request, pk=None):
        """Reset local DHA visit session markers so staff can re-consent/restart.

        This is intentionally local-only (no DHA call): it clears encounter-linked
        VALIDATED consent tokens and visit-started marker to force a fresh consent
        + start_visit cycle from the UI.
        """
        claim = self.get_object()

        cleared_visit_started = False
        if getattr(claim, "dha_visit_started_at", None) is not None:
            claim.dha_visit_started_at = None
            claim.save(update_fields=["dha_visit_started_at", "updated_at"])
            cleared_visit_started = True

        expired_tokens = 0
        encounter = getattr(claim, "encounter", None)
        if encounter is not None:
            tokens_qs = ConsentToken.objects.filter(
                encounter=encounter,
                status=ConsentToken.ConsentStatus.VALIDATED,
            )
            expired_tokens = tokens_qs.count()
            if expired_tokens:
                tokens_qs.update(
                    status=ConsentToken.ConsentStatus.EXPIRED,
                    expires_at=timezone.now(),
                )

        return Response(
            {
                "success": True,
                "message": "DHA visit session reset. Re-consent and start visit again.",
                "cleared_visit_started": cleared_visit_started,
                "expired_tokens": expired_tokens,
            },
            status=status.HTTP_200_OK,
        )

    @drf_action(detail=True, methods=["post"], url_path="ilm/interventions/virtual-claim-line")
    def ilm_add_virtual_claim_line(self, request, pk=None):
        """Add a PHC virtual claim line (DHA HIE user-journey Scenario C).

        POST /api/sha/claims/{id}/ilm/interventions/virtual-claim-line/
        Body: {"intervention_code": "...", optional "service_name",
        "service_identifier", "unit_price", "quantity", "scheme_code", "extra"}
        """
        claim = self.get_object()
        d = request.data
        code = d.get("intervention_code")
        if not code:
            return Response(
                {"error": "intervention_code required"}, status=status.HTTP_400_BAD_REQUEST
            )
        extra = d.get("extra")
        if extra is not None and not isinstance(extra, dict):
            return Response({"error": "extra must be an object"}, status=400)
        try:
            result = self._ilm_service(facility=claim.facility).add_virtual_claim_line(
                claim,
                intervention_code=code,
                service_name=d.get("service_name"),
                service_identifier=d.get("service_identifier"),
                unit_price=d.get("unit_price"),
                quantity=d.get("quantity"),
                scheme_code=d.get("scheme_code"),
                extra=extra,
                user=request.user,
            )
        except Exception as exc:
            return self._ilm_handle_error(exc)
        return self._ilm_response(result)
