# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
# ruff: noqa
"""
What this file is for: imaging equipment and integration settings viewsets.
How to use: imported by `hmis.apps.imaging.views` compatibility shim.
Supported inputs/args: DRF viewsets for imaging inventory and integration configuration.
"""

import logging
import os
import tempfile
from collections import defaultdict
from datetime import datetime

from django.conf import settings
from django.core.exceptions import ObjectDoesNotExist, ValidationError
from django.db import DatabaseError, IntegrityError, models
from django.http import FileResponse, HttpResponse
from django_filters import rest_framework as filters
from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.filters import SearchFilter
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from hmis.apps.core.mixins import (
    NestedTenantScopeMixin,
    ReadOnCreateMixin,
    TenantScopedViewMixin,
    resolve_request_tenant,
)
from hmis.apps.core.models import AuditLog
from hmis.apps.core.openapi import SchemaFallbackSerializer
from hmis.apps.core.permissions import ReadRequiresModelPermission, WriteRequiresRolePermission
from hmis.apps.scheduling.models import Resource

from .models import (
    DICOMInstance,
    DICOMSeries,
    DICOMStudy,
    ImagingIntegrationSettings,
    ImagingOrder,
    ImagingProcedure,
    RadiologyReport,
    ReportAmendment,
)
from .serializers import (
    AmendReportSerializer,
    AppointmentSummarySerializer,
    CancelOrderSerializer,
    CommunicateCriticalSerializer,
    DICOMInstanceSerializer,
    DICOMSeriesListSerializer,
    DICOMStudyDetailSerializer,
    DICOMStudySerializer,
    EncounterExternalImagingRequestCreateSerializer,
    ExternalImagingOrderRequestSerializer,
    ImagingIntegrationSettingsSerializer,
    ImagingOrderCreateSerializer,
    ImagingOrderSerializer,
    ImagingProcedureCreateSerializer,
    ImagingProcedureDetailSerializer,
    ImagingProcedureSerializer,
    ImagingResourceSerializer,
    RadiologyReportCreateSerializer,
    RadiologyReportSerializer,
    RadiologyReportUpdateSerializer,
    ScheduleOrderSerializer,
    ScheduleOrderWithResourceSerializer,
    SignReportSerializer,
)
from .services import (
    DICOMParsingService,
    ImagingSchedulingService,
    PACSStorageService,
    recompute_study_statistics,
    resolve_equipment_from_metadata,
)
from .standalone.models import ExternalImagingOrderRequest

logger = logging.getLogger(__name__)


class ImagingEquipmentViewSet(TenantScopedViewMixin, viewsets.ModelViewSet):
    """
    CRUD for imaging equipment registry.

    Auto-registered equipment can be edited to add room/calibration metadata.
    Manual creation is also supported for QA tracking before the first study arrives.
    """

    permission_classes = [IsAuthenticated, WriteRequiresRolePermission, ReadRequiresModelPermission]
    tenant_scope = "facility"
    filter_backends = [SearchFilter]
    search_fields = ["name", "ae_title", "station_name", "serial_number", "model_name"]

    def get_queryset(self):
        from .models import ImagingEquipment

        if getattr(self, "swagger_fake_view", False):
            return ImagingEquipment.objects.none()
        qs = ImagingEquipment.objects.all().select_related("scheduling_resource", "facility")
        modality = self.request.query_params.get("modality")
        if modality:
            qs = qs.filter(modality=modality)
        is_active = self.request.query_params.get("is_active")
        if is_active is not None:
            qs = qs.filter(is_active=is_active.lower() == "true")
        return qs

    def get_serializer_class(self):
        from .serializers import ImagingEquipmentSerializer

        return ImagingEquipmentSerializer

    def perform_create(self, serializer):
        serializer.save(**self.get_tenant_save_kwargs(), auto_registered=False)

    def destroy(self, request, *args, **kwargs):
        if not request.user.has_perm("imaging.delete_imagingequipment"):
            return Response(
                {"detail": "You do not have permission to delete equipment."},
                status=status.HTTP_403_FORBIDDEN,
            )
        instance = self.get_object()
        if instance.studies.exists():
            # Soft-delete: deactivate to preserve study history
            instance.is_active = False
            instance.save(update_fields=["is_active", "updated_at"])
            return Response(status=status.HTTP_204_NO_CONTENT)
        return super().destroy(request, *args, **kwargs)


class ImagingIntegrationSettingsViewSet(TenantScopedViewMixin, viewsets.ModelViewSet):
    """
    Per-facility DICOM integration settings.

    GET    /api/imaging/settings/current/      -> get or create current facility config
    PATCH  /api/imaging/settings/{id}/         -> update config
    """

    permission_classes = [IsAuthenticated, WriteRequiresRolePermission, ReadRequiresModelPermission]
    tenant_scope = "facility"
    queryset = ImagingIntegrationSettings.objects.all()
    serializer_class = ImagingIntegrationSettingsSerializer

    def perform_create(self, serializer):
        serializer.save(**self.get_tenant_save_kwargs())

    @action(detail=False, methods=["get"], url_path="current")
    def current(self, request):
        self._resolve_tenant_context()
        facility = getattr(request, "facility", None)
        if not facility:
            return Response(
                {"error": "No facility context available"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        settings_obj, _created = ImagingIntegrationSettings.objects.get_or_create(
            facility=facility,
            defaults={
                "organization": getattr(facility, "organization", None),
                "ae_title": getattr(settings, "DICOM_SCP_AE_TITLE", "VITORA"),
                "bind_host": getattr(settings, "DICOM_SCP_BIND_HOST", "0.0.0.0"),  # noqa: S104
                "port": int(getattr(settings, "DICOM_SCP_PORT", 11112)),
                "allowed_peers": ",".join(getattr(settings, "DICOM_SCP_ALLOWED_PEERS", []) or []),
            },
        )
        serializer = self.get_serializer(settings_obj)
        return Response(serializer.data)
