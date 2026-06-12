# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""
Social Work app configuration.
"""

from django.apps import AppConfig


class SocialWorkConfig(AppConfig):
    """Configuration for the social work app."""

    default_auto_field = "django.db.models.BigAutoField"
    name = "hmis.apps.social_work"
    verbose_name = "Social Work"

    def ready(self):
        """Import signals when the app is ready."""
        import hmis.apps.social_work.signals  # noqa: F401
