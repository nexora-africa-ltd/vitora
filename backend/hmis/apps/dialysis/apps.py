from django.apps import AppConfig


class DialysisConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "hmis.apps.dialysis"
    verbose_name = "Dialysis"

    def ready(self):
        import hmis.apps.dialysis.signals  # noqa: F401
