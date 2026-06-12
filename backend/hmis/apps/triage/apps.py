# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""
Triage app configuration.
"""

from django.apps import AppConfig


class TriageConfig(AppConfig):
    """Configuration for the Triage app."""

    default_auto_field = "django.db.models.BigAutoField"
    name = "hmis.apps.triage"
    verbose_name = "Triage Management"

    def ready(self):
        """Import signal handlers and perform app initialization."""
        # Import signals to register them
        from hmis.apps.triage import signals  # noqa: F401
