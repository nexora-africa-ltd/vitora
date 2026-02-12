"""
Tests for DICOM services: parsing, PACS storage, and thumbnail generation.

Phase C.1.5-C.1.6, C.2.3: TDD tests written BEFORE implementation.
"""

import os
import shutil
import tempfile
import uuid
from datetime import date, time
from decimal import Decimal
from unittest.mock import patch

import pydicom
import pytest  # type: ignore
from django.conf import settings
from django.test import override_settings
from pydicom.uid import generate_uid

from tests.dicom_test_utils import (
    create_minimal_dicom_file,
    create_multi_frame_dicom,
    create_test_dicom_file,
    create_test_dicom_study,
)


# ============================================================================
# Fixtures
# ============================================================================


@pytest.fixture
def temp_media_dir():
    """Create a temporary media directory for PACS storage tests."""
    tmpdir = tempfile.mkdtemp(prefix="vitora_test_media_")
    yield tmpdir
    shutil.rmtree(tmpdir, ignore_errors=True)


@pytest.fixture
def temp_dicom_file():
    """Create a temporary test DICOM file."""
    path = create_test_dicom_file(
        modality="XR",
        patient_name="Smith^Jane",
        patient_id="MRN-20260101-0001",
        study_description="Chest X-Ray PA",
        series_description="PA Projection",
        body_part_examined="CHEST",
        accession_number="A260207-0001",
        referring_physician="Dr. Kamau",
        institution_name="Demo Health Facility",
    )
    yield path
    if os.path.exists(path):
        os.unlink(path)


@pytest.fixture
def temp_ct_dicom_file():
    """Create a temporary CT DICOM file."""
    path = create_test_dicom_file(
        modality="CT",
        patient_name="Doe^John",
        study_description="CT Head",
        body_part_examined="HEAD",
        rows=512,
        columns=512,
    )
    yield path
    if os.path.exists(path):
        os.unlink(path)


@pytest.fixture
def temp_us_multiframe_file():
    """Create a multi-frame US DICOM file."""
    path = create_multi_frame_dicom(
        modality="US",
        num_frames=3,
        rows=128,
        columns=128,
        study_description="Abdominal Ultrasound",
        body_part_examined="ABDOMEN",
    )
    yield path
    if os.path.exists(path):
        os.unlink(path)


@pytest.fixture
def temp_minimal_dicom():
    """Create a minimal DICOM file."""
    path = create_minimal_dicom_file()
    yield path
    if os.path.exists(path):
        os.unlink(path)


@pytest.fixture
def temp_dicom_study_dir():
    """Create a complete test study directory."""
    study_uid, output_dir, file_paths = create_test_dicom_study(
        modality="XR",
        num_series=2,
        instances_per_series=2,
    )
    yield study_uid, output_dir, file_paths
    shutil.rmtree(output_dir, ignore_errors=True)


@pytest.fixture
def sample_imaging_procedure(db):
    """Create a sample imaging procedure."""
    from hmis.apps.imaging.models import ImagingProcedure

    return ImagingProcedure.objects.create(
        code="XR-CHEST-PA-TEST",
        name="Chest X-Ray PA",
        modality="XR",
        body_region="CHEST",
        cost=Decimal("1500.00"),
        sha_claimable=True,
        is_active=True,
    )


@pytest.fixture
def sample_imaging_order(db, sample_patient, sample_encounter, test_user, sample_imaging_procedure):
    """Create a sample imaging order."""
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


# ============================================================================
# DICOMParsingService Tests
# ============================================================================


class TestDICOMParsingService:
    """Tests for the DICOM file parsing service."""

    def test_parse_dicom_file_returns_metadata(self, temp_dicom_file):
        """Should parse a DICOM file and return structured metadata dict."""
        from hmis.apps.imaging.services.dicom import DICOMParsingService

        metadata = DICOMParsingService.parse_file(temp_dicom_file)

        assert metadata is not None
        assert "study_instance_uid" in metadata
        assert "series_instance_uid" in metadata
        assert "sop_instance_uid" in metadata
        assert metadata["modality"] == "XR"

    def test_parse_extracts_study_metadata(self, temp_dicom_file):
        """Should extract all study-level DICOM tags."""
        from hmis.apps.imaging.services.dicom import DICOMParsingService

        metadata = DICOMParsingService.parse_file(temp_dicom_file)

        assert metadata["study_description"] == "Chest X-Ray PA"
        assert metadata["accession_number"] == "A260207-0001"
        assert metadata["referring_physician_name"] == "Dr. Kamau"
        assert metadata["institution_name"] == "Demo Health Facility"
        assert metadata["study_date"] == date(2026, 2, 7)
        assert metadata["study_time"] == time(10, 30, 0)

    def test_parse_extracts_series_metadata(self, temp_dicom_file):
        """Should extract series-level DICOM tags."""
        from hmis.apps.imaging.services.dicom import DICOMParsingService

        metadata = DICOMParsingService.parse_file(temp_dicom_file)

        assert metadata["series_description"] == "PA Projection"
        assert metadata["series_number"] == 1
        assert metadata["body_part_examined"] == "CHEST"

    def test_parse_extracts_instance_metadata(self, temp_dicom_file):
        """Should extract instance-level DICOM tags including image dimensions."""
        from hmis.apps.imaging.services.dicom import DICOMParsingService

        metadata = DICOMParsingService.parse_file(temp_dicom_file)

        assert metadata["instance_number"] == 1
        assert metadata["rows"] == 256
        assert metadata["columns"] == 256
        assert metadata["bits_allocated"] == 16
        assert metadata["photometric_interpretation"] == "MONOCHROME2"

    def test_parse_extracts_sop_class_uid(self, temp_dicom_file):
        """Should extract SOP Class UID."""
        from hmis.apps.imaging.services.dicom import DICOMParsingService

        metadata = DICOMParsingService.parse_file(temp_dicom_file)

        assert metadata["sop_class_uid"] == "1.2.840.10008.5.1.4.1.1.1"

    def test_parse_extracts_transfer_syntax(self, temp_dicom_file):
        """Should extract transfer syntax UID."""
        from hmis.apps.imaging.services.dicom import DICOMParsingService

        metadata = DICOMParsingService.parse_file(temp_dicom_file)

        assert metadata["transfer_syntax_uid"] != ""

    def test_parse_ct_file(self, temp_ct_dicom_file):
        """Should correctly parse a CT DICOM file."""
        from hmis.apps.imaging.services.dicom import DICOMParsingService

        metadata = DICOMParsingService.parse_file(temp_ct_dicom_file)

        assert metadata["modality"] == "CT"
        assert metadata["rows"] == 512
        assert metadata["columns"] == 512

    def test_parse_minimal_dicom(self, temp_minimal_dicom):
        """Should handle minimal DICOM files with missing optional tags."""
        from hmis.apps.imaging.services.dicom import DICOMParsingService

        metadata = DICOMParsingService.parse_file(temp_minimal_dicom)

        assert metadata["study_instance_uid"] is not None
        assert metadata["modality"] == "OTHER"  # OT mapped to OTHER
        # Optional fields should default gracefully
        assert metadata["study_description"] == ""
        assert metadata["referring_physician_name"] == ""

    def test_parse_returns_file_size(self, temp_dicom_file):
        """Should include file size in metadata."""
        from hmis.apps.imaging.services.dicom import DICOMParsingService

        metadata = DICOMParsingService.parse_file(temp_dicom_file)

        assert "file_size" in metadata
        assert metadata["file_size"] > 0
        assert metadata["file_size"] == os.path.getsize(temp_dicom_file)

    def test_parse_invalid_file_raises_error(self, tmp_path):
        """Should raise ValueError for non-DICOM files."""
        from hmis.apps.imaging.services.dicom import DICOMParsingService

        invalid_path = str(tmp_path / "not_a_dicom.dcm")
        with open(invalid_path, "w") as f:
            f.write("This is not a DICOM file.")

        with pytest.raises(ValueError, match="[Ii]nvalid|[Cc]ould not"):
            DICOMParsingService.parse_file(invalid_path)

    def test_parse_nonexistent_file_raises_error(self):
        """Should raise FileNotFoundError for missing files."""
        from hmis.apps.imaging.services.dicom import DICOMParsingService

        with pytest.raises(FileNotFoundError):
            DICOMParsingService.parse_file("/nonexistent/path/file.dcm")

    def test_parse_patient_info(self, temp_dicom_file):
        """Should extract patient info from DICOM tags."""
        from hmis.apps.imaging.services.dicom import DICOMParsingService

        metadata = DICOMParsingService.parse_file(temp_dicom_file)

        assert metadata["patient_name"] == "Smith^Jane"
        assert metadata["patient_id"] == "MRN-20260101-0001"

    def test_parse_multiframe_file(self, temp_us_multiframe_file):
        """Should correctly parse multi-frame DICOM (e.g., ultrasound cine)."""
        from hmis.apps.imaging.services.dicom import DICOMParsingService

        metadata = DICOMParsingService.parse_file(temp_us_multiframe_file)

        assert metadata["modality"] == "US"
        assert metadata.get("number_of_frames", 1) == 3

    def test_parse_all_supported_modalities(self, tmp_path):
        """Should parse files for all supported modalities."""
        from hmis.apps.imaging.services.dicom import DICOMParsingService

        modalities = ["XR", "US", "CT", "MRI", "NM", "MG", "FL"]
        for mod in modalities:
            path = create_test_dicom_file(
                str(tmp_path / f"test_{mod}.dcm"),
                modality=mod,
            )
            metadata = DICOMParsingService.parse_file(path)
            assert metadata["modality"] == mod, f"Failed for modality {mod}"

    def test_validate_dicom_file_valid(self, temp_dicom_file):
        """Should validate a well-formed DICOM file as valid."""
        from hmis.apps.imaging.services.dicom import DICOMParsingService

        is_valid, errors = DICOMParsingService.validate_dicom_file(temp_dicom_file)
        assert is_valid is True
        assert len(errors) == 0

    def test_validate_dicom_file_invalid(self, tmp_path):
        """Should report errors for invalid DICOM files."""
        from hmis.apps.imaging.services.dicom import DICOMParsingService

        invalid_path = str(tmp_path / "invalid.dcm")
        with open(invalid_path, "wb") as f:
            f.write(b"Not a DICOM file at all")

        is_valid, errors = DICOMParsingService.validate_dicom_file(invalid_path)
        assert is_valid is False
        assert len(errors) > 0

    def test_validate_missing_required_tags(self, tmp_path):
        """Should detect missing required DICOM tags."""
        from hmis.apps.imaging.services.dicom import DICOMParsingService

        # Create DICOM with no Study Instance UID deliberately
        path = str(tmp_path / "missing_tags.dcm")
        file_meta = pydicom.dataset.FileMetaDataset()
        file_meta.MediaStorageSOPClassUID = "1.2.840.10008.5.1.4.1.1.1"
        file_meta.MediaStorageSOPInstanceUID = generate_uid()
        file_meta.TransferSyntaxUID = "1.2.840.10008.1.2.1"
        file_meta.ImplementationClassUID = generate_uid()

        ds = pydicom.dataset.FileDataset(
            path, {}, file_meta=file_meta, preamble=b"\x00" * 128
        )
        # Deliberately omit StudyInstanceUID
        ds.SOPClassUID = file_meta.MediaStorageSOPClassUID
        ds.SOPInstanceUID = file_meta.MediaStorageSOPInstanceUID
        ds.Modality = "XR"
        ds.save_as(path)

        is_valid, errors = DICOMParsingService.validate_dicom_file(path)
        assert is_valid is False

    def test_extract_pixel_data_for_thumbnail(self, temp_dicom_file):
        """Should extract pixel data as a numpy array."""
        from hmis.apps.imaging.services.dicom import DICOMParsingService

        pixel_array = DICOMParsingService.extract_pixel_data(temp_dicom_file)
        assert pixel_array is not None
        assert pixel_array.shape == (256, 256)

    def test_map_modality_code(self):
        """Should map DICOM modality codes to internal modality values."""
        from hmis.apps.imaging.services.dicom import DICOMParsingService

        assert DICOMParsingService.map_modality("CR") == "XR"
        assert DICOMParsingService.map_modality("DX") == "XR"
        assert DICOMParsingService.map_modality("CT") == "CT"
        assert DICOMParsingService.map_modality("MR") == "MRI"
        assert DICOMParsingService.map_modality("US") == "US"
        assert DICOMParsingService.map_modality("NM") == "NM"
        assert DICOMParsingService.map_modality("MG") == "MG"
        assert DICOMParsingService.map_modality("RF") == "FL"
        assert DICOMParsingService.map_modality("XA") == "FL"
        assert DICOMParsingService.map_modality("XX") == "OTHER"

    def test_group_files_by_study(self, temp_dicom_study_dir):
        """Should group multiple DICOM files by Study Instance UID."""
        from hmis.apps.imaging.services.dicom import DICOMParsingService

        study_uid, output_dir, file_paths = temp_dicom_study_dir
        groups = DICOMParsingService.group_files_by_study(file_paths)

        assert study_uid in groups
        assert len(groups[study_uid]) == 4  # 2 series × 2 instances


# ============================================================================
# PACSStorageService Tests
# ============================================================================


class TestPACSStorageService:
    """Tests for the PACS (Picture Archiving) storage service."""

    def test_store_dicom_file(self, temp_dicom_file, temp_media_dir):
        """Should store a DICOM file in the PACS directory structure."""
        from hmis.apps.imaging.services.pacs import PACSStorageService

        service = PACSStorageService(base_path=temp_media_dir)
        ds = pydicom.dcmread(temp_dicom_file)
        study_uid = str(ds.StudyInstanceUID)
        series_uid = str(ds.SeriesInstanceUID)

        stored_path = service.store_file(temp_dicom_file, study_uid, series_uid)

        assert os.path.exists(os.path.join(temp_media_dir, stored_path))
        assert study_uid in stored_path
        assert series_uid in stored_path

    def test_storage_directory_structure(self, temp_dicom_file, temp_media_dir):
        """Should organize files as dicom/{study_uid}/{series_uid}/."""
        from hmis.apps.imaging.services.pacs import PACSStorageService

        service = PACSStorageService(base_path=temp_media_dir)
        ds = pydicom.dcmread(temp_dicom_file)
        study_uid = str(ds.StudyInstanceUID)
        series_uid = str(ds.SeriesInstanceUID)

        stored_path = service.store_file(temp_dicom_file, study_uid, series_uid)

        expected_dir = os.path.join(temp_media_dir, "dicom", study_uid, series_uid)
        assert os.path.isdir(expected_dir)

    def test_stored_file_is_valid_dicom(self, temp_dicom_file, temp_media_dir):
        """Should preserve DICOM file integrity after storage."""
        from hmis.apps.imaging.services.pacs import PACSStorageService

        service = PACSStorageService(base_path=temp_media_dir)
        ds = pydicom.dcmread(temp_dicom_file)
        study_uid = str(ds.StudyInstanceUID)
        series_uid = str(ds.SeriesInstanceUID)

        stored_path = service.store_file(temp_dicom_file, study_uid, series_uid)
        full_path = os.path.join(temp_media_dir, stored_path)

        # Should be readable as DICOM
        stored_ds = pydicom.dcmread(full_path)
        assert str(stored_ds.StudyInstanceUID) == study_uid
        assert str(stored_ds.Modality) == "XR"

    def test_store_multiple_files_same_study(self, temp_media_dir):
        """Should store multiple instances under the same study."""
        from hmis.apps.imaging.services.pacs import PACSStorageService

        service = PACSStorageService(base_path=temp_media_dir)
        study_uid = generate_uid()
        series_uid = generate_uid()

        paths = []
        for i in range(3):
            dcm_path = create_test_dicom_file(
                study_instance_uid=str(study_uid),
                series_instance_uid=str(series_uid),
                instance_number=i + 1,
            )
            stored_path = service.store_file(dcm_path, str(study_uid), str(series_uid))
            paths.append(stored_path)
            os.unlink(dcm_path)

        # All stored under same directory
        study_dir = os.path.join(temp_media_dir, "dicom", str(study_uid), str(series_uid))
        assert len(os.listdir(study_dir)) == 3

    def test_delete_study(self, temp_dicom_file, temp_media_dir):
        """Should delete all files for a study."""
        from hmis.apps.imaging.services.pacs import PACSStorageService

        service = PACSStorageService(base_path=temp_media_dir)
        ds = pydicom.dcmread(temp_dicom_file)
        study_uid = str(ds.StudyInstanceUID)
        series_uid = str(ds.SeriesInstanceUID)

        service.store_file(temp_dicom_file, study_uid, series_uid)
        study_dir = os.path.join(temp_media_dir, "dicom", study_uid)
        assert os.path.isdir(study_dir)

        service.delete_study(study_uid)
        assert not os.path.exists(study_dir)

    def test_delete_nonexistent_study_no_error(self, temp_media_dir):
        """Should not raise error when deleting a non-existent study."""
        from hmis.apps.imaging.services.pacs import PACSStorageService

        service = PACSStorageService(base_path=temp_media_dir)
        # Should not raise
        service.delete_study("1.2.3.4.5.6.7.8.9.nonexistent")

    def test_delete_series(self, temp_media_dir):
        """Should delete all files for a specific series."""
        from hmis.apps.imaging.services.pacs import PACSStorageService

        service = PACSStorageService(base_path=temp_media_dir)
        study_uid = str(generate_uid())
        series_uid_1 = str(generate_uid())
        series_uid_2 = str(generate_uid())

        # Store files in two series
        for uid in [series_uid_1, series_uid_2]:
            dcm = create_test_dicom_file(
                study_instance_uid=study_uid,
                series_instance_uid=uid,
            )
            service.store_file(dcm, study_uid, uid)
            os.unlink(dcm)

        service.delete_series(study_uid, series_uid_1)
        series1_dir = os.path.join(temp_media_dir, "dicom", study_uid, series_uid_1)
        series2_dir = os.path.join(temp_media_dir, "dicom", study_uid, series_uid_2)

        assert not os.path.exists(series1_dir)
        assert os.path.exists(series2_dir)

    def test_get_study_size(self, temp_media_dir):
        """Should calculate total file size for a study."""
        from hmis.apps.imaging.services.pacs import PACSStorageService

        service = PACSStorageService(base_path=temp_media_dir)
        study_uid = str(generate_uid())
        series_uid = str(generate_uid())

        dcm1 = create_test_dicom_file(
            study_instance_uid=study_uid,
            series_instance_uid=series_uid,
            instance_number=1,
        )
        dcm2 = create_test_dicom_file(
            study_instance_uid=study_uid,
            series_instance_uid=series_uid,
            instance_number=2,
        )

        service.store_file(dcm1, study_uid, series_uid)
        service.store_file(dcm2, study_uid, series_uid)
        os.unlink(dcm1)
        os.unlink(dcm2)

        total_size = service.get_study_size(study_uid)
        assert total_size > 0

    def test_get_study_size_nonexistent(self, temp_media_dir):
        """Should return 0 for non-existent study."""
        from hmis.apps.imaging.services.pacs import PACSStorageService

        service = PACSStorageService(base_path=temp_media_dir)
        assert service.get_study_size("nonexistent_uid") == 0

    def test_list_study_files(self, temp_media_dir):
        """Should list all DICOM files in a study."""
        from hmis.apps.imaging.services.pacs import PACSStorageService

        service = PACSStorageService(base_path=temp_media_dir)
        study_uid = str(generate_uid())
        series_uid = str(generate_uid())

        for i in range(3):
            dcm = create_test_dicom_file(
                study_instance_uid=study_uid,
                series_instance_uid=series_uid,
                instance_number=i + 1,
            )
            service.store_file(dcm, study_uid, series_uid)
            os.unlink(dcm)

        files = service.list_study_files(study_uid)
        assert len(files) == 3

    def test_file_exists(self, temp_dicom_file, temp_media_dir):
        """Should check if a file exists in PACS storage."""
        from hmis.apps.imaging.services.pacs import PACSStorageService

        service = PACSStorageService(base_path=temp_media_dir)
        ds = pydicom.dcmread(temp_dicom_file)
        study_uid = str(ds.StudyInstanceUID)
        series_uid = str(ds.SeriesInstanceUID)

        stored_path = service.store_file(temp_dicom_file, study_uid, series_uid)

        assert service.file_exists(stored_path) is True
        assert service.file_exists("nonexistent/path.dcm") is False

    def test_get_absolute_path(self, temp_media_dir):
        """Should return absolute path for a relative PACS path."""
        from hmis.apps.imaging.services.pacs import PACSStorageService

        service = PACSStorageService(base_path=temp_media_dir)
        relative = "dicom/1.2.3/4.5.6/instance.dcm"
        absolute = service.get_absolute_path(relative)

        assert absolute == os.path.join(temp_media_dir, relative)

    def test_store_preserves_original_if_copy_mode(self, temp_dicom_file, temp_media_dir):
        """Should preserve original file when storing in copy mode."""
        from hmis.apps.imaging.services.pacs import PACSStorageService

        service = PACSStorageService(base_path=temp_media_dir)
        ds = pydicom.dcmread(temp_dicom_file)

        service.store_file(
            temp_dicom_file,
            str(ds.StudyInstanceUID),
            str(ds.SeriesInstanceUID),
            move=False,
        )

        # Original should still exist
        assert os.path.exists(temp_dicom_file)

    def test_store_removes_original_if_move_mode(self, temp_media_dir):
        """Should remove original file when storing in move mode."""
        from hmis.apps.imaging.services.pacs import PACSStorageService

        service = PACSStorageService(base_path=temp_media_dir)
        dcm = create_test_dicom_file()
        ds = pydicom.dcmread(dcm)

        service.store_file(
            dcm,
            str(ds.StudyInstanceUID),
            str(ds.SeriesInstanceUID),
            move=True,
        )

        assert not os.path.exists(dcm)

    def test_store_with_custom_filename(self, temp_dicom_file, temp_media_dir):
        """Should use SOP Instance UID as filename."""
        from hmis.apps.imaging.services.pacs import PACSStorageService

        service = PACSStorageService(base_path=temp_media_dir)
        ds = pydicom.dcmread(temp_dicom_file)

        stored_path = service.store_file(
            temp_dicom_file,
            str(ds.StudyInstanceUID),
            str(ds.SeriesInstanceUID),
        )

        # Filename should use the SOP Instance UID
        filename = os.path.basename(stored_path)
        assert filename.endswith(".dcm")


# ============================================================================
# ThumbnailService Tests
# ============================================================================


class TestThumbnailService:
    """Tests for DICOM thumbnail generation."""

    def test_generate_thumbnail_from_dicom(self, temp_dicom_file, temp_media_dir):
        """Should generate a JPEG thumbnail from a DICOM file."""
        from hmis.apps.imaging.services.dicom import DICOMParsingService

        thumb_path = DICOMParsingService.generate_thumbnail(
            temp_dicom_file, temp_media_dir
        )

        assert thumb_path is not None
        assert os.path.exists(os.path.join(temp_media_dir, thumb_path))
        assert thumb_path.endswith((".jpg", ".jpeg", ".png"))

    def test_thumbnail_has_reasonable_size(self, temp_dicom_file, temp_media_dir):
        """Should create thumbnail with reasonable file size (< 100KB)."""
        from hmis.apps.imaging.services.dicom import DICOMParsingService

        thumb_path = DICOMParsingService.generate_thumbnail(
            temp_dicom_file, temp_media_dir
        )
        full_path = os.path.join(temp_media_dir, thumb_path)

        file_size = os.path.getsize(full_path)
        assert file_size < 100 * 1024  # Less than 100KB
        assert file_size > 0

    def test_thumbnail_dimensions(self, temp_dicom_file, temp_media_dir):
        """Should generate thumbnail with max dimension of 256px."""
        from PIL import Image

        from hmis.apps.imaging.services.dicom import DICOMParsingService

        thumb_path = DICOMParsingService.generate_thumbnail(
            temp_dicom_file, temp_media_dir, max_size=256
        )
        full_path = os.path.join(temp_media_dir, thumb_path)

        with Image.open(full_path) as img:
            assert max(img.size) <= 256

    def test_thumbnail_for_ct_modality(self, temp_ct_dicom_file, temp_media_dir):
        """Should generate thumbnail for CT images."""
        from hmis.apps.imaging.services.dicom import DICOMParsingService

        thumb_path = DICOMParsingService.generate_thumbnail(
            temp_ct_dicom_file, temp_media_dir
        )
        assert thumb_path is not None
        assert os.path.exists(os.path.join(temp_media_dir, thumb_path))

    def test_thumbnail_returns_none_for_invalid_file(self, tmp_path, temp_media_dir):
        """Should return None for files that cannot generate thumbnails."""
        from hmis.apps.imaging.services.dicom import DICOMParsingService

        invalid = str(tmp_path / "invalid.dcm")
        with open(invalid, "wb") as f:
            f.write(b"not dicom data")

        result = DICOMParsingService.generate_thumbnail(invalid, temp_media_dir)
        assert result is None

    def test_thumbnail_stored_in_thumbnails_dir(self, temp_dicom_file, temp_media_dir):
        """Should store thumbnails under thumbnails/ subdirectory."""
        from hmis.apps.imaging.services.dicom import DICOMParsingService

        thumb_path = DICOMParsingService.generate_thumbnail(
            temp_dicom_file, temp_media_dir
        )

        assert thumb_path.startswith("thumbnails/")

    def test_thumbnail_windowed_for_ct(self, temp_ct_dicom_file, temp_media_dir):
        """Should apply windowing (window/level) for CT thumbnails."""
        from hmis.apps.imaging.services.dicom import DICOMParsingService

        thumb_path = DICOMParsingService.generate_thumbnail(
            temp_ct_dicom_file, temp_media_dir
        )
        assert thumb_path is not None

    def test_generate_thumbnail_idempotent(self, temp_dicom_file, temp_media_dir):
        """Should overwrite existing thumbnail if regenerated."""
        from hmis.apps.imaging.services.dicom import DICOMParsingService

        path1 = DICOMParsingService.generate_thumbnail(
            temp_dicom_file, temp_media_dir
        )
        path2 = DICOMParsingService.generate_thumbnail(
            temp_dicom_file, temp_media_dir
        )
        assert path1 == path2
