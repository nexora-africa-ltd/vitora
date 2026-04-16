"""Inventory app configuration."""

from django.apps import AppConfig


class InventoryConfig(AppConfig):
    """Configuration for the Inventory app."""

    default_auto_field = "django.db.models.BigAutoField"
    name = "hmis.apps.inventory"
    verbose_name = "Inventory Management"

    def ready(self):
        """Import signals when the app is ready."""
        import hmis.apps.inventory.signals  # noqa: F401
