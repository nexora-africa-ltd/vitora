# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""Move laboratory escalation recipients out of pharmacy alert settings.

Applied by Django migrations. Existing facility-scoped lab recipients are copied
to laboratory settings before the pharmacy relation tables are removed.
"""

from django.db import migrations


def copy_laboratory_recipients(apps, schema_editor):
    """Copy legacy pharmacy lab recipients into the matching lab configuration."""
    AlertSettings = apps.get_model("pharmacy", "AlertSettings")
    LaboratoryAlertSettings = apps.get_model("laboratory", "LaboratoryAlertSettings")
    for legacy in AlertSettings.objects.exclude(facility__isnull=True):
        settings, _ = LaboratoryAlertSettings.objects.get_or_create(
            facility_id=legacy.facility_id,
            defaults={"organization_id": legacy.organization_id},
        )
        settings.lab_critical_alert_roles.add(*legacy.lab_critical_alert_roles.all())
        settings.lab_critical_alert_users.add(*legacy.lab_critical_alert_users.all())


class Migration(migrations.Migration):
    dependencies = [
        ("laboratory", "0050_laboratory_alert_settings"),
        ("pharmacy", "0033_alertsettings_facility_recipients"),
    ]

    operations = [
        migrations.RunPython(copy_laboratory_recipients, migrations.RunPython.noop),
        migrations.RemoveField(model_name="alertsettings", name="lab_critical_alert_roles"),
        migrations.RemoveField(model_name="alertsettings", name="lab_critical_alert_users"),
    ]
