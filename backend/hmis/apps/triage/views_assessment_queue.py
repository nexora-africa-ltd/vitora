# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
# ruff: noqa: ARG002, F401, F811, SIM105
"""Triage views assessment queue for Vitora HMIS.

What this file is for:
- Implement views assessment queue logic for the triage domain.

How to use it:
- Import classes and functions from this module in Django app code and tests.

Supported inputs/args:
- Python imports and Django ORM/runtime inputs; no standalone CLI arguments.
"""

import logging

from django.db.models import Count, Q
from django.utils import timezone
from django_filters.rest_framework import DjangoFilterBackend
from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import OpenApiParameter, extend_schema, inline_serializer
from rest_framework import filters, serializers, status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import AllowAny, BasePermission, IsAdminUser, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from hmis.apps.core.mixins import (
    NestedTenantScopeMixin,
    ReadOnCreateMixin,
    TenantScopedViewMixin,
    resolve_request_tenant,
)
from hmis.apps.core.models import AuditLog
from hmis.apps.core.permissions import (
    ReadRequiresModelPermission,
    RequiresActiveShiftPermission,
    WriteRequiresRolePermission,
    get_client_ip,
)

from .models import (
    ERBed,
    Escalation,
    TriageAssessment,
    TriageQueue,
    TriageSettings,
    TriageVitalThreshold,
    WaitingQueue,
    WaitTimeBreach,
)
from .serializers import (
    ERBedAssignPatientSerializer,
    ERBedBoardSummarySerializer,
    ERBedCreateSerializer,
    ERBedListSerializer,
    ERBedReleaseSerializer,
    ERBedSerializer,
    ERBedUpdateStatusSerializer,
    EscalationCreateSerializer,
    EscalationResolveSerializer,
    EscalationSerializer,
    TriageAssessmentCreateSerializer,
    TriageAssessmentSerializer,
    TriageCategoryCalculationSerializer,
    TriageQueueSerializer,
    TriageSettingsSerializer,
    TriageVitalThresholdSerializer,
    WaitingQueueCreateSerializer,
    WaitingQueueSerializer,
    WaitTimeBreachAcknowledgeSerializer,
    WaitTimeBreachSerializer,
)

logger = logging.getLogger(__name__)


def _broadcast_bed_update(bed: ERBed, action_name: str) -> None:
    """Broadcast bed status change to emergency WebSocket clients (fire-and-forget)."""
    try:
        import asyncio

        from channels.layers import get_channel_layer

        channel_layer = get_channel_layer()
        if channel_layer is None:
            return

        bed_data = ERBedSerializer(bed).data

        message = {
            "type": "emergency.bed.update",
            "event_type": "bed_update",
            "data": {
                "action": action_name,
                "bed": bed_data,
            },
        }

        # Fire-and-forget async send from synchronous context
        loop = None
        try:
            loop = asyncio.get_running_loop()
        except RuntimeError:
            pass

        if loop and loop.is_running():
            asyncio.ensure_future(channel_layer.group_send("emergency_queue", message))
        else:
            new_loop = asyncio.new_event_loop()
            try:
                new_loop.run_until_complete(channel_layer.group_send("emergency_queue", message))
            finally:
                new_loop.close()
    except (
        AttributeError,
        TypeError,
        ValueError,
        RuntimeError,
        OSError,
        AssertionError,
        ImportError,
    ):
        # Never let broadcast failures break the HTTP response
        logger.exception("Failed to broadcast bed update")


def _broadcast_escalation(escalation: Escalation) -> None:
    """Broadcast escalation event to emergency WebSocket clients (fire-and-forget)."""
    try:
        import asyncio

        from channels.layers import get_channel_layer

        channel_layer = get_channel_layer()
        if channel_layer is None:
            return

        message = {
            "type": "emergency.escalation.event",
            "event_type": "escalation_event",
            "data": {
                "escalation": EscalationSerializer(escalation).data,
                "timestamp": timezone.now().isoformat(),
            },
        }

        loop = None
        try:
            loop = asyncio.get_running_loop()
        except RuntimeError:
            pass

        if loop and loop.is_running():
            asyncio.ensure_future(channel_layer.group_send("emergency_queue", message))
        else:
            new_loop = asyncio.new_event_loop()
            try:
                new_loop.run_until_complete(channel_layer.group_send("emergency_queue", message))
            finally:
                new_loop.close()
    except (
        AttributeError,
        TypeError,
        ValueError,
        RuntimeError,
        OSError,
        AssertionError,
        ImportError,
    ):
        logger.exception("Failed to broadcast escalation event")


class HasPerformTriagePermission(BasePermission):
    """Permission class for perform_triage permission."""

    def has_permission(self, request, view):
        if request.method in ["POST", "PUT", "PATCH"]:
            return request.user.has_perm("triage.perform_triage")
        return True


class HasViewQueuePermission(BasePermission):
    """Permission class for view_triage_queue permission."""

    def has_permission(self, request, view):
        return request.user.has_perm("triage.view_triage_queue")


class TriageAssessmentViewSet(TenantScopedViewMixin, viewsets.ModelViewSet):
    """
    ViewSet for TriageAssessment model.

    Provides CRUD operations with:
    - Auto-calculation of triage category
    - Alert generation
    - Queue integration
    - Audit logging
    """

    tenant_scope = "facility"  # Triage is facility-scoped

    queryset = TriageAssessment.objects.all().select_related(
        "encounter__patient", "triaged_by", "assigned_clinician", "assigned_clinic"
    )
    permission_classes = [
        IsAuthenticated,
        ReadRequiresModelPermission,
        RequiresActiveShiftPermission,
    ]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ["triage_category", "assigned_area", "mental_status", "encounter"]
    search_fields = [
        "chief_complaint",
        "encounter__patient__mrn",
        "encounter__patient__first_name",
        "encounter__patient__last_name",
    ]
    ordering_fields = ["arrival_time", "triage_start_time", "triage_category"]
    ordering = ["-arrival_time"]

    def get_serializer_class(self):
        """Use different serializers for create vs read."""
        if self.action == "create":
            return TriageAssessmentCreateSerializer
        return TriageAssessmentSerializer

    def get_permissions(self):
        """Add perform_triage permission for create/update/delete."""
        permissions = super().get_permissions()

        if self.action in ["create", "update", "partial_update"]:
            permissions.append(HasPerformTriagePermission())
        elif self.action == "destroy":
            permissions.append(IsAdminUser())

        return permissions

    def create(self, request, *args, **kwargs):
        """Create triage assessment with audit logging.

        Also updates the WaitingQueue entry to mark triage as complete.
        """
        # Use create serializer for validation and creation
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        instance = serializer.save(**self.get_tenant_save_kwargs())

        # Update the WaitingQueue entry for this encounter to mark as triaged
        encounter_id = instance.encounter_id
        WaitingQueue.objects.filter(
            encounter_id=encounter_id, status__in=["WAITING_TRIAGE", "IN_TRIAGE"]
        ).update(status="TRIAGED")

        # Use read serializer for response
        read_serializer = TriageAssessmentSerializer(instance, context={"request": request})
        headers = self.get_success_headers(read_serializer.data)

        # Log the creation
        if "id" in read_serializer.data:
            AuditLog.log(
                action="triage_create",
                user=request.user,
                resource_type="TriageAssessment",
                resource_id=read_serializer.data["id"],
                ip_address=get_client_ip(request),
                user_agent=request.META.get("HTTP_USER_AGENT", ""),
                details={
                    "category": read_serializer.data.get("triage_category"),
                    "auto_calculated": read_serializer.data.get("auto_calculated_category"),
                },
            )

        return Response(read_serializer.data, status=status.HTTP_201_CREATED, headers=headers)

    def update(self, request, *args, **kwargs):
        """Update triage assessment with audit logging for overrides."""
        instance = self.get_object()
        original_category = instance.triage_category

        response = super().update(request, *args, **kwargs)

        if response.status_code == status.HTTP_200_OK:
            new_category = response.data.get("triage_category")

            # Log if category was overridden
            if original_category != new_category:
                AuditLog.log(
                    action="triage_category_override",
                    user=request.user,
                    resource_type="TriageAssessment",
                    resource_id=instance.id,
                    ip_address=get_client_ip(request),
                    user_agent=request.META.get("HTTP_USER_AGENT", ""),
                    details={
                        "original_category": original_category,
                        "new_category": new_category,
                        "override_reason": response.data.get("category_override_reason"),
                    },
                )

        return response

    @action(detail=False, methods=["post"], url_path="calculate-category")
    def calculate_category(self, request):
        """
        Calculate triage category without creating assessment.

        Used for decision support and "what-if" scenarios.
        """
        import logging

        logger = logging.getLogger(__name__)

        serializer = TriageCategoryCalculationSerializer(data=request.data)

        if serializer.is_valid():
            try:
                result = serializer.calculate_category()
                return Response(result, status=status.HTTP_200_OK)
            except (
                AttributeError,
                TypeError,
                ValueError,
                RuntimeError,
                OSError,
                AssertionError,
                ImportError,
            ):
                logger.exception("Error calculating triage category")
                return Response(
                    {"detail": "Error calculating triage category. Please try again."},
                    status=status.HTTP_500_INTERNAL_SERVER_ERROR,
                )

        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=True, methods=["post"], url_path="complete")
    def complete_triage(self, request, pk=None):
        """
        Complete a triage assessment.

        Sets triage_end_time to now and marks the triage as complete.
        This is important for reporting on triage duration metrics.
        """
        from django.utils import timezone

        instance = self.get_object()

        # Check if already completed
        if instance.triage_end_time:
            return Response(
                {"detail": "Triage assessment already completed."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Set end time
        instance.triage_end_time = timezone.now()
        instance.save(update_fields=["triage_end_time"])

        # Log the completion
        AuditLog.log(
            action="triage_complete",
            user=request.user,
            resource_type="TriageAssessment",
            resource_id=instance.id,
            ip_address=get_client_ip(request),
            user_agent=request.META.get("HTTP_USER_AGENT", ""),
            details={
                "category": instance.triage_category,
                "duration_seconds": (
                    (instance.triage_end_time - instance.triage_start_time).total_seconds()
                    if instance.triage_start_time
                    else None
                ),
            },
        )

        # Return updated assessment
        serializer = TriageAssessmentSerializer(instance, context={"request": request})
        return Response(serializer.data, status=status.HTTP_200_OK)

    @action(detail=True, methods=["post"], url_path="route-to-clinic")
    def route_to_clinic(self, request, pk=None):
        """
        Route patient from triage to a specific clinic.

        Creates a ClinicVisit in the target clinic's queue with appropriate
        priority based on triage category.

        Request body:
            clinic_id (required): ID of the target clinic
            notes (optional): Routing notes

        Returns:
            201: ClinicVisit created successfully
            400: Invalid request (missing clinic_id, clinic not active, etc.)
        """
        from hmis.apps.clinics.models import Clinic
        from hmis.apps.clinics.serializers import ClinicVisitSerializer

        instance = self.get_object()

        # Validate clinic_id is provided
        clinic_id = request.data.get("clinic_id")
        if not clinic_id:
            return Response(
                {"clinic_id": "This field is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Get clinic
        try:
            clinic = Clinic.objects.get(id=clinic_id)
        except Clinic.DoesNotExist:
            return Response(
                {"clinic_id": "Clinic not found."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Route to clinic
        try:
            notes = request.data.get("notes", "")
            visit = instance.route_to_clinic(
                clinic=clinic,
                user=request.user,
                notes=notes,
            )
        except ValueError as e:
            return Response(
                {"detail": str(e)},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Log the routing
        AuditLog.log(
            action="triage_route_to_clinic",
            user=request.user,
            resource_type="TriageAssessment",
            resource_id=instance.id,
            ip_address=get_client_ip(request),
            user_agent=request.META.get("HTTP_USER_AGENT", ""),
            details={
                "clinic_id": clinic.id,
                "clinic_name": clinic.name,
                "clinic_visit_id": visit.id,
                "queue_number": visit.queue_number,
                "notes": notes,
            },
        )

        # Return created visit
        visit_serializer = ClinicVisitSerializer(visit, context={"request": request})
        return Response(visit_serializer.data, status=status.HTTP_201_CREATED)


class WaitingQueueViewSet(NestedTenantScopeMixin, viewsets.ModelViewSet):
    """
    ViewSet for waiting queue (patients awaiting triage).

    This is the entry point for patients who have registered/checked in
    and are waiting to be triaged. Once triaged, they move to the
    priority-based TriageQueue.

    Uses NestedTenantScopeMixin because WaitingQueue has no direct
    facility FK — scoped through encounter__facility.
    """

    tenant_facility_chain = "encounter__facility"
    tenant_org_chain = "encounter__organization"

    queryset = WaitingQueue.objects.all().select_related(
        "patient", "encounter", "checked_in_by", "triage_room"
    )
    permission_classes = [IsAuthenticated, ReadRequiresModelPermission, WriteRequiresRolePermission]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ["status", "priority_hint"]
    search_fields = [
        "patient__mrn",
        "patient__first_name",
        "patient__last_name",
        "reason_for_visit",
    ]
    ordering_fields = ["check_in_time", "status"]
    ordering = ["check_in_time"]

    def get_serializer_class(self):
        if self.action == "create":
            return WaitingQueueCreateSerializer
        return WaitingQueueSerializer

    def get_queryset(self):
        """Return waiting patients, scoped to the active facility via encounter."""
        queryset = super().get_queryset()

        # By default, show only patients waiting for triage
        show_all = self.request.query_params.get("show_all", "false").lower() == "true"
        if not show_all:
            queryset = queryset.filter(status__in=["WAITING_TRIAGE", "IN_TRIAGE"])

        return queryset

    def create(self, request, *args, **kwargs):
        """Check in a patient (add to waiting queue)."""
        self._resolve_tenant_context()
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        instance = serializer.save()

        # Log the check-in
        AuditLog.log(
            action="patient_check_in",
            user=request.user,
            resource_type="WaitingQueue",
            resource_id=instance.id,
            ip_address=get_client_ip(request),
            user_agent=request.META.get("HTTP_USER_AGENT", ""),
            details={
                "patient_id": instance.patient_id,
                "patient_mrn": instance.patient.mrn,
                "reason": instance.reason_for_visit,
            },
        )

        read_serializer = WaitingQueueSerializer(instance)
        return Response(read_serializer.data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=["post"], url_path="start-triage")
    def start_triage(self, request, pk=None):
        """Mark patient as currently being triaged."""
        entry = self.get_object()
        entry.start_triage()
        serializer = WaitingQueueSerializer(entry)
        return Response(serializer.data)

    @action(detail=True, methods=["post"], url_path="cancel")
    def cancel_entry(self, request, pk=None):
        """Remove patient from waiting queue."""
        entry = self.get_object()
        reason = request.data.get("reason", "")
        entry.cancel(reason)
        serializer = WaitingQueueSerializer(entry)
        return Response(serializer.data)

    @action(detail=True, methods=["post"], url_path="assign-room")
    def assign_room(self, request, pk=None):
        """Manually assign or reassign a triage room to a waiting patient."""
        entry = self.get_object()
        room_id = request.data.get("triage_room_id")

        if room_id is None:
            # Clear assignment
            entry.triage_room = None
            entry.save(update_fields=["triage_room", "updated_at"])
            return Response(WaitingQueueSerializer(entry).data)

        from hmis.apps.scheduling.models import Resource

        try:
            room = Resource.objects.get(pk=room_id, resource_type="PLACE", is_active=True)
        except Resource.DoesNotExist:
            return Response(
                {"error": "Triage room not found or is not an active PLACE resource."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        entry.triage_room = room
        entry.save(update_fields=["triage_room", "updated_at"])
        return Response(WaitingQueueSerializer(entry).data)

    @action(detail=False, methods=["get"], url_path="available-triage-rooms")
    def available_triage_rooms(self, request):
        """
        List triage rooms with occupancy info for the current facility.

        Returns PLACE resources in the triage department with:
        - current_load: number of active waiting queue entries in the room
        - has_active_staff: whether a clocked-in staff member is in the room
        """
        self._resolve_tenant_context()
        from datetime import date as date_cls

        from django.db.models import Count

        from hmis.apps.scheduling.models import Resource, Shift

        facility = getattr(request, "facility", None)
        if not facility:
            return Response([])

        try:
            settings = TriageSettings.objects.select_related("triage_department").get(
                facility=facility
            )
        except TriageSettings.DoesNotExist:
            return Response([])

        if not settings.triage_department_id:
            return Response([])

        rooms = (
            Resource.objects.filter(
                facility=facility,
                resource_type="PLACE",
                is_active=True,
                department=settings.triage_department,
            )
            .annotate(
                current_load=Count(
                    "triage_queue_entries",
                    filter=Q(
                        triage_queue_entries__status__in=["WAITING_TRIAGE", "IN_TRIAGE"],
                    ),
                )
            )
            .order_by("name")
        )

        today = date_cls.today()
        rooms_with_staff = set(
            Shift.objects.filter(
                room__in=rooms,
                shift_date=today,
                status__in=["ACTIVE", "ON_BREAK"],
            ).values_list("room_id", flat=True)
        )

        data = [
            {
                "id": room.pk,
                "name": room.name,
                "code": room.code,
                "capacity": room.capacity,
                "current_load": room.current_load,
                "has_active_staff": room.pk in rooms_with_staff,
                "is_available": room.current_load < room.capacity and room.pk in rooms_with_staff,
            }
            for room in rooms
        ]
        return Response(data)


class TriageSettingsViewSet(TenantScopedViewMixin, viewsets.ModelViewSet):
    """
    Per-facility triage settings (auto-routing toggle, triage department).

    GET  /api/triage/settings/          → list (returns 0 or 1 row for current facility)
    GET  /api/triage/settings/current/  → get-or-create for current facility
    PATCH /api/triage/settings/{id}/    → update settings
    """

    queryset = TriageSettings.objects.select_related("triage_department")
    serializer_class = TriageSettingsSerializer
    permission_classes = [IsAuthenticated, ReadRequiresModelPermission, WriteRequiresRolePermission]
    tenant_scope = "facility"
    http_method_names = ["get", "patch", "head", "options"]

    def partial_update(self, request, *args, **kwargs):
        """Override to re-serialize with a fresh read serializer.

        DRF's default partial_update caches serializer.data at validation
        time, which drops read-only source fields (e.g. triage_department_name)
        when the related object is null.  Re-querying avoids this.
        """
        super().partial_update(request, *args, **kwargs)
        instance = self.get_queryset().get(pk=kwargs["pk"])
        return Response(TriageSettingsSerializer(instance).data)

    @action(detail=False, methods=["get"], url_path="current")
    def current(self, request):
        """Get or create triage settings for the current facility."""
        self._resolve_tenant_context()
        facility = getattr(request, "facility", None)
        if not facility:
            return Response(
                {"error": "No facility context."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        settings_obj, _created = TriageSettings.objects.get_or_create(facility=facility)
        return Response(TriageSettingsSerializer(settings_obj).data)


class VitalThresholdsViewSet(viewsets.ModelViewSet):
    """
    ViewSet for vital thresholds.

    Full CRUD + reset/export/import for vital thresholds.
    Read access for all authenticated users, write access requires admin.
    """

    queryset = TriageVitalThreshold.objects.all()
    serializer_class = TriageVitalThresholdSerializer
    permission_classes = [IsAuthenticated, ReadRequiresModelPermission, WriteRequiresRolePermission]

    def get_queryset(self):
        """By default show only active thresholds; admins can see all."""
        queryset = super().get_queryset()
        show_inactive = self.request.query_params.get("show_inactive", "false").lower() == "true"
        if not show_inactive:
            queryset = queryset.filter(is_active=True)
        return queryset

    def get_permissions(self):
        """Require admin for write operations."""
        permissions = super().get_permissions()
        if self.action not in ["list", "retrieve"]:
            permissions.append(IsAdminUser())
        return permissions

    @action(detail=True, methods=["post"])
    def reset(self, request, pk=None):
        """Reset a single threshold to system defaults."""
        threshold = self.get_object()
        defaults = TriageVitalThreshold.get_defaults()
        vital_defaults = defaults.get(threshold.vital_type)
        if not vital_defaults:
            return Response(
                {"error": f"No defaults found for vital type '{threshold.vital_type}'."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        threshold.critical_low = vital_defaults.get("critical_low")
        threshold.warning_low = vital_defaults.get("warning_low")
        threshold.warning_high = vital_defaults.get("warning_high")
        threshold.critical_high = vital_defaults.get("critical_high")
        threshold.is_active = True
        threshold.save()
        return Response(TriageVitalThresholdSerializer(threshold).data)

    @action(detail=False, methods=["post"], url_path="reset-all")
    def reset_all(self, request):
        """Reset all thresholds to system defaults."""
        defaults = TriageVitalThreshold.get_defaults()
        for vital_type, values in defaults.items():
            threshold, _ = TriageVitalThreshold.objects.get_or_create(
                vital_type=vital_type,
                defaults={**values, "is_active": True},
            )
            if not _:
                threshold.critical_low = values.get("critical_low")
                threshold.warning_low = values.get("warning_low")
                threshold.warning_high = values.get("warning_high")
                threshold.critical_high = values.get("critical_high")
                threshold.is_active = True
                threshold.save()
        thresholds = TriageVitalThreshold.objects.filter(is_active=True)
        return Response(TriageVitalThresholdSerializer(thresholds, many=True).data)

    @action(detail=False, methods=["get"], url_path="export")
    def export_thresholds(self, request):
        """Export thresholds configuration as JSON."""

        thresholds = TriageVitalThreshold.objects.all()
        data = TriageVitalThresholdSerializer(thresholds, many=True).data

        response = Response(data, content_type="application/json")
        response["Content-Disposition"] = 'attachment; filename="vital-thresholds.json"'
        return response

    @action(detail=False, methods=["post"], url_path="import")
    def import_thresholds(self, request):
        """Import thresholds configuration from JSON."""
        import_data = request.data
        if not isinstance(import_data, list):
            return Response(
                {"error": "Expected a list of threshold objects."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        for item in import_data:
            vital_type = item.get("vital_type")
            if not vital_type:
                continue
            threshold, _ = TriageVitalThreshold.objects.get_or_create(
                vital_type=vital_type,
                defaults={"is_active": True},
            )
            threshold.critical_low = item.get("critical_low")
            threshold.warning_low = item.get("warning_low")
            threshold.warning_high = item.get("warning_high")
            threshold.critical_high = item.get("critical_high")
            threshold.is_active = item.get("is_active", True)
            threshold.save()

        thresholds = TriageVitalThreshold.objects.filter(is_active=True)
        return Response(TriageVitalThresholdSerializer(thresholds, many=True).data)


class TriageQueueViewSet(NestedTenantScopeMixin, viewsets.ReadOnlyModelViewSet):
    """
    ViewSet for triage queue.

    Provides queue display and management actions.
    """

    tenant_facility_chain = "triage_assessment__facility"
    tenant_org_chain = "triage_assessment__organization"

    queryset = TriageQueue.objects.all().select_related(
        "triage_assessment__encounter__patient", "triage_assessment__triaged_by", "called_by"
    )
    serializer_class = TriageQueueSerializer
    permission_classes = [IsAuthenticated, ReadRequiresModelPermission, WriteRequiresRolePermission]
    filter_backends = [DjangoFilterBackend]
    filterset_fields = ["status", "triage_assessment__assigned_area"]

    def get_permissions(self):
        """Require view_triage_queue permission."""
        permissions = super().get_permissions()
        permissions.append(HasViewQueuePermission())
        return permissions

    def get_queryset(self):
        """Return active queue entries sorted by priority, scoped by facility."""
        # Start from tenant-scoped base queryset
        queryset = (
            super().get_queryset().exclude(status__in=["COMPLETED", "LEFT_WITHOUT_BEING_SEEN"])
        )

        # Filter by area if provided
        area = self.request.query_params.get("area")
        if area:
            queryset = queryset.filter(triage_assessment__assigned_area=area)

        return queryset

    def list(self, request, *args, **kwargs):
        """Override list to apply priority sorting."""
        queryset = self.filter_queryset(self.get_queryset())

        # Convert to list and sort by priority
        queue_list = list(queryset)
        queue_list.sort(
            key=lambda x: (x.triage_assessment.category_priority, x.triage_assessment.arrival_time)
        )

        # Apply pagination manually
        page = self.paginate_queryset(queue_list)
        if page is not None:
            serializer = self.get_serializer(page, many=True)
            return self.get_paginated_response(serializer.data)

        serializer = self.get_serializer(queue_list, many=True)
        return Response(serializer.data)

    @action(detail=True, methods=["post"])
    def call(self, request, pk=None):
        """Mark patient as called."""
        queue_entry = self.get_object()
        queue_entry.mark_called(request.user)

        serializer = self.get_serializer(queue_entry)
        return Response(serializer.data)

    @action(detail=True, methods=["post"], url_path="with-clinician")
    def with_clinician(self, request, pk=None):
        """Mark patient as with clinician."""
        queue_entry = self.get_object()
        queue_entry.mark_with_clinician()

        serializer = self.get_serializer(queue_entry)
        return Response(serializer.data)

    @action(detail=True, methods=["post"])
    def complete(self, request, pk=None):
        """Mark queue entry as completed."""
        queue_entry = self.get_object()
        queue_entry.mark_completed()

        serializer = self.get_serializer(queue_entry)
        return Response(serializer.data)

    @action(detail=True, methods=["post"])
    def lwbs(self, request, pk=None):
        """Mark patient as Left Without Being Seen."""
        queue_entry = self.get_object()
        reason = request.data.get("reason", "")
        queue_entry.mark_lwbs(reason)

        serializer = self.get_serializer(queue_entry)
        return Response(serializer.data)

    @extend_schema(
        request=EscalationCreateSerializer,
        responses={201: EscalationSerializer},
        description="Escalate a patient's queue entry to charge nurse or request additional staff.",
    )
    @action(detail=True, methods=["post"], url_path="escalate")
    def escalate(self, request, pk=None):
        """
        Escalate a patient queue entry.

        Creates an Escalation record and logs the action for audit.
        Broadcasts an escalation event via WebSocket.
        """
        queue_entry = self.get_object()
        serializer = EscalationCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        assessment = queue_entry.triage_assessment
        patient = assessment.encounter.patient

        escalation = Escalation.objects.create(
            queue_entry=queue_entry,
            triage_assessment=assessment,
            patient=patient,
            escalation_type=serializer.validated_data["escalation_type"],
            reason=serializer.validated_data["reason"],
            wait_time_at_escalation=assessment.get_wait_time_minutes(),
            triage_category=assessment.triage_category,
            assigned_area=assessment.assigned_area or "",
            escalated_by=request.user,
        )

        # Audit log
        AuditLog.log(
            action="patient_escalation",
            user=request.user,
            resource_type="TriageQueue",
            resource_id=queue_entry.id,
            ip_address=get_client_ip(request),
            details={
                "escalation_id": escalation.id,
                "escalation_type": escalation.escalation_type,
                "reason": escalation.reason,
                "triage_category": escalation.triage_category,
                "patient_mrn": patient.mrn,
                "wait_time_minutes": escalation.wait_time_at_escalation,
            },
        )

        # Broadcast escalation via WebSocket
        _broadcast_escalation(escalation)

        return Response(
            EscalationSerializer(escalation).data,
            status=status.HTTP_201_CREATED,
        )

    @extend_schema(
        responses={200: OpenApiTypes.OBJECT},
        description="Get critical (RED) patients in the ER queue for emergency alerts.",
    )
    @action(detail=False, methods=["get"], url_path="critical")
    def critical(self, request):
        """
        Get critical (RED category) patients in the ER queue.

        Returns patients with RED triage category in ER areas for
        critical alert banner display on the emergency dashboard.
        """
        from django.utils import timezone

        # Get RED patients in ER areas
        er_areas = [
            "ER_RESUS",
            "ER_ACUTE",
            "TRAUMA",
            "ER_FAST_TRACK",
            "OBSERVATION",
            "PEDIATRIC_ER",
            "MATERNITY",
        ]

        queryset = (
            TriageQueue.objects.filter(
                triage_assessment__triage_category="RED",
                triage_assessment__assigned_area__in=er_areas,
                status__in=["WAITING", "CALLED"],
            )
            .select_related(
                "triage_assessment__encounter__patient",
            )
            .order_by("triage_assessment__arrival_time")
        )

        patients = []
        now = timezone.now()

        for entry in queryset:
            assessment = entry.triage_assessment
            patient = assessment.encounter.patient
            encounter = assessment.encounter
            wait_delta = now - assessment.arrival_time
            wait_minutes = int(wait_delta.total_seconds() / 60)

            patients.append(
                {
                    "id": assessment.id,  # Triage assessment ID for routing
                    "queue_id": entry.id,  # Queue entry ID
                    "encounter_id": encounter.id,
                    "encounter_status": encounter.status,
                    "patient_name": f"{patient.first_name} {patient.last_name}",
                    "mrn": patient.mrn,
                    "chief_complaint": assessment.chief_complaint or "",
                    "assigned_area": assessment.assigned_area,
                    "assigned_area_display": assessment.get_assigned_area_display(),
                    "wait_minutes": wait_minutes,
                    "arrival_time": assessment.arrival_time.isoformat(),
                    "status": entry.status,
                }
            )

        return Response(
            {
                "count": len(patients),
                "patients": patients,
            }
        )

    @extend_schema(
        responses={200: OpenApiTypes.OBJECT},
        description="Get summary stats for all ER zones.",
    )
    @action(detail=False, methods=["get"], url_path="zones-summary")
    def zones_summary(self, request):
        """
        Get summary statistics for each ER zone.

        Returns patient counts by category for each ER zone,
        used for the emergency department dashboard cards.
        """
        # ER zones with their configuration
        er_zones = [
            {"code": "ER_RESUS", "name": "Resuscitation", "capacity": 4, "default_category": "RED"},
            {
                "code": "ER_ACUTE",
                "name": "Acute Care",
                "capacity": 10,
                "default_category": "ORANGE",
            },
            {"code": "TRAUMA", "name": "Trauma Bay", "capacity": 2, "default_category": "RED"},
            {
                "code": "ER_FAST_TRACK",
                "name": "Fast Track",
                "capacity": 12,
                "default_category": "GREEN",
            },
            {
                "code": "OBSERVATION",
                "name": "Observation",
                "capacity": 8,
                "default_category": "YELLOW",
            },
            {
                "code": "PEDIATRIC_ER",
                "name": "Pediatric ER",
                "capacity": 6,
                "default_category": "ORANGE",
            },
            {"code": "MATERNITY", "name": "Maternity", "capacity": 4, "default_category": "ORANGE"},
        ]

        # Get counts by zone and category
        active_statuses = ["WAITING", "CALLED", "WITH_CLINICIAN"]

        zone_stats = []
        for zone in er_zones:
            # Get all patients in this zone
            zone_queryset = TriageQueue.objects.filter(
                triage_assessment__assigned_area=zone["code"],
                status__in=active_statuses,
            ).select_related("triage_assessment")

            # Count by category
            category_counts = {"RED": 0, "ORANGE": 0, "YELLOW": 0, "GREEN": 0, "BLUE": 0}
            for entry in zone_queryset:
                category = entry.triage_assessment.triage_category
                if category in category_counts:
                    category_counts[category] += 1

            total = sum(category_counts.values())

            # Determine primary category (highest severity with patients)
            primary_category = zone["default_category"]
            for cat in ["RED", "ORANGE", "YELLOW", "GREEN", "BLUE"]:
                if category_counts[cat] > 0:
                    primary_category = cat
                    break

            zone_stats.append(
                {
                    "code": zone["code"],
                    "name": zone["name"],
                    "capacity": zone["capacity"],
                    "total": total,
                    "primary_category": primary_category,
                    "by_category": category_counts,
                }
            )

        return Response(
            {
                "zones": zone_stats,
                "total_patients": sum(z["total"] for z in zone_stats),
            }
        )
