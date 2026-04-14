"""Analytics serializers."""

from rest_framework import serializers

from hmis.apps.analytics.models import (
    DepartmentMonthlySummary,
    DiagnosisTrend,
    FacilityDailySummary,
    PatientDemographicSnapshot,
)


class FacilityDailySummarySerializer(serializers.ModelSerializer):
    facility_name = serializers.CharField(source="facility.name", read_only=True)

    class Meta:
        model = FacilityDailySummary
        fields = [
            "id",
            "facility",
            "facility_name",
            "date",
            # Patients
            "new_patients",
            "total_patients",
            # Encounters
            "encounters_opd",
            "encounters_ipd",
            "encounters_emergency",
            "encounters_other",
            "encounters_total",
            # Revenue
            "revenue_total",
            "revenue_cash",
            "revenue_mpesa",
            "revenue_insurance",
            # Billing
            "invoices_created",
            "outstanding_balance",
            # Lab
            "lab_orders_placed",
            "lab_orders_completed",
            "lab_critical_results",
            # Pharmacy
            "prescriptions_dispensed",
            "low_stock_alerts",
            # Triage
            "triage_assessments",
            "triage_emergency_count",
            "avg_wait_time_minutes",
            # Inpatient
            "current_admissions",
            "new_admissions",
            "discharges",
            "bed_occupancy_rate",
            # Patient flow KPIs
            "return_patients",
            "walk_ins",
            "referral_ins",
            "clinic_referrals",
            "follow_up_encounters",
            # Meta
            "created_at",
        ]
        read_only_fields = fields


class DepartmentMonthlySummarySerializer(serializers.ModelSerializer):
    facility_name = serializers.CharField(source="facility.name", read_only=True)
    department_display = serializers.CharField(source="get_department_display", read_only=True)

    class Meta:
        model = DepartmentMonthlySummary
        fields = [
            "id",
            "facility",
            "facility_name",
            "year",
            "month",
            "department",
            "department_display",
            "visit_count",
            "unique_patients",
            "revenue",
            "top_diagnoses",
            "avg_length_of_stay_days",
            "created_at",
        ]
        read_only_fields = fields


class DiagnosisTrendSerializer(serializers.ModelSerializer):
    class Meta:
        model = DiagnosisTrend
        fields = [
            "id",
            "facility",
            "icd10_code",
            "icd10_name",
            "granularity",
            "period_start",
            "period_end",
            "case_count",
            "age_band_breakdown",
            "gender_breakdown",
            "created_at",
        ]
        read_only_fields = fields


class PatientDemographicSnapshotSerializer(serializers.ModelSerializer):
    facility_name = serializers.CharField(source="facility.name", read_only=True)

    class Meta:
        model = PatientDemographicSnapshot
        fields = [
            "id",
            "facility",
            "facility_name",
            "snapshot_date",
            "total_patients",
            "age_distribution",
            "gender_distribution",
            "county_distribution",
            "referral_source_distribution",
            "new_vs_return",
            "insurance_coverage",
            "created_at",
        ]
        read_only_fields = fields
