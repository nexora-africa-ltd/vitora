"""
Views for laboratory API endpoints.
"""

import logging

from django.db import models
from django_filters import rest_framework as filters
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from .models import LabOrder, LabOrderItem, LabResult, LOINCCode, TestCatalog
from .serializers import (
    LabOrderCreateSerializer,
    LabOrderItemSerializer,
    LabOrderSerializer,
    LabResultCreateSerializer,
    LabResultSerializer,
    LabResultVerifySerializer,
    LOINCCodeSerializer,
    TestCatalogDetailSerializer,
    TestCatalogSerializer,
)
from .services import LabAlertService, LabWorkflowService

logger = logging.getLogger(__name__)


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
            return Response(
                LabResultSerializer(result).data, status=status.HTTP_201_CREATED
            )
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=True, methods=["get"])
    def requisition(self, request, order_number=None):
        """Generate PDF requisition for external lab."""
        from django.http import HttpResponse

        from .external import ExternalLabRequisition

        order = self.get_object()
        try:
            pdf_bytes = ExternalLabRequisition.generate_pdf(order)
            response = HttpResponse(pdf_bytes, content_type="application/pdf")
            response["Content-Disposition"] = (
                f'attachment; filename="lab_requisition_{order.order_number}.pdf"'
            )
            return response
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
        """Verify or reject a result."""
        result = self.get_object()
        serializer = LabResultVerifySerializer(data=request.data)

        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        approved = serializer.validated_data.get("approved", True)
        comments = serializer.validated_data.get("comments", "")

        if approved:
            result.verify(request.user)
            if comments:
                result.interpretation = (
                    f"{result.interpretation}\n\nVerification note: {comments}".strip()
                )
                result.save(update_fields=["interpretation"])
        else:
            # Reject the result
            result.verification_status = "REJECTED"
            result.verified_by = request.user
            from django.utils import timezone
            result.verified_at = timezone.now()
            if comments:
                result.interpretation = (
                    f"{result.interpretation}\n\nRejection reason: {comments}".strip()
                )
            result.save()

        serializer = self.get_serializer(result)
        return Response(serializer.data)

    @action(detail=False, methods=["get"], url_path="pending-verification")
    def pending_verification(self, request):
        """Get results pending verification."""
        results = self.queryset.filter(verification_status="UNVERIFIED")
        serializer = self.get_serializer(results, many=True)
        return Response(serializer.data)

    @action(
        detail=True,
        methods=["post"],
        url_path="attachment",
        parser_classes=[MultiPartParser, FormParser],
    )
    def upload_attachment(self, request, pk=None):
        """Upload external result attachment."""
        result = self.get_object()

        if "file" not in request.FILES:
            return Response(
                {"error": "No file provided"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        uploaded_file = request.FILES["file"]

        # Validate file type
        allowed_types = ["application/pdf", "image/jpeg", "image/png"]
        if uploaded_file.content_type not in allowed_types:
            return Response(
                {"error": f"Invalid file type. Allowed types: {', '.join(allowed_types)}"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Save the file
        result.external_result_attachment = uploaded_file
        result.is_external_result = True
        result.save(update_fields=["external_result_attachment", "is_external_result"])

        serializer = self.get_serializer(result)
        return Response(serializer.data)


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
    - stats: Get queue statistics
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
        ).prefetch_related("lab_order__items__test")

    def get_serializer_class(self):
        from .serializers import (
            LabQueueAssignSerializer,
            LabQueueCollectSerializer,
            LabQueueSerializer,
        )
        if self.action == "collect":
            return LabQueueCollectSerializer
        if self.action == "assign":
            return LabQueueAssignSerializer
        return LabQueueSerializer

    @action(detail=True, methods=["post"])
    def collect(self, request, queue_number=None):
        """Record sample collection."""
        from .serializers import LabQueueCollectSerializer, LabQueueSerializer
        
        queue_entry = self.get_object()
        serializer = LabQueueCollectSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        
        sample_id = serializer.validated_data.get("sample_id", "")
        queue_entry.collect_sample(request.user, sample_id)
        
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
        
        technician_id = serializer.validated_data["technician_id"]
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
