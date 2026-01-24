"""
App configuration for Clinics module.
"""

from django.apps import AppConfig


class ClinicsConfig(AppConfig):
    """Configuration for the clinics app."""

    default_auto_field = "django.db.models.BigAutoField"
    name = "hmis.apps.clinics"
    verbose_name = "Clinics"
