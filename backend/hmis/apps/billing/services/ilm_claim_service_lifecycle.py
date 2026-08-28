# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
# ruff: noqa
"""
What this file is for: ILM preview/submit/close and persistence/event helper mixin methods.
How to use: mixed into IlmClaimService in split ILM claim service core module.
Supported inputs/args: instance methods for claim lifecycle operations and response handling.
"""

from hmis.apps.billing.services.ilm_claim_service_shared import *  # noqa: F403
from hmis.apps.billing.services.ilm_claim_service_shared import (
    _CR_NUMBER_RE,
    _claim_event_payload,
    _normalise_regulator,
    _publish_safe,
)


class IlmClaimLifecycleMixin:
    def preview(self, claim: Any, *, user: Any = None) -> IlmClaimResult:
        result = self._post_with_consent(claim, PREVIEW_PATH, {}, user=user)
        from hmis.apps.core.events import BillingEvents

        _publish_safe(
            BillingEvents.DHA_CLAIM_PREVIEWED,
            _claim_event_payload(claim, result),
        )
        return result

    def reconcile_interventions_from_preview(
        self,
        claim: Any,
        payload: Any,
        *,
        user: Any = None,
    ) -> dict[str, Any]:
        """Reconcile local claim interventions against ILM preview payload."""
        from hmis.apps.billing.models import SHAClaimIntervention

        preview_payload = payload if isinstance(payload, dict) else {}
        if isinstance(preview_payload.get("payload"), dict):
            preview_payload = preview_payload["payload"]
        elif isinstance(preview_payload.get("data"), dict):
            preview_payload = preview_payload["data"]

        if "interventions" not in preview_payload:
            return {
                "reconciled": False,
                "reason": "missing_interventions_field",
                "created": 0,
                "updated": 0,
                "restored": 0,
                "retired": 0,
            }

        raw_interventions = preview_payload.get("interventions")
        if not isinstance(raw_interventions, list):
            return {
                "reconciled": False,
                "reason": "invalid_interventions_shape",
                "created": 0,
                "updated": 0,
                "restored": 0,
                "retired": 0,
            }

        remote_by_code: dict[str, dict[str, Any]] = {}
        for item in raw_interventions:
            if not isinstance(item, dict):
                continue
            code = str(
                item.get("intervention_code")
                or item.get("interventionCode")
                or item.get("code")
                or ""
            ).strip()
            if code and code not in remote_by_code:
                remote_by_code[code] = item

        created_codes: list[str] = []
        updated_codes: list[str] = []
        restored_codes: list[str] = []
        retired_codes: list[str] = []
        soft_retired_by_omission_codes: list[str] = []
        preview_seen_at = timezone.now()

        with transaction.atomic():
            local_interventions = list(
                SHAClaimIntervention.objects.select_for_update().filter(claim=claim)
            )
            local_by_code = {row.intervention_code: row for row in local_interventions}

            for code, remote_item in remote_by_code.items():
                remote_state = (
                    str(
                        remote_item.get("workflow_state")
                        or remote_item.get("workflowState")
                        or remote_item.get("status")
                        or ""
                    )
                    .strip()
                    .upper()
                )
                remote_is_active = remote_state not in {
                    "INACTIVE",
                    "RETIRED",
                    "CANCELLED",
                    "REMOVED",
                    "DELETED",
                    "CLOSED",
                }
                base_benefit_code = code.rsplit("-", 1)[0] if "-" in code else ""
                intervention, created = SHAClaimIntervention.objects.get_or_create(
                    claim=claim,
                    intervention_code=code,
                    defaults={
                        "status": (
                            SHAClaimIntervention.InterventionStatus.ACTIVE
                            if remote_is_active
                            else SHAClaimIntervention.InterventionStatus.RETIRED
                        ),
                        "benefit_code": str(base_benefit_code)[:10],
                    },
                )
                if created:
                    created_codes.append(code)

                updates = self._build_intervention_updates_from_payload(
                    intervention=intervention,
                    payload=remote_item,
                    prefer_existing=False,
                )

                keph_tariff = (
                    remote_item.get("keph_level_tarrif")
                    or remote_item.get("keph_level_tariff")
                    or remote_item.get("intervention_overall_tariff")
                    or remote_item.get("overallTariff")
                    or remote_item.get("overall_tariff")
                )
                facility_level_raw = str(getattr(claim, "facility_level", "") or "").strip().upper()
                level_digits = "".join(ch for ch in facility_level_raw if ch.isdigit())
                level_field = (
                    f"level{level_digits}_tariff"
                    if level_digits in {"2", "3", "4", "5", "6"}
                    else ""
                )
                if keph_tariff not in (None, "") and level_field:
                    if getattr(intervention, level_field, None) in (None, ""):
                        updates[level_field] = keph_tariff

                updates["preview_missing_streak"] = 0
                updates["last_seen_in_preview_at"] = preview_seen_at
                updates["auto_retired_by_omission"] = False

                if remote_is_active:
                    if intervention.status != SHAClaimIntervention.InterventionStatus.ACTIVE:
                        updates["status"] = SHAClaimIntervention.InterventionStatus.ACTIVE
                        restored_codes.append(code)
                elif intervention.status != SHAClaimIntervention.InterventionStatus.RETIRED:
                    updates["status"] = SHAClaimIntervention.InterventionStatus.RETIRED
                    updates["auto_retired_by_omission"] = False
                    retired_codes.append(code)

                if updates:
                    for field, value in updates.items():
                        setattr(intervention, field, value)
                    intervention.save(update_fields=list(updates.keys()) + ["updated_at"])
                    if not created:
                        updated_codes.append(code)

                local_by_code[code] = intervention

            for code, intervention in local_by_code.items():
                if code in remote_by_code:
                    continue

                updates: dict[str, Any] = {
                    "preview_missing_streak": (intervention.preview_missing_streak or 0) + 1,
                }
                if (
                    updates["preview_missing_streak"] >= 2
                    and intervention.status == SHAClaimIntervention.InterventionStatus.ACTIVE
                ):
                    updates["status"] = SHAClaimIntervention.InterventionStatus.RETIRED
                    updates["auto_retired_by_omission"] = True
                    retired_codes.append(code)
                    soft_retired_by_omission_codes.append(code)

                for field, value in updates.items():
                    setattr(intervention, field, value)
                intervention.save(update_fields=list(updates.keys()) + ["updated_at"])

        summary = {
            "reconciled": True,
            "reason": "ok",
            "created": len(created_codes),
            "updated": len([code for code in updated_codes if code not in retired_codes]),
            "restored": len(restored_codes),
            "retired": len(retired_codes),
            "soft_retired_by_omission": len(soft_retired_by_omission_codes),
            "created_codes": created_codes,
            "updated_codes": [code for code in updated_codes if code not in retired_codes],
            "restored_codes": restored_codes,
            "retired_codes": retired_codes,
            "soft_retired_by_omission_codes": soft_retired_by_omission_codes,
        }

        if created_codes or updated_codes or restored_codes or retired_codes:
            logger.info(
                "ILM preview intervention reconcile claim=%s created=%s updated=%s restored=%s retired=%s actor=%s",
                getattr(claim, "pk", None),
                created_codes,
                updated_codes,
                restored_codes,
                retired_codes,
                getattr(user, "id", None),
            )
        return summary

    def preview_payer_claim(self, claim: Any, *, user: Any = None) -> IlmClaimResult:
        """Fetch the payer's adjudication view of this claim from DHA.

        Calls POST /adapter/facade/edi/v1/claims/claims with consent_token.
        Returns the full payer claim object including workflowState,
        processing_notes, and invoice_flags.
        """
        result = self._post_with_consent(claim, PREVIEW_PAYER_PATH, {}, user=user)
        # Persist payer adjudication metadata back to the claim if available
        payload = result.payload or {}
        payer_state = payload.get("workflowState") or payload.get("payer_claim_status")
        if payer_state and hasattr(claim, "last_dha_status"):
            claim.last_dha_status = payer_state
            claim.last_dha_payload_at = timezone.now()
            claim.save(update_fields=["last_dha_status", "last_dha_payload_at"])
        return result

    def submit(
        self,
        claim: Any,
        *,
        invoice_number: str,
        otp: str = "",
        discharge_auth_guid: str = "",
        discharge_reason: str = "",
        notes: str = "",
        practitioner_identification_number: str = "",
        practitioner_identification_type: str = "",
        practitioner_regulation_body: str = "KMPDC",
        user: Any = None,
    ) -> IlmClaimResult:
        body: dict[str, Any] = {"invoice_number": invoice_number}
        # Outpatient discharge consent (DHA 2026-06: OTP or biometrics required)
        if otp:
            body["otp"] = otp
        elif discharge_auth_guid:
            body["discharge_auth_guid"] = discharge_auth_guid
        if discharge_reason:
            body["discharge_reason"] = discharge_reason
        if notes:
            body["notes"] = notes
        # Practitioner details (fallback if not provided at start_visit)
        if practitioner_identification_number:
            body["practitioner_identification_number"] = practitioner_identification_number
            body["practitioner_identification_type"] = (
                practitioner_identification_type or "National ID"
            )
            body["practitioner_regulation_body"] = _normalise_regulator(
                practitioner_regulation_body
            )
        result = self._post_with_consent(claim, SUBMIT_PATH, body, user=user)
        self._apply_submit_response(claim, result, user=user)
        from hmis.apps.core.events import BillingEvents

        _publish_safe(
            BillingEvents.DHA_CLAIM_SUBMITTED,
            _claim_event_payload(
                claim,
                result,
                invoice_number=invoice_number,
                sha_claim_reference=getattr(claim, "sha_claim_reference", ""),
            ),
        )
        return result

    def close(
        self,
        claim: Any,
        params: CloseClaimParams,
        *,
        user: Any = None,
    ) -> IlmClaimResult:
        body = {
            "cancel_reason_type": params.cancel_reason_type,
            "cancel_reason_text": params.cancel_reason_text,
        }
        result = self._post_with_consent(claim, CLOSE_PATH, body, user=user)
        self._apply_close_response(claim, result, user=user)
        from hmis.apps.core.events import BillingEvents

        _publish_safe(
            BillingEvents.DHA_CLAIM_CLOSED,
            _claim_event_payload(
                claim,
                result,
                cancel_reason_type=params.cancel_reason_type,
                cancel_reason_text=params.cancel_reason_text,
            ),
        )
        return result

    # -----------------------------------------------------------------
    # Internal helpers
    # -----------------------------------------------------------------

    def _post_with_consent(
        self,
        claim: Any,
        path: str,
        body: dict[str, Any],
        *,
        user: Any = None,
    ) -> IlmClaimResult:
        consent = resolve_for_claim(claim)
        merged = {"consent_token": consent.token, **body}
        try:
            response = self.client.post(
                path,
                json_body=merged,
                consent_token=consent.token,
                facility=getattr(claim, "facility", None),
                user=user,
            )
        except DHAValidationError as exc:
            msg = (exc.message or "").lower()
            if (
                "no valid active" in msg
                and ("visit" in msg or "claim" in msg)
                and ("submitted" in msg or "closed" in msg or "doesn't exist" in msg)
            ):
                # DHA no longer recognizes this consent token as having an
                # active visit. Clear our local visit-started flag so the
                # frontend re-shows the consent + start-visit flow.
                if getattr(claim, "dha_visit_started_at", None) is not None:
                    claim.dha_visit_started_at = None
                    claim.save(update_fields=["dha_visit_started_at"])
                    logger.info(
                        "Cleared dha_visit_started_at for claim %s — DHA visit no longer active",
                        getattr(claim, "pk", None),
                    )
                raise ConsentTokenExpiredError(
                    "The consent token for this visit is no longer valid on DHA's side. "
                    "Please restart the visit to obtain a fresh authorization token."
                ) from exc
            raise
        return IlmClaimResult(response=response, payload=response.json)

    # -----------------------------------------------------------------
    # Persistence side-effects
    # -----------------------------------------------------------------

    def _apply_visit_response(
        self,
        claim: Any,
        result: IlmClaimResult,
        *,
        params: StartVisitParams,
        user: Any,
    ) -> None:
        if not isinstance(result.payload, dict):
            return
        update_fields: list[str] = []
        auth_code = result.authorization_code
        if auth_code:
            self._link_or_create_consent_token(claim, params, auth_code, user=user)
        external_id = result.payload.get("claim_id") or result.payload.get("dha_claim_id")
        if external_id and hasattr(claim, "dha_external_id"):
            claim.dha_external_id = str(external_id)[:64]
            update_fields.append("dha_external_id")
        if hasattr(claim, "dha_visit_started_at"):
            claim.dha_visit_started_at = timezone.now()
            update_fields.append("dha_visit_started_at")
        self._stamp_dha_status(claim, "VISIT_STARTED", result, update_fields)
        if update_fields:
            claim.save(update_fields=update_fields)

    def _apply_submit_response(self, claim: Any, result: IlmClaimResult, *, user: Any) -> None:
        update_fields: list[str] = []
        if result.status_code < 400 and hasattr(claim, "status"):
            claim.status = "submitted"
            claim.submitted_at = timezone.now()
            if user and hasattr(claim, "submitted_by_id"):
                claim.submitted_by = user
                update_fields.append("submitted_by")
            update_fields += ["status", "submitted_at"]
        payload = result.payload if isinstance(result.payload, dict) else {}
        sha_ref = payload.get("sha_claim_reference") or payload.get("claim_id")
        if sha_ref and hasattr(claim, "sha_claim_reference"):
            claim.sha_claim_reference = str(sha_ref)[:50]
            update_fields.append("sha_claim_reference")
        self._stamp_dha_status(claim, "SUBMITTED", result, update_fields)
        if update_fields:
            claim.save(update_fields=list(set(update_fields)))

    def _apply_close_response(self, claim: Any, result: IlmClaimResult, *, user: Any) -> None:
        if result.status_code >= 400:
            return
        update_fields: list[str] = []
        if hasattr(claim, "status"):
            claim.status = "written_off"
            update_fields.append("status")
        self._stamp_dha_status(claim, "CLOSED", result, update_fields)
        if update_fields:
            claim.save(update_fields=list(set(update_fields)))

    # -----------------------------------------------------------------
    # Intervention persistence helpers
    # -----------------------------------------------------------------

    def _persist_intervention(
        self, claim: Any, intervention_code: str, result: IlmClaimResult
    ) -> None:
        """Persist intervention data from HIE response to SHAClaimIntervention.

        The DHA start-visit payload is frequently sparse and may omit
        intervention-level metadata (document types, tariffs, routing flags).
        This method must therefore be non-destructive: never clear existing
        metadata when keys are absent.
        """
        if result.status_code >= 400:
            return
        try:
            from hmis.apps.billing.models import SHAClaimIntervention
            from hmis.apps.billing.services.ilm_registries_service import IlmRegistriesService

            payload = result.payload if isinstance(result.payload, dict) else {}
            benefit_code = intervention_code.rsplit("-", 1)[0] if "-" in intervention_code else ""

            intervention, _ = SHAClaimIntervention.objects.get_or_create(
                claim=claim,
                intervention_code=intervention_code,
                defaults={
                    "status": SHAClaimIntervention.InterventionStatus.ACTIVE,
                    "benefit_code": str(benefit_code)[:10],
                },
            )

            updates = self._build_intervention_updates_from_payload(
                intervention=intervention,
                payload=payload,
                prefer_existing=False,
            )
            if updates:
                for key, value in updates.items():
                    setattr(intervention, key, value)
                intervention.save(update_fields=list(updates.keys()) + ["updated_at"])

            if self._needs_intervention_enrichment(intervention):
                registry_payload = self._resolve_intervention_payload_from_registries(
                    claim=claim,
                    intervention_code=intervention_code,
                    service=IlmRegistriesService(),
                )
                if registry_payload:
                    fill_updates = self._build_intervention_updates_from_payload(
                        intervention=intervention,
                        payload=registry_payload,
                        prefer_existing=True,
                    )
                    if fill_updates:
                        for key, value in fill_updates.items():
                            setattr(intervention, key, value)
                        intervention.save(update_fields=list(fill_updates.keys()) + ["updated_at"])
        except (
            AttributeError,
            TypeError,
            ValueError,
            RuntimeError,
            OSError,
            AssertionError,
            ImportError,
        ):
            logger.exception(
                "Failed to persist intervention %s for claim %s",
                intervention_code,
                getattr(claim, "pk", None),
            )

    def _build_intervention_updates_from_payload(
        self,
        *,
        intervention: Any,
        payload: dict[str, Any],
        prefer_existing: bool,
    ) -> dict[str, Any]:
        updates: dict[str, Any] = {}

        if getattr(intervention, "status", "") != "active":
            updates["status"] = "active"

        benefit_code = str(getattr(intervention, "benefit_code", "") or "").strip()
        if not benefit_code:
            derived = str(getattr(intervention, "intervention_code", "") or "")
            derived = derived.rsplit("-", 1)[0] if "-" in derived else ""
            if derived:
                updates["benefit_code"] = derived[:10]

        def _set_if_present(field: str, value: Any) -> None:
            if value is None:
                return
            if isinstance(value, str):
                value = value.strip()
                if not value:
                    return
            current = getattr(intervention, field, None)
            if prefer_existing and current not in (None, "", [], {}):
                return
            if current != value:
                updates[field] = value

        def _first(*keys: str) -> Any:
            for key in keys:
                if key in payload and payload.get(key) not in (None, ""):
                    return payload.get(key)
            return None

        _set_if_present(
            "intervention_name",
            str(
                _first(
                    "intervention_name",
                    "interventionName",
                    "name",
                    "display_name",
                    "displayName",
                )
                or ""
            )[:255],
        )
        _set_if_present(
            "dha_intervention_id",
            str(_first("id", "intervention_id", "interventionId") or "")[:64],
        )
        payment_mechanism = _first(
            "paymentMechanism",
            "payment_mechanism",
            "intervention_payment_mechanism",
        )
        _set_if_present(
            "payment_mechanism",
            self._normalize_payment_mechanism(str(payment_mechanism or ""))[:20],
        )
        _set_if_present(
            "access_point",
            str(_first("accessPoint", "access_point") or "").upper()[:4],
        )
        _set_if_present("fund", str(_first("fund") or "")[:128])
        _set_if_present(
            "intervention_fund",
            str(_first("interventionFund", "intervention_fund") or "")[:128],
        )
        _set_if_present(
            "supported_scheme",
            str(_first("supportedScheme", "supported_scheme") or "")[:128],
        )

        schemes = payload.get("schemes")
        if isinstance(schemes, list):
            normalized_schemes = [str(value).strip() for value in schemes if str(value).strip()]
            if normalized_schemes:
                _set_if_present("schemes", normalized_schemes)

        if payload:
            _set_if_present("intervention_payload", payload)

        # Do not erase required docs when the response omits the field.
        docs_present = any(
            key in payload
            for key in (
                "document_types",
                "required_document_types",
                "applicable_document_types",
                "applicableDocumentTypes",
            )
        )
        if docs_present:
            docs: list[str] = []
            for key in (
                "required_document_types",
                "applicable_document_types",
                "applicableDocumentTypes",
                "document_types",
            ):
                candidate = payload.get(key)
                if not isinstance(candidate, list):
                    continue
                for item in candidate:
                    value = str(item or "").strip().upper()
                    if value and value not in docs:
                        docs.append(value)
            current_docs = list(getattr(intervention, "required_document_types", []) or [])
            if (not prefer_existing or not current_docs) and current_docs != docs:
                updates["required_document_types"] = docs

        tariff_present = any(
            key in payload
            for key in (
                "tariff_amount",
                "tariffAmount",
                "overall_tariff",
                "overallTariff",
                "intervention_overall_tariff",
                "keph_level_tariff",
                "keph_level_tarrif",
            )
        )
        if tariff_present:
            tariff_amount = _first(
                "tariff_amount",
                "tariffAmount",
                "overall_tariff",
                "overallTariff",
                "intervention_overall_tariff",
                "keph_level_tariff",
                "keph_level_tarrif",
            )
            if tariff_amount not in (None, ""):
                _set_if_present("tariff_amount", tariff_amount)

        for level_field, payload_key in (
            ("level2_tariff", "level2Tariff"),
            ("level3_tariff", "level3Tariff"),
            ("level4_tariff", "level4Tariff"),
            ("level5_tariff", "level5Tariff"),
            ("level6_tariff", "level6Tariff"),
        ):
            if payload_key in payload and payload.get(payload_key) not in (None, ""):
                _set_if_present(level_field, payload.get(payload_key))

        bool_fields = (
            ("needs_preauth", ("needsPreauth", "needs_preauth")),
            (
                "needs_manual_preauth_approval",
                ("needsManualPreauthApproval", "needs_manual_preauth_approval"),
            ),
            (
                "is_surgical_preauth",
                ("isSurgicalPreauth", "is_surgical_preauth", "requires_surgical_preauth"),
            ),
            (
                "is_renal_preauth",
                ("isRenalPreauth", "is_renal_preauth", "requires_renal_preauth"),
            ),
            (
                "is_oncology_preauth",
                ("isOncologyPreauth", "is_oncology_preauth", "requires_oncology_preauth"),
            ),
            (
                "is_imaging_preauth",
                (
                    "isImagingPreauth",
                    "is_imaging_preauth",
                    "requires_imaging_preauth",
                    "requires_radiology_preauth",
                ),
            ),
            (
                "is_optical_preauth",
                ("isOpticalPreauth", "is_optical_preauth", "requires_optical_preauth"),
            ),
        )
        for bool_field, keys in bool_fields:
            value = self._coerce_bool(_first(*keys))
            if value is not None:
                current = bool(getattr(intervention, bool_field))
                if (not prefer_existing or not current) and current != value:
                    updates[bool_field] = value

        return updates

    @staticmethod
    def _coerce_bool(value: Any) -> bool | None:
        if value is None:
            return None
        if isinstance(value, bool):
            return value
        if isinstance(value, (int, float)):
            return bool(value)
        if isinstance(value, str):
            normalized = value.strip().lower()
            if normalized in {"true", "1", "yes", "y"}:
                return True
            if normalized in {"false", "0", "no", "n"}:
                return False
        return None

    @staticmethod
    def _normalize_payment_mechanism(value: str) -> str:
        normalized = value.strip().upper().replace("-", " ").replace("_", " ")
        if not normalized:
            return ""
        if normalized in {"FEE FOR SERVICE", "FIXED FEE FOR SERVICE"}:
            return "FEE_FOR_SERVICE"
        if normalized == "PER DIEM":
            return "PER_DIEM"
        if normalized == "CAPITATION":
            return "CAPITATION"
        return normalized.replace(" ", "_")

    @staticmethod
    def _needs_intervention_enrichment(intervention: Any) -> bool:
        docs_missing = not list(getattr(intervention, "required_document_types", []) or [])
        tariff_missing = getattr(intervention, "tariff_amount", None) is None and all(
            getattr(intervention, field, None) is None
            for field in (
                "level2_tariff",
                "level3_tariff",
                "level4_tariff",
                "level5_tariff",
                "level6_tariff",
            )
        )
        return docs_missing or tariff_missing

    def _resolve_intervention_payload_from_registries(
        self,
        *,
        claim: Any,
        intervention_code: str,
        service: Any,
    ) -> dict[str, Any] | None:
        patient_id = self._resolve_patient_cr_number(claim)
        if not patient_id:
            return None

        parent_benefit_code = (
            intervention_code.rsplit("-", 1)[0] if "-" in intervention_code else ""
        )
        if not parent_benefit_code:
            return None

        try:
            sub_result = service.fetch_sub_benefits(
                patient_id=patient_id,
                parent_benefit_code=parent_benefit_code,
                patient=getattr(claim, "patient", None),
                sha_member=getattr(claim, "sha_member", None),
                facility=getattr(claim, "facility", None),
                user=None,
            )
            sub_codes: list[str] = []
            for item in self._extract_ilm_results(getattr(sub_result, "payload", None)):
                code = str(
                    item.get("subBenefitCode")
                    or item.get("sub_benefit_code")
                    or item.get("code")
                    or ""
                ).strip()
                if code and code not in sub_codes:
                    sub_codes.append(code)

            for sub_code in sub_codes[:25]:
                interventions_result = service.fetch_benefit_interventions(
                    patient_id=patient_id,
                    sub_benefit_code=sub_code,
                    patient=getattr(claim, "patient", None),
                    sha_member=getattr(claim, "sha_member", None),
                    facility=getattr(claim, "facility", None),
                    user=None,
                )
                for payload in self._extract_ilm_results(
                    getattr(interventions_result, "payload", None)
                ):
                    code = str(
                        payload.get("code")
                        or payload.get("interventionCode")
                        or payload.get("intervention_code")
                        or ""
                    ).strip()
                    if code == intervention_code:
                        return payload
        except (
            AttributeError,
            TypeError,
            ValueError,
            RuntimeError,
            OSError,
            AssertionError,
            ImportError,
        ):
            logger.warning(
                "Intervention metadata enrichment failed (fail-open) for claim=%s code=%s",
                getattr(claim, "pk", None),
                intervention_code,
                exc_info=True,
            )
        return None

    @staticmethod
    def _extract_ilm_results(payload: Any) -> list[dict[str, Any]]:
        queue: list[Any] = [payload]
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
    def _resolve_patient_cr_number(claim: Any) -> str:
        patient_cr = (
            str(getattr(getattr(claim, "patient", None), "cr_number", "") or "").strip().upper()
        )
        if _CR_NUMBER_RE.match(patient_cr):
            return patient_cr

        sha_number = (
            str(getattr(getattr(claim, "sha_member", None), "sha_number", "") or "").strip().upper()
        )
        if sha_number.startswith("SHA-"):
            candidate = f"CR{sha_number[4:]}"
            if _CR_NUMBER_RE.match(candidate):
                return candidate
        if _CR_NUMBER_RE.match(sha_number):
            return sha_number
        return ""

    def _update_intervention_status(
        self, claim: Any, intervention_code: str, new_status: str
    ) -> None:
        """Update status of a persisted intervention."""
        try:
            from hmis.apps.billing.models import SHAClaimIntervention

            SHAClaimIntervention.objects.filter(
                claim=claim,
                intervention_code=intervention_code,
            ).update(
                status=new_status,
                preview_missing_streak=0,
                auto_retired_by_omission=False,
                last_seen_in_preview_at=timezone.now(),
            )
        except (
            AttributeError,
            TypeError,
            ValueError,
            RuntimeError,
            OSError,
            AssertionError,
            ImportError,
        ):
            logger.exception(
                "Failed to update intervention status %s → %s for claim %s",
                intervention_code,
                new_status,
                getattr(claim, "pk", None),
            )

    # -----------------------------------------------------------------
    # Event helpers
    # -----------------------------------------------------------------

    def _emit_intervention_event(self, claim: Any, result: IlmClaimResult, **extra: Any) -> None:
        from hmis.apps.core.events import BillingEvents

        _publish_safe(
            BillingEvents.DHA_CLAIM_INTERVENTION_CHANGED,
            _claim_event_payload(claim, result, **extra),
        )

    def _emit_diagnosis_event(self, claim: Any, result: IlmClaimResult, **extra: Any) -> None:
        from hmis.apps.core.events import BillingEvents

        _publish_safe(
            BillingEvents.DHA_CLAIM_DIAGNOSIS_CHANGED,
            _claim_event_payload(claim, result, **extra),
        )

    def _emit_line_event(self, claim: Any, result: IlmClaimResult, **extra: Any) -> None:
        from hmis.apps.core.events import BillingEvents

        _publish_safe(
            BillingEvents.DHA_CLAIM_LINE_CHANGED,
            _claim_event_payload(claim, result, **extra),
        )

    def _emit_attachment_event(self, claim: Any, result: IlmClaimResult, **extra: Any) -> None:
        from hmis.apps.core.events import BillingEvents

        _publish_safe(
            BillingEvents.DHA_CLAIM_ATTACHMENT_CHANGED,
            _claim_event_payload(claim, result, **extra),
        )

    def _stamp_dha_status(
        self,
        claim: Any,
        status: str,
        result: IlmClaimResult,
        update_fields: list[str],
    ) -> None:
        if hasattr(claim, "last_dha_status"):
            claim.last_dha_status = status
            update_fields.append("last_dha_status")
        if hasattr(claim, "last_dha_payload_at"):
            claim.last_dha_payload_at = timezone.now()
            update_fields.append("last_dha_payload_at")
        if hasattr(claim, "dha_correlation_id"):
            cid = result.response.headers.get("X-Correlation-Id", "")
            if cid:
                claim.dha_correlation_id = cid[:64]
                update_fields.append("dha_correlation_id")

    def _link_or_create_consent_token(
        self,
        claim: Any,
        params: StartVisitParams,
        token: str,
        *,
        user: Any,
    ) -> None:
        """Link the encounter to the consent token used to start the visit.

        For biometric flow the original biometric consent token (matched by
        auth_guid) must remain the active token; start_visit's authorization_code
        is not a consent token and must not replace it.

        For OTP flow the pending OTP token for this patient/member is validated
        and linked to the encounter.
        """
        try:
            from hmis.apps.billing.models import ConsentToken
        except ImportError:  # pragma: no cover
            return
        encounter = getattr(claim, "encounter", None)
        if encounter is None:
            return

        consent = None
        if params.auth_guid:
            # Biometric: match the token that was authorized with this auth_guid.
            consent = (
                ConsentToken.objects.filter(
                    auth_guid=params.auth_guid,
                    consent_method=ConsentToken.ConsentMethod.BIOMETRIC,
                )
                .order_by("-created_at")
                .first()
            )
            logger.info(
                "_link_or_create_consent_token biometric auth_guid=%s matched=%s",
                params.auth_guid,
                consent.pk if consent else None,
            )
            # Fallback: any validated biometric token for this patient/member.
            if consent is None:
                consent = (
                    ConsentToken.objects.filter(
                        patient=claim.patient,
                        sha_member=claim.sha_member,
                        consent_method=ConsentToken.ConsentMethod.BIOMETRIC,
                        status=ConsentToken.ConsentStatus.VALIDATED,
                    )
                    .order_by("-validated_at")
                    .first()
                )
                logger.info(
                    "_link_or_create_consent_token biometric fallback patient=%s matched=%s",
                    getattr(claim.patient, "pk", None),
                    consent.pk if consent else None,
                )
        elif params.otp:
            # OTP: match a pending OTP token for this patient/member.
            consent = (
                ConsentToken.objects.filter(
                    patient=claim.patient,
                    sha_member=claim.sha_member,
                    consent_method=ConsentToken.ConsentMethod.OTP,
                )
                .filter(
                    models.Q(status=ConsentToken.ConsentStatus.PENDING)
                    | models.Q(status=ConsentToken.ConsentStatus.VALIDATED)
                )
                .order_by("-created_at")
                .first()
            )
            logger.info(
                "_link_or_create_consent_token otp matched=%s",
                consent.pk if consent else None,
            )

        if consent:
            update_fields: list[str] = []
            if consent.status != ConsentToken.ConsentStatus.VALIDATED:
                consent.status = ConsentToken.ConsentStatus.VALIDATED
                update_fields.append("status")
            # OTP: the authorization_code returned by start_visit becomes
            # the consent_token for all subsequent calls (add_intervention,
            # submit, etc.). Always store the latest token from DHA.
            if token and consent.consent_token != token:
                consent.consent_token = token
                update_fields.append("consent_token")
            if not consent.validated_at:
                consent.validated_at = timezone.now()
                update_fields.append("validated_at")
            if update_fields:
                consent.save(update_fields=update_fields)
            if consent.encounter_id != encounter.pk:
                consent.encounter = encounter
                consent.save(update_fields=["encounter"])
            # Ensure no stale tokens (e.g. old authorization_code tokens from a
            # previous start_visit bug) are linked to this encounter.
            deleted, _ = (
                ConsentToken.objects.filter(encounter=encounter).exclude(pk=consent.pk).delete()
            )
            if deleted:
                logger.info(
                    "_link_or_create_consent_token deleted %s stale token(s) for encounter=%s",
                    deleted,
                    encounter.pk,
                )
            return

        # Fallback: create a new validated token (emergency/no prior consent flow).
        ConsentToken.objects.create(
            patient=claim.patient,
            sha_member=claim.sha_member,
            encounter=encounter,
            facility=getattr(claim, "facility", None),
            consent_method=ConsentToken.ConsentMethod.OTP,
            status=ConsentToken.ConsentStatus.VALIDATED,
            identification_number=getattr(claim.patient, "national_id", "") or "",
            consent_token=token,
            validated_at=timezone.now(),
            created_by=user or claim.created_by,
        )
