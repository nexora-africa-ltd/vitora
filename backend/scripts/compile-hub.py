# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""
Nuitka compilation script for Vitora HMIS hub builds.

Compiles Django app modules into native .so/.pyd binaries, removing
readable Python source from the shipped artifact.

Usage:
    python scripts/compile-hub.py [--output-dir build/compiled] [--dry-run]

Requirements:
    - Nuitka (pip install nuitka)
    - C compiler (gcc/clang on Linux, MSVC on Windows)
    - Python development headers (python3-dev on Debian/Ubuntu)
"""

from __future__ import annotations

import argparse
import shutil
import subprocess
import sys
from pathlib import Path

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

# Base directory of the backend (parent of this script's dir)
BACKEND_DIR = Path(__file__).resolve().parent.parent

# Apps to compile (relative to BACKEND_DIR)
APPS_TO_COMPILE = [
    "hmis.apps.core",
    "hmis.apps.patients",
    "hmis.apps.encounters",
    "hmis.apps.billing",
    "hmis.apps.pharmacy",
    "hmis.apps.laboratory",
    "hmis.apps.scheduling",
    "hmis.apps.triage",
    "hmis.apps.inpatient",
    "hmis.apps.clinics",
    "hmis.apps.licensing",
    "hmis.apps.ai",
    "hmis.apps.surveillance",
    "hmis.apps.quality",
    "hmis.apps.imaging",
    "hmis.apps.allied_health",
    "hmis.apps.clinical_templates",
]

# Files that MUST remain as plain Python (entry points, settings, migrations)
KEEP_PLAIN = {
    "manage.py",
    "hmis/__init__.py",
    "hmis/wsgi.py",
    "hmis/asgi.py",
    "hmis/celery.py",
    "hmis/urls.py",
}

# Patterns within app directories that stay plain
PLAIN_PATTERNS = {
    "apps.py",  # Django app autodiscovery
    "migrations/",  # Django migration framework requires source
    "__init__.py",  # Package markers (minimal, no IP)
}


def find_app_dir(app_module: str) -> Path:
    """Resolve a dotted module path to a filesystem directory."""
    return BACKEND_DIR / app_module.replace(".", "/")


def should_keep_plain(filepath: Path, app_dir: Path) -> bool:
    """Check if a file should be kept as plain Python."""
    rel = filepath.relative_to(BACKEND_DIR)
    rel_str = str(rel)

    # Global keeps
    if rel_str in KEEP_PLAIN:
        return True

    # Within-app patterns
    rel_to_app = filepath.relative_to(app_dir)
    for pattern in PLAIN_PATTERNS:
        if pattern.endswith("/"):
            if str(rel_to_app).startswith(pattern) or f"/{pattern}" in str(rel_to_app):
                return True
        elif rel_to_app.name == pattern:
            return True

    return False


def compile_app(
    app_module: str,
    output_dir: Path,
    *,
    dry_run: bool = False,
    jobs: int = 0,
) -> bool:
    """
    Compile a single Django app module with Nuitka.

    Returns True on success, False on failure.
    """
    app_dir = find_app_dir(app_module)
    if not app_dir.exists():
        print(f"  SKIP {app_module} (directory not found)")
        return True

    print(f"  COMPILE {app_module}")

    cmd = [
        sys.executable,
        "-m",
        "nuitka",
        "--module",
        app_module,
        f"--include-package={app_module}",
        f"--output-dir={output_dir}",
        "--remove-output",
        "--no-pyi-file",
        "--assume-yes-for-downloads",
    ]

    if jobs:
        cmd.append(f"--jobs={jobs}")

    # Nuitka Django plugin for model metaclass support
    cmd.append("--enable-plugin=django")

    if dry_run:
        print(f"    [DRY RUN] {' '.join(cmd)}")
        return True

    try:
        result = subprocess.run(
            cmd,
            cwd=str(BACKEND_DIR),
            capture_output=True,
            text=True,
            check=False,
        )
        if result.returncode != 0:
            print(f"    FAILED: {result.stderr[:500]}")
            return False
        return True
    except FileNotFoundError:
        print("    ERROR: Nuitka not found. Install with: pip install nuitka")
        return False


def assemble_payload(output_dir: Path, payload_dir: Path) -> None:
    """
    Assemble the final hub payload directory.

    Copies compiled .so/.pyd files and plain Python files into a clean
    directory structure ready for packaging.
    """
    print("\n  ASSEMBLE payload...")

    # Start with a copy of the backend source structure
    if payload_dir.exists():
        shutil.rmtree(payload_dir)

    # Copy everything first
    shutil.copytree(
        BACKEND_DIR / "hmis",
        payload_dir / "hmis",
        ignore=shutil.ignore_patterns("__pycache__", "*.pyc", ".mypy_cache"),
    )

    # Copy manage.py and other top-level files
    for f in ["manage.py", "pyproject.toml"]:
        src = BACKEND_DIR / f
        if src.exists():
            shutil.copy2(src, payload_dir / f)

    # Copy data directory
    data_dir = BACKEND_DIR / "data"
    if data_dir.exists():
        shutil.copytree(data_dir, payload_dir / "data")

    # Copy keys (public only)
    keys_dir = BACKEND_DIR / "keys"
    if keys_dir.exists():
        (payload_dir / "keys").mkdir(parents=True, exist_ok=True)
        pub_key = keys_dir / "license_public.pem"
        if pub_key.exists():
            shutil.copy2(pub_key, payload_dir / "keys" / "license_public.pem")

    # Now replace .py files with compiled .so/.pyd where available
    compiled_count = 0
    for so_file in output_dir.glob("**/*.so"):
        # Determine the corresponding .py file in the payload
        # Nuitka outputs: hmis.apps.core.cpython-312-x86_64-linux-gnu.so
        # or module-level .so files
        _place_compiled_file(so_file, output_dir, payload_dir)
        compiled_count += 1

    for pyd_file in output_dir.glob("**/*.pyd"):
        _place_compiled_file(pyd_file, output_dir, payload_dir)
        compiled_count += 1

    # Remove .py files that have been compiled (except plain-keeps)
    removed = 0
    for app_module in APPS_TO_COMPILE:
        app_dir = find_app_dir(app_module)
        if not app_dir.exists():
            continue
        payload_app_dir = payload_dir / app_module.replace(".", "/")
        if not payload_app_dir.exists():
            continue
        for py_file in payload_app_dir.rglob("*.py"):
            if not should_keep_plain(py_file, payload_app_dir):
                py_file.unlink()
                removed += 1

    print(f"    Compiled modules placed: {compiled_count}")
    print(f"    Source files removed: {removed}")

    # Remove __pycache__ dirs
    for cache_dir in payload_dir.rglob("__pycache__"):
        shutil.rmtree(cache_dir, ignore_errors=True)


def _place_compiled_file(so_file: Path, output_dir: Path, payload_dir: Path) -> None:
    """Place a compiled .so/.pyd into the correct location in the payload."""
    # Nuitka --module creates files like:
    #   hmis/apps/core.cpython-312-x86_64-linux-gnu.so  (for the package)
    # We need to place these in the right spot in the payload tree
    rel = so_file.relative_to(output_dir)
    dest = payload_dir / rel
    dest.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(so_file, dest)


def generate_manifest(payload_dir: Path, version: str) -> dict:
    """Generate an integrity manifest (path -> sha256) for the payload."""
    import hashlib
    import json

    manifest = {"version": version, "files": []}

    for f in sorted(payload_dir.rglob("*")):
        if f.is_file():
            sha = hashlib.sha256(f.read_bytes()).hexdigest()
            manifest["files"].append(
                {
                    "path": str(f.relative_to(payload_dir)),
                    "sha256": sha,
                    "size": f.stat().st_size,
                }
            )

    # Write manifest
    manifest_path = payload_dir / "manifest.json"
    manifest_path.write_text(json.dumps(manifest, indent=2))
    print(f"  MANIFEST generated: {len(manifest['files'])} files")

    # Also write to output dir (parent of payload) for CI signing step
    output_manifest = payload_dir.parent / "manifest.json"
    output_manifest.write_text(json.dumps(manifest, indent=2))

    return manifest


def main() -> None:
    parser = argparse.ArgumentParser(description="Compile Vitora HMIS hub with Nuitka")
    parser.add_argument(
        "--output-dir",
        type=Path,
        default=BACKEND_DIR / "build" / "compiled",
        help="Directory for Nuitka compilation output",
    )
    parser.add_argument(
        "--payload-dir",
        type=Path,
        default=BACKEND_DIR / "build" / "payload",
        help="Directory for the assembled payload",
    )
    parser.add_argument(
        "--version",
        type=str,
        default="dev",
        help="Version string for the manifest",
    )
    parser.add_argument("--dry-run", action="store_true", help="Print commands without executing")
    parser.add_argument("--jobs", type=int, default=0, help="Parallel compilation jobs (0=auto)")
    args = parser.parse_args()

    print("Vitora HMIS Hub Compilation (Nuitka)")
    print(f"  Backend dir: {BACKEND_DIR}")
    print(f"  Output dir:  {args.output_dir}")
    print(f"  Payload dir: {args.payload_dir}")
    print(f"  Version:     {args.version}")
    print()

    # Ensure output directory exists
    args.output_dir.mkdir(parents=True, exist_ok=True)

    # Compile each app
    print("Phase 1: Compiling apps...")
    failed = []
    for app in APPS_TO_COMPILE:
        if not compile_app(app, args.output_dir, dry_run=args.dry_run, jobs=args.jobs):
            failed.append(app)

    if failed:
        print(f"\n  FAILED apps: {', '.join(failed)}")
        sys.exit(1)

    if args.dry_run:
        print("\n  [DRY RUN] Skipping assembly and manifest generation.")
        return

    # Assemble payload
    print("\nPhase 2: Assembling payload...")
    assemble_payload(args.output_dir, args.payload_dir)

    # Generate manifest
    print("\nPhase 3: Generating integrity manifest...")
    generate_manifest(args.payload_dir, args.version)

    print(f"\n  Done. Payload ready at: {args.payload_dir}")


if __name__ == "__main__":
    main()
