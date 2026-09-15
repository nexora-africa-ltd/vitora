# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
# ruff: noqa: ARG002, F401, F811
"""Scheduling views assignment for Vitora HMIS.

What this file is for:
- Implement views assignment logic for the scheduling domain.

How to use it:
- Import classes and functions from this module in Django app code and tests.

Supported inputs/args:
- Python imports and Django ORM/runtime inputs; no standalone CLI arguments.
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

from hmis.apps.core.api_errors import safe_error_response
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
from hmis.apps.scheduling.services.assignment_defaults import seed_assignment_defaults_for_facility

logger = logging.getLogger(__name__)


class AssignmentEngineSuperuserPermission(permissions.BasePermission):
    """Restrict assignment engine endpoints to superusers only."""

    message = "Assignment Engine endpoints are restricted to superusers."

    def has_permission(self, request, view):
        return bool(request.user and request.user.is_authenticated and request.user.is_superuser)


class AssignmentRuleFilter(filters.FilterSet):
    """Filter for AssignmentRule model."""

    applies_to = filters.CharFilter(field_name="applies_to")
    is_active = filters.BooleanFilter(field_name="is_active")
    priority_gte = filters.NumberFilter(field_name="priority", lookup_expr="gte")
    rule_code = filters.CharFilter(field_name="rule_code", lookup_expr="icontains")

    class Meta:
        """Meta options for AssignmentRuleFilter."""

        model = AssignmentRule
        fields = ["applies_to", "is_active", "priority_gte", "rule_code"]


class AssignmentRuleViewSet(TenantScopedViewMixin, viewsets.ModelViewSet):
    """
    ViewSet for managing assignment rules.

    Supports CRUD operations plus activate/deactivate actions.
    """

    queryset = AssignmentRule.objects.all()
    permission_classes = [permissions.IsAuthenticated, AssignmentEngineSuperuserPermission]
    filterset_class = AssignmentRuleFilter
    tenant_scope = "facility"

    def get_serializer_class(self):
        """Use list serializer for list action."""
        from hmis.apps.scheduling.serializers import (
            AssignmentRuleListSerializer,
            AssignmentRuleSerializer,
        )

        if self.action == "list":
            return AssignmentRuleListSerializer
        return AssignmentRuleSerializer

    @action(detail=True, methods=["post"])
    def activate(self, request, pk=None):
        """Activate a rule."""
        from hmis.apps.scheduling.serializers import AssignmentRuleSerializer

        rule = self.get_object()
        rule.is_active = True
        rule.save(update_fields=["is_active", "updated_at"])
        return Response(AssignmentRuleSerializer(rule).data)

    @action(detail=True, methods=["post"])
    def deactivate(self, request, pk=None):
        """Deactivate a rule."""
        from hmis.apps.scheduling.serializers import AssignmentRuleSerializer

        rule = self.get_object()
        rule.is_active = False
        rule.save(update_fields=["is_active", "updated_at"])
        return Response(AssignmentRuleSerializer(rule).data)

    @action(detail=False, methods=["post"], url_path="seed-defaults")
    def seed_defaults(self, request):
        """Seed baseline assignment rules for the current facility."""
        if not request.user.is_superuser:
            return Response(
                {"detail": "You do not have permission to seed assignment defaults."},
                status=status.HTTP_403_FORBIDDEN,
            )

        resolve_request_tenant(request)
        facility = getattr(request, "facility", None)
        if facility is None:
            return Response(
                {"detail": "No facility context available for default seeding."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        dry_run_value = request.data.get("dry_run", False)
        if isinstance(dry_run_value, str):
            dry_run = dry_run_value.strip().lower() in {"1", "true", "yes", "on"}
        else:
            dry_run = bool(dry_run_value)
        result = seed_assignment_defaults_for_facility(
            facility=facility,
            created_by=request.user,
            dry_run=dry_run,
        )
        return Response(result)


class AssignmentDecisionFilter(filters.FilterSet):
    """Filter for AssignmentDecision model."""

    assignment_type = filters.CharFilter(field_name="assignment_type")
    target_type = filters.CharFilter(field_name="target_type")
    target_id = filters.NumberFilter(field_name="target_id")
    decision_outcome = filters.CharFilter(field_name="decision_outcome")

    class Meta:
        """Meta options for AssignmentDecisionFilter."""

        model = AssignmentDecision
        fields = ["assignment_type", "target_type", "target_id", "decision_outcome"]


class AssignmentDecisionViewSet(NestedTenantScopeMixin, viewsets.ReadOnlyModelViewSet):
    """
    ViewSet for viewing assignment decisions (read-only).

    Decisions are immutable - they serve as an audit trail.
    """

    from hmis.apps.scheduling.serializers import AssignmentDecisionSerializer

    queryset = AssignmentDecision.objects.all()
    serializer_class = AssignmentDecisionSerializer
    permission_classes = [permissions.IsAuthenticated, AssignmentEngineSuperuserPermission]
    filterset_class = AssignmentDecisionFilter
    tenant_facility_chain = "assigned_resource__facility"
    tenant_org_chain = "assigned_resource__organization"


class AssignmentOverrideFilter(filters.FilterSet):
    """Filter for AssignmentOverride model."""

    target_type = filters.CharFilter(field_name="target_type")
    target_id = filters.NumberFilter(field_name="target_id")
    override_reason = filters.CharFilter(field_name="override_reason")
    approval_status = filters.CharFilter(field_name="approval_status")

    class Meta:
        """Meta options for AssignmentOverrideFilter."""

        model = AssignmentOverride
        fields = ["target_type", "target_id", "override_reason", "approval_status"]


class AssignmentOverrideViewSet(NestedTenantScopeMixin, viewsets.ModelViewSet):
    """
    ViewSet for managing assignment overrides.

    Supports creating overrides and approval/rejection workflow.
    """

    from hmis.apps.scheduling.serializers import AssignmentOverrideSerializer

    queryset = AssignmentOverride.objects.all()
    serializer_class = AssignmentOverrideSerializer
    permission_classes = [permissions.IsAuthenticated, AssignmentEngineSuperuserPermission]
    filterset_class = AssignmentOverrideFilter
    tenant_facility_chain = "new_resource__facility"
    tenant_org_chain = "new_resource__organization"

    @action(detail=True, methods=["post"])
    def approve(self, request, pk=None):
        """Approve a pending override."""
        from hmis.apps.scheduling.serializers import (
            AssignmentOverrideSerializer,
            OverrideApprovalSerializer,
        )

        override = self.get_object()
        serializer = OverrideApprovalSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        try:
            override.approve(
                user=request.user,
                notes=serializer.validated_data.get("notes", ""),
            )
        except ValueError as e:
            return safe_error_response(
                action="scheduling.override_approve",
                exc=e,
                logger=logger,
                expose_message_for=(),
            )

        return Response(AssignmentOverrideSerializer(override).data)

    @action(detail=True, methods=["post"])
    def reject(self, request, pk=None):
        """Reject a pending override."""
        from hmis.apps.scheduling.serializers import (
            AssignmentOverrideSerializer,
            OverrideRejectionSerializer,
        )

        override = self.get_object()
        serializer = OverrideRejectionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        try:
            override.reject(
                user=request.user,
                reason=serializer.validated_data["reason"],
            )
        except ValueError as e:
            return safe_error_response(
                action="scheduling.override_reject",
                exc=e,
                logger=logger,
                expose_message_for=(),
            )

        return Response(AssignmentOverrideSerializer(override).data)


class AssignmentViewSet(viewsets.ViewSet):
    """
    ViewSet for assignment actions.

    Provides auto-assign and manual-override endpoints.
    """

    permission_classes = [permissions.IsAuthenticated, AssignmentEngineSuperuserPermission]

    @extend_schema(
        request=inline_serializer(
            name="AutoAssignRequest",
            fields={
                "assignment_type": serializers.CharField(),
                "patient_id": serializers.IntegerField(required=False),
                "scheduled_start": serializers.DateTimeField(),
                "scheduled_end": serializers.DateTimeField(),
                "reason": serializers.CharField(required=False),
                "candidate_ids": serializers.ListField(
                    child=serializers.IntegerField(), required=False
                ),
            },
        ),
        responses={200: OpenApiTypes.OBJECT},
    )
    @action(detail=False, methods=["post"], url_path="auto-assign")
    def auto_assign(self, request):
        """
        Automatically assign a resource based on active rules.

        Request body:
        {
            "assignment_type": "APPOINTMENT",
            "patient_id": 123,
            "scheduled_start": "2026-02-07T10:00:00Z",
            "scheduled_end": "2026-02-07T10:30:00Z",
            "reason": "General checkup",
            "candidate_ids": [1, 2, 3]
        }
        """
        from hmis.apps.patients.models import Patient
        from hmis.apps.scheduling.models import Resource
        from hmis.apps.scheduling.serializers import AutoAssignRequestSerializer
        from hmis.apps.scheduling.services.assignment import AssignmentService

        resolve_request_tenant(request)

        serializer = AutoAssignRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        # Get patient if specified
        patient = None
        if data.get("patient_id"):
            try:
                patient = Patient.objects.get(id=data["patient_id"])
            except Patient.DoesNotExist:
                return Response(
                    {"error": "Patient not found"},
                    status=status.HTTP_404_NOT_FOUND,
                )

        # Get candidate resources
        candidate_ids = data.get("candidate_ids", [])
        facility = getattr(request, "facility", None)
        if candidate_ids:
            candidates_qs = Resource.objects.filter(id__in=candidate_ids, is_active=True)
        else:
            candidates_qs = Resource.objects.filter(is_active=True, resource_type="PERSON")
        if facility:
            candidates_qs = candidates_qs.filter(facility=facility)
        elif not getattr(request.user, "is_superuser", False):
            return Response(
                {"error": "No facility context for resource scoping"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        candidates = list(candidates_qs)

        if not candidates:
            return Response(
                {"error": "No candidates available"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Build target data
        target_data = {
            "patient": patient,
            "scheduled_start": data.get("scheduled_start"),
            "scheduled_end": data.get("scheduled_end"),
            "reason": data.get("reason", "Auto-assigned"),
            "appointment_type": data.get("appointment_type", "CONSULTATION"),
        }

        # Perform assignment
        service = AssignmentService()
        result = service.auto_assign(
            assignment_type=data["assignment_type"],
            target_data=target_data,
            candidates=candidates,
            user=request.user,
        )

        # Build response
        from hmis.apps.scheduling.serializers import (
            AssignmentDecisionSerializer,
            ResourceListSerializer,
        )

        response_data = {
            "success": result.success,
            "assigned_resource": (
                ResourceListSerializer(result.assigned_resource).data
                if result.assigned_resource
                else None
            ),
            "decision": (
                AssignmentDecisionSerializer(result.decision).data if result.decision else None
            ),
            "target_id": result.target_id,
            "error": result.error,
        }

        return Response(response_data)

    @extend_schema(
        request=inline_serializer(
            name="ManualOverrideRequest",
            fields={
                "target_type": serializers.CharField(),
                "target_id": serializers.IntegerField(),
                "new_resource_id": serializers.IntegerField(),
                "override_reason": serializers.CharField(),
                "justification": serializers.CharField(required=False),
                "requires_approval": serializers.BooleanField(required=False),
            },
        ),
        responses={200: OpenApiTypes.OBJECT},
    )
    @action(detail=False, methods=["post"], url_path="manual-override")
    def manual_override(self, request):
        """
        Manually override an assignment.

        Request body:
        {
            "target_type": "Appointment",
            "target_id": 123,
            "new_resource_id": 456,
            "override_reason": "PATIENT_REQUEST",
            "justification": "Patient requested different doctor"
        }"""
        from hmis.apps.scheduling.models import Resource
        from hmis.apps.scheduling.serializers import (
            AssignmentOverrideSerializer,
            ManualOverrideRequestSerializer,
        )
        from hmis.apps.scheduling.services.assignment import AssignmentService

        resolve_request_tenant(request)

        serializer = ManualOverrideRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        # Get new resource
        try:
            resource_qs = Resource.objects.all()
            facility = getattr(request, "facility", None)
            if facility:
                resource_qs = resource_qs.filter(facility=facility)
            elif not getattr(request.user, "is_superuser", False):
                return Response(
                    {"error": "No facility context for resource scoping"},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            new_resource = resource_qs.get(id=data["new_resource_id"])
        except Resource.DoesNotExist:
            return Response(
                {"error": "Resource not found"},
                status=status.HTTP_404_NOT_FOUND,
            )

        # Perform override
        service = AssignmentService()
        result = service.manual_override(
            target_type=data["target_type"],
            target_id=data["target_id"],
            new_resource=new_resource,
            override_reason=data["override_reason"],
            justification=data["justification"],
            user=request.user,
            requires_approval=data.get("requires_approval", False),
        )

        response_data = {
            "success": result.success,
            "override": (
                AssignmentOverrideSerializer(result.override).data if result.override else None
            ),
            "error": result.error,
        }

        return Response(response_data)


# =============================================================================
# Phase 3: Shift / Duty Roster ViewSets
# =============================================================================
