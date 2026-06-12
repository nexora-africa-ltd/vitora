# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""
App configuration for Clinics module.
"""

from contextlib import suppress

from django.apps import AppConfig


class ClinicsConfig(AppConfig):
    """Configuration for the clinics app."""

    default_auto_field = "django.db.models.BigAutoField"
    name = "hmis.apps.clinics"
    verbose_name = "Clinics"

    def ready(self):
        """Import signals when app is ready."""
        with suppress(ImportError):
            from . import signals  # noqa: F401
