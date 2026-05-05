"""Blood Bank RBAC permissions."""

from rest_framework.permissions import SAFE_METHODS, BasePermission


class CanManageBloodBank(BasePermission):
    """Allow blood bank writes only for users with blood_bank.manage_blood_bank."""

    def has_permission(self, request, _view):
        if request.method in SAFE_METHODS:
            return True
        return request.user.has_perm("blood_bank.manage_blood_bank")


class CanIssueBloodUnit(BasePermission):
    """Allow issuing blood units only for users with blood_bank.issue_blood_unit."""

    def has_permission(self, request, _view):
        if request.method in SAFE_METHODS:
            return True
        return request.user.has_perm("blood_bank.issue_blood_unit")


class CanPerformCrossMatch(BasePermission):
    """Allow cross-matching only for users with blood_bank.perform_crossmatch."""

    def has_permission(self, request, _view):
        if request.method in SAFE_METHODS:
            return True
        return request.user.has_perm("blood_bank.perform_crossmatch")
