"""Remove orphaned seed clinics that have no facility FK.

Migrations 0005/0006/0007 seeded default clinics before multitenancy was added,
so those records have facility=NULL and organization=NULL. The onboarding
``seed-defaults`` action re-creates them with proper tenant scoping, leaving the
old records as unreachable duplicates visible only in Django admin.

This migration deletes those orphans. It is safe because:
- No ClinicSession, ClinicVisit, ClinicRoom, Shift, TriageAssessment, or any
  other FK references point to them (verified via full reverse-FK scan).
- The ``seed-defaults`` API action already created facility-scoped replacements.
"""

from __future__ import annotations

from django.db import migrations


def remove_orphaned_clinics(apps, schema_editor) -> None:
    Clinic = apps.get_model("clinics", "Clinic")
    deleted_count, _ = Clinic.objects.filter(facility__isnull=True).delete()
    if deleted_count:
        print(f"\n  Removed {deleted_count} orphaned seed clinic(s) with no facility.")


def noop(apps, schema_editor) -> None:
    """No reverse — the seed migrations (0005-0007) will recreate if needed."""
    pass


class Migration(migrations.Migration):
    dependencies = [
        ("clinics", "0017_clinic_origin_hub_id_clinic_origin_local_id_and_more"),
    ]

    operations = [
        migrations.RunPython(remove_orphaned_clinics, reverse_code=noop),
    ]
