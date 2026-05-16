"""
Tests for DICOM Study ZIP download endpoint.

Phase E: Authenticated download with audit logging.
"""

import io
import os
import tempfile
import zipfile

import pytest  # type: ignore
from django.conf import settings
from rest_framework import status

from hmis.apps.imaging.models import DICOMInstance, DICOMSeries, DICOMStudy
from hmis.apps.imaging.services.pacs import PACSStorageService
from tests.imaging.dicom_test_utils import create_test_dicom_file


@pytest.fixture
def study_with_files(db, sample_patient, test_user):
    """Create a DICOMStudy with actual files on disk for download tests."""
    # UIDs must be digits-and-dots only (DICOM VR UI standard)
    study_uid = "1.2.840.113619.2.5.99999.1"
    series_uid = "1.2.840.113619.2.5.99999.1.1"
    sop_uid = "1.2.840.113619.2.5.99999.1.1.1"

    study = DICOMStudy.objects.create(
        study_instance_uid=study_uid,
        patient=sample_patient,
        study_date="2026-05-10",
        modality="XR",
        study_description="Chest X-Ray for Download",
        source="UPLOAD",
        uploaded_by=test_user,
    )

    series = DICOMSeries.objects.create(
        study=study,
        series_instance_uid=series_uid,
        modality="XR",
        series_number=1,
        series_description="PA",
    )

    # Create actual DICOM file on disk
    pacs = PACSStorageService(base_path=str(settings.MEDIA_ROOT))
    dcm_path = create_test_dicom_file(
        modality="XR",
        study_instance_uid=study_uid,
        series_instance_uid=series_uid,
        sop_instance_uid=sop_uid,
    )
    stored_path = pacs.store_file(
        dcm_path,
        study_uid,
        series_uid,
        sop_uid=sop_uid,
        move=True,
    )

    DICOMInstance.objects.create(
        series=series,
        sop_instance_uid=sop_uid,
        sop_class_uid="1.2.840.10008.5.1.4.1.1.1.1",
        instance_number=1,
        file_path=stored_path,
        file_size=os.path.getsize(os.path.join(str(settings.MEDIA_ROOT), stored_path)),
    )

    yield study

    # Cleanup
    pacs.delete_study(study_uid)


class TestDICOMDownload:
    """Tests for ZIP download endpoint."""

    def test_download_returns_zip(self, authenticated_client, study_with_files, test_staff_profile):
        uid = study_with_files.study_instance_uid
        response = authenticated_client.get(f"/api/imaging/studies/{uid}/download/")
        assert response.status_code == status.HTTP_200_OK
        assert response["Content-Type"] == "application/zip"
        assert "attachment" in response["Content-Disposition"]

        # Verify it's a valid ZIP with expected structure
        with zipfile.ZipFile(io.BytesIO(response.content)) as zf:
            names = zf.namelist()
            assert len(names) == 1
            assert names[0].endswith(".dcm")

    def test_download_study_no_files_returns_404(
        self, authenticated_client, sample_patient, test_user, test_staff_profile
    ):
        """Empty study (no instances) should return 404."""
        study = DICOMStudy.objects.create(
            study_instance_uid="1.2.840.113619.2.5.99999.2",
            patient=sample_patient,
            study_date="2026-05-10",
            modality="XR",
            source="UPLOAD",
            uploaded_by=test_user,
        )
        response = authenticated_client.get(
            f"/api/imaging/studies/{study.study_instance_uid}/download/"
        )
        assert response.status_code == status.HTTP_404_NOT_FOUND

    def test_download_unauthenticated(self, api_client, study_with_files):
        uid = study_with_files.study_instance_uid
        response = api_client.get(f"/api/imaging/studies/{uid}/download/")
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_download_creates_audit_log(
        self, authenticated_client, study_with_files, test_staff_profile
    ):
        from hmis.apps.core.models import AuditLog

        uid = study_with_files.study_instance_uid
        authenticated_client.get(f"/api/imaging/studies/{uid}/download/")

        log = AuditLog.objects.filter(
            action="dicom_download",
            resource_type="DICOMStudy",
        ).first()
        assert log is not None
