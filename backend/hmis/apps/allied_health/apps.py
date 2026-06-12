# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""App configuration for Allied Health module."""

from django.apps import AppConfig


class AlliedHealthConfig(AppConfig):
    """Allied Health app configuration."""

    default_auto_field = "django.db.models.BigAutoField"
    name = "hmis.apps.allied_health"
    verbose_name = "Allied Health Services"
