# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""Register the device X25519 public key used by protocol-v2 activation."""

from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("licensing", "0005_installation_eula_acceptance")]

    operations = [
        migrations.AddField(
            model_name="installation",
            name="device_public_key",
            field=models.CharField(
                blank=True,
                default="",
                help_text="Base64-encoded raw X25519 public key registered during protocol-v2 activation.",
                max_length=128,
            ),
        ),
    ]
