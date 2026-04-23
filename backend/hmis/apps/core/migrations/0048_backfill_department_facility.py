"""
Backfill Department.facility and Department.organization from staff assignments.

For each department, the facility is inferred from the majority primary_facility
of its staff members. If no staff are assigned, the department is linked to the
first active facility in the system (if any).
"""

from collections import Counter

from django.db import migrations


def backfill_department_facility(apps, schema_editor):
    """Assign facility/organization to existing departments based on staff."""
    Department = apps.get_model("core", "Department")
    StaffProfile = apps.get_model("core", "StaffProfile")
    Facility = apps.get_model("core", "Facility")

    # Build mapping: department_id → most common facility_id among its staff
    staff_qs = StaffProfile.objects.filter(
        primary_department__isnull=False,
        primary_facility__isnull=False,
    ).values_list("primary_department_id", "primary_facility_id")

    dept_facility_votes: dict[int, list[int]] = {}
    for dept_id, fac_id in staff_qs:
        dept_facility_votes.setdefault(dept_id, []).append(fac_id)

    dept_to_facility: dict[int, int] = {}
    for dept_id, fac_ids in dept_facility_votes.items():
        counter = Counter(fac_ids)
        dept_to_facility[dept_id] = counter.most_common(1)[0][0]

    # Fallback: first active facility
    fallback_facility = Facility.objects.filter(is_active=True).first()

    # Cache facility→organization mapping
    facility_org: dict[int, int | None] = {}
    for fac in Facility.objects.select_related("organization").all():
        facility_org[fac.id] = fac.organization_id

    for dept in Department.objects.all():
        fac_id = dept_to_facility.get(dept.id)
        if not fac_id and fallback_facility:
            fac_id = fallback_facility.id

        if fac_id:
            dept.facility_id = fac_id
            dept.organization_id = facility_org.get(fac_id)
            dept.save(update_fields=["facility_id", "organization_id"])


def reverse_backfill(apps, schema_editor):
    """Clear facility/organization from all departments."""
    Department = apps.get_model("core", "Department")
    Department.objects.update(facility_id=None, organization_id=None)


class Migration(migrations.Migration):

    dependencies = [
        ("core", "0047_department_facility_scoping"),
    ]

    operations = [
        migrations.RunPython(backfill_department_facility, reverse_backfill),
    ]
