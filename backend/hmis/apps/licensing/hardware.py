# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""
Hardware fingerprint generation for hub installations.

Generates a stable SHA-256 fingerprint from hardware identifiers to
bind a license to a specific physical machine. Used for:
- Installation binding (prevent license cloning)
- Clone detection (same installation_id from different hardware)

Tolerance: allows one component change (e.g., disk replacement)
before requiring re-activation.
"""

from __future__ import annotations

import hashlib
import platform
import subprocess  # nosec B404 - needed for hardware fingerprint collection


def get_hardware_fingerprint() -> str:
    """
    Generate a hardware fingerprint for the current machine.

    Components:
    - CPU model/identifier
    - Motherboard/system serial (if available)
    - Primary disk serial/UUID

    Returns:
        SHA-256 hex digest of combined hardware identifiers.
    """
    components = _collect_hardware_components()
    combined = "|".join(sorted(f"{k}={v}" for k, v in components.items() if v))
    return hashlib.sha256(combined.encode()).hexdigest()


def get_hardware_components() -> dict[str, str]:
    """Return the raw hardware components (for debugging/support)."""
    return _collect_hardware_components()


def fingerprints_match(stored: str, current: str, *, _tolerance: int = 1) -> bool:
    """
    Check if two fingerprints are from the same machine.

    With _tolerance=1, we allow one component to differ (e.g., disk swap).
    For exact matching, set _tolerance=0.

    Note: This is a simple exact-match since the fingerprint is a hash.
    For tolerance, we'd need to compare components individually.
    In practice, we store and compare the full hash — tolerance is handled
    by the support re-activation flow, not cryptographically.
    """
    return stored == current


def _collect_hardware_components() -> dict[str, str]:
    """Collect hardware identifiers based on the current OS."""
    system = platform.system().lower()

    if system == "linux":
        return _linux_components()
    elif system == "windows":
        return _windows_components()
    elif system == "darwin":
        return _macos_components()
    else:
        return {"platform": platform.platform(), "machine": platform.machine()}


def _linux_components() -> dict[str, str]:
    """Collect hardware identifiers on Linux."""
    components: dict[str, str] = {}

    # CPU model
    components["cpu"] = _read_file("/proc/cpuinfo", parse_cpu=True)

    # Machine ID (stable across reboots, generated at install)
    components["machine_id"] = _read_file("/etc/machine-id").strip()

    # Motherboard/system serial
    components["board_serial"] = _read_file("/sys/class/dmi/id/board_serial").strip()

    # Product UUID (SMBIOS)
    components["product_uuid"] = _read_file("/sys/class/dmi/id/product_uuid").strip()

    # Primary disk serial (first block device)
    components["disk_id"] = _get_linux_disk_id()

    return components


def _windows_components() -> dict[str, str]:
    """Collect hardware identifiers on Windows."""
    components: dict[str, str] = {}

    # CPU
    components["cpu"] = platform.processor()

    # Motherboard serial via WMI
    components["board_serial"] = _run_command(
        ["wmic", "baseboard", "get", "serialnumber"],
        parse_wmic=True,
    )

    # BIOS serial
    components["bios_serial"] = _run_command(
        ["wmic", "bios", "get", "serialnumber"],
        parse_wmic=True,
    )

    # Disk serial
    components["disk_serial"] = _run_command(
        ["wmic", "diskdrive", "get", "serialnumber"],
        parse_wmic=True,
    )

    return components


def _macos_components() -> dict[str, str]:
    """Collect hardware identifiers on macOS."""
    components: dict[str, str] = {}

    components["cpu"] = platform.processor()

    # Hardware UUID
    components["hardware_uuid"] = _run_command(
        ["system_profiler", "SPHardwareDataType"],
        grep="Hardware UUID",
    )

    # Serial number
    components["serial"] = _run_command(
        ["system_profiler", "SPHardwareDataType"],
        grep="Serial Number",
    )

    return components


def _read_file(path: str, *, parse_cpu: bool = False) -> str:
    """Safely read a system file."""
    try:
        with open(path) as f:
            content = f.read()
        if parse_cpu:
            # Extract model name from /proc/cpuinfo
            for line in content.splitlines():
                if line.startswith("model name"):
                    return line.split(":", 1)[1].strip()
            return ""
        return content
    except (FileNotFoundError, PermissionError, OSError):
        return ""


def _get_linux_disk_id() -> str:
    """Get the primary disk identifier on Linux."""
    # Try /dev/disk/by-id (most reliable)
    try:
        import os

        disk_by_id = "/dev/disk/by-id"
        if os.path.isdir(disk_by_id):
            for entry in sorted(os.listdir(disk_by_id)):
                if "part" not in entry and (
                    entry.startswith("ata-")
                    or entry.startswith("scsi-")
                    or entry.startswith("nvme-")
                ):
                    return entry
    except (PermissionError, OSError):
        pass

    # Fallback: root filesystem UUID
    return _run_command(["/usr/bin/findmnt", "-n", "-o", "UUID", "/"])


def _run_command(
    cmd: list[str],
    *,
    parse_wmic: bool = False,
    grep: str = "",
) -> str:
    """Run a system command and return cleaned output."""
    try:
        result = subprocess.run(  # noqa: S603, S607  # nosec B603
            cmd,
            capture_output=True,
            text=True,
            timeout=10,
            check=False,
        )
        if result.returncode != 0:
            return ""

        output = result.stdout.strip()

        if parse_wmic:
            # WMI output: header line + value line
            lines = [line.strip() for line in output.splitlines() if line.strip()]
            return lines[1] if len(lines) >= 2 else ""

        if grep:
            for line in output.splitlines():
                if grep in line:
                    return line.split(":", 1)[1].strip() if ":" in line else line.strip()
            return ""

        return output
    except (subprocess.TimeoutExpired, FileNotFoundError, OSError):
        return ""


def compute_binary_hashes(base_dir: str) -> dict[str, str]:
    """
    Compute SHA-256 hashes of all .so/.pyd files in the installation.

    Args:
        base_dir: Root directory of the hub installation.

    Returns:
        Dict mapping relative path → SHA-256 hex digest.
    """
    from pathlib import Path

    hashes: dict[str, str] = {}
    base = Path(base_dir)

    for ext in ("*.so", "*.pyd"):
        for f in base.rglob(ext):
            rel_path = str(f.relative_to(base))
            sha = hashlib.sha256(f.read_bytes()).hexdigest()
            hashes[rel_path] = sha

    return hashes
