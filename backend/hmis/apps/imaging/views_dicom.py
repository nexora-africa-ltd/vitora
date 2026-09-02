# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
# ruff: noqa: ARG002, E402, F401, SIM105, SIM115
"""Imaging views dicom for Vitora HMIS.

What this file is for:
- Implement views dicom logic for the imaging domain.

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

from hmis.apps.imaging.views_shared import (
    _can_access_instance_for_tenant,
    _has_dicom_read_permission,
    _imaging_action_exceptions,
    get_client_ip,
)


class DICOMStudyViewSet(viewsets.ReadOnlyModelViewSet):
    """
    ViewSet for DICOM studies.

    Provides list, retrieve, upload, and delete operations.
    Studies are looked up by study_instance_uid.

    Endpoints:
        GET    /api/imaging/studies/                     → list
        GET    /api/imaging/studies/{uid}/                → retrieve (detail + series)
        POST   /api/imaging/studies/upload/               → upload DICOM files
        DELETE /api/imaging/studies/{uid}/                → delete study + PACS files
        GET    /api/imaging/studies/{uid}/series/         → list series
        GET    /api/imaging/studies/{uid}/instances/      → list all instances
    """

    queryset = (
        DICOMStudy.objects.all()
        .select_related("patient", "imaging_order", "uploaded_by")
        .prefetch_related("series_set", "series_set__instances")
    )
    permission_classes = [IsAuthenticated, WriteRequiresRolePermission, ReadRequiresModelPermission]
    lookup_field = "study_instance_uid"
    lookup_value_regex = r"[\d.]+"  # DICOM UIDs contain digits and dots

    def get_serializer_class(self):
        if self.action == "retrieve":
            return DICOMStudyDetailSerializer
        return DICOMStudySerializer

    def get_queryset(self):
        queryset = super().get_queryset()
        user = self.request.user

        # Superusers see all studies
        if user.is_superuser:
            pass
        else:
            # Resolve tenant from request headers / user profile
            resolve_request_tenant(self.request)
            org = getattr(self.request, "organization", None)

            if org:
                # Show studies where patient belongs to same org, OR uploaded by current user
                queryset = queryset.filter(
                    models.Q(patient__organization=org) | models.Q(uploaded_by=user)
                )
            else:
                # No org context — only show studies uploaded by this user
                queryset = queryset.filter(uploaded_by=user)

        # Filter by patient
        patient = self.request.query_params.get("patient")
        if patient:
            queryset = queryset.filter(patient_id=patient)

        # Filter by modality
        modality = self.request.query_params.get("modality")
        if modality:
            queryset = queryset.filter(modality=modality)

        # Search before pagination so matches are returned from the full study set.
        search = self.request.query_params.get("search", "").strip()
        if search:
            queryset = queryset.filter(
                models.Q(patient__first_name__icontains=search)
                | models.Q(patient__last_name__icontains=search)
                | models.Q(patient__mrn__icontains=search)
                | models.Q(accession_number__icontains=search)
                | models.Q(study_description__icontains=search)
                | models.Q(study_instance_uid__icontains=search)
            )

        # Filter by date range
        date_after = self.request.query_params.get("study_date_after")
        date_before = self.request.query_params.get("study_date_before")
        if date_after:
            queryset = queryset.filter(study_date__gte=date_after)
        if date_before:
            queryset = queryset.filter(study_date__lte=date_before)

        # Filter by imaging order
        imaging_order = self.request.query_params.get("imaging_order")
        if imaging_order:
            queryset = queryset.filter(imaging_order_id=imaging_order)

        return queryset

    def destroy(self, request, *args, **kwargs):
        """
        Delete a DICOM study and clean up PACS files.

        Removes all series, instances (via cascade) and the
        corresponding files from the filesystem.
        """
        instance = self.get_object()
        study_uid = instance.study_instance_uid
        study_id = instance.pk

        thumb_paths = set(
            filter(
                None,
                [
                    instance.thumbnail_path,
                    *instance.series_set.exclude(thumbnail_path="").values_list(
                        "thumbnail_path", flat=True
                    ),
                    *DICOMInstance.objects.filter(series__study=instance)
                    .exclude(thumbnail_path="")
                    .values_list("thumbnail_path", flat=True),
                ],
            )
        )

        # Delete PACS files first
        pacs = PACSStorageService(base_path=str(settings.MEDIA_ROOT))
        pacs.delete_study(study_uid)

        # Delete thumbnails associated with this study.
        for thumb_path in thumb_paths:
            try:
                pacs.delete_instance(thumb_path)
            except OSError:
                pass  # Best-effort cleanup

        instance.delete()

        AuditLog.log(
            action="dicom_delete",
            user=request.user,
            resource_type="DICOMStudy",
            resource_id=study_id,
            ip_address=get_client_ip(request),
            details={"study_instance_uid": study_uid},
        )

        return Response(status=status.HTTP_204_NO_CONTENT)

    @action(detail=True, methods=["get"])
    def series(self, request, study_instance_uid=None):
        """List all series within a study."""
        study = self.get_object()
        series_qs = study.series_set.all()
        serializer = DICOMSeriesListSerializer(series_qs, many=True)
        return Response(serializer.data)

    @action(detail=True, methods=["get"])
    def instances(self, request, study_instance_uid=None):
        """List all instances across all series in a study.

        Query Parameters:
            series: Filter by series_instance_uid (optional).
        """
        study = self.get_object()
        instances_qs = DICOMInstance.objects.filter(series__study=study).select_related("series")

        series_uid = request.query_params.get("series")
        if series_uid:
            instances_qs = instances_qs.filter(series__series_instance_uid=series_uid)

        serializer = DICOMInstanceSerializer(instances_qs, many=True)
        return Response(serializer.data)

    @action(detail=True, methods=["get"], url_path="download")
    def download(self, request, study_instance_uid=None):
        """
        Download all DICOM instances for a study as a single ZIP archive.

        The archive layout is:
            {study_uid}/
                {series_uid}/
                    {sop_uid}.dcm
        """
        import zipfile
        from io import BytesIO

        study = self.get_object()
        instances = DICOMInstance.objects.filter(series__study=study).select_related("series")
        if not instances.exists():
            return Response(
                {"error": "Study has no instances."},
                status=status.HTTP_404_NOT_FOUND,
            )

        pacs = PACSStorageService(base_path=str(settings.MEDIA_ROOT))
        buf = BytesIO()
        included = 0
        with zipfile.ZipFile(buf, mode="w", compression=zipfile.ZIP_STORED) as zf:
            for inst in instances:
                if not pacs.file_exists(inst.file_path):
                    logger.warning("DICOM file missing during download: %s", inst.file_path)
                    continue
                arc = (
                    f"{study.study_instance_uid}/"
                    f"{inst.series.series_instance_uid}/"
                    f"{inst.sop_instance_uid}.dcm"
                )
                zf.writestr(arc, pacs.read_bytes(inst.file_path))
                included += 1

        if included == 0:
            return Response(
                {"error": "No DICOM files available on disk."},
                status=status.HTTP_404_NOT_FOUND,
            )

        AuditLog.log(
            action="dicom_download",
            user=request.user,
            resource_type="DICOMStudy",
            resource_id=study.pk,
            ip_address=get_client_ip(request),
            details={
                "study_instance_uid": study.study_instance_uid,
                "instances_included": included,
            },
        )

        buf.seek(0)
        filename = f"study-{study.study_instance_uid[:30]}.zip"
        response = HttpResponse(buf.getvalue(), content_type="application/zip")
        response["Content-Disposition"] = f'attachment; filename="{filename}"'
        response["Content-Length"] = str(buf.tell())
        return response

    @action(detail=True, methods=["get", "post"], url_path="share")
    def share(self, request, study_instance_uid=None):
        """
        GET  → list active share links for this study
        POST → create a new share link

        POST body:
            purpose: REFERRAL|PATIENT_COPY|RESEARCH|INSURANCE|OTHER (default REFERRAL)
            recipient_name: optional human-readable recipient
            recipient_email: optional
            notes: optional
            pin: optional 4-12 digit PIN (will be hashed)
            expires_in_hours: 1-720 (default 168 = 7 days)
            max_views: 0 unlimited (default), else 1-1000
            allow_download: bool (default false)
        """
        from django.contrib.auth.hashers import make_password
        from django.utils import timezone

        from .models import StudyShareLink

        study = self.get_object()

        if request.method.lower() == "get":
            links = study.share_links.select_related("created_by").order_by("-created_at")
            data = [
                _serialize_share_link(link, request=request, include_token=True) for link in links
            ]
            return Response({"results": data})

        # POST: create
        purpose = request.data.get("purpose", "REFERRAL")
        valid_purposes = {choice[0] for choice in StudyShareLink.PURPOSE_CHOICES}
        if purpose not in valid_purposes:
            return Response(
                {"error": f"Invalid purpose. Must be one of {sorted(valid_purposes)}."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            expires_in_hours = int(request.data.get("expires_in_hours", 168))
        except (TypeError, ValueError):
            return Response(
                {"error": "expires_in_hours must be an integer."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if not 1 <= expires_in_hours <= 720:
            return Response(
                {"error": "expires_in_hours must be between 1 and 720 (max 30 days)."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            max_views = int(request.data.get("max_views", 0))
        except (TypeError, ValueError):
            max_views = 0
        if max_views < 0 or max_views > 1000:
            return Response(
                {"error": "max_views must be between 0 and 1000."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        pin = (request.data.get("pin") or "").strip()
        pin_hash = make_password(pin) if pin else ""

        import secrets

        token = secrets.token_urlsafe(32)

        link = StudyShareLink.objects.create(
            study=study,
            token=token,
            purpose=purpose,
            recipient_name=request.data.get("recipient_name", "")[:200],
            recipient_email=request.data.get("recipient_email", "")[:200],
            notes=request.data.get("notes", ""),
            pin_hash=pin_hash,
            expires_at=timezone.now() + timezone.timedelta(hours=expires_in_hours),
            max_views=max_views,
            allow_download=bool(request.data.get("allow_download", False)),
            created_by=request.user,
        )

        AuditLog.log(
            action="dicom_share_created",
            user=request.user,
            resource_type="DICOMStudy",
            resource_id=study.pk,
            ip_address=get_client_ip(request),
            details={
                "study_instance_uid": study.study_instance_uid,
                "share_link_id": link.pk,
                "purpose": purpose,
                "expires_at": link.expires_at.isoformat(),
                "recipient_name": link.recipient_name,
                "max_views": max_views,
                "allow_download": link.allow_download,
                "pin_protected": bool(pin),
            },
        )

        return Response(
            _serialize_share_link(link, request=request, include_token=True),
            status=status.HTTP_201_CREATED,
        )

    @action(
        detail=True,
        methods=["delete"],
        url_path=r"share/(?P<link_id>\d+)",
    )
    def revoke_share(self, request, study_instance_uid=None, link_id=None):
        """Revoke an existing share link."""
        study = self.get_object()
        try:
            link = study.share_links.get(pk=link_id)
        except study.share_links.model.DoesNotExist:
            return Response(
                {"error": "Share link not found."},
                status=status.HTTP_404_NOT_FOUND,
            )
        link.revoke()
        AuditLog.log(
            action="dicom_share_revoked",
            user=request.user,
            resource_type="DICOMStudy",
            resource_id=study.pk,
            ip_address=get_client_ip(request),
            details={
                "study_instance_uid": study.study_instance_uid,
                "share_link_id": link.pk,
            },
        )
        return Response(status=status.HTTP_204_NO_CONTENT)


def _serialize_share_link(link, *, request=None, include_token: bool = False) -> dict:
    """Lightweight serializer for StudyShareLink (avoid full DRF serializer overhead)."""
    base_url = ""
    if request is not None:
        # Build absolute share URL (frontend route)
        scheme = "https" if request.is_secure() else "http"
        host = request.get_host()
        base_url = f"{scheme}://{host}"

    data = {
        "id": link.pk,
        "purpose": link.purpose,
        "recipient_name": link.recipient_name,
        "recipient_email": link.recipient_email,
        "notes": link.notes,
        "expires_at": link.expires_at.isoformat(),
        "revoked_at": link.revoked_at.isoformat() if link.revoked_at else None,
        "max_views": link.max_views,
        "view_count": link.view_count,
        "allow_download": link.allow_download,
        "pin_protected": bool(link.pin_hash),
        "created_at": link.created_at.isoformat(),
        "created_by": link.created_by_id,
        "created_by_name": (
            link.created_by.get_full_name() or link.created_by.username if link.created_by else ""
        ),
        "last_accessed_at": (link.last_accessed_at.isoformat() if link.last_accessed_at else None),
        "is_usable": link.is_usable,
    }
    if include_token:
        data["token"] = link.token
        if base_url:
            data["share_url"] = f"{base_url}/imaging/share/{link.token}"
    return data


class DICOMUploadView(APIView):
    """
    Handle DICOM file uploads.

    POST /api/imaging/studies/upload/

    Accepts multipart form data with one or more DICOM files.
    Parses metadata from each file, stores them in PACS, and creates
    DICOMStudy/DICOMSeries/DICOMInstance records.

    Request params:
        files: One or more .dcm files (multipart)
        imaging_order: (optional) ID of the imaging order to link
        patient: (optional) ID of the patient (required if no imaging_order)
    """

    permission_classes = [IsAuthenticated, WriteRequiresRolePermission, ReadRequiresModelPermission]
    parser_classes = [MultiPartParser, FormParser]

    @extend_schema(
        request={
            "multipart/form-data": {
                "type": "object",
                "properties": {
                    "files": {"type": "array", "items": {"type": "string", "format": "binary"}},
                    "imaging_order": {"type": "integer"},
                    "patient": {"type": "integer"},
                },
            }
        },
        responses={200: OpenApiTypes.OBJECT},
    )
    def post(self, request):
        """Upload one or more DICOM files."""
        files = request.FILES.getlist("files")
        if not files:
            return Response(
                {"error": "No DICOM files provided."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # --- Upload safety limits ---
        MAX_FILES = 50
        MAX_FILE_SIZE_MB = 200
        max_file_bytes = MAX_FILE_SIZE_MB * 1024 * 1024

        if len(files) > MAX_FILES:
            return Response(
                {"error": f"Too many files. Maximum {MAX_FILES} files per upload."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        ALLOWED_EXTENSIONS = {"dcm", "dicom"}
        for f in files:
            ext = f.name.rsplit(".", 1)[-1].lower() if "." in f.name else ""
            if ext not in ALLOWED_EXTENSIONS:
                return Response(
                    {
                        "error": f"File '{f.name}' has disallowed extension '.{ext}'. Allowed: dcm, dicom"
                    },
                    status=status.HTTP_400_BAD_REQUEST,
                )
            if f.size and f.size > max_file_bytes:
                return Response(
                    {"error": f"File '{f.name}' exceeds {MAX_FILE_SIZE_MB} MB limit."},
                    status=status.HTTP_400_BAD_REQUEST,
                )

        # Resolve the imaging order (optional)
        imaging_order = None
        order_id = request.data.get("imaging_order")
        if order_id:
            try:
                imaging_order = ImagingOrder.objects.get(pk=order_id)
            except ImagingOrder.DoesNotExist:
                return Response(
                    {"error": f"Imaging order {order_id} not found."},
                    status=status.HTTP_404_NOT_FOUND,
                )

        # Resolve patient
        patient = None
        if imaging_order:
            patient = imaging_order.patient
        else:
            from hmis.apps.patients.models import Patient

            patient_id = request.data.get("patient")
            if patient_id:
                try:
                    patient = Patient.objects.get(pk=patient_id)
                except Patient.DoesNotExist:
                    return Response(
                        {"error": f"Patient {patient_id} not found."},
                        status=status.HTTP_404_NOT_FOUND,
                    )

        if patient is None:
            return Response(
                {"error": "Either imaging_order or patient must be provided."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        pacs = PACSStorageService(base_path=str(settings.MEDIA_ROOT))

        # Parse and store each file
        instances_created = 0
        duplicates_skipped = 0
        instances_created_by_study: dict[str, int] = defaultdict(int)
        affected_study_uids: list[str] = []
        affected_studies_by_uid: dict[str, DICOMStudy] = {}
        seen_study_uids: set[str] = set()
        study_uid = None
        first_study = None
        errors = []

        for uploaded_file in files:
            # Write to temp file for parsing
            try:
                with tempfile.NamedTemporaryFile(suffix=".dcm", delete=False) as tmp:
                    for chunk in uploaded_file.chunks():
                        tmp.write(chunk)
                    tmp_path = tmp.name

                # Validate
                is_valid, validation_errors = DICOMParsingService.validate_dicom_file(tmp_path)
                if not is_valid:
                    errors.append(
                        {
                            "file": uploaded_file.name,
                            "errors": validation_errors,
                        }
                    )
                    os.unlink(tmp_path)
                    continue

                # Parse metadata
                metadata = DICOMParsingService.parse_file(tmp_path)

                # Store in PACS
                m_study_uid = metadata["study_instance_uid"]
                m_series_uid = metadata["series_instance_uid"]
                m_sop_uid = metadata["sop_instance_uid"]

                if m_study_uid not in seen_study_uids:
                    seen_study_uids.add(m_study_uid)
                    affected_study_uids.append(m_study_uid)

                stored_path = pacs.store_file(
                    tmp_path,
                    m_study_uid,
                    m_series_uid,
                    sop_uid=m_sop_uid,
                    move=True,
                )

                # Create or get DICOMStudy
                dicom_study, _created = DICOMStudy.objects.get_or_create(
                    study_instance_uid=m_study_uid,
                    defaults={
                        "patient": patient,
                        "imaging_order": imaging_order,
                        "study_date": metadata["study_date"] or datetime.now().date(),
                        "study_time": metadata.get("study_time"),
                        "study_description": metadata.get("study_description", ""),
                        "accession_number": metadata.get("accession_number", ""),
                        "referring_physician_name": metadata.get("referring_physician_name", ""),
                        "modality": metadata["modality"],
                        "institution_name": metadata.get("institution_name", ""),
                        "station_name": metadata.get("station_name", ""),
                        "manufacturer": metadata.get("manufacturer", ""),
                        "manufacturer_model_name": metadata.get("manufacturer_model_name", ""),
                        "device_serial_number": metadata.get("device_serial_number", ""),
                        "source": "UPLOAD",
                        "uploaded_by": request.user,
                    },
                )
                affected_studies_by_uid[m_study_uid] = dicom_study

                # Resolve equipment from DICOM tags (auto-registers on first contact)
                if _created and dicom_study.equipment_id is None:
                    facility = getattr(request, "facility", None) or getattr(
                        patient, "facility", None
                    )
                    organization = getattr(request, "organization", None) or getattr(
                        patient, "organization", None
                    )
                    if facility:
                        equipment = resolve_equipment_from_metadata(
                            metadata,
                            facility=facility,
                            organization=organization,
                        )
                        if equipment:
                            dicom_study.equipment = equipment
                            dicom_study.save(update_fields=["equipment"])

                if study_uid is None:
                    study_uid = m_study_uid
                    first_study = dicom_study

                # Create or get DICOMSeries
                dicom_series, _created = DICOMSeries.objects.get_or_create(
                    series_instance_uid=m_series_uid,
                    defaults={
                        "study": dicom_study,
                        "series_number": metadata.get("series_number"),
                        "series_description": metadata.get("series_description", ""),
                        "modality": metadata["modality"],
                        "body_part_examined": metadata.get("body_part_examined", ""),
                    },
                )

                # Create DICOMInstance (skip if already exists)
                dicom_instance, created = DICOMInstance.objects.get_or_create(
                    sop_instance_uid=m_sop_uid,
                    defaults={
                        "series": dicom_series,
                        "sop_class_uid": metadata.get("sop_class_uid", ""),
                        "instance_number": metadata.get("instance_number"),
                        "file_path": stored_path,
                        "file_size": metadata.get("file_size", 0),
                        "transfer_syntax_uid": metadata.get("transfer_syntax_uid", ""),
                        "rows": metadata.get("rows"),
                        "columns": metadata.get("columns"),
                        "bits_allocated": metadata.get("bits_allocated"),
                        "photometric_interpretation": metadata.get(
                            "photometric_interpretation", ""
                        ),
                    },
                )

                if created:
                    instances_created += 1
                    instances_created_by_study[m_study_uid] += 1

                    # Populate thumbnails from the first available instance for
                    # each entity (instance, series, study).
                    if (
                        not dicom_instance.thumbnail_path
                        or not dicom_series.thumbnail_path
                        or not dicom_study.thumbnail_path
                    ):
                        with pacs.materialize_temp_file(stored_path, suffix=".dcm") as local_path:
                            thumb_bytes, thumb_sop_uid = (
                                DICOMParsingService.generate_thumbnail_bytes(local_path)
                            )
                        thumb_path = None
                        if thumb_bytes:
                            thumb_uid = thumb_sop_uid or m_sop_uid
                            thumb_path = os.path.join("thumbnails", f"{thumb_uid}.jpg").replace(
                                "\\", "/"
                            )
                            pacs.save_bytes(thumb_path, thumb_bytes, content_type="image/jpeg")
                        if thumb_path:
                            if not dicom_instance.thumbnail_path:
                                dicom_instance.thumbnail_path = thumb_path
                                dicom_instance.save(update_fields=["thumbnail_path"])
                            if not dicom_series.thumbnail_path:
                                dicom_series.thumbnail_path = thumb_path
                                dicom_series.save(update_fields=["thumbnail_path"])
                            if not dicom_study.thumbnail_path:
                                dicom_study.thumbnail_path = thumb_path
                                dicom_study.save(update_fields=["thumbnail_path"])
                else:
                    duplicates_skipped += 1

            except _imaging_action_exceptions() as exc:
                logger.exception("Error processing DICOM file %s", uploaded_file.name)
                errors.append({"file": uploaded_file.name, "errors": [str(exc)]})
                # Clean up temp file
                if "tmp_path" in locals() and os.path.exists(tmp_path):
                    os.unlink(tmp_path)
                continue

        # If ALL files failed, return 400
        if instances_created == 0:
            # Distinguish between "all invalid" and "all duplicates"
            if not errors:
                return Response(
                    {
                        "error": "All files already exist in PACS (duplicate SOP Instance UIDs). No new instances were created.",
                        "duplicates_skipped": duplicates_skipped,
                        "details": [],
                    },
                    status=status.HTTP_409_CONFLICT,
                )
            return Response(
                {
                    "error": "No valid DICOM files could be processed.",
                    "details": errors,
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Update study statistics for every affected study in the batch.
        for uid in affected_study_uids:
            study = affected_studies_by_uid.get(uid)
            if study:
                _update_study_statistics(study)

        # Update imaging order with first study metadata (legacy behavior).
        if first_study and imaging_order:
            _link_study_to_order(imaging_order, first_study)

        # Audit log
        AuditLog.log(
            action="dicom_upload",
            user=request.user,
            resource_type="DICOMStudy",
            resource_id=first_study.pk if first_study else 0,
            ip_address=get_client_ip(request),
            details={
                "study_instance_uid": study_uid,
                "study_instance_uids": affected_study_uids,
                "instances_created": instances_created,
                "duplicates_skipped": duplicates_skipped,
                "instances_created_by_study": dict(instances_created_by_study),
                "files_submitted": len(files),
                "errors": errors,
            },
        )

        response_data = {
            "study_instance_uid": study_uid,
            "study_instance_uids": affected_study_uids,
            "instances_created": instances_created,
            "duplicates_skipped": duplicates_skipped,
            "instances_created_by_study": dict(instances_created_by_study),
            "files_submitted": len(files),
        }
        if errors:
            response_data["errors"] = errors

        return Response(response_data, status=status.HTTP_201_CREATED)


class DICOMRetrieveView(APIView):
    """
    WADO-RS lite endpoint for retrieving DICOM instances.

    GET /api/imaging/dicom/{sop_instance_uid}/

    Returns the raw DICOM file with appropriate content-type headers.
    """

    permission_classes = [IsAuthenticated, WriteRequiresRolePermission, ReadRequiresModelPermission]

    @extend_schema(
        responses={
            200: {
                "type": "string",
                "format": "binary",
                "description": "DICOM file",
            }
        },
    )
    def get(self, request, sop_instance_uid):
        """Retrieve a DICOM instance file by SOP Instance UID."""
        try:
            instance = DICOMInstance.objects.select_related("series__study__patient").get(
                sop_instance_uid=sop_instance_uid
            )
        except DICOMInstance.DoesNotExist:
            return Response(
                {"error": "DICOM instance not found."},
                status=status.HTTP_404_NOT_FOUND,
            )

        if not _has_dicom_read_permission(request.user):
            AuditLog.log(
                action="dicom_retrieve_denied",
                user=request.user,
                resource_type="DICOMInstance",
                resource_id=instance.pk,
                ip_address=get_client_ip(request),
                details={
                    "reason": "missing_read_permission",
                    "sop_instance_uid": sop_instance_uid,
                },
            )
            return Response(
                {"error": "You do not have permission to view DICOM instances."},
                status=status.HTTP_403_FORBIDDEN,
            )

        if not _can_access_instance_for_tenant(request, instance):
            AuditLog.log(
                action="dicom_retrieve_denied",
                user=request.user,
                resource_type="DICOMInstance",
                resource_id=instance.pk,
                ip_address=get_client_ip(request),
                details={
                    "reason": "tenant_scope_denied",
                    "sop_instance_uid": sop_instance_uid,
                    "study_instance_uid": instance.series.study.study_instance_uid,
                },
            )
            return Response(
                {"error": "DICOM instance not found for this tenant context."},
                status=status.HTTP_404_NOT_FOUND,
            )

        pacs = PACSStorageService(base_path=str(settings.MEDIA_ROOT))
        if not pacs.file_exists(instance.file_path):
            logger.error("DICOM file missing from PACS: %s", instance.file_path)
            return Response(
                {"error": "DICOM file not found in storage."},
                status=status.HTTP_404_NOT_FOUND,
            )

        # Audit log
        AuditLog.log(
            action="dicom_retrieve",
            user=request.user,
            resource_type="DICOMInstance",
            resource_id=instance.pk,
            ip_address=get_client_ip(request),
            details={
                "sop_instance_uid": sop_instance_uid,
                "study_instance_uid": instance.series.study.study_instance_uid,
            },
        )

        filename = f"{sop_instance_uid}.dcm"
        response = FileResponse(
            pacs.open_file(instance.file_path), content_type="application/dicom"
        )
        response["Content-Disposition"] = f'attachment; filename="{filename}"'
        return response


class DICOMFrameRenderView(APIView):
    """
    Render a DICOM instance as a PNG image for web display.

    GET /api/imaging/dicom/{sop_instance_uid}/frame/

    Query parameters:
    - size: Maximum dimension in pixels (default: 512, max: 2048)
    - frame: Frame index for multi-frame DICOM (default: 0)
    - window_center: Window center for display (optional)
    - window_width: Window width for display (optional)

    Returns PNG image with appropriate content-type headers.
    """

    permission_classes = [IsAuthenticated, WriteRequiresRolePermission, ReadRequiresModelPermission]

    @extend_schema(
        parameters=[
            OpenApiParameter(
                "size",
                type=int,
                required=False,
                description="Maximum dimension in pixels (default: 512)",
            ),
            OpenApiParameter(
                "frame",
                type=int,
                required=False,
                description="Frame index for multi-frame DICOM (default: 0)",
            ),
            OpenApiParameter(
                "window_center",
                type=float,
                required=False,
                description="Window center override",
            ),
            OpenApiParameter(
                "window_width",
                type=float,
                required=False,
                description="Window width override",
            ),
        ],
        responses={
            200: {
                "type": "string",
                "format": "binary",
                "description": "PNG image",
            }
        },
    )
    def get(self, request, sop_instance_uid):
        """Render a DICOM instance as PNG."""
        import io

        import numpy as np
        import pydicom
        from PIL import Image
        from pydicom.errors import InvalidDicomError

        try:
            instance = DICOMInstance.objects.select_related("series__study__patient").get(
                sop_instance_uid=sop_instance_uid
            )
        except DICOMInstance.DoesNotExist:
            return Response(
                {"error": "DICOM instance not found."},
                status=status.HTTP_404_NOT_FOUND,
            )

        if not _has_dicom_read_permission(request.user):
            AuditLog.log(
                action="dicom_frame_denied",
                user=request.user,
                resource_type="DICOMInstance",
                resource_id=instance.pk,
                ip_address=get_client_ip(request),
                details={
                    "reason": "missing_read_permission",
                    "sop_instance_uid": sop_instance_uid,
                },
            )
            return Response(
                {"error": "You do not have permission to view DICOM instances."},
                status=status.HTTP_403_FORBIDDEN,
            )

        if not _can_access_instance_for_tenant(request, instance):
            AuditLog.log(
                action="dicom_frame_denied",
                user=request.user,
                resource_type="DICOMInstance",
                resource_id=instance.pk,
                ip_address=get_client_ip(request),
                details={
                    "reason": "tenant_scope_denied",
                    "sop_instance_uid": sop_instance_uid,
                    "study_instance_uid": instance.series.study.study_instance_uid,
                },
            )
            return Response(
                {"error": "DICOM instance not found for this tenant context."},
                status=status.HTTP_404_NOT_FOUND,
            )

        pacs = PACSStorageService(base_path=str(settings.MEDIA_ROOT))
        if not pacs.file_exists(instance.file_path):
            logger.error("DICOM file missing from PACS: %s", instance.file_path)
            return Response(
                {"error": "DICOM file not found in storage."},
                status=status.HTTP_404_NOT_FOUND,
            )

        # Parse query parameters
        max_size = min(int(request.query_params.get("size", 512)), 2048)
        frame_index = int(request.query_params.get("frame", 0))
        window_center = request.query_params.get("window_center")
        window_width = request.query_params.get("window_width")

        try:
            with pacs.materialize_temp_file(instance.file_path, suffix=".dcm") as local_path:
                ds = pydicom.dcmread(local_path)
            if not hasattr(ds, "PixelData"):
                return Response(
                    {"error": "DICOM instance has no pixel data."},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            pixel_array = ds.pixel_array.astype(float)

            # Handle multi-frame
            if pixel_array.ndim == 3 and hasattr(ds, "NumberOfFrames"):
                num_frames = int(ds.NumberOfFrames)
                if frame_index >= num_frames:
                    frame_index = 0  # Fallback to first frame
                pixel_array = pixel_array[frame_index]
            elif pixel_array.ndim == 3:
                # Could be RGB or first slice
                if pixel_array.shape[2] not in (3, 4):
                    pixel_array = pixel_array[0]

            # Apply windowing
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

            # Normalize to 0-255
            p_min = pixel_array.min()
            p_max = pixel_array.max()
            if p_max > p_min:
                pixel_array = ((pixel_array - p_min) / (p_max - p_min) * 255).astype(np.uint8)
            else:
                pixel_array = np.zeros_like(pixel_array, dtype=np.uint8)

            # Create PIL image
            img = Image.fromarray(pixel_array)
            if img.mode not in ("L", "RGB"):
                img = img.convert("L")

            # Resize maintaining aspect ratio
            img.thumbnail((max_size, max_size), Image.Resampling.LANCZOS)

            # Save to bytes
            buffer = io.BytesIO()
            img.save(buffer, format="PNG")
            buffer.seek(0)

            return HttpResponse(
                buffer.getvalue(),
                content_type="image/png",
            )

        except (InvalidDicomError, OSError, ValueError, TypeError, AttributeError) as e:
            logger.exception("Failed to render DICOM frame: %s", e)
            return Response(
                {"error": "Failed to render image."},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )


# ============================================================================
# DICOM Helpers
# ============================================================================


def _update_study_statistics(study: DICOMStudy) -> None:
    """Recalculate series/instance counts and total file size for a study."""
    recompute_study_statistics(study)


def _link_study_to_order(order: ImagingOrder, study: DICOMStudy) -> None:
    """
    Link a DICOM study to its imaging order.

    Updates the order's accession_number and study_instance_uid fields
    from the DICOM study metadata.
    """
    update_fields = []

    if study.accession_number and not order.accession_number:
        order.accession_number = study.accession_number
        update_fields.append("accession_number")

    if study.study_instance_uid and not order.study_instance_uid:
        order.study_instance_uid = study.study_instance_uid
        update_fields.append("study_instance_uid")

    if update_fields:
        order.save(update_fields=update_fields)


# ============================================================================
# Radiology Report Views (Phase D)
# ============================================================================
