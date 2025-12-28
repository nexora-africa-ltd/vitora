"""
Signal handlers for core app.

These signals handle automatic audit logging when certain events occur.
"""

from django.contrib.auth.signals import user_logged_in, user_logged_out, user_login_failed
from django.dispatch import receiver


@receiver(user_logged_in)
def log_user_login(sender, request, user, **kwargs):
    """Log successful user login."""
    from .models import AuditLog
    from .permissions import get_client_ip

    AuditLog.log(
        action="login_success",
        user=user,
        resource_type="User",
        resource_id=user.id,
        ip_address=get_client_ip(request) if request else None,
        user_agent=request.META.get("HTTP_USER_AGENT", "") if request else "",
        details={"username": user.username},
    )


@receiver(user_logged_out)
def log_user_logout(sender, request, user, **kwargs):
    """Log user logout."""
    from .models import AuditLog
    from .permissions import get_client_ip

    if user:
        AuditLog.log(
            action="logout",
            user=user,
            resource_type="User",
            resource_id=user.id,
            ip_address=get_client_ip(request) if request else None,
            user_agent=request.META.get("HTTP_USER_AGENT", "") if request else "",
            details={"username": user.username},
        )


@receiver(user_login_failed)
def log_user_login_failed(sender, credentials, request, **kwargs):
    """Log failed login attempt."""
    from .models import AuditLog
    from .permissions import get_client_ip

    AuditLog.log(
        action="login_failed",
        user=None,
        resource_type="User",
        ip_address=get_client_ip(request) if request else None,
        user_agent=request.META.get("HTTP_USER_AGENT", "") if request else "",
        details={"username": credentials.get("username", "unknown")},
    )
