# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""Statistics utilities for DICOM studies and series."""

from __future__ import annotations

from django.db import models


def recompute_study_statistics(study) -> dict[str, int]:
    """Recalculate series/instance counts and total file size for one study."""
    series_qs = study.series_set.all()

    number_of_series = series_qs.count()
    number_of_instances = 0
    total_file_size = 0

    for series in series_qs:
        inst_count = series.instances.count()
        inst_size = series.instances.aggregate(total=models.Sum("file_size"))["total"] or 0
        series.number_of_instances = inst_count
        series.total_file_size = inst_size
        series.save(update_fields=["number_of_instances", "total_file_size"])

        number_of_instances += inst_count
        total_file_size += inst_size

    study.number_of_series = number_of_series
    study.number_of_instances = number_of_instances
    study.total_file_size = total_file_size
    study.save(update_fields=["number_of_series", "number_of_instances", "total_file_size"])

    return {
        "number_of_series": number_of_series,
        "number_of_instances": number_of_instances,
        "total_file_size": total_file_size,
    }
