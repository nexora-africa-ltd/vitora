# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""
Views for Emergency Access module.
"""

import logging
from collections import defaultdict
from csv import writer
from datetime import timedelta
from io import StringIO
from statistics import median

from django.db.models import Count
from django.http import HttpResponse
from django.utils import timezone
from rest_framework import permissions, status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from hmis.apps.core.models import AuditLog
from hmis.apps.core.permissions import ReadRequiresModelPermission, get_client_ip

from .models import EmergencyAccess, EmergencyAccessStatus
from .serializers import (
    EmergencyAccessCreateSerializer,
    EmergencyAccessDashboardStatsSerializer,
    EmergencyAccessReviewSerializer,
    EmergencyAccessSerializer,
)
from .tasks import send_emergency_access_escalation

logger = logging.getLogger(__name__)


def _normalize_bucket_key(value: str | None, fallback: str) -> str:
    if not value:
        return fallback
    return str(value)


def _sanitize_log_field(value: object) -> str:
    text = str(value)
    return text.replace("\r", " ").replace("\n", " ")


class CanApproveEmergencyAccess(permissions.BasePermission):
    """Permission to approve/revoke emergency access."""

    def has_permission(self, request, view):
        """Check if user can approve emergency access."""
        if not request.user or not request.user.is_authenticated:
            return False
        return request.user.is_superuser or request.user.has_perm("core.approve_emergency_access")


class CanViewEmergencyDashboard(permissions.BasePermission):
    """Permission to view emergency access dashboard."""

    def has_permission(self, request, view):
        """Check if user can view dashboard."""
        if not request.user or not request.user.is_authenticated:
            return False
        return (
            request.user.is_superuser
            or request.user.has_perm("core.view_emergency_dashboard")
            or request.user.has_perm("core.approve_emergency_access")
        )


class EmergencyAccessViewSet(viewsets.ModelViewSet):
    """
    ViewSet for Emergency Access (Break-Glass) functionality.

    Provides endpoints for:
    - Creating emergency access requests (break-glass)
    - Viewing emergency access history
    - Reviewing/approving emergency access
    - Dashboard statistics for administrators
    """

    serializer_class = EmergencyAccessSerializer
    lookup_value_regex = r"\d+"
    permission_classes = [permissions.IsAuthenticated, ReadRequiresModelPermission]

    def get_queryset(self):
        """Get queryset based on user permissions."""
        user = self.request.user
        qs = EmergencyAccess.objects.select_related("user", "patient", "approver", "revoked_by")

        # Superusers and those with approve permission can see all
        if user.is_superuser or user.has_perm("core.approve_emergency_access"):
            return qs

        # Otherwise, users can only see their own requests
        return qs.filter(user=user)

    def get_serializer_class(self):
        """Return appropriate serializer for action."""
        if self.action == "create":
            return EmergencyAccessCreateSerializer
        if self.action == "review":
            return EmergencyAccessReviewSerializer
        if self.action == "dashboard_stats":
            return EmergencyAccessDashboardStatsSerializer
        return EmergencyAccessSerializer

    def create(self, request, *args, **kwargs):
        """
        Create an emergency access (break-glass) request.

        This endpoint invokes emergency access, bypassing normal access
        controls. All invocations are logged and trigger escalation alerts.
        """
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        # Create the emergency access record
        emergency_access = serializer.save(
            user=request.user,
            ip_address=get_client_ip(request),
            user_agent=request.META.get("HTTP_USER_AGENT", ""),
        )

        # Log to audit trail
        AuditLog.log(
            action="emergency_access_invoke",
            user=request.user,
            resource_type="EmergencyAccess",
            resource_id=emergency_access.id,
            ip_address=get_client_ip(request),
            user_agent=request.META.get("HTTP_USER_AGENT", ""),
            patient_id=emergency_access.patient_id,
            details={
                "reason": emergency_access.reason,
                "reason_details": emergency_access.reason_details,
                "duration_minutes": emergency_access.duration_minutes,
                "expires_at": emergency_access.expires_at.isoformat(),
                "patient_mrn": emergency_access.patient.mrn if emergency_access.patient else None,
            },
        )

        # Trigger escalation notification asynchronously
        try:
            send_emergency_access_escalation.delay(emergency_access.id)
        except (
            AttributeError,
            TypeError,
            ValueError,
            RuntimeError,
            OSError,
            AssertionError,
            ImportError,
        ) as exc:
            logger.warning("Failed to queue escalation notification (%s)", type(exc).__name__)

        logger.warning(
            "Emergency access invoked by %s (reason: %s, patient: %s)",
            _sanitize_log_field(request.user.username),
            _sanitize_log_field(emergency_access.reason),
            _sanitize_log_field(
                emergency_access.patient.mrn if emergency_access.patient else "N/A"
            ),
        )

        return Response(
            EmergencyAccessSerializer(emergency_access).data,
            status=status.HTTP_201_CREATED,
        )

    def list(self, request, *args, **kwargs):
        """List emergency access records with optional filtering."""
        queryset = self.get_queryset()

        # Filter by status
        status_filter = request.query_params.get("status")
        if status_filter:
            queryset = queryset.filter(status=status_filter)

        # Filter by pending review
        pending_review = request.query_params.get("pending_review")
        if pending_review and pending_review.lower() == "true":
            queryset = queryset.filter(
                status__in=[EmergencyAccessStatus.ACTIVE, EmergencyAccessStatus.EXPIRED]
            )

        # Filter by date range
        since = request.query_params.get("since")
        if since:
            queryset = queryset.filter(requested_at__gte=since)

        # Update expired statuses
        for ea in queryset.filter(status=EmergencyAccessStatus.ACTIVE):
            ea.check_expired()

        page = self.paginate_queryset(queryset)
        if page is not None:
            serializer = self.get_serializer(page, many=True)
            return self.get_paginated_response(serializer.data)

        serializer = self.get_serializer(queryset, many=True)
        return Response(serializer.data)

    def retrieve(self, request, *args, **kwargs):
        """Retrieve a specific emergency access record."""
        instance = self.get_object()
        instance.check_expired()
        serializer = self.get_serializer(instance)
        return Response(serializer.data)

    @action(detail=True, methods=["post"], permission_classes=[CanApproveEmergencyAccess])
    def review(self, request, pk=None):
        """
        Review an emergency access request (approve or revoke).

        POST /api/core/emergency-access/{id}/review/
        {
            "action": "approve" | "revoke",
            "notes": "Optional review notes"
        }
        """
        instance = self.get_object()
        serializer = EmergencyAccessReviewSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        action_type = serializer.validated_data["action"]
        notes = serializer.validated_data.get("notes", "")

        if action_type == "approve":
            instance.mark_reviewed(approver=request.user, notes=notes)
            audit_action = "emergency_access_approved"
        else:
            instance.revoke(user=request.user, reason=notes)
            audit_action = "emergency_access_revoked"

        # Log to audit trail
        AuditLog.log(
            action=audit_action,
            user=request.user,
            resource_type="EmergencyAccess",
            resource_id=instance.id,
            ip_address=get_client_ip(request),
            user_agent=request.META.get("HTTP_USER_AGENT", ""),
            patient_id=instance.patient_id,
            details={
                "original_user": instance.user.username,
                "notes": notes,
            },
        )

        logger.info(
            "Emergency access %s %sd by %s",
            instance.id,
            _sanitize_log_field(action_type),
            _sanitize_log_field(request.user.username),
        )

        return Response(EmergencyAccessSerializer(instance).data)

    @action(detail=False, methods=["get"], permission_classes=[CanViewEmergencyDashboard])
    def dashboard_stats(self, request):
        """
        Get dashboard statistics for emergency access.

        GET /api/core/emergency-access/dashboard_stats/
        """
        now = timezone.now()
        today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
        week_start = today_start - timedelta(days=now.weekday())

        # Update expired statuses first
        EmergencyAccess.objects.filter(
            status=EmergencyAccessStatus.ACTIVE, expires_at__lt=now
        ).update(status=EmergencyAccessStatus.EXPIRED, closed_at=now)

        # Aggregate statistics
        total_active = EmergencyAccess.objects.filter(
            status=EmergencyAccessStatus.ACTIVE,
            expires_at__gt=now,
        ).count()

        total_pending_review = EmergencyAccess.objects.filter(
            status__in=[EmergencyAccessStatus.ACTIVE, EmergencyAccessStatus.EXPIRED]
        ).count()

        total_today = EmergencyAccess.objects.filter(requested_at__gte=today_start).count()

        total_this_week = EmergencyAccess.objects.filter(requested_at__gte=week_start).count()

        by_reason = dict(
            EmergencyAccess.objects.filter(requested_at__gte=week_start)
            .values("reason")
            .annotate(count=Count("id"))
            .values_list("reason", "count")
        )

        by_status = dict(
            EmergencyAccess.objects.values("status")
            .annotate(count=Count("id"))
            .values_list("status", "count")
        )

        overdue_reviews = EmergencyAccess.objects.filter(
            status__in=[EmergencyAccessStatus.ACTIVE, EmergencyAccessStatus.EXPIRED],
            review_due_at__lt=now,
        ).count()

        review_durations = []
        for requested_at, approved_at in EmergencyAccess.objects.filter(
            status=EmergencyAccessStatus.REVIEWED,
            approved_at__isnull=False,
        ).values_list("requested_at", "approved_at"):
            if requested_at and approved_at and approved_at >= requested_at:
                review_durations.append((approved_at - requested_at).total_seconds() / 60)

        median_review_minutes = float(median(review_durations)) if review_durations else 0.0

        by_reason_role_raw = (
            EmergencyAccess.objects.filter(requested_at__gte=week_start)
            .values("reason", "user__staff_profile__primary_role__code")
            .annotate(count=Count("id"))
        )
        by_reason_role: dict[str, dict[str, int]] = defaultdict(dict)
        for row in by_reason_role_raw:
            reason = _normalize_bucket_key(row.get("reason"), "UNKNOWN")
            role = _normalize_bucket_key(
                row.get("user__staff_profile__primary_role__code"), "UNASSIGNED"
            )
            by_reason_role[reason][role] = row["count"]

        by_reason_facility_raw = (
            EmergencyAccess.objects.filter(requested_at__gte=week_start)
            .values("reason", "user__staff_profile__primary_facility__name")
            .annotate(count=Count("id"))
        )
        by_reason_facility: dict[str, dict[str, int]] = defaultdict(dict)
        for row in by_reason_facility_raw:
            reason = _normalize_bucket_key(row.get("reason"), "UNKNOWN")
            facility = _normalize_bucket_key(
                row.get("user__staff_profile__primary_facility__name"),
                "UNASSIGNED",
            )
            by_reason_facility[reason][facility] = row["count"]

        data = {
            "total_active": total_active,
            "total_pending_review": total_pending_review,
            "total_today": total_today,
            "total_this_week": total_this_week,
            "overdue_reviews": overdue_reviews,
            "median_review_minutes": median_review_minutes,
            "by_reason": by_reason,
            "by_status": by_status,
            "by_reason_role": dict(by_reason_role),
            "by_reason_facility": dict(by_reason_facility),
        }

        return Response(data)

    @action(detail=False, methods=["get"], permission_classes=[CanViewEmergencyDashboard])
    def export(self, request):
        """Export emergency access compliance report as JSON or CSV."""
        output_format = (
            request.query_params.get("export_format")
            or request.query_params.get("output")
            or "json"
        ).lower()
        queryset = self.get_queryset().order_by("-requested_at")
        rows = []
        for record in queryset:
            rows.append(
                {
                    "id": record.id,
                    "user_username": record.user.username,
                    "patient_mrn": record.patient.mrn if record.patient else "",
                    "reason": record.reason,
                    "status": record.status,
                    "requested_at": record.requested_at.isoformat() if record.requested_at else "",
                    "expires_at": record.expires_at.isoformat() if record.expires_at else "",
                    "review_due_at": record.review_due_at.isoformat()
                    if record.review_due_at
                    else "",
                    "approved_at": record.approved_at.isoformat() if record.approved_at else "",
                    "closed_at": record.closed_at.isoformat() if record.closed_at else "",
                    "duration_minutes": record.duration_minutes,
                    "scope_type": record.scope_type,
                    "access_mode": record.access_mode,
                }
            )

        if output_format == "csv":
            buffer = StringIO()
            csv_writer = writer(buffer)
            csv_writer.writerow(
                [
                    "id",
                    "user_username",
                    "patient_mrn",
                    "reason",
                    "status",
                    "requested_at",
                    "expires_at",
                    "review_due_at",
                    "approved_at",
                    "closed_at",
                    "duration_minutes",
                    "scope_type",
                    "access_mode",
                ]
            )
            for row in rows:
                csv_writer.writerow(
                    [
                        row["id"],
                        row["user_username"],
                        row["patient_mrn"],
                        row["reason"],
                        row["status"],
                        row["requested_at"],
                        row["expires_at"],
                        row["review_due_at"],
                        row["approved_at"],
                        row["closed_at"],
                        row["duration_minutes"],
                        row["scope_type"],
                        row["access_mode"],
                    ]
                )

            response = HttpResponse(buffer.getvalue(), content_type="text/csv; charset=utf-8")
            response["Content-Disposition"] = (
                f'attachment; filename="emergency-access-compliance-{timezone.now().date().isoformat()}.csv"'
            )
            return response

        return Response(
            {
                "generated_at": timezone.now().isoformat(),
                "count": len(rows),
                "records": rows,
            }
        )

    @action(detail=False, methods=["get"])
    def my_active(self, request):
        """
        Get current user's active emergency access.

        GET /api/core/emergency-access/my_active/
        """
        active = EmergencyAccess.get_active_for_user(request.user)
        serializer = self.get_serializer(active, many=True)
        return Response(serializer.data)

    @action(detail=True, methods=["post"])
    def close(self, request, pk=None):
        """Close current user's active emergency access session."""
        instance = self.get_object()
        if instance.user_id != request.user.id and not request.user.has_perm(
            "core.approve_emergency_access"
        ):
            return Response(
                {"detail": "You can only close your own emergency access sessions."},
                status=status.HTTP_403_FORBIDDEN,
            )

        if not instance.is_active:
            return Response(
                {"detail": "Emergency access session is no longer active."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        instance.close()
        AuditLog.log(
            action="emergency_access_closed",
            user=request.user,
            resource_type="EmergencyAccess",
            resource_id=instance.id,
            ip_address=get_client_ip(request),
            user_agent=request.META.get("HTTP_USER_AGENT", ""),
            patient_id=instance.patient_id,
            details={
                "closed_by_requester": instance.user_id == request.user.id,
            },
        )
        return Response(EmergencyAccessSerializer(instance).data)
