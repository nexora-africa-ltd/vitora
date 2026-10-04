# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""Remove the duplicate DICOMStudy.patient index without blocking writes.

Django automatically indexes ForeignKey fields. Run with Django migrations; no
arguments are supported.
"""

from django.db import migrations

from hmis.apps.core.migration_operations import ConcurrentRemoveIndex


class Migration(migrations.Migration):
    """Drop the Meta index duplicated by Django's ForeignKey index."""

    atomic = False

    dependencies = [
        ("imaging", "0015_externalimagingorderrequest_patient_encounter"),
    ]

    operations = [
        ConcurrentRemoveIndex(
            model_name="dicomstudy",
            name="imaging_dic_patient_43ed46_idx",
        ),
    ]
