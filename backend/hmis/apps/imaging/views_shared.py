# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
# ruff: noqa
"""Imaging views shared for Vitora HMIS.

What this file is for:
- Implement views shared logic for the imaging domain.

How to use it:
- Import classes and functions from this module in Django app code and tests.

Supported inputs/args:
- Python imports and Django ORM/runtime inputs; no standalone CLI arguments.
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


def _imaging_action_exceptions() -> tuple[type[Exception], ...]:
    """Expected exceptions for imaging workflow actions and uploads."""
    return (
        ValidationError,
        ObjectDoesNotExist,
        DatabaseError,
        IntegrityError,
        OSError,
        AttributeError,
        TypeError,
        ValueError,
        RuntimeError,
    )


def get_client_ip(request):
    """Extract client IP from request."""
    x_forwarded_for = request.META.get("HTTP_X_FORWARDED_FOR")
    if x_forwarded_for:
        return x_forwarded_for.split(",")[0].strip()
    return request.META.get("REMOTE_ADDR", "127.0.0.1")


def _has_dicom_read_permission(user) -> bool:
    """Require explicit DICOM read permission for raw instance/frame endpoints."""
    if not user or not user.is_authenticated:
        return False
    if user.is_superuser:
        return True
    return user.has_perm("imaging.view_dicominstance") or user.has_perm("imaging.view_dicomstudy")


def _can_access_instance_for_tenant(request, instance: DICOMInstance) -> bool:
    """Enforce org/facility scoping for raw DICOM access (deny by default)."""
    user = request.user
    if user.is_superuser:
        return True

    resolve_request_tenant(request)
    org = getattr(request, "organization", None)
    facility = getattr(request, "facility", None)

    study = instance.series.study
    patient = study.patient
    patient_org_id = getattr(patient, "organization_id", None)
    patient_facility_id = getattr(patient, "registered_at_facility_id", None)

    # Deny by default if tenant context is absent.
    if not org and not facility:
        return False

    if org and patient_org_id != getattr(org, "id", None):
        return False

    # If facility context is present, patient registration facility must match.
    if facility:
        req_facility_id = getattr(facility, "id", None)
        if not patient_facility_id or patient_facility_id != req_facility_id:
            return False

    return True
