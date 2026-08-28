# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
# ruff: noqa
"""
What this file is for: ILM visit and intervention transition mixin methods.
How to use: mixed into IlmClaimService in split ILM claim service core module.
Supported inputs/args: instance methods for visit start and intervention lifecycle actions.
"""

from hmis.apps.billing.services.ilm_claim_service_shared import *  # noqa: F403
from hmis.apps.billing.services.ilm_claim_service_shared import (
    _claim_event_payload,
    _normalise_regulator,
    _publish_safe,
)


class IlmClaimVisitMixin:
    def __init__(self, client: IlmClient | None = None, *, facility: Any = None) -> None:
        self.client = client or IlmClient(facility=facility)

    # -----------------------------------------------------------------
    # Start Visit (the only call that does NOT take a consent_token —
    # it RETURNS the authorization_code that becomes the consent_token).
    # -----------------------------------------------------------------

    def start_visit(
        self,
        claim: Any,
        params: StartVisitParams,
        *,
        user: Any = None,
    ) -> IlmClaimResult:
        if (
            getattr(claim, "dha_visit_started_at", None) is not None
            and not params.reuse_existing_consent
        ):
            if self._has_active_remote_visit(claim, user=user):
                raise VisitAlreadyOpenedError(
                    "DHA visit is already active for this claim. "
                    "Reuse the existing session or restart the visit if needed."
                )

        # DHA accepts either otp (OTP consent) or auth_guid (biometric consent).
        # If neither is provided but the claim already has a valid encounter-
        # linked consent token, allow a local visit reactivation path.
        if params.otp and params.auth_guid:
            raise ValueError("Provide either otp or auth_guid, not both")

        if not params.otp and not params.auth_guid:
            try:
                consent = resolve_for_claim(claim)
            except (ConsentTokenNotFoundError, ConsentTokenExpiredError) as exc:
                raise ValueError("Either otp or auth_guid must be provided") from exc

            if consent.expires_at is None and not self._has_active_remote_visit(claim, user=user):
                raise ValueError(
                    "Existing consent token has no local expiry and DHA visit is not active. "
                    "Provide otp or auth_guid to open a fresh visit."
                )

            update_fields: list[str] = []
            if hasattr(claim, "dha_visit_started_at"):
                claim.dha_visit_started_at = timezone.now()
                update_fields.append("dha_visit_started_at")
            if update_fields:
                claim.save(update_fields=update_fields)

            payload = {
                "message": "Existing validated consent reused; visit marked active.",
                "consent_token": consent.token,
                "authorization_code": consent.token,
                "reused_existing_consent": True,
            }
            return IlmClaimResult(
                response=IlmResponse(status_code=200, headers={}, json=payload),
                payload=payload,
            )

        # ---------------------------------------------------------------
        # Capitated codes (SHA-12-xxx / SHA-08-001/002/003) are handled by
        # the middleware under service_type "CAPITATION". Non-capitated
        # visits use the caller's service type. Mixed lists fall back to
        # filtering capitated codes out to avoid "not supported for service
        # type OUTPATIENT" errors.
        # ---------------------------------------------------------------
        CAPITATED_PREFIXES = ("SHA-12-", "SHA-08-001", "SHA-08-002", "SHA-08-003")
        all_capitated = bool(params.intervention_codes) and all(
            any(c.startswith(p) for p in CAPITATED_PREFIXES) for c in params.intervention_codes
        )
        if all_capitated:
            codes = list(params.intervention_codes)
            service_type = "CAPITATION"
        else:
            codes = [
                c
                for c in params.intervention_codes
                if not any(c.startswith(p) for p in CAPITATED_PREFIXES)
            ]
            if not codes and params.intervention_codes:
                codes = ["SHA-06-001"]
            service_type = params.service_type

        body: dict[str, Any] = {
            "patient_id": params.patient_id,
            "intervention_codes": codes,
            "service_type": service_type,
        }
        if params.otp:
            body["otp"] = params.otp
        else:
            body["auth_guid"] = params.auth_guid
        if service_type.upper() == "INPATIENT":
            if not params.admission_date:
                raise ValueError("admission_date is required for INPATIENT visits")
            body["admission_date"] = params.admission_date
            if params.estimated_days_of_admission is not None:
                body["estimated_days_of_admission"] = params.estimated_days_of_admission

        # Practitioner details (DHA 2026-06 requirement: every claim needs a doctor)
        if params.practitioner_identification_number:
            body["practitioner_identification_number"] = params.practitioner_identification_number
            body["practitioner_identification_type"] = (
                params.practitioner_identification_type or "National ID"
            )
            body["practitioner_regulation_body"] = _normalise_regulator(
                params.practitioner_regulation_body
            )

        # Sandbox biometric — skip DHA call, create a mock session locally.
        # In sandbox the biometric auth_guid is randomly generated (not from DHA),
        # so DHA's start_visit would reject it as unrecognised. OTP visits always
        # call DHA (the OTP was issued by DHA and is valid).
        is_sandbox_biometric = (
            params.auth_guid and getattr(settings, "ENVIRONMENT", "development") != "production"
        )
        if is_sandbox_biometric:
            # In non-production environments biometric auth_guid is randomly
            # generated (no fingerprint scanner). We cannot call DHA with it
            # because DHA has no matching biometric session. Instead, fall
            # through to the real DHA call using OTP, or if no OTP is
            # available, make a real call with the auth_guid anyway — DHA
            # UAT may accept it.
            import os
            import uuid

            is_uat = os.environ.get("DHA_HIE_IS_UAT", "").lower() in ("1", "true", "yes")
            # In UAT with DHA connectivity, always attempt the real DHA call.
            # The sandbox UUID shortcut was preventing real visit creation.
            if is_uat and params.otp:
                # OTP flow — call DHA with real OTP (validated earlier).
                logger.info(
                    "Sandbox biometric with OTP for claim %s — calling real DHA start_visit",
                    getattr(claim, "pk", None),
                )
                # Fall through to the real DHA call below.
            elif is_uat:
                # Biometric-only in UAT — DHA may reject the fake auth_guid,
                # but try anyway since OTP isn't available.
                logger.warning(
                    "Sandbox biometric without OTP for claim %s — "
                    "attempting real DHA call with fake auth_guid (may fail)",
                    getattr(claim, "pk", None),
                )
                # Fall through to the real DHA call below.
            else:
                # Local dev (no DHA connectivity) — mock the entire call.
                fake_auth_code = str(uuid.uuid4())
                fake_response = IlmResponse(
                    status_code=200,
                    headers={},
                    json={"authorization_code": fake_auth_code, "status": "success"},
                    text=('{"authorization_code":"' + fake_auth_code + '","status":"success"}'),
                    elapsed_ms=0,
                )
                result = IlmClaimResult(response=fake_response, payload=fake_response.json)
                self._apply_visit_response(claim, result, params=params, user=user)
                for code in codes:
                    self._persist_intervention(claim, code, result)
                from hmis.apps.core.events import BillingEvents

                _publish_safe(
                    BillingEvents.DHA_CLAIM_VISIT_STARTED,
                    _claim_event_payload(
                        claim,
                        result,
                        service_type=params.service_type,
                        intervention_codes=list(params.intervention_codes),
                        authorization_code=fake_auth_code,
                    ),
                )
                logger.info(
                    "Sandbox start_visit for claim %s — auth_code=%s",
                    getattr(claim, "pk", None),
                    fake_auth_code,
                )
                return result

        # Use the Keycloak OAuth2 Bearer token for start_visit; the ILM
        # middleware accepts it (unlike the self-signed HS256 JWT which
        # it cannot verify).
        response = self.client.post(
            VISIT_PATH,
            json_body=body,
            facility=getattr(claim, "facility", None),
            user=user,
        )
        result = IlmClaimResult(response=response, payload=response.json)
        self._apply_visit_response(claim, result, params=params, user=user)
        # Persist the intervention codes locally so the claim reflects the
        # active interventions immediately after visit start.
        for code in codes:
            self._persist_intervention(claim, code, result)
        from hmis.apps.core.events import BillingEvents

        _publish_safe(
            BillingEvents.DHA_CLAIM_VISIT_STARTED,
            _claim_event_payload(
                claim,
                result,
                service_type=params.service_type,
                intervention_codes=list(params.intervention_codes),
                authorization_code=result.authorization_code,
            ),
        )
        return result

    def _has_active_remote_visit(self, claim: Any, *, user: Any = None) -> bool:
        """Probe DHA preview to confirm whether the current visit is still active."""
        try:
            result = self._post_with_consent(claim, PREVIEW_PATH, {}, user=user)
        except (ConsentTokenNotFoundError, ConsentTokenExpiredError):
            return False
        except (
            AttributeError,
            TypeError,
            ValueError,
            RuntimeError,
            OSError,
            AssertionError,
            ImportError,
        ) as exc:  # noqa: BLE001 - fail open to avoid blocking valid retries
            logger.warning(
                "Unable to probe DHA visit activity for claim %s: %s",
                getattr(claim, "pk", None),
                exc,
            )
            return False
        return result.status_code < 400

    # -----------------------------------------------------------------
    # Interventions
    # -----------------------------------------------------------------
