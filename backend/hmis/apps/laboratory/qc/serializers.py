"""
Serializers for QC module.
"""

from rest_framework import serializers

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

# ============================================================================
# QC Material & Lot Serializers
# ============================================================================


class QCMaterialListSerializer(serializers.ModelSerializer):
    lot_count = serializers.SerializerMethodField()

    class Meta:
        model = QCMaterial
        fields = [
            "id",
            "name",
            "manufacturer",
            "catalog_number",
            "storage_conditions",
            "is_active",
            "lot_count",
            "created_at",
            "updated_at",
        ]

    def get_lot_count(self, obj):
        return obj.lots.count()


class QCMaterialCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model = QCMaterial
        fields = [
            "name",
            "manufacturer",
            "catalog_number",
            "description",
            "storage_conditions",
            "is_active",
        ]


class QCMaterialDetailSerializer(serializers.ModelSerializer):
    lot_count = serializers.SerializerMethodField()

    class Meta:
        model = QCMaterial
        fields = [
            "id",
            "name",
            "manufacturer",
            "catalog_number",
            "description",
            "storage_conditions",
            "is_active",
            "lot_count",
            "created_at",
            "updated_at",
        ]

    def get_lot_count(self, obj):
        return obj.lots.count()


class QCLotListSerializer(serializers.ModelSerializer):
    material_name = serializers.CharField(source="material.name", read_only=True)
    is_expired = serializers.BooleanField(read_only=True)
    days_until_expiry = serializers.IntegerField(read_only=True)

    class Meta:
        model = QCLot
        fields = [
            "id",
            "material",
            "material_name",
            "lot_number",
            "status",
            "open_date",
            "expiry_date",
            "is_expired",
            "days_until_expiry",
            "storage_conditions",
            "notes",
            "created_at",
            "updated_at",
        ]


class QCLotCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model = QCLot
        fields = [
            "material",
            "lot_number",
            "status",
            "open_date",
            "expiry_date",
            "storage_conditions",
            "notes",
        ]

    def validate(self, attrs):
        open_date = attrs.get("open_date")
        expiry_date = attrs.get("expiry_date")
        if open_date and expiry_date and open_date > expiry_date:
            raise serializers.ValidationError(
                {"open_date": "Open date cannot be after expiry date."}
            )
        return attrs


class QCLotDetailSerializer(serializers.ModelSerializer):
    material_name = serializers.CharField(source="material.name", read_only=True)
    manufacturer = serializers.CharField(source="material.manufacturer", read_only=True)
    is_expired = serializers.BooleanField(read_only=True)
    days_until_expiry = serializers.IntegerField(read_only=True)
    target_count = serializers.SerializerMethodField()
    result_count = serializers.SerializerMethodField()

    class Meta:
        model = QCLot
        fields = [
            "id",
            "material",
            "material_name",
            "manufacturer",
            "lot_number",
            "status",
            "open_date",
            "expiry_date",
            "is_expired",
            "days_until_expiry",
            "storage_conditions",
            "notes",
            "target_count",
            "result_count",
            "created_at",
            "updated_at",
        ]

    def get_target_count(self, obj):
        return obj.targets.count()

    def get_result_count(self, obj):
        return obj.results.count()


# ============================================================================
# QC Target Serializers
# ============================================================================


class QCTargetSerializer(serializers.ModelSerializer):
    test_name = serializers.CharField(source="test.name", read_only=True)
    test_code = serializers.CharField(source="test.code", read_only=True)
    instrument_name = serializers.CharField(source="instrument.name", read_only=True, default=None)

    class Meta:
        model = QCTarget
        fields = [
            "id",
            "lot",
            "test",
            "test_name",
            "test_code",
            "instrument",
            "instrument_name",
            "mean",
            "sd",
            "cv_percent",
            "unit",
            "n_values",
            "created_at",
            "updated_at",
        ]


class QCTargetCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model = QCTarget
        fields = ["lot", "test", "instrument", "mean", "sd", "cv_percent", "unit", "n_values"]


# ============================================================================
# QC Result Serializers
# ============================================================================


class QCRuleViolationSerializer(serializers.ModelSerializer):
    rule_name = serializers.CharField(source="rule.name", read_only=True)
    rule_type = serializers.CharField(source="rule.rule_type", read_only=True)

    class Meta:
        model = QCRuleViolation
        fields = [
            "id",
            "rule",
            "rule_name",
            "rule_type",
            "severity",
            "description",
            "acknowledged",
            "acknowledged_by",
            "acknowledged_at",
            "corrective_action",
            "created_at",
        ]


class QCResultListSerializer(serializers.ModelSerializer):
    test_name = serializers.CharField(source="test.name", read_only=True)
    test_code = serializers.CharField(source="test.code", read_only=True)
    lot_number = serializers.CharField(source="lot.lot_number", read_only=True)
    instrument_name = serializers.CharField(source="instrument.name", read_only=True, default=None)
    operator_name = serializers.SerializerMethodField()
    z_score = serializers.FloatField(read_only=True)
    violation_count = serializers.SerializerMethodField()

    class Meta:
        model = QCResult
        fields = [
            "id",
            "lot",
            "lot_number",
            "test",
            "test_name",
            "test_code",
            "instrument",
            "instrument_name",
            "value",
            "run_date",
            "operator",
            "operator_name",
            "accepted",
            "z_score",
            "violation_count",
            "comment",
            "created_at",
        ]

    def get_operator_name(self, obj):
        if obj.operator:
            return (
                f"{obj.operator.first_name} {obj.operator.last_name}".strip()
                or obj.operator.username
            )
        return None

    def get_violation_count(self, obj):
        return obj.violations.count()


class QCResultCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model = QCResult
        fields = ["lot", "test", "instrument", "value", "run_date", "comment"]


class QCResultDetailSerializer(serializers.ModelSerializer):
    test_name = serializers.CharField(source="test.name", read_only=True)
    test_code = serializers.CharField(source="test.code", read_only=True)
    lot_number = serializers.CharField(source="lot.lot_number", read_only=True)
    material_name = serializers.CharField(source="lot.material.name", read_only=True)
    instrument_name = serializers.CharField(source="instrument.name", read_only=True, default=None)
    operator_name = serializers.SerializerMethodField()
    z_score = serializers.FloatField(read_only=True)
    violations = QCRuleViolationSerializer(many=True, read_only=True)

    class Meta:
        model = QCResult
        fields = [
            "id",
            "lot",
            "lot_number",
            "material_name",
            "test",
            "test_name",
            "test_code",
            "instrument",
            "instrument_name",
            "value",
            "run_date",
            "operator",
            "operator_name",
            "accepted",
            "z_score",
            "comment",
            "reviewed_by",
            "reviewed_at",
            "violations",
            "created_at",
            "updated_at",
        ]

    def get_operator_name(self, obj):
        if obj.operator:
            return (
                f"{obj.operator.first_name} {obj.operator.last_name}".strip()
                or obj.operator.username
            )
        return None


# ============================================================================
# QC Rule Serializers
# ============================================================================


class QCRuleSerializer(serializers.ModelSerializer):
    test_name = serializers.CharField(source="applies_to_test.name", read_only=True, default=None)

    class Meta:
        model = QCRule
        fields = [
            "id",
            "name",
            "rule_type",
            "severity",
            "description",
            "custom_expression",
            "is_active",
            "applies_to_test",
            "test_name",
            "created_at",
            "updated_at",
        ]


class QCRuleCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model = QCRule
        fields = [
            "name",
            "rule_type",
            "severity",
            "description",
            "custom_expression",
            "is_active",
            "applies_to_test",
        ]


# ============================================================================
# QC Violation Acknowledgment
# ============================================================================


class QCViolationAcknowledgeSerializer(serializers.Serializer):
    corrective_action = serializers.CharField(required=False, allow_blank=True, default="")


# ============================================================================
# Levey-Jennings Chart Data
# ============================================================================


class LeveyJenningsPointSerializer(serializers.Serializer):
    """Single data point for Levey-Jennings chart."""

    id = serializers.IntegerField()
    value = serializers.DecimalField(max_digits=12, decimal_places=4)
    run_date = serializers.DateTimeField()
    z_score = serializers.FloatField(allow_null=True)
    accepted = serializers.BooleanField()
    operator_name = serializers.CharField(allow_null=True)


class LeveyJenningsDataSerializer(serializers.Serializer):
    """Full Levey-Jennings chart data for a lot/test combination."""

    lot_id = serializers.IntegerField()
    lot_number = serializers.CharField()
    test_id = serializers.IntegerField()
    test_name = serializers.CharField()
    mean = serializers.DecimalField(max_digits=12, decimal_places=4)
    sd = serializers.DecimalField(max_digits=12, decimal_places=4)
    unit = serializers.CharField()
    data_points = LeveyJenningsPointSerializer(many=True)


# ============================================================================
# EQA Serializers
# ============================================================================


class EQASampleSerializer(serializers.ModelSerializer):
    test_name = serializers.CharField(source="test.name", read_only=True)
    test_code = serializers.CharField(source="test.code", read_only=True)
    submission_count = serializers.SerializerMethodField()

    class Meta:
        model = EQASample
        fields = [
            "id",
            "survey",
            "sample_id",
            "test",
            "test_name",
            "test_code",
            "expected_value",
            "expected_unit",
            "acceptable_range_low",
            "acceptable_range_high",
            "submission_count",
            "created_at",
        ]

    def get_submission_count(self, obj):
        return obj.submissions.count()


class EQASampleCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model = EQASample
        fields = [
            "survey",
            "sample_id",
            "test",
            "expected_value",
            "expected_unit",
            "acceptable_range_low",
            "acceptable_range_high",
        ]


class EQASubmissionSerializer(serializers.ModelSerializer):
    sample_id_display = serializers.CharField(source="sample.sample_id", read_only=True)
    test_name = serializers.CharField(source="sample.test.name", read_only=True)
    instrument_name = serializers.CharField(source="instrument.name", read_only=True, default=None)
    is_acceptable = serializers.BooleanField(read_only=True)

    class Meta:
        model = EQASubmission
        fields = [
            "id",
            "sample",
            "sample_id_display",
            "test_name",
            "instrument",
            "instrument_name",
            "submitted_value",
            "submitted_unit",
            "method",
            "submitted_by",
            "submitted_at",
            "z_score",
            "bias_percent",
            "performance",
            "peer_group_mean",
            "peer_group_sd",
            "peer_group_n",
            "is_acceptable",
            "comments",
            "created_at",
        ]


class EQASubmissionCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model = EQASubmission
        fields = [
            "sample",
            "instrument",
            "submitted_value",
            "submitted_unit",
            "method",
            "comments",
        ]


class EQASubmissionUpdateScoreSerializer(serializers.Serializer):
    """Update submission with EQA provider's performance data."""

    z_score = serializers.DecimalField(max_digits=6, decimal_places=2)
    bias_percent = serializers.DecimalField(
        max_digits=6, decimal_places=2, required=False, allow_null=True
    )
    peer_group_mean = serializers.DecimalField(
        max_digits=12, decimal_places=4, required=False, allow_null=True
    )
    peer_group_sd = serializers.DecimalField(
        max_digits=12, decimal_places=4, required=False, allow_null=True
    )
    peer_group_n = serializers.IntegerField(required=False, allow_null=True)


class EQASurveyListSerializer(serializers.ModelSerializer):
    is_overdue = serializers.BooleanField(read_only=True)
    sample_count = serializers.SerializerMethodField()
    acceptable_rate = serializers.SerializerMethodField()

    class Meta:
        model = EQASurvey
        fields = [
            "id",
            "provider",
            "survey_id",
            "name",
            "category",
            "status",
            "received_date",
            "due_date",
            "submitted_date",
            "results_received_date",
            "overall_score",
            "is_overdue",
            "sample_count",
            "acceptable_rate",
            "created_at",
            "updated_at",
        ]

    def get_sample_count(self, obj):
        return obj.samples.count()

    def get_acceptable_rate(self, obj):
        """Percentage of acceptable submissions."""
        submissions = EQASubmission.objects.filter(sample__survey=obj).exclude(
            performance=EQASubmission.Performance.PENDING
        )
        total = submissions.count()
        if total == 0:
            return None
        acceptable = submissions.filter(performance=EQASubmission.Performance.ACCEPTABLE).count()
        return round((acceptable / total) * 100, 1)


class EQASurveyCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model = EQASurvey
        fields = [
            "provider",
            "survey_id",
            "name",
            "category",
            "status",
            "received_date",
            "due_date",
            "notes",
        ]


class EQASurveyDetailSerializer(serializers.ModelSerializer):
    is_overdue = serializers.BooleanField(read_only=True)
    samples = EQASampleSerializer(many=True, read_only=True)
    sample_count = serializers.SerializerMethodField()
    acceptable_rate = serializers.SerializerMethodField()

    class Meta:
        model = EQASurvey
        fields = [
            "id",
            "provider",
            "survey_id",
            "name",
            "category",
            "status",
            "received_date",
            "due_date",
            "submitted_date",
            "results_received_date",
            "overall_score",
            "is_overdue",
            "sample_count",
            "acceptable_rate",
            "samples",
            "notes",
            "created_at",
            "updated_at",
        ]

    def get_sample_count(self, obj):
        return obj.samples.count()

    def get_acceptable_rate(self, obj):
        submissions = EQASubmission.objects.filter(sample__survey=obj).exclude(
            performance=EQASubmission.Performance.PENDING
        )
        total = submissions.count()
        if total == 0:
            return None
        acceptable = submissions.filter(performance=EQASubmission.Performance.ACCEPTABLE).count()
        return round((acceptable / total) * 100, 1)
