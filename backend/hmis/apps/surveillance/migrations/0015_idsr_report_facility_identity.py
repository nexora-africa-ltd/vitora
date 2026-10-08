# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""Make IDSR weekly report identity explicitly facility-scoped.

Apply with: python manage.py migrate
Inputs: Existing IDSR reports with legacy facility_code values and Facility MFL codes.
"""

from django.db import migrations, models


def backfill_idsr_report_facilities(apps, schema_editor):
    """Associate legacy reports with facilities by their stable MFL code."""
    IDSRWeeklyReport = apps.get_model("surveillance", "IDSRWeeklyReport")
    Facility = apps.get_model("core", "Facility")

    facilities_by_mfl = {
        facility.mfl_code: facility
        for facility in Facility.objects.exclude(mfl_code="").only("id", "mfl_code", "organization_id")
    }
    for report in IDSRWeeklyReport.objects.filter(facility_ref__isnull=True).exclude(facility_code=""):
        facility = facilities_by_mfl.get(report.facility_code)
        if facility is None:
            continue
        report.facility_ref_id = facility.id
        report.organization_id = facility.organization_id
        report.save(update_fields=["facility_ref", "organization"])


class Migration(migrations.Migration):
    dependencies = [
        ("surveillance", "0014_remove_idsrweeklyreport_surveillanc_county__296530_idx"),
    ]

    operations = [
        migrations.RunPython(backfill_idsr_report_facilities, migrations.RunPython.noop),
        migrations.RemoveConstraint(
            model_name="idsrweeklyreport",
            name="unique_idsr_week_facility",
        ),
        migrations.AddConstraint(
            model_name="idsrweeklyreport",
            constraint=models.UniqueConstraint(
                fields=("epi_year", "epi_week", "facility_ref"),
                name="unique_idsr_week_facility_ref",
            ),
        ),
    ]
