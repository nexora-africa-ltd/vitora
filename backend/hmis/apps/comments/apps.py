from django.apps import AppConfig


class CommentsConfig(AppConfig):
    name = "hmis.apps.comments"
    verbose_name = "Clinical Comments"

    def ready(self):
        from hmis.apps.comments import signals  # noqa: F401
