# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""
Create a tenant binding for each SMART OAuth integration client.

Apply with:
    python manage.py migrate
"""

import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("core", "0112_data_integrity_evidence_permission"),
        ("oauth2_provider", "0013_alter_application_authorization_grant_type_device"),
    ]

    operations = [
        migrations.CreateModel(
            name="SMARTOAuthClientTenantBinding",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("is_active", models.BooleanField(default=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                (
                    "application",
                    models.OneToOneField(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="vitora_tenant_binding",
                        to="oauth2_provider.application",
                    ),
                ),
                (
                    "facility",
                    models.ForeignKey(
                        blank=True,
                        help_text="Optional facility restriction for this integration client.",
                        null=True,
                        on_delete=django.db.models.deletion.PROTECT,
                        related_name="smart_oauth_client_bindings",
                        to="core.facility",
                    ),
                ),
                (
                    "organization",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.PROTECT,
                        related_name="smart_oauth_client_bindings",
                        to="core.organization",
                    ),
                ),
            ],
            options={
                "verbose_name": "SMART OAuth client tenant binding",
                "verbose_name_plural": "SMART OAuth client tenant bindings",
            },
        ),
    ]
