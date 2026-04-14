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

from datetime import datetime, timedelta

from django.utils import timezone
from django_filters import rest_framework as filters
from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import extend_schema, inline_serializer
from rest_framework import permissions, serializers, status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from hmis.apps.core.mixins import NestedTenantScopeMixin, ReadOnCreateMixin, TenantScopedViewMixin
from hmis.apps.core.models import AuditLog
from hmis.apps.scheduling.models import (
    Appointment,
    AssignmentDecision,
    AssignmentOverride,
    AssignmentRule,
    Resource,
    Schedule,
    Shift,
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
    SchedulingSettingsSerializer,
    ShiftCancelSerializer,
    ShiftCreateSerializer,
    ShiftListSerializer,
    ShiftSerializer,
    ShiftStartSerializer,
    SlotCheckQuerySerializer,
    StaffConstraintSerializer,
    StaffWorkloadSerializer,
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
    department = filters.NumberFilter(field_name="department__id")
    exclude_clinic_resources = filters.BooleanFilter(
        method="filter_exclude_clinic_resources",
        label="Exclude resources auto-created for clinics",
    )

    def filter_exclude_clinic_resources(self, queryset, name, value):
        """Exclude PLACE resources that are a clinic's scheduling_resource."""
        if value:
            return queryset.exclude(clinic__isnull=False)
        return queryset

    class Meta:
        """Meta options for ResourceFilter."""

        model = Resource
        fields = ["resource_type", "is_active", "code", "name", "department", "exclude_clinic_resources"]


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
        fields = [
            "patient",
            "resource",
            "status",
            "appointment_type",
            "priority",
            "from_date",
            "to_date",
        ]


class ShiftFilter(filters.FilterSet):
    """Filter for Shift model."""

    staff_resource = filters.NumberFilter(field_name="staff_resource__id")
    shift_type = filters.CharFilter(field_name="shift_type")
    status = filters.CharFilter(field_name="status")
    department = filters.NumberFilter(field_name="department__id")
    from_date = filters.DateFilter(field_name="shift_date", lookup_expr="gte")
    to_date = filters.DateFilter(field_name="shift_date", lookup_expr="lte")
    room = filters.NumberFilter(field_name="room__id")
    clinic = filters.NumberFilter(field_name="clinic__id")
    room_or_linked_clinic = filters.NumberFilter(
        method="filter_room_or_linked_clinic",
        label="Shifts in this room OR any clinic linked to it",
    )

    def filter_room_or_linked_clinic(self, queryset, name, value):
        """Return shifts that either clocked into this room OR belong to a linked clinic."""
        from hmis.apps.clinics.models import ClinicRoom

        # Get clinic IDs linked to this PLACE resource
        linked_clinic_ids = list(
            ClinicRoom.objects.filter(room_id=value).values_list("clinic_id", flat=True)
        )

        from django.db.models import Q

        q = Q(room_id=value)
        if linked_clinic_ids:
            q |= Q(clinic_id__in=linked_clinic_ids)
        return queryset.filter(q)

    class Meta:
        """Meta options for ShiftFilter."""

        model = Shift
        fields = [
            "staff_resource",
            "shift_type",
            "status",
            "department",
            "from_date",
            "to_date",
            "room",
            "clinic",
            "room_or_linked_clinic",
        ]


# =============================================================================
# ViewSets
# =============================================================================


class ResourceViewSet(TenantScopedViewMixin, viewsets.ModelViewSet):
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

    queryset = Resource.objects.select_related(
        "staff_profile__primary_department", "staff_profile__user", "department"
    )
    serializer_class = ResourceSerializer
    permission_classes = [permissions.IsAuthenticated]
    filterset_class = ResourceFilter
    tenant_scope = "facility"

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

    def perform_create(self, serializer):
        """Create resource with tenant scoping."""
        serializer.save(**self.get_tenant_save_kwargs())

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

        return Response(
            {
                "resource": resource.id,
                "resource_name": resource.name,
                "date": target_date,
                "slots": slots,
                "total_available": len(slots),
            }
        )

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

    @action(detail=True, methods=["get"], url_path="linked-clinics")
    def linked_clinics(self, request, pk=None):
        """Return clinics that this PLACE resource is linked to via ClinicRoom."""
        from hmis.apps.clinics.models import ClinicRoom

        resource = self.get_object()
        clinic_rooms = ClinicRoom.objects.filter(room=resource).select_related("clinic")
        data = [
            {
                "clinic_room_id": cr.id,
                "clinic_id": cr.clinic_id,
                "clinic_name": cr.clinic.name,
                "clinic_code": cr.clinic.code,
                "is_default": cr.is_default,
            }
            for cr in clinic_rooms
        ]
        return Response(data)

    @action(detail=False, methods=["post"], url_path="sync-from-staff")
    def sync_from_staff(self, request):
        """
        Auto-create PERSON resources from StaffProfiles that don't have one yet.

        Only creates resources for active staff at the current facility.
        Returns the count of newly created resources.
        """
        from hmis.apps.core.models import StaffProfile

        facility = self._get_facility(request)
        if not facility:
            return Response(
                {"error": "No facility context available"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Find staff profiles that don't have a scheduling resource at this facility
        staff_without_resource = StaffProfile.objects.filter(
            employment_status="ACTIVE",
            primary_facility=facility,
        ).exclude(
            scheduling_resources__facility=facility,
        ).select_related("user")

        created_count = 0
        for profile in staff_without_resource:
            full_name = profile.user.get_full_name() or profile.user.username
            code = f"STAFF-{profile.employee_id or profile.pk}"

            # Avoid duplicate codes
            if Resource.objects.filter(code=code, facility=facility).exists():
                code = f"STAFF-{profile.pk}-{profile.user.username[:8]}"

            Resource.objects.create(
                name=full_name,
                resource_type="PERSON",
                code=code,
                is_active=True,
                staff_profile=profile,
                facility=facility,
                organization=facility.organization,
                metadata={
                    "employee_id": profile.employee_id or "",
                    "role": str(profile.primary_role) if profile.primary_role else "",
                    "department": str(profile.primary_department) if profile.primary_department else "",
                    "synced_from_staff": True,
                },
            )
            created_count += 1

        return Response({
            "created": created_count,
            "message": f"Created {created_count} resource(s) from staff profiles",
        })

    def _get_facility(self, request):
        """Resolve the current facility from request context or user profile."""
        facility = getattr(request, "facility", None)
        if not facility:
            try:
                facility = request.user.staff_profile.primary_facility
            except (AttributeError, Exception):
                return None
        return facility

    @action(detail=False, methods=["post"], url_path="sync-from-clinics")
    def sync_from_clinics(self, request):
        """
        Auto-create PLACE resources from Clinics that don't have one yet.

        Only creates resources for active clinics at the current facility.
        Returns the count of newly created resources.
        """
        from hmis.apps.clinics.models import Clinic

        facility = self._get_facility(request)
        if not facility:
            return Response(
                {"error": "No facility context available"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        clinics_without_resource = Clinic.objects.filter(
            status="ACTIVE",
            facility=facility,
            scheduling_resource__isnull=True,
        )

        created_count = 0
        for clinic in clinics_without_resource:
            code = f"CLINIC-{clinic.code}"
            if Resource.objects.filter(code=code, facility=facility).exists():
                code = f"CLINIC-{clinic.pk}"

            resource = Resource.objects.create(
                name=clinic.name,
                resource_type="PLACE",
                code=code,
                is_active=True,
                capacity=clinic.capacity,
                description=clinic.description or "",
                facility=facility,
                organization=facility.organization,
                metadata={
                    "synced_from": "clinic",
                    "source_code": clinic.code,
                    "clinic_type": clinic.clinic_type,
                    "location": clinic.location or "",
                },
            )
            clinic.scheduling_resource = resource
            clinic.save(update_fields=["scheduling_resource"])
            created_count += 1

        return Response({
            "created": created_count,
            "message": f"Created {created_count} resource(s) from clinics",
        })

    @action(detail=False, methods=["post"], url_path="sync-from-wards")
    def sync_from_wards(self, request):
        """
        Auto-create PLACE resources from inpatient Wards that don't have one yet.

        Only creates resources for active wards at the current facility.
        Returns the count of newly created resources.
        """
        from hmis.apps.inpatient.models import Ward

        facility = self._get_facility(request)
        if not facility:
            return Response(
                {"error": "No facility context available"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        wards_without_resource = Ward.objects.filter(
            is_active=True,
            facility=facility,
            scheduling_resource__isnull=True,
        )

        created_count = 0
        for ward in wards_without_resource:
            code = f"WARD-{ward.code}"
            if Resource.objects.filter(code=code, facility=facility).exists():
                code = f"WARD-{ward.pk}"

            resource = Resource.objects.create(
                name=ward.name,
                resource_type="PLACE",
                code=code,
                is_active=True,
                capacity=ward.capacity,
                description=ward.description or "",
                facility=facility,
                organization=facility.organization,
                metadata={
                    "synced_from": "ward",
                    "source_code": ward.code,
                    "ward_type": ward.ward_type,
                    "floor": ward.floor or "",
                },
            )
            ward.scheduling_resource = resource
            ward.save(update_fields=["scheduling_resource"])
            created_count += 1

        return Response({
            "created": created_count,
            "message": f"Created {created_count} resource(s) from wards",
        })


class ScheduleViewSet(NestedTenantScopeMixin, ReadOnCreateMixin, viewsets.ModelViewSet):
    """
    ViewSet for managing resource schedules.

    Scoped to the current facility via the resource FK chain
    (Schedule → Resource → facility).

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
    tenant_facility_chain = "resource__facility"
    tenant_org_chain = "resource__organization"

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


class AppointmentViewSet(TenantScopedViewMixin, viewsets.ModelViewSet):
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
    tenant_scope = "facility"

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
        appointment = serializer.save(**self.get_tenant_save_kwargs())
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

        self._log_action(
            "appointment_cancel",
            appointment,
            {
                "reason": serializer.validated_data.get("reason", ""),
            },
        )
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


class AssignmentRuleViewSet(TenantScopedViewMixin, viewsets.ModelViewSet):
    """
    ViewSet for managing assignment rules.

    Supports CRUD operations plus activate/deactivate actions.
    """

    queryset = AssignmentRule.objects.all()
    permission_classes = [permissions.IsAuthenticated]
    filterset_class = AssignmentRuleFilter
    tenant_scope = "facility"

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
                "candidate_ids": serializers.ListField(
                    child=serializers.IntegerField(), required=False
                ),
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
            "assigned_resource": ResourceListSerializer(result.assigned_resource).data
            if result.assigned_resource
            else None,
            "decision": AssignmentDecisionSerializer(result.decision).data
            if result.decision
            else None,
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
            "override": AssignmentOverrideSerializer(result.override).data
            if result.override
            else None,
            "error": result.error,
        }

        return Response(response_data)


# =============================================================================
# Phase 3: Shift / Duty Roster ViewSets
# =============================================================================


class ManageSchedulesWritePermission(permissions.BasePermission):
    """Allow reads for all authenticated users; require ``scheduling.manage_schedules`` for writes.

    Lifecycle actions (start, complete, take-break, resume, cancel) are NOT
    gated — they are personal clock-in/out operations.
    """

    WRITE_METHODS = {"POST", "PUT", "PATCH", "DELETE"}
    # Personal clock-in/out actions that should NOT be gated
    PERSONAL_ACTIONS = {"start", "complete", "take_break", "resume", "cancel"}

    def has_permission(self, request, view):
        if request.method not in self.WRITE_METHODS:
            return True
        # Allow personal lifecycle actions
        action_name = getattr(view, "action", None)
        if action_name in self.PERSONAL_ACTIONS:
            return True
        # Superusers always pass
        if request.user and request.user.is_superuser:
            return True
        return request.user.has_perm("scheduling.manage_schedules")


class ShiftViewSet(TenantScopedViewMixin, ReadOnCreateMixin, viewsets.ModelViewSet):
    """
    ViewSet for managing staff shifts / duty roster.

    Endpoints:
        GET    /api/scheduling/shifts/              - List shifts (duty roster)
        POST   /api/scheduling/shifts/              - Create shift
        GET    /api/scheduling/shifts/{id}/         - Retrieve shift
        PATCH  /api/scheduling/shifts/{id}/         - Update shift
        DELETE /api/scheduling/shifts/{id}/         - Delete shift

    Lifecycle actions:
        POST   /api/scheduling/shifts/{id}/start/   - Start shift (clock in)
        POST   /api/scheduling/shifts/{id}/complete/ - Complete shift (clock out)
        POST   /api/scheduling/shifts/{id}/cancel/  - Cancel shift

    Aggregation:
        GET    /api/scheduling/shifts/staff-workload/ - Staff workload summary
    """

    queryset = Shift.objects.select_related(
        "staff_resource",
        "staff_resource__staff_profile",
        "staff_resource__staff_profile__primary_department",
        "staff_resource__department",
        "department",
        "created_by",
        "cancelled_by",
        "room",
        "clinic",
    )
    serializer_class = ShiftSerializer
    permission_classes = [permissions.IsAuthenticated, ManageSchedulesWritePermission]
    filterset_class = ShiftFilter
    tenant_scope = "facility"

    def get_serializer_class(self):
        """Get appropriate serializer class."""
        if self.action == "create":
            return ShiftCreateSerializer
        if self.action == "list":
            return ShiftListSerializer
        return ShiftSerializer

    def perform_create(self, serializer):
        """Create shift with tenant scoping and audit."""
        shift = serializer.save(**self.get_tenant_save_kwargs())
        AuditLog.log(
            action="shift_create",
            user=self.request.user,
            resource_type="Shift",
            resource_id=shift.id,
            details={"staff_resource": shift.staff_resource.name, "shift_date": str(shift.shift_date)},
            ip_address=self._get_client_ip(),
        )

    def _get_client_ip(self) -> str:
        """Get client IP address from request."""
        xff = self.request.META.get("HTTP_X_FORWARDED_FOR")
        if xff:
            return xff.split(",")[0].strip()
        return self.request.META.get("REMOTE_ADDR", "")

    @action(detail=True, methods=["post"])
    def start(self, request, pk=None):
        """Start a shift (clock in).

        Accepts optional room_id and clinic_id in the request body to capture
        which room and clinic the clinician is serving in.

        If a clinic is specified (or auto-resolved from ClinicStaff), the system
        auto-opens today's ClinicSession if none is open yet.

        Blocks clock-in if the shift has already ended (now > shift end time).

        Checks facility punctuality settings — if enforce_punctuality is enabled
        and the staff member is more than late_cutoff_minutes late, clock-in is
        blocked unless the user has manage_schedules permission (admin override).
        """
        shift = self.get_object()

        now = timezone.now()

        # Block clock-in after shift end time
        shift_end_naive = datetime.combine(shift.shift_date, shift.end_time)
        # Night shifts: end_time < start_time means end is next day
        if shift.end_time <= shift.start_time:
            shift_end_naive += timedelta(days=1)
        shift_end_dt = (
            timezone.make_aware(shift_end_naive)
            if timezone.is_naive(shift_end_naive)
            else shift_end_naive
        )
        if now > shift_end_dt:
            return Response(
                {
                    "error": "Cannot clock in after shift end time. This shift has already ended.",
                    "code": "shift_ended",
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Punctuality enforcement
        from hmis.apps.scheduling.models import SchedulingSettings

        settings = SchedulingSettings.objects.filter(facility=shift.facility).first()
        if settings and settings.enforce_punctuality and settings.late_cutoff_minutes:
            shift_start_dt = timezone.make_aware(
                datetime.combine(shift.shift_date, shift.start_time)
            ) if timezone.is_naive(
                datetime.combine(shift.shift_date, shift.start_time)
            ) else datetime.combine(shift.shift_date, shift.start_time)
            minutes_late = (now - shift_start_dt).total_seconds() / 60
            is_admin = request.user.has_perm("scheduling.manage_schedules")
            if minutes_late > settings.late_cutoff_minutes and not is_admin:
                return Response(
                    {
                        "error": (
                            f"Clock-in blocked: you are {int(minutes_late)} minutes late. "
                            f"Facility policy allows clock-in within {settings.late_cutoff_minutes} minutes "
                            f"of shift start. Contact a supervisor for an override."
                        ),
                        "code": "late_cutoff_exceeded",
                        "minutes_late": int(minutes_late),
                        "cutoff": settings.late_cutoff_minutes,
                    },
                    status=status.HTTP_403_FORBIDDEN,
                )

        # Validate optional room/clinic payload
        start_serializer = ShiftStartSerializer(
            data=request.data, context={"shift": shift, "request": request}
        )
        start_serializer.is_valid(raise_exception=True)

        room_id = start_serializer.validated_data.get("room_id")
        clinic_id = start_serializer.validated_data.get("clinic_id")
        clock_method = start_serializer.validated_data.get("method", "MANUAL")

        room = None
        clinic = None

        if room_id:
            room = Resource.objects.get(pk=room_id)

        if clinic_id:
            from hmis.apps.clinics.models import Clinic as ClinicModel
            clinic = ClinicModel.objects.get(pk=clinic_id)
        else:
            # Auto-resolve clinic from ClinicStaff (primary clinic)
            from hmis.apps.clinics.models import ClinicStaff
            staff_user = (
                shift.staff_resource.staff_profile.user
                if shift.staff_resource.staff_profile
                else None
            )
            if staff_user:
                primary_assignment = (
                    ClinicStaff.objects.filter(user=staff_user, is_primary=True, is_active=True)
                    .select_related("clinic")
                    .first()
                )
                if primary_assignment and primary_assignment.clinic.status == "ACTIVE":
                    clinic = primary_assignment.clinic

        try:
            shift.start_shift(room=room, clinic=clinic, method=clock_method)
        except ValueError as e:
            return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)

        # Auto-open clinic session if needed
        session_auto_opened = False
        if clinic:
            session, created = clinic.get_or_create_session(shift.shift_date)
            if session.status == "SCHEDULED":
                session.open_session(request.user)
                session_auto_opened = True

        serializer = ShiftSerializer(shift)
        data = serializer.data
        data["session_auto_opened"] = session_auto_opened
        return Response(data)

    @action(detail=True, methods=["post"])
    def complete(self, request, pk=None):
        """Complete a shift (clock out).

        If the shift is linked to a clinic, checks whether any other active/on-break
        shifts remain for that clinic today. If this was the last one, the clinic
        session is auto-closed.
        """
        shift = self.get_object()
        clinic = shift.clinic
        try:
            shift.complete_shift()
        except ValueError as e:
            return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)

        # Auto-close clinic session if this was the last active shift
        session_auto_closed = False
        if clinic:
            remaining = Shift.objects.filter(
                clinic=clinic,
                shift_date=shift.shift_date,
                status__in=["ACTIVE", "ON_BREAK"],
            ).exclude(pk=shift.pk).exists()
            if not remaining:
                from hmis.apps.clinics.models import ClinicSession
                session = ClinicSession.objects.filter(
                    clinic=clinic,
                    session_date=shift.shift_date,
                    status="OPEN",
                ).first()
                if session:
                    session.close_session(request.user)
                    session_auto_closed = True

        serializer = ShiftSerializer(shift)
        data = serializer.data
        data["session_auto_closed"] = session_auto_closed
        return Response(data)

    @action(detail=True, methods=["post"], url_path="take-break")
    def take_break(self, request, pk=None):
        """Take a break during an active shift."""
        shift = self.get_object()
        try:
            shift.take_break()
        except ValueError as e:
            return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)
        serializer = ShiftSerializer(shift)
        return Response(serializer.data)

    @action(detail=True, methods=["post"])
    def resume(self, request, pk=None):
        """Resume shift from break."""
        shift = self.get_object()
        try:
            shift.resume_shift()
        except ValueError as e:
            return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)
        serializer = ShiftSerializer(shift)
        return Response(serializer.data)

    @action(detail=True, methods=["post"])
    def cancel(self, request, pk=None):
        """Cancel a shift."""
        shift = self.get_object()
        cancel_serializer = ShiftCancelSerializer(data=request.data)
        cancel_serializer.is_valid(raise_exception=True)
        try:
            shift.cancel(
                user=request.user,
                reason=cancel_serializer.validated_data.get("reason", ""),
            )
        except ValueError as e:
            return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)
        serializer = ShiftSerializer(shift)
        return Response(serializer.data)

    @action(detail=False, methods=["post"], url_path="bulk-create")
    def bulk_create(self, request):
        """
        Bulk-create shifts for a roster grid.

        Accepts an array of shift data objects. Validates each item,
        skips duplicates (same staff + date + shift_type), and returns
        counts of created/skipped/errors.

        Request body:
            { "shifts": [ { staff_resource, shift_date, start_time, end_time, shift_type, department?, notes? }, ... ] }
        """
        shifts_data = request.data.get("shifts", [])
        if not isinstance(shifts_data, list) or len(shifts_data) == 0:
            return Response(
                {"error": "Request body must contain a non-empty 'shifts' array"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if len(shifts_data) > 200:
            return Response(
                {"error": "Maximum 200 shifts per bulk request"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        tenant_kwargs = self.get_tenant_save_kwargs()
        created, skipped, errors = [], [], []

        for idx, item in enumerate(shifts_data):
            serializer = ShiftCreateSerializer(data=item, context={"request": request})
            if not serializer.is_valid():
                errors.append({"index": idx, "errors": serializer.errors})
                continue

            vd = serializer.validated_data
            # Skip duplicates: same staff + date + type already exists
            exists = Shift.objects.filter(
                staff_resource=vd["staff_resource"],
                shift_date=vd["shift_date"],
                shift_type=vd["shift_type"],
                **{k: v for k, v in tenant_kwargs.items() if k == "facility"},
            ).exclude(status="CANCELLED").exists()

            if exists:
                skipped.append({
                    "index": idx,
                    "reason": f"Shift already exists for this staff on {vd['shift_date']} ({vd['shift_type']})",
                })
                continue

            try:
                shift = serializer.save(**tenant_kwargs)
                created.append(shift.id)
            except Exception as e:
                errors.append({"index": idx, "errors": str(e)})

        return Response({
            "created": len(created),
            "skipped": len(skipped),
            "errors": len(errors),
            "created_ids": created,
            "skipped_details": skipped,
            "error_details": errors,
        }, status=status.HTTP_201_CREATED if created else status.HTTP_200_OK)

    @action(detail=False, methods=["post"], url_path="bulk-delete")
    def bulk_delete(self, request):
        """
        Bulk-delete shifts by date range.

        Deletes all SCHEDULED shifts within [from_date, to_date] for
        the current facility.  Active / completed shifts are preserved.

        Request body:
            { "from_date": "YYYY-MM-DD", "to_date": "YYYY-MM-DD" }
        """
        from datetime import date as date_type

        from_date_str = request.data.get("from_date")
        to_date_str = request.data.get("to_date")

        if not from_date_str or not to_date_str:
            return Response(
                {"error": "from_date and to_date are required"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            from_date = date_type.fromisoformat(from_date_str)
            to_date = date_type.fromisoformat(to_date_str)
        except (ValueError, TypeError):
            return Response(
                {"error": "Invalid date format. Use YYYY-MM-DD"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        qs = self.get_queryset().filter(
            shift_date__gte=from_date,
            shift_date__lte=to_date,
            status="SCHEDULED",
        )
        count = qs.count()
        qs.delete()

        return Response({"deleted": count})

    @action(detail=False, methods=["get"], url_path="staff-workload")
    def staff_workload(self, request):
        """
        Get staff workload summary for a date range.

        Query params:
            from_date: Start date (required)
            to_date: End date (required)
        """
        from datetime import date as date_type


        from_date_str = request.query_params.get("from_date")
        to_date_str = request.query_params.get("to_date")

        if not from_date_str or not to_date_str:
            return Response(
                {"error": "from_date and to_date are required"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            from_date = date_type.fromisoformat(from_date_str)
            to_date = date_type.fromisoformat(to_date_str)
        except ValueError:
            return Response(
                {"error": "Invalid date format. Use YYYY-MM-DD"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Get all person resources for this facility
        facility = getattr(request, "facility", None)
        if not facility and hasattr(request.user, "staff_profile"):
            facility = request.user.staff_profile.primary_facility
        staff_resources = Resource.objects.filter(
            resource_type="PERSON",
            is_active=True,
            facility=facility,
        )

        # For each staff resource, aggregate shifts and appointments
        workload = []
        for resource in staff_resources:
            shifts = Shift.objects.filter(
                staff_resource=resource,
                shift_date__gte=from_date,
                shift_date__lte=to_date,
            ).exclude(status="CANCELLED")

            appointments = Appointment.objects.filter(
                resource=resource,
                scheduled_start__date__gte=from_date,
                scheduled_start__date__lte=to_date,
            ).exclude(status__in=["CANCELLED", "NO_SHOW"])

            shift_list = list(shifts)
            total_hours = sum(s.duration_hours for s in shift_list)
            active_count = sum(1 for s in shift_list if s.status == "ACTIVE")
            completed_count = sum(1 for s in shift_list if s.status == "COMPLETED")

            workload.append({
                "resource_id": resource.id,
                "resource_name": resource.name,
                "resource_code": resource.code,
                "shift_count": len(shift_list),
                "total_hours": round(total_hours, 1),
                "appointment_count": appointments.count(),
                "active_shifts": active_count,
                "completed_shifts": completed_count,
            })

        serializer = StaffWorkloadSerializer(workload, many=True)
        return Response(serializer.data)

    # ---- Personal / Clock-In Endpoints ----

    def _get_my_resource(self, request):
        """Resolve the scheduling Resource linked to the current user's StaffProfile."""
        staff_profile = getattr(request.user, "staff_profile", None)
        if not staff_profile:
            return None
        self._resolve_tenant_context()
        facility = getattr(request, "facility", None)
        if not facility:
            return None
        return (
            Resource.objects.filter(
                staff_profile=staff_profile,
                facility=facility,
                resource_type="PERSON",
            )
            .first()
        )

    @action(detail=False, methods=["get"], url_path="my-today")
    def my_today(self, request):
        """
        Get the current user's shift(s) for today.

        Returns a list of shifts plus an attendance_status field:
        - NO_SHIFT: no shift scheduled today
        - UPCOMING: shift hasn't started yet
        - SHOULD_CLOCK_IN: shift start time has passed, not yet clocked in
        - CLOCKED_IN: currently on duty
        - COMPLETED: shift done for the day
        """
        from datetime import date as date_type

        resource = self._get_my_resource(request)
        if not resource:
            return Response({"shifts": [], "attendance_status": "NO_SHIFT"})

        today = date_type.today()
        shifts = list(
            Shift.objects.filter(
                staff_resource=resource,
                shift_date=today,
            )
            .exclude(status="CANCELLED")
            .exclude(shift_type__in=["OFF", "DAY_OFF", "NIGHT_OFF", "AFTERNOON_OFF", "LEAVE", "SICK_LEAVE", "REST"])
            .order_by("start_time")
        )

        if not shifts:
            return Response({"shifts": [], "attendance_status": "NO_SHIFT"})

        # Determine overall attendance status from the primary (first) shift
        primary = shifts[0]
        now = timezone.now()
        shift_start_dt = timezone.make_aware(
            datetime.combine(primary.shift_date, primary.start_time)
        ) if timezone.is_naive(
            datetime.combine(primary.shift_date, primary.start_time)
        ) else datetime.combine(primary.shift_date, primary.start_time)

        if primary.status == "COMPLETED":
            att_status = "COMPLETED"
        elif primary.status == "ACTIVE":
            att_status = "CLOCKED_IN"
        elif primary.status == "ON_BREAK":
            att_status = "ON_BREAK"
        elif now >= shift_start_dt:
            att_status = "SHOULD_CLOCK_IN"
        else:
            att_status = "UPCOMING"

        serializer = ShiftSerializer(shifts, many=True)
        return Response({
            "shifts": serializer.data,
            "attendance_status": att_status,
        })

    @action(detail=False, methods=["get"], url_path="my-history")
    def my_history(self, request):
        """
        Get the current user's shift history (paginated) with attendance stats.

        Query params:
            from_date: Start date (optional, YYYY-MM-DD, default: 30 days ago)
            to_date:   End date (optional, YYYY-MM-DD, default: today)
            page / page_size: Pagination
        """
        from datetime import date as date_type
        from datetime import timedelta as td

        resource = self._get_my_resource(request)
        if not resource:
            return Response({
                "results": [],
                "count": 0,
                "stats": {
                    "total_shifts": 0,
                    "total_hours": 0,
                    "on_time_count": 0,
                    "late_count": 0,
                    "on_time_rate": 0,
                    "overtime_hours": 0,
                },
            })

        today = date_type.today()
        from_date_str = request.query_params.get("from_date")
        to_date_str = request.query_params.get("to_date")
        try:
            from_date = date_type.fromisoformat(from_date_str) if from_date_str else today - td(days=30)
            to_date = date_type.fromisoformat(to_date_str) if to_date_str else today
        except ValueError:
            return Response(
                {"error": "Invalid date format. Use YYYY-MM-DD"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        shifts = (
            Shift.objects.filter(
                staff_resource=resource,
                shift_date__gte=from_date,
                shift_date__lte=to_date,
            )
            .exclude(status="CANCELLED")
            .exclude(shift_type__in=["OFF", "DAY_OFF", "NIGHT_OFF", "AFTERNOON_OFF", "LEAVE", "SICK_LEAVE", "REST"])
            .order_by("-shift_date", "-start_time")
        )

        # Compute attendance stats
        total_shifts = shifts.count()
        completed = shifts.filter(status="COMPLETED")

        total_hours = 0.0
        on_time_count = 0
        late_count = 0
        overtime_hours = 0.0
        late_threshold_minutes = 15

        for s in completed:
            # Duration from actual start/end
            if s.started_at and s.completed_at:
                actual_hours = (s.completed_at - s.started_at).total_seconds() / 3600
                total_hours += actual_hours
                # Overtime: actual hours - scheduled hours
                if s.duration_hours and actual_hours > s.duration_hours:
                    overtime_hours += actual_hours - s.duration_hours
            elif s.duration_hours:
                total_hours += s.duration_hours

            # Late check: started_at vs scheduled start
            if s.started_at:
                scheduled_start = timezone.make_aware(
                    datetime.combine(s.shift_date, s.start_time)
                ) if timezone.is_naive(
                    datetime.combine(s.shift_date, s.start_time)
                ) else datetime.combine(s.shift_date, s.start_time)
                diff_minutes = (s.started_at - scheduled_start).total_seconds() / 60
                if diff_minutes > late_threshold_minutes:
                    late_count += 1
                else:
                    on_time_count += 1

        on_time_rate = round((on_time_count / (on_time_count + late_count) * 100), 1) if (on_time_count + late_count) > 0 else 0

        # Paginate
        page_size = int(request.query_params.get("page_size", 20))
        page_num = int(request.query_params.get("page", 1))
        start = (page_num - 1) * page_size
        end = start + page_size
        page_shifts = shifts[start:end]

        serializer = ShiftListSerializer(page_shifts, many=True)
        return Response({
            "results": serializer.data,
            "count": total_shifts,
            "stats": {
                "total_shifts": total_shifts,
                "total_hours": round(total_hours, 1),
                "on_time_count": on_time_count,
                "late_count": late_count,
                "on_time_rate": on_time_rate,
                "overtime_hours": round(overtime_hours, 1),
            },
        })

    @action(detail=False, methods=["get"], url_path="cross-facility-conflicts")
    def cross_facility_conflicts(self, request):
        """
        Check for scheduling conflicts across facilities for multi-site staff.

        For each staff resource in the current facility's roster for the given
        date range, checks whether the linked StaffProfile has shifts at OTHER
        facilities on the same dates.

        Query params:
            from_date: Start date (required, YYYY-MM-DD)
            to_date:   End date   (required, YYYY-MM-DD)

        Returns a list of conflicts:
        [
          {
            "staff_resource_id": 42,
            "staff_resource_name": "Dr. Kamau",
            "staff_profile_id": 7,
            "shift_date": "2026-04-14",
            "this_facility_shift": { "shift_type": "DAY", "start_time": "07:00", "end_time": "19:00" },
            "other_facility": { "id": 3, "name": "Clinic B" },
            "other_shift": { "shift_type": "NIGHT", "start_time": "19:00", "end_time": "07:00" }
          }
        ]
        """
        from datetime import date as date_type

        from_date_str = request.query_params.get("from_date")
        to_date_str = request.query_params.get("to_date")
        if not from_date_str or not to_date_str:
            return Response(
                {"error": "from_date and to_date are required"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        try:
            from_date = date_type.fromisoformat(from_date_str)
            to_date = date_type.fromisoformat(to_date_str)
        except ValueError:
            return Response(
                {"error": "Invalid date format. Use YYYY-MM-DD"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Get the current facility from tenant context
        self._resolve_tenant_context()
        current_facility = getattr(request, "facility", None)
        if not current_facility:
            return Response(
                {"error": "No facility context available"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Get all shifts for this facility in the date range
        local_shifts = (
            Shift.objects.filter(
                facility=current_facility,
                shift_date__gte=from_date,
                shift_date__lte=to_date,
            )
            .exclude(status="CANCELLED")
            .select_related("staff_resource__staff_profile", "facility")
        )

        # Collect staff_profile IDs and build a lookup
        profile_to_local: dict[int, list] = {}
        for shift in local_shifts:
            sp = getattr(shift.staff_resource, "staff_profile", None)
            if sp:
                profile_to_local.setdefault(sp.pk, []).append(shift)

        if not profile_to_local:
            return Response([])

        # Query shifts at OTHER facilities (same organization) for these staff profiles
        current_org = current_facility.organization
        other_shifts = (
            Shift.objects.filter(
                staff_resource__staff_profile_id__in=profile_to_local.keys(),
                shift_date__gte=from_date,
                shift_date__lte=to_date,
                organization=current_org,
            )
            .exclude(status="CANCELLED")
            .exclude(facility=current_facility)
            .select_related("staff_resource__staff_profile", "facility")
        )

        # Build conflict list
        conflicts = []
        for other in other_shifts:
            sp_id = other.staff_resource.staff_profile_id
            for local in profile_to_local.get(sp_id, []):
                if local.shift_date == other.shift_date:
                    conflicts.append(
                        {
                            "staff_resource_id": local.staff_resource_id,
                            "staff_resource_name": local.staff_resource.name,
                            "staff_profile_id": sp_id,
                            "shift_date": str(other.shift_date),
                            "this_facility_shift": {
                                "shift_type": local.shift_type,
                                "start_time": str(local.start_time),
                                "end_time": str(local.end_time),
                            },
                            "other_facility": {
                                "id": other.facility_id,
                                "name": str(other.facility),
                            },
                            "other_shift": {
                                "shift_type": other.shift_type,
                                "start_time": str(other.start_time),
                                "end_time": str(other.end_time),
                            },
                        }
                    )

        return Response(conflicts)

    @action(detail=False, methods=["get"], url_path="attendance-trends")
    def attendance_trends(self, request):
        """
        Get weekly attendance trends for the current user.

        Returns aggregated data per ISO week for chart rendering:
        - week_start: Monday of the week (YYYY-MM-DD)
        - hours_worked: total actual hours worked
        - shifts_completed: number of completed shifts
        - on_time_rate: percentage of shifts that were on-time
        - late_count: shifts where clock-in was >15min late
        - overtime_hours: hours beyond scheduled duration

        Query params:
            weeks: Number of weeks to look back (default: 12, max: 52)
        """
        from collections import defaultdict
        from datetime import date as date_type
        from datetime import timedelta as td

        from hmis.apps.scheduling.models import Shift

        resource = self._get_my_resource(request)
        if not resource:
            return Response([])

        weeks = min(int(request.query_params.get("weeks", 12)), 52)
        today = date_type.today()
        # Align to Monday
        start_of_week = today - td(days=today.weekday())
        from_date = start_of_week - td(weeks=weeks - 1)

        non_working_types = {
            "OFF", "DAY_OFF", "NIGHT_OFF", "AFTERNOON_OFF",
            "LEAVE", "SICK_LEAVE", "REST",
        }
        shifts = (
            Shift.objects.filter(
                staff_resource=resource,
                shift_date__gte=from_date,
                shift_date__lte=today,
                status__in=["COMPLETED", "ACTIVE", "ON_BREAK"],
            )
            .exclude(shift_type__in=non_working_types)
            .order_by("shift_date")
        )

        # Group by ISO week
        week_data: dict = defaultdict(lambda: {
            "hours": 0.0, "shifts": 0, "on_time": 0, "late": 0, "overtime": 0.0,
        })
        late_threshold = 15  # minutes

        for s in shifts:
            # Monday of that week
            week_monday = s.shift_date - td(days=s.shift_date.weekday())
            key = str(week_monday)
            bucket = week_data[key]

            if s.status == "COMPLETED":
                bucket["shifts"] += 1
                actual = s.actual_hours
                if actual is not None:
                    bucket["hours"] += actual
                    scheduled = s.duration_hours
                    if actual > scheduled:
                        bucket["overtime"] += actual - scheduled

                if s.late_minutes > late_threshold:
                    bucket["late"] += 1
                elif s.started_at:
                    bucket["on_time"] += 1

        # Build sorted result
        result = []
        for w in range(weeks):
            monday = from_date + td(weeks=w)
            key = str(monday)
            d = week_data.get(key, {
                "hours": 0.0, "shifts": 0, "on_time": 0, "late": 0, "overtime": 0.0,
            })
            total = d["on_time"] + d["late"]
            result.append({
                "week_start": key,
                "hours_worked": round(d["hours"], 1),
                "shifts_completed": d["shifts"],
                "on_time_rate": round(d["on_time"] / total * 100, 1) if total > 0 else 0,
                "late_count": d["late"],
                "overtime_hours": round(d["overtime"], 1),
            })

        return Response(result)

    @action(detail=False, methods=["get"], url_path="payroll-export")
    def payroll_export(self, request):
        """
        Export attendance data as CSV for payroll processing.

        Returns a CSV file with one row per completed shift:
        staff_name, staff_code, date, shift_type, scheduled_start, scheduled_end,
        clock_in, clock_out, scheduled_hours, actual_hours, break_minutes,
        late_minutes, overtime_minutes, auto_clocked_out

        Query params:
            from_date: Start date (required)
            to_date: End date (required)
        """
        import csv
        import io
        from datetime import date as date_type

        from django.http import HttpResponse

        from hmis.apps.scheduling.models import Shift

        from_date_str = request.query_params.get("from_date")
        to_date_str = request.query_params.get("to_date")

        if not from_date_str or not to_date_str:
            return Response(
                {"error": "from_date and to_date are required"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        try:
            from_date = date_type.fromisoformat(from_date_str)
            to_date = date_type.fromisoformat(to_date_str)
        except ValueError:
            return Response(
                {"error": "Invalid date format. Use YYYY-MM-DD"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Only export for current facility
        self._resolve_tenant_context()
        facility = getattr(request, "facility", None)
        if not facility:
            return Response(
                {"error": "No facility context available"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        non_working_types = {
            "OFF", "DAY_OFF", "NIGHT_OFF", "AFTERNOON_OFF",
            "LEAVE", "SICK_LEAVE", "REST",
        }

        shifts = (
            Shift.objects.filter(
                facility=facility,
                shift_date__gte=from_date,
                shift_date__lte=to_date,
                status__in=["COMPLETED", "ABSENT"],
            )
            .exclude(shift_type__in=non_working_types)
            .select_related("staff_resource")
            .order_by("staff_resource__name", "shift_date", "start_time")
        )

        output = io.StringIO()
        writer = csv.writer(output)
        writer.writerow([
            "Staff Name", "Staff Code", "Date", "Shift Type",
            "Scheduled Start", "Scheduled End", "Clock In", "Clock Out",
            "Scheduled Hours", "Actual Hours", "Break Minutes",
            "Late Minutes", "Overtime Minutes", "Status", "Auto Clocked Out",
        ])

        for s in shifts:
            writer.writerow([
                s.staff_resource.name,
                s.staff_resource.code,
                str(s.shift_date),
                s.shift_type,
                str(s.start_time),
                str(s.end_time),
                str(s.started_at) if s.started_at else "",
                str(s.completed_at) if s.completed_at else "",
                s.duration_hours,
                s.actual_hours if s.actual_hours is not None else "",
                s.total_break_minutes,
                s.late_minutes,
                s.overtime_minutes,
                s.status,
                "Yes" if s.auto_clocked_out else "No",
            ])

        response = HttpResponse(output.getvalue(), content_type="text/csv")
        response["Content-Disposition"] = (
            f'attachment; filename="payroll_{from_date}_{to_date}.csv"'
        )
        return response

    @action(detail=False, methods=["post"], url_path="qr-clock-in")
    def qr_clock_in(self, request):
        """
        Clock in via QR code scan.

        The QR code payload contains a facility-specific token. This endpoint
        validates the token and clocks in the current user's shift for today.

        Request body:
            { "qr_token": "<facility_id>:<rotating_hash>" }
        """
        import hashlib
        from datetime import date as date_type


        qr_token = request.data.get("qr_token", "")
        if not qr_token or ":" not in qr_token:
            return Response(
                {"error": "Invalid QR code", "code": "invalid_qr"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Parse facility_id:hash from QR token
        parts = qr_token.split(":", 1)
        try:
            qr_facility_id = int(parts[0])
        except (ValueError, IndexError):
            return Response(
                {"error": "Invalid QR code format", "code": "invalid_qr"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Validate rotating hash (based on facility_id + date + hour)
        from django.conf import settings as django_settings
        now = timezone.now()
        secret = getattr(django_settings, "SECRET_KEY", "vitora")
        expected_hash = hashlib.sha256(
            f"{qr_facility_id}:{now.strftime('%Y-%m-%d:%H')}:{secret}".encode()
        ).hexdigest()[:16]

        if parts[1] != expected_hash:
            # Also accept previous hour's hash for clock skew
            prev_hour = (now - timedelta(hours=1)).strftime("%Y-%m-%d:%H")
            prev_hash = hashlib.sha256(
                f"{qr_facility_id}:{prev_hour}:{secret}".encode()
            ).hexdigest()[:16]
            if parts[1] != prev_hash:
                return Response(
                    {"error": "QR code expired or invalid", "code": "qr_expired"},
                    status=status.HTTP_400_BAD_REQUEST,
                )

        # Resolve user's shift
        resource = self._get_my_resource(request)
        if not resource:
            return Response(
                {"error": "No scheduling resource linked to your profile"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Verify facility matches
        if resource.facility_id != qr_facility_id:
            return Response(
                {"error": "QR code is for a different facility", "code": "wrong_facility"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        non_working_types = {
            "OFF", "DAY_OFF", "NIGHT_OFF", "AFTERNOON_OFF",
            "LEAVE", "SICK_LEAVE", "REST",
        }
        today = date_type.today()
        shift = (
            Shift.objects.filter(
                staff_resource=resource,
                shift_date=today,
                status="SCHEDULED",
            )
            .exclude(shift_type__in=non_working_types)
            .order_by("start_time")
            .first()
        )

        if not shift:
            return Response(
                {"error": "No scheduled shift found for today", "code": "no_shift"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Reuse clock-in logic but with QR method
        try:
            shift.start_shift(method="QR_CODE")
        except ValueError as e:
            return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)

        serializer = ShiftSerializer(shift)
        return Response(serializer.data)

    @action(detail=False, methods=["get"], url_path="qr-token")
    def qr_token(self, request):
        """
        Generate a rotating QR token for the current facility.

        Returns a token that rotates every hour. Display as QR code
        at the facility entrance for staff to scan.

        Only accessible to users with manage_schedules permission.
        """
        import hashlib

        from django.conf import settings as django_settings

        if not request.user.has_perm("scheduling.manage_schedules"):
            return Response(
                {"error": "Permission denied"},
                status=status.HTTP_403_FORBIDDEN,
            )

        self._resolve_tenant_context()
        facility = getattr(request, "facility", None)
        if not facility:
            return Response(
                {"error": "No facility context available"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        now = timezone.now()
        secret = getattr(django_settings, "SECRET_KEY", "vitora")
        token_hash = hashlib.sha256(
            f"{facility.id}:{now.strftime('%Y-%m-%d:%H')}:{secret}".encode()
        ).hexdigest()[:16]

        qr_token = f"{facility.id}:{token_hash}"
        # Valid until the end of current hour
        valid_until = now.replace(minute=59, second=59, microsecond=0)

        return Response({
            "qr_token": qr_token,
            "facility_id": facility.id,
            "facility_name": str(facility),
            "valid_until": valid_until.isoformat(),
            "generated_at": now.isoformat(),
        })


# =============================================================================
# Scheduling Settings & Staff Constraints
# =============================================================================


class SchedulingSettingsViewSet(TenantScopedViewMixin, viewsets.ModelViewSet):
    """
    ViewSet for per-facility scheduling settings.

    GET    /api/scheduling/settings/       → list (returns 1 settings object or empty)
    POST   /api/scheduling/settings/       → create settings for the facility
    GET    /api/scheduling/settings/{id}/  → retrieve
    PATCH  /api/scheduling/settings/{id}/  → update
    GET    /api/scheduling/settings/current/ → get-or-create current facility settings
    """

    from hmis.apps.scheduling.models import SchedulingSettings

    queryset = SchedulingSettings.objects.all()
    serializer_class = SchedulingSettingsSerializer
    permission_classes = [permissions.IsAuthenticated]
    tenant_scope = "facility"

    def perform_create(self, serializer):
        serializer.save(**self.get_tenant_save_kwargs())

    @action(detail=False, methods=["get"], url_path="current")
    def current(self, request):
        """Get or create the scheduling settings for the current facility."""
        from hmis.apps.scheduling.models import SchedulingSettings

        self._resolve_tenant_context()
        facility = getattr(request, "facility", None)
        if not facility:
            return Response(
                {"error": "No facility context available"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        settings_obj, _created = SchedulingSettings.objects.get_or_create(
            facility=facility,
            defaults={"organization": getattr(facility, "organization", None)},
        )
        serializer = self.get_serializer(settings_obj)
        return Response(serializer.data)


class StaffConstraintViewSet(TenantScopedViewMixin, viewsets.ModelViewSet):
    """
    CRUD for staff scheduling constraints.

    GET    /api/scheduling/constraints/               → list constraints
    POST   /api/scheduling/constraints/               → create constraint
    GET    /api/scheduling/constraints/{id}/          → retrieve
    PATCH  /api/scheduling/constraints/{id}/          → update
    DELETE /api/scheduling/constraints/{id}/          → delete
    GET    /api/scheduling/constraints/?staff_resource=1  → filter by staff
    """

    from hmis.apps.scheduling.models import StaffConstraint

    queryset = StaffConstraint.objects.select_related("staff_resource").all()
    serializer_class = StaffConstraintSerializer
    permission_classes = [permissions.IsAuthenticated]
    tenant_scope = "facility"

    def get_queryset(self):
        qs = super().get_queryset()
        staff_resource = self.request.query_params.get("staff_resource")
        if staff_resource:
            qs = qs.filter(staff_resource_id=staff_resource)
        is_active = self.request.query_params.get("is_active")
        if is_active is not None:
            qs = qs.filter(is_active=is_active.lower() in ("true", "1"))
        return qs

    def perform_create(self, serializer):
        serializer.save(**self.get_tenant_save_kwargs())
