"""Tests for backfill_dicom_study_statistics management command."""

from __future__ import annotations

from datetime import date
from io import StringIO

import pytest
from django.core.management import call_command
from pydicom.uid import generate_uid

from hmis.apps.imaging.models import DICOMInstance, DICOMSeries, DICOMStudy


def _create_study(patient, *, uid: str | None = None) -> DICOMStudy:
    return DICOMStudy.objects.create(
        study_instance_uid=uid or str(generate_uid()),
        patient=patient,
        study_date=date(2026, 8, 1),
        modality="XR",
        number_of_series=99,
        number_of_instances=99,
        total_file_size=999,
    )


def _add_series_with_instances(study: DICOMStudy, *, instance_sizes: list[int]) -> DICOMSeries:
    series = DICOMSeries.objects.create(
        study=study,
        series_instance_uid=str(generate_uid()),
        modality="XR",
        number_of_instances=0,
        total_file_size=0,
    )
    for size in instance_sizes:
        DICOMInstance.objects.create(
            series=series,
            sop_instance_uid=str(generate_uid()),
            file_path=f"dicom/{study.study_instance_uid}/{series.series_instance_uid}/{generate_uid()}.dcm",
            file_size=size,
        )
    return series


@pytest.mark.django_db
class TestBackfillDICOMStudyStatisticsCommand:
    def test_command_recomputes_existing_study_statistics(self, sample_patient):
        study = _create_study(sample_patient)
        series_a = _add_series_with_instances(study, instance_sizes=[100, 200])
        series_b = _add_series_with_instances(study, instance_sizes=[300])

        out = StringIO()
        call_command("backfill_dicom_study_statistics", stdout=out)

        study.refresh_from_db()
        series_a.refresh_from_db()
        series_b.refresh_from_db()

        assert study.number_of_series == 2
        assert study.number_of_instances == 3
        assert study.total_file_size == 600
        assert series_a.number_of_instances == 2
        assert series_a.total_file_size == 300
        assert series_b.number_of_instances == 1
        assert series_b.total_file_size == 300

        output = out.getvalue()
        assert "APPLIED" in output
        assert "changed=1" in output

    def test_command_dry_run_does_not_persist_changes(self, sample_patient):
        study = _create_study(sample_patient)
        _add_series_with_instances(study, instance_sizes=[100, 200])

        out = StringIO()
        call_command("backfill_dicom_study_statistics", dry_run=True, stdout=out)

        study.refresh_from_db()
        assert study.number_of_series == 99
        assert study.number_of_instances == 99
        assert study.total_file_size == 999

        output = out.getvalue()
        assert "DRY RUN" in output
        assert "changed=1" in output

    def test_command_can_target_specific_study_uid(self, sample_patient):
        target = _create_study(sample_patient)
        other = _create_study(sample_patient)

        _add_series_with_instances(target, instance_sizes=[10])
        _add_series_with_instances(other, instance_sizes=[20, 30])

        call_command(
            "backfill_dicom_study_statistics",
            study_uids=[target.study_instance_uid],
        )

        target.refresh_from_db()
        other.refresh_from_db()

        assert target.number_of_series == 1
        assert target.number_of_instances == 1
        assert target.total_file_size == 10

        assert other.number_of_series == 99
        assert other.number_of_instances == 99
        assert other.total_file_size == 999
