"""
Validators for laboratory module.

Includes validation for lab result attachments to ensure
only safe file types and sizes are uploaded.
"""

from django.core.exceptions import ValidationError

# Allowed file extensions for lab result attachments
ALLOWED_EXTENSIONS = ['pdf', 'png', 'jpg', 'jpeg', 'tiff', 'tif']

# Maximum file size: 10MB
MAX_FILE_SIZE = 10 * 1024 * 1024


def validate_lab_attachment(file):
    """
    Validate lab result attachment file.

    Checks:
    - File extension is in allowed list
    - File size is under maximum limit
    - Content type is acceptable

    Args:
        file: UploadedFile instance

    Raises:
        ValidationError: If file fails validation
    """
    # Check extension
    ext = file.name.split('.')[-1].lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise ValidationError(
            f"File type not allowed. Allowed: {', '.join(ALLOWED_EXTENSIONS)}"
        )

    # Check size
    if file.size > MAX_FILE_SIZE:
        raise ValidationError(
            f"File too large. Maximum size: {MAX_FILE_SIZE / 1024 / 1024}MB"
        )

    # Check for malicious content (basic content type check)
    allowed_content_types = [
        'application/pdf',
        'image/png',
        'image/jpeg',
        'image/tiff'
    ]

    if hasattr(file, 'content_type') and file.content_type not in allowed_content_types:
        raise ValidationError("Invalid file content type")
