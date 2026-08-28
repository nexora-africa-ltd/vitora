# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
# ruff: noqa
"""Laboratory views instruments reports for Vitora HMIS.

What this file is for:
- Implement views instruments reports logic for the laboratory domain.

How to use it:
- Import classes and functions from this module in Django app code and tests.

Supported inputs/args:
- Python imports and Django ORM/runtime inputs; no standalone CLI arguments.
"""

import logging

from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import models
from django_filters import rest_framework as filters
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from hmis.apps.core.audit import AuditedMutationMixin
from hmis.apps.core.mixins import NestedTenantScopeMixin, ReadOnCreateMixin, TenantScopedViewMixin
from hmis.apps.core.permissions import ReadRequiresModelPermission, WriteRequiresRolePermission

from .models import AnalyzerRun, DiagnosticReport, Instrument
from .permissions import LaboratoryModuleRequired, LISIntegrationSettingsPermission
from .serializers import (
    AnalyzerRunCreateSerializer,
    AnalyzerRunMarkErrorSerializer,
    AnalyzerRunSerializer,
    DiagnosticReportAmendSerializer,
    DiagnosticReportCancelSerializer,
    DiagnosticReportCreateSerializer,
    DiagnosticReportSerializer,
    DiagnosticReportUpdateSerializer,
    InstrumentCreateSerializer,
    InstrumentSerializer,
)

logger = logging.getLogger(__name__)


class InstrumentFilter(filters.FilterSet):
    """Filter for instruments."""

    search = filters.CharFilter(method="filter_search")

    class Meta:
        model = Instrument
        fields = {
            "is_active": ["exact"],
            "interface_type": ["exact"],
            "department": ["exact", "icontains"],
        }

    def filter_search(self, queryset, name, value):
        """Search by code or name."""
        return queryset.filter(models.Q(code__icontains=value) | models.Q(name__icontains=value))


class InstrumentViewSet(
    AuditedMutationMixin,
    ReadOnCreateMixin,
    TenantScopedViewMixin,
    viewsets.ModelViewSet,
):
    """
    ViewSet for laboratory instruments.

    Provides CRUD operations for managing lab analyzers and instruments.
    """

    queryset = Instrument.objects.all()
    audit_resource_type = "Instrument"
    audit_action_prefix = "laboratory.instrument"
    audit_source = "laboratory_api"
    permission_classes = [
        IsAuthenticated,
        LaboratoryModuleRequired,
        LISIntegrationSettingsPermission,
        WriteRequiresRolePermission,
        ReadRequiresModelPermission,
    ]
    filterset_class = InstrumentFilter
    tenant_scope = "facility"

    def get_serializer_class(self):
        if self.action in ["create", "update", "partial_update"]:
            return InstrumentCreateSerializer
        return InstrumentSerializer

    def get_queryset(self):
        queryset = super().get_queryset()
        # Default to showing only active instruments unless filtered
        if "is_active" not in self.request.query_params:
            queryset = queryset.filter(is_active=True)
        return queryset


class AnalyzerRunFilter(filters.FilterSet):
    """Filter for analyzer runs."""

    specimen_barcode = filters.CharFilter(field_name="specimen__barcode")
    order_number = filters.CharFilter(field_name="specimen__lab_order__order_number")

    class Meta:
        model = AnalyzerRun
        fields = {
            "status": ["exact"],
            "instrument": ["exact"],
            "run_datetime": ["gte", "lte"],
        }


class AnalyzerRunViewSet(AuditedMutationMixin, NestedTenantScopeMixin, viewsets.ModelViewSet):
    """
    ViewSet for analyzer runs.

    Provides CRUD operations for managing raw analyzer data and
    tracking instrument message processing.
    """

    queryset = AnalyzerRun.objects.select_related("specimen", "instrument", "operator").all()
    audit_resource_type = "AnalyzerRun"
    audit_action_prefix = "laboratory.analyzer_run"
    audit_source = "laboratory_api"
    permission_classes = [IsAuthenticated, WriteRequiresRolePermission, ReadRequiresModelPermission]
    filterset_class = AnalyzerRunFilter
    tenant_facility_chain = "specimen__lab_order__facility"
    tenant_org_chain = "specimen__lab_order__organization"

    def get_serializer_class(self):
        if self.action in ["create"]:
            return AnalyzerRunCreateSerializer
        if self.action == "mark_error":
            return AnalyzerRunMarkErrorSerializer
        return AnalyzerRunSerializer

    @action(detail=True, methods=["post"])
    def mark_error(self, request, pk=None):
        """Mark this analyzer run as failed with an error message."""
        run = self.get_object()
        serializer = AnalyzerRunMarkErrorSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        run.mark_error(serializer.validated_data["error_message"])
        return Response(AnalyzerRunSerializer(run).data)

    @action(detail=True, methods=["post"])
    def mark_applied(self, request, pk=None):
        """Mark this analyzer run as applied (results created)."""
        run = self.get_object()

        if run.status != AnalyzerRun.Status.PARSED:
            return Response(
                {"detail": "Can only mark PARSED runs as APPLIED."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        run.mark_applied()
        return Response(AnalyzerRunSerializer(run).data)


# ============================================================================
# Phase L4 — Diagnostic Report ViewSet
# ============================================================================


class DiagnosticReportFilter(filters.FilterSet):
    """Filter for diagnostic reports."""

    lab_order_number = filters.CharFilter(field_name="lab_order__order_number")
    patient = filters.NumberFilter(field_name="lab_order__patient_id")

    class Meta:
        model = DiagnosticReport
        fields = {
            "status": ["exact"],
            "lab_order": ["exact"],
            "issued_by": ["exact"],
            "issued_at": ["gte", "lte"],
            "created_at": ["gte", "lte"],
        }


class DiagnosticReportViewSet(AuditedMutationMixin, NestedTenantScopeMixin, viewsets.ModelViewSet):
    """
    ViewSet for diagnostic reports (Phase L4).

    Provides CRUD operations for formal patient-facing lab reports,
    with workflow actions for finalization, amendment, and cancellation.
    """

    queryset = DiagnosticReport.objects.select_related(
        "lab_order",
        "lab_order__patient",
        "issued_by",
        "amended_by",
    ).all()
    audit_resource_type = "DiagnosticReport"
    audit_action_prefix = "laboratory.diagnostic_report"
    audit_source = "laboratory_api"
    lookup_field = "report_number"
    permission_classes = [IsAuthenticated, WriteRequiresRolePermission, ReadRequiresModelPermission]
    filterset_class = DiagnosticReportFilter
    tenant_facility_chain = "lab_order__facility"
    tenant_org_chain = "lab_order__organization"

    def get_serializer_class(self):
        if self.action == "create":
            return DiagnosticReportCreateSerializer
        if self.action in ["update", "partial_update"]:
            return DiagnosticReportUpdateSerializer
        if self.action == "amend":
            return DiagnosticReportAmendSerializer
        if self.action == "cancel":
            return DiagnosticReportCancelSerializer
        return DiagnosticReportSerializer

    def create(self, request, *args, **kwargs):
        """Create a new diagnostic report and return full representation."""
        lab_order_id = request.data.get("lab_order")
        if lab_order_id:
            existing = (
                self.get_queryset()
                .filter(lab_order_id=lab_order_id)
                .exclude(status=DiagnosticReport.Status.CANCELLED)
                .filter(superseding_reports__isnull=True)
                .order_by("-created_at")
                .first()
            )
            if existing is not None:
                serializer = DiagnosticReportSerializer(existing, context={"request": request})
                return Response(serializer.data, status=status.HTTP_200_OK)

        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        report = serializer.save()

        # Return the full report representation
        output_serializer = DiagnosticReportSerializer(report, context={"request": request})
        return Response(output_serializer.data, status=status.HTTP_201_CREATED)

    def update(self, request, *args, **kwargs):
        """Update a diagnostic report and return full representation."""
        partial = kwargs.pop("partial", False)
        instance = self.get_object()
        serializer = self.get_serializer(instance, data=request.data, partial=partial)
        serializer.is_valid(raise_exception=True)
        report = serializer.save()
        output_serializer = DiagnosticReportSerializer(report, context={"request": request})
        return Response(output_serializer.data)

    def partial_update(self, request, *args, **kwargs):
        """Partially update a diagnostic report and return full representation."""
        kwargs["partial"] = True
        return self.update(request, *args, **kwargs)

    @action(detail=True, methods=["post"])
    def finalize(self, request, report_number=None):
        """
        Finalize a draft diagnostic report.

        Sets status to FINAL and records issued_at timestamp.
        """
        report = self.get_object()
        try:
            report.finalize()
            return Response(DiagnosticReportSerializer(report, context={"request": request}).data)
        except (
            ValidationError,
            DjangoValidationError,
            AttributeError,
            TypeError,
            ValueError,
            RuntimeError,
            OSError,
            AssertionError,
            ImportError,
        ) as e:
            logger.exception("Error finalizing diagnostic report %s", report_number)
            return Response(
                {"detail": str(e)},
                status=status.HTTP_400_BAD_REQUEST,
            )

    @action(detail=True, methods=["post"])
    def amend(self, request, report_number=None):
        """
        Amend a finalized diagnostic report.

        Updates conclusion and sets status to AMENDED.
        """
        report = self.get_object()
        serializer = DiagnosticReportAmendSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        try:
            report.amend(
                new_conclusion=serializer.validated_data["conclusion"],
                amended_by=request.user,
            )
            return Response(DiagnosticReportSerializer(report, context={"request": request}).data)
        except (
            ValidationError,
            DjangoValidationError,
            AttributeError,
            TypeError,
            ValueError,
            RuntimeError,
            OSError,
            AssertionError,
            ImportError,
        ) as e:
            logger.exception("Error amending diagnostic report %s", report_number)
            return Response(
                {"detail": str(e)},
                status=status.HTTP_400_BAD_REQUEST,
            )

    @action(detail=True, methods=["post"])
    def cancel(self, request, report_number=None):
        """
        Cancel a diagnostic report.

        Sets status to CANCELLED and records cancellation reason.
        """
        report = self.get_object()
        serializer = DiagnosticReportCancelSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        try:
            report.cancel(reason=serializer.validated_data["reason"])
            return Response(DiagnosticReportSerializer(report, context={"request": request}).data)
        except (
            ValidationError,
            DjangoValidationError,
            AttributeError,
            TypeError,
            ValueError,
            RuntimeError,
            OSError,
            AssertionError,
            ImportError,
        ) as e:
            logger.exception("Error cancelling diagnostic report %s", report_number)
            return Response(
                {"detail": str(e)},
                status=status.HTTP_400_BAD_REQUEST,
            )

    @action(detail=True, methods=["post"], url_path="generate_pdf")
    def generate_pdf(self, request, report_number=None):
        """
        Generate PDF for a diagnostic report.

        Creates a PDF file from the lab results and stores it.
        """
        from io import BytesIO

        from django.core.files.base import ContentFile
        from reportlab.lib import colors
        from reportlab.lib.pagesizes import A4
        from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
        from reportlab.lib.units import mm
        from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

        report = self.get_object()
        lab_order = report.lab_order

        # Create PDF
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
        title_style = ParagraphStyle(
            "Title",
            parent=styles["Heading1"],
            fontSize=16,
            alignment=1,  # Center
        )

        elements = []

        # Header
        elements.append(Paragraph("DIAGNOSTIC REPORT", title_style))
        elements.append(Spacer(1, 10 * mm))

        # Report info
        info_data = [
            ["Report Number:", report.report_number],
            ["Order Number:", lab_order.order_number],
            ["Patient:", str(lab_order.patient)],
            ["Ordered By:", str(lab_order.ordered_by)],
            ["Order Date:", lab_order.ordered_at.strftime("%Y-%m-%d %H:%M")],
            ["Report Status:", report.get_status_display()],
        ]
        if report.issued_at:
            info_data.append(["Issued Date:", report.issued_at.strftime("%Y-%m-%d %H:%M")])

        info_table = Table(info_data, colWidths=[50 * mm, 100 * mm])
        info_table.setStyle(
            TableStyle(
                [
                    ("FONTNAME", (0, 0), (0, -1), "Helvetica-Bold"),
                    ("FONTNAME", (1, 0), (1, -1), "Helvetica"),
                    ("FONTSIZE", (0, 0), (-1, -1), 10),
                    ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
                ]
            )
        )
        elements.append(info_table)
        elements.append(Spacer(1, 10 * mm))

        # Results table
        results_data = [["Test", "Result", "Reference Range", "Flag"]]
        for item in lab_order.items.select_related("test", "result").all():
            if hasattr(item, "result") and item.result:
                result = item.result
                result_value = (
                    result.text_value or str(result.numeric_value or "") or result.option_value
                )
                results_data.append(
                    [
                        item.test.name,
                        f"{result_value} {result.result_unit or ''}".strip(),
                        result.reference_range_text or "-",
                        result.result_flag or "NORMAL",
                    ]
                )
            else:
                results_data.append([item.test.name, "Pending", "-", "-"])

        results_table = Table(results_data, colWidths=[60 * mm, 40 * mm, 40 * mm, 30 * mm])
        results_table.setStyle(
            TableStyle(
                [
                    ("BACKGROUND", (0, 0), (-1, 0), colors.grey),
                    ("TEXTCOLOR", (0, 0), (-1, 0), colors.whitesmoke),
                    ("ALIGN", (0, 0), (-1, -1), "LEFT"),
                    ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                    ("FONTSIZE", (0, 0), (-1, -1), 9),
                    ("BOTTOMPADDING", (0, 0), (-1, 0), 8),
                    ("BACKGROUND", (0, 1), (-1, -1), colors.beige),
                    ("GRID", (0, 0), (-1, -1), 0.5, colors.black),
                ]
            )
        )
        elements.append(results_table)
        elements.append(Spacer(1, 10 * mm))

        # Conclusion
        if report.conclusion:
            elements.append(Paragraph("<b>Conclusion:</b>", styles["Normal"]))
            elements.append(Paragraph(report.conclusion, styles["Normal"]))
            elements.append(Spacer(1, 5 * mm))

        # Clinical info
        if report.clinical_info:
            elements.append(Paragraph("<b>Clinical Information:</b>", styles["Normal"]))
            elements.append(Paragraph(report.clinical_info, styles["Normal"]))

        # Build PDF
        doc.build(elements)

        # Save to model
        pdf_content = buffer.getvalue()
        filename = f"report_{report.report_number}.pdf"
        report.pdf_file.save(filename, ContentFile(pdf_content), save=True)

        return Response(
            {
                "detail": "PDF generated successfully.",
                "pdf_url": request.build_absolute_uri(report.pdf_file.url),
            }
        )

    @action(detail=True, methods=["post"])
    def supersede(self, request, report_number=None):
        """Create a new draft report revision that supersedes this finalized report."""
        report = self.get_object()
        if not report.is_finalized:
            return Response(
                {"detail": "Only finalized reports can be superseded."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        existing = report.superseding_reports.order_by("-created_at").first()
        if existing is not None:
            serializer = DiagnosticReportSerializer(existing, context={"request": request})
            return Response(serializer.data, status=status.HTTP_200_OK)

        superseding = DiagnosticReport.objects.create(
            lab_order=report.lab_order,
            issued_by=request.user,
            conclusion=report.conclusion,
            clinical_info=report.clinical_info,
            supersedes=report,
        )
        serializer = DiagnosticReportSerializer(superseding, context={"request": request})
        return Response(serializer.data, status=status.HTTP_201_CREATED)


# ============================================================================
# Specimen ViewSet
# ============================================================================
