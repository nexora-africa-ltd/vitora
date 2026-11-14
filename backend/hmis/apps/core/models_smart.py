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


class SMARTOAuthClientTenantBinding(models.Model):
    """
    Bind a SMART OAuth client to the Vitora tenant it may access.

    External FHIR Organization references remain interoperability metadata.
    This binding is the authoritative local authorization boundary for an
    OAuth client and may optionally restrict it to one facility.
    """

    application = models.OneToOneField(
        "oauth2_provider.Application",
        on_delete=models.CASCADE,
        related_name="vitora_tenant_binding",
    )
    organization = models.ForeignKey(
        "core.Organization",
        on_delete=models.PROTECT,
        related_name="smart_oauth_client_bindings",
    )
    facility = models.ForeignKey(
        "core.Facility",
        on_delete=models.PROTECT,
        related_name="smart_oauth_client_bindings",
        null=True,
        blank=True,
        help_text="Optional facility restriction for this integration client.",
    )
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "SMART OAuth client tenant binding"
        verbose_name_plural = "SMART OAuth client tenant bindings"
        permissions = [
            ("access_fhir_api", "Can access the FHIR API"),
        ]

    def __str__(self) -> str:
        """Identify the binding without exposing credentials."""
        return f"SMART client {self.application_id} → {self.organization_id}"

    def save(self, *args, **kwargs):
        """Validate the tenant relationship before persisting the binding."""
        self.full_clean()
        super().save(*args, **kwargs)

    def clean(self):
        """Require any selected facility to belong to the bound organization."""
        from django.core.exceptions import ValidationError

        if self.facility_id and self.facility.organization_id != self.organization_id:
            raise ValidationError({"facility": "Facility must belong to the bound organization."})
