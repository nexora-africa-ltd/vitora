"""
Scheduling views for Vitora HMIS.

Phase 1: Core Scheduling Foundation

This module contains ViewSets for:
- Resource CRUD
- Schedule CRUD
- Appointment CRUD and lifecycle actions
- Availability queries
"""

from django_filters import rest_framework as filters
from rest_framework import permissions, status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from hmis.apps.core.models import AuditLog
from hmis.apps.scheduling.models import (
    Appointment,
    Resource,
    Schedule,
)
from hmis.apps.scheduling.serializers import (
    AppointmentCancelSerializer,
    AppointmentCheckInSerializer,
    AppointmentCompleteSerializer,
    AppointmentConfirmSerializer,
    AppointmentCreateSerializer,
    AppointmentListSerializer,
    AppointmentNoShowSerializer,
    AppointmentSerializer,
    AppointmentStartSerializer,
    AvailabilityQuerySerializer,
    ResourceListSerializer,
    ResourceSerializer,
    ScheduleBreakSerializer,
    ScheduleCreateSerializer,
    ScheduleSerializer,
    SlotCheckQuerySerializer,
    WeeklyAvailabilityQuerySerializer,
)
from hmis.apps.scheduling.services import (
    check_slot_available,
    get_available_slots,
    get_weekly_availability,
)

# =============================================================================
# Filters
# =============================================================================


class ResourceFilter(filters.FilterSet):
    """Filter for Resource model."""

    resource_type = filters.CharFilter(field_name="resource_type")
    is_active = filters.BooleanFilter(field_name="is_active")
    code = filters.CharFilter(field_name="code", lookup_expr="icontains")
    name = filters.CharFilter(field_name="name", lookup_expr="icontains")

    class Meta:
        """Meta options for ResourceFilter."""

        model = Resource
        fields = ["resource_type", "is_active", "code", "name"]


class ScheduleFilter(filters.FilterSet):
    """Filter for Schedule model."""

    resource = filters.NumberFilter(field_name="resource__id")
    schedule_type = filters.CharFilter(field_name="schedule_type")
    day_of_week = filters.NumberFilter(field_name="day_of_week")
    is_active = filters.BooleanFilter(field_name="is_active")

    class Meta:
        """Meta options for ScheduleFilter."""

        model = Schedule
        fields = ["resource", "schedule_type", "day_of_week", "is_active"]


class AppointmentFilter(filters.FilterSet):
    """Filter for Appointment model."""

    patient = filters.NumberFilter(field_name="patient__id")
    resource = filters.NumberFilter(field_name="resource__id")
    status = filters.CharFilter(field_name="status")
    appointment_type = filters.CharFilter(field_name="appointment_type")
    priority = filters.CharFilter(field_name="priority")
    from_date = filters.DateFilter(field_name="scheduled_start__date", lookup_expr="gte")
    to_date = filters.DateFilter(field_name="scheduled_start__date", lookup_expr="lte")

    class Meta:
        """Meta options for AppointmentFilter."""

        model = Appointment
        fields = ["patient", "resource", "status", "appointment_type", "priority", "from_date", "to_date"]


# =============================================================================
# ViewSets
# =============================================================================


class ResourceViewSet(viewsets.ModelViewSet):
    """
    ViewSet for managing scheduling resources.

    Endpoints:
        GET    /api/scheduling/resources/          - List resources
        POST   /api/scheduling/resources/          - Create resource
        GET    /api/scheduling/resources/{id}/     - Retrieve resource
        PATCH  /api/scheduling/resources/{id}/     - Update resource
        DELETE /api/scheduling/resources/{id}/     - Soft delete resource

    Custom actions:
        GET    /api/scheduling/resources/{id}/availability/         - Get availability
        GET    /api/scheduling/resources/{id}/availability/weekly/  - Get weekly availability
        GET    /api/scheduling/resources/{id}/availability/check/   - Check specific slot
    """

    queryset = Resource.objects.all()
    serializer_class = ResourceSerializer
    permission_classes = [permissions.IsAuthenticated]
    filterset_class = ResourceFilter

    def get_serializer_class(self):
        """Get appropriate serializer class."""
        if self.action == "list":
            return ResourceListSerializer
        return ResourceSerializer

    def destroy(self, request, *args, **kwargs):
        """Soft delete resource by setting is_active=False."""
        instance = self.get_object()
        instance.is_active = False
        instance.save()
        return Response(status=status.HTTP_204_NO_CONTENT)

    @action(detail=True, methods=["get"])
    def availability(self, request, pk=None):
        """
        Get available slots for a resource on a specific date.

        Query params:
            date: Target date (required)
            appointment_type: Optional appointment type filter
        """
        resource = self.get_object()
        serializer = AvailabilityQuerySerializer(data=request.query_params)
        serializer.is_valid(raise_exception=True)

        target_date = serializer.validated_data["date"]
        appointment_type = serializer.validated_data.get("appointment_type")

        slots = get_available_slots(resource, target_date, appointment_type)

        return Response({
            "resource": resource.id,
            "resource_name": resource.name,
            "date": target_date,
            "slots": slots,
            "total_available": len(slots),
        })

    @action(detail=True, methods=["get"], url_path="availability/weekly")
    def availability_weekly(self, request, pk=None):
        """
        Get weekly availability for a resource.

        Query params:
            start_date: Week start date (required)
            weeks: Number of weeks (default: 1, max: 4)
        """
        resource = self.get_object()
        serializer = WeeklyAvailabilityQuerySerializer(data=request.query_params)
        serializer.is_valid(raise_exception=True)

        start_date = serializer.validated_data["start_date"]
        weeks = serializer.validated_data.get("weeks", 1)

        availability = get_weekly_availability(resource, start_date, weeks)

        return Response(availability)

    @action(detail=True, methods=["get"], url_path="availability/check")
    def availability_check(self, request, pk=None):
        """
        Check if a specific time slot is available.

        Query params:
            date: Target date (required)
            start_time: Slot start time (required)
            duration_minutes: Duration in minutes (required)
        """
        resource = self.get_object()
        serializer = SlotCheckQuerySerializer(data=request.query_params)
        serializer.is_valid(raise_exception=True)

        result = check_slot_available(
            resource,
            serializer.validated_data["date"],
            serializer.validated_data["start_time"],
            serializer.validated_data["duration_minutes"],
        )

        return Response(result)


class ScheduleViewSet(viewsets.ModelViewSet):
    """
    ViewSet for managing resource schedules.

    Endpoints:
        GET    /api/scheduling/schedules/          - List schedules
        POST   /api/scheduling/schedules/          - Create schedule
        GET    /api/scheduling/schedules/{id}/     - Retrieve schedule
        PATCH  /api/scheduling/schedules/{id}/     - Update schedule
        DELETE /api/scheduling/schedules/{id}/     - Delete schedule

    Custom actions:
        GET    /api/scheduling/schedules/{id}/breaks/  - List breaks
        POST   /api/scheduling/schedules/{id}/breaks/  - Add break
    """

    queryset = Schedule.objects.select_related("resource").prefetch_related("breaks")
    serializer_class = ScheduleSerializer
    permission_classes = [permissions.IsAuthenticated]
    filterset_class = ScheduleFilter

    def get_serializer_class(self):
        """Get appropriate serializer class."""
        if self.action == "create":
            return ScheduleCreateSerializer
        return ScheduleSerializer

    @action(detail=True, methods=["get", "post"])
    def breaks(self, request, pk=None):
        """
        Manage schedule breaks.

        GET: List all breaks for this schedule
        POST: Add a new break to this schedule
        """
        schedule = self.get_object()

        if request.method == "GET":
            serializer = ScheduleBreakSerializer(schedule.breaks.all(), many=True)
            return Response(serializer.data)

        elif request.method == "POST":
            serializer = ScheduleBreakSerializer(data=request.data)
            serializer.is_valid(raise_exception=True)
            serializer.save(schedule=schedule)
            return Response(serializer.data, status=status.HTTP_201_CREATED)


class AppointmentViewSet(viewsets.ModelViewSet):
    """
    ViewSet for managing appointments.

    Endpoints:
        GET    /api/scheduling/appointments/          - List appointments
        POST   /api/scheduling/appointments/          - Create appointment
        GET    /api/scheduling/appointments/{id}/     - Retrieve appointment
        PATCH  /api/scheduling/appointments/{id}/     - Update appointment
        DELETE /api/scheduling/appointments/{id}/     - Cancel appointment

    Lifecycle actions:
        POST   /api/scheduling/appointments/{id}/confirm/   - Confirm appointment
        POST   /api/scheduling/appointments/{id}/check-in/  - Check in patient
        POST   /api/scheduling/appointments/{id}/start/     - Start appointment
        POST   /api/scheduling/appointments/{id}/complete/  - Complete appointment
        POST   /api/scheduling/appointments/{id}/cancel/    - Cancel appointment
        POST   /api/scheduling/appointments/{id}/no-show/   - Mark as no-show
    """

    queryset = Appointment.objects.select_related(
        "patient", "resource", "created_by", "confirmed_by", "cancelled_by"
    )
    serializer_class = AppointmentSerializer
    permission_classes = [permissions.IsAuthenticated]
    filterset_class = AppointmentFilter

    def get_serializer_class(self):
        """Get appropriate serializer class."""
        if self.action == "create":
            return AppointmentCreateSerializer
        if self.action == "list":
            return AppointmentListSerializer
        return AppointmentSerializer

    def create(self, request, *args, **kwargs):
        """Create appointment and return full serialized data."""
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        self.perform_create(serializer)
        # Return full serializer for response
        response_serializer = AppointmentSerializer(serializer.instance)
        headers = self.get_success_headers(response_serializer.data)
        return Response(response_serializer.data, status=status.HTTP_201_CREATED, headers=headers)

    def perform_create(self, serializer):
        """Create appointment and log audit."""
        appointment = serializer.save()
        self._log_action("appointment_create", appointment)

    def _log_action(self, action: str, appointment: Appointment, details: dict = None):
        """Log appointment action to audit log."""
        AuditLog.log(
            action=action,
            user=self.request.user,
            resource_type="Appointment",
            resource_id=appointment.id,
            patient_id=appointment.patient.id,
            details=details or {},
            ip_address=self._get_client_ip(),
        )

    def _get_client_ip(self) -> str:
        """Get client IP address from request."""
        x_forwarded_for = self.request.META.get("HTTP_X_FORWARDED_FOR")
        if x_forwarded_for:
            return x_forwarded_for.split(",")[0].strip()
        return self.request.META.get("REMOTE_ADDR", "")

    @action(detail=True, methods=["post"])
    def confirm(self, request, pk=None):
        """Confirm an appointment."""
        appointment = self.get_object()
        serializer = AppointmentConfirmSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        try:
            appointment.confirm(user=request.user)
        except ValueError as e:
            return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)

        self._log_action("appointment_confirm", appointment)
        return Response(AppointmentSerializer(appointment).data)

    @action(detail=True, methods=["post"], url_path="check-in")
    def check_in(self, request, pk=None):
        """Check in patient for appointment."""
        appointment = self.get_object()
        serializer = AppointmentCheckInSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        try:
            appointment.check_in(user=request.user)
        except ValueError as e:
            return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)

        self._log_action("appointment_checkin", appointment)
        return Response(AppointmentSerializer(appointment).data)

    @action(detail=True, methods=["post"])
    def start(self, request, pk=None):
        """Start an appointment."""
        appointment = self.get_object()
        serializer = AppointmentStartSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        try:
            appointment.start(user=request.user)
        except ValueError as e:
            return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)

        self._log_action("appointment_start", appointment)
        return Response(AppointmentSerializer(appointment).data)

    @action(detail=True, methods=["post"])
    def complete(self, request, pk=None):
        """Complete an appointment."""
        appointment = self.get_object()
        serializer = AppointmentCompleteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        try:
            appointment.complete(
                user=request.user,
                notes=serializer.validated_data.get("notes", ""),
            )
        except ValueError as e:
            return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)

        self._log_action("appointment_complete", appointment)
        return Response(AppointmentSerializer(appointment).data)

    @action(detail=True, methods=["post"])
    def cancel(self, request, pk=None):
        """Cancel an appointment."""
        appointment = self.get_object()
        serializer = AppointmentCancelSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        try:
            appointment.cancel(
                user=request.user,
                reason=serializer.validated_data.get("reason", ""),
            )
        except ValueError as e:
            return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)

        self._log_action("appointment_cancel", appointment, {
            "reason": serializer.validated_data.get("reason", ""),
        })
        return Response(AppointmentSerializer(appointment).data)

    @action(detail=True, methods=["post"], url_path="no-show")
    def no_show(self, request, pk=None):
        """Mark appointment as no-show."""
        appointment = self.get_object()
        serializer = AppointmentNoShowSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        try:
            appointment.mark_no_show(user=request.user)
        except ValueError as e:
            return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)

        self._log_action("appointment_noshow", appointment)
        return Response(AppointmentSerializer(appointment).data)
