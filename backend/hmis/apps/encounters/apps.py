"""
Encounters app configuration.
"""

from django.apps import AppConfig


class EncountersConfig(AppConfig):
    """Configuration for the encounters app."""

    default_auto_field = "django.db.models.BigAutoField"
    name = "hmis.apps.encounters"
    verbose_name = "Encounters"

    def ready(self):
        from hmis.apps.encounters import signals  # noqa: F401
