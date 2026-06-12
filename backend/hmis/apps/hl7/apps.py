# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""HL7 v2 messaging app configuration."""

from django.apps import AppConfig


class HL7Config(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "hmis.apps.hl7"
    verbose_name = "HL7 v2 Messaging"
