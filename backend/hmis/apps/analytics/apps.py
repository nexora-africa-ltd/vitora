# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""Analytics & Business Intelligence app configuration."""

from django.apps import AppConfig


class AnalyticsConfig(AppConfig):
    """Configuration for the Analytics & BI app."""

    default_auto_field = "django.db.models.BigAutoField"
    name = "hmis.apps.analytics"
    verbose_name = "Analytics & Business Intelligence"
