# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
# ruff: noqa: ARG002, E402, F401
"""Imaging views workflow for Vitora HMIS.

What this file is for:
- Implement views workflow logic for the imaging domain.

How to use it:
- Import classes and functions from this module in Django app code and tests.

Supported inputs/args:
- Python imports and Django ORM/runtime inputs; no standalone CLI arguments.
"""

import logging
import os
import tempfile
from collections import defaultdict
from datetime import datetime

from django.conf import settings
from django.core.exceptions import ObjectDoesNotExist, ValidationError
from django.db import DatabaseError, IntegrityError, models
from django.http import FileResponse, HttpResponse
from django_filters import rest_framework as filters
from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.filters import SearchFilter
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from hmis.apps.core.mixins import (
    NestedTenantScopeMixin,
    ReadOnCreateMixin,
    TenantScopedViewMixin,
    resolve_request_tenant,
)
from hmis.apps.core.models import AuditLog
from hmis.apps.core.openapi import SchemaFallbackSerializer
from hmis.apps.core.permissions import ReadRequiresModelPermission, WriteRequiresRolePermission
from hmis.apps.scheduling.models import Resource

from .models import (
    DICOMInstance,
    DICOMSeries,
    DICOMStudy,
    ImagingIntegrationSettings,
    ImagingOrder,
    ImagingProcedure,
    RadiologyReport,
    ReportAmendment,
)
from .serializers import (
    AmendReportSerializer,
    AppointmentSummarySerializer,
    CancelOrderSerializer,
    CommunicateCriticalSerializer,
    DICOMInstanceSerializer,
    DICOMSeriesListSerializer,
    DICOMStudyDetailSerializer,
    DICOMStudySerializer,
    EncounterExternalImagingRequestCreateSerializer,
    ExternalImagingOrderRequestSerializer,
    ImagingIntegrationSettingsSerializer,
    ImagingOrderCreateSerializer,
    ImagingOrderSerializer,
    ImagingProcedureCreateSerializer,
    ImagingProcedureDetailSerializer,
    ImagingProcedureSerializer,
    ImagingResourceSerializer,
    RadiologyReportCreateSerializer,
    RadiologyReportSerializer,
    RadiologyReportUpdateSerializer,
    ScheduleOrderSerializer,
    ScheduleOrderWithResourceSerializer,
    SignReportSerializer,
)
from .services import (
    DICOMParsingService,
    ImagingSchedulingService,
    PACSStorageService,
    recompute_study_statistics,
    resolve_equipment_from_metadata,
)
from .standalone.models import ExternalImagingOrderRequest

logger = logging.getLogger(__name__)

from hmis.apps.imaging.views_shared import _imaging_action_exceptions, get_client_ip


class ImagingResourceViewSet(viewsets.ReadOnlyModelViewSet):
    """
    ViewSet for imaging scheduling resources.

    Lists radiology resources (rooms, scanners) that can be scheduled.
    Uses the scheduling.Resource model filtered by department=radiology.
    """

    permission_classes = [IsAuthenticated, WriteRequiresRolePermission, ReadRequiresModelPermission]
    serializer_class = ImagingResourceSerializer

    def get_queryset(self):
        """Get imaging resources filtered by department and optional modality."""
        # Check if this is a schema generation request
        if getattr(self, "swagger_fake_view", False):
            return Resource.objects.none()

        # Resolve tenant context (handles DRF test clients)
        resolve_request_tenant(self.request)

        # Scope by facility
        facility = getattr(self.request, "facility", None)
        modality = self.request.query_params.get("modality", None)

        # Build queryset directly instead of using service (which returns list)
        # Legacy imaging resources store their department in metadata, while
        # resources created from Scheduling use the direct department FK.
        qs = Resource.objects.filter(is_active=True).filter(
            models.Q(metadata__department="radiology")
            | models.Q(department__name__iexact="Radiology")
        )
        if facility:
            qs = qs.filter(facility=facility)
        elif not getattr(self.request.user, "is_superuser", False):
            return Resource.objects.none()

        if modality:
            # Python-side modality filter (SQLite compat)
            ids = [r.id for r in qs if modality in r.metadata.get("modalities", [])]
            qs = qs.filter(id__in=ids)

        return qs

    def list(self, request, *args, **kwargs):
        """List imaging resources with pagination."""
        resources = self.get_queryset()
        serializer = ImagingResourceSerializer(resources, many=True)
        return Response(
            {
                "count": len(resources),
                "results": serializer.data,
            }
        )

    def retrieve(self, request, *args, **kwargs):
        """Retrieve a single imaging resource."""
        try:
            resource = Resource.objects.get(pk=kwargs["pk"])
            # Verify it's an imaging resource
            is_radiology_resource = (
                resource.metadata.get("department") == "radiology"
                or getattr(resource.department, "name", "").lower() == "radiology"
            )
            if not is_radiology_resource:
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
        return Response(
            {
                "resource_id": resource.id,
                "date": for_date.isoformat() if for_date else None,
                "slots": slots,
            }
        )

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
        return Response(
            {
                "resource_id": resource.id,
                "days": days,
            }
        )

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

        is_available = ImagingSchedulingService.check_slot_available(resource, slot_start, slot_end)

        return Response(
            {
                "is_available": is_available,
                "resource_id": resource.id,
                "date": date_str,
                "start_time": start_time_str,
                "end_time": end_time_str,
            }
        )


class ImagingCalendarView(APIView):
    """
    Combined calendar view for all imaging resources.
    """

    permission_classes = [IsAuthenticated, WriteRequiresRolePermission, ReadRequiresModelPermission]

    @extend_schema(
        parameters=[
            OpenApiParameter(
                "date",
                OpenApiTypes.DATE,
                description="Date to show (YYYY-MM-DD, defaults to today)",
                required=False,
            ),
            OpenApiParameter(
                "modality",
                OpenApiTypes.STR,
                description="Filter by modality (XR, CT, MRI, etc.)",
                required=False,
            ),
        ],
        responses={200: OpenApiTypes.OBJECT},
    )
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

        return Response(
            {
                "date": for_date.isoformat() if for_date else None,
                "resources": calendar_data,
            }
        )


class ImagingProcedureViewSet(ReadOnCreateMixin, TenantScopedViewMixin, viewsets.ModelViewSet):
    """
    ViewSet for imaging procedure catalog.
    Full CRUD with facility scoping and seed defaults action.
    """

    queryset = ImagingProcedure.objects.all()
    permission_classes = [IsAuthenticated, WriteRequiresRolePermission, ReadRequiresModelPermission]
    lookup_field = "code"
    tenant_scope = "facility"

    def get_serializer_class(self):
        if self.action == "create":
            return ImagingProcedureCreateSerializer
        if self.action == "retrieve":
            return ImagingProcedureDetailSerializer
        return ImagingProcedureSerializer

    def get_queryset(self):
        queryset = super().get_queryset()

        # Default: only active unless explicitly requested
        is_active = self.request.query_params.get("is_active", None)
        if is_active is not None:
            queryset = queryset.filter(is_active=is_active.lower() == "true")
        else:
            queryset = queryset.filter(is_active=True)

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

        # Filter by availability
        available_in_house = self.request.query_params.get("available_in_house", None)
        if available_in_house is not None:
            queryset = queryset.filter(available_in_house=available_in_house.lower() == "true")

        return queryset

    def perform_create(self, serializer):
        if not self.request.user.has_perm("imaging.add_imagingprocedure"):
            from rest_framework.exceptions import PermissionDenied

            raise PermissionDenied("You do not have permission to create procedures.")
        serializer.save(**self.get_tenant_save_kwargs())

    def perform_update(self, serializer):
        if not self.request.user.has_perm("imaging.change_imagingprocedure"):
            from rest_framework.exceptions import PermissionDenied

            raise PermissionDenied("You do not have permission to edit procedures.")
        serializer.save()

    def destroy(self, request, *args, **kwargs):
        """Soft-delete: deactivate instead of hard delete."""
        if not request.user.has_perm("imaging.delete_imagingprocedure"):
            return Response(
                {"detail": "You do not have permission to delete procedures."},
                status=status.HTTP_403_FORBIDDEN,
            )
        instance = self.get_object()
        instance.is_active = False
        instance.save(update_fields=["is_active"])
        return Response(status=status.HTTP_204_NO_CONTENT)

    @action(detail=False, methods=["post"])
    def seed_defaults(self, request):
        """
        Seed default Kenya imaging procedures for the current facility.
        Only seeds when the facility has no procedures.
        """
        if not request.user.has_perm("imaging.add_imagingprocedure"):
            return Response(
                {"detail": "You do not have permission to create procedures."},
                status=status.HTTP_403_FORBIDDEN,
            )

        from hmis.apps.imaging.management.commands.seed_imaging_catalog import Command

        resolve_request_tenant(request)
        facility = getattr(request, "facility", None)
        organization = getattr(request, "organization", None)

        if not facility:
            return Response(
                {"detail": "No facility context available."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Only seed if empty
        existing_count = ImagingProcedure.objects.filter(facility=facility).count()
        if existing_count > 0:
            return Response(
                {
                    "detail": f"Facility already has {existing_count} procedures. Seed skipped.",
                    "created": 0,
                    "existing": existing_count,
                },
                status=status.HTTP_200_OK,
            )

        # Create procedures for this facility
        created = 0
        for proc_data in Command.IMAGING_PROCEDURES:
            ImagingProcedure.objects.create(
                facility=facility,
                organization=organization,
                **proc_data,
            )
            created += 1

        return Response(
            {
                "detail": f"Seeded {created} default procedures.",
                "created": created,
                "existing": 0,
            },
            status=status.HTTP_201_CREATED,
        )


class ImagingOrderViewSet(NestedTenantScopeMixin, viewsets.ModelViewSet):
    """
    ViewSet for imaging orders.
    Provides full CRUD operations plus workflow actions.
    """

    queryset = ImagingOrder.objects.all().select_related("patient", "encounter", "ordered_by")
    permission_classes = [IsAuthenticated, WriteRequiresRolePermission, ReadRequiresModelPermission]
    filter_backends = [filters.DjangoFilterBackend, SearchFilter]
    filterset_fields = ["patient", "encounter", "status", "priority"]
    search_fields = [
        "patient__first_name",
        "patient__last_name",
        "patient__mrn",
        "order_number",
        "clinical_indication",
    ]
    lookup_field = "order_number"
    tenant_facility_chain = "encounter__facility"
    tenant_org_chain = "encounter__organization"

    def get_serializer_class(self):
        if self.action == "create":
            return ImagingOrderCreateSerializer
        return ImagingOrderSerializer

    def get_queryset(self):
        resolve_request_tenant(self.request)
        queryset = ImagingOrder.objects.all().select_related("patient", "encounter", "ordered_by")

        user = self.request.user
        if not user.is_superuser:
            facility = getattr(self.request, "facility", None)
            org = getattr(self.request, "organization", None)

            if facility:
                queryset = queryset.filter(
                    models.Q(encounter__facility=facility)
                    | models.Q(admission__facility=facility)
                    | models.Q(patient__registered_at_facility=facility)
                    | models.Q(appointment__resource__facility=facility)
                    | models.Q(
                        is_walkin=True,
                        ordered_by__staff_profile__primary_facility=facility,
                    )
                )
            elif org:
                queryset = queryset.filter(
                    models.Q(encounter__facility__organization=org)
                    | models.Q(admission__facility__organization=org)
                    | models.Q(patient__organization=org)
                    | models.Q(appointment__resource__facility__organization=org)
                    | models.Q(
                        is_walkin=True,
                        ordered_by__staff_profile__organization=org,
                    )
                )
            else:
                return queryset.none()

        # Filter by date range
        date_from = self.request.query_params.get("date_from", None)
        date_to = self.request.query_params.get("date_to", None)
        if date_from:
            queryset = queryset.filter(ordered_at__date__gte=date_from)
        if date_to:
            queryset = queryset.filter(ordered_at__date__lte=date_to)

        return queryset.distinct()

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
        """Delete an imaging order with permission check."""
        if not request.user.has_perm("imaging.delete_imagingorder"):
            return Response(
                {"detail": "You do not have permission to delete imaging orders."},
                status=status.HTTP_403_FORBIDDEN,
            )

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
        except _imaging_action_exceptions():
            logger.exception("Error submitting imaging order %s", order.pk)
            return Response(
                {"error": "Unable to submit imaging order."},
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
                resource_qs = Resource.objects.filter(pk=resource_id)
                request_facility = getattr(request, "facility", None)
                request_organization = getattr(request, "organization", None)
                if request_facility:
                    resource_qs = resource_qs.filter(facility=request_facility)
                elif request_organization:
                    resource_qs = resource_qs.filter(organization=request_organization)

                try:
                    resource = resource_qs.get()
                except Resource.DoesNotExist:
                    return Response(
                        {
                            "error": f"Resource with id {resource_id} not found in current facility scope"
                        },
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
                            {"error": "Selected slot is not available."},
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

        except _imaging_action_exceptions():
            logger.exception("Error scheduling imaging order %s", order.pk)
            return Response(
                {"error": "Unable to schedule imaging order."},
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
        except _imaging_action_exceptions():
            logger.exception("Error starting imaging order %s", order.pk)
            return Response(
                {"error": "Unable to start imaging order."},
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
        except _imaging_action_exceptions():
            logger.exception("Error completing imaging order %s", order.pk)
            return Response(
                {"error": "Unable to complete imaging order."},
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
        except _imaging_action_exceptions():
            logger.exception("Error cancelling imaging order %s", order.pk)
            return Response(
                {"error": "Unable to cancel imaging order."},
                status=status.HTTP_400_BAD_REQUEST,
            )


class EncounterExternalImagingRequestViewSet(viewsets.ModelViewSet):
    """Create/list external imaging requests from encounter context."""

    queryset = ExternalImagingOrderRequest.objects.all().select_related(
        "patient", "encounter", "imaging_order", "processed_by"
    )
    permission_classes = [IsAuthenticated, WriteRequiresRolePermission, ReadRequiresModelPermission]
    filter_backends = [filters.DjangoFilterBackend]
    filterset_fields = ["status", "encounter", "patient"]
    http_method_names = ["get", "post", "head", "options"]

    def get_serializer_class(self):
        if self.action == "create":
            return EncounterExternalImagingRequestCreateSerializer
        return ExternalImagingOrderRequestSerializer

    def get_queryset(self):
        resolve_request_tenant(self.request)
        queryset = self.queryset
        user = self.request.user

        if not user.is_superuser:
            facility = getattr(self.request, "facility", None)
            org = getattr(self.request, "organization", None)
            if facility:
                queryset = queryset.filter(
                    models.Q(facility=facility)
                    | models.Q(encounter__facility=facility)
                    | models.Q(patient__registered_at_facility=facility)
                )
            elif org:
                queryset = queryset.filter(
                    models.Q(organization=org)
                    | models.Q(encounter__organization=org)
                    | models.Q(patient__organization=org)
                )
            else:
                return queryset.none()

        return queryset.distinct()

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        ext_request = serializer.save()

        AuditLog.log(
            action="imaging_external_request_create",
            user=request.user,
            resource_type="ExternalImagingOrderRequest",
            resource_id=ext_request.id,
            ip_address=get_client_ip(request),
            details={
                "placer_order_number": ext_request.placer_order_number,
                "encounter_id": ext_request.encounter_id,
            },
        )

        output_serializer = ExternalImagingOrderRequestSerializer(ext_request)
        return Response(output_serializer.data, status=status.HTTP_201_CREATED)


# ============================================================================
# DICOM Views (Phase C)
# ============================================================================
