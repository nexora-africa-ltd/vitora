# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""
Persistent SMART-on-FHIR launch context for django-oauth-toolkit access tokens.

Used by the SMART OAuth authenticator to attach patient and encounter launch
context to every bearer-authenticated API request. Inputs are DOT AccessToken
records and optional local patient/encounter references.
"""

from django.db import models


class SMARTTokenContext(models.Model):
    """Durable SMART launch context associated with exactly one access token."""

    access_token = models.OneToOneField(
        "oauth2_provider.AccessToken",
        on_delete=models.CASCADE,
        related_name="smart_context",
    )
    patient = models.ForeignKey(
        "patients.Patient",
        on_delete=models.SET_NULL,
        related_name="smart_token_contexts",
        blank=True,
        null=True,
    )
    encounter = models.ForeignKey(
        "encounters.Encounter",
        on_delete=models.SET_NULL,
        related_name="smart_token_contexts",
        blank=True,
        null=True,
    )
    launch_context = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self) -> str:
        """Identify the context without exposing clinical launch values."""
        return f"SMART token context {self.access_token_id}"

    @property
    def context(self) -> dict[str, str]:
        """Return canonical FHIR-string launch identifiers without stale values."""
        context = dict(self.launch_context or {})
        if self.patient_id:
            context["patient"] = str(self.patient_id)
        if self.encounter_id:
            context["encounter"] = str(self.encounter_id)
        return context
