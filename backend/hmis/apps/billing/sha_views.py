"""
Views for SHA (Social Health Authority) billing endpoints.

Provides ViewSets for SHA Members, Tariffs, Claims, and related operations.
"""

import csv
import hashlib
import logging
from datetime import date
from decimal import Decimal, InvalidOperation
from io import BytesIO

from django.db import models
from django.db.models import Count, Sum
from django.http import HttpResponse
from django.shortcuts import get_object_or_404
from django.utils import timezone
from django_filters.rest_framework import DjangoFilterBackend
from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import (
    OpenApiParameter,
    extend_schema,
    extend_schema_view,
    inline_serializer,
)
from rest_framework import filters, serializers, status, viewsets
from rest_framework.decorators import action
from rest_framework.pagination import PageNumberPagination
from rest_framework.permissions import IsAuthenticated
from rest_framework.renderers import BrowsableAPIRenderer, JSONRenderer
from rest_framework.response import Response

from hmis.apps.billing.filters import SHAClaimFilter, SHAMemberFilter
from hmis.apps.billing.models import (
    SHAClaim,
    SHAClaimAttachment,
    SHAClaimItem,
    SHAEligibilityCheck,
    SHAMember,
    SHATariff,
)
from hmis.apps.billing.renderers import CSVRenderer, XLSXRenderer
from hmis.apps.billing.services.sha_eligibility import SHAEligibilityService
from hmis.apps.billing.sha_serializers import (
    SHAClaimAppealSerializer,
    SHAClaimAttachmentSerializer,
    SHAClaimDashboardSerializer,
    SHAClaimDetailSerializer,
    SHAClaimItemSerializer,
    SHAClaimSerializer,
    SHAClaimSubmitSerializer,
    SHAClaimValidationSerializer,
    SHAEligibilityVerifySerializer,
    SHAMemberDetailSerializer,
    SHAMemberSerializer,
    SHATariffSerializer,
)
from hmis.apps.core.mixins import TenantScopedViewMixin
from hmis.apps.core.permissions import SHAPermission

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
    permission_classes = [IsAuthenticated, SHAPermission]
    pagination_class = SHAPagination
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_class = SHAMemberFilter
    search_fields = ["sha_number", "national_id", "patient__first_name", "patient__last_name"]
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
        check = service.check_eligibility(member, request.user)

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

        serializer = SHAEligibilityVerifySerializer(
            {
                "is_eligible": is_eligible,
                "result": result,
                "eligible_until": eligible_until,
                "benefit_balance": benefit_balance,
                "ineligibility_reason": ineligibility_reason,
                "error_code": error_code,
                "error_message": error_message,
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
            queryset = queryset.filter(national_id__icontains=national_id)
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
    permission_classes = [IsAuthenticated, SHAPermission]
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


class SHAClaimViewSet(TenantScopedViewMixin, viewsets.ModelViewSet):
    """
    ViewSet for SHA Claims management.

    Provides CRUD operations for claims with validation, submission, and appeal workflows.
    """

    queryset = (
        SHAClaim.objects.select_related(
            "patient", "sha_member", "encounter", "created_by", "submitted_by", "facility"
        )
        .prefetch_related("items", "attachments")
        .all()
    )
    tenant_scope = "facility"
    lookup_value_regex = r"\d+"
    permission_classes = [IsAuthenticated, SHAPermission]
    renderer_classes = [JSONRenderer, BrowsableAPIRenderer, CSVRenderer, XLSXRenderer]
    pagination_class = SHAPagination
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_class = SHAClaimFilter
    search_fields = [
        "claim_number",
        "sha_claim_reference",
        "patient__first_name",
        "patient__last_name",
    ]
    ordering_fields = ["created_at", "service_date", "claimed_amount"]
    ordering = ["-created_at"]

    def get_serializer_class(self):
        """Return appropriate serializer based on action."""
        if self.action == "retrieve":
            return SHAClaimDetailSerializer
        return SHAClaimSerializer

    def get_queryset(self):
        """Filter queryset based on query parameters."""
        queryset = super().get_queryset()

        # Filter by date range
        service_date_from = self.request.query_params.get("service_date_from")
        service_date_to = self.request.query_params.get("service_date_to")
        from_date = self.request.query_params.get("from_date")
        to_date = self.request.query_params.get("to_date")

        if service_date_from or from_date:
            date_from = service_date_from or from_date
            queryset = queryset.filter(service_date__gte=date_from)
        if service_date_to or to_date:
            date_to = service_date_to or to_date
            queryset = queryset.filter(service_date__lte=date_to)

        # Filter by modified_since for sync
        modified_since = self.request.query_params.get("modified_since")
        if modified_since:
            queryset = queryset.filter(updated_at__gte=modified_since)

        return queryset

    @action(detail=True, methods=["post"], url_path="validate")
    def validate_claim(self, request, pk=None):
        """
        Validate a claim for submission.

        POST /api/sha/claims/{id}/validate/
        """
        claim = self.get_object()
        is_valid, errors = claim.validate_for_submission()

        serializer = SHAClaimValidationSerializer(
            {
                "is_valid": is_valid,
                "errors": errors,
            }
        )

        return Response(serializer.data)

    @action(detail=True, methods=["post"], url_path="submit")
    def submit(self, request, pk=None):
        """
        Submit a claim to SHA.

        POST /api/sha/claims/{id}/submit/

        Supports offline queuing - if the system is offline, the claim
        will be queued for later submission.
        """
        from hmis.apps.billing.services.sha_claims import SHAClaimsService

        claim = self.get_object()
        force_online = request.data.get("force_online", False)

        try:
            service = SHAClaimsService()
            result = service.submit_claim(claim, request.user, force_online=force_online)

            # If claim was queued (offline), return queue info
            if result.get("status") == "queued":
                return Response(
                    {
                        "status": "queued",
                        "message": result.get("message"),
                        "queue_entry_id": result.get("queue_entry_id"),
                        "claim_number": claim.claim_number,
                    }
                )

            # Normal submission response
            claim.refresh_from_db()
            serializer = SHAClaimSubmitSerializer(
                {
                    "status": claim.status,
                    "claim_number": claim.claim_number,
                    "submitted_at": claim.submitted_at,
                    "sha_claim_reference": claim.sha_claim_reference,
                }
            )

            return Response(serializer.data)

        except Exception:
            logger.exception("SHA claim submission failed for claim %s", pk)
            return Response(
                {"error": "Claim submission failed. Please try again."},
                status=status.HTTP_400_BAD_REQUEST,
            )

    @action(detail=True, methods=["post"], url_path="appeal")
    def appeal(self, request, pk=None):
        """
        Create an appeal for a rejected claim.

        POST /api/sha/claims/{id}/appeal/
        """
        claim = self.get_object()

        appeal_serializer = SHAClaimAppealSerializer(data=request.data)
        appeal_serializer.is_valid(raise_exception=True)

        if not claim.can_appeal():
            return Response(
                {"error": "Cannot appeal claim in current status"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            appeal_claim = claim.create_appeal(
                reason=appeal_serializer.validated_data["reason"], user=request.user
            )

            serializer = SHAClaimSerializer(appeal_claim, context={"request": request})
            return Response(serializer.data, status=status.HTTP_201_CREATED)

        except Exception:
            logger.exception("SHA claim appeal failed for claim %s", pk)
            return Response(
                {"error": "Appeal creation failed. Please try again."},
                status=status.HTTP_400_BAD_REQUEST,
            )

    @action(detail=True, methods=["get", "post"], url_path="items")
    def items(self, request, pk=None):
        """
        List or add items to a claim.

        GET /api/sha/claims/{id}/items/
        POST /api/sha/claims/{id}/items/
        """
        claim = self.get_object()

        if request.method == "GET":
            serializer = SHAClaimItemSerializer(claim.items.all(), many=True)
            return Response(serializer.data)

        elif request.method == "POST":
            serializer = SHAClaimItemSerializer(data=request.data)
            serializer.is_valid(raise_exception=True)

            # Check tariff max quantity if tariff is provided
            tariff_id = request.data.get("tariff")
            quantity = Decimal(request.data.get("quantity", "1"))

            if tariff_id:
                tariff = get_object_or_404(SHATariff, pk=tariff_id)
                if quantity > tariff.max_quantity_per_claim:
                    return Response(
                        {
                            "quantity": f"Exceeds maximum quantity ({tariff.max_quantity_per_claim}) for this tariff"
                        },
                        status=status.HTTP_400_BAD_REQUEST,
                    )

            item = SHAClaimItem.objects.create(claim=claim, **serializer.validated_data)

            return Response(SHAClaimItemSerializer(item).data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=["get", "post"], url_path="attachments")
    def attachments(self, request, pk=None):
        """
        List or upload attachments for a claim.

        GET /api/sha/claims/{id}/attachments/
        POST /api/sha/claims/{id}/attachments/
        """
        claim = self.get_object()

        if request.method == "GET":
            serializer = SHAClaimAttachmentSerializer(claim.attachments.all(), many=True)
            return Response(serializer.data)

        elif request.method == "POST":
            file = request.FILES.get("file")
            if not file:
                return Response({"file": "No file provided"}, status=status.HTTP_400_BAD_REQUEST)

            # Validate file size
            max_size = 10 * 1024 * 1024  # 10MB
            if file.size > max_size:
                return Response(
                    {"file": "File size exceeds maximum of 10MB"},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            # Validate file type
            allowed_types = [
                "application/pdf",
                "image/jpeg",
                "image/png",
                "image/tiff",
            ]
            if file.content_type not in allowed_types:
                return Response(
                    {"file": f"File type not allowed. Allowed: {', '.join(allowed_types)}"},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            # Calculate checksum
            file_content = file.read()
            checksum = hashlib.sha256(file_content).hexdigest()
            file.seek(0)  # Reset file pointer

            attachment = SHAClaimAttachment.objects.create(
                claim=claim,
                attachment_type=request.data.get("attachment_type", "other"),
                name=request.data.get("name", file.name),
                description=request.data.get("description", ""),
                file=file,
                file_size=file.size,
                mime_type=file.content_type,
                checksum=checksum,
                original_filename=file.name,
                uploaded_by=request.user,
            )

            return Response(
                SHAClaimAttachmentSerializer(attachment).data, status=status.HTTP_201_CREATED
            )

    @action(detail=False, methods=["get"], url_path="dashboard")
    def dashboard(self, request):
        """
        Get claims dashboard statistics.

        GET /api/sha/claims/dashboard/?from_date=XXX&to_date=XXX
        """
        queryset = self.get_queryset()

        # Date filtering
        from_date = request.query_params.get("from_date")
        to_date = request.query_params.get("to_date")

        if from_date:
            queryset = queryset.filter(service_date__gte=from_date)
        if to_date:
            queryset = queryset.filter(service_date__lte=to_date)

        # Calculate statistics
        total_claims = queryset.count()
        aggregates = queryset.aggregate(
            total_claimed=Sum("claimed_amount"),
            total_approved=Sum("approved_amount"),
            total_paid=Sum("paid_amount"),
        )

        # Group by status
        status_counts = queryset.values("status").annotate(count=Count("id"))
        claims_by_status = {item["status"]: item["count"] for item in status_counts}

        # Group by type
        type_counts = queryset.values("claim_type").annotate(count=Count("id"))
        claims_by_type = {item["claim_type"]: item["count"] for item in type_counts}

        # Calculate average processing days for submitted claims
        submitted_claims = queryset.filter(submitted_at__isnull=False)
        avg_days = None
        if submitted_claims.exists():
            total_days = sum(
                (timezone.now() - claim.submitted_at).days for claim in submitted_claims
            )
            avg_days = total_days / submitted_claims.count()

        serializer = SHAClaimDashboardSerializer(
            {
                "total_claims": total_claims,
                "total_claimed_amount": aggregates["total_claimed"] or Decimal("0.00"),
                "total_approved_amount": aggregates["total_approved"] or Decimal("0.00"),
                "total_paid_amount": aggregates["total_paid"] or Decimal("0.00"),
                "claims_by_status": claims_by_status,
                "claims_by_type": claims_by_type,
                "average_processing_days": avg_days,
            }
        )

        return Response(serializer.data)

    @action(detail=False, methods=["get"], url_path="export")
    def export(self, request):
        """
        Export claims to CSV or Excel.

        GET /api/sha/claims/export/?format=csv&status=XXX&from_date=XXX&to_date=XXX
        """
        queryset = self.get_queryset()

        # Apply filters
        claim_status = request.query_params.get("status")
        from_date = request.query_params.get("from_date")
        to_date = request.query_params.get("to_date")

        if claim_status:
            queryset = queryset.filter(status=claim_status)
        if from_date:
            queryset = queryset.filter(service_date__gte=from_date)
        if to_date:
            queryset = queryset.filter(service_date__lte=to_date)

        export_format = request.query_params.get("format", "csv")

        if export_format == "xlsx":
            return self._export_excel(queryset)
        else:
            return self._export_csv(queryset)

    def _export_csv(self, queryset):
        """Export claims to CSV format."""
        response = HttpResponse(content_type="text/csv")
        response["Content-Disposition"] = f'attachment; filename="sha_claims_{date.today()}.csv"'

        writer = csv.writer(response)
        writer.writerow(
            [
                "Claim Number",
                "Patient Name",
                "SHA Number",
                "Claim Type",
                "Status",
                "Service Date",
                "Claimed Amount",
                "Approved Amount",
                "Paid Amount",
                "Submitted At",
                "Created At",
            ]
        )

        for claim in queryset:
            writer.writerow(
                [
                    claim.claim_number,
                    (
                        f"{claim.patient.first_name} {claim.patient.last_name}"
                        if claim.patient
                        else ""
                    ),
                    claim.sha_member.sha_number if claim.sha_member else "",
                    claim.claim_type,
                    claim.status,
                    claim.service_date,
                    claim.claimed_amount,
                    claim.approved_amount or "",
                    claim.paid_amount or "",
                    claim.submitted_at or "",
                    claim.created_at,
                ]
            )

        return response

    def _export_excel(self, queryset):
        """Export claims to Excel format."""
        try:
            import openpyxl
            from openpyxl.utils import get_column_letter

            wb = openpyxl.Workbook()
            ws = wb.active
            if ws is None:
                ws = wb.create_sheet("SHA Claims")
            else:
                ws.title = "SHA Claims"

            # Headers
            headers = [
                "Claim Number",
                "Patient Name",
                "SHA Number",
                "Claim Type",
                "Status",
                "Service Date",
                "Claimed Amount",
                "Approved Amount",
                "Paid Amount",
                "Submitted At",
                "Created At",
            ]

            for col, header in enumerate(headers, 1):
                ws.cell(row=1, column=col, value=header)

            # Data
            for row, claim in enumerate(queryset, 2):
                ws.cell(row=row, column=1, value=claim.claim_number)
                ws.cell(
                    row=row,
                    column=2,
                    value=(
                        f"{claim.patient.first_name} {claim.patient.last_name}"
                        if claim.patient
                        else ""
                    ),
                )
                ws.cell(
                    row=row, column=3, value=claim.sha_member.sha_number if claim.sha_member else ""
                )
                ws.cell(row=row, column=4, value=claim.claim_type)
                ws.cell(row=row, column=5, value=claim.status)
                ws.cell(row=row, column=6, value=str(claim.service_date))
                ws.cell(row=row, column=7, value=float(claim.claimed_amount))
                ws.cell(
                    row=row,
                    column=8,
                    value=float(claim.approved_amount) if claim.approved_amount else "",
                )
                ws.cell(
                    row=row, column=9, value=float(claim.paid_amount) if claim.paid_amount else ""
                )
                ws.cell(
                    row=row, column=10, value=str(claim.submitted_at) if claim.submitted_at else ""
                )
                ws.cell(row=row, column=11, value=str(claim.created_at))

            # Save to bytes
            output = BytesIO()
            wb.save(output)
            output.seek(0)

            response = HttpResponse(
                output.read(),
                content_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            )
            response["Content-Disposition"] = (
                f'attachment; filename="sha_claims_{date.today()}.xlsx"'
            )
            return response

        except ImportError:
            # Fallback to CSV if openpyxl not available
            return self._export_csv(queryset)


# =============================================================================
# Terminology API Views
# =============================================================================

from django.conf import settings as django_settings
from rest_framework.views import APIView

from hmis.apps.billing.services.client_registry import (
    ClientNotFoundError,
    ClientRegistryError,
    ClientRegistryService,
)
from hmis.apps.billing.services.dha_search import DHASearchService, SearchError
from hmis.apps.billing.services.icd11_local import ICD11LocalService
from hmis.apps.billing.services.terminology import TerminologyError, TerminologyService


class TerminologySearchView(APIView):
    """
    API view for searching medical terminologies.

    Supports ICD-11, LOINC, ICHI, Interventions, and Drug Products.

    For ICD-11, uses local WHO ICD-11 API container by default (ICD11_USE_LOCAL=true).
    """

    permission_classes = [IsAuthenticated]

    @extend_schema(
        parameters=[
            OpenApiParameter(
                "search", OpenApiTypes.STR, description="Search query (min 2 characters)"
            ),
            OpenApiParameter("limit", OpenApiTypes.INT, description="Max results (default 50)"),
        ],
        responses={
            200: inline_serializer(
                name="TerminologySearchResponse",
                fields={
                    "results": serializers.ListField(child=serializers.DictField()),
                    "count": serializers.IntegerField(),
                    "source": serializers.CharField(),
                },
            )
        },
    )
    def get(self, request, terminology_type):
        """
        Search terminology codes.

        GET /api/billing/terminology/{type}/?search=query&limit=50

        Types: icd11, loinc, ichi, interventions, drugs, active-components
        """
        search = request.query_params.get("search", "")
        limit = int(request.query_params.get("limit", 50))

        if len(search) < 2:
            return Response(
                {"results": [], "message": "Search query must be at least 2 characters"}
            )

        try:
            # For ICD-11: Try DHA API first, fall back to local container
            if terminology_type == "icd11":
                return self._search_icd11_with_fallback(search, limit)

            service = TerminologyService()

            if terminology_type == "icd11":
                results = service.search_icd11(search, limit=limit)
            elif terminology_type == "loinc":
                results = service.search_loinc(search, limit=limit)
            elif terminology_type == "ichi":
                results = service.search_ichi(search, limit=limit)
            elif terminology_type == "interventions":
                results = service.search_interventions(search, limit=limit)
            elif terminology_type == "drugs":
                results = service.search_drug_products(search, limit=limit)
            elif terminology_type == "active-components":
                results = service.search_active_components(search, limit=limit)
            else:
                return Response(
                    {"error": f"Unknown terminology type: {terminology_type}"},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            # Convert dataclasses to dicts
            data = []
            for item in results:
                if hasattr(item, "__dict__"):
                    item_dict = {k: v for k, v in item.__dict__.items() if not k.startswith("_")}
                    data.append(item_dict)
                else:
                    data.append(item)

            return Response(
                {
                    "results": data,
                    "count": len(data),
                }
            )

        except TerminologyError as e:
            return Response(
                {"error": str(e), "status_code": e.status_code},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )
        except Exception:
            logger.exception("ICD terminology search failed")
            return Response(
                {"error": "Terminology search failed. Please try again."},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

    def _search_icd11_with_fallback(self, search: str, limit: int):
        """
        Search ICD-11 with fallback: DHA API, then local container, then local DB.

        Priority:
        1. If ICD11_USE_LOCAL=True, use local container only
        2. Otherwise, try DHA Terminology API first
        3. If DHA fails, fall back to local container
        4. If the container is unavailable, fall back to local ICD-11 DB

        Args:
            search: Search query
            limit: Maximum results

        Returns:
            Response with ICD-11 codes and source indicator
        """
        import logging

        logger = logging.getLogger(__name__)

        # If explicitly configured to use local only, skip DHA
        use_local_only = getattr(django_settings, "ICD11_USE_LOCAL", False)

        if use_local_only:
            logger.debug("ICD11_USE_LOCAL=True, using local container only")
            return self._search_icd11_local(search, limit)

        # If DHA API is not configured, skip straight to local fallback
        sha_base = getattr(django_settings, "SHA_API_BASE_URL", "")
        if not sha_base or sha_base == "https://example.com":
            logger.debug("SHA_API_BASE_URL not configured, using local fallback")
            return self._search_icd11_local(search, limit, "DHA API not configured")

        # Try DHA Terminology API first
        try:
            logger.debug("Attempting DHA Terminology API for ICD-11 search")
            service = TerminologyService(use_local_fallback=False)
            results = service.search_icd11(search, limit=limit)

            if results:
                # Convert dataclasses to dicts
                data = []
                for item in results:
                    if hasattr(item, "__dict__"):
                        item_dict = {
                            k: v for k, v in item.__dict__.items() if not k.startswith("_")
                        }
                        data.append(item_dict)
                    else:
                        data.append(item)

                return Response(
                    {
                        "results": data,
                        "count": len(data),
                        "source": "dha_terminology_api",
                    }
                )
            else:
                # Empty results from DHA, try local
                logger.info("DHA API returned empty results, trying local container")
                raise TerminologyError("Empty results from DHA API", status_code=503)

        except (TerminologyError, Exception) as dha_error:
            logger.warning(f"DHA Terminology API failed: {dha_error}, falling back to local")
            return self._search_icd11_local(search, limit, str(dha_error))

    def _search_icd11_local(self, search: str, limit: int, fallback_reason: str = ""):
        """
        Search ICD-11 using the local WHO ICD-11 container first, then local DB.

        Args:
            search: Search query
            limit: Maximum results
            fallback_reason: Upstream failure reason if already in fallback mode

        Returns:
            Response with ICD-11 codes
        """
        try:
            service = ICD11LocalService()

            # Check if service is available
            if not service.is_available():
                return self._search_icd11_database_fallback(
                    search,
                    limit,
                    fallback_reason or "Local ICD-11 API unavailable",
                )

            results = service.search(search, limit=limit)

            # Convert to dict format
            data = [code.to_dict() for code in results]

            # If container returned empty results, fall back to local DB
            if not data:
                logger.info("Local ICD-11 container returned empty results, trying database")
                return self._search_icd11_database_fallback(
                    search,
                    limit,
                    fallback_reason or "Local ICD-11 container returned no results",
                )

            return Response(
                {
                    "results": data,
                    "count": len(data),
                    "source": "local_who_icd11",
                    "fallback": bool(fallback_reason),
                    "fallback_reason": fallback_reason,
                }
            )

        except Exception:
            logger.exception("ICD-11 local container search failed")
            return self._search_icd11_database_fallback(
                search,
                limit,
                fallback_reason or "ICD-11 local container search failed",
            )

    def _search_icd11_database_fallback(self, search: str, limit: int, original_error: str = ""):
        """Fallback to the local ICD-11 database when network/container sources fail."""
        from hmis.apps.billing.models import ICD11CodeReference

        try:
            codes = ICD11CodeReference.objects.filter(
                models.Q(code__icontains=search)
                | models.Q(title__icontains=search)
                | models.Q(description__icontains=search),
                is_active=True,
            ).order_by("code")[:limit]

            data = [
                {
                    "id": code.pk,
                    "code": code.code,
                    "title": code.title,
                    "chapter": code.chapter or code.chapter_no,
                    "chapter_no": code.chapter_no,
                    "is_leaf": code.is_leaf,
                    "is_active": code.is_active,
                    "class_kind": code.class_kind,
                    "entity_id": code.entity_id,
                }
                for code in codes
            ]

            return Response(
                {
                    "results": data,
                    "count": len(data),
                    "source": "local_icd11_database",
                    "fallback": True,
                    "fallback_reason": original_error or "ICD-11 services unavailable",
                }
            )
        except Exception as exc:
            logger.error(f"ICD-11 database fallback failed: {exc}")
            return Response(
                {
                    "error": "All ICD-11 services unavailable",
                },
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )


@extend_schema_view()
class ClientRegistryView(APIView):
    """
    API view for Kenya Client Registry operations.
    """

    permission_classes = [IsAuthenticated]

    @extend_schema(
        parameters=[
            OpenApiParameter(
                "national_id", OpenApiTypes.STR, description="Kenya National ID number"
            ),
            OpenApiParameter("client_number", OpenApiTypes.STR, description="CR client number"),
            OpenApiParameter("huduma_number", OpenApiTypes.STR, description="Huduma Namba"),
            OpenApiParameter("passport_number", OpenApiTypes.STR, description="Passport number"),
            OpenApiParameter(
                "identification_type", OpenApiTypes.STR, description="Generic ID type"
            ),
            OpenApiParameter("identification_number", OpenApiTypes.STR, description="ID value"),
        ],
        responses={
            200: inline_serializer(
                name="ClientRegistryResponse",
                fields={
                    "found": serializers.BooleanField(),
                    "client": serializers.DictField(),
                },
            )
        },
    )
    def get(self, request):
        """
        Fetch client from Client Registry.

        GET /api/billing/client-registry/fetch/?national_id=XXX
        GET /api/billing/client-registry/fetch/?client_number=XXX
        GET /api/billing/client-registry/fetch/?huduma_number=XXX
        GET /api/billing/client-registry/fetch/?identification_type=National ID&identification_number=XXX

        Query Parameters:
            national_id: Kenya National ID number
            client_number: CR client number
            huduma_number: Huduma Namba
            passport_number: Passport number
            identification_type: Generic ID type (e.g., 'National ID', 'Passport', 'SHA Number')
            identification_number: ID value (used with identification_type)
        """
        national_id = request.query_params.get("national_id")
        client_number = request.query_params.get("client_number")
        huduma_number = request.query_params.get("huduma_number")
        passport_number = request.query_params.get("passport_number")
        identification_type = request.query_params.get("identification_type")
        identification_number = request.query_params.get("identification_number")

        if not any(
            [
                national_id,
                client_number,
                huduma_number,
                passport_number,
                (identification_type and identification_number),
            ]
        ):
            return Response(
                {
                    "error": "At least one identifier is required (national_id, client_number, huduma_number, passport_number, or identification_type+identification_number)"
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            service = ClientRegistryService()
            client = service.fetch_client(
                national_id=national_id,
                client_number=client_number,
                huduma_number=huduma_number,
                passport_number=passport_number,
                identification_type=identification_type,
                identification_number=identification_number,
            )

            if client:
                return Response(
                    {
                        "found": True,
                        "client": {
                            "client_number": client.client_number,
                            "first_name": client.first_name,
                            "last_name": client.last_name,
                            "middle_name": client.middle_name,
                            "date_of_birth": (
                                str(client.date_of_birth) if client.date_of_birth else None
                            ),
                            "gender": client.gender,
                            "national_id": client.national_id,
                            "huduma_number": client.huduma_number,
                            "phone_number": client.phone_number,
                            "email": client.email,
                            "county": client.county_of_residence,
                            "sub_county": client.sub_county_of_residence,
                        },
                    }
                )
            else:
                return Response({"found": False})

        except ClientNotFoundError:
            return Response({"found": False})
        except ClientRegistryError as e:
            return Response(
                {"error": str(e), "found": False}, status=status.HTTP_503_SERVICE_UNAVAILABLE
            )
        except Exception:
            logger.exception("Client Registry lookup failed")
            return Response(
                {"error": "Client Registry lookup failed. Please try again.", "found": False},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

    @extend_schema(
        request=inline_serializer(
            name="ClientRegistryRegisterRequest",
            fields={
                "patient_id": serializers.IntegerField(required=False),
                "first_name": serializers.CharField(required=False),
                "last_name": serializers.CharField(required=False),
                "middle_name": serializers.CharField(required=False),
                "date_of_birth": serializers.DateField(required=False),
                "gender": serializers.CharField(required=False),
                "national_id": serializers.CharField(required=False),
                "huduma_number": serializers.CharField(required=False),
                "passport_number": serializers.CharField(required=False),
                "phone_number": serializers.CharField(required=False),
                "email": serializers.EmailField(required=False),
            },
        ),
        responses={
            201: inline_serializer(
                name="ClientRegistryRegisterResponse",
                fields={
                    "success": serializers.BooleanField(),
                    "client_number": serializers.CharField(required=False),
                    "message": serializers.CharField(required=False),
                },
            )
        },
    )
    def post(self, request):
        """
        Register a new client in Client Registry.

        POST /api/billing/client-registry/register/

        Accepts either:
        - patient_id: ID of existing patient (will fetch data automatically)
        - Individual fields: first_name, last_name, date_of_birth, gender (required)
        """
        from hmis.apps.patients.models import Patient

        data = request.data
        patient_id = data.get("patient_id")

        # If patient_id provided, fetch patient data
        if patient_id:
            try:
                patient = Patient.objects.get(id=patient_id)
                # Use patient data for CR registration
                first_name = patient.first_name
                last_name = patient.last_name
                date_of_birth = str(patient.date_of_birth)
                gender = patient.gender
                national_id = (
                    patient.identification_number
                    if patient.identification_type == "national_id"
                    else patient.national_id
                )
                middle_name = patient.middle_name
                phone_number = patient.phone_number
                email = patient.email
                # Map other ID types
                huduma_number = None
                passport_number = None
                if patient.identification_type == "passport":
                    passport_number = patient.identification_number
            except Patient.DoesNotExist:
                return Response(
                    {"error": f"Patient with id {patient_id} not found", "success": False},
                    status=status.HTTP_404_NOT_FOUND,
                )
        else:
            # Use individual fields from request
            required_fields = ["first_name", "last_name", "date_of_birth", "gender"]
            missing = [f for f in required_fields if not data.get(f)]
            if missing:
                return Response(
                    {"error": f"Missing required fields: {', '.join(missing)}"},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            first_name = data["first_name"]
            last_name = data["last_name"]
            date_of_birth = data["date_of_birth"]
            gender = data["gender"]
            national_id = data.get("national_id")
            middle_name = data.get("middle_name")
            huduma_number = data.get("huduma_number")
            passport_number = data.get("passport_number")
            phone_number = data.get("phone_number")
            email = data.get("email")

        try:
            service = ClientRegistryService()
            client = service.register_client(
                first_name=first_name,
                last_name=last_name,
                date_of_birth=date_of_birth,
                gender=gender,
                national_id=national_id,
                middle_name=middle_name,
                huduma_number=huduma_number,
                passport_number=passport_number,
                phone_number=phone_number,
                email=email,
            )

            # If patient_id provided, update patient with CR number
            if patient_id and client.client_number:
                patient.cr_number = client.client_number
                patient.save(update_fields=["cr_number"])

            return Response(
                {
                    "success": True,
                    "client_number": client.client_number,
                    "message": "Client registered successfully",
                },
                status=status.HTTP_201_CREATED,
            )

        except ClientRegistryError as e:
            return Response({"error": str(e), "success": False}, status=status.HTTP_400_BAD_REQUEST)
        except Exception:
            logger.exception("Client Registry registration failed")
            return Response(
                {"error": "Client registration failed. Please try again.", "success": False},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

    @extend_schema(
        request=inline_serializer(
            name="ClientRegistryUpdateRequest",
            fields={
                "client_number": serializers.CharField(),
                "phone_number": serializers.CharField(required=False),
                "email": serializers.EmailField(required=False),
                "county": serializers.CharField(required=False),
                "sub_county": serializers.CharField(required=False),
            },
        ),
        responses={
            200: inline_serializer(
                name="ClientRegistryUpdateResponse",
                fields={
                    "success": serializers.BooleanField(),
                    "client": serializers.DictField(required=False),
                    "message": serializers.CharField(required=False),
                },
            )
        },
    )
    def put(self, request):
        """
        Update an existing client in Client Registry.

        PUT /api/billing/client-registry/update/

        Request Body:
            client_number: CR client number (required)
            phone_number: Updated phone number (optional)
            email: Updated email address (optional)
            county: Updated county of residence (optional)
            sub_county: Updated sub-county of residence (optional)

        At least one field to update must be provided alongside client_number.

        Per DHA API: PUT /v3/update-client
        """
        data = request.data

        client_number = data.get("client_number")
        if not client_number:
            return Response(
                {"error": "client_number is required"}, status=status.HTTP_400_BAD_REQUEST
            )

        # Extract updatable fields
        update_fields = {}
        if "phone_number" in data:
            update_fields["phone_number"] = data["phone_number"]
        if "email" in data:
            update_fields["email"] = data["email"]
        if "county" in data:
            update_fields["county_of_residence"] = data["county"]
        if "sub_county" in data:
            update_fields["sub_county_of_residence"] = data["sub_county"]

        if not update_fields:
            return Response(
                {
                    "error": "At least one field to update is required (phone_number, email, county, sub_county)"
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            service = ClientRegistryService()
            client = service.update_client(client_number=client_number, **update_fields)

            return Response(
                {
                    "success": True,
                    "client": {
                        "client_number": client.client_number,
                        "first_name": client.first_name,
                        "last_name": client.last_name,
                        "phone_number": client.phone_number,
                        "email": client.email,
                        "county": client.county_of_residence,
                        "sub_county": client.sub_county_of_residence,
                    },
                    "message": "Client updated successfully",
                }
            )

        except ClientNotFoundError as e:
            return Response({"error": str(e), "success": False}, status=status.HTTP_404_NOT_FOUND)
        except ClientRegistryError as e:
            return Response({"error": str(e), "success": False}, status=status.HTTP_400_BAD_REQUEST)
        except Exception:
            logger.exception("Client Registry update failed")
            return Response(
                {"error": "Client update failed. Please try again.", "success": False},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )


class FacilitySearchView(APIView):
    """
    API view for facility validation via MFL.
    """

    permission_classes = [IsAuthenticated]

    @extend_schema(
        parameters=[
            OpenApiParameter("facility_code", OpenApiTypes.STR, description="Facility code"),
            OpenApiParameter("fid", OpenApiTypes.STR, description="Facility ID"),
        ],
        responses={
            200: inline_serializer(
                name="FacilitySearchResponse",
                fields={
                    "found": serializers.BooleanField(),
                    "facility": serializers.DictField(required=False),
                },
            )
        },
    )
    def get(self, request):
        """
        Search/validate facility in Master Facility List.

        GET /api/billing/facility/validate/?facility_code=XXXXX
        """
        facility_code = request.query_params.get("facility_code")
        fid = request.query_params.get("fid")

        if not facility_code and not fid:
            return Response(
                {"error": "facility_code or fid is required"}, status=status.HTTP_400_BAD_REQUEST
            )

        try:
            service = DHASearchService()
            facility = service.search_facility(
                facility_code=facility_code,
                fid=fid,
            )

            if facility and facility.found:
                return Response(
                    {
                        "found": True,
                        "facility": {
                            "facility_code": facility.facility_code,
                            "name": facility.name,
                            "level": facility.level,
                            "county": facility.county,
                            "sub_county": facility.sub_county,
                            "ward": facility.ward,
                            "ownership": facility.ownership,
                            "facility_type": facility.facility_type,
                            "operational_status": facility.operational_status,
                            "license_expiry": (
                                str(facility.license_expiry) if facility.license_expiry else None
                            ),
                            "is_sha_contracted": facility.approved,
                        },
                    }
                )
            else:
                return Response({"found": False})

        except SearchError as e:
            return Response(
                {"error": str(e), "found": False}, status=status.HTTP_503_SERVICE_UNAVAILABLE
            )
        except Exception:
            logger.exception("Facility search failed")
            return Response(
                {"error": "Facility search failed. Please try again.", "found": False},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )


class PractitionerSearchView(APIView):
    """
    API view for practitioner search via DHA Health Worker Registry.

    Searches by National ID or Passport number and returns comprehensive
    practitioner information including membership, licenses, professional
    details, and contact information.

    Based on: https://uat.dha.go.ke/v1/practitioner-search
    """

    permission_classes = [IsAuthenticated]

    @extend_schema(
        parameters=[
            OpenApiParameter(
                "identification_number",
                OpenApiTypes.STR,
                description="National ID or Passport number",
            ),
            OpenApiParameter(
                "identification_type", OpenApiTypes.STR, description="'National ID' or 'passport'"
            ),
            OpenApiParameter(
                "registration_number", OpenApiTypes.STR, description="Registration number (PUID)"
            ),
            OpenApiParameter(
                "license_number",
                OpenApiTypes.STR,
                description="License number (alias for registration_number)",
            ),
        ],
        responses={
            200: inline_serializer(
                name="PractitionerSearchResponse",
                fields={
                    "message": serializers.DictField(),
                },
            )
        },
    )
    def get(self, request):
        """
        Search practitioner in Health Worker Registry.

        GET /api/sha/practitioner/validate/?identification_type=National+ID&identification_number=12345678

        Query Parameters:
            identification_number: National ID or Passport number (required)
            identification_type: 'National ID' or 'passport' (default: 'National ID')
            registration_number: Alternative: search by registration number (PUID)

        Returns:
            Full practitioner data including membership, licenses,
            professional details, contacts, and identifiers.

        Note:
            The DHA API requires 'National ID' as the identification_type value,
            not just 'ID'. Using 'ID' may cause timeouts or errors.
        """
        identification_number = request.query_params.get("identification_number")
        identification_type = request.query_params.get("identification_type", "National ID")
        registration_number = request.query_params.get("registration_number")
        license_number = request.query_params.get("license_number")

        # license_number is an alias for registration_number
        if license_number and not registration_number:
            registration_number = license_number

        if not identification_number and not registration_number:
            return Response(
                {"error": "identification_number or registration_number is required"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            service = DHASearchService()
            practitioner = service.search_practitioner(
                identification_number=identification_number,
                identification_type=identification_type,
                registration_number=registration_number,
            )

            if practitioner and practitioner.found:
                # Return the full rich data structure
                return Response(
                    {
                        "message": {
                            "membership": {
                                "id": practitioner.membership.id,
                                "status": practitioner.membership.status,
                                "salutation": practitioner.membership.salutation,
                                "full_name": practitioner.membership.full_name,
                                "gender": practitioner.membership.gender,
                                "first_name": practitioner.membership.first_name,
                                "middle_name": practitioner.membership.middle_name,
                                "last_name": practitioner.membership.last_name,
                                "registration_id": practitioner.membership.registration_id,
                                "external_reference_id": practitioner.membership.external_reference_id,
                                "licensing_body": practitioner.membership.licensing_body,
                                "specialty": practitioner.membership.specialty,
                                "is_active": practitioner.membership.is_active,
                                "is_withdrawn": practitioner.membership.is_withdrawn,
                                "withdrawal_reason": practitioner.membership.withdrawal_reason,
                                "withdrawal_date": practitioner.membership.withdrawal_date,
                                "license_expires_in_days": practitioner.membership.license_expires_in_days,
                            },
                            "licenses": [
                                {
                                    "id": lic.id,
                                    "external_reference_id": lic.external_reference_id,
                                    "license_type": lic.license_type,
                                    "license_start": lic.license_start,
                                    "license_end": lic.license_end,
                                }
                                for lic in practitioner.licenses
                            ],
                            "professional_details": {
                                "professional_cadre": practitioner.professional_details.professional_cadre,
                                "practice_type": practitioner.professional_details.practice_type,
                                "specialty": practitioner.professional_details.specialty,
                                "subspecialty": practitioner.professional_details.subspecialty,
                                "discipline_name": practitioner.professional_details.discipline_name,
                                "educational_qualifications": practitioner.professional_details.educational_qualifications,
                            },
                            "contacts": {
                                "phone": practitioner.contacts.phone,
                                "email": practitioner.contacts.email,
                                "postal_address": practitioner.contacts.postal_address,
                            },
                            "identifiers": {
                                "identification_type": practitioner.identifiers.identification_type,
                                "identification_number": practitioner.identifiers.identification_number,
                                "client_registry_id": practitioner.identifiers.client_registry_id,
                                "student_id": practitioner.identifiers.student_id,
                            },
                        }
                    }
                )
            else:
                return Response(
                    {
                        "error": "No practitioner found with the provided identification",
                        "message": None,
                    },
                    status=status.HTTP_404_NOT_FOUND,
                )

        except SearchError as e:
            return Response(
                {"error": str(e), "message": None}, status=status.HTTP_503_SERVICE_UNAVAILABLE
            )
        except Exception:
            logger.exception("Practitioner search failed")
            return Response(
                {"error": "Practitioner search failed. Please try again.", "message": None},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )


class EligibilityCheckView(APIView):
    """
    API view for SHA eligibility verification.
    """

    permission_classes = [IsAuthenticated]

    @extend_schema(
        request=inline_serializer(
            name="EligibilityCheckRequest",
            fields={
                "patient_id": serializers.IntegerField(required=False),
                "sha_number": serializers.CharField(required=False),
            },
        ),
        responses={
            200: inline_serializer(
                name="EligibilityCheckResponse",
                fields={
                    "is_eligible": serializers.BooleanField(),
                    "result": serializers.CharField(),
                    "eligible_until": serializers.CharField(required=False),
                    "benefit_balance": serializers.FloatField(required=False),
                    "ineligibility_reason": serializers.CharField(required=False),
                    "sha_number": serializers.CharField(),
                    "membership_type": serializers.CharField(),
                },
            )
        },
    )
    def post(self, request):
        """
        Check eligibility for a patient or SHA member.

        POST /api/billing/eligibility/check/
        {
            "patient_id": 123,
            "sha_number": "SHA-XXXXX"
        }
        """
        patient_id = request.data.get("patient_id")
        sha_number = request.data.get("sha_number")

        if not patient_id and not sha_number:
            return Response(
                {"error": "patient_id or sha_number is required"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            # Try to find SHA member
            member = None
            if sha_number:
                member = SHAMember.objects.filter(sha_number=sha_number).first()
            elif patient_id:
                member = SHAMember.objects.filter(patient_id=patient_id).first()

            if not member:
                return Response(
                    {
                        "is_eligible": False,
                        "result": "NOT_FOUND",
                        "message": "No SHA membership found for this patient",
                    }
                )

            # Check eligibility
            service = SHAEligibilityService()
            check = service.check_eligibility(member, request.user)

            return Response(
                {
                    "is_eligible": getattr(check, "is_eligible", False),
                    "result": getattr(check, "result", ""),
                    "eligible_until": (
                        str(check.eligible_until)
                        if getattr(check, "eligible_until", None)
                        else None
                    ),
                    "benefit_balance": (
                        float(check.benefit_balance)
                        if getattr(check, "benefit_balance", None)
                        else None
                    ),
                    "ineligibility_reason": getattr(check, "ineligibility_reason", ""),
                    "sha_number": member.sha_number,
                    "membership_type": member.membership_type,
                }
            )

        except Exception:
            logger.exception("SHA eligibility check failed")
            return Response(
                {"error": "Eligibility check failed. Please try again.", "is_eligible": False},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )


class DirectEligibilityCheckView(APIView):
    """
    API view for direct SHA eligibility verification by ID number.

    This endpoint checks eligibility directly with SHA API without
    requiring a pre-existing SHAMember record. Useful during patient
    registration or lookup to verify SHA coverage status.
    """

    permission_classes = [IsAuthenticated]

    @extend_schema(
        parameters=[
            OpenApiParameter(
                "national_id", OpenApiTypes.STR, description="Kenya National ID number"
            ),
            OpenApiParameter("sha_number", OpenApiTypes.STR, description="SHA/CR number"),
            OpenApiParameter("identification_type", OpenApiTypes.STR, description="Custom ID type"),
            OpenApiParameter("identification_number", OpenApiTypes.STR, description="ID value"),
        ],
        responses={
            200: inline_serializer(
                name="DirectEligibilityResponse",
                fields={
                    "is_eligible": serializers.BooleanField(),
                    "sha_number": serializers.CharField(required=False),
                    "full_name": serializers.CharField(required=False),
                    "coverage_end_date": serializers.CharField(required=False),
                    "copay_percentage": serializers.IntegerField(required=False),
                    "reason": serializers.CharField(required=False),
                    "is_employed": serializers.BooleanField(required=False),
                    "error": serializers.CharField(required=False),
                },
            )
        },
    )
    def get(self, request):
        """
        Check SHA eligibility by identification.

        GET /api/billing/eligibility/direct/?national_id=12345678
        GET /api/billing/eligibility/direct/?sha_number=CR1234567890-0

        Query Parameters:
            national_id: Kenya National ID number
            sha_number: SHA/CR number
            identification_type: Custom ID type (default: 'National ID')
            identification_number: ID value (if using custom type)

        Returns:
            {
                "is_eligible": true/false,
                "sha_number": "CR...",
                "full_name": "JOHN DOE",
                "coverage_end_date": "2025-12-31",
                "copay_percentage": 0,
                "reason": "The individual is covered",
                "is_employed": true,
                "error": null
            }
        """
        national_id = request.query_params.get("national_id")
        sha_number = request.query_params.get("sha_number")
        identification_type = request.query_params.get("identification_type")
        identification_number = request.query_params.get("identification_number")

        # Determine identification type and number
        if national_id:
            id_type = "National ID"
            id_number = national_id
        elif sha_number:
            id_type = "SHA Number"
            id_number = sha_number
        elif identification_type and identification_number:
            id_type = identification_type
            id_number = identification_number
        else:
            return Response(
                {
                    "error": "national_id, sha_number, or identification_type+identification_number is required"
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            service = SHAEligibilityService()
            result = service.check_eligibility_direct(id_type, id_number)

            # Return appropriate status based on result
            if result.get("error"):
                error_code = result.get("error_code")
                if error_code == "SHA_AUTH_FAILED":
                    error_status = status.HTTP_502_BAD_GATEWAY
                elif error_code == "SHA_UPSTREAM_TIMEOUT":
                    error_status = status.HTTP_504_GATEWAY_TIMEOUT
                else:
                    error_status = status.HTTP_503_SERVICE_UNAVAILABLE

                return Response(
                    {
                        **result,
                        "message": result.get("error"),
                        "detail": result.get("error"),
                    },
                    status=error_status,
                )

            return Response(result)

        except Exception:
            logger.exception("Direct SHA eligibility check failed")
            return Response(
                {
                    "is_eligible": False,
                    "error": "Eligibility check failed. Please try again.",
                    "sha_number": None,
                    "full_name": None,
                    "coverage_end_date": None,
                    "copay_percentage": 100,
                    "reason": "Internal error",
                },
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )


class SHAWebhookView(APIView):
    """
    Webhook endpoint for receiving DHA/SHA claim responses.

    This is the callback URL that DHA calls to notify us about:
    - Claim status changes (approved, rejected, pending-verification)
    - ClaimResponse FHIR resources
    - Payment notifications

    Register this URL with DHA as your Callback URL:
    https://your-domain/api/sha/webhook/

    DHA Sandbox expects: https://taifa-hmis.com/callback
    Replace with your actual production URL.
    """

    # Allow unauthenticated access since DHA will call this
    # Use signature verification instead
    permission_classes = []

    @extend_schema(
        request=OpenApiTypes.OBJECT,
        responses={
            200: inline_serializer(
                name="WebhookResponse",
                fields={
                    "status": serializers.CharField(),
                    "message": serializers.CharField(),
                    "claim_reference": serializers.CharField(required=False),
                },
            )
        },
    )
    def post(self, request):
        """
        Receive ClaimResponse from DHA.

        Expected payload (FHIR ClaimResponse):
        {
            "resourceType": "ClaimResponse",
            "id": "claim-response-id",
            "status": "active",
            "type": {"coding": [{"code": "institutional"}]},
            "use": "claim",
            "patient": {"reference": "Patient/xxx"},
            "created": "2026-01-11T10:00:00Z",
            "insurer": {"reference": "Organization/sha"},
            "request": {"reference": "Claim/original-claim-id"},
            "outcome": "complete|queued|error|partial",
            "disposition": "Claim approved/rejected reason",
            "item": [...],
            "total": {"value": 1500.00, "currency": "KES"}
        }

        Or simplified notification:
        {
            "claim_reference": "SHA-CLM-2026-001",
            "status": "approved|rejected|pending",
            "outcome": "complete|queued|error",
            "disposition": "Reason text",
            "approved_amount": 1500.00,
            "payment_reference": "PAY-xxx"
        }
        """
        import logging

        logger = logging.getLogger("hmis.sha.webhook")

        try:
            payload = request.data
            logger.info(f"SHA Webhook received: {payload}")

            # Verify signature if provided (DHA may include HMAC signature)
            signature = request.headers.get("X-SHA-Signature")
            if signature and not self._verify_signature(request.body, signature):
                logger.warning("Invalid webhook signature")
                return Response({"error": "Invalid signature"}, status=status.HTTP_401_UNAUTHORIZED)

            # Handle FHIR ClaimResponse
            if payload.get("resourceType") == "ClaimResponse":
                return self._handle_fhir_claim_response(payload)

            # Handle simple notification format
            if "claim_reference" in payload:
                return self._handle_simple_notification(payload)

            # Unknown format - log and acknowledge
            logger.warning(f"Unknown webhook payload format: {payload}")
            return Response({"status": "received", "warning": "Unknown format"})

        except Exception as e:
            logger.exception(f"Error processing SHA webhook: {e}")
            return Response(
                {"error": "Processing error"},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

    def _verify_signature(self, body: bytes, signature: str) -> bool:
        """Verify HMAC signature from DHA."""
        import hmac

        from django.conf import settings

        secret = getattr(settings, "SHA_WEBHOOK_SECRET", None)
        if not secret:
            # No secret configured, skip verification
            return True

        expected = hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()

        return hmac.compare_digest(expected, signature)

    def _handle_fhir_claim_response(self, payload: dict) -> Response:
        """Process FHIR ClaimResponse resource."""
        import logging

        logger = logging.getLogger("hmis.sha.webhook")

        # Extract claim reference from request.reference
        request_ref = payload.get("request", {}).get("reference", "")
        claim_id = request_ref.replace("Claim/", "") if request_ref else None

        outcome = payload.get("outcome", "")  # complete, queued, error, partial
        disposition = payload.get("disposition", "")

        # Map FHIR outcome to our status
        status_map = {
            "complete": "approved",
            "queued": "pending_verification",
            "error": "rejected",
            "partial": "partially_approved",
        }
        new_status = status_map.get(outcome, "pending_verification")

        # Get approved amount from total
        total = payload.get("total", {})
        approved_amount = total.get("value", 0)

        # Update claim if we can find it
        if claim_id:
            updated = self._update_claim_status(
                claim_reference=claim_id,
                new_status=new_status,
                disposition=disposition,
                approved_amount=approved_amount,
                response_payload=payload,
            )
            if updated:
                logger.info(f"Updated claim {claim_id} to status {new_status}")
            else:
                logger.warning(f"Could not find claim with reference {claim_id}")

        return Response(
            {
                "status": "processed",
                "claim_reference": claim_id,
                "outcome": outcome,
                "new_status": new_status,
            }
        )

    def _handle_simple_notification(self, payload: dict) -> Response:
        """Process simple notification format."""
        import logging

        logger = logging.getLogger("hmis.sha.webhook")

        claim_reference = payload.get("claim_reference")
        new_status = payload.get("status", "pending_verification")
        disposition = payload.get("disposition", "")
        approved_amount = payload.get("approved_amount", 0)

        updated = self._update_claim_status(
            claim_reference=claim_reference,
            new_status=new_status,
            disposition=disposition,
            approved_amount=approved_amount,
            response_payload=payload,
        )

        if updated:
            logger.info(f"Updated claim {claim_reference} to status {new_status}")
        else:
            logger.warning(f"Could not find claim with reference {claim_reference}")

        return Response(
            {"status": "processed", "claim_reference": claim_reference, "updated": updated}
        )

    def _update_claim_status(
        self,
        claim_reference: str,
        new_status: str,
        disposition: str,
        approved_amount: float,
        response_payload: dict,
    ) -> bool:
        """Update claim status in database and notify billing staff."""
        from decimal import Decimal

        from hmis.apps.billing.agent import BillingAgentService

        # Try to find claim by SHA reference or claim number
        claim = SHAClaim.objects.filter(sha_claim_reference=claim_reference).first()

        if not claim:
            claim = SHAClaim.objects.filter(claim_number=claim_reference).first()

        if not claim:
            return False

        old_status = claim.status

        # Build update using the shared helper
        api_response = dict(response_payload)
        if disposition:
            api_response.setdefault("disposition", disposition)
        if approved_amount:
            api_response.setdefault("approved_amount", approved_amount)

        BillingAgentService._apply_status_update(claim, new_status, api_response)

        # Send notification if status actually changed
        if new_status != old_status:
            BillingAgentService._notify_claim_status_change(claim, old_status, new_status)

        return True


class SHAValidateView(APIView):
    """
    Validation endpoint for DHA to verify our system is reachable.

    This is the Validate URL that DHA uses to test connectivity:
    https://your-domain/api/sha/validate/

    DHA Sandbox expects: https://taifa-hmis/validate
    Replace with your actual production URL.
    """

    permission_classes = []  # Allow unauthenticated for health checks

    @extend_schema(
        responses={
            200: inline_serializer(
                name="SHAValidateGetResponse",
                fields={
                    "status": serializers.CharField(),
                    "system": serializers.CharField(),
                    "version": serializers.CharField(),
                    "sha_integration": serializers.DictField(),
                    "timestamp": serializers.CharField(),
                    "ready": serializers.BooleanField(),
                },
            )
        },
    )
    def get(self, request):
        """
        Health check endpoint for DHA validation.

        Returns system status and readiness for claim processing.
        """
        from django.conf import settings

        return Response(
            {
                "status": "active",
                "system": "Vitora HMIS",
                "version": getattr(settings, "VERSION", "1.0.0"),
                "sha_integration": {
                    "enabled": True,
                    "api_version": "v3",
                    "fhir_version": "R4",
                },
                "timestamp": timezone.now().isoformat(),
                "ready": True,
            }
        )

    @extend_schema(
        request=OpenApiTypes.OBJECT,
        responses={
            200: inline_serializer(
                name="SHAValidatePostResponse",
                fields={
                    "status": serializers.CharField(),
                    "result": serializers.DictField(),
                    "timestamp": serializers.CharField(),
                },
            )
        },
    )
    def post(self, request):
        """
        Validate a test payload from DHA.

        DHA may send test claims to verify integration.
        """
        payload = request.data

        # Basic validation of payload structure
        validation_result = {"valid": True, "errors": [], "warnings": []}

        # Check for required FHIR bundle fields if it's a bundle
        if payload.get("resourceType") == "Bundle":
            if "type" not in payload:
                validation_result["errors"].append("Bundle missing type field")
                validation_result["valid"] = False
            if "entry" not in payload:
                validation_result["warnings"].append("Bundle has no entries")

        return Response(
            {
                "status": "validated",
                "result": validation_result,
                "timestamp": timezone.now().isoformat(),
            }
        )


# ---------------------------------------------------------------------------
# DHA HIE Consent & Preauth Views (User Journey Compliance)
# ---------------------------------------------------------------------------


class ConsentSendOTPView(APIView):
    """
    Send OTP to patient for DHA visit consent.

    POST /api/sha/consent/send-otp/
    """

    permission_classes = [IsAuthenticated]

    def _get_facility(self, request):
        """Resolve and return the request facility, or raise 403."""
        from hmis.apps.core.mixins import resolve_request_tenant

        resolve_request_tenant(request)
        facility = getattr(request, "facility", None)
        if not facility:
            return None
        return facility

    @extend_schema(
        request=inline_serializer(
            name="ConsentSendOTPRequest",
            fields={
                "sha_member_id": serializers.IntegerField(),
            },
        ),
        responses={
            201: inline_serializer(
                name="ConsentSendOTPResponse",
                fields={
                    "id": serializers.IntegerField(),
                    "otp_reference": serializers.CharField(),
                    "status": serializers.CharField(),
                    "message": serializers.CharField(),
                },
            )
        },
    )
    def post(self, request):
        """Send OTP to patient for consent verification."""
        from hmis.apps.billing.services.sha_consent import SHAConsentError, SHAConsentService
        from hmis.apps.billing.sha_serializers import SendOTPSerializer

        facility = self._get_facility(request)
        if not facility:
            return Response(
                {
                    "error": "No facility context. Set X-Facility-ID header or assign a primary facility."
                },
                status=status.HTTP_403_FORBIDDEN,
            )

        serializer = SendOTPSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        sha_member_id = serializer.validated_data["sha_member_id"]

        try:
            sha_member = SHAMember.objects.select_related("patient").get(
                id=sha_member_id, patient__organization=facility.organization
            )
        except SHAMember.DoesNotExist:
            return Response(
                {"error": "SHA member not found"},
                status=status.HTTP_404_NOT_FOUND,
            )

        try:
            service = SHAConsentService()
            consent = service.send_otp(
                sha_member=sha_member,
                facility_code=facility.mfl_code or "",
                user=request.user,
                facility=facility,
            )

            return Response(
                {
                    "id": consent.id,
                    "otp_reference": consent.otp_reference,
                    "status": consent.status,
                    "message": "OTP sent successfully",
                },
                status=status.HTTP_201_CREATED,
            )
        except SHAConsentError as e:
            logger.warning("Failed to send OTP: %s", e.message)
            return Response(
                {"error": e.message, "code": e.code, "details": e.details},
                status=status.HTTP_502_BAD_GATEWAY,
            )


class ConsentValidateOTPView(APIView):
    """
    Validate OTP and obtain consent token from DHA.

    POST /api/sha/consent/validate-otp/
    """

    permission_classes = [IsAuthenticated]

    def _get_facility(self, request):
        """Resolve and return the request facility, or None."""
        from hmis.apps.core.mixins import resolve_request_tenant

        resolve_request_tenant(request)
        return getattr(request, "facility", None)

    @extend_schema(
        request=inline_serializer(
            name="ConsentValidateOTPRequest",
            fields={
                "consent_id": serializers.IntegerField(),
                "otp_code": serializers.CharField(),
                "encrypted_pin": serializers.CharField(required=False),
            },
        ),
        responses={
            200: inline_serializer(
                name="ConsentValidateOTPResponse",
                fields={
                    "id": serializers.IntegerField(),
                    "status": serializers.CharField(),
                    "consent_token": serializers.CharField(),
                    "expires_at": serializers.DateTimeField(),
                    "message": serializers.CharField(),
                },
            )
        },
    )
    def post(self, request):
        """Validate OTP and receive consent token."""
        from hmis.apps.billing.models import ConsentToken
        from hmis.apps.billing.services.sha_consent import SHAConsentError, SHAConsentService
        from hmis.apps.billing.sha_serializers import ValidateOTPSerializer

        facility = self._get_facility(request)
        if not facility:
            return Response(
                {
                    "error": "No facility context. Set X-Facility-ID header or assign a primary facility."
                },
                status=status.HTTP_403_FORBIDDEN,
            )

        serializer = ValidateOTPSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        consent_id = serializer.validated_data["consent_id"]
        otp_code = serializer.validated_data["otp_code"]
        encrypted_pin = serializer.validated_data.get("encrypted_pin", "")

        try:
            consent = ConsentToken.objects.get(id=consent_id, facility=facility)
        except ConsentToken.DoesNotExist:
            return Response(
                {"error": "Consent token not found"},
                status=status.HTTP_404_NOT_FOUND,
            )

        try:
            service = SHAConsentService()
            consent = service.validate_otp(
                consent=consent,
                otp_code=otp_code,
                encrypted_pin=encrypted_pin,
            )

            return Response(
                {
                    "id": consent.id,
                    "status": consent.status,
                    "consent_token": consent.consent_token,
                    "expires_at": consent.expires_at,
                    "message": "Consent validated successfully",
                },
                status=status.HTTP_200_OK,
            )
        except SHAConsentError as e:
            logger.warning("Failed to validate OTP: %s", e.message)
            return Response(
                {"error": e.message, "code": e.code, "details": e.details},
                status=status.HTTP_400_BAD_REQUEST,
            )


class ConsentDetailView(APIView):
    """
    Get consent token status.

    GET /api/sha/consent/{id}/
    """

    permission_classes = [IsAuthenticated]

    def _get_facility(self, request):
        """Resolve and return the request facility, or None."""
        from hmis.apps.core.mixins import resolve_request_tenant

        resolve_request_tenant(request)
        return getattr(request, "facility", None)

    @extend_schema(
        responses={
            200: inline_serializer(
                name="ConsentDetailResponse",
                fields={
                    "id": serializers.IntegerField(),
                    "patient": serializers.IntegerField(),
                    "sha_member": serializers.IntegerField(),
                    "consent_method": serializers.CharField(),
                    "status": serializers.CharField(),
                    "consent_token": serializers.CharField(),
                    "is_valid": serializers.BooleanField(),
                    "created_at": serializers.DateTimeField(),
                    "validated_at": serializers.DateTimeField(),
                    "expires_at": serializers.DateTimeField(),
                },
            )
        },
    )
    def get(self, request, pk):
        """Retrieve consent token details."""
        from hmis.apps.billing.models import ConsentToken
        from hmis.apps.billing.sha_serializers import ConsentTokenSerializer

        facility = self._get_facility(request)
        if not facility:
            return Response(
                {
                    "error": "No facility context. Set X-Facility-ID header or assign a primary facility."
                },
                status=status.HTTP_403_FORBIDDEN,
            )

        try:
            consent = ConsentToken.objects.select_related("patient", "sha_member").get(
                id=pk, facility=facility
            )
        except ConsentToken.DoesNotExist:
            return Response(
                {"error": "Consent token not found"},
                status=status.HTTP_404_NOT_FOUND,
            )

        serializer = ConsentTokenSerializer(consent)
        return Response(serializer.data)


class PreauthSubmitView(APIView):
    """
    Submit pre-authorization request to DHA.

    POST /api/sha/preauth/submit/
    """

    permission_classes = [IsAuthenticated]

    def _get_facility(self, request):
        """Resolve and return the request facility, or None."""
        from hmis.apps.core.mixins import resolve_request_tenant

        resolve_request_tenant(request)
        return getattr(request, "facility", None)

    @extend_schema(
        request=inline_serializer(
            name="PreauthSubmitRequest",
            fields={
                "claim_id": serializers.IntegerField(),
                "consent_token_id": serializers.IntegerField(),
                "procedure_code": serializers.CharField(),
                "diagnosis_codes": serializers.ListField(),
                "estimated_cost": serializers.DecimalField(max_digits=12, decimal_places=2),
                "scheduled_date": serializers.DateField(),
                "clinical_notes": serializers.CharField(required=False),
            },
        ),
        responses={
            201: inline_serializer(
                name="PreauthSubmitResponse",
                fields={
                    "id": serializers.IntegerField(),
                    "preauth_reference": serializers.CharField(),
                    "decision": serializers.CharField(),
                    "message": serializers.CharField(),
                },
            )
        },
    )
    def post(self, request):
        """Submit pre-authorization request."""
        from hmis.apps.billing.models import ConsentToken, PreauthRequest, SHAClaim
        from hmis.apps.billing.services.sha_preauth import SHAPreauthError, SHAPreauthService
        from hmis.apps.billing.sha_serializers import SubmitPreauthSerializer

        facility = self._get_facility(request)
        if not facility:
            return Response(
                {
                    "error": "No facility context. Set X-Facility-ID header or assign a primary facility."
                },
                status=status.HTTP_403_FORBIDDEN,
            )

        serializer = SubmitPreauthSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        # Validate references — scoped to facility
        try:
            claim = SHAClaim.objects.select_related("patient", "sha_member").get(
                id=data["claim_id"], facility=facility
            )
        except SHAClaim.DoesNotExist:
            return Response(
                {"error": "SHA claim not found"},
                status=status.HTTP_404_NOT_FOUND,
            )

        try:
            consent = ConsentToken.objects.get(id=data["consent_token_id"], facility=facility)
        except ConsentToken.DoesNotExist:
            return Response(
                {"error": "Consent token not found"},
                status=status.HTTP_404_NOT_FOUND,
            )

        if not consent.is_valid:
            return Response(
                {"error": "Consent token is expired or invalid"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            service = SHAPreauthService()
            preauth = service.submit_preauth(
                claim=claim,
                consent=consent,
                procedure_code=data["procedure_code"],
                diagnosis_codes=data["diagnosis_codes"],
                estimated_cost=data["estimated_cost"],
                scheduled_date=data["scheduled_date"],
                clinical_notes=data.get("clinical_notes", ""),
                user=request.user,
            )

            return Response(
                {
                    "id": preauth.id,
                    "preauth_reference": preauth.preauth_reference,
                    "decision": preauth.decision,
                    "message": "Pre-authorization submitted successfully",
                },
                status=status.HTTP_201_CREATED,
            )
        except SHAPreauthError as e:
            logger.warning("Failed to submit preauth: %s", e.message)
            return Response(
                {"error": e.message, "code": e.code, "details": e.details},
                status=status.HTTP_502_BAD_GATEWAY,
            )


class PreauthStatusView(APIView):
    """
    Check pre-authorization status.

    GET /api/sha/preauth/{id}/status/
    """

    permission_classes = [IsAuthenticated]

    def _get_facility(self, request):
        """Resolve and return the request facility, or None."""
        from hmis.apps.core.mixins import resolve_request_tenant

        resolve_request_tenant(request)
        return getattr(request, "facility", None)

    @extend_schema(
        responses={
            200: inline_serializer(
                name="PreauthStatusResponse",
                fields={
                    "id": serializers.IntegerField(),
                    "preauth_reference": serializers.CharField(),
                    "decision": serializers.CharField(),
                    "approved_amount": serializers.DecimalField(max_digits=12, decimal_places=2),
                    "valid_until": serializers.DateField(),
                    "is_valid": serializers.BooleanField(),
                    "poll_count": serializers.IntegerField(),
                },
            )
        },
    )
    def get(self, request, pk):
        """Retrieve pre-authorization status."""
        from hmis.apps.billing.models import PreauthRequest
        from hmis.apps.billing.sha_serializers import PreauthRequestSerializer

        facility = self._get_facility(request)
        if not facility:
            return Response(
                {
                    "error": "No facility context. Set X-Facility-ID header or assign a primary facility."
                },
                status=status.HTTP_403_FORBIDDEN,
            )

        try:
            preauth = PreauthRequest.objects.select_related("patient", "sha_member", "claim").get(
                id=pk, facility=facility
            )
        except PreauthRequest.DoesNotExist:
            return Response(
                {"error": "Pre-authorization request not found"},
                status=status.HTTP_404_NOT_FOUND,
            )

        serializer = PreauthRequestSerializer(preauth)
        return Response(serializer.data)


class PreauthPendingListView(APIView):
    """
    List pending pre-authorization requests for the facility.

    GET /api/sha/preauth/pending/
    """

    permission_classes = [IsAuthenticated]

    def _get_facility(self, request):
        """Resolve and return the request facility, or None."""
        from hmis.apps.core.mixins import resolve_request_tenant

        resolve_request_tenant(request)
        return getattr(request, "facility", None)

    @extend_schema(
        responses={
            200: inline_serializer(
                name="PreauthPendingListResponse",
                fields={
                    "count": serializers.IntegerField(),
                    "results": serializers.ListField(),
                },
            )
        },
    )
    def get(self, request):
        """List all pending preauth requests for the current facility."""
        from hmis.apps.billing.models import PreauthRequest
        from hmis.apps.billing.sha_serializers import PreauthRequestSerializer

        facility = self._get_facility(request)
        if not facility:
            return Response(
                {
                    "error": "No facility context. Set X-Facility-ID header or assign a primary facility."
                },
                status=status.HTTP_403_FORBIDDEN,
            )

        preauths = (
            PreauthRequest.objects.filter(
                decision=PreauthRequest.PreauthDecision.PENDING,
                facility=facility,
            )
            .select_related("patient", "sha_member", "claim")
            .order_by("-created_at")
        )

        serializer = PreauthRequestSerializer(preauths, many=True)
        return Response(
            {
                "count": preauths.count(),
                "results": serializer.data,
            }
        )
