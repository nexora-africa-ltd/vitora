"""
Views for core app.
"""

from django.contrib.auth.models import Permission
from django.contrib.auth.signals import user_logged_in, user_login_failed
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
from rest_framework_simplejwt.views import TokenObtainPairView

from .models import (
    AuditLog,
    CodeSystem,
    County,
    Department,
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
    FrontendEventBatchSerializer,
    FrontendEventSerializer,
    NotificationSerializer,
    PermissionSerializer,
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
    """

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
                role = None
                if hasattr(user, "staff_profile") and user.staff_profile:
                    role = (
                        user.staff_profile.primary_role.code
                        if user.staff_profile.primary_role
                        else None
                    )
                elif user.groups.exists():
                    # Fall back to first Django group as role
                    role = user.groups.first().name.upper().replace(" ", "_")

                # Superusers get ADMIN role
                if user.is_superuser:
                    role = "ADMIN"

                # Add user info to response
                response.data["user"] = {
                    "id": user.id,
                    "username": user.username,
                    "email": user.email,
                    "first_name": user.first_name,
                    "last_name": user.last_name,
                    "is_staff": user.is_staff,
                    "is_superuser": user.is_superuser,
                    "role": role,
                    "permissions": list(user.get_all_permissions()),
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

    def get_serializer_class(self):
        """Return appropriate serializer class based on action."""
        from .serializers import StaffProfileCreateSerializer

        if self.action == "create":
            return StaffProfileCreateSerializer
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

        # Return the full staff profile using the read serializer
        read_serializer = StaffProfileSerializer(staff_profile)
        return Response(read_serializer.data, status=status.HTTP_201_CREATED)

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

            serializer = self.get_serializer(staff_profile, data=data, partial=True)
            serializer.is_valid(raise_exception=True)
            serializer.save()
            return Response(serializer.data)

    @action(detail=False, methods=["get"])
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
