"""
Custom permissions for Vitora HMIS.

This module contains custom permission classes for:
- Sensitive patient data access control
- Role-based access control
- Audit logging integration
"""

from rest_framework import permissions

from .models import AuditLog


def get_client_ip(request):
    """
    Extract client IP address from request.

    Handles both direct connections and proxy headers.

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


class IsAuthenticatedOrReadOnly(permissions.BasePermission):
    """
    Custom permission to allow read-only access to unauthenticated users.

    Note: This should be replaced with IsAuthenticated for production.
    """

    def has_permission(self, request, view):
        """Check if user has permission."""
        if request.method in permissions.SAFE_METHODS:
            return True
        return request.user and request.user.is_authenticated


class SensitiveAccessPermission(permissions.BasePermission):
    """
    Permission class for controlling access to sensitive patient records.

    Sensitive records include HIV, GBV, and Mental Health cases as per
    Kenya Data Protection Act requirements.

    Users must have the 'view_sensitive_patient' permission to access
    these records. All access attempts (successful and denied) are logged.
    """

    message = "You do not have permission to access sensitive patient records."

    def has_permission(self, request, view):
        """Check if user is authenticated."""
        return request.user and request.user.is_authenticated

    def has_object_permission(self, request, view, obj):
        """
        Check if user can access this specific patient record.

        Args:
            request: The HTTP request
            view: The view being accessed
            obj: The patient object

        Returns:
            bool: True if access is granted, False otherwise
        """
        # Check if this is a sensitive patient
        is_sensitive = getattr(obj, "is_sensitive", False)

        if not is_sensitive:
            # Not a sensitive record, allow access
            return True

        # Superusers always have access
        if request.user.is_superuser:
            self._log_sensitive_access(request, obj, granted=True)
            return True

        # Check for specific permission
        has_permission = request.user.has_perm("patients.view_sensitive_patient")

        # Log the access attempt
        self._log_sensitive_access(request, obj, granted=has_permission)

        if not has_permission:
            return False

        return True

    def _log_sensitive_access(self, request, obj, granted: bool):
        """
        Log access attempt to sensitive patient record.

        Args:
            request: The HTTP request
            obj: The patient object being accessed
            granted: Whether access was granted
        """
        action = "view_sensitive_patient" if granted else "sensitive_access_denied"

        AuditLog.log(
            action=action,
            user=request.user if request.user.is_authenticated else None,
            resource_type="Patient",
            resource_id=obj.id,
            ip_address=get_client_ip(request),
            user_agent=request.META.get("HTTP_USER_AGENT", ""),
            patient_id=obj.id,
            details={
                "patient_mrn": getattr(obj, "mrn", ""),
                "is_sensitive": True,
                "access_granted": granted,
            },
        )


class IsAdminUser(permissions.BasePermission):
    """
    Permission class that only allows admin users.

    Used for audit log access and other admin-only endpoints.
    """

    def has_permission(self, request, view):
        """Check if user is admin."""
        return request.user and request.user.is_authenticated and request.user.is_staff


class AuditLogPermission(permissions.BasePermission):
    """
    Permission class for audit log access.

    Only superusers can view audit logs.
    Audit logs cannot be modified or deleted via API.
    """

    def has_permission(self, request, view):
        """Check if user can access audit logs."""
        if not request.user or not request.user.is_authenticated:
            return False

        # Only allow GET (list/retrieve) for superusers
        if request.method in permissions.SAFE_METHODS:
            return request.user.is_superuser

        # No modifications allowed
        return False

    def has_object_permission(self, request, view, obj):
        """Check if user can access specific audit log."""
        return request.method in permissions.SAFE_METHODS and request.user.is_superuser


class PatientPermission(permissions.BasePermission):
    """
    Permission class for patient access with sensitive data filtering.

    Combines authentication check with sensitive data access control.
    """

    def has_permission(self, request, view):
        """Check if user is authenticated."""
        return request.user and request.user.is_authenticated

    def has_object_permission(self, request, view, obj):
        """Check if user can access this patient."""
        # Check sensitive access
        is_sensitive = getattr(obj, "is_sensitive", False)

        if not is_sensitive:
            return True

        if request.user.is_superuser:
            return True

        return request.user.has_perm("patients.view_sensitive_patient")
