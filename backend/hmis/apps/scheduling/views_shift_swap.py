# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
# ruff: noqa
"""
What this file is for: shift swap filters and viewset actions.
How to use: imported by `hmis.apps.scheduling.views` compatibility shim.
Supported inputs/args: DRF filter/viewset classes for shift swap requests and approvals.
"""

import logging
from datetime import datetime, timedelta

from django.db import models
from django.utils import timezone
from django_filters import rest_framework as filters
from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import extend_schema, inline_serializer
from rest_framework import permissions, serializers, status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from hmis.apps.core.mixins import (
    NestedTenantScopeMixin,
    ReadOnCreateMixin,
    TenantScopedViewMixin,
    resolve_request_tenant,
)
from hmis.apps.core.models import AuditLog
from hmis.apps.core.permissions import ReadRequiresModelPermission
from hmis.apps.scheduling.models import (
    Appointment,
    AssignmentDecision,
    AssignmentOverride,
    AssignmentRule,
    Resource,
    Schedule,
    Shift,
    ShiftSwapRequest,
)
from hmis.apps.scheduling.serializers import (
    AppointmentCancelSerializer,
    AppointmentCheckInSerializer,
    AppointmentCompleteSerializer,
    AppointmentConfirmSerializer,
    AppointmentCreateSerializer,
    AppointmentListSerializer,
    AppointmentNoShowSerializer,
    AppointmentSerializer,
    AppointmentStartSerializer,
    AvailabilityQuerySerializer,
    ResourceListSerializer,
    ResourceSerializer,
    ScheduleBreakSerializer,
    ScheduleCreateSerializer,
    ScheduleSerializer,
    SchedulingSettingsSerializer,
    ShiftCancelSerializer,
    ShiftCreateSerializer,
    ShiftListSerializer,
    ShiftSerializer,
    ShiftStartSerializer,
    ShiftSwapAcceptSerializer,
    ShiftSwapApproveSerializer,
    ShiftSwapCreateSerializer,
    ShiftSwapRejectSerializer,
    ShiftSwapRequestListSerializer,
    ShiftSwapRequestSerializer,
    ShiftTypeConfigSerializer,
    SlotCheckQuerySerializer,
    StaffConstraintSerializer,
    StaffWorkloadSerializer,
    WeeklyAvailabilityQuerySerializer,
)
from hmis.apps.scheduling.services import (
    check_slot_available,
    get_available_slots,
    get_weekly_availability,
)

logger = logging.getLogger(__name__)


class ShiftSwapFilter(filters.FilterSet):
    """Filter for ShiftSwapRequest model."""

    status = filters.CharFilter(field_name="status")
    requester = filters.NumberFilter(field_name="requester")
    requesting_shift = filters.NumberFilter(field_name="requesting_shift")
    target_staff = filters.NumberFilter(field_name="target_staff")
    is_partial = filters.BooleanFilter(field_name="is_partial")

    class Meta:
        model = ShiftSwapRequest
        fields = ["status", "requester", "requesting_shift", "target_staff", "is_partial"]


class ShiftSwapViewSet(TenantScopedViewMixin, ReadOnCreateMixin, viewsets.ModelViewSet):
    """
    ViewSet for managing shift swap requests.

    Endpoints:
        GET    /api/scheduling/shift-swaps/              - List swap requests
        POST   /api/scheduling/shift-swaps/              - Create swap request
        GET    /api/scheduling/shift-swaps/{id}/         - Retrieve swap request
        DELETE /api/scheduling/shift-swaps/{id}/         - Delete swap request (only PENDING)

    Lifecycle actions:
        POST   /api/scheduling/shift-swaps/{id}/accept/   - Peer accepts
        POST   /api/scheduling/shift-swaps/{id}/reject/   - Peer or manager rejects
        POST   /api/scheduling/shift-swaps/{id}/approve/  - Manager approves
        POST   /api/scheduling/shift-swaps/{id}/cancel/   - Requester cancels

    Special endpoints:
        GET    /api/scheduling/shift-swaps/available/      - Open swaps I can accept
        GET    /api/scheduling/shift-swaps/my-requests/    - My swap requests
    """

    queryset = ShiftSwapRequest.objects.select_related(
        "requesting_shift",
        "requesting_shift__staff_resource",
        "target_shift",
        "target_shift__staff_resource",
        "target_staff",
        "requester",
        "accepted_by",
        "accepted_shift",
        "accepted_shift__staff_resource",
        "reviewed_by",
    )
    serializer_class = ShiftSwapRequestSerializer
    permission_classes = [permissions.IsAuthenticated, ReadRequiresModelPermission]
    filterset_class = ShiftSwapFilter
    tenant_scope = "facility"

    def get_queryset(self):
        """Resolve tenant scope with an explicit facility-header fallback for peer workflows."""
        self._resolve_tenant_context()

        base_qs = self.queryset.all()
        facility = getattr(self.request, "facility", None)
        organization = getattr(self.request, "organization", None)

        if facility is not None:
            return base_qs.filter(facility=facility)
        if organization is not None:
            return base_qs.filter(organization=organization)
        if getattr(self.request.user, "is_superuser", False):
            return base_qs

        # Some swap endpoints are intentionally peer-facing; allow clients that
        # explicitly pass facility context via header even if middleware cannot
        # infer tenant from user profile.
        raw_facility_id = self.request.META.get("HTTP_X_FACILITY_ID")
        if raw_facility_id:
            try:
                return base_qs.filter(facility_id=int(raw_facility_id))
            except (TypeError, ValueError):
                return base_qs.none()

        return base_qs.none()

    def get_serializer_class(self):
        if self.action == "create":
            return ShiftSwapCreateSerializer
        if self.action == "list":
            return ShiftSwapRequestListSerializer
        if self.action == "accept":
            return ShiftSwapAcceptSerializer
        if self.action == "reject":
            return ShiftSwapRejectSerializer
        if self.action == "approve":
            return ShiftSwapApproveSerializer
        return ShiftSwapRequestSerializer

    def perform_create(self, serializer):
        """Create swap request with auto-set requester & expiry."""
        shift = serializer.validated_data["requesting_shift"]
        from datetime import datetime as dt

        shift_start_dt = (
            timezone.make_aware(dt.combine(shift.shift_date, shift.start_time))
            if timezone.is_naive(dt.combine(shift.shift_date, shift.start_time))
            else dt.combine(shift.shift_date, shift.start_time)
        )

        default_expiry = timezone.now() + timedelta(hours=48)
        before_shift = shift_start_dt - timedelta(hours=48)
        expires_at = (
            min(default_expiry, before_shift) if before_shift > timezone.now() else default_expiry
        )

        instance = serializer.save(
            requester=self.request.user,
            expires_at=expires_at,
            **self.get_tenant_save_kwargs(),
        )
        AuditLog.log(
            action="shift_swap_request",
            user=self.request.user,
            resource_type="ShiftSwapRequest",
            resource_id=instance.id,
            details={
                "requesting_shift_id": instance.requesting_shift_id,
                "target_shift_id": instance.target_shift_id,
                "is_partial": instance.is_partial,
            },
            ip_address=self._get_client_ip(),
        )

    def perform_destroy(self, instance):
        if instance.status != "PENDING":
            from rest_framework.exceptions import ValidationError

            raise ValidationError("Can only delete swap requests with PENDING status.")
        instance.delete()

    @action(detail=True, methods=["post"])
    def accept(self, request, pk=None):
        """Peer accepts the swap request."""
        swap = self.get_object()
        if swap.status != "PENDING":
            return Response(
                {"error": "Can only accept PENDING swap requests."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        serializer = ShiftSwapAcceptSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        offered_shift = serializer.validated_data.get("offered_shift")

        try:
            swap.accept(user=request.user, offered_shift=offered_shift)
        except ValueError as e:
            return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)

        AuditLog.log(
            action="shift_swap_accept",
            user=request.user,
            resource_type="ShiftSwapRequest",
            resource_id=swap.id,
            details={"offered_shift_id": offered_shift.id if offered_shift else None},
            ip_address=self._get_client_ip(),
        )
        return Response(ShiftSwapRequestSerializer(swap).data)

    @action(detail=True, methods=["post"])
    def reject(self, request, pk=None):
        """Peer or manager rejects the swap request."""
        swap = self.get_object()
        if swap.status not in ("PENDING", "ACCEPTED"):
            return Response(
                {"error": "Can only reject PENDING or ACCEPTED swap requests."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        serializer = ShiftSwapRejectSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        try:
            swap.reject(user=request.user, reason=serializer.validated_data.get("reason", ""))
        except ValueError as e:
            return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)

        AuditLog.log(
            action="shift_swap_reject",
            user=request.user,
            resource_type="ShiftSwapRequest",
            resource_id=swap.id,
            details={"reason": serializer.validated_data.get("reason", "")},
            ip_address=self._get_client_ip(),
        )
        return Response(ShiftSwapRequestSerializer(swap).data)

    @action(detail=True, methods=["post"])
    def approve(self, request, pk=None):
        """Manager approves the swap (requires manage_schedules permission)."""
        if (
            not request.user.has_perm("scheduling.manage_schedules")
            and not request.user.is_superuser
        ):
            return Response(
                {"error": "You need manage_schedules permission to approve swaps."},
                status=status.HTTP_403_FORBIDDEN,
            )

        swap = self.get_object()
        if swap.status != "ACCEPTED":
            return Response(
                {"error": "Can only approve ACCEPTED swap requests."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        serializer = ShiftSwapApproveSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        try:
            swap.approve(user=request.user, notes=serializer.validated_data.get("notes", ""))
        except ValueError as e:
            return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)

        AuditLog.log(
            action="shift_swap_approve",
            user=request.user,
            resource_type="ShiftSwapRequest",
            resource_id=swap.id,
            details={"notes": serializer.validated_data.get("notes", "")},
            ip_address=self._get_client_ip(),
        )
        return Response(ShiftSwapRequestSerializer(swap).data)

    @action(detail=True, methods=["post"])
    def cancel(self, request, pk=None):
        """Requester cancels their own swap request."""
        swap = self.get_object()
        if swap.requester != request.user:
            return Response(
                {"error": "Only the requester can cancel a swap request."},
                status=status.HTTP_403_FORBIDDEN,
            )
        if swap.status != "PENDING":
            return Response(
                {"error": "Can only cancel PENDING swap requests."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            swap.cancel()
        except ValueError as e:
            return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)

        AuditLog.log(
            action="shift_swap_cancel",
            user=request.user,
            resource_type="ShiftSwapRequest",
            resource_id=swap.id,
            details={},
            ip_address=self._get_client_ip(),
        )
        return Response(ShiftSwapRequestSerializer(swap).data)

    @action(detail=False, methods=["get"])
    def available(self, request):
        """List open swap requests that the current user can accept."""
        qs = (
            self.get_queryset()
            .filter(
                status="PENDING",
                expires_at__gt=timezone.now(),
            )
            .exclude(requester=request.user)
        )

        user_resources = Resource.objects.filter(
            staff_profile__user=request.user,
            resource_type="PERSON",
        ).values_list("id", flat=True)

        from django.db.models import Q

        qs = qs.filter(Q(target_staff__isnull=True) | Q(target_staff__in=user_resources))

        serializer = ShiftSwapRequestListSerializer(qs, many=True)
        return Response(serializer.data)

    @action(detail=False, methods=["get"], url_path="my-requests")
    def my_requests(self, request):
        """List swap requests created by or targeting the current user."""
        user_resources = Resource.objects.filter(
            staff_profile__user=request.user,
            resource_type="PERSON",
        ).values_list("id", flat=True)

        from django.db.models import Q

        qs = self.get_queryset().filter(
            Q(requester=request.user) | Q(target_staff__in=user_resources)
        )
        serializer = ShiftSwapRequestListSerializer(qs, many=True)
        return Response(serializer.data)

    def _get_client_ip(self) -> str:
        xff = self.request.META.get("HTTP_X_FORWARDED_FOR")
        if xff:
            return xff.split(",")[0].strip()
        return self.request.META.get("REMOTE_ADDR", "")
