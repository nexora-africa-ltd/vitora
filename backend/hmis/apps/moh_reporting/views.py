"""MOH Reporting API views."""

from __future__ import annotations

import logging

from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from hmis.apps.analytics.permissions import CanViewAnalytics
from hmis.apps.core.mixins import TenantScopedViewMixin
from hmis.apps.core.models import AuditLog

from .models import (
    MOH705Report,
    MOH711Report,
    MOH717Report,
    MOHReportStatus,
)
from .serializers import (
    MOH705ReportListSerializer,
    MOH705ReportSerializer,
    MOH711ReportListSerializer,
    MOH711ReportSerializer,
    MOH717ReportListSerializer,
    MOH717ReportSerializer,
    MOHReportApproveSerializer,
    MOHReportGenerateSerializer,
)
from .services import (
    DHIS2SubmissionService,
    MOH705Generator,
    MOH711Generator,
    MOH717Generator,
)

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Mixins for shared actions
# ---------------------------------------------------------------------------


class MOHReportActionsMixin:
    """Shared ``generate``, ``approve``, ``submit_to_dhis2``, ``dhis2_preview``
    custom actions for all MOH report ViewSets.

    Subclasses must set ``generator_class`` to the appropriate generator.
    """

    generator_class = None  # Override in subclass
    report_type_label = ""  # e.g. "MOH 705"

    @action(detail=False, methods=["post"])
    def generate(self, request):
        serializer = MOHReportGenerateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        year = serializer.validated_data.get("year")
        month = serializer.validated_data.get("month")

        if year is None or month is None:
            from .tasks import _previous_month

            year, month = _previous_month()

        self._resolve_tenant_context()
        facility = getattr(request, "facility", None)
        if facility is None:
            return Response(
                {"error": "Facility context is required to generate a report"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        report = self.generator_class.generate(  # type: ignore[union-attr]
            facility, year, month, generated_by=request.user
        )

        AuditLog.log(
            action="moh_report_generate",
            user=request.user,
            resource_type=type(report).__name__,
            resource_id=report.pk,
            ip_address=request.META.get("REMOTE_ADDR", ""),
            details={"report_type": self.report_type_label, "year": year, "month": month},
        )

        read_serializer = self.get_serializer(report)  # type: ignore[attr-defined]
        return Response(read_serializer.data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=["post"])
    def approve(self, request, pk=None):
        report = self.get_object()  # type: ignore[attr-defined]
        if report.status not in (MOHReportStatus.DRAFT, MOHReportStatus.FAILED):
            return Response(
                {"error": f"Cannot approve a report with status '{report.status}'"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        ser = MOHReportApproveSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        if ser.validated_data.get("notes"):
            report.notes = ser.validated_data["notes"]
            report.save(update_fields=["notes", "updated_at"])

        report.approve(user=request.user)

        AuditLog.log(
            action="moh_report_approve",
            user=request.user,
            resource_type=type(report).__name__,
            resource_id=report.pk,
            ip_address=request.META.get("REMOTE_ADDR", ""),
            details={"report_type": self.report_type_label},
        )

        read_serializer = self.get_serializer(report)  # type: ignore[attr-defined]
        return Response(read_serializer.data)

    @action(detail=True, methods=["post"], url_path="submit-to-dhis2")
    def submit_to_dhis2(self, request, pk=None):
        report = self.get_object()  # type: ignore[attr-defined]
        if report.status != MOHReportStatus.APPROVED:
            return Response(
                {"error": "Only approved reports can be submitted to DHIS2"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        result = DHIS2SubmissionService.submit(report)

        AuditLog.log(
            action="moh_report_submit_dhis2",
            user=request.user,
            resource_type=type(report).__name__,
            resource_id=report.pk,
            ip_address=request.META.get("REMOTE_ADDR", ""),
            details={
                "report_type": self.report_type_label,
                "dhis2_status": result.get("status", "unknown"),
            },
        )

        report.refresh_from_db()
        read_serializer = self.get_serializer(report)  # type: ignore[attr-defined]
        return Response(
            {
                "report": read_serializer.data,
                "dhis2_response": result,
            }
        )

    @action(detail=True, methods=["get"], url_path="dhis2-preview")
    def dhis2_preview(self, request, pk=None):
        report = self.get_object()  # type: ignore[attr-defined]
        payload = DHIS2SubmissionService.prepare_payload(report)
        return Response(payload)


# ---------------------------------------------------------------------------
# ViewSets
# ---------------------------------------------------------------------------


class MOH705ReportViewSet(MOHReportActionsMixin, TenantScopedViewMixin, viewsets.ModelViewSet):
    queryset = MOH705Report.objects.select_related("facility", "generated_by", "approved_by")
    permission_classes = [IsAuthenticated, CanViewAnalytics]
    tenant_scope = "facility"
    generator_class = MOH705Generator
    report_type_label = "MOH 705"
    http_method_names = ["get", "post", "head", "options"]

    def get_serializer_class(self):
        if self.action == "list":
            return MOH705ReportListSerializer
        if self.action == "generate":
            return MOH705ReportSerializer
        if self.action == "approve":
            return MOH705ReportSerializer
        return MOH705ReportSerializer


class MOH711ReportViewSet(MOHReportActionsMixin, TenantScopedViewMixin, viewsets.ModelViewSet):
    queryset = MOH711Report.objects.select_related("facility", "generated_by", "approved_by")
    permission_classes = [IsAuthenticated, CanViewAnalytics]
    tenant_scope = "facility"
    generator_class = MOH711Generator
    report_type_label = "MOH 711"
    http_method_names = ["get", "post", "head", "options"]

    def get_serializer_class(self):
        if self.action == "list":
            return MOH711ReportListSerializer
        if self.action == "generate":
            return MOH711ReportSerializer
        if self.action == "approve":
            return MOH711ReportSerializer
        return MOH711ReportSerializer


class MOH717ReportViewSet(MOHReportActionsMixin, TenantScopedViewMixin, viewsets.ModelViewSet):
    queryset = MOH717Report.objects.select_related("facility", "generated_by", "approved_by")
    permission_classes = [IsAuthenticated, CanViewAnalytics]
    tenant_scope = "facility"
    generator_class = MOH717Generator
    report_type_label = "MOH 717"
    http_method_names = ["get", "post", "head", "options"]

    def get_serializer_class(self):
        if self.action == "list":
            return MOH717ReportListSerializer
        if self.action == "generate":
            return MOH717ReportSerializer
        if self.action == "approve":
            return MOH717ReportSerializer
        return MOH717ReportSerializer
