# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
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

import io
import logging
import os
import shutil
import tempfile
from contextlib import contextmanager, suppress
from pathlib import Path

from django.conf import settings

try:
    from azure.storage.blob import BlobServiceClient, ContentSettings
except ImportError:  # pragma: no cover - optional dependency in non-blob environments
    BlobServiceClient = None
    ContentSettings = None

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
        self.media_backend = str(getattr(settings, "MEDIA_BACKEND", "local")).lower()
        self._blob_container_client = None

        if self.media_backend == "azure_blob":
            self._blob_container_client = self._init_blob_container_client()

    def _init_blob_container_client(self):
        if BlobServiceClient is None:
            raise RuntimeError(
                "azure-storage-blob is not installed. "
                "Install dependencies with poetry and redeploy."
            )

        account_name = str(getattr(settings, "AZURE_MEDIA_STORAGE_ACCOUNT_NAME", "") or "").strip()
        account_key = str(getattr(settings, "AZURE_MEDIA_STORAGE_ACCOUNT_KEY", "") or "").strip()
        connection_string = str(
            getattr(settings, "AZURE_STORAGE_CONNECTION_STRING", "") or ""
        ).strip()
        container_name = str(getattr(settings, "AZURE_MEDIA_CONTAINER", "") or "").strip()

        if not container_name:
            raise RuntimeError("AZURE_MEDIA_CONTAINER is required when MEDIA_BACKEND=azure_blob")

        if connection_string:
            service_client = BlobServiceClient.from_connection_string(connection_string)
        elif account_name and account_key:
            account_url = f"https://{account_name}.blob.core.windows.net"
            service_client = BlobServiceClient(account_url=account_url, credential=account_key)
        else:
            raise RuntimeError(
                "Azure Blob media storage is misconfigured. Set either "
                "AZURE_STORAGE_CONNECTION_STRING or AZURE_MEDIA_STORAGE_ACCOUNT_NAME and "
                "AZURE_MEDIA_STORAGE_ACCOUNT_KEY."
            )

        return service_client.get_container_client(container_name)

    def _is_blob_backend(self) -> bool:
        return self.media_backend == "azure_blob"

    @staticmethod
    def _normalize_relative_path(relative_path: str) -> str:
        return relative_path.replace("\\", "/").lstrip("/")

    def save_bytes(
        self, relative_path: str, data: bytes, *, content_type: str | None = None
    ) -> str:
        """Persist bytes at a relative PACS/media path."""
        normalized = self._normalize_relative_path(relative_path)
        if self._is_blob_backend():
            assert self._blob_container_client is not None
            blob = self._blob_container_client.get_blob_client(normalized)
            content_settings = None
            if content_type and ContentSettings is not None:
                content_settings = ContentSettings(content_type=content_type)
            blob.upload_blob(data, overwrite=True, content_settings=content_settings)
            return normalized

        absolute_path = os.path.join(self.base_path, normalized)
        os.makedirs(os.path.dirname(absolute_path), exist_ok=True)
        with open(absolute_path, "wb") as f:
            f.write(data)
        return normalized

    def read_bytes(self, relative_path: str) -> bytes:
        """Read an entire media object into memory."""
        normalized = self._normalize_relative_path(relative_path)
        if self._is_blob_backend():
            assert self._blob_container_client is not None
            blob = self._blob_container_client.get_blob_client(normalized)
            return blob.download_blob().readall()

        with open(os.path.join(self.base_path, normalized), "rb") as f:
            return f.read()

    def open_file(self, relative_path: str):
        """Return a readable binary file-like object for the stored object."""
        normalized = self._normalize_relative_path(relative_path)
        if self._is_blob_backend():
            data = self.read_bytes(normalized)
            stream = io.BytesIO(data)
            stream.name = Path(normalized).name
            return stream

        return open(os.path.join(self.base_path, normalized), "rb")

    @contextmanager
    def materialize_temp_file(self, relative_path: str, *, suffix: str = ".dcm"):
        """Yield a local file path for a stored object, downloading when needed."""
        normalized = self._normalize_relative_path(relative_path)
        if not self._is_blob_backend():
            yield os.path.join(self.base_path, normalized)
            return

        data = self.read_bytes(normalized)
        with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
            tmp.write(data)
            tmp_path = tmp.name

        try:
            yield tmp_path
        finally:
            with suppress(OSError):
                os.unlink(tmp_path)

    def url(self, relative_path: str) -> str:
        """Return a public URL for a media object when available."""
        normalized = self._normalize_relative_path(relative_path)
        if self._is_blob_backend():
            base = str(getattr(settings, "MEDIA_URL", "") or "").rstrip("/")
            return f"{base}/{normalized}"

        base = str(getattr(settings, "MEDIA_URL", "/media/") or "/media/")
        if not base.startswith("/") and not base.startswith("http"):
            base = f"/{base}"
        return f"{base.rstrip('/')}/{normalized}"

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

        relative_path = self._normalize_relative_path(
            os.path.join("dicom", study_uid, series_uid, f"{sop_uid}.dcm")
        )

        if self._is_blob_backend():
            with open(source_path, "rb") as source:
                self.save_bytes(relative_path, source.read(), content_type="application/dicom")
            if move:
                os.unlink(source_path)
            logger.info("Stored DICOM file to blob: %s", relative_path)
            return relative_path

        absolute_path = os.path.join(self.base_path, relative_path)
        os.makedirs(os.path.dirname(absolute_path), exist_ok=True)
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

        if self._is_blob_backend():
            prefix = self._normalize_relative_path(f"dicom/{study_uid}/")
            assert self._blob_container_client is not None
            blob_names = [
                b.name for b in self._blob_container_client.list_blobs(name_starts_with=prefix)
            ]
            if not blob_names:
                return False
            for name in blob_names:
                self._blob_container_client.delete_blob(name)
            logger.info("Deleted PACS study blobs: %s (%d objects)", study_uid, len(blob_names))
            return True

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

        if self._is_blob_backend():
            prefix = self._normalize_relative_path(f"dicom/{study_uid}/{series_uid}/")
            assert self._blob_container_client is not None
            blob_names = [
                b.name for b in self._blob_container_client.list_blobs(name_starts_with=prefix)
            ]
            if not blob_names:
                return False
            for name in blob_names:
                self._blob_container_client.delete_blob(name)
            logger.info(
                "Deleted PACS series blobs: %s/%s (%d objects)",
                study_uid,
                series_uid,
                len(blob_names),
            )
            return True

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
        normalized = self._normalize_relative_path(relative_path)

        if self._is_blob_backend():
            assert self._blob_container_client is not None
            blob = self._blob_container_client.get_blob_client(normalized)
            if not blob.exists():
                return False
            blob.delete_blob()
            logger.info("Deleted blob instance: %s", normalized)
            return True

        absolute_path = os.path.join(self.base_path, normalized)

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

        if self._is_blob_backend():
            prefix = self._normalize_relative_path(f"dicom/{study_uid}/")
            assert self._blob_container_client is not None
            total = 0
            for blob in self._blob_container_client.list_blobs(name_starts_with=prefix):
                total += int(getattr(blob, "size", 0) or 0)
            return total

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

        if self._is_blob_backend():
            prefix = self._normalize_relative_path(f"dicom/{study_uid}/")
            assert self._blob_container_client is not None
            return sorted(
                [
                    blob.name
                    for blob in self._blob_container_client.list_blobs(name_starts_with=prefix)
                    if blob.name.endswith(".dcm")
                ]
            )

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
        normalized = self._normalize_relative_path(relative_path)
        if self._is_blob_backend():
            assert self._blob_container_client is not None
            return self._blob_container_client.get_blob_client(normalized).exists()

        return os.path.exists(os.path.join(self.base_path, normalized))

    def get_absolute_path(self, relative_path: str) -> str:
        """
        Convert a relative PACS path to an absolute filesystem path.

        Args:
            relative_path: Relative path from base_path.

        Returns:
            str: Absolute path.
        """
        normalized = self._normalize_relative_path(relative_path)
        return os.path.join(self.base_path, normalized)

    def get_storage_stats(self) -> dict:
        """
        Get overall PACS storage statistics.

        Returns:
            dict: Keys: total_studies, total_files, total_size_bytes
        """
        dicom_dir = os.path.join(self.base_path, "dicom")

        if self._is_blob_backend():
            assert self._blob_container_client is not None
            total_files = 0
            total_size = 0
            study_dirs = set()
            for blob in self._blob_container_client.list_blobs(name_starts_with="dicom/"):
                name = blob.name
                if not name.endswith(".dcm"):
                    continue
                total_files += 1
                total_size += int(getattr(blob, "size", 0) or 0)
                parts = name.split("/")
                if len(parts) > 1:
                    study_dirs.add(parts[1])
            return {
                "total_studies": len(study_dirs),
                "total_files": total_files,
                "total_size_bytes": total_size,
            }

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
