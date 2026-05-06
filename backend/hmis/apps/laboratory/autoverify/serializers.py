"""Serializers for Delta Checks & Auto-Verification."""

from rest_framework import serializers

from .models import (
    AutoVerifyConfig,
    AutoVerifyLog,
    AutoVerifyRule,
    DeltaCheckResult,
    DeltaCheckRule,
)

# =============================================================================
# Delta Check Rule Serializers
# =============================================================================


class DeltaCheckRuleListSerializer(serializers.ModelSerializer):
    test_name = serializers.CharField(source="test.name", read_only=True)
    test_code = serializers.CharField(source="test.code", read_only=True)

    class Meta:
        model = DeltaCheckRule
        fields = [
            "id",
            "test",
            "test_name",
            "test_code",
            "check_type",
            "threshold_percent",
            "threshold_absolute",
            "lookback_hours",
            "action",
            "is_active",
            "description",
            "created_at",
            "updated_at",
        ]


class DeltaCheckRuleCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model = DeltaCheckRule
        fields = [
            "test",
            "check_type",
            "threshold_percent",
            "threshold_absolute",
            "lookback_hours",
            "action",
            "is_active",
            "description",
        ]

    def validate(self, attrs):
        check_type = attrs.get("check_type", DeltaCheckRule.CheckType.PERCENT)
        threshold_pct = attrs.get("threshold_percent")
        threshold_abs = attrs.get("threshold_absolute")

        if check_type == DeltaCheckRule.CheckType.PERCENT and threshold_pct is None:
            raise serializers.ValidationError(
                {"threshold_percent": "Required for percent check type."}
            )
        if check_type == DeltaCheckRule.CheckType.ABSOLUTE and threshold_abs is None:
            raise serializers.ValidationError(
                {"threshold_absolute": "Required for absolute check type."}
            )
        if check_type == DeltaCheckRule.CheckType.BOTH and (
            threshold_pct is None or threshold_abs is None
        ):
            raise serializers.ValidationError(
                "Both threshold_percent and threshold_absolute required for 'BOTH' check type."
            )
        return attrs


class DeltaCheckRuleDetailSerializer(serializers.ModelSerializer):
    test_name = serializers.CharField(source="test.name", read_only=True)
    test_code = serializers.CharField(source="test.code", read_only=True)

    class Meta:
        model = DeltaCheckRule
        fields = [
            "id",
            "test",
            "test_name",
            "test_code",
            "check_type",
            "threshold_percent",
            "threshold_absolute",
            "lookback_hours",
            "action",
            "is_active",
            "description",
            "created_at",
            "updated_at",
        ]


# =============================================================================
# Delta Check Result Serializers
# =============================================================================


class DeltaCheckResultSerializer(serializers.ModelSerializer):
    test_name = serializers.SerializerMethodField()
    patient_name = serializers.SerializerMethodField()

    class Meta:
        model = DeltaCheckResult
        fields = [
            "id",
            "result",
            "rule",
            "previous_result",
            "outcome",
            "current_value",
            "previous_value",
            "delta_percent",
            "delta_absolute",
            "action_taken",
            "evaluated_at",
            "test_name",
            "patient_name",
        ]

    def get_test_name(self, obj):
        return obj.result.order_item.test.name if obj.result else None

    def get_patient_name(self, obj):
        if obj.result and obj.result.order_item.lab_order:
            p = obj.result.order_item.lab_order.patient
            return f"{p.first_name} {p.last_name}"
        return None


# =============================================================================
# Auto-Verify Rule Serializers
# =============================================================================


class AutoVerifyRuleListSerializer(serializers.ModelSerializer):
    test_name = serializers.CharField(source="test.name", read_only=True)
    test_code = serializers.CharField(source="test.code", read_only=True)

    class Meta:
        model = AutoVerifyRule
        fields = [
            "id",
            "test",
            "test_name",
            "test_code",
            "condition_type",
            "is_active",
            "priority",
            "parameters",
            "description",
            "created_at",
            "updated_at",
        ]


class AutoVerifyRuleCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model = AutoVerifyRule
        fields = [
            "test",
            "condition_type",
            "is_active",
            "priority",
            "parameters",
            "description",
        ]


class AutoVerifyRuleDetailSerializer(serializers.ModelSerializer):
    test_name = serializers.CharField(source="test.name", read_only=True)
    test_code = serializers.CharField(source="test.code", read_only=True)

    class Meta:
        model = AutoVerifyRule
        fields = [
            "id",
            "test",
            "test_name",
            "test_code",
            "condition_type",
            "is_active",
            "priority",
            "parameters",
            "description",
            "created_at",
            "updated_at",
        ]


# =============================================================================
# Auto-Verify Config Serializers
# =============================================================================


class AutoVerifyConfigSerializer(serializers.ModelSerializer):
    class Meta:
        model = AutoVerifyConfig
        fields = [
            "id",
            "is_enabled",
            "max_auto_verify_percent",
            "excluded_priorities",
            "require_qc_pass",
            "max_specimen_age_hours",
            "created_at",
            "updated_at",
        ]


# =============================================================================
# Auto-Verify Log Serializers
# =============================================================================


class AutoVerifyLogSerializer(serializers.ModelSerializer):
    test_name = serializers.SerializerMethodField()
    patient_name = serializers.SerializerMethodField()
    blocking_rule_condition = serializers.SerializerMethodField()

    class Meta:
        model = AutoVerifyLog
        fields = [
            "id",
            "result",
            "outcome",
            "rules_evaluated",
            "blocking_rule",
            "blocking_rule_condition",
            "evaluated_at",
            "auto_verified_by_system",
            "test_name",
            "patient_name",
        ]

    def get_test_name(self, obj):
        return obj.result.order_item.test.name if obj.result else None

    def get_patient_name(self, obj):
        if obj.result and obj.result.order_item.lab_order:
            p = obj.result.order_item.lab_order.patient
            return f"{p.first_name} {p.last_name}"
        return None

    def get_blocking_rule_condition(self, obj):
        if obj.blocking_rule:
            return obj.blocking_rule.get_condition_type_display()
        return None


# =============================================================================
# Statistics Serializer
# =============================================================================


class AutoVerifyStatsSerializer(serializers.Serializer):
    total_evaluated = serializers.IntegerField()
    auto_verified = serializers.IntegerField()
    blocked = serializers.IntegerField()
    skipped = serializers.IntegerField()
    cap_exceeded = serializers.IntegerField()
    auto_verify_rate = serializers.FloatField()
    delta_checks_total = serializers.IntegerField()
    delta_checks_failed = serializers.IntegerField()
