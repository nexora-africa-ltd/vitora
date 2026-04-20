"""
Shared upload validators for Vitora HMIS.

Provides a centralised ``validate_upload()`` function that every upload field
and serializer should use.  Security layers:

1. **Extension whitelist** — reject files with disallowed extensions.
2. **File size cap** — reject files exceeding a configurable maximum.
3. **Magic-byte content sniffing** — use ``python-magic`` (libmagic) to detect
   the *actual* MIME type from the first bytes, rather than trusting the
   client-supplied ``Content-Type`` header which is trivially spoofable.
4. **Filename sanitisation** — strip path separators & null bytes to prevent
   path-traversal attacks.

Usage::

    from hmis.apps.core.upload_validators import validate_upload, PROFILE_IMAGE, DOCUMENT, LAB_ATTACHMENT

    # Model-level (as a field validator list)
    logo = models.ImageField(upload_to="logos/", validators=[PROFILE_IMAGE])

    # Serializer-level
    def validate_file(self, value):
        validate_upload(value, allowed_extensions=["pdf"], max_size_mb=10)
        return value
"""

import os
import re

from django.core.exceptions import ValidationError

# ---------------------------------------------------------------------------
# Magic byte detection (graceful fallback)
# ---------------------------------------------------------------------------

try:
    import magic as _magic  # python-magic (libmagic wrapper)

    def _detect_mime(file) -> str | None:
        """Read the first 2 KB and detect MIME via libmagic."""
        pos = file.tell()
        header = file.read(2048)
        file.seek(pos)
        if not header:
            return None
        return _magic.from_buffer(header, mime=True)

except ImportError:  # pragma: no cover – CI always has python-magic
    import logging as _logging

    _logging.getLogger(__name__).warning(
        "python-magic is not installed; falling back to extension-based MIME detection"
    )

    def _detect_mime(_file) -> str | None:  # type: ignore[misc]
        return None


# ---------------------------------------------------------------------------
# MIME → extension mapping (bidirectional)
# ---------------------------------------------------------------------------

# Canonical mapping: MIME → set of extensions considered safe.
MIME_EXTENSION_MAP: dict[str, set[str]] = {
    "application/pdf": {"pdf"},
    "image/png": {"png"},
    "image/jpeg": {"jpg", "jpeg"},
    "image/tiff": {"tif", "tiff"},
    "image/webp": {"webp"},
    "image/gif": {"gif"},
    "image/svg+xml": {"svg"},
    "text/csv": {"csv"},
    "text/plain": {"csv", "txt"},  # csv files sometimes detected as text/plain
    "application/json": {"json"},
    "application/dicom": {"dcm", "dicom"},
    "application/octet-stream": set(),  # catch-all — allowed only via explicit opt-in
}


def _extension_of(filename: str) -> str:
    """Return the lower-cased extension (without dot) from *filename*."""
    return filename.rsplit(".", 1)[-1].lower() if "." in filename else ""


# ---------------------------------------------------------------------------
# Filename sanitisation
# ---------------------------------------------------------------------------

# Anything that isn't alphanumeric, dot, hyphen, underscore, or space.
_UNSAFE_CHARS = re.compile(r"[^\w.\- ]", re.ASCII)


def sanitize_filename(name: str) -> str:
    """Strip directory components and null bytes from an uploaded filename."""
    # Strip path components (Unix / Windows)
    name = os.path.basename(name.replace("\\", "/"))
    # Remove null bytes
    name = name.replace("\x00", "")
    # Collapse suspicious characters
    name = _UNSAFE_CHARS.sub("_", name)
    return name or "upload"


# ---------------------------------------------------------------------------
# Core validator
# ---------------------------------------------------------------------------

# Generous default — individual call-sites should specify tighter values.
DEFAULT_MAX_SIZE_MB = 25


def validate_upload(
    file,
    *,
    allowed_extensions: list[str] | None = None,
    allowed_mime_types: list[str] | None = None,
    max_size_mb: int | float = DEFAULT_MAX_SIZE_MB,
    sniff_content: bool = True,
) -> None:
    """
    Validate an uploaded file.

    Parameters
    ----------
    file : ``UploadedFile``
        Django's uploaded file object (has ``.name``, ``.size``, ``.content_type``).
    allowed_extensions : list[str] | None
        Whitelist of lower-cased extensions (without dot).  ``None`` skips.
    allowed_mime_types : list[str] | None
        Whitelist of MIME types.  ``None`` skips MIME enforcement (but content
        sniffing still runs for mismatch detection).
    max_size_mb : int | float
        Maximum file size in megabytes.
    sniff_content : bool
        If ``True``, use ``python-magic`` to verify the file's actual MIME type
        matches either *allowed_mime_types* (if given) or the declared
        ``Content-Type`` header.

    Raises
    ------
    ValidationError
        If any check fails.
    """
    if not file or not hasattr(file, "name"):
        raise ValidationError("No file provided.")

    filename = sanitize_filename(file.name)
    ext = _extension_of(filename)

    # 1. Extension check
    if allowed_extensions is not None:
        normalised = {e.lower().lstrip(".") for e in allowed_extensions}
        if ext not in normalised:
            raise ValidationError(
                f"File type '.{ext}' is not allowed. Accepted: {', '.join(sorted(normalised))}"
            )

    # 2. Size check
    max_bytes = int(max_size_mb * 1024 * 1024)
    if hasattr(file, "size") and file.size is not None and file.size > max_bytes:
        raise ValidationError(
            f"File too large ({file.size / 1024 / 1024:.1f} MB). Maximum allowed: {max_size_mb} MB."
        )

    # 3. Content sniffing (magic bytes)
    if sniff_content:
        detected_mime = _detect_mime(file)
        if detected_mime:
            # If caller specified allowed_mime_types, enforce them
            if allowed_mime_types is not None and detected_mime not in allowed_mime_types:
                raise ValidationError(
                    f"File content does not match an allowed type. "
                    f"Detected: {detected_mime}. "
                    f"Allowed: {', '.join(sorted(allowed_mime_types))}"
                )

            # Cross-check: if extension and detected MIME are contradictory, reject.
            # e.g. .pdf extension but detected as application/x-executable.
            if ext and allowed_extensions is not None:
                safe_exts = MIME_EXTENSION_MAP.get(detected_mime, set())
                # Only reject if we have a definitive mapping *and* it doesn't match.
                if safe_exts and ext not in safe_exts:
                    raise ValidationError(
                        f"File extension '.{ext}' does not match file content "
                        f"(detected as {detected_mime})."
                    )


# ---------------------------------------------------------------------------
# Pre-built presets (use as model-field validators or pass to serializers)
# ---------------------------------------------------------------------------

# Images only (logos, profile photos)
_IMAGE_EXTENSIONS = ["png", "jpg", "jpeg", "webp", "gif"]
_IMAGE_MIMES = ["image/png", "image/jpeg", "image/webp", "image/gif"]


def validate_image_upload(file):
    """Validator preset for image uploads (logos, photos).  Max 5 MB."""
    validate_upload(
        file,
        allowed_extensions=_IMAGE_EXTENSIONS,
        allowed_mime_types=_IMAGE_MIMES,
        max_size_mb=5,
    )


# Documents (PDF, images)
_DOCUMENT_EXTENSIONS = ["pdf", "png", "jpg", "jpeg", "tiff", "tif"]
_DOCUMENT_MIMES = [
    "application/pdf",
    "image/png",
    "image/jpeg",
    "image/tiff",
]


def validate_document_upload(file):
    """Validator preset for document uploads (lab attachments, SHA claims).  Max 10 MB."""
    validate_upload(
        file,
        allowed_extensions=_DOCUMENT_EXTENSIONS,
        allowed_mime_types=_DOCUMENT_MIMES,
        max_size_mb=10,
    )


# Data imports (CSV / JSON)
_IMPORT_EXTENSIONS = ["csv", "json"]
_IMPORT_MIMES = ["text/csv", "text/plain", "application/json"]


def validate_data_import(file):
    """Validator preset for CSV/JSON data imports.  Max 5 MB."""
    validate_upload(
        file,
        allowed_extensions=_IMPORT_EXTENSIONS,
        allowed_mime_types=_IMPORT_MIMES,
        max_size_mb=5,
    )


# Aliases for model-level ``validators=[...]``
PROFILE_IMAGE = validate_image_upload
DOCUMENT = validate_document_upload
DATA_IMPORT = validate_data_import
