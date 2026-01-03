"""
Triage app configuration.
"""

from django.apps import AppConfig


class TriageConfig(AppConfig):
    """Configuration for the Triage app."""

    default_auto_field = "django.db.models.BigAutoField"
    name = "hmis.apps.triage"
    verbose_name = "Triage Management"

    def ready(self):
        """Import signal handlers and perform app initialization."""
        # Import signals if any
        pass
