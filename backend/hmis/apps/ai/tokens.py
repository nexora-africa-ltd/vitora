"""
TibaBot user-identity JWT minting.

Generates short-lived JWTs (HS256) that the Django backend sends to TibaBot
alongside the facility API key.  This implements the "user identity" layer
of TibaBot's dual-layer authentication model:

    X-API-Key: <facility key>     ← system/facility identity (billing)
    Authorization: Bearer <jwt>   ← user identity (audit, role-based behavior)

The JWT carries ``tibabot/*`` namespaced claims so TibaBot can log which
clinician triggered each request and tailor responses by role/facility level.

When ``TIBABOT_JWT_SECRET`` is empty (dev/test default), no JWT is minted
and requests fall back to facility-level-only identity — TibaBot treats
this as an anonymous facility call.
"""

import logging
import time
from typing import Any

import jwt
from django.conf import settings
from django.contrib.auth.models import AbstractBaseUser

logger = logging.getLogger(__name__)


def mint_tibabot_jwt(user: AbstractBaseUser) -> str | None:
    """
    Mint a short-lived HS256 JWT for TibaBot user-identity auth.

    Args:
        user: The authenticated Django user making the AI request.

    Returns:
        Encoded JWT string, or ``None`` if ``TIBABOT_JWT_SECRET`` is not
        configured (graceful opt-out for dev/test).
    """
    secret: str = getattr(settings, "TIBABOT_JWT_SECRET", "")
    if not secret:
        return None

    issuer: str = getattr(settings, "TIBABOT_JWT_ISSUER", "vitora.nexora.africa")
    audience: str = getattr(settings, "TIBABOT_JWT_AUDIENCE", "tibabot-api")
    expiry: int = getattr(settings, "TIBABOT_JWT_EXPIRY_SECONDS", 300)

    now = int(time.time())

    # Build claims --------------------------------------------------------
    claims: dict[str, Any] = {
        # Standard JWT claims
        "sub": str(user.pk),
        "iss": issuer,
        "aud": audience,
        "iat": now,
        "exp": now + expiry,
    }

    # TibaBot custom claims (namespaced per facility-auth-guide.md)
    claims.update(_build_tibabot_claims(user))

    try:
        return jwt.encode(claims, secret, algorithm="HS256")
    except Exception:
        logger.warning("Failed to mint TibaBot JWT for user %s", user.pk, exc_info=True)
        return None


def _build_tibabot_claims(user: AbstractBaseUser) -> dict[str, Any]:
    """
    Extract ``tibabot/*`` namespaced claims from the user's profile.

    Falls back gracefully when StaffProfile or related objects are missing.
    """
    claims: dict[str, Any] = {}

    # Display name (first + last, no PII like national_id)
    first = getattr(user, "first_name", "") or ""
    last = getattr(user, "last_name", "") or ""
    display_name = f"{first} {last}".strip()
    if display_name:
        claims["tibabot/name"] = display_name

    try:
        staff_profile = getattr(user, "staff_profile", None)
        if staff_profile is None:
            return claims

        # Role
        primary_role = getattr(staff_profile, "primary_role", None)
        if primary_role is not None:
            claims["tibabot/role"] = _map_role(primary_role.code)

        # Organization
        org = getattr(staff_profile, "organization", None)
        if org is not None:
            claims["tibabot/org_id"] = str(org.pk)

        # Facility + level
        facility = getattr(staff_profile, "primary_facility", None)
        if facility is not None:
            claims["tibabot/facility_id"] = str(facility.pk)
            level = getattr(facility, "level", None)
            if level:
                claims["tibabot/facility_level"] = _parse_facility_level(level)

    except Exception:
        logger.debug(
            "Could not read StaffProfile for TibaBot JWT (user %s)",
            user.pk,
            exc_info=True,
        )

    return claims


# -------------------------------------------------------------------------
# Helpers
# -------------------------------------------------------------------------

# TibaBot expects lowercase role strings per facility-auth-guide.md
_ROLE_MAP: dict[str, str] = {
    "DOCTOR": "doctor",
    "CLINICAL_OFFICER": "clinical_officer",
    "NURSE": "nurse",
    "CHW": "chw",
    "PHARMACIST": "pharmacist",
    "LAB_TECH": "lab_tech",
    "LAB_SCIENTIST": "lab_scientist",
    "ADMIN": "admin",
    "ORG-ADMIN": "admin",
    "OWNER": "admin",
}


def _map_role(role_code: str) -> str:
    """Map a Vitora role code to a TibaBot role string."""
    return _ROLE_MAP.get(role_code, role_code.lower())


def _parse_facility_level(level: str | int) -> int | None:
    """
    Parse a facility level string (e.g., "L3", "5") to an integer 1-6.

    Returns None if parsing fails.
    """
    if isinstance(level, int):
        return level if 1 <= level <= 6 else None
    raw = str(level).upper().lstrip("L").strip()
    try:
        val = int(raw)
        return val if 1 <= val <= 6 else None
    except (ValueError, TypeError):
        return None
