"""
KENHDD Serializers.

DHA Compliance: Gap #33 — KENHDD Schema Validation (Sprint 3.D)
"""

from __future__ import annotations

from rest_framework import serializers

from .models import (
    KENHDDDataElement,
    KENHDDValidationRun,
)


class KENHDDDataElementSerializer(serializers.ModelSerializer):
    """Serializer for KENHDD data element listing."""

    class Meta:
        model = KENHDDDataElement
        fields = [
            "id",
            "element_id",
            "name",
            "resource_type",
            "model_field",
            "requirement_level",
            "data_type",
            "coding_system",
            "is_active",
        ]


class KENHDDDataElementDetailSerializer(serializers.ModelSerializer):
    """Serializer for KENHDD data element detail view."""

    class Meta:
        model = KENHDDDataElement
        fields = [
            "id",
            "element_id",
            "name",
            "description",
            "resource_type",
            "model_field",
            "requirement_level",
            "data_type",
            "coding_system",
            "max_length",
            "format_pattern",
            "condition_expression",
            "is_active",
            "created_at",
            "updated_at",
        ]


class KENHDDValidationRunSerializer(serializers.ModelSerializer):
    """Serializer for KENHDD validation run history."""

    run_by_name = serializers.SerializerMethodField()

    class Meta:
        model = KENHDDValidationRun
        fields = [
            "id",
            "resource_type",
            "records_checked",
            "records_compliant",
            "compliance_score",
            "mandatory_pass_rate",
            "violations",
            "run_by",
            "run_by_name",
            "run_at",
        ]

    def get_run_by_name(self, obj: KENHDDValidationRun) -> str | None:
        if obj.run_by:
            return obj.run_by.get_full_name() or obj.run_by.username
        return None


class KENHDDElementResultSerializer(serializers.Serializer):
    """Serializer for a single element validation result."""

    element_id = serializers.CharField()
    element_name = serializers.CharField()
    field_name = serializers.CharField()
    status = serializers.CharField()
    message = serializers.CharField()
    requirement_level = serializers.CharField()
    value = serializers.CharField(allow_blank=True)


class KENHDDRecordResultSerializer(serializers.Serializer):
    """Serializer for a full record validation result."""

    record_id = serializers.CharField()
    resource_type = serializers.CharField()
    is_compliant = serializers.BooleanField()
    pass_count = serializers.IntegerField()
    fail_count = serializers.IntegerField()
    warning_count = serializers.IntegerField()
    elements = KENHDDElementResultSerializer(many=True)


class KENHDDComplianceScoreSerializer(serializers.Serializer):
    """Serializer for compliance report scores."""

    resource_type = serializers.CharField()
    total_records = serializers.IntegerField()
    compliant_records = serializers.IntegerField()
    compliance_pct = serializers.FloatField()
    mandatory_pass_rate = serializers.FloatField()
    total_elements = serializers.IntegerField()
    violations_by_element = serializers.DictField(child=serializers.IntegerField())


class KENHDDValidateRecordInputSerializer(serializers.Serializer):
    """Input serializer for single-record validation."""

    resource_type = serializers.ChoiceField(
        choices=[
            ("PATIENT", "Patient"),
            ("ENCOUNTER", "Encounter"),
            ("DIAGNOSIS", "Diagnosis"),
            ("FACILITY", "Facility"),
            ("LAB_RESULT", "Lab Result"),
            ("PRESCRIPTION", "Prescription"),
            ("MCH_VISIT", "MCH Visit"),
        ]
    )
    record_id = serializers.IntegerField()


class KENHDDComplianceReportInputSerializer(serializers.Serializer):
    """Input serializer for compliance report generation."""

    resource_type = serializers.ChoiceField(
        choices=[
            ("PATIENT", "Patient"),
            ("ENCOUNTER", "Encounter"),
            ("DIAGNOSIS", "Diagnosis"),
            ("FACILITY", "Facility"),
            ("LAB_RESULT", "Lab Result"),
            ("PRESCRIPTION", "Prescription"),
            ("MCH_VISIT", "MCH Visit"),
        ],
        required=False,
    )
    sample_size = serializers.IntegerField(
        default=100, min_value=1, max_value=1000
    )
