# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
# ruff: noqa: ARG002, F401
"""Scheduling views resources appointments for Vitora HMIS.

What this file is for:
- Implement views resources appointments logic for the scheduling domain.

How to use it:
- Import classes and functions from this module in Django app code and tests.

Supported inputs/args:
- Python imports and Django ORM/runtime inputs; no standalone CLI arguments.
"""

import logging
from datetime import datetime, timedelta

from django.db import models
from django.utils import timezone
from django_filters import rest_framework as filters
from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import extend_schema, inline_serializer
from rest_framework import permissions, serializers, status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from hmis.apps.core.mixins import (
    NestedTenantScopeMixin,
    ReadOnCreateMixin,
    TenantScopedViewMixin,
    resolve_request_tenant,
)
from hmis.apps.core.models import AuditLog
from hmis.apps.core.permissions import ReadRequiresModelPermission
from hmis.apps.scheduling.models import (
    Appointment,
    AssignmentDecision,
    AssignmentOverride,
    AssignmentRule,
    Resource,
    Schedule,
    Shift,
    ShiftSwapRequest,
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
    ShiftSwapAcceptSerializer,
    ShiftSwapApproveSerializer,
    ShiftSwapCreateSerializer,
    ShiftSwapRejectSerializer,
    ShiftSwapRequestListSerializer,
    ShiftSwapRequestSerializer,
    ShiftTypeConfigSerializer,
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

logger = logging.getLogger(__name__)


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
        fields = [
            "resource_type",
            "is_active",
            "code",
            "name",
            "department",
            "exclude_clinic_resources",
        ]


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
    permission_classes = [permissions.IsAuthenticated, ReadRequiresModelPermission]
    filterset_class = ResourceFilter
    tenant_scope = "facility"

    def get_serializer_class(self):
        """Get appropriate serializer class."""
        if self.action == "list":
            return ResourceListSerializer
        return ResourceSerializer

    def destroy(self, request, *args, **kwargs):
        """Soft delete resource by setting is_active=False."""
        if not request.user.has_perm("scheduling.delete_resource"):
            return Response(
                {"detail": "You do not have permission to delete this resource."},
                status=status.HTTP_403_FORBIDDEN,
            )

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
        staff_without_resource = (
            StaffProfile.objects.filter(
                employment_status="ACTIVE",
                primary_facility=facility,
            )
            .exclude(
                scheduling_resources__facility=facility,
            )
            .select_related("user")
        )

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
                    "department": (
                        str(profile.primary_department) if profile.primary_department else ""
                    ),
                    "synced_from_staff": True,
                },
            )
            created_count += 1

        return Response(
            {
                "created": created_count,
                "message": f"Created {created_count} resource(s) from staff profiles",
            }
        )

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

        return Response(
            {
                "created": created_count,
                "message": f"Created {created_count} resource(s) from clinics",
            }
        )

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

        return Response(
            {
                "created": created_count,
                "message": f"Created {created_count} resource(s) from wards",
            }
        )

    @action(detail=False, methods=["post"], url_path="sync-from-equipment")
    def sync_from_equipment(self, request):
        """
        Auto-create ASSET resources from ColdChainEquipment that don't have one yet.

        Only creates resources for operational equipment at the current facility.
        Returns the count of newly created resources.
        """
        from hmis.apps.immunizations.models import ColdChainEquipment

        facility = self._get_facility(request)
        if not facility:
            return Response(
                {"error": "No facility context available"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        equipment_without_resource = ColdChainEquipment.objects.filter(
            status="OPERATIONAL",
            facility=facility,
            scheduling_resource__isnull=True,
        )

        created_count = 0
        for equipment in equipment_without_resource:
            code = f"EQUIP-{equipment.serial_number}"
            if Resource.objects.filter(code=code, facility=facility).exists():
                code = f"EQUIP-{equipment.pk}"

            resource = Resource.objects.create(
                name=equipment.name,
                resource_type="ASSET",
                code=code,
                is_active=True,
                description=equipment.location or "",
                facility=facility,
                organization=facility.organization,
                metadata={
                    "synced_from": "cold_chain_equipment",
                    "equipment_type": equipment.equipment_type,
                    "serial_number": equipment.serial_number,
                    "model_number": equipment.model_number or "",
                    "manufacturer": equipment.manufacturer or "",
                    "location": equipment.location or "",
                },
            )
            equipment.scheduling_resource = resource
            equipment.save(update_fields=["scheduling_resource"])
            created_count += 1

        return Response(
            {
                "created": created_count,
                "message": f"Created {created_count} resource(s) from equipment",
            }
        )

    @action(detail=False, methods=["post"], url_path="sync-from-theatre-equipment")
    def sync_from_theatre_equipment(self, request):
        """
        Auto-create ASSET resources from TheatreEquipmentType catalog entries.

        Creates one ASSET resource per active equipment type that doesn't yet
        have a linked Resource at the current facility.
        """
        from hmis.apps.theatre.models import TheatreEquipmentType

        facility = self._get_facility(request)
        if not facility:
            return Response(
                {"error": "No facility context available"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        types_without_resource = TheatreEquipmentType.objects.filter(
            is_active=True,
            facility=facility,
        ).exclude(
            pk__in=Resource.objects.filter(
                equipment_type__isnull=False,
                facility=facility,
            ).values_list("equipment_type_id", flat=True)
        )

        created_count = 0
        for eq_type in types_without_resource:
            code = f"THEATRE-EQ-{eq_type.code}"
            if Resource.objects.filter(code=code, facility=facility).exists():
                code = f"THEATRE-EQ-{eq_type.pk}"

            Resource.objects.create(
                name=eq_type.name,
                resource_type="ASSET",
                code=code,
                is_active=True,
                capacity=1,
                description=eq_type.description or "",
                equipment_type=eq_type,
                facility=facility,
                organization=facility.organization,
                metadata={
                    "synced_from": "theatre_equipment_type",
                    "source_code": eq_type.code,
                    "category": eq_type.category,
                    "is_portable": eq_type.is_portable,
                },
            )
            created_count += 1

        return Response(
            {
                "created": created_count,
                "message": f"Created {created_count} resource(s) from theatre equipment types",
            }
        )


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
    permission_classes = [permissions.IsAuthenticated, ReadRequiresModelPermission]
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
    permission_classes = [permissions.IsAuthenticated, ReadRequiresModelPermission]
    filterset_class = AppointmentFilter
    tenant_scope = "facility"

    def get_queryset(self):
        """
        Scope appointments to tenant, including legacy rows missing facility FK.

        Older integrations created appointments with ``facility=NULL`` but with
        a tenant-scoped resource. Keep these visible by inheriting scope from
        ``resource.facility`` / ``resource.organization``.
        """
        self._resolve_tenant_context()
        qs = Appointment.objects.select_related(
            "patient", "resource", "created_by", "confirmed_by", "cancelled_by"
        )
        request_facility = getattr(self.request, "facility", None)
        request_organization = getattr(self.request, "organization", None)
        request_user = getattr(self.request, "user", None)

        if request_facility:
            return qs.filter(
                models.Q(facility=request_facility)
                | models.Q(facility__isnull=True, resource__facility=request_facility)
            ).distinct()

        if request_organization:
            return qs.filter(
                models.Q(organization=request_organization)
                | models.Q(
                    organization__isnull=True,
                    resource__organization=request_organization,
                )
            ).distinct()

        if request_user and getattr(request_user, "is_superuser", False):
            return qs

        return qs.none()

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
