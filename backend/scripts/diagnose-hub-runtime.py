# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""Compare compiled Django/SQLite, SQLCipher alone, and compiled Django/SQLCipher.

Run: python diagnose-hub-runtime.py --artifact HUB_DIR --output LOG_DIR
     [--timeout 90] [--allow-source]. Each probe uses a fresh subprocess and DB.
--allow-source is for local regression tests; CI requires compiled modules.
Internal --probe/--data-dir arguments are used only by the subprocess supervisor.
No deployed secrets or full database migrations are needed.
"""

from __future__ import annotations

import argparse
import faulthandler
import importlib.metadata
import json
import os
import platform
import secrets
import subprocess
import sys
import tempfile
import time
from pathlib import Path

PROBES = ("A-standard-sqlite", "B-sqlcipher-driver", "C-django-sqlcipher")
LOG_LIMIT = 8 * 1024 * 1024


def classify_exit(code):
    """Normalize Windows signed/unsigned NTSTATUS values without claiming causality."""
    return {
        0xC0000005: "access_violation",
        0xC00000FD: "stack_overflow",
        0xC0000409: "fail_fast",
    }.get(code & 0xFFFFFFFF, "passed" if code == 0 else "failed")


def run_probe(name, command, artifact, output, timeout):
    """Capture crashes/timeouts independently; no failed probe prevents later probes."""
    output.mkdir(parents=True, exist_ok=True)
    log_path = output / f"{name}.log"
    started = time.monotonic()
    stopped = None
    with log_path.open("wb") as log:
        process = subprocess.Popen(command, cwd=artifact, stdout=log, stderr=subprocess.STDOUT)
        while process.poll() is None:
            if time.monotonic() - started >= timeout:
                stopped = "timeout"
            elif log_path.stat().st_size >= LOG_LIMIT:
                stopped = "log_limit"
            if stopped:
                process.kill()
                break
            time.sleep(0.05)
        code = process.wait()
    result = {
        "probe": name,
        "pid": process.pid,
        "status": stopped or classify_exit(code),
        "exit_code": code,
        "exit_code_hex": f"0x{code & 0xFFFFFFFF:08X}",
        "duration_seconds": round(time.monotonic() - started, 2),
        "log": log_path.name,
    }
    print(json.dumps(result), flush=True)
    return result


def marker(stage):
    print(
        f"STAGE {stage}; sqlcipher_loaded={any(name == 'sqlcipher3' or name.startswith('sqlcipher3.') for name in sys.modules)}",
        flush=True,
    )


def import_audit(event, args):
    # Only module names are logged, never settings, connection arguments or keys.
    if event == "import" and args and isinstance(args[0], str):
        name = args[0]
        if name.startswith(("hmis.", "sqlcipher3", "_sqlite3")):
            marker(f"IMPORT_REQUEST {name}")


def driver_probe(database, key):
    marker("before SQLCipher import")
    from sqlcipher3 import dbapi2 as driver

    marker("after SQLCipher import")
    for first in (True, False):
        connection = driver.connect(database)
        try:
            connection.execute(f"PRAGMA key = '{key}'")
            version = connection.execute("PRAGMA cipher_version").fetchone()
            assert version and version[0], "SQLCipher runtime missing"
            marker(f"driver SQLCipher version {version[0]}")
            if first:
                connection.execute("CREATE TABLE diagnostic (value TEXT)")
                connection.execute("INSERT INTO diagnostic VALUES (?)", ("protected",))
                connection.commit()
            assert connection.execute("SELECT value FROM diagnostic").fetchone() == ("protected",)
        finally:
            connection.close()
        marker("driver created/wrote/closed" if first else "driver reopened/read/closed")


def django_probe(allow_source):
    marker("before Django import")
    import django

    marker("before django.setup")
    django.setup()
    marker("django.setup complete")
    from django.db import connection

    from hmis.apps.encounters import signals

    extension = ".pyd" if sys.platform == "win32" else ".so"
    if not allow_source:
        assert signals.__file__.endswith(extension), (
            "Diagnostic did not load compiled encounter signals"
        )
    marker(f"Django backend {connection.__class__.__module__}")
    with connection.cursor() as cursor:
        cursor.execute("CREATE TABLE diagnostic (value TEXT)")
        cursor.execute("INSERT INTO diagnostic VALUES (%s)", ["protected"])
    connection.close()
    marker("Django wrote and closed")
    with connection.cursor() as cursor:
        assert cursor.execute(
            "SELECT value FROM diagnostic WHERE value = %s", ["protected"]
        ).fetchone() == ("protected",)
    connection.close()
    marker("Django reopened and queried")


def child(args):
    faulthandler.enable()
    # Audit requests show indirect SQLCipher imports even for test A. A request
    # marker is not proof that the requested native module completed loading.
    sys.addaudithook(import_audit)
    sys.path.insert(0, str(args.artifact))
    key = secrets.token_hex(32)
    data = args.data_dir
    data.mkdir(parents=True, exist_ok=True)
    database = data / "hub.sqlite3"
    from cryptography.fernet import Fernet

    os.environ.update(
        {
            "DJANGO_ENV": "hub",
            "DJANGO_SETTINGS_MODULE": "hmis.settings.hub",
            "HUB_DATA_DIR": str(data),
            "HUB_DB_PATH": str(database),
            "HUB_LOG_FILE": str(data / "hub.log"),
            "HUB_DATABASE_ENCRYPTION_REQUIRED": "false" if args.probe == PROBES[0] else "true",
            "HUB_DATABASE_ENCRYPTION_KEY": key,
            "DJANGO_SECRET_KEY": secrets.token_urlsafe(50),
            "ENCRYPTION_KEY": Fernet.generate_key().decode(),
            "KMS_PROVIDER": "local",
            "SYNC_ENABLED": "false",
            "VITORA_DISABLE_MAGIC_SNIFFING": "true" if sys.platform == "win32" else "false",
        }
    )
    marker(f"start {args.probe} pid={os.getpid()} python={platform.python_version()}")
    try:
        if args.probe == PROBES[1]:
            driver_probe(database, key)
        else:
            django_probe(args.allow_source)
        marker("PROBE PASS")
    finally:
        marker("probe exit (last observed module state)")
        import logging

        logging.shutdown()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--artifact", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--timeout", type=float, default=90)
    parser.add_argument("--allow-source", action="store_true")
    parser.add_argument("--probe", choices=PROBES)
    parser.add_argument("--data-dir", type=Path)
    args = parser.parse_args()
    args.artifact = args.artifact.resolve()
    args.output = args.output.resolve()
    if args.probe:
        if not args.data_dir:
            parser.error("--data-dir is required for a child probe")
        child(args)
        return
    if not 0 < args.timeout <= 300:
        parser.error("--timeout must be between 0 and 300 seconds")
    args.output.mkdir(parents=True, exist_ok=True)
    versions = {"python": sys.version, "platform": platform.platform()}
    for name in ("Django", "sqlcipher3", "sqlcipher3-binary", "cryptography"):
        try:
            versions[name] = importlib.metadata.version(name)
        except importlib.metadata.PackageNotFoundError:
            versions[name] = "not installed"
    (args.output / "environment.json").write_text(json.dumps(versions, indent=2), encoding="utf-8")
    results = []
    for name in PROBES:
        # Parent owns cleanup so a native crash doesn't leave the test database
        # in the uploaded diagnostics artifact.
        with tempfile.TemporaryDirectory(prefix="vitora-runtime-probe-") as directory:
            command = [
                sys.executable,
                "-u",
                "-X",
                "faulthandler",
                str(Path(__file__).resolve()),
                "--artifact",
                str(args.artifact),
                "--output",
                str(args.output),
                "--probe",
                name,
                "--data-dir",
                directory,
            ]
            if args.allow_source:
                command.append("--allow-source")
            results.append(run_probe(name, command, args.artifact, args.output, args.timeout))
        (args.output / "summary.json").write_text(json.dumps(results, indent=2), encoding="utf-8")
    raise SystemExit(0 if all(result["status"] == "passed" for result in results) else 1)


if __name__ == "__main__":
    main()
