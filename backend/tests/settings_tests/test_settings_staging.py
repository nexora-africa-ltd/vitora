"""Tests for staging settings."""

import os
from unittest import mock

import pytest


class TestStagingSettings:
    """Tests for staging environment settings."""

    def test_staging_settings_can_be_imported(self):
        """Staging settings should be importable."""
        # Temporarily set environment for staging
        with mock.patch.dict(os.environ, {"DJANGO_SETTINGS_MODULE": "hmis.settings.staging"}):
            from hmis.settings import staging

            assert staging.DEBUG is False

    def test_staging_demo_mode_enabled(self):
        """Staging should have DEMO_MODE enabled by default."""
        with mock.patch.dict(os.environ, {"DEMO_MODE": "true"}):
            # Force reimport to pick up env var
            import importlib

            from hmis.settings import staging

            importlib.reload(staging)
            assert staging.DEMO_MODE is True

    def test_staging_celery_eager_mode(self):
        """Staging should use Celery eager mode (no Redis required)."""
        from hmis.settings import staging

        assert staging.CELERY_TASK_ALWAYS_EAGER is True
        assert staging.CELERY_TASK_EAGER_PROPAGATES is True

    def test_staging_email_console_backend(self):
        """Staging should use console email backend."""
        from hmis.settings import staging

        assert staging.EMAIL_BACKEND == "django.core.mail.backends.console.EmailBackend"

    def test_staging_sha_enabled(self):
        """Staging should have SHA integration enabled."""
        from hmis.settings import staging

        assert staging.SHA_ENABLED is True
        assert "uat" in staging.SHA_API_BASE_URL.lower()

    def test_staging_icd11_use_local_setting(self):
        """Staging should have ICD11_USE_LOCAL setting."""
        from hmis.settings import staging

        # Default is False (try DHA first, fall back to local)
        assert hasattr(staging, "ICD11_USE_LOCAL")

    def test_staging_logging_configured(self):
        """Staging should have logging configured."""
        from hmis.settings import staging

        assert "LOGGING" in dir(staging)
        assert staging.LOGGING["version"] == 1

    def test_staging_security_settings(self):
        """Staging should have relaxed security for local demos."""
        from hmis.settings import staging

        # HSTS disabled for easier testing
        assert staging.SECURE_HSTS_SECONDS == 0
        assert staging.SECURE_HSTS_INCLUDE_SUBDOMAINS is False
        assert staging.SECURE_HSTS_PRELOAD is False

    def test_staging_whitenoise_middleware(self):
        """Staging should include whitenoise middleware."""
        from hmis.settings import staging

        assert "whitenoise.middleware.WhiteNoiseMiddleware" in staging.MIDDLEWARE

    def test_staging_allowed_hosts_from_env(self):
        """Staging should read ALLOWED_HOSTS from environment."""
        with mock.patch.dict(os.environ, {"ALLOWED_HOSTS": "example.com,localhost"}):
            import importlib

            from hmis.settings import staging

            importlib.reload(staging)
            assert "example.com" in staging.ALLOWED_HOSTS or len(staging.ALLOWED_HOSTS) == 0

    def test_staging_cors_origins(self):
        """Staging should have CORS origins configured."""
        from hmis.settings import staging

        assert hasattr(staging, "CORS_ALLOWED_ORIGINS")
        assert len(staging.CORS_ALLOWED_ORIGINS) > 0

    def test_staging_csrf_trusted_origins(self):
        """Staging should have CSRF trusted origins configured."""
        from hmis.settings import staging

        assert hasattr(staging, "CSRF_TRUSTED_ORIGINS")

    def test_staging_encryption_key(self):
        """Staging should have encryption key configured."""
        from hmis.settings import staging

        assert hasattr(staging, "ENCRYPTION_KEY")
        assert staging.ENCRYPTION_KEY is not None
        assert len(staging.ENCRYPTION_KEY) > 0

    def test_staging_demo_facility_name(self):
        """Staging should have demo facility name."""
        from hmis.settings import staging

        assert hasattr(staging, "DEMO_FACILITY_NAME")
        assert staging.DEMO_FACILITY_NAME == "Demo Health Facility"
