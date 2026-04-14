"""
CDS Serializers.

Provides serializers for CDS rules and alerts:
- CDSRuleSerializer (detail)
- CDSRuleListSerializer (lightweight list)
- CDSRuleCreateSerializer (create/update)
- CDSAlertSerializer (detail)
- CDSAlertListSerializer (lightweight list)
- Action serializers: CDSOverrideSerializer, CDSEvaluateEncounterSerializer
"""

from __future__ import annotations

from rest_framework import serializers

from .models import (
    CDSAlert,
    CDSRule,
)

# ──────────────────────────── Rule Serializers ────────────────────────────


class CDSRuleSerializer(serializers.ModelSerializer):
    """Full CDS rule detail serializer."""

    is_active = serializers.BooleanField(read_only=True)
    trigger_count = serializers.IntegerField(read_only=True)
    override_rate = serializers.FloatField(read_only=True)
    created_by_name = serializers.SerializerMethodField()
    approved_by_name = serializers.SerializerMethodField()

    class Meta:
        model = CDSRule
        fields = [
            "id",
            "code",
            "name",
            "description",
            "category",
            "priority",
            "evidence_level",
            "status",
            "condition",
            "action_type",
            "action_message",
            "suggestion",
            "references",
            "metadata",
            "is_active",
            "trigger_count",
            "override_rate",
            "created_by",
            "created_by_name",
            "approved_by",
            "approved_by_name",
            "approved_at",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "created_at",
            "updated_at",
            "approved_at",
            "created_by",
            "approved_by",
        ]

    def get_created_by_name(self, obj: CDSRule) -> str:
        if obj.created_by:
            return (
                f"{obj.created_by.first_name} {obj.created_by.last_name}".strip()
                or obj.created_by.username
            )
        return ""

    def get_approved_by_name(self, obj: CDSRule) -> str:
        if obj.approved_by:
            return (
                f"{obj.approved_by.first_name} {obj.approved_by.last_name}".strip()
                or obj.approved_by.username
            )
        return ""


class CDSRuleListSerializer(serializers.ModelSerializer):
    """Lightweight list serializer for CDS rules."""

    is_active = serializers.BooleanField(read_only=True)
    trigger_count = serializers.IntegerField(read_only=True)

    class Meta:
        model = CDSRule
        fields = [
            "id",
            "code",
            "name",
            "category",
            "priority",
            "evidence_level",
            "status",
            "action_type",
            "is_active",
            "trigger_count",
            "created_at",
            "updated_at",
        ]


class CDSRuleCreateSerializer(serializers.ModelSerializer):
    """Serializer for creating/updating CDS rules."""

    class Meta:
        model = CDSRule
        fields = [
            "code",
            "name",
            "description",
            "category",
            "priority",
            "evidence_level",
            "condition",
            "action_type",
            "action_message",
            "suggestion",
            "references",
            "metadata",
        ]

    def validate_condition(self, value: dict) -> dict:
        """Validate that condition has a recognized type."""
        if not isinstance(value, dict):
            raise serializers.ValidationError("Condition must be a JSON object.")
        if "type" not in value:
            raise serializers.ValidationError("Condition must have a 'type' field.")
        valid_types = {"vital_range", "drug_allergy", "drug_drug", "lab_range", "custom"}
        if value["type"] not in valid_types:
            raise serializers.ValidationError(
                f"Invalid rule type '{value['type']}'. Must be one of: {', '.join(sorted(valid_types))}"
            )
        return value

    def validate_code(self, value: str) -> str:
        """Ensure code is uppercase and unique."""
        return value.upper()

    def create(self, validated_data: dict) -> CDSRule:
        request = self.context.get("request")
        if request and hasattr(request, "user"):
            validated_data["created_by"] = request.user
        return super().create(validated_data)


# ──────────────────────────── Alert Serializers ────────────────────────────


class CDSAlertSerializer(serializers.ModelSerializer):
    """Full CDS alert detail serializer."""

    rule_code = serializers.CharField(read_only=True)
    rule_name = serializers.CharField(read_only=True)
    patient_name = serializers.CharField(read_only=True)
    patient_mrn = serializers.CharField(read_only=True)
    is_pending = serializers.BooleanField(read_only=True)
    is_resolved = serializers.BooleanField(read_only=True)
    is_critical = serializers.BooleanField(read_only=True)
    age_hours = serializers.FloatField(read_only=True)
    category = serializers.CharField(source="rule.category", read_only=True)
    evidence_level = serializers.CharField(source="rule.evidence_level", read_only=True)
    action_type = serializers.CharField(source="rule.action_type", read_only=True)
    resolved_by_name = serializers.SerializerMethodField()
    suggested_actions = serializers.SerializerMethodField()

    class Meta:
        model = CDSAlert
        fields = [
            "id",
            "rule",
            "rule_code",
            "rule_name",
            "patient",
            "patient_name",
            "patient_mrn",
            "encounter",
            "priority",
            "status",
            "message",
            "suggestion",
            "details",
            "suggested_actions",
            "category",
            "evidence_level",
            "action_type",
            "override_reason",
            "is_pending",
            "is_resolved",
            "is_critical",
            "age_hours",
            "resolved_by",
            "resolved_by_name",
            "resolved_at",
            "triggered_by",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "rule",
            "patient",
            "encounter",
            "priority",
            "message",
            "suggestion",
            "details",
            "resolved_by",
            "resolved_at",
            "triggered_by",
            "created_at",
            "updated_at",
        ]

    def get_resolved_by_name(self, obj: CDSAlert) -> str:
        if obj.resolved_by:
            return (
                f"{obj.resolved_by.first_name} {obj.resolved_by.last_name}".strip()
                or obj.resolved_by.username
            )
        return ""

    def get_suggested_actions(self, obj: CDSAlert) -> list:
        """Return suggested_actions from details, gated by feature flag."""
        from hmis.apps.core.models import FeatureFlag

        if not FeatureFlag.is_flag_enabled("smart_autopopulate"):
            return []
        details = obj.details or {}
        return details.get("suggested_actions", [])


class CDSAlertListSerializer(serializers.ModelSerializer):
    """Lightweight list serializer for CDS alerts."""

    rule_code = serializers.CharField(read_only=True)
    rule_name = serializers.CharField(read_only=True)
    patient_name = serializers.CharField(read_only=True)
    patient_mrn = serializers.CharField(read_only=True)
    is_pending = serializers.BooleanField(read_only=True)
    is_critical = serializers.BooleanField(read_only=True)
    category = serializers.CharField(source="rule.category", read_only=True)
    suggested_actions = serializers.SerializerMethodField()

    class Meta:
        model = CDSAlert
        fields = [
            "id",
            "rule",
            "rule_code",
            "rule_name",
            "patient",
            "patient_name",
            "patient_mrn",
            "encounter",
            "priority",
            "status",
            "message",
            "suggestion",
            "suggested_actions",
            "category",
            "is_pending",
            "is_critical",
            "created_at",
        ]

    def get_suggested_actions(self, obj: CDSAlert) -> list:
        """Return suggested_actions from details, gated by feature flag."""
        from hmis.apps.core.models import FeatureFlag

        if not FeatureFlag.is_flag_enabled("smart_autopopulate"):
            return []
        details = obj.details or {}
        return details.get("suggested_actions", [])


# ──────────────────────────── Action Serializers ────────────────────────────


class CDSOverrideSerializer(serializers.Serializer):
    """Serializer for overriding a CDS alert."""

    reason = serializers.CharField(
        required=True,
        min_length=10,
        help_text="Clinical reason for overriding this alert (min 10 characters)",
    )


class CDSEvaluateEncounterSerializer(serializers.Serializer):
    """Serializer for manually evaluating CDS rules against an encounter."""

    encounter_id = serializers.IntegerField(
        help_text="Encounter ID to evaluate rules against",
    )


class CDSDashboardSerializer(serializers.Serializer):
    """Serializer for CDS dashboard statistics."""

    total_rules = serializers.IntegerField()
    active_rules = serializers.IntegerField()
    draft_rules = serializers.IntegerField()
    total_alerts = serializers.IntegerField()
    pending_alerts = serializers.IntegerField()
    critical_pending = serializers.IntegerField()
    alerts_today = serializers.IntegerField()
    override_rate = serializers.FloatField(allow_null=True)
    alerts_by_category = serializers.ListField(child=serializers.DictField())
    alerts_by_priority = serializers.ListField(child=serializers.DictField())
