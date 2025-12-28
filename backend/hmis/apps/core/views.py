"""
Views for core app.
"""

from django.contrib.auth.signals import user_logged_in, user_login_failed
from rest_framework import viewsets
from rest_framework.mixins import ListModelMixin, RetrieveModelMixin
from rest_framework_simplejwt.views import TokenObtainPairView

from .models import AuditLog
from .permissions import AuditLogPermission
from .serializers import AuditLogSerializer


class AuditLogViewSet(ListModelMixin, RetrieveModelMixin, viewsets.GenericViewSet):
    """
    ViewSet for viewing audit logs (read-only).

    Only accessible by superusers.
    """

    queryset = AuditLog.objects.all()
    serializer_class = AuditLogSerializer
    permission_classes = [AuditLogPermission]
    filterset_fields = ["action", "resource_type", "user"]
    search_fields = ["action", "resource_type", "user__username"]
    ordering_fields = ["timestamp", "action"]
    ordering = ["-timestamp"]


class AuditedTokenObtainPairView(TokenObtainPairView):
    """
    Custom TokenObtainPairView that fires Django's user_logged_in signal.

    This ensures that JWT-based logins are properly logged in the audit system.
    """

    def post(self, request, *args, **kwargs):
        """Handle token obtain request with audit logging."""
        response = super().post(request, *args, **kwargs)

        if response.status_code == 200:
            # Login successful - fire user_logged_in signal
            from django.contrib.auth import get_user_model

            User = get_user_model()
            username = request.data.get("username")
            try:
                user = User.objects.get(username=username)
                user_logged_in.send(
                    sender=self.__class__, request=request, user=user
                )
            except User.DoesNotExist:
                pass
        else:
            # Login failed - fire user_login_failed signal
            user_login_failed.send(
                sender=self.__class__,
                credentials={"username": request.data.get("username", "unknown")},
                request=request,
            )

        return response
