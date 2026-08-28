# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
# ruff: noqa
"""
What this file is for: inpatient monitoring, medication administration, and bed recommendation serializers.
How to use: imported by `hmis.apps.inpatient.serializers` compatibility shim.
Supported inputs/args: DRF serializers for vitals, fluid balance, transfusion, and medication workflows.
"""

from rest_framework import serializers

from hmis.apps.blood_bank.models import UnitStatus
from hmis.apps.core.models import Facility
from hmis.apps.core.utils import resolve_model_pk_or_public_id
from hmis.apps.encounters.models import Encounter
from hmis.apps.mch.services.postpartum_continuity import (
    route_registration_to_pnc_queue,
    schedule_registration_pnc_follow_up,
    transition_registration_to_postnatal,
)

from .clearance import calculate_patient_blocking_balance
from .models import (
    Admission,
    AdmissionRecommendation,
    AdverseTransfusionReaction,
    Bed,
    BloodTransfusionObservation,
    BPMonitoringReading,
    CardiacRespiratoryReaction,
    DermatologicalReaction,
    Discharge,
    DischargeDiagnosis,
    DischargeDraft,
    DischargeTemplate,
    FluidBalanceEntry,
    FluidBalanceSheet,
    GeneralReaction,
    HaematologicalReaction,
    InpatientConsumableUsage,
    InterFacilityTransfer,
    InterFacilityTransferEvent,
    KardexFieldChange,
    KardexHandoverNote,
    KardexScheduleItem,
    KardexShiftNote,
    MedicationAdministration,
    NursingCarePlanEntry,
    NursingCarePlanEntryChange,
    NursingKardex,
    RenalReaction,
    ReviewRequest,
    ShiftHandover,
    SupervisorAlertAcknowledgment,
    TemperatureReading,
    Transfer,
    TransfusionObservationEntry,
    Ward,
    WardRound,
)
from .serializers_shared import PublicIdOrPkRelatedField


class TemperatureReadingSerializer(serializers.ModelSerializer):
    """Serializer for TPR chart readings."""

    recorded_by_username = serializers.CharField(source="recorded_by.username", read_only=True)
    is_febrile = serializers.BooleanField(read_only=True)
    is_hypothermic = serializers.BooleanField(read_only=True)

    class Meta:
        model = TemperatureReading
        fields = [
            "id",
            "admission",
            "recorded_at",
            "recorded_by",
            "recorded_by_username",
            "temperature",
            "pulse",
            "respiratory_rate",
            "notes",
            "is_febrile",
            "is_hypothermic",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]


class TemperatureReadingCreateSerializer(serializers.ModelSerializer):
    """Serializer for creating TPR readings."""

    admission = PublicIdOrPkRelatedField(queryset=Admission.objects.all())

    class Meta:
        model = TemperatureReading
        fields = [
            "admission",
            "recorded_at",
            "temperature",
            "pulse",
            "respiratory_rate",
            "notes",
        ]


class FluidBalanceSheetSerializer(serializers.ModelSerializer):
    """Serializer for Ministry of Health fluid balance sheets."""

    recorded_by_username = serializers.CharField(source="recorded_by.username", read_only=True)
    total_intravenous_intake_ml = serializers.IntegerField(read_only=True)
    total_alimentary_intake_ml = serializers.IntegerField(read_only=True)
    total_other_intake_ml = serializers.IntegerField(read_only=True)
    total_intake_ml = serializers.IntegerField(read_only=True)
    total_vomit_output_ml = serializers.IntegerField(read_only=True)
    total_stool_output_ml = serializers.IntegerField(read_only=True)
    total_nasogastric_output_ml = serializers.IntegerField(read_only=True)
    total_other_output_ml = serializers.IntegerField(read_only=True)
    total_urine_output_ml = serializers.IntegerField(read_only=True)
    total_output_ml = serializers.IntegerField(read_only=True)
    net_balance_ml = serializers.IntegerField(read_only=True)

    class Meta:
        model = FluidBalanceSheet
        fields = [
            "id",
            "admission",
            "chart_date",
            "recorded_by",
            "recorded_by_username",
            "patient_weight_kg",
            "intravenous_infusion_notes",
            "other_instructions",
            "total_intravenous_intake_ml",
            "total_alimentary_intake_ml",
            "total_other_intake_ml",
            "total_intake_ml",
            "total_vomit_output_ml",
            "total_stool_output_ml",
            "total_nasogastric_output_ml",
            "total_other_output_ml",
            "total_urine_output_ml",
            "total_output_ml",
            "net_balance_ml",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]


class FluidBalanceSheetCreateSerializer(serializers.ModelSerializer):
    """Serializer for creating fluid balance sheets."""

    admission = PublicIdOrPkRelatedField(queryset=Admission.objects.all())

    class Meta:
        model = FluidBalanceSheet
        fields = [
            "admission",
            "chart_date",
            "patient_weight_kg",
            "intravenous_infusion_notes",
            "other_instructions",
        ]


class FluidBalanceEntrySerializer(serializers.ModelSerializer):
    """Serializer for categorized fluid balance entries."""

    recorded_by_username = serializers.CharField(source="recorded_by.username", read_only=True)
    entry_type_display = serializers.CharField(source="get_entry_type_display", read_only=True)

    class Meta:
        model = FluidBalanceEntry
        fields = [
            "id",
            "fluid_balance_sheet",
            "recorded_at",
            "recorded_by",
            "recorded_by_username",
            "entry_type",
            "entry_type_display",
            "item_type",
            "bottle_number",
            "amount_ml",
            "specific_gravity",
            "notes",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]


class FluidBalanceEntryCreateSerializer(serializers.ModelSerializer):
    """Serializer for creating fluid balance entries."""

    class Meta:
        model = FluidBalanceEntry
        fields = [
            "fluid_balance_sheet",
            "recorded_at",
            "entry_type",
            "item_type",
            "bottle_number",
            "amount_ml",
            "specific_gravity",
            "notes",
        ]


class TransfusionObservationEntrySerializer(serializers.ModelSerializer):
    """Serializer for individual transfusion observation entries."""

    observation_interval_display = serializers.CharField(
        source="get_observation_interval_display", read_only=True
    )
    recorded_by_username = serializers.CharField(source="recorded_by.username", read_only=True)

    class Meta:
        model = TransfusionObservationEntry
        fields = [
            "id",
            "transfusion",
            "observation_interval",
            "observation_interval_display",
            "exact_time",
            "recorded_by",
            "recorded_by_username",
            "blood_pressure",
            "temperature",
            "pulse",
            "respiratory_rate",
            "remarks",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]


class TransfusionObservationEntryCreateSerializer(serializers.ModelSerializer):
    """Serializer for creating transfusion observation entries.

    Note: ``transfusion`` and ``recorded_by`` are set by the view
    (``add_observation`` action), not by the client.
    """

    class Meta:
        model = TransfusionObservationEntry
        fields = [
            "observation_interval",
            "exact_time",
            "blood_pressure",
            "temperature",
            "pulse",
            "respiratory_rate",
            "remarks",
        ]


class BloodTransfusionSerializer(serializers.ModelSerializer):
    """Serializer for blood transfusion observation chart."""

    blood_product_display = serializers.CharField(
        source="get_blood_product_display", read_only=True
    )
    status_display = serializers.CharField(source="get_status_display", read_only=True)
    started_by_username = serializers.CharField(source="started_by.username", read_only=True)
    counter_checked_by_username = serializers.CharField(
        source="counter_checked_by.username", read_only=True, default=None
    )
    patient_name = serializers.CharField(source="admission.patient.full_name", read_only=True)
    observations = TransfusionObservationEntrySerializer(many=True, read_only=True)

    class Meta:
        model = BloodTransfusionObservation
        fields = [
            "id",
            "admission",
            "patient_name",
            "blood_product",
            "blood_product_display",
            "blood_product_other",
            "blood_unit_number",
            "blood_bank_unit",
            "blood_group",
            "amount_ml",
            "transfusion_date",
            "time_started",
            "time_ended",
            "started_by",
            "started_by_username",
            "counter_checked_by",
            "counter_checked_by_username",
            "diagnosis",
            "status",
            "status_display",
            "expiry_date",
            "reaction_occurred",
            "reaction_type",
            "reaction_action_taken",
            "observations",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]


class BloodTransfusionCreateSerializer(serializers.ModelSerializer):
    """Serializer for creating blood transfusion records."""

    admission = PublicIdOrPkRelatedField(queryset=Admission.objects.all())

    def validate_blood_bank_unit(self, value):
        if value is None:
            return value
        if value.status != UnitStatus.AVAILABLE:
            raise serializers.ValidationError(
                f"Selected blood unit is not available (current status: {value.status})."
            )
        return value

    def validate(self, attrs):
        attrs = super().validate(attrs)
        unit = attrs.get("blood_bank_unit")
        admission = attrs.get("admission")
        if unit is not None and admission is not None and unit.facility_id != admission.facility_id:
            raise serializers.ValidationError(
                {
                    "blood_bank_unit": "Selected blood unit must belong to the same facility as the admission."
                }
            )
        return attrs

    def create(self, validated_data):
        blood_bank_unit = validated_data.get("blood_bank_unit")
        if blood_bank_unit is not None:
            blood_bank_unit.refresh_from_db(
                fields=["status", "unit_number", "blood_group", "expiry_date"]
            )
            if blood_bank_unit.status != UnitStatus.AVAILABLE:
                raise serializers.ValidationError(
                    {"blood_bank_unit": "Selected blood unit is no longer available."}
                )
            validated_data["blood_unit_number"] = blood_bank_unit.unit_number
            validated_data["blood_group"] = blood_bank_unit.blood_group
            if not validated_data.get("expiry_date") and blood_bank_unit.expiry_date:
                validated_data["expiry_date"] = blood_bank_unit.expiry_date.date()

        instance = super().create(validated_data)

        if blood_bank_unit is not None:
            blood_bank_unit.status = UnitStatus.ISSUED
            blood_bank_unit.save(update_fields=["status", "updated_at"])

        return instance

    class Meta:
        model = BloodTransfusionObservation
        fields = [
            "admission",
            "blood_product",
            "blood_product_other",
            "blood_unit_number",
            "blood_bank_unit",
            "blood_group",
            "amount_ml",
            "transfusion_date",
            "time_started",
            "diagnosis",
            "expiry_date",
        ]


class BPMonitoringReadingSerializer(serializers.ModelSerializer):
    """Serializer for BP monitoring readings."""

    recorded_by_username = serializers.CharField(source="recorded_by.username", read_only=True)
    mean_arterial_pressure = serializers.IntegerField(read_only=True)
    bp_display = serializers.CharField(read_only=True)
    is_hypertensive = serializers.BooleanField(read_only=True)
    is_hypotensive = serializers.BooleanField(read_only=True)
    position_display = serializers.CharField(source="get_position_display", read_only=True)

    class Meta:
        model = BPMonitoringReading
        fields = [
            "id",
            "admission",
            "recorded_at",
            "recorded_by",
            "recorded_by_username",
            "systolic",
            "diastolic",
            "pulse",
            "position",
            "position_display",
            "arm",
            "notes",
            "mean_arterial_pressure",
            "bp_display",
            "is_hypertensive",
            "is_hypotensive",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]


class BPMonitoringReadingCreateSerializer(serializers.ModelSerializer):
    """Serializer for creating BP monitoring readings."""

    admission = PublicIdOrPkRelatedField(queryset=Admission.objects.all())

    class Meta:
        model = BPMonitoringReading
        fields = [
            "admission",
            "recorded_at",
            "systolic",
            "diastolic",
            "pulse",
            "position",
            "arm",
            "notes",
        ]


class MedicationAdministrationSerializer(serializers.ModelSerializer):
    """Serializer for Medication Administration Record entries."""

    administered_by_username = serializers.CharField(
        source="administered_by.username", read_only=True, default=None
    )
    status_display = serializers.CharField(source="get_status_display", read_only=True)
    drug_name = serializers.CharField(read_only=True)
    is_overdue = serializers.BooleanField(read_only=True)
    patient_name = serializers.CharField(
        source="admission.patient.full_name", read_only=True, default=""
    )
    admission_number = serializers.CharField(
        source="admission.admission_number", read_only=True, default=""
    )

    class Meta:
        model = MedicationAdministration
        fields = [
            "id",
            "admission",
            "admission_number",
            "patient_name",
            "prescription_item",
            "drug_name",
            "scheduled_time",
            "actual_time",
            "status",
            "status_display",
            "dose_given",
            "route",
            "administered_by",
            "administered_by_username",
            "notes",
            "is_prn",
            "is_overdue",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]


class MedicationAdministrationCreateSerializer(serializers.ModelSerializer):
    """Serializer for creating MAR entries."""

    admission = PublicIdOrPkRelatedField(queryset=Admission.objects.all())

    class Meta:
        model = MedicationAdministration
        fields = [
            "admission",
            "prescription_item",
            "scheduled_time",
            "actual_time",
            "status",
            "dose_given",
            "route",
            "notes",
            "is_prn",
        ]


class MedicationAdministrationActionSerializer(serializers.Serializer):
    """Serializer for MAR administration actions (give/skip/refuse/hold)."""

    status = serializers.ChoiceField(choices=["GIVEN", "SKIPPED", "REFUSED", "HELD", "VOMITED"])
    dose_given = serializers.CharField(required=False, allow_blank=True, default="")
    notes = serializers.CharField(required=False, allow_blank=True, default="")


# =============================================================================
# Rule-Based Bed Assignment Serializers (Phase B)
# =============================================================================


class RuleBasedBedAssignmentRequestSerializer(serializers.Serializer):
    """Request serializer for rule-based bed assignment recommendation."""

    patient_id = serializers.IntegerField(help_text="Patient ID to assign bed for")
    requires_isolation = serializers.BooleanField(
        required=False,
        default=False,
        help_text="Whether patient requires isolation",
    )
    requires_oxygen = serializers.BooleanField(
        required=False,
        default=False,
        help_text="Whether patient requires oxygen supply",
    )
    requires_ventilator = serializers.BooleanField(
        required=False,
        default=False,
        help_text="Whether patient requires ventilator",
    )
    admission_type = serializers.ChoiceField(
        choices=["ELECTIVE", "EMERGENCY", "TRANSFER"],
        required=False,
        default="ELECTIVE",
        help_text="Type of admission",
    )


class BedCandidateSerializer(serializers.Serializer):
    """Serializer for a bed candidate evaluation result."""

    bed_id = serializers.IntegerField()
    bed_number = serializers.CharField()
    ward_id = serializers.IntegerField()
    ward_name = serializers.CharField()
    ward_code = serializers.CharField()
    passed = serializers.SerializerMethodField()
    matched_constraints = serializers.ListField(child=serializers.CharField())
    failed_constraints = serializers.ListField(child=serializers.CharField())
    compatibility_violations = serializers.ListField(child=serializers.DictField())
    rejection_reason = serializers.CharField(allow_blank=True)
    score = serializers.FloatField()
    scoring_breakdown = serializers.DictField()

    def get_passed(self, obj) -> bool:
        """Determine if bed passed all constraints."""
        if hasattr(obj, "passed_all_constraints"):
            return obj.passed_all_constraints
        return (
            len(obj.get("failed_constraints", [])) == 0
            and len(obj.get("compatibility_violations", [])) == 0
        )


class RuleBasedBedAssignmentResponseSerializer(serializers.Serializer):
    """Response serializer for rule-based bed assignment."""

    success = serializers.BooleanField(help_text="Whether assignment was successful")
    assigned_bed_id = serializers.IntegerField(
        allow_null=True, help_text="Assigned bed ID (null if unsuccessful)"
    )
    assigned_bed_number = serializers.CharField(allow_null=True, help_text="Assigned bed number")
    assigned_ward_name = serializers.CharField(allow_null=True, help_text="Assigned ward name")
    rule_applied = serializers.CharField(
        allow_null=True, help_text="Rule code that was applied (null if none)"
    )
    decision_id = serializers.IntegerField(
        allow_null=True, help_text="AssignmentDecision ID for audit"
    )
    decision_outcome = serializers.CharField(help_text="Decision outcome")
    decision_reason = serializers.CharField(help_text="Decision explanation")
    evaluation_time_ms = serializers.IntegerField(help_text="Evaluation time in ms")
    candidates_evaluated = BedCandidateSerializer(
        many=True, help_text="All evaluated bed candidates"
    )
    scoring_details = serializers.DictField(help_text="Scoring summary")
    error = serializers.CharField(
        allow_null=True, allow_blank=True, help_text="Error message if failed"
    )


# =============================================================================
# Smart Allocation Serializers (Phase C)
# =============================================================================


class SetExpectedDischargeSerializer(serializers.Serializer):
    """Request serializer for setting expected discharge date."""

    expected_discharge_date = serializers.DateTimeField(
        help_text="Expected discharge date and time",
    )

    def validate_expected_discharge_date(self, value):
        from django.utils import timezone

        if value <= timezone.now():
            raise serializers.ValidationError("Expected discharge date must be in the future.")
        return value


class PredictedDischargeSerializer(serializers.Serializer):
    """Serializer for predicted discharge information."""

    admission_id = serializers.IntegerField()
    admission_number = serializers.CharField()
    patient_name = serializers.CharField()
    ward_id = serializers.IntegerField()
    ward_name = serializers.CharField()
    bed_id = serializers.IntegerField()
    bed_number = serializers.CharField()
    admission_date = serializers.CharField()
    expected_discharge_date = serializers.CharField(allow_null=True)
    estimated_discharge_date = serializers.CharField(allow_null=True)
    source = serializers.CharField()
    hours_until_available = serializers.FloatField(allow_null=True)


class BedUtilizationSerializer(serializers.Serializer):
    """Serializer for bed utilization analytics."""

    ward_id = serializers.IntegerField()
    ward_name = serializers.CharField()
    ward_code = serializers.CharField()
    capacity = serializers.IntegerField()
    occupied = serializers.IntegerField()
    available = serializers.IntegerField()
    cleaning = serializers.IntegerField()
    reserved = serializers.IntegerField()
    maintenance = serializers.IntegerField()
    occupancy_rate = serializers.FloatField()
    emergency_buffer_percent = serializers.IntegerField()
    emergency_buffer_beds = serializers.IntegerField()
    effective_available = serializers.IntegerField()
    avg_length_of_stay_days = serializers.FloatField(allow_null=True)
    predicted_discharges_next_4h = serializers.IntegerField()
    predicted_discharges_next_24h = serializers.IntegerField()
    workload_score = serializers.FloatField()


class SmartRecommendBedRequestSerializer(serializers.Serializer):
    """Request serializer for smart bed recommendation."""

    patient_id = serializers.IntegerField(help_text="Patient ID")
    requires_isolation = serializers.BooleanField(
        required=False,
        default=False,
        help_text="Whether patient requires isolation (auto-detected if not set)",
    )
    requires_oxygen = serializers.BooleanField(
        required=False,
        default=False,
        help_text="Whether patient requires oxygen supply",
    )
    requires_ventilator = serializers.BooleanField(
        required=False,
        default=False,
        help_text="Whether patient requires ventilator",
    )
    admission_type = serializers.ChoiceField(
        choices=["ELECTIVE", "EMERGENCY", "TRANSFER"],
        required=False,
        default="ELECTIVE",
        help_text="Type of admission",
    )


class SmartRecommendBedResponseSerializer(serializers.Serializer):
    """Response serializer for smart bed recommendation."""

    success = serializers.BooleanField()
    assigned_bed_id = serializers.IntegerField(allow_null=True)
    assigned_bed_number = serializers.CharField(allow_null=True)
    smart_scores = serializers.DictField()
    emergency_buffer_enforced = serializers.BooleanField()
    cohort_match_score = serializers.FloatField()
    infection_isolation_triggered = serializers.BooleanField()
    workload_score = serializers.FloatField()
    predicted_discharges = PredictedDischargeSerializer(many=True)
    evaluation_time_ms = serializers.IntegerField()
    error = serializers.CharField(allow_null=True, allow_blank=True)


class RecommendWardRequestSerializer(serializers.Serializer):
    """Request serializer for smart ward recommendation."""

    patient_id = serializers.IntegerField(help_text="Patient ID")
    requires_isolation = serializers.BooleanField(
        required=False,
        default=False,
        help_text="Whether patient requires isolation",
    )
    requires_oxygen = serializers.BooleanField(
        required=False,
        default=False,
        help_text="Whether patient requires oxygen supply",
    )
    requires_ventilator = serializers.BooleanField(
        required=False,
        default=False,
        help_text="Whether patient requires ventilator",
    )
    admission_type = serializers.ChoiceField(
        choices=["ELECTIVE", "EMERGENCY", "TRANSFER"],
        required=False,
        default="ELECTIVE",
        help_text="Type of admission",
    )


class WardCandidateSerializer(serializers.Serializer):
    """Serializer for a ward candidate in recommendation results."""

    ward_id = serializers.IntegerField()
    ward_name = serializers.CharField()
    ward_code = serializers.CharField()
    ward_type = serializers.CharField()
    ward_type_display = serializers.CharField()
    compatible = serializers.BooleanField()
    score = serializers.FloatField()
    scores = serializers.DictField()
    total_beds = serializers.IntegerField()
    available_beds = serializers.IntegerField()
    effective_available = serializers.IntegerField()
    occupancy_rate = serializers.FloatField()
    violations = serializers.ListField(child=serializers.CharField())
    rejection_reason = serializers.CharField(allow_blank=True)
    reason = serializers.CharField(allow_blank=True)
    recommended = serializers.BooleanField()


class RecommendWardResponseSerializer(serializers.Serializer):
    """Response serializer for smart ward recommendation."""

    success = serializers.BooleanField()
    recommended_ward_id = serializers.IntegerField(allow_null=True)
    recommended_ward_name = serializers.CharField(allow_null=True)
    ranked_wards = WardCandidateSerializer(many=True)
    incompatible_wards = WardCandidateSerializer(many=True)
    total_evaluated = serializers.IntegerField()
    infection_isolation_triggered = serializers.BooleanField()
    evaluation_time_ms = serializers.IntegerField()
    error = serializers.CharField(allow_null=True, allow_blank=True)


# ============================================================================
# Adverse Transfusion Reaction (ATR) Serializers
# ============================================================================
