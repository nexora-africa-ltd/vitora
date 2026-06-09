"""
License token signing and verification using RS256.

The private key is held by the Nexora licensing service (cloud).
The public key is embedded in every installation for local verification.
"""

import datetime
import os
from pathlib import Path
from typing import Any

import jwt
from django.conf import settings
from django.utils import timezone

# Key file paths
_KEYS_DIR = Path(settings.BASE_DIR) / "keys"
PRIVATE_KEY_PATH = os.getenv("LICENSE_PRIVATE_KEY_PATH", str(_KEYS_DIR / "license_private.pem"))
PUBLIC_KEY_PATH = os.getenv("LICENSE_PUBLIC_KEY_PATH", str(_KEYS_DIR / "license_public.pem"))

# JWT config
ALGORITHM = "RS256"
ISSUER = "nexora-licensing"
AUDIENCE = "vitora-hmis"
TOKEN_VALIDITY_DAYS = 90
CHECK_IN_WINDOW_DAYS = 30


def get_private_key() -> str:
    """Load the private signing key (only available on the Nexora licensing server)."""
    try:
        with open(PRIVATE_KEY_PATH) as f:
            return f.read()
    except FileNotFoundError as exc:
        raise RuntimeError(
            f"License private key not found at {PRIVATE_KEY_PATH}. "
            "This key should only exist on the Nexora licensing server."
        ) from exc


def get_public_key() -> str:
    """Load the public verification key (embedded in all installations)."""
    try:
        with open(PUBLIC_KEY_PATH) as f:
            return f.read()
    except FileNotFoundError as exc:
        raise RuntimeError(
            f"License public key not found at {PUBLIC_KEY_PATH}. "
            "Run 'python manage.py generate_license_keypair' to create the keypair."
        ) from exc


def sign_license_token(payload: dict[str, Any]) -> str:
    """
    Sign a license payload into a JWT using the Nexora private key.

    Args:
        payload: Dict containing installation_id, org_id, tier, features, etc.

    Returns:
        Signed JWT string.
    """
    private_key = get_private_key()

    now = timezone.now()
    token_payload = {
        **payload,
        "iss": ISSUER,
        "aud": AUDIENCE,
        "iat": int(now.timestamp()),
        "exp": int((now + datetime.timedelta(days=TOKEN_VALIDITY_DAYS)).timestamp()),
        "check_in_by": int((now + datetime.timedelta(days=CHECK_IN_WINDOW_DAYS)).timestamp()),
    }

    return jwt.encode(token_payload, private_key, algorithm=ALGORITHM)


def verify_license_token(token: str) -> dict[str, Any]:
    """
    Verify and decode a license JWT using the embedded public key.

    Args:
        token: The license JWT string.

    Returns:
        Decoded payload dict.

    Raises:
        jwt.ExpiredSignatureError: Token has expired.
        jwt.InvalidAudienceError: Wrong audience claim.
        jwt.InvalidIssuerError: Wrong issuer.
        jwt.InvalidSignatureError: Signature verification failed (tampered token).
        jwt.DecodeError: Malformed token.
    """
    public_key = get_public_key()

    return jwt.decode(
        token,
        public_key,
        algorithms=[ALGORITHM],
        issuer=ISSUER,
        audience=AUDIENCE,
    )


def build_license_payload(installation) -> dict[str, Any]:
    """
    Build the license JWT payload from an Installation's Organization and Plan.

    Args:
        installation: An Installation model instance.

    Returns:
        Dict ready to be signed.
    """
    org = installation.organization
    plan = org.subscription_plan

    payload: dict[str, Any] = {
        "installation_id": str(installation.installation_id),
        "org_id": org.pk,
        "org_name": org.name,
        "tier": org.subscription_tier,
        "subscription_status": org.subscription_status,
        "features": plan.features if plan else {},
        "max_staff": plan.max_users if plan else 5,
        "max_facilities": plan.max_facilities if plan else 1,
        "max_patients": plan.max_patients if plan else 100,
    }

    # Include subscription_valid_until if set
    if org.subscription_valid_until:
        payload["subscription_valid_until"] = int(org.subscription_valid_until.timestamp())

    return payload


def is_check_in_overdue(token_payload: dict[str, Any]) -> bool:
    """Check if the installation needs to check in (30-day window passed)."""
    check_in_by = token_payload.get("check_in_by")
    if not check_in_by:
        return False
    return timezone.now().timestamp() > check_in_by


def get_licensed_features(token_payload: dict[str, Any]) -> dict[str, bool]:
    """Extract the feature flags from a decoded license token."""
    return token_payload.get("features", {})
