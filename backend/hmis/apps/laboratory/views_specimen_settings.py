# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
# ruff: noqa: ARG002
"""Laboratory views specimen settings for Vitora HMIS.

What this file is for:
- Implement views specimen settings logic for the laboratory domain.

How to use it:
- Import classes and functions from this module in Django app code and tests.

Supported inputs/args:
- Python imports and Django ORM/runtime inputs; no standalone CLI arguments.
"""

import logging

from django.db import models
from django_filters import rest_framework as filters
from rest_framework import viewsets
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from hmis.apps.core.audit import AuditedMutationMixin
from hmis.apps.core.mixins import NestedTenantScopeMixin, TenantScopedViewMixin
from hmis.apps.core.permissions import ReadRequiresModelPermission, WriteRequiresRolePermission

from .models import (
    LabBarcodeConfig,
    LabWorkflowSettings,
    ReferralLab,
    ResultCommentTemplate,
    Specimen,
    SpecimenRejectionReason,
)
from .permissions import LaboratoryModuleRequired, LISIntegrationSettingsPermission
from .serializers import (
    LabBarcodeConfigSerializer,
    LabWorkflowSettingsSerializer,
    ReferralLabSerializer,
    ResultCommentTemplateSerializer,
    SpecimenRejectionReasonSerializer,
    SpecimenSerializer,
)

logger = logging.getLogger(__name__)


class SpecimenFilter(filters.FilterSet):
    """Filter for specimens."""

    order_number = filters.CharFilter(field_name="lab_order__order_number")
    patient = filters.NumberFilter(field_name="lab_order__patient_id")

    class Meta:
        model = Specimen
        fields = {
            "status": ["exact"],
            "specimen_type": ["exact"],
            "lab_order": ["exact"],
            "collected_at": ["gte", "lte"],
            "created_at": ["gte", "lte"],
        }


class SpecimenViewSet(NestedTenantScopeMixin, viewsets.ReadOnlyModelViewSet):
    """
    ViewSet for specimens — read-only.

    Provides list and retrieve operations for specimen tracking.
    Specimens are created automatically via signals when lab orders/queue entries are created.

    Lookup is by barcode (unique identifier).
    """

    queryset = (
        Specimen.objects.select_related(
            "lab_order",
            "lab_order__patient",
            "collected_by",
            "received_by",
        )
        .prefetch_related("order_items")
        .all()
    )
    serializer_class = SpecimenSerializer
    permission_classes = [IsAuthenticated, WriteRequiresRolePermission, ReadRequiresModelPermission]
    filter_backends = [filters.DjangoFilterBackend]
    filterset_class = SpecimenFilter
    lookup_field = "barcode"
    tenant_facility_chain = "lab_order__facility"
    tenant_org_chain = "lab_order__organization"

    def get_queryset(self):
        queryset = super().get_queryset()

        # Search by barcode prefix
        barcode = self.request.query_params.get("barcode")
        if barcode:
            queryset = queryset.filter(barcode__icontains=barcode)

        return queryset


# =============================================================================
# Lab Settings ViewSets
# =============================================================================


class SpecimenRejectionReasonViewSet(
    AuditedMutationMixin,
    TenantScopedViewMixin,
    viewsets.ModelViewSet,
):
    """CRUD for specimen rejection reasons."""

    queryset = SpecimenRejectionReason.objects.all()
    audit_resource_type = "SpecimenRejectionReason"
    audit_action_prefix = "laboratory.specimen_rejection_reason"
    audit_source = "laboratory_api"
    serializer_class = SpecimenRejectionReasonSerializer
    permission_classes = [
        IsAuthenticated,
        LaboratoryModuleRequired,
        LISIntegrationSettingsPermission,
        WriteRequiresRolePermission,
        ReadRequiresModelPermission,
    ]
    tenant_scope = "facility"

    def get_queryset(self):
        qs = super().get_queryset()
        is_active = self.request.query_params.get("is_active")
        if is_active is not None:
            qs = qs.filter(is_active=is_active.lower() == "true")
        return qs

    def perform_create(self, serializer):
        serializer.save(**self.get_tenant_save_kwargs())

    def perform_update(self, serializer):
        serializer.save()


class ResultCommentTemplateViewSet(
    AuditedMutationMixin, TenantScopedViewMixin, viewsets.ModelViewSet
):
    """CRUD for result comment templates."""

    queryset = ResultCommentTemplate.objects.prefetch_related("applicable_tests").all()
    audit_resource_type = "ResultCommentTemplate"
    audit_action_prefix = "laboratory.result_comment_template"
    audit_source = "laboratory_api"
    serializer_class = ResultCommentTemplateSerializer
    permission_classes = [
        IsAuthenticated,
        LaboratoryModuleRequired,
        LISIntegrationSettingsPermission,
        WriteRequiresRolePermission,
        ReadRequiresModelPermission,
    ]
    tenant_scope = "facility"

    def get_queryset(self):
        qs = super().get_queryset()
        is_active = self.request.query_params.get("is_active")
        if is_active is not None:
            qs = qs.filter(is_active=is_active.lower() == "true")
        category = self.request.query_params.get("category")
        if category:
            qs = qs.filter(category=category)
        return qs

    def perform_create(self, serializer):
        serializer.save(**self.get_tenant_save_kwargs())

    def perform_update(self, serializer):
        serializer.save()


class ReferralLabViewSet(AuditedMutationMixin, TenantScopedViewMixin, viewsets.ModelViewSet):
    """CRUD for referral/outsourced labs."""

    queryset = ReferralLab.objects.all()
    audit_resource_type = "ReferralLab"
    audit_action_prefix = "laboratory.referral_lab"
    audit_source = "laboratory_api"
    serializer_class = ReferralLabSerializer
    permission_classes = [
        IsAuthenticated,
        LaboratoryModuleRequired,
        LISIntegrationSettingsPermission,
        WriteRequiresRolePermission,
        ReadRequiresModelPermission,
    ]
    tenant_scope = "facility"

    def get_queryset(self):
        qs = super().get_queryset()
        is_active = self.request.query_params.get("is_active")
        if is_active is not None:
            qs = qs.filter(is_active=is_active.lower() == "true")
        search = self.request.query_params.get("search")
        if search:
            qs = qs.filter(models.Q(name__icontains=search) | models.Q(code__icontains=search))
        return qs

    def perform_create(self, serializer):
        serializer.save(**self.get_tenant_save_kwargs())

    def perform_update(self, serializer):
        serializer.save()


class LabBarcodeConfigViewSet(AuditedMutationMixin, TenantScopedViewMixin, viewsets.ModelViewSet):
    """Singleton barcode configuration per facility. Use GET to retrieve, PATCH to update."""

    queryset = LabBarcodeConfig.objects.all()
    audit_resource_type = "LabBarcodeConfig"
    audit_action_prefix = "laboratory.barcode_config"
    audit_source = "laboratory_api"
    serializer_class = LabBarcodeConfigSerializer
    permission_classes = [
        IsAuthenticated,
        LaboratoryModuleRequired,
        LISIntegrationSettingsPermission,
        WriteRequiresRolePermission,
        ReadRequiresModelPermission,
    ]
    tenant_scope = "facility"

    def list(self, request, *args, **kwargs):
        """Return the single config for current facility, creating default if needed."""
        self._resolve_tenant_context()
        if not getattr(request, "facility", None):
            return Response(
                {
                    "detail": "No facility context. Set X-Facility-ID header or assign a primary facility."
                },
                status=400,
            )
        config, _created = LabBarcodeConfig.objects.get_or_create(
            facility=request.facility,
            defaults={"organization": request.facility.organization},
        )
        serializer = self.get_serializer(config)
        return Response(serializer.data)

    def perform_create(self, serializer):
        serializer.save(**self.get_tenant_save_kwargs())

    def perform_update(self, serializer):
        serializer.save()


class LabWorkflowSettingsViewSet(
    AuditedMutationMixin, TenantScopedViewMixin, viewsets.ModelViewSet
):
    """Singleton workflow settings per facility. Use GET to retrieve, PATCH to update."""

    queryset = LabWorkflowSettings.objects.all()
    audit_resource_type = "LabWorkflowSettings"
    audit_action_prefix = "laboratory.workflow_settings"
    audit_source = "laboratory_api"
    serializer_class = LabWorkflowSettingsSerializer
    permission_classes = [
        IsAuthenticated,
        LaboratoryModuleRequired,
        LISIntegrationSettingsPermission,
        WriteRequiresRolePermission,
        ReadRequiresModelPermission,
    ]
    tenant_scope = "facility"

    def list(self, request, *args, **kwargs):
        """Return the single settings for current facility, creating default if needed."""
        self._resolve_tenant_context()
        if not getattr(request, "facility", None):
            return Response(
                {
                    "detail": "No facility context. Set X-Facility-ID header or assign a primary facility."
                },
                status=400,
            )
        settings, _created = LabWorkflowSettings.objects.get_or_create(
            facility=request.facility,
            defaults={"organization": request.facility.organization},
        )
        serializer = self.get_serializer(settings)
        return Response(serializer.data)

    def perform_create(self, serializer):
        serializer.save(**self.get_tenant_save_kwargs())

    def perform_update(self, serializer):
        serializer.save()
