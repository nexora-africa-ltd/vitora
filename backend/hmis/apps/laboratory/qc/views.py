"""
Views for QC module.

Provides ViewSets for QC Materials, Lots, Targets, Results, Rules, EQA Surveys.
"""

from django.utils import timezone
from django_filters import rest_framework as filters
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from hmis.apps.core.mixins import ReadOnCreateMixin, TenantScopedViewMixin
from hmis.apps.laboratory.permissions import LaboratoryModuleRequired, LISQCPermission

from .models import (
    EQASample,
    EQASubmission,
    EQASurvey,
    QCLot,
    QCMaterial,
    QCResult,
    QCRule,
    QCRuleViolation,
    QCTarget,
)
from .serializers import (
    EQASampleCreateSerializer,
    EQASampleSerializer,
    EQASubmissionCreateSerializer,
    EQASubmissionSerializer,
    EQASubmissionUpdateScoreSerializer,
    EQASurveyCreateSerializer,
    EQASurveyDetailSerializer,
    EQASurveyListSerializer,
    LeveyJenningsDataSerializer,
    QCLotCreateSerializer,
    QCLotDetailSerializer,
    QCLotListSerializer,
    QCMaterialCreateSerializer,
    QCMaterialDetailSerializer,
    QCMaterialListSerializer,
    QCResultCreateSerializer,
    QCResultDetailSerializer,
    QCResultListSerializer,
    QCRuleCreateSerializer,
    QCRuleSerializer,
    QCRuleViolationSerializer,
    QCTargetCreateSerializer,
    QCTargetSerializer,
    QCViolationAcknowledgeSerializer,
)
from .westgard import apply_rules_and_record_violations

# ============================================================================
# Filters
# ============================================================================


class QCLotFilter(filters.FilterSet):
    material = filters.NumberFilter(field_name="material_id")
    status = filters.ChoiceFilter(choices=QCLot.Status.choices)
    expiring_within_days = filters.NumberFilter(method="filter_expiring")

    class Meta:
        model = QCLot
        fields = ["material", "status"]

    def filter_expiring(self, queryset, name, value):
        cutoff = timezone.now().date() + timezone.timedelta(days=int(value))
        return queryset.filter(expiry_date__lte=cutoff, status=QCLot.Status.ACTIVE)


class QCResultFilter(filters.FilterSet):
    lot = filters.NumberFilter(field_name="lot_id")
    test = filters.NumberFilter(field_name="test_id")
    instrument = filters.NumberFilter(field_name="instrument_id")
    accepted = filters.BooleanFilter()
    run_date_from = filters.DateTimeFilter(field_name="run_date", lookup_expr="gte")
    run_date_to = filters.DateTimeFilter(field_name="run_date", lookup_expr="lte")

    class Meta:
        model = QCResult
        fields = ["lot", "test", "instrument", "accepted"]


class EQASurveyFilter(filters.FilterSet):
    provider = filters.CharFilter(lookup_expr="icontains")
    status = filters.ChoiceFilter(choices=EQASurvey.Status.choices)
    category = filters.CharFilter(lookup_expr="icontains")
    due_after = filters.DateFilter(field_name="due_date", lookup_expr="gte")
    due_before = filters.DateFilter(field_name="due_date", lookup_expr="lte")

    class Meta:
        model = EQASurvey
        fields = ["provider", "status", "category"]


# ============================================================================
# QC Material ViewSet
# ============================================================================


class QCMaterialViewSet(ReadOnCreateMixin, TenantScopedViewMixin, viewsets.ModelViewSet):
    """CRUD for QC Materials."""

    queryset = QCMaterial.objects.all()
    permission_classes = [IsAuthenticated, LaboratoryModuleRequired, LISQCPermission]
    tenant_scope = "facility"
    search_fields = ["name", "manufacturer", "catalog_number"]
    ordering_fields = ["name", "manufacturer", "created_at"]

    def get_serializer_class(self):
        if self.action == "create":
            return QCMaterialCreateSerializer
        if self.action == "list":
            return QCMaterialListSerializer
        return QCMaterialDetailSerializer


# ============================================================================
# QC Lot ViewSet
# ============================================================================


class QCLotViewSet(ReadOnCreateMixin, TenantScopedViewMixin, viewsets.ModelViewSet):
    """CRUD for QC Lots with expiry tracking."""

    queryset = QCLot.objects.select_related("material")
    permission_classes = [IsAuthenticated, LaboratoryModuleRequired, LISQCPermission]
    tenant_scope = "facility"
    filterset_class = QCLotFilter
    search_fields = ["lot_number", "material__name"]
    ordering_fields = ["expiry_date", "created_at", "lot_number"]

    def get_serializer_class(self):
        if self.action == "create":
            return QCLotCreateSerializer
        if self.action == "list":
            return QCLotListSerializer
        return QCLotDetailSerializer

    @action(detail=False, methods=["get"])
    def expiring_soon(self, request):
        """Get lots expiring within 30 days."""
        cutoff = timezone.now().date() + timezone.timedelta(days=30)
        lots = self.get_queryset().filter(expiry_date__lte=cutoff, status=QCLot.Status.ACTIVE)
        serializer = QCLotListSerializer(lots, many=True)
        return Response(serializer.data)


# ============================================================================
# QC Target ViewSet
# ============================================================================


class QCTargetViewSet(ReadOnCreateMixin, TenantScopedViewMixin, viewsets.ModelViewSet):
    """CRUD for QC Targets (mean, SD per lot/test)."""

    queryset = QCTarget.objects.select_related("lot", "test", "instrument")
    permission_classes = [IsAuthenticated, LaboratoryModuleRequired, LISQCPermission]
    tenant_scope = "facility"
    filterset_fields = ["lot", "test", "instrument"]

    def get_serializer_class(self):
        if self.action == "create":
            return QCTargetCreateSerializer
        return QCTargetSerializer


# ============================================================================
# QC Result ViewSet
# ============================================================================


class QCResultViewSet(ReadOnCreateMixin, TenantScopedViewMixin, viewsets.ModelViewSet):
    """
    CRUD for QC Results with automatic Westgard rule evaluation.

    On create, the result is automatically evaluated against active rules.
    """

    queryset = QCResult.objects.select_related(
        "lot", "test", "instrument", "operator"
    ).prefetch_related("violations")
    permission_classes = [IsAuthenticated, LaboratoryModuleRequired, LISQCPermission]
    tenant_scope = "facility"
    filterset_class = QCResultFilter
    search_fields = ["lot__lot_number", "test__name"]
    ordering_fields = ["run_date", "value", "created_at"]

    def get_serializer_class(self):
        if self.action == "create":
            return QCResultCreateSerializer
        if self.action == "list":
            return QCResultListSerializer
        return QCResultDetailSerializer

    def perform_create(self, serializer):
        instance = serializer.save(
            operator=self.request.user,
            **self.get_tenant_save_kwargs(),
        )
        # Evaluate Westgard rules
        apply_rules_and_record_violations(instance)

    @action(detail=False, methods=["get"], url_path="levey-jennings")
    def levey_jennings(self, request):
        """
        Get Levey-Jennings chart data for a lot/test combination.

        Query params: lot_id, test_id, instrument_id (optional), limit (default 30)
        """
        lot_id = request.query_params.get("lot_id")
        test_id = request.query_params.get("test_id")
        instrument_id = request.query_params.get("instrument_id")
        limit = int(request.query_params.get("limit", 30))

        if not lot_id or not test_id:
            return Response(
                {"error": "lot_id and test_id are required"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Get target
        target_qs = QCTarget.objects.filter(lot_id=lot_id, test_id=test_id)
        if instrument_id:
            target = target_qs.filter(instrument_id=instrument_id).first()
        else:
            target = target_qs.filter(instrument__isnull=True).first()
        if not target:
            target = target_qs.first()

        if not target:
            return Response(
                {"error": "No QC target found for this lot/test combination"},
                status=status.HTTP_404_NOT_FOUND,
            )

        # Get results
        results_qs = QCResult.objects.filter(
            lot_id=lot_id,
            test_id=test_id,
            facility=request.user.staff_profile.primary_facility
            if hasattr(request.user, "staff_profile")
            else None,
        )

        if instrument_id:
            results_qs = results_qs.filter(instrument_id=instrument_id)

        results_qs = results_qs.order_by("-run_date")[:limit]

        data_points = []
        for r in reversed(list(results_qs)):
            z = None
            if target.sd and target.sd != 0:
                z = float((r.value - target.mean) / target.sd)
            operator_name = None
            if r.operator:
                operator_name = (
                    f"{r.operator.first_name} {r.operator.last_name}".strip() or r.operator.username
                )
            data_points.append(
                {
                    "id": r.id,
                    "value": r.value,
                    "run_date": r.run_date,
                    "z_score": z,
                    "accepted": r.accepted,
                    "operator_name": operator_name,
                }
            )

        chart_data = {
            "lot_id": target.lot_id,
            "lot_number": target.lot.lot_number,
            "test_id": target.test_id,
            "test_name": target.test.name,
            "mean": target.mean,
            "sd": target.sd,
            "unit": target.unit,
            "data_points": data_points,
        }

        serializer = LeveyJenningsDataSerializer(chart_data)
        return Response(serializer.data)


# ============================================================================
# QC Rule ViewSet
# ============================================================================


class QCRuleViewSet(ReadOnCreateMixin, TenantScopedViewMixin, viewsets.ModelViewSet):
    """CRUD for Westgard QC Rules."""

    queryset = QCRule.objects.select_related("applies_to_test")
    permission_classes = [IsAuthenticated, LaboratoryModuleRequired, LISQCPermission]
    tenant_scope = "facility"
    filterset_fields = ["rule_type", "is_active", "applies_to_test"]

    def get_serializer_class(self):
        if self.action == "create":
            return QCRuleCreateSerializer
        return QCRuleSerializer

    @action(detail=False, methods=["post"], url_path="seed-defaults")
    def seed_defaults(self, request):
        """Seed default Westgard rules for the facility if none exist."""
        facility_kwargs = self.get_tenant_save_kwargs()
        existing = QCRule.objects.filter(**facility_kwargs).exists()
        if existing:
            return Response(
                {"message": "Rules already exist for this facility"},
                status=status.HTTP_200_OK,
            )

        defaults = [
            (
                "1-2s Warning",
                QCRule.RuleType.RULE_1_2S,
                QCRule.Severity.WARNING,
                "Single control exceeds ±2 SD (warning only, do not reject)",
            ),
            (
                "1-3s Reject",
                QCRule.RuleType.RULE_1_3S,
                QCRule.Severity.REJECT,
                "Single control exceeds ±3 SD — indicates random error",
            ),
            (
                "2-2s Reject",
                QCRule.RuleType.RULE_2_2S,
                QCRule.Severity.REJECT,
                "Two consecutive controls exceed ±2 SD on same side — indicates systematic error",
            ),
            (
                "R-4s Reject",
                QCRule.RuleType.RULE_R_4S,
                QCRule.Severity.REJECT,
                "Range between two controls exceeds 4 SD — indicates random error",
            ),
            (
                "4-1s Reject",
                QCRule.RuleType.RULE_4_1S,
                QCRule.Severity.REJECT,
                "Four consecutive controls exceed ±1 SD on same side — indicates systematic error",
            ),
            (
                "10x Reject",
                QCRule.RuleType.RULE_10X,
                QCRule.Severity.REJECT,
                "Ten consecutive controls on same side of mean — indicates systematic error or shift",
            ),
        ]

        created = []
        for name, rule_type, severity, description in defaults:
            rule = QCRule.objects.create(
                name=name,
                rule_type=rule_type,
                severity=severity,
                description=description,
                is_active=True,
                **facility_kwargs,
            )
            created.append(rule)

        serializer = QCRuleSerializer(created, many=True)
        return Response(serializer.data, status=status.HTTP_201_CREATED)


# ============================================================================
# QC Violation ViewSet
# ============================================================================


class QCRuleViolationViewSet(TenantScopedViewMixin, viewsets.ReadOnlyModelViewSet):
    """Read-only list of QC violations with acknowledge action."""

    queryset = QCRuleViolation.objects.select_related("qc_result", "rule", "acknowledged_by")
    serializer_class = QCRuleViolationSerializer
    permission_classes = [IsAuthenticated, LaboratoryModuleRequired, LISQCPermission]
    tenant_scope = "facility"
    filterset_fields = ["severity", "acknowledged", "qc_result__lot", "qc_result__test"]

    @action(detail=True, methods=["post"])
    def acknowledge(self, request, pk=None):
        """Acknowledge a QC violation with optional corrective action."""
        violation = self.get_object()
        if violation.acknowledged:
            return Response(
                {"error": "Violation already acknowledged"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        serializer = QCViolationAcknowledgeSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        violation.acknowledge(
            user=request.user,
            corrective_action=serializer.validated_data.get("corrective_action", ""),
        )
        return Response(QCRuleViolationSerializer(violation).data)


# ============================================================================
# EQA Survey ViewSet
# ============================================================================


class EQASurveyViewSet(ReadOnCreateMixin, TenantScopedViewMixin, viewsets.ModelViewSet):
    """CRUD for EQA/Proficiency Testing surveys."""

    queryset = EQASurvey.objects.prefetch_related("samples")
    permission_classes = [IsAuthenticated, LaboratoryModuleRequired, LISQCPermission]
    tenant_scope = "facility"
    filterset_class = EQASurveyFilter
    search_fields = ["provider", "survey_id", "name"]
    ordering_fields = ["due_date", "provider", "created_at"]

    def get_serializer_class(self):
        if self.action == "create":
            return EQASurveyCreateSerializer
        if self.action == "list":
            return EQASurveyListSerializer
        return EQASurveyDetailSerializer

    @action(detail=True, methods=["post"], url_path="submit")
    def mark_submitted(self, request, pk=None):
        """Mark survey as submitted."""
        survey = self.get_object()
        if survey.status not in (EQASurvey.Status.PENDING, EQASurvey.Status.IN_PROGRESS):
            return Response(
                {"error": "Survey cannot be submitted in current status"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        survey.status = EQASurvey.Status.SUBMITTED
        survey.submitted_date = timezone.now().date()
        survey.save(update_fields=["status", "submitted_date"])
        return Response(EQASurveyDetailSerializer(survey).data)


# ============================================================================
# EQA Sample ViewSet
# ============================================================================


class EQASampleViewSet(ReadOnCreateMixin, TenantScopedViewMixin, viewsets.ModelViewSet):
    """CRUD for EQA Samples within surveys."""

    queryset = EQASample.objects.select_related("survey", "test")
    permission_classes = [IsAuthenticated, LaboratoryModuleRequired, LISQCPermission]
    tenant_scope = "facility"
    filterset_fields = ["survey", "test"]

    def get_serializer_class(self):
        if self.action == "create":
            return EQASampleCreateSerializer
        return EQASampleSerializer


# ============================================================================
# EQA Submission ViewSet
# ============================================================================


class EQASubmissionViewSet(ReadOnCreateMixin, TenantScopedViewMixin, viewsets.ModelViewSet):
    """CRUD for EQA Submissions (facility results for EQA samples)."""

    queryset = EQASubmission.objects.select_related(
        "sample", "sample__test", "instrument", "submitted_by"
    )
    permission_classes = [IsAuthenticated, LaboratoryModuleRequired, LISQCPermission]
    tenant_scope = "facility"
    filterset_fields = ["sample__survey", "performance"]

    def get_serializer_class(self):
        if self.action == "create":
            return EQASubmissionCreateSerializer
        if self.action == "update_score":
            return EQASubmissionUpdateScoreSerializer
        return EQASubmissionSerializer

    def perform_create(self, serializer):
        serializer.save(
            submitted_by=self.request.user,
            submitted_at=timezone.now(),
            **self.get_tenant_save_kwargs(),
        )

    @action(detail=True, methods=["post"], url_path="update-score")
    def update_score(self, request, pk=None):
        """Update submission with EQA provider's performance scores."""
        submission = self.get_object()
        serializer = EQASubmissionUpdateScoreSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        data = serializer.validated_data
        submission.z_score = data["z_score"]
        submission.bias_percent = data.get("bias_percent")
        submission.peer_group_mean = data.get("peer_group_mean")
        submission.peer_group_sd = data.get("peer_group_sd")
        submission.peer_group_n = data.get("peer_group_n")
        submission.save(
            update_fields=[
                "z_score",
                "bias_percent",
                "peer_group_mean",
                "peer_group_sd",
                "peer_group_n",
            ]
        )
        submission.evaluate_performance()

        return Response(EQASubmissionSerializer(submission).data)
