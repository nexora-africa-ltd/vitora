"""
Views for SHA (Social Health Authority) billing endpoints.

Provides ViewSets for SHA Members, Tariffs, Claims, and related operations.
"""

import csv
import hashlib
from datetime import date, timedelta
from decimal import Decimal
from io import BytesIO, StringIO

from django.db.models import Count, Sum
from django.http import HttpResponse
from django.shortcuts import get_object_or_404
from django.utils import timezone
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework import filters, status, viewsets
from rest_framework.decorators import action
from rest_framework.pagination import PageNumberPagination
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from hmis.apps.billing.models import (
    SHAClaim,
    SHAClaimAttachment,
    SHAClaimItem,
    SHAEligibilityCheck,
    SHAMember,
    SHATariff,
)
from hmis.apps.billing.sha_serializers import (
    SHAClaimAppealSerializer,
    SHAClaimAttachmentSerializer,
    SHAClaimDashboardSerializer,
    SHAClaimDetailSerializer,
    SHAClaimItemSerializer,
    SHAClaimSerializer,
    SHAClaimSubmitSerializer,
    SHAClaimValidationSerializer,
    SHAEligibilityCheckSerializer,
    SHAEligibilityVerifySerializer,
    SHAMemberDetailSerializer,
    SHAMemberSerializer,
    SHATariffSerializer,
)
from hmis.apps.billing.services.sha_eligibility import SHAEligibilityService
from hmis.apps.core.permissions import SHAPermission


class SHAPagination(PageNumberPagination):
    """Custom pagination for SHA endpoints supporting page_size parameter."""

    page_size = 10
    page_size_query_param = 'page_size'
    max_page_size = 100


class SHAMemberViewSet(viewsets.ModelViewSet):
    """
    ViewSet for SHA Member management.

    Provides CRUD operations for SHA members with eligibility verification.
    """

    queryset = SHAMember.objects.select_related('patient', 'created_by').all()
    permission_classes = [IsAuthenticated, SHAPermission]
    pagination_class = SHAPagination
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['status', 'membership_type']
    search_fields = ['sha_number', 'national_id', 'patient__first_name', 'patient__last_name']
    ordering_fields = ['created_at', 'sha_number']
    ordering = ['-created_at']

    def get_serializer_class(self):
        """Return appropriate serializer based on action."""
        if self.action == 'retrieve':
            return SHAMemberDetailSerializer
        return SHAMemberSerializer

    def get_queryset(self):
        """Filter queryset based on query parameters."""
        queryset = super().get_queryset()

        # Filter by modified_since for sync
        modified_since = self.request.query_params.get('modified_since')
        if modified_since:
            queryset = queryset.filter(updated_at__gte=modified_since)

        return queryset

    @action(detail=True, methods=['post'], url_path='verify')
    def verify(self, request, pk=None):
        """
        Verify eligibility for a SHA member.

        POST /api/sha/members/{id}/verify/
        """
        member = self.get_object()

        # For now, create a mock eligibility check
        # In production, this would call the SHA API
        check = SHAEligibilityCheck.objects.create(
            sha_member=member,
            patient=member.patient,
            result='eligible' if member.is_eligible() else 'ineligible',
            response_data={'status': 'verified', 'source': 'local'},
            response_time_ms=50,
            is_eligible=member.is_eligible(),
            eligible_until=member.coverage_end_date,
            benefit_balance=Decimal('50000.00') if member.is_eligible() else None,
            ineligibility_reason='' if member.is_eligible() else 'Coverage expired or inactive',
            checked_by=request.user,
        )

        # Update member eligibility
        check.update_member_eligibility()

        serializer = SHAEligibilityVerifySerializer({
            'is_eligible': check.is_eligible,
            'result': check.result,
            'eligible_until': check.eligible_until,
            'benefit_balance': check.benefit_balance,
            'ineligibility_reason': check.ineligibility_reason,
            'error_code': check.error_code,
            'error_message': check.error_message,
        })

        return Response(serializer.data)

    @action(detail=False, methods=['get'], url_path='search')
    def search(self, request):
        """
        Search SHA members by various criteria.

        GET /api/sha/members/search/?sha_number=XXX&national_id=XXX&patient_name=XXX
        """
        queryset = self.get_queryset()

        sha_number = request.query_params.get('sha_number')
        national_id = request.query_params.get('national_id')
        patient_name = request.query_params.get('patient_name')

        if sha_number:
            queryset = queryset.filter(sha_number__icontains=sha_number)
        if national_id:
            queryset = queryset.filter(national_id__icontains=national_id)
        if patient_name:
            queryset = queryset.filter(
                patient__first_name__icontains=patient_name
            ) | queryset.filter(
                patient__last_name__icontains=patient_name
            )

        page = self.paginate_queryset(queryset)
        if page is not None:
            serializer = self.get_serializer(page, many=True)
            return self.get_paginated_response(serializer.data)

        serializer = self.get_serializer(queryset, many=True)
        return Response({'results': serializer.data})


class SHATariffViewSet(viewsets.ReadOnlyModelViewSet):
    """
    ViewSet for SHA Tariff codes.

    Provides read-only access to SHA tariff codes with search and filtering.
    """

    queryset = SHATariff.objects.all()
    serializer_class = SHATariffSerializer
    permission_classes = [IsAuthenticated, SHAPermission]
    pagination_class = SHAPagination
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['category', 'facility_level', 'is_active']
    search_fields = ['code', 'name', 'description']
    ordering_fields = ['code', 'name', 'sha_amount']
    ordering = ['code']

    def get_queryset(self):
        """Filter queryset to only active tariffs by default."""
        queryset = super().get_queryset()

        # Only show active tariffs unless explicitly requested
        show_inactive = self.request.query_params.get('show_inactive', 'false').lower() == 'true'
        if not show_inactive:
            queryset = queryset.filter(is_active=True)

        return queryset

    @action(detail=False, methods=['get'], url_path='search')
    def search(self, request):
        """
        Search tariffs by code or name.

        GET /api/sha/tariffs/search/?code=XXX&q=XXX
        """
        queryset = self.get_queryset()

        code = request.query_params.get('code')
        q = request.query_params.get('q')

        if code:
            queryset = queryset.filter(code__icontains=code)
        if q:
            queryset = queryset.filter(name__icontains=q) | queryset.filter(description__icontains=q)

        page = self.paginate_queryset(queryset)
        if page is not None:
            serializer = self.get_serializer(page, many=True)
            return self.get_paginated_response(serializer.data)

        serializer = self.get_serializer(queryset, many=True)
        return Response({'results': serializer.data})

    @action(detail=False, methods=['get'], url_path='by-category')
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

    queryset = SHAClaim.objects.select_related(
        'patient', 'sha_member', 'encounter', 'created_by', 'submitted_by'
    ).prefetch_related('items', 'attachments').all()
    permission_classes = [IsAuthenticated, SHAPermission]
    pagination_class = SHAPagination
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['status', 'claim_type', 'patient']
    search_fields = ['claim_number', 'sha_claim_reference', 'patient__first_name', 'patient__last_name']
    ordering_fields = ['created_at', 'service_date', 'claimed_amount']
    ordering = ['-created_at']

    def get_serializer_class(self):
        """Return appropriate serializer based on action."""
        if self.action == 'retrieve':
            return SHAClaimDetailSerializer
        return SHAClaimSerializer

    def get_queryset(self):
        """Filter queryset based on query parameters."""
        queryset = super().get_queryset()

        # Filter by date range
        service_date_from = self.request.query_params.get('service_date_from')
        service_date_to = self.request.query_params.get('service_date_to')
        from_date = self.request.query_params.get('from_date')
        to_date = self.request.query_params.get('to_date')

        if service_date_from or from_date:
            date_from = service_date_from or from_date
            queryset = queryset.filter(service_date__gte=date_from)
        if service_date_to or to_date:
            date_to = service_date_to or to_date
            queryset = queryset.filter(service_date__lte=date_to)

        # Filter by modified_since for sync
        modified_since = self.request.query_params.get('modified_since')
        if modified_since:
            queryset = queryset.filter(updated_at__gte=modified_since)

        return queryset

    @action(detail=True, methods=['post'], url_path='validate')
    def validate_claim(self, request, pk=None):
        """
        Validate a claim for submission.

        POST /api/sha/claims/{id}/validate/
        """
        claim = self.get_object()
        is_valid, errors = claim.validate_for_submission()

        serializer = SHAClaimValidationSerializer({
            'is_valid': is_valid,
            'errors': errors,
        })

        return Response(serializer.data)

    @action(detail=True, methods=['post'], url_path='submit')
    def submit(self, request, pk=None):
        """
        Submit a claim to SHA.

        POST /api/sha/claims/{id}/submit/
        """
        claim = self.get_object()

        try:
            claim.submit(request.user)
            claim.refresh_from_db()

            serializer = SHAClaimSubmitSerializer({
                'status': claim.status,
                'claim_number': claim.claim_number,
                'submitted_at': claim.submitted_at,
            })

            return Response(serializer.data)

        except Exception as e:
            return Response(
                {'error': str(e)},
                status=status.HTTP_400_BAD_REQUEST
            )

    @action(detail=True, methods=['post'], url_path='appeal')
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
                {'error': 'Cannot appeal claim in current status'},
                status=status.HTTP_400_BAD_REQUEST
            )

        try:
            appeal_claim = claim.create_appeal(
                reason=appeal_serializer.validated_data['reason'],
                user=request.user
            )

            serializer = SHAClaimSerializer(appeal_claim, context={'request': request})
            return Response(serializer.data, status=status.HTTP_201_CREATED)

        except Exception as e:
            return Response(
                {'error': str(e)},
                status=status.HTTP_400_BAD_REQUEST
            )

    @action(detail=True, methods=['get', 'post'], url_path='items')
    def items(self, request, pk=None):
        """
        List or add items to a claim.

        GET /api/sha/claims/{id}/items/
        POST /api/sha/claims/{id}/items/
        """
        claim = self.get_object()

        if request.method == 'GET':
            serializer = SHAClaimItemSerializer(claim.items.all(), many=True)
            return Response(serializer.data)

        elif request.method == 'POST':
            serializer = SHAClaimItemSerializer(data=request.data)
            serializer.is_valid(raise_exception=True)

            # Check tariff max quantity if tariff is provided
            tariff_id = request.data.get('tariff')
            quantity = Decimal(request.data.get('quantity', '1'))

            if tariff_id:
                tariff = get_object_or_404(SHATariff, pk=tariff_id)
                if quantity > tariff.max_quantity_per_claim:
                    return Response(
                        {'quantity': f'Exceeds maximum quantity ({tariff.max_quantity_per_claim}) for this tariff'},
                        status=status.HTTP_400_BAD_REQUEST
                    )

            item = SHAClaimItem.objects.create(
                claim=claim,
                **serializer.validated_data
            )

            return Response(
                SHAClaimItemSerializer(item).data,
                status=status.HTTP_201_CREATED
            )

    @action(detail=True, methods=['get', 'post'], url_path='attachments')
    def attachments(self, request, pk=None):
        """
        List or upload attachments for a claim.

        GET /api/sha/claims/{id}/attachments/
        POST /api/sha/claims/{id}/attachments/
        """
        claim = self.get_object()

        if request.method == 'GET':
            serializer = SHAClaimAttachmentSerializer(claim.attachments.all(), many=True)
            return Response(serializer.data)

        elif request.method == 'POST':
            file = request.FILES.get('file')
            if not file:
                return Response(
                    {'file': 'No file provided'},
                    status=status.HTTP_400_BAD_REQUEST
                )

            # Validate file size
            max_size = 10 * 1024 * 1024  # 10MB
            if file.size > max_size:
                return Response(
                    {'file': 'File size exceeds maximum of 10MB'},
                    status=status.HTTP_400_BAD_REQUEST
                )

            # Validate file type
            allowed_types = [
                'application/pdf',
                'image/jpeg',
                'image/png',
                'image/tiff',
            ]
            if file.content_type not in allowed_types:
                return Response(
                    {'file': f'File type not allowed. Allowed: {", ".join(allowed_types)}'},
                    status=status.HTTP_400_BAD_REQUEST
                )

            # Calculate checksum
            file_content = file.read()
            checksum = hashlib.sha256(file_content).hexdigest()
            file.seek(0)  # Reset file pointer

            attachment = SHAClaimAttachment.objects.create(
                claim=claim,
                attachment_type=request.data.get('attachment_type', 'other'),
                name=request.data.get('name', file.name),
                description=request.data.get('description', ''),
                file=file,
                file_size=file.size,
                mime_type=file.content_type,
                checksum=checksum,
                original_filename=file.name,
                uploaded_by=request.user,
            )

            return Response(
                SHAClaimAttachmentSerializer(attachment).data,
                status=status.HTTP_201_CREATED
            )

    @action(detail=False, methods=['get'], url_path='dashboard')
    def dashboard(self, request):
        """
        Get claims dashboard statistics.

        GET /api/sha/claims/dashboard/?from_date=XXX&to_date=XXX
        """
        queryset = self.get_queryset()

        # Date filtering
        from_date = request.query_params.get('from_date')
        to_date = request.query_params.get('to_date')

        if from_date:
            queryset = queryset.filter(service_date__gte=from_date)
        if to_date:
            queryset = queryset.filter(service_date__lte=to_date)

        # Calculate statistics
        total_claims = queryset.count()
        aggregates = queryset.aggregate(
            total_claimed=Sum('claimed_amount'),
            total_approved=Sum('approved_amount'),
            total_paid=Sum('paid_amount'),
        )

        # Group by status
        status_counts = queryset.values('status').annotate(count=Count('id'))
        claims_by_status = {item['status']: item['count'] for item in status_counts}

        # Group by type
        type_counts = queryset.values('claim_type').annotate(count=Count('id'))
        claims_by_type = {item['claim_type']: item['count'] for item in type_counts}

        # Calculate average processing days for submitted claims
        submitted_claims = queryset.filter(submitted_at__isnull=False)
        avg_days = None
        if submitted_claims.exists():
            total_days = sum(
                (timezone.now() - claim.submitted_at).days
                for claim in submitted_claims
            )
            avg_days = total_days / submitted_claims.count()

        serializer = SHAClaimDashboardSerializer({
            'total_claims': total_claims,
            'total_claimed_amount': aggregates['total_claimed'] or Decimal('0.00'),
            'total_approved_amount': aggregates['total_approved'] or Decimal('0.00'),
            'total_paid_amount': aggregates['total_paid'] or Decimal('0.00'),
            'claims_by_status': claims_by_status,
            'claims_by_type': claims_by_type,
            'average_processing_days': avg_days,
        })

        return Response(serializer.data)

    @action(detail=False, methods=['get'], url_path='export')
    def export(self, request):
        """
        Export claims to CSV or Excel.

        GET /api/sha/claims/export/?format=csv&status=XXX&from_date=XXX&to_date=XXX
        """
        queryset = self.get_queryset()

        # Apply filters
        claim_status = request.query_params.get('status')
        from_date = request.query_params.get('from_date')
        to_date = request.query_params.get('to_date')

        if claim_status:
            queryset = queryset.filter(status=claim_status)
        if from_date:
            queryset = queryset.filter(service_date__gte=from_date)
        if to_date:
            queryset = queryset.filter(service_date__lte=to_date)

        export_format = request.query_params.get('format', 'csv')

        if export_format == 'xlsx':
            return self._export_excel(queryset)
        else:
            return self._export_csv(queryset)

    def _export_csv(self, queryset):
        """Export claims to CSV format."""
        response = HttpResponse(content_type='text/csv')
        response['Content-Disposition'] = f'attachment; filename="sha_claims_{date.today()}.csv"'

        writer = csv.writer(response)
        writer.writerow([
            'Claim Number',
            'Patient Name',
            'SHA Number',
            'Claim Type',
            'Status',
            'Service Date',
            'Claimed Amount',
            'Approved Amount',
            'Paid Amount',
            'Submitted At',
            'Created At',
        ])

        for claim in queryset:
            writer.writerow([
                claim.claim_number,
                f"{claim.patient.first_name} {claim.patient.last_name}" if claim.patient else '',
                claim.sha_member.sha_number if claim.sha_member else '',
                claim.claim_type,
                claim.status,
                claim.service_date,
                claim.claimed_amount,
                claim.approved_amount or '',
                claim.paid_amount or '',
                claim.submitted_at or '',
                claim.created_at,
            ])

        return response

    def _export_excel(self, queryset):
        """Export claims to Excel format."""
        try:
            import openpyxl
            from openpyxl.utils import get_column_letter

            wb = openpyxl.Workbook()
            ws = wb.active
            if ws is None:
                ws = wb.create_sheet('SHA Claims')
            else:
                ws.title = 'SHA Claims'

            # Headers
            headers = [
                'Claim Number',
                'Patient Name',
                'SHA Number',
                'Claim Type',
                'Status',
                'Service Date',
                'Claimed Amount',
                'Approved Amount',
                'Paid Amount',
                'Submitted At',
                'Created At',
            ]

            for col, header in enumerate(headers, 1):
                ws.cell(row=1, column=col, value=header)

            # Data
            for row, claim in enumerate(queryset, 2):
                ws.cell(row=row, column=1, value=claim.claim_number)
                ws.cell(row=row, column=2, value=f"{claim.patient.first_name} {claim.patient.last_name}" if claim.patient else '')
                ws.cell(row=row, column=3, value=claim.sha_member.sha_number if claim.sha_member else '')
                ws.cell(row=row, column=4, value=claim.claim_type)
                ws.cell(row=row, column=5, value=claim.status)
                ws.cell(row=row, column=6, value=str(claim.service_date))
                ws.cell(row=row, column=7, value=float(claim.claimed_amount))
                ws.cell(row=row, column=8, value=float(claim.approved_amount) if claim.approved_amount else '')
                ws.cell(row=row, column=9, value=float(claim.paid_amount) if claim.paid_amount else '')
                ws.cell(row=row, column=10, value=str(claim.submitted_at) if claim.submitted_at else '')
                ws.cell(row=row, column=11, value=str(claim.created_at))

            # Save to bytes
            output = BytesIO()
            wb.save(output)
            output.seek(0)

            response = HttpResponse(
                output.read(),
                content_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
            )
            response['Content-Disposition'] = f'attachment; filename="sha_claims_{date.today()}.xlsx"'
            return response

        except ImportError:
            # Fallback to CSV if openpyxl not available
            return self._export_csv(queryset)
