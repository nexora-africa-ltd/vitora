"""
AI-specific DRF permission classes.

``HasAIFeatureAccess``
    Checks the organization's plan includes ``ai_assistant`` feature.

``HasAITokenQuota``
    Checks the organization has remaining AI token quota before allowing
    the request.  Returns a descriptive 403 when quota is exhausted.

Both permissions resolve the organization from the request user's
staff profile.
"""

from rest_framework.permissions import BasePermission


class HasAIFeatureAccess(BasePermission):
    """Block AI requests when the org's plan doesn't include ai_assistant."""

    message = (
        "AI features are not available on your current plan. "
        "Please upgrade to a plan that includes AI Assistant."
    )

    def has_permission(self, request, view):  # noqa: ARG002
        org = _resolve_org(request)
        if org is None:
            return True  # No org context = let other checks handle it
        return org.has_feature("ai_assistant")


class HasAITokenQuota(BasePermission):
    """Block AI requests when the org has exhausted its token quota."""

    message = (
        "Your organization has used all available AI tokens for this billing cycle. "
        "Contact your administrator to upgrade or wait for the quota to reset."
    )

    def has_permission(self, request, view):  # noqa: ARG002
        # Only gate write methods (actual AI calls), not GETs (history, sessions)
        if request.method in ("GET", "HEAD", "OPTIONS"):
            return True

        org = _resolve_org(request)
        if org is None:
            return True  # No org context

        return org.can_use_ai_tokens(tokens_needed=0)


def _resolve_org(request):
    """Resolve the Organization from the request user's staff profile."""
    user = getattr(request, "user", None)
    if not user or not getattr(user, "is_authenticated", False):
        return None

    # Superusers bypass quota checks
    if user.is_superuser:
        return None

    profile = getattr(user, "staff_profile", None)
    if profile is None:
        return None
    return getattr(profile, "organization", None)
