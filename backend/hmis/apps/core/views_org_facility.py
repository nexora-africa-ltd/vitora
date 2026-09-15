# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
# ruff: noqa: ARG002, E402, F401, F811
"""Core views org facility for Vitora HMIS.

What this file is for:
- Implement views org facility logic for the core domain.

How to use it:
- Import classes and functions from this module in Django app code and tests.

Supported inputs/args:
- Python imports and Django ORM/runtime inputs; no standalone CLI arguments.
"""

import logging
import uuid
from datetime import timedelta
from decimal import Decimal, InvalidOperation

import requests
from django.apps import apps
from django.conf import settings as django_settings
from django.contrib.auth.models import Permission
from django.contrib.auth.signals import user_logged_in, user_login_failed
from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import models, transaction
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
from rest_framework.permissions import AllowAny, BasePermission, IsAdminUser, IsAuthenticated
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
    SubscriptionPeriod,
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
    BillingContactSerializer,
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
    SubscriptionPeriodSerializer,
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
from .views_audit_reference import _get_client_ip, _query_param_truthy

logger = logging.getLogger(__name__)


class IsSuperuserPermission(BasePermission):
    """Restrict platform billing and entitlement operations to Nexora superusers."""

    message = "Only Nexora superusers can manage subscription billing."

    def has_permission(self, request, view):  # noqa: ARG002
        return bool(request.user and request.user.is_authenticated and request.user.is_superuser)


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
    permission_classes = [IsAuthenticated, WriteRequiresRolePermission, ReadRequiresModelPermission]
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
    permission_classes = [IsAuthenticated, WriteRequiresRolePermission, ReadRequiresModelPermission]
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
                {
                    "configured": False,
                    "message": "Push notifications are not configured",
                }
            )
        return Response({"configured": True, "vapid_public_key": key})


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
    except (AttributeError, TypeError, ValueError):
        return None


class FeatureFlagViewSet(ListModelMixin, viewsets.GenericViewSet):
    """
    Read-only API for feature flags.

    Allows authenticated clients to query which features are enabled.
    Feature flags are managed exclusively via Django admin.
    """

    queryset = FeatureFlag.objects.all()
    serializer_class = FeatureFlagSerializer
    permission_classes = [IsAuthenticated, WriteRequiresRolePermission, ReadRequiresModelPermission]
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
            return [IsSuperuserPermission()]
        return [IsAuthenticated()]

    def get_serializer_class(self):
        if self.action == "list":
            return SubscriptionPlanListSerializer
        if self.action == "create":
            return SubscriptionPlanCreateSerializer
        return SubscriptionPlanDetailSerializer


class SubscriptionPeriodViewSet(viewsets.ModelViewSet):
    """Platform-only subscription billing ledger and payment confirmation API."""

    queryset = SubscriptionPeriod.objects.select_related("organization", "plan", "confirmed_by")
    permission_classes = [IsSuperuserPermission]
    serializer_class = SubscriptionPeriodSerializer

    @action(detail=True, methods=["post"])
    def confirm(self, request, pk=None):
        period = self.get_object()
        reference = str(request.data.get("payment_reference") or "").strip()
        try:
            period.confirm_payment(reference, confirmed_by=request.user)
        except DjangoValidationError as exc:
            return Response({"detail": exc.messages}, status=status.HTTP_400_BAD_REQUEST)
        return Response(self.get_serializer(period).data)


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

    def partial_update(self, request, *args, **kwargs):
        """Keep commercial entitlement changes exclusive to the billing ledger."""
        restricted = {
            "subscription_plan",
            "subscription_status",
            "subscription_valid_until",
            "ai_tokens_used",
            "ai_tokens_reset_at",
        }
        if restricted.intersection(request.data):
            return Response(
                {
                    "detail": "Subscription entitlement can only be changed through a confirmed subscription period."
                },
                status=status.HTTP_403_FORBIDDEN,
            )
        return super().partial_update(request, *args, **kwargs)

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

    @action(detail=True, methods=["get"], url_path="account-billing")
    def account_billing(self, request, pk=None):
        """Return the tenant's read-only plan, usage, and subscription history."""
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
        periods = organization.subscription_periods.select_related("plan").all()
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
        aggregated_used = 0
        for model in ai_models:
            aggregated_used += (
                model.objects.filter(facility__organization=organization).aggregate(
                    total=Sum("total_tokens")
                )["total"]
                or 0
            )
        effective_used = max(int(organization.ai_tokens_used or 0), int(aggregated_used))
        effective_remaining = None
        if organization.monthly_ai_tokens is not None:
            effective_remaining = max(0, organization.monthly_ai_tokens - effective_used)
        return Response(
            {
                "organization_id": organization.id,
                "plan": (
                    SubscriptionPlanDetailSerializer(organization.subscription_plan).data
                    if organization.subscription_plan
                    else None
                ),
                "subscription_status": organization.subscription_status,
                "subscription_valid_until": organization.subscription_valid_until,
                "ai_tokens": {
                    "monthly": organization.monthly_ai_tokens,
                    "used": effective_used,
                    "remaining": effective_remaining,
                    "reset_at": organization.ai_tokens_reset_at,
                },
                "periods": SubscriptionPeriodSerializer(periods, many=True).data,
            }
        )

    @action(detail=True, methods=["get", "patch"], url_path="billing-contact")
    def billing_contact(self, request, pk=None):
        """Read or update organization billing contact details only."""
        organization = self.get_object()
        if request.method == "GET":
            return Response(BillingContactSerializer(organization).data)
        if not FacilityAdminPermission().has_permission(request, self):
            return Response(
                {"detail": "Only organization administrators can update billing contact details."},
                status=status.HTTP_403_FORBIDDEN,
            )
        serializer = BillingContactSerializer(organization, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)

    @action(detail=True, methods=["post"], url_path="paystack-checkout")
    def paystack_checkout(self, request, pk=None):
        """Create a pending period and initiate a Paystack hosted checkout."""
        if not FacilityAdminPermission().has_permission(request, self):
            return Response(
                {"detail": "Only organization administrators can initiate subscription payment."},
                status=status.HTTP_403_FORBIDDEN,
            )
        organization = self.get_object()
        plan_id = request.data.get("plan_id")
        interval = str(request.data.get("billing_interval") or "MONTHLY").upper()
        if interval not in SubscriptionPeriod.BillingInterval.values:
            return Response({"detail": "billing_interval must be MONTHLY or ANNUAL."}, status=400)
        try:
            plan = SubscriptionPlan.objects.get(pk=plan_id, is_active=True)
        except (SubscriptionPlan.DoesNotExist, TypeError, ValueError):
            return Response({"detail": "An active subscription plan is required."}, status=400)
        if not organization.contact_email:
            return Response(
                {"detail": "Set an organization contact email before initiating payment."},
                status=400,
            )

        amount = plan.monthly_price if interval == "MONTHLY" else plan.annual_price
        if amount <= 0:
            return Response({"detail": "This plan does not require a paid checkout."}, status=400)
        secret_key = getattr(django_settings, "PAYSTACK_SECRET_KEY", "")
        if not secret_key:
            return Response({"detail": "Paystack checkout is not configured."}, status=503)

        now = timezone.now()
        current_end = organization.subscription_valid_until
        if current_end is None:
            latest_period = (
                organization.subscription_periods.filter(status=SubscriptionPeriod.Status.PAID)
                .order_by("-period_end")
                .first()
            )
            current_end = latest_period.period_end if latest_period else None
        period_start = max(now, current_end) if current_end else now
        period = SubscriptionPeriod.objects.create(
            organization=organization,
            plan=plan,
            billing_interval=interval,
            amount=amount,
            currency="KES",
            period_start=period_start,
            period_end=period_start + timedelta(days=365 if interval == "ANNUAL" else 30),
        )
        reference = f"VITORA-{organization.id}-{period.id}-{uuid.uuid4().hex[:10]}"
        payer_full_name = request.user.get_full_name().strip() or request.user.username
        first_name, _, last_name = payer_full_name.partition(" ")
        payload = {
            "email": organization.contact_email,
            "first_name": first_name,
            "last_name": last_name,
            "amount": int(amount * 100),
            "currency": "KES",
            "reference": reference,
            "metadata": {
                "organization_id": organization.id,
                "subscription_period_id": period.id,
                "payer_full_name": payer_full_name,
                "custom_fields": [
                    {
                        "display_name": "Organization",
                        "variable_name": "organization_name",
                        "value": organization.name,
                    },
                    {
                        "display_name": "Contact name",
                        "variable_name": "payer_full_name",
                        "value": payer_full_name,
                    },
                ],
            },
        }
        callback_url = getattr(django_settings, "PAYSTACK_CALLBACK_URL", "")
        if callback_url:
            payload["callback_url"] = callback_url
        try:
            response = requests.post(
                "https://api.paystack.co/transaction/initialize",
                json=payload,
                headers={"Authorization": f"Bearer {secret_key}"},
                timeout=15,
            )
            response.raise_for_status()
            data = response.json().get("data") or {}
            authorization_url = data.get("authorization_url")
            if not authorization_url:
                raise requests.RequestException("Paystack did not return an authorization URL.")
        except (requests.RequestException, ValueError) as exc:
            period.delete()
            logger.warning(
                "Paystack checkout initialization failed for organization %s: %s",
                organization.id,
                exc,
            )
            return Response({"detail": "Unable to initiate Paystack checkout."}, status=502)
        period.payment_reference = str(data.get("reference") or reference)
        period.save(update_fields=["payment_reference", "updated_at"])
        return Response(
            {"authorization_url": authorization_url, "reference": period.payment_reference},
            status=201,
        )

    @action(detail=True, methods=["post"], url_path="paystack-status")
    def paystack_status(self, request, pk=None):
        """Reconcile a Paystack browser return when a webhook is delayed."""
        if not FacilityAdminPermission().has_permission(request, self):
            return Response(
                {"detail": "Only organization administrators can reconcile subscription payment."},
                status=status.HTTP_403_FORBIDDEN,
            )
        organization = self.get_object()
        reference = str(request.data.get("reference") or "").strip()
        if not reference:
            return Response(
                {"detail": "Payment reference is required."}, status=status.HTTP_400_BAD_REQUEST
            )
        try:
            period = organization.subscription_periods.get(payment_reference=reference)
        except SubscriptionPeriod.DoesNotExist:
            return Response(
                {"detail": "Subscription payment was not found."}, status=status.HTTP_404_NOT_FOUND
            )
        secret_key = getattr(django_settings, "PAYSTACK_SECRET_KEY", "")
        if not secret_key:
            return Response(
                {"detail": "Paystack checkout is not configured."},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )
        try:
            verification = requests.get(
                f"https://api.paystack.co/transaction/verify/{reference}",
                headers={"Authorization": f"Bearer {secret_key}"},
                timeout=15,
            )
            verification.raise_for_status()
            payment = verification.json().get("data") or {}
        except (requests.RequestException, ValueError):
            return Response(
                {"detail": "Unable to verify Paystack transaction."},
                status=status.HTTP_502_BAD_GATEWAY,
            )
        if payment.get("status") != "success":
            return Response(
                {"detail": "Payment is still pending."}, status=status.HTTP_409_CONFLICT
            )
        if (
            payment.get("currency") != period.currency
            or Decimal(str(payment.get("amount", 0))) != period.amount * 100
        ):
            return Response(
                {"detail": "Payment amount or currency does not match the subscription period."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        period.confirm_payment(reference)
        return Response(SubscriptionPeriodSerializer(period).data)


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
            permission_classes = [
                IsAuthenticated,
                FacilityAdminPermission,
                ReadRequiresModelPermission,
            ]
        else:
            permission_classes = [
                IsAuthenticated,
                WriteRequiresRolePermission,
                ReadRequiresModelPermission,
            ]
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
        for param in [
            "level",
            "level_subtype",
            "ownership",
            "county",
            "is_active",
            "sha_contracted",
        ]:
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
            "has_hdu",
            "has_nbu",
            "has_maternity",
            "has_mortuary",
            "has_blood_bank",
            "has_procedures",
            "has_analytics",
        ]
        for field in module_fields:
            value = self.request.query_params.get(field)
            if value is not None:
                qs = qs.filter(**{field: _query_param_truthy(value)})

        return qs

    def create(self, request, *args, **kwargs):
        """Create facility and return the full detail representation."""
        # Auto-assign the user's organization if not provided.  Without this,
        # facilities created by tenant admins (e.g. via the onboarding wizard)
        # would have organization=NULL and become invisible to org-scoped
        # queries (myFacilities, list filters, etc.).
        if not request.user.is_superuser and "organization" not in request.data:
            profile = getattr(request.user, "staff_profile", None)
            if profile and profile.organization_id:
                # request.data may be immutable (e.g. QueryDict); copy first.
                data = request.data.copy() if hasattr(request.data, "copy") else dict(request.data)
                data["organization"] = profile.organization_id
                serializer = self.get_serializer(data=data)
            else:
                serializer = self.get_serializer(data=request.data)
        else:
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

            # Collect facility IDs from all ACTIVE memberships plus direct
            # StaffProfile assignments (primary + secondary).
            facility_ids = set()
            for membership in profile.memberships.filter(
                status=OrgMembership.MembershipStatus.ACTIVE
            ):
                facility_ids.update(membership.facilities.values_list("pk", flat=True))

            if profile.primary_facility_id:
                facility_ids.add(profile.primary_facility_id)
            facility_ids.update(profile.secondary_facilities.values_list("pk", flat=True))

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
        2. mfl_code          → identifier-type "registration-number" (MFL alias)

        Returns the updated facility detail with all cached DHA fields.
        """
        facility = self.get_object()

        # Build ordered list of (identifier, identifier_type) to try
        # DHA valid types: fid, fr-code, registration-number
        candidates: list[tuple[str, str]] = []
        if facility.sha_facility_code:
            candidates.append((facility.sha_facility_code, "fr-code"))
        if facility.mfl_code:
            candidates.append((facility.mfl_code, "registration-number"))

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

        updated_local_fields = facility.update_from_dha_response(data)
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
                "updated_local_fields": updated_local_fields,
            },
        )

        serializer = FacilityDetailSerializer(facility, context={"request": request})
        return Response(serializer.data)

    @extend_schema(
        summary="Sync SHA interventions/tariffs into billing services",
        responses={
            200: inline_serializer(
                "FacilitySyncBillingServicesResponse",
                fields={
                    "created": serializers.IntegerField(),
                    "updated": serializers.IntegerField(),
                    "skipped": serializers.IntegerField(),
                    "processed": serializers.IntegerField(),
                    "tariffs_processed": serializers.IntegerField(),
                    "facility_level": serializers.CharField(),
                },
            )
        },
    )
    @action(detail=True, methods=["post"], url_path="sync-billing-services")
    def sync_billing_services(self, request, pk=None):
        """Materialize SHA intervention/tariff catalog rows into billable services.

        This endpoint is idempotent and safe to run repeatedly:
        - creates missing services by SHA code
        - updates mutable fields when upstream tariff/name/description change
        - skips rows without a usable positive tariff
        """
        facility = self.get_object()

        from hmis.apps.billing.models import Service, ServiceCategory, SHATariff
        from hmis.apps.billing.services.intervention_fallback import search_local_interventions

        try:
            facility_level_int = int(str(facility.level or "").strip())
        except ValueError:
            return Response(
                {"detail": "Facility level is invalid; cannot sync tariff services."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        tariff_level = f"L{facility_level_int}"

        intervention_category, _ = ServiceCategory.objects.get_or_create(
            facility=facility,
            code="SHA_INTV",
            defaults={
                "name": "SHA Interventions",
                "description": "Materialized billable services from SHA intervention terminology.",
                "display_order": 900,
                "is_active": True,
            },
        )
        tariff_category, _ = ServiceCategory.objects.get_or_create(
            facility=facility,
            code="SHA_TARIFF",
            defaults={
                "name": "SHA Tariffs",
                "description": "Materialized billable services from SHA tariff catalog.",
                "display_order": 901,
                "is_active": True,
            },
        )
        intervention_category_cache: dict[str, ServiceCategory] = {}

        def _to_price(value) -> Decimal | None:
            if value in (None, ""):
                return None
            try:
                amount = Decimal(str(value))
            except (InvalidOperation, TypeError, ValueError):
                return None
            if amount <= 0:
                return None
            return amount

        def _get_intervention_category(raw_category: object) -> ServiceCategory:
            raw = str(raw_category or "").strip()
            if not raw:
                return intervention_category

            key = raw.lower()
            cached = intervention_category_cache.get(key)
            if cached is not None:
                return cached

            token = "".join(ch if ch.isalnum() else "_" for ch in raw.upper()).strip("_")
            while "__" in token:
                token = token.replace("__", "_")
            if not token:
                return intervention_category

            code = f"SI_{token}"[:20]
            name = " ".join(part.capitalize() for part in raw.replace("_", " ").split()) or raw

            category = ServiceCategory.objects.filter(facility=facility, code=code).first()
            if category is None:
                # Name is unique too; reuse an existing category by name if present
                # to avoid UNIQUE(name) collisions when a different code already exists.
                category = ServiceCategory.objects.filter(
                    facility=facility, name__iexact=name[:100]
                ).first()

            if category is None:
                category = ServiceCategory.objects.create(
                    facility=facility,
                    code=code,
                    name=name[:100],
                    description="Auto-created SHA intervention category.",
                    display_order=905,
                    is_active=True,
                )
            elif category.name != name[:100] and category.code == code:
                # Only normalize the name when we own the code mapping.
                category.name = name[:100]
                category.save(update_fields=["name", "updated_at"])

            intervention_category_cache[key] = category
            return category

        created = 0
        updated = 0
        skipped = 0
        processed = 0

        with transaction.atomic():
            # 1) Facility-level interventions (already filtered by KEPH level)
            offset = 0
            limit = 250
            while True:
                rows, total = search_local_interventions(
                    query="",
                    facility_level=facility_level_int,
                    limit=limit,
                    offset=offset,
                    active_only=True,
                )
                if not rows:
                    break

                for row in rows:
                    code = str(row.get("code") or "").strip().upper()
                    name = str(row.get("name") or "").strip()
                    if not code or not name or len(code) > 20:
                        skipped += 1
                        continue

                    category = _get_intervention_category(row.get("category"))
                    unit_price = _to_price(row.get("price"))
                    is_pending_tariff = unit_price is None
                    description = str(row.get("description") or "").strip()
                    if is_pending_tariff and "pending tariff" not in description.lower():
                        description = f"{description} [Pending tariff]".strip()

                    processed += 1
                    defaults = {
                        "facility": facility,
                        "category": category,
                        "name": name[:200],
                        "description": description,
                        "unit_price": unit_price,
                        "currency": "KES",
                        "sha_code": code,
                        "is_active": bool(row.get("is_active", True)) and not is_pending_tariff,
                        "requires_quantity": False,
                        "is_taxable": False,
                        "created_by": request.user,
                    }
                    service, was_created = Service.objects.get_or_create(
                        facility=facility, code=code, defaults=defaults
                    )
                    if was_created:
                        created += 1
                        continue

                    changed = False
                    for field in [
                        "name",
                        "description",
                        "unit_price",
                        "currency",
                        "sha_code",
                        "is_active",
                    ]:
                        next_value = defaults[field]
                        if getattr(service, field) != next_value:
                            setattr(service, field, next_value)
                            changed = True
                    if changed:
                        service.save(
                            update_fields=[
                                "name",
                                "description",
                                "unit_price",
                                "currency",
                                "sha_code",
                                "is_active",
                                "updated_at",
                            ]
                        )
                        updated += 1

                offset += len(rows)
                if offset >= total:
                    break

            # 2) Tariff catalog rows for the same facility level
            tariffs = SHATariff.get_active_tariffs(facility_level=tariff_level)
            tariffs_processed = 0
            for tariff in tariffs:
                code = str(tariff.code or "").strip().upper()
                if not code or len(code) > 20:
                    skipped += 1
                    continue
                if tariff.sha_amount is None or tariff.sha_amount <= 0:
                    skipped += 1
                    continue

                tariffs_processed += 1
                processed += 1
                defaults = {
                    "facility": facility,
                    "category": tariff_category,
                    "name": str(tariff.name or code)[:200],
                    "description": str(tariff.description or "").strip(),
                    "unit_price": tariff.sha_amount,
                    "currency": str(tariff.currency or "KES"),
                    "sha_code": code,
                    "is_active": bool(tariff.is_active),
                    "requires_quantity": False,
                    "is_taxable": False,
                    "created_by": request.user,
                }
                service, was_created = Service.objects.get_or_create(
                    facility=facility, code=code, defaults=defaults
                )
                if was_created:
                    created += 1
                else:
                    changed = False
                    for field in [
                        "name",
                        "description",
                        "unit_price",
                        "currency",
                        "sha_code",
                        "is_active",
                    ]:
                        next_value = defaults[field]
                        if getattr(service, field) != next_value:
                            setattr(service, field, next_value)
                            changed = True
                    if changed:
                        service.save(
                            update_fields=[
                                "name",
                                "description",
                                "unit_price",
                                "currency",
                                "sha_code",
                                "is_active",
                                "updated_at",
                            ]
                        )
                        updated += 1

                if tariff.internal_service_id != service.id:
                    tariff.internal_service = service
                    tariff.save(update_fields=["internal_service", "updated_at"])

        AuditLog.log(
            action="facility_billing_services_synced",
            user=request.user,
            resource_type="Facility",
            resource_id=facility.id,
            ip_address=_get_client_ip(request),
            user_agent=request.META.get("HTTP_USER_AGENT", ""),
            details={
                "created": created,
                "updated": updated,
                "skipped": skipped,
                "processed": processed,
                "facility_level": facility.level,
                "tariff_level": tariff_level,
            },
        )

        return Response(
            {
                "created": created,
                "updated": updated,
                "skipped": skipped,
                "processed": processed,
                "tariffs_processed": tariffs_processed,
                "facility_level": str(facility.level),
            }
        )


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
        except http_requests.RequestException as exc:
            logger.warning(
                "DHIS2 connectivity test request failed",
                extra={"config_id": config.pk, "api_url": config.api_url, "error": str(exc)},
            )
            return Response(
                {
                    "status": "error",
                    "detail": "Unexpected transport error while testing DHIS2 connection.",
                },
                status=status.HTTP_502_BAD_GATEWAY,
            )
        except ValueError as exc:
            logger.warning(
                "DHIS2 connectivity test returned invalid JSON payload",
                extra={"config_id": config.pk, "api_url": config.api_url, "error": str(exc)},
            )
            return Response(
                {
                    "status": "error",
                    "detail": "DHIS2 returned an invalid response payload.",
                },
                status=status.HTTP_502_BAD_GATEWAY,
            )


# =============================================================================
# PKI & Digital Signature ViewSets (DHA Gap #32 — Sprint 3.C)
# =============================================================================
