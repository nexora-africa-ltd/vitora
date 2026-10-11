# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""
License token signing and verification using RS256.

The private key is held by the Nexora licensing service (cloud).
The public key is embedded in every installation for local verification.
"""

import base64
import datetime
import os
import uuid
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
CLOUD_CONFIG_AUDIENCE = "vitora-hub-cloud-config"
CLOUD_CONFIG_TOKEN_TYPE = "cloud_config"  # noqa: S105 - nonsecret JWT protocol type
CLOUD_CONFIG_VALIDITY_DAYS = 30
CLOUD_USER_TOKEN_AUDIENCE = "vitora-hub-cloud-user"  # noqa: S105 - nonsecret JWT audience
CLOUD_USER_TOKEN_TYPE = "hub_cloud_user"  # noqa: S105 - nonsecret JWT protocol type
CLOUD_USER_TOKEN_VALIDITY_SECONDS = 300


def get_private_key() -> str:
    """
    Load the private signing key.

    Resolution order:
    1. LICENSE_SIGNING_KEY env var (base64-encoded PEM, for Azure Container App secrets)
    2. File at LICENSE_PRIVATE_KEY_PATH (for local dev / Key Vault volume mount)
    """
    # Try base64-encoded env var first (production: Container App secret)
    encoded = os.getenv("LICENSE_SIGNING_KEY", "")
    if encoded:
        return base64.b64decode(encoded).decode("utf-8")

    # Fall back to file path (local dev)
    try:
        with open(PRIVATE_KEY_PATH) as f:
            return f.read()
    except FileNotFoundError as exc:
        raise RuntimeError(
            "License private key not available. Set LICENSE_SIGNING_KEY env var "
            f"(base64-encoded PEM) or place key at {PRIVATE_KEY_PATH}."
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


def build_cloud_config_payload(installation) -> dict[str, Any]:
    """Build the nonsecret cloud configuration claims for one installation."""
    organization_id = getattr(installation, "organization_id", None)
    if not isinstance(organization_id, int):
        organization_id = getattr(getattr(installation, "organization", None), "id", None)

    facility = getattr(installation, "facility", None)
    facility_id = getattr(installation, "facility_id", None)
    if not isinstance(facility_id, int):
        facility_id = getattr(facility, "id", None) if facility is not None else None

    return {
        "installation_id": str(installation.installation_id),
        "organization_id": organization_id,
        "facility_id": facility_id,
        "environment": str(getattr(settings, "ENVIRONMENT", "") or ""),
        "cloud_api_base_url": (
            str(getattr(settings, "CLOUD_API_BASE_URL", "") or "").strip().rstrip("/")
        ),
        "sync_server_url": (
            str(getattr(settings, "SYNC_SERVER_URL", "") or "").strip().rstrip("/")
        ),
    }


def sign_cloud_config_envelope(payload: dict[str, Any]) -> str:
    """Sign a short-lived configuration envelope with the license signing key."""
    now = timezone.now()
    token_payload = {
        **payload,
        "iss": ISSUER,
        "aud": CLOUD_CONFIG_AUDIENCE,
        "token_type": CLOUD_CONFIG_TOKEN_TYPE,
        "iat": int(now.timestamp()),
        "exp": int((now + datetime.timedelta(days=CLOUD_CONFIG_VALIDITY_DAYS)).timestamp()),
    }
    return jwt.encode(token_payload, get_private_key(), algorithm=ALGORITHM)


def verify_cloud_config_envelope(
    token: str,
    *,
    installation_id: str | None = None,
    organization_id: int | None = None,
    facility_id: int | None = None,
    environment: str | None = None,
) -> dict[str, Any]:
    """Verify a configuration envelope and optional installation-bound claims."""
    payload = jwt.decode(
        token,
        get_public_key(),
        algorithms=[ALGORITHM],
        issuer=ISSUER,
        audience=CLOUD_CONFIG_AUDIENCE,
    )
    if payload.get("token_type") != CLOUD_CONFIG_TOKEN_TYPE:
        raise jwt.InvalidTokenError("Invalid cloud configuration envelope type.")

    expected_claims = {
        "installation_id": installation_id,
        "organization_id": organization_id,
        "facility_id": facility_id,
        "environment": environment,
    }
    for claim, expected in expected_claims.items():
        if expected is not None and payload.get(claim) != expected:
            raise jwt.InvalidTokenError(f"Cloud configuration envelope {claim} does not match.")
    return payload


def _build_cloud_user_token_payload(installation, user) -> dict[str, Any]:
    """Build claims for one short-lived, installation-bound cloud user token."""
    now = timezone.now()
    return {
        "iss": ISSUER,
        "aud": CLOUD_USER_TOKEN_AUDIENCE,
        "token_type": CLOUD_USER_TOKEN_TYPE,
        "iat": int(now.timestamp()),
        "exp": int(
            (now + datetime.timedelta(seconds=CLOUD_USER_TOKEN_VALIDITY_SECONDS)).timestamp()
        ),
        "jti": str(uuid.uuid4()),
        "sub": str(user.pk),
        "user_id": user.pk,
        "username": user.username,
        "installation_id": str(installation.installation_id),
        "organization_id": installation.organization_id,
        "facility_id": installation.facility_id,
    }


def issue_cloud_user_token(installation, user) -> tuple[str, str]:
    """Issue a five-minute, non-refreshable cloud token and return its JTI."""
    token_payload = _build_cloud_user_token_payload(installation, user)
    return (
        jwt.encode(token_payload, get_private_key(), algorithm=ALGORITHM),
        token_payload["jti"],
    )


def sign_cloud_user_token(installation, user) -> str:
    """Issue a five-minute, non-refreshable cloud token for one hub-resolved user."""
    return issue_cloud_user_token(installation, user)[0]


def verify_cloud_user_token(token: str) -> dict[str, Any]:
    """Verify the dedicated audience and purpose of a hub cloud user token."""
    payload = jwt.decode(
        token,
        get_public_key(),
        algorithms=[ALGORITHM],
        issuer=ISSUER,
        audience=CLOUD_USER_TOKEN_AUDIENCE,
        options={
            "require": [
                "exp",
                "iat",
                "jti",
                "sub",
                "user_id",
                "username",
                "installation_id",
                "organization_id",
                "facility_id",
                "token_type",
            ]
        },
    )
    if payload.get("token_type") != CLOUD_USER_TOKEN_TYPE:
        raise jwt.InvalidTokenError("Invalid hub cloud user token type.")
    return payload


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
