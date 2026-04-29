"""
DHA HIE Claim Flow Router.

Determines which SHA claim submission flow to use based on:
- Encounter type (emergency → ECCIF)
- Eligibility scheme (UHC → PHC, SHIF → SHIF)
- Facility KEPH level (Level 2-3 for PHC, Level 3+ for SHIF)

Reference: https://hie-docs.dha.go.ke/docs/userJourney
"""

import logging

from hmis.apps.billing.models import SHAClaim

logger = logging.getLogger(__name__)

ClaimFlow = SHAClaim.ClaimFlow

# PHC-eligible facility levels (Level 2 dispensaries, Level 3 health centres)
PHC_FACILITY_LEVELS = {"2", "3"}

# SHIF-eligible facility levels (Level 3 health centres and above)
SHIF_FACILITY_LEVELS = {"3", "4", "5", "6"}


def determine_flow(
    encounter,
    facility,
    eligibility_data: dict | None = None,
) -> str:
    """
    Determine the DHA HIE claim routing flow.

    Decision tree:
    1. Emergency encounter → ECCIF (no consent needed upfront, bundled tariffs)
    2. UHC scheme + facility Level 2-3 → PHC (simplified consent, no preauth)
    3. SHIF scheme + facility Level 3+ → SHIF (biometric/OTP consent, preauth for restricted)

    Args:
        encounter: Encounter instance (checks encounter_type for EMERGENCY).
        facility: Facility instance (checks KEPH level).
        eligibility_data: Normalized eligibility response dict from SHAEligibilityService.
            Expected keys: primary_scheme_name (str).

    Returns:
        ClaimFlow value string ("phc", "shif", or "eccif").
    """
    # 1. Emergency encounters always route to ECCIF
    encounter_type = getattr(encounter, "encounter_type", "")
    if encounter_type == "EMERGENCY":
        logger.info(
            "Flow router: ECCIF — emergency encounter (encounter=%s)",
            getattr(encounter, "pk", None),
        )
        return ClaimFlow.ECCIF

    # 2. Determine scheme from eligibility data
    scheme_name = ""
    if eligibility_data:
        raw_scheme = eligibility_data.get("primary_scheme_name") or ""
        scheme_name = raw_scheme.strip().upper() if isinstance(raw_scheme, str) else ""

    facility_level = getattr(facility, "level", "")

    # 3. UHC scheme + PHC-eligible facility → PHC flow
    if scheme_name == "UHC" and facility_level in PHC_FACILITY_LEVELS:
        logger.info(
            "Flow router: PHC — UHC scheme, facility level %s (facility=%s)",
            facility_level,
            getattr(facility, "pk", None),
        )
        return ClaimFlow.PHC

    # 4. SHIF scheme + SHIF-eligible facility → SHIF flow
    if scheme_name == "SHIF" and facility_level in SHIF_FACILITY_LEVELS:
        logger.info(
            "Flow router: SHIF — SHIF scheme, facility level %s (facility=%s)",
            facility_level,
            getattr(facility, "pk", None),
        )
        return ClaimFlow.SHIF

    # 5. Fallback heuristics when scheme doesn't match expected patterns
    # UHC at higher-level facility still gets SHIF treatment
    if scheme_name == "UHC" and facility_level in SHIF_FACILITY_LEVELS:
        logger.info(
            "Flow router: SHIF — UHC scheme at higher-level facility %s",
            facility_level,
        )
        return ClaimFlow.SHIF

    # SHIF at Level 2 dispensary treated as PHC (rare but possible)
    if scheme_name == "SHIF" and facility_level in PHC_FACILITY_LEVELS:
        logger.info(
            "Flow router: PHC — SHIF scheme at PHC-level facility %s",
            facility_level,
        )
        return ClaimFlow.PHC

    # Default: SHIF for Level 4+ facilities, PHC otherwise
    if facility_level in {"4", "5", "6"}:
        logger.info(
            "Flow router: SHIF — default for Level %s facility (scheme=%s)",
            facility_level,
            scheme_name,
        )
        return ClaimFlow.SHIF

    logger.info(
        "Flow router: PHC — default (facility level=%s, scheme=%s)",
        facility_level,
        scheme_name,
    )
    return ClaimFlow.PHC
