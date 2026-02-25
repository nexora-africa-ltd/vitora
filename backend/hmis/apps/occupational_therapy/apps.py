"""
Occupational Therapy app configuration.
"""

from django.apps import AppConfig


class OccupationalTherapyConfig(AppConfig):
    """Configuration for the occupational therapy app."""

    default_auto_field = "django.db.models.BigAutoField"
    name = "hmis.apps.occupational_therapy"
    verbose_name = "Occupational Therapy"

    def ready(self):
        """Import signals when the app is ready."""
        import hmis.apps.occupational_therapy.signals  # noqa: F401
