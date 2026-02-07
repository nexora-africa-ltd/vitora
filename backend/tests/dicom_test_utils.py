"""
Test utilities for creating synthetic DICOM files.

Uses pydicom to generate valid .dcm test files with controlled metadata,
used by DICOM parsing and PACS storage service tests.
"""

import os
import tempfile
from datetime import date, time

import numpy as np
import pydicom
from pydicom.dataset import Dataset, FileDataset
from pydicom.sequence import Sequence
from pydicom.uid import ExplicitVRLittleEndian, generate_uid


def create_test_dicom_file(
    output_path: str | None = None,
    *,
    modality: str = "XR",
    patient_name: str = "Test^Patient",
    patient_id: str = "PAT001",
    study_instance_uid: str | None = None,
    series_instance_uid: str | None = None,
    sop_instance_uid: str | None = None,
    study_date: str = "20260207",
    study_time: str = "103000",
    study_description: str = "Chest X-Ray PA View",
    series_description: str = "PA Projection",
    series_number: int = 1,
    instance_number: int = 1,
    accession_number: str = "ACC-20260207-0001",
    referring_physician: str = "Dr. Kamau",
    institution_name: str = "Demo Health Facility",
    body_part_examined: str = "CHEST",
    rows: int = 256,
    columns: int = 256,
    bits_allocated: int = 16,
    photometric_interpretation: str = "MONOCHROME2",
) -> str:
    """
    Create a synthetic DICOM file for testing.

    Args:
        output_path: Path to write the .dcm file. If None, creates a temp file.
        modality: DICOM modality (XR, CT, MRI, US, etc.)
        patient_name: Patient name in DICOM format (Last^First)
        patient_id: Patient ID
        study_instance_uid: Study Instance UID (auto-generated if None)
        series_instance_uid: Series Instance UID (auto-generated if None)
        sop_instance_uid: SOP Instance UID (auto-generated if None)
        study_date: Study date in YYYYMMDD format
        study_time: Study time in HHMMSS format
        study_description: Study description
        series_description: Series description
        series_number: Series number
        instance_number: Instance number
        accession_number: Accession number
        referring_physician: Referring physician name
        institution_name: Institution name
        body_part_examined: Body part examined
        rows: Image rows (height)
        columns: Image columns (width)
        bits_allocated: Bits allocated per pixel
        photometric_interpretation: Photometric interpretation

    Returns:
        str: Path to the created DICOM file
    """
    # Generate UIDs if not provided
    study_uid = study_instance_uid or generate_uid()
    series_uid = series_instance_uid or generate_uid()
    sop_uid = sop_instance_uid or generate_uid()

    # Determine SOP Class UID based on modality
    sop_class_map = {
        "XR": "1.2.840.10008.5.1.4.1.1.1",        # CR Image Storage
        "CT": "1.2.840.10008.5.1.4.1.1.2",        # CT Image Storage
        "MRI": "1.2.840.10008.5.1.4.1.1.4",       # MR Image Storage
        "US": "1.2.840.10008.5.1.4.1.1.6.1",      # US Image Storage
        "NM": "1.2.840.10008.5.1.4.1.1.20",       # NM Image Storage
        "MG": "1.2.840.10008.5.1.4.1.1.1.2",      # Digital Mammography
        "FL": "1.2.840.10008.5.1.4.1.1.12.2",     # XA Image Storage
    }
    sop_class_uid = sop_class_map.get(modality, "1.2.840.10008.5.1.4.1.1.1")

    # Create temp file if no output path
    if output_path is None:
        fd, output_path = tempfile.mkstemp(suffix=".dcm")
        os.close(fd)

    # Ensure parent directory exists
    os.makedirs(os.path.dirname(output_path) or ".", exist_ok=True)

    # Create File Meta Information
    file_meta = pydicom.dataset.FileMetaDataset()
    file_meta.MediaStorageSOPClassUID = sop_class_uid
    file_meta.MediaStorageSOPInstanceUID = sop_uid
    file_meta.TransferSyntaxUID = ExplicitVRLittleEndian
    file_meta.ImplementationClassUID = generate_uid()

    # Create the FileDataset
    ds = FileDataset(output_path, {}, file_meta=file_meta, preamble=b"\x00" * 128)

    # Patient Module
    ds.PatientName = patient_name
    ds.PatientID = patient_id

    # General Study Module
    ds.StudyInstanceUID = study_uid
    ds.StudyDate = study_date
    ds.StudyTime = study_time
    ds.StudyDescription = study_description
    ds.AccessionNumber = accession_number
    ds.ReferringPhysicianName = referring_physician
    ds.InstitutionName = institution_name

    # General Series Module
    ds.SeriesInstanceUID = series_uid
    ds.SeriesNumber = series_number
    ds.SeriesDescription = series_description
    ds.Modality = modality
    ds.BodyPartExamined = body_part_examined

    # SOP Common Module
    ds.SOPClassUID = sop_class_uid
    ds.SOPInstanceUID = sop_uid

    # General Image Module
    ds.InstanceNumber = instance_number

    # Image Pixel Module
    ds.Rows = rows
    ds.Columns = columns
    ds.BitsAllocated = bits_allocated
    ds.BitsStored = bits_allocated
    ds.HighBit = bits_allocated - 1
    ds.SamplesPerPixel = 1
    ds.PhotometricInterpretation = photometric_interpretation
    ds.PixelRepresentation = 0

    # Generate synthetic pixel data
    if bits_allocated == 16:
        pixel_array = np.random.randint(0, 4095, (rows, columns), dtype=np.uint16)
    else:
        pixel_array = np.random.randint(0, 255, (rows, columns), dtype=np.uint8)

    ds.PixelData = pixel_array.tobytes()

    # Save the file
    ds.save_as(output_path)

    return output_path


def create_multi_frame_dicom(
    output_path: str | None = None,
    *,
    modality: str = "US",
    num_frames: int = 5,
    rows: int = 128,
    columns: int = 128,
    **kwargs,
) -> str:
    """
    Create a multi-frame DICOM file (e.g., for ultrasound cine loops).

    Args:
        output_path: Path to write the file
        modality: DICOM modality
        num_frames: Number of frames
        rows: Image rows
        columns: Image columns
        **kwargs: Additional parameters passed to create_test_dicom_file

    Returns:
        str: Path to created file
    """
    if output_path is None:
        fd, output_path = tempfile.mkstemp(suffix=".dcm")
        os.close(fd)

    path = create_test_dicom_file(
        output_path,
        modality=modality,
        rows=rows,
        columns=columns,
        **kwargs,
    )

    # Modify to make multi-frame
    ds = pydicom.dcmread(path)
    ds.NumberOfFrames = num_frames
    pixel_array = np.random.randint(
        0, 4095, (num_frames, rows, columns), dtype=np.uint16
    )
    ds.PixelData = pixel_array.tobytes()
    ds.save_as(path)

    return path


def create_test_dicom_study(
    output_dir: str | None = None,
    *,
    modality: str = "XR",
    num_series: int = 2,
    instances_per_series: int = 2,
    **kwargs,
) -> tuple[str, str, list[str]]:
    """
    Create a complete test DICOM study with multiple series and instances.

    Args:
        output_dir: Directory to write files. Created if None.
        modality: DICOM modality
        num_series: Number of series to create
        instances_per_series: Number of instances per series
        **kwargs: Additional parameters passed to create_test_dicom_file

    Returns:
        tuple: (study_instance_uid, output_dir, list of file paths)
    """
    if output_dir is None:
        output_dir = tempfile.mkdtemp(prefix="dicom_study_")

    study_uid = kwargs.pop("study_instance_uid", None) or generate_uid()
    file_paths = []

    for series_idx in range(1, num_series + 1):
        series_uid = generate_uid()
        series_dir = os.path.join(output_dir, study_uid, series_uid)
        os.makedirs(series_dir, exist_ok=True)

        for inst_idx in range(1, instances_per_series + 1):
            file_path = os.path.join(series_dir, f"instance_{inst_idx}.dcm")
            create_test_dicom_file(
                file_path,
                modality=modality,
                study_instance_uid=study_uid,
                series_instance_uid=series_uid,
                series_number=series_idx,
                instance_number=inst_idx,
                series_description=f"Series {series_idx}",
                **kwargs,
            )
            file_paths.append(file_path)

    return study_uid, output_dir, file_paths


def create_minimal_dicom_file(output_path: str | None = None) -> str:
    """
    Create a minimal DICOM file with only required attributes.

    Useful for testing edge cases and robust parsing.

    Returns:
        str: Path to created file
    """
    if output_path is None:
        fd, output_path = tempfile.mkstemp(suffix=".dcm")
        os.close(fd)

    file_meta = pydicom.dataset.FileMetaDataset()
    file_meta.MediaStorageSOPClassUID = "1.2.840.10008.5.1.4.1.1.1"
    file_meta.MediaStorageSOPInstanceUID = generate_uid()
    file_meta.TransferSyntaxUID = ExplicitVRLittleEndian
    file_meta.ImplementationClassUID = generate_uid()

    ds = FileDataset(output_path, {}, file_meta=file_meta, preamble=b"\x00" * 128)
    ds.StudyInstanceUID = generate_uid()
    ds.SeriesInstanceUID = generate_uid()
    ds.SOPInstanceUID = file_meta.MediaStorageSOPInstanceUID
    ds.SOPClassUID = file_meta.MediaStorageSOPClassUID
    ds.Modality = "OT"  # Other
    ds.StudyDate = "20260207"

    # Minimal pixel data: 2x2 image
    ds.Rows = 2
    ds.Columns = 2
    ds.BitsAllocated = 8
    ds.BitsStored = 8
    ds.HighBit = 7
    ds.SamplesPerPixel = 1
    ds.PhotometricInterpretation = "MONOCHROME2"
    ds.PixelRepresentation = 0
    ds.PixelData = b"\x00\x01\x02\x03"

    ds.save_as(output_path)
    return output_path
