"""
Views for imaging API endpoints.
"""

import logging
from datetime import datetime

from django.db import models
from django_filters import rest_framework as filters
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from hmis.apps.core.models import AuditLog
from hmis.apps.scheduling.models import Resource

from .models import ImagingOrder, ImagingProcedure
from .serializers import (
    AppointmentSummarySerializer,
    CancelOrderSerializer,
    ImagingOrderCreateSerializer,
    ImagingOrderSerializer,
    ImagingProcedureDetailSerializer,
    ImagingProcedureSerializer,
    ImagingResourceSerializer,
    ScheduleOrderSerializer,
    ScheduleOrderWithResourceSerializer,
)
from .services import ImagingSchedulingService

logger = logging.getLogger(__name__)


def get_client_ip(request):
    """Extract client IP from request."""
    x_forwarded_for = request.META.get("HTTP_X_FORWARDED_FOR")
    if x_forwarded_for:
        return x_forwarded_for.split(",")[0].strip()
    return request.META.get("REMOTE_ADDR", "127.0.0.1")


class ImagingResourceViewSet(viewsets.ReadOnlyModelViewSet):
    """
    ViewSet for imaging scheduling resources.

    Lists radiology resources (rooms, scanners) that can be scheduled.
    Uses the scheduling.Resource model filtered by department=radiology.
    """

    permission_classes = [IsAuthenticated]
    serializer_class = ImagingResourceSerializer

    def get_queryset(self):
        """Get imaging resources filtered by department and optional modality."""
        modality = self.request.query_params.get("modality", None)
        return ImagingSchedulingService.get_imaging_resources(modality)

    def list(self, request, *args, **kwargs):
        """List imaging resources with pagination."""
        resources = self.get_queryset()
        serializer = ImagingResourceSerializer(resources, many=True)
        return Response({
            "count": len(resources),
            "results": serializer.data,
        })

    def retrieve(self, request, *args, **kwargs):
        """Retrieve a single imaging resource."""
        try:
            resource = Resource.objects.get(pk=kwargs["pk"])
            # Verify it's an imaging resource
            if resource.metadata.get("department") != "radiology":
                return Response(
                    {"error": "Resource is not an imaging resource"},
                    status=status.HTTP_404_NOT_FOUND,
                )
            serializer = ImagingResourceSerializer(resource)
            return Response(serializer.data)
        except Resource.DoesNotExist:
            return Response(
                {"error": "Resource not found"},
                status=status.HTTP_404_NOT_FOUND,
            )

    @action(detail=True, methods=["get"])
    def availability(self, request, pk=None):
        """
        Get availability slots for a specific imaging resource on a date.

        Query params:
            date: Date to check (YYYY-MM-DD format, defaults to today)
        """
        try:
            resource = Resource.objects.get(pk=pk)
        except Resource.DoesNotExist:
            return Response(
                {"error": "Resource not found"},
                status=status.HTTP_404_NOT_FOUND,
            )

        date_str = request.query_params.get("date")
        if date_str:
            try:
                for_date = datetime.strptime(date_str, "%Y-%m-%d").date()
            except ValueError:
                return Response(
                    {"error": "Invalid date format. Use YYYY-MM-DD"},
                    status=status.HTTP_400_BAD_REQUEST,
                )
        else:
            for_date = None  # Service will default to today

        slots = ImagingSchedulingService.get_resource_availability(resource, for_date)
        return Response({
            "resource_id": resource.id,
            "date": for_date.isoformat() if for_date else None,
            "slots": slots,
        })

    @action(detail=True, methods=["get"], url_path="availability/weekly")
    def availability_weekly(self, request, pk=None):
        """
        Get weekly availability for an imaging resource.

        Query params:
            start_date: Week start date (YYYY-MM-DD format, defaults to today)
        """
        try:
            resource = Resource.objects.get(pk=pk)
        except Resource.DoesNotExist:
            return Response(
                {"error": "Resource not found"},
                status=status.HTTP_404_NOT_FOUND,
            )

        date_str = request.query_params.get("start_date")
        if date_str:
            try:
                start_date = datetime.strptime(date_str, "%Y-%m-%d").date()
            except ValueError:
                return Response(
                    {"error": "Invalid date format. Use YYYY-MM-DD"},
                    status=status.HTTP_400_BAD_REQUEST,
                )
        else:
            start_date = None

        days = ImagingSchedulingService.get_weekly_availability(resource, start_date)
        return Response({
            "resource_id": resource.id,
            "days": days,
        })

    @action(detail=True, methods=["get"], url_path="availability/check")
    def availability_check(self, request, pk=None):
        """
        Check if a specific slot is available.

        Query params:
            date: Date (YYYY-MM-DD)
            start_time: Start time (HH:MM)
            end_time: End time (HH:MM)
        """
        try:
            resource = Resource.objects.get(pk=pk)
        except Resource.DoesNotExist:
            return Response(
                {"error": "Resource not found"},
                status=status.HTTP_404_NOT_FOUND,
            )

        date_str = request.query_params.get("date")
        start_time_str = request.query_params.get("start_time")
        end_time_str = request.query_params.get("end_time")

        if not all([date_str, start_time_str, end_time_str]):
            return Response(
                {"error": "date, start_time, and end_time are required"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            from zoneinfo import ZoneInfo

            check_date = datetime.strptime(date_str, "%Y-%m-%d").date()
            start_time = datetime.strptime(start_time_str, "%H:%M").time()
            end_time = datetime.strptime(end_time_str, "%H:%M").time()

            nairobi_tz = ZoneInfo("Africa/Nairobi")
            slot_start = datetime.combine(check_date, start_time, tzinfo=nairobi_tz)
            slot_end = datetime.combine(check_date, end_time, tzinfo=nairobi_tz)
        except ValueError:
            return Response(
                {"error": "Invalid date or time format"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        is_available = ImagingSchedulingService.check_slot_available(
            resource, slot_start, slot_end
        )

        return Response({
            "is_available": is_available,
            "resource_id": resource.id,
            "date": date_str,
            "start_time": start_time_str,
            "end_time": end_time_str,
        })


class ImagingCalendarView(APIView):
    """
    Combined calendar view for all imaging resources.
    """

    permission_classes = [IsAuthenticated]

    def get(self, request):
        """
        Get department-wide imaging calendar.

        Query params:
            date: Date to show (YYYY-MM-DD, defaults to today)
            modality: Optional filter by modality (XR, CT, MRI, etc.)
        """
        date_str = request.query_params.get("date")
        modality = request.query_params.get("modality")

        if date_str:
            try:
                for_date = datetime.strptime(date_str, "%Y-%m-%d").date()
            except ValueError:
                return Response(
                    {"error": "Invalid date format. Use YYYY-MM-DD"},
                    status=status.HTTP_400_BAD_REQUEST,
                )
        else:
            for_date = None

        calendar_data = ImagingSchedulingService.get_department_calendar(for_date, modality)

        return Response({
            "date": for_date.isoformat() if for_date else None,
            "resources": calendar_data,
        })


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
        """
        Schedule order (ORDERED -> SCHEDULED).

        Supports two modes:
        1. Simple scheduling: Just datetime and room name
        2. Resource scheduling: Uses scheduling system with resource_id

        If resource_id is provided, creates/links a scheduling.Appointment
        and validates modality compatibility and slot availability.
        """
        order = self.get_object()
        serializer = ScheduleOrderSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        resource_id = serializer.validated_data.get("resource_id")
        scheduled_datetime = serializer.validated_data["scheduled_datetime"]

        try:
            if resource_id:
                # Validate required fields for resource-based scheduling
                resource_serializer = ScheduleOrderWithResourceSerializer(
                    data={
                        "resource_id": resource_id,
                        "scheduled_datetime": scheduled_datetime,
                    }
                )
                resource_serializer.is_valid(raise_exception=True)

                # Resource-based scheduling with appointment linking
                try:
                    resource = Resource.objects.get(pk=resource_id)
                except Resource.DoesNotExist:
                    return Response(
                        {"error": f"Resource with id {resource_id} not found"},
                        status=status.HTTP_404_NOT_FOUND,
                    )

                # Check modality compatibility first
                order_modality = ImagingSchedulingService.get_order_modality(order)
                if order_modality and not ImagingSchedulingService.validate_resource_modality(
                    resource, order_modality
                ):
                    return Response(
                        {
                            "error": f"Resource {resource.code} does not support modality "
                            f"{order_modality}. Supported: {resource.metadata.get('modalities', [])}"
                        },
                        status=status.HTTP_400_BAD_REQUEST,
                    )

                try:
                    appointment = ImagingSchedulingService.schedule_imaging_order(
                        order, resource, scheduled_datetime, request.user
                    )
                except ValueError as ve:
                    # Slot not available
                    if "not available" in str(ve).lower():
                        return Response(
                            {"error": str(ve)},
                            status=status.HTTP_409_CONFLICT,
                        )
                    raise

                # Build response with appointment details
                order.refresh_from_db()
                output_data = ImagingOrderSerializer(order).data
                output_data["appointment"] = AppointmentSummarySerializer(appointment).data

            else:
                # Simple scheduling (backward compatible)
                order.scheduled_datetime = scheduled_datetime
                order.scheduled_room = serializer.validated_data.get("scheduled_room", "")
                order.update_status("SCHEDULED", request.user)
                output_data = ImagingOrderSerializer(order).data

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
                    "resource_id": resource_id,
                },
            )

            return Response(output_data)

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

