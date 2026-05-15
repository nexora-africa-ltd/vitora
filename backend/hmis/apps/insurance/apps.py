from django.apps import AppConfig


class InsuranceConfig(AppConfig):
    """Configuration for the Insurance app."""

    default_auto_field = "django.db.models.BigAutoField"
    name = "hmis.apps.insurance"
    verbose_name = "Insurance"

    def ready(self):
        """Import signals on app ready."""
        import hmis.apps.insurance.signals  # noqa: F401
