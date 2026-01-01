"""Pharmacy app configuration."""

from django.apps import AppConfig


class PharmacyConfig(AppConfig):
    """Configuration for the Pharmacy app."""

    default_auto_field = "django.db.models.BigAutoField"
    name = "hmis.apps.pharmacy"
    verbose_name = "Pharmacy Management"
