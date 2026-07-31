# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""Serializers for Quality Measures & Reporting.

Field lists MUST match the frontend Zod schemas exactly to prevent schema drift.
"""

from __future__ import annotations

from rest_framework import serializers

from .models import AnnualReport, QualityMeasure, QualityMeasureResult, QuarterlyReport


class QuarterlyReportSerializer(serializers.ModelSerializer):
    """Serializer for QuarterlyReport model."""

    clinic_name = serializers.CharField(source="clinic.name", read_only=True)
    quarter_display = serializers.CharField(read_only=True)
    months = serializers.ListField(child=serializers.IntegerField(), read_only=True)
    monthly_report_ids = serializers.PrimaryKeyRelatedField(
        source="monthly_reports",
        many=True,
        read_only=True,
    )

    class Meta:
        model = QuarterlyReport
        fields = [
            "id",
            "clinic",
            "clinic_name",
            "year",
            "quarter",
            "quarter_display",
            "months",
            # Visit statistics
            "total_visits",
            "new_visits",
            "revisits",
            # Priority
            "priority_red",
            "priority_orange",
            "priority_yellow",
            "priority_green",
            "priority_blue",
            # Demographics
            "male_visits",
            "female_visits",
            "under_5_visits",
            "under_18_visits",
            "adult_visits",
            "over_60_visits",
            # Chronic care
            "new_enrollments",
            "active_enrollments",
            "defaulters",
            # ANC
            "anc_first_visits",
            "anc_revisits",
            "deliveries",
            # Revenue
            "total_revenue",
            "sha_claims_amount",
            "cash_amount",
            # Source tracking
            "monthly_report_ids",
            # DHIS2
            "dhis2_submitted",
            "dhis2_submitted_at",
            "dhis2_response",
            # Metadata
            "generated_by",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "clinic_name",
            "quarter_display",
            "months",
            "monthly_report_ids",
            "created_at",
            "updated_at",
        ]


class AnnualReportSerializer(serializers.ModelSerializer):
    """Serializer for AnnualReport model."""

    clinic_name = serializers.CharField(source="clinic.name", read_only=True)
    quarterly_report_ids = serializers.PrimaryKeyRelatedField(
        source="quarterly_reports",
        many=True,
        read_only=True,
    )

    class Meta:
        model = AnnualReport
        fields = [
            "id",
            "clinic",
            "clinic_name",
            "year",
            # Visit statistics
            "total_visits",
            "new_visits",
            "revisits",
            # Priority
            "priority_red",
            "priority_orange",
            "priority_yellow",
            "priority_green",
            "priority_blue",
            # Demographics
            "male_visits",
            "female_visits",
            "under_5_visits",
            "under_18_visits",
            "adult_visits",
            "over_60_visits",
            # Chronic care
            "new_enrollments",
            "active_enrollments",
            "defaulters",
            # ANC
            "anc_first_visits",
            "anc_revisits",
            "deliveries",
            # Revenue
            "total_revenue",
            "sha_claims_amount",
            "cash_amount",
            # Source tracking
            "quarterly_report_ids",
            # DHIS2
            "dhis2_submitted",
            "dhis2_submitted_at",
            "dhis2_response",
            # Metadata
            "generated_by",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "clinic_name",
            "quarterly_report_ids",
            "created_at",
            "updated_at",
        ]


class QualityMeasureSerializer(serializers.ModelSerializer):
    """Serializer for QualityMeasure model."""

    domain_display = serializers.CharField(source="get_domain_display", read_only=True)
    status_display = serializers.CharField(source="get_status_display", read_only=True)
    reporting_period_display = serializers.CharField(
        source="get_reporting_period_display", read_only=True
    )
    evaluation_rule = serializers.JSONField(required=False, allow_null=True)

    SUPPORTED_RULE_TYPES = {
        "bp_control",
        "lab_threshold",
        "wait_time",
        "visit_count",
        "enrollment_active",
        "stock_availability",
        "skilled_birth_attendance",
        "tb_treatment_success",
        "immunization_completeness",
        "maternal_mortality_ratio",
        "idsr_timeliness",
    }

    _RULE_REQUIRED_PARAMS = {
        "bp_control": set(),
        "lab_threshold": {"threshold"},
        "wait_time": set(),
        "visit_count": set(),
        "enrollment_active": set(),
        "stock_availability": set(),
        "skilled_birth_attendance": set(),
        "tb_treatment_success": set(),
        "immunization_completeness": set(),
        "maternal_mortality_ratio": set(),
        "idsr_timeliness": set(),
    }

    _RULE_ALLOWED_PARAMS = {
        "bp_control": {"systolic_max", "diastolic_max", "clinic_types", "enrollment_required"},
        "lab_threshold": {"test_name", "test_code", "threshold", "comparison", "clinic_types"},
        "wait_time": {"max_minutes", "data_source"},
        "visit_count": {"min_visits", "enrollment_status"},
        "enrollment_active": {"target_status", "missed_threshold_days"},
        "stock_availability": {"tracer_only", "stock_out_threshold"},
        "skilled_birth_attendance": {
            "require_documented_attendant",
            "delivery_status",
            "include_outcomes",
        },
        "tb_treatment_success": {
            "success_statuses",
            "success_keywords",
            "use_outcome_reason",
            "require_outcome_date",
            "cohort_statuses",
        },
        "immunization_completeness": {
            "vaccine_program",
            "max_patient_age_years",
            "strict_due_in_period",
        },
        "maternal_mortality_ratio": {"ratio_multiplier", "delivery_status"},
        "idsr_timeliness": {
            "submission_statuses",
            "include_approved",
            "deadline_days_after_week_end",
            "require_dhis2_timestamp",
        },
    }

    class Meta:
        model = QualityMeasure
        fields = [
            "id",
            "code",
            "name",
            "description",
            "domain",
            "domain_display",
            "status",
            "status_display",
            "numerator_logic",
            "denominator_logic",
            "exclusion_logic",
            "target_percentage",
            "low_threshold",
            "reporting_period",
            "reporting_period_display",
            "dhis2_indicator_id",
            "reference_url",
            "applicable_clinic_types",
            "evaluation_rule",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "domain_display",
            "status_display",
            "reporting_period_display",
            "created_at",
            "updated_at",
        ]

    def validate_evaluation_rule(self, value):
        if value in (None, ""):
            return None

        if not isinstance(value, dict):
            raise serializers.ValidationError(
                "evaluation_rule must be an object with keys 'type' and 'params'."
            )

        rule_type = value.get("type")
        params = value.get("params", {})

        if rule_type not in self.SUPPORTED_RULE_TYPES:
            raise serializers.ValidationError(f"Unsupported evaluation rule type '{rule_type}'.")

        if not isinstance(params, dict):
            raise serializers.ValidationError("evaluation_rule.params must be an object.")

        required = self._RULE_REQUIRED_PARAMS.get(rule_type, set())
        missing = sorted(required - set(params.keys()))
        if missing:
            raise serializers.ValidationError(
                f"Missing required params for '{rule_type}': {', '.join(missing)}"
            )

        allowed = self._RULE_ALLOWED_PARAMS.get(rule_type, set())
        extra = sorted(set(params.keys()) - allowed)
        if extra:
            raise serializers.ValidationError(
                f"Unsupported params for '{rule_type}': {', '.join(extra)}"
            )

        if rule_type == "lab_threshold":
            comparison = params.get("comparison")
            if comparison is not None and comparison not in {"lt", "lte", "gt", "gte"}:
                raise serializers.ValidationError(
                    "lab_threshold.comparison must be one of: lt, lte, gt, gte"
                )

        if rule_type == "wait_time":
            data_source = params.get("data_source")
            if data_source is not None and data_source not in {"clinic_visit", "triage_assessment"}:
                raise serializers.ValidationError(
                    "wait_time.data_source must be one of: clinic_visit, triage_assessment"
                )

        return {"type": rule_type, "params": params}


class QualityMeasureResultSerializer(serializers.ModelSerializer):
    """Serializer for QualityMeasureResult model."""

    measure_code = serializers.CharField(source="measure.code", read_only=True)
    measure_name = serializers.CharField(source="measure.name", read_only=True)
    clinic_name = serializers.CharField(source="clinic.name", read_only=True)
    period_type_display = serializers.CharField(source="get_period_type_display", read_only=True)

    class Meta:
        model = QualityMeasureResult
        fields = [
            "id",
            "measure",
            "measure_code",
            "measure_name",
            "clinic",
            "clinic_name",
            "year",
            "period",
            "period_type",
            "period_type_display",
            "numerator",
            "denominator",
            "percentage",
            "meets_target",
            "calculation_notes",
            "calculated_at",
            "calculated_by",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "measure_code",
            "measure_name",
            "clinic_name",
            "period_type_display",
            "percentage",
            "meets_target",
            "calculated_at",
            "created_at",
            "updated_at",
        ]


class QualityMeasureImportSerializer(serializers.Serializer):
    """Serializer for importing quality measures from CSV/JSON."""

    file = serializers.FileField(help_text="CSV or JSON file with quality measure definitions")
    format = serializers.ChoiceField(
        choices=[("csv", "CSV"), ("json", "JSON")],
        default="json",
    )

    def validate_file(self, value):
        from hmis.apps.core.upload_validators import validate_data_import

        validate_data_import(value)
        return value


class QualityMeasureExportSerializer(serializers.Serializer):
    """Serializer for export format selection."""

    format = serializers.ChoiceField(
        choices=[("csv", "CSV"), ("json", "JSON"), ("qrda", "QRDA (simplified)")],
        default="json",
    )
    measures = serializers.ListField(
        child=serializers.IntegerField(),
        required=False,
        help_text="List of measure IDs to export. Empty exports all.",
    )


class QualityDashboardSerializer(serializers.Serializer):
    """Serializer for quality dashboard summary data."""

    total_measures = serializers.IntegerField()
    active_measures = serializers.IntegerField()
    measures_meeting_target = serializers.IntegerField()
    measures_below_threshold = serializers.IntegerField()
    overall_compliance_rate = serializers.DecimalField(max_digits=5, decimal_places=2)
    domain_summary = serializers.ListField(child=serializers.DictField())
    trend_data = serializers.ListField(child=serializers.DictField())
