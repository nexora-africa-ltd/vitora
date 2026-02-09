"""
Imaging app configuration.
"""

from django.apps import AppConfig


class ImagingConfig(AppConfig):
    """Configuration for the imaging app."""

    default_auto_field = "django.db.models.BigAutoField"
    name = "hmis.apps.imaging"
    verbose_name = "Imaging/Radiology"

    def ready(self):
        """Import signals when the app is ready."""
        import hmis.apps.imaging.signals  # noqa: F401
