"""Views for Quality Measures & Reporting.

Provides:
- QuarterlyReportViewSet: CRUD + regenerate action
- AnnualReportViewSet: CRUD + regenerate action
- QualityMeasureViewSet: CRUD + import/export actions
- QualityMeasureResultViewSet: CRUD
- QualityDashboardView: Dashboard summary
"""

from __future__ import annotations

import json

from django.http import HttpResponse
from django_filters.rest_framework import DjangoFilterBackend
from drf_spectacular.utils import OpenApiParameter, extend_schema, extend_schema_view
from rest_framework import filters, permissions, status, viewsets
from rest_framework.decorators import action
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from hmis.apps.core.mixins import NestedTenantScopeMixin

from .models import AnnualReport, QualityMeasure, QualityMeasureResult, QuarterlyReport
from .serializers import (
    AnnualReportSerializer,
    QualityDashboardSerializer,
    QualityMeasureExportSerializer,
    QualityMeasureImportSerializer,
    QualityMeasureResultSerializer,
    QualityMeasureSerializer,
    QuarterlyReportSerializer,
)
from .services.import_export import (
    export_measures_to_csv,
    export_measures_to_json,
    export_measures_to_qrda,
    import_measures_from_csv,
    import_measures_from_json,
)
from .services.reporting import (
    generate_all_quarterly_reports,
    generate_annual_report,
    generate_quarterly_report,
)

# =============================================================================
# QuarterlyReport ViewSet
# =============================================================================


@extend_schema_view(
    list=extend_schema(summary="List quarterly reports"),
    retrieve=extend_schema(summary="Retrieve a quarterly report"),
)
class QuarterlyReportViewSet(NestedTenantScopeMixin, viewsets.ModelViewSet):
    """ViewSet for quarterly reports.

    Supports listing, retrieval, and regeneration of quarterly reports.
    """

    serializer_class = QuarterlyReportSerializer
    permission_classes = [permissions.IsAuthenticated]
    filter_backends = [DjangoFilterBackend, filters.OrderingFilter]
    filterset_fields = ["clinic", "year", "quarter", "dhis2_submitted"]
    ordering_fields = ["year", "quarter", "total_visits", "created_at"]
    ordering = ["-year", "-quarter"]
    queryset = QuarterlyReport.objects.select_related("clinic", "generated_by").all()
    tenant_facility_chain = "clinic__facility"
    tenant_org_chain = "clinic__organization"

    @extend_schema(
        summary="Generate quarterly report for a clinic",
        parameters=[
            OpenApiParameter(name="clinic_id", type=int, required=True),
            OpenApiParameter(name="year", type=int, required=True),
            OpenApiParameter(name="quarter", type=int, required=True),
        ],
    )
    @action(detail=False, methods=["post"])
    def generate(self, request: Request) -> Response:
        """Generate a quarterly report for a specific clinic, year, and quarter."""
        clinic_id = request.data.get("clinic_id")
        year = request.data.get("year")
        quarter = request.data.get("quarter")

        if not all([clinic_id, year, quarter]):
            return Response(
                {"detail": "clinic_id, year, and quarter are required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        from hmis.apps.clinics.models import Clinic

        try:
            clinic = Clinic.objects.get(pk=clinic_id)
        except Clinic.DoesNotExist:
            return Response(
                {"detail": "Clinic not found."},
                status=status.HTTP_404_NOT_FOUND,
            )

        report = generate_quarterly_report(clinic, int(year), int(quarter), user=request.user)
        serializer = self.get_serializer(report)
        return Response(serializer.data, status=status.HTTP_201_CREATED)

    @extend_schema(summary="Generate quarterly reports for all clinics")
    @action(detail=False, methods=["post"], url_path="generate-all")
    def generate_all(self, request: Request) -> Response:
        """Generate quarterly reports for all clinics."""
        year = request.data.get("year")
        quarter = request.data.get("quarter")

        if not all([year, quarter]):
            return Response(
                {"detail": "year and quarter are required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        reports = generate_all_quarterly_reports(int(year), int(quarter), user=request.user)
        serializer = self.get_serializer(reports, many=True)
        return Response(serializer.data, status=status.HTTP_201_CREATED)

    @extend_schema(summary="Export quarterly report as SDMX-ML")
    @action(detail=True, methods=["get"], url_path="export-sdmx")
    def export_sdmx(self, request: Request, pk=None) -> HttpResponse:
        """Export a quarterly report in SDMX-ML format."""
        from hmis.apps.quality.services.sdmx_service import SDMXExportService

        report = self.get_object()
        service = SDMXExportService()
        xml_content = service.export_quarterly_to_sdmx(report)
        response = HttpResponse(xml_content, content_type="application/xml")
        response["Content-Disposition"] = (
            f'attachment; filename="quarterly_report_{report.year}_Q{report.quarter}.sdmx.xml"'
        )
        return response


# =============================================================================
# AnnualReport ViewSet
# =============================================================================


@extend_schema_view(
    list=extend_schema(summary="List annual reports"),
    retrieve=extend_schema(summary="Retrieve an annual report"),
)
class AnnualReportViewSet(NestedTenantScopeMixin, viewsets.ModelViewSet):
    """ViewSet for annual reports."""

    serializer_class = AnnualReportSerializer
    permission_classes = [permissions.IsAuthenticated]
    filter_backends = [DjangoFilterBackend, filters.OrderingFilter]
    filterset_fields = ["clinic", "year", "dhis2_submitted"]
    ordering_fields = ["year", "total_visits", "created_at"]
    ordering = ["-year"]
    queryset = AnnualReport.objects.select_related("clinic", "generated_by").all()
    tenant_facility_chain = "clinic__facility"
    tenant_org_chain = "clinic__organization"

    @extend_schema(
        summary="Generate annual report for a clinic",
        parameters=[
            OpenApiParameter(name="clinic_id", type=int, required=True),
            OpenApiParameter(name="year", type=int, required=True),
        ],
    )
    @action(detail=False, methods=["post"])
    def generate(self, request: Request) -> Response:
        """Generate an annual report for a specific clinic and year."""
        clinic_id = request.data.get("clinic_id")
        year = request.data.get("year")

        if not all([clinic_id, year]):
            return Response(
                {"detail": "clinic_id and year are required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        from hmis.apps.clinics.models import Clinic

        try:
            clinic = Clinic.objects.get(pk=clinic_id)
        except Clinic.DoesNotExist:
            return Response(
                {"detail": "Clinic not found."},
                status=status.HTTP_404_NOT_FOUND,
            )

        report = generate_annual_report(clinic, int(year), user=request.user)
        serializer = self.get_serializer(report)
        return Response(serializer.data, status=status.HTTP_201_CREATED)

    @extend_schema(summary="Export annual report as SDMX-ML")
    @action(detail=True, methods=["get"], url_path="export-sdmx")
    def export_sdmx(self, request: Request, pk=None) -> HttpResponse:
        """Export an annual report in SDMX-ML format."""
        from hmis.apps.quality.services.sdmx_service import SDMXExportService

        report = self.get_object()
        service = SDMXExportService()
        xml_content = service.export_annual_to_sdmx(report)
        response = HttpResponse(xml_content, content_type="application/xml")
        response["Content-Disposition"] = (
            f'attachment; filename="annual_report_{report.year}.sdmx.xml"'
        )
        return response


# =============================================================================
# QualityMeasure ViewSet
# =============================================================================


@extend_schema_view(
    list=extend_schema(summary="List quality measures"),
    retrieve=extend_schema(summary="Retrieve a quality measure"),
    create=extend_schema(summary="Create a quality measure"),
    update=extend_schema(summary="Update a quality measure"),
    partial_update=extend_schema(summary="Partially update a quality measure"),
    destroy=extend_schema(summary="Delete a quality measure"),
)
class QualityMeasureViewSet(viewsets.ModelViewSet):
    """ViewSet for quality measure definitions (CQM)."""

    serializer_class = QualityMeasureSerializer
    permission_classes = [permissions.IsAuthenticated]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ["domain", "status", "reporting_period"]
    search_fields = ["code", "name", "description"]
    ordering_fields = ["code", "name", "created_at"]
    ordering = ["code"]

    def get_queryset(self):
        return QualityMeasure.objects.all()

    @extend_schema(
        summary="Import quality measures from file",
        request=QualityMeasureImportSerializer,
    )
    @action(
        detail=False,
        methods=["post"],
        url_path="import",
        parser_classes=[MultiPartParser, FormParser],
    )
    def import_measures(self, request: Request) -> Response:
        """Import quality measures from CSV or JSON file."""
        serializer = QualityMeasureImportSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        uploaded_file = serializer.validated_data["file"]
        file_format = serializer.validated_data.get("format", "json")
        content = uploaded_file.read().decode("utf-8")

        if file_format == "csv":
            result = import_measures_from_csv(content)
        else:
            data = json.loads(content)
            if not isinstance(data, list):
                data = data.get("measures", [])
            result = import_measures_from_json(data)

        return Response(
            {
                "detail": f"Import complete. Created: {result['created']}, Updated: {result['updated']}.",
                **result,
            },
            status=status.HTTP_200_OK,
        )

    @extend_schema(
        summary="Export quality measures",
        request=QualityMeasureExportSerializer,
    )
    @action(detail=False, methods=["post"])
    def export(self, request: Request) -> Response:
        """Export quality measures in CSV, JSON, or QRDA format."""
        serializer = QualityMeasureExportSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        file_format = serializer.validated_data.get("format", "json")
        measure_ids = serializer.validated_data.get("measures", [])

        if measure_ids:
            measures = list(QualityMeasure.objects.filter(pk__in=measure_ids))
        else:
            measures = list(QualityMeasure.objects.all())

        if file_format == "csv":
            csv_content = export_measures_to_csv(measures)
            response = HttpResponse(csv_content, content_type="text/csv")
            response["Content-Disposition"] = 'attachment; filename="quality_measures.csv"'
            return response
        elif file_format == "qrda":
            data = export_measures_to_qrda(measures)
            return Response(data)
        else:
            data = export_measures_to_json(measures)
            return Response(data)

    @extend_schema(summary="Seed default Kenya CQM measures (skips existing codes)")
    @action(detail=False, methods=["post"], url_path="seed-defaults")
    def seed_defaults(self, request: Request) -> Response:
        """Seed Kenya default quality measures.

        Only creates measures whose code doesn't already exist.
        Safe to call multiple times — idempotent.
        """
        from .management.commands.seed_quality_measures import KENYA_QUALITY_MEASURES

        created = 0
        skipped = 0
        existing_codes = set(QualityMeasure.objects.values_list("code", flat=True))

        for measure_data in KENYA_QUALITY_MEASURES:
            code = measure_data["code"]
            if code in existing_codes:
                skipped += 1
                continue

            defaults = {k: v for k, v in measure_data.items() if k != "code"}
            defaults["status"] = "ACTIVE"
            QualityMeasure.objects.create(code=code, **defaults)
            created += 1

        return Response(
            {
                "created": created,
                "skipped": skipped,
                "total": QualityMeasure.objects.count(),
            },
            status=status.HTTP_201_CREATED if created > 0 else status.HTTP_200_OK,
        )


# =============================================================================
# QualityMeasureResult ViewSet
# =============================================================================


@extend_schema_view(
    list=extend_schema(summary="List quality measure results"),
    retrieve=extend_schema(summary="Retrieve a quality measure result"),
    create=extend_schema(summary="Create a quality measure result"),
)
class QualityMeasureResultViewSet(NestedTenantScopeMixin, viewsets.ModelViewSet):
    """ViewSet for quality measure results."""

    queryset = QualityMeasureResult.objects.select_related(
        "measure", "clinic", "calculated_by"
    ).all()
    serializer_class = QualityMeasureResultSerializer
    permission_classes = [permissions.IsAuthenticated]
    filter_backends = [DjangoFilterBackend, filters.OrderingFilter]
    filterset_fields = [
        "measure",
        "measure__domain",
        "clinic",
        "year",
        "period_type",
        "meets_target",
    ]
    ordering_fields = ["year", "period", "percentage", "created_at"]
    ordering = ["-year", "-period"]
    tenant_facility_chain = "clinic__facility"
    tenant_org_chain = "clinic__organization"

    def perform_create(self, serializer):
        serializer.save(calculated_by=self.request.user)

    @extend_schema(summary="Get trend data for a measure across periods")
    @action(detail=False, methods=["get"])
    def trends(self, request: Request) -> Response:
        """Get trend data for a specific measure across time periods.

        Query params: measure_id (required), clinic_id (optional), year (optional)
        """
        measure_id = request.query_params.get("measure_id")
        if not measure_id:
            return Response(
                {"detail": "measure_id query parameter is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        qs = self.get_queryset().filter(measure_id=measure_id)

        clinic_id = request.query_params.get("clinic_id")
        if clinic_id:
            qs = qs.filter(clinic_id=clinic_id)

        year = request.query_params.get("year")
        if year:
            qs = qs.filter(year=int(year))

        qs = qs.order_by("year", "period")
        serializer = self.get_serializer(qs, many=True)
        return Response(serializer.data)

    @extend_schema(
        summary="Evaluate quality measures for a clinic",
        request=None,
        responses={200: dict},
        parameters=[
            OpenApiParameter(name="clinic_id", type=int, required=False),
            OpenApiParameter(name="year", type=int, required=False),
            OpenApiParameter(name="period", type=int, required=False),
            OpenApiParameter(name="period_type", type=str, required=False),
        ],
    )
    @action(detail=False, methods=["post"], url_path="evaluate")
    def evaluate(self, request: Request) -> Response:
        """Trigger CQM evaluation for a single clinic or all active clinics."""
        from django.utils import timezone as tz

        from .services.evaluation import evaluate_all_measures_for_clinic

        clinic_id = request.query_params.get("clinic_id") or request.data.get("clinic_id")

        today = tz.localdate()
        year = int(request.data.get("year", today.year))
        period = int(request.data.get("period", today.month))
        period_type = request.data.get("period_type", "MONTHLY")

        if clinic_id:
            # Single clinic evaluation
            results = evaluate_all_measures_for_clinic(int(clinic_id), year, period, period_type)
            return Response(
                {
                    "clinic_id": int(clinic_id),
                    "year": year,
                    "period": period,
                    "period_type": period_type,
                    "results": results,
                    "total_evaluated": len(results),
                }
            )
        else:
            # Evaluate all active clinics
            from hmis.apps.clinics.models import Clinic

            clinics = Clinic.objects.filter(status="ACTIVE")
            all_results = []
            for clinic in clinics:
                clinic_results = evaluate_all_measures_for_clinic(
                    clinic.id, year, period, period_type
                )
                all_results.append(
                    {
                        "clinic_id": clinic.id,
                        "clinic_name": clinic.name,
                        "results": clinic_results,
                        "total_evaluated": len(clinic_results),
                    }
                )

            return Response(
                {
                    "year": year,
                    "period": period,
                    "period_type": period_type,
                    "clinics_evaluated": len(all_results),
                    "clinic_results": all_results,
                }
            )


# =============================================================================
# Quality Dashboard View
# =============================================================================


class QualityDashboardView(APIView):
    """Quality dashboard summary view.

    Returns aggregate statistics across all quality measures.
    """

    permission_classes = [permissions.IsAuthenticated]

    @extend_schema(
        summary="Get quality dashboard data",
        responses=QualityDashboardSerializer,
        parameters=[
            OpenApiParameter(name="year", type=int, required=False),
            OpenApiParameter(name="clinic_id", type=int, required=False),
        ],
    )
    def get(self, request: Request) -> Response:
        year = request.query_params.get("year")
        clinic_id = request.query_params.get("clinic_id")

        total_measures = QualityMeasure.objects.count()
        active_measures = QualityMeasure.objects.filter(status="ACTIVE").count()

        # Get latest results
        results_qs = QualityMeasureResult.objects.all()
        if year:
            results_qs = results_qs.filter(year=int(year))
        if clinic_id:
            results_qs = results_qs.filter(clinic_id=int(clinic_id))

        total_results = results_qs.count()
        meeting_target = results_qs.filter(meets_target=True).count()

        # Count measures below low threshold
        below_threshold = 0
        for result in results_qs.select_related("measure"):
            if (
                result.measure.low_threshold is not None
                and result.percentage < result.measure.low_threshold
            ):
                below_threshold += 1

        overall_compliance = 0
        if total_results > 0:
            overall_compliance = round(meeting_target / total_results * 100, 2)

        # Domain summary
        domain_summary = []
        for domain_code, domain_label in QualityMeasure.DOMAIN_CHOICES:
            domain_measures = QualityMeasure.objects.filter(domain=domain_code, status="ACTIVE")
            domain_results = results_qs.filter(measure__domain=domain_code)
            domain_meeting = domain_results.filter(meets_target=True).count()
            domain_total = domain_results.count()

            domain_summary.append(
                {
                    "domain": domain_code,
                    "domain_display": domain_label,
                    "total_measures": domain_measures.count(),
                    "total_results": domain_total,
                    "meeting_target": domain_meeting,
                    "compliance_rate": (
                        round(domain_meeting / domain_total * 100, 2) if domain_total > 0 else 0
                    ),
                }
            )

        # Trend data: last 4 quarters
        trend_data = []
        if year:
            y = int(year)
            for q in range(1, 5):
                q_results = results_qs.filter(year=y, period=q, period_type="QUARTERLY")
                q_total = q_results.count()
                q_meeting = q_results.filter(meets_target=True).count()
                trend_data.append(
                    {
                        "period": f"{y} Q{q}",
                        "total": q_total,
                        "meeting_target": q_meeting,
                        "compliance_rate": (
                            round(q_meeting / q_total * 100, 2) if q_total > 0 else 0
                        ),
                    }
                )

        data = {
            "total_measures": total_measures,
            "active_measures": active_measures,
            "measures_meeting_target": meeting_target,
            "measures_below_threshold": below_threshold,
            "overall_compliance_rate": overall_compliance,
            "domain_summary": domain_summary,
            "trend_data": trend_data,
        }

        return Response(data)
