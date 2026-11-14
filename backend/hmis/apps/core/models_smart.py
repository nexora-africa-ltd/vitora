# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""
Persistent SMART-on-FHIR launch context for django-oauth-toolkit access tokens.

Used by the SMART OAuth authenticator to attach patient and encounter launch
context to every bearer-authenticated API request. Inputs are DOT AccessToken
records and optional local patient/encounter references.
"""

from django.db import models
from django.utils import timezone


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
            ("write_fhir_api", "Can write to the FHIR API"),
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


class ExternalFHIROrganization(models.Model):
    """
    Tenant-owned reference to an Organization resource hosted by another FHIR system.

    This is integration metadata only. It must never be used as Vitora's
    organization/facility tenancy key.
    """

    organization = models.ForeignKey(
        "core.Organization",
        on_delete=models.CASCADE,
        related_name="external_fhir_organizations",
        help_text="Vitora tenant that owns this integration reference.",
    )
    source_application = models.ForeignKey(
        "oauth2_provider.Application",
        on_delete=models.SET_NULL,
        related_name="external_fhir_organizations",
        null=True,
        blank=True,
        help_text="SMART OAuth application through which this reference was received.",
    )
    source_endpoint = models.URLField(
        blank=True,
        help_text="Optional external integration endpoint that supplied this resource.",
    )
    external_base_url = models.URLField(
        help_text="FHIR server base URL, excluding this resource's type and logical ID.",
    )
    fhir_resource_type = models.CharField(
        max_length=64,
        default="Organization",
        help_text="FHIR resource type supplied by the external server.",
    )
    fhir_resource_id = models.CharField(
        max_length=255,
        help_text="Logical resource ID allocated by the external FHIR server.",
    )
    identifiers = models.JSONField(
        default=list,
        blank=True,
        help_text="External FHIR Identifier values, preserving system and value pairs.",
    )
    mfl_code = models.CharField(
        max_length=20,
        blank=True,
        help_text="External Kenya Master Facility List code when provided.",
    )
    display_name = models.CharField(max_length=255)
    matched_facility = models.ForeignKey(
        "core.Facility",
        on_delete=models.SET_NULL,
        related_name="matched_external_fhir_organizations",
        null=True,
        blank=True,
        help_text="Optional verified match to a facility in the same Vitora organization.",
    )
    matched_at = models.DateTimeField(null=True, blank=True)
    matched_by = models.ForeignKey(
        "auth.User",
        on_delete=models.SET_NULL,
        related_name="matched_external_fhir_organizations",
        null=True,
        blank=True,
    )
    provenance = models.JSONField(
        default=dict,
        blank=True,
        help_text="Non-sensitive import provenance such as bundle and endpoint identifiers.",
    )
    last_seen_at = models.DateTimeField(default=timezone.now)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "external FHIR organization"
        verbose_name_plural = "external FHIR organizations"
        constraints = [
            models.UniqueConstraint(
                fields=(
                    "organization",
                    "external_base_url",
                    "fhir_resource_type",
                    "fhir_resource_id",
                ),
                name="unique_external_fhir_organization_per_tenant",
            ),
        ]
        indexes = [
            models.Index(fields=("organization", "mfl_code")),
            models.Index(fields=("organization", "display_name")),
        ]

    def __str__(self) -> str:
        """Identify the external resource without implying local ownership."""
        return f"{self.display_name} ({self.fhir_resource_type}/{self.fhir_resource_id})"

    def save(self, *args, **kwargs):
        """Validate cross-tenant facility matching before persistence."""
        self.full_clean()
        super().save(*args, **kwargs)

    def clean(self):
        """Ensure an optional local facility match never crosses tenant boundaries."""
        from django.core.exceptions import ValidationError

        if self.fhir_resource_type != "Organization":
            raise ValidationError(
                {"fhir_resource_type": "Must be the FHIR Organization resource type."}
            )
        if (
            self.matched_facility_id
            and self.matched_facility.organization_id != self.organization_id
        ):
            raise ValidationError(
                {"matched_facility": "The matched facility must belong to the owning organization."}
            )
