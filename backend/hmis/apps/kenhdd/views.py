"""
KENHDD Views.

Provides API endpoints for KENHDD data element management,
record validation, and compliance reporting.

DHA Compliance: Gap #33 — KENHDD Schema Validation (Sprint 3.D)
"""

from __future__ import annotations

from django.http import HttpResponse
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework import filters, status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response

from .models import KENHDDDataElement, KENHDDValidationRun
from .serializers import (
    KENHDDComplianceReportInputSerializer,
    KENHDDComplianceScoreSerializer,
    KENHDDDataElementDetailSerializer,
    KENHDDDataElementSerializer,
    KENHDDRecordResultSerializer,
    KENHDDValidateRecordInputSerializer,
    KENHDDValidationRunSerializer,
)
from .services.report import KENHDDReportService
from .services.validation import KENHDDValidationService


class KENHDDDataElementViewSet(viewsets.ReadOnlyModelViewSet):
    """
    ViewSet for KENHDD data element definitions (read-only).
    Definitions are seeded via the ``seed_kenhdd_elements`` command.
    """

    queryset = KENHDDDataElement.objects.all()
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter]
    filterset_fields = ["resource_type", "requirement_level", "data_type", "is_active"]
    search_fields = ["element_id", "name", "description"]

    def get_serializer_class(self):  # type: ignore[override]
        if self.action == "retrieve":
            return KENHDDDataElementDetailSerializer
        return KENHDDDataElementSerializer


class KENHDDComplianceViewSet(viewsets.ViewSet):
    """
    ViewSet for KENHDD compliance operations:
    - Validate single records
    - Generate compliance reports
    - View summary dashboard data
    - List past validation runs
    - Export reports
    """

    permission_classes = [IsAuthenticated]

    def get_serializer_class(self):  # type: ignore[override]
        if self.action == "validate_record":
            return KENHDDValidateRecordInputSerializer
        if self.action == "compliance_report":
            return KENHDDComplianceReportInputSerializer
        if self.action == "runs":
            return KENHDDValidationRunSerializer
        return KENHDDComplianceScoreSerializer

    @action(detail=False, methods=["post"], url_path="validate-record")
    def validate_record(self, request: Request) -> Response:
        """Validate a single record against KENHDD elements."""
        serializer = KENHDDValidateRecordInputSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        resource_type = serializer.validated_data["resource_type"]
        record_id = serializer.validated_data["record_id"]

        service = KENHDDValidationService()
        model_cls = service.get_model_class(resource_type)
        if model_cls is None:
            return Response(
                {"error": f"Unknown resource type: {resource_type}"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            instance = model_cls.objects.get(pk=record_id)
        except model_cls.DoesNotExist:
            return Response(
                {"error": f"{resource_type} with id={record_id} not found"},
                status=status.HTTP_404_NOT_FOUND,
            )

        result = service.validate_record(resource_type, instance)
        output = KENHDDRecordResultSerializer(result).data
        return Response(output)

    @action(detail=False, methods=["post"], url_path="compliance-report")
    def compliance_report(self, request: Request) -> Response:
        """Generate a compliance report across resource types."""
        serializer = KENHDDComplianceReportInputSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        resource_type = serializer.validated_data.get("resource_type")
        sample_size = serializer.validated_data.get("sample_size", 100)

        service = KENHDDValidationService()
        scores = service.generate_compliance_report(
            resource_type=resource_type,
            sample_size=sample_size,
            user=request.user,
        )

        output = KENHDDComplianceScoreSerializer(scores, many=True).data
        return Response(output)

    @action(detail=False, methods=["get"])
    def summary(self, request: Request) -> Response:
        """Get the latest compliance summary per resource type."""
        service = KENHDDValidationService()
        return Response(service.get_compliance_summary())

    @action(detail=False, methods=["get"])
    def runs(self, request: Request) -> Response:
        """List past validation runs."""
        resource_type = request.query_params.get("resource_type")
        qs = KENHDDValidationRun.objects.all()
        if resource_type:
            qs = qs.filter(resource_type=resource_type)
        serializer = KENHDDValidationRunSerializer(qs[:50], many=True)
        return Response(serializer.data)

    @action(detail=False, methods=["post"])
    def export(self, request: Request) -> Response | HttpResponse:
        """
        Export the latest validation run for a resource type.

        Query params:
            resource_type: Required.
            format: 'json' (default) or 'csv'.
        """
        resource_type = request.data.get("resource_type")
        export_format = request.data.get("format", "json")

        if not resource_type:
            return Response(
                {"error": "resource_type is required"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        run = (
            KENHDDValidationRun.objects.filter(resource_type=resource_type)
            .order_by("-run_at")
            .first()
        )
        if not run:
            return Response(
                {"error": f"No validation run found for {resource_type}"},
                status=status.HTTP_404_NOT_FOUND,
            )

        report_service = KENHDDReportService()

        if export_format == "csv":
            content = report_service.export_compliance_report_csv(run)
            response = HttpResponse(content, content_type="text/csv")
            response["Content-Disposition"] = (
                f'attachment; filename="kenhdd_{resource_type.lower()}_report.csv"'
            )
            return response

        content = report_service.export_compliance_report_json(run)
        return HttpResponse(content, content_type="application/json")
