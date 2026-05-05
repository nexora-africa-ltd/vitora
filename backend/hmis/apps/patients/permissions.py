"""Patient-app RBAC permissions (Last Office / Death Records)."""

from rest_framework.permissions import SAFE_METHODS, BasePermission


class CanCertifyDeath(BasePermission):
    """Allow death certification only for users with patients.certify_death."""

    def has_permission(self, request, _view):
        if request.method in SAFE_METHODS:
            return True
        return request.user.has_perm("patients.certify_death")


class CanReleaseBody(BasePermission):
    """Allow body release only for users with patients.release_body."""

    def has_permission(self, request, _view):
        if request.method in SAFE_METHODS:
            return True
        return request.user.has_perm("patients.release_body")


class CanVoidDeathRecord(BasePermission):
    """Allow voiding death records only for users with patients.void_death_record."""

    def has_permission(self, request, _view):
        if request.method in SAFE_METHODS:
            return True
        return request.user.has_perm("patients.void_death_record")
