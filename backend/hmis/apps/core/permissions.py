"""
Custom permissions for Vitora HMIS.

This module contains custom permission classes for:
- Sensitive patient data access control
- Role-based access control
- Audit logging integration
"""

import logging

from rest_framework import permissions

from .models import AuditLog

logger = logging.getLogger(__name__)


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

        return has_permission

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

    Authenticated users can view their own audit logs.
    Staff admins and superusers can review all audit logs.
    Audit logs cannot be modified or deleted via API.
    """

    def has_permission(self, request, view):
        """Check if user can access audit logs."""
        if not request.user or not request.user.is_authenticated:
            return False

        if request.method in permissions.SAFE_METHODS:
            return True

        # No modifications allowed
        return False

    def has_object_permission(self, request, view, obj):
        """Check if user can access specific audit log."""
        return (
            request.method in permissions.SAFE_METHODS
            and (
                request.user.is_staff
                or request.user.is_superuser
                or obj.user_id == request.user.id
            )
        )


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


class RoleBasedPermission(permissions.BasePermission):
    """
    Permission class that checks role-based access.

    Uses the permission matrix from user's StaffProfile roles.
    Falls back to Django permissions if no StaffProfile exists.
    """

    # Map HTTP methods to actions
    ACTION_MAP = {
        "GET": "read",
        "HEAD": "read",
        "OPTIONS": "read",
        "POST": "create",
        "PUT": "update",
        "PATCH": "update",
        "DELETE": "delete",
    }

    def has_permission(self, request, view):
        """
        Check if user has permission for this action on this resource.

        Args:
            request: The HTTP request
            view: The view being accessed

        Returns:
            bool: True if permission granted
        """
        # Check authentication
        if not request.user or not request.user.is_authenticated:
            return False

        # Superusers always have permission
        if request.user.is_superuser:
            return True

        # Get resource name from view
        resource = self._get_resource_name(view)
        action = self.ACTION_MAP.get(request.method, "read")

        # Check StaffProfile permissions
        try:
            profile = request.user.staff_profile

            # Check if license is required and valid
            if profile.primary_role.requires_license:
                if not profile.license_number:
                    return False
                if not profile.is_license_valid():
                    return False

            # Check permission
            return profile.has_permission(action, resource)

        except AttributeError:
            # No StaffProfile - fallback to Django permissions
            return self._check_django_permission(request.user, action, resource)

    def has_object_permission(self, request, view, obj):
        """
        Check object-level permissions (e.g., department-based, sensitive data).

        Args:
            request: The HTTP request
            view: The view being accessed
            obj: The object being accessed

        Returns:
            bool: True if permission granted
        """
        # First check basic permission
        if not self.has_permission(request, view):
            return False

        # Check for sensitive patient access
        is_sensitive = getattr(obj, "is_sensitive", False)
        if is_sensitive:
            try:
                profile = request.user.staff_profile
                # Get resource name
                resource = self._get_resource_name(view)
                # Check if has view_sensitive permission
                has_sensitive_perm = profile.has_permission("view_sensitive", resource)
                if not has_sensitive_perm:
                    return False
            except AttributeError:
                # No StaffProfile - check Django permission
                if not request.user.has_perm("patients.view_sensitive_patient"):
                    return False

        return True

    def _get_resource_name(self, view):
        """
        Get resource name from view.

        Args:
            view: The view

        Returns:
            str: Resource name (e.g., "Patient", "Encounter")
        """
        # Try to get model name from queryset
        if hasattr(view, "get_queryset"):
            try:
                queryset = view.get_queryset()
                if hasattr(queryset, "model"):
                    return queryset.model.__name__
            except Exception as exc:
                logger.debug("Unable to infer model from queryset: %s", exc)

        # Try to get from serializer
        if hasattr(view, "get_serializer_class"):
            try:
                serializer_class = view.get_serializer_class()
                if hasattr(serializer_class, "Meta") and hasattr(serializer_class.Meta, "model"):
                    return serializer_class.Meta.model.__name__
            except Exception as exc:
                logger.debug("Unable to infer model from serializer: %s", exc)

        # Fallback to view basename
        if hasattr(view, "basename"):
            return view.basename.capitalize()

        return "Unknown"

    def _check_django_permission(self, user, action, resource):
        """
        Fallback to Django permissions if no StaffProfile.

        Args:
            user: The user
            action: The action (create, read, update, delete)
            resource: The resource type

        Returns:
            bool: True if Django permission exists
        """
        # Map actions to Django permission codenames
        action_map = {
            "create": "add",
            "read": "view",
            "update": "change",
            "delete": "delete",
        }

        django_action = action_map.get(action, "view")
        resource_lower = resource.lower()

        # Try to check Django permission
        # Format: app_label.action_model
        # We'll try common app labels
        for app_label in ["patients", "encounters", "core"]:
            perm = f"{app_label}.{django_action}_{resource_lower}"
            if user.has_perm(perm):
                return True

        return False


class SHAPermission(permissions.BasePermission):
    """
    Permission class for SHA (Social Health Authority) endpoints.

    Checks for specific SHA permissions based on action:
    - view_shamember: View SHA members
    - add_shamember: Create SHA members
    - change_shamember: Update SHA members
    - view_shaclaim: View SHA claims
    - add_shaclaim: Create SHA claims
    - change_shaclaim: Update SHA claims
    - submit_sha_claim: Submit claims to SHA
    - appeal_sha_claim: Appeal rejected claims
    - verify_sha_eligibility: Verify member eligibility
    """

    # Map view actions to required permission codenames
    ACTION_PERMISSION_MAP = {
        "list": "view",
        "retrieve": "view",
        "create": "add",
        "update": "change",
        "partial_update": "change",
        "destroy": "delete",
    }

    # Custom action permissions
    CUSTOM_ACTION_PERMISSIONS = {
        "submit": "submit_sha_claim",
        "appeal": "appeal_sha_claim",
        "verify": "verify_sha_eligibility",
        "check_eligibility": "verify_sha_eligibility",
        "submit_claim": "submit_sha_claim",
        "appeal_claim": "appeal_sha_claim",
        "export": "view_shaclaim",
        "bulk_create": "add_shaclaim",
        "bulk_update": "change_shaclaim",
        "dashboard": "view_shaclaim",
    }

    def has_permission(self, request, view):
        """
        Check if user has permission for SHA action.

        Args:
            request: The HTTP request
            view: The view being accessed

        Returns:
            bool: True if permission granted
        """
        # Check authentication
        if not request.user or not request.user.is_authenticated:
            return False

        # Superusers always have permission
        if request.user.is_superuser:
            return True

        # Get the action
        action = getattr(view, "action", None)

        # Check for custom action permissions first
        if action in self.CUSTOM_ACTION_PERMISSIONS:
            perm_codename = self.CUSTOM_ACTION_PERMISSIONS[action]
            return request.user.has_perm(f"billing.{perm_codename}")

        # Get standard permission for CRUD actions
        perm_prefix = self.ACTION_PERMISSION_MAP.get(action, "view")

        # Get model name from view
        model_name = self._get_model_name(view)
        if not model_name:
            return False

        perm_codename = f"{perm_prefix}_{model_name}"
        return request.user.has_perm(f"billing.{perm_codename}")

    def _get_model_name(self, view):
        """
        Get lowercase model name from view.

        Args:
            view: The view

        Returns:
            str: Lowercase model name or None
        """
        if hasattr(view, "get_queryset"):
            try:
                queryset = view.get_queryset()
                if hasattr(queryset, "model"):
                    return queryset.model.__name__.lower()
            except Exception as exc:
                logger.debug("Unable to infer lowercase model name from queryset: %s", exc)

        if hasattr(view, "queryset") and view.queryset is not None:
            return view.queryset.model.__name__.lower()

        return None
