"""
What this file is for: inpatient shift-handover workflow viewset.
How to use: imported and re-exported by ``inpatient.views`` to preserve existing imports.
Supported inputs/args: DRF ViewSet payloads/query params defined by ShiftHandoverSerializer/actions.
"""

# ruff: noqa: ARG002

from django_filters.rest_framework import DjangoFilterBackend
from rest_framework import filters, status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from hmis.apps.core.mixins import NestedTenantScopeMixin
from hmis.apps.core.models import AuditLog
from hmis.apps.core.permissions import (
    ReadRequiresModelPermission,
    WriteRequiresRolePermission,
    get_client_ip,
)

from ..models import ShiftHandover
from ..serializers import ShiftHandoverSerializer


class ShiftHandoverViewSet(NestedTenantScopeMixin, viewsets.ModelViewSet):
    """ViewSet for ShiftHandover model."""

    tenant_facility_chain = "ward__facility"
    tenant_org_chain = "ward__organization"
    queryset = ShiftHandover.objects.all()
    serializer_class = ShiftHandoverSerializer
    permission_classes = [IsAuthenticated, WriteRequiresRolePermission, ReadRequiresModelPermission]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ["ward", "shift_date", "shift_ending", "outgoing_nurse", "incoming_nurse"]
    search_fields = ["ward__name", "general_notes"]
    ordering_fields = ["shift_date", "created_at"]
    ordering = ["-shift_date", "-created_at"]

    def perform_create(self, serializer):
        """Create shift handover and log action."""
        instance = serializer.save()

        AuditLog.log(
            action="shift_handover_create",
            user=self.request.user,
            resource_type="ShiftHandover",
            resource_id=instance.id,
            details={
                "ward": instance.ward.name,
                "shift_date": str(instance.shift_date),
                "shift_ending": instance.shift_ending,
                "total_patients": instance.total_patients,
            },
            ip_address=get_client_ip(self.request),
        )

    @action(detail=True, methods=["post"])
    def acknowledge(self, request, pk=None):
        """Acknowledge the handover by the incoming nurse."""
        handover = self.get_object()

        if handover.is_acknowledged:
            return Response(
                {"error": "Handover already acknowledged"}, status=status.HTTP_400_BAD_REQUEST
            )

        if request.user != handover.incoming_nurse:
            return Response(
                {"error": "Only the incoming nurse can acknowledge the handover"},
                status=status.HTTP_403_FORBIDDEN,
            )

        handover.acknowledge(request.user)

        AuditLog.log(
            action="shift_handover_acknowledge",
            user=request.user,
            resource_type="ShiftHandover",
            resource_id=handover.id,
            details={
                "ward": handover.ward.name,
                "shift_date": str(handover.shift_date),
                "shift_ending": handover.shift_ending,
            },
            ip_address=get_client_ip(request),
        )

        serializer = self.get_serializer(handover)
        return Response(serializer.data)

    @action(detail=True, methods=["post"], url_path="auto-populate")
    def auto_populate(self, request, pk=None):
        """Auto-populate patient counts from ward data."""
        handover = self.get_object()
        handover.auto_populate_counts()

        serializer = self.get_serializer(handover)
        return Response(serializer.data)
