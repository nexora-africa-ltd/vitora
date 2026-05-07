"""Serializers for Reflexive Testing."""

from rest_framework import serializers

from .models import ReflexExecution, ReflexRule


class ReflexRuleListSerializer(serializers.ModelSerializer):
    trigger_test_name = serializers.CharField(source="trigger_test.name", read_only=True)
    trigger_test_code = serializers.CharField(source="trigger_test.code", read_only=True)
    reflex_test_name = serializers.CharField(source="reflex_test.name", read_only=True)
    reflex_test_code = serializers.CharField(source="reflex_test.code", read_only=True)

    class Meta:
        model = ReflexRule
        fields = [
            "id",
            "trigger_test",
            "trigger_test_name",
            "trigger_test_code",
            "reflex_test",
            "reflex_test_name",
            "reflex_test_code",
            "operator",
            "threshold_value",
            "threshold_high",
            "text_value",
            "action",
            "priority",
            "description",
            "is_active",
            "created_at",
            "updated_at",
        ]


class ReflexRuleCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model = ReflexRule
        fields = [
            "trigger_test",
            "reflex_test",
            "operator",
            "threshold_value",
            "threshold_high",
            "text_value",
            "action",
            "priority",
            "description",
        ]


class ReflexRuleDetailSerializer(serializers.ModelSerializer):
    trigger_test_name = serializers.CharField(source="trigger_test.name", read_only=True)
    trigger_test_code = serializers.CharField(source="trigger_test.code", read_only=True)
    reflex_test_name = serializers.CharField(source="reflex_test.name", read_only=True)
    reflex_test_code = serializers.CharField(source="reflex_test.code", read_only=True)

    class Meta:
        model = ReflexRule
        fields = [
            "id",
            "trigger_test",
            "trigger_test_name",
            "trigger_test_code",
            "reflex_test",
            "reflex_test_name",
            "reflex_test_code",
            "operator",
            "threshold_value",
            "threshold_high",
            "text_value",
            "action",
            "priority",
            "description",
            "is_active",
            "created_at",
            "updated_at",
        ]


class ReflexExecutionSerializer(serializers.ModelSerializer):
    trigger_test_name = serializers.CharField(
        source="rule.trigger_test.name", read_only=True, default=""
    )
    reflex_test_name = serializers.CharField(
        source="rule.reflex_test.name", read_only=True, default=""
    )
    patient_name = serializers.SerializerMethodField()

    class Meta:
        model = ReflexExecution
        fields = [
            "id",
            "rule",
            "trigger_result",
            "reflex_order",
            "status",
            "trigger_value",
            "trigger_test_name",
            "reflex_test_name",
            "patient_name",
            "executed_at",
            "approved_by",
            "notes",
            "created_at",
        ]

    def get_patient_name(self, obj):
        try:
            patient = obj.trigger_result.order_item.lab_order.patient
            return f"{patient.first_name} {patient.last_name}"
        except Exception:
            return ""


class ReflexActionSerializer(serializers.Serializer):
    """Input serializer for approve/reject actions."""

    notes = serializers.CharField(required=False, default="")
