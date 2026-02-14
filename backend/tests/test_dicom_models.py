"""
Tests for DICOM models (DICOMStudy, DICOMSeries, DICOMInstance).

Phase C.1.2-C.1.4: TDD tests written BEFORE implementation.
"""

import uuid
from datetime import date, datetime, time
from decimal import Decimal

import pytest  # type: ignore
from django.core.exceptions import ValidationError
from django.db import IntegrityError
from django.utils import timezone

# ============================================================================
# Fixtures
# ============================================================================


@pytest.fixture
def sample_imaging_procedure(db):
    """Create a sample imaging procedure."""
    from hmis.apps.imaging.models import ImagingProcedure

    return ImagingProcedure.objects.create(
        code="XR-CHEST-PA",
        name="Chest X-Ray PA",
        modality="XR",
        body_region="CHEST",
        cost=Decimal("1500.00"),
        sha_claimable=True,
        is_active=True,
    )


@pytest.fixture
def sample_imaging_order(db, sample_patient, sample_encounter, test_user, sample_imaging_procedure):
    """Create a sample imaging order with an item."""
    from hmis.apps.imaging.models import ImagingOrder, ImagingOrderItem

    order = ImagingOrder.objects.create(
        patient=sample_patient,
        encounter=sample_encounter,
        ordered_by=test_user,
        priority="ROUTINE",
        clinical_indication="Suspected pneumonia",
        status="ORDERED",
    )
    ImagingOrderItem.objects.create(
        order=order,
        procedure=sample_imaging_procedure,
        laterality="NA",
        unit_cost=sample_imaging_procedure.cost,
    )
    return order


@pytest.fixture
def study_instance_uid():
    """Generate a DICOM Study Instance UID."""
    return f"1.2.826.0.1.3680043.8.1055.1.{uuid.uuid4().int % 10**12}"


@pytest.fixture
def series_instance_uid():
    """Generate a DICOM Series Instance UID."""
    return f"1.2.826.0.1.3680043.8.1055.2.{uuid.uuid4().int % 10**12}"


@pytest.fixture
def sop_instance_uid():
    """Generate a DICOM SOP Instance UID."""
    return f"1.2.826.0.1.3680043.8.1055.3.{uuid.uuid4().int % 10**12}"


@pytest.fixture
def sample_dicom_study(db, sample_patient, sample_imaging_order, study_instance_uid, test_user):
    """Create a sample DICOM study."""
    from hmis.apps.imaging.models import DICOMStudy

    return DICOMStudy.objects.create(
        study_instance_uid=study_instance_uid,
        patient=sample_patient,
        imaging_order=sample_imaging_order,
        study_date=date(2026, 2, 7),
        study_time=time(10, 30, 0),
        study_description="Chest X-Ray PA View",
        accession_number="A260207-0001",
        referring_physician_name="Dr. Kamau",
        modality="XR",
        institution_name="Demo Health Facility",
        number_of_series=1,
        number_of_instances=2,
        uploaded_by=test_user,
    )


@pytest.fixture
def sample_dicom_series(db, sample_dicom_study, series_instance_uid):
    """Create a sample DICOM series."""
    from hmis.apps.imaging.models import DICOMSeries

    return DICOMSeries.objects.create(
        study=sample_dicom_study,
        series_instance_uid=series_instance_uid,
        series_number=1,
        series_description="PA View",
        modality="XR",
        body_part_examined="CHEST",
        number_of_instances=2,
    )


@pytest.fixture
def sample_dicom_instance(db, sample_dicom_series, sop_instance_uid):
    """Create a sample DICOM instance."""
    from hmis.apps.imaging.models import DICOMInstance

    return DICOMInstance.objects.create(
        series=sample_dicom_series,
        sop_instance_uid=sop_instance_uid,
        sop_class_uid="1.2.840.10008.5.1.4.1.1.1",
        instance_number=1,
        file_path="dicom/1.2.3/1.2.4/instance1.dcm",
        file_size=524288,
        transfer_syntax_uid="1.2.840.10008.1.2.1",
        rows=2048,
        columns=2048,
        bits_allocated=16,
        photometric_interpretation="MONOCHROME2",
    )


# ============================================================================
# DICOMStudy Model Tests
# ============================================================================


class TestDICOMStudyModel:
    """Tests for DICOMStudy model."""

    def test_create_study_with_all_fields(
        self, db, sample_patient, sample_imaging_order, test_user
    ):
        """Should create a DICOMStudy with all required fields."""
        from hmis.apps.imaging.models import DICOMStudy

        uid = f"1.2.826.0.1.3680043.8.1055.1.{uuid.uuid4().int % 10**12}"
        study = DICOMStudy.objects.create(
            study_instance_uid=uid,
            patient=sample_patient,
            imaging_order=sample_imaging_order,
            study_date=date(2026, 2, 7),
            study_time=time(10, 30, 0),
            study_description="Chest X-Ray PA View",
            accession_number="A260207-0001",
            referring_physician_name="Dr. Kamau",
            modality="XR",
            institution_name="Demo Health Facility",
            number_of_series=1,
            number_of_instances=2,
            uploaded_by=test_user,
        )

        assert study.pk is not None
        assert study.study_instance_uid == uid
        assert study.patient == sample_patient
        assert study.imaging_order == sample_imaging_order
        assert study.study_date == date(2026, 2, 7)
        assert study.modality == "XR"
        assert study.number_of_series == 1
        assert study.number_of_instances == 2

    def test_study_instance_uid_unique(
        self, sample_dicom_study, sample_patient, sample_imaging_order, test_user
    ):
        """Should enforce unique study_instance_uid."""
        from hmis.apps.imaging.models import DICOMStudy

        with pytest.raises(IntegrityError):
            DICOMStudy.objects.create(
                study_instance_uid=sample_dicom_study.study_instance_uid,
                patient=sample_patient,
                imaging_order=sample_imaging_order,
                study_date=date(2026, 2, 7),
                accession_number="ACC-2",
                modality="XR",
                uploaded_by=test_user,
            )

    def test_study_str_representation(self, sample_dicom_study):
        """Should return formatted string representation."""
        result = str(sample_dicom_study)
        assert "XR" in result
        assert "Chest X-Ray PA View" in result

    def test_study_timestamps(self, sample_dicom_study):
        """Should auto-set created_at and updated_at."""
        assert sample_dicom_study.created_at is not None
        assert sample_dicom_study.updated_at is not None

    def test_study_optional_fields(self, db, sample_patient, sample_imaging_order, test_user):
        """Should allow optional fields to be blank/null."""
        from hmis.apps.imaging.models import DICOMStudy

        uid = f"1.2.826.0.1.3680043.8.1055.1.{uuid.uuid4().int % 10**12}"
        study = DICOMStudy.objects.create(
            study_instance_uid=uid,
            patient=sample_patient,
            imaging_order=sample_imaging_order,
            study_date=date(2026, 2, 7),
            modality="XR",
            uploaded_by=test_user,
        )
        assert study.pk is not None
        assert study.study_time is None
        assert study.study_description == ""
        assert study.referring_physician_name == ""
        assert study.institution_name == ""

    def test_study_patient_protect(self, sample_dicom_study, sample_patient):
        """Should PROTECT patient from deletion when study exists."""
        with pytest.raises(Exception):
            sample_patient.delete()

    def test_study_order_protect(self, sample_dicom_study, sample_imaging_order):
        """Should PROTECT imaging order from deletion when study exists."""
        with pytest.raises(Exception):
            sample_imaging_order.delete()

    def test_study_ordering(self, db, sample_patient, sample_imaging_order, test_user):
        """Should order by -study_date, -created_at by default."""
        from hmis.apps.imaging.models import DICOMStudy

        uid1 = f"1.2.826.0.1.3680043.8.1055.1.{uuid.uuid4().int % 10**12}"
        uid2 = f"1.2.826.0.1.3680043.8.1055.1.{uuid.uuid4().int % 10**12}"

        study1 = DICOMStudy.objects.create(
            study_instance_uid=uid1,
            patient=sample_patient,
            imaging_order=sample_imaging_order,
            study_date=date(2026, 1, 1),
            modality="XR",
            uploaded_by=test_user,
        )
        study2 = DICOMStudy.objects.create(
            study_instance_uid=uid2,
            patient=sample_patient,
            imaging_order=sample_imaging_order,
            study_date=date(2026, 2, 1),
            modality="CT",
            uploaded_by=test_user,
        )

        studies = list(DICOMStudy.objects.all())
        assert studies[0] == study2  # More recent first
        assert studies[1] == study1

    def test_study_modality_choices(self, db, sample_patient, sample_imaging_order, test_user):
        """Should accept all valid modality choices."""
        from hmis.apps.imaging.models import DICOMStudy

        modalities = ["XR", "US", "CT", "MRI", "NM", "MG", "FL", "OTHER"]
        for i, modality in enumerate(modalities):
            uid = f"1.2.826.0.1.3680043.8.1055.1.{i + 100}"
            study = DICOMStudy.objects.create(
                study_instance_uid=uid,
                patient=sample_patient,
                imaging_order=sample_imaging_order,
                study_date=date(2026, 2, 7),
                modality=modality,
                uploaded_by=test_user,
            )
            assert study.modality == modality

    def test_study_file_size_tracking(self, db, sample_patient, sample_imaging_order, test_user):
        """Should track total file size in bytes."""
        from hmis.apps.imaging.models import DICOMStudy

        uid = f"1.2.826.0.1.3680043.8.1055.1.{uuid.uuid4().int % 10**12}"
        study = DICOMStudy.objects.create(
            study_instance_uid=uid,
            patient=sample_patient,
            imaging_order=sample_imaging_order,
            study_date=date(2026, 2, 7),
            modality="CT",
            total_file_size=104857600,  # 100 MB
            uploaded_by=test_user,
        )
        assert study.total_file_size == 104857600

    def test_study_indexes(self):
        """Should have proper database indexes for query performance."""
        from hmis.apps.imaging.models import DICOMStudy

        meta = DICOMStudy._meta
        index_fields = [tuple(idx.fields) for idx in meta.indexes]
        # Should have indexes on frequently queried fields
        assert ("study_instance_uid",) in index_fields or any(
            "study_instance_uid" in f for idx in meta.indexes for f in idx.fields
        )

    def test_study_related_name_on_patient(self, sample_dicom_study, sample_patient):
        """Should be accessible via patient.dicom_studies."""
        studies = sample_patient.dicom_studies.all()
        assert sample_dicom_study in studies

    def test_study_imaging_order_nullable(self, db, sample_patient, test_user):
        """Should allow imaging_order to be null (for externally uploaded studies)."""
        from hmis.apps.imaging.models import DICOMStudy

        uid = f"1.2.826.0.1.3680043.8.1055.1.{uuid.uuid4().int % 10**12}"
        study = DICOMStudy.objects.create(
            study_instance_uid=uid,
            patient=sample_patient,
            imaging_order=None,
            study_date=date(2026, 2, 7),
            modality="XR",
            uploaded_by=test_user,
        )
        assert study.imaging_order is None
        assert study.pk is not None

    def test_study_thumbnail_path(self, sample_dicom_study):
        """Should support thumbnail_path field."""
        sample_dicom_study.thumbnail_path = "thumbnails/study_thumb.jpg"
        sample_dicom_study.save()
        sample_dicom_study.refresh_from_db()
        assert sample_dicom_study.thumbnail_path == "thumbnails/study_thumb.jpg"

    def test_study_storage_path_format(self, sample_dicom_study):
        """Should compute the expected storage directory path."""
        expected_prefix = f"dicom/{sample_dicom_study.study_instance_uid}"
        assert sample_dicom_study.storage_path.startswith("dicom/")
        assert sample_dicom_study.study_instance_uid in sample_dicom_study.storage_path


# ============================================================================
# DICOMSeries Model Tests
# ============================================================================


class TestDICOMSeriesModel:
    """Tests for DICOMSeries model."""

    def test_create_series(self, sample_dicom_study):
        """Should create a DICOMSeries linked to a study."""
        from hmis.apps.imaging.models import DICOMSeries

        uid = f"1.2.826.0.1.3680043.8.1055.2.{uuid.uuid4().int % 10**12}"
        series = DICOMSeries.objects.create(
            study=sample_dicom_study,
            series_instance_uid=uid,
            series_number=1,
            series_description="PA Projection",
            modality="XR",
            body_part_examined="CHEST",
            number_of_instances=3,
        )

        assert series.pk is not None
        assert series.study == sample_dicom_study
        assert series.series_number == 1
        assert series.modality == "XR"

    def test_series_instance_uid_unique(self, sample_dicom_series, sample_dicom_study):
        """Should enforce unique series_instance_uid."""
        from hmis.apps.imaging.models import DICOMSeries

        with pytest.raises(IntegrityError):
            DICOMSeries.objects.create(
                study=sample_dicom_study,
                series_instance_uid=sample_dicom_series.series_instance_uid,
                series_number=2,
                modality="XR",
            )

    def test_series_str_representation(self, sample_dicom_series):
        """Should return formatted string representation."""
        result = str(sample_dicom_series)
        assert "1" in result  # series_number
        assert "PA View" in result or "XR" in result

    def test_series_cascade_delete(self, sample_dicom_study, sample_dicom_series):
        """Should cascade delete series when study is deleted."""
        from hmis.apps.imaging.models import DICOMSeries

        series_pk = sample_dicom_series.pk
        sample_dicom_study.delete()
        assert not DICOMSeries.objects.filter(pk=series_pk).exists()

    def test_series_timestamps(self, sample_dicom_series):
        """Should auto-set created_at and updated_at."""
        assert sample_dicom_series.created_at is not None
        assert sample_dicom_series.updated_at is not None

    def test_series_optional_fields(self, sample_dicom_study):
        """Should allow optional fields to be blank."""
        from hmis.apps.imaging.models import DICOMSeries

        uid = f"1.2.826.0.1.3680043.8.1055.2.{uuid.uuid4().int % 10**12}"
        series = DICOMSeries.objects.create(
            study=sample_dicom_study,
            series_instance_uid=uid,
            modality="CT",
        )
        assert series.pk is not None
        assert series.series_description == ""
        assert series.body_part_examined == ""

    def test_series_ordering(self, sample_dicom_study):
        """Should order by series_number."""
        from hmis.apps.imaging.models import DICOMSeries

        uid1 = f"1.2.826.0.1.3680043.8.1055.2.{uuid.uuid4().int % 10**12}"
        uid2 = f"1.2.826.0.1.3680043.8.1055.2.{uuid.uuid4().int % 10**12}"

        s1 = DICOMSeries.objects.create(
            study=sample_dicom_study,
            series_instance_uid=uid1,
            series_number=2,
            modality="XR",
        )
        s2 = DICOMSeries.objects.create(
            study=sample_dicom_study,
            series_instance_uid=uid2,
            series_number=1,
            modality="XR",
        )

        series = list(
            DICOMSeries.objects.filter(study=sample_dicom_study).order_by("series_number")
        )
        assert series[0] == s2
        assert series[1] == s1

    def test_series_related_name_on_study(self, sample_dicom_study, sample_dicom_series):
        """Should be accessible via study.series_set."""
        series = sample_dicom_study.series_set.all()
        assert sample_dicom_series in series

    def test_series_file_size_tracking(self, sample_dicom_study):
        """Should track total file size for the series."""
        from hmis.apps.imaging.models import DICOMSeries

        uid = f"1.2.826.0.1.3680043.8.1055.2.{uuid.uuid4().int % 10**12}"
        series = DICOMSeries.objects.create(
            study=sample_dicom_study,
            series_instance_uid=uid,
            modality="CT",
            total_file_size=52428800,  # 50 MB
        )
        assert series.total_file_size == 52428800

    def test_series_storage_path(self, sample_dicom_series):
        """Should compute storage directory path."""
        path = sample_dicom_series.storage_path
        assert sample_dicom_series.study.study_instance_uid in path
        assert sample_dicom_series.series_instance_uid in path


# ============================================================================
# DICOMInstance Model Tests
# ============================================================================


class TestDICOMInstanceModel:
    """Tests for DICOMInstance model."""

    def test_create_instance(self, sample_dicom_series):
        """Should create a DICOMInstance linked to a series."""
        from hmis.apps.imaging.models import DICOMInstance

        uid = f"1.2.826.0.1.3680043.8.1055.3.{uuid.uuid4().int % 10**12}"
        instance = DICOMInstance.objects.create(
            series=sample_dicom_series,
            sop_instance_uid=uid,
            sop_class_uid="1.2.840.10008.5.1.4.1.1.1",
            instance_number=1,
            file_path="dicom/study/series/instance.dcm",
            file_size=524288,
            transfer_syntax_uid="1.2.840.10008.1.2.1",
            rows=2048,
            columns=2048,
            bits_allocated=16,
            photometric_interpretation="MONOCHROME2",
        )

        assert instance.pk is not None
        assert instance.series == sample_dicom_series
        assert instance.instance_number == 1
        assert instance.file_size == 524288

    def test_instance_sop_uid_unique(self, sample_dicom_instance, sample_dicom_series):
        """Should enforce unique sop_instance_uid."""
        from hmis.apps.imaging.models import DICOMInstance

        with pytest.raises(IntegrityError):
            DICOMInstance.objects.create(
                series=sample_dicom_series,
                sop_instance_uid=sample_dicom_instance.sop_instance_uid,
                sop_class_uid="1.2.840.10008.5.1.4.1.1.1",
                instance_number=2,
                file_path="dicom/other.dcm",
                file_size=1024,
            )

    def test_instance_str_representation(self, sample_dicom_instance):
        """Should return formatted string representation."""
        result = str(sample_dicom_instance)
        assert "1" in result  # instance_number

    def test_instance_cascade_delete_from_series(self, sample_dicom_series, sample_dicom_instance):
        """Should cascade delete instances when series is deleted."""
        from hmis.apps.imaging.models import DICOMInstance

        instance_pk = sample_dicom_instance.pk
        sample_dicom_series.delete()
        assert not DICOMInstance.objects.filter(pk=instance_pk).exists()

    def test_instance_cascade_delete_from_study(
        self, sample_dicom_study, sample_dicom_series, sample_dicom_instance
    ):
        """Should cascade delete instances when study is deleted."""
        from hmis.apps.imaging.models import DICOMInstance

        instance_pk = sample_dicom_instance.pk
        sample_dicom_study.delete()
        assert not DICOMInstance.objects.filter(pk=instance_pk).exists()

    def test_instance_timestamps(self, sample_dicom_instance):
        """Should auto-set created_at and updated_at."""
        assert sample_dicom_instance.created_at is not None
        assert sample_dicom_instance.updated_at is not None

    def test_instance_optional_image_fields(self, sample_dicom_series):
        """Should allow image metadata fields to be null."""
        from hmis.apps.imaging.models import DICOMInstance

        uid = f"1.2.826.0.1.3680043.8.1055.3.{uuid.uuid4().int % 10**12}"
        instance = DICOMInstance.objects.create(
            series=sample_dicom_series,
            sop_instance_uid=uid,
            sop_class_uid="1.2.840.10008.5.1.4.1.1.1",
            instance_number=1,
            file_path="dicom/study/series/minimal.dcm",
            file_size=1024,
        )
        assert instance.pk is not None
        assert instance.rows is None
        assert instance.columns is None
        assert instance.bits_allocated is None
        assert instance.transfer_syntax_uid == ""

    def test_instance_ordering(self, sample_dicom_series):
        """Should order by instance_number."""
        from hmis.apps.imaging.models import DICOMInstance

        uid1 = f"1.2.826.0.1.3680043.8.1055.3.{uuid.uuid4().int % 10**12}"
        uid2 = f"1.2.826.0.1.3680043.8.1055.3.{uuid.uuid4().int % 10**12}"

        i1 = DICOMInstance.objects.create(
            series=sample_dicom_series,
            sop_instance_uid=uid1,
            sop_class_uid="1.2.840.10008.5.1.4.1.1.1",
            instance_number=2,
            file_path="dicom/inst2.dcm",
            file_size=1024,
        )
        i2 = DICOMInstance.objects.create(
            series=sample_dicom_series,
            sop_instance_uid=uid2,
            sop_class_uid="1.2.840.10008.5.1.4.1.1.1",
            instance_number=1,
            file_path="dicom/inst1.dcm",
            file_size=1024,
        )

        instances = list(DICOMInstance.objects.filter(series=sample_dicom_series))
        assert instances[0] == i2  # instance_number=1 first
        assert instances[1] == i1

    def test_instance_related_name_on_series(self, sample_dicom_series, sample_dicom_instance):
        """Should be accessible via series.instances."""
        instances = sample_dicom_series.instances.all()
        assert sample_dicom_instance in instances

    def test_instance_thumbnail_path(self, sample_dicom_instance):
        """Should support thumbnail_path field."""
        sample_dicom_instance.thumbnail_path = "thumbnails/inst_thumb.jpg"
        sample_dicom_instance.save()
        sample_dicom_instance.refresh_from_db()
        assert sample_dicom_instance.thumbnail_path == "thumbnails/inst_thumb.jpg"
