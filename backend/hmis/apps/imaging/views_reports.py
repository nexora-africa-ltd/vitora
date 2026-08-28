# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
# ruff: noqa
"""Imaging views reports for Vitora HMIS.

What this file is for:
- Implement views reports logic for the imaging domain.

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

from hmis.apps.imaging.views_shared import _imaging_action_exceptions, get_client_ip


class RadiologyReportFilter(filters.FilterSet):
    """FilterSet for radiology reports."""

    from .models import RadiologyReport

    status = filters.CharFilter(field_name="status")
    is_critical = filters.BooleanFilter(field_name="is_critical")
    reported_by = filters.NumberFilter(field_name="reported_by")
    patient = filters.NumberFilter(field_name="imaging_order__patient")
    date_from = filters.DateFilter(field_name="created_at__date", lookup_expr="gte")
    date_to = filters.DateFilter(field_name="created_at__date", lookup_expr="lte")

    class Meta:
        model = RadiologyReport
        fields = ["status", "is_critical", "reported_by"]


class RadiologyReportViewSet(NestedTenantScopeMixin, viewsets.ModelViewSet):
    """
    ViewSet for radiology reports.

    Provides CRUD operations plus workflow actions:
    - sign: Finalize a draft/preliminary report
    - amend: Amend a finalized report
    - communicate_critical: Record critical finding communication
    - pdf: Generate PDF report

    Endpoints:
        GET    /api/imaging/reports/                  → list
        POST   /api/imaging/reports/                  → create draft
        GET    /api/imaging/reports/{report_number}/  → retrieve
        PATCH  /api/imaging/reports/{report_number}/  → update draft
        DELETE /api/imaging/reports/{report_number}/  → delete (draft only)
        POST   /api/imaging/reports/{report_number}/sign/    → finalize
        POST   /api/imaging/reports/{report_number}/amend/   → amend
        POST   /api/imaging/reports/{report_number}/communicate_critical/  → record comm
        GET    /api/imaging/reports/{report_number}/pdf/     → download PDF
    """

    from .models import RadiologyReport
    from .serializers import (
        AmendReportSerializer,
        CommunicateCriticalSerializer,
        RadiologyReportCreateSerializer,
        RadiologyReportSerializer,
        RadiologyReportUpdateSerializer,
        SignReportSerializer,
    )

    queryset = (
        RadiologyReport.objects.all()
        .select_related(
            "imaging_order",
            "imaging_order__patient",
            "study",
            "supersedes",
            "reported_by",
            "last_amended_by",
            "critical_communicated_by",
        )
        .prefetch_related("amendments", "superseding_reports", "imaging_order__items__procedure")
    )
    permission_classes = [IsAuthenticated, WriteRequiresRolePermission, ReadRequiresModelPermission]
    filter_backends = [filters.DjangoFilterBackend]
    filterset_class = RadiologyReportFilter
    lookup_field = "report_number"
    tenant_facility_chain = "imaging_order__encounter__facility"
    tenant_org_chain = "imaging_order__encounter__organization"

    def get_serializer_class(self):
        if self.action == "create":
            return RadiologyReportCreateSerializer
        elif self.action in ("update", "partial_update"):
            return RadiologyReportUpdateSerializer
        elif self.action == "sign":
            return SignReportSerializer
        elif self.action == "amend":
            return AmendReportSerializer
        elif self.action == "communicate_critical":
            return CommunicateCriticalSerializer
        return RadiologyReportSerializer

    def get_queryset(self):
        from .models import RadiologyReport

        queryset = (
            RadiologyReport.objects.all()
            .select_related(
                "imaging_order",
                "imaging_order__patient",
                "study",
                "supersedes",
                "reported_by",
                "last_amended_by",
                "critical_communicated_by",
            )
            .prefetch_related(
                "amendments", "superseding_reports", "imaging_order__items__procedure"
            )
        )

        # Filter by imaging order if provided
        order_number = self.request.query_params.get("order", None)
        if order_number:
            queryset = queryset.filter(imaging_order__order_number=order_number)
            active = queryset.filter(superseding_reports__isnull=True).order_by("-created_at")
            if active.exists():
                return active

        return queryset

    def create(self, request, *args, **kwargs):
        """Create a new radiology report draft."""
        from .serializers import RadiologyReportCreateSerializer, RadiologyReportSerializer

        imaging_order_id = request.data.get("imaging_order")
        if imaging_order_id:
            existing = (
                RadiologyReport.objects.filter(
                    imaging_order_id=imaging_order_id,
                    superseding_reports__isnull=True,
                )
                .order_by("-created_at")
                .first()
            )
            if existing is not None:
                output_serializer = RadiologyReportSerializer(existing)
                return Response(output_serializer.data, status=status.HTTP_200_OK)

        serializer = RadiologyReportCreateSerializer(
            data=request.data, context={"request": request}
        )
        serializer.is_valid(raise_exception=True)
        report = serializer.save()

        # Audit log
        AuditLog.log(
            action="radiology_report_create",
            user=request.user,
            resource_type="RadiologyReport",
            resource_id=report.id,
            ip_address=get_client_ip(request),
            details={
                "report_number": report.report_number,
                "order_number": report.imaging_order.order_number,
            },
        )

        output_serializer = RadiologyReportSerializer(report)
        return Response(output_serializer.data, status=status.HTTP_201_CREATED)

    def retrieve(self, request, *args, **kwargs):
        """Retrieve a radiology report."""
        instance = self.get_object()

        # Audit log
        AuditLog.log(
            action="radiology_report_view",
            user=request.user,
            resource_type="RadiologyReport",
            resource_id=instance.id,
            ip_address=get_client_ip(request),
            details={"report_number": instance.report_number},
        )

        serializer = self.get_serializer(instance)
        return Response(serializer.data)

    def update(self, request, *args, **kwargs):
        """Update a draft radiology report."""
        partial = kwargs.pop("partial", False)
        instance = self.get_object()

        if not instance.can_edit():
            return Response(
                {"error": "Cannot edit a signed/finalized report."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        from .serializers import RadiologyReportSerializer, RadiologyReportUpdateSerializer

        serializer = RadiologyReportUpdateSerializer(instance, data=request.data, partial=partial)
        serializer.is_valid(raise_exception=True)
        serializer.save()

        # Audit log
        AuditLog.log(
            action="radiology_report_update",
            user=request.user,
            resource_type="RadiologyReport",
            resource_id=instance.id,
            ip_address=get_client_ip(request),
            details={
                "report_number": instance.report_number,
                "changes": request.data,
            },
        )

        output_serializer = RadiologyReportSerializer(instance)
        return Response(output_serializer.data)

    def destroy(self, request, *args, **kwargs):
        """Delete a draft radiology report."""
        instance = self.get_object()

        if instance.status != "DRAFT":
            return Response(
                {"error": "Only DRAFT reports can be deleted."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        report_id = instance.id
        report_number = instance.report_number
        instance.delete()

        # Audit log
        AuditLog.log(
            action="radiology_report_delete",
            user=request.user,
            resource_type="RadiologyReport",
            resource_id=report_id,
            ip_address=get_client_ip(request),
            details={"report_number": report_number},
        )

        return Response(status=status.HTTP_204_NO_CONTENT)

    @action(detail=True, methods=["post"])
    def sign(self, request, report_number=None):
        """Sign and finalize a radiology report."""
        from .serializers import RadiologyReportSerializer

        report = self.get_object()

        try:
            report.sign(request.user)

            # Audit log
            AuditLog.log(
                action="radiology_report_sign",
                user=request.user,
                resource_type="RadiologyReport",
                resource_id=report.id,
                ip_address=get_client_ip(request),
                details={
                    "report_number": report.report_number,
                    "order_number": report.imaging_order.order_number,
                },
            )

            serializer = RadiologyReportSerializer(report)
            return Response(serializer.data)

        except _imaging_action_exceptions() as e:
            logger.exception("Error signing radiology report %s", report.pk)
            return Response(
                {"error": str(e)},
                status=status.HTTP_400_BAD_REQUEST,
            )

    @action(detail=True, methods=["post"])
    def amend(self, request, report_number=None):
        """Amend a finalized radiology report."""
        from .serializers import AmendReportSerializer, RadiologyReportSerializer

        report = self.get_object()
        serializer = AmendReportSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        reason = serializer.validated_data["reason"]
        new_findings = serializer.validated_data.get("findings", "")
        new_impression = serializer.validated_data.get("impression", "")

        try:
            # Store previous values for amendment record
            previous_findings = report.findings
            previous_impression = report.impression

            # Perform amendment
            report.amend(
                user=request.user,
                reason=reason,
                new_findings=new_findings if new_findings else None,
                new_impression=new_impression if new_impression else None,
            )

            # Create amendment record
            ReportAmendment.objects.create(
                report=report,
                amendment_number=report.amendment_count,
                reason=reason,
                previous_findings=previous_findings,
                previous_impression=previous_impression,
                new_findings=new_findings,
                new_impression=new_impression,
                amended_by=request.user,
            )

            # Audit log
            AuditLog.log(
                action="radiology_report_amend",
                user=request.user,
                resource_type="RadiologyReport",
                resource_id=report.id,
                ip_address=get_client_ip(request),
                details={
                    "report_number": report.report_number,
                    "amendment_number": report.amendment_count,
                    "reason": reason,
                },
            )

            output_serializer = RadiologyReportSerializer(report)
            return Response(output_serializer.data)

        except _imaging_action_exceptions() as e:
            logger.exception("Error amending radiology report %s", report.pk)
            return Response(
                {"error": str(e)},
                status=status.HTTP_400_BAD_REQUEST,
            )

    @action(detail=True, methods=["post"])
    def supersede(self, request, report_number=None):
        """Create a new draft report revision that supersedes this finalized report."""
        from .serializers import RadiologyReportSerializer

        report = self.get_object()
        if report.status not in ("FINAL", "AMENDED"):
            return Response(
                {"detail": "Only finalized reports can be superseded."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        existing = report.superseding_reports.order_by("-created_at").first()
        if existing is not None:
            serializer = RadiologyReportSerializer(existing)
            return Response(serializer.data, status=status.HTTP_200_OK)

        superseding = RadiologyReport.objects.create(
            imaging_order=report.imaging_order,
            study=report.study,
            technique=report.technique,
            comparison=report.comparison,
            findings=report.findings,
            impression=report.impression,
            recommendations=report.recommendations,
            is_critical=report.is_critical,
            critical_finding_description=report.critical_finding_description,
            reported_by=request.user,
            supersedes=report,
        )

        AuditLog.log(
            action="radiology_report_supersede",
            user=request.user,
            resource_type="RadiologyReport",
            resource_id=superseding.id,
            ip_address=get_client_ip(request),
            details={
                "report_number": superseding.report_number,
                "supersedes_report_number": report.report_number,
                "order_number": report.imaging_order.order_number,
            },
        )

        serializer = RadiologyReportSerializer(superseding)
        return Response(serializer.data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=["post"], url_path="communicate-critical")
    def communicate_critical(self, request, report_number=None):
        """Record communication of a critical finding."""
        from .serializers import CommunicateCriticalSerializer, RadiologyReportSerializer

        report = self.get_object()

        if not report.is_critical:
            return Response(
                {"error": "This report does not contain a critical finding."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        serializer = CommunicateCriticalSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        communicated_to = serializer.validated_data["communicated_to"]
        method = serializer.validated_data.get("method", "phone")

        report.communicate_critical(
            user=request.user,
            communicated_to=communicated_to,
            method=method,
        )

        # Audit log
        AuditLog.log(
            action="critical_finding_communicated",
            user=request.user,
            resource_type="RadiologyReport",
            resource_id=report.id,
            ip_address=get_client_ip(request),
            details={
                "report_number": report.report_number,
                "communicated_to": communicated_to,
                "method": method,
            },
        )

        output_serializer = RadiologyReportSerializer(report)
        return Response(output_serializer.data)

    @action(detail=True, methods=["get"])
    def pdf(self, request, report_number=None):
        """Generate and download PDF report."""
        from io import BytesIO

        from reportlab.lib import colors
        from reportlab.lib.pagesizes import A4
        from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
        from reportlab.lib.units import mm
        from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

        report = self.get_object()

        # Audit log
        AuditLog.log(
            action="radiology_report_pdf_download",
            user=request.user,
            resource_type="RadiologyReport",
            resource_id=report.id,
            ip_address=get_client_ip(request),
            details={"report_number": report.report_number},
        )

        # Build PDF
        buffer = BytesIO()
        doc = SimpleDocTemplate(
            buffer,
            pagesize=A4,
            leftMargin=20 * mm,
            rightMargin=20 * mm,
            topMargin=20 * mm,
            bottomMargin=20 * mm,
        )

        styles = getSampleStyleSheet()
        title_style = ParagraphStyle("Title", parent=styles["Heading1"], fontSize=16, spaceAfter=12)
        heading_style = ParagraphStyle(
            "Heading", parent=styles["Heading2"], fontSize=12, spaceBefore=12, spaceAfter=6
        )
        body_style = ParagraphStyle("Body", parent=styles["Normal"], fontSize=10, spaceAfter=6)
        critical_style = ParagraphStyle(
            "Critical", parent=body_style, textColor=colors.red, fontName="Helvetica-Bold"
        )

        elements = []

        # Header
        elements.append(Paragraph("RADIOLOGY REPORT", title_style))
        elements.append(Spacer(1, 6 * mm))

        # Report info table
        patient = report.imaging_order.patient
        info_data = [
            [
                "Report Number:",
                report.report_number,
                "Date:",
                report.created_at.strftime("%Y-%m-%d"),
            ],
            ["Patient:", f"{patient.first_name} {patient.last_name}", "MRN:", patient.mrn],
            ["Order:", report.imaging_order.order_number, "Status:", report.get_status_display()],
        ]
        info_table = Table(info_data, colWidths=[30 * mm, 55 * mm, 25 * mm, 55 * mm])
        info_table.setStyle(
            TableStyle(
                [
                    ("FONTSIZE", (0, 0), (-1, -1), 9),
                    ("FONTNAME", (0, 0), (0, -1), "Helvetica-Bold"),
                    ("FONTNAME", (2, 0), (2, -1), "Helvetica-Bold"),
                    ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
                ]
            )
        )
        elements.append(info_table)
        elements.append(Spacer(1, 8 * mm))

        # Critical finding alert
        if report.is_critical:
            elements.append(Paragraph("⚠️ CRITICAL FINDING", critical_style))
            if report.critical_finding_description:
                elements.append(Paragraph(report.critical_finding_description, critical_style))
            if report.critical_communicated:
                comm_text = (
                    f"Communicated to {report.critical_communicated_to} "
                    f"via {report.critical_communicated_method} "
                    f"on {report.critical_communicated_at.strftime('%Y-%m-%d %H:%M') if report.critical_communicated_at else 'N/A'}"
                )
                elements.append(Paragraph(comm_text, body_style))
            elements.append(Spacer(1, 6 * mm))

        # Report content
        if report.technique:
            elements.append(Paragraph("TECHNIQUE", heading_style))
            elements.append(Paragraph(report.technique, body_style))

        if report.comparison:
            elements.append(Paragraph("COMPARISON", heading_style))
            elements.append(Paragraph(report.comparison, body_style))

        elements.append(Paragraph("FINDINGS", heading_style))
        elements.append(Paragraph(report.findings.replace("\n", "<br/>"), body_style))

        elements.append(Paragraph("IMPRESSION", heading_style))
        elements.append(Paragraph(report.impression.replace("\n", "<br/>"), body_style))

        if report.recommendations:
            elements.append(Paragraph("RECOMMENDATIONS", heading_style))
            elements.append(Paragraph(report.recommendations, body_style))

        elements.append(Spacer(1, 12 * mm))

        # Signature block
        radiologist_name = report.reported_by.get_full_name() or report.reported_by.username
        if report.signed_at:
            sign_text = f"Electronically signed by {radiologist_name} on {report.signed_at.strftime('%Y-%m-%d %H:%M')}"
        else:
            sign_text = f"DRAFT - Not yet signed. Prepared by {radiologist_name}"
        elements.append(Paragraph(sign_text, body_style))

        # Amendment history
        if report.amendment_count > 0:
            elements.append(Spacer(1, 8 * mm))
            elements.append(Paragraph("AMENDMENT HISTORY", heading_style))
            for amendment in report.amendments.all().order_by("amendment_number"):
                amend_text = (
                    f"Amendment #{amendment.amendment_number}: "
                    f"{amendment.reason} "
                    f"(by {amendment.amended_by.get_full_name() or amendment.amended_by.username} "
                    f"on {amendment.amended_at.strftime('%Y-%m-%d %H:%M')})"
                )
                elements.append(Paragraph(amend_text, body_style))

        # Footer
        elements.append(Spacer(1, 12 * mm))
        elements.append(
            Paragraph(
                "This report was generated by Vitora HMIS. "
                "It is electronically signed and valid without a physical signature.",
                ParagraphStyle("Footer", parent=body_style, fontSize=8, textColor=colors.gray),
            )
        )

        doc.build(elements)
        buffer.seek(0)

        response = HttpResponse(buffer.getvalue(), content_type="application/pdf")
        response["Content-Disposition"] = f'attachment; filename="{report.report_number}.pdf"'
        return response


# ============================================================================
# Public Share Views (token-authenticated, no JWT)
# ============================================================================
