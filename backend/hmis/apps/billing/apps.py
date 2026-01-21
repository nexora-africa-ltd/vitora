from django.apps import AppConfig


class BillingConfig(AppConfig):
    """Configuration for the Billing app."""

    default_auto_field = "django.db.models.BigAutoField"
    name = "hmis.apps.billing"
    verbose_name = "Billing"

    def ready(self):
        """Import signals when the app is ready."""
        import hmis.apps.billing.signals  # noqa: F401
