# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""Create facility-scoped critical laboratory escalation recipient settings.

Applied by Django migrations. No CLI arguments or environment variables are supported.
"""

from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):
    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ("core", "0052_facility_biometrics_agent_national_id"),
        ("laboratory", "0049_externalpatientidentifiercrosswalk_and_more"),
    ]

    operations = [
        migrations.CreateModel(
            name="LaboratoryAlertSettings",
            fields=[
                (
                    "id",
                    models.BigAutoField(
                        auto_created=True, primary_key=True, serialize=False, verbose_name="ID"
                    ),
                ),
                (
                    "facility",
                    models.ForeignKey(
                        blank=True,
                        help_text="Facility (branch) where this record was created.",
                        null=True,
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="%(app_label)s_%(class)s_set",
                        to="core.facility",
                    ),
                ),
                (
                    "organization",
                    models.ForeignKey(
                        blank=True,
                        help_text="Owning organization (tenant).",
                        null=True,
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="%(app_label)s_%(class)s_set",
                        to="core.organization",
                    ),
                ),
                (
                    "origin_hub_id",
                    models.CharField(
                        blank=True,
                        db_index=True,
                        help_text="Hub ID where this record was originally created (null = cloud-created).",
                        max_length=100,
                        null=True,
                    ),
                ),
                (
                    "origin_local_id",
                    models.BigIntegerField(
                        blank=True,
                        db_index=True,
                        help_text="Original PK on the source hub (for dedup on cloud receipt).",
                        null=True,
                    ),
                ),
                (
                    "lab_critical_alert_roles",
                    models.ManyToManyField(
                        blank=True, related_name="laboratory_critical_alert_settings", to="core.role"
                    ),
                ),
                (
                    "lab_critical_alert_users",
                    models.ManyToManyField(
                        blank=True,
                        related_name="laboratory_critical_alert_settings",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
            ],
            options={
                "verbose_name": "Laboratory Alert Settings",
                "verbose_name_plural": "Laboratory Alert Settings",
                "constraints": [
                    models.UniqueConstraint(
                        fields=("facility",), name="one_lab_alert_settings_per_facility"
                    )
                ],
            },
        ),
    ]
