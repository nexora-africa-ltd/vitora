# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""Submit or recover a hub SQLCipher key through the cloud escrow API.

Run as ``python hub_database_key_escrow.py submit|recover``. Configuration and
key material are read only from process environment variables; no secret is
accepted as a command-line argument or written to logs.
"""

from __future__ import annotations

import base64
import json
import os
import sys
import urllib.error
import urllib.request

from cryptography.hazmat.primitives.asymmetric.x25519 import X25519PrivateKey
from cryptography.hazmat.primitives.serialization import Encoding, PublicFormat

from hmis.apps.licensing.activation_secrets import decrypt_activation_secrets


def _request(endpoint: str, payload: dict[str, str]) -> dict:
    base_url = os.environ["CLOUD_API_BASE_URL"].rstrip("/")
    token = os.environ["LICENSE_TOKEN"]
    request = urllib.request.Request(  # noqa: S310 - cloud URL is activation-configured
        f"{base_url}/api/licensing/escrow/{endpoint}/",
        data=json.dumps(payload).encode("utf-8"),
        headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=20) as response:  # noqa: S310 - cloud URL is activation-configured
            return json.loads(response.read())
    except (urllib.error.HTTPError, urllib.error.URLError, TimeoutError, ValueError) as exc:
        raise RuntimeError("Cloud database-key escrow request failed.") from exc


def submit() -> None:
    key = os.environ.get("HUB_DATABASE_ENCRYPTION_KEY", "")
    if not key:
        raise RuntimeError("No local hub database key is available for escrow enrollment.")
    _request("submit", {"hub_database_encryption_key": key})


def recover() -> None:
    private_key = X25519PrivateKey.generate()
    public_key = base64.b64encode(
        private_key.public_key().public_bytes(Encoding.Raw, PublicFormat.Raw)
    ).decode("ascii")
    response = _request("recover", {"device_public_key": public_key})
    try:
        recovered = decrypt_activation_secrets(
            response["recovery_envelope"],
            private_key,
            installation_id=os.environ["HUB_ID"],
            organization_id=int(os.environ["HUB_ORGANIZATION_ID"]),
            facility_id=int(os.environ["HUB_FACILITY_ID"]),
        )["hub_database_encryption_key"]
    except (KeyError, TypeError, ValueError) as exc:
        raise RuntimeError("Cloud database-key recovery response was invalid.") from exc
    # This is intentionally the only sensitive output. Callers capture it
    # directly into a protected process variable and never write it to a log.
    sys.stdout.write(recovered)


def main() -> int:
    if len(sys.argv) != 2 or sys.argv[1] not in {"submit", "recover"}:
        print("Usage: hub_database_key_escrow.py submit|recover", file=sys.stderr)
        return 2
    try:
        {"submit": submit, "recover": recover}[sys.argv[1]]()
    except (KeyError, RuntimeError) as exc:
        print(str(exc), file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
