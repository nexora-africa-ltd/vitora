"""
Django app configuration for the nutrition module.
"""

from django.apps import AppConfig


class NutritionConfig(AppConfig):
    """Configuration for the Nutrition/Dietetics module."""

    default_auto_field = "django.db.models.BigAutoField"
    name = "hmis.apps.nutrition"
    verbose_name = "Nutrition & Dietetics"

    def ready(self):
        """Import signals when app is ready."""
        import hmis.apps.nutrition.signals  # noqa: F401
