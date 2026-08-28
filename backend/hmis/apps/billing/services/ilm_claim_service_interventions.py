# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
# ruff: noqa
"""
What this file is for: ILM intervention and virtual-claim-line mixin methods.
How to use: mixed into IlmClaimService in split ILM claim service core module.
Supported inputs/args: instance methods for intervention/virtual line DHA endpoints.
"""

from hmis.apps.billing.services.ilm_claim_service_shared import *  # noqa: F403


class IlmClaimInterventionsMixin:
    def add_intervention(
        self, claim: Any, intervention_code: str, *, user: Any = None
    ) -> IlmClaimResult:
        # Capitated codes (SHA-12-xxx, SHA-08-001/002/003) are not supported
        # by DHA's standard interventions endpoint. Redirect to the virtual
        # claim line endpoint which handles them correctly.
        CAPITATED_PREFIXES = ("SHA-12-", "SHA-08-001", "SHA-08-002", "SHA-08-003")
        if any(intervention_code.startswith(p) for p in CAPITATED_PREFIXES):
            logger.info(
                "Redirecting capitated code %s to virtual claim line endpoint for claim %s.",
                intervention_code,
                getattr(claim, "pk", None),
            )
            return self.add_virtual_claim_line(
                claim, intervention_code=intervention_code, user=user
            )

        result = self._post_with_consent(
            claim,
            INTERVENTIONS_PATH,
            {"intervention_code": intervention_code},
            user=user,
        )
        self._persist_intervention(claim, intervention_code, result)
        self._emit_intervention_event(
            claim, result, action="added", intervention_code=intervention_code
        )
        return result

    def switch_intervention(
        self,
        claim: Any,
        *,
        existing_intervention_code: str,
        new_intervention_code: str,
        retain_bill_items: bool = False,
        bill_from: str | None = None,
        bill_to: str | None = None,
        user: Any = None,
    ) -> IlmClaimResult:
        body: dict[str, Any] = {
            "existing_intervention_code": existing_intervention_code,
            "new_intervention_code": new_intervention_code,
            "retain_bill_items": retain_bill_items,
        }
        if retain_bill_items:
            if not (bill_from and bill_to):
                raise ValueError("bill_from and bill_to are required when retain_bill_items=True")
            body["bill_from"] = bill_from
            body["bill_to"] = bill_to
        result = self._post_with_consent(claim, INTERVENTION_SWITCH_PATH, body, user=user)
        self._emit_intervention_event(
            claim,
            result,
            action="switched",
            existing_intervention_code=existing_intervention_code,
            new_intervention_code=new_intervention_code,
        )
        return result

    def restore_intervention(
        self, claim: Any, intervention_code: str, *, user: Any = None
    ) -> IlmClaimResult:
        result = self._post_with_consent(
            claim,
            INTERVENTION_RESTORE_PATH,
            {"intervention_code": intervention_code},
            user=user,
        )
        self._update_intervention_status(claim, intervention_code, "active")
        self._emit_intervention_event(
            claim, result, action="restored", intervention_code=intervention_code
        )
        return result

    def retire_intervention(
        self, claim: Any, intervention_code: str, *, user: Any = None
    ) -> IlmClaimResult:
        result = self._post_with_consent(
            claim,
            INTERVENTION_RETIRE_PATH,
            {"intervention_code": intervention_code},
            user=user,
        )
        self._update_intervention_status(claim, intervention_code, "retired")
        self._emit_intervention_event(
            claim, result, action="retired", intervention_code=intervention_code
        )
        return result

    # -----------------------------------------------------------------
    # PHC virtual claim line (DHA user-journey Scenario C)
    # -----------------------------------------------------------------

    def add_virtual_claim_line(
        self,
        claim: Any,
        *,
        intervention_code: str,
        service_name: str | None = None,
        service_identifier: str | None = None,
        unit_price: str | None = None,
        quantity: str | None = None,
        scheme_code: str | None = None,
        extra: dict[str, Any] | None = None,
        user: Any = None,
    ) -> IlmClaimResult:
        """Add a PHC (Primary Healthcare Fund) virtual claim line.

        Used by Level 2/3 facilities for capitation and basic
        fee-for-service interventions. Skips preauthorization — direct
        submission after consent is sufficient. See DHA HIE user-journey
        Scenario C.
        """
        if unit_price is None:
            try:
                from hmis.apps.billing.models import SHATariff

                tariff = SHATariff.objects.filter(code=intervention_code, is_active=True).first()
                if tariff is not None:
                    unit_price = str(tariff.sha_amount)
                else:
                    unit_price = "0.01"
            except (
                AttributeError,
                TypeError,
                ValueError,
                RuntimeError,
                OSError,
                AssertionError,
                ImportError,
            ):
                unit_price = "0.01"
        if quantity is None:
            quantity = "1"
        body: dict[str, Any] = {
            "intervention_code": intervention_code,
            "unit_price": unit_price,
            "quantity": quantity,
        }
        if service_name is not None:
            body["service_name"] = service_name
        if service_identifier is not None:
            body["service_identifier"] = service_identifier
        if scheme_code is not None:
            body["scheme_code"] = scheme_code
        if extra:
            body.update(extra)
        result = self._post_with_consent(claim, VIRTUAL_CLAIM_LINE_PATH, body, user=user)
        self._emit_intervention_event(
            claim,
            result,
            action="virtual_line_added",
            intervention_code=intervention_code,
            phc=True,
        )
        return result

    # -----------------------------------------------------------------
    # Diagnoses
    # -----------------------------------------------------------------
