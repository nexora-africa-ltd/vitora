# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""Add the auditable SUPERSEDED county-notification delivery status.

Apply with:
    poetry run python manage.py migrate

Inputs:
    No runtime arguments; Django applies this migration in dependency order.
"""

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        (
            "surveillance",
            "0017_rename_surveillanc_status_70d2dc_idx_surveillanc_status_784cfb_idx_and_more",
        ),
    ]

    operations = [
        migrations.AlterField(
            model_name="countynotificationdelivery",
            name="status",
            field=models.CharField(
                choices=[
                    ("PENDING", "Pending"),
                    ("SENT", "Sent"),
                    ("DELIVERED", "Delivered"),
                    ("BOUNCED", "Bounced"),
                    ("RETRY_SCHEDULED", "Retry Scheduled"),
                    ("FAILED", "Failed"),
                    ("SUPERSEDED", "Superseded"),
                ],
                default="PENDING",
                max_length=20,
            ),
        ),
    ]
