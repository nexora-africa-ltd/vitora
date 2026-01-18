"""
Views for SHA (Social Health Authority) billing endpoints.

Provides ViewSets for SHA Members, Tariffs, Claims, and related operations.
"""

import csv
import hashlib
from datetime import date
from decimal import Decimal, InvalidOperation
from io import BytesIO

from django.db import models
from django.db.models import Count, Sum
from django.http import HttpResponse
from django.shortcuts import get_object_or_404
from django.utils import timezone
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework import filters, status, viewsets
from rest_framework.decorators import action
from rest_framework.pagination import PageNumberPagination
from rest_framework.permissions import IsAuthenticated
from rest_framework.renderers import BrowsableAPIRenderer, JSONRenderer
from rest_framework.response import Response

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
from hmis.apps.core.permissions import SHAPermission


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
    filterset_fields = ["status", "membership_type", "patient"]
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


class SHAClaimViewSet(viewsets.ModelViewSet):
    """
    ViewSet for SHA Claims management.

    Provides CRUD operations for claims with validation, submission, and appeal workflows.
    """

    queryset = (
        SHAClaim.objects.select_related(
            "patient", "sha_member", "encounter", "created_by", "submitted_by"
        )
        .prefetch_related("items", "attachments")
        .all()
    )
    lookup_value_regex = r"\d+"
    permission_classes = [IsAuthenticated, SHAPermission]
    renderer_classes = [JSONRenderer, BrowsableAPIRenderer, CSVRenderer, XLSXRenderer]
    pagination_class = SHAPagination
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ["status", "claim_type", "patient", "invoice", "encounter"]
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

        except Exception as e:
            return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)

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

        except Exception as e:
            return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)

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
                    {"file": f'File type not allowed. Allowed: {", ".join(allowed_types)}'},
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
                    f"{claim.patient.first_name} {claim.patient.last_name}"
                    if claim.patient
                    else "",
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
                    value=f"{claim.patient.first_name} {claim.patient.last_name}"
                    if claim.patient
                    else "",
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
            response[
                "Content-Disposition"
            ] = f'attachment; filename="sha_claims_{date.today()}.xlsx"'
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
        except Exception as e:
            return Response({"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    def _search_icd11_with_fallback(self, search: str, limit: int):
        """
        Search ICD-11 with fallback: DHA API first, then local container.

        Priority:
        1. If ICD11_USE_LOCAL=True, use local container only
        2. Otherwise, try DHA Terminology API first
        3. If DHA fails, fall back to local container

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

        # Try DHA Terminology API first
        try:
            logger.debug("Attempting DHA Terminology API for ICD-11 search")
            service = TerminologyService()
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

            # Fall back to local ICD-11 container
            try:
                local_service = ICD11LocalService()

                if local_service.is_available():
                    results = local_service.search(search, limit=limit)
                    data = [code.to_dict() for code in results]

                    return Response(
                        {
                            "results": data,
                            "count": len(data),
                            "source": "local_who_icd11",
                            "fallback": True,
                            "fallback_reason": str(dha_error),
                        }
                    )
                else:
                    # Fall back to local ICD-10 database
                    logger.info("Local ICD-11 container unavailable, falling back to ICD-10")
                    return self._search_icd10_fallback(search, limit, str(dha_error))

            except Exception as local_error:
                logger.error(f"Local ICD-11 fallback also failed: {local_error}")
                # Final fallback to ICD-10
                return self._search_icd10_fallback(search, limit, str(dha_error))

    def _search_icd10_fallback(self, search: str, limit: int, original_error: str = ""):
        """
        Fallback to local ICD-10 database when ICD-11 services are unavailable.
        
        ICD-10 codes are imported from CSV and stored in the local database,
        so this always works even when external services are down.
        """
        from hmis.apps.encounters.models import ICD10Code

        try:
            # Search ICD-10 codes in local database
            codes = ICD10Code.objects.filter(
                models.Q(code__icontains=search) |
                models.Q(description__icontains=search),
                is_active=True
            ).order_by('code')[:limit]

            data = [
                {
                    "code": code.code,
                    "title": code.description,
                    "chapter": code.chapter,
                    "category": code.category,
                    "source": "icd10",
                }
                for code in codes
            ]

            return Response(
                {
                    "results": data,
                    "count": len(data),
                    "source": "local_icd10_fallback",
                    "fallback": True,
                    "fallback_reason": original_error or "ICD-11 services unavailable",
                    "note": "Results are from ICD-10 (local database). ICD-11 services are currently unavailable.",
                }
            )
        except Exception as e:
            logger.error(f"ICD-10 fallback also failed: {e}")
            return Response(
                {
                    "error": "All ICD services unavailable",
                    "original_error": original_error,
                    "icd10_error": str(e),
                },
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )

    def _search_icd11_local(self, search: str, limit: int):
        """
        Search ICD-11 using local WHO ICD-11 API container.

        Args:
            search: Search query
            limit: Maximum results

        Returns:
            Response with ICD-11 codes
        """
        try:
            service = ICD11LocalService()

            # Check if service is available
            if not service.is_available():
                return Response(
                    {
                        "error": "Local ICD-11 API is not available. Start the container: docker compose -f backend/compose.yml up -d"
                    },
                    status=status.HTTP_503_SERVICE_UNAVAILABLE,
                )

            results = service.search(search, limit=limit)

            # Convert to dict format
            data = [code.to_dict() for code in results]

            return Response(
                {
                    "results": data,
                    "count": len(data),
                    "source": "local_who_icd11",
                }
            )

        except Exception as e:
            return Response(
                {"error": f"ICD-11 local search failed: {str(e)}"},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )


class ClientRegistryView(APIView):
    """
    API view for Kenya Client Registry operations.
    """

    permission_classes = [IsAuthenticated]

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
                            "date_of_birth": str(client.date_of_birth)
                            if client.date_of_birth
                            else None,
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
        except Exception as e:
            return Response(
                {"error": str(e), "found": False}, status=status.HTTP_500_INTERNAL_SERVER_ERROR
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
                    {"error": f'Missing required fields: {", ".join(missing)}'},
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
        except Exception as e:
            return Response(
                {"error": str(e), "success": False}, status=status.HTTP_500_INTERNAL_SERVER_ERROR
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
        except Exception as e:
            return Response(
                {"error": str(e), "success": False}, status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )


class FacilitySearchView(APIView):
    """
    API view for facility validation via MFL.
    """

    permission_classes = [IsAuthenticated]

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
                            "license_expiry": str(facility.license_expiry)
                            if facility.license_expiry
                            else None,
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
        except Exception as e:
            return Response(
                {"error": str(e), "found": False}, status=status.HTTP_500_INTERNAL_SERVER_ERROR
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
        except Exception as e:
            return Response(
                {"error": str(e), "message": None}, status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )


class EligibilityCheckView(APIView):
    """
    API view for SHA eligibility verification.
    """

    permission_classes = [IsAuthenticated]

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
                    "eligible_until": str(check.eligible_until)
                    if getattr(check, "eligible_until", None)
                    else None,
                    "benefit_balance": float(check.benefit_balance)
                    if getattr(check, "benefit_balance", None)
                    else None,
                    "ineligibility_reason": getattr(check, "ineligibility_reason", ""),
                    "sha_number": member.sha_number,
                    "membership_type": member.membership_type,
                }
            )

        except Exception as e:
            return Response(
                {"error": str(e), "is_eligible": False},
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
                return Response(result, status=status.HTTP_503_SERVICE_UNAVAILABLE)

            return Response(result)

        except Exception as e:
            return Response(
                {
                    "is_eligible": False,
                    "error": str(e),
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
                {"error": "Processing error", "detail": str(e)},
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
        """Update claim status in database."""
        from decimal import Decimal

        # Try to find claim by SHA reference or claim number
        claim = SHAClaim.objects.filter(sha_claim_reference=claim_reference).first()

        if not claim:
            claim = SHAClaim.objects.filter(claim_number=claim_reference).first()

        if not claim:
            return False

        # Update claim
        claim.status = new_status
        claim.disposition = disposition
        claim.approved_amount = Decimal(str(approved_amount)) if approved_amount else None
        claim.submission_response = response_payload
        claim.save(
            update_fields=[
                "status",
                "disposition",
                "approved_amount",
                "submission_response",
                "updated_at",
            ]
        )

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
