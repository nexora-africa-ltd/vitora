"""
What this file is for: reporting and export action mixin for SHA claims.
How to use: mixed into SHAClaimViewSet to provide dashboard, capitation summary, and CSV/XLSX export actions.
Supported inputs/args: DRF query parameters for claim report windows and export format.
"""

# ruff: noqa: ARG002

import csv
from datetime import date
from decimal import Decimal
from io import BytesIO

from django.db.models import Count, Sum
from django.http import HttpResponse
from django.utils import timezone
from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import OpenApiParameter, extend_schema, inline_serializer
from rest_framework import serializers
from rest_framework.decorators import action as drf_action
from rest_framework.response import Response

from hmis.apps.billing.sha_serializers import SHAClaimDashboardSerializer


class SHAClaimReportingMixin:
    """Dashboard and export actions for SHAClaimViewSet."""

    @drf_action(detail=False, methods=["get"], url_path="dashboard")
    def dashboard(self, request):
        """
        Get claims dashboard statistics.

        GET /api/sha/claims/dashboard/?from_date=XXX&to_date=XXX
        """
        queryset = self.get_queryset()

        # Date filtering
        from_date = request.query_params.get("from_date")
        to_date = request.query_params.get("to_date")

        if from_date:
            queryset = queryset.filter(service_date__gte=from_date)
        if to_date:
            queryset = queryset.filter(service_date__lte=to_date)

        # Calculate statistics
        total_claims = queryset.count()
        aggregates = queryset.aggregate(
            total_claimed=Sum("claimed_amount"),
            total_approved=Sum("approved_amount"),
            total_paid=Sum("paid_amount"),
        )

        # Group by status
        status_counts = queryset.values("status").annotate(count=Count("id"))
        claims_by_status = {item["status"]: item["count"] for item in status_counts}

        # Group by type
        type_counts = queryset.values("claim_type").annotate(count=Count("id"))
        claims_by_type = {item["claim_type"]: item["count"] for item in type_counts}

        # Calculate average processing days for submitted claims
        submitted_claims = queryset.filter(submitted_at__isnull=False)
        avg_days = None
        if submitted_claims.exists():
            total_days = sum(
                (timezone.now() - claim.submitted_at).days for claim in submitted_claims
            )
            avg_days = total_days / submitted_claims.count()

        serializer = SHAClaimDashboardSerializer(
            {
                "total_claims": total_claims,
                "total_claimed_amount": aggregates["total_claimed"] or Decimal("0.00"),
                "total_approved_amount": aggregates["total_approved"] or Decimal("0.00"),
                "total_paid_amount": aggregates["total_paid"] or Decimal("0.00"),
                "claims_by_status": claims_by_status,
                "claims_by_type": claims_by_type,
                "average_processing_days": avg_days,
            }
        )

        return Response(serializer.data)

    @drf_action(detail=False, methods=["get"], url_path="capitation-summary")
    @extend_schema(
        parameters=[
            OpenApiParameter("from_date", OpenApiTypes.DATE, description="Start date (inclusive)"),
            OpenApiParameter("to_date", OpenApiTypes.DATE, description="End date (inclusive)"),
        ],
        responses={
            200: inline_serializer(
                name="CapitationSummaryResponse",
                fields={
                    "period": serializers.DictField(),
                    "total_claims": serializers.IntegerField(),
                    "total_claimed_amount": serializers.DecimalField(
                        max_digits=12, decimal_places=2
                    ),
                    "total_approved_amount": serializers.DecimalField(
                        max_digits=12, decimal_places=2
                    ),
                    "total_paid_amount": serializers.DecimalField(max_digits=12, decimal_places=2),
                    "claims_by_status": serializers.DictField(),
                    "top_interventions": serializers.ListField(child=serializers.DictField()),
                    "monthly_breakdown": serializers.ListField(child=serializers.DictField()),
                },
            )
        },
    )
    def capitation_summary(self, request):
        """
        Capitation claims summary report.

        GET /api/billing/claims/capitation-summary/?from_date=2026-01-01&to_date=2026-06-30

        Returns aggregated statistics for all claims that have at least one
        intervention with payment_mechanism=CAPITATION. Includes totals,
        status breakdown, top interventions, and monthly breakdown.
        """
        from hmis.apps.billing.models import SHAClaimIntervention

        queryset = self.get_queryset()

        # Date filtering
        from_date = request.query_params.get("from_date")
        to_date = request.query_params.get("to_date")

        if from_date:
            queryset = queryset.filter(service_date__gte=from_date)
        if to_date:
            queryset = queryset.filter(service_date__lte=to_date)

        # Filter to capitation claims only
        queryset = queryset.filter(
            claim_interventions__payment_mechanism=SHAClaimIntervention.PaymentMechanism.CAPITATION
        ).distinct()

        # Totals
        total_claims = queryset.count()
        aggregates = queryset.aggregate(
            total_claimed=Sum("claimed_amount"),
            total_approved=Sum("approved_amount"),
            total_paid=Sum("paid_amount"),
        )

        # By status
        status_counts = queryset.values("status").annotate(count=Count("id"))
        claims_by_status = {item["status"]: item["count"] for item in status_counts}

        # Top interventions (by frequency)
        top_interventions = (
            SHAClaimIntervention.objects.filter(
                claim__in=queryset,
                payment_mechanism=SHAClaimIntervention.PaymentMechanism.CAPITATION,
            )
            .values("intervention_code", "intervention_name")
            .annotate(
                count=Count("id"),
                total_tariff=Sum("tariff_amount"),
            )
            .order_by("-count")[:10]
        )

        # Monthly breakdown
        monthly_breakdown = (
            queryset.extra(select={"month": "TO_CHAR(service_date, 'YYYY-MM')"})
            .values("month")
            .annotate(
                claims=Count("id"),
                claimed=Sum("claimed_amount"),
                approved=Sum("approved_amount"),
                paid=Sum("paid_amount"),
            )
            .order_by("month")
        )

        # Fallback for SQLite (dev) which doesn't have TO_CHAR
        try:
            monthly_list = list(monthly_breakdown)
        except Exception:
            from django.db.models.functions import TruncMonth

            monthly_breakdown = (
                queryset.annotate(month=TruncMonth("service_date"))
                .values("month")
                .annotate(
                    claims=Count("id"),
                    claimed=Sum("claimed_amount"),
                    approved=Sum("approved_amount"),
                    paid=Sum("paid_amount"),
                )
                .order_by("month")
            )
            monthly_list = [
                {
                    "month": item["month"].strftime("%Y-%m") if item["month"] else None,
                    "claims": item["claims"],
                    "claimed": item["claimed"],
                    "approved": item["approved"],
                    "paid": item["paid"],
                }
                for item in monthly_breakdown
            ]

        return Response(
            {
                "period": {"from_date": from_date, "to_date": to_date},
                "total_claims": total_claims,
                "total_claimed_amount": aggregates["total_claimed"] or Decimal("0.00"),
                "total_approved_amount": aggregates["total_approved"] or Decimal("0.00"),
                "total_paid_amount": aggregates["total_paid"] or Decimal("0.00"),
                "claims_by_status": claims_by_status,
                "top_interventions": list(top_interventions),
                "monthly_breakdown": monthly_list,
            }
        )

    @drf_action(detail=False, methods=["get"], url_path="export")
    def export(self, request):
        """
        Export claims to CSV or Excel.

        GET /api/sha/claims/export/?format=csv&status=XXX&from_date=XXX&to_date=XXX
        """
        queryset = self.get_queryset()

        # Apply filters
        claim_status = request.query_params.get("status")
        from_date = request.query_params.get("from_date")
        to_date = request.query_params.get("to_date")

        if claim_status:
            queryset = queryset.filter(status=claim_status)
        if from_date:
            queryset = queryset.filter(service_date__gte=from_date)
        if to_date:
            queryset = queryset.filter(service_date__lte=to_date)

        export_format = request.query_params.get("format", "csv")

        if export_format == "xlsx":
            return self._export_excel(queryset)
        else:
            return self._export_csv(queryset)

    def _export_csv(self, queryset):
        """Export claims to CSV format."""
        response = HttpResponse(content_type="text/csv")
        response["Content-Disposition"] = f'attachment; filename="sha_claims_{date.today()}.csv"'

        writer = csv.writer(response)
        writer.writerow(
            [
                "Claim Number",
                "Patient Name",
                "SHA Number",
                "Claim Type",
                "Status",
                "Service Date",
                "Claimed Amount",
                "Approved Amount",
                "Paid Amount",
                "Submitted At",
                "Created At",
            ]
        )

        for claim in queryset:
            writer.writerow(
                [
                    claim.claim_number,
                    (
                        f"{claim.patient.first_name} {claim.patient.last_name}"
                        if claim.patient
                        else ""
                    ),
                    claim.sha_member.sha_number if claim.sha_member else "",
                    claim.claim_type,
                    claim.status,
                    claim.service_date,
                    claim.claimed_amount,
                    claim.approved_amount or "",
                    claim.paid_amount or "",
                    claim.submitted_at or "",
                    claim.created_at,
                ]
            )

        return response

    def _export_excel(self, queryset):
        """Export claims to Excel format."""
        try:
            import openpyxl

            wb = openpyxl.Workbook()
            ws = wb.active
            if ws is None:
                ws = wb.create_sheet("SHA Claims")
            else:
                ws.title = "SHA Claims"

            # Headers
            headers = [
                "Claim Number",
                "Patient Name",
                "SHA Number",
                "Claim Type",
                "Status",
                "Service Date",
                "Claimed Amount",
                "Approved Amount",
                "Paid Amount",
                "Submitted At",
                "Created At",
            ]

            for col, header in enumerate(headers, 1):
                ws.cell(row=1, column=col, value=header)

            # Data
            for row, claim in enumerate(queryset, 2):
                ws.cell(row=row, column=1, value=claim.claim_number)
                ws.cell(
                    row=row,
                    column=2,
                    value=(
                        f"{claim.patient.first_name} {claim.patient.last_name}"
                        if claim.patient
                        else ""
                    ),
                )
                ws.cell(
                    row=row, column=3, value=claim.sha_member.sha_number if claim.sha_member else ""
                )
                ws.cell(row=row, column=4, value=claim.claim_type)
                ws.cell(row=row, column=5, value=claim.status)
                ws.cell(row=row, column=6, value=str(claim.service_date))
                ws.cell(row=row, column=7, value=float(claim.claimed_amount))
                ws.cell(
                    row=row,
                    column=8,
                    value=float(claim.approved_amount) if claim.approved_amount else "",
                )
                ws.cell(
                    row=row, column=9, value=float(claim.paid_amount) if claim.paid_amount else ""
                )
                ws.cell(
                    row=row, column=10, value=str(claim.submitted_at) if claim.submitted_at else ""
                )
                ws.cell(row=row, column=11, value=str(claim.created_at))

            # Save to bytes
            output = BytesIO()
            wb.save(output)
            output.seek(0)

            response = HttpResponse(
                output.read(),
                content_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            )
            response["Content-Disposition"] = (
                f'attachment; filename="sha_claims_{date.today()}.xlsx"'
            )
            return response

        except ImportError:
            # Fallback to CSV if openpyxl not available
            return self._export_csv(queryset)
