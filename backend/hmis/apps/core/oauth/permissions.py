"""
SMART on FHIR Permissions.

Patient-level access control based on SMART scopes and launch context.
"""

import logging
import re

from rest_framework import permissions
from rest_framework.request import Request

logger = logging.getLogger(__name__)


class SMARTScopePermission(permissions.BasePermission):
    """
    Permission class that enforces SMART on FHIR scope-based access control.

    Checks that the OAuth2 token has the required scopes for the requested
    FHIR resource and operation.

    Usage in ViewSets:
        class PatientViewSet(ModelViewSet):
            permission_classes = [SMARTScopePermission]
            smart_resource_type = 'Patient'  # FHIR resource type
    """

    message = "You do not have the required SMART scope for this operation."

    # Map HTTP methods to FHIR/SMART actions
    METHOD_TO_ACTION = {
        "GET": "read",
        "HEAD": "read",
        "OPTIONS": "read",
        "POST": "write",
        "PUT": "write",
        "PATCH": "write",
        "DELETE": "write",
    }

    def has_permission(self, request: Request, view) -> bool:
        """
        Check if the request has the required SMART scope.
        """
        # Skip scope check for non-OAuth2 authentication
        if not hasattr(request, "auth") or not request.auth:
            return True

        # Get the access token
        access_token = getattr(request, "access_token", None)
        if not access_token:
            return True  # Non-SMART request, allow other permission classes to handle

        # Get granted scopes
        granted_scopes = self._get_granted_scopes(access_token)
        if not granted_scopes:
            return True  # No SMART scopes, allow other checks

        # Determine required scope
        resource_type = self._get_resource_type(view)
        action = self.METHOD_TO_ACTION.get(request.method, "read")

        # Check if any granted scope allows this access
        return self._check_scope_access(granted_scopes, resource_type, action, request)

    def has_object_permission(self, request: Request, view, obj) -> bool:
        """
        Check object-level permissions based on patient context.

        For patient/* scopes, ensure the resource belongs to the patient
        in the launch context.
        """
        # Skip for non-OAuth2 authentication
        access_token = getattr(request, "access_token", None)
        if not access_token:
            return True

        granted_scopes = self._get_granted_scopes(access_token)
        if not granted_scopes:
            return True

        # Check patient context restriction
        launch_context = getattr(request, "launch_context", {})
        context_patient_id = launch_context.get("patient")

        # If using patient/* scopes, enforce patient context
        has_patient_scopes = any(s.startswith("patient/") for s in granted_scopes)
        has_user_scopes = any(s.startswith("user/") for s in granted_scopes)
        has_system_scopes = any(s.startswith("system/") for s in granted_scopes)

        if has_patient_scopes and not (has_user_scopes or has_system_scopes):
            # Must have patient context and object must belong to that patient
            if not context_patient_id:
                logger.warning("Patient scope used without patient context in launch")
                return False

            # Check if object belongs to the patient in context
            return self._object_belongs_to_patient(obj, context_patient_id)

        return True

    def _get_granted_scopes(self, access_token) -> list[str]:
        """Extract scopes from access token."""
        scope_str = getattr(access_token, "scope", "") or ""
        return scope_str.split()

    def _get_resource_type(self, view) -> str:
        """Get the FHIR resource type for the view."""
        # Check for explicit resource type on view
        if hasattr(view, "smart_resource_type"):
            return view.smart_resource_type

        # Try to infer from view name
        view_name = view.__class__.__name__
        if view_name.endswith("ViewSet"):
            return view_name[:-7]  # Remove 'ViewSet' suffix

        return "Resource"  # Default

    def _check_scope_access(
        self,
        granted_scopes: list[str],
        resource_type: str,
        action: str,
        request: Request,
    ) -> bool:
        """
        Check if granted scopes allow access to the resource/action.

        SMART scope format: <context>/<resource>.<action>
        Examples:
        - patient/Patient.read
        - user/*.write
        - system/*.*
        """
        for scope in granted_scopes:
            if self._scope_allows_access(scope, resource_type, action):
                return True

        logger.warning(
            f"No scope grants access to {resource_type}.{action}. "
            f"Granted scopes: {granted_scopes}"
        )
        return False

    def _scope_allows_access(self, scope: str, resource_type: str, action: str) -> bool:
        """Check if a single scope allows the requested access."""
        # Parse scope
        match = re.match(r"^(patient|user|system)/(\*|[A-Z][a-zA-Z]*)\.(\*|read|write)$", scope)
        if not match:
            return False

        scope_context, scope_resource, scope_action = match.groups()

        # Check resource match
        if scope_resource != "*" and scope_resource != resource_type:
            return False

        # Check action match
        if scope_action != "*" and scope_action != action:
            return False

        return True

    def _object_belongs_to_patient(self, obj, patient_id: str) -> bool:
        """
        Check if an object belongs to the specified patient.

        Handles different object types and their patient references.
        """
        # Direct patient object
        if hasattr(obj, "id") and str(obj.id) == patient_id:
            return True

        # Object with patient FK
        if hasattr(obj, "patient_id"):
            return str(obj.patient_id) == patient_id

        if hasattr(obj, "patient"):
            patient = obj.patient
            if hasattr(patient, "id"):
                return str(patient.id) == patient_id

        # Object with subject FK (FHIR pattern)
        if hasattr(obj, "subject_id"):
            return str(obj.subject_id) == patient_id

        # Encounter-based resources
        if hasattr(obj, "encounter"):
            encounter = obj.encounter
            if hasattr(encounter, "patient_id"):
                return str(encounter.patient_id) == patient_id

        # Default: allow if we can't determine patient relationship
        logger.warning(
            f"Cannot determine patient relationship for {type(obj).__name__}. "
            f"Allowing access by default."
        )
        return True


class SMARTLaunchContextPermission(permissions.BasePermission):
    """
    Permission that requires specific launch context.

    Use this for views that require patient or encounter context
    to be present in the SMART launch.
    """

    message = "This endpoint requires SMART launch context."
    required_context: list[str] = []  # Override in subclasses

    def has_permission(self, request: Request, view) -> bool:
        """Check that required launch context is present."""
        launch_context = getattr(request, "launch_context", {})

        for required in self.required_context:
            if required not in launch_context:
                self.message = f"Missing required launch context: {required}"
                return False

        return True


class RequirePatientContextPermission(SMARTLaunchContextPermission):
    """Require patient context in SMART launch."""

    message = "This endpoint requires patient context (launch/patient scope)."
    required_context = ["patient"]


class RequireEncounterContextPermission(SMARTLaunchContextPermission):
    """Require encounter context in SMART launch."""

    message = "This endpoint requires encounter context (launch/encounter scope)."
    required_context = ["encounter"]


class SMARTPatientAccessPermission(permissions.BasePermission):
    """
    Permission that restricts access to patient-level data based on SMART context.

    For endpoints that return patient data, this ensures:
    1. If patient/* scopes are used, only the context patient's data is accessible
    2. If user/* or system/* scopes are used, broader access is allowed
    """

    message = "Access denied to patient data outside your authorized context."

    def has_permission(self, request: Request, view) -> bool:
        """Check patient-level access permissions."""
        access_token = getattr(request, "access_token", None)
        if not access_token:
            return True

        scopes = (getattr(access_token, "scope", "") or "").split()

        # If using patient/* scopes, ensure patient context is present
        has_patient_scopes = any(s.startswith("patient/") for s in scopes)
        has_broader_scopes = any(s.startswith("user/") or s.startswith("system/") for s in scopes)

        if has_patient_scopes and not has_broader_scopes:
            launch_context = getattr(request, "launch_context", {})
            if "patient" not in launch_context:
                logger.warning(
                    "Patient scopes used without patient context. "
                    "Denying access to patient data."
                )
                return False

        return True

    def has_object_permission(self, request: Request, view, obj) -> bool:
        """Check object-level patient access."""
        access_token = getattr(request, "access_token", None)
        if not access_token:
            return True

        scopes = (getattr(access_token, "scope", "") or "").split()
        has_patient_scopes = any(s.startswith("patient/") for s in scopes)
        has_broader_scopes = any(s.startswith("user/") or s.startswith("system/") for s in scopes)

        if has_patient_scopes and not has_broader_scopes:
            launch_context = getattr(request, "launch_context", {})
            context_patient_id = launch_context.get("patient")

            if context_patient_id:
                # Check if object belongs to context patient
                return self._check_patient_access(obj, context_patient_id)

        return True

    def _check_patient_access(self, obj, patient_id: str) -> bool:
        """Check if object is accessible for the given patient."""
        # Check various patient reference patterns
        if hasattr(obj, "id") and str(obj.id) == patient_id:
            return True

        if hasattr(obj, "patient_id") and str(obj.patient_id) == patient_id:
            return True

        if hasattr(obj, "patient"):
            patient = obj.patient
            if hasattr(patient, "id") and str(patient.id) == patient_id:
                return True

        if hasattr(obj, "subject_id") and str(obj.subject_id) == patient_id:
            return True

        return False


def get_smart_filter_for_patient_scopes(request: Request, queryset):
    """
    Filter a queryset based on SMART patient context.

    Use this in ViewSet.get_queryset() to automatically filter results
    based on the patient context in the SMART launch.

    Example:
        def get_queryset(self):
            qs = super().get_queryset()
            return get_smart_filter_for_patient_scopes(self.request, qs)
    """
    access_token = getattr(request, "access_token", None)
    if not access_token:
        return queryset

    scopes = (getattr(access_token, "scope", "") or "").split()
    has_patient_scopes = any(s.startswith("patient/") for s in scopes)
    has_broader_scopes = any(s.startswith("user/") or s.startswith("system/") for s in scopes)

    if has_patient_scopes and not has_broader_scopes:
        launch_context = getattr(request, "launch_context", {})
        context_patient_id = launch_context.get("patient")

        if context_patient_id:
            # Try different patient reference patterns
            model = queryset.model

            if hasattr(model, "patient_id") or hasattr(model, "patient"):
                return queryset.filter(patient_id=context_patient_id)
            if hasattr(model, "subject_id"):
                return queryset.filter(subject_id=context_patient_id)
            if model.__name__ == "Patient":
                return queryset.filter(id=context_patient_id)

    return queryset
