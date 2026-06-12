# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
from django.apps import AppConfig


class SickNotesConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "hmis.apps.sick_notes"
    verbose_name = "Sick Notes"

    def ready(self):
        import hmis.apps.sick_notes.signals  # noqa: F401
