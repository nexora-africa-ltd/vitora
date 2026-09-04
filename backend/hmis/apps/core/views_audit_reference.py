# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
# ruff: noqa: ARG002, F401, F811, SIM105
"""Core views audit reference for Vitora HMIS.

What this file is for:
- Implement views audit reference logic for the core domain.

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
    Country,
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
    AuthTokenRequestSerializer,
    AuthTokenResponseSerializer,
    CertificateAuthoritySerializer,
    CodeSystemSerializer,
    CountrySerializer,
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

logger = logging.getLogger(__name__)


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
                operating_mode = str(getattr(fac, "operating_mode", "") or "")
                deployment_profile = (
                    "lis_standalone" if operating_mode == "STANDALONE_LAB" else "full_hmis"
                )
                facility_data = {
                    "id": fac.id,
                    "mfl_code": fac.mfl_code,
                    "name": fac.name,
                    "level": fac.level,
                    "modules": fac.modules,
                    "operating_mode": operating_mode,
                    "deployment_profile": deployment_profile,
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
    permission_classes = [IsAuthenticated, WriteRequiresRolePermission, ReadRequiresModelPermission]
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
    permission_classes = [IsAuthenticated, WriteRequiresRolePermission, ReadRequiresModelPermission]
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
    permission_classes = [IsAuthenticated, WriteRequiresRolePermission, ReadRequiresModelPermission]
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

    def get_queryset(self):
        queryset = super().get_queryset()
        country_code = (self.request.query_params.get("country") or "KE").strip().upper()
        return queryset.filter(country__code=country_code)


class CountryViewSet(ListModelMixin, RetrieveModelMixin, viewsets.GenericViewSet):
    """ViewSet for listing supported countries."""

    queryset = Country.objects.filter(is_active=True)
    serializer_class = CountrySerializer
    permission_classes = [AllowAny]
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = ["name", "code"]
    ordering_fields = ["name", "code"]
    ordering = ["name"]
    pagination_class = None


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
        country_code = self.request.query_params.get("country")
        if country_code:
            queryset = queryset.filter(county__country__code=country_code.strip().upper())
        county_id = self.request.query_params.get("county")
        if county_id:
            queryset = queryset.filter(county_id=county_id)
        return queryset


class WardViewSet(ListModelMixin, RetrieveModelMixin, viewsets.GenericViewSet):
    """ViewSet for listing and retrieving wards."""

    queryset = Ward.objects.select_related("sub_county").all()
    serializer_class = WardSerializer
    permission_classes = [IsAuthenticated, WriteRequiresRolePermission, ReadRequiresModelPermission]
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

    @extend_schema(
        request=AuthTokenRequestSerializer,
        responses={200: AuthTokenResponseSerializer},
    )
    def post(self, request, *args, **kwargs):
        """Handle token obtain request with audit logging and MFA."""
        response = super().post(request, *args, **kwargs)

        if response.status_code == 200:
            # Login successful - check for MFA
            from django.contrib.auth import get_user_model

            from hmis.apps.core.mfa.models import MFAToken
            from hmis.apps.core.mfa.utils import get_client_ip, is_mfa_enabled, is_mfa_required

            User = get_user_model()
            login_identifier = str(request.data.get("username") or "").strip()
            try:
                user = (
                    User.objects.filter(
                        models.Q(username__iexact=login_identifier)
                        | models.Q(email__iexact=login_identifier)
                    )
                    .select_related("staff_profile")
                    .first()
                )
                if user is None:
                    raise User.DoesNotExist

                # ── Organization activation gate ─────────────────────────
                # Block login when the user's organization exists but has
                # not been activated by a Nexora administrator yet.
                profile = getattr(user, "staff_profile", None)
                if profile and profile.organization_id:
                    org = profile.organization
                    if not org.is_active:
                        user_login_failed.send(
                            sender=self.__class__,
                            credentials={"username": login_identifier},
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
                    reset_token = PasswordResetToken.objects.create(user=user)
                    response.data["password_reset_token"] = str(reset_token.token)
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
