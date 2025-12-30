"""
App configuration for Clinical Templates.
"""

from django.apps import AppConfig


class ClinicalTemplatesConfig(AppConfig):
    """Configuration for the clinical_templates app."""

    default_auto_field = "django.db.models.BigAutoField"
    name = "hmis.apps.clinical_templates"
    verbose_name = "Clinical Templates"
