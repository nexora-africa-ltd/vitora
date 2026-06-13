# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""
Phase 4/5 migration: Distribution hardening and aggressive controls.

Adds to Installation:
- delivery_mode, update_channel, last_update_check, pending_update_version
- update_deferred_until, container_image_digest
- protection_tier, sqlcipher_enabled, tpm_available, tpm_ak_public
- last_tpm_quote_at, build_id, canary_token, is_per_customer_build
"""

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("licensing", "0003_phase3_integrity_checkin"),
    ]

    operations = [
        # Phase 4: Distribution Hardening fields
        migrations.AddField(
            model_name="installation",
            name="delivery_mode",
            field=models.CharField(
                choices=[
                    ("TARBALL", "Tarball (native)"),
                    ("CONTAINER", "Container (Docker)"),
                    ("MSI", "Windows MSI"),
                ],
                default="TARBALL",
                help_text="How this installation receives updates.",
                max_length=20,
            ),
        ),
        migrations.AddField(
            model_name="installation",
            name="update_channel",
            field=models.CharField(
                choices=[("stable", "Stable"), ("beta", "Beta")],
                default="stable",
                help_text="Update channel: stable or beta.",
                max_length=20,
            ),
        ),
        migrations.AddField(
            model_name="installation",
            name="last_update_check",
            field=models.DateTimeField(
                blank=True,
                help_text="When the last update check was performed.",
                null=True,
            ),
        ),
        migrations.AddField(
            model_name="installation",
            name="pending_update_version",
            field=models.CharField(
                blank=True,
                default="",
                help_text="Version of a pending (downloaded but not applied) update.",
                max_length=50,
            ),
        ),
        migrations.AddField(
            model_name="installation",
            name="update_deferred_until",
            field=models.DateTimeField(
                blank=True,
                help_text="Customer-deferred update deadline.",
                null=True,
            ),
        ),
        migrations.AddField(
            model_name="installation",
            name="container_image_digest",
            field=models.CharField(
                blank=True,
                default="",
                help_text="SHA-256 digest of the running container image.",
                max_length=128,
            ),
        ),
        # Phase 5: Aggressive Controls fields
        migrations.AddField(
            model_name="installation",
            name="protection_tier",
            field=models.CharField(
                choices=[
                    ("STANDARD", "Standard (Phase 2+3)"),
                    ("ENHANCED", "Enhanced (+ SQLCipher)"),
                    ("MAXIMUM", "Maximum (+ TPM + per-customer)"),
                ],
                default="STANDARD",
                help_text="Protection level for this installation.",
                max_length=20,
            ),
        ),
        migrations.AddField(
            model_name="installation",
            name="sqlcipher_enabled",
            field=models.BooleanField(
                default=False,
                help_text="Whether the local database is encrypted with SQLCipher.",
            ),
        ),
        migrations.AddField(
            model_name="installation",
            name="tpm_available",
            field=models.BooleanField(
                default=False,
                help_text="Whether TPM 2.0 attestation is available on this hardware.",
            ),
        ),
        migrations.AddField(
            model_name="installation",
            name="tpm_ak_public",
            field=models.TextField(
                blank=True,
                default="",
                help_text="TPM attestation key public part (base64) for cloud verification.",
            ),
        ),
        migrations.AddField(
            model_name="installation",
            name="last_tpm_quote_at",
            field=models.DateTimeField(
                blank=True,
                help_text="When the last TPM PCR quote was received.",
                null=True,
            ),
        ),
        migrations.AddField(
            model_name="installation",
            name="build_id",
            field=models.CharField(
                blank=True,
                default="",
                help_text="Watermark build ID embedded in this installation's binaries.",
                max_length=16,
            ),
        ),
        migrations.AddField(
            model_name="installation",
            name="canary_token",
            field=models.CharField(
                blank=True,
                default="",
                help_text="Canary token for provenance tracking.",
                max_length=32,
            ),
        ),
        migrations.AddField(
            model_name="installation",
            name="is_per_customer_build",
            field=models.BooleanField(
                default=False,
                help_text="Whether this installation has a unique per-customer build.",
            ),
        ),
    ]
