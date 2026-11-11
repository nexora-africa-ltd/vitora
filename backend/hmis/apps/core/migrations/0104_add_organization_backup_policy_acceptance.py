# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""Store audited organization consent for the approved offsite backup policy."""

from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):
    dependencies = [("core", "0103_websocketticket")]

    operations = [
        migrations.AddField(
            model_name="organization",
            name="backup_policy_accepted_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="organization",
            name="backup_policy_accepted_by",
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="accepted_backup_policies", to=settings.AUTH_USER_MODEL),
        ),
        migrations.AddField(
            model_name="organization",
            name="backup_policy_version",
            field=models.CharField(blank=True, default="", max_length=32),
        ),
    ]
