# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""
Honeypot strings and canary tokens for hub builds.

Phase 5D: Compiled binaries contain unique trap strings that can be traced
back to the source installation if they appear in a competitor's codebase
or a public dump.

These canary tokens serve as forensic evidence of provenance in
legal proceedings. They have zero runtime cost and are only discoverable
through binary analysis or string extraction.
"""

from __future__ import annotations

import hashlib
import hmac
import logging
import os
from functools import lru_cache
from pathlib import Path

from django.conf import settings

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Canary Token Generation
# ---------------------------------------------------------------------------


def generate_canary_token(installation_id: str, purpose: str = "general") -> str:
    """
    Generate a unique canary token for an installation.

    The token is:
    - Deterministic (same inputs → same output)
    - Not reversible to installation_id without the secret
    - Unique per installation + purpose combination

    Args:
        installation_id: The installation's unique identifier.
        purpose: Token purpose/location (e.g., 'binary', 'log', 'pdf').

    Returns:
        A 32-character hex canary token.
    """
    secret = _get_canary_secret()
    message = f"{installation_id}|{purpose}|vitora-canary"
    return hmac.new(
        secret.encode(),
        message.encode(),
        hashlib.sha256,
    ).hexdigest()[:32]


def generate_honeypot_strings(installation_id: str) -> list[str]:
    """
    Generate a set of honeypot strings to embed in compiled binaries.

    These strings are designed to look like internal comments or debug
    markers that would survive binary extraction tools.

    Args:
        installation_id: The installation's unique identifier.

    Returns:
        List of unique trap strings for this installation.
    """
    token = generate_canary_token(installation_id, "binary")
    short_id = token[:8]

    return [
        f"internal use only — installation {short_id}",
        f"nexora-build-ref:{token[:16]}",
        f"vitora-hub-{short_id}-licensed",
        f"© 2026 Nexora Consulting Ltd [ref:{short_id}]",
        f"HMIS-LICENSE-MARKER-{token[:12]}",
    ]


def generate_log_canary(installation_id: str) -> str:
    """
    Generate a canary string for log output.

    Embedded in periodic log messages (e.g., health checks) so that
    if logs are shared publicly, the source can be identified.

    Args:
        installation_id: The installation's unique identifier.

    Returns:
        A canary string suitable for log embedding.
    """
    token = generate_canary_token(installation_id, "log")
    return f"hub-health-ref:{token[:12]}"


def generate_pdf_canary(installation_id: str) -> str:
    """
    Generate a canary string for PDF metadata.

    Embedded in the 'Keywords' or custom metadata field of generated PDFs.

    Args:
        installation_id: The installation's unique identifier.

    Returns:
        A canary string for PDF metadata.
    """
    token = generate_canary_token(installation_id, "pdf")
    return f"nxr-{token[:10]}"


# ---------------------------------------------------------------------------
# Canary Embedding (Build-time)
# ---------------------------------------------------------------------------


def write_canary_file(output_dir: Path, installation_id: str) -> Path:
    """
    Write a canary token file into the build payload.

    The file contains all honeypot strings for this installation.
    It's compiled by Nuitka into the binary, making the strings
    extractable only through binary analysis.

    Args:
        output_dir: Build payload directory.
        installation_id: Target installation ID.

    Returns:
        Path to the written canary file.
    """
    canary_path = output_dir / "hmis" / "apps" / "licensing" / "_canary_data.py"
    canary_path.parent.mkdir(parents=True, exist_ok=True)

    honeypot_strings = generate_honeypot_strings(installation_id)
    canary_token = generate_canary_token(installation_id, "binary")
    log_canary = generate_log_canary(installation_id)

    content = f'''# Auto-generated canary data — do not modify
# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
_CANARY_TOKEN = "{canary_token}"
_HONEYPOT = {honeypot_strings!r}
_LOG_REF = "{log_canary}"
'''
    canary_path.write_text(content)
    return canary_path


# ---------------------------------------------------------------------------
# Canary Verification (Cloud-side)
# ---------------------------------------------------------------------------


def verify_canary_token(token: str, installation_id: str, purpose: str = "general") -> bool:
    """
    Verify if a canary token belongs to a specific installation.

    Used by cloud forensics when a leaked canary is found.

    Args:
        token: The canary token found in the wild.
        installation_id: Suspected source installation.
        purpose: The token's declared purpose.

    Returns:
        True if the token matches this installation.
    """
    expected = generate_canary_token(installation_id, purpose)
    # Use constant-time comparison to avoid timing attacks
    return hmac.compare_digest(token, expected[: len(token)])


def identify_installation_from_canary(
    token: str,
    known_installations: list[str],
    purpose: str = "general",
) -> str | None:
    """
    Identify which installation produced a given canary token.

    Brute-forces through known installations to find the source.
    Only used in cloud forensics/admin tools.

    Args:
        token: The canary token found in leaked material.
        known_installations: List of all installation IDs to check.
        purpose: The token's purpose category.

    Returns:
        The matching installation_id, or None if not found.
    """
    for inst_id in known_installations:
        expected = generate_canary_token(inst_id, purpose)
        if hmac.compare_digest(token, expected[: len(token)]):
            return inst_id
    return None


# ---------------------------------------------------------------------------
# Runtime Canary (Embedded at Install)
# ---------------------------------------------------------------------------


@lru_cache(maxsize=1)
def get_local_canary() -> str:
    """
    Get the canary token for the current installation.

    Reads from the compiled _canary_data module or falls back to
    generating from the installation_id in the license token.
    """
    # Try compiled canary data first
    try:
        from hmis.apps.licensing._canary_data import _CANARY_TOKEN  # type: ignore[import]

        return _CANARY_TOKEN
    except ImportError:
        pass

    # Fallback: derive from license token
    try:
        token_path = getattr(
            settings,
            "HUB_LICENSE_TOKEN_PATH",
            "/var/lib/vitora-hub/license.jwt",
        )
        token_content = Path(token_path).read_text().strip()
        if token_content:
            import jwt as pyjwt

            payload = pyjwt.decode(token_content, options={"verify_signature": False})
            installation_id = payload.get("installation_id", "")
            if installation_id:
                return generate_canary_token(installation_id)
    except (FileNotFoundError, ImportError, Exception):  # noqa: BLE001
        logger.debug("Could not derive canary from license token.")

    return ""


# ---------------------------------------------------------------------------
# Internal Helpers
# ---------------------------------------------------------------------------


def _get_canary_secret() -> str:
    """
    Get the HMAC secret used for canary token generation.

    In production, this is a separate secret from the Django SECRET_KEY.
    """
    secret = os.getenv("VITORA_CANARY_SECRET", "")
    if not secret:
        # Fall back to a derivative of SECRET_KEY (less ideal but functional)
        django_secret = getattr(settings, "SECRET_KEY", "default-dev-secret")
        secret = hashlib.sha256(f"canary|{django_secret}".encode()).hexdigest()
    return secret
