"""Backfill missing DICOM study thumbnails from existing instances."""

from __future__ import annotations

from django.core.management.base import BaseCommand

from hmis.apps.imaging.models import DICOMInstance, DICOMStudy
from hmis.apps.imaging.services.dicom import DICOMParsingService
from hmis.apps.imaging.services.pacs import PACSStorageService


class Command(BaseCommand):
    help = "Generate thumbnail_path for studies where it is missing"

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

        queryset = DICOMStudy.objects.filter(thumbnail_path="").order_by("id")
        if study_uids:
            queryset = queryset.filter(study_instance_uid__in=study_uids)

        total = queryset.count()
        if total == 0:
            self.stdout.write(self.style.WARNING("No studies with missing thumbnails found."))
            return

        pacs = PACSStorageService()

        updated = 0
        skipped_no_instance = 0
        skipped_missing_file = 0
        failed_generation = 0

        for study in queryset:
            instance = (
                DICOMInstance.objects.filter(series__study=study)
                .order_by("series__series_number", "instance_number", "id")
                .first()
            )

            if not instance:
                skipped_no_instance += 1
                continue

            if not pacs.file_exists(instance.file_path):
                skipped_missing_file += 1
                self.stdout.write(
                    self.style.WARNING(
                        f"{study.study_instance_uid}: source file missing ({instance.file_path})"
                    )
                )
                continue

            with pacs.materialize_temp_file(instance.file_path, suffix=".dcm") as local_path:
                thumb_bytes, thumb_sop_uid = DICOMParsingService.generate_thumbnail_bytes(
                    local_path
                )

            if not thumb_bytes:
                failed_generation += 1
                continue

            thumb_uid = thumb_sop_uid or instance.sop_instance_uid
            thumb_path = f"thumbnails/{thumb_uid}.jpg"
            pacs.save_bytes(thumb_path, thumb_bytes, content_type="image/jpeg")

            if dry_run:
                self.stdout.write(f"{study.study_instance_uid}: would set {thumb_path}")
                updated += 1
                continue

            study.thumbnail_path = thumb_path
            study.save(update_fields=["thumbnail_path"])
            updated += 1

        mode = "DRY RUN" if dry_run else "APPLIED"
        self.stdout.write(
            self.style.SUCCESS(
                f"{mode}: processed={total}, updated={updated}, "
                f"no_instance={skipped_no_instance}, missing_file={skipped_missing_file}, "
                f"generation_failed={failed_generation}"
            )
        )
