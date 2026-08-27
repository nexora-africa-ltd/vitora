"""
What this file is for: discharge template CRUD APIs.
How to use: imported and re-exported by ``inpatient.views`` to preserve router imports.
Supported inputs/args: DRF ViewSet payloads/query params for discharge-template endpoints.
"""

from django_filters.rest_framework import DjangoFilterBackend
from rest_framework import filters, status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from hmis.apps.core.mixins import ReadOnCreateMixin, TenantScopedViewMixin
from hmis.apps.core.models import AuditLog
from hmis.apps.core.permissions import (
    ReadRequiresModelPermission,
    WriteRequiresRolePermission,
    get_client_ip,
)

from ..models import DischargeTemplate
from ..serializers import DischargeTemplateCreateSerializer, DischargeTemplateSerializer


class DischargeTemplateViewSet(ReadOnCreateMixin, TenantScopedViewMixin, viewsets.ModelViewSet):
    """CRUD for configurable discharge summary print templates."""

    queryset = DischargeTemplate.objects.all()
    permission_classes = [IsAuthenticated, WriteRequiresRolePermission, ReadRequiresModelPermission]
    tenant_scope = "facility"
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ["layout", "is_default", "is_active"]
    search_fields = ["name"]
    ordering_fields = ["name", "is_default", "created_at"]
    ordering = ["-is_default", "name"]

    def get_serializer_class(self):
        if self.action == "create":
            return DischargeTemplateCreateSerializer
        return DischargeTemplateSerializer

    def perform_create(self, serializer):
        instance = serializer.save(**self.get_tenant_save_kwargs())
        AuditLog.log(
            action="discharge_template_create",
            user=self.request.user,
            resource_type="DischargeTemplate",
            resource_id=instance.id,
            details={"name": instance.name, "layout": instance.layout},
            ip_address=get_client_ip(self.request),
        )

    def perform_update(self, serializer):
        instance = serializer.save()
        AuditLog.log(
            action="discharge_template_update",
            user=self.request.user,
            resource_type="DischargeTemplate",
            resource_id=instance.id,
            details={"name": instance.name, "layout": instance.layout},
            ip_address=get_client_ip(self.request),
        )

    def perform_destroy(self, instance):
        AuditLog.log(
            action="discharge_template_delete",
            user=self.request.user,
            resource_type="DischargeTemplate",
            resource_id=instance.id,
            details={"name": instance.name},
            ip_address=get_client_ip(self.request),
        )
        instance.delete()

    @action(detail=False, methods=["get"])
    def default(self, request):
        """Return the facility's default template (or 404 if none)."""
        self._resolve_tenant_context()
        facility = getattr(request, "facility", None)
        template = DischargeTemplate.objects.filter(
            facility=facility,
            is_default=True,
            is_active=True,
        ).first()
        if not template:
            return Response(
                {"detail": "No default discharge template configured."},
                status=status.HTTP_404_NOT_FOUND,
            )
        return Response(DischargeTemplateSerializer(template).data)
