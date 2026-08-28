# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
# ruff: noqa
"""Imaging views share for Vitora HMIS.

What this file is for:
- Implement views share logic for the imaging domain.

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

from hmis.apps.imaging.views_shared import get_client_ip


class ImagingSchemaMixin:
    """Schema fallback helpers for APIViews used by drf-spectacular."""

    serializer_class = SchemaFallbackSerializer

    def get_serializer_class(self):
        return self.serializer_class

    def get_serializer(self, *args, **kwargs):
        serializer_class = self.get_serializer_class()
        kwargs.setdefault("context", self.get_serializer_context())
        return serializer_class(*args, **kwargs)

    def get_serializer_context(self):
        return {"request": self.request, "format": self.format_kwarg, "view": self}


class StudyShareAccessView(ImagingSchemaMixin, APIView):
    """
    Public access to a shared study via token.

    GET  /api/imaging/share/{token}/                  → study metadata (after PIN check)
    POST /api/imaging/share/{token}/verify-pin/       → exchange PIN for access
    GET  /api/imaging/share/{token}/instance/{sop}/   → DICOM file
    GET  /api/imaging/share/{token}/download/         → ZIP download (if allow_download)

    PIN is provided via X-Share-PIN header on subsequent requests.
    """

    permission_classes = []  # public
    authentication_classes = []  # bypass JWT

    def get(self, request, token):

        link = self._resolve(token)
        if isinstance(link, Response):
            return link

        pin_ok, pin_response = self._check_pin(request, link)
        if not pin_ok:
            return pin_response

        study = link.study
        link.record_access(ip_address=get_client_ip(request))

        AuditLog.log(
            action="dicom_share_accessed",
            user=None,
            resource_type="DICOMStudy",
            resource_id=study.pk,
            ip_address=get_client_ip(request),
            details={
                "study_instance_uid": study.study_instance_uid,
                "share_link_id": link.pk,
                "purpose": link.purpose,
            },
        )

        # Minimal study payload — no PHI beyond what the share creator already exposed
        series_payload = []
        for series in study.series_set.all().prefetch_related("instances"):
            series_payload.append(
                {
                    "series_instance_uid": series.series_instance_uid,
                    "series_number": series.series_number,
                    "series_description": series.series_description,
                    "modality": series.modality,
                    "body_part_examined": series.body_part_examined,
                    "instances": [
                        {
                            "sop_instance_uid": inst.sop_instance_uid,
                            "instance_number": inst.instance_number,
                        }
                        for inst in series.instances.all()
                    ],
                }
            )

        return Response(
            {
                "study_instance_uid": study.study_instance_uid,
                "study_date": study.study_date.isoformat(),
                "study_description": study.study_description,
                "modality": study.modality,
                "accession_number": study.accession_number,
                "referring_physician_name": study.referring_physician_name,
                "institution_name": study.institution_name,
                "number_of_series": study.number_of_series,
                "number_of_instances": study.number_of_instances,
                "patient_name_display": (
                    # Patient name preserved for clinical sharing; no MRN/contact info
                    f"{study.patient.first_name} {study.patient.last_name}"
                ),
                "purpose": link.purpose,
                "allow_download": link.allow_download,
                "expires_at": link.expires_at.isoformat(),
                "series": series_payload,
            }
        )

    @classmethod
    def _resolve(cls, token: str):
        from .models import StudyShareLink

        try:
            link = StudyShareLink.objects.select_related("study", "study__patient").get(token=token)
        except StudyShareLink.DoesNotExist:
            return Response({"error": "Share link not found."}, status=status.HTTP_404_NOT_FOUND)
        if link.is_revoked:
            return Response(
                {"error": "This share link has been revoked.", "code": "revoked"},
                status=status.HTTP_410_GONE,
            )
        if link.is_expired:
            return Response(
                {"error": "This share link has expired.", "code": "expired"},
                status=status.HTTP_410_GONE,
            )
        if link.is_view_exhausted:
            return Response(
                {"error": "This share link has reached its view limit.", "code": "exhausted"},
                status=status.HTTP_410_GONE,
            )
        return link

    @classmethod
    def _check_pin(cls, request, link):
        pin = request.headers.get("X-Share-PIN", "") or request.query_params.get("pin", "")
        if link.pin_hash and not link.check_pin(pin):
            return False, Response(
                {"error": "PIN required or incorrect.", "code": "pin_required"},
                status=status.HTTP_401_UNAUTHORIZED,
            )
        return True, None


class StudyShareInstanceView(ImagingSchemaMixin, APIView):
    """Serve an individual DICOM instance for a shared study."""

    permission_classes = []
    authentication_classes = []

    def get(self, request, token, sop_instance_uid):
        link = StudyShareAccessView._resolve(token)
        if isinstance(link, Response):
            return link
        pin_ok, pin_response = StudyShareAccessView._check_pin(request, link)
        if not pin_ok:
            return pin_response

        try:
            instance = DICOMInstance.objects.select_related("series__study").get(
                sop_instance_uid=sop_instance_uid,
                series__study=link.study,
            )
        except DICOMInstance.DoesNotExist:
            return Response(
                {"error": "Instance not found in this study."},
                status=status.HTTP_404_NOT_FOUND,
            )

        pacs = PACSStorageService(base_path=str(settings.MEDIA_ROOT))
        file_path = pacs.get_absolute_path(instance.file_path)
        if not os.path.exists(file_path):
            return Response(
                {"error": "DICOM file missing on disk."},
                status=status.HTTP_404_NOT_FOUND,
            )

        link.record_access(ip_address=get_client_ip(request))

        response = FileResponse(open(file_path, "rb"), content_type="application/dicom")
        response["Content-Disposition"] = f'attachment; filename="{sop_instance_uid}.dcm"'
        return response


class StudyShareDownloadView(ImagingSchemaMixin, APIView):
    """ZIP download of all instances for a shared study (if allow_download)."""

    permission_classes = []
    authentication_classes = []

    def get(self, request, token):
        import zipfile
        from io import BytesIO

        link = StudyShareAccessView._resolve(token)
        if isinstance(link, Response):
            return link
        pin_ok, pin_response = StudyShareAccessView._check_pin(request, link)
        if not pin_ok:
            return pin_response

        if not link.allow_download:
            return Response(
                {"error": "Download is not permitted for this share link."},
                status=status.HTTP_403_FORBIDDEN,
            )

        study = link.study
        instances = DICOMInstance.objects.filter(series__study=study).select_related("series")
        pacs = PACSStorageService(base_path=str(settings.MEDIA_ROOT))

        buf = BytesIO()
        included = 0
        with zipfile.ZipFile(buf, mode="w", compression=zipfile.ZIP_STORED) as zf:
            for inst in instances:
                abs_path = pacs.get_absolute_path(inst.file_path)
                if not os.path.exists(abs_path):
                    continue
                arc = (
                    f"{study.study_instance_uid}/"
                    f"{inst.series.series_instance_uid}/"
                    f"{inst.sop_instance_uid}.dcm"
                )
                zf.write(abs_path, arcname=arc)
                included += 1
        if included == 0:
            return Response(
                {"error": "No DICOM files available."},
                status=status.HTTP_404_NOT_FOUND,
            )

        link.record_access(ip_address=get_client_ip(request))
        AuditLog.log(
            action="dicom_share_downloaded",
            user=None,
            resource_type="DICOMStudy",
            resource_id=study.pk,
            ip_address=get_client_ip(request),
            details={
                "study_instance_uid": study.study_instance_uid,
                "share_link_id": link.pk,
                "instances_included": included,
            },
        )

        buf.seek(0)
        response = HttpResponse(buf.getvalue(), content_type="application/zip")
        response["Content-Disposition"] = (
            f'attachment; filename="study-{study.study_instance_uid[:30]}.zip"'
        )
        return response


class StudyShareFrameView(ImagingSchemaMixin, APIView):
    """
    Render a shared DICOM instance as a PNG image for web display.

    GET /api/imaging/share/{token}/instance/{sop_instance_uid}/frame/

    Same rendering logic as DICOMFrameRenderView but authenticated
    via share token + optional PIN instead of JWT.

    Query parameters:
    - size: Maximum dimension in pixels (default: 512, max: 2048)
    - frame: Frame index for multi-frame DICOM (default: 0)
    - window_center: Window center for display (optional)
    - window_width: Window width for display (optional)
    - pin: Share link PIN (alternative to X-Share-PIN header)
    """

    permission_classes = []
    authentication_classes = []

    def get(self, request, token, sop_instance_uid):
        """Render a shared DICOM instance as PNG."""
        import io

        import numpy as np
        import pydicom
        from PIL import Image
        from pydicom.errors import InvalidDicomError

        link = StudyShareAccessView._resolve(token)
        if isinstance(link, Response):
            return link
        pin_ok, pin_response = StudyShareAccessView._check_pin(request, link)
        if not pin_ok:
            return pin_response

        try:
            instance = DICOMInstance.objects.select_related("series__study").get(
                sop_instance_uid=sop_instance_uid,
                series__study=link.study,
            )
        except DICOMInstance.DoesNotExist:
            return Response(
                {"error": "Instance not found in this study."},
                status=status.HTTP_404_NOT_FOUND,
            )

        pacs = PACSStorageService(base_path=str(settings.MEDIA_ROOT))
        file_path = pacs.get_absolute_path(instance.file_path)

        if not os.path.exists(file_path):
            return Response(
                {"error": "DICOM file not found on disk."},
                status=status.HTTP_404_NOT_FOUND,
            )

        max_size = min(int(request.query_params.get("size", 512)), 2048)
        frame_index = int(request.query_params.get("frame", 0))
        window_center = request.query_params.get("window_center")
        window_width = request.query_params.get("window_width")

        try:
            ds = pydicom.dcmread(file_path)
            if not hasattr(ds, "PixelData"):
                return Response(
                    {"error": "DICOM instance has no pixel data."},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            pixel_array = ds.pixel_array.astype(float)

            if pixel_array.ndim == 3 and hasattr(ds, "NumberOfFrames"):
                num_frames = int(ds.NumberOfFrames)
                if frame_index >= num_frames:
                    frame_index = 0
                pixel_array = pixel_array[frame_index]
            elif pixel_array.ndim == 3:
                if pixel_array.shape[2] not in (3, 4):
                    pixel_array = pixel_array[0]

            if window_center is not None and window_width is not None:
                wc = float(window_center)
                ww = float(window_width)
                low = wc - ww / 2
                high = wc + ww / 2
                pixel_array = np.clip(pixel_array, low, high)
            elif hasattr(ds, "WindowCenter") and hasattr(ds, "WindowWidth"):
                wc = ds.WindowCenter
                ww = ds.WindowWidth
                if isinstance(wc, pydicom.multival.MultiValue):
                    wc = wc[0]
                if isinstance(ww, pydicom.multival.MultiValue):
                    ww = ww[0]
                low = float(wc) - float(ww) / 2
                high = float(wc) + float(ww) / 2
                pixel_array = np.clip(pixel_array, low, high)

            p_min = pixel_array.min()
            p_max = pixel_array.max()
            if p_max > p_min:
                pixel_array = ((pixel_array - p_min) / (p_max - p_min) * 255).astype(np.uint8)
            else:
                pixel_array = np.zeros_like(pixel_array, dtype=np.uint8)

            img = Image.fromarray(pixel_array)
            if img.mode not in ("L", "RGB"):
                img = img.convert("L")

            img.thumbnail((max_size, max_size), Image.Resampling.LANCZOS)

            buffer = io.BytesIO()
            img.save(buffer, format="PNG")
            buffer.seek(0)

            return HttpResponse(buffer.getvalue(), content_type="image/png")

        except (InvalidDicomError, OSError, ValueError, TypeError, AttributeError) as e:
            logger.exception("Failed to render shared DICOM frame: %s", e)
            return Response(
                {"error": "Failed to render image."},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )


# ============================================================================
# Imaging Equipment ViewSet (Phase E)
# ============================================================================
