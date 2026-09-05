# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""Django configuration for the DHA Shared Health Record integration app."""

from django.apps import AppConfig


class SHRConfig(AppConfig):
    """Register the SHR app and its domain-event signal handlers."""

    default_auto_field = "django.db.models.BigAutoField"
    name = "hmis.apps.shr"
    verbose_name = "Shared Health Record"

    def ready(self) -> None:
        """Load SHR signal handlers after Django initializes app models."""
        import hmis.apps.shr.signals  # noqa: F401
