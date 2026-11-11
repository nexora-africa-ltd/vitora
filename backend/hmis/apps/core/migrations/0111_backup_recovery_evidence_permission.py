# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""Add the platform-only permission for SEC-BCK-001 evidence.

Applied by: python manage.py migrate
Inputs: existing core AuditLog content type and Django permission framework.
"""

from django.db import migrations


class Migration(migrations.Migration):
    """Create the backup-and-recovery evidence permission."""

    dependencies = [
        ("core", "0110_encryption_evidence_permission"),
    ]

    operations = [
        migrations.AlterModelOptions(
            name="auditlog",
            options={
                "ordering": ["-timestamp"],
                "permissions": [
                    ("view_encryption_evidence", "Can view encryption certification evidence"),
                    (
                        "view_backup_recovery_evidence",
                        "Can view backup and recovery certification evidence",
                    ),
                ],
                "verbose_name": "Audit Log",
                "verbose_name_plural": "Audit Logs",
            },
        ),
    ]
