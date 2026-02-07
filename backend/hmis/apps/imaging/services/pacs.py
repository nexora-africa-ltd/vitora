"""
PACS (Picture Archiving and Communication System) storage service.

Manages the local filesystem-based PACS-lite storage for DICOM files.
Files are organised in the hierarchy:

    {base_path}/dicom/{study_instance_uid}/{series_instance_uid}/{sop_instance_uid}.dcm

This service handles:
- Storing DICOM files with proper directory structure
- Deleting studies/series and associated files
- Querying storage size and listing files
- Abstracting the filesystem so future migration to object storage
  (MinIO, S3) requires only swapping this service.
"""

import logging
import os
import shutil
from pathlib import Path

from django.conf import settings

logger = logging.getLogger(__name__)


class PACSStorageService:
    """
    Local filesystem-based PACS storage for DICOM files.

    Organises DICOM files under a configurable base directory
    using the DICOM UID hierarchy:

        dicom/{study_uid}/{series_uid}/{sop_uid}.dcm

    Args:
        base_path: Root directory for PACS storage. Defaults to MEDIA_ROOT.
    """

    def __init__(self, base_path: str | None = None):
        self.base_path = base_path or str(settings.MEDIA_ROOT)

    # ------------------------------------------------------------------
    # Store operations
    # ------------------------------------------------------------------

    def store_file(
        self,
        source_path: str,
        study_uid: str,
        series_uid: str,
        *,
        sop_uid: str | None = None,
        move: bool = False,
    ) -> str:
        """
        Store a DICOM file into the PACS directory structure.

        The file is copied (or moved) into:
            dicom/{study_uid}/{series_uid}/{sop_uid}.dcm

        If ``sop_uid`` is not provided, it is extracted from the file metadata.

        Args:
            source_path: Absolute path to the source DICOM file.
            study_uid: Study Instance UID.
            series_uid: Series Instance UID.
            sop_uid: SOP Instance UID (optional — extracted from file if omitted).
            move: If True, delete source file after successful storage.

        Returns:
            str: Relative path (from base_path) to the stored file.

        Raises:
            FileNotFoundError: If source_path does not exist.
            IOError: If the file cannot be stored.
        """
        if not os.path.exists(source_path):
            raise FileNotFoundError(f"Source DICOM file not found: {source_path}")

        # Determine SOP Instance UID for filename
        if sop_uid is None:
            import pydicom

            ds = pydicom.dcmread(source_path, stop_before_pixels=True)
            sop_uid = str(getattr(ds, "SOPInstanceUID", os.path.basename(source_path)))

        # Build destination path
        relative_path = os.path.join(
            "dicom", study_uid, series_uid, f"{sop_uid}.dcm"
        )
        absolute_path = os.path.join(self.base_path, relative_path)

        # Create directories
        os.makedirs(os.path.dirname(absolute_path), exist_ok=True)

        # Copy or move
        if move:
            shutil.move(source_path, absolute_path)
            logger.info("Moved DICOM file to %s", relative_path)
        else:
            shutil.copy2(source_path, absolute_path)
            logger.info("Copied DICOM file to %s", relative_path)

        return relative_path

    # ------------------------------------------------------------------
    # Delete operations
    # ------------------------------------------------------------------

    def delete_study(self, study_uid: str) -> bool:
        """
        Delete all files and directories for a study.

        Args:
            study_uid: Study Instance UID.

        Returns:
            bool: True if the directory existed and was deleted.
        """
        study_dir = os.path.join(self.base_path, "dicom", study_uid)

        if not os.path.exists(study_dir):
            logger.debug("Study directory does not exist: %s", study_dir)
            return False

        shutil.rmtree(study_dir)
        logger.info("Deleted PACS study directory: %s", study_dir)
        return True

    def delete_series(self, study_uid: str, series_uid: str) -> bool:
        """
        Delete all files for a specific series within a study.

        Args:
            study_uid: Study Instance UID.
            series_uid: Series Instance UID.

        Returns:
            bool: True if the directory existed and was deleted.
        """
        series_dir = os.path.join(self.base_path, "dicom", study_uid, series_uid)

        if not os.path.exists(series_dir):
            logger.debug("Series directory does not exist: %s", series_dir)
            return False

        shutil.rmtree(series_dir)
        logger.info("Deleted PACS series directory: %s", series_dir)
        return True

    def delete_instance(self, relative_path: str) -> bool:
        """
        Delete a single DICOM instance file.

        Args:
            relative_path: Relative path from base_path.

        Returns:
            bool: True if the file existed and was deleted.
        """
        absolute_path = os.path.join(self.base_path, relative_path)

        if not os.path.exists(absolute_path):
            return False

        os.unlink(absolute_path)
        logger.info("Deleted DICOM instance: %s", relative_path)
        return True

    # ------------------------------------------------------------------
    # Query operations
    # ------------------------------------------------------------------

    def get_study_size(self, study_uid: str) -> int:
        """
        Calculate the total file size (in bytes) for all files in a study.

        Args:
            study_uid: Study Instance UID.

        Returns:
            int: Total size in bytes. Returns 0 if study directory doesn't exist.
        """
        study_dir = os.path.join(self.base_path, "dicom", study_uid)

        if not os.path.exists(study_dir):
            return 0

        total = 0
        for dirpath, _dirnames, filenames in os.walk(study_dir):
            for filename in filenames:
                file_path = os.path.join(dirpath, filename)
                total += os.path.getsize(file_path)

        return total

    def list_study_files(self, study_uid: str) -> list[str]:
        """
        List all DICOM files in a study.

        Args:
            study_uid: Study Instance UID.

        Returns:
            list[str]: List of relative paths to DICOM files.
        """
        study_dir = os.path.join(self.base_path, "dicom", study_uid)

        if not os.path.exists(study_dir):
            return []

        files = []
        for dirpath, _dirnames, filenames in os.walk(study_dir):
            for filename in filenames:
                if filename.endswith(".dcm"):
                    abs_path = os.path.join(dirpath, filename)
                    rel_path = os.path.relpath(abs_path, self.base_path)
                    files.append(rel_path)

        return sorted(files)

    def file_exists(self, relative_path: str) -> bool:
        """
        Check if a file exists in PACS storage.

        Args:
            relative_path: Relative path from base_path.

        Returns:
            bool: True if the file exists.
        """
        return os.path.exists(os.path.join(self.base_path, relative_path))

    def get_absolute_path(self, relative_path: str) -> str:
        """
        Convert a relative PACS path to an absolute filesystem path.

        Args:
            relative_path: Relative path from base_path.

        Returns:
            str: Absolute path.
        """
        return os.path.join(self.base_path, relative_path)

    def get_storage_stats(self) -> dict:
        """
        Get overall PACS storage statistics.

        Returns:
            dict: Keys: total_studies, total_files, total_size_bytes
        """
        dicom_dir = os.path.join(self.base_path, "dicom")

        if not os.path.exists(dicom_dir):
            return {"total_studies": 0, "total_files": 0, "total_size_bytes": 0}

        total_files = 0
        total_size = 0
        study_dirs = set()

        for dirpath, _dirnames, filenames in os.walk(dicom_dir):
            for filename in filenames:
                if filename.endswith(".dcm"):
                    total_files += 1
                    total_size += os.path.getsize(os.path.join(dirpath, filename))

            # Count study-level directories (direct children of dicom/)
            rel = os.path.relpath(dirpath, dicom_dir)
            parts = rel.split(os.sep)
            if parts[0] != ".":
                study_dirs.add(parts[0])

        return {
            "total_studies": len(study_dirs),
            "total_files": total_files,
            "total_size_bytes": total_size,
        }
