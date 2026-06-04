"""
Views for core app.
"""

from django.conf import settings as django_settings
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
    DocumentSignature,
    Facility,
    FeatureFlag,
    FrontendEvent,
    Notification,
    Organization,
    OrgMembership,
    PushSubscription,
    Role,
    StaffProfile,
    SubCounty,
    SubscriptionPlan,
    UserCertificate,
    Ward,
)
from .permissions import AuditLogPermission, FacilityAdminPermission, WriteRequiresRolePermission
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
    role_display = None
    phone_number = None
    facility_data = None

    if hasattr(user, "staff_profile"):
        try:
            profile = user.staff_profile
        except StaffProfile.DoesNotExist:
            profile = None

        if profile:
            phone_number = profile.phone_number or None

            if profile.primary_role:
                role = profile.primary_role.code
                role_category = profile.primary_role.category
                role_display = profile.primary_role.name

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

    # Resolve onboarding status from organization
    onboarding_complete = True  # Default for users without org (superusers, etc.)
    if hasattr(user, "staff_profile"):
        try:
            profile_org = user.staff_profile.organization
            if profile_org:
                onboarding_complete = profile_org.onboarding_complete
        except StaffProfile.DoesNotExist:
            pass

    # Resolve subscription/plan data from organization
    subscription_data = {}
    org = None
    if hasattr(user, "staff_profile"):
        try:
            org = user.staff_profile.organization
        except StaffProfile.DoesNotExist:
            pass

    if org:
        plan = org.subscription_plan
        subscription_data = {
            "subscription_tier": org.subscription_tier,
            "plan_features": plan.features if plan else org.PLAN_FALLBACK_FEATURES,
            "ai_tokens_available": org.can_use_ai_tokens(),
        }
    else:
        subscription_data = {
            "subscription_tier": None,
            "plan_features": {},
            "ai_tokens_available": False,
        }

    # Practitioner data for DHA claims (license, regulation body, national ID)
    # Reuse the profile resolved at the top of this function.
    license_number = None
    licensing_body = None
    national_id = None
    if hasattr(user, "staff_profile"):
        try:
            _prof = user.staff_profile
            license_number = _prof.license_number or None
            licensing_body = _prof.licensing_body or None
            national_id = _prof.hwr_national_id or None
        except StaffProfile.DoesNotExist:
            pass

    return {
        "id": user.id,
        "username": user.username,
        "email": user.email,
        "first_name": user.first_name,
        "last_name": user.last_name,
        "is_staff": user.is_staff,
        "is_superuser": user.is_superuser,
        "role": role,
        "role_display": role_display,
        "role_category": role_category,
        "phone_number": phone_number,
        "license_number": license_number,
        "licensing_body": licensing_body,
        "national_id": national_id,
        "permissions": list(user.get_all_permissions()),
        "facility": facility_data,
        "onboarding_complete": onboarding_complete,
        "memberships": _build_memberships(user),
        **subscription_data,
    }


def _build_memberships(user) -> list[dict]:
    """Build the memberships list for auth responses."""
    from hmis.apps.core.models import OrgMembership

    memberships = []
    if not hasattr(user, "staff_profile"):
        return memberships
    try:
        profile = user.staff_profile
    except StaffProfile.DoesNotExist:
        return memberships

    for m in profile.memberships.filter(
        status=OrgMembership.MembershipStatus.ACTIVE
    ).select_related("organization", "role", "department"):
        memberships.append(
            {
                "id": m.pk,
                "organization_id": m.organization_id,
                "organization_name": m.organization.name,
                "role_code": m.role.code,
                "role_name": m.role.name,
                "is_primary": m.is_primary,
                "facilities": list(m.facilities.values("id", "name", "mfl_code")),
            }
        )
    return memberships


def _query_param_truthy(value: str | None) -> bool:
    """Parse common truthy query parameter values."""
    if value is None:
        return False
    return value.strip().lower() in {"1", "true", "yes", "on"}


class AuditLogViewSet(
    TenantScopedViewMixin, ListModelMixin, RetrieveModelMixin, viewsets.GenericViewSet
):
    """
    ViewSet for viewing audit logs (read-only).

    Staff can review all audit logs.
    Other authenticated users can only see their own audit logs.
    """

    tenant_scope = "organization"  # Org admins see all facility logs

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

    @action(detail=False, methods=["get"], permission_classes=[IsAdminUser])
    def chain_status(self, request):
        """Get audit hash chain health summary."""
        from .services.audit_integrity import AuditIntegrityService

        service = AuditIntegrityService()
        status_data = service.get_chain_status()
        return Response(status_data)

    @action(detail=False, methods=["post"], permission_classes=[IsAdminUser])
    def verify_integrity(self, request):
        """Trigger on-demand audit chain integrity verification."""
        from .services.audit_integrity import AuditIntegrityService

        count = request.data.get("count", 1000)
        service = AuditIntegrityService()
        result = service.verify_latest(count=int(count))

        AuditLog.log(
            action="audit_integrity_check",
            user=request.user,
            resource_type="AuditLog",
            ip_address=_get_client_ip(request),
            details={
                "valid": result.valid,
                "entries_checked": result.entries_checked,
                "first_mismatch_seq": result.first_mismatch_seq,
                "errors": result.errors,
                "triggered_by": "manual",
            },
        )

        return Response(
            {
                "valid": result.valid,
                "entries_checked": result.entries_checked,
                "first_mismatch_seq": result.first_mismatch_seq,
                "first_mismatch_detail": result.first_mismatch_detail,
                "errors": result.errors,
                "checked_at": result.checked_at.isoformat() if result.checked_at else None,
            }
        )


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
    permission_classes = [IsAuthenticated, WriteRequiresRolePermission]
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
    permission_classes = [IsAuthenticated, WriteRequiresRolePermission]
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
    permission_classes = [IsAuthenticated, WriteRequiresRolePermission]
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
    permission_classes = [AllowAny]
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = ["name"]
    ordering_fields = ["name", "code"]
    ordering = ["name"]
    pagination_class = None  # Return all counties without pagination


class SubCountyViewSet(ListModelMixin, RetrieveModelMixin, viewsets.GenericViewSet):
    """ViewSet for listing and retrieving sub-counties."""

    queryset = SubCounty.objects.select_related("county").all()
    serializer_class = SubCountySerializer
    permission_classes = [AllowAny]
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

    queryset = Ward.objects.select_related("sub_county").all()
    serializer_class = WardSerializer
    permission_classes = [IsAuthenticated, WriteRequiresRolePermission]
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

                # ── Organization activation gate ─────────────────────────
                # Block login when the user's organization exists but has
                # not been activated by a Nexora administrator yet.
                profile = getattr(user, "staff_profile", None)
                if profile and profile.organization_id:
                    org = profile.organization
                    if not org.is_active:
                        user_login_failed.send(
                            sender=self.__class__,
                            credentials={"username": username},
                            request=request,
                        )
                        msg = (
                            "Your organization is pending administrator review. "
                            "You'll receive a notification once it's activated."
                        )
                        if not org.is_verified:
                            msg = (
                                "Your organization's email has not been verified yet. "
                                "Please check your inbox for the verification link."
                            )
                        return Response(
                            {"detail": msg, "code": "organization_inactive"},
                            status=status.HTTP_403_FORBIDDEN,
                        )

                # Check if MFA is enabled for this user
                mfa_enabled = is_mfa_enabled(user)
                mfa_required = is_mfa_required(user)
                mfa_enforcement = getattr(django_settings, "MFA_ENFORCEMENT", True)

                if mfa_enabled and mfa_enforcement:
                    # MFA is enabled - don't return tokens yet
                    # Create temporary MFA token
                    mfa_token = MFAToken.create_for_user(
                        user=user,
                        ip_address=get_client_ip(request),
                    )

                    # Build available methods for the client
                    from hmis.apps.core.mfa.models import UserWebAuthnCredential

                    available_methods = ["totp"]
                    if UserWebAuthnCredential.objects.filter(user=user).exists():
                        available_methods.append("webauthn")
                    available_methods.append("backup_code")

                    # Return MFA required response (without access tokens)
                    return Response(
                        {
                            "mfa_required": True,
                            "mfa_token": mfa_token.token,
                            "available_methods": available_methods,
                        }
                    )

                if mfa_required and not mfa_enabled:
                    # MFA is required but not set up - user needs to set it up
                    # Start the grace period if not already started
                    from hmis.apps.core.mfa.utils import (
                        is_mfa_grace_period_expired,
                        set_mfa_grace_deadline,
                    )

                    set_mfa_grace_deadline(user)

                    # Check if grace period already expired
                    grace_expired = is_mfa_grace_period_expired(user)

                    # Still return the tokens but flag that setup is needed
                    user_logged_in.send(sender=self.__class__, request=request, user=user)

                    response.data["mfa_setup_required"] = True
                    response.data["mfa_required"] = False
                    response.data["mfa_grace_expired"] = grace_expired

                    # Include deadline for frontend countdown
                    profile = getattr(user, "staff_profile", None)
                    if profile and profile.mfa_grace_deadline:
                        response.data["mfa_grace_deadline"] = profile.mfa_grace_deadline.isoformat()
                else:
                    # No MFA - proceed normally
                    user_logged_in.send(sender=self.__class__, request=request, user=user)
                    response.data["mfa_required"] = False

                # Check must_change_password flag
                if hasattr(user, "staff_profile") and user.staff_profile.must_change_password:
                    response.data["must_change_password"] = True
                else:
                    response.data["must_change_password"] = False

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
            permission_classes = [IsAuthenticated, WriteRequiresRolePermission]
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
            permission_classes = [IsAuthenticated, WriteRequiresRolePermission]
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
        if self.action in ["create", "destroy"]:
            permission_classes = [FacilityAdminPermission]
        else:
            permission_classes = [IsAuthenticated, WriteRequiresRolePermission]
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
        response_data = read_serializer.data

        # Include temp password (one-time, for credential display dialog)
        temp_password = getattr(staff_profile, "_temp_password", None)
        if temp_password:
            response_data["temp_password"] = temp_password

        # Optionally send welcome email with credentials
        send_email = request.data.get("send_email", False)
        if send_email and temp_password:
            from .services.email_service import send_welcome_email

            org_name = ""
            if staff_profile.organization:
                org_name = staff_profile.organization.name
            send_welcome_email(
                to_email=staff_profile.user.email,
                username=staff_profile.user.username,
                temp_password=temp_password,
                full_name=staff_profile.user.get_full_name(),
                organization_name=org_name,
            )
            response_data["email_sent"] = True

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
            permission_classes = [IsAuthenticated, WriteRequiresRolePermission]
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
    permission_classes = [IsAuthenticated, WriteRequiresRolePermission]
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
# Web Push Subscription Endpoints
# ============================================================================


class PushSubscriptionViewSet(viewsets.ModelViewSet):
    """
    Manage Web Push subscriptions for the authenticated user.

    POST   /api/push-subscriptions/          — Register a push subscription
    GET    /api/push-subscriptions/           — List user's subscriptions
    DELETE /api/push-subscriptions/{id}/      — Unsubscribe a specific subscription
    GET    /api/push-subscriptions/vapid-key/ — Get the VAPID public key
    """

    queryset = PushSubscription.objects.none()
    serializer_class = PushSubscriptionSerializer
    permission_classes = [IsAuthenticated, WriteRequiresRolePermission]
    http_method_names = ["get", "post", "delete", "head", "options"]

    def get_queryset(self):
        if getattr(self, "swagger_fake_view", False):
            return self.queryset
        return PushSubscription.objects.filter(user=self.request.user)

    def perform_create(self, serializer):
        # Upsert: if this endpoint already exists for this user, update it
        endpoint = serializer.validated_data["endpoint"]
        existing = PushSubscription.objects.filter(
            user=self.request.user,
            endpoint=endpoint,
        ).first()
        if existing:
            existing.p256dh = serializer.validated_data["p256dh"]
            existing.auth = serializer.validated_data["auth"]
            existing.user_agent = self.request.META.get("HTTP_USER_AGENT", "")[:300]
            existing.save(update_fields=["p256dh", "auth", "user_agent", "updated_at"])
            # Attach the existing instance so the response serializes it
            serializer.instance = existing
        else:
            serializer.save(
                user=self.request.user,
                user_agent=self.request.META.get("HTTP_USER_AGENT", "")[:300],
            )

    @action(
        detail=False,
        methods=["get"],
        url_path="vapid-key",
        permission_classes=[AllowAny],
    )
    def vapid_key(self, request):
        """Return the VAPID public key for client-side PushManager.subscribe()."""
        key = django_settings.VAPID_PUBLIC_KEY
        if not key:
            return Response(
                {"error": "Push notifications are not configured"},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )
        return Response({"vapid_public_key": key})


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
    permission_classes = [IsAuthenticated, WriteRequiresRolePermission]
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
# Subscription Plan ViewSet (SaaS Licensing)
# ============================================================================


class SubscriptionPlanViewSet(ReadOnCreateMixin, viewsets.ModelViewSet):
    """
    ViewSet for SubscriptionPlan CRUD operations.

    * All authenticated users can list / retrieve plans.
    * Only superusers can create, update, or delete plans.
    """

    queryset = SubscriptionPlan.objects.all()
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = ["name", "code"]
    ordering_fields = ["sort_order", "monthly_price", "name"]
    ordering = ["sort_order", "monthly_price"]

    def get_permissions(self):
        if self.action in ("create", "update", "partial_update", "destroy"):
            return [IsAdminUser()]
        return [IsAuthenticated()]

    def get_serializer_class(self):
        if self.action == "list":
            return SubscriptionPlanListSerializer
        if self.action == "create":
            return SubscriptionPlanCreateSerializer
        return SubscriptionPlanDetailSerializer


# ============================================================================
# Organization ViewSet (Multitenancy – Phase 1)
# ============================================================================


class OrganizationViewSet(viewsets.ModelViewSet):
    """
    ViewSet for Organization (tenant) CRUD operations.

    * Non-superusers can only see their own organization.
    * Superusers can list and manage all organizations.
    * Only admin/superuser can create, update, or delete organizations.
    """

    queryset = Organization.objects.select_related(
        "county", "sub_county", "subscription_plan"
    ).all()
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = ["name", "slug"]
    ordering_fields = ["name", "created_at"]
    ordering = ["name"]

    def get_permissions(self):
        """Restrict write operations to tenant admin roles or Nexora staff."""
        if self.action in ("create", "update", "partial_update", "destroy"):
            return [FacilityAdminPermission()]
        return [IsAuthenticated()]

    def get_queryset(self):
        """Scope to the user's own organization unless superuser."""
        qs = super().get_queryset()
        user = self.request.user
        if user.is_superuser:
            return qs
        profile = getattr(user, "staff_profile", None)
        if profile and profile.organization_id:
            return qs.filter(pk=profile.organization_id)
        return qs.none()

    def get_serializer_class(self):
        """Return the appropriate serializer for the action."""
        if self.action == "list":
            return OrganizationListSerializer
        return OrganizationDetailSerializer

    @action(detail=True, methods=["get"])
    def facilities(self, request, pk=None):
        """List facilities under this organization."""
        organization = self.get_object()
        facilities = organization.facilities.select_related("county", "sub_county", "ward").all()
        serializer = FacilityListSerializer(facilities, many=True)
        return Response(serializer.data)

    @action(detail=True, methods=["get"], url_path="token-usage")
    def token_usage(self, request, pk=None):
        """
        Return AI token usage summary for this organization.

        Response shape::

            {
                "monthly_ai_tokens": 10000 | null,
                "ai_tokens_used": 2345,
                "ai_tokens_remaining": 7655 | null,
                "ai_tokens_reset_at": "2026-05-01T00:00:00Z" | null,
                "facilities": [
                    {"id": 1, "name": "Demo Clinic", "tokens_used": 1200},
                    ...
                ]
            }
        """
        from django.db.models import Sum

        from hmis.apps.ai.models import (
            AICarePlanResult,
            AICDSResult,
            AIDischargeResult,
            AIICURiskResult,
            AIInvestigationSuggestResult,
            AILabInterpretResult,
            AISurgicalChecklistSessionResult,
            AISurgicalPostOpCarePlanResult,
            AISurgicalPreOpAssessResult,
        )

        organization = self.get_object()

        ai_models = [
            AICarePlanResult,
            AICDSResult,
            AILabInterpretResult,
            AIDischargeResult,
            AIICURiskResult,
            AIInvestigationSuggestResult,
            AISurgicalPreOpAssessResult,
            AISurgicalChecklistSessionResult,
            AISurgicalPostOpCarePlanResult,
        ]

        # Per-facility aggregation across all AI result tables
        facility_totals: dict[int, int] = {}
        for model in ai_models:
            rows = (
                model.objects.filter(facility__organization=organization)
                .values("facility_id")
                .annotate(total=Sum("total_tokens"))
            )
            for row in rows:
                fid = row["facility_id"]
                facility_totals[fid] = facility_totals.get(fid, 0) + (row["total"] or 0)

        facilities = organization.facilities.filter(is_active=True).order_by("name")
        facility_list = [
            {
                "id": f.id,
                "name": f.name,
                "tokens_used": facility_totals.get(f.id, 0),
            }
            for f in facilities
        ]

        return Response(
            {
                "monthly_ai_tokens": organization.monthly_ai_tokens,
                "ai_tokens_used": organization.ai_tokens_used,
                "ai_tokens_remaining": organization.ai_tokens_remaining,
                "ai_tokens_reset_at": (
                    organization.ai_tokens_reset_at.isoformat()
                    if organization.ai_tokens_reset_at
                    else None
                ),
                "facilities": facility_list,
            }
        )


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

    queryset = Facility.objects.select_related("county", "sub_county", "ward", "organization").all()
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
        Write operations require facility-admin privileges (Nexora staff
        or tenant ADMIN/ORG-ADMIN/OWNER roles).
        """
        if self.action in ["create", "update", "partial_update", "destroy"]:
            permission_classes = [IsAuthenticated, FacilityAdminPermission]
        else:
            permission_classes = [IsAuthenticated, WriteRequiresRolePermission]
        return [permission() for permission in permission_classes]

    def get_queryset(self):
        """
        Scope facilities to the user's organization unless superuser.

        Supports filtering by:
        * ``level`` – KEPH facility level.
        * ``ownership`` – Ownership type.
        * ``county`` – County ID.
        * ``is_active`` – Active status.
        * ``sha_contracted`` – SHA contract status.
        * Any ``has_*`` module flag (e.g. ``?has_laboratory=true``).
        """
        qs = super().get_queryset()

        # --- Tenant scoping ---
        user = self.request.user
        if not user.is_superuser:
            profile = getattr(user, "staff_profile", None)
            if profile and profile.organization_id:
                qs = qs.filter(organization_id=profile.organization_id)
            else:
                return qs.none()
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

    def create(self, request, *args, **kwargs):
        """Create facility and return the full detail representation."""
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        # Enforce subscription limit
        org = self._get_org_for_limit_check(request)
        if org and not org.can_add_facility():
            return Response(
                {
                    "detail": (
                        f"Facility limit reached ({org.max_facilities}). "
                        "Upgrade your subscription plan to add more facilities."
                    ),
                    "code": "facility_limit_reached",
                },
                status=status.HTTP_403_FORBIDDEN,
            )

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
        # Re-serialize with FacilityDetailSerializer so the response
        # includes id, modules, county_name, timestamps, etc.
        read_serializer = FacilityDetailSerializer(facility)
        return Response(read_serializer.data, status=status.HTTP_201_CREATED)

    def _get_org_for_limit_check(self, request):
        """Resolve the Organization for subscription limit checks."""
        if request.user.is_superuser:
            return None  # Superusers bypass limits
        profile = getattr(request.user, "staff_profile", None)
        if profile and profile.organization:
            return profile.organization
        return None

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
        responses={
            200: inline_serializer(
                "DefaultModulesResponse",
                fields={
                    "level": serializers.CharField(),
                    "modules": serializers.DictField(),
                },
            )
        },
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

    @extend_schema(
        summary="List facilities accessible to the current user",
        responses={200: FacilityListSerializer(many=True)},
    )
    @action(detail=False, methods=["get"], url_path="my-facilities")
    def my_facilities(self, request):
        """
        Return facilities the current user is assigned to.

        Derives facilities from active OrgMembership records.
        Superusers get all org facilities (same as the list endpoint).
        """
        if request.user.is_superuser:
            facilities = self.filter_queryset(self.get_queryset()).filter(is_active=True)
        else:
            profile = getattr(request.user, "staff_profile", None)
            if not profile:
                return Response([])
            from hmis.apps.core.models import OrgMembership

            # Collect facility IDs from all ACTIVE memberships
            facility_ids = set()
            for membership in profile.memberships.filter(
                status=OrgMembership.MembershipStatus.ACTIVE
            ):
                facility_ids.update(membership.facilities.values_list("pk", flat=True))
            facilities = Facility.objects.filter(
                pk__in=facility_ids, is_active=True
            ).select_related("county", "sub_county", "ward", "organization")

        serializer = FacilityListSerializer(facilities, many=True)
        return Response(serializer.data)

    @extend_schema(
        summary="Fetch and cache DHA registry data for this facility",
        responses={200: FacilityDetailSerializer},
    )
    @action(detail=True, methods=["post"], url_path="sync-dha-registry")
    def sync_dha_registry(self, request, pk=None):
        """
        Fetch the facility's record from the DHA ILM registry using its
        available identifier (mfl_code, sha_facility_code) and cache the
        result (PII encrypted, non-PII in JSON).

        Identifier priority (DHA accepts: fid, fr-code, registration-number):
        1. sha_facility_code → identifier-type "fr-code" (FID-XX-XXXXXX-X format)
        2. mfl_code          → identifier-type "fr-code" (numeric MFL code)

        Returns the updated facility detail with all cached DHA fields.
        """
        facility = self.get_object()

        # Build ordered list of (identifier, identifier_type) to try
        # DHA valid types: fid, fr-code, registration-number
        candidates: list[tuple[str, str]] = []
        if facility.sha_facility_code:
            candidates.append((facility.sha_facility_code, "fr-code"))
        if facility.mfl_code:
            candidates.append((facility.mfl_code, "fr-code"))

        if not candidates:
            return Response(
                {"detail": "Facility has no MFL code or SHA facility code."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        from hmis.apps.billing.services.dha_errors import DHAError
        from hmis.apps.billing.services.ilm_registries_service import IlmRegistriesService

        service = IlmRegistriesService()
        result = None
        last_error: DHAError | None = None

        for identifier, identifier_type in candidates:
            try:
                result = service.search_facility(
                    identifier=identifier,
                    identifier_type=identifier_type,
                    facility=facility,
                    user=request.user,
                )
                if result.status_code == 200 and result.payload:
                    last_error = None
                    break
            except DHAError as exc:
                last_error = exc
                result = None
                continue

        if last_error is not None:
            return Response(
                {"detail": f"DHA registry lookup failed: {last_error}"},
                status=status.HTTP_502_BAD_GATEWAY,
            )

        if result is None:
            return Response(
                {"detail": "DHA registry lookup failed for all identifiers."},
                status=status.HTTP_502_BAD_GATEWAY,
            )

        payload = result.payload
        if not payload:
            return Response(
                {"detail": "Empty response from DHA registry."},
                status=status.HTTP_502_BAD_GATEWAY,
            )

        # DHA may wrap in results/data array
        data = payload
        if isinstance(data, dict):
            data = data.get("results", data.get("data", data))
        if isinstance(data, list):
            data = data[0] if data else {}

        if not isinstance(data, dict) or not data:
            return Response(
                {"detail": "Could not parse DHA registry response."},
                status=status.HTTP_502_BAD_GATEWAY,
            )

        facility.update_from_dha_response(data)
        facility.save()

        AuditLog.log(
            action="facility_dha_registry_synced",
            user=request.user,
            resource_type="Facility",
            resource_id=facility.id,
            ip_address=_get_client_ip(request),
            user_agent=request.META.get("HTTP_USER_AGENT", ""),
            details={
                "mfl_code": facility.mfl_code,
                "sha_facility_code": facility.sha_facility_code,
            },
        )

        serializer = FacilityDetailSerializer(facility, context={"request": request})
        return Response(serializer.data)


# =============================================================================
# DHIS2 Configuration ViewSet
# =============================================================================


class DHIS2ConfigViewSet(TenantScopedViewMixin, viewsets.ModelViewSet):
    """
    CRUD for DHIS2/KHIS connection configurations.

    Scoped to the user's organization (one active config per org).
    Only admin users can create/update/delete configs.

    Extra actions:
      * ``POST /dhis2-configs/{id}/test_connection/`` — verify DHIS2 connectivity.
    """

    queryset = DHIS2Config.objects.select_related("organization").all()
    tenant_scope = "organization"
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = ["name", "base_url"]
    ordering_fields = ["name", "environment", "is_active", "created_at"]
    ordering = ["name"]

    def get_serializer_class(self):
        if self.action == "list":
            return DHIS2ConfigListSerializer
        if self.action == "create":
            return DHIS2ConfigCreateSerializer
        if self.action in ("update", "partial_update"):
            return DHIS2ConfigUpdateSerializer
        return DHIS2ConfigDetailSerializer

    def get_permissions(self):
        if self.action in ("list", "retrieve"):
            return [IsAuthenticated()]
        return [IsAdminUser()]

    def perform_create(self, serializer):
        instance = serializer.save(**self.get_tenant_save_kwargs())
        AuditLog.log(
            action="dhis2_config_created",
            user=self.request.user,
            resource_type="DHIS2Config",
            resource_id=instance.id,
            ip_address=_get_client_ip(self.request),
            user_agent=self.request.META.get("HTTP_USER_AGENT", ""),
            details={"name": instance.name, "base_url": instance.base_url},
        )

    def perform_update(self, serializer):
        instance = serializer.save()
        AuditLog.log(
            action="dhis2_config_updated",
            user=self.request.user,
            resource_type="DHIS2Config",
            resource_id=instance.id,
            ip_address=_get_client_ip(self.request),
            user_agent=self.request.META.get("HTTP_USER_AGENT", ""),
            details={
                "name": instance.name,
                "updated_fields": list(serializer.validated_data.keys()),
            },
        )

    def perform_destroy(self, instance):
        AuditLog.log(
            action="dhis2_config_deleted",
            user=self.request.user,
            resource_type="DHIS2Config",
            resource_id=instance.id,
            ip_address=_get_client_ip(self.request),
            user_agent=self.request.META.get("HTTP_USER_AGENT", ""),
            details={"name": instance.name},
        )
        instance.delete()

    def create(self, request, *args, **kwargs):
        """Create config and return full detail representation."""
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        self.perform_create(serializer)
        detail = DHIS2ConfigDetailSerializer(serializer.instance)
        return Response(detail.data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=["post"], url_path="test-connection")
    def test_connection(self, request, pk=None):
        """
        Test connectivity to the configured DHIS2 instance.

        Sends a lightweight ``GET /api/me`` request and returns the
        authenticated user's display name if successful, or an error
        message with HTTP status details on failure.
        """
        import requests as http_requests

        config = self.get_object()
        url = f"{config.api_url}/api/me"
        try:
            resp = http_requests.get(
                url,
                auth=(config.username, config.get_password()),
                timeout=15,
            )
            if resp.ok:
                data = resp.json()
                return Response(
                    {
                        "status": "ok",
                        "dhis2_user": data.get("displayName", data.get("name", "")),
                        "server_version": data.get("serverVersion", ""),
                    }
                )
            return Response(
                {"status": "error", "detail": f"HTTP {resp.status_code}: {resp.reason}"},
                status=status.HTTP_502_BAD_GATEWAY,
            )
        except http_requests.ConnectionError:
            return Response(
                {"status": "error", "detail": "Connection refused or DNS failure."},
                status=status.HTTP_502_BAD_GATEWAY,
            )
        except http_requests.Timeout:
            return Response(
                {"status": "error", "detail": "Connection timed out (15s)."},
                status=status.HTTP_504_GATEWAY_TIMEOUT,
            )
        except Exception as exc:
            return Response(
                {"status": "error", "detail": str(exc)},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )


# =============================================================================
# PKI & Digital Signature ViewSets (DHA Gap #32 — Sprint 3.C)
# =============================================================================


class CertificateViewSet(viewsets.GenericViewSet, ListModelMixin, RetrieveModelMixin):
    """
    ViewSet for certificate management.

    List and verify user certificates. Issue and revoke certificates (admin only).
    """

    queryset = UserCertificate.objects.select_related("user", "certificate_authority").all()
    serializer_class = UserCertificateSerializer
    permission_classes = [IsAuthenticated, WriteRequiresRolePermission]
    filterset_fields = ["user", "is_revoked"]
    ordering = ["-created_at"]

    def get_queryset(self):
        qs = super().get_queryset()
        if not (self.request.user.is_staff or self.request.user.is_superuser):
            qs = qs.filter(user=self.request.user)
        return qs

    @action(detail=False, methods=["get"])
    def ca(self, request):
        """List active Certificate Authorities (public info only)."""
        cas = CertificateAuthority.objects.filter(is_active=True)
        serializer = CertificateAuthoritySerializer(cas, many=True)
        return Response(serializer.data)

    @action(detail=False, methods=["post"], permission_classes=[IsAdminUser])
    def issue(self, request):
        """Issue a new certificate for a user (admin only)."""
        from .services.pki_service import PKIService

        user_id = request.data.get("user_id")
        if not user_id:
            return Response({"error": "user_id is required"}, status=status.HTTP_400_BAD_REQUEST)

        from django.contrib.auth import get_user_model

        User = get_user_model()
        try:
            target_user = User.objects.get(pk=user_id)
        except User.DoesNotExist:
            return Response({"error": "User not found"}, status=status.HTTP_404_NOT_FOUND)

        service = PKIService()
        try:
            cert = service.issue_user_certificate(
                user=target_user,
                validity_years=int(request.data.get("validity_years", 2)),
            )
        except ValueError as e:
            return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)

        return Response(
            UserCertificateSerializer(cert).data,
            status=status.HTTP_201_CREATED,
        )

    @action(detail=True, methods=["post"], permission_classes=[IsAdminUser])
    def revoke(self, request, pk=None):
        """Revoke a user certificate (admin only)."""
        from .services.pki_service import PKIService

        cert = self.get_object()
        serializer = RevokeCertificateRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        if cert.is_revoked:
            return Response(
                {"error": "Certificate is already revoked"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        service = PKIService()
        service.revoke_certificate(
            cert=cert,
            reason=serializer.validated_data["reason"],
            user=request.user,
        )
        return Response(UserCertificateSerializer(cert).data)

    @action(detail=True, methods=["get"])
    def verify(self, request, pk=None):
        """Verify a certificate's validity."""
        from .services.pki_service import PKIService

        cert = self.get_object()
        service = PKIService()
        result = service.verify_certificate(cert)
        return Response(
            {
                "valid": result.valid,
                "subject": result.subject,
                "issuer": result.issuer,
                "serial_number": result.serial_number,
                "valid_from": result.valid_from.isoformat() if result.valid_from else None,
                "valid_to": result.valid_to.isoformat() if result.valid_to else None,
                "is_expired": result.is_expired,
                "is_revoked": result.is_revoked,
                "ca_active": result.ca_active,
                "errors": result.errors,
                "chain": result.chain,
            }
        )

    @action(detail=False, methods=["post"], permission_classes=[IsAdminUser])
    def create_intermediate(self, request):
        """Create an intermediate CA signed by the root CA (admin only)."""
        from .services.pki_service import PKIService

        name = request.data.get("name", "Facility Intermediate CA")
        org = request.data.get("org", "Health Facility")
        country = request.data.get("country", "KE")
        key_size = int(request.data.get("key_size", 2048))
        validity_years = int(request.data.get("validity_years", 5))
        parent_ca_id = request.data.get("parent_ca_id")

        if parent_ca_id:
            try:
                parent_ca = CertificateAuthority.objects.get(pk=parent_ca_id, is_active=True)
            except CertificateAuthority.DoesNotExist:
                return Response(
                    {"error": "Specified parent CA not found or inactive"},
                    status=status.HTTP_404_NOT_FOUND,
                )
        else:
            parent_ca = CertificateAuthority.objects.filter(is_root=True, is_active=True).first()
            if parent_ca is None:
                return Response(
                    {"error": "No active root CA found. Initialize one first."},
                    status=status.HTTP_400_BAD_REQUEST,
                )

        service = PKIService()
        try:
            ca = service.create_intermediate_ca(
                parent_ca=parent_ca,
                name=name,
                org=org,
                country=country,
                key_size=key_size,
                validity_years=validity_years,
            )
        except ValueError as e:
            return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)

        return Response(
            CertificateAuthoritySerializer(ca).data,
            status=status.HTTP_201_CREATED,
        )


class DocumentSignatureViewSet(viewsets.GenericViewSet, ListModelMixin, RetrieveModelMixin):
    """
    ViewSet for document signatures.

    Sign and verify clinical documents.
    """

    queryset = DocumentSignature.objects.select_related("signer", "certificate").all()
    serializer_class = DocumentSignatureSerializer
    permission_classes = [IsAuthenticated, WriteRequiresRolePermission]
    filterset_fields = ["document_type", "signer"]
    ordering = ["-signed_at"]

    @action(detail=False, methods=["post"])
    def sign(self, request):
        """Sign a clinical document."""
        from .services.signing_service import DocumentSigningService

        serializer = SignDocumentRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        service = DocumentSigningService()
        try:
            sig = service.sign_document(
                document_type=serializer.validated_data["document_type"],
                document_id=serializer.validated_data["document_id"],
                user=request.user,
            )
        except ValueError as e:
            return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)

        return Response(
            DocumentSignatureSerializer(sig).data,
            status=status.HTTP_201_CREATED,
        )

    @action(detail=False, methods=["post"])
    def verify(self, request):
        """Verify a document signature."""
        from .services.signing_service import DocumentSigningService

        serializer = VerifySignatureRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        data = serializer.validated_data
        if data.get("signature_id"):
            try:
                sig = DocumentSignature.objects.get(pk=data["signature_id"])
            except DocumentSignature.DoesNotExist:
                return Response(
                    {"error": "Signature not found"},
                    status=status.HTTP_404_NOT_FOUND,
                )
        else:
            sig = (
                DocumentSignature.objects.filter(
                    document_type=data["document_type"],
                    document_id=data["document_id"],
                )
                .order_by("-signed_at")
                .first()
            )
            if sig is None:
                return Response(
                    {"error": "No signature found for this document"},
                    status=status.HTTP_404_NOT_FOUND,
                )

        service = DocumentSigningService()
        result = service.verify_signature(sig)
        return Response(
            {
                "valid": result.valid,
                "document_type": result.document_type,
                "document_id": result.document_id,
                "signer_username": result.signer_username,
                "signer_name": result.signer_name,
                "signed_at": result.signed_at,
                "certificate_serial": result.certificate_serial,
                "certificate_valid": result.certificate_valid,
                "content_matches": result.content_matches,
                "signature_valid": result.signature_valid,
                "errors": result.errors,
            }
        )

    @action(detail=False, methods=["get"])
    def for_document(self, request):
        """Get all signatures for a specific document."""
        doc_type = request.query_params.get("type")
        doc_id = request.query_params.get("id")
        if not doc_type or not doc_id:
            return Response(
                {"error": "Both 'type' and 'id' query parameters are required"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        sigs = DocumentSignature.objects.filter(
            document_type=doc_type, document_id=doc_id
        ).order_by("-signed_at")
        return Response(DocumentSignatureSerializer(sigs, many=True).data)
