"""
App configuration for the Inpatient module.

Sprint 1.5-1.6 Track D: Inpatient Foundation
"""

from django.apps import AppConfig


class InpatientConfig(AppConfig):
    """Configuration for the Inpatient app."""

    default_auto_field = "django.db.models.BigAutoField"
    name = "hmis.apps.inpatient"
    verbose_name = "Inpatient Department"

    def ready(self):
        """Import signal handlers when app is ready."""
        # Import signals to register handlers
        from hmis.apps.inpatient import signals  # noqa: F401
