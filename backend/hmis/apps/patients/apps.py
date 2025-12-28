"""
Patients app configuration.
"""

from django.apps import AppConfig


class PatientsConfig(AppConfig):
    """Configuration for the patients app."""

    default_auto_field = "django.db.models.BigAutoField"
    name = "hmis.apps.patients"
    verbose_name = "Patients"
