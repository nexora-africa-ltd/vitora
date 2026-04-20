from django.apps import AppConfig


class TheatreConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "hmis.apps.theatre"
    verbose_name = "Theatre / Operating Room"

    def ready(self):
        import hmis.apps.theatre.signals  # noqa: F401
