# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
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
from datetime import UTC, date, datetime, time
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
from .slade_auth import SladeAuthService

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


class Slade360Adapter(InsuranceApiAdapter):
    """HealthCloud by Slade360 adapter.

    Implements core operations required for private-insurance execution:
    eligibility, claim submit, remittance fetch, plus HealthCloud-specific
    helpers for OTP, visit authorization, reservations, invoice and credit notes.
    """

    def __init__(self, config: InsuranceProviderConfig) -> None:
        super().__init__(config)
        self.client = InsuranceHttpClient.from_config(config)
        self.auth_service = SladeAuthService(config)
        self.payer_slade_code = config.payer_slade_code

    def verify_eligibility(self, enrollment: PatientInsurance) -> EligibilityResult:
        if not self.payer_slade_code:
            raise InsuranceNotConfiguredError(
                "payer_slade_code is required for HealthCloud eligibility calls",
                provider_code=getattr(self.config.provider, "code", None),
            )

        response = self.client.get(
            "/beneficiaries/member_eligibility/",
            params={
                "member_number": enrollment.member_number,
                "payer_slade_code": self.payer_slade_code,
            },
            headers=self.auth_service.get_auth_headers(),
            host="provider_edi",
        )
        data: dict[str, Any] = response.json or {}
        member = data.get("member", {}) if isinstance(data.get("member"), dict) else {}
        cover = data.get("cover", {}) if isinstance(data.get("cover"), dict) else {}
        benefits = data.get("benefits", []) if isinstance(data.get("benefits"), list) else []

        eligible = bool(member.get("isActive", False)) and bool(member.get("isEnrolled", False))
        status = str(cover.get("status") or "")
        plan_name = str(cover.get("schemeName") or "")

        balance = None
        copay = None
        if benefits:
            first = benefits[0] if isinstance(benefits[0], dict) else {}
            if first.get("availableBalance") is not None:
                balance = Decimal(str(first.get("availableBalance")))
            if first.get("copayType") == "PERCENTAGE" and first.get("copayValue") is not None:
                copay = Decimal(str(first.get("copayValue")))

        return EligibilityResult(
            eligible=eligible,
            member_number=str(member.get("beneficiaryCode") or enrollment.member_number),
            member_name=str(member.get("names") or ""),
            plan_name=plan_name,
            status=status,
            copay_percent=copay,
            annual_balance=balance,
            valid_from=_parse_date(cover.get("validFrom")),
            valid_to=_parse_date(cover.get("validTo")),
            message="Eligibility retrieved from HealthCloud",
            raw_response=data,
        )

    def submit_preauth(self, preauth: InsurancePreauth) -> PreauthResult:  # noqa: ARG002
        return PreauthResult(
            success=False,
            message="HealthCloud preauthorization endpoint is not available in current public API set.",
        )

    def check_preauth_status(self, preauth: InsurancePreauth) -> PreauthResult:
        return PreauthResult(
            success=True,
            external_preauth_id=preauth.external_preauth_id or "",
            status=preauth.status,
            message="No HealthCloud preauth status endpoint configured.",
        )

    def submit_claim(self, claim: InsuranceClaim) -> ClaimResult:
        member_number = ""
        if claim.patient_insurance:
            member_number = claim.patient_insurance.member_number

        # HealthCloud spec: for Slade-authorized visits, use auth_token as member_number.
        try:
            from hmis.apps.insurance.models import InsuranceVisitAuthorization

            authorization = (
                InsuranceVisitAuthorization.objects.filter(
                    facility=self.config.facility,
                    patient=claim.patient,
                    status__in=[
                        InsuranceVisitAuthorization.Status.AUTHORIZED,
                        InsuranceVisitAuthorization.Status.VALIDATED,
                    ],
                )
                .exclude(auth_token="")
                .order_by("-updated_at", "-created_at")
                .first()
            )
            if authorization and authorization.auth_token:
                member_number = authorization.auth_token
        except Exception:  # pragma: no cover - best effort fallback
            logger.exception("Failed resolving HealthCloud auth token for claim payload")

        visit_start_dt = datetime.combine(claim.service_date, time.min, tzinfo=UTC)
        visit_end_source = claim.discharge_date or claim.service_date
        visit_end_dt = datetime.combine(visit_end_source, time.max, tzinfo=UTC)
        payload = {
            "payer_code": self.payer_slade_code,
            "payer_name": claim.provider.name if claim.provider else "",
            "patient_name": f"{claim.patient.first_name} {claim.patient.last_name}"
            if claim.patient
            else "",
            "member_number": member_number,
            "scheme_name": claim.patient_insurance.plan.name
            if claim.patient_insurance and claim.patient_insurance.plan
            else "",
            "visit_number": claim.encounter.id if claim.encounter_id else claim.claim_number,
            "visit_start": visit_start_dt.isoformat().replace("+00:00", "Z"),
            "visit_end": visit_end_dt.isoformat().replace("+00:00", "Z"),
            "icd10_codes": [
                {"code": code, "name": code} for code in (claim.diagnosis_codes or []) if code
            ],
        }
        response = self.client.post(
            "/claims/",
            json_body=payload,
            headers=self.auth_service.get_auth_headers(),
            host="provider_is",
        )
        data: dict[str, Any] = response.json or {}
        return ClaimResult(
            success=True,
            external_claim_id=str(data.get("id") or data.get("claim_id") or ""),
            status=str(data.get("workflow_state") or data.get("status") or "SUBMITTED"),
            message="Claim submitted to HealthCloud",
            raw_response=data,
        )

    def check_claim_status(self, claim: InsuranceClaim) -> ClaimResult:
        return ClaimResult(
            success=True,
            external_claim_id=claim.external_claim_id or "",
            status=claim.status,
            message="HealthCloud claim status polling is not yet wired.",
        )

    def fetch_remittances(self, date_from: date, date_to: date) -> list[RemittanceResult]:
        response = self.client.get(
            "/remittances/",
            params={"date_from": date_from.isoformat(), "date_to": date_to.isoformat()},
            headers=self.auth_service.get_auth_headers(),
            host="provider_edi",
        )
        body = response.json or []
        out: list[RemittanceResult] = []
        if not isinstance(body, list):
            return out
        for row in body:
            if not isinstance(row, dict):
                continue
            out.append(
                RemittanceResult(
                    success=True,
                    remittance_number=str(row.get("id") or row.get("provider") or ""),
                    remittance_date=date_to,
                    total_amount=Decimal(str(row.get("claims_amount") or 0)),
                    payment_reference=str(row.get("payer") or ""),
                    entries=[],
                    raw_response=row,
                )
            )
        return out

    def get_tariff_schedule(self) -> list[TariffEntry]:
        return []

    # ----- HealthCloud-specific workflow helpers (Sprint 1 plumbing) -----

    def request_otp(self, contact_id: int) -> dict[str, Any]:
        response = self.client.post(
            f"/beneficiaries/beneficiary_contacts/{contact_id}/send_otp/",
            headers=self.auth_service.get_auth_headers(),
            host="provider_edi",
        )
        return response.json or {}

    def start_visit(self, payload: dict[str, Any]) -> dict[str, Any]:
        response = self.client.post(
            "/authorizations/start_visit/",
            json_body=payload,
            headers=self.auth_service.get_auth_headers(),
            host="provider_is",
        )
        return response.json or {}

    def validate_authorization(self, payload: dict[str, Any]) -> dict[str, Any]:
        response = self.client.post(
            "/authorizations/validate_authorization_token/",
            json_body=payload,
            headers=self.auth_service.get_auth_headers(),
            host="provider_is",
        )
        return response.json or {}

    def reserve_balance(self, payload: dict[str, Any]) -> dict[str, Any]:
        response = self.client.post(
            "/balances/reservations/reserve_from_authorization/",
            json_body=payload,
            headers=self.auth_service.get_auth_headers(),
            host="provider_edi",
        )
        return response.json or {}

    def submit_invoice(self, payload: dict[str, Any]) -> dict[str, Any]:
        response = self.client.post(
            "/invoices/",
            json_body=payload,
            headers=self.auth_service.get_auth_headers(),
            host="provider_is",
        )
        return response.json or {}

    def submit_credit_note(self, payload: dict[str, Any]) -> dict[str, Any]:
        payload = dict(payload)
        payload.setdefault("invoice_type", "CREDIT_NOTE")
        response = self.client.post(
            "/invoices",
            json_body=payload,
            headers=self.auth_service.get_auth_headers(),
            host="provider_is",
        )
        return response.json or {}

    def upload_claim_attachment(self, payload: dict[str, Any]) -> dict[str, Any]:
        response = self.client.post(
            "/claim_attachments/upload_attachment/",
            json_body=payload,
            headers=self.auth_service.get_auth_headers(),
            host="provider_is",
        )
        return response.json or {}

    def upload_invoice_attachment(self, payload: dict[str, Any]) -> dict[str, Any]:
        response = self.client.post(
            "/invoice_attachments/upload_attachment/",
            json_body=payload,
            headers=self.auth_service.get_auth_headers(),
            host="provider_is",
        )
        return response.json or {}

    def get_claim_remittance(self, claim_id: int | str) -> dict[str, Any]:
        response = self.client.get(
            "/remittances/claim_remittance/",
            params={"claim_id": claim_id},
            headers=self.auth_service.get_auth_headers(),
            host="provider_edi",
        )
        return response.json or {}


# ---------------------------------------------------------------------------
# Adapter registry
# ---------------------------------------------------------------------------

INSURANCE_ADAPTERS: dict[str, type[InsuranceApiAdapter]] = {
    "manual": ManualAdapter,
    "smart_claims": GenericSmartClaimsAdapter,
    "slade360": Slade360Adapter,
    "jubilee": JubileeAdapter,
    "aar": AARAdapter,
    "cic": CICAdapter,
    "britam": BritamAdapter,
}


def get_adapter(config: InsuranceProviderConfig) -> InsuranceApiAdapter:
    """Resolve the correct adapter for a provider config.

    Lookup priority:
    1. HealthCloud enabled → Slade360Adapter
    2. Provider code in registry → named adapter
    3. API enabled → GenericSmartClaimsAdapter
    4. Fallback → ManualAdapter
    """
    if getattr(config, "healthcloud_enabled", False):
        return Slade360Adapter(config)

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
