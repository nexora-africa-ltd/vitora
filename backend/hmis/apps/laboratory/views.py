"""
Views for laboratory API endpoints.
"""

import logging
from datetime import date

from django.db import models
from django_filters import rest_framework as filters
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import (
    AnalyzerRun,
    Instrument,
    LabOrder,
    LabOrderItem,
    LabResult,
    LabResultAttachment,
    LOINCCode,
    TestCatalog,
)
from .reports import LabReportService
from .serializers import (
    AnalyzerRunCreateSerializer,
    AnalyzerRunMarkErrorSerializer,
    AnalyzerRunSerializer,
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


class TestCatalogViewSet(viewsets.ReadOnlyModelViewSet):
    """
    ViewSet for test catalog.
    Provides list and retrieve operations with search functionality.
    """

    queryset = TestCatalog.objects.filter(is_active=True)
    permission_classes = [IsAuthenticated]
    lookup_field = "code"

    def get_serializer_class(self):
        if self.action == "retrieve":
            return TestCatalogDetailSerializer
        return TestCatalogSerializer

    def get_queryset(self):
        queryset = super().get_queryset()

        # Search by name or code
        search = self.request.query_params.get("search", None)
        if search:
            queryset = queryset.filter(
                models.Q(name__icontains=search) | models.Q(code__icontains=search)
            )

        # Filter by category
        category = self.request.query_params.get("category", None)
        if category:
            queryset = queryset.filter(category=category)

        return queryset


class LabOrderViewSet(viewsets.ModelViewSet):
    """
    ViewSet for lab orders.
    Provides full CRUD operations plus workflow actions.
    """

    queryset = LabOrder.objects.all().select_related("patient", "encounter", "ordered_by")
    permission_classes = [IsAuthenticated]
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
        order = serializer.save()

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


class LabResultViewSet(viewsets.ModelViewSet):
    """
    ViewSet for lab results.
    Provides CRUD operations and verification.
    """

    queryset = LabResult.objects.all().select_related("order_item__test", "entered_by")
    permission_classes = [IsAuthenticated]

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
    permission_classes = [IsAuthenticated]

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


class LabQueueViewSet(viewsets.ModelViewSet):
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

    def get(self, request):
        start_date, end_date = _parse_date_range(request)
        data = LabReportService.turnaround_time_report(start_date, end_date)
        return Response(data)


class LabWorkloadReportView(APIView):
    """Report lab workload metrics."""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        start_date, end_date = _parse_date_range(request)
        data = LabReportService.workload_report(start_date, end_date)
        return Response(data)


class LabCriticalValuesReportView(APIView):
    """Report critical values metrics."""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        start_date, end_date = _parse_date_range(request)
        data = LabReportService.critical_values_report(start_date, end_date)
        return Response(data)


class LabSampleRejectionReportView(APIView):
    """Report sample rejection metrics."""

    permission_classes = [IsAuthenticated]

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

