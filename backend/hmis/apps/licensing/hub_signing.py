# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""Hub Ed25519 signing-key helpers for cloud user-token exchange proofs.

Use ``generate_hub_device_signing_private_key`` during hub provisioning and
set its base64 result as ``HUB_DEVICE_SIGNING_PRIVATE_KEY`` in the protected
runtime environment. ``get_hub_device_signing_key`` validates that value at
the point it is used; browser and desktop clients never receive the key.
"""

from __future__ import annotations

import base64
import os

from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
from cryptography.hazmat.primitives.serialization import Encoding, NoEncryption, PrivateFormat


def generate_hub_device_signing_private_key() -> str:
    """Generate a base64-encoded raw Ed25519 private seed for one hub."""
    private_key = Ed25519PrivateKey.generate()
    return base64.b64encode(
        private_key.private_bytes(Encoding.Raw, PrivateFormat.Raw, NoEncryption())
    ).decode("ascii")


def validate_hub_device_signing_private_key(encoded: str) -> str:
    """Validate and normalize a base64-encoded raw Ed25519 private seed."""
    try:
        raw = base64.b64decode(encoded, validate=True)
        Ed25519PrivateKey.from_private_bytes(raw)
    except (TypeError, ValueError) as exc:
        raise ValueError(
            "HUB_DEVICE_SIGNING_PRIVATE_KEY must be a base64-encoded raw Ed25519 private key"
        ) from exc
    return encoded


def get_hub_device_signing_key() -> Ed25519PrivateKey:
    """Load the hub signing key from the protected process environment."""
    encoded = os.getenv("HUB_DEVICE_SIGNING_PRIVATE_KEY", "")
    validate_hub_device_signing_private_key(encoded)
    return Ed25519PrivateKey.from_private_bytes(base64.b64decode(encoded, validate=True))
