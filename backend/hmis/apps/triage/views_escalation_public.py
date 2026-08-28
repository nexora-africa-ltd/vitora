# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
# ruff: noqa
"""Triage views escalation public for Vitora HMIS.

What this file is for:
- Implement views escalation public logic for the triage domain.

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


class WaitTimeBreachViewSet(NestedTenantScopeMixin, viewsets.ReadOnlyModelViewSet):
    """
    ViewSet for wait time breach alerts.

    Read-only listing with acknowledge and resolve actions.
    """

    tenant_facility_chain = "triage_assessment__facility"
    tenant_org_chain = "triage_assessment__organization"

    queryset = WaitTimeBreach.objects.all().select_related(
        "queue_entry", "triage_assessment", "patient", "acknowledged_by"
    )
    serializer_class = WaitTimeBreachSerializer
    permission_classes = [IsAuthenticated, ReadRequiresModelPermission, WriteRequiresRolePermission]
    filter_backends = [DjangoFilterBackend, filters.OrderingFilter]
    filterset_fields = ["status", "severity", "triage_category", "assigned_area"]
    ordering_fields = ["created_at", "severity", "actual_wait_minutes"]
    ordering = ["-created_at"]

    def get_queryset(self):
        """Optionally filter to active-only breaches."""
        queryset = super().get_queryset()
        active_only = self.request.query_params.get("active_only", "").lower()
        if active_only in ("true", "1", "yes"):
            queryset = queryset.filter(status__in=["ACTIVE", "ACKNOWLEDGED", "ESCALATED"])
        return queryset

    @extend_schema(
        request=WaitTimeBreachAcknowledgeSerializer,
        responses={200: WaitTimeBreachSerializer},
        description="Acknowledge a wait time breach alert.",
    )
    @action(detail=True, methods=["post"], url_path="acknowledge")
    def acknowledge(self, request, pk=None):
        """Acknowledge a wait time breach."""
        breach = self.get_object()
        if breach.status not in ["ACTIVE"]:
            return Response(
                {"error": f"Cannot acknowledge breach in status '{breach.status}'."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        serializer = WaitTimeBreachAcknowledgeSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        breach.acknowledge(request.user, notes=serializer.validated_data.get("notes", ""))
        return Response(WaitTimeBreachSerializer(breach).data)

    @action(detail=True, methods=["post"], url_path="resolve")
    def resolve(self, request, pk=None):
        """Resolve a wait time breach."""
        breach = self.get_object()
        if breach.status == "RESOLVED":
            return Response(
                {"error": "Breach is already resolved."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        breach.resolve()
        return Response(WaitTimeBreachSerializer(breach).data)

    @extend_schema(
        responses={200: OpenApiTypes.OBJECT},
        description="Get summary of active wait time breaches.",
    )
    @action(detail=False, methods=["get"], url_path="summary")
    def summary(self, request):
        """Get breach summary (counts by severity and status)."""
        active = WaitTimeBreach.objects.filter(status__in=["ACTIVE", "ACKNOWLEDGED", "ESCALATED"])
        by_severity = active.values("severity").annotate(count=Count("id")).order_by("severity")
        by_category = (
            active.values("triage_category").annotate(count=Count("id")).order_by("triage_category")
        )
        return Response(
            {
                "total_active": active.count(),
                "by_severity": {item["severity"]: item["count"] for item in by_severity},
                "by_category": {item["triage_category"]: item["count"] for item in by_category},
            }
        )


class EscalationViewSet(NestedTenantScopeMixin, viewsets.ReadOnlyModelViewSet):
    """
    ViewSet for escalation records.

    Read-only listing with resolve and dismiss actions.
    """

    tenant_facility_chain = "triage_assessment__facility"
    tenant_org_chain = "triage_assessment__organization"

    queryset = Escalation.objects.all().select_related(
        "queue_entry",
        "triage_assessment",
        "patient",
        "escalated_by",
        "resolved_by",
    )
    serializer_class = EscalationSerializer
    permission_classes = [IsAuthenticated, ReadRequiresModelPermission, WriteRequiresRolePermission]
    filter_backends = [DjangoFilterBackend, filters.OrderingFilter]
    filterset_fields = ["status", "escalation_type", "triage_category", "assigned_area"]
    ordering_fields = ["created_at", "escalation_type"]
    ordering = ["-created_at"]

    def get_queryset(self):
        """Optionally filter to active-only escalations."""
        queryset = super().get_queryset()
        active_only = self.request.query_params.get("active_only", "").lower()
        if active_only in ("true", "1", "yes"):
            queryset = queryset.filter(status__in=["PENDING", "IN_PROGRESS"])
        return queryset

    @extend_schema(
        request=EscalationResolveSerializer,
        responses={200: EscalationSerializer},
        description="Resolve an escalation.",
    )
    @action(detail=True, methods=["post"], url_path="resolve")
    def resolve(self, request, pk=None):
        """Resolve an escalation."""
        escalation = self.get_object()
        if escalation.status in ["RESOLVED", "DISMISSED"]:
            return Response(
                {"error": f"Escalation already '{escalation.status}'."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        serializer = EscalationResolveSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        escalation.resolve(
            user=request.user,
            notes=serializer.validated_data.get("resolution_notes", ""),
        )

        AuditLog.log(
            action="escalation_resolved",
            user=request.user,
            resource_type="Escalation",
            resource_id=escalation.id,
            ip_address=get_client_ip(request),
            details={
                "escalation_type": escalation.escalation_type,
                "patient_mrn": escalation.patient.mrn,
                "resolution_notes": escalation.resolution_notes,
            },
        )

        return Response(EscalationSerializer(escalation).data)

    @extend_schema(
        request=EscalationResolveSerializer,
        responses={200: EscalationSerializer},
        description="Dismiss an escalation.",
    )
    @action(detail=True, methods=["post"], url_path="dismiss")
    def dismiss(self, request, pk=None):
        """Dismiss an escalation."""
        escalation = self.get_object()
        if escalation.status in ["RESOLVED", "DISMISSED"]:
            return Response(
                {"error": f"Escalation already '{escalation.status}'."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        serializer = EscalationResolveSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        escalation.dismiss(
            user=request.user,
            notes=serializer.validated_data.get("resolution_notes", ""),
        )
        return Response(EscalationSerializer(escalation).data)


# =============================================================================
# Public Triage Queue (no auth — for TV/tablet display)
# =============================================================================


class PublicTriageQueueView(viewsets.ViewSet):
    """
    Public, unauthenticated triage queue display for TV/tablet screens.

    Returns only non-PII fields: position number, status, room name, check-in time.
    No patient names, MRNs, or any identifying information.

    GET /api/triage/public-queue/?facility_id={id}
    """

    permission_classes = [AllowAny]
    authentication_classes = []

    @extend_schema(
        parameters=[
            OpenApiParameter("facility_id", OpenApiTypes.INT, required=True),
        ],
        responses={
            200: inline_serializer(
                name="PublicTriageQueueResponse",
                fields={
                    "facility_name": serializers.CharField(),
                    "date": serializers.DateField(),
                    "updated_at": serializers.DateTimeField(),
                    "total_waiting": serializers.IntegerField(),
                    "queue": serializers.ListField(
                        child=inline_serializer(
                            name="PublicTriageQueueItem",
                            fields={
                                "position": serializers.IntegerField(),
                                "status": serializers.CharField(),
                                "room_name": serializers.CharField(allow_null=True),
                                "check_in_time": serializers.DateTimeField(),
                                "priority_hint": serializers.CharField(allow_null=True),
                            },
                        )
                    ),
                },
            )
        },
    )
    def list(self, request):
        """Get today's triage waiting queue for the specified facility."""
        from datetime import date as date_type

        from hmis.apps.core.models import Facility

        facility_id = request.query_params.get("facility_id")
        if not facility_id:
            return Response(
                {"error": "facility_id query parameter is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            facility = Facility.objects.get(pk=facility_id)
        except Facility.DoesNotExist:
            return Response(
                {"error": "Facility not found."},
                status=status.HTTP_404_NOT_FOUND,
            )

        today = date_type.today()

        entries = (
            WaitingQueue.objects.filter(
                encounter__facility=facility,
                status__in=["WAITING_TRIAGE", "IN_TRIAGE"],
                check_in_time__date=today,
            )
            .select_related("triage_room")
            .order_by("check_in_time")
        )

        queue = []
        for position, entry in enumerate(entries, start=1):
            queue.append(
                {
                    "position": position,
                    "status": entry.status,
                    "room_name": entry.triage_room.name if entry.triage_room else None,
                    "check_in_time": entry.check_in_time.isoformat(),
                    "priority_hint": entry.priority_hint or None,
                }
            )

        return Response(
            {
                "facility_name": facility.name,
                "date": str(today),
                "updated_at": timezone.now().isoformat(),
                "total_waiting": len(queue),
                "queue": queue,
            }
        )
