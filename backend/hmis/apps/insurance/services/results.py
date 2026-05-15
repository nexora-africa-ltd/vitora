"""Typed result dataclasses for insurance adapter responses.

These are the return types used by ``InsuranceApiAdapter`` and all concrete
adapters. They provide a uniform interface regardless of the insurer's API
shape.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date, datetime
from decimal import Decimal
from typing import Any


@dataclass
class EligibilityResult:
    """Result of an eligibility/membership verification check."""

    eligible: bool
    member_number: str = ""
    member_name: str = ""
    plan_name: str = ""
    status: str = ""  # e.g. "ACTIVE", "SUSPENDED"
    copay_percent: Decimal | None = None
    annual_limit: Decimal | None = None
    annual_balance: Decimal | None = None
    valid_from: date | None = None
    valid_to: date | None = None
    message: str = ""
    raw_response: dict[str, Any] = field(default_factory=dict)


@dataclass
class PreauthResult:
    """Result of a preauthorization submission or status check."""

    success: bool
    external_preauth_id: str = ""
    status: str = ""  # e.g. "APPROVED", "DENIED", "PENDING"
    approved_amount: Decimal | None = None
    validity_days: int | None = None
    expires_at: datetime | None = None
    rejection_reason: str = ""
    notes: str = ""
    message: str = ""
    raw_response: dict[str, Any] = field(default_factory=dict)


@dataclass
class ClaimResult:
    """Result of a claim submission or status check."""

    success: bool
    external_claim_id: str = ""
    status: str = ""  # e.g. "ACKNOWLEDGED", "APPROVED", "REJECTED"
    approved_amount: Decimal | None = None
    paid_amount: Decimal | None = None
    rejection_reason: str = ""
    query_details: str = ""
    notes: str = ""
    message: str = ""
    raw_response: dict[str, Any] = field(default_factory=dict)


@dataclass
class RemittanceEntry:
    """Single line item within a remittance batch."""

    claim_number: str = ""
    member_number: str = ""
    paid_amount: Decimal = Decimal("0")
    deductions: Decimal = Decimal("0")
    net_amount: Decimal = Decimal("0")
    notes: str = ""


@dataclass
class RemittanceResult:
    """Result of a remittance fetch for a date range."""

    success: bool
    remittance_number: str = ""
    remittance_date: date | None = None
    total_amount: Decimal = Decimal("0")
    payment_reference: str = ""
    entries: list[RemittanceEntry] = field(default_factory=list)
    message: str = ""
    raw_response: dict[str, Any] = field(default_factory=dict)


@dataclass
class TariffEntry:
    """Single tariff/price list item from an insurer."""

    service_code: str = ""
    payer_code: str = ""
    description: str = ""
    tariff_amount: Decimal = Decimal("0")
    requires_preauth: bool = False
    effective_from: date | None = None
    effective_to: date | None = None
