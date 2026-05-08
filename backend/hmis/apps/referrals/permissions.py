"""
Permissions for the referrals module.
"""

from rest_framework import permissions


class ReferralActionPermission(permissions.BasePermission):
    """
    Permission for referral state-change actions (accept, decline, cancel).

    Rules:
    - All authenticated users may read.
    - Object-level: ``accept`` / ``decline`` require ``referrals.accept_referral``
      or ``referrals.decline_referral`` respectively (superusers bypass).
    - ``cancel`` is allowed for the original referrer or anyone with the
      ``referrals.delete_clinicalreferral`` permission.
    """

    message = "You do not have permission to perform this action on the referral."

    def has_permission(self, request, view):  # noqa: ARG002
        return bool(request.user and request.user.is_authenticated)

    def has_object_permission(self, request, view, obj):
        user = request.user
        if user.is_superuser:
            return True

        action = getattr(view, "action", None)
        if action == "accept":
            return user.has_perm("referrals.accept_referral")
        if action == "decline":
            return user.has_perm("referrals.decline_referral")
        if action == "cancel":
            if obj.referred_by_id == user.id:
                return True
            return user.has_perm("referrals.delete_clinicalreferral")
        return True


def user_can_view_sensitive_referrals(user) -> bool:
    """Return True if the user can see sensitive referrals."""
    if not user or not user.is_authenticated:
        return False
    if user.is_superuser:
        return True
    return user.has_perm("referrals.view_sensitive_referral")
