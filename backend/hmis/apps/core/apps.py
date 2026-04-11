"""
App configuration for the core app.
"""

import contextlib

from django.apps import AppConfig


class CoreConfig(AppConfig):
    """Configuration for the core app."""

    default_auto_field = "django.db.models.BigAutoField"
    name = "hmis.apps.core"
    verbose_name = "Core"

    def ready(self):
        """Import signal handlers and wire projections when app is ready."""
        # Import signals to register them
        with contextlib.suppress(ImportError):
            from hmis.apps.core import signals  # noqa: F401

        # Register and wire read-model projections to the EventBus
        with contextlib.suppress(ImportError):
            from hmis.apps.core.projections.setup import register_projections

            register_projections()
