"""Dialysis RBAC permissions."""

from rest_framework.permissions import SAFE_METHODS, BasePermission


class CanManageDialysis(BasePermission):
    """Allow dialysis order/session writes for users with dialysis.manage_dialysis."""

    def has_permission(self, request, _view):
        if request.method in SAFE_METHODS:
            return True
        return request.user.has_perm("dialysis.manage_dialysis")


class CanPerformDialysis(BasePermission):
    """Allow session start/complete/abort for users with dialysis.perform_dialysis."""

    def has_permission(self, request, _view):
        if request.method in SAFE_METHODS:
            return True
        return request.user.has_perm("dialysis.perform_dialysis")
