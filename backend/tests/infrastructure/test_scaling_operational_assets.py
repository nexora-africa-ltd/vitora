# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""Regression checks for scalable Azure deployment and Locust test assets.

Run with: poetry run pytest tests/infrastructure/test_scaling_operational_assets.py --no-cov
Inputs: repository deployment scripts, workflow definitions, and the Locust scenario.
"""

from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[3]


def test_aca_start_supports_isolated_api_worker_and_beat_processes():
    """One image must safely run each independently scalable process role."""
    script = (REPO_ROOT / "backend" / "scripts" / "aca-start.sh").read_text()

    assert "VITORA_PROCESS" in script
    assert "daphne" in script
    assert "celery -A hmis worker" in script
    assert "celery -A hmis beat" in script
    assert "Unknown VITORA_PROCESS" in script


def test_backend_workflow_configures_redis_workers_and_bounded_scaling():
    """The deployment workflow must own the complete production process topology."""
    workflow = (REPO_ROOT / ".github" / "workflows" / "deploy-backend.yml").read_text()

    for required in (
        "REDIS_URL=secretref:redis-url",
        "CELERY_TASK_ALWAYS_EAGER=false",
        "VITORA_PROCESS=worker",
        "VITORA_PROCESS=beat",
        "--min-replicas",
        "--max-replicas",
        "--scale-rule-type http",
        "--scale-rule-http-concurrency",
    ):
        assert required in workflow

    assert "--max-replicas 1" in workflow


def test_backend_workflow_supports_a_redis_free_single_replica_budget_mode():
    """Budget deployments must explicitly skip distributed async infrastructure."""
    workflow = (REPO_ROOT / ".github" / "workflows" / "deploy-backend.yml").read_text()

    assert "ASYNC_WORKERS_ENABLED" in workflow
    assert "vars.ASYNC_WORKERS_ENABLED == 'true'" in workflow
    assert "CELERY_TASK_ALWAYS_EAGER" in workflow
    assert "API_MAX_REPLICAS" in workflow
    assert "Disable distributed async processes for budget mode" in workflow


def test_locust_scenario_is_environment_configured_and_safe_by_default():
    """Load tests must use isolated credentials and never write unless opted in."""
    scenario = (REPO_ROOT / "backend" / "tests" / "integration" / "locustfile.py").read_text()

    for required in (
        "LOCUST_USERNAME",
        "LOCUST_PASSWORD",
        "LOCUST_FACILITY_ID",
        "LOCUST_CREATE_WRITES",
        "/api/token/",
        "Authorization",
        "X-Facility-ID",
        "catch_response=True",
        "/api/core/staff/me/",
    ):
        assert required in scenario

    assert "sha/claims" not in scenario
    assert 'os.getenv("LOCUST_CREATE_WRITES", "false")' in scenario


def test_load_test_workflow_is_manual_and_staging_only():
    """High-volume traffic must not execute automatically or against production."""
    workflow = (REPO_ROOT / ".github" / "workflows" / "load-test.yml").read_text()

    assert "workflow_dispatch:" in workflow
    assert "production" not in workflow.lower()
    assert "poetry install --with load-test" in workflow
    assert "LOCUST_PASSWORD" in workflow
    assert "upload-artifact" in workflow
