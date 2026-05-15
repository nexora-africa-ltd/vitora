"""Concrete insurance API adapters.

``ManualAdapter``
    Default for insurers without an API — all operations return
    "not supported" results, and the facility uses CSV/PDF export
    for manual claim submission.

``GenericSmartClaimsAdapter``
    For Kenyan insurers using the Smart/e-Claims platform. Provides
    real API integration for eligibility, claims, and preauth.

Stub adapters for major Kenyan insurers start as ``ManualAdapter``
subclasses and are overridden as API specs become available.
"""

from __future__ import annotations

import logging
from datetime import date
from decimal import Decimal
from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    from hmis.apps.insurance.models import (
        InsuranceClaim,
        InsurancePreauth,
        InsuranceProviderConfig,
        PatientInsurance,
    )

from .base_adapter import InsuranceApiAdapter
from .client import InsuranceHttpClient
from .errors import InsuranceNotConfiguredError
from .results import ClaimResult, EligibilityResult, PreauthResult, RemittanceResult, TariffEntry

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# ManualAdapter — no API, status tracking only
# ---------------------------------------------------------------------------


class ManualAdapter(InsuranceApiAdapter):
    """Default adapter for insurers without API integration.

    All operations return a "not supported" result indicating that the
    operation must be completed manually (phone, portal, CSV export, etc.).
    """

    def verify_eligibility(self, enrollment: PatientInsurance) -> EligibilityResult:
        return EligibilityResult(
            eligible=enrollment.is_valid,
            member_number=enrollment.member_number,
            status=enrollment.status,
            message="Manual verification required — API not configured for this provider.",
        )

    def submit_preauth(self, preauth: InsurancePreauth) -> PreauthResult:  # noqa: ARG002
        return PreauthResult(
            success=False,
            message="Manual submission required — API not configured for this provider.",
        )

    def check_preauth_status(self, preauth: InsurancePreauth) -> PreauthResult:
        return PreauthResult(
            success=True,
            external_preauth_id=preauth.external_preauth_id or "",
            status=preauth.status,
            message="Status must be updated manually — API not configured.",
        )

    def submit_claim(self, claim: InsuranceClaim) -> ClaimResult:  # noqa: ARG002
        return ClaimResult(
            success=False,
            message="Manual submission required — API not configured for this provider.",
        )

    def check_claim_status(self, claim: InsuranceClaim) -> ClaimResult:
        return ClaimResult(
            success=True,
            external_claim_id=claim.external_claim_id or "",
            status=claim.status,
            message="Status must be updated manually — API not configured.",
        )

    def fetch_remittances(
        self,
        date_from: date,  # noqa: ARG002
        date_to: date,  # noqa: ARG002
    ) -> list[RemittanceResult]:
        return []

    def get_tariff_schedule(self) -> list[TariffEntry]:
        return []


# ---------------------------------------------------------------------------
# GenericSmartClaimsAdapter — Smart/e-Claims platform
# ---------------------------------------------------------------------------


class GenericSmartClaimsAdapter(InsuranceApiAdapter):
    """Adapter for insurers using the Smart/e-Claims platform.

    Uses ``InsuranceHttpClient`` for outbound calls. The specific API
    paths and payload shapes follow the Smart Claims v2 spec common
    among Kenyan insurance providers.
    """

    def __init__(self, config: InsuranceProviderConfig) -> None:
        super().__init__(config)
        if not config.api_base_url:
            raise InsuranceNotConfiguredError(
                "API base URL not configured",
                provider_code=config.provider.code if config.provider else None,
            )
        self.client = InsuranceHttpClient.from_config(config)

    def verify_eligibility(self, enrollment: PatientInsurance) -> EligibilityResult:
        response = self.client.post(
            "/eligibility/verify",
            json_body={
                "member_number": enrollment.member_number,
                "provider_code": self.config.provider.code if self.config.provider else "",
            },
        )
        data: dict[str, Any] = response.json or {}
        return EligibilityResult(
            eligible=data.get("eligible", False),
            member_number=data.get("member_number", enrollment.member_number),
            member_name=data.get("member_name", ""),
            plan_name=data.get("plan_name", ""),
            status=data.get("status", ""),
            copay_percent=Decimal(str(data["copay_percent"]))
            if data.get("copay_percent")
            else None,
            annual_balance=Decimal(str(data["balance"])) if data.get("balance") else None,
            valid_from=_parse_date(data.get("valid_from")),
            valid_to=_parse_date(data.get("valid_to")),
            message=data.get("message", ""),
            raw_response=data,
        )

    def submit_preauth(self, preauth: InsurancePreauth) -> PreauthResult:
        response = self.client.post(
            "/preauth/submit",
            json_body={
                "member_number": preauth.patient_insurance.member_number
                if preauth.patient_insurance
                else "",
                "preauth_type": preauth.preauth_type,
                "diagnosis_codes": preauth.diagnosis_codes or [],
                "requested_services": preauth.requested_services or [],
                "estimated_cost": str(preauth.estimated_cost) if preauth.estimated_cost else "0",
                "clinical_notes": preauth.clinical_notes or "",
            },
        )
        data: dict[str, Any] = response.json or {}
        return PreauthResult(
            success=True,
            external_preauth_id=data.get("preauth_id", ""),
            status=data.get("status", "SUBMITTED"),
            approved_amount=Decimal(str(data["approved_amount"]))
            if data.get("approved_amount")
            else None,
            message=data.get("message", ""),
            raw_response=data,
        )

    def check_preauth_status(self, preauth: InsurancePreauth) -> PreauthResult:
        response = self.client.get(
            f"/preauth/{preauth.external_preauth_id}/status",
        )
        data: dict[str, Any] = response.json or {}
        return PreauthResult(
            success=True,
            external_preauth_id=data.get("preauth_id", preauth.external_preauth_id or ""),
            status=data.get("status", ""),
            approved_amount=Decimal(str(data["approved_amount"]))
            if data.get("approved_amount")
            else None,
            rejection_reason=data.get("rejection_reason", ""),
            message=data.get("message", ""),
            raw_response=data,
        )

    def submit_claim(self, claim: InsuranceClaim) -> ClaimResult:
        items = []
        for item in claim.items.all():
            items.append(
                {
                    "service_code": item.service_code,
                    "description": item.service_description,
                    "quantity": item.quantity,
                    "unit_price": str(item.unit_price),
                    "amount": str(item.claimed_amount),
                    "tariff_code": item.tariff_code or "",
                }
            )
        response = self.client.post(
            "/claims/submit",
            json_body={
                "claim_number": claim.claim_number,
                "member_number": claim.patient_insurance.member_number
                if claim.patient_insurance
                else "",
                "claim_type": claim.claim_type,
                "diagnosis_codes": claim.diagnosis_codes or [],
                "service_date": claim.service_date.isoformat() if claim.service_date else "",
                "total_amount": str(claim.total_amount),
                "items": items,
                "preauth_id": claim.external_preauth_id or "",
            },
        )
        data: dict[str, Any] = response.json or {}
        return ClaimResult(
            success=True,
            external_claim_id=data.get("claim_id", ""),
            status=data.get("status", "SUBMITTED"),
            message=data.get("message", ""),
            raw_response=data,
        )

    def check_claim_status(self, claim: InsuranceClaim) -> ClaimResult:
        response = self.client.get(
            f"/claims/{claim.external_claim_id}/status",
        )
        data: dict[str, Any] = response.json or {}
        return ClaimResult(
            success=True,
            external_claim_id=data.get("claim_id", claim.external_claim_id or ""),
            status=data.get("status", ""),
            approved_amount=Decimal(str(data["approved_amount"]))
            if data.get("approved_amount")
            else None,
            paid_amount=Decimal(str(data["paid_amount"])) if data.get("paid_amount") else None,
            rejection_reason=data.get("rejection_reason", ""),
            query_details=data.get("query_details", ""),
            message=data.get("message", ""),
            raw_response=data,
        )

    def fetch_remittances(self, date_from: date, date_to: date) -> list[RemittanceResult]:
        response = self.client.get(
            "/remittances",
            params={"date_from": date_from.isoformat(), "date_to": date_to.isoformat()},
        )
        results: list[RemittanceResult] = []
        for item in response.json or []:
            from .results import RemittanceEntry

            entries = [
                RemittanceEntry(
                    claim_number=e.get("claim_number", ""),
                    member_number=e.get("member_number", ""),
                    paid_amount=Decimal(str(e.get("paid_amount", 0))),
                    deductions=Decimal(str(e.get("deductions", 0))),
                    net_amount=Decimal(str(e.get("net_amount", 0))),
                )
                for e in item.get("entries", [])
            ]
            results.append(
                RemittanceResult(
                    success=True,
                    remittance_number=item.get("remittance_number", ""),
                    remittance_date=_parse_date(item.get("remittance_date")),
                    total_amount=Decimal(str(item.get("total_amount", 0))),
                    payment_reference=item.get("payment_reference", ""),
                    entries=entries,
                    raw_response=item,
                )
            )
        return results

    def get_tariff_schedule(self) -> list[TariffEntry]:
        response = self.client.get("/tariffs")
        return [
            TariffEntry(
                service_code=t.get("service_code", ""),
                payer_code=t.get("payer_code", ""),
                description=t.get("description", ""),
                tariff_amount=Decimal(str(t.get("amount", 0))),
                requires_preauth=t.get("requires_preauth", False),
                effective_from=_parse_date(t.get("effective_from")),
                effective_to=_parse_date(t.get("effective_to")),
            )
            for t in (response.json or [])
        ]


# ---------------------------------------------------------------------------
# Stub adapters for major Kenyan insurers
# ---------------------------------------------------------------------------


class JubileeAdapter(ManualAdapter):
    """Jubilee Insurance — stub, overrides pending API spec."""


class AARAdapter(ManualAdapter):
    """AAR Insurance — stub, overrides pending API spec."""


class CICAdapter(ManualAdapter):
    """CIC Insurance — stub, overrides pending API spec."""


class BritamAdapter(ManualAdapter):
    """Britam Insurance — stub, overrides pending API spec."""


# ---------------------------------------------------------------------------
# Adapter registry
# ---------------------------------------------------------------------------

INSURANCE_ADAPTERS: dict[str, type[InsuranceApiAdapter]] = {
    "manual": ManualAdapter,
    "smart_claims": GenericSmartClaimsAdapter,
    "jubilee": JubileeAdapter,
    "aar": AARAdapter,
    "cic": CICAdapter,
    "britam": BritamAdapter,
}


def get_adapter(config: InsuranceProviderConfig) -> InsuranceApiAdapter:
    """Resolve the correct adapter for a provider config.

    Lookup priority:
    1. Provider code in registry → named adapter
    2. API enabled → GenericSmartClaimsAdapter
    3. Fallback → ManualAdapter
    """
    provider_code = config.provider.code.lower() if config.provider and config.provider.code else ""
    if provider_code in INSURANCE_ADAPTERS:
        return INSURANCE_ADAPTERS[provider_code](config)
    if config.api_enabled and config.api_base_url:
        return GenericSmartClaimsAdapter(config)
    return ManualAdapter(config)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _parse_date(value: str | None) -> date | None:
    if not value:
        return None
    try:
        return date.fromisoformat(str(value)[:10])
    except (ValueError, TypeError):
        return None
