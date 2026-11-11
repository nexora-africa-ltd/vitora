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
    assert "--queues sync,monitoring,maintenance,reporting,billing,laboratory" in script
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


def test_make_test_removes_incompatible_stale_coverage_data():
    """Coverage runs must not combine prior statement-mode data with branch data."""
    makefile = (REPO_ROOT / "backend" / "Makefile").read_text()
    test_target = makefile.split("test:", 1)[1].split("test-fast:", 1)[0]

    assert "rm -f .coverage .coverage.*" in test_target


def test_staging_uses_redis_for_shared_cache_when_configured():
    """CQM task ownership must survive API replica routing in staging."""
    settings = (REPO_ROOT / "backend" / "hmis" / "settings" / "staging.py").read_text()

    assert 'REDIS_URL = os.getenv("REDIS_URL", "")' in settings
    assert '"BACKEND": "django.core.cache.backends.redis.RedisCache"' in settings
    assert '"LOCATION": REDIS_URL' in settings
    assert '"KEY_PREFIX": "vitora:staging:cache"' in settings
    assert '"prefix": "vitora:staging:channels"' in settings
    assert '"global_keyprefix": "vitora:staging:broker:"' in settings


def test_production_redis_uses_a_distinct_namespace_from_staging():
    """One Azure Managed Redis database must not mix staging and production keys."""
    settings = (REPO_ROOT / "backend" / "hmis" / "settings" / "production.py").read_text()

    assert '"BACKEND": "django.core.cache.backends.redis.RedisCache"' in settings
    assert '"KEY_PREFIX": "vitora:production:cache"' in settings
    assert '"prefix": "vitora:production:channels"' in settings
    assert '"global_keyprefix": "vitora:production:broker:"' in settings


def test_daily_backup_requires_a_new_artifact_from_a_successful_job_execution():
    """A stale backup must not hide a failed backup Job execution."""
    workflow = (REPO_ROOT / ".github" / "workflows" / "daily-backup.yml").read_text()
    backup_script = (REPO_ROOT / "backend" / "scripts" / "backup-db.sh").read_text()

    assert "az containerapp job execution show" in workflow
    assert "Succeeded" in workflow
    assert "az containerapp exec" not in workflow
    assert "BACKUP_ARTIFACT=" in backup_script
    assert "steps.run_backup.outputs.artifact" in workflow
    assert "VITORA_BACKUP_RUN_ID" in workflow
    assert "az storage blob show" in workflow


def test_daily_backup_uses_a_dedicated_container_apps_job():
    """Production backups must not rely on interactive ACA exec WebSockets."""
    workflow = (REPO_ROOT / ".github" / "workflows" / "daily-backup.yml").read_text()
    provisioner = (REPO_ROOT / "backend" / "scripts" / "azure-provision-backup-job.sh").read_text()
    backup_script = (REPO_ROOT / "backend" / "scripts" / "backup-db.sh").read_text()

    assert "az containerapp job start" in workflow
    assert "az containerapp job execution show" in workflow
    assert "az containerapp exec" not in workflow
    assert "--replica-timeout 3600" in provisioner
    assert "--mi-system-assigned" in provisioner
    assert "Storage Blob Data Contributor" in provisioner
    assert "DATABASE_URL=secretref:database-url" in provisioner
    assert "vitora-db-backup-prod-sa" in provisioner
    assert "DefaultAzureCredential" in backup_script
    assert "BACKUP_ENCRYPTION_KEY must be set" in backup_script
    assert "GNUPGHOME=$(mktemp -d /tmp/vitora-gpg.XXXXXX)" in backup_script
    assert "trap 'rm -rf \"$GNUPGHOME\"' EXIT" in backup_script
    assert '"BACKUP_ENCRYPTION_KEY=secretref:backup-encryption-key"' in workflow
    assert '"backup-encryption-key=$BACKUP_ENCRYPTION_KEY"' in provisioner
    assert '"BACKUP_ENCRYPTION_KEY=secretref:backup-encryption-key"' in provisioner
    assert ".sql.gz.gpg" in workflow.split('echo "artifact=', 1)[1].split("Prune old backups", 1)[0]
    staging_env_update = (REPO_ROOT / "backend" / "scripts" / "azure-update-env.sh").read_text()
    production_env_update = (
        REPO_ROOT / "backend" / "scripts" / "azure-update-env-production.sh"
    ).read_text()
    assert "encrypted production-style backups are mandatory" not in staging_env_update
    assert "BACKUP_ENCRYPTION_KEY must be set" in production_env_update
    assert "az containerapp job secret set" in production_env_update
    assert "az containerapp job secret list" in production_env_update
    assert (
        "AZURE_STORAGE_SAS_TOKEN"
        not in workflow.split("Run dedicated backup job", 1)[1].split("Prune old backups", 1)[0]
    )

    deploy_workflow = (REPO_ROOT / ".github" / "workflows" / "deploy-backend.yml").read_text()
    backup_job_update = deploy_workflow.split("Refresh backup Job image", 1)[1]
    assert "az containerapp job update" in backup_job_update
    assert "--set-env-vars" in backup_job_update
    assert "--env-vars" not in backup_job_update.split("Run post-deploy maintenance", 1)[0]
    assert "az containerapp job secret list" in backup_job_update
    assert '"$AZURE_BACKUP_ENCRYPTION_KEY" != "$BACKUP_ENCRYPTION_KEY"' in backup_job_update


def test_backend_image_contains_gpg_for_mandatory_encrypted_backups():
    """The backup job uses the backend image and must include its encryption binary."""
    dockerfile = (REPO_ROOT / "backend" / "Dockerfile").read_text()

    assert "gnupg" in dockerfile


def test_storage_provisioning_disables_public_blob_access():
    """Cloud storage hosting backups and documents must not allow public blobs."""
    provisioner = (REPO_ROOT / "scripts" / "azure-provision-sa.sh").read_text()

    assert "--allow-blob-public-access false" in provisioner


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
    ):
        assert required in scenario

    assert "sha/claims" not in scenario
    assert "staff: context" not in scenario
    assert 'os.getenv("LOCUST_CREATE_WRITES", "false")' in scenario


def test_load_test_workflow_is_manual_and_staging_only():
    """High-volume traffic must not execute automatically or against production."""
    workflow = (REPO_ROOT / ".github" / "workflows" / "load-test.yml").read_text()

    assert "workflow_dispatch:" in workflow
    assert "production" not in workflow.lower()
    assert "poetry install --with load-test" in workflow
    assert "LOCUST_PASSWORD" in workflow
    assert "upload-artifact" in workflow


def test_makefile_exposes_a_loopback_bound_locust_ui_target():
    """Interactive load testing must remain local to the operator's machine."""
    makefile = (REPO_ROOT / "backend" / "Makefile").read_text()

    assert "load-test-ui:" in makefile
    assert "--web-host 127.0.0.1" in makefile
    assert "LOCUST_HOST" in makefile
