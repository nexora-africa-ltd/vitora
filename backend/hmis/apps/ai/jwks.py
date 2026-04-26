"""
JWKS (JSON Web Key Set) key management for TibaBot user-identity JWTs.

Manages an RSA key pair used to sign JWTs with RS256.  The private key is
loaded from the ``TIBABOT_JWT_PRIVATE_KEY`` setting (PEM-encoded) and the
public key is derived and exposed via a ``/.well-known/jwks.json`` endpoint
so TibaBot can verify tokens without sharing a symmetric secret.

Key hierarchy:
  - ``TIBABOT_JWT_PRIVATE_KEY`` (PEM, RS256)  → production signing
  - ``TIBABOT_JWT_SECRET`` (HS256)             → dev/test fallback

When neither is configured, ``mint_tibabot_jwt()`` returns ``None`` and
requests fall back to facility-level-only identity.
"""

import hashlib
import logging
from base64 import urlsafe_b64encode
from functools import lru_cache

from cryptography.hazmat.primitives.asymmetric import rsa
from cryptography.hazmat.primitives.serialization import (
    Encoding,
    PublicFormat,
    load_pem_private_key,
)
from django.conf import settings

logger = logging.getLogger(__name__)

# Key ID used in JWT header ``kid`` and JWKS ``kid`` — must match.
TIBABOT_JWT_KID = "tibabot-vitora-1"


@lru_cache(maxsize=1)
def _load_private_key() -> rsa.RSAPrivateKey | None:
    """
    Load the RSA private key from ``TIBABOT_JWT_PRIVATE_KEY`` setting.

    Returns ``None`` when the setting is empty (dev/test opt-out).
    The result is cached for the process lifetime.
    """
    pem: str = getattr(settings, "TIBABOT_JWT_PRIVATE_KEY", "") or ""
    if not pem:
        return None

    # Allow the env var to use literal ``\\n`` instead of real newlines
    pem_bytes = pem.replace("\\n", "\n").encode("utf-8")

    try:
        key = load_pem_private_key(pem_bytes, password=None)
        if not isinstance(key, rsa.RSAPrivateKey):
            logger.error("TIBABOT_JWT_PRIVATE_KEY is not an RSA key")
            return None
        return key
    except Exception:
        logger.error("Failed to load TIBABOT_JWT_PRIVATE_KEY", exc_info=True)
        return None


def get_private_key() -> rsa.RSAPrivateKey | None:
    """Return the cached RSA private key, or ``None``."""
    return _load_private_key()


def _int_to_base64url(n: int) -> str:
    """Encode a positive integer as unpadded base64url (for JWK parameters)."""
    byte_length = (n.bit_length() + 7) // 8
    return urlsafe_b64encode(n.to_bytes(byte_length, byteorder="big")).rstrip(b"=").decode("ascii")


def get_jwks() -> dict:
    """
    Build the JWKS document containing the public RSA key.

    Returns ``{"keys": []}`` when no private key is configured.
    """
    private_key = get_private_key()
    if private_key is None:
        return {"keys": []}

    public_key = private_key.public_key()
    public_numbers = public_key.public_numbers()

    # Thumbprint for kid verification
    der_bytes = public_key.public_bytes(Encoding.DER, PublicFormat.SubjectPublicKeyInfo)
    thumbprint = urlsafe_b64encode(hashlib.sha256(der_bytes).digest()).rstrip(b"=").decode("ascii")

    return {
        "keys": [
            {
                "kty": "RSA",
                "use": "sig",
                "alg": "RS256",
                "kid": TIBABOT_JWT_KID,
                "n": _int_to_base64url(public_numbers.n),
                "e": _int_to_base64url(public_numbers.e),
                "x5t#S256": thumbprint,
            }
        ]
    }
