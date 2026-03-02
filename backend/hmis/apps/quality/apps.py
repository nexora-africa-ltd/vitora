"""Quality Measures & Reporting app configuration."""

from django.apps import AppConfig


class QualityConfig(AppConfig):
    """Configuration for the Quality Measures & Reporting app."""

    default_auto_field = "django.db.models.BigAutoField"
    name = "hmis.apps.quality"
    verbose_name = "Quality Measures & Reporting"

    def ready(self) -> None:
        """Import signals on app ready."""
        pass
