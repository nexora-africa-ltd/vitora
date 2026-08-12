"""Backfill missing DICOM series/instance thumbnails from existing files."""

from __future__ import annotations

import os

from django.conf import settings
from django.core.management.base import BaseCommand

from hmis.apps.imaging.models import DICOMInstance
from hmis.apps.imaging.services.dicom import DICOMParsingService
from hmis.apps.imaging.services.pacs import PACSStorageService


class Command(BaseCommand):
    help = "Generate missing thumbnail_path for DICOMSeries and DICOMInstance"

    def add_arguments(self, parser):
        parser.add_argument(
            "--study-uid",
            action="append",
            dest="study_uids",
            default=[],
            help="Specific StudyInstanceUID to process (repeat flag for multiple)",
        )
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Show what would be updated without saving",
        )

    def handle(self, *args, **options):
        study_uids: list[str] = options["study_uids"]
        dry_run: bool = options["dry_run"]

        queryset = DICOMInstance.objects.select_related("series", "series__study")
        if study_uids:
            queryset = queryset.filter(series__study__study_instance_uid__in=study_uids)

        queryset = queryset.order_by("id")
        total = queryset.count()
        if total == 0:
            self.stdout.write(self.style.WARNING("No DICOM instances matched the selection."))
            return

        pacs = PACSStorageService(base_path=str(settings.MEDIA_ROOT))
        series_filled_in_run: set[int] = set()

        updated_instances = 0
        updated_series = 0
        skipped_already_set = 0
        skipped_missing_file = 0
        generation_failed = 0

        for instance in queryset:
            series = instance.series
            needs_instance = not instance.thumbnail_path
            needs_series = not series.thumbnail_path and series.id not in series_filled_in_run

            if not needs_instance and not needs_series:
                skipped_already_set += 1
                continue

            abs_path = pacs.get_absolute_path(instance.file_path)
            if not os.path.exists(abs_path):
                skipped_missing_file += 1
                self.stdout.write(
                    self.style.WARNING(
                        f"{instance.sop_instance_uid}: source file missing ({instance.file_path})"
                    )
                )
                continue

            thumb_path = DICOMParsingService.generate_thumbnail(
                abs_path,
                str(settings.MEDIA_ROOT),
            )
            if not thumb_path:
                generation_failed += 1
                continue

            if dry_run:
                changes = []
                if needs_instance:
                    changes.append("instance")
                if needs_series:
                    changes.append("series")
                self.stdout.write(
                    f"{instance.sop_instance_uid}: would set {', '.join(changes)} thumbnail -> {thumb_path}"
                )
                if needs_instance:
                    updated_instances += 1
                if needs_series:
                    updated_series += 1
                    series_filled_in_run.add(series.id)
                continue

            if needs_instance:
                instance.thumbnail_path = thumb_path
                instance.save(update_fields=["thumbnail_path"])
                updated_instances += 1

            if needs_series:
                series.thumbnail_path = thumb_path
                series.save(update_fields=["thumbnail_path"])
                updated_series += 1
                series_filled_in_run.add(series.id)

        mode = "DRY RUN" if dry_run else "APPLIED"
        self.stdout.write(
            self.style.SUCCESS(
                f"{mode}: processed={total}, instance_updated={updated_instances}, "
                f"series_updated={updated_series}, already_set={skipped_already_set}, "
                f"missing_file={skipped_missing_file}, generation_failed={generation_failed}"
            )
        )
