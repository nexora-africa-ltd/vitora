"""SHA PII decryption helpers.

The DHA/SHA gateway sometimes returns sensitive payloads in a hybrid-encrypted
`_pii` field (RSA-OAEP + AES-CBC).

Web clients must never decrypt `_pii` directly because it requires the RSA
private key. Decryption should happen server-side (Django) and only the
minimum required fields should be returned to the frontend.

This module provides a small, reusable implementation used by services that
consume DHA endpoints (e.g. Client Registry).
"""

from __future__ import annotations

import base64
import json
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path
from typing import Any

from django.conf import settings


class SHADecryptionError(Exception):
    """Raised when an SHA/DHA `_pii` payload cannot be decrypted."""


@lru_cache(maxsize=1)
def _load_sha_private_key_pem() -> str:
    """Load RSA private key PEM used to decrypt `_pii`.

    Resolution order:
    1) `settings.SHA_PRIVATE_KEY_PATH` if present
    2) `${BASE_DIR}/sha.pem` (BASE_DIR is the backend/ directory)

    Note: The private key must never be shipped to the frontend.
    """

    key_path = getattr(settings, "SHA_PRIVATE_KEY_PATH", "")
    if key_path:
        pem_path = Path(key_path)
    else:
        pem_path = Path(settings.BASE_DIR) / "sha.pem"

    if not pem_path.exists():
        raise SHADecryptionError(
            "SHA private key not found. Create backend/sha.pem or set SHA_PRIVATE_KEY_PATH."
        )

    return pem_path.read_text(encoding="utf-8")


@dataclass(frozen=True)
class _PIIParts:
    encrypted_aes_key: str
    encrypted_iv: str
    encrypted_json_data: str


def _split_pii(pii: str) -> _PIIParts:
    parts = pii.split(":")
    if len(parts) != 3:
        raise SHADecryptionError("Invalid _pii format (expected 3 colon-separated parts)")

    encrypted_aes_key, encrypted_iv, encrypted_json_data = parts
    return _PIIParts(
        encrypted_aes_key=encrypted_aes_key,
        encrypted_iv=encrypted_iv,
        encrypted_json_data=encrypted_json_data,
    )


def decrypt_pii_value(pii: str) -> dict[str, Any]:
    """Decrypt a raw `_pii` base64 string into a Python dict."""

    # Import Crypto lazily so normal code paths (no _pii) don't pay import cost.
    try:
        from Crypto.Cipher import AES, PKCS1_OAEP  # type: ignore
        from Crypto.PublicKey import RSA  # type: ignore
        from Crypto.Util.Padding import unpad  # type: ignore
    except Exception as exc:  # pragma: no cover
        raise SHADecryptionError(
            "Crypto backend not available. Ensure pycryptodome is installed."
        ) from exc

    private_key_pem = _load_sha_private_key_pem()
    rsa_key = RSA.import_key(private_key_pem)
    cipher_rsa = PKCS1_OAEP.new(rsa_key)

    pii_parts = _split_pii(pii)

    # DHA format: RSA decrypt yields base64-encoded bytes; decode twice.
    def _rsa_decrypt_to_bytes(encrypted_part: str) -> bytes:
        decrypted = cipher_rsa.decrypt(base64.b64decode(encrypted_part))
        return base64.b64decode(decrypted)

    aes_key = _rsa_decrypt_to_bytes(pii_parts.encrypted_aes_key)
    iv = _rsa_decrypt_to_bytes(pii_parts.encrypted_iv)

    cipher_aes = AES.new(aes_key, AES.MODE_CBC, iv)
    padded_plaintext = cipher_aes.decrypt(base64.b64decode(pii_parts.encrypted_json_data))
    plaintext = unpad(padded_plaintext, AES.block_size).decode("utf-8")

    try:
        return json.loads(plaintext)
    except json.JSONDecodeError as exc:
        raise SHADecryptionError("Decrypted _pii is not valid JSON") from exc


def maybe_decrypt_client_registry_item(item: dict[str, Any]) -> dict[str, Any]:
    """If a CR result item contains `_pii`, decrypt and return the payload."""

    pii = item.get("_pii")
    if not pii:
        return item

    if not isinstance(pii, str):
        raise SHADecryptionError("Invalid _pii value (expected string)")

    return decrypt_pii_value(pii)
