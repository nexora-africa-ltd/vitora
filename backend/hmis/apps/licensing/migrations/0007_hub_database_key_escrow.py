# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""Create Azure Key Vault-wrapped SQLCipher key escrow records for hubs.

Applied by Django migrations. This migration has no CLI inputs and stores only
wrapped ciphertext plus non-secret Key Vault metadata.
"""

import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("licensing", "0006_installation_device_public_key"),
    ]

    operations = [
        migrations.CreateModel(
            name="HubDatabaseKeyEscrow",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("wrapped_ciphertext", models.BinaryField(help_text="SQLCipher key material wrapped by Azure Key Vault; never plaintext.")),
                ("vault_url", models.URLField(max_length=500)),
                ("key_name", models.CharField(max_length=200)),
                ("key_version", models.CharField(max_length=200)),
                ("algorithm", models.CharField(default="RSA-OAEP-256", max_length=100)),
                ("submitted_at", models.DateTimeField(auto_now_add=True)),
                ("last_recovered_at", models.DateTimeField(blank=True, null=True)),
                ("recovery_count", models.PositiveIntegerField(default=0)),
                ("facility", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="hub_database_key_escrows", to="core.facility")),
                ("installation", models.OneToOneField(on_delete=django.db.models.deletion.CASCADE, related_name="database_key_escrow", to="licensing.installation")),
                ("organization", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="hub_database_key_escrows", to="core.organization")),
            ],
        ),
        migrations.AddIndex(
            model_name="hubdatabasekeyescrow",
            index=models.Index(fields=["organization", "facility"], name="licensing_h_organiz_ab1ff1_idx"),
        ),
    ]
