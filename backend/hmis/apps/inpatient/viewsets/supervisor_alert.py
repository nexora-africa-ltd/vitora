"""
What this file is for: supervisor critical-violation alert polling and acknowledgment APIs.
How to use: imported and re-exported by ``inpatient.views`` to preserve router imports.
Supported inputs/args: DRF ViewSet list/acknowledge/metrics endpoints with query/body payloads.
"""

from django.db.models import Count
from django.utils import timezone
from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework import status, viewsets
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from hmis.apps.core.mixins import resolve_request_tenant
from hmis.apps.core.models import AuditLog
from hmis.apps.core.permissions import (
    ReadRequiresModelPermission,
    WriteRequiresRolePermission,
    get_client_ip,
)

from ..models import Admission, SupervisorAlertAcknowledgment
from ..serializers import ConstraintOverrideMetricsSerializer, SupervisorAlertsResponseSerializer


class SupervisorAlertViewSet(viewsets.ViewSet):
    """ViewSet for supervisor critical violation alerts."""

    permission_classes = [IsAuthenticated, WriteRequiresRolePermission, ReadRequiresModelPermission]

    def _resolve_tenant_context(self):
        """Resolve facility/org from request (same logic as NestedTenantScopeMixin)."""
        resolve_request_tenant(self.request)

    def _tenant_admission_filter(self) -> dict:
        """Return filter kwargs to scope Admission queries to the current tenant."""
        self._resolve_tenant_context()
        facility = getattr(self.request, "facility", None)
        org = getattr(self.request, "organization", None)
        if facility:
            return {"facility": facility}
        if org:
            return {"organization": org}
        return {}

    @extend_schema(
        summary="List supervisor critical violation alerts",
        description=(
            "List recent admissions with CRITICAL constraint violations that were overridden. "
            "Requires receive_critical_alerts permission. Used as polling fallback for WebSocket alerts."
        ),
        parameters=[
            OpenApiParameter(
                name="since",
                type=str,
                location=OpenApiParameter.QUERY,
                description="ISO timestamp to filter alerts after (optional)",
                required=False,
            ),
            OpenApiParameter(
                name="limit",
                type=int,
                location=OpenApiParameter.QUERY,
                description="Maximum number of alerts to return (default: 20)",
                required=False,
            ),
        ],
        responses={
            200: SupervisorAlertsResponseSerializer,
            403: {"description": "Permission denied - requires receive_critical_alerts permission"},
        },
        tags=["Inpatient - Supervisor Alerts"],
    )
    def list(self, request):
        """List recent critical violation alerts for supervisors."""
        from django.utils.dateparse import parse_datetime

        if not request.user.has_perm("inpatient.receive_critical_alerts"):
            return Response(
                {"detail": "Permission denied. Requires receive_critical_alerts permission."},
                status=status.HTTP_403_FORBIDDEN,
            )

        since_param = request.query_params.get("since")
        since_dt = parse_datetime(since_param) if since_param else None
        limit = int(request.query_params.get("limit", 20))

        admissions_qs = (
            Admission.objects.filter(
                **self._tenant_admission_filter(),
                constraint_violations__isnull=False,
                constraint_override=True,
            )
            .exclude(constraint_violations=[])
            .select_related(
                "patient",
                "ward",
                "bed",
                "admitting_officer",
                "alert_acknowledgment__acknowledged_by",
            )
            .order_by("-created_at")
        )

        if since_dt:
            admissions_qs = admissions_qs.filter(created_at__gt=since_dt)

        alerts = []
        for admission in admissions_qs[: limit * 2]:
            critical_violations = [
                violation
                for violation in admission.constraint_violations
                if violation.get("severity") == "CRITICAL"
            ]
            if critical_violations:
                is_acknowledged = hasattr(admission, "alert_acknowledgment")
                alerts.append(
                    {
                        "admission_id": admission.id,
                        "admission_number": admission.admission_number,
                        "patient_id": admission.patient.id,
                        "patient_name": f"{admission.patient.first_name} {admission.patient.last_name}",
                        "patient_mrn": admission.patient.mrn,
                        "ward_id": admission.ward.id,
                        "ward_name": admission.ward.name,
                        "bed_number": admission.bed.bed_number,
                        "critical_violations": critical_violations,
                        "override_reason": admission.constraint_override_reason,
                        "admitted_by": (
                            admission.admitting_officer.get_full_name()
                            if admission.admitting_officer
                            else "Unknown"
                        ),
                        "timestamp": admission.created_at.isoformat(),
                        "is_acknowledged": is_acknowledged,
                        "acknowledged_by": (
                            admission.alert_acknowledgment.acknowledged_by.get_full_name()
                            if is_acknowledged
                            else None
                        ),
                        "acknowledged_at": (
                            admission.alert_acknowledgment.acknowledged_at.isoformat()
                            if is_acknowledged
                            else None
                        ),
                    }
                )
                if len(alerts) >= limit:
                    break

        return Response({"alerts": alerts})

    @extend_schema(
        summary="Acknowledge a supervisor critical violation alert",
        description=(
            "Acknowledge a critical constraint violation that was overridden during admission. "
            "Requires receive_critical_alerts permission."
        ),
        request={
            "application/json": {
                "type": "object",
                "properties": {
                    "admission_id": {
                        "type": "integer",
                        "description": "Admission ID to acknowledge",
                    },
                    "notes": {"type": "string", "description": "Optional notes from supervisor"},
                },
                "required": ["admission_id"],
            }
        },
        responses={
            200: {"description": "Alert acknowledged successfully"},
            400: {"description": "Invalid request or already acknowledged"},
            403: {"description": "Permission denied"},
            404: {"description": "Admission not found or has no critical violations"},
        },
        tags=["Inpatient - Supervisor Alerts"],
    )
    def acknowledge(self, request):
        """Acknowledge a supervisor critical violation alert."""
        if not request.user.has_perm("inpatient.receive_critical_alerts"):
            return Response(
                {"detail": "Permission denied. Requires receive_critical_alerts permission."},
                status=status.HTTP_403_FORBIDDEN,
            )

        admission_id = request.data.get("admission_id")
        notes = request.data.get("notes", "")

        if not admission_id:
            return Response(
                {"detail": "admission_id is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            admission = Admission.objects.get(**self._tenant_admission_filter(), id=admission_id)
        except Admission.DoesNotExist:
            return Response(
                {"detail": "Admission not found."},
                status=status.HTTP_404_NOT_FOUND,
            )

        critical_violations = [
            violation
            for violation in admission.constraint_violations
            if violation.get("severity") == "CRITICAL"
        ]
        if not critical_violations:
            return Response(
                {"detail": "Admission has no critical violations to acknowledge."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if hasattr(admission, "alert_acknowledgment"):
            return Response(
                {"detail": "Alert already acknowledged."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        acknowledgment = SupervisorAlertAcknowledgment.objects.create(
            admission=admission,
            acknowledged_by=request.user,
            notes=notes,
        )

        AuditLog.log(
            action="supervisor_alert_acknowledge",
            user=request.user,
            resource_type="Admission",
            resource_id=admission.id,
            details={
                "admission_number": admission.admission_number,
                "violations": admission.constraint_violations,
                "notes": notes,
            },
            ip_address=get_client_ip(request),
        )

        return Response(
            {
                "message": "Alert acknowledged successfully.",
                "acknowledgment_id": acknowledgment.id,
                "acknowledged_at": acknowledgment.acknowledged_at.isoformat(),
            }
        )

    @extend_schema(
        summary="Get constraint override metrics",
        description=(
            "Get statistics on constraint overrides including counts, rates, "
            "breakdown by violation type and ward, and common override reasons. "
            "Requires receive_critical_alerts permission."
        ),
        parameters=[
            OpenApiParameter(
                name="days",
                type=int,
                location=OpenApiParameter.QUERY,
                description="Number of days to include in metrics (default: 30)",
                required=False,
            ),
        ],
        responses={200: ConstraintOverrideMetricsSerializer},
        tags=["Inpatient - Supervisor Alerts"],
    )
    def metrics(self, request):
        """Get constraint override metrics."""
        from collections import Counter
        from datetime import timedelta

        if not request.user.has_perm("inpatient.receive_critical_alerts"):
            return Response(
                {"detail": "Permission denied. Requires receive_critical_alerts permission."},
                status=status.HTTP_403_FORBIDDEN,
            )

        days = int(request.query_params.get("days", 30))
        since_date = timezone.now() - timedelta(days=days)

        tenant_filter = self._tenant_admission_filter()
        total_admissions = Admission.objects.filter(
            **tenant_filter, created_at__gte=since_date
        ).count()

        override_qs = Admission.objects.filter(
            **tenant_filter,
            created_at__gte=since_date,
            constraint_override=True,
        ).select_related("ward")

        override_count = override_qs.count()
        override_rate = (override_count / total_admissions * 100) if total_admissions > 0 else 0.0

        critical_admissions = []
        for admission in override_qs.exclude(constraint_violations=[]):
            has_critical = any(
                violation.get("severity") == "CRITICAL"
                for violation in admission.constraint_violations
            )
            if has_critical:
                critical_admissions.append(admission.id)

        critical_override_count = len(critical_admissions)
        acknowledged_count = SupervisorAlertAcknowledgment.objects.filter(
            admission_id__in=critical_admissions
        ).count()
        pending_acknowledgment_count = critical_override_count - acknowledged_count

        violation_counter: Counter[str] = Counter()
        for admission in override_qs.exclude(constraint_violations=[]):
            for violation in admission.constraint_violations:
                code = violation.get("code", "UNKNOWN")
                violation_counter[code] += 1

        violation_breakdown = [
            {"code": code, "count": count} for code, count in violation_counter.most_common()
        ]

        ward_stats = (
            override_qs.values("ward__id", "ward__name")
            .annotate(override_count=Count("id"))
            .order_by("-override_count")
        )
        ward_breakdown = [
            {
                "ward_id": ward_stat["ward__id"],
                "ward_name": ward_stat["ward__name"],
                "override_count": ward_stat["override_count"],
            }
            for ward_stat in ward_stats
        ]

        reason_counter: Counter[str] = Counter()
        for admission in override_qs.exclude(constraint_override_reason=""):
            reason = admission.constraint_override_reason.strip()
            if reason:
                reason_counter[reason] += 1

        common_reasons = [
            {"reason": reason, "count": count} for reason, count in reason_counter.most_common(10)
        ]

        return Response(
            {
                "total_admissions": total_admissions,
                "override_count": override_count,
                "override_rate": round(override_rate, 2),
                "critical_override_count": critical_override_count,
                "acknowledged_count": acknowledged_count,
                "pending_acknowledgment_count": pending_acknowledgment_count,
                "violation_breakdown": violation_breakdown,
                "ward_breakdown": ward_breakdown,
                "common_reasons": common_reasons,
            }
        )
