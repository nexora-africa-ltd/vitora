"""Helpers for building multipart/form-data payloads for ILM uploads.

Used by preauth attachment and SHR document upload services. Streams file
contents from Django storage backends rather than buffering large blobs.
"""

from __future__ import annotations

import mimetypes
from collections.abc import Iterable
from dataclasses import dataclass
from typing import IO, Any

# Cap individual upload size: matches DHA HIE published limit (10 MB / file).
DEFAULT_MAX_BYTES = 10 * 1024 * 1024


class MultipartTooLargeError(ValueError):
    """Raised when an uploaded file exceeds the configured max size."""


@dataclass
class MultipartFile:
    field_name: str
    filename: str
    content: bytes | IO[bytes]
    content_type: str | None = None

    def as_tuple(self) -> tuple[str, tuple[str, bytes | IO[bytes], str]]:
        ctype = self.content_type or (
            mimetypes.guess_type(self.filename)[0] or "application/octet-stream"
        )
        return self.field_name, (self.filename, self.content, ctype)


def build_multipart(
    files: Iterable[MultipartFile],
    *,
    max_bytes_per_file: int = DEFAULT_MAX_BYTES,
) -> dict[str, tuple[str, bytes | IO[bytes], str]]:
    """Build a ``files=`` dict suitable for ``requests``.

    Validates each file's size so we fail fast before attempting an upload
    that the middleware will reject.
    """
    out: dict[str, tuple[str, bytes | IO[bytes], str]] = {}
    for f in files:
        size = _size_of(f.content)
        if size is not None and size > max_bytes_per_file:
            raise MultipartTooLargeError(
                f"{f.filename}: {size} bytes exceeds limit of {max_bytes_per_file}"
            )
        key, value = f.as_tuple()
        # If the same field_name appears more than once, requests expects a list.
        if key in out:
            existing = out[key]
            if isinstance(existing, list):
                existing.append(value)  # type: ignore[arg-type]
            else:
                out[key] = [existing, value]  # type: ignore[assignment]
        else:
            out[key] = value
    return out


def _size_of(content: Any) -> int | None:
    if isinstance(content, (bytes, bytearray)):
        return len(content)
    size_attr = getattr(content, "size", None)
    if isinstance(size_attr, int):
        return size_attr
    try:  # file-like with seek/tell
        cur = content.tell()
        content.seek(0, 2)
        end = content.tell()
        content.seek(cur)
        return end
    except Exception:  # pragma: no cover - best effort
        return None
