# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""Dedicated API workflow for facility-scoped inpatient bed assignment requests.

How to use: registered by ``inpatient.urls`` at ``bed-assignment-requests``.
Inputs: DRF request payloads for create, assign (``bed``), and cancel actions.
"""

# ruff: noqa: ARG002

from django_filters.rest_framework import DjangoFilterBackend
from rest_framework import filters, status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from hmis.apps.core.mixins import TenantScopedViewMixin
from hmis.apps.core.models import AuditLog
from hmis.apps.core.permissions import (
    ReadRequiresModelPermission,
    WriteRequiresRolePermission,
    get_client_ip,
)
from hmis.apps.licensing.permissions import requires_feature

from ..models import BedAssignmentRequest
from ..serializers import BedAssignmentRequestAssignSerializer, BedAssignmentRequestSerializer


class BedAssignmentRequestViewSet(TenantScopedViewMixin, viewsets.ModelViewSet):
    """Create, assign, cancel, and list facility-scoped bed assignment requests."""

    queryset = BedAssignmentRequest.objects.select_related(
        "patient",
        "recommendation__encounter",
        "requested_ward",
        "assigned_bed",
        "requested_by",
        "assigned_by",
    )
    serializer_class = BedAssignmentRequestSerializer
    permission_classes = [
        IsAuthenticated,
        WriteRequiresRolePermission,
        requires_feature("inpatient"),
        ReadRequiresModelPermission,
    ]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ["status", "priority", "patient", "requested_ward", "requested_by"]
    search_fields = ["patient__first_name", "patient__last_name", "patient__mrn", "reason"]
    ordering_fields = ["created_at", "priority", "assigned_at"]
    ordering = ["priority", "created_at"]
    tenant_scope = "facility"

    def get_serializer_context(self):
        """Resolve tenant context before serializer relation validation."""
        self._resolve_tenant_context()
        return super().get_serializer_context()

    def perform_create(self, serializer):
        """Create a request in the current facility and retain its requester."""
        instance = serializer.save(requested_by=self.request.user, **self.get_tenant_save_kwargs())
        AuditLog.log(
            action="bed_assignment_request_create",
            user=self.request.user,
            resource_type="BedAssignmentRequest",
            resource_id=instance.id,
            details={"patient": instance.patient_id, "priority": instance.priority},
            ip_address=get_client_ip(self.request),
        )

    @action(detail=True, methods=["post"])
    def assign(self, request, pk=None):
        """Reserve an available bed for this pending request."""
        assignment_request = self.get_object()
        serializer = BedAssignmentRequestAssignSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            assignment_request.assign(serializer.validated_data["bed"], request.user)
        except ValueError as error:
            message = str(error.args[0]) if error.args else "Unable to assign bed."
            return Response({"error": message}, status=status.HTTP_400_BAD_REQUEST)

        AuditLog.log(
            action="bed_assignment_request_assign",
            user=request.user,
            resource_type="BedAssignmentRequest",
            resource_id=assignment_request.id,
            details={"assigned_bed": assignment_request.assigned_bed_id},
            ip_address=get_client_ip(request),
        )
        return Response(self.get_serializer(assignment_request).data)

    @action(detail=True, methods=["post"])
    def cancel(self, request, pk=None):
        """Cancel a request and release its reserved bed, if any."""
        assignment_request = self.get_object()
        try:
            assignment_request.cancel()
        except ValueError as error:
            message = (
                str(error.args[0]) if error.args else "Unable to cancel bed assignment request."
            )
            return Response({"error": message}, status=status.HTTP_400_BAD_REQUEST)

        AuditLog.log(
            action="bed_assignment_request_cancel",
            user=request.user,
            resource_type="BedAssignmentRequest",
            resource_id=assignment_request.id,
            details={"assigned_bed": assignment_request.assigned_bed_id},
            ip_address=get_client_ip(request),
        )
        return Response(self.get_serializer(assignment_request).data)

    def destroy(self, request, *args, **kwargs):
        """Require the model delete permission before removing a request."""
        if not request.user.has_perm("inpatient.delete_bedassignmentrequest"):
            return Response(
                {"detail": "You do not have permission to delete this resource."},
                status=status.HTTP_403_FORBIDDEN,
            )
        return super().destroy(request, *args, **kwargs)
