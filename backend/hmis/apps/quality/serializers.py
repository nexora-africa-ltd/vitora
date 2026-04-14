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
