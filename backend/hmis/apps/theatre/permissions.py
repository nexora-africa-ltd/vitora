"""Theatre-specific permissions."""

from rest_framework.permissions import BasePermission


class CanManageTheatre(BasePermission):
    """Allow users with theatre.manage_theatre permission."""

    def has_permission(self, request, view):
        if request.method in ("GET", "HEAD", "OPTIONS"):
            return True
        return request.user.has_perm("theatre.manage_theatre")


class CanDocumentSurgery(BasePermission):
    """Allow users with theatre.document_surgery permission."""

    def has_permission(self, request, view):
        if request.method in ("GET", "HEAD", "OPTIONS"):
            return True
        return request.user.has_perm("theatre.document_surgery")
