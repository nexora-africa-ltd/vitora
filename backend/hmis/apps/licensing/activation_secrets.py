# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""X25519 activation-secret envelopes used by hub installers and the cloud API.

Use ``generate_device_keypair`` on a hub before activation and pass its public
key to the cloud. Use ``decrypt_activation_secrets`` after activation with the
same private key and the installation, organization, and facility identifiers.
"""

from __future__ import annotations

import base64
import json
import os
from typing import Any

from cryptography.exceptions import InvalidTag
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.asymmetric.x25519 import X25519PrivateKey, X25519PublicKey
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.hkdf import HKDF
from cryptography.hazmat.primitives.serialization import Encoding, PublicFormat

ENVELOPE_ALGORITHM = "X25519-HKDF-SHA256-AESGCM"
ENVELOPE_VERSION = 1


def generate_device_keypair() -> tuple[X25519PrivateKey, str]:
    """Generate an X25519 private key and base64-encoded raw public key."""
    private_key = X25519PrivateKey.generate()
    public_key = private_key.public_key().public_bytes(Encoding.Raw, PublicFormat.Raw)
    return private_key, base64.b64encode(public_key).decode("ascii")


def _aad(installation_id: str, organization_id: int, facility_id: int | None) -> bytes:
    return json.dumps(
        {
            "facility_id": facility_id,
            "installation_id": installation_id,
            "organization_id": organization_id,
        },
        separators=(",", ":"),
        sort_keys=True,
    ).encode("utf-8")


def _public_key(encoded: str) -> X25519PublicKey:
    try:
        raw = base64.b64decode(encoded, validate=True)
        return X25519PublicKey.from_public_bytes(raw)
    except (ValueError, TypeError) as exc:
        raise ValueError("device_public_key must be base64-encoded raw X25519 public key") from exc


def validate_device_public_key(encoded: str) -> str:
    """Validate a device public key before an activation code is consumed."""
    _public_key(encoded)
    return encoded


def _derive_key(shared_secret: bytes, salt: bytes) -> bytes:
    return HKDF(
        algorithm=hashes.SHA256(), length=32, salt=salt, info=b"vitora.activation.secrets.v2"
    ).derive(shared_secret)


def encrypt_activation_secrets(
    secrets: dict[str, str],
    device_public_key: str,
    *,
    installation_id: str,
    organization_id: int,
    facility_id: int | None,
) -> dict[str, str | int]:
    """Encrypt activation secrets to a device key with tenant-bound AAD."""
    recipient = _public_key(device_public_key)
    ephemeral = X25519PrivateKey.generate()
    salt = os.urandom(32)
    nonce = os.urandom(12)
    key = _derive_key(ephemeral.exchange(recipient), salt)
    ciphertext = AESGCM(key).encrypt(
        nonce,
        json.dumps(secrets, separators=(",", ":"), sort_keys=True).encode("utf-8"),
        _aad(installation_id, organization_id, facility_id),
    )
    return {
        "version": ENVELOPE_VERSION,
        "algorithm": ENVELOPE_ALGORITHM,
        "ephemeral_public_key": base64.b64encode(
            ephemeral.public_key().public_bytes(Encoding.Raw, PublicFormat.Raw)
        ).decode("ascii"),
        "salt": base64.b64encode(salt).decode("ascii"),
        "nonce": base64.b64encode(nonce).decode("ascii"),
        "ciphertext": base64.b64encode(ciphertext).decode("ascii"),
    }


def decrypt_activation_secrets(
    envelope: dict[str, Any],
    private_key: X25519PrivateKey,
    *,
    installation_id: str,
    organization_id: int,
    facility_id: int | None,
) -> dict[str, Any]:
    """Decrypt and authenticate an activation envelope for a specific tenant binding."""
    if (
        envelope.get("version") != ENVELOPE_VERSION
        or envelope.get("algorithm") != ENVELOPE_ALGORITHM
    ):
        raise ValueError("Unsupported activation secrets envelope")
    try:
        ephemeral = X25519PublicKey.from_public_bytes(
            base64.b64decode(envelope["ephemeral_public_key"], validate=True)
        )
        salt = base64.b64decode(envelope["salt"], validate=True)
        nonce = base64.b64decode(envelope["nonce"], validate=True)
        ciphertext = base64.b64decode(envelope["ciphertext"], validate=True)
        plaintext = AESGCM(_derive_key(private_key.exchange(ephemeral), salt)).decrypt(
            nonce, ciphertext, _aad(installation_id, organization_id, facility_id)
        )
    except (InvalidTag, KeyError, TypeError, ValueError) as exc:
        raise ValueError("Activation secrets envelope failed AAD authentication") from exc
    decoded = json.loads(plaintext.decode("utf-8"))
    if (
        not isinstance(decoded, dict)
        or not isinstance(decoded.get("encryption_key"), str)
        or not isinstance(decoded.get("pii_hmac_key"), str)
    ):
        raise ValueError("Activation secrets envelope payload is invalid")
    return decoded
