"""
Views for laboratory API endpoints.
"""

import logging
from datetime import date

from django.db import models
from django_filters import rest_framework as filters
from drf_spectacular.utils import extend_schema, inline_serializer
from rest_framework import serializers as drf_serializers
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from hmis.apps.core.mixins import NestedTenantScopeMixin, TenantScopedViewMixin
from hmis.apps.core.permissions import RequiresActiveShiftPermission

from .models import (
    AnalyzerRun,
    DiagnosticReport,
    Instrument,
    LabOrder,
    LabOrderItem,
    LabResult,
    LabResultAttachment,
    LOINCCode,
    Specimen,
    TestCatalog,
)
from .reports import LabReportService
from .serializers import (
    AnalyzerRunCreateSerializer,
    AnalyzerRunMarkErrorSerializer,
    AnalyzerRunSerializer,
    DiagnosticReportAmendSerializer,
    DiagnosticReportCancelSerializer,
    DiagnosticReportCreateSerializer,
    DiagnosticReportSerializer,
    DiagnosticReportUpdateSerializer,
    InstrumentCreateSerializer,
    InstrumentSerializer,
    LabOrderCreateSerializer,
    LabOrderItemSerializer,
    LabOrderSerializer,
    LabResultAttachmentCreateSerializer,
    LabResultAttachmentSerializer,
    LabResultCreateSerializer,
    LabResultSerializer,
    LabResultVerifySerializer,
    LOINCCodeSerializer,
    SpecimenSerializer,
    TestCatalogCreateSerializer,
    TestCatalogDetailSerializer,
    TestCatalogSerializer,
)
from .services import LabAlertService, LabWorkflowService

logger = logging.getLogger(__name__)


def _parse_date_range(request) -> tuple[date, date]:
    start_param = request.query_params.get("start")
    end_param = request.query_params.get("end")

    errors: dict[str, str] = {}
    if not start_param:
        errors["start"] = "start query param is required (YYYY-MM-DD)."
    if not end_param:
        errors["end"] = "end query param is required (YYYY-MM-DD)."

    if errors:
        raise ValidationError(errors)

    try:
        start_date = date.fromisoformat(start_param)
    except ValueError as exc:
        raise ValidationError({"start": "Invalid date format. Use YYYY-MM-DD."}) from exc

    try:
        end_date = date.fromisoformat(end_param)
    except ValueError as exc:
        raise ValidationError({"end": "Invalid date format. Use YYYY-MM-DD."}) from exc

    if start_date > end_date:
        raise ValidationError({"end": "End date must be on or after start date."})

    return start_date, end_date


class TestCatalogViewSet(viewsets.ModelViewSet):
    """
    ViewSet for test catalog.
    Provides full CRUD operations with search functionality.
    List/retrieve are available to all authenticated users.
    Create/update/delete require admin role.
    """

    queryset = TestCatalog.objects.all()
    permission_classes = [IsAuthenticated]
    lookup_field = "code"

    def get_serializer_class(self):
        if self.action in ("create", "update", "partial_update"):
            return TestCatalogCreateSerializer
        if self.action == "retrieve":
            return TestCatalogDetailSerializer
        return TestCatalogSerializer

    def get_queryset(self):
        queryset = super().get_queryset()

        # Non-admin list views default to active tests only
        if self.action == "list":
            show_inactive = self.request.query_params.get("show_inactive", "").lower() == "true"
            if not show_inactive:
                queryset = queryset.filter(is_active=True)

        # Search by name or code
        search = self.request.query_params.get("search", None)
        if search:
            queryset = queryset.filter(
                models.Q(name__icontains=search)
                | models.Q(code__icontains=search)
                | models.Q(short_name__icontains=search)
                | models.Q(loinc_code__icontains=search)
            )

        # Filter by category
        category = self.request.query_params.get("category", None)
        if category:
            queryset = queryset.filter(category=category)

        # Filter by specimen type
        specimen_type = self.request.query_params.get("specimen_type", None)
        if specimen_type:
            queryset = queryset.filter(specimen_type=specimen_type)

        return queryset

    def perform_create(self, serializer):
        serializer.save()

    def perform_update(self, serializer):
        serializer.save()


class LabOrderViewSet(TenantScopedViewMixin, viewsets.ModelViewSet):
    """
    ViewSet for lab orders.
    Provides full CRUD operations plus workflow actions.
    """

    tenant_scope = "facility"  # Lab orders are facility-scoped

    queryset = LabOrder.objects.all().select_related("patient", "encounter", "ordered_by")
    permission_classes = [IsAuthenticated, RequiresActiveShiftPermission]
    filter_backends = [filters.DjangoFilterBackend]
    filterset_fields = ["patient", "encounter", "status", "priority", "order_type"]
    lookup_field = "order_number"

    def get_serializer_class(self):
        if self.action == "create":
            return LabOrderCreateSerializer
        return LabOrderSerializer

    def create(self, request, *args, **kwargs):
        """Create a new lab order."""
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        order = serializer.save(**self.get_tenant_save_kwargs())

        # Return the full order representation
        output_serializer = LabOrderSerializer(order)
        return Response(output_serializer.data, status=status.HTTP_201_CREATED)

    def get_queryset(self):
        queryset = super().get_queryset()

        # Filter by date range
        date_from = self.request.query_params.get("date_from", None)
        date_to = self.request.query_params.get("date_to", None)
        if date_from:
            queryset = queryset.filter(ordered_at__gte=date_from)
        if date_to:
            queryset = queryset.filter(ordered_at__lte=date_to)

        return queryset

    @action(detail=True, methods=["post"])
    def submit(self, request, order_number=None):
        """Submit order for processing."""
        order = self.get_object()
        try:
            order = LabWorkflowService.submit_order(order, request.user)
            serializer = self.get_serializer(order)
            return Response(serializer.data)
        except Exception:
            logger.exception("Error submitting lab order %s", order.pk)
            return Response(
                {"error": "Unable to submit this lab order at this time."},
                status=status.HTTP_400_BAD_REQUEST,
            )

    @action(detail=True, methods=["post"], url_path="collect-specimen")
    def collect_specimen(self, request, order_number=None):
        """Record specimen collection."""
        order = self.get_object()
        try:
            order = LabWorkflowService.collect_specimen(order, request.user)
            serializer = self.get_serializer(order)
            return Response(serializer.data)
        except Exception:
            logger.exception("Error recording specimen collection for lab order %s", order.pk)
            return Response(
                {"error": "Unable to record specimen collection at this time."},
                status=status.HTTP_400_BAD_REQUEST,
            )

    @action(detail=True, methods=["post"])
    def cancel(self, request, order_number=None):
        """Cancel order."""
        order = self.get_object()
        reason = request.data.get("reason", "No reason provided")
        try:
            order = LabWorkflowService.cancel_order(order, request.user, reason)
            serializer = self.get_serializer(order)
            return Response(serializer.data)
        except Exception:
            logger.exception("Error cancelling lab order %s", order.pk)
            return Response(
                {"error": "Unable to cancel this lab order at this time."},
                status=status.HTTP_400_BAD_REQUEST,
            )

    @action(detail=True, methods=["post", "get"], url_path="results")
    def handle_results(self, request, order_number=None):
        """Handle results: GET to list, POST to create."""
        order = self.get_object()

        if request.method == "GET":
            # List all results for this order
            results = LabResult.objects.filter(order_item__lab_order=order)
            serializer = LabResultSerializer(results, many=True)
            return Response(serializer.data)

        # POST - Create a new result
        serializer = LabResultCreateSerializer(data=request.data, context={"request": request})
        if serializer.is_valid():
            result = serializer.save()
            return Response(LabResultSerializer(result).data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=True, methods=["get"])
    def requisition(self, request, order_number=None):
        """Generate PDF requisition for external lab."""
        from django.http import HttpResponse

        from .services.requisition import ExternalLabRequisition

        order = self.get_object()
        try:
            pdf_buffer = ExternalLabRequisition(order).generate_pdf()
            pdf_bytes = pdf_buffer.getvalue()
            response = HttpResponse(pdf_bytes, content_type="application/pdf")
            response[
                "Content-Disposition"
            ] = f'attachment; filename="lab_requisition_{order.order_number}.pdf"'
            return response
        except ValueError as exc:
            return Response({"error": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        except Exception:
            logger.exception("Error generating requisition PDF for order %s", order.pk)
            return Response(
                {"error": "Unable to generate requisition PDF."},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

    @action(detail=True, methods=["get"])
    def critical_alerts(self, request, order_number=None):
        """Get critical result alerts for this order."""
        order = self.get_object()
        alerts = LabAlertService.check_critical_results(order)
        return Response({"alerts": alerts})

    @action(
        detail=True,
        methods=["get", "post"],
        url_path="attachments",
        parser_classes=[MultiPartParser, FormParser],
    )
    def attachments(self, request, order_number=None):
        """List or upload attachments for this lab order."""
        order = self.get_object()

        if request.method == "GET":
            attachments = order.attachments.all()
            serializer = LabResultAttachmentSerializer(attachments, many=True)
            return Response(serializer.data)

        serializer = LabResultAttachmentCreateSerializer(
            data=request.data,
            context={"request": request, "lab_order": order},
        )
        serializer.is_valid(raise_exception=True)
        attachment = serializer.save()
        return Response(
            LabResultAttachmentSerializer(attachment).data,
            status=status.HTTP_201_CREATED,
        )

    @action(detail=True, methods=["get", "post"], url_path="items")
    def manage_items(self, request, order_number=None):
        """Manage order items: GET to list, POST to add."""
        order = self.get_object()

        if request.method == "GET":
            serializer = LabOrderItemSerializer(order.items.all(), many=True)
            return Response(serializer.data)

        # POST - Add a new item
        test_code = request.data.get("test_code")
        special_instructions = request.data.get("special_instructions", "")

        if not test_code:
            return Response(
                {"error": "test_code is required"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            test = TestCatalog.objects.get(code=test_code)
        except TestCatalog.DoesNotExist:
            return Response(
                {"error": f"Test with code '{test_code}' not found"},
                status=status.HTTP_404_NOT_FOUND,
            )

        # Check for duplicate test
        if order.items.filter(test=test).exists():
            return Response(
                {"error": f"Test '{test_code}' is already in this order"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        item = LabOrderItem.objects.create(
            lab_order=order,
            test=test,
            unit_cost=test.cost,
            special_instructions=special_instructions,
        )
        order.calculate_total_cost()

        serializer = LabOrderItemSerializer(item)
        return Response(serializer.data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=["delete"], url_path=r"items/(?P<item_id>\d+)")
    def delete_item(self, request, order_number=None, item_id=None):
        """Remove an item from the order."""
        order = self.get_object()

        try:
            item = order.items.get(pk=item_id)
        except LabOrderItem.DoesNotExist:
            return Response(
                {"error": "Item not found in this order"},
                status=status.HTTP_404_NOT_FOUND,
            )

        # Only allow deletion if order is still in DRAFT status
        if order.status != "DRAFT":
            return Response(
                {"error": "Can only remove items from draft orders"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        item.delete()
        order.calculate_total_cost()

        return Response(status=status.HTTP_204_NO_CONTENT)

    @action(detail=True, methods=["get", "post"], url_path="reports")
    def reports(self, request, order_number=None):
        """
        List or create diagnostic reports for a lab order.

        GET: List all reports for this order
        POST: Create a new report for this order
        """
        order = self.get_object()

        if request.method == "GET":
            reports = order.reports.all()
            serializer = DiagnosticReportSerializer(
                reports, many=True, context={"request": request}
            )
            return Response(serializer.data)

        # POST: Create new report
        # Copy request data and add lab_order from URL
        data = request.data.copy()
        data["lab_order"] = order.id
        serializer = DiagnosticReportCreateSerializer(
            data=data, context={"request": request}
        )
        serializer.is_valid(raise_exception=True)
        report = serializer.save()
        output = DiagnosticReportSerializer(report, context={"request": request})
        return Response(output.data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=["get"], url_path="specimens")
    def specimens(self, request, order_number=None):
        """
        List all specimens for a lab order.

        GET: List all specimens associated with this order.
        """
        order = self.get_object()
        specimens = order.specimens.select_related("collected_by", "received_by").all()
        serializer = SpecimenSerializer(specimens, many=True, context={"request": request})
        return Response(serializer.data)


class LabResultViewSet(NestedTenantScopeMixin, viewsets.ModelViewSet):
    """
    ViewSet for lab results.
    Provides CRUD operations and verification.
    """

    queryset = LabResult.objects.all().select_related("order_item__test", "entered_by")
    permission_classes = [IsAuthenticated, RequiresActiveShiftPermission]
    tenant_facility_chain = "order_item__lab_order__facility"
    tenant_org_chain = "order_item__lab_order__organization"

    def get_serializer_class(self):
        if self.action in ["create", "update", "partial_update"]:
            return LabResultCreateSerializer
        return LabResultSerializer

    @action(detail=True, methods=["post"])
    def verify(self, request, pk=None):
        """
        Verify or reject a result (two-stage validation support).

        Accepts:
        - approved: boolean
        - comments: optional string
        - validation_type: TECHNICAL (default) or CLINICAL

        For backward compatibility, approved=True creates an APPROVED validation,
        approved=False creates a REJECTED validation.
        """
        result = self.get_object()
        serializer = LabResultVerifySerializer(data=request.data)

        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        approved = serializer.validated_data.get("approved", True)
        comments = serializer.validated_data.get("comments", "")
        validation_type = serializer.validated_data.get("validation_type", "TECHNICAL")

        if approved:
            result.verify(request.user, validation_type=validation_type, comment=comments)
        else:
            # Reject via the validation system
            result.add_validation(
                validation_type=validation_type,
                status="REJECTED",
                validated_by=request.user,
                comment=comments,
            )
            result._update_verification_status()
            # Add rejection reason to interpretation for backward compatibility
            if comments:
                result.interpretation = (
                    f"{result.interpretation}\n\nRejection reason: {comments}".strip()
                )
                result.save(update_fields=["interpretation"])

        serializer = self.get_serializer(result)
        return Response(serializer.data)

    @action(detail=True, methods=["get"], url_path="validations")
    def validations(self, request, pk=None):
        """
        Get all validation records for a result.

        Returns the list of technical and clinical validations.
        """
        from .serializers import ResultValidationSerializer

        result = self.get_object()
        validations = result.validations.all()
        serializer = ResultValidationSerializer(validations, many=True)
        return Response(serializer.data)

    @action(detail=True, methods=["post"], url_path="validate")
    def add_validation(self, request, pk=None):
        """
        Add a validation record (TECHNICAL or CLINICAL).

        Use this endpoint for explicit two-stage validation workflow.
        For simple approve/reject, use the /verify/ endpoint instead.

        Accepts:
        - validation_type: TECHNICAL or CLINICAL
        - status: APPROVED or REJECTED
        - comment: optional string
        """
        from .serializers import ResultValidationCreateSerializer, ResultValidationSerializer

        result = self.get_object()
        serializer = ResultValidationCreateSerializer(data=request.data)

        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        validation_type = serializer.validated_data["validation_type"]
        status_value = serializer.validated_data["status"]
        comment = serializer.validated_data.get("comment", "")

        # Check if validation of this type already exists
        existing = result.validations.filter(validation_type=validation_type).first()
        if existing:
            return Response(
                {
                    "error": f"{validation_type} validation already exists for this result. "
                    "Delete it first to re-validate."
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        validation = result.add_validation(
            validation_type=validation_type,
            status=status_value,
            validated_by=request.user,
            comment=comment,
        )
        result._update_verification_status()

        return Response(ResultValidationSerializer(validation).data, status=status.HTTP_201_CREATED)

    @action(detail=False, methods=["get"], url_path="pending-verification")
    def pending_verification(self, request):
        """
        Get results pending verification.

        Query params:
        - validation_type: TECHNICAL or CLINICAL (optional)
          - TECHNICAL: Results without technical validation
          - CLINICAL: Results with technical approval but pending clinical sign-off

        Without validation_type, returns all unverified results.
        """

        validation_type = request.query_params.get("validation_type")
        results = self.queryset.filter(verification_status="UNVERIFIED")

        if validation_type == "TECHNICAL":
            # Results without any technical validation
            results = results.exclude(
                validations__validation_type="TECHNICAL", validations__status="APPROVED"
            )
        elif validation_type == "CLINICAL":
            # Results that have technical approval but need clinical sign-off
            results = results.filter(
                order_item__test__requires_clinical_signoff=True,
                validations__validation_type="TECHNICAL",
                validations__status="APPROVED",
            ).exclude(validations__validation_type="CLINICAL", validations__status="APPROVED")

        serializer = self.get_serializer(results.distinct(), many=True)
        return Response(serializer.data)

    @action(detail=False, methods=["get"], url_path="pending-clinical-signoff")
    def pending_clinical_signoff(self, request):
        """
        Get results that have technical approval but are pending clinical sign-off.

        These are results where:
        - The test requires clinical sign-off
        - Technical validation is APPROVED
        - No clinical validation exists OR clinical validation is PENDING
        """
        results = (
            self.queryset.filter(
                order_item__test__requires_clinical_signoff=True,
                validations__validation_type="TECHNICAL",
                validations__status="APPROVED",
            )
            .exclude(validations__validation_type="CLINICAL", validations__status="APPROVED")
            .distinct()
        )
        serializer = self.get_serializer(results, many=True)
        return Response(serializer.data)

    @action(
        detail=True,
        methods=["post"],
        url_path="attachment",
        parser_classes=[MultiPartParser, FormParser],
    )
    def upload_attachment(self, request, pk=None):
        """Upload external result attachment.

        Backward-compatible endpoint:
        - Stores uploads in LabResultAttachment (canonical)
        - Links LabResult.external_result_attachment to the same stored file
        """
        result = self.get_object()

        if "file" not in request.FILES:
            return Response(
                {"error": "No file provided"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        uploaded_file = request.FILES["file"]

        from .validators import validate_lab_attachment

        try:
            validate_lab_attachment(uploaded_file)
        except Exception as exc:
            return Response({"error": str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        attachment_type = (
            request.data.get("attachment_type")
            or LabResultAttachment.AttachmentType.EXTERNAL_REPORT
        )
        description = request.data.get("description") or ""

        attachment = LabResultAttachment.objects.create(
            lab_order=result.order_item.lab_order,
            file=uploaded_file,
            attachment_type=attachment_type,
            description=description,
            uploaded_by=request.user,
        )

        # Point legacy field to the same stored file (avoid double storage)
        result.external_result_attachment.name = attachment.file.name
        result.is_external_result = True
        result.save(update_fields=["external_result_attachment", "is_external_result"])

        serializer = self.get_serializer(result)
        return Response(serializer.data)


class LabAttachmentViewSet(viewsets.GenericViewSet):
    """Delete lab attachments."""

    queryset = LabResultAttachment.objects.all().select_related("lab_order", "uploaded_by")
    serializer_class = LabResultAttachmentSerializer
    permission_classes = [IsAuthenticated]

    @extend_schema(responses={204: None})
    def destroy(self, request, pk=None):
        instance = self.get_object()

        if instance.file:
            instance.file.delete(save=False)
        instance.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class PatientLabOrderViewSet(viewsets.ReadOnlyModelViewSet):
    """
    ViewSet for listing lab orders by patient.
    Used for nested route: /api/patients/{id}/lab-orders/
    """

    serializer_class = LabOrderSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        patient_pk = self.kwargs.get("patient_pk")
        return LabOrder.objects.filter(patient_id=patient_pk).select_related(
            "patient", "encounter", "ordered_by"
        )


class EncounterLabOrderViewSet(viewsets.ReadOnlyModelViewSet):
    """
    ViewSet for listing lab orders by encounter.
    Used for nested route: /api/encounters/{id}/lab-orders/
    """

    serializer_class = LabOrderSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        encounter_pk = self.kwargs.get("encounter_pk")
        return LabOrder.objects.filter(encounter_id=encounter_pk).select_related(
            "patient", "encounter", "ordered_by"
        )


class PatientLabResultViewSet(viewsets.ReadOnlyModelViewSet):
    """
    ViewSet for listing lab results by patient.
    Used for nested route: /api/patients/{id}/lab-results/
    """

    serializer_class = LabResultSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        patient_pk = self.kwargs.get("patient_pk")
        return LabResult.objects.filter(
            order_item__lab_order__patient_id=patient_pk
        ).select_related("order_item__test", "entered_by")


class LOINCCodeViewSet(viewsets.ReadOnlyModelViewSet):
    """ViewSet for LOINC codes."""

    queryset = LOINCCode.objects.all()
    serializer_class = LOINCCodeSerializer
    permission_classes = [IsAuthenticated]


# ============================================================================
# Lab Queue ViewSet
# ============================================================================


class LabQueueViewSet(NestedTenantScopeMixin, viewsets.ModelViewSet):
    """
    ViewSet for lab queue management.

    Provides queue listing, filtering, and workflow actions:
    - collect: Record sample collection
    - assign: Assign to technician
    - start-processing: Begin processing
    - submit-review: Submit for review
    - release: Release results
    - reject: Reject sample with reason
    - notes: Add/update technician notes
    - stats: Get queue statistics
    - lookup: Find by barcode
    - technicians: List available technicians
    """

    permission_classes = [IsAuthenticated]
    filter_backends = [filters.DjangoFilterBackend]
    filterset_fields = ["queue_status", "priority", "assigned_technician"]
    lookup_field = "queue_number"
    tenant_facility_chain = "lab_order__facility"
    tenant_org_chain = "lab_order__organization"

    def get_queryset(self):
        from .models import LabQueue

        return LabQueue.objects.select_related(
            "lab_order__patient",
            "lab_order__ordered_by",
            "assigned_technician",
            "collected_by",
            "reviewed_by",
            "specimen",
            "specimen__collected_by",
            "specimen__received_by",
        ).prefetch_related("lab_order__items__test")

    def get_serializer_class(self):
        from .serializers import (
            LabQueueAssignSerializer,
            LabQueueCollectSerializer,
            LabQueueNotesSerializer,
            LabQueueRejectSerializer,
            LabQueueSerializer,
        )

        if self.action == "collect":
            return LabQueueCollectSerializer
        if self.action == "assign":
            return LabQueueAssignSerializer
        if self.action == "reject":
            return LabQueueRejectSerializer
        if self.action == "notes":
            return LabQueueNotesSerializer
        return LabQueueSerializer

    @action(detail=True, methods=["post"])
    def collect(self, request, queue_number=None):
        """Record sample collection."""
        from .serializers import LabQueueCollectSerializer, LabQueueSerializer

        queue_entry = self.get_object()
        serializer = LabQueueCollectSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        barcode = serializer.validated_data.get("barcode", "")
        queue_entry.collect_sample(request.user, sample_id=barcode, barcode=barcode)

        return Response(LabQueueSerializer(queue_entry).data)

    @action(detail=True, methods=["post"])
    def assign(self, request, queue_number=None):
        """Assign to technician."""
        from django.contrib.auth import get_user_model

        from .serializers import LabQueueAssignSerializer, LabQueueSerializer

        User = get_user_model()
        queue_entry = self.get_object()
        serializer = LabQueueAssignSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        technician_id = serializer.validated_data.get("technician_id")

        if technician_id is None:
            # Unassign
            queue_entry.assigned_technician = None
            queue_entry.save(update_fields=["assigned_technician"])
        else:
            try:
                technician = User.objects.get(pk=technician_id)
            except User.DoesNotExist:
                return Response(
                    {"error": "Technician not found"},
                    status=status.HTTP_404_NOT_FOUND,
                )
            queue_entry.assign_to(technician)

        return Response(LabQueueSerializer(queue_entry).data)

    @action(detail=True, methods=["post"], url_path="start-processing")
    def start_processing(self, request, queue_number=None):
        """Start processing sample."""
        from .serializers import LabQueueSerializer

        queue_entry = self.get_object()
        queue_entry.start_processing()

        return Response(LabQueueSerializer(queue_entry).data)

    @action(detail=True, methods=["post"], url_path="submit-review")
    def submit_review(self, request, queue_number=None):
        """Submit results for review."""
        from .serializers import LabQueueSerializer

        queue_entry = self.get_object()
        queue_entry.submit_for_review()

        return Response(LabQueueSerializer(queue_entry).data)

    @action(detail=True, methods=["post"])
    def release(self, request, queue_number=None):
        """Release results."""
        from .serializers import LabQueueSerializer

        queue_entry = self.get_object()
        queue_entry.release_results(request.user)

        return Response(LabQueueSerializer(queue_entry).data)

    @action(detail=True, methods=["post"])
    def reject(self, request, queue_number=None):
        """Reject sample with reason."""
        from .serializers import LabQueueRejectSerializer, LabQueueSerializer

        queue_entry = self.get_object()

        # Cannot reject released samples
        if queue_entry.queue_status == "RELEASED":
            return Response(
                {"error": "Cannot reject released samples"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        serializer = LabQueueRejectSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        reason = serializer.validated_data["reason"]
        queue_entry.reject_sample(reason)

        return Response(LabQueueSerializer(queue_entry).data)

    @action(detail=True, methods=["post"])
    def notes(self, request, queue_number=None):
        """Add or update technician notes."""
        from .serializers import LabQueueNotesSerializer, LabQueueSerializer

        queue_entry = self.get_object()
        serializer = LabQueueNotesSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        notes = serializer.validated_data["notes"]
        append = serializer.validated_data.get("append", False)

        if append and queue_entry.technician_notes:
            queue_entry.technician_notes = f"{queue_entry.technician_notes}\n{notes}"
        else:
            queue_entry.technician_notes = notes

        queue_entry.save(update_fields=["technician_notes"])

        return Response(LabQueueSerializer(queue_entry).data)

    @action(detail=False, methods=["get"])
    def stats(self, request):
        """Get queue statistics."""
        from django.db.models import Count

        from .models import LabQueue

        stats = LabQueue.objects.values("queue_status").annotate(count=Count("id"))

        result = {
            "pending": 0,
            "collected": 0,
            "processing": 0,
            "review": 0,
            "released": 0,
        }

        status_map = {
            "PENDING": "pending",
            "COLLECTED": "collected",
            "PROCESSING": "processing",
            "REVIEW": "review",
            "RELEASED": "released",
        }

        for stat in stats:
            key = status_map.get(stat["queue_status"])
            if key:
                result[key] = stat["count"]

        return Response(result)

    @action(detail=False, methods=["get"])
    def lookup(self, request):
        """Find queue entry by barcode (specimen barcode, sample_id, or queue_number)."""
        from .models import LabQueue
        from .serializers import LabQueueSerializer

        barcode = request.query_params.get("barcode")

        if not barcode:
            return Response(
                {"error": "barcode parameter is required"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Try to find by queue_number first, then by sample_id
        queue_entry = LabQueue.objects.filter(queue_number=barcode).first()

        if not queue_entry:
            queue_entry = LabQueue.objects.filter(specimen__barcode=barcode).first()

        if not queue_entry:
            queue_entry = LabQueue.objects.filter(sample_id=barcode).first()

        if not queue_entry:
            return Response(
                {"error": "Queue entry not found"},
                status=status.HTTP_404_NOT_FOUND,
            )

        return Response(LabQueueSerializer(queue_entry).data)

    @action(detail=False, methods=["get"])
    def technicians(self, request):
        """List available lab technicians."""
        from django.contrib.auth import get_user_model

        from .serializers import TechnicianSerializer

        User = get_user_model()
        # Get all active users (in production, filter by role/group)
        users = User.objects.filter(is_active=True)

        return Response(TechnicianSerializer(users, many=True).data)


class LabTurnaroundTimeReportView(APIView):
    """Report turnaround time metrics for lab operations."""

    permission_classes = [IsAuthenticated]

    @extend_schema(
        responses={
            200: inline_serializer(
                name="TurnaroundTimeReportResponse",
                fields={
                    "start": drf_serializers.CharField(),
                    "end": drf_serializers.CharField(),
                    "overall": drf_serializers.DictField(),
                    "by_test": drf_serializers.ListField(),
                    "by_priority": drf_serializers.ListField(),
                    "queue_tat": drf_serializers.DictField(),
                },
            )
        }
    )
    def get(self, request):
        start_date, end_date = _parse_date_range(request)
        data = LabReportService.turnaround_time_report(start_date, end_date)
        return Response(data)


class LabWorkloadReportView(APIView):
    """Report lab workload metrics."""

    permission_classes = [IsAuthenticated]

    @extend_schema(
        responses={
            200: inline_serializer(
                name="WorkloadReportResponse",
                fields={
                    "start": drf_serializers.CharField(),
                    "end": drf_serializers.CharField(),
                    "totals": drf_serializers.DictField(),
                    "by_day": drf_serializers.ListField(),
                    "by_technician": drf_serializers.ListField(),
                },
            )
        }
    )
    def get(self, request):
        start_date, end_date = _parse_date_range(request)
        data = LabReportService.workload_report(start_date, end_date)
        return Response(data)


class LabCriticalValuesReportView(APIView):
    """Report critical values metrics."""

    permission_classes = [IsAuthenticated]

    @extend_schema(
        responses={
            200: inline_serializer(
                name="CriticalValuesReportResponse",
                fields={
                    "start": drf_serializers.CharField(),
                    "end": drf_serializers.CharField(),
                    "total_critical": drf_serializers.IntegerField(),
                    "by_test": drf_serializers.ListField(),
                },
            )
        }
    )
    def get(self, request):
        start_date, end_date = _parse_date_range(request)
        data = LabReportService.critical_values_report(start_date, end_date)
        return Response(data)


class LabSampleRejectionReportView(APIView):
    """Report sample rejection metrics."""

    permission_classes = [IsAuthenticated]

    @extend_schema(
        responses={
            200: inline_serializer(
                name="SampleRejectionReportResponse",
                fields={
                    "start": drf_serializers.CharField(),
                    "end": drf_serializers.CharField(),
                    "total_orders": drf_serializers.IntegerField(),
                    "rejected_orders": drf_serializers.IntegerField(),
                    "rejection_rate": drf_serializers.FloatField(),
                    "reasons": drf_serializers.ListField(),
                },
            )
        }
    )
    def get(self, request):
        start_date, end_date = _parse_date_range(request)
        data = LabReportService.sample_rejection_report(start_date, end_date)
        return Response(data)


# ============================================================================
# Phase L3 — Analyzer Integration Support
# ============================================================================


class InstrumentFilter(filters.FilterSet):
    """Filter for instruments."""

    search = filters.CharFilter(method="filter_search")

    class Meta:
        model = Instrument
        fields = {
            "is_active": ["exact"],
            "interface_type": ["exact"],
            "department": ["exact", "icontains"],
        }

    def filter_search(self, queryset, name, value):
        """Search by code or name."""
        return queryset.filter(
            models.Q(code__icontains=value) | models.Q(name__icontains=value)
        )


class InstrumentViewSet(viewsets.ModelViewSet):
    """
    ViewSet for laboratory instruments.

    Provides CRUD operations for managing lab analyzers and instruments.
    """

    queryset = Instrument.objects.all()
    permission_classes = [IsAuthenticated]
    filterset_class = InstrumentFilter

    def get_serializer_class(self):
        if self.action in ["create", "update", "partial_update"]:
            return InstrumentCreateSerializer
        return InstrumentSerializer

    def get_queryset(self):
        queryset = super().get_queryset()
        # Default to showing only active instruments unless filtered
        if "is_active" not in self.request.query_params:
            queryset = queryset.filter(is_active=True)
        return queryset


class AnalyzerRunFilter(filters.FilterSet):
    """Filter for analyzer runs."""

    specimen_barcode = filters.CharFilter(field_name="specimen__barcode")
    order_number = filters.CharFilter(field_name="specimen__lab_order__order_number")

    class Meta:
        model = AnalyzerRun
        fields = {
            "status": ["exact"],
            "instrument": ["exact"],
            "run_datetime": ["gte", "lte"],
        }


class AnalyzerRunViewSet(viewsets.ModelViewSet):
    """
    ViewSet for analyzer runs.

    Provides CRUD operations for managing raw analyzer data and
    tracking instrument message processing.
    """

    queryset = AnalyzerRun.objects.select_related(
        "specimen", "instrument", "operator"
    ).all()
    permission_classes = [IsAuthenticated]
    filterset_class = AnalyzerRunFilter

    def get_serializer_class(self):
        if self.action in ["create"]:
            return AnalyzerRunCreateSerializer
        if self.action == "mark_error":
            return AnalyzerRunMarkErrorSerializer
        return AnalyzerRunSerializer

    @action(detail=True, methods=["post"])
    def mark_error(self, request, pk=None):
        """Mark this analyzer run as failed with an error message."""
        run = self.get_object()
        serializer = AnalyzerRunMarkErrorSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        run.mark_error(serializer.validated_data["error_message"])
        return Response(AnalyzerRunSerializer(run).data)

    @action(detail=True, methods=["post"])
    def mark_applied(self, request, pk=None):
        """Mark this analyzer run as applied (results created)."""
        run = self.get_object()

        if run.status != AnalyzerRun.Status.PARSED:
            return Response(
                {"detail": "Can only mark PARSED runs as APPLIED."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        run.mark_applied()
        return Response(AnalyzerRunSerializer(run).data)


# ============================================================================
# Phase L4 — Diagnostic Report ViewSet
# ============================================================================


class DiagnosticReportFilter(filters.FilterSet):
    """Filter for diagnostic reports."""

    lab_order_number = filters.CharFilter(field_name="lab_order__order_number")
    patient = filters.NumberFilter(field_name="lab_order__patient_id")

    class Meta:
        model = DiagnosticReport
        fields = {
            "status": ["exact"],
            "lab_order": ["exact"],
            "issued_by": ["exact"],
            "issued_at": ["gte", "lte"],
            "created_at": ["gte", "lte"],
        }


class DiagnosticReportViewSet(viewsets.ModelViewSet):
    """
    ViewSet for diagnostic reports (Phase L4).

    Provides CRUD operations for formal patient-facing lab reports,
    with workflow actions for finalization, amendment, and cancellation.
    """

    queryset = DiagnosticReport.objects.select_related(
        "lab_order",
        "lab_order__patient",
        "issued_by",
        "amended_by",
    ).all()
    permission_classes = [IsAuthenticated]
    filterset_class = DiagnosticReportFilter

    def get_serializer_class(self):
        if self.action == "create":
            return DiagnosticReportCreateSerializer
        if self.action in ["update", "partial_update"]:
            return DiagnosticReportUpdateSerializer
        if self.action == "amend":
            return DiagnosticReportAmendSerializer
        if self.action == "cancel":
            return DiagnosticReportCancelSerializer
        return DiagnosticReportSerializer

    def create(self, request, *args, **kwargs):
        """Create a new diagnostic report and return full representation."""
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        report = serializer.save()

        # Return the full report representation
        output_serializer = DiagnosticReportSerializer(report, context={"request": request})
        return Response(output_serializer.data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=["post"])
    def finalize(self, request, pk=None):
        """
        Finalize a draft diagnostic report.

        Sets status to FINAL and records issued_at timestamp.
        """
        report = self.get_object()
        try:
            report.finalize()
            return Response(DiagnosticReportSerializer(report, context={"request": request}).data)
        except Exception as e:
            logger.exception("Error finalizing diagnostic report %s", pk)
            return Response(
                {"detail": str(e)},
                status=status.HTTP_400_BAD_REQUEST,
            )

    @action(detail=True, methods=["post"])
    def amend(self, request, pk=None):
        """
        Amend a finalized diagnostic report.

        Updates conclusion and sets status to AMENDED.
        """
        report = self.get_object()
        serializer = DiagnosticReportAmendSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        try:
            report.amend(
                new_conclusion=serializer.validated_data["conclusion"],
                amended_by=request.user,
            )
            return Response(DiagnosticReportSerializer(report, context={"request": request}).data)
        except Exception as e:
            logger.exception("Error amending diagnostic report %s", pk)
            return Response(
                {"detail": str(e)},
                status=status.HTTP_400_BAD_REQUEST,
            )

    @action(detail=True, methods=["post"])
    def cancel(self, request, pk=None):
        """
        Cancel a diagnostic report.

        Sets status to CANCELLED and records cancellation reason.
        """
        report = self.get_object()
        serializer = DiagnosticReportCancelSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        try:
            report.cancel(reason=serializer.validated_data["reason"])
            return Response(DiagnosticReportSerializer(report, context={"request": request}).data)
        except Exception as e:
            logger.exception("Error cancelling diagnostic report %s", pk)
            return Response(
                {"detail": str(e)},
                status=status.HTTP_400_BAD_REQUEST,
            )

    @action(detail=True, methods=["post"], url_path="generate_pdf")
    def generate_pdf(self, request, pk=None):
        """
        Generate PDF for a diagnostic report.

        Creates a PDF file from the lab results and stores it.
        """
        from io import BytesIO

        from django.core.files.base import ContentFile
        from reportlab.lib import colors
        from reportlab.lib.pagesizes import A4
        from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
        from reportlab.lib.units import mm
        from reportlab.platypus import (
            Paragraph,
            SimpleDocTemplate,
            Spacer,
            Table,
            TableStyle,
        )

        report = self.get_object()
        lab_order = report.lab_order

        # Create PDF
        buffer = BytesIO()
        doc = SimpleDocTemplate(
            buffer,
            pagesize=A4,
            leftMargin=20 * mm,
            rightMargin=20 * mm,
            topMargin=20 * mm,
            bottomMargin=20 * mm,
        )

        styles = getSampleStyleSheet()
        title_style = ParagraphStyle(
            "Title",
            parent=styles["Heading1"],
            fontSize=16,
            alignment=1,  # Center
        )

        elements = []

        # Header
        elements.append(Paragraph("DIAGNOSTIC REPORT", title_style))
        elements.append(Spacer(1, 10 * mm))

        # Report info
        info_data = [
            ["Report Number:", report.report_number],
            ["Order Number:", lab_order.order_number],
            ["Patient:", str(lab_order.patient)],
            ["Ordered By:", str(lab_order.ordered_by)],
            ["Order Date:", lab_order.ordered_at.strftime("%Y-%m-%d %H:%M")],
            ["Report Status:", report.get_status_display()],
        ]
        if report.issued_at:
            info_data.append(["Issued Date:", report.issued_at.strftime("%Y-%m-%d %H:%M")])

        info_table = Table(info_data, colWidths=[50 * mm, 100 * mm])
        info_table.setStyle(
            TableStyle(
                [
                    ("FONTNAME", (0, 0), (0, -1), "Helvetica-Bold"),
                    ("FONTNAME", (1, 0), (1, -1), "Helvetica"),
                    ("FONTSIZE", (0, 0), (-1, -1), 10),
                    ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
                ]
            )
        )
        elements.append(info_table)
        elements.append(Spacer(1, 10 * mm))

        # Results table
        results_data = [["Test", "Result", "Reference Range", "Flag"]]
        for item in lab_order.items.select_related("test", "result").all():
            if hasattr(item, "result") and item.result:
                result = item.result
                result_value = (
                    result.text_value or str(result.numeric_value or "") or result.option_value
                )
                results_data.append(
                    [
                        item.test.name,
                        f"{result_value} {result.result_unit or ''}".strip(),
                        result.reference_range_text or "-",
                        result.result_flag or "NORMAL",
                    ]
                )
            else:
                results_data.append([item.test.name, "Pending", "-", "-"])

        results_table = Table(results_data, colWidths=[60 * mm, 40 * mm, 40 * mm, 30 * mm])
        results_table.setStyle(
            TableStyle(
                [
                    ("BACKGROUND", (0, 0), (-1, 0), colors.grey),
                    ("TEXTCOLOR", (0, 0), (-1, 0), colors.whitesmoke),
                    ("ALIGN", (0, 0), (-1, -1), "LEFT"),
                    ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                    ("FONTSIZE", (0, 0), (-1, -1), 9),
                    ("BOTTOMPADDING", (0, 0), (-1, 0), 8),
                    ("BACKGROUND", (0, 1), (-1, -1), colors.beige),
                    ("GRID", (0, 0), (-1, -1), 0.5, colors.black),
                ]
            )
        )
        elements.append(results_table)
        elements.append(Spacer(1, 10 * mm))

        # Conclusion
        if report.conclusion:
            elements.append(Paragraph("<b>Conclusion:</b>", styles["Normal"]))
            elements.append(Paragraph(report.conclusion, styles["Normal"]))
            elements.append(Spacer(1, 5 * mm))

        # Clinical info
        if report.clinical_info:
            elements.append(Paragraph("<b>Clinical Information:</b>", styles["Normal"]))
            elements.append(Paragraph(report.clinical_info, styles["Normal"]))

        # Build PDF
        doc.build(elements)

        # Save to model
        pdf_content = buffer.getvalue()
        filename = f"report_{report.report_number}.pdf"
        report.pdf_file.save(filename, ContentFile(pdf_content), save=True)

        return Response(
            {
                "detail": "PDF generated successfully.",
                "pdf_url": request.build_absolute_uri(report.pdf_file.url),
            }
        )


# ============================================================================
# Specimen ViewSet
# ============================================================================


class SpecimenFilter(filters.FilterSet):
    """Filter for specimens."""

    order_number = filters.CharFilter(field_name="lab_order__order_number")
    patient = filters.NumberFilter(field_name="lab_order__patient_id")

    class Meta:
        model = Specimen
        fields = {
            "status": ["exact"],
            "specimen_type": ["exact"],
            "lab_order": ["exact"],
            "collected_at": ["gte", "lte"],
            "created_at": ["gte", "lte"],
        }


class SpecimenViewSet(viewsets.ReadOnlyModelViewSet):
    """
    ViewSet for specimens — read-only.

    Provides list and retrieve operations for specimen tracking.
    Specimens are created automatically via signals when lab orders/queue entries are created.

    Lookup is by barcode (unique identifier).
    """

    queryset = Specimen.objects.select_related(
        "lab_order",
        "lab_order__patient",
        "collected_by",
        "received_by",
    ).prefetch_related("order_items").all()
    serializer_class = SpecimenSerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [filters.DjangoFilterBackend]
    filterset_class = SpecimenFilter
    lookup_field = "barcode"

    def get_queryset(self):
        queryset = super().get_queryset()

        # Search by barcode prefix
        barcode = self.request.query_params.get("barcode")
        if barcode:
            queryset = queryset.filter(barcode__icontains=barcode)

        return queryset

