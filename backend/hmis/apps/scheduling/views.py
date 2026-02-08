"""
Scheduling views for Vitora HMIS.

Phase 1: Core Scheduling Foundation
Phase 2: Automatic Assignment Engine

This module contains ViewSets for:
- Resource CRUD
- Schedule CRUD
- Appointment CRUD and lifecycle actions
- Availability queries
- Assignment Rules CRUD
- Assignment Decisions (read-only)
- Assignment Overrides with approval workflow
- Auto-assign and manual override actions
"""

from django_filters import rest_framework as filters
from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import extend_schema, inline_serializer
from rest_framework import permissions, serializers, status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from hmis.apps.core.models import AuditLog
from hmis.apps.scheduling.models import (
    Appointment,
    AssignmentDecision,
    AssignmentOverride,
    AssignmentRule,
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


# =============================================================================
# Phase 2: Assignment Engine ViewSets
# =============================================================================


class AssignmentRuleFilter(filters.FilterSet):
    """Filter for AssignmentRule model."""

    applies_to = filters.CharFilter(field_name="applies_to")
    is_active = filters.BooleanFilter(field_name="is_active")
    priority_gte = filters.NumberFilter(field_name="priority", lookup_expr="gte")
    rule_code = filters.CharFilter(field_name="rule_code", lookup_expr="icontains")

    class Meta:
        """Meta options for AssignmentRuleFilter."""

        model = AssignmentRule
        fields = ["applies_to", "is_active", "priority_gte", "rule_code"]


class AssignmentRuleViewSet(viewsets.ModelViewSet):
    """
    ViewSet for managing assignment rules.

    Supports CRUD operations plus activate/deactivate actions.
    """

    queryset = AssignmentRule.objects.all()
    permission_classes = [permissions.IsAuthenticated]
    filterset_class = AssignmentRuleFilter

    def get_serializer_class(self):
        """Use list serializer for list action."""
        from hmis.apps.scheduling.serializers import (
            AssignmentRuleListSerializer,
            AssignmentRuleSerializer,
        )

        if self.action == "list":
            return AssignmentRuleListSerializer
        return AssignmentRuleSerializer

    @action(detail=True, methods=["post"])
    def activate(self, request, pk=None):
        """Activate a rule."""
        from hmis.apps.scheduling.serializers import AssignmentRuleSerializer

        rule = self.get_object()
        rule.is_active = True
        rule.save(update_fields=["is_active", "updated_at"])
        return Response(AssignmentRuleSerializer(rule).data)

    @action(detail=True, methods=["post"])
    def deactivate(self, request, pk=None):
        """Deactivate a rule."""
        from hmis.apps.scheduling.serializers import AssignmentRuleSerializer

        rule = self.get_object()
        rule.is_active = False
        rule.save(update_fields=["is_active", "updated_at"])
        return Response(AssignmentRuleSerializer(rule).data)


class AssignmentDecisionFilter(filters.FilterSet):
    """Filter for AssignmentDecision model."""

    assignment_type = filters.CharFilter(field_name="assignment_type")
    target_type = filters.CharFilter(field_name="target_type")
    target_id = filters.NumberFilter(field_name="target_id")
    decision_outcome = filters.CharFilter(field_name="decision_outcome")

    class Meta:
        """Meta options for AssignmentDecisionFilter."""

        model = AssignmentDecision
        fields = ["assignment_type", "target_type", "target_id", "decision_outcome"]


class AssignmentDecisionViewSet(viewsets.ReadOnlyModelViewSet):
    """
    ViewSet for viewing assignment decisions (read-only).

    Decisions are immutable - they serve as an audit trail.
    """

    from hmis.apps.scheduling.serializers import AssignmentDecisionSerializer

    queryset = AssignmentDecision.objects.all()
    serializer_class = AssignmentDecisionSerializer
    permission_classes = [permissions.IsAuthenticated]
    filterset_class = AssignmentDecisionFilter


class AssignmentOverrideFilter(filters.FilterSet):
    """Filter for AssignmentOverride model."""

    target_type = filters.CharFilter(field_name="target_type")
    target_id = filters.NumberFilter(field_name="target_id")
    override_reason = filters.CharFilter(field_name="override_reason")
    approval_status = filters.CharFilter(field_name="approval_status")

    class Meta:
        """Meta options for AssignmentOverrideFilter."""

        model = AssignmentOverride
        fields = ["target_type", "target_id", "override_reason", "approval_status"]


class AssignmentOverrideViewSet(viewsets.ModelViewSet):
    """
    ViewSet for managing assignment overrides.

    Supports creating overrides and approval/rejection workflow.
    """

    from hmis.apps.scheduling.serializers import AssignmentOverrideSerializer

    queryset = AssignmentOverride.objects.all()
    serializer_class = AssignmentOverrideSerializer
    permission_classes = [permissions.IsAuthenticated]
    filterset_class = AssignmentOverrideFilter

    @action(detail=True, methods=["post"])
    def approve(self, request, pk=None):
        """Approve a pending override."""
        from hmis.apps.scheduling.serializers import (
            AssignmentOverrideSerializer,
            OverrideApprovalSerializer,
        )

        override = self.get_object()
        serializer = OverrideApprovalSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        try:
            override.approve(
                user=request.user,
                notes=serializer.validated_data.get("notes", ""),
            )
        except ValueError as e:
            return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)

        return Response(AssignmentOverrideSerializer(override).data)

    @action(detail=True, methods=["post"])
    def reject(self, request, pk=None):
        """Reject a pending override."""
        from hmis.apps.scheduling.serializers import (
            AssignmentOverrideSerializer,
            OverrideRejectionSerializer,
        )

        override = self.get_object()
        serializer = OverrideRejectionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        try:
            override.reject(
                user=request.user,
                reason=serializer.validated_data["reason"],
            )
        except ValueError as e:
            return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)

        return Response(AssignmentOverrideSerializer(override).data)


class AssignmentViewSet(viewsets.ViewSet):
    """
    ViewSet for assignment actions.

    Provides auto-assign and manual-override endpoints.
    """

    permission_classes = [permissions.IsAuthenticated]

    @extend_schema(
        request=inline_serializer(
            name="AutoAssignRequest",
            fields={
                "assignment_type": serializers.CharField(),
                "patient_id": serializers.IntegerField(required=False),
                "scheduled_start": serializers.DateTimeField(),
                "scheduled_end": serializers.DateTimeField(),
                "reason": serializers.CharField(required=False),
                "candidate_ids": serializers.ListField(child=serializers.IntegerField(), required=False),
            },
        ),
        responses={200: OpenApiTypes.OBJECT},
    )
    @action(detail=False, methods=["post"], url_path="auto-assign")
    def auto_assign(self, request):
        """
        Automatically assign a resource based on active rules.

        Request body:
        {
            "assignment_type": "APPOINTMENT",
            "patient_id": 123,
            "scheduled_start": "2026-02-07T10:00:00Z",
            "scheduled_end": "2026-02-07T10:30:00Z",
            "reason": "General checkup",
            "candidate_ids": [1, 2, 3]
        }
        """
        from hmis.apps.patients.models import Patient
        from hmis.apps.scheduling.models import Resource
        from hmis.apps.scheduling.serializers import (
            AutoAssignRequestSerializer,
            AutoAssignResponseSerializer,
        )
        from hmis.apps.scheduling.services.assignment import AssignmentService

        serializer = AutoAssignRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        # Get patient if specified
        patient = None
        if data.get("patient_id"):
            try:
                patient = Patient.objects.get(id=data["patient_id"])
            except Patient.DoesNotExist:
                return Response(
                    {"error": "Patient not found"},
                    status=status.HTTP_404_NOT_FOUND,
                )

        # Get candidate resources
        candidate_ids = data.get("candidate_ids", [])
        if candidate_ids:
            candidates = list(Resource.objects.filter(id__in=candidate_ids, is_active=True))
        else:
            candidates = list(Resource.objects.filter(is_active=True, resource_type="PERSON"))

        if not candidates:
            return Response(
                {"error": "No candidates available"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Build target data
        target_data = {
            "patient": patient,
            "scheduled_start": data.get("scheduled_start"),
            "scheduled_end": data.get("scheduled_end"),
            "reason": data.get("reason", "Auto-assigned"),
            "appointment_type": data.get("appointment_type", "CONSULTATION"),
        }

        # Perform assignment
        service = AssignmentService()
        result = service.auto_assign(
            assignment_type=data["assignment_type"],
            target_data=target_data,
            candidates=candidates,
            user=request.user,
        )

        # Build response
        from hmis.apps.scheduling.serializers import (
            AssignmentDecisionSerializer,
            ResourceListSerializer,
        )

        response_data = {
            "success": result.success,
            "assigned_resource": ResourceListSerializer(result.assigned_resource).data if result.assigned_resource else None,
            "decision": AssignmentDecisionSerializer(result.decision).data if result.decision else None,
            "target_id": result.target_id,
            "error": result.error,
        }

        return Response(response_data)

    @extend_schema(
        request=inline_serializer(
            name="ManualOverrideRequest",
            fields={
                "target_type": serializers.CharField(),
                "target_id": serializers.IntegerField(),
                "new_resource_id": serializers.IntegerField(),
                "override_reason": serializers.CharField(),
                "justification": serializers.CharField(required=False),
                "requires_approval": serializers.BooleanField(required=False),
            },
        ),
        responses={200: OpenApiTypes.OBJECT},
    )
    @action(detail=False, methods=["post"], url_path="manual-override")
    def manual_override(self, request):
        """
        Manually override an assignment.

        Request body:
        {
            "target_type": "Appointment",
            "target_id": 123,
            "new_resource_id": 456,
            "override_reason": "PATIENT_REQUEST",
            "justification": "Patient requested different doctor"
        }"""
        from hmis.apps.scheduling.models import Resource
        from hmis.apps.scheduling.serializers import (
            AssignmentOverrideSerializer,
            ManualOverrideRequestSerializer,
        )
        from hmis.apps.scheduling.services.assignment import AssignmentService

        serializer = ManualOverrideRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        # Get new resource
        try:
            new_resource = Resource.objects.get(id=data["new_resource_id"])
        except Resource.DoesNotExist:
            return Response(
                {"error": "Resource not found"},
                status=status.HTTP_404_NOT_FOUND,
            )

        # Perform override
        service = AssignmentService()
        result = service.manual_override(
            target_type=data["target_type"],
            target_id=data["target_id"],
            new_resource=new_resource,
            override_reason=data["override_reason"],
            justification=data["justification"],
            user=request.user,
            requires_approval=data.get("requires_approval", False),
        )

        response_data = {
            "success": result.success,
            "override": AssignmentOverrideSerializer(result.override).data if result.override else None,
            "error": result.error,
        }

        return Response(response_data)

