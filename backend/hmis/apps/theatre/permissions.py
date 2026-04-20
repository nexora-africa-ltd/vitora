"""Theatre-specific permissions."""

from rest_framework.permissions import SAFE_METHODS, BasePermission


class CanManageTheatreSettings(BasePermission):
    """Allow theatre setup writes only for users with theatre.manage_theatre_settings."""

    def has_permission(self, request, _view):
        if request.method in SAFE_METHODS:
            return True
        return request.user.has_perm("theatre.manage_theatre_settings")


class CanManageTheatre(BasePermission):
    """Allow users with theatre.manage_theatre permission."""

    def has_permission(self, request, _view):
        if request.method in ("GET", "HEAD", "OPTIONS"):
            return True
        return request.user.has_perm("theatre.manage_theatre")


class CanDocumentSurgery(BasePermission):
    """Allow users with theatre.document_surgery permission."""

    def has_permission(self, request, _view):
        if request.method in ("GET", "HEAD", "OPTIONS"):
            return True
        return request.user.has_perm("theatre.document_surgery")
