# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""Regression tests for platform-specific SQLCipher hub artifact requirements.

Run with: poetry run pytest tests/core/test_hub_sqlcipher_requirements.py --no-cov
Inputs: backend/requirements-hub.txt generated from the Poetry lock.
"""

from pathlib import Path


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


def test_hub_smoke_tests_supply_disposable_sqlcipher_keys_and_reject_plaintext_reads():
    """Artifact smoke jobs must exercise encrypted runtime startup on both platforms."""
    workflow = (
        Path(__file__).resolve().parents[3] / ".github" / "workflows" / "build-hub.yml"
    ).read_text(encoding="utf-8")

    assert "export HUB_DATABASE_ENCRYPTION_REQUIRED=true" in workflow
    assert '$env:HUB_DATABASE_ENCRYPTION_REQUIRED = "true"' in workflow
    assert (
        'HUB_DATABASE_ENCRYPTION_KEY=$(python -c "import secrets; print(secrets.token_urlsafe(64))")'
        in workflow
    )
    assert "Standard SQLite unexpectedly read SQLCipher hub database" in workflow
