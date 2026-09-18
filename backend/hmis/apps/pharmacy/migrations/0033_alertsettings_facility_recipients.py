# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""Scope pharmacy alert settings and recipients to individual facilities.

Applied by Django migrations. Existing global rows retain null facilities for
audit history; active-facility reads create their own settings records.
"""

from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):
    dependencies = [migrations.swappable_dependency(settings.AUTH_USER_MODEL), ("pharmacy", "0032_dispensing_public_id_and_more")]

    operations = [
        migrations.AddField(model_name="alertsettings", name="facility", field=models.ForeignKey(blank=True, help_text="Facility (branch) where this record was created.", null=True, on_delete=django.db.models.deletion.CASCADE, related_name="%(app_label)s_%(class)s_set", to="core.facility")),
        migrations.AddField(model_name="alertsettings", name="organization", field=models.ForeignKey(blank=True, help_text="Owning organization (tenant).", null=True, on_delete=django.db.models.deletion.CASCADE, related_name="%(app_label)s_%(class)s_set", to="core.organization")),
        migrations.AddField(model_name="alertsettings", name="origin_hub_id", field=models.CharField(blank=True, db_index=True, help_text="Hub ID where this record was originally created (null = cloud-created).", max_length=100, null=True)),
        migrations.AddField(model_name="alertsettings", name="origin_local_id", field=models.BigIntegerField(blank=True, db_index=True, help_text="Original PK on the source hub (for dedup on cloud receipt).", null=True)),
        migrations.AddField(model_name="alertsettings", name="stock_alert_roles", field=models.ManyToManyField(blank=True, related_name="stock_alert_settings", to="core.role")),
        migrations.AddField(model_name="alertsettings", name="stock_alert_users", field=models.ManyToManyField(blank=True, related_name="stock_alert_settings", to=settings.AUTH_USER_MODEL)),
        migrations.AddField(model_name="alertsettings", name="lab_critical_alert_roles", field=models.ManyToManyField(blank=True, related_name="lab_critical_alert_settings", to="core.role")),
        migrations.AddField(model_name="alertsettings", name="lab_critical_alert_users", field=models.ManyToManyField(blank=True, related_name="lab_critical_alert_settings", to=settings.AUTH_USER_MODEL)),
        migrations.AddConstraint(model_name="alertsettings", constraint=models.UniqueConstraint(fields=("facility",), name="unique_alert_settings_facility")),
    ]
