# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""Remove staff-only leave/rest markers from department repeating rotas.

Applied by Django migrations with: python manage.py migrate
Inputs: existing DepartmentRosterSettings repeating_shift_pattern JSON lists.
"""

from django.db import migrations


STAFF_ONLY_TYPES = {
    "LEAVE",
    "SICK_LEAVE",
    "REST",
}


def remove_nonworking_rota_entries(apps, schema_editor):
    """Keep closure markers but strip staff-only leave/rest statuses."""
    DepartmentRosterSettings = apps.get_model("scheduling", "DepartmentRosterSettings")
    for settings in DepartmentRosterSettings.objects.all().iterator():
        pattern = settings.repeating_shift_pattern or []
        filtered = [shift_type for shift_type in pattern if shift_type not in STAFF_ONLY_TYPES]
        if filtered != pattern:
            settings.repeating_shift_pattern = filtered
            settings.save(update_fields=["repeating_shift_pattern"])


class Migration(migrations.Migration):
    dependencies = [("scheduling", "0029_departmentrostersettings")]

    operations = [migrations.RunPython(remove_nonworking_rota_entries, migrations.RunPython.noop)]
