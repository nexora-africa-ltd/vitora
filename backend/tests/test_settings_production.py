"""
Tests for production settings.

Sprint 0.6: Coverage improvement tests for settings/production.py (0% -> 100%)
"""

import os


class TestProductionSettings:
    """Tests for production settings configuration."""

    def test_debug_is_false(self):
        """Production DEBUG should be False."""
        # Temporarily set env to production
        original_env = os.environ.get("DJANGO_SETTINGS_MODULE")

        try:
            os.environ["DJANGO_SETTINGS_MODULE"] = "hmis.settings.production"

            # Import production settings directly
            from hmis.settings import production

            assert production.DEBUG is False

        finally:
            if original_env:
                os.environ["DJANGO_SETTINGS_MODULE"] = original_env

    def test_allowed_hosts_from_env(self):
        """ALLOWED_HOSTS should be configurable via env."""
        original = os.environ.get("ALLOWED_HOSTS")

        try:
            os.environ["ALLOWED_HOSTS"] = "example.com,api.example.com"

            # Re-import to get fresh values
            import importlib

            from hmis.settings import production

            importlib.reload(production)

            assert "example.com" in production.ALLOWED_HOSTS
            assert "api.example.com" in production.ALLOWED_HOSTS

        finally:
            if original:
                os.environ["ALLOWED_HOSTS"] = original
            else:
                os.environ.pop("ALLOWED_HOSTS", None)

    def test_database_is_postgresql(self):
        """Production database should be PostgreSQL."""
        from hmis.settings import production

        assert production.DATABASES["default"]["ENGINE"] == "django.db.backends.postgresql"

    def test_database_settings_from_env(self):
        """Database settings should come from environment."""
        original_name = os.environ.get("DB_NAME")
        original_user = os.environ.get("DB_USER")

        try:
            os.environ["DB_NAME"] = "test_db"
            os.environ["DB_USER"] = "test_user"
            os.environ["DB_PASSWORD"] = "test_pass"
            os.environ["DB_HOST"] = "db.example.com"
            os.environ["DB_PORT"] = "5433"

            import importlib

            from hmis.settings import production

            importlib.reload(production)

            assert production.DATABASES["default"]["NAME"] == "test_db"
            assert production.DATABASES["default"]["USER"] == "test_user"
            assert production.DATABASES["default"]["PASSWORD"] == "test_pass"
            assert production.DATABASES["default"]["HOST"] == "db.example.com"
            assert production.DATABASES["default"]["PORT"] == "5433"

        finally:
            # Restore
            for key, val in [("DB_NAME", original_name), ("DB_USER", original_user)]:
                if val:
                    os.environ[key] = val
                else:
                    os.environ.pop(key, None)
            os.environ.pop("DB_PASSWORD", None)
            os.environ.pop("DB_HOST", None)
            os.environ.pop("DB_PORT", None)

    def test_security_settings_enabled(self):
        """Security settings should be enabled in production."""
        from hmis.settings import production

        assert production.SECURE_SSL_REDIRECT is True
        assert production.SESSION_COOKIE_SECURE is True
        assert production.CSRF_COOKIE_SECURE is True
        assert production.SECURE_HSTS_SECONDS == 31536000
        assert production.SECURE_HSTS_INCLUDE_SUBDOMAINS is True
        assert production.SECURE_HSTS_PRELOAD is True

    def test_cors_from_env(self):
        """CORS_ALLOWED_ORIGINS should come from environment."""
        original = os.environ.get("CORS_ALLOWED_ORIGINS")

        try:
            os.environ["CORS_ALLOWED_ORIGINS"] = "https://app.example.com,https://admin.example.com"

            import importlib

            from hmis.settings import production

            importlib.reload(production)

            assert "https://app.example.com" in production.CORS_ALLOWED_ORIGINS
            assert "https://admin.example.com" in production.CORS_ALLOWED_ORIGINS

        finally:
            if original:
                os.environ["CORS_ALLOWED_ORIGINS"] = original
            else:
                os.environ.pop("CORS_ALLOWED_ORIGINS", None)

    def test_email_backend_is_smtp(self):
        """Email backend should be SMTP in production."""
        from hmis.settings import production

        assert production.EMAIL_BACKEND == "django.core.mail.backends.smtp.EmailBackend"
        assert production.EMAIL_USE_TLS is True

    def test_email_settings_from_env(self):
        """Email settings should come from environment."""
        original_host = os.environ.get("EMAIL_HOST")
        original_port = os.environ.get("EMAIL_PORT")

        try:
            os.environ["EMAIL_HOST"] = "smtp.sendgrid.net"
            os.environ["EMAIL_PORT"] = "465"
            os.environ["EMAIL_HOST_USER"] = "apikey"
            os.environ["EMAIL_HOST_PASSWORD"] = "secret123"

            import importlib

            from hmis.settings import production

            importlib.reload(production)

            assert production.EMAIL_HOST == "smtp.sendgrid.net"
            assert production.EMAIL_PORT == 465
            assert production.EMAIL_HOST_USER == "apikey"
            assert production.EMAIL_HOST_PASSWORD == "secret123"

        finally:
            if original_host:
                os.environ["EMAIL_HOST"] = original_host
            else:
                os.environ.pop("EMAIL_HOST", None)
            if original_port:
                os.environ["EMAIL_PORT"] = original_port
            else:
                os.environ.pop("EMAIL_PORT", None)
            os.environ.pop("EMAIL_HOST_USER", None)
            os.environ.pop("EMAIL_HOST_PASSWORD", None)

    def test_logging_has_file_handler(self):
        """Logging should include file handler in production."""
        from hmis.settings import production

        assert "file" in production.LOGGING["handlers"]
        assert (
            production.LOGGING["handlers"]["file"]["class"]
            == "logging.handlers.RotatingFileHandler"
        )

    def test_log_file_from_env(self):
        """Log file path should be configurable."""
        original = os.environ.get("LOG_FILE")

        try:
            os.environ["LOG_FILE"] = "/custom/path/app.log"

            import importlib

            from hmis.settings import production

            importlib.reload(production)

            assert production.LOGGING["handlers"]["file"]["filename"] == "/custom/path/app.log"

        finally:
            if original:
                os.environ["LOG_FILE"] = original
            else:
                os.environ.pop("LOG_FILE", None)

    def test_db_connection_max_age(self):
        """Database should use connection pooling."""
        from hmis.settings import production

        assert production.DATABASES["default"]["CONN_MAX_AGE"] == 600
