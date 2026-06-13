# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""
Watermarking module for hub builds.

Phase 5C: Each compiled build embeds a unique build ID that appears in:
- Internal log output
- Generated PDFs (metadata)
- Exported reports
- HTTP response headers (X-Vitora-Build, optional)

If a Vitora-derived product surfaces in the market, the build ID
identifies the source installation.
"""

from __future__ import annotations

import hashlib
import logging
import os
from functools import lru_cache
from pathlib import Path

from django.conf import settings

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Build ID Generation & Retrieval
# ---------------------------------------------------------------------------


@lru_cache(maxsize=1)
def get_build_id() -> str:
    """
    Retrieve the build ID for this installation.

    Sources (checked in order):
    1. VITORA_BUILD_ID environment variable (set at compile time)
    2. .build-id file in the installation directory
    3. Derived from manifest.json hash + VERSION file

    Returns:
        A short hex string (16 chars) identifying this specific build.
    """
    # 1. Environment variable (highest priority)
    env_id = os.getenv("VITORA_BUILD_ID", "").strip()
    if env_id:
        return env_id[:16]

    # 2. .build-id file
    base_dir = getattr(settings, "BASE_DIR", "")
    if base_dir:
        build_id_file = Path(base_dir) / ".build-id"
        if build_id_file.exists():
            try:
                return build_id_file.read_text().strip()[:16]
            except OSError:
                pass

    # 3. Derive from manifest + version
    return _derive_build_id()


def generate_build_id(
    version: str,
    installation_id: str = "",
    timestamp: str = "",
) -> str:
    """
    Generate a unique build ID for a specific installation build.

    Called during the compilation pipeline (Phase 2) to create a
    per-customer or per-build identifier.

    Args:
        version: Release version string.
        installation_id: Target installation (empty for generic builds).
        timestamp: Build timestamp (ISO format).

    Returns:
        16-character hex build ID.
    """
    components = [version, installation_id, timestamp, "vitora-hmis"]
    combined = "|".join(c for c in components if c)
    return hashlib.sha256(combined.encode()).hexdigest()[:16]


def embed_build_id_in_file(file_path: Path, build_id: str) -> bool:
    """
    Write a .build-id file into the build payload.

    Called by the compilation script to embed the ID in the shipped artifact.

    Args:
        file_path: Path where .build-id should be written.
        build_id: The 16-char hex build ID.

    Returns:
        True if written successfully.
    """
    try:
        file_path.parent.mkdir(parents=True, exist_ok=True)
        file_path.write_text(build_id)
        return True
    except OSError as exc:
        logger.error("Failed to embed build ID: %s", exc)
        return False


# ---------------------------------------------------------------------------
# Watermark Injection Points
# ---------------------------------------------------------------------------


def get_log_prefix() -> str:
    """
    Get a log prefix containing the build ID.

    Use in logging formatters:
        formatter = logging.Formatter(f'{get_log_prefix()} %(levelname)s ...')
    """
    build_id = get_build_id()
    if build_id and build_id != "dev-unknown":
        return f"[build:{build_id}]"
    return ""


def get_pdf_metadata() -> dict[str, str]:
    """
    Get PDF metadata dict containing watermark information.

    Embed in generated PDFs:
        pdf.set_producer(watermark.get_pdf_metadata()['producer'])
    """
    build_id = get_build_id()
    return {
        "producer": f"Vitora HMIS (build {build_id})",
        "creator": "Nexora Consulting Ltd",
        "build_id": build_id,
    }


def get_export_metadata() -> dict[str, str]:
    """
    Get metadata for data exports (CSV, Excel, FHIR bundles).

    Included in export file headers or metadata blocks.
    """
    build_id = get_build_id()
    version = _get_version()
    return {
        "generator": "Vitora HMIS",
        "generator_version": version,
        "build_id": build_id,
        "vendor": "Nexora Consulting Ltd",
    }


def get_response_headers() -> dict[str, str]:
    """
    Get HTTP response headers containing the build watermark.

    Add via middleware for all API responses:
        response['X-Vitora-Build'] = watermark.get_response_headers()['X-Vitora-Build']
    """
    build_id = get_build_id()
    return {
        "X-Vitora-Build": build_id,
    }


# ---------------------------------------------------------------------------
# Watermark Verification
# ---------------------------------------------------------------------------


def verify_build_id(reported_id: str) -> dict:
    """
    Verify a reported build ID against known builds.

    Used by the cloud to trace a leaked build back to its source.

    Args:
        reported_id: Build ID found in leaked material.

    Returns:
        Verification result dict.
    """
    # This is a cloud-side function; on the hub it just confirms its own ID
    own_id = get_build_id()
    return {
        "matches_self": reported_id == own_id,
        "own_build_id": own_id,
        "reported_id": reported_id,
    }


# ---------------------------------------------------------------------------
# Internal Helpers
# ---------------------------------------------------------------------------


def _derive_build_id() -> str:
    """Derive a build ID from available installation artifacts."""
    base_dir = getattr(settings, "BASE_DIR", "")
    if not base_dir:
        return "dev-unknown"

    base_path = Path(base_dir)
    components = []

    # Include manifest hash if available
    manifest_file = base_path / "manifest.json"
    if manifest_file.exists():
        try:
            content = manifest_file.read_bytes()
            components.append(hashlib.sha256(content).hexdigest()[:8])
        except OSError:
            pass

    # Include version
    version = _get_version()
    if version and version != "unknown":
        components.append(version)

    if not components:
        return "dev-unknown"

    combined = "|".join(components)
    return hashlib.sha256(combined.encode()).hexdigest()[:16]


def _get_version() -> str:
    """Read the hub version."""
    base_dir = getattr(settings, "BASE_DIR", "")
    if base_dir:
        version_file = Path(base_dir) / "VERSION"
        if version_file.exists():
            try:
                return version_file.read_text().strip()
            except OSError:
                pass
    return "unknown"
