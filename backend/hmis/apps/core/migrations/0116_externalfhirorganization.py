# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""
Create tenant-owned references for externally hosted FHIR Organization resources.

Apply with:
    python manage.py migrate
"""

import django.db.models.deletion
from django.db import migrations, models
import django.utils.timezone


class Migration(migrations.Migration):
    dependencies = [
        ("core", "0115_smartoauthclienttenantbinding_fhir_write_permission"),
        ("oauth2_provider", "0013_alter_application_authorization_grant_type_device"),
    ]

    operations = [
        migrations.CreateModel(
            name="ExternalFHIROrganization",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("source_endpoint", models.URLField(blank=True, help_text="Optional external integration endpoint that supplied this resource.")),
                ("external_base_url", models.URLField(help_text="FHIR server base URL, excluding this resource's type and logical ID.")),
                ("fhir_resource_type", models.CharField(default="Organization", help_text="FHIR resource type supplied by the external server.", max_length=64)),
                ("fhir_resource_id", models.CharField(help_text="Logical resource ID allocated by the external FHIR server.", max_length=255)),
                ("identifiers", models.JSONField(blank=True, default=list, help_text="External FHIR Identifier values, preserving system and value pairs.")),
                ("mfl_code", models.CharField(blank=True, help_text="External Kenya Master Facility List code when provided.", max_length=20)),
                ("display_name", models.CharField(max_length=255)),
                ("matched_at", models.DateTimeField(blank=True, null=True)),
                ("provenance", models.JSONField(blank=True, default=dict, help_text="Non-sensitive import provenance such as bundle and endpoint identifiers.")),
                ("last_seen_at", models.DateTimeField(default=django.utils.timezone.now)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("matched_by", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="matched_external_fhir_organizations", to="auth.user")),
                ("matched_facility", models.ForeignKey(blank=True, help_text="Optional verified match to a facility in the same Vitora organization.", null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="matched_external_fhir_organizations", to="core.facility")),
                ("organization", models.ForeignKey(help_text="Vitora tenant that owns this integration reference.", on_delete=django.db.models.deletion.CASCADE, related_name="external_fhir_organizations", to="core.organization")),
                ("source_application", models.ForeignKey(blank=True, help_text="SMART OAuth application through which this reference was received.", null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="external_fhir_organizations", to="oauth2_provider.application")),
            ],
            options={
                "verbose_name": "external FHIR organization",
                "verbose_name_plural": "external FHIR organizations",
                "indexes": [models.Index(fields=["organization", "mfl_code"], name="core_extern_organiz_8d8ce3_idx"), models.Index(fields=["organization", "display_name"], name="core_extern_organiz_9bef79_idx")],
                "constraints": [models.UniqueConstraint(fields=("organization", "external_base_url", "fhir_resource_type", "fhir_resource_id"), name="unique_external_fhir_organization_per_tenant")],
            },
        ),
    ]
