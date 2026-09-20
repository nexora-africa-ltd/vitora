# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""Tests for blob-compatible PACS storage behavior.

What this file is for:
- Validate PACSStorageService behavior when MEDIA_BACKEND=azure_blob.

How to run it:
- `cd backend && poetry run pytest tests/imaging/test_pacs_storage_service.py -q`

Supported inputs/args:
- Uses pytest fixtures only; no standalone CLI args beyond pytest defaults.
"""

from __future__ import annotations

import os
import tempfile
from types import SimpleNamespace

import pytest

from hmis.apps.imaging.services.pacs import PACSStorageService


class _FakeDownload:
    def __init__(self, data: bytes):
        self._data = data

    def readall(self) -> bytes:
        return self._data

    def chunks(self, chunk_size: int):
        return (
            self._data[offset : offset + chunk_size]
            for offset in range(0, len(self._data), chunk_size)
        )


class _FakeBlobClient:
    def __init__(self, store: dict[str, bytes], name: str):
        self._store = store
        self._name = name
        self.container_name = "vitora-media"
        self.blob_name = name
        self.url = f"https://example.blob.core.windows.net/{self.container_name}/{name}"

    def upload_blob(self, data, overwrite=False, content_settings=None):  # noqa: ARG002
        self._store[self._name] = data if isinstance(data, bytes) else data.read()

    def download_blob(self):
        return _FakeDownload(self._store[self._name])

    def exists(self) -> bool:
        return self._name in self._store

    def delete_blob(self):
        self._store.pop(self._name, None)


class _FakeContainerClient:
    def __init__(self):
        self._store: dict[str, bytes] = {}
        self._blobs: dict[str, _FakeBlobClient] = {}

    def get_blob_client(self, name: str) -> _FakeBlobClient:
        return self._blobs.setdefault(name, _FakeBlobClient(self._store, name))

    def list_blobs(self, name_starts_with: str = ""):
        return [
            SimpleNamespace(name=name, size=len(data))
            for name, data in self._store.items()
            if name.startswith(name_starts_with)
        ]

    def delete_blob(self, name: str):
        self._store.pop(name, None)


@pytest.fixture
def fake_blob_container(mocker) -> _FakeContainerClient:
    container = _FakeContainerClient()
    mocker.patch(
        "hmis.apps.imaging.services.pacs.PACSStorageService._init_blob_container_client",
        return_value=container,
    )
    return container


def test_store_file_uses_blob_storage_and_move(settings, fake_blob_container):
    settings.MEDIA_BACKEND = "azure_blob"

    with tempfile.NamedTemporaryFile(suffix=".dcm", delete=False) as tmp:
        tmp.write(b"dicom-content")
        tmp_path = tmp.name

    service = PACSStorageService(base_path="/tmp/unused")
    stored = service.store_file(
        tmp_path,
        study_uid="1.2.3",
        series_uid="4.5.6",
        sop_uid="7.8.9",
        move=True,
    )

    assert stored == "dicom/1.2.3/4.5.6/7.8.9.dcm"
    assert not os.path.exists(tmp_path)
    assert fake_blob_container._store[stored] == b"dicom-content"


def test_materialize_temp_file_downloads_blob_to_temp(settings, fake_blob_container):
    settings.MEDIA_BACKEND = "azure_blob"

    service = PACSStorageService(base_path="/tmp/unused")
    service.save_bytes("dicom/x/y/z.dcm", b"blob-data", content_type="application/dicom")

    with service.materialize_temp_file("dicom/x/y/z.dcm", suffix=".dcm") as local_path:
        assert os.path.exists(local_path)
        with open(local_path, "rb") as handle:
            assert handle.read() == b"blob-data"

    assert not os.path.exists(local_path)


def test_stream_chunks_yields_blob_data_without_reading_all(settings, fake_blob_container, mocker):
    """Blob retrieval should be streamed to avoid buffering large DICOM files in Django."""
    settings.MEDIA_BACKEND = "azure_blob"
    service = PACSStorageService(base_path="/tmp/unused")
    service.save_bytes("dicom/x/y/z.dcm", b"0123456789")
    blob = fake_blob_container.get_blob_client("dicom/x/y/z.dcm")
    mocker.patch.object(blob, "download_blob", wraps=blob.download_blob)

    assert list(service.stream_chunks("dicom/x/y/z.dcm", chunk_size=4)) == [b"0123", b"4567", b"89"]
    blob.download_blob.assert_called_once_with()


def test_stream_chunks_yields_local_file_in_chunks(tmp_path):
    """Local PACS storage should retain chunked retrieval behavior."""
    path = tmp_path / "dicom" / "x" / "y" / "z.dcm"
    path.parent.mkdir(parents=True)
    path.write_bytes(b"0123456789")

    service = PACSStorageService(base_path=str(tmp_path))

    assert list(service.stream_chunks("dicom/x/y/z.dcm", chunk_size=4)) == [b"0123", b"4567", b"89"]


def test_temporary_read_url_creates_read_only_expiring_sas(settings, fake_blob_container, mocker):
    """Private Azure media should be exposed only through bounded read SAS URLs."""
    settings.MEDIA_BACKEND = "azure_blob"
    settings.AZURE_MEDIA_STORAGE_ACCOUNT_NAME = "mediaaccount"
    settings.AZURE_MEDIA_STORAGE_ACCOUNT_KEY = "test-key"
    mock_generate = mocker.patch(
        "hmis.apps.imaging.services.pacs.generate_blob_sas", return_value="sv=token"
    )
    service = PACSStorageService(base_path="/tmp/unused")

    url = service.temporary_read_url("thumbnails/image.jpg", expires_in_minutes=10)

    assert url == "https://example.blob.core.windows.net/vitora-media/thumbnails/image.jpg?sv=token"
    assert mock_generate.call_args.kwargs["account_name"] == "mediaaccount"
    assert mock_generate.call_args.kwargs["blob_name"] == "thumbnails/image.jpg"
    assert mock_generate.call_args.kwargs["permission"].read is True


def test_delete_study_removes_only_prefixed_blobs(settings, fake_blob_container):
    settings.MEDIA_BACKEND = "azure_blob"

    service = PACSStorageService(base_path="/tmp/unused")
    service.save_bytes("dicom/study-a/s1/i1.dcm", b"a")
    service.save_bytes("dicom/study-a/s1/i2.dcm", b"b")
    service.save_bytes("dicom/study-b/s1/i1.dcm", b"c")

    deleted = service.delete_study("study-a")

    assert deleted is True
    assert "dicom/study-b/s1/i1.dcm" in fake_blob_container._store
    assert "dicom/study-a/s1/i1.dcm" not in fake_blob_container._store
    assert "dicom/study-a/s1/i2.dcm" not in fake_blob_container._store
