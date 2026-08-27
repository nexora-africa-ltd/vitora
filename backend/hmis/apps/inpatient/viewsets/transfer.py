"""
What this file is for: inpatient internal transfer viewset.
How to use: imported and re-exported by ``inpatient.views`` to preserve existing imports.
Supported inputs/args: DRF ViewSet payloads/query params defined by TransferSerializer and actions.
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

from ..models import Transfer
from ..serializers import TransferSerializer


class TransferViewSet(NestedTenantScopeMixin, viewsets.ModelViewSet):
    """ViewSet for Transfer model."""

    tenant_facility_chain = "admission__facility"
    tenant_org_chain = "admission__organization"
    queryset = Transfer.objects.select_related("admission", "admission__mch_registration")
    serializer_class = TransferSerializer
    permission_classes = [IsAuthenticated, WriteRequiresRolePermission, ReadRequiresModelPermission]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ["source_ward", "destination_ward", "reason", "transferred_by"]
    search_fields = [
        "admission__admission_number",
        "admission__patient__first_name",
        "admission__patient__last_name",
    ]
    ordering_fields = ["transfer_date", "created_at"]
    ordering = ["-transfer_date"]
    _CARE_LEVEL_SCORE = {
        "MEDICAL": 1,
        "SURGICAL": 1,
        "PEDIATRIC": 1,
        "MATERNITY": 1,
        "ISOLATION": 1,
        "HDU": 2,
        "NBU": 2,
        "ICU": 3,
    }

    @classmethod
    def _transition_direction(cls, source_ward, destination_ward) -> str:
        source_score = cls._CARE_LEVEL_SCORE.get(str(getattr(source_ward, "ward_type", "")), 1)
        destination_score = cls._CARE_LEVEL_SCORE.get(
            str(getattr(destination_ward, "ward_type", "")), 1
        )
        if destination_score > source_score:
            return "STEP_UP"
        if destination_score < source_score:
            return "STEP_DOWN"
        return "LATERAL"

    def perform_create(self, serializer):
        """Create transfer and log action."""
        instance = serializer.save()
        transition_direction = self._transition_direction(
            instance.source_ward, instance.destination_ward
        )

        AuditLog.log(
            action="transfer_create",
            user=self.request.user,
            resource_type="Transfer",
            resource_id=instance.id,
            details={
                "admission_number": instance.admission.admission_number,
                "patient": instance.admission.patient.id,
                "source_ward": instance.source_ward.name,
                "source_ward_type": instance.source_ward.ward_type,
                "destination_ward": instance.destination_ward.name,
                "destination_ward_type": instance.destination_ward.ward_type,
                "reason": instance.reason,
                "reason_details": instance.reason_details,
                "care_transition": transition_direction,
            },
            ip_address=get_client_ip(self.request),
        )

        if transition_direction in {"STEP_UP", "STEP_DOWN"}:
            AuditLog.log(
                action=(
                    "transfer_care_level_escalation"
                    if transition_direction == "STEP_UP"
                    else "transfer_care_level_deescalation"
                ),
                user=self.request.user,
                resource_type="Transfer",
                resource_id=instance.id,
                details={
                    "admission_number": instance.admission.admission_number,
                    "source_ward": instance.source_ward.name,
                    "source_ward_type": instance.source_ward.ward_type,
                    "destination_ward": instance.destination_ward.name,
                    "destination_ward_type": instance.destination_ward.ward_type,
                    "reason": instance.reason,
                    "reason_details": instance.reason_details,
                },
                ip_address=get_client_ip(self.request),
            )

    def get_queryset(self):
        queryset = (
            super()
            .get_queryset()
            .select_related(
                "source_ward",
                "destination_ward",
                "source_bed",
                "destination_bed",
                "transferred_by",
            )
        )
        source_ward_type = str(self.request.query_params.get("source_ward_type", "") or "").strip()
        destination_ward_type = str(
            self.request.query_params.get("destination_ward_type", "") or ""
        ).strip()
        if source_ward_type:
            queryset = queryset.filter(source_ward__ward_type=source_ward_type)
        if destination_ward_type:
            queryset = queryset.filter(destination_ward__ward_type=destination_ward_type)
        return queryset
