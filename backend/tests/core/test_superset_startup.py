# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""
Regression tests for the Superset Azure Container Apps startup contract.

Run: cd backend && poetry run pytest tests/core/test_superset_startup.py --no-cov
Inputs: reads the checked-in Superset shell entrypoints; no network or database required.
"""

from pathlib import Path

REPOSITORY_ROOT = Path(__file__).resolve().parents[3]
SUPERSET_DIR = REPOSITORY_ROOT / "docker" / "superset"


def test_web_server_startup_does_not_run_database_initialization():
    """Web replicas must be safe and fast to start after an ACA scale-to-zero event."""
    startup_script = (SUPERSET_DIR / "start-superset.sh").read_text(encoding="utf-8")

    assert "superset db upgrade" not in startup_script
    assert "superset fab create-admin" not in startup_script
    assert "superset init" not in startup_script
    assert "exec /usr/bin/run-server.sh" in startup_script


def test_deployment_migration_entrypoint_owns_database_initialization():
    """Deploy-time initialization remains explicit and separate from web startup."""
    migration_script = SUPERSET_DIR / "migrate-superset.sh"

    assert migration_script.exists()

    contents = migration_script.read_text(encoding="utf-8")
    assert "superset db upgrade" in contents
    assert "superset fab create-admin" in contents
    assert "superset init" in contents


def test_sa_supporting_services_deployment_runs_migration_job_before_web_app():
    """The SA deployment path must migrate before it routes traffic to Superset."""
    deployment_script = (
        REPOSITORY_ROOT / "scripts" / "azure-migrate-supporting-services-sa.sh"
    ).read_text(encoding="utf-8")

    assert "TARGET_SUPERSET_MIGRATION_JOB" in deployment_script
    assert "az containerapp job start" in deployment_script
    assert deployment_script.index("az containerapp job start") < deployment_script.index(
        'az containerapp update \\\n    -g "${TARGET_RG}" \\\n    -n "${TARGET_SUPERSET_APP}"'
    )


def test_makefile_exposes_production_only_superset_operations():
    """Operators use concise ss-* commands without creating a staging service."""
    makefile = (REPOSITORY_ROOT / "backend" / "Makefile").read_text(encoding="utf-8")

    for target in ("ss-deploy:", "ss-status:", "ss-logs:", "ss-migrate:", "ss-cold:"):
        assert target in makefile

    assert "deploy-superset-sa.sh" in makefile
    assert "check-superset-cold-start-sa.sh" in makefile
    assert "SS_MIGRATE_ONLY=1" in makefile
    assert "ss-staging" not in makefile


def test_routine_superset_deploy_migrates_before_replacing_web_image():
    """The routine deployment script runs the job before updating web traffic."""
    deploy_script = REPOSITORY_ROOT / "backend" / "scripts" / "deploy-superset-sa.sh"

    assert deploy_script.exists()

    contents = deploy_script.read_text(encoding="utf-8")
    assert "az containerapp job start" in contents
    assert "az containerapp update" in contents
    assert contents.index("az containerapp job start") < contents.index("az containerapp update")


def test_routine_superset_deploy_runs_migration_script_through_bash_and_reports_metrics():
    """Deploys must execute copyright-prefixed shell scripts safely and summarize rollout state."""
    deploy_script = (REPOSITORY_ROOT / "backend" / "scripts" / "deploy-superset-sa.sh").read_text(
        encoding="utf-8"
    )

    assert '--command "/bin/bash" "/app/migrate-superset.sh"' in deploy_script
    assert "DEPLOY_STARTED_AT" in deploy_script
    assert "docker image inspect" in deploy_script
    assert "az acr repository show" in deploy_script
    assert "print_deploy_summary" in deploy_script
    assert "Migration job status:" in deploy_script
    assert "print_migration_logs" in deploy_script


def test_superset_workflow_targets_the_production_only_sa_deployment_path():
    """CI must not recreate a legacy staging Superset service."""
    workflow = (REPOSITORY_ROOT / ".github" / "workflows" / "deploy-superset.yml").read_text(
        encoding="utf-8"
    )

    assert "vitora-rg-sa" in workflow
    assert "vitora-superset-sa" in workflow
    assert "vitora-env-private-sa" in workflow
    assert "scripts/deploy-superset-sa.sh" in workflow
    assert "environment: production" in workflow
