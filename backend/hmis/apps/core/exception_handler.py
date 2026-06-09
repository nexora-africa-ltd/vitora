"""
Custom DRF exception handler for Vitora HMIS.

Extends the default handler to include a top-level `code` field in 403
responses when the permission class sets a `code` attribute.

This enables the frontend Axios interceptor to distinguish between
different 403 reasons (license_expired, mfa_setup_required, etc.)
using a single `response.data.code` check.
"""

from rest_framework.views import exception_handler as drf_exception_handler


def exception_handler(exc, context):
    """Custom exception handler that surfaces error codes in the response body."""
    response = drf_exception_handler(exc, context)

    if response is not None and response.status_code == 403:
        # Extract code from ErrorDetail string if present
        detail = response.data.get("detail")
        if detail and hasattr(detail, "code") and detail.code:
            response.data["code"] = detail.code

    return response
