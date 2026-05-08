"""Views for Delta Checks & Auto-Verification."""

from django_filters import rest_framework as filters
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from hmis.apps.core.mixins import ReadOnCreateMixin, TenantScopedViewMixin
from hmis.apps.laboratory.permissions import LaboratoryModuleRequired, LISConfigPermission

from .delta_engine import evaluate_delta_check
from .models import (
    AutoVerifyConfig,
    AutoVerifyLog,
    AutoVerifyRule,
    DeltaCheckResult,
    DeltaCheckRule,
)
from .serializers import (
    AutoVerifyConfigSerializer,
    AutoVerifyLogSerializer,
    AutoVerifyRuleCreateSerializer,
    AutoVerifyRuleDetailSerializer,
    AutoVerifyRuleListSerializer,
    AutoVerifyStatsSerializer,
    DeltaCheckResultSerializer,
    DeltaCheckRuleCreateSerializer,
    DeltaCheckRuleDetailSerializer,
    DeltaCheckRuleListSerializer,
)
from .verify_engine import evaluate_auto_verify

# =============================================================================
# Delta Check Rule ViewSet
# =============================================================================


class DeltaCheckRuleFilter(filters.FilterSet):
    test = filters.NumberFilter(field_name="test_id")
    is_active = filters.BooleanFilter()
    action = filters.ChoiceFilter(choices=DeltaCheckRule.Action.choices)

    class Meta:
        model = DeltaCheckRule
        fields = ["test", "is_active", "action"]


class DeltaCheckRuleViewSet(ReadOnCreateMixin, TenantScopedViewMixin, viewsets.ModelViewSet):
    """CRUD for delta check rules."""

    permission_classes = [IsAuthenticated, LaboratoryModuleRequired, LISConfigPermission]
    filterset_class = DeltaCheckRuleFilter
    tenant_scope = "facility"
    queryset = DeltaCheckRule.objects.select_related("test")

    def get_serializer_class(self):
        if self.action == "create":
            return DeltaCheckRuleCreateSerializer
        if self.action == "list":
            return DeltaCheckRuleListSerializer
        return DeltaCheckRuleDetailSerializer

    def perform_create(self, serializer):
        serializer.save(**self.get_tenant_save_kwargs())

    @action(detail=False, methods=["post"])
    def seed_defaults(self, request):
        """Seed common delta check rules for a facility."""
        self._resolve_tenant_context()
        facility = self.request.facility
        defaults = [
            {
                "test_code": "HGB",
                "threshold_percent": 33,
                "lookback_hours": 72,
                "action": "FLAG_FOR_REVIEW",
            },
            {
                "test_code": "WBC",
                "threshold_percent": 50,
                "lookback_hours": 72,
                "action": "FLAG_FOR_REVIEW",
            },
            {
                "test_code": "PLT",
                "threshold_percent": 50,
                "lookback_hours": 72,
                "action": "FLAG_FOR_REVIEW",
            },
            {
                "test_code": "CR",
                "threshold_percent": 50,
                "lookback_hours": 48,
                "action": "BLOCK_RELEASE",
            },
            {
                "test_code": "K",
                "threshold_absolute": 1.5,
                "lookback_hours": 24,
                "action": "BLOCK_RELEASE",
            },
            {
                "test_code": "NA",
                "threshold_absolute": 10,
                "lookback_hours": 24,
                "action": "FLAG_FOR_REVIEW",
            },
            {
                "test_code": "GLU",
                "threshold_percent": 40,
                "lookback_hours": 24,
                "action": "FLAG_FOR_REVIEW",
            },
            {
                "test_code": "CA",
                "threshold_percent": 20,
                "lookback_hours": 48,
                "action": "FLAG_FOR_REVIEW",
            },
        ]

        from hmis.apps.laboratory.models import TestCatalog

        created_count = 0
        for d in defaults:
            test = TestCatalog.objects.filter(code=d["test_code"]).first()
            if not test:
                continue
            _, created = DeltaCheckRule.objects.get_or_create(
                facility=facility,
                test=test,
                defaults={
                    "check_type": "ABSOLUTE" if d.get("threshold_absolute") else "PERCENT",
                    "threshold_percent": d.get("threshold_percent"),
                    "threshold_absolute": d.get("threshold_absolute"),
                    "lookback_hours": d["lookback_hours"],
                    "action": d["action"],
                    "organization": facility.organization,
                },
            )
            if created:
                created_count += 1

        return Response(
            {
                "created": created_count,
                "message": f"Seeded {created_count} default delta check rules.",
            },
            status=status.HTTP_201_CREATED,
        )


# =============================================================================
# Delta Check Result ViewSet
# =============================================================================


class DeltaCheckResultFilter(filters.FilterSet):
    outcome = filters.ChoiceFilter(choices=DeltaCheckResult.Outcome.choices)
    result = filters.NumberFilter(field_name="result_id")

    class Meta:
        model = DeltaCheckResult
        fields = ["outcome", "result"]


class DeltaCheckResultViewSet(TenantScopedViewMixin, viewsets.ReadOnlyModelViewSet):
    """Read-only view of delta check evaluations."""

    permission_classes = [IsAuthenticated, LaboratoryModuleRequired, LISConfigPermission]
    serializer_class = DeltaCheckResultSerializer
    filterset_class = DeltaCheckResultFilter
    tenant_scope = "facility"
    queryset = DeltaCheckResult.objects.select_related(
        "result__order_item__test",
        "result__order_item__lab_order__patient",
        "rule",
    )

    @action(detail=False, methods=["post"])
    def evaluate(self, request):
        """Manually trigger delta check for a specific result."""
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

        # Delete existing delta check if re-evaluating
        DeltaCheckResult.objects.filter(result=lab_result).delete()

        check = evaluate_delta_check(lab_result)
        if check is None:
            return Response(
                {"message": "No delta check rule for this test"}, status=status.HTTP_200_OK
            )

        return Response(DeltaCheckResultSerializer(check).data, status=status.HTTP_200_OK)


# =============================================================================
# Auto-Verify Rule ViewSet
# =============================================================================


class AutoVerifyRuleFilter(filters.FilterSet):
    test = filters.NumberFilter(field_name="test_id")
    is_active = filters.BooleanFilter()
    condition_type = filters.ChoiceFilter(choices=AutoVerifyRule.ConditionType.choices)

    class Meta:
        model = AutoVerifyRule
        fields = ["test", "is_active", "condition_type"]


class AutoVerifyRuleViewSet(ReadOnCreateMixin, TenantScopedViewMixin, viewsets.ModelViewSet):
    """CRUD for auto-verification rules."""

    permission_classes = [IsAuthenticated, LaboratoryModuleRequired, LISConfigPermission]
    filterset_class = AutoVerifyRuleFilter
    tenant_scope = "facility"
    queryset = AutoVerifyRule.objects.select_related("test")

    def get_serializer_class(self):
        if self.action == "create":
            return AutoVerifyRuleCreateSerializer
        if self.action == "list":
            return AutoVerifyRuleListSerializer
        return AutoVerifyRuleDetailSerializer

    def perform_create(self, serializer):
        serializer.save(**self.get_tenant_save_kwargs())

    @action(detail=False, methods=["post"])
    def seed_defaults(self, request):
        """Seed common auto-verify rules for a test."""
        test_id = request.data.get("test_id")
        if not test_id:
            return Response({"error": "test_id required"}, status=status.HTTP_400_BAD_REQUEST)

        from hmis.apps.laboratory.models import TestCatalog

        try:
            test = TestCatalog.objects.get(pk=test_id)
        except TestCatalog.DoesNotExist:
            return Response({"error": "Test not found"}, status=status.HTTP_404_NOT_FOUND)

        self._resolve_tenant_context()
        facility = self.request.facility
        default_conditions = [
            AutoVerifyRule.ConditionType.IN_REFERENCE_RANGE,
            AutoVerifyRule.ConditionType.DELTA_CHECK_PASS,
            AutoVerifyRule.ConditionType.NO_CRITICAL_FLAG,
            AutoVerifyRule.ConditionType.NUMERIC_RESULT,
            AutoVerifyRule.ConditionType.NOT_AMENDED,
        ]

        created_count = 0
        for condition in default_conditions:
            _, created = AutoVerifyRule.objects.get_or_create(
                facility=facility,
                test=test,
                condition_type=condition,
                defaults={
                    "is_active": True,
                    "organization": facility.organization,
                },
            )
            if created:
                created_count += 1

        return Response(
            {"created": created_count, "test": test.name},
            status=status.HTTP_201_CREATED,
        )


# =============================================================================
# Auto-Verify Config ViewSet
# =============================================================================


class AutoVerifyConfigViewSet(TenantScopedViewMixin, viewsets.ModelViewSet):
    """Manage facility auto-verification configuration."""

    permission_classes = [IsAuthenticated, LaboratoryModuleRequired, LISConfigPermission]
    serializer_class = AutoVerifyConfigSerializer
    tenant_scope = "facility"
    queryset = AutoVerifyConfig.objects.all()

    def perform_create(self, serializer):
        serializer.save(**self.get_tenant_save_kwargs())

    @action(detail=False, methods=["get"])
    def current(self, request):
        """Get or create the current facility's config."""
        self._resolve_tenant_context()
        facility = self.request.facility
        config, _ = AutoVerifyConfig.objects.get_or_create(
            facility=facility,
            defaults={"organization": facility.organization},
        )
        return Response(AutoVerifyConfigSerializer(config).data)


# =============================================================================
# Auto-Verify Log ViewSet
# =============================================================================


class AutoVerifyLogFilter(filters.FilterSet):
    outcome = filters.ChoiceFilter(choices=AutoVerifyLog.Outcome.choices)
    result = filters.NumberFilter(field_name="result_id")
    date_from = filters.DateFilter(field_name="evaluated_at", lookup_expr="date__gte")
    date_to = filters.DateFilter(field_name="evaluated_at", lookup_expr="date__lte")

    class Meta:
        model = AutoVerifyLog
        fields = ["outcome", "result", "date_from", "date_to"]


class AutoVerifyLogViewSet(TenantScopedViewMixin, viewsets.ReadOnlyModelViewSet):
    """Read-only audit log of auto-verification attempts."""

    permission_classes = [IsAuthenticated, LaboratoryModuleRequired, LISConfigPermission]
    serializer_class = AutoVerifyLogSerializer
    filterset_class = AutoVerifyLogFilter
    tenant_scope = "facility"
    queryset = AutoVerifyLog.objects.select_related(
        "result__order_item__test",
        "result__order_item__lab_order__patient",
        "blocking_rule",
    )

    @action(detail=False, methods=["post"])
    def evaluate(self, request):
        """Manually trigger auto-verification for a specific result."""
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

        if lab_result.verification_status == "VERIFIED":
            return Response(
                {"message": "Result already verified"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Delete existing log if re-evaluating
        AutoVerifyLog.objects.filter(result=lab_result).delete()

        log = evaluate_auto_verify(lab_result)
        return Response(AutoVerifyLogSerializer(log).data, status=status.HTTP_200_OK)

    @action(detail=False, methods=["get"])
    def stats(self, request):
        """Get auto-verification statistics for the facility."""
        self._resolve_tenant_context()
        facility = self.request.facility
        qs = AutoVerifyLog.objects.filter(facility=facility)

        # Apply date filters
        date_from = request.query_params.get("date_from")
        date_to = request.query_params.get("date_to")
        if date_from:
            qs = qs.filter(evaluated_at__date__gte=date_from)
        if date_to:
            qs = qs.filter(evaluated_at__date__lte=date_to)

        total = qs.count()
        auto_verified = qs.filter(outcome=AutoVerifyLog.Outcome.AUTO_VERIFIED).count()
        blocked = qs.filter(outcome=AutoVerifyLog.Outcome.BLOCKED).count()
        skipped = qs.filter(outcome=AutoVerifyLog.Outcome.SKIPPED).count()
        cap_exceeded = qs.filter(outcome=AutoVerifyLog.Outcome.CAP_EXCEEDED).count()

        delta_qs = DeltaCheckResult.objects.filter(facility=facility)
        if date_from:
            delta_qs = delta_qs.filter(evaluated_at__date__gte=date_from)
        if date_to:
            delta_qs = delta_qs.filter(evaluated_at__date__lte=date_to)

        data = {
            "total_evaluated": total,
            "auto_verified": auto_verified,
            "blocked": blocked,
            "skipped": skipped,
            "cap_exceeded": cap_exceeded,
            "auto_verify_rate": (auto_verified / total * 100) if total > 0 else 0.0,
            "delta_checks_total": delta_qs.count(),
            "delta_checks_failed": delta_qs.filter(outcome=DeltaCheckResult.Outcome.FAIL).count(),
        }

        serializer = AutoVerifyStatsSerializer(data)
        return Response(serializer.data)
