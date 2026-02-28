"""
Django app configuration for the MCH (Maternal & Child Health) module.
"""

from django.apps import AppConfig


class MCHConfig(AppConfig):
    """Configuration for the MCH module."""

    default_auto_field = "django.db.models.BigAutoField"
    name = "hmis.apps.mch"
    verbose_name = "Maternal & Child Health"

    def ready(self):
        """Import signals when app is ready."""
        import hmis.apps.mch.signals  # noqa: F401
