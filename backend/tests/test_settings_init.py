"""
Tests for settings __init__.py module.

Sprint 0.6: Coverage improvement tests for settings/__init__.py (63% -> 100%)
"""

import os
import pytest
from importlib import reload


class TestSettingsInit:
    """Tests for settings initialization."""

    def test_default_to_development(self):
        """Should use development settings by default."""
        original_env = os.environ.get("DJANGO_ENV")

        try:
            # Clear DJANGO_ENV to test default
            os.environ.pop("DJANGO_ENV", None)

            # Import settings
            from hmis import settings
            reload(settings)

            # Should use development settings (DEBUG=True)
            assert settings.DEBUG is True

        finally:
            if original_env:
                os.environ["DJANGO_ENV"] = original_env
            else:
                os.environ.pop("DJANGO_ENV", None)

    def test_production_environment(self):
        """Should use production settings when DJANGO_ENV=production."""
        original_env = os.environ.get("DJANGO_ENV")
        original_allowed = os.environ.get("ALLOWED_HOSTS")

        try:
            os.environ["DJANGO_ENV"] = "production"
            os.environ["ALLOWED_HOSTS"] = "example.com"

            from hmis import settings
            reload(settings)

            assert settings.DEBUG is False

        finally:
            if original_env:
                os.environ["DJANGO_ENV"] = original_env
            else:
                os.environ.pop("DJANGO_ENV", None)
            if original_allowed:
                os.environ["ALLOWED_HOSTS"] = original_allowed
            else:
                os.environ.pop("ALLOWED_HOSTS", None)

    def test_test_environment(self):
        """Should use test settings when DJANGO_ENV=test."""
        original_env = os.environ.get("DJANGO_ENV")

        try:
            os.environ["DJANGO_ENV"] = "test"

            from hmis import settings
            reload(settings)

            # Test settings have DEBUG=False for more realistic testing
            assert settings.DEBUG is False

        finally:
            if original_env:
                os.environ["DJANGO_ENV"] = original_env
            else:
                os.environ.pop("DJANGO_ENV", None)

    def test_environment_variable_value(self):
        """ENVIRONMENT variable should reflect DJANGO_ENV."""
        original_env = os.environ.get("DJANGO_ENV")

        try:
            os.environ["DJANGO_ENV"] = "development"

            from hmis import settings
            reload(settings)

            assert settings.ENVIRONMENT == "development"

        finally:
            if original_env:
                os.environ["DJANGO_ENV"] = original_env
            else:
                os.environ.pop("DJANGO_ENV", None)
