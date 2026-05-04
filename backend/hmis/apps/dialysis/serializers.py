"""Dialysis serializers."""

from rest_framework import serializers

from .models import DialysisOrder, DialysisSession, VascularAccess

# =============================================================================
# VascularAccess
# =============================================================================


class VascularAccessCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model = VascularAccess
        fields = [
            "patient",
            "access_type",
            "site",
            "placed_date",
            "placed_by",
            "notes",
        ]


class VascularAccessListSerializer(serializers.ModelSerializer):
    patient_name = serializers.SerializerMethodField()

    class Meta:
        model = VascularAccess
        fields = [
            "id",
            "patient",
            "patient_name",
            "access_type",
            "status",
            "site",
            "placed_date",
            "last_assessment_date",
            "created_at",
        ]

    def get_patient_name(self, obj):
        return f"{obj.patient.first_name} {obj.patient.last_name}"


class VascularAccessDetailSerializer(serializers.ModelSerializer):
    patient_name = serializers.SerializerMethodField()

    class Meta:
        model = VascularAccess
        fields = [
            "id",
            "patient",
            "patient_name",
            "access_type",
            "status",
            "site",
            "placed_date",
            "placed_by",
            "last_assessment_date",
            "notes",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["created_at", "updated_at"]

    def get_patient_name(self, obj):
        return f"{obj.patient.first_name} {obj.patient.last_name}"


# =============================================================================
# DialysisOrder
# =============================================================================


class DialysisOrderCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model = DialysisOrder
        fields = [
            "patient",
            "vascular_access",
            "dialysis_type",
            "frequency",
            "target_duration_minutes",
            "blood_flow_rate",
            "dialysate_flow_rate",
            "target_uf_volume",
            "dialysate_composition",
            "anticoagulation",
            "dry_weight_kg",
            "clinical_indication",
            "notes",
            "start_date",
            "end_date",
        ]


class DialysisOrderListSerializer(serializers.ModelSerializer):
    patient_name = serializers.SerializerMethodField()
    patient_mrn = serializers.CharField(source="patient.mrn", read_only=True)
    ordered_by_name = serializers.SerializerMethodField()

    class Meta:
        model = DialysisOrder
        fields = [
            "id",
            "patient",
            "patient_name",
            "patient_mrn",
            "dialysis_type",
            "frequency",
            "status",
            "target_duration_minutes",
            "ordered_by_name",
            "start_date",
            "end_date",
            "created_at",
        ]

    def get_patient_name(self, obj):
        return f"{obj.patient.first_name} {obj.patient.last_name}"

    def get_ordered_by_name(self, obj):
        return obj.ordered_by.get_full_name() or obj.ordered_by.username


class DialysisOrderDetailSerializer(serializers.ModelSerializer):
    patient_name = serializers.SerializerMethodField()
    patient_mrn = serializers.CharField(source="patient.mrn", read_only=True)
    ordered_by_name = serializers.SerializerMethodField()

    class Meta:
        model = DialysisOrder
        fields = [
            "id",
            "patient",
            "patient_name",
            "patient_mrn",
            "ordered_by",
            "ordered_by_name",
            "vascular_access",
            "dialysis_type",
            "frequency",
            "status",
            "target_duration_minutes",
            "blood_flow_rate",
            "dialysate_flow_rate",
            "target_uf_volume",
            "dialysate_composition",
            "anticoagulation",
            "dry_weight_kg",
            "clinical_indication",
            "notes",
            "start_date",
            "end_date",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["created_at", "updated_at"]

    def get_patient_name(self, obj):
        return f"{obj.patient.first_name} {obj.patient.last_name}"

    def get_ordered_by_name(self, obj):
        return obj.ordered_by.get_full_name() or obj.ordered_by.username


# =============================================================================
# DialysisSession
# =============================================================================


class DialysisSessionCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model = DialysisSession
        fields = [
            "patient",
            "order",
            "encounter",
            "vascular_access",
            "dialysis_type",
            "scheduled_date",
            "blood_flow_rate",
            "dialysate_flow_rate",
            "uf_goal_ml",
            "machine_number",
            "notes",
        ]


class DialysisSessionListSerializer(serializers.ModelSerializer):
    patient_name = serializers.SerializerMethodField()
    patient_mrn = serializers.CharField(source="patient.mrn", read_only=True)

    class Meta:
        model = DialysisSession
        fields = [
            "id",
            "session_number",
            "patient",
            "patient_name",
            "patient_mrn",
            "dialysis_type",
            "status",
            "scheduled_date",
            "start_time",
            "end_time",
            "actual_duration_minutes",
            "machine_number",
            "created_at",
        ]

    def get_patient_name(self, obj):
        return f"{obj.patient.first_name} {obj.patient.last_name}"


class DialysisSessionDetailSerializer(serializers.ModelSerializer):
    patient_name = serializers.SerializerMethodField()
    patient_mrn = serializers.CharField(source="patient.mrn", read_only=True)
    performed_by_name = serializers.SerializerMethodField()

    class Meta:
        model = DialysisSession
        fields = [
            "id",
            "session_number",
            "patient",
            "patient_name",
            "patient_mrn",
            "order",
            "encounter",
            "vascular_access",
            "dialysis_type",
            "status",
            "scheduled_date",
            "start_time",
            "end_time",
            "actual_duration_minutes",
            "blood_flow_rate",
            "dialysate_flow_rate",
            "uf_goal_ml",
            "uf_achieved_ml",
            "pre_weight_kg",
            "pre_bp",
            "pre_pulse",
            "pre_temperature",
            "post_weight_kg",
            "post_bp",
            "post_pulse",
            "complications",
            "machine_number",
            "performed_by",
            "performed_by_name",
            "notes",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["session_number", "created_at", "updated_at"]

    def get_patient_name(self, obj):
        return f"{obj.patient.first_name} {obj.patient.last_name}"

    def get_performed_by_name(self, obj):
        if obj.performed_by:
            return obj.performed_by.get_full_name() or obj.performed_by.username
        return None
