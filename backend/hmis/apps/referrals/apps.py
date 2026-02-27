"""App configuration for the referrals module."""

from django.apps import AppConfig


class ReferralsConfig(AppConfig):
    """Configuration for the referrals application."""

    default_auto_field = "django.db.models.BigAutoField"
    name = "hmis.apps.referrals"
    verbose_name = "Referrals"

    def ready(self):
        """Import signals when the app is ready."""
        import hmis.apps.referrals.signals  # noqa: F401
