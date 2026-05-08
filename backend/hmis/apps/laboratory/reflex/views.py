"""Views for Reflexive Testing."""

from django_filters import rest_framework as filters
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from hmis.apps.core.mixins import ReadOnCreateMixin, TenantScopedViewMixin
from hmis.apps.laboratory.permissions import LaboratoryModuleRequired, LISConfigPermission

from .engine import evaluate_reflex_rules
from .models import ReflexExecution, ReflexRule
from .serializers import (
    ReflexActionSerializer,
    ReflexExecutionSerializer,
    ReflexRuleCreateSerializer,
    ReflexRuleDetailSerializer,
    ReflexRuleListSerializer,
)

# =============================================================================
# Reflex Rule ViewSet
# =============================================================================


class ReflexRuleFilter(filters.FilterSet):
    trigger_test = filters.NumberFilter(field_name="trigger_test_id")
    reflex_test = filters.NumberFilter(field_name="reflex_test_id")
    is_active = filters.BooleanFilter()
    action = filters.ChoiceFilter(choices=ReflexRule.Action.choices)

    class Meta:
        model = ReflexRule
        fields = ["trigger_test", "reflex_test", "is_active", "action"]


class ReflexRuleViewSet(ReadOnCreateMixin, TenantScopedViewMixin, viewsets.ModelViewSet):
    """CRUD for reflex testing rules."""

    permission_classes = [IsAuthenticated, LaboratoryModuleRequired, LISConfigPermission]
    filterset_class = ReflexRuleFilter
    tenant_scope = "facility"
    queryset = ReflexRule.objects.select_related("trigger_test", "reflex_test")

    def get_serializer_class(self):
        if self.action == "create":
            return ReflexRuleCreateSerializer
        if self.action == "list":
            return ReflexRuleListSerializer
        return ReflexRuleDetailSerializer

    def perform_create(self, serializer):
        serializer.save(**self.get_tenant_save_kwargs())

    @action(detail=False, methods=["post"])
    def seed_defaults(self, request):
        """Seed common reflex testing rules for Kenya facilities."""
        self._resolve_tenant_context()
        facility = request.facility

        from hmis.apps.laboratory.models import TestCatalog

        defaults = [
            {
                "trigger_code": "TSH",
                "reflex_code": "FT4",
                "operator": "GT",
                "threshold_value": 10.0,
                "description": "TSH > 10 mIU/L → order Free T4",
            },
            {
                "trigger_code": "TSH",
                "reflex_code": "FT4",
                "operator": "LT",
                "threshold_value": 0.1,
                "description": "TSH < 0.1 mIU/L → order Free T4",
            },
            {
                "trigger_code": "HBsAg",
                "reflex_code": "HBeAg",
                "operator": "CONTAINS",
                "text_value": "positive",
                "description": "HBsAg positive → order HBeAg",
            },
            {
                "trigger_code": "HIV_SCREEN",
                "reflex_code": "HIV_CONFIRM",
                "operator": "CONTAINS",
                "text_value": "reactive",
                "description": "HIV screening reactive → confirmatory test",
            },
            {
                "trigger_code": "PSA",
                "reflex_code": "FREE_PSA",
                "operator": "IN_RANGE",
                "threshold_value": 4.0,
                "threshold_high": 10.0,
                "description": "PSA 4-10 ng/mL (gray zone) → order Free PSA",
            },
        ]

        created_count = 0
        for d in defaults:
            trigger = TestCatalog.objects.filter(code=d["trigger_code"]).first()
            reflex = TestCatalog.objects.filter(code=d["reflex_code"]).first()
            if not trigger or not reflex:
                continue

            _, created = ReflexRule.objects.get_or_create(
                facility=facility,
                trigger_test=trigger,
                reflex_test=reflex,
                operator=d["operator"],
                defaults={
                    "threshold_value": d.get("threshold_value"),
                    "threshold_high": d.get("threshold_high"),
                    "text_value": d.get("text_value", ""),
                    "action": ReflexRule.Action.SUGGEST,
                    "description": d["description"],
                    "organization": facility.organization,
                },
            )
            if created:
                created_count += 1

        return Response(
            {"created": created_count, "message": f"Seeded {created_count} default reflex rules."},
            status=status.HTTP_201_CREATED,
        )

    @action(detail=False, methods=["post"])
    def evaluate(self, request):
        """Manually evaluate reflex rules for a specific result."""
        result_id = request.data.get("result_id")
        if not result_id:
            return Response({"error": "result_id required"}, status=status.HTTP_400_BAD_REQUEST)

        from hmis.apps.laboratory.models import LabResult

        try:
            lab_result = LabResult.objects.select_related(
                "order_item__test",
                "order_item__lab_order__patient",
                "order_item__lab_order__facility",
            ).get(pk=result_id)
        except LabResult.DoesNotExist:
            return Response({"error": "Result not found"}, status=status.HTTP_404_NOT_FOUND)

        executions = evaluate_reflex_rules(lab_result)
        return Response(
            ReflexExecutionSerializer(executions, many=True).data,
            status=status.HTTP_200_OK,
        )


# =============================================================================
# Reflex Execution ViewSet
# =============================================================================


class ReflexExecutionFilter(filters.FilterSet):
    status = filters.ChoiceFilter(choices=ReflexExecution.Status.choices)
    result = filters.NumberFilter(field_name="trigger_result_id")
    date_from = filters.DateFilter(field_name="executed_at", lookup_expr="date__gte")
    date_to = filters.DateFilter(field_name="executed_at", lookup_expr="date__lte")

    class Meta:
        model = ReflexExecution
        fields = ["status", "result", "date_from", "date_to"]


class ReflexExecutionViewSet(TenantScopedViewMixin, viewsets.ReadOnlyModelViewSet):
    """Read-only view of reflex executions with approve/reject actions."""

    permission_classes = [IsAuthenticated, LaboratoryModuleRequired, LISConfigPermission]
    filterset_class = ReflexExecutionFilter
    serializer_class = ReflexExecutionSerializer
    tenant_scope = "facility"
    queryset = ReflexExecution.objects.select_related(
        "rule__trigger_test",
        "rule__reflex_test",
        "trigger_result__order_item__lab_order__patient",
        "reflex_order",
    )

    @action(detail=True, methods=["post"])
    def approve(self, request, pk=None):
        """Approve a suggested reflex and create the order."""
        execution = self.get_object()
        if execution.status != ReflexExecution.Status.SUGGESTED:
            return Response(
                {"error": "Only suggested reflexes can be approved"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        serializer = ReflexActionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        execution.approve(request.user)

        # Create the order if not already created
        if not execution.reflex_order and execution.rule:
            from .engine import _create_reflex_order

            _create_reflex_order(execution, execution.trigger_result, execution.rule)

        return Response(ReflexExecutionSerializer(execution).data)

    @action(detail=True, methods=["post"])
    def reject(self, request, pk=None):
        """Reject a suggested reflex."""
        execution = self.get_object()
        if execution.status != ReflexExecution.Status.SUGGESTED:
            return Response(
                {"error": "Only suggested reflexes can be rejected"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        serializer = ReflexActionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        execution.reject(request.user, notes=serializer.validated_data.get("notes", ""))
        return Response(ReflexExecutionSerializer(execution).data)
