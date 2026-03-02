"""
CDS (Clinical Decision Support) app configuration.
"""

from django.apps import AppConfig


class CDSConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "hmis.apps.cds"
    verbose_name = "Clinical Decision Support"

    def ready(self) -> None:
        import hmis.apps.cds.signals  # noqa: F401
