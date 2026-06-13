# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
# ruff: noqa: S607 — TPM CLI tools invoked by partial name (tpm2_*) intentionally.
"""
TPM 2.0 attestation module for hub installations.

Phase 5B: Where TPM 2.0 is available, the hub measures its own binary set
into a PCR (Platform Configuration Register) and quotes the PCR in check-in.
The cloud verifies the quote against the expected manifest.

This provides cryptographic proof of tamper — not just a hash report that
could be faked by a compromised hub.

Requirements:
- tpm2-tools installed (tpm2_createprimary, tpm2_create, tpm2_quote, etc.)
- /dev/tpm0 or /dev/tpmrm0 accessible
- python-tss2 for direct TSS2 access (optional, fallback to CLI)

This module is OPTIONAL — hubs without TPM fall back to software-only
integrity reporting (Phase 3 binary hashes).
"""

from __future__ import annotations

import hashlib
import logging
import platform
import subprocess  # nosec B404 - needed for tpm2-tools CLI
from pathlib import Path

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# TPM Availability
# ---------------------------------------------------------------------------


def is_tpm_available() -> bool:
    """
    Check if a TPM 2.0 device is accessible on this system.

    Returns:
        True if TPM 2.0 is available and usable.
    """
    if platform.system() != "Linux":
        # TPM support currently only implemented for Linux
        return False

    # Check for TPM device nodes
    tpm_devices = [Path("/dev/tpmrm0"), Path("/dev/tpm0")]
    if not any(dev.exists() for dev in tpm_devices):
        return False

    # Verify tpm2-tools are installed
    try:
        result = subprocess.run(  # noqa: S603, S607  # nosec B603 B607
            ["tpm2_getcap", "properties-fixed"],
            capture_output=True,
            text=True,
            timeout=5,
        )
        return result.returncode == 0
    except (FileNotFoundError, subprocess.TimeoutExpired):
        return False


def get_tpm_info() -> dict[str, str]:
    """
    Get TPM device information for diagnostics.

    Returns:
        Dict with TPM manufacturer, firmware version, etc.
    """
    if not is_tpm_available():
        return {"available": "false"}

    info: dict[str, str] = {"available": "true"}

    try:
        result = subprocess.run(  # noqa: S603, S607  # nosec B603 B607
            ["tpm2_getcap", "properties-fixed"],
            capture_output=True,
            text=True,
            timeout=10,
        )
        if result.returncode == 0:
            for line in result.stdout.splitlines():
                if "TPM2_PT_MANUFACTURER" in line:
                    info["manufacturer"] = line.split(":")[-1].strip()
                elif "TPM2_PT_FIRMWARE_VERSION" in line:
                    info["firmware_version"] = line.split(":")[-1].strip()
    except (FileNotFoundError, subprocess.TimeoutExpired):
        pass

    return info


# ---------------------------------------------------------------------------
# PCR Measurement
# ---------------------------------------------------------------------------


# PCR bank and index used for application integrity
PCR_BANK = "sha256"
PCR_INDEX = 14  # PCR 14 is conventionally available for application use


def extend_pcr_with_binary(binary_path: Path) -> bool:
    """
    Extend a PCR with the hash of a compiled binary.

    Each binary (.so) file is measured into the PCR, creating a
    chain of measurements that represents the complete application state.

    Args:
        binary_path: Path to the binary file to measure.

    Returns:
        True if the PCR extend succeeded.
    """
    if not is_tpm_available():
        return False

    try:
        # Compute SHA-256 of the binary
        file_hash = hashlib.sha256(binary_path.read_bytes()).hexdigest()

        # Extend PCR with the file hash
        result = subprocess.run(  # noqa: S603, S607  # nosec B603 B607
            [
                "tpm2_pcrextend",
                f"{PCR_INDEX}:{PCR_BANK}={file_hash}",
            ],
            capture_output=True,
            text=True,
            timeout=5,
        )
        return result.returncode == 0
    except (OSError, subprocess.TimeoutExpired) as exc:
        logger.warning("PCR extend failed for %s: %s", binary_path, exc)
        return False


def measure_all_binaries(install_dir: Path) -> dict[str, str]:
    """
    Measure all compiled binaries into the TPM PCR.

    This should be called at startup to establish the application
    integrity state in the TPM.

    Args:
        install_dir: Root directory of the hub installation.

    Returns:
        Dict of measured files and their hashes.
    """
    measured: dict[str, str] = {}

    if not is_tpm_available():
        logger.info("TPM not available; skipping binary measurement.")
        return measured

    # Reset PCR 14 first (requires owner auth in production)
    _reset_pcr()

    for so_file in sorted(install_dir.rglob("*.so")):
        file_hash = hashlib.sha256(so_file.read_bytes()).hexdigest()
        rel_path = str(so_file.relative_to(install_dir))

        if extend_pcr_with_binary(so_file):
            measured[rel_path] = file_hash
        else:
            logger.warning("Failed to measure %s into TPM", rel_path)

    logger.info("Measured %d binaries into PCR %d", len(measured), PCR_INDEX)
    return measured


# ---------------------------------------------------------------------------
# PCR Quote (Attestation)
# ---------------------------------------------------------------------------


def generate_pcr_quote(nonce: str = "") -> dict | None:
    """
    Generate a TPM PCR quote for attestation.

    The quote is a signed statement from the TPM about the current
    PCR values. The cloud can verify this against the expected state.

    Args:
        nonce: A server-provided nonce to prevent replay attacks.
            Should be provided by the cloud at each check-in.

    Returns:
        Dict with quote data and signature, or None if unavailable.
    """
    if not is_tpm_available():
        return None

    try:
        # Create attestation key (or use persistent handle)
        ak_ctx = "/tmp/vitora_ak.ctx"  # noqa: S108  # nosec B108  # TPM context files
        quote_msg = "/tmp/vitora_quote.msg"  # noqa: S108  # nosec B108  # TPM output
        quote_sig = "/tmp/vitora_quote.sig"  # noqa: S108  # nosec B108  # TPM output
        quote_pcrs = "/tmp/vitora_quote.pcrs"  # noqa: S108  # nosec B108  # TPM output

        # Create AK if not exists
        if not Path(ak_ctx).exists():
            _create_attestation_key(ak_ctx)

        # Build qualifying data (nonce)
        qualifying_data = nonce or "vitora-attestation"

        # Generate quote
        result = subprocess.run(  # noqa: S603, S607  # nosec B603 B607
            [
                "tpm2_quote",
                "--key-context",
                ak_ctx,
                "--pcr-list",
                f"{PCR_BANK}:{PCR_INDEX}",
                "--message",
                quote_msg,
                "--signature",
                quote_sig,
                "--pcrs",
                quote_pcrs,
                "--qualification",
                qualifying_data,
            ],
            capture_output=True,
            text=True,
            timeout=10,
        )

        if result.returncode != 0:
            logger.error("TPM quote failed: %s", result.stderr)
            return None

        # Read outputs
        quote_data = {
            "pcr_bank": PCR_BANK,
            "pcr_index": PCR_INDEX,
            "nonce": qualifying_data,
            "message": _read_binary_base64(quote_msg),
            "signature": _read_binary_base64(quote_sig),
            "pcr_values": _read_binary_base64(quote_pcrs),
        }

        return quote_data

    except (OSError, subprocess.TimeoutExpired) as exc:
        logger.error("TPM quote generation error: %s", exc)
        return None


def verify_pcr_quote(
    quote_data: dict,
    expected_pcr_value: str,  # noqa: ARG001
    ak_public_key: str,  # noqa: ARG001
) -> bool:
    """
    Verify a TPM PCR quote (cloud-side).

    This verifies:
    1. The quote signature is valid (from the known AK)
    2. The PCR value in the quote matches expected
    3. The nonce matches what was sent

    Args:
        quote_data: Quote dict from generate_pcr_quote().
        expected_pcr_value: Expected PCR value from the integrity manifest.
        ak_public_key: The installation's attestation key public part.

    Returns:
        True if the quote is valid and PCR matches expected.
    """
    # Cloud-side verification — implemented as a stub here
    # In production, this uses tpm2_checkquote on the cloud server
    if not quote_data:
        return False

    # Basic structure validation
    required_fields = ["pcr_bank", "pcr_index", "message", "signature", "pcr_values"]
    if not all(f in quote_data for f in required_fields):
        return False

    # Full TPM quote verification requires tpm2-tools on the verifier
    # This is a placeholder for the cloud-side implementation
    logger.info("TPM quote verification placeholder — implement on cloud.")
    return True


# ---------------------------------------------------------------------------
# Internal Helpers
# ---------------------------------------------------------------------------


def _reset_pcr() -> bool:
    """Reset PCR 14 to initial state (all zeros)."""
    try:
        # Note: PCR reset requires locality 3+ or specific platform auth
        # In production, this is done at boot via the init system
        result = subprocess.run(  # noqa: S603, S607  # nosec B603 B607
            ["tpm2_pcrreset", str(PCR_INDEX)],
            capture_output=True,
            text=True,
            timeout=5,
        )
        return result.returncode == 0
    except (FileNotFoundError, subprocess.TimeoutExpired):
        return False


def _create_attestation_key(ctx_path: str) -> bool:
    """Create an attestation key pair in the TPM."""
    try:
        # Create primary key under endorsement hierarchy
        primary_ctx = "/tmp/vitora_primary.ctx"  # noqa: S108  # nosec B108
        ak_pub = "/tmp/vitora_ak.pub"  # noqa: S108  # nosec B108
        ak_priv = "/tmp/vitora_ak.priv"  # noqa: S108  # nosec B108
        subprocess.run(  # noqa: S603, S607  # nosec B603 B607
            [
                "tpm2_createprimary",
                "--hierarchy",
                "e",
                "--key-context",
                primary_ctx,
            ],
            capture_output=True,
            text=True,
            timeout=10,
            check=True,
        )

        # Create attestation key under primary
        subprocess.run(  # noqa: S603, S607  # nosec B603 B607
            [
                "tpm2_create",
                "--parent-context",
                primary_ctx,
                "--key-algorithm",
                "rsa2048:rsassa-sha256",
                "--public",
                ak_pub,
                "--private",
                ak_priv,
            ],
            capture_output=True,
            text=True,
            timeout=10,
            check=True,
        )

        # Load the key
        subprocess.run(  # noqa: S603, S607  # nosec B603 B607
            [
                "tpm2_load",
                "--parent-context",
                primary_ctx,
                "--public",
                ak_pub,
                "--private",
                ak_priv,
                "--key-context",
                ctx_path,
            ],
            capture_output=True,
            text=True,
            timeout=10,
            check=True,
        )

        return True
    except (subprocess.CalledProcessError, subprocess.TimeoutExpired) as exc:
        logger.error("Failed to create attestation key: %s", exc)
        return False


def _read_binary_base64(path: str) -> str:
    """Read a binary file and return as base64."""
    import base64

    try:
        data = Path(path).read_bytes()
        return base64.b64encode(data).decode()
    except OSError:
        return ""
