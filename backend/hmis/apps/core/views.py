"""
Views for core app.
"""

from django.contrib.auth.signals import user_logged_in, user_login_failed
from rest_framework import filters, status, viewsets
from rest_framework.decorators import action
from rest_framework.mixins import ListModelMixin, RetrieveModelMixin
from rest_framework.permissions import IsAdminUser, IsAuthenticated
from rest_framework.response import Response
from rest_framework_simplejwt.views import TokenObtainPairView

from .models import AuditLog, County, Department, Role, StaffProfile, SubCounty, Ward
from .permissions import AuditLogPermission
from .serializers import (
    AuditLogSerializer,
    CountySerializer,
    DepartmentSerializer,
    RoleSerializer,
    StaffProfileSerializer,
    SubCountySerializer,
    WardSerializer,
)


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


class CountyViewSet(ListModelMixin, RetrieveModelMixin, viewsets.GenericViewSet):
    """ViewSet for listing and retrieving counties."""

    queryset = County.objects.all()
    serializer_class = CountySerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = ["name"]
    ordering_fields = ["name", "code"]
    ordering = ["name"]
    pagination_class = None  # Return all counties without pagination


class SubCountyViewSet(ListModelMixin, RetrieveModelMixin, viewsets.GenericViewSet):
    """ViewSet for listing and retrieving sub-counties."""

    queryset = SubCounty.objects.all()
    serializer_class = SubCountySerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = ["name"]
    ordering_fields = ["name"]
    ordering = ["name"]
    pagination_class = None  # Return all sub-counties without pagination

    def get_queryset(self):
        """Filter sub-counties by county if provided."""
        queryset = super().get_queryset()
        county_id = self.request.query_params.get("county")
        if county_id:
            queryset = queryset.filter(county_id=county_id)
        return queryset


class WardViewSet(ListModelMixin, RetrieveModelMixin, viewsets.GenericViewSet):
    """ViewSet for listing and retrieving wards."""

    queryset = Ward.objects.all()
    serializer_class = WardSerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = ["name"]
    ordering_fields = ["name"]
    ordering = ["name"]
    pagination_class = None  # Return all wards without pagination

    def get_queryset(self):
        """Filter wards by sub-county if provided."""
        queryset = super().get_queryset()
        sub_county_id = self.request.query_params.get("sub_county")
        if sub_county_id:
            queryset = queryset.filter(sub_county_id=sub_county_id)
        return queryset


class AuditedTokenObtainPairView(TokenObtainPairView):
    """
    Custom TokenObtainPairView that fires Django's user_logged_in signal.

    This ensures that JWT-based logins are properly logged in the audit system.
    Also includes user info in the response for the frontend.
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
                user_logged_in.send(sender=self.__class__, request=request, user=user)

                # Add user info to response
                response.data['user'] = {
                    'id': user.id,
                    'username': user.username,
                    'email': user.email,
                    'first_name': user.first_name,
                    'last_name': user.last_name,
                    'is_staff': user.is_staff,
                    'permissions': list(user.get_all_permissions()),
                }
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


# ============================================================================
# RBAC ViewSets (Sprint 1.1-1.2 Track C - Phase 5)
# ============================================================================


class DepartmentViewSet(viewsets.ModelViewSet):
    """
    ViewSet for Department CRUD operations.

    List/retrieve accessible to authenticated users.
    Create/update/delete restricted to admins.
    """

    queryset = Department.objects.all()
    serializer_class = DepartmentSerializer
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ["department_type", "is_active", "parent"]
    search_fields = ["name", "code"]
    ordering_fields = ["name", "code", "created_at"]
    ordering = ["name"]

    def get_permissions(self):
        """Set permissions based on action."""
        if self.action in ["create", "update", "partial_update", "destroy"]:
            permission_classes = [IsAdminUser]
        else:
            permission_classes = [IsAuthenticated]
        return [permission() for permission in permission_classes]

    @action(detail=True, methods=["get"])
    def staff(self, request, pk=None):
        """Get staff in this department."""
        department = self.get_object()
        staff = StaffProfile.objects.filter(primary_department=department)
        serializer = StaffProfileSerializer(staff, many=True)
        return Response(serializer.data)


class RoleViewSet(viewsets.ModelViewSet):
    """
    ViewSet for Role CRUD operations.

    List/retrieve accessible to authenticated users.
    Create/update/delete restricted to admins.
    """

    queryset = Role.objects.all()
    serializer_class = RoleSerializer
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ["category", "requires_license", "is_active", "hierarchy_level"]
    search_fields = ["name", "code", "license_body"]
    ordering_fields = ["name", "code", "hierarchy_level", "created_at"]
    ordering = ["hierarchy_level", "name"]

    def get_permissions(self):
        """Set permissions based on action."""
        if self.action in ["create", "update", "partial_update", "destroy"]:
            permission_classes = [IsAdminUser]
        else:
            permission_classes = [IsAuthenticated]
        return [permission() for permission in permission_classes]

    @action(detail=True, methods=["get"])
    def permissions(self, request, pk=None):
        """Get role's permission matrix."""
        role = self.get_object()
        return Response(role.get_all_permissions())


class StaffProfileViewSet(viewsets.ModelViewSet):
    """
    ViewSet for StaffProfile CRUD operations.

    List/retrieve accessible to authenticated users.
    Create/delete restricted to admins.
    Update allowed for admins and the staff member themselves (limited fields).
    """

    queryset = StaffProfile.objects.select_related(
        "user", "primary_role", "primary_department", "supervisor"
    ).prefetch_related("secondary_roles", "secondary_departments")
    serializer_class = StaffProfileSerializer
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = [
        "primary_role",
        "primary_department",
        "employment_status",
        "primary_role__requires_license",
    ]
    search_fields = [
        "employee_id",
        "user__username",
        "user__first_name",
        "user__last_name",
        "user__email",
        "license_number",
    ]
    ordering_fields = ["employee_id", "date_joined", "created_at"]
    ordering = ["user__last_name", "user__first_name"]

    def get_permissions(self):
        """Set permissions based on action."""
        if self.action in ["create", "destroy"]:
            permission_classes = [IsAdminUser]
        else:
            permission_classes = [IsAuthenticated]
        return [permission() for permission in permission_classes]

    @action(detail=False, methods=["get", "patch"])
    def me(self, request):
        """
        Get or update current user's staff profile.

        Allows staff to view and update their own profile with limited fields.
        """
        try:
            staff_profile = request.user.staff_profile
        except StaffProfile.DoesNotExist:
            return Response(
                {"detail": "Staff profile not found."},
                status=status.HTTP_404_NOT_FOUND,
            )

        if request.method == "GET":
            serializer = self.get_serializer(staff_profile)
            return Response(serializer.data)

        elif request.method == "PATCH":
            # Limit fields that can be updated by staff themselves
            allowed_fields = [
                "phone_number",
                "emergency_contact_name",
                "emergency_contact_phone",
            ]
            data = {k: v for k, v in request.data.items() if k in allowed_fields}

            serializer = self.get_serializer(
                staff_profile, data=data, partial=True
            )
            serializer.is_valid(raise_exception=True)
            serializer.save()
            return Response(serializer.data)

    def perform_destroy(self, instance):
        """
        Deactivate staff instead of deleting.

        Sets employment_status to TERMINATED and date_left to today.
        """
        from datetime import date

        instance.employment_status = "TERMINATED"
        instance.date_left = date.today()
        instance.save()


# ============================================================================
# Notification ViewSet (Phase 2.3 - Notification System)
# ============================================================================


class NotificationViewSet(viewsets.ModelViewSet):
    """
    ViewSet for managing user notifications.

    Provides endpoints for:
    - Listing notifications (filtered to current user)
    - Retrieving notification details
    - Marking notifications as read
    - Getting unread count
    - Polling support with timestamp filtering
    """

    from .models import Notification
    from .serializers import NotificationSerializer

    serializer_class = NotificationSerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [filters.OrderingFilter]
    ordering_fields = ["created_at", "priority"]
    ordering = ["-created_at"]
    http_method_names = ["get", "post", "head", "options"]  # No PUT/PATCH/DELETE

    def get_queryset(self):
        """Filter notifications to current user only."""
        from django.utils import timezone
        from django.utils.dateparse import parse_datetime

        from .models import Notification

        queryset = Notification.objects.filter(user=self.request.user)

        # Filter by notification_type
        notification_type = self.request.query_params.get("notification_type")
        if notification_type:
            queryset = queryset.filter(notification_type=notification_type)

        # Filter by is_read
        is_read = self.request.query_params.get("is_read")
        if is_read is not None:
            is_read_bool = is_read.lower() in ("true", "1", "yes")
            queryset = queryset.filter(is_read=is_read_bool)

        # Filter by created_after (for polling)
        created_after = self.request.query_params.get("created_after")
        if created_after:
            try:
                after_dt = parse_datetime(created_after)
                if after_dt:
                    queryset = queryset.filter(created_at__gt=after_dt)
            except (ValueError, TypeError):
                pass  # Ignore invalid datetime

        return queryset

    def list(self, request, *args, **kwargs):
        """List notifications with server timestamp for polling."""
        from django.utils import timezone

        response = super().list(request, *args, **kwargs)

        # Add server timestamp for polling support
        if isinstance(response.data, dict):
            response.data["server_time"] = timezone.now().isoformat()

        return response

    @action(detail=True, methods=["post"])
    def mark_read(self, request, pk=None):
        """Mark a single notification as read."""
        notification = self.get_object()
        notification.mark_as_read()
        return Response({"status": "marked as read"})

    @action(detail=False, methods=["post"])
    def mark_all_read(self, request):
        """Mark all unread notifications as read."""
        from django.utils import timezone

        from .models import Notification

        count = Notification.objects.filter(
            user=request.user,
            is_read=False,
        ).update(is_read=True, read_at=timezone.now())

        return Response({"marked_count": count})

    @action(detail=False, methods=["get"])
    def unread_count(self, request):
        """Get count of unread notifications."""
        from .models import Notification

        count = Notification.objects.filter(
            user=request.user,
            is_read=False,
        ).count()

        return Response({"unread_count": count})
