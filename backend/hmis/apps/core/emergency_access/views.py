"""
Views for Emergency Access module.
"""

import logging
from datetime import timedelta

from django.db.models import Count
from django.utils import timezone
from rest_framework import permissions, status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from hmis.apps.core.models import AuditLog
from hmis.apps.core.permissions import get_client_ip

from .models import EmergencyAccess, EmergencyAccessStatus
from .serializers import (
    EmergencyAccessCreateSerializer,
    EmergencyAccessDashboardStatsSerializer,
    EmergencyAccessReviewSerializer,
    EmergencyAccessSerializer,
)
from .tasks import send_emergency_access_escalation

logger = logging.getLogger(__name__)


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
    permission_classes = [permissions.IsAuthenticated]

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
        except Exception as e:
            logger.warning(f"Failed to queue escalation notification: {e}")

        logger.warning(
            f"Emergency access invoked by {request.user.username} "
            f"(reason: {emergency_access.reason}, "
            f"patient: {emergency_access.patient.mrn if emergency_access.patient else 'N/A'})"
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

        logger.info(f"Emergency access {instance.id} {action_type}d by {request.user.username}")

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
        ).update(status=EmergencyAccessStatus.EXPIRED)

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

        data = {
            "total_active": total_active,
            "total_pending_review": total_pending_review,
            "total_today": total_today,
            "total_this_week": total_this_week,
            "by_reason": by_reason,
            "by_status": by_status,
        }

        return Response(data)

    @action(detail=False, methods=["get"])
    def my_active(self, request):
        """
        Get current user's active emergency access.

        GET /api/core/emergency-access/my_active/
        """
        active = EmergencyAccess.get_active_for_user(request.user)
        serializer = self.get_serializer(active, many=True)
        return Response(serializer.data)
