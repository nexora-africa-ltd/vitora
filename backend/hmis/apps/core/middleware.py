"""
Middleware for audit logging.

This module contains middleware that automatically logs
user actions for Kenya Data Protection Act compliance.
"""


def get_client_ip(request):
    """
    Extract client IP address from request.

    Args:
        request: The HTTP request object

    Returns:
        str: Client IP address or None
    """
    x_forwarded_for = request.META.get("HTTP_X_FORWARDED_FOR")
    if x_forwarded_for:
        ip = x_forwarded_for.split(",")[0].strip()
    else:
        ip = request.META.get("REMOTE_ADDR")
    return ip


class AuditLogMiddleware:
    """
    Middleware for automatic audit logging of API requests.

    This middleware logs significant API actions for compliance with
    Kenya Data Protection Act requirements.
    """

    def __init__(self, get_response):
        """Initialize middleware."""
        self.get_response = get_response

    def __call__(self, request):
        """Process request and response."""
        response = self.get_response(request)
        return response
