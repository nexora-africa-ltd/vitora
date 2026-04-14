"""
Views for imaging API endpoints.
"""

import logging
import os
import tempfile
from datetime import datetime

from django.conf import settings
from django.db import models
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

from hmis.apps.core.mixins import NestedTenantScopeMixin
from hmis.apps.core.models import AuditLog
from hmis.apps.scheduling.models import Resource

from .models import (
    DICOMInstance,
    DICOMSeries,
    DICOMStudy,
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
    ImagingOrderCreateSerializer,
    ImagingOrderSerializer,
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
from .services import DICOMParsingService, ImagingSchedulingService, PACSStorageService

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
        # Check if this is a schema generation request
        if getattr(self, "swagger_fake_view", False):
            return Resource.objects.none()

        modality = self.request.query_params.get("modality", None)
        return ImagingSchedulingService.get_imaging_resources(modality)

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

    permission_classes = [IsAuthenticated]

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


class ImagingOrderViewSet(NestedTenantScopeMixin, viewsets.ModelViewSet):
    """
    ViewSet for imaging orders.
    Provides full CRUD operations plus workflow actions.
    """

    queryset = ImagingOrder.objects.all().select_related("patient", "encounter", "ordered_by")
    permission_classes = [IsAuthenticated]
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


# ============================================================================
# DICOM Views (Phase C)
# ============================================================================


class DICOMStudyViewSet(viewsets.ReadOnlyModelViewSet):
    """
    ViewSet for DICOM studies.

    Provides list, retrieve, upload, and delete operations.
    Studies are looked up by study_instance_uid.

    Endpoints:
        GET    /api/imaging/studies/                     → list
        GET    /api/imaging/studies/{uid}/                → retrieve (detail + series)
        POST   /api/imaging/studies/upload/               → upload DICOM files
        DELETE /api/imaging/studies/{uid}/                → delete study + PACS files
        GET    /api/imaging/studies/{uid}/series/         → list series
        GET    /api/imaging/studies/{uid}/instances/      → list all instances
    """

    queryset = (
        DICOMStudy.objects.all()
        .select_related("patient", "imaging_order", "uploaded_by")
        .prefetch_related("series_set", "series_set__instances")
    )
    permission_classes = [IsAuthenticated]
    lookup_field = "study_instance_uid"
    lookup_value_regex = r"[\d.]+"  # DICOM UIDs contain digits and dots

    def get_serializer_class(self):
        if self.action == "retrieve":
            return DICOMStudyDetailSerializer
        return DICOMStudySerializer

    def get_queryset(self):
        queryset = super().get_queryset()

        # Filter by patient
        patient = self.request.query_params.get("patient")
        if patient:
            queryset = queryset.filter(patient_id=patient)

        # Filter by modality
        modality = self.request.query_params.get("modality")
        if modality:
            queryset = queryset.filter(modality=modality)

        # Filter by date range
        date_after = self.request.query_params.get("study_date_after")
        date_before = self.request.query_params.get("study_date_before")
        if date_after:
            queryset = queryset.filter(study_date__gte=date_after)
        if date_before:
            queryset = queryset.filter(study_date__lte=date_before)

        # Filter by imaging order
        imaging_order = self.request.query_params.get("imaging_order")
        if imaging_order:
            queryset = queryset.filter(imaging_order_id=imaging_order)

        return queryset

    def destroy(self, request, *args, **kwargs):
        """
        Delete a DICOM study and clean up PACS files.

        Removes all series, instances (via cascade) and the
        corresponding files from the filesystem.
        """
        instance = self.get_object()
        study_uid = instance.study_instance_uid
        study_id = instance.pk

        # Delete PACS files first
        pacs = PACSStorageService(base_path=str(settings.MEDIA_ROOT))
        pacs.delete_study(study_uid)

        # Delete thumbnails
        thumb_dir = os.path.join(str(settings.MEDIA_ROOT), "thumbnails")
        if os.path.isdir(thumb_dir):
            for fname in os.listdir(thumb_dir):
                # Thumbnails are named by SOP Instance UID
                try:
                    os.unlink(os.path.join(thumb_dir, fname))
                except OSError:
                    pass  # Best-effort cleanup

        instance.delete()

        AuditLog.log(
            action="dicom_delete",
            user=request.user,
            resource_type="DICOMStudy",
            resource_id=study_id,
            ip_address=get_client_ip(request),
            details={"study_instance_uid": study_uid},
        )

        return Response(status=status.HTTP_204_NO_CONTENT)

    @action(detail=True, methods=["get"])
    def series(self, request, study_instance_uid=None):
        """List all series within a study."""
        study = self.get_object()
        series_qs = study.series_set.all()
        serializer = DICOMSeriesListSerializer(series_qs, many=True)
        return Response(serializer.data)

    @action(detail=True, methods=["get"])
    def instances(self, request, study_instance_uid=None):
        """List all instances across all series in a study."""
        study = self.get_object()
        instances_qs = DICOMInstance.objects.filter(series__study=study).select_related("series")
        serializer = DICOMInstanceSerializer(instances_qs, many=True)
        return Response(serializer.data)


class DICOMUploadView(APIView):
    """
    Handle DICOM file uploads.

    POST /api/imaging/studies/upload/

    Accepts multipart form data with one or more DICOM files.
    Parses metadata from each file, stores them in PACS, and creates
    DICOMStudy/DICOMSeries/DICOMInstance records.

    Request params:
        files: One or more .dcm files (multipart)
        imaging_order: (optional) ID of the imaging order to link
        patient: (optional) ID of the patient (required if no imaging_order)
    """

    permission_classes = [IsAuthenticated]
    parser_classes = [MultiPartParser, FormParser]

    @extend_schema(
        request={
            "multipart/form-data": {
                "type": "object",
                "properties": {
                    "files": {"type": "array", "items": {"type": "string", "format": "binary"}},
                    "imaging_order": {"type": "integer"},
                    "patient": {"type": "integer"},
                },
            }
        },
        responses={200: OpenApiTypes.OBJECT},
    )
    def post(self, request):
        """Upload one or more DICOM files."""
        files = request.FILES.getlist("files")
        if not files:
            return Response(
                {"error": "No DICOM files provided."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Resolve the imaging order (optional)
        imaging_order = None
        order_id = request.data.get("imaging_order")
        if order_id:
            try:
                imaging_order = ImagingOrder.objects.get(pk=order_id)
            except ImagingOrder.DoesNotExist:
                return Response(
                    {"error": f"Imaging order {order_id} not found."},
                    status=status.HTTP_404_NOT_FOUND,
                )

        # Resolve patient
        patient = None
        if imaging_order:
            patient = imaging_order.patient
        else:
            from hmis.apps.patients.models import Patient

            patient_id = request.data.get("patient")
            if patient_id:
                try:
                    patient = Patient.objects.get(pk=patient_id)
                except Patient.DoesNotExist:
                    return Response(
                        {"error": f"Patient {patient_id} not found."},
                        status=status.HTTP_404_NOT_FOUND,
                    )

        if patient is None:
            return Response(
                {"error": "Either imaging_order or patient must be provided."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        pacs = PACSStorageService(base_path=str(settings.MEDIA_ROOT))

        # Parse and store each file
        instances_created = 0
        study_uid = None
        first_study = None
        errors = []

        for uploaded_file in files:
            # Write to temp file for parsing
            try:
                with tempfile.NamedTemporaryFile(suffix=".dcm", delete=False) as tmp:
                    for chunk in uploaded_file.chunks():
                        tmp.write(chunk)
                    tmp_path = tmp.name

                # Validate
                is_valid, validation_errors = DICOMParsingService.validate_dicom_file(tmp_path)
                if not is_valid:
                    errors.append(
                        {
                            "file": uploaded_file.name,
                            "errors": validation_errors,
                        }
                    )
                    os.unlink(tmp_path)
                    continue

                # Parse metadata
                metadata = DICOMParsingService.parse_file(tmp_path)

                # Store in PACS
                m_study_uid = metadata["study_instance_uid"]
                m_series_uid = metadata["series_instance_uid"]
                m_sop_uid = metadata["sop_instance_uid"]

                stored_path = pacs.store_file(
                    tmp_path,
                    m_study_uid,
                    m_series_uid,
                    sop_uid=m_sop_uid,
                    move=True,
                )

                # Create or get DICOMStudy
                dicom_study, _created = DICOMStudy.objects.get_or_create(
                    study_instance_uid=m_study_uid,
                    defaults={
                        "patient": patient,
                        "imaging_order": imaging_order,
                        "study_date": metadata["study_date"] or datetime.now().date(),
                        "study_time": metadata.get("study_time"),
                        "study_description": metadata.get("study_description", ""),
                        "accession_number": metadata.get("accession_number", ""),
                        "referring_physician_name": metadata.get("referring_physician_name", ""),
                        "modality": metadata["modality"],
                        "institution_name": metadata.get("institution_name", ""),
                        "uploaded_by": request.user,
                    },
                )

                if study_uid is None:
                    study_uid = m_study_uid
                    first_study = dicom_study

                # Create or get DICOMSeries
                dicom_series, _created = DICOMSeries.objects.get_or_create(
                    series_instance_uid=m_series_uid,
                    defaults={
                        "study": dicom_study,
                        "series_number": metadata.get("series_number"),
                        "series_description": metadata.get("series_description", ""),
                        "modality": metadata["modality"],
                        "body_part_examined": metadata.get("body_part_examined", ""),
                    },
                )

                # Create DICOMInstance (skip if already exists)
                _instance, created = DICOMInstance.objects.get_or_create(
                    sop_instance_uid=m_sop_uid,
                    defaults={
                        "series": dicom_series,
                        "sop_class_uid": metadata.get("sop_class_uid", ""),
                        "instance_number": metadata.get("instance_number"),
                        "file_path": stored_path,
                        "file_size": metadata.get("file_size", 0),
                        "transfer_syntax_uid": metadata.get("transfer_syntax_uid", ""),
                        "rows": metadata.get("rows"),
                        "columns": metadata.get("columns"),
                        "bits_allocated": metadata.get("bits_allocated"),
                        "photometric_interpretation": metadata.get(
                            "photometric_interpretation", ""
                        ),
                    },
                )

                if created:
                    instances_created += 1

                    # Generate thumbnail for the first instance
                    if instances_created == 1:
                        abs_stored = pacs.get_absolute_path(stored_path)
                        thumb_path = DICOMParsingService.generate_thumbnail(
                            abs_stored,
                            str(settings.MEDIA_ROOT),
                        )
                        if thumb_path:
                            dicom_study.thumbnail_path = thumb_path
                            dicom_study.save(update_fields=["thumbnail_path"])

            except Exception as exc:
                logger.exception("Error processing DICOM file %s", uploaded_file.name)
                errors.append({"file": uploaded_file.name, "errors": [str(exc)]})
                # Clean up temp file
                if "tmp_path" in locals() and os.path.exists(tmp_path):
                    os.unlink(tmp_path)
                continue

        # If ALL files failed, return 400
        if instances_created == 0:
            return Response(
                {
                    "error": "No valid DICOM files could be processed.",
                    "details": errors,
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Update study statistics
        if first_study:
            _update_study_statistics(first_study)

            # Update imaging order with study metadata
            if imaging_order:
                _link_study_to_order(imaging_order, first_study)

        # Audit log
        AuditLog.log(
            action="dicom_upload",
            user=request.user,
            resource_type="DICOMStudy",
            resource_id=first_study.pk if first_study else 0,
            ip_address=get_client_ip(request),
            details={
                "study_instance_uid": study_uid,
                "instances_created": instances_created,
                "files_submitted": len(files),
                "errors": errors,
            },
        )

        response_data = {
            "study_instance_uid": study_uid,
            "instances_created": instances_created,
            "files_submitted": len(files),
        }
        if errors:
            response_data["errors"] = errors

        return Response(response_data, status=status.HTTP_201_CREATED)


class DICOMRetrieveView(APIView):
    """
    WADO-RS lite endpoint for retrieving DICOM instances.

    GET /api/imaging/dicom/{sop_instance_uid}/

    Returns the raw DICOM file with appropriate content-type headers.
    """

    permission_classes = [IsAuthenticated]

    @extend_schema(
        responses={
            200: {
                "type": "string",
                "format": "binary",
                "description": "DICOM file",
            }
        },
    )
    def get(self, request, sop_instance_uid):
        """Retrieve a DICOM instance file by SOP Instance UID."""
        try:
            instance = DICOMInstance.objects.select_related("series__study").get(
                sop_instance_uid=sop_instance_uid
            )
        except DICOMInstance.DoesNotExist:
            return Response(
                {"error": "DICOM instance not found."},
                status=status.HTTP_404_NOT_FOUND,
            )

        pacs = PACSStorageService(base_path=str(settings.MEDIA_ROOT))
        file_path = pacs.get_absolute_path(instance.file_path)

        if not os.path.exists(file_path):
            logger.error("DICOM file missing from PACS: %s", instance.file_path)
            return Response(
                {"error": "DICOM file not found on disk."},
                status=status.HTTP_404_NOT_FOUND,
            )

        # Audit log
        AuditLog.log(
            action="dicom_retrieve",
            user=request.user,
            resource_type="DICOMInstance",
            resource_id=instance.pk,
            ip_address=get_client_ip(request),
            details={
                "sop_instance_uid": sop_instance_uid,
                "study_instance_uid": instance.series.study.study_instance_uid,
            },
        )

        filename = f"{sop_instance_uid}.dcm"
        response = FileResponse(
            open(file_path, "rb"),
            content_type="application/dicom",
        )
        response["Content-Disposition"] = f'attachment; filename="{filename}"'
        return response


class DICOMFrameRenderView(APIView):
    """
    Render a DICOM instance as a PNG image for web display.

    GET /api/imaging/dicom/{sop_instance_uid}/frame/

    Query parameters:
    - size: Maximum dimension in pixels (default: 512, max: 2048)
    - frame: Frame index for multi-frame DICOM (default: 0)
    - window_center: Window center for display (optional)
    - window_width: Window width for display (optional)

    Returns PNG image with appropriate content-type headers.
    """

    permission_classes = [IsAuthenticated]

    @extend_schema(
        parameters=[
            OpenApiParameter(
                "size",
                type=int,
                required=False,
                description="Maximum dimension in pixels (default: 512)",
            ),
            OpenApiParameter(
                "frame",
                type=int,
                required=False,
                description="Frame index for multi-frame DICOM (default: 0)",
            ),
            OpenApiParameter(
                "window_center",
                type=float,
                required=False,
                description="Window center override",
            ),
            OpenApiParameter(
                "window_width",
                type=float,
                required=False,
                description="Window width override",
            ),
        ],
        responses={
            200: {
                "type": "string",
                "format": "binary",
                "description": "PNG image",
            }
        },
    )
    def get(self, request, sop_instance_uid):
        """Render a DICOM instance as PNG."""
        import io

        import numpy as np
        import pydicom
        from PIL import Image

        try:
            instance = DICOMInstance.objects.select_related("series__study").get(
                sop_instance_uid=sop_instance_uid
            )
        except DICOMInstance.DoesNotExist:
            return Response(
                {"error": "DICOM instance not found."},
                status=status.HTTP_404_NOT_FOUND,
            )

        pacs = PACSStorageService(base_path=str(settings.MEDIA_ROOT))
        file_path = pacs.get_absolute_path(instance.file_path)

        if not os.path.exists(file_path):
            logger.error("DICOM file missing from PACS: %s", instance.file_path)
            return Response(
                {"error": "DICOM file not found on disk."},
                status=status.HTTP_404_NOT_FOUND,
            )

        # Parse query parameters
        max_size = min(int(request.query_params.get("size", 512)), 2048)
        frame_index = int(request.query_params.get("frame", 0))
        window_center = request.query_params.get("window_center")
        window_width = request.query_params.get("window_width")

        try:
            ds = pydicom.dcmread(file_path)
            if not hasattr(ds, "PixelData"):
                return Response(
                    {"error": "DICOM instance has no pixel data."},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            pixel_array = ds.pixel_array.astype(float)

            # Handle multi-frame
            if pixel_array.ndim == 3 and hasattr(ds, "NumberOfFrames"):
                num_frames = int(ds.NumberOfFrames)
                if frame_index >= num_frames:
                    frame_index = 0  # Fallback to first frame
                pixel_array = pixel_array[frame_index]
            elif pixel_array.ndim == 3:
                # Could be RGB or first slice
                if pixel_array.shape[2] not in (3, 4):
                    pixel_array = pixel_array[0]

            # Apply windowing
            if window_center is not None and window_width is not None:
                wc = float(window_center)
                ww = float(window_width)
                low = wc - ww / 2
                high = wc + ww / 2
                pixel_array = np.clip(pixel_array, low, high)
            elif hasattr(ds, "WindowCenter") and hasattr(ds, "WindowWidth"):
                wc = ds.WindowCenter
                ww = ds.WindowWidth
                if isinstance(wc, pydicom.multival.MultiValue):
                    wc = wc[0]
                if isinstance(ww, pydicom.multival.MultiValue):
                    ww = ww[0]
                low = float(wc) - float(ww) / 2
                high = float(wc) + float(ww) / 2
                pixel_array = np.clip(pixel_array, low, high)

            # Normalize to 0-255
            p_min = pixel_array.min()
            p_max = pixel_array.max()
            if p_max > p_min:
                pixel_array = ((pixel_array - p_min) / (p_max - p_min) * 255).astype(np.uint8)
            else:
                pixel_array = np.zeros_like(pixel_array, dtype=np.uint8)

            # Create PIL image
            img = Image.fromarray(pixel_array)
            if img.mode not in ("L", "RGB"):
                img = img.convert("L")

            # Resize maintaining aspect ratio
            img.thumbnail((max_size, max_size), Image.Resampling.LANCZOS)

            # Save to bytes
            buffer = io.BytesIO()
            img.save(buffer, format="PNG")
            buffer.seek(0)

            return HttpResponse(
                buffer.getvalue(),
                content_type="image/png",
            )

        except Exception as e:
            logger.exception("Failed to render DICOM frame: %s", e)
            return Response(
                {"error": "Failed to render image."},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )


# ============================================================================
# DICOM Helpers
# ============================================================================


def _update_study_statistics(study: DICOMStudy) -> None:
    """Recalculate series/instance counts and total file size for a study."""
    series_qs = study.series_set.all()

    study.number_of_series = series_qs.count()

    total_instances = 0
    total_size = 0

    for series in series_qs:
        inst_count = series.instances.count()
        inst_size = series.instances.aggregate(total=models.Sum("file_size"))["total"] or 0
        series.number_of_instances = inst_count
        series.total_file_size = inst_size
        series.save(update_fields=["number_of_instances", "total_file_size"])

        total_instances += inst_count
        total_size += inst_size

    study.number_of_instances = total_instances
    study.total_file_size = total_size
    study.save(
        update_fields=[
            "number_of_series",
            "number_of_instances",
            "total_file_size",
        ]
    )


def _link_study_to_order(order: ImagingOrder, study: DICOMStudy) -> None:
    """
    Link a DICOM study to its imaging order.

    Updates the order's accession_number and study_instance_uid fields
    from the DICOM study metadata.
    """
    update_fields = []

    if study.accession_number and not order.accession_number:
        order.accession_number = study.accession_number
        update_fields.append("accession_number")

    if study.study_instance_uid and not order.study_instance_uid:
        order.study_instance_uid = study.study_instance_uid
        update_fields.append("study_instance_uid")

    if update_fields:
        order.save(update_fields=update_fields)


# ============================================================================
# Radiology Report Views (Phase D)
# ============================================================================


class RadiologyReportFilter(filters.FilterSet):
    """FilterSet for radiology reports."""

    from .models import RadiologyReport

    status = filters.CharFilter(field_name="status")
    is_critical = filters.BooleanFilter(field_name="is_critical")
    reported_by = filters.NumberFilter(field_name="reported_by")
    patient = filters.NumberFilter(field_name="imaging_order__patient")
    date_from = filters.DateFilter(field_name="created_at__date", lookup_expr="gte")
    date_to = filters.DateFilter(field_name="created_at__date", lookup_expr="lte")

    class Meta:
        model = RadiologyReport
        fields = ["status", "is_critical", "reported_by"]


class RadiologyReportViewSet(NestedTenantScopeMixin, viewsets.ModelViewSet):
    """
    ViewSet for radiology reports.

    Provides CRUD operations plus workflow actions:
    - sign: Finalize a draft/preliminary report
    - amend: Amend a finalized report
    - communicate_critical: Record critical finding communication
    - pdf: Generate PDF report

    Endpoints:
        GET    /api/imaging/reports/                  → list
        POST   /api/imaging/reports/                  → create draft
        GET    /api/imaging/reports/{report_number}/  → retrieve
        PATCH  /api/imaging/reports/{report_number}/  → update draft
        DELETE /api/imaging/reports/{report_number}/  → delete (draft only)
        POST   /api/imaging/reports/{report_number}/sign/    → finalize
        POST   /api/imaging/reports/{report_number}/amend/   → amend
        POST   /api/imaging/reports/{report_number}/communicate_critical/  → record comm
        GET    /api/imaging/reports/{report_number}/pdf/     → download PDF
    """

    from .models import RadiologyReport
    from .serializers import (
        AmendReportSerializer,
        CommunicateCriticalSerializer,
        RadiologyReportCreateSerializer,
        RadiologyReportSerializer,
        RadiologyReportUpdateSerializer,
        SignReportSerializer,
    )

    queryset = (
        RadiologyReport.objects.all()
        .select_related(
            "imaging_order",
            "imaging_order__patient",
            "study",
            "reported_by",
            "last_amended_by",
            "critical_communicated_by",
        )
        .prefetch_related("amendments", "imaging_order__items__procedure")
    )
    permission_classes = [IsAuthenticated]
    filter_backends = [filters.DjangoFilterBackend]
    filterset_class = RadiologyReportFilter
    lookup_field = "report_number"
    tenant_facility_chain = "imaging_order__encounter__facility"
    tenant_org_chain = "imaging_order__encounter__organization"

    def get_serializer_class(self):
        if self.action == "create":
            return RadiologyReportCreateSerializer
        elif self.action in ("update", "partial_update"):
            return RadiologyReportUpdateSerializer
        elif self.action == "sign":
            return SignReportSerializer
        elif self.action == "amend":
            return AmendReportSerializer
        elif self.action == "communicate_critical":
            return CommunicateCriticalSerializer
        return RadiologyReportSerializer

    def get_queryset(self):
        from .models import RadiologyReport

        queryset = (
            RadiologyReport.objects.all()
            .select_related(
                "imaging_order",
                "imaging_order__patient",
                "study",
                "reported_by",
                "last_amended_by",
                "critical_communicated_by",
            )
            .prefetch_related("amendments", "imaging_order__items__procedure")
        )

        # Filter by imaging order if provided
        order_number = self.request.query_params.get("order", None)
        if order_number:
            queryset = queryset.filter(imaging_order__order_number=order_number)

        return queryset

    def create(self, request, *args, **kwargs):
        """Create a new radiology report draft."""
        from .serializers import RadiologyReportCreateSerializer, RadiologyReportSerializer

        serializer = RadiologyReportCreateSerializer(
            data=request.data, context={"request": request}
        )
        serializer.is_valid(raise_exception=True)
        report = serializer.save()

        # Audit log
        AuditLog.log(
            action="radiology_report_create",
            user=request.user,
            resource_type="RadiologyReport",
            resource_id=report.id,
            ip_address=get_client_ip(request),
            details={
                "report_number": report.report_number,
                "order_number": report.imaging_order.order_number,
            },
        )

        output_serializer = RadiologyReportSerializer(report)
        return Response(output_serializer.data, status=status.HTTP_201_CREATED)

    def retrieve(self, request, *args, **kwargs):
        """Retrieve a radiology report."""
        instance = self.get_object()

        # Audit log
        AuditLog.log(
            action="radiology_report_view",
            user=request.user,
            resource_type="RadiologyReport",
            resource_id=instance.id,
            ip_address=get_client_ip(request),
            details={"report_number": instance.report_number},
        )

        serializer = self.get_serializer(instance)
        return Response(serializer.data)

    def update(self, request, *args, **kwargs):
        """Update a draft radiology report."""
        partial = kwargs.pop("partial", False)
        instance = self.get_object()

        if not instance.can_edit():
            return Response(
                {"error": "Cannot edit a signed/finalized report."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        from .serializers import RadiologyReportSerializer, RadiologyReportUpdateSerializer

        serializer = RadiologyReportUpdateSerializer(instance, data=request.data, partial=partial)
        serializer.is_valid(raise_exception=True)
        serializer.save()

        # Audit log
        AuditLog.log(
            action="radiology_report_update",
            user=request.user,
            resource_type="RadiologyReport",
            resource_id=instance.id,
            ip_address=get_client_ip(request),
            details={
                "report_number": instance.report_number,
                "changes": request.data,
            },
        )

        output_serializer = RadiologyReportSerializer(instance)
        return Response(output_serializer.data)

    def destroy(self, request, *args, **kwargs):
        """Delete a draft radiology report."""
        instance = self.get_object()

        if instance.status != "DRAFT":
            return Response(
                {"error": "Only DRAFT reports can be deleted."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        report_id = instance.id
        report_number = instance.report_number
        instance.delete()

        # Audit log
        AuditLog.log(
            action="radiology_report_delete",
            user=request.user,
            resource_type="RadiologyReport",
            resource_id=report_id,
            ip_address=get_client_ip(request),
            details={"report_number": report_number},
        )

        return Response(status=status.HTTP_204_NO_CONTENT)

    @action(detail=True, methods=["post"])
    def sign(self, request, report_number=None):
        """Sign and finalize a radiology report."""
        from .serializers import RadiologyReportSerializer

        report = self.get_object()

        try:
            report.sign(request.user)

            # Audit log
            AuditLog.log(
                action="radiology_report_sign",
                user=request.user,
                resource_type="RadiologyReport",
                resource_id=report.id,
                ip_address=get_client_ip(request),
                details={
                    "report_number": report.report_number,
                    "order_number": report.imaging_order.order_number,
                },
            )

            serializer = RadiologyReportSerializer(report)
            return Response(serializer.data)

        except Exception as e:
            logger.exception("Error signing radiology report %s", report.pk)
            return Response(
                {"error": str(e)},
                status=status.HTTP_400_BAD_REQUEST,
            )

    @action(detail=True, methods=["post"])
    def amend(self, request, report_number=None):
        """Amend a finalized radiology report."""
        from .serializers import AmendReportSerializer, RadiologyReportSerializer

        report = self.get_object()
        serializer = AmendReportSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        reason = serializer.validated_data["reason"]
        new_findings = serializer.validated_data.get("findings", "")
        new_impression = serializer.validated_data.get("impression", "")

        try:
            # Store previous values for amendment record
            previous_findings = report.findings
            previous_impression = report.impression

            # Perform amendment
            report.amend(
                user=request.user,
                reason=reason,
                new_findings=new_findings if new_findings else None,
                new_impression=new_impression if new_impression else None,
            )

            # Create amendment record
            ReportAmendment.objects.create(
                report=report,
                amendment_number=report.amendment_count,
                reason=reason,
                previous_findings=previous_findings,
                previous_impression=previous_impression,
                new_findings=new_findings,
                new_impression=new_impression,
                amended_by=request.user,
            )

            # Audit log
            AuditLog.log(
                action="radiology_report_amend",
                user=request.user,
                resource_type="RadiologyReport",
                resource_id=report.id,
                ip_address=get_client_ip(request),
                details={
                    "report_number": report.report_number,
                    "amendment_number": report.amendment_count,
                    "reason": reason,
                },
            )

            output_serializer = RadiologyReportSerializer(report)
            return Response(output_serializer.data)

        except Exception as e:
            logger.exception("Error amending radiology report %s", report.pk)
            return Response(
                {"error": str(e)},
                status=status.HTTP_400_BAD_REQUEST,
            )

    @action(detail=True, methods=["post"], url_path="communicate-critical")
    def communicate_critical(self, request, report_number=None):
        """Record communication of a critical finding."""
        from .serializers import CommunicateCriticalSerializer, RadiologyReportSerializer

        report = self.get_object()

        if not report.is_critical:
            return Response(
                {"error": "This report does not contain a critical finding."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        serializer = CommunicateCriticalSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        communicated_to = serializer.validated_data["communicated_to"]
        method = serializer.validated_data.get("method", "phone")

        report.communicate_critical(
            user=request.user,
            communicated_to=communicated_to,
            method=method,
        )

        # Audit log
        AuditLog.log(
            action="critical_finding_communicated",
            user=request.user,
            resource_type="RadiologyReport",
            resource_id=report.id,
            ip_address=get_client_ip(request),
            details={
                "report_number": report.report_number,
                "communicated_to": communicated_to,
                "method": method,
            },
        )

        output_serializer = RadiologyReportSerializer(report)
        return Response(output_serializer.data)

    @action(detail=True, methods=["get"])
    def pdf(self, request, report_number=None):
        """Generate and download PDF report."""
        from io import BytesIO

        from reportlab.lib import colors
        from reportlab.lib.pagesizes import A4
        from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
        from reportlab.lib.units import mm
        from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

        report = self.get_object()

        # Audit log
        AuditLog.log(
            action="radiology_report_pdf_download",
            user=request.user,
            resource_type="RadiologyReport",
            resource_id=report.id,
            ip_address=get_client_ip(request),
            details={"report_number": report.report_number},
        )

        # Build PDF
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
        title_style = ParagraphStyle("Title", parent=styles["Heading1"], fontSize=16, spaceAfter=12)
        heading_style = ParagraphStyle(
            "Heading", parent=styles["Heading2"], fontSize=12, spaceBefore=12, spaceAfter=6
        )
        body_style = ParagraphStyle("Body", parent=styles["Normal"], fontSize=10, spaceAfter=6)
        critical_style = ParagraphStyle(
            "Critical", parent=body_style, textColor=colors.red, fontName="Helvetica-Bold"
        )

        elements = []

        # Header
        elements.append(Paragraph("RADIOLOGY REPORT", title_style))
        elements.append(Spacer(1, 6 * mm))

        # Report info table
        patient = report.imaging_order.patient
        info_data = [
            [
                "Report Number:",
                report.report_number,
                "Date:",
                report.created_at.strftime("%Y-%m-%d"),
            ],
            ["Patient:", f"{patient.first_name} {patient.last_name}", "MRN:", patient.mrn],
            ["Order:", report.imaging_order.order_number, "Status:", report.get_status_display()],
        ]
        info_table = Table(info_data, colWidths=[30 * mm, 55 * mm, 25 * mm, 55 * mm])
        info_table.setStyle(
            TableStyle(
                [
                    ("FONTSIZE", (0, 0), (-1, -1), 9),
                    ("FONTNAME", (0, 0), (0, -1), "Helvetica-Bold"),
                    ("FONTNAME", (2, 0), (2, -1), "Helvetica-Bold"),
                    ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
                ]
            )
        )
        elements.append(info_table)
        elements.append(Spacer(1, 8 * mm))

        # Critical finding alert
        if report.is_critical:
            elements.append(Paragraph("⚠️ CRITICAL FINDING", critical_style))
            if report.critical_finding_description:
                elements.append(Paragraph(report.critical_finding_description, critical_style))
            if report.critical_communicated:
                comm_text = (
                    f"Communicated to {report.critical_communicated_to} "
                    f"via {report.critical_communicated_method} "
                    f"on {report.critical_communicated_at.strftime('%Y-%m-%d %H:%M') if report.critical_communicated_at else 'N/A'}"
                )
                elements.append(Paragraph(comm_text, body_style))
            elements.append(Spacer(1, 6 * mm))

        # Report content
        if report.technique:
            elements.append(Paragraph("TECHNIQUE", heading_style))
            elements.append(Paragraph(report.technique, body_style))

        if report.comparison:
            elements.append(Paragraph("COMPARISON", heading_style))
            elements.append(Paragraph(report.comparison, body_style))

        elements.append(Paragraph("FINDINGS", heading_style))
        elements.append(Paragraph(report.findings.replace("\n", "<br/>"), body_style))

        elements.append(Paragraph("IMPRESSION", heading_style))
        elements.append(Paragraph(report.impression.replace("\n", "<br/>"), body_style))

        if report.recommendations:
            elements.append(Paragraph("RECOMMENDATIONS", heading_style))
            elements.append(Paragraph(report.recommendations, body_style))

        elements.append(Spacer(1, 12 * mm))

        # Signature block
        radiologist_name = report.reported_by.get_full_name() or report.reported_by.username
        if report.signed_at:
            sign_text = f"Electronically signed by {radiologist_name} on {report.signed_at.strftime('%Y-%m-%d %H:%M')}"
        else:
            sign_text = f"DRAFT - Not yet signed. Prepared by {radiologist_name}"
        elements.append(Paragraph(sign_text, body_style))

        # Amendment history
        if report.amendment_count > 0:
            elements.append(Spacer(1, 8 * mm))
            elements.append(Paragraph("AMENDMENT HISTORY", heading_style))
            for amendment in report.amendments.all().order_by("amendment_number"):
                amend_text = (
                    f"Amendment #{amendment.amendment_number}: "
                    f"{amendment.reason} "
                    f"(by {amendment.amended_by.get_full_name() or amendment.amended_by.username} "
                    f"on {amendment.amended_at.strftime('%Y-%m-%d %H:%M')})"
                )
                elements.append(Paragraph(amend_text, body_style))

        # Footer
        elements.append(Spacer(1, 12 * mm))
        elements.append(
            Paragraph(
                "This report was generated by Vitora HMIS. "
                "It is electronically signed and valid without a physical signature.",
                ParagraphStyle("Footer", parent=body_style, fontSize=8, textColor=colors.gray),
            )
        )

        doc.build(elements)
        buffer.seek(0)

        response = HttpResponse(buffer.getvalue(), content_type="application/pdf")
        response["Content-Disposition"] = f'attachment; filename="{report.report_number}.pdf"'
        return response
