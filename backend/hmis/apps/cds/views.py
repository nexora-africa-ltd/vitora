"""
CDS Views.

Provides ViewSets for CDS rules and alerts with custom actions:
- CDSRuleViewSet: CRUD + activate, deactivate, retire, evaluate
- CDSAlertViewSet: List, detail + acknowledge, accept, override, dismiss, dashboard
"""

from __future__ import annotations

from datetime import timedelta

import django_filters
from django.db.models import Count, Q
from django.utils import timezone
from rest_framework import permissions, status, viewsets
from rest_framework.decorators import action
from rest_framework.request import Request
from rest_framework.response import Response

from hmis.apps.core.models import AuditLog
from hmis.apps.encounters.models import Encounter

from .engine import EvaluationResult, build_encounter_context, evaluate_rules
from .models import (
    CDSAlert,
    CDSAlertStatus,
    CDSRule,
    CDSRuleCategory,
    CDSRulePriority,
    CDSRuleStatus,
)
from .serializers import (
    CDSAlertListSerializer,
    CDSAlertSerializer,
    CDSDashboardSerializer,
    CDSEvaluateEncounterSerializer,
    CDSOverrideSerializer,
    CDSRuleCreateSerializer,
    CDSRuleListSerializer,
    CDSRuleSerializer,
)


# ──────────────────────────── Filters ────────────────────────────


class CDSRuleFilter(django_filters.FilterSet):
    category = django_filters.ChoiceFilter(choices=CDSRuleCategory.choices)
    priority = django_filters.ChoiceFilter(choices=CDSRulePriority.choices)
    status = django_filters.ChoiceFilter(choices=CDSRuleStatus.choices)

    class Meta:
        model = CDSRule
        fields = ["category", "priority", "status"]


class CDSAlertFilter(django_filters.FilterSet):
    status = django_filters.ChoiceFilter(choices=CDSAlertStatus.choices)
    priority = django_filters.ChoiceFilter(choices=CDSRulePriority.choices)
    patient = django_filters.NumberFilter(field_name="patient_id")
    encounter = django_filters.NumberFilter(field_name="encounter_id")
    rule = django_filters.NumberFilter(field_name="rule_id")
    category = django_filters.ChoiceFilter(
        field_name="rule__category",
        choices=CDSRuleCategory.choices,
    )

    class Meta:
        model = CDSAlert
        fields = ["status", "priority", "patient", "encounter", "rule", "category"]


# ──────────────────────────── Rule ViewSet ────────────────────────────


class CDSRuleViewSet(viewsets.ModelViewSet):
    """
    CRUD and lifecycle management for CDS rules.

    Custom actions:
    - activate: Activate a draft/inactive rule
    - deactivate: Deactivate an active rule
    - retire: Permanently retire a rule
    - evaluate: Manually evaluate a rule against an encounter
    """

    queryset = CDSRule.objects.select_related("created_by", "approved_by").all()
    serializer_class = CDSRuleSerializer
    permission_classes = [permissions.IsAuthenticated]
    filterset_class = CDSRuleFilter
    search_fields = ["code", "name", "description"]
    ordering_fields = ["code", "name", "category", "priority", "status", "created_at"]
    ordering = ["-created_at"]

    def get_serializer_class(self):
        if self.action == "list":
            return CDSRuleListSerializer
        if self.action == "create":
            return CDSRuleCreateSerializer
        if self.action in ("update", "partial_update"):
            return CDSRuleCreateSerializer
        if self.action == "evaluate":
            return CDSEvaluateEncounterSerializer
        return CDSRuleSerializer

    def perform_create(self, serializer):
        rule = serializer.save(created_by=self.request.user)
        AuditLog.log(
            action="cds_rule_create",
            user=self.request.user,
            resource_type="CDSRule",
            resource_id=rule.id,
            ip_address=self.request.META.get("REMOTE_ADDR", ""),
            details={"code": rule.code, "name": rule.name, "category": rule.category},
        )

    def perform_update(self, serializer):
        rule = serializer.save()
        AuditLog.log(
            action="cds_rule_update",
            user=self.request.user,
            resource_type="CDSRule",
            resource_id=rule.id,
            ip_address=self.request.META.get("REMOTE_ADDR", ""),
            details={"code": rule.code, "name": rule.name},
        )

    @action(detail=True, methods=["post"])
    def activate(self, request: Request, pk: int | None = None) -> Response:
        """Activate a draft or inactive rule."""
        rule = self.get_object()
        if rule.status not in (CDSRuleStatus.DRAFT, CDSRuleStatus.INACTIVE):
            return Response(
                {"error": f"Cannot activate rule in '{rule.get_status_display()}' status. Must be Draft or Inactive."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        rule.activate(user=request.user)
        AuditLog.log(
            action="cds_rule_activate",
            user=request.user,
            resource_type="CDSRule",
            resource_id=rule.id,
            ip_address=request.META.get("REMOTE_ADDR", ""),
            details={"code": rule.code},
        )
        return Response(CDSRuleSerializer(rule).data)

    @action(detail=True, methods=["post"])
    def deactivate(self, request: Request, pk: int | None = None) -> Response:
        """Deactivate an active rule."""
        rule = self.get_object()
        if rule.status != CDSRuleStatus.ACTIVE:
            return Response(
                {"error": f"Cannot deactivate rule in '{rule.get_status_display()}' status. Must be Active."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        rule.deactivate()
        AuditLog.log(
            action="cds_rule_deactivate",
            user=request.user,
            resource_type="CDSRule",
            resource_id=rule.id,
            ip_address=request.META.get("REMOTE_ADDR", ""),
            details={"code": rule.code},
        )
        return Response(CDSRuleSerializer(rule).data)

    @action(detail=True, methods=["post"])
    def retire(self, request: Request, pk: int | None = None) -> Response:
        """Permanently retire a rule."""
        rule = self.get_object()
        if rule.status == CDSRuleStatus.RETIRED:
            return Response(
                {"error": "Rule is already retired."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        rule.retire()
        AuditLog.log(
            action="cds_rule_retire",
            user=request.user,
            resource_type="CDSRule",
            resource_id=rule.id,
            ip_address=request.META.get("REMOTE_ADDR", ""),
            details={"code": rule.code},
        )
        return Response(CDSRuleSerializer(rule).data)

    @action(detail=True, methods=["post"])
    def evaluate(self, request: Request, pk: int | None = None) -> Response:
        """Manually evaluate this rule against an encounter."""
        rule = self.get_object()
        serializer = CDSEvaluateEncounterSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        encounter_id = serializer.validated_data["encounter_id"]
        try:
            encounter = Encounter.objects.select_related("patient").get(id=encounter_id)
        except Encounter.DoesNotExist:
            return Response(
                {"error": f"Encounter {encounter_id} not found."},
                status=status.HTTP_404_NOT_FOUND,
            )

        context = build_encounter_context(encounter)
        results = evaluate_rules([rule], context)

        return Response({
            "rule": CDSRuleSerializer(rule).data,
            "triggered": len(results) > 0,
            "results": [
                {
                    "rule_code": r.rule_code,
                    "message": r.message,
                    "details": r.details,
                }
                for r in results
            ],
        })


# ──────────────────────────── Alert ViewSet ────────────────────────────


class CDSAlertViewSet(viewsets.ModelViewSet):
    """
    Manage CDS alerts.

    Custom actions:
    - acknowledge: Mark alert as acknowledged
    - accept: Accept the recommendation
    - override: Override with clinical reason
    - dismiss: Dismiss the alert
    - pending: List pending alerts for a patient
    - dashboard: Aggregate stats
    """

    queryset = CDSAlert.objects.select_related(
        "rule", "patient", "encounter", "resolved_by", "triggered_by"
    ).all()
    serializer_class = CDSAlertSerializer
    permission_classes = [permissions.IsAuthenticated]
    filterset_class = CDSAlertFilter
    search_fields = ["message", "rule__code", "rule__name", "patient__first_name", "patient__last_name"]
    ordering_fields = ["priority", "status", "created_at"]
    ordering = ["-created_at"]
    # Disable creation via API — alerts are created by the engine
    http_method_names = ["get", "head", "options", "post"]

    def get_serializer_class(self):
        if self.action == "list":
            return CDSAlertListSerializer
        if self.action == "override":
            return CDSOverrideSerializer
        if self.action == "evaluate_encounter":
            return CDSEvaluateEncounterSerializer
        return CDSAlertSerializer

    def create(self, request: Request, *args: object, **kwargs: object) -> Response:
        """Disable direct alert creation."""
        return Response(
            {"error": "Alerts are generated by the CDS engine, not created directly."},
            status=status.HTTP_405_METHOD_NOT_ALLOWED,
        )

    @action(detail=True, methods=["post"])
    def acknowledge(self, request: Request, pk: int | None = None) -> Response:
        """Acknowledge a pending alert."""
        alert = self.get_object()
        if not alert.is_pending:
            return Response(
                {"error": f"Alert is already '{alert.get_status_display()}'."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        alert.acknowledge(user=request.user)
        AuditLog.log(
            action="cds_alert_acknowledge",
            user=request.user,
            resource_type="CDSAlert",
            resource_id=alert.id,
            ip_address=request.META.get("REMOTE_ADDR", ""),
            details={"rule_code": alert.rule.code, "patient_id": alert.patient_id},
        )
        return Response(CDSAlertSerializer(alert).data)

    @action(detail=True, methods=["post"])
    def accept(self, request: Request, pk: int | None = None) -> Response:
        """Accept the recommendation."""
        alert = self.get_object()
        if not alert.is_pending:
            return Response(
                {"error": f"Alert is already '{alert.get_status_display()}'."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        alert.accept(user=request.user)
        AuditLog.log(
            action="cds_alert_accept",
            user=request.user,
            resource_type="CDSAlert",
            resource_id=alert.id,
            ip_address=request.META.get("REMOTE_ADDR", ""),
            details={"rule_code": alert.rule.code, "patient_id": alert.patient_id},
        )
        return Response(CDSAlertSerializer(alert).data)

    @action(detail=True, methods=["post"])
    def override(self, request: Request, pk: int | None = None) -> Response:
        """Override the alert with a clinical reason."""
        alert = self.get_object()
        if not alert.is_pending:
            return Response(
                {"error": f"Alert is already '{alert.get_status_display()}'."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        serializer = CDSOverrideSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        reason = serializer.validated_data["reason"]
        alert.override(user=request.user, reason=reason)
        AuditLog.log(
            action="cds_alert_override",
            user=request.user,
            resource_type="CDSAlert",
            resource_id=alert.id,
            ip_address=request.META.get("REMOTE_ADDR", ""),
            details={
                "rule_code": alert.rule.code,
                "patient_id": alert.patient_id,
                "reason": reason,
            },
        )
        return Response(CDSAlertSerializer(alert).data)

    @action(detail=True, methods=["post"])
    def dismiss(self, request: Request, pk: int | None = None) -> Response:
        """Dismiss the alert."""
        alert = self.get_object()
        if not alert.is_pending:
            return Response(
                {"error": f"Alert is already '{alert.get_status_display()}'."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        alert.dismiss(user=request.user)
        AuditLog.log(
            action="cds_alert_dismiss",
            user=request.user,
            resource_type="CDSAlert",
            resource_id=alert.id,
            ip_address=request.META.get("REMOTE_ADDR", ""),
            details={"rule_code": alert.rule.code, "patient_id": alert.patient_id},
        )
        return Response(CDSAlertSerializer(alert).data)

    @action(detail=False, methods=["get"])
    def pending(self, request: Request) -> Response:
        """List pending alerts, optionally filtered by patient."""
        qs = CDSAlert.objects.filter(status=CDSAlertStatus.PENDING).select_related(
            "rule", "patient", "encounter"
        )
        patient_id = request.query_params.get("patient")
        if patient_id:
            qs = qs.filter(patient_id=patient_id)
        encounter_id = request.query_params.get("encounter")
        if encounter_id:
            qs = qs.filter(encounter_id=encounter_id)
        qs = qs.order_by("-priority", "-created_at")
        page = self.paginate_queryset(qs)
        if page is not None:
            serializer = CDSAlertListSerializer(page, many=True)
            return self.get_paginated_response(serializer.data)
        serializer = CDSAlertListSerializer(qs, many=True)
        return Response(serializer.data)

    @action(detail=False, methods=["post"])
    def evaluate_encounter(self, request: Request) -> Response:
        """Manually evaluate all active CDS rules against an encounter."""
        serializer = CDSEvaluateEncounterSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        encounter_id = serializer.validated_data["encounter_id"]
        try:
            encounter = Encounter.objects.select_related("patient").get(id=encounter_id)
        except Encounter.DoesNotExist:
            return Response(
                {"error": f"Encounter {encounter_id} not found."},
                status=status.HTTP_404_NOT_FOUND,
            )

        context = build_encounter_context(encounter)
        active_rules = CDSRule.objects.filter(status=CDSRuleStatus.ACTIVE)
        results = evaluate_rules(active_rules, context)

        # Create alerts for triggered rules (if not already pending)
        created_alerts = []
        for result in results:
            existing = CDSAlert.objects.filter(
                rule_id=result.rule_id,
                patient_id=context.patient_id,
                status=CDSAlertStatus.PENDING,
            ).exists()
            if not existing:
                rule = CDSRule.objects.get(id=result.rule_id)
                details = result.details.copy() if result.details else {}
                if result.suggested_actions:
                    details["suggested_actions"] = result.suggested_actions
                alert = CDSAlert.objects.create(
                    rule=rule,
                    patient_id=context.patient_id,
                    encounter=encounter,
                    priority=rule.priority,
                    message=result.message,
                    suggestion=rule.suggestion,
                    details=details,
                    triggered_by=request.user,
                )
                created_alerts.append(alert)

        return Response({
            "encounter_id": encounter_id,
            "rules_evaluated": active_rules.count(),
            "rules_triggered": len(results),
            "alerts_created": len(created_alerts),
            "results": [
                {
                    "rule_code": r.rule_code,
                    "message": r.message,
                    "details": r.details,
                    "suggested_actions": r.suggested_actions,
                }
                for r in results
            ],
        })

    @action(detail=False, methods=["get"])
    def dashboard(self, request: Request) -> Response:
        """CDS dashboard statistics."""
        now = timezone.now()
        today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)

        total_rules = CDSRule.objects.count()
        active_rules = CDSRule.objects.filter(status=CDSRuleStatus.ACTIVE).count()
        draft_rules = CDSRule.objects.filter(status=CDSRuleStatus.DRAFT).count()

        total_alerts = CDSAlert.objects.count()
        pending_alerts = CDSAlert.objects.filter(status=CDSAlertStatus.PENDING).count()
        critical_pending = CDSAlert.objects.filter(
            status=CDSAlertStatus.PENDING,
            priority=CDSRulePriority.CRITICAL,
        ).count()
        alerts_today = CDSAlert.objects.filter(created_at__gte=today_start).count()

        # Override rate
        resolved = CDSAlert.objects.filter(
            status__in=[
                CDSAlertStatus.ACKNOWLEDGED,
                CDSAlertStatus.ACCEPTED,
                CDSAlertStatus.OVERRIDDEN,
                CDSAlertStatus.DISMISSED,
            ]
        ).count()
        overridden = CDSAlert.objects.filter(status=CDSAlertStatus.OVERRIDDEN).count()
        override_rate = round((overridden / resolved) * 100, 1) if resolved > 0 else None

        # Alerts by category
        alerts_by_category = list(
            CDSAlert.objects.filter(status=CDSAlertStatus.PENDING)
            .values("rule__category")
            .annotate(count=Count("id"))
            .order_by("-count")
        )

        # Alerts by priority
        alerts_by_priority = list(
            CDSAlert.objects.filter(status=CDSAlertStatus.PENDING)
            .values("priority")
            .annotate(count=Count("id"))
            .order_by("-count")
        )

        data = {
            "total_rules": total_rules,
            "active_rules": active_rules,
            "draft_rules": draft_rules,
            "total_alerts": total_alerts,
            "pending_alerts": pending_alerts,
            "critical_pending": critical_pending,
            "alerts_today": alerts_today,
            "override_rate": override_rate,
            "alerts_by_category": alerts_by_category,
            "alerts_by_priority": alerts_by_priority,
        }
        return Response(CDSDashboardSerializer(data).data)
