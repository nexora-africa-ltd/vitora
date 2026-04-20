"""
Validators for laboratory module.

Includes validation for lab result attachments to ensure
only safe file types and sizes are uploaded.

Uses the shared ``validate_upload()`` utility from core for magic-byte
content sniffing instead of trusting the client-supplied Content-Type.
"""

from hmis.apps.core.upload_validators import validate_upload

# Allowed file extensions for lab result attachments
ALLOWED_EXTENSIONS = ["pdf", "png", "jpg", "jpeg", "tiff", "tif"]

# Allowed MIME types (verified via python-magic)
ALLOWED_MIME_TYPES = [
    "application/pdf",
    "image/png",
    "image/jpeg",
    "image/tiff",
]

# Maximum file size: 10MB
MAX_FILE_SIZE_MB = 10


def validate_lab_attachment(file):
    """
    Validate lab result attachment file.

    Checks:
    - File extension is in allowed list
    - File size is under maximum limit
    - Magic-byte content type matches whitelist

    Args:
        file: UploadedFile instance

    Raises:
        ValidationError: If file fails validation
    """
    validate_upload(
        file,
        allowed_extensions=ALLOWED_EXTENSIONS,
        allowed_mime_types=ALLOWED_MIME_TYPES,
        max_size_mb=MAX_FILE_SIZE_MB,
    )
