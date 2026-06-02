"""
Proactive Capitation Provider Selection Validation.

Before submitting a PHC/capitation claim (virtual_claim_line), this service
checks whether the current facility is likely the patient's selected
outpatient provider — preventing a wasted DHA API call and giving the
clinician an early warning.

DHA HIE validates this server-side, but providing a pre-flight check:
1. Reduces unnecessary API calls that result in 422 rejections
2. Gives clinicians actionable feedback immediately
3. Avoids the latency of a round-trip to DHA only to be told "wrong facility"

Validation strategy (layered, best-effort):
1. If SHAMember.eligibility_response contains outpatient_provider_code/
   outpatient_facility_code → compare with facility's sha_facility_code or mfl_code
2. If the patient's most recent successful PHC claim was at a different facility
   → warn (soft signal, not blocking)
3. If no provider selection data is available → pass (let DHA validate)
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Any

from django.db.models import Q

logger = logging.getLogger(__name__)


@dataclass
class CapitationValidationResult:
    """Result of provider selection validation."""

    is_valid: bool
    warning: str = ""
    blocking: bool = False
    details: dict[str, Any] | None = None


def validate_capitation_provider(
    sha_member,
    facility,
) -> CapitationValidationResult:
    """
    Validate that the current facility is the patient's selected outpatient
    provider for SHA capitation (PHC flow).

    Args:
        sha_member: SHAMember instance with cached eligibility_response
        facility: Facility instance (the facility attempting to submit)

    Returns:
        CapitationValidationResult with is_valid=True if OK, or a warning/block.
    """
    if not sha_member or not facility:
        return CapitationValidationResult(is_valid=True)

    eligibility_response = sha_member.eligibility_response or {}

    # ─── Strategy 1: Check eligibility response for provider selection ────
    provider_code = _extract_provider_code(eligibility_response)
    if provider_code:
        facility_codes = _get_facility_codes(facility)
        if provider_code.upper() in {c.upper() for c in facility_codes if c}:
            return CapitationValidationResult(
                is_valid=True,
                details={"matched_code": provider_code},
            )
        else:
            return CapitationValidationResult(
                is_valid=False,
                warning=(
                    f"Patient's selected outpatient provider ({provider_code}) "
                    f"does not match this facility. The capitation claim may be "
                    f"rejected by SHA. Verify patient registration or refer to "
                    f"their selected provider."
                ),
                blocking=False,
                details={
                    "patient_provider_code": provider_code,
                    "facility_codes": facility_codes,
                },
            )

    # ─── Strategy 2: Check recent PHC claim history ──────────────────────
    last_facility_mismatch = _check_recent_claims(sha_member, facility)
    if last_facility_mismatch:
        return CapitationValidationResult(
            is_valid=True,
            warning=last_facility_mismatch,
            blocking=False,
        )

    # ─── Strategy 3: No data available — pass through ────────────────────
    return CapitationValidationResult(is_valid=True)


def _extract_provider_code(eligibility_response: dict) -> str | None:
    """
    Extract outpatient provider facility code from eligibility response.

    DHA ILM responses may include provider selection in several locations:
    - Top-level: outpatient_provider_code, outpatient_facility_code
    - Inside schemes array: scheme.outpatient_provider.facility_code
    - Inside coverage: coverage.selected_provider_code
    """
    # Top-level fields (DHA ILM v2 format)
    for key in (
        "outpatient_provider_code",
        "outpatient_facility_code",
        "selected_outpatient_facility",
        "phc_facility_code",
        "capitation_facility_code",
    ):
        value = eligibility_response.get(key)
        if value and isinstance(value, str) and value.strip():
            return value.strip()

    # Inside raw_response (nested DHA format)
    raw = eligibility_response.get("raw_response", {})
    if isinstance(raw, dict):
        for key in (
            "outpatientProviderCode",
            "outpatientFacilityCode",
            "selectedProvider",
            "phcFacilityCode",
        ):
            value = raw.get(key)
            if value and isinstance(value, str) and value.strip():
                return value.strip()

    # Inside schemes array
    schemes = eligibility_response.get("schemes") or raw.get("schemes", [])
    if isinstance(schemes, list):
        for scheme in schemes:
            if not isinstance(scheme, dict):
                continue
            scheme_name = (scheme.get("schemeName") or "").upper()
            if scheme_name == "UHC":
                # Check nested outpatient_provider
                provider = scheme.get("outpatient_provider") or scheme.get("outpatientProvider")
                if isinstance(provider, dict):
                    code = provider.get("facility_code") or provider.get("facilityCode")
                    if code and isinstance(code, str) and code.strip():
                        return code.strip()
                # Direct field on scheme
                for key in ("outpatientFacilityCode", "phcFacilityCode"):
                    value = scheme.get(key)
                    if value and isinstance(value, str) and value.strip():
                        return value.strip()

    return None


def _get_facility_codes(facility) -> list[str]:
    """Get all identifying codes for a facility (MFL, SHA, etc.)."""
    codes = []
    mfl_code = getattr(facility, "mfl_code", None)
    if mfl_code:
        codes.append(str(mfl_code))
    sha_code = getattr(facility, "sha_facility_code", None)
    if sha_code:
        codes.append(str(sha_code))
    # Some facilities use the pk as fallback identifier
    return codes


def _check_recent_claims(sha_member, facility) -> str:
    """
    Check if the patient's most recent PHC claim was at a different facility.
    Returns a warning string if mismatch found, empty string otherwise.
    """
    try:
        from hmis.apps.billing.models import SHAClaim

        recent_phc = (
            SHAClaim.objects.filter(
                Q(patient=sha_member.patient),
                Q(claim_flow="phc") | Q(claim_flow="PHC"),
                Q(status__in=["submitted", "approved", "paid", "SUBMITTED", "APPROVED", "PAID"]),
            )
            .exclude(facility=facility)
            .order_by("-created_at")
            .values_list("facility__name", flat=True)
            .first()
        )
        if recent_phc:
            return (
                f"Patient's most recent capitation claim was processed at "
                f"'{recent_phc}'. Verify this is their current selected provider."
            )
    except Exception:  # noqa: S110
        pass
    return ""
