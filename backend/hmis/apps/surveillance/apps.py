"""
Surveillance app configuration for Vitora HMIS.

This app implements disease surveillance for Kenya's Ministry of Health
requirements, including immediate reportable diseases (MOH 502) and IDSR.
"""

from django.apps import AppConfig


class SurveillanceConfig(AppConfig):
    """Configuration for the disease surveillance app."""

    default_auto_field = "django.db.models.BigAutoField"
    name = "hmis.apps.surveillance"
    verbose_name = "Disease Surveillance"

    def ready(self):
        """Import signals when app is ready."""
        # Import signals to register them
        import hmis.apps.surveillance.signals  # noqa: F401
