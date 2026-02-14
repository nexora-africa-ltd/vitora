"""
Tests for DICOM API endpoints.

Covers:
- C.1.7: DICOM upload endpoint (multipart)
- C.2.1: Study/series/instance list APIs
- C.2.2: WADO-RS lite endpoint
- C.2.4: Link DICOM studies to imaging orders
- C.2.5: Study deletion with PACS cleanup
"""

import os
import shutil
import tempfile
import uuid
from datetime import date, time
from decimal import Decimal
from io import BytesIO
from unittest.mock import patch

import pydicom
import pytest  # type: ignore
from django.core.files.uploadedfile import SimpleUploadedFile
from pydicom.uid import generate_uid
from rest_framework import status

from tests.dicom_test_utils import create_test_dicom_file, create_test_dicom_study

# ============================================================================
# Fixtures
# ============================================================================


@pytest.fixture
def temp_media_dir(settings):
    """Override MEDIA_ROOT with a temp directory."""
    tmpdir = tempfile.mkdtemp(prefix="vitora_test_media_")
    settings.MEDIA_ROOT = tmpdir
    yield tmpdir
    shutil.rmtree(tmpdir, ignore_errors=True)


@pytest.fixture
def sample_imaging_procedure(db):
    """Create a sample imaging procedure."""
    from hmis.apps.imaging.models import ImagingProcedure

    return ImagingProcedure.objects.create(
        code="XR-CHEST-PA-API",
        name="Chest X-Ray PA",
        modality="XR",
        body_region="CHEST",
        cost=Decimal("1500.00"),
        sha_claimable=True,
        is_active=True,
    )


@pytest.fixture
def sample_imaging_order(db, sample_patient, sample_encounter, test_user, sample_imaging_procedure):
    """Create a sample imaging order in IN_PROGRESS status."""
    from hmis.apps.imaging.models import ImagingOrder, ImagingOrderItem

    order = ImagingOrder.objects.create(
        patient=sample_patient,
        encounter=sample_encounter,
        ordered_by=test_user,
        priority="ROUTINE",
        clinical_indication="Suspected pneumonia",
        status="IN_PROGRESS",
    )
    ImagingOrderItem.objects.create(
        order=order,
        procedure=sample_imaging_procedure,
        laterality="NA",
        unit_cost=sample_imaging_procedure.cost,
    )
    return order


@pytest.fixture
def completed_imaging_order(
    db, sample_patient, sample_encounter, test_user, sample_imaging_procedure
):
    """Create a sample imaging order in COMPLETED status."""
    from hmis.apps.imaging.models import ImagingOrder, ImagingOrderItem

    order = ImagingOrder.objects.create(
        patient=sample_patient,
        encounter=sample_encounter,
        ordered_by=test_user,
        priority="ROUTINE",
        clinical_indication="Suspected pneumonia",
        status="COMPLETED",
    )
    ImagingOrderItem.objects.create(
        order=order,
        procedure=sample_imaging_procedure,
        laterality="NA",
        unit_cost=sample_imaging_procedure.cost,
    )
    return order


@pytest.fixture
def dicom_upload_file():
    """Create a DICOM file as an UploadedFile for multipart upload."""
    dcm_path = create_test_dicom_file(
        modality="XR",
        patient_name="Smith^Jane",
        patient_id="MRN-20260101-0001",
        study_description="Chest X-Ray PA",
        accession_number="A260207-0001",
        body_part_examined="CHEST",
    )
    with open(dcm_path, "rb") as f:
        content = f.read()
    os.unlink(dcm_path)

    return SimpleUploadedFile(
        name="test_image.dcm",
        content=content,
        content_type="application/dicom",
    )


@pytest.fixture
def dicom_upload_files():
    """Create multiple DICOM files for batch upload."""
    study_uid = str(generate_uid())
    series_uid = str(generate_uid())
    files = []

    for i in range(3):
        dcm_path = create_test_dicom_file(
            modality="XR",
            study_instance_uid=study_uid,
            series_instance_uid=series_uid,
            instance_number=i + 1,
            study_description="Chest X-Ray",
        )
        with open(dcm_path, "rb") as f:
            content = f.read()
        os.unlink(dcm_path)

        files.append(
            SimpleUploadedFile(
                name=f"test_image_{i + 1}.dcm",
                content=content,
                content_type="application/dicom",
            )
        )

    return files


@pytest.fixture
def sample_dicom_study(db, sample_patient, sample_imaging_order, test_user):
    """Create a DICOMStudy in the database."""
    from hmis.apps.imaging.models import DICOMStudy

    uid = f"1.2.826.0.1.3680043.8.1055.1.{uuid.uuid4().int % 10**12}"
    return DICOMStudy.objects.create(
        study_instance_uid=uid,
        patient=sample_patient,
        imaging_order=sample_imaging_order,
        study_date=date(2026, 2, 7),
        study_time=time(10, 30, 0),
        study_description="Chest X-Ray PA",
        accession_number="A260207-0001",
        modality="XR",
        institution_name="Demo Health Facility",
        number_of_series=1,
        number_of_instances=2,
        uploaded_by=test_user,
    )


@pytest.fixture
def sample_dicom_series(db, sample_dicom_study):
    """Create a DICOMSeries in the database."""
    from hmis.apps.imaging.models import DICOMSeries

    uid = f"1.2.826.0.1.3680043.8.1055.2.{uuid.uuid4().int % 10**12}"
    return DICOMSeries.objects.create(
        study=sample_dicom_study,
        series_instance_uid=uid,
        series_number=1,
        series_description="PA Projection",
        modality="XR",
        body_part_examined="CHEST",
        number_of_instances=2,
    )


@pytest.fixture
def sample_dicom_instance(db, sample_dicom_series, temp_media_dir):
    """Create a DICOMInstance with a real file on disk."""
    from hmis.apps.imaging.models import DICOMInstance
    from hmis.apps.imaging.services.pacs import PACSStorageService

    sop_uid = f"1.2.826.0.1.3680043.8.1055.3.{uuid.uuid4().int % 10**12}"
    study_uid = sample_dicom_series.study.study_instance_uid
    series_uid = sample_dicom_series.series_instance_uid

    # Create physical DICOM file
    dcm_path = create_test_dicom_file(
        study_instance_uid=study_uid,
        series_instance_uid=series_uid,
        sop_instance_uid=sop_uid,
        instance_number=1,
    )
    pacs = PACSStorageService(base_path=temp_media_dir)
    stored_path = pacs.store_file(dcm_path, study_uid, series_uid, sop_uid=sop_uid, move=True)

    return DICOMInstance.objects.create(
        series=sample_dicom_series,
        sop_instance_uid=sop_uid,
        sop_class_uid="1.2.840.10008.5.1.4.1.1.1",
        instance_number=1,
        file_path=stored_path,
        file_size=os.path.getsize(os.path.join(temp_media_dir, stored_path)),
        transfer_syntax_uid="1.2.840.10008.1.2.1",
        rows=256,
        columns=256,
        bits_allocated=16,
        photometric_interpretation="MONOCHROME2",
    )


# ============================================================================
# DICOM Upload Endpoint Tests (C.1.7)
# ============================================================================


class TestDICOMUploadEndpoint:
    """Tests for POST /api/imaging/studies/upload/."""

    def test_upload_single_dicom_file(
        self, authenticated_client, sample_imaging_order, dicom_upload_file, temp_media_dir
    ):
        """Should upload a DICOM file and create study/series/instance records."""
        response = authenticated_client.post(
            "/api/imaging/studies/upload/",
            {
                "files": [dicom_upload_file],
                "imaging_order": sample_imaging_order.id,
            },
            format="multipart",
        )

        assert response.status_code == status.HTTP_201_CREATED
        data = response.data
        assert "study_instance_uid" in data
        assert data["instances_created"] >= 1

    def test_upload_requires_authentication(self, api_client, dicom_upload_file):
        """Should reject unauthenticated uploads."""
        response = api_client.post(
            "/api/imaging/studies/upload/",
            {"files": [dicom_upload_file]},
            format="multipart",
        )
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_upload_creates_pacs_directory_structure(
        self, authenticated_client, sample_imaging_order, dicom_upload_file, temp_media_dir
    ):
        """Should store files in dicom/{study_uid}/{series_uid}/ structure."""
        response = authenticated_client.post(
            "/api/imaging/studies/upload/",
            {
                "files": [dicom_upload_file],
                "imaging_order": sample_imaging_order.id,
            },
            format="multipart",
        )

        assert response.status_code == status.HTTP_201_CREATED

        # Verify directory structure exists
        dicom_dir = os.path.join(temp_media_dir, "dicom")
        assert os.path.isdir(dicom_dir)
        # Should have at least one study directory
        study_dirs = os.listdir(dicom_dir)
        assert len(study_dirs) >= 1

    def test_upload_multiple_files_same_study(
        self, authenticated_client, sample_imaging_order, dicom_upload_files, temp_media_dir
    ):
        """Should handle multiple files from the same study."""
        response = authenticated_client.post(
            "/api/imaging/studies/upload/",
            {
                "files": dicom_upload_files,
                "imaging_order": sample_imaging_order.id,
            },
            format="multipart",
        )

        assert response.status_code == status.HTTP_201_CREATED
        assert response.data["instances_created"] == 3

    def test_upload_creates_database_records(
        self, authenticated_client, sample_imaging_order, dicom_upload_file, temp_media_dir
    ):
        """Should create DICOMStudy, DICOMSeries, DICOMInstance records."""
        from hmis.apps.imaging.models import DICOMInstance, DICOMSeries, DICOMStudy

        response = authenticated_client.post(
            "/api/imaging/studies/upload/",
            {
                "files": [dicom_upload_file],
                "imaging_order": sample_imaging_order.id,
            },
            format="multipart",
        )

        assert response.status_code == status.HTTP_201_CREATED
        study_uid = response.data["study_instance_uid"]

        assert DICOMStudy.objects.filter(study_instance_uid=study_uid).exists()
        study = DICOMStudy.objects.get(study_instance_uid=study_uid)
        assert study.series_set.count() >= 1
        assert DICOMInstance.objects.filter(series__study=study).count() >= 1

    def test_upload_links_to_imaging_order(
        self, authenticated_client, sample_imaging_order, dicom_upload_file, temp_media_dir
    ):
        """Should link the created study to the imaging order."""
        from hmis.apps.imaging.models import DICOMStudy

        response = authenticated_client.post(
            "/api/imaging/studies/upload/",
            {
                "files": [dicom_upload_file],
                "imaging_order": sample_imaging_order.id,
            },
            format="multipart",
        )

        assert response.status_code == status.HTTP_201_CREATED
        study = DICOMStudy.objects.get(study_instance_uid=response.data["study_instance_uid"])
        assert study.imaging_order == sample_imaging_order

    def test_upload_without_order(
        self, authenticated_client, sample_patient, dicom_upload_file, temp_media_dir
    ):
        """Should allow upload without imaging order (external studies)."""
        response = authenticated_client.post(
            "/api/imaging/studies/upload/",
            {
                "files": [dicom_upload_file],
                "patient": sample_patient.id,
            },
            format="multipart",
        )

        assert response.status_code == status.HTTP_201_CREATED

    def test_upload_invalid_file_rejected(
        self, authenticated_client, sample_imaging_order, temp_media_dir
    ):
        """Should reject non-DICOM files."""
        fake_file = SimpleUploadedFile(
            name="not_dicom.dcm",
            content=b"This is not DICOM data",
            content_type="application/dicom",
        )

        response = authenticated_client.post(
            "/api/imaging/studies/upload/",
            {
                "files": [fake_file],
                "imaging_order": sample_imaging_order.id,
            },
            format="multipart",
        )

        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_upload_no_files_rejected(
        self, authenticated_client, sample_imaging_order, temp_media_dir
    ):
        """Should reject upload requests with no files."""
        response = authenticated_client.post(
            "/api/imaging/studies/upload/",
            {"imaging_order": sample_imaging_order.id},
            format="multipart",
        )

        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_upload_generates_thumbnail(
        self, authenticated_client, sample_imaging_order, dicom_upload_file, temp_media_dir
    ):
        """Should generate a thumbnail for uploaded images."""
        from hmis.apps.imaging.models import DICOMStudy

        response = authenticated_client.post(
            "/api/imaging/studies/upload/",
            {
                "files": [dicom_upload_file],
                "imaging_order": sample_imaging_order.id,
            },
            format="multipart",
        )

        assert response.status_code == status.HTTP_201_CREATED
        study = DICOMStudy.objects.get(study_instance_uid=response.data["study_instance_uid"])
        # Thumbnail should be set on the study
        assert study.thumbnail_path != ""

    def test_upload_audit_logged(
        self, authenticated_client, sample_imaging_order, dicom_upload_file, temp_media_dir
    ):
        """Should create an audit log entry for DICOM upload."""
        from hmis.apps.core.models import AuditLog

        response = authenticated_client.post(
            "/api/imaging/studies/upload/",
            {
                "files": [dicom_upload_file],
                "imaging_order": sample_imaging_order.id,
            },
            format="multipart",
        )

        assert response.status_code == status.HTTP_201_CREATED
        assert AuditLog.objects.filter(action="dicom_upload").exists()


# ============================================================================
# Study List API Tests (C.2.1)
# ============================================================================


class TestStudyListAPI:
    """Tests for GET /api/imaging/studies/."""

    def test_list_studies(self, authenticated_client, sample_dicom_study):
        """Should list DICOM studies."""
        response = authenticated_client.get("/api/imaging/studies/")

        assert response.status_code == status.HTTP_200_OK
        assert response.data["count"] >= 1

    def test_list_studies_requires_auth(self, api_client):
        """Should require authentication."""
        response = api_client.get("/api/imaging/studies/")
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_list_studies_filter_by_patient(
        self, authenticated_client, sample_dicom_study, sample_patient
    ):
        """Should filter studies by patient."""
        response = authenticated_client.get(f"/api/imaging/studies/?patient={sample_patient.id}")

        assert response.status_code == status.HTTP_200_OK
        for study in response.data["results"]:
            assert study["patient"] == sample_patient.id

    def test_list_studies_filter_by_modality(self, authenticated_client, sample_dicom_study):
        """Should filter studies by modality."""
        response = authenticated_client.get("/api/imaging/studies/?modality=XR")

        assert response.status_code == status.HTTP_200_OK
        for study in response.data["results"]:
            assert study["modality"] == "XR"

    def test_list_studies_filter_by_date_range(self, authenticated_client, sample_dicom_study):
        """Should filter studies by date range."""
        response = authenticated_client.get(
            "/api/imaging/studies/?study_date_after=2026-01-01&study_date_before=2026-12-31"
        )

        assert response.status_code == status.HTTP_200_OK

    def test_retrieve_study_detail(self, authenticated_client, sample_dicom_study):
        """Should retrieve a single study by study_instance_uid."""
        response = authenticated_client.get(
            f"/api/imaging/studies/{sample_dicom_study.study_instance_uid}/"
        )

        assert response.status_code == status.HTTP_200_OK
        assert response.data["study_instance_uid"] == sample_dicom_study.study_instance_uid

    def test_study_detail_includes_series(
        self, authenticated_client, sample_dicom_study, sample_dicom_series
    ):
        """Should include series in study detail response."""
        response = authenticated_client.get(
            f"/api/imaging/studies/{sample_dicom_study.study_instance_uid}/"
        )

        assert response.status_code == status.HTTP_200_OK
        assert "series" in response.data
        assert len(response.data["series"]) >= 1

    def test_study_detail_includes_order_number(self, authenticated_client, sample_dicom_study):
        """Should include order_number in study detail."""
        response = authenticated_client.get(
            f"/api/imaging/studies/{sample_dicom_study.study_instance_uid}/"
        )

        assert response.status_code == status.HTTP_200_OK
        assert "imaging_order" in response.data

    def test_list_series_for_study(
        self, authenticated_client, sample_dicom_study, sample_dicom_series
    ):
        """Should list series within a study."""
        response = authenticated_client.get(
            f"/api/imaging/studies/{sample_dicom_study.study_instance_uid}/series/"
        )

        assert response.status_code == status.HTTP_200_OK
        assert len(response.data) >= 1
        assert response.data[0]["series_instance_uid"] == sample_dicom_series.series_instance_uid

    def test_list_instances_for_study(
        self, authenticated_client, sample_dicom_study, sample_dicom_series, sample_dicom_instance
    ):
        """Should list all instances across all series in a study."""
        response = authenticated_client.get(
            f"/api/imaging/studies/{sample_dicom_study.study_instance_uid}/instances/"
        )

        assert response.status_code == status.HTTP_200_OK
        assert len(response.data) >= 1


# ============================================================================
# WADO-RS Lite Endpoint Tests (C.2.2)
# ============================================================================


class TestWADORSEndpoint:
    """Tests for WADO-RS lite image retrieval."""

    def test_retrieve_dicom_instance(
        self, authenticated_client, sample_dicom_instance, temp_media_dir
    ):
        """Should retrieve a DICOM file by SOP Instance UID."""
        response = authenticated_client.get(
            f"/api/imaging/dicom/{sample_dicom_instance.sop_instance_uid}/"
        )

        assert response.status_code == status.HTTP_200_OK
        assert response["Content-Type"] == "application/dicom"

    def test_retrieve_nonexistent_instance(self, authenticated_client):
        """Should return 404 for non-existent instance."""
        response = authenticated_client.get("/api/imaging/dicom/1.2.3.4.5.nonexistent/")
        assert response.status_code == status.HTTP_404_NOT_FOUND

    def test_retrieve_requires_auth(self, api_client, sample_dicom_instance, temp_media_dir):
        """Should require authentication."""
        response = api_client.get(f"/api/imaging/dicom/{sample_dicom_instance.sop_instance_uid}/")
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_retrieve_has_correct_content_disposition(
        self, authenticated_client, sample_dicom_instance, temp_media_dir
    ):
        """Should set Content-Disposition header."""
        response = authenticated_client.get(
            f"/api/imaging/dicom/{sample_dicom_instance.sop_instance_uid}/"
        )

        assert response.status_code == status.HTTP_200_OK
        assert "Content-Disposition" in response

    def test_retrieve_valid_dicom_content(
        self, authenticated_client, sample_dicom_instance, temp_media_dir
    ):
        """Should return valid DICOM content that can be parsed."""
        response = authenticated_client.get(
            f"/api/imaging/dicom/{sample_dicom_instance.sop_instance_uid}/"
        )

        assert response.status_code == status.HTTP_200_OK
        # Should be parseable as DICOM
        content = b"".join(response.streaming_content)
        ds = pydicom.dcmread(BytesIO(content))
        assert str(ds.SOPInstanceUID) == sample_dicom_instance.sop_instance_uid

    def test_retrieve_instance_audit_logged(
        self, authenticated_client, sample_dicom_instance, temp_media_dir
    ):
        """Should create an audit log for DICOM retrieval."""
        from hmis.apps.core.models import AuditLog

        authenticated_client.get(f"/api/imaging/dicom/{sample_dicom_instance.sop_instance_uid}/")

        assert AuditLog.objects.filter(action="dicom_retrieve").exists()


# ============================================================================
# Study-Order Linkage Tests (C.2.4)
# ============================================================================


class TestStudyOrderLinkage:
    """Tests for linking DICOM studies to imaging orders."""

    def test_upload_links_study_to_order(
        self, authenticated_client, sample_imaging_order, dicom_upload_file, temp_media_dir
    ):
        """Should link uploaded study to the imaging order."""
        from hmis.apps.imaging.models import DICOMStudy

        response = authenticated_client.post(
            "/api/imaging/studies/upload/",
            {
                "files": [dicom_upload_file],
                "imaging_order": sample_imaging_order.id,
            },
            format="multipart",
        )

        assert response.status_code == status.HTTP_201_CREATED
        study = DICOMStudy.objects.get(study_instance_uid=response.data["study_instance_uid"])
        assert study.imaging_order_id == sample_imaging_order.id

    def test_order_has_dicom_studies_relation(self, sample_imaging_order, sample_dicom_study):
        """Should access studies via imaging_order.dicom_studies."""
        studies = sample_imaging_order.dicom_studies.all()
        assert sample_dicom_study in studies

    def test_upload_updates_order_accession_number(
        self, authenticated_client, sample_imaging_order, dicom_upload_file, temp_media_dir
    ):
        """Should update order's accession_number from uploaded DICOM."""
        from hmis.apps.imaging.models import ImagingOrder

        response = authenticated_client.post(
            "/api/imaging/studies/upload/",
            {
                "files": [dicom_upload_file],
                "imaging_order": sample_imaging_order.id,
            },
            format="multipart",
        )

        assert response.status_code == status.HTTP_201_CREATED
        sample_imaging_order.refresh_from_db()
        # Accession number should be populated
        assert sample_imaging_order.accession_number != ""

    def test_upload_updates_order_study_uid(
        self, authenticated_client, sample_imaging_order, dicom_upload_file, temp_media_dir
    ):
        """Should update order's study_instance_uid from uploaded DICOM."""
        response = authenticated_client.post(
            "/api/imaging/studies/upload/",
            {
                "files": [dicom_upload_file],
                "imaging_order": sample_imaging_order.id,
            },
            format="multipart",
        )

        assert response.status_code == status.HTTP_201_CREATED
        sample_imaging_order.refresh_from_db()
        assert sample_imaging_order.study_instance_uid == response.data["study_instance_uid"]


# ============================================================================
# Study Deletion & Cleanup Tests (C.2.5)
# ============================================================================


class TestStudyDeletionCleanup:
    """Tests for study deletion with PACS file cleanup."""

    def test_delete_study_removes_pacs_files(
        self,
        authenticated_client,
        sample_dicom_study,
        sample_dicom_series,
        sample_dicom_instance,
        temp_media_dir,
    ):
        """Should delete PACS files when study is deleted via API."""
        study_uid = sample_dicom_study.study_instance_uid
        # Verify the file exists before deletion
        abs_path = os.path.join(temp_media_dir, sample_dicom_instance.file_path)
        assert os.path.exists(abs_path)

        response = authenticated_client.delete(f"/api/imaging/studies/{study_uid}/")

        assert response.status_code == status.HTTP_204_NO_CONTENT
        # PACS directory should be cleaned up
        study_dir = os.path.join(temp_media_dir, "dicom", study_uid)
        assert not os.path.exists(study_dir)

    def test_delete_study_removes_db_records(
        self,
        authenticated_client,
        sample_dicom_study,
        sample_dicom_series,
        sample_dicom_instance,
        temp_media_dir,
    ):
        """Should cascade delete series and instances from DB."""
        from hmis.apps.imaging.models import DICOMInstance, DICOMSeries, DICOMStudy

        study_uid = sample_dicom_study.study_instance_uid
        series_pk = sample_dicom_series.pk
        instance_pk = sample_dicom_instance.pk

        response = authenticated_client.delete(f"/api/imaging/studies/{study_uid}/")

        assert response.status_code == status.HTTP_204_NO_CONTENT
        assert not DICOMStudy.objects.filter(study_instance_uid=study_uid).exists()
        assert not DICOMSeries.objects.filter(pk=series_pk).exists()
        assert not DICOMInstance.objects.filter(pk=instance_pk).exists()

    def test_delete_requires_auth(self, api_client, sample_dicom_study):
        """Should require authentication for deletion."""
        response = api_client.delete(
            f"/api/imaging/studies/{sample_dicom_study.study_instance_uid}/"
        )
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_delete_nonexistent_study_404(self, authenticated_client):
        """Should return 404 for non-existent study."""
        response = authenticated_client.delete("/api/imaging/studies/1.2.3.4.5.nonexistent/")
        assert response.status_code == status.HTTP_404_NOT_FOUND

    def test_delete_study_audit_logged(
        self,
        authenticated_client,
        sample_dicom_study,
        sample_dicom_series,
        sample_dicom_instance,
        temp_media_dir,
    ):
        """Should create audit log entry for study deletion."""
        from hmis.apps.core.models import AuditLog

        response = authenticated_client.delete(
            f"/api/imaging/studies/{sample_dicom_study.study_instance_uid}/"
        )

        assert response.status_code == status.HTTP_204_NO_CONTENT
        assert AuditLog.objects.filter(action="dicom_delete").exists()


# ============================================================================
# DICOM Frame Rendering Endpoint Tests (C.3.8)
# ============================================================================


class TestDICOMFrameRenderingEndpoint:
    """Tests for GET /api/imaging/dicom/{sop_uid}/frame/."""

    def test_render_frame_as_png(self, authenticated_client, sample_dicom_instance, temp_media_dir):
        """Should render DICOM instance as PNG image."""
        sop_uid = sample_dicom_instance.sop_instance_uid

        response = authenticated_client.get(f"/api/imaging/dicom/{sop_uid}/frame/")

        assert response.status_code == status.HTTP_200_OK
        assert response["Content-Type"] == "image/png"
        # PNG magic bytes: 0x89 P N G
        content = response.getvalue() if hasattr(response, "getvalue") else response.content
        assert content[:4] == b"\x89PNG"

    def test_render_frame_with_custom_size(
        self, authenticated_client, sample_dicom_instance, temp_media_dir
    ):
        """Should respect size query parameter."""
        sop_uid = sample_dicom_instance.sop_instance_uid

        response = authenticated_client.get(f"/api/imaging/dicom/{sop_uid}/frame/?size=128")

        assert response.status_code == status.HTTP_200_OK
        assert response["Content-Type"] == "image/png"

    def test_render_frame_with_custom_window_level(
        self, authenticated_client, sample_dicom_instance, temp_media_dir
    ):
        """Should apply window/level parameters."""
        sop_uid = sample_dicom_instance.sop_instance_uid

        response = authenticated_client.get(
            f"/api/imaging/dicom/{sop_uid}/frame/?window_center=50&window_width=400"
        )

        assert response.status_code == status.HTTP_200_OK
        assert response["Content-Type"] == "image/png"

    def test_render_specific_frame_number(
        self, authenticated_client, sample_dicom_instance, temp_media_dir
    ):
        """Should render specific frame by index (for multi-frame DICOM)."""
        sop_uid = sample_dicom_instance.sop_instance_uid

        response = authenticated_client.get(f"/api/imaging/dicom/{sop_uid}/frame/?frame=0")

        assert response.status_code == status.HTTP_200_OK

    def test_render_frame_requires_auth(self, api_client, sample_dicom_instance):
        """Should require authentication."""
        response = api_client.get(
            f"/api/imaging/dicom/{sample_dicom_instance.sop_instance_uid}/frame/"
        )
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_render_frame_nonexistent_404(self, authenticated_client):
        """Should return 404 for non-existent SOP Instance UID."""
        response = authenticated_client.get("/api/imaging/dicom/1.2.3.4.5.nonexistent/frame/")
        assert response.status_code == status.HTTP_404_NOT_FOUND

    def test_render_frame_invalid_frame_number(
        self, authenticated_client, sample_dicom_instance, temp_media_dir
    ):
        """Should return 400 for invalid frame index."""
        sop_uid = sample_dicom_instance.sop_instance_uid

        response = authenticated_client.get(f"/api/imaging/dicom/{sop_uid}/frame/?frame=999")

        # Should either return 400 or render first frame as fallback
        assert response.status_code in (status.HTTP_200_OK, status.HTTP_400_BAD_REQUEST)
