"""
DICOM file parsing service.

Provides methods to parse DICOM files using pydicom, extract metadata,
validate files, generate thumbnails, and group files by study.

This is a stateless service class using class methods — no instantiation needed.
"""

import logging
import os
from collections import defaultdict
from datetime import date, time

import numpy as np
import pydicom
from PIL import Image

logger = logging.getLogger(__name__)

# Mapping from DICOM modality codes to Vitora internal modality codes.
# DICOM uses some codes that differ from the imaging module's choices.
DICOM_MODALITY_MAP: dict[str, str] = {
    # X-Ray variants → XR
    "CR": "XR",  # Computed Radiography
    "DX": "XR",  # Digital Radiography
    "XR": "XR",  # General X-Ray (non-standard but used)
    # CT
    "CT": "CT",
    # MRI variants → MRI
    "MR": "MRI",
    "MRI": "MRI",  # Non-standard but sometimes used
    # Ultrasound
    "US": "US",
    # Nuclear Medicine
    "NM": "NM",
    "PT": "NM",  # PET → Nuclear Medicine
    # Mammography
    "MG": "MG",
    # Fluoroscopy variants → FL
    "RF": "FL",  # Radio-Fluoroscopy
    "XA": "FL",  # X-Ray Angiography
    "FL": "FL",
}

# Required DICOM tags for a valid imaging file
REQUIRED_TAGS = [
    "StudyInstanceUID",
    "SeriesInstanceUID",
    "SOPInstanceUID",
    "Modality",
]


class DICOMParsingService:
    """
    Service for parsing DICOM files and extracting metadata.

    All methods are classmethods — no instantiation required.
    """

    @classmethod
    def parse_file(cls, file_path: str) -> dict:
        """
        Parse a DICOM file and extract all relevant metadata.

        Args:
            file_path: Absolute or relative path to a .dcm file.

        Returns:
            dict: Structured metadata dictionary containing study, series,
                  and instance level DICOM tag values.

        Raises:
            FileNotFoundError: If file_path does not exist.
            ValueError: If the file is not a valid DICOM file.
        """
        if not os.path.exists(file_path):
            raise FileNotFoundError(f"DICOM file not found: {file_path}")

        try:
            ds = pydicom.dcmread(file_path, force=True)
        except pydicom.errors.InvalidDicomError as exc:
            raise ValueError(f"Invalid DICOM file: {file_path}") from exc
        except Exception as exc:
            raise ValueError(f"Could not parse DICOM file: {file_path} — {exc}") from exc

        # Verify critical tags exist (force=True may "succeed" on non-DICOM data)
        if not getattr(ds, "SOPInstanceUID", None):
            raise ValueError(f"Invalid DICOM file: {file_path} — missing SOPInstanceUID")

        file_size = os.path.getsize(file_path)

        # Extract transfer syntax from file meta if available
        transfer_syntax_uid = ""
        if hasattr(ds, "file_meta") and hasattr(ds.file_meta, "TransferSyntaxUID"):
            transfer_syntax_uid = str(ds.file_meta.TransferSyntaxUID)

        # Map DICOM modality to internal modality code
        raw_modality = cls._get_tag_value(ds, "Modality", "OT")
        modality = cls.map_modality(raw_modality)

        metadata = {
            # Study-level tags
            "study_instance_uid": str(cls._get_tag_value(ds, "StudyInstanceUID", "")),
            "study_date": cls._parse_date(cls._get_tag_value(ds, "StudyDate", "")),
            "study_time": cls._parse_time(cls._get_tag_value(ds, "StudyTime", "")),
            "study_description": str(cls._get_tag_value(ds, "StudyDescription", "")),
            "accession_number": str(cls._get_tag_value(ds, "AccessionNumber", "")),
            "referring_physician_name": str(cls._get_tag_value(ds, "ReferringPhysicianName", "")),
            "institution_name": str(cls._get_tag_value(ds, "InstitutionName", "")),
            # Equipment-level tags
            "station_name": str(cls._get_tag_value(ds, "StationName", "")),
            "manufacturer": str(cls._get_tag_value(ds, "Manufacturer", "")),
            "manufacturer_model_name": str(cls._get_tag_value(ds, "ManufacturerModelName", "")),
            "device_serial_number": str(cls._get_tag_value(ds, "DeviceSerialNumber", "")),
            "software_versions": str(cls._get_tag_value(ds, "SoftwareVersions", "")),
            # Series-level tags
            "series_instance_uid": str(cls._get_tag_value(ds, "SeriesInstanceUID", "")),
            "series_number": cls._get_int_tag(ds, "SeriesNumber"),
            "series_description": str(cls._get_tag_value(ds, "SeriesDescription", "")),
            "modality": modality,
            "raw_modality": raw_modality,
            "body_part_examined": str(cls._get_tag_value(ds, "BodyPartExamined", "")),
            # Instance-level tags
            "sop_instance_uid": str(cls._get_tag_value(ds, "SOPInstanceUID", "")),
            "sop_class_uid": str(cls._get_tag_value(ds, "SOPClassUID", "")),
            "instance_number": cls._get_int_tag(ds, "InstanceNumber"),
            "transfer_syntax_uid": transfer_syntax_uid,
            # Image pixel tags
            "rows": cls._get_int_tag(ds, "Rows"),
            "columns": cls._get_int_tag(ds, "Columns"),
            "bits_allocated": cls._get_int_tag(ds, "BitsAllocated"),
            "photometric_interpretation": str(
                cls._get_tag_value(ds, "PhotometricInterpretation", "")
            ),
            "number_of_frames": cls._get_int_tag(ds, "NumberOfFrames", default=1),
            # Patient tags (for matching/verification)
            "patient_name": str(cls._get_tag_value(ds, "PatientName", "")),
            "patient_id": str(cls._get_tag_value(ds, "PatientID", "")),
            # File info
            "file_size": file_size,
        }

        return metadata

    @classmethod
    def validate_dicom_file(cls, file_path: str) -> tuple[bool, list[str]]:
        """
        Validate that a file is a well-formed DICOM file with required tags.

        Args:
            file_path: Path to the DICOM file.

        Returns:
            tuple[bool, list[str]]: (is_valid, list of error messages)
        """
        errors: list[str] = []

        if not os.path.exists(file_path):
            return False, ["File does not exist"]

        # Try to read the file as DICOM
        try:
            ds = pydicom.dcmread(file_path, force=True)
        except pydicom.errors.InvalidDicomError:
            return False, ["File is not a valid DICOM file"]
        except Exception as exc:
            return False, [f"Could not read file: {exc}"]

        # Check required tags
        for tag_name in REQUIRED_TAGS:
            if not hasattr(ds, tag_name) or not getattr(ds, tag_name, None):
                errors.append(f"Missing required DICOM tag: {tag_name}")

        is_valid = len(errors) == 0
        return is_valid, errors

    @classmethod
    def extract_pixel_data(cls, file_path: str) -> np.ndarray | None:
        """
        Extract pixel data from a DICOM file as a numpy array.

        Handles windowing for CT images and normalises multi-frame data
        to return only the first frame.

        Args:
            file_path: Path to the DICOM file.

        Returns:
            numpy.ndarray or None: 2D pixel array, or None if no pixel data.
        """
        try:
            ds = pydicom.dcmread(file_path)
            if not hasattr(ds, "PixelData"):
                return None

            pixel_array = ds.pixel_array

            # Handle multi-frame — return first frame
            if pixel_array.ndim == 3 and hasattr(ds, "NumberOfFrames"):
                pixel_array = pixel_array[0]

            return pixel_array

        except Exception:
            logger.exception("Failed to extract pixel data from %s", file_path)
            return None

    @classmethod
    def generate_thumbnail(
        cls,
        dicom_file_path: str,
        output_base_dir: str,
        max_size: int = 256,
    ) -> str | None:
        """
        Generate a JPEG thumbnail from a DICOM image file.

        Applies basic windowing for CT and normalises pixel values to 0-255
        for display.

        Args:
            dicom_file_path: Path to the source DICOM file.
            output_base_dir: Base directory for storing thumbnails.
            max_size: Maximum dimension (width or height) of the thumbnail.

        Returns:
            str or None: Relative path to the generated thumbnail,
                         or None if generation failed.
        """
        try:
            ds = pydicom.dcmread(dicom_file_path)
            if not hasattr(ds, "PixelData"):
                logger.warning("No pixel data in %s, cannot generate thumbnail", dicom_file_path)
                return None

            pixel_array = ds.pixel_array.astype(float)

            # Handle multi-frame — use first frame for thumbnail
            if pixel_array.ndim == 3:
                if hasattr(ds, "NumberOfFrames") and int(ds.NumberOfFrames) > 1:
                    pixel_array = pixel_array[0]
                elif pixel_array.shape[2] in (3, 4):
                    # RGB image — keep as is
                    pass
                else:
                    pixel_array = pixel_array[0]

            # Apply CT windowing if applicable
            modality = str(getattr(ds, "Modality", ""))
            if modality == "CT":
                pixel_array = cls._apply_ct_windowing(ds, pixel_array)

            # Normalise to 0-255
            if pixel_array.ndim == 2:
                p_min = pixel_array.min()
                p_max = pixel_array.max()
                if p_max > p_min:
                    pixel_array = ((pixel_array - p_min) / (p_max - p_min) * 255).astype(np.uint8)
                else:
                    pixel_array = np.zeros_like(pixel_array, dtype=np.uint8)

            img = Image.fromarray(pixel_array)
            if img.mode not in ("L", "RGB"):
                img = img.convert("L")

            # Resize maintaining aspect ratio
            img.thumbnail((max_size, max_size), Image.Resampling.LANCZOS)

            # Build output path
            sop_uid = str(getattr(ds, "SOPInstanceUID", "unknown"))
            thumb_filename = f"{sop_uid}.jpg"
            thumb_relative = os.path.join("thumbnails", thumb_filename)
            thumb_absolute = os.path.join(output_base_dir, thumb_relative)

            os.makedirs(os.path.dirname(thumb_absolute), exist_ok=True)
            img.save(thumb_absolute, "JPEG", quality=80)

            return thumb_relative

        except Exception:
            logger.exception("Failed to generate thumbnail for %s", dicom_file_path)
            return None

    @classmethod
    def map_modality(cls, dicom_modality: str) -> str:
        """
        Map a DICOM modality code to the internal Vitora modality code.

        Args:
            dicom_modality: DICOM modality code (e.g., 'CR', 'MR', 'CT')

        Returns:
            str: Internal modality code (e.g., 'XR', 'MRI', 'CT', 'OTHER')
        """
        return DICOM_MODALITY_MAP.get(dicom_modality, "OTHER")

    @classmethod
    def group_files_by_study(cls, file_paths: list[str]) -> dict[str, list[dict]]:
        """
        Group a list of DICOM file paths by their Study Instance UID.

        Args:
            file_paths: List of paths to DICOM files.

        Returns:
            dict: Mapping from Study Instance UID to list of parsed metadata dicts.
        """
        groups: dict[str, list[dict]] = defaultdict(list)

        for file_path in file_paths:
            try:
                metadata = cls.parse_file(file_path)
                study_uid = metadata["study_instance_uid"]
                metadata["_file_path"] = file_path
                groups[study_uid].append(metadata)
            except (ValueError, FileNotFoundError):
                logger.warning("Skipping invalid file: %s", file_path)
                continue

        return dict(groups)

    # ------------------------------------------------------------------
    # Private helpers
    # ------------------------------------------------------------------

    @staticmethod
    def _get_tag_value(ds, tag_name: str, default=""):
        """Safely get a DICOM tag value with a default."""
        value = getattr(ds, tag_name, None)
        if value is None:
            return default
        return value

    @staticmethod
    def _get_int_tag(ds, tag_name: str, default: int | None = None) -> int | None:
        """Safely get an integer DICOM tag value."""
        value = getattr(ds, tag_name, None)
        if value is None:
            return default
        try:
            return int(value)
        except (TypeError, ValueError):
            return default

    @staticmethod
    def _parse_date(date_str: str) -> date | None:
        """Parse a DICOM date string (YYYYMMDD) to a Python date."""
        if not date_str:
            return None
        try:
            return date(int(date_str[:4]), int(date_str[4:6]), int(date_str[6:8]))
        except (ValueError, IndexError):
            return None

    @staticmethod
    def _parse_time(time_str: str) -> time | None:
        """Parse a DICOM time string (HHMMSS or HHMMSS.ffffff) to a Python time."""
        if not time_str:
            return None
        try:
            # DICOM time can be HHMMSS or HHMMSS.ffffff
            clean = time_str.split(".")[0]  # Drop fractional seconds
            if len(clean) >= 6:
                return time(int(clean[:2]), int(clean[2:4]), int(clean[4:6]))
            elif len(clean) >= 4:
                return time(int(clean[:2]), int(clean[2:4]))
            elif len(clean) >= 2:
                return time(int(clean[:2]))
            return None
        except (ValueError, IndexError):
            return None

    @staticmethod
    def _apply_ct_windowing(ds, pixel_array: np.ndarray) -> np.ndarray:
        """
        Apply CT windowing (window center/width) to pixel data.

        Uses standard soft tissue window (C=40, W=400) if DICOM tags
        are not present.

        Args:
            ds: pydicom Dataset
            pixel_array: Raw pixel array

        Returns:
            numpy.ndarray: Windowed pixel array
        """
        # Get window center and width, with soft tissue defaults
        window_center = float(getattr(ds, "WindowCenter", 40))
        window_width = float(getattr(ds, "WindowWidth", 400))

        # Handle multi-valued
        if isinstance(window_center, pydicom.multival.MultiValue):
            window_center = float(window_center[0])
        if isinstance(window_width, pydicom.multival.MultiValue):
            window_width = float(window_width[0])

        # Apply rescale slope/intercept if present
        slope = float(getattr(ds, "RescaleSlope", 1))
        intercept = float(getattr(ds, "RescaleIntercept", 0))
        pixel_array = pixel_array * slope + intercept

        # Apply window
        lower = window_center - window_width / 2
        upper = window_center + window_width / 2
        pixel_array = np.clip(pixel_array, lower, upper)

        return pixel_array
