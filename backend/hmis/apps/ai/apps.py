"""
AI Integration app configuration.

Provides proxy endpoints to TibaBot AI services for ICD-10 auto-coding,
clinical assistance, and condition prediction. All endpoints are feature-gated
behind TIBABOT_ENABLED setting.
"""

from django.apps import AppConfig


class AIConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "hmis.apps.ai"
    verbose_name = "AI Integration (TibaBot)"
