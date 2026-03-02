"""
AI context enrichment.

Builds user and facility context dicts from the Django request and settings.
These are injected into every TibaBot request so TibaBot can calibrate
response depth and provide capability-aware recommendations.

**No PII is sent** — only role, seniority, specialization, and facility capabilities.
"""

import logging
from typing import Any

from django.conf import settings
from rest_framework.request import Request

logger = logging.getLogger(__name__)

# ============================================================================
# Seniority mapping from Role.hierarchy_level
# ============================================================================

# hierarchy_level is 0-based where 0 = highest authority.
# We bucket into three labels that TibaBot can interpret.
_SENIORITY_MAP: dict[str, tuple[int, int]] = {
    "SENIOR": (0, 2),    # hierarchy_level 0-2 → consultant / HOD / specialist
    "MID": (3, 5),       # hierarchy_level 3-5 → registrar / experienced CO
    "JUNIOR": (6, 99),   # hierarchy_level 6+ → intern / student / new hire
}


def _hierarchy_to_seniority(hierarchy_level: int) -> str:
    """Map a numeric hierarchy level to a seniority label."""
    for label, (lo, hi) in _SENIORITY_MAP.items():
        if lo <= hierarchy_level <= hi:
            return label
    return "UNKNOWN"


# ============================================================================
# Public API
# ============================================================================


def build_user_context(request: Request) -> dict[str, Any]:
    """
    Build a user context dict from the authenticated request.

    Extracts role, seniority (from Role.hierarchy_level), and specialization
    from the user's StaffProfile.  Returns nulls for unavailable fields.

    Returns:
        dict with keys: role, seniority, specialization
    """
    user = request.user
    role_code: str | None = None
    seniority: str | None = None
    specialization: str | None = None

    try:
        # Try StaffProfile first (RBAC-aware)
        staff_profile = getattr(user, "staff_profile", None)
        if staff_profile is not None:
            primary_role = getattr(staff_profile, "primary_role", None)
            if primary_role is not None:
                role_code = primary_role.code
                seniority = _hierarchy_to_seniority(primary_role.hierarchy_level)
            specialization = staff_profile.specialization or None
    except Exception:
        logger.debug(
            "Could not read StaffProfile for user %s; falling back to User.role",
            user.pk,
        )

    # Fallback: try the simple User.role string (used by frontend auth)
    if role_code is None:
        role_code = getattr(user, "role", None) or None

    return {
        "role": role_code,
        "seniority": seniority,
        "specialization": specialization,
    }


def build_facility_context() -> dict[str, Any]:
    """
    Build a facility context dict from Django settings.

    All values are nullable — absent env vars produce None.

    Returns:
        dict with keys: keph_level, county, has_icu, has_laboratory,
        has_imaging, has_pharmacy
    """
    return {
        "keph_level": getattr(settings, "FACILITY_LEVEL", None) or None,
        "county": getattr(settings, "FACILITY_COUNTY", None) or None,
        "has_icu": getattr(settings, "FACILITY_HAS_ICU", None),
        "has_laboratory": getattr(settings, "FACILITY_HAS_LABORATORY", None),
        "has_imaging": getattr(settings, "FACILITY_HAS_IMAGING", None),
        "has_pharmacy": getattr(settings, "FACILITY_HAS_PHARMACY", None),
    }
