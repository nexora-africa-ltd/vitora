"""
Check-in app configuration.
"""

from django.apps import AppConfig


class CheckinConfig(AppConfig):
    """Configuration for the check-in app."""

    default_auto_field = "django.db.models.BigAutoField"
    name = "hmis.apps.checkin"
    verbose_name = "Patient Check-in"
