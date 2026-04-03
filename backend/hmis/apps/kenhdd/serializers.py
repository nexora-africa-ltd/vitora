"""
KENHDD Serializers.

DHA Compliance: Gap #33 — KENHDD Schema Validation (Sprint 3.D)
"""

from __future__ import annotations

from rest_framework import serializers

from .models import (
    KENHDDDataElement,
    KENHDDFailedRecord,
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


class KENHDDFailedRecordSerializer(serializers.ModelSerializer):
    """Serializer for a single failed record within a validation run."""

    record_exists = serializers.SerializerMethodField()

    class Meta:
        model = KENHDDFailedRecord
        fields = [
            "id",
            "record_id",
            "is_compliant",
            "pass_count",
            "fail_count",
            "warning_count",
            "violation_details",
            "record_exists",
        ]

    def get_record_exists(self, obj: KENHDDFailedRecord) -> bool:
        """Check whether the referenced record still exists in the database."""
        # Use cached lookup from context if available (avoids N+1 queries)
        existing_ids: set[str] | None = self.context.get("existing_record_ids")
        if existing_ids is not None:
            return str(obj.record_id) in existing_ids

        # Fallback: per-record query
        from .services.validation import KENHDDValidationService

        service = KENHDDValidationService()
        resource_type = obj.run.resource_type
        model_cls = service.get_model_class(resource_type)
        if model_cls is None:
            return False
        return model_cls.objects.filter(pk=obj.record_id).exists()


class KENHDDValidationRunDetailSerializer(serializers.ModelSerializer):
    """Serializer for validation run detail including failed records."""

    run_by_name = serializers.SerializerMethodField()
    failed_records = serializers.SerializerMethodField()
    total_failed = serializers.SerializerMethodField()

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
            "total_failed",
            "failed_records",
        ]

    def get_run_by_name(self, obj: KENHDDValidationRun) -> str | None:
        if obj.run_by:
            return obj.run_by.get_full_name() or obj.run_by.username
        return None

    def get_total_failed(self, obj: KENHDDValidationRun) -> int:
        return obj.failed_records.count()

    def get_failed_records(self, obj: KENHDDValidationRun) -> list[dict]:
        """Serialize failed records with batch existence check."""
        from .services.validation import KENHDDValidationService

        records = obj.failed_records.all()
        record_ids = [str(r.record_id) for r in records]

        # Batch-check which records still exist
        existing_ids: set[str] = set()
        if record_ids:
            service = KENHDDValidationService()
            model_cls = service.get_model_class(obj.resource_type)
            if model_cls is not None:
                existing_pks = model_cls.objects.filter(
                    pk__in=record_ids
                ).values_list("pk", flat=True)
                existing_ids = {str(pk) for pk in existing_pks}

        serializer = KENHDDFailedRecordSerializer(
            records,
            many=True,
            context={"existing_record_ids": existing_ids},
        )
        return serializer.data  # type: ignore[return-value]


class KENHDDRevalidateInputSerializer(serializers.Serializer):
    """Input serializer for revalidating failed records from a run."""

    sample_size = serializers.IntegerField(
        default=100, min_value=1, max_value=1000, required=False
    )
