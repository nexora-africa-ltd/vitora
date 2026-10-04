# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""Regression tests for platform-specific SQLCipher hub artifact requirements.

Run with: poetry run pytest tests/core/test_hub_sqlcipher_requirements.py --no-cov
Inputs: backend/requirements-hub.txt generated from the Poetry lock.
"""

import subprocess
import sys
from pathlib import Path

import yaml


def test_hub_requirements_select_sqlcipher_wheels_per_release_platform():
    """Linux and Windows hub builds must not request an unavailable wheel."""
    requirements = (Path(__file__).resolve().parents[2] / "requirements-hub.txt").read_text(
        encoding="utf-8"
    )

    assert (
        'sqlcipher3-binary==0.6.0 ; python_version >= "3.12" and python_version < "4.0" and sys_platform == "linux"'
        in requirements
    )
    assert (
        'sqlcipher3==0.6.2 ; python_version >= "3.12" and python_version < "4.0" and sys_platform == "win32"'
        in requirements
    )


def test_hub_artifact_build_disables_runtime_database_encryption_only_for_compilation():
    """Cython builds must not require an unavailable protected hub runtime key."""
    workflow = (
        Path(__file__).resolve().parents[3] / ".github" / "workflows" / "build-hub.yml"
    ).read_text(encoding="utf-8")

    assert 'HUB_DATABASE_ENCRYPTION_REQUIRED: "false"' in workflow

    compiler = (Path(__file__).resolve().parents[2] / "scripts" / "compile-hub.py").read_text(
        encoding="utf-8"
    )
    assert 'os.environ["HUB_DATABASE_ENCRYPTION_REQUIRED"] = "false"' in compiler


def test_hub_smoke_jobs_execute_the_shared_django_migration_probe():
    """Both artifact jobs must run the real Django probe, not a raw-driver substitute."""
    workflow = (
        Path(__file__).resolve().parents[3] / ".github" / "workflows" / "build-hub.yml"
    ).read_text(encoding="utf-8")

    jobs = yaml.safe_load(workflow)["jobs"]
    for job in ("smoke-test", "smoke-test-windows"):
        assert any(
            "scripts/smoke-hub-sqlcipher.py --compiled --full-migrations" in step.get("run", "")
            for step in jobs[job]["steps"]
        )


def test_shared_smoke_executes_encrypted_django_migrations_and_orm():
    """Execute the CI entry point locally in an isolated subprocess with generated keys."""
    backend = Path(__file__).resolve().parents[2]
    result = subprocess.run(
        [sys.executable, "scripts/smoke-hub-sqlcipher.py"],
        cwd=backend,
        capture_output=True,
        text=True,
        timeout=120,
        check=False,
    )
    assert result.returncode == 0, result.stdout + result.stderr
    assert "SQLCIPHER SMOKE: PASS" in result.stdout
