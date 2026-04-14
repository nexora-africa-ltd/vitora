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

from .models import KENHDDDataElement, KENHDDFailedRecord, KENHDDValidationRun
from .serializers import (
    KENHDDComplianceReportInputSerializer,
    KENHDDComplianceScoreSerializer,
    KENHDDDataElementDetailSerializer,
    KENHDDDataElementSerializer,
    KENHDDFailedRecordSerializer,
    KENHDDRecordResultSerializer,
    KENHDDRevalidateInputSerializer,
    KENHDDValidateRecordInputSerializer,
    KENHDDValidationRunDetailSerializer,
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
        if self.action == "run_detail":
            return KENHDDValidationRunDetailSerializer
        if self.action == "run_failures":
            return KENHDDFailedRecordSerializer
        if self.action == "revalidate_failures":
            return KENHDDRevalidateInputSerializer
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

    @action(detail=False, methods=["get"], url_path=r"runs/(?P<run_id>\d+)")
    def run_detail(self, request: Request, run_id: str = "") -> Response:
        """Get detailed info for a specific validation run including failed records."""
        try:
            run = KENHDDValidationRun.objects.prefetch_related(
                "failed_records"
            ).get(pk=run_id)
        except KENHDDValidationRun.DoesNotExist:
            return Response(
                {"error": f"Validation run {run_id} not found"},
                status=status.HTTP_404_NOT_FOUND,
            )
        serializer = KENHDDValidationRunDetailSerializer(run)
        return Response(serializer.data)

    @action(
        detail=False,
        methods=["get"],
        url_path=r"runs/(?P<run_id>\d+)/failures",
    )
    def run_failures(self, request: Request, run_id: str = "") -> Response:
        """List failed records for a specific validation run."""
        try:
            run = KENHDDValidationRun.objects.get(pk=run_id)
        except KENHDDValidationRun.DoesNotExist:
            return Response(
                {"error": f"Validation run {run_id} not found"},
                status=status.HTTP_404_NOT_FOUND,
            )
        qs = KENHDDFailedRecord.objects.filter(run=run)
        serializer = KENHDDFailedRecordSerializer(qs, many=True)
        return Response(serializer.data)

    @action(
        detail=False,
        methods=["post"],
        url_path=r"runs/(?P<run_id>\d+)/revalidate",
    )
    def revalidate_failures(self, request: Request, run_id: str = "") -> Response:
        """
        Re-validate the failed records from a previous run.

        Creates a new validation run targeting only the records that
        previously failed, so admins can check whether fixes took effect.
        """
        try:
            original_run = KENHDDValidationRun.objects.get(pk=run_id)
        except KENHDDValidationRun.DoesNotExist:
            return Response(
                {"error": f"Validation run {run_id} not found"},
                status=status.HTTP_404_NOT_FOUND,
            )

        failed_records = KENHDDFailedRecord.objects.filter(run=original_run)
        if not failed_records.exists():
            return Response(
                {"error": "No failed records to revalidate"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        service = KENHDDValidationService()
        rt = original_run.resource_type
        model_cls = service.get_model_class(rt)
        if model_cls is None:
            return Response(
                {"error": f"Unknown resource type: {rt}"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        record_ids = list(failed_records.values_list("record_id", flat=True))
        instances = list(model_cls.objects.filter(pk__in=record_ids))
        deleted_count = len(record_ids) - len(instances)

        if not instances:
            return Response(
                {
                    "error": "None of the previously failed records exist anymore",
                    "deleted_count": deleted_count,
                },
                status=status.HTTP_404_NOT_FOUND,
            )

        _elements = service._get_active_elements(rt)
        total = len(instances)
        compliant_count = 0
        mandatory_total = 0
        mandatory_pass = 0
        violations: dict[str, int] = {}
        new_failed: list[KENHDDFailedRecord] = []

        for record in instances:
            result = service.validate_record(rt, record)
            if result.is_compliant:
                compliant_count += 1

            for elem in result.elements:
                if elem.requirement_level == "MANDATORY":
                    mandatory_total += 1
                    if elem.status == "PASS":
                        mandatory_pass += 1
                if elem.status in ("FAIL", "WARNING"):
                    violations[elem.element_id] = violations.get(elem.element_id, 0) + 1

            if not result.is_compliant or result.fail_count > 0 or result.warning_count > 0:
                violation_details = [
                    {
                        "element_id": e.element_id,
                        "element_name": e.element_name,
                        "field_name": e.field_name,
                        "status": e.status,
                        "message": e.message,
                        "requirement_level": e.requirement_level,
                        "value": e.value,
                    }
                    for e in result.elements
                    if e.status in ("FAIL", "WARNING")
                ]
                if violation_details:
                    new_failed.append(
                        KENHDDFailedRecord(
                            run=None,  # set after run creation
                            record_id=str(result.record_id),
                            is_compliant=result.is_compliant,
                            pass_count=result.pass_count,
                            fail_count=result.fail_count,
                            warning_count=result.warning_count,
                            violation_details=violation_details,
                        )
                    )

        from decimal import Decimal

        compliance_pct = round((compliant_count / total) * 100, 2) if total else 0.0
        mandatory_rate = (
            round((mandatory_pass / mandatory_total) * 100, 2)
            if mandatory_total
            else 100.0
        )

        new_run = KENHDDValidationRun.objects.create(
            resource_type=rt,
            records_checked=total,
            records_compliant=compliant_count,
            compliance_score=Decimal(str(compliance_pct)),
            mandatory_pass_rate=Decimal(str(mandatory_rate)),
            violations=violations,
            run_by=request.user,
        )

        for fr in new_failed:
            fr.run = new_run
        if new_failed:
            KENHDDFailedRecord.objects.bulk_create(new_failed)

        serializer = KENHDDValidationRunDetailSerializer(new_run)
        return Response(serializer.data, status=status.HTTP_201_CREATED)
