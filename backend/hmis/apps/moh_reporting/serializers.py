"""MOH Reporting serializers."""

from rest_framework import serializers

from .models import MOH705DiseaseRow, MOH705Report, MOH711Report, MOH717Report

# ---------------------------------------------------------------------------
# MOH 705
# ---------------------------------------------------------------------------


class MOH705DiseaseRowSerializer(serializers.ModelSerializer):
    class Meta:
        model = MOH705DiseaseRow
        fields = [
            "id",
            "icd10_chapter",
            "category_name",
            "cases_under_5",
            "cases_5_and_above",
            "total_cases",
        ]


class MOH705ReportSerializer(serializers.ModelSerializer):
    disease_rows = MOH705DiseaseRowSerializer(many=True, read_only=True)
    facility_name = serializers.CharField(source="facility.name", read_only=True)
    period_label = serializers.CharField(read_only=True)
    dhis2_period = serializers.CharField(read_only=True)
    is_submitted = serializers.BooleanField(read_only=True)
    can_edit = serializers.BooleanField(read_only=True)

    class Meta:
        model = MOH705Report
        fields = [
            "id",
            "facility",
            "facility_name",
            "period_start",
            "period_end",
            "period_label",
            "dhis2_period",
            "status",
            "total_visits",
            "total_under_5",
            "total_5_and_above",
            "new_cases",
            "revisits",
            "generated_by",
            "generated_at",
            "approved_by",
            "approved_at",
            "dhis2_submitted_at",
            "dhis2_import_summary",
            "is_submitted",
            "can_edit",
            "notes",
            "disease_rows",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "facility",
            "facility_name",
            "status",
            "generated_by",
            "generated_at",
            "approved_by",
            "approved_at",
            "dhis2_submitted_at",
            "dhis2_import_summary",
            "created_at",
            "updated_at",
        ]


class MOH705ReportListSerializer(serializers.ModelSerializer):
    facility_name = serializers.CharField(source="facility.name", read_only=True)
    period_label = serializers.CharField(read_only=True)
    is_submitted = serializers.BooleanField(read_only=True)
    disease_row_count = serializers.SerializerMethodField()

    class Meta:
        model = MOH705Report
        fields = [
            "id",
            "facility",
            "facility_name",
            "period_start",
            "period_end",
            "period_label",
            "status",
            "total_visits",
            "total_under_5",
            "total_5_and_above",
            "is_submitted",
            "disease_row_count",
            "generated_at",
            "created_at",
        ]

    def get_disease_row_count(self, obj) -> int:
        return obj.disease_rows.count()


# ---------------------------------------------------------------------------
# MOH 711
# ---------------------------------------------------------------------------


class MOH711ReportSerializer(serializers.ModelSerializer):
    facility_name = serializers.CharField(source="facility.name", read_only=True)
    period_label = serializers.CharField(read_only=True)
    dhis2_period = serializers.CharField(read_only=True)
    is_submitted = serializers.BooleanField(read_only=True)
    can_edit = serializers.BooleanField(read_only=True)

    class Meta:
        model = MOH711Report
        fields = [
            "id",
            "facility",
            "facility_name",
            "period_start",
            "period_end",
            "period_label",
            "dhis2_period",
            "status",
            # RH
            "anc_visits",
            "deliveries_normal",
            "deliveries_caesarean",
            "deliveries_total",
            "live_births",
            "still_births",
            # Malaria
            "malaria_cases_under_5",
            "malaria_cases_5_and_above",
            "malaria_in_pregnancy",
            # Nutrition
            "children_underweight",
            "children_stunted",
            "children_wasted",
            # Immunisation
            "bcg_given",
            "opv_given",
            "penta_given",
            "measles_given",
            "fully_immunised",
            # Meta
            "generated_by",
            "generated_at",
            "approved_by",
            "approved_at",
            "dhis2_submitted_at",
            "dhis2_import_summary",
            "is_submitted",
            "can_edit",
            "notes",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "facility",
            "facility_name",
            "status",
            "generated_by",
            "generated_at",
            "approved_by",
            "approved_at",
            "dhis2_submitted_at",
            "dhis2_import_summary",
            "created_at",
            "updated_at",
        ]


class MOH711ReportListSerializer(serializers.ModelSerializer):
    facility_name = serializers.CharField(source="facility.name", read_only=True)
    period_label = serializers.CharField(read_only=True)
    is_submitted = serializers.BooleanField(read_only=True)

    class Meta:
        model = MOH711Report
        fields = [
            "id",
            "facility",
            "facility_name",
            "period_start",
            "period_end",
            "period_label",
            "status",
            "deliveries_total",
            "malaria_cases_under_5",
            "malaria_cases_5_and_above",
            "is_submitted",
            "generated_at",
            "created_at",
        ]


# ---------------------------------------------------------------------------
# MOH 717
# ---------------------------------------------------------------------------


class MOH717ReportSerializer(serializers.ModelSerializer):
    facility_name = serializers.CharField(source="facility.name", read_only=True)
    period_label = serializers.CharField(read_only=True)
    dhis2_period = serializers.CharField(read_only=True)
    is_submitted = serializers.BooleanField(read_only=True)
    can_edit = serializers.BooleanField(read_only=True)

    class Meta:
        model = MOH717Report
        fields = [
            "id",
            "facility",
            "facility_name",
            "period_start",
            "period_end",
            "period_label",
            "dhis2_period",
            "status",
            # OPD
            "opd_new_visits",
            "opd_revisits",
            "opd_total",
            # Inpatient
            "admissions_total",
            "discharges_total",
            "inpatient_days",
            "deaths_total",
            # Deliveries
            "deliveries_total",
            "deliveries_caesarean",
            # Theatre
            "surgeries_major",
            "surgeries_minor",
            # Referrals
            "referrals_in",
            "referrals_out",
            # Lab / Emergency
            "lab_tests_total",
            "emergency_visits",
            # Meta
            "generated_by",
            "generated_at",
            "approved_by",
            "approved_at",
            "dhis2_submitted_at",
            "dhis2_import_summary",
            "is_submitted",
            "can_edit",
            "notes",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "facility",
            "facility_name",
            "status",
            "generated_by",
            "generated_at",
            "approved_by",
            "approved_at",
            "dhis2_submitted_at",
            "dhis2_import_summary",
            "created_at",
            "updated_at",
        ]


class MOH717ReportListSerializer(serializers.ModelSerializer):
    facility_name = serializers.CharField(source="facility.name", read_only=True)
    period_label = serializers.CharField(read_only=True)
    is_submitted = serializers.BooleanField(read_only=True)

    class Meta:
        model = MOH717Report
        fields = [
            "id",
            "facility",
            "facility_name",
            "period_start",
            "period_end",
            "period_label",
            "status",
            "opd_total",
            "admissions_total",
            "emergency_visits",
            "is_submitted",
            "generated_at",
            "created_at",
        ]


# ---------------------------------------------------------------------------
# Action serializers
# ---------------------------------------------------------------------------


class MOHReportGenerateSerializer(serializers.Serializer):
    year = serializers.IntegerField(required=False)
    month = serializers.IntegerField(required=False, min_value=1, max_value=12)


class MOHReportApproveSerializer(serializers.Serializer):
    notes = serializers.CharField(required=False, default="", allow_blank=True)
