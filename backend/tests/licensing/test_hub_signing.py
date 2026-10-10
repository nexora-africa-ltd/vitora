# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""Tests for hub-only Ed25519 exchange-proof key management.

Run with: poetry run pytest tests/licensing/test_hub_signing.py --no-cov.
Inputs: HUB_DEVICE_SIGNING_PRIVATE_KEY in the protected process environment.
"""

import base64

import pytest  # type: ignore
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PublicKey
from cryptography.hazmat.primitives.serialization import Encoding, PublicFormat

from hmis.apps.licensing.hub_signing import (
    generate_hub_device_signing_private_key,
    get_hub_device_signing_key,
    validate_hub_device_signing_private_key,
)


def test_generated_hub_signing_key_is_valid_and_signs(monkeypatch):
    """A generated raw seed can be loaded only from the hub process environment."""
    encoded = generate_hub_device_signing_private_key()
    assert validate_hub_device_signing_private_key(encoded) == encoded
    monkeypatch.setenv("HUB_DEVICE_SIGNING_PRIVATE_KEY", encoded)

    key = get_hub_device_signing_key()
    payload = b"hub-generated-proof"
    signature = key.sign(payload)
    public_key = Ed25519PublicKey.from_public_bytes(
        key.public_key().public_bytes(Encoding.Raw, PublicFormat.Raw)
    )

    public_key.verify(signature, payload)


@pytest.mark.parametrize(
    "encoded", ["", "not-base64", base64.b64encode(b"too-short").decode("ascii")]
)
def test_invalid_hub_signing_key_is_rejected(encoded):
    """Invalid environment values cannot silently create or substitute a key."""
    with pytest.raises(ValueError, match="HUB_DEVICE_SIGNING_PRIVATE_KEY"):
        validate_hub_device_signing_private_key(encoded)
