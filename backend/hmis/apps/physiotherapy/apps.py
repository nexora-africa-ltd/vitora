"""
Physiotherapy app configuration.
"""

from django.apps import AppConfig


class PhysiotherapyConfig(AppConfig):
    """Configuration for the physiotherapy app."""

    default_auto_field = "django.db.models.BigAutoField"
    name = "hmis.apps.physiotherapy"
    verbose_name = "Physiotherapy"

    def ready(self):
        """Import signals when the app is ready."""
        import hmis.apps.physiotherapy.signals  # noqa: F401
