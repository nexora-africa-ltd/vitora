"""
Tests for test settings configuration.

Sprint 0.6: Coverage improvement tests for settings/test.py (0% -> 100%)
"""

import os
import pytest


class TestTestSettings:
    """Tests for test environment settings."""

    def test_test_settings_debug_false(self):
        """Test settings should have DEBUG=False for test isolation."""
        from hmis.settings import test

        assert test.DEBUG is False

    def test_test_settings_database(self):
        """Test settings should use SQLite."""
        from hmis.settings import test

        assert "sqlite" in test.DATABASES["default"]["ENGINE"]

    def test_test_settings_password_hashers(self):
        """Test settings should use fast password hasher."""
        from hmis.settings import test

        # Test should use MD5 hasher for speed
        assert any("MD5" in h for h in test.PASSWORD_HASHERS)

    def test_test_settings_celery_eager(self):
        """Test settings should run Celery tasks eagerly."""
        from hmis.settings import test

        assert test.CELERY_TASK_ALWAYS_EAGER is True
        assert test.CELERY_TASK_EAGER_PROPAGATES is True

    def test_test_settings_sync_enabled(self):
        """Test settings should have SYNC_ENABLED configured."""
        from hmis.settings import test

        # Should be defined (either True or False)
        assert hasattr(test, "SYNC_ENABLED")

    def test_test_settings_encryption_key(self):
        """Test settings should have encryption keys."""
        from hmis.settings import test

        assert hasattr(test, "ENCRYPTION_KEY")
        assert test.ENCRYPTION_KEY is not None
