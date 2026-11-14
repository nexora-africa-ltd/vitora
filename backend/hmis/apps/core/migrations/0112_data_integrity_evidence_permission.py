# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""Add the permission required to retrieve SEC-INT-001 evidence.

Applied by: python manage.py migrate
Inputs: existing core AuditLog content type and Django permission framework.
"""

from django.db import migrations


class Migration(migrations.Migration):
    """Create the data-integrity evidence permission."""

    dependencies = [
        ("core", "0111_backup_recovery_evidence_permission"),
    ]

    operations = [
        migrations.AlterModelOptions(
            name="auditlog",
            options={
                "ordering": ["-timestamp"],
                "permissions": [
                    ("view_encryption_evidence", "Can view encryption certification evidence"),
                    ("view_data_integrity_evidence", "Can view data integrity certification evidence"),
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
