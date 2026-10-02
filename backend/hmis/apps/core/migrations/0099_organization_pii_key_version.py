# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""Create the wrapped organization PII key registry; apply with ``manage.py migrate``."""

import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("core", "0098_smarttokencontext")]

    operations = [
        migrations.CreateModel(
            name="OrganizationPIIKeyVersion",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("version", models.PositiveIntegerField(help_text="Monotonic version within the organization.")),
                ("wrapped_dek", models.TextField(help_text="KMS-wrapped AES-256 data encryption key.")),
                ("wrapped_hmac_key", models.TextField(help_text="KMS-wrapped HMAC key for future blind indices.")),
                ("kms_provider", models.CharField(help_text="Provider that wrapped this key material.", max_length=32)),
                ("kms_key_id", models.CharField(help_text="KMS key identifier used for wrapping.", max_length=512)),
                ("is_active", models.BooleanField(db_index=True, default=True)),
                ("organization", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="pii_key_versions", to="core.organization")),
            ],
            options={"ordering": ["organization_id", "-version"]},
        ),
        migrations.AddConstraint(
            model_name="organizationpiikeyversion",
            constraint=models.UniqueConstraint(fields=("organization", "version"), name="core_org_pii_key_version_unique"),
        ),
        migrations.AddConstraint(
            model_name="organizationpiikeyversion",
            constraint=models.UniqueConstraint(condition=models.Q(("is_active", True)), fields=("organization",), name="core_org_pii_one_active_key"),
        ),
    ]
