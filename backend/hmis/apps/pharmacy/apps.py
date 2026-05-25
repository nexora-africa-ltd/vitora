"""Pharmacy app configuration."""

from django.apps import AppConfig


class PharmacyConfig(AppConfig):
    """Configuration for the Pharmacy app."""

    default_auto_field = "django.db.models.BigAutoField"
    name = "hmis.apps.pharmacy"
    verbose_name = "Pharmacy Management"

    def ready(self):
        """Import signals when the app is ready."""
        import hmis.apps.pharmacy.signals  # noqa: F401
        import hmis.apps.pharmacy.standalone.signals  # noqa: F401
