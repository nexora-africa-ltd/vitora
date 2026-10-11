# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""Add the Ed25519 installation-proof public key; apply with ``python manage.py migrate``.

This migration has no CLI arguments or environment variables.
"""

from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("licensing", "0008_hubbackupdestination")]

    operations = [
        migrations.AddField(
            model_name="installation",
            name="device_signing_public_key",
            field=models.CharField(
                blank=True,
                default="",
                help_text="Base64-encoded raw Ed25519 public key registered for installation proofs.",
                max_length=128,
            ),
        ),
    ]
