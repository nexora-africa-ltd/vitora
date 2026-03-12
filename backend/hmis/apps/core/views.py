"""
Views for core app.
"""

from django.contrib.auth.models import Permission
from django.contrib.auth.signals import user_logged_in, user_login_failed
from django.utils.dateparse import parse_date, parse_datetime
from django_filters.rest_framework import DjangoFilterBackend
from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import (
    OpenApiParameter,
    extend_schema,
    extend_schema_view,
    inline_serializer,
)
from rest_framework import filters, serializers, status, viewsets
from rest_framework.decorators import action, api_view, permission_classes
from rest_framework.mixins import ListModelMixin, RetrieveModelMixin
from rest_framework.permissions import IsAdminUser, IsAuthenticated
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework_simplejwt.views import TokenObtainPairView

from .models import (
    AuditLog,
    CodeSystem,
    County,
    Department,
    Facility,
    FeatureFlag,
    FrontendEvent,
    Notification,
    Role,
    StaffProfile,
    SubCounty,
    Ward,
)
from .permissions import AuditLogPermission
from .serializers import (
    AuditLogSerializer,
    CodeSystemSerializer,
    CountySerializer,
    DepartmentSerializer,
    FacilityCreateSerializer,
    FacilityDetailSerializer,
    FacilityListSerializer,
    FeatureFlagSerializer,
    FrontendEventBatchSerializer,
    FrontendEventSerializer,
    NotificationSerializer,
    OrgChartPayloadSerializer,
    PermissionSerializer,
    RoleSerializer,
    StaffProfileSerializer,
    StaffProfileUpdateSerializer,
    SubCountySerializer,
    UsernameCheckResponseSerializer,
    UsernameSuggestionRequestSerializer,
    UsernameSuggestionResponseSerializer,
    UserPermissionsSerializer,
    WardSerializer,
)


def _get_client_ip(request) -> str | None:
    """Best-effort client IP extraction for audit logging."""
    forwarded_for = request.META.get("HTTP_X_FORWARDED_FOR")
    if forwarded_for:
        return forwarded_for.split(",")[0].strip()
    return request.META.get("REMOTE_ADDR")


def _build_user_info(user) -> dict:
    """
    Build the canonical user info dict for auth responses.

    Used by token obtain, MFA verify, and /api/staff/me/ endpoints to
    ensure a consistent shape that includes role, role_category,
    permissions, and facility data.
    """
    # Resolve role and role_category from StaffProfile
    role = None
    role_category = None
    facility_data = None

    if hasattr(user, "staff_profile"):
        try:
            profile = user.staff_profile
        except StaffProfile.DoesNotExist:
            profile = None

        if profile:
            if profile.primary_role:
                role = profile.primary_role.code
                role_category = profile.primary_role.category

            # Build facility payload
            if profile.primary_facility:
                fac = profile.primary_facility
                facility_data = {
                    "id": fac.id,
                    "mfl_code": fac.mfl_code,
                    "name": fac.name,
                    "level": fac.level,
                    "modules": fac.modules,
                    "sha_contracted": fac.sha_contracted,
                }

    # Fall back to Django groups for role
    if role is None and user.groups.exists():
        group = user.groups.first()
        role = group.name.upper().replace(" ", "_")

    # Superusers get ADMIN role
    if user.is_superuser:
        role = "ADMIN"

    return {
        "id": user.id,
        "username": user.username,
        "email": user.email,
        "first_name": user.first_name,
        "last_name": user.last_name,
        "is_staff": user.is_staff,
        "is_superuser": user.is_superuser,
        "role": role,
        "role_category": role_category,
        "permissions": list(user.get_all_permissions()),
        "facility": facility_data,
    }


def _query_param_truthy(value: str | None) -> bool:
    """Parse common truthy query parameter values."""
    if value is None:
        return False
    return value.strip().lower() in {"1", "true", "yes", "on"}


class AuditLogViewSet(ListModelMixin, RetrieveModelMixin, viewsets.GenericViewSet):
    """
    ViewSet for viewing audit logs (read-only).

    Staff can review all audit logs.
    Other authenticated users can only see their own audit logs.
    """

    queryset = AuditLog.objects.all()
    serializer_class = AuditLogSerializer
    permission_classes = [AuditLogPermission]
    filterset_fields = ["action", "resource_type", "user"]
    search_fields = ["action", "resource_type", "user__username"]
    ordering_fields = ["timestamp", "action"]
    ordering = ["-timestamp"]

    def get_queryset(self):
        """Apply optional date range filters for admin audit review."""
        queryset = super().get_queryset()
        if not (self.request.user.is_staff or self.request.user.is_superuser):
            queryset = queryset.filter(user=self.request.user)

        start_date = self.request.query_params.get("start_date")
        end_date = self.request.query_params.get("end_date")

        if start_date:
            start_dt = parse_datetime(start_date)
            if start_dt is not None:
                queryset = queryset.filter(timestamp__gte=start_dt)
            else:
                start_day = parse_date(start_date)
                if start_day is not None:
                    queryset = queryset.filter(timestamp__date__gte=start_day)

        if end_date:
            end_dt = parse_datetime(end_date)
            if end_dt is not None:
                queryset = queryset.filter(timestamp__lte=end_dt)
            else:
                end_day = parse_date(end_date)
                if end_day is not None:
                    queryset = queryset.filter(timestamp__date__lte=end_day)

        return queryset


class FrontendEventViewSet(viewsets.GenericViewSet):
    """
    ViewSet for frontend event logging.

    Allows authenticated users to log frontend events for analytics and debugging.
    Supports both single event and batch event submission.

    Endpoints:
    - POST /api/events/ - Log a single event
    - POST /api/events/batch/ - Log multiple events at once (for offline sync)
    - GET /api/events/ - List events (admin only)
    """

    queryset = FrontendEvent.objects.all()
    serializer_class = FrontendEventSerializer
    permission_classes = [IsAuthenticated]
    filterset_fields = ["event_type", "resource_type", "session_id", "was_offline"]
    search_fields = ["event_type", "resource_type", "session_id"]
    ordering_fields = ["server_timestamp", "client_timestamp"]
    ordering = ["-server_timestamp"]

    def get_queryset(self):
        """Filter queryset based on user permissions."""
        queryset = super().get_queryset()
        # Non-admin users can only see their own events
        if not self.request.user.is_staff:
            queryset = queryset.filter(user=self.request.user)
        return queryset

    def list(self, request):
        """List frontend events (filtered by permissions)."""
        queryset = self.filter_queryset(self.get_queryset())
        page = self.paginate_queryset(queryset)
        if page is not None:
            serializer = self.get_serializer(page, many=True)
            return self.get_paginated_response(serializer.data)
        serializer = self.get_serializer(queryset, many=True)
        return Response(serializer.data)

    def create(self, request):
        """Log a single frontend event."""
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data, status=status.HTTP_201_CREATED)

    @action(detail=False, methods=["post"])
    def batch(self, request):
        """
        Log multiple frontend events at once.

        Useful for syncing events that were queued while offline.

        Request body:
        {
            "events": [
                {
                    "event_type": "encounter_save",
                    "resource_type": "Encounter",
                    "resource_id": 123,
                    "client_timestamp": "2026-01-22T10:30:00Z",
                    "session_id": "abc123",
                    "device_type": "web",
                    "details": {"field": "chief_complaint"},
                    "was_offline": true
                },
                ...
            ]
        }
        """
        serializer = FrontendEventBatchSerializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        events = serializer.save()
        return Response(
            {"message": f"Successfully logged {len(events)} events", "count": len(events)},
            status=status.HTTP_201_CREATED,
        )


class PermissionViewSet(ListModelMixin, RetrieveModelMixin, viewsets.GenericViewSet):
    """
    ViewSet for listing and retrieving Django permissions (read-only).

    Accessible to authenticated users for role management UI.
    """

    queryset = Permission.objects.select_related("content_type").all()
    serializer_class = PermissionSerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = ["codename", "name", "content_type__app_label"]
    ordering_fields = ["codename", "name"]
    ordering = ["content_type__app_label", "codename"]
    pagination_class = None  # Return all permissions without pagination


class CodeSystemViewSet(ListModelMixin, RetrieveModelMixin, viewsets.GenericViewSet):
    """
    ViewSet for listing and retrieving code systems (read-only).

    Provides a registry of code systems used in Vitora, including:
    - Internal Vitora vocabularies (e.g., vitora-lab)
    - External standards (e.g., ICD-10, LOINC)
    - Integration-specific codes (e.g., SHA tariff, LIS vendor codes)

    Useful for FHIR compliance and self-documenting API responses.
    """

    queryset = CodeSystem.objects.filter(is_active=True)
    serializer_class = CodeSystemSerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = ["slug", "name", "publisher", "description"]
    ordering_fields = ["slug", "name", "created_at"]
    ordering = ["slug"]
    pagination_class = None  # Return all code systems without pagination
    lookup_field = "slug"


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
    Supports MFA flow when MFA is enabled for the user.

    Rate limited to 5 attempts per minute to prevent brute-force attacks.
    """

    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "login"

    def post(self, request, *args, **kwargs):
        """Handle token obtain request with audit logging and MFA."""
        response = super().post(request, *args, **kwargs)

        if response.status_code == 200:
            # Login successful - check for MFA
            from django.contrib.auth import get_user_model

            from hmis.apps.core.mfa.models import MFAToken
            from hmis.apps.core.mfa.utils import get_client_ip, is_mfa_enabled, is_mfa_required

            User = get_user_model()
            username = request.data.get("username")
            try:
                user = User.objects.get(username=username)

                # Check if MFA is enabled for this user
                mfa_enabled = is_mfa_enabled(user)
                mfa_required = is_mfa_required(user)

                if mfa_enabled:
                    # MFA is enabled - don't return tokens yet
                    # Create temporary MFA token
                    mfa_token = MFAToken.create_for_user(
                        user=user,
                        ip_address=get_client_ip(request),
                    )

                    # Return MFA required response (without access tokens)
                    return Response(
                        {
                            "mfa_required": True,
                            "mfa_token": mfa_token.token,
                        }
                    )

                if mfa_required and not mfa_enabled:
                    # MFA is required but not set up - user needs to set it up
                    # Still return the tokens but flag that setup is needed
                    user_logged_in.send(sender=self.__class__, request=request, user=user)

                    response.data["mfa_setup_required"] = True
                    response.data["mfa_required"] = False
                else:
                    # No MFA - proceed normally
                    user_logged_in.send(sender=self.__class__, request=request, user=user)
                    response.data["mfa_required"] = False

                # Get user's role from StaffProfile or Django groups
                # Add user info to response (includes role, role_category, facility)
                response.data["user"] = _build_user_info(user)
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

    def perform_create(self, serializer):
        """Create department and record the admin audit trail."""
        department = serializer.save()
        AuditLog.log(
            action="department_created",
            user=self.request.user,
            resource_type="Department",
            resource_id=department.id,
            ip_address=_get_client_ip(self.request),
            user_agent=self.request.META.get("HTTP_USER_AGENT", ""),
            details={
                "name": department.name,
                "code": department.code,
                "department_type": department.department_type,
            },
        )

    def perform_update(self, serializer):
        """Update department and record the admin audit trail."""
        department = serializer.save()
        AuditLog.log(
            action="department_updated",
            user=self.request.user,
            resource_type="Department",
            resource_id=department.id,
            ip_address=_get_client_ip(self.request),
            user_agent=self.request.META.get("HTTP_USER_AGENT", ""),
            details={
                "changed_fields": sorted(serializer.validated_data.keys()),
                "name": department.name,
            },
        )

    def perform_destroy(self, instance):
        """Delete department and record the admin audit trail."""
        AuditLog.log(
            action="department_deleted",
            user=self.request.user,
            resource_type="Department",
            resource_id=instance.id,
            ip_address=_get_client_ip(self.request),
            user_agent=self.request.META.get("HTTP_USER_AGENT", ""),
            details={"name": instance.name, "code": instance.code},
        )
        super().perform_destroy(instance)

    @action(detail=True, methods=["get"])
    def staff(self, request, pk=None):
        """Get staff in this department."""
        department = self.get_object()
        staff = StaffProfile.objects.filter(primary_department=department)
        serializer = StaffProfileSerializer(staff, many=True)
        return Response(serializer.data)

    @extend_schema(
        parameters=[
            OpenApiParameter(
                name="include_inactive",
                type=OpenApiTypes.BOOL,
                required=False,
                description="Include inactive departments and non-active staff records.",
            )
        ],
        responses={200: OrgChartPayloadSerializer},
    )
    @action(detail=False, methods=["get"], url_path="org-chart")
    def org_chart(self, request):
        """Return a non-paginated hierarchy payload for the admin org chart."""
        include_inactive = _query_param_truthy(request.query_params.get("include_inactive"))

        departments = Department.objects.select_related("parent", "head", "head__user").order_by(
            "name"
        )
        if not include_inactive:
            departments = departments.filter(is_active=True)
        departments = list(departments)
        department_ids = [department.id for department in departments]

        staff_queryset = (
            StaffProfile.objects.select_related(
                "user", "primary_role", "primary_department", "supervisor"
            )
            .prefetch_related("secondary_roles", "secondary_departments")
            .filter(primary_department_id__in=department_ids)
            .order_by("user__last_name", "user__first_name")
        )
        if not include_inactive:
            staff_queryset = staff_queryset.filter(employment_status="ACTIVE")
        staff = list(staff_queryset)

        payload = {
            "departments": departments,
            "staff": staff,
            "summary": {
                "department_count": len(departments),
                "staff_count": len(staff),
                "root_department_count": sum(1 for department in departments if department.parent_id is None),
                "department_heads_count": sum(1 for department in departments if department.head_id is not None),
                "supervisor_link_count": sum(1 for staff_member in staff if staff_member.supervisor_id is not None),
            },
        }
        serializer = OrgChartPayloadSerializer(payload)
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

    def perform_create(self, serializer):
        """Create role and record the admin audit trail."""
        role = serializer.save()
        AuditLog.log(
            action="role_created",
            user=self.request.user,
            resource_type="Role",
            resource_id=role.id,
            ip_address=_get_client_ip(self.request),
            user_agent=self.request.META.get("HTTP_USER_AGENT", ""),
            details={"name": role.name, "code": role.code, "category": role.category},
        )

    def perform_update(self, serializer):
        """Update role and record the admin audit trail."""
        role = serializer.save()
        AuditLog.log(
            action="role_updated",
            user=self.request.user,
            resource_type="Role",
            resource_id=role.id,
            ip_address=_get_client_ip(self.request),
            user_agent=self.request.META.get("HTTP_USER_AGENT", ""),
            details={
                "changed_fields": sorted(serializer.validated_data.keys()),
                "name": role.name,
            },
        )

    def perform_destroy(self, instance):
        """Delete role and record the admin audit trail."""
        AuditLog.log(
            action="role_deleted",
            user=self.request.user,
            resource_type="Role",
            resource_id=instance.id,
            ip_address=_get_client_ip(self.request),
            user_agent=self.request.META.get("HTTP_USER_AGENT", ""),
            details={"name": instance.name, "code": instance.code},
        )
        super().perform_destroy(instance)

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
        "user", "primary_role", "primary_department", "primary_facility", "supervisor"
    ).prefetch_related("secondary_roles", "secondary_departments", "secondary_facilities")
    serializer_class = StaffProfileSerializer
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = [
        "primary_role",
        "primary_department",
        "primary_facility",
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

    def get_serializer_class(self):
        """Return appropriate serializer class based on action."""
        from .serializers import StaffProfileCreateSerializer

        if self.action == "create":
            return StaffProfileCreateSerializer
        if self.action in ["update", "partial_update"]:
            return StaffProfileUpdateSerializer
        return StaffProfileSerializer

    def get_permissions(self):
        """Set permissions based on action."""
        if self.action in ["create", "destroy"]:
            permission_classes = [IsAdminUser]
        else:
            permission_classes = [IsAuthenticated]
        return [permission() for permission in permission_classes]

    def create(self, request, *args, **kwargs):
        """Create a new staff profile with user account."""
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        staff_profile = serializer.save()

        AuditLog.log(
            action="staff_created",
            user=request.user,
            resource_type="StaffProfile",
            resource_id=staff_profile.id,
            ip_address=_get_client_ip(request),
            user_agent=request.META.get("HTTP_USER_AGENT", ""),
            details={
                "employee_id": staff_profile.employee_id,
                "username": staff_profile.user.username,
            },
        )

        # Return the full staff profile using the read serializer
        read_serializer = StaffProfileSerializer(staff_profile)
        return Response(read_serializer.data, status=status.HTTP_201_CREATED)

    def update(self, request, *args, **kwargs):
        """Update a staff profile and return the canonical read representation."""
        partial = kwargs.pop("partial", False)
        instance = self.get_object()
        serializer = self.get_serializer(instance, data=request.data, partial=partial)
        serializer.is_valid(raise_exception=True)
        staff_profile = serializer.save()

        AuditLog.log(
            action="staff_updated",
            user=request.user,
            resource_type="StaffProfile",
            resource_id=staff_profile.id,
            ip_address=_get_client_ip(request),
            user_agent=request.META.get("HTTP_USER_AGENT", ""),
            details={
                "changed_fields": sorted(serializer.validated_data.keys()),
                "employee_id": staff_profile.employee_id,
            },
        )

        read_serializer = StaffProfileSerializer(staff_profile)
        return Response(read_serializer.data)

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
            data = serializer.data
            # Merge canonical user info (role, role_category, permissions, facility)
            data["user_info"] = _build_user_info(request.user)
            return Response(data)

        elif request.method == "PATCH":
            # Limit fields that can be updated by staff themselves
            allowed_fields = [
                "phone_number",
                "emergency_contact_name",
                "emergency_contact_phone",
            ]
            data = {k: v for k, v in request.data.items() if k in allowed_fields}

            serializer = self.get_serializer(staff_profile, data=data, partial=True)
            serializer.is_valid(raise_exception=True)
            serializer.save()
            return Response(serializer.data)

    @action(detail=False, methods=["get"])
    @extend_schema(
        parameters=[
            OpenApiParameter(
                "username",
                OpenApiTypes.STR,
                location=OpenApiParameter.QUERY,
                description="Username to check for availability.",
                required=True,
            )
        ],
        responses=UsernameCheckResponseSerializer,
    )
    def check_username(self, request):
        """
        Check if a username is available.

        GET /api/staff/check_username/?username=johndoe

        Returns:
            - available: bool - whether the username is available
            - username: str - the checked username
            - suggestions: list - suggested alternatives if unavailable
        """
        from django.contrib.auth import get_user_model

        User = get_user_model()

        username = request.query_params.get("username", "").strip().lower()

        if not username:
            return Response(
                {"error": "username parameter is required"}, status=status.HTTP_400_BAD_REQUEST
            )

        # Validate username format
        if len(username) < 3:
            return Response(
                {"error": "Username must be at least 3 characters"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Check if username exists
        is_available = not User.objects.filter(username__iexact=username).exists()

        response_data = {
            "username": username,
            "available": is_available,
            "suggestions": [],
        }

        # Generate suggestions if username is taken
        if not is_available:
            base_username = username
            suggestions = []
            counter = 1
            while len(suggestions) < 3 and counter <= 10:
                suggested = f"{base_username}{counter}"
                if not User.objects.filter(username__iexact=suggested).exists():
                    suggestions.append(suggested)
                counter += 1
            response_data["suggestions"] = suggestions

        return Response(response_data)

    @action(detail=False, methods=["post"])
    @extend_schema(
        request=UsernameSuggestionRequestSerializer,
        responses=UsernameSuggestionResponseSerializer,
    )
    def suggest_username(self, request):
        """
        Suggest a unique username based on first name and last name.

        POST /api/staff/suggest_username/
        Body: {"first_name": "John", "last_name": "Mwangi", "middle_name": "Kamau"}

        Returns:
            - suggestions: list of available username suggestions
        """
        import re

        from django.contrib.auth import get_user_model

        User = get_user_model()

        first_name = request.data.get("first_name", "").strip().lower()
        last_name = request.data.get("last_name", "").strip().lower()
        middle_name = request.data.get("middle_name", "").strip().lower()

        if not first_name or not last_name:
            return Response(
                {"error": "first_name and last_name are required"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Clean names - remove non-alphanumeric characters
        first_name = re.sub(r"[^a-z0-9]", "", first_name)
        last_name = re.sub(r"[^a-z0-9]", "", last_name)
        middle_name = re.sub(r"[^a-z0-9]", "", middle_name)

        # Generate potential usernames
        candidates = []

        # Pattern 1: first.last (e.g., john.mwangi)
        candidates.append(f"{first_name}.{last_name}")

        # Pattern 2: flast (e.g., jmwangi)
        if first_name:
            candidates.append(f"{first_name[0]}{last_name}")

        # Pattern 3: firstl (e.g., johnm)
        if last_name:
            candidates.append(f"{first_name}{last_name[0]}")

        # Pattern 4: first.middle.last (if middle name provided)
        if middle_name:
            candidates.append(f"{first_name}.{middle_name[0]}.{last_name}")
            candidates.append(f"{first_name[0]}{middle_name[0]}{last_name}")

        # Pattern 5: first_last
        candidates.append(f"{first_name}_{last_name}")

        # Find available usernames
        suggestions = []
        for candidate in candidates:
            if len(candidate) >= 3 and not User.objects.filter(username__iexact=candidate).exists():
                suggestions.append(candidate)
                if len(suggestions) >= 5:
                    break

        # If all taken, add numbers
        if len(suggestions) < 3:
            base = f"{first_name}.{last_name}"
            counter = 1
            while len(suggestions) < 5 and counter <= 20:
                numbered = f"{base}{counter}"
                if not User.objects.filter(username__iexact=numbered).exists():
                    suggestions.append(numbered)
                counter += 1

        return Response({"suggestions": suggestions})

    def perform_destroy(self, instance):
        """
        Deactivate staff instead of deleting.

        Sets employment_status to TERMINATED and date_left to today.
        """
        from datetime import date

        instance.employment_status = "TERMINATED"
        instance.date_left = date.today()
        instance.save()

        AuditLog.log(
            action="staff_deactivated",
            user=self.request.user,
            resource_type="StaffProfile",
            resource_id=instance.id,
            ip_address=_get_client_ip(self.request),
            user_agent=self.request.META.get("HTTP_USER_AGENT", ""),
            details={
                "employee_id": instance.employee_id,
                "username": instance.user.username,
            },
        )


@extend_schema(responses=UserPermissionsSerializer)
@api_view(["GET"])
@permission_classes([IsAuthenticated])
def me_permissions(request):
    """Return the current user's effective permission list."""
    serializer = UserPermissionsSerializer(
        {"permissions": sorted(request.user.get_all_permissions())}
    )
    return Response(serializer.data)


# ============================================================================
# Notification ViewSet (Phase 2.3 - Notification System)
# ============================================================================


@extend_schema_view(
    retrieve=extend_schema(
        parameters=[
            OpenApiParameter(
                "id", OpenApiTypes.INT, location="path", description="Notification ID"
            ),
        ],
    ),
    partial_update=extend_schema(
        parameters=[
            OpenApiParameter(
                "id", OpenApiTypes.INT, location="path", description="Notification ID"
            ),
        ],
    ),
    update=extend_schema(
        parameters=[
            OpenApiParameter(
                "id", OpenApiTypes.INT, location="path", description="Notification ID"
            ),
        ],
    ),
    destroy=extend_schema(
        parameters=[
            OpenApiParameter(
                "id", OpenApiTypes.INT, location="path", description="Notification ID"
            ),
        ],
    ),
)
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

    queryset = Notification.objects.all()
    serializer_class = NotificationSerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [filters.OrderingFilter]
    ordering_fields = ["created_at", "priority"]
    ordering = ["-created_at"]
    http_method_names = ["get", "post", "head", "options"]  # No PUT/PATCH/DELETE

    def get_queryset(self):
        """Filter notifications to current user only."""
        from django.utils.dateparse import parse_datetime

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
                # Handle URL-encoded + sign (becomes space in URL params)
                # Replace space before timezone offset back to +
                created_after = created_after.replace(" ", "+")
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

        count = Notification.objects.filter(
            user=request.user,
            is_read=False,
        ).update(is_read=True, read_at=timezone.now())

        return Response({"marked_count": count})

    @action(detail=False, methods=["get"])
    def unread_count(self, request):
        """Get count of unread notifications."""
        count = Notification.objects.filter(
            user=request.user,
            is_read=False,
        ).count()

        return Response({"unread_count": count})


# ============================================================================
# Case Number Generation Endpoints
# ============================================================================


from rest_framework.decorators import permission_classes as perm_classes
from rest_framework.permissions import IsAuthenticated as IsAuth


@extend_schema(
    parameters=[
        OpenApiParameter(
            "facility_code",
            OpenApiTypes.STR,
            description="Optional facility code override",
            required=False,
        ),
    ],
    responses={
        200: inline_serializer(
            name="PRCNumberResponse",
            fields={"prc_number": serializers.CharField()},
        )
    },
)
@api_view(["GET"])
@perm_classes([IsAuth])
def generate_prc_number_view(request):
    """
    Generate a new unique PRC (Post-Rape Care) Number.

    PRC Numbers are used to track sexual assault/GBV cases across
    medical, legal, and psychosocial services.

    Format: {FACILITY_CODE}-PRC-{SEQUENCE}/{YEAR}
    Example: FAC-PRC-0042/2026

    Returns:
        JSON: {"prc_number": "FAC-PRC-0001/2026"}
    """
    from .utils import generate_prc_number

    facility_code = request.query_params.get("facility_code")
    prc_number = generate_prc_number(facility_code)

    return Response({"prc_number": prc_number})


@extend_schema(
    parameters=[
        OpenApiParameter(
            "prefix",
            OpenApiTypes.STR,
            description="Case type prefix (e.g., 'GBV', 'RTA', 'TRAUMA')",
            required=False,
        ),
        OpenApiParameter(
            "facility_code",
            OpenApiTypes.STR,
            description="Optional facility code override",
            required=False,
        ),
    ],
    responses={
        200: inline_serializer(
            name="CaseNumberResponse",
            fields={"case_number": serializers.CharField()},
        )
    },
)
@api_view(["GET"])
@perm_classes([IsAuth])
def generate_case_number_view(request):
    """
    Generate a generic case number with a given prefix.

    Query Parameters:
        prefix: The case type prefix (e.g., 'GBV', 'RTA', 'TRAUMA')
        facility_code: Optional facility code override

    Format: {FACILITY_CODE}-{PREFIX}-{SEQUENCE}/{YEAR}
    Example: FAC-RTA-0001/2026

    Returns:
        JSON: {"case_number": "FAC-RTA-0001/2026"}
    """
    from .utils import generate_case_number

    prefix = request.query_params.get("prefix", "CASE")
    facility_code = request.query_params.get("facility_code")
    case_number = generate_case_number(prefix, facility_code)

    return Response({"case_number": case_number})


# ============================================================================
# Public Document Verification (No Auth Required)
# ============================================================================


@extend_schema(
    parameters=[
        OpenApiParameter(
            "qr_data", OpenApiTypes.STR, description="Full QR code string", required=False
        ),
        OpenApiParameter(
            "type",
            OpenApiTypes.STR,
            description="Document type ('RECEIPT' or 'INVOICE')",
            required=False,
        ),
        OpenApiParameter("number", OpenApiTypes.STR, description="Document number", required=False),
        OpenApiParameter(
            "amount", OpenApiTypes.STR, description="Amount as string", required=False
        ),
        OpenApiParameter(
            "date", OpenApiTypes.DATE, description="Date (YYYY-MM-DD)", required=False
        ),
        OpenApiParameter(
            "signature", OpenApiTypes.STR, description="8-character hex signature", required=False
        ),
    ],
    request=inline_serializer(
        name="VerifyDocumentRequest",
        fields={
            "qr_data": serializers.CharField(required=False),
            "type": serializers.CharField(required=False),
            "number": serializers.CharField(required=False),
            "amount": serializers.CharField(required=False),
            "date": serializers.DateField(required=False),
            "signature": serializers.CharField(required=False),
        },
    ),
    responses={
        200: inline_serializer(
            name="VerifyDocumentResponse",
            fields={
                "valid": serializers.BooleanField(),
                "document_type": serializers.CharField(required=False),
                "document_number": serializers.CharField(required=False),
                "amount": serializers.CharField(required=False),
                "date": serializers.DateField(required=False),
                "error": serializers.CharField(required=False),
            },
        )
    },
)
@api_view(["GET", "POST"])
@permission_classes([])  # No authentication required
def verify_document(request):
    """
    Verify a document (receipt or invoice) signature.

    This endpoint is PUBLIC and does not require authentication.
    It allows anyone with a QR code to verify document authenticity.

    QR Code Format:
        VITORA-RCPT|N:RCP-001|A:1500.00|D:2026-01-22|S:AB12CD34
        VITORA-INV|N:INV-001|A:5000.00|D:2026-01-22|P:MRN-001|S:EF56GH78

    GET Parameters or POST Body:
        qr_data: Full QR code string (if provided, other params are ignored)
        -- OR --
        type: Document type ('RECEIPT' or 'INVOICE')
        number: Document number
        amount: Amount as string
        date: Date (YYYY-MM-DD)
        signature: 8-character hex signature

    Returns:
        JSON: {
            "valid": true/false,
            "document_type": "RECEIPT",
            "document_number": "RCP-001",
            "amount": "1500.00",
            "date": "2026-01-22",
            "message": "Document is valid and authentic"
        }
    """
    from .qr_utils import verify_document_signature

    # Get data from query params (GET) or body (POST)
    data = request.query_params if request.method == "GET" else request.data

    # Check if full QR data string is provided
    qr_data = data.get("qr_data", "").strip()

    if qr_data:
        # Parse QR data string
        parsed = _parse_qr_data(qr_data)
        if parsed is None:
            return Response(
                {
                    "valid": False,
                    "error": "Invalid QR code format",
                    "message": "The QR code could not be parsed. Expected format: VITORA-RCPT|N:...|A:...|D:...|S:...",
                },
                status=status.HTTP_400_BAD_REQUEST,
            )
        doc_type, doc_number, amount, date, signature = parsed
    else:
        # Get individual parameters
        doc_type = data.get("type", "").upper()
        doc_number = data.get("number", "")
        amount = data.get("amount", "")
        date = data.get("date", "")
        signature = data.get("signature", "")

    # Validate required fields
    if not all([doc_type, doc_number, amount, date, signature]):
        return Response(
            {
                "valid": False,
                "error": "Missing required fields",
                "message": "Please provide: type, number, amount, date, and signature (or qr_data)",
            },
            status=status.HTTP_400_BAD_REQUEST,
        )

    # Validate document type
    if doc_type not in ("RECEIPT", "INVOICE"):
        return Response(
            {
                "valid": False,
                "error": "Invalid document type",
                "message": "Document type must be 'RECEIPT' or 'INVOICE'",
            },
            status=status.HTTP_400_BAD_REQUEST,
        )

    # Verify the signature
    is_valid = verify_document_signature(
        document_type=doc_type,
        document_number=doc_number,
        amount=amount,
        date=date,
        signature=signature,
    )

    if is_valid:
        return Response(
            {
                "valid": True,
                "document_type": doc_type,
                "document_number": doc_number,
                "amount": amount,
                "date": date,
                "message": "✓ Document is valid and authentic",
            }
        )
    else:
        return Response(
            {
                "valid": False,
                "document_type": doc_type,
                "document_number": doc_number,
                "amount": amount,
                "date": date,
                "message": "✗ Document signature is invalid. This document may have been tampered with.",
            }
        )


def _parse_qr_data(qr_data: str) -> tuple | None:
    """
    Parse QR code data string into components.

    Expected format:
        VITORA-RCPT|N:RCP-001|A:1500.00|D:2026-01-22|S:AB12CD34
        VITORA-INV|N:INV-001|A:5000.00|D:2026-01-22|P:MRN-001|S:EF56GH78

    Returns:
        Tuple of (doc_type, doc_number, amount, date, signature) or None if invalid
    """
    try:
        parts = qr_data.split("|")
        if len(parts) < 5:
            return None

        # First part is the document type identifier
        type_id = parts[0]
        if type_id == "VITORA-RCPT":
            doc_type = "RECEIPT"
        elif type_id == "VITORA-INV":
            doc_type = "INVOICE"
        else:
            return None

        # Parse key:value pairs
        data = {}
        for part in parts[1:]:
            if ":" in part:
                key, value = part.split(":", 1)
                data[key] = value

        # Extract required fields
        doc_number = data.get("N")
        amount = data.get("A")
        date = data.get("D")
        signature = data.get("S")

        if not all([doc_number, amount, date, signature]):
            return None

        return (doc_type, doc_number, amount, date, signature)
    except Exception:
        return None


class FeatureFlagViewSet(ListModelMixin, viewsets.GenericViewSet):
    """
    Read-only API for feature flags.

    Allows authenticated clients to query which features are enabled.
    Feature flags are managed exclusively via Django admin.
    """

    queryset = FeatureFlag.objects.all()
    serializer_class = FeatureFlagSerializer
    permission_classes = [IsAuthenticated]
    pagination_class = None  # Always return all flags

    @action(detail=False, methods=["get"])
    def check(self, request):
        """Check a specific flag by name. Returns disabled for unknown flags."""
        name = request.query_params.get("name", "")
        try:
            flag = FeatureFlag.objects.get(name=name)
            return Response(FeatureFlagSerializer(flag).data)
        except FeatureFlag.DoesNotExist:
            return Response({"name": name, "is_enabled": False, "description": ""})


# ============================================================================
# Facility ViewSet (RBAC Capability Plan – Phase 1)
# ============================================================================


class FacilityViewSet(viewsets.ModelViewSet):
    """
    ViewSet for healthcare facility CRUD operations.

    Provides list, retrieve, create, update, and delete endpoints for
    ``Facility`` records.  The viewset uses separate serializers for
    different actions:

    * **list** – ``FacilityListSerializer`` (compact, no module details).
    * **retrieve** – ``FacilityDetailSerializer`` (full, with modules map).
    * **create** – ``FacilityCreateSerializer`` (validates location hierarchy
      and applies KEPH-level module defaults).
    * **update / partial_update** – ``FacilityDetailSerializer``.

    **Permissions:**

    * All authenticated users can list and retrieve facilities.
    * Only admin users can create, update, or delete facilities.

    **Filtering & Search:**

    * Filter by ``level``, ``ownership``, ``county``, ``is_active``,
      ``sha_contracted``, and individual module flags.
    * Search by ``name`` or ``mfl_code``.
    * Order by ``name``, ``level``, ``mfl_code``, or ``created_at``.
    """

    queryset = Facility.objects.select_related("county", "sub_county", "ward").all()
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = ["name", "mfl_code"]
    ordering_fields = ["name", "level", "mfl_code", "created_at"]
    ordering = ["name"]

    def get_serializer_class(self):
        """
        Return the appropriate serializer based on the current action.

        * ``list`` → ``FacilityListSerializer``
        * ``create`` → ``FacilityCreateSerializer``
        * Everything else → ``FacilityDetailSerializer``
        """
        if self.action == "list":
            return FacilityListSerializer
        if self.action == "create":
            return FacilityCreateSerializer
        return FacilityDetailSerializer

    def get_permissions(self):
        """
        Set permissions based on action.

        List and retrieve are available to any authenticated user.
        Write operations require admin privileges.
        """
        if self.action in ["create", "update", "partial_update", "destroy"]:
            permission_classes = [IsAdminUser]
        else:
            permission_classes = [IsAuthenticated]
        return [permission() for permission in permission_classes]

    def get_queryset(self):
        """
        Optionally filter the queryset based on query parameters.

        Supports filtering by:
        * ``level`` – KEPH facility level.
        * ``ownership`` – Ownership type.
        * ``county`` – County ID.
        * ``is_active`` – Active status.
        * ``sha_contracted`` – SHA contract status.
        * Any ``has_*`` module flag (e.g. ``?has_laboratory=true``).
        """
        qs = super().get_queryset()

        # Simple exact-match filters
        for param in ["level", "ownership", "county", "is_active", "sha_contracted"]:
            value = self.request.query_params.get(param)
            if value is not None:
                # Convert string booleans for boolean fields
                if param in ("is_active", "sha_contracted"):
                    value = _query_param_truthy(value)
                qs = qs.filter(**{param: value})

        # Module capability filters
        module_fields = [
            "has_outpatient",
            "has_inpatient",
            "has_emergency",
            "has_pharmacy",
            "has_laboratory",
            "has_imaging",
            "has_theatre",
            "has_dialysis",
            "has_icu",
            "has_maternity",
            "has_mortuary",
            "has_blood_bank",
        ]
        for field in module_fields:
            value = self.request.query_params.get(field)
            if value is not None:
                qs = qs.filter(**{field: _query_param_truthy(value)})

        return qs

    def perform_create(self, serializer):
        """Create facility and log the action for audit compliance."""
        facility = serializer.save()
        AuditLog.log(
            action="facility_created",
            user=self.request.user,
            resource_type="Facility",
            resource_id=facility.id,
            ip_address=_get_client_ip(self.request),
            user_agent=self.request.META.get("HTTP_USER_AGENT", ""),
            details={
                "name": facility.name,
                "mfl_code": facility.mfl_code,
                "level": facility.level,
            },
        )

    def perform_update(self, serializer):
        """Update facility and log the action for audit compliance."""
        facility = serializer.save()
        AuditLog.log(
            action="facility_updated",
            user=self.request.user,
            resource_type="Facility",
            resource_id=facility.id,
            ip_address=_get_client_ip(self.request),
            user_agent=self.request.META.get("HTTP_USER_AGENT", ""),
            details={
                "name": facility.name,
                "mfl_code": facility.mfl_code,
                "updated_fields": list(serializer.validated_data.keys()),
            },
        )

    def perform_destroy(self, instance):
        """Delete facility and log the action for audit compliance."""
        AuditLog.log(
            action="facility_deleted",
            user=self.request.user,
            resource_type="Facility",
            resource_id=instance.id,
            ip_address=_get_client_ip(self.request),
            user_agent=self.request.META.get("HTTP_USER_AGENT", ""),
            details={
                "name": instance.name,
                "mfl_code": instance.mfl_code,
            },
        )
        instance.delete()

    @extend_schema(
        parameters=[
            OpenApiParameter(
                name="level",
                type=OpenApiTypes.STR,
                description="KEPH facility level (1–6)",
            ),
        ],
        responses={200: inline_serializer(
            "DefaultModulesResponse",
            fields={
                "level": serializers.CharField(),
                "modules": serializers.DictField(),
            },
        )},
    )
    @action(detail=False, methods=["get"])
    def default_modules(self, request):
        """
        Return the default module flags for a given KEPH facility level.

        This endpoint is useful for the frontend to pre-populate module
        checkboxes when creating a new facility.

        Query Parameters:
            level (str): KEPH level ("1" through "6").

        Returns:
            JSON with ``level`` and ``modules`` dictionary.
        """
        level = request.query_params.get("level", "1")
        modules = Facility.default_modules_for_level(level)
        return Response({"level": level, "modules": modules})
