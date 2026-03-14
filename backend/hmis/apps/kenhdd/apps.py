"""
KENHDD (Kenya National Health Data Dictionary) app configuration.

DHA Compliance: Gap #33 — KENHDD Schema Validation (Sprint 3.D)
"""

from django.apps import AppConfig


class KENHDDConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "hmis.apps.kenhdd"
    verbose_name = "KENHDD Compliance"
