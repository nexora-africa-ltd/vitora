"""
License permission classes for Vitora HMIS.

These permissions check the Organization's subscription plan features
to gate access to specific modules/endpoints.
"""

from rest_framework import permissions
from rest_framework.request import Request
from rest_framework.views import APIView

# Re-export from core to avoid circular imports (DRF resolves DEFAULT_PERMISSION_CLASSES
# from core.permissions which is loaded before licensing)
from hmis.apps.core.permissions import RequiresActiveLicense  # noqa: F401


class RequiresFeature(permissions.BasePermission):
    """
    Permission class that checks if the requesting user's organization
    has a specific feature enabled in their subscription plan.

    Usage:
        class MyViewSet(viewsets.ModelViewSet):
            permission_classes = [IsAuthenticated, RequiresFeature]
            required_feature = "sha_claims"
    """

    message = "This feature is not available in your current subscription plan."

    def has_permission(self, request: Request, view: APIView) -> bool:
        feature_key = getattr(view, "required_feature", None)
        if not feature_key:
            return True

        # Get the user's organization
        org = self._get_user_organization(request)
        if not org:
            return True  # No org = skip feature check (shouldn't happen in practice)

        # Check subscription status first
        if org.subscription_status in ("SUSPENDED", "EXPIRED"):
            self.message = (
                f"Your subscription is {org.subscription_status.lower()}. "
                "Please contact Nexora to reactivate."
            )
            return False

        # Check feature flags from the plan
        plan = org.subscription_plan
        if not plan:
            return False

        features = plan.features or {}
        if not features.get(feature_key, False):
            self.message = (
                f"The '{feature_key}' feature requires a plan upgrade. Current plan: {plan.name}."
            )
            return False

        return True

    def _get_user_organization(self, request: Request):
        """Resolve the user's organization from their staff profile."""
        user = request.user
        if not user or not user.is_authenticated:
            return None

        profile = getattr(user, "staff_profile", None)
        if profile:
            return profile.organization

        return None


def requires_feature(feature_key: str):
    """
    Factory function that returns a configured RequiresFeature permission class.

    Usage:
        class SHAClaimViewSet(viewsets.ModelViewSet):
            permission_classes = [IsAuthenticated, requires_feature("sha_claims")]
    """

    class ConfiguredRequiresFeature(RequiresFeature):
        def has_permission(self, request: Request, view: APIView) -> bool:
            view.required_feature = feature_key
            return super().has_permission(request, view)

    ConfiguredRequiresFeature.__name__ = f"RequiresFeature_{feature_key}"
    ConfiguredRequiresFeature.__qualname__ = f"RequiresFeature_{feature_key}"
    return ConfiguredRequiresFeature
