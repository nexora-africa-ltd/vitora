# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
# ruff: noqa
"""Core views staff rbac for Vitora HMIS.

What this file is for:
- Implement views staff rbac logic for the core domain.

How to use it:
- Import classes and functions from this module in Django app code and tests.

Supported inputs/args:
- Python imports and Django ORM/runtime inputs; no standalone CLI arguments.
"""

import logging

from django.apps import apps
from django.conf import settings as django_settings
from django.contrib.auth.models import Permission
from django.contrib.auth.signals import user_logged_in, user_login_failed
from django.db import models
from django.utils import timezone
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
from rest_framework.permissions import AllowAny, IsAdminUser, IsAuthenticated
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework_simplejwt.views import TokenObtainPairView

from .mixins import ReadOnCreateMixin, TenantScopedViewMixin, resolve_request_tenant
from .models import (
    AuditLog,
    CertificateAuthority,
    CodeSystem,
    County,
    Department,
    DHIS2Config,
    DocumentShare,
    DocumentSignature,
    Facility,
    FeatureFlag,
    FrontendEvent,
    Notification,
    Organization,
    OrgMembership,
    PasswordResetToken,
    PushSubscription,
    Role,
    StaffProfile,
    SubCounty,
    SubscriptionPlan,
    UserCertificate,
    Ward,
)
from .openapi import SchemaFallbackSerializer
from .permissions import (
    AuditLogPermission,
    FacilityAdminPermission,
    ReadRequiresModelPermission,
    WriteRequiresRolePermission,
)
from .role_permissions_sync import sync_role_group_permissions
from .serializers import (
    AuditLogSerializer,
    CertificateAuthoritySerializer,
    CodeSystemSerializer,
    CountySerializer,
    DepartmentSerializer,
    DHIS2ConfigCreateSerializer,
    DHIS2ConfigDetailSerializer,
    DHIS2ConfigListSerializer,
    DHIS2ConfigUpdateSerializer,
    DocumentHubItemSerializer,
    DocumentShareCreateSerializer,
    DocumentShareSerializer,
    DocumentSignatureSerializer,
    FacilityCreateSerializer,
    FacilityDetailSerializer,
    FacilityListSerializer,
    FeatureFlagSerializer,
    FrontendEventBatchSerializer,
    FrontendEventSerializer,
    NotificationSerializer,
    OrganizationDetailSerializer,
    OrganizationListSerializer,
    OrgChartPayloadSerializer,
    OrgMembershipCreateSerializer,
    OrgMembershipSerializer,
    PermissionSerializer,
    PushSubscriptionSerializer,
    RevokeCertificateRequestSerializer,
    RoleSerializer,
    SignDocumentRequestSerializer,
    StaffProfileSerializer,
    StaffProfileUpdateSerializer,
    SubCountySerializer,
    SubscriptionPlanCreateSerializer,
    SubscriptionPlanDetailSerializer,
    SubscriptionPlanListSerializer,
    UserCertificateSerializer,
    UsernameCheckResponseSerializer,
    UsernameSuggestionRequestSerializer,
    UsernameSuggestionResponseSerializer,
    UserPermissionsSerializer,
    VerifySignatureRequestSerializer,
    WardSerializer,
)
from .views_audit_reference import (
    _build_memberships,
    _build_user_info,
    _get_client_ip,
    _query_param_truthy,
)

logger = logging.getLogger(__name__)


class DepartmentViewSet(TenantScopedViewMixin, viewsets.ModelViewSet):
    """
    ViewSet for Department CRUD operations.

    Scoped to the active facility via TenantScopedViewMixin.
    List/retrieve accessible to authenticated users.
    Create/update/delete restricted to admins.
    """

    queryset = Department.objects.select_related(
        "parent", "head", "head__user", "facility", "organization"
    ).all()
    serializer_class = DepartmentSerializer
    tenant_scope = "facility"
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
            permission_classes = [
                IsAuthenticated,
                WriteRequiresRolePermission,
                ReadRequiresModelPermission,
            ]
        return [permission() for permission in permission_classes]

    def perform_create(self, serializer):
        """Create department and record the admin audit trail."""
        department = serializer.save(**self.get_tenant_save_kwargs())
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

        departments = Department.objects.select_related(
            "parent", "head", "head__user", "facility", "organization"
        ).order_by("name")
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
                "root_department_count": sum(
                    1 for department in departments if department.parent_id is None
                ),
                "department_heads_count": sum(
                    1 for department in departments if department.head_id is not None
                ),
                "supervisor_link_count": sum(
                    1 for staff_member in staff if staff_member.supervisor_id is not None
                ),
            },
        }
        serializer = OrgChartPayloadSerializer(payload)
        return Response(serializer.data)


class RoleViewSet(viewsets.ModelViewSet):
    """
    ViewSet for Role CRUD operations.

    List/retrieve shows system-wide roles (organization=null) plus roles
    belonging to the user's organization/facility. Superusers see all.
    Create/update/delete restricted to admins.
    """

    queryset = Role.objects.all()
    serializer_class = RoleSerializer
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ["category", "requires_license", "is_active", "hierarchy_level"]
    search_fields = ["name", "code", "license_body"]
    ordering_fields = ["name", "code", "hierarchy_level", "created_at"]
    ordering = ["hierarchy_level", "name"]

    def get_queryset(self):
        """Return system-wide roles + roles scoped to the user's org/facility."""
        if getattr(self, "swagger_fake_view", False):
            return Role.objects.none()

        resolve_request_tenant(self.request)
        user = self.request.user

        if user.is_superuser:
            return Role.objects.all()

        from django.db.models import Q

        org = getattr(self.request, "organization", None)
        facility = getattr(self.request, "facility", None)

        q = Q(organization__isnull=True)  # system-wide defaults
        if org:
            q |= Q(organization=org)
        if facility:
            q |= Q(facility=facility)

        return Role.objects.filter(q).distinct()

    def get_permissions(self):
        """Set permissions based on action."""
        if self.action in ["create", "update", "partial_update", "destroy"]:
            permission_classes = [IsAdminUser]
        else:
            permission_classes = [
                IsAuthenticated,
                WriteRequiresRolePermission,
                ReadRequiresModelPermission,
            ]
        return [permission() for permission in permission_classes]

    def perform_create(self, serializer):
        """Create role, sync group permissions, and record the admin audit trail."""
        role = serializer.save()
        sync_role_group_permissions(role)
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
        """Update role, sync group permissions, and record the admin audit trail."""
        role = serializer.save()
        if "permissions_matrix" in serializer.validated_data:
            sync_role_group_permissions(role)
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

    @extend_schema(
        description="Sync all roles from the default roles.json fixture. Superusers only.",
        responses={
            200: inline_serializer(
                "SyncDefaultRolesResponse",
                fields={
                    "message": serializers.CharField(),
                    "roles_updated": serializers.IntegerField(),
                    "permissions_synced": serializers.IntegerField(),
                },
            )
        },
    )
    @action(detail=False, methods=["post"], url_path="sync-defaults")
    def sync_defaults(self, request):
        """Sync all roles from roles.json and update Django group permissions."""
        if not request.user.is_superuser:
            return Response(
                {"detail": "Only superusers can sync default roles."},
                status=status.HTTP_403_FORBIDDEN,
            )

        import json
        from pathlib import Path

        fixture_path = Path(__file__).resolve().parent / "fixtures" / "roles.json"
        if not fixture_path.exists():
            return Response(
                {"detail": "roles.json fixture not found."},
                status=status.HTTP_404_NOT_FOUND,
            )

        try:
            with open(fixture_path) as f:
                fixture_data = json.load(f)
        except json.JSONDecodeError as e:
            return Response(
                {"detail": f"Invalid JSON in fixture: {e}"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Extract roles from fixture
        roles_data = [item for item in fixture_data if item.get("model") == "core.role"]

        # FK fields in Role that need _id suffix when setting from raw PK values
        FK_FIELDS = {"parent_role", "django_group"}
        # Fields to skip (managed elsewhere)
        SKIP_FIELDS = {"created_at", "updated_at"}

        roles_updated = 0
        for role_entry in roles_data:
            fields = role_entry.get("fields", {})
            code = fields.get("code")
            if not code:
                continue
            try:
                # Look up by code (unique), not PK — PKs may differ between fixture and DB
                role = Role.objects.get(code=code)
                for field, value in fields.items():
                    if field in SKIP_FIELDS:
                        continue
                    if field in FK_FIELDS:
                        setattr(role, f"{field}_id", value)
                    else:
                        setattr(role, field, value)
                role.save()
                roles_updated += 1
            except Role.DoesNotExist:
                pass  # Skip roles that don't exist in DB

        # Sync permissions for all updated roles
        permissions_synced = 0
        for role in Role.objects.filter(django_group__isnull=False):
            count = sync_role_group_permissions(role)
            permissions_synced += count

        AuditLog.log(
            action="roles_synced_from_defaults",
            user=request.user,
            resource_type="Role",
            resource_id=0,
            ip_address=_get_client_ip(request),
            user_agent=request.META.get("HTTP_USER_AGENT", ""),
            details={"roles_updated": roles_updated, "permissions_synced": permissions_synced},
        )

        return Response(
            {
                "message": f"Synced {roles_updated} roles and {permissions_synced} permissions from defaults.",
                "roles_updated": roles_updated,
                "permissions_synced": permissions_synced,
            }
        )


class StaffProfileViewSet(TenantScopedViewMixin, viewsets.ModelViewSet):
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
    tenant_scope = "organization"
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
        if self.action in ["create", "destroy", "reset_password"]:
            permission_classes = [FacilityAdminPermission]
        else:
            permission_classes = [
                IsAuthenticated,
                WriteRequiresRolePermission,
                ReadRequiresModelPermission,
            ]
        return [permission() for permission in permission_classes]

    def create(self, request, *args, **kwargs):
        """Create a new staff profile with user account.

        Returns temp_password in response for admin display.
        Optionally sends welcome email if send_email=true in request.
        """
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        # Enforce subscription limit
        if not request.user.is_superuser:
            profile = getattr(request.user, "staff_profile", None)
            if profile and profile.organization and not profile.organization.can_add_user():
                org = profile.organization
                return Response(
                    {
                        "detail": (
                            f"Staff limit reached ({org.max_users}). "
                            "Upgrade your subscription plan to add more users."
                        ),
                        "code": "user_limit_reached",
                    },
                    status=status.HTTP_403_FORBIDDEN,
                )

        # Auto-attach the current request's tenant (organization/facility) so
        # the StaffProfile is properly scoped. Without this the row would be
        # saved with organization=NULL, which then leaves the hub→cloud sync
        # SyncQueue entry without tenant context and the cloud's
        # `_upsert_hub_staff_profile` falls through to its (less reliable)
        # role/department fallbacks.
        staff_profile = serializer.save(**self.get_tenant_save_kwargs())

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
        response_data = read_serializer.data

        # Include temp password only when it was auto-generated (never leak
        # manually-entered passwords back in the response).
        temp_password = getattr(staff_profile, "_temp_password", None)
        password_was_generated = getattr(staff_profile, "_password_was_generated", False)
        if temp_password and password_was_generated:
            response_data["temp_password"] = temp_password

        # Optionally send welcome email with credentials. Only possible for
        # auto-generated passwords; manual passwords must be communicated
        # through another channel by the admin.
        send_email = request.data.get("send_email", False)
        if send_email and temp_password and password_was_generated:
            from .services.email_service import send_welcome_email

            org_name = ""
            if staff_profile.organization:
                org_name = staff_profile.organization.name
            email_sent = send_welcome_email(
                to_email=staff_profile.user.email,
                username=staff_profile.user.username,
                temp_password=temp_password,
                full_name=staff_profile.user.get_full_name(),
                organization_name=org_name,
            )
            response_data["email_sent"] = email_sent

        return Response(response_data, status=status.HTTP_201_CREATED)

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

    @action(detail=False, methods=["get"])
    def license_summary(self, request):
        """Return license status summary for the current org's licensed staff.

        GET /api/staff/license_summary/

        Returns counts of valid, expired, expiring-soon, and unverified
        licenses for staff whose role requires a license.

        For non-admin users, returns only the caller's own license status.
        """
        from datetime import date, timedelta

        today = date.today()
        expiry_threshold = today + timedelta(days=30)

        base_qs = self.get_queryset().filter(
            primary_role__requires_license=True,
            employment_status="ACTIVE",
        )

        # Non-admin users get only their own license status
        staff_profile = getattr(request.user, "staff_profile", None)
        is_admin = request.user.is_superuser or (
            staff_profile
            and staff_profile.primary_role
            and staff_profile.primary_role.code in ("ADMIN", "ORG-ADMIN", "OWNER")
        )

        if not is_admin:
            base_qs = base_qs.filter(user=request.user)

        total = base_qs.count()
        verified = base_qs.filter(license_verified=True).count()
        unverified = total - verified

        expired = base_qs.filter(license_expiry__lt=today).count()
        expiring_soon = base_qs.filter(
            license_expiry__gte=today,
            license_expiry__lte=expiry_threshold,
        ).count()
        valid = base_qs.filter(license_expiry__gt=expiry_threshold).count()
        no_expiry = base_qs.filter(license_expiry__isnull=True).count()

        # For individual staff, include their own status
        my_status = None
        if (
            staff_profile
            and staff_profile.primary_role
            and staff_profile.primary_role.requires_license
        ):
            my_license = {
                "license_number": staff_profile.license_number,
                "license_expiry": str(staff_profile.license_expiry)
                if staff_profile.license_expiry
                else None,
                "license_verified": staff_profile.license_verified,
                "licensing_body": staff_profile.licensing_body,
                "hwr_last_verified_at": staff_profile.hwr_last_verified_at.isoformat()
                if staff_profile.hwr_last_verified_at
                else None,
            }
            if staff_profile.license_expiry:
                if staff_profile.license_expiry < today:
                    my_license["status"] = "expired"
                elif staff_profile.license_expiry <= expiry_threshold:
                    my_license["status"] = "expiring_soon"
                else:
                    my_license["status"] = "valid"
            else:
                my_license["status"] = "unknown"
            my_status = my_license

        return Response(
            {
                "total": total,
                "valid": valid,
                "expired": expired,
                "expiring_soon": expiring_soon,
                "unverified": unverified,
                "no_expiry_set": no_expiry,
                "is_admin_view": is_admin,
                "my_license": my_status,
            }
        )

    @action(
        detail=True,
        methods=["post"],
        url_path="reset-password",
        permission_classes=[FacilityAdminPermission],
    )
    def reset_password(self, request, pk=None):
        """
        Admin reset of a staff member's password.

        POST /api/staff/{id}/reset-password/
        Body:
          - password: optional manual password (auto-generated if omitted)
          - must_change_password: optional bool (default True)
          - send_email: optional bool (default False)

        Returns the staff profile. If the password was auto-generated,
        `temp_password` is included for one-time display.
        """
        import secrets

        from .serializers import StaffPasswordResetSerializer

        staff_profile = self.get_object()
        serializer = StaffPasswordResetSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        password = serializer.validated_data.get("password")
        must_change_password = serializer.validated_data.get("must_change_password", True)
        send_email = serializer.validated_data.get("send_email", False)

        password_was_generated = False
        if not password:
            password = secrets.token_urlsafe(12)
            password_was_generated = True

        # Auto-generated passwords always force a reset.
        if password_was_generated:
            must_change_password = True

        user = staff_profile.user
        user.set_password(password)
        user.save(update_fields=["password"])

        staff_profile.must_change_password = must_change_password
        staff_profile.save(update_fields=["must_change_password"])

        AuditLog.log(
            action="staff_password_reset",
            user=request.user,
            resource_type="StaffProfile",
            resource_id=staff_profile.id,
            ip_address=_get_client_ip(request),
            user_agent=request.META.get("HTTP_USER_AGENT", ""),
            details={
                "employee_id": staff_profile.employee_id,
                "username": user.username,
                "password_generated": password_was_generated,
                "must_change_password": must_change_password,
            },
        )

        read_serializer = StaffProfileSerializer(staff_profile)
        response_data = read_serializer.data

        if password_was_generated:
            response_data["temp_password"] = password

            if send_email:
                from .services.email_service import send_welcome_email

                org_name = ""
                if staff_profile.organization:
                    org_name = staff_profile.organization.name
                email_sent = send_welcome_email(
                    to_email=user.email,
                    username=user.username,
                    temp_password=password,
                    full_name=user.get_full_name(),
                    organization_name=org_name,
                )
                response_data["email_sent"] = email_sent

        return Response(response_data, status=status.HTTP_200_OK)

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


class OrgMembershipViewSet(TenantScopedViewMixin, viewsets.ModelViewSet):
    """Manage organization membership assignments for the active organization."""

    queryset = OrgMembership.objects.select_related(
        "staff_profile__user", "organization", "role", "department"
    ).prefetch_related("facilities")
    serializer_class = OrgMembershipSerializer
    tenant_scope = "organization"
    filter_backends = [DjangoFilterBackend, filters.OrderingFilter]
    filterset_fields = ["staff_profile", "status", "is_primary"]
    ordering_fields = ["is_primary", "joined_at", "created_at"]
    ordering = ["-is_primary", "-joined_at"]

    def get_serializer_class(self):
        if self.action in ["create", "update", "partial_update"]:
            return OrgMembershipCreateSerializer
        return OrgMembershipSerializer

    def get_permissions(self):
        if self.action in ["create", "update", "partial_update", "destroy"]:
            permission_classes = [IsAdminUser]
        else:
            permission_classes = [
                IsAuthenticated,
                WriteRequiresRolePermission,
                ReadRequiresModelPermission,
            ]
        return [permission() for permission in permission_classes]

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        membership = serializer.save(**self.get_tenant_save_kwargs())

        AuditLog.log(
            action="org_membership_created",
            user=request.user,
            resource_type="OrgMembership",
            resource_id=membership.id,
            ip_address=_get_client_ip(request),
            user_agent=request.META.get("HTTP_USER_AGENT", ""),
            details={
                "staff_profile": membership.staff_profile_id,
                "organization": membership.organization_id,
                "role": membership.role_id,
                "is_primary": membership.is_primary,
            },
        )

        return Response(OrgMembershipSerializer(membership).data, status=status.HTTP_201_CREATED)

    def update(self, request, *args, **kwargs):
        partial = kwargs.pop("partial", False)
        membership = self.get_object()
        serializer = self.get_serializer(
            membership,
            data=request.data,
            partial=partial,
            context={"request": request},
        )
        serializer.is_valid(raise_exception=True)
        membership = serializer.save(**self.get_tenant_save_kwargs())

        AuditLog.log(
            action="org_membership_updated",
            user=request.user,
            resource_type="OrgMembership",
            resource_id=membership.id,
            ip_address=_get_client_ip(request),
            user_agent=request.META.get("HTTP_USER_AGENT", ""),
            details={
                "changed_fields": sorted(serializer.validated_data.keys()),
                "staff_profile": membership.staff_profile_id,
                "organization": membership.organization_id,
            },
        )

        return Response(OrgMembershipSerializer(membership).data)

    def perform_destroy(self, instance):
        AuditLog.log(
            action="org_membership_deleted",
            user=self.request.user,
            resource_type="OrgMembership",
            resource_id=instance.id,
            ip_address=_get_client_ip(self.request),
            user_agent=self.request.META.get("HTTP_USER_AGENT", ""),
            details={
                "staff_profile": instance.staff_profile_id,
                "organization": instance.organization_id,
                "role": instance.role_id,
                "is_primary": instance.is_primary,
            },
        )
        super().perform_destroy(instance)


@extend_schema(responses=UserPermissionsSerializer)
@api_view(["GET"])
@permission_classes([IsAuthenticated])
def me_permissions(request):
    """Return the current user's effective permission list."""
    serializer = UserPermissionsSerializer(
        {"permissions": sorted(request.user.get_all_permissions())}
    )
    return Response(serializer.data)
