"""
What this file is for: SHA member and tariff endpoints plus shared SHA pagination.
How to use: imported by `hmis.apps.billing.sha_views` to expose member/tariff API viewsets.
Supported inputs/args: DRF ViewSet operations for SHA members and read-only tariff lookup/search.
"""

# ruff: noqa: ARG002

import logging
from datetime import date
from decimal import Decimal, InvalidOperation

from django.db import models
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework import filters, status, viewsets
from rest_framework.decorators import action
from rest_framework.pagination import PageNumberPagination
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from hmis.apps.billing.filters import SHAMemberFilter
from hmis.apps.billing.models import SHAEligibilityCheck, SHAMember, SHATariff
from hmis.apps.billing.services.sha_eligibility import SHAEligibilityService
from hmis.apps.billing.sha_serializers import (
    SHAEligibilityVerifySerializer,
    SHAMemberDetailSerializer,
    SHAMemberSerializer,
    SHATariffSerializer,
)
from hmis.apps.core.kms import get_kms_provider
from hmis.apps.core.permissions import ReadRequiresModelPermission, SHAPermission

logger = logging.getLogger(__name__)


class SHAPagination(PageNumberPagination):
    """Custom pagination for SHA endpoints supporting page_size parameter."""

    page_size = 10
    page_size_query_param = "page_size"
    max_page_size = 100


class SHAMemberViewSet(viewsets.ModelViewSet):
    """
    ViewSet for SHA Member management.

    Provides CRUD operations for SHA members with eligibility verification.
    """

    queryset = SHAMember.objects.select_related("patient", "created_by").all()
    lookup_value_regex = r"\d+"
    permission_classes = [IsAuthenticated, SHAPermission, ReadRequiresModelPermission]
    pagination_class = SHAPagination
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_class = SHAMemberFilter
    search_fields = ["sha_number", "patient__first_name", "patient__last_name"]
    ordering_fields = ["created_at", "sha_number"]
    ordering = ["-created_at"]

    def get_serializer_class(self):
        """Return appropriate serializer based on action."""
        if self.action == "retrieve":
            return SHAMemberDetailSerializer
        return SHAMemberSerializer

    def get_queryset(self):
        """Filter queryset based on query parameters."""
        queryset = super().get_queryset()

        # Filter by modified_since for sync
        modified_since = self.request.query_params.get("modified_since")
        if modified_since:
            queryset = queryset.filter(updated_at__gte=modified_since)

        return queryset

    @action(detail=True, methods=["post"], url_path="verify")
    def verify(self, request, pk=None):
        """
        Verify eligibility for a SHA member.

        POST /api/sha/members/{id}/verify/
        """
        member = self.get_object()

        service = SHAEligibilityService()
        facility = getattr(request, "facility", None)
        check = service.check_eligibility(member, request.user, facility=facility)

        is_eligible = getattr(check, "is_eligible", False)
        if not isinstance(is_eligible, bool):
            is_eligible = bool(is_eligible) if is_eligible is not None else False

        result = getattr(check, "result", "") or ""
        if not isinstance(result, str):
            result = str(result)

        eligible_until = getattr(check, "eligible_until", None)
        if not isinstance(eligible_until, date):
            eligible_until = None

        benefit_balance = None
        raw_balance = getattr(check, "benefit_balance", None)
        if raw_balance is not None:
            try:
                benefit_balance = (
                    raw_balance if isinstance(raw_balance, Decimal) else Decimal(str(raw_balance))
                )
            except (InvalidOperation, TypeError, ValueError):
                benefit_balance = None

        ineligibility_reason = getattr(check, "ineligibility_reason", "") or ""
        if not isinstance(ineligibility_reason, str):
            ineligibility_reason = ""

        error_code = getattr(check, "error_code", "") or ""
        if not isinstance(error_code, str):
            error_code = ""

        error_message = getattr(check, "error_message", "") or ""
        if not isinstance(error_message, str):
            error_message = ""

        response_data = getattr(check, "response_data", {}) or {}
        if not isinstance(response_data, dict):
            response_data = {}
        eligible_schemes = response_data.get("eligible_schemes") or []
        if not isinstance(eligible_schemes, list):
            eligible_schemes = []
        coverage_caveat = response_data.get("coverage_caveat") or ""
        if not isinstance(coverage_caveat, str):
            coverage_caveat = ""
        coverage_blocked = bool(response_data.get("coverage_blocked", False))
        billable_schemes = response_data.get("billable_schemes") or []
        if not isinstance(billable_schemes, list):
            billable_schemes = []

        serializer = SHAEligibilityVerifySerializer(
            {
                "is_eligible": is_eligible,
                "result": result,
                "eligible_until": eligible_until,
                "benefit_balance": benefit_balance,
                "ineligibility_reason": ineligibility_reason,
                "error_code": error_code,
                "error_message": error_message,
                "eligible_schemes": eligible_schemes,
                "billable_schemes": billable_schemes,
                "coverage_caveat": coverage_caveat,
                "coverage_blocked": coverage_blocked,
            }
        )

        if result in [
            SHAEligibilityCheck.CheckResult.ERROR,
            SHAEligibilityCheck.CheckResult.TIMEOUT,
        ]:
            return Response(serializer.data, status=status.HTTP_503_SERVICE_UNAVAILABLE)

        return Response(serializer.data)

    @action(detail=False, methods=["get"], url_path="search")
    def search(self, request):
        """
        Search SHA members by various criteria.

        GET /api/sha/members/search/?sha_number=XXX&national_id=XXX&patient_name=XXX
        """
        queryset = self.get_queryset()

        sha_number = request.query_params.get("sha_number")
        national_id = request.query_params.get("national_id")
        patient_name = request.query_params.get("patient_name")

        if sha_number:
            queryset = queryset.filter(sha_number__icontains=sha_number)
        if national_id:
            queryset = queryset.filter(
                national_id_hmac=get_kms_provider().compute_hmac(national_id)
            )
        if patient_name:
            queryset = queryset.filter(
                patient__first_name__icontains=patient_name
            ) | queryset.filter(patient__last_name__icontains=patient_name)

        page = self.paginate_queryset(queryset)
        if page is not None:
            serializer = self.get_serializer(page, many=True)
            return self.get_paginated_response(serializer.data)

        serializer = self.get_serializer(queryset, many=True)
        return Response({"results": serializer.data})

    @action(detail=True, methods=["get"], url_path="dependents")
    def dependents(self, request, pk=None):
        """
        Get all dependents for a principal SHA member.

        GET /api/billing/sha-members/{id}/dependents/

        Returns list of SHA members who have this member as their principal.
        Uses the principal FK for integrity, falls back to principal_sha_number for legacy data.
        Only applicable for principal members.
        """
        member = self.get_object()

        # Check if the member is a principal
        if member.membership_type != SHAMember.MembershipType.PRINCIPAL:
            return Response(
                {"detail": "Only principal members can have dependents."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Get all dependents linked to this principal (via FK or legacy string field)
        dependents = (
            SHAMember.objects.filter(
                models.Q(principal=member) | models.Q(principal_sha_number=member.sha_number)
            )
            .select_related("patient", "created_by")
            .distinct()
        )

        page = self.paginate_queryset(dependents)
        if page is not None:
            serializer = self.get_serializer(page, many=True)
            return self.get_paginated_response(serializer.data)

        serializer = self.get_serializer(dependents, many=True)
        return Response({"results": serializer.data, "count": dependents.count()})


class SHATariffViewSet(viewsets.ReadOnlyModelViewSet):
    """
    ViewSet for SHA Tariff codes.

    Provides read-only access to SHA tariff codes with search and filtering.
    """

    queryset = SHATariff.objects.all()
    lookup_value_regex = r"\d+"
    serializer_class = SHATariffSerializer
    permission_classes = [IsAuthenticated, SHAPermission, ReadRequiresModelPermission]
    pagination_class = SHAPagination
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ["category", "facility_level", "is_active"]
    search_fields = ["code", "name", "description"]
    ordering_fields = ["code", "name", "sha_amount"]
    ordering = ["code"]

    def get_queryset(self):
        """Filter queryset to only active tariffs by default."""
        queryset = super().get_queryset()

        # Only show active tariffs unless explicitly requested
        show_inactive = self.request.query_params.get("show_inactive", "false").lower() == "true"
        if not show_inactive:
            queryset = queryset.filter(is_active=True)

        return queryset

    @action(detail=False, methods=["get"], url_path="search")
    def search(self, request):
        """
        Search tariffs by code or name.

        GET /api/sha/tariffs/search/?code=XXX&q=XXX
        """
        queryset = self.get_queryset()

        code = request.query_params.get("code")
        q = request.query_params.get("q")

        if code:
            queryset = queryset.filter(code__icontains=code)
        if q:
            queryset = queryset.filter(name__icontains=q) | queryset.filter(
                description__icontains=q
            )

        page = self.paginate_queryset(queryset)
        if page is not None:
            serializer = self.get_serializer(page, many=True)
            return self.get_paginated_response(serializer.data)

        serializer = self.get_serializer(queryset, many=True)
        return Response({"results": serializer.data})

    @action(detail=False, methods=["get"], url_path="by-category")
    def by_category(self, request):
        """
        Get tariffs grouped by category.

        GET /api/sha/tariffs/by-category/
        """
        categories = {}
        for tariff in self.get_queryset():
            category = tariff.category
            if category not in categories:
                categories[category] = []
            categories[category].append(SHATariffSerializer(tariff).data)

        return Response(categories)
