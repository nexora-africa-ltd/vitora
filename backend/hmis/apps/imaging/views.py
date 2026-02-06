"""
Views for imaging API endpoints.
"""

import logging

from django.db import models
from django_filters import rest_framework as filters
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from hmis.apps.core.models import AuditLog

from .models import ImagingOrder, ImagingProcedure
from .serializers import (
    CancelOrderSerializer,
    ImagingOrderCreateSerializer,
    ImagingOrderSerializer,
    ImagingProcedureDetailSerializer,
    ImagingProcedureSerializer,
    ScheduleOrderSerializer,
)

logger = logging.getLogger(__name__)


def get_client_ip(request):
    """Extract client IP from request."""
    x_forwarded_for = request.META.get("HTTP_X_FORWARDED_FOR")
    if x_forwarded_for:
        return x_forwarded_for.split(",")[0].strip()
    return request.META.get("REMOTE_ADDR", "127.0.0.1")


class ImagingProcedureViewSet(viewsets.ReadOnlyModelViewSet):
    """
    ViewSet for imaging procedure catalog.
    Provides list and retrieve operations with search functionality.
    """

    queryset = ImagingProcedure.objects.filter(is_active=True)
    permission_classes = [IsAuthenticated]
    lookup_field = "code"

    def get_serializer_class(self):
        if self.action == "retrieve":
            return ImagingProcedureDetailSerializer
        return ImagingProcedureSerializer

    def get_queryset(self):
        queryset = super().get_queryset()

        # Search by name or code
        search = self.request.query_params.get("search", None)
        if search:
            queryset = queryset.filter(
                models.Q(name__icontains=search) | models.Q(code__icontains=search)
            )

        # Filter by modality
        modality = self.request.query_params.get("modality", None)
        if modality:
            queryset = queryset.filter(modality=modality)

        # Filter by body region
        body_region = self.request.query_params.get("body_region", None)
        if body_region:
            queryset = queryset.filter(body_region=body_region)

        return queryset


class ImagingOrderViewSet(viewsets.ModelViewSet):
    """
    ViewSet for imaging orders.
    Provides full CRUD operations plus workflow actions.
    """

    queryset = ImagingOrder.objects.all().select_related("patient", "encounter", "ordered_by")
    permission_classes = [IsAuthenticated]
    filter_backends = [filters.DjangoFilterBackend]
    filterset_fields = ["patient", "encounter", "status", "priority"]
    lookup_field = "order_number"

    def get_serializer_class(self):
        if self.action == "create":
            return ImagingOrderCreateSerializer
        return ImagingOrderSerializer

    def get_queryset(self):
        queryset = super().get_queryset()

        # Filter by date range
        date_from = self.request.query_params.get("date_from", None)
        date_to = self.request.query_params.get("date_to", None)
        if date_from:
            queryset = queryset.filter(ordered_at__date__gte=date_from)
        if date_to:
            queryset = queryset.filter(ordered_at__date__lte=date_to)

        return queryset

    def create(self, request, *args, **kwargs):
        """Create a new imaging order."""
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        order = serializer.save()

        # Audit log
        AuditLog.log(
            action="imaging_order_create",
            user=request.user,
            resource_type="ImagingOrder",
            resource_id=order.id,
            ip_address=get_client_ip(request),
            details={"order_number": order.order_number},
        )

        # Return the full order representation
        output_serializer = ImagingOrderSerializer(order)
        return Response(output_serializer.data, status=status.HTTP_201_CREATED)

    def retrieve(self, request, *args, **kwargs):
        """Retrieve an imaging order."""
        instance = self.get_object()

        # Audit log
        AuditLog.log(
            action="imaging_order_view",
            user=request.user,
            resource_type="ImagingOrder",
            resource_id=instance.id,
            ip_address=get_client_ip(request),
            details={"order_number": instance.order_number},
        )

        serializer = self.get_serializer(instance)
        return Response(serializer.data)

    def update(self, request, *args, **kwargs):
        """Update an imaging order."""
        partial = kwargs.pop("partial", False)
        instance = self.get_object()
        serializer = self.get_serializer(instance, data=request.data, partial=partial)
        serializer.is_valid(raise_exception=True)
        self.perform_update(serializer)

        # Audit log
        AuditLog.log(
            action="imaging_order_update",
            user=request.user,
            resource_type="ImagingOrder",
            resource_id=instance.id,
            ip_address=get_client_ip(request),
            details={"order_number": instance.order_number, "changes": request.data},
        )

        return Response(serializer.data)

    def destroy(self, request, *args, **kwargs):
        """Delete an imaging order."""
        instance = self.get_object()
        order_id = instance.id
        order_number = instance.order_number
        self.perform_destroy(instance)

        # Audit log
        AuditLog.log(
            action="imaging_order_delete",
            user=request.user,
            resource_type="ImagingOrder",
            resource_id=order_id,
            ip_address=get_client_ip(request),
            details={"order_number": order_number},
        )

        return Response(status=status.HTTP_204_NO_CONTENT)

    @action(detail=True, methods=["post"])
    def submit(self, request, order_number=None):
        """Submit order for processing (DRAFT -> ORDERED)."""
        order = self.get_object()
        try:
            order.update_status("ORDERED", request.user)

            # Audit log
            AuditLog.log(
                action="imaging_order_submit",
                user=request.user,
                resource_type="ImagingOrder",
                resource_id=order.id,
                ip_address=get_client_ip(request),
                details={"order_number": order.order_number},
            )

            serializer = self.get_serializer(order)
            return Response(serializer.data)
        except Exception as e:
            logger.exception("Error submitting imaging order %s", order.pk)
            return Response(
                {"error": str(e)},
                status=status.HTTP_400_BAD_REQUEST,
            )

    @action(detail=True, methods=["post"])
    def schedule(self, request, order_number=None):
        """Schedule order (ORDERED -> SCHEDULED)."""
        order = self.get_object()
        serializer = ScheduleOrderSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        try:
            order.scheduled_datetime = serializer.validated_data["scheduled_datetime"]
            order.scheduled_room = serializer.validated_data.get("scheduled_room", "")
            order.update_status("SCHEDULED", request.user)

            # Audit log
            AuditLog.log(
                action="imaging_order_schedule",
                user=request.user,
                resource_type="ImagingOrder",
                resource_id=order.id,
                ip_address=get_client_ip(request),
                details={
                    "order_number": order.order_number,
                    "scheduled_datetime": str(order.scheduled_datetime),
                },
            )

            output_serializer = self.get_serializer(order)
            return Response(output_serializer.data)
        except Exception as e:
            logger.exception("Error scheduling imaging order %s", order.pk)
            return Response(
                {"error": str(e)},
                status=status.HTTP_400_BAD_REQUEST,
            )

    @action(detail=True, methods=["post"])
    def start(self, request, order_number=None):
        """Start imaging process (ORDERED/SCHEDULED -> IN_PROGRESS)."""
        order = self.get_object()
        try:
            order.update_status("IN_PROGRESS", request.user)

            # Audit log
            AuditLog.log(
                action="imaging_order_start",
                user=request.user,
                resource_type="ImagingOrder",
                resource_id=order.id,
                ip_address=get_client_ip(request),
                details={"order_number": order.order_number},
            )

            serializer = self.get_serializer(order)
            return Response(serializer.data)
        except Exception as e:
            logger.exception("Error starting imaging order %s", order.pk)
            return Response(
                {"error": str(e)},
                status=status.HTTP_400_BAD_REQUEST,
            )

    @action(detail=True, methods=["post"])
    def complete(self, request, order_number=None):
        """Complete imaging (IN_PROGRESS -> COMPLETED)."""
        order = self.get_object()
        try:
            order.update_status("COMPLETED", request.user)

            # Audit log
            AuditLog.log(
                action="imaging_order_complete",
                user=request.user,
                resource_type="ImagingOrder",
                resource_id=order.id,
                ip_address=get_client_ip(request),
                details={"order_number": order.order_number},
            )

            serializer = self.get_serializer(order)
            return Response(serializer.data)
        except Exception as e:
            logger.exception("Error completing imaging order %s", order.pk)
            return Response(
                {"error": str(e)},
                status=status.HTTP_400_BAD_REQUEST,
            )

    @action(detail=True, methods=["post"])
    def cancel(self, request, order_number=None):
        """Cancel order."""
        order = self.get_object()
        serializer = CancelOrderSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        reason = serializer.validated_data.get("reason", "No reason provided")

        try:
            order.update_status("CANCELLED", request.user)

            # Audit log
            AuditLog.log(
                action="imaging_order_cancel",
                user=request.user,
                resource_type="ImagingOrder",
                resource_id=order.id,
                ip_address=get_client_ip(request),
                details={"order_number": order.order_number, "reason": reason},
            )

            serializer = self.get_serializer(order)
            return Response(serializer.data)
        except Exception as e:
            logger.exception("Error cancelling imaging order %s", order.pk)
            return Response(
                {"error": str(e)},
                status=status.HTTP_400_BAD_REQUEST,
            )
