# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""
Patients app configuration.
"""

from django.apps import AppConfig


class PatientsConfig(AppConfig):
    """Configuration for the patients app."""

    default_auto_field = "django.db.models.BigAutoField"
    name = "hmis.apps.patients"
    verbose_name = "Patients"
