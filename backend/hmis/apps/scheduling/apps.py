from django.apps import AppConfig


class SchedulingConfig(AppConfig):
    """Configuration for the scheduling app."""

    default_auto_field = "django.db.models.BigAutoField"
    name = "hmis.apps.scheduling"
    verbose_name = "Scheduling"
