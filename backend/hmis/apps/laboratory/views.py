"""
Views for laboratory API endpoints.
"""

from django.db import models
from django_filters import rest_framework as filters
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from .models import LabOrder, LabResult, LOINCCode, TestCatalog
from .serializers import (
    LabOrderCreateSerializer,
    LabOrderSerializer,
    LabResultCreateSerializer,
    LabResultSerializer,
    LOINCCodeSerializer,
    TestCatalogDetailSerializer,
    TestCatalogSerializer,
)
from .services import LabAlertService, LabWorkflowService

import logging

logger = logging.getLogger(__name__)


class TestCatalogViewSet(viewsets.ReadOnlyModelViewSet):
    """
    ViewSet for test catalog.
    Provides list and retrieve operations with search functionality.
    """

    queryset = TestCatalog.objects.filter(is_active=True)
    permission_classes = [IsAuthenticated]

    def get_serializer_class(self):
        if self.action == "retrieve":
            return TestCatalogDetailSerializer
        return TestCatalogSerializer

    def get_queryset(self):
        queryset = super().get_queryset()

        # Search by name or code
        search = self.request.query_params.get("q", None)
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

    def get_serializer_class(self):
        if self.action == "create":
            return LabOrderCreateSerializer
        return LabOrderSerializer

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
    def submit(self, request, pk=None):
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

    @action(detail=True, methods=["post"])
    def collect_specimen(self, request, pk=None):
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
    def cancel(self, request, pk=None):
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

    @action(detail=True, methods=["get"])
    def results(self, request, pk=None):
        """Get all results for this order."""
        order = self.get_object()
        results = LabResult.objects.filter(order_item__lab_order=order)
        serializer = LabResultSerializer(results, many=True)
        return Response(serializer.data)

    @action(detail=True, methods=["get"])
    def critical_alerts(self, request, pk=None):
        """Get critical result alerts for this order."""
        order = self.get_object()
        alerts = LabAlertService.check_critical_results(order)
        return Response({"alerts": alerts})


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
        """Verify a result."""
        result = self.get_object()
        result.verify(request.user)
        serializer = self.get_serializer(result)
        return Response(serializer.data)

    @action(detail=False, methods=["get"])
    def pending_verification(self, request):
        """Get results pending verification."""
        results = self.queryset.filter(verification_status="UNVERIFIED")
        serializer = self.get_serializer(results, many=True)
        return Response(serializer.data)


class LOINCCodeViewSet(viewsets.ReadOnlyModelViewSet):
    """ViewSet for LOINC codes."""

    queryset = LOINCCode.objects.all()
    serializer_class = LOINCCodeSerializer
    permission_classes = [IsAuthenticated]
