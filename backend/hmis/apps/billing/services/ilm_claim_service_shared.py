# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""Billing ilm claim service shared for Vitora HMIS.

What this file is for:
- Implement ilm claim service shared logic for the billing domain.

How to use it:
- Import classes and functions from this module in Django app code and tests.

Supported inputs/args:
- Python imports and Django ORM/runtime inputs; no standalone CLI arguments.
"""

from __future__ import annotations

import logging
import re
from dataclasses import dataclass, field
from typing import Any

from django.conf import settings

from .ilm_client import IlmResponse

logger = logging.getLogger(__name__)

# Values the DHA API accepts for practitioner_regulation_body
_DHA_VALID_REGULATORS = frozenset({"KMPDC", "COC", "PPB", "NCK", "KMLTTB", "KNDI"})
_CR_NUMBER_RE = re.compile(r"^CR\d+-\d$")


def _normalise_regulator(raw: str, default: str = "KMPDC") -> str:
    """Convert a full licensing-body name into the abbreviation DHA expects."""
    if not raw:
        return default
    stripped = raw.strip()
    if stripped in _DHA_VALID_REGULATORS:
        return stripped
    mapping: dict[str, str] = getattr(settings, "_DHA_REGULATOR_FULL_TO_ABBREV", {})
    return mapping.get(stripped, default)


def _publish_safe(event_type: str, payload: dict) -> None:
    """Publish a billing event without ever breaking the calling request."""
    try:
        from hmis.apps.core.events import publish_event

        aggregate_id = payload.get("claim_id") or payload.get("patient_id") or ""
        publish_event(event_type, "SHAClaim", aggregate_id, payload)
    except (
        AttributeError,
        TypeError,
        ValueError,
        RuntimeError,
        OSError,
        AssertionError,
        ImportError,
    ):  # pragma: no cover
        logger.exception("Failed to publish DHA HIE event %s", event_type)


def _claim_event_payload(claim: Any, result: IlmClaimResult, **extra: Any) -> dict:
    return {
        "claim_id": getattr(claim, "pk", None),
        "claim_number": getattr(claim, "claim_number", ""),
        "facility_id": getattr(claim, "facility_id", None),
        "patient_id": getattr(claim, "patient_id", None),
        "status": getattr(claim, "status", ""),
        "dha_external_id": getattr(claim, "dha_external_id", ""),
        "dha_correlation_id": getattr(claim, "dha_correlation_id", ""),
        "http_status": result.status_code,
        **extra,
    }


# ---------------------------------------------------------------------------
# Endpoint paths (mirrors Postman collection)
# ---------------------------------------------------------------------------

VISIT_PATH = "/api/v1/claims/visit"
INTERVENTIONS_PATH = "/api/v1/claims/interventions"
INTERVENTION_SWITCH_PATH = "/api/v1/claims/interventions/switch"
INTERVENTION_RESTORE_PATH = "/api/v1/claims/interventions/restore"
INTERVENTION_RETIRE_PATH = "/api/v1/claims/interventions/retire"
# PHC (Primary Healthcare Fund) — Scenario C in DHA HIE user-journey spec.
# Level 2/3 facilities use the same `/claims/lines` endpoint as the standard
# billing flow to add a "virtual claim line" for capitation / basic
# fee-for-service interventions (no preauth). The DHA HIE UAT Postman
# collection ("Claims and Preauth / Billing / Add Virtual Claim Line")
# routes this through `/api/v1/claims/lines`.
VIRTUAL_CLAIM_LINE_PATH = "/api/v1/claims/lines"
DIAGNOSES_PATH = "/api/v1/claims/diagnoses"
LINES_PATH = "/api/v1/claims/lines"
LINES_EDIT_PATH = "/api/v1/claims/lines/edit"
ATTACHMENTS_PATH = "/api/v1/claims/attachments"
PREVIEW_PATH = "/api/v1/claims/preview"
PREVIEW_PAYER_PATH = "/adapter/facade/edi/v1/claims/claims"
SUBMIT_PATH = "/api/v1/claims/submit"
CLOSE_PATH = "/api/v1/claims/close"


# ---------------------------------------------------------------------------
# Request payload dataclasses (typed shapes, easier to test)
# ---------------------------------------------------------------------------


@dataclass
class StartVisitParams:
    otp: str = ""
    auth_guid: str = ""  # Biometric authorization GUID (alternative to OTP)
    reuse_existing_consent: bool = False
    patient_id: str = ""
    intervention_codes: list[str] = field(default_factory=list)
    service_type: str = "OUTPATIENT"  # OUTPATIENT | INPATIENT
    admission_date: str | None = None  # ISO date, required for INPATIENT
    estimated_days_of_admission: int | None = None
    # Practitioner (doctor) details — required per DHA 2026-06 spec.
    # Can be provided here or on add_line/add_diagnosis as a fallback.
    practitioner_identification_number: str = ""
    practitioner_identification_type: str = ""  # e.g. "National ID"
    practitioner_regulation_body: str = "KMPDC"


@dataclass
class ClaimLine:
    intervention_code: str
    service_name: str
    service_identifier: str
    unit_price: str
    quantity: str
    scheme_code: str


@dataclass
class CloseClaimParams:
    cancel_reason_type: str  # WRONG_PATIENT | NO_SERVICE_GIVEN | WRONG_BENEFIT |
    #                         EXPIRED_VISIT | EXHAUSTED_BENEFIT | TIME_BARRED |
    #                         OTHER_REASONS
    cancel_reason_text: str = ""


@dataclass
class IlmClaimResult:
    """Lightweight wrapper returned from each service method."""

    response: IlmResponse
    payload: Any = field(default=None)

    @property
    def status_code(self) -> int:
        return self.response.status_code

    @property
    def authorization_code(self) -> str | None:
        if isinstance(self.payload, dict):
            return self.payload.get("authorization_code") or self.payload.get("consent_token")
        return None


class VisitAlreadyOpenedError(ValueError):
    """Claim visit is already active on DHA and should not be reopened."""

    @property
    def claim_line_id(self) -> str | None:
        if isinstance(self.payload, dict):
            return (
                self.payload.get("claim_line_id")
                or self.payload.get("id")
                or (self.payload.get("data") or {}).get("claim_line_id")
                if isinstance(self.payload.get("data"), dict)
                else self.payload.get("id")
            )
        return None
