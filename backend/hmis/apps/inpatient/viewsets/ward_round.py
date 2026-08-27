"""
What this file is for: inpatient ward-round viewset.
How to use: imported and re-exported by ``inpatient.views`` to preserve existing imports.
Supported inputs/args: DRF ViewSet payloads/query params defined by WardRoundSerializer.
"""

from django_filters.rest_framework import DjangoFilterBackend
from rest_framework import filters, viewsets
from rest_framework.permissions import IsAuthenticated

from hmis.apps.core.mixins import NestedTenantScopeMixin
from hmis.apps.core.models import AuditLog
from hmis.apps.core.permissions import (
    ReadRequiresModelPermission,
    WriteRequiresRolePermission,
    get_client_ip,
)

from ..models import WardRound
from ..serializers import WardRoundSerializer
from .observation_chart import _sync_bedside_vitals_to_ipd_encounter


class WardRoundViewSet(NestedTenantScopeMixin, viewsets.ModelViewSet):
    """ViewSet for WardRound model."""

    tenant_facility_chain = "admission__facility"
    tenant_org_chain = "admission__organization"
    queryset = WardRound.objects.all()
    serializer_class = WardRoundSerializer
    permission_classes = [IsAuthenticated, WriteRequiresRolePermission, ReadRequiresModelPermission]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = [
        "admission",
        "condition_status",
        "requires_consultant_review",
        "conducted_by",
    ]
    search_fields = [
        "admission__admission_number",
        "admission__patient__first_name",
        "admission__patient__last_name",
        "subjective",
        "assessment",
    ]
    ordering_fields = ["round_date", "round_time", "created_at"]
    ordering = ["-round_date", "-round_time"]

    def perform_create(self, serializer):
        """Create ward round and log action."""
        instance = serializer.save()
        _sync_bedside_vitals_to_ipd_encounter(
            instance.admission,
            vitals_payload={
                "temperature": instance.temperature,
                "pulse": instance.pulse,
                "blood_pressure": instance.blood_pressure,
                "respiratory_rate": instance.respiratory_rate,
                "spo2": instance.spo2,
            },
        )

        AuditLog.log(
            action="ward_round_create",
            user=self.request.user,
            resource_type="WardRound",
            resource_id=instance.id,
            details={
                "admission_number": instance.admission.admission_number,
                "patient": instance.admission.patient.id,
                "condition_status": instance.condition_status,
                "requires_consultant_review": instance.requires_consultant_review,
            },
            ip_address=get_client_ip(self.request),
        )
