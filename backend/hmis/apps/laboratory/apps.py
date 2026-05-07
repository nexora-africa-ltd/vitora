"""
Laboratory app configuration.
"""

from django.apps import AppConfig


class LaboratoryConfig(AppConfig):
    """Configuration for the laboratory app."""

    default_auto_field = "django.db.models.BigAutoField"
    name = "hmis.apps.laboratory"
    verbose_name = "Laboratory"

    def ready(self):
        """Import signals when the app is ready."""
        import hmis.apps.laboratory.analyzers.signals  # noqa: F401
        import hmis.apps.laboratory.autoverify.signals  # noqa: F401
        import hmis.apps.laboratory.critical_values.signals  # noqa: F401
        import hmis.apps.laboratory.microbiology.signals  # noqa: F401
        import hmis.apps.laboratory.qc.signals  # noqa: F401
        import hmis.apps.laboratory.reflex.signals  # noqa: F401
        import hmis.apps.laboratory.reporting.signals  # noqa: F401
        import hmis.apps.laboratory.signals  # noqa: F401
        import hmis.apps.laboratory.standalone.signals  # noqa: F401
        import hmis.apps.laboratory.worksheets.signals  # noqa: F401
