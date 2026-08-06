# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""Backfill DICOM study/series statistics for existing records."""

from __future__ import annotations

from django.core.management.base import BaseCommand

from hmis.apps.imaging.models import DICOMStudy
from hmis.apps.imaging.services.statistics import recompute_study_statistics


class Command(BaseCommand):
    help = "Recompute number_of_series, number_of_instances, and total_file_size for DICOM studies"

    def add_arguments(self, parser):
        parser.add_argument(
            "--study-uid",
            action="append",
            dest="study_uids",
            default=[],
            help="Specific StudyInstanceUID to recompute (repeat flag for multiple)",
        )
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Show what would change without writing updates",
        )

    def handle(self, *args, **options):
        study_uids: list[str] = options["study_uids"]
        dry_run: bool = options["dry_run"]

        queryset = DICOMStudy.objects.all().order_by("id")
        if study_uids:
            queryset = queryset.filter(study_instance_uid__in=study_uids)

        total = queryset.count()
        if total == 0:
            self.stdout.write(self.style.WARNING("No DICOM studies matched the selection."))
            return

        changed = 0
        unchanged = 0

        for study in queryset:
            before = {
                "number_of_series": study.number_of_series,
                "number_of_instances": study.number_of_instances,
                "total_file_size": study.total_file_size,
            }

            if dry_run:
                after = _calculate_expected_stats(study)
            else:
                after = recompute_study_statistics(study)

            if before != after:
                changed += 1
                self.stdout.write(
                    f"{study.study_instance_uid}: "
                    f"series {before['number_of_series']}->{after['number_of_series']}, "
                    f"instances {before['number_of_instances']}->{after['number_of_instances']}, "
                    f"size {before['total_file_size']}->{after['total_file_size']}"
                )
            else:
                unchanged += 1

        mode = "DRY RUN" if dry_run else "APPLIED"
        self.stdout.write(
            self.style.SUCCESS(
                f"{mode}: processed={total}, changed={changed}, unchanged={unchanged}"
            )
        )


def _calculate_expected_stats(study) -> dict[str, int]:
    """Compute expected study stats without mutating DB state."""
    series_qs = study.series_set.all()

    number_of_series = series_qs.count()
    number_of_instances = 0
    total_file_size = 0

    for series in series_qs:
        instances = series.instances.all()
        number_of_instances += instances.count()
        total_file_size += sum(int(inst.file_size or 0) for inst in instances)

    return {
        "number_of_series": number_of_series,
        "number_of_instances": number_of_instances,
        "total_file_size": total_file_size,
    }
