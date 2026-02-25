"""
Counselling app configuration.
"""

from django.apps import AppConfig


class CounsellingConfig(AppConfig):
    """Configuration for the counselling app."""

    default_auto_field = "django.db.models.BigAutoField"
    name = "hmis.apps.counselling"
    verbose_name = "Counselling"

    def ready(self):
        """Import signals when the app is ready."""
        import hmis.apps.counselling.signals  # noqa: F401
