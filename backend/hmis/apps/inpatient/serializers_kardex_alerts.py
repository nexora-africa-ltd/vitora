# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
# ruff: noqa
"""Inpatient serializers kardex alerts for Vitora HMIS.

What this file is for:
- Implement serializers kardex alerts logic for the inpatient domain.

How to use it:
- Import classes and functions from this module in Django app code and tests.

Supported inputs/args:
- Python imports and Django ORM/runtime inputs; no standalone CLI arguments.
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


class NursingCarePlanEntrySerializer(serializers.ModelSerializer):
    """Serializer for NursingCarePlanEntry model."""

    recorded_by_username = serializers.CharField(source="recorded_by.username", read_only=True)
    status_display = serializers.CharField(source="get_status_display", read_only=True)
    is_review_due = serializers.BooleanField(read_only=True)
    review_due_at = serializers.DateTimeField(read_only=True)
    last_reviewed_at = serializers.DateTimeField(read_only=True)

    class Meta:
        model = NursingCarePlanEntry
        fields = [
            "id",
            "kardex",
            "recorded_at",
            "recorded_by",
            "recorded_by_username",
            "assessment",
            "nursing_diagnosis",
            "goal_and_outcome_criteria",
            "plan_of_action",
            "scientific_rationale",
            "implementation",
            "evaluation",
            "status",
            "status_display",
            "is_review_due",
            "review_due_at",
            "last_reviewed_at",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "recorded_by", "created_at", "updated_at"]


class NursingCarePlanEntryChangeSerializer(serializers.ModelSerializer):
    """Serializer for per-entry care-plan lifecycle/edit history."""

    changed_by_username = serializers.CharField(source="changed_by.username", read_only=True)
    action_display = serializers.CharField(source="get_action_display", read_only=True)

    class Meta:
        model = NursingCarePlanEntryChange
        fields = [
            "id",
            "care_plan_entry",
            "action",
            "action_display",
            "changed_by",
            "changed_by_username",
            "changed_fields",
            "before_data",
            "after_data",
            "notes",
            "created_at",
        ]
        read_only_fields = fields


class NursingCarePlanEntryCreateSerializer(serializers.ModelSerializer):
    """Serializer for creating a NursingCarePlanEntry."""

    class Meta:
        model = NursingCarePlanEntry
        fields = [
            "recorded_at",
            "assessment",
            "nursing_diagnosis",
            "goal_and_outcome_criteria",
            "plan_of_action",
            "scientific_rationale",
            "implementation",
            "evaluation",
            "status",
        ]


class KardexShiftNoteSerializer(serializers.ModelSerializer):
    """Serializer for KardexShiftNote model."""

    nurse_username = serializers.CharField(source="nurse.username", read_only=True)
    shift_display = serializers.CharField(source="get_shift_display", read_only=True)

    class Meta:
        model = KardexShiftNote
        fields = [
            "id",
            "kardex",
            "shift",
            "shift_display",
            "nurse",
            "nurse_username",
            "content",
            "timestamp",
        ]
        read_only_fields = ["id", "timestamp"]


class KardexHandoverNoteSerializer(serializers.ModelSerializer):
    """Serializer for KardexHandoverNote model."""

    outgoing_nurse_username = serializers.CharField(
        source="outgoing_nurse.username", read_only=True
    )
    incoming_nurse_username = serializers.CharField(
        source="incoming_nurse.username", read_only=True
    )

    class Meta:
        model = KardexHandoverNote
        fields = [
            "id",
            "kardex",
            "outgoing_nurse",
            "outgoing_nurse_username",
            "incoming_nurse",
            "incoming_nurse_username",
            "shift_ending",
            "pending_tasks",
            "escalations",
            "acknowledged_at",
            "created_at",
        ]
        read_only_fields = ["id", "created_at"]


class InpatientConsumableUsageSerializer(serializers.ModelSerializer):
    """Serializer for inpatient consumable stock usage records."""

    admission_number = serializers.CharField(source="admission.admission_number", read_only=True)
    patient_name = serializers.SerializerMethodField()
    drug_name = serializers.CharField(source="drug.get_display_name", read_only=True)
    batch_number = serializers.CharField(source="batch.batch_number", read_only=True)
    used_by_username = serializers.CharField(source="used_by.username", read_only=True)
    reversed_by_username = serializers.CharField(source="reversed_by.username", read_only=True)

    class Meta:
        model = InpatientConsumableUsage
        fields = [
            "id",
            "admission",
            "admission_number",
            "patient_name",
            "drug",
            "drug_name",
            "batch",
            "batch_number",
            "quantity_used",
            "notes",
            "used_by",
            "used_by_username",
            "used_at",
            "is_reversed",
            "reversed_by",
            "reversed_by_username",
            "reversed_at",
            "reverse_reason",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "drug",
            "used_by",
            "is_reversed",
            "reversed_by",
            "reversed_at",
            "reverse_reason",
            "created_at",
            "updated_at",
        ]

    def get_patient_name(self, obj) -> str:
        patient = obj.admission.patient
        return f"{patient.first_name} {patient.last_name}"


class InpatientConsumableUsageCreateSerializer(serializers.ModelSerializer):
    """Serializer for recording inpatient consumable usage."""

    class Meta:
        model = InpatientConsumableUsage
        fields = ["batch", "quantity_used", "notes", "used_at"]


class InpatientConsumableUsageReverseSerializer(serializers.Serializer):
    """Serializer for reversing a consumable usage record."""

    reason = serializers.CharField()


class KardexFieldChangeSerializer(serializers.ModelSerializer):
    """Serializer for NursingKardex field change history entries."""

    changed_by_username = serializers.CharField(source="changed_by.username", read_only=True)
    field_label = serializers.SerializerMethodField()

    class Meta:
        model = KardexFieldChange
        fields = [
            "id",
            "kardex",
            "field_name",
            "field_label",
            "old_value",
            "new_value",
            "changed_by",
            "changed_by_username",
            "changed_at",
        ]

    def get_field_label(self, obj) -> str:
        try:
            return str(NursingKardex._meta.get_field(obj.field_name).verbose_name).replace("_", " ")
        except (
            AttributeError,
            TypeError,
            ValueError,
            RuntimeError,
            OSError,
            AssertionError,
            ImportError,
        ):
            return obj.field_name.replace("_", " ")


class NursingKardexSerializer(serializers.ModelSerializer):
    """Serializer for NursingKardex model."""

    admission_number = serializers.CharField(source="admission.admission_number", read_only=True)
    patient_name = serializers.SerializerMethodField()
    ward_name = serializers.CharField(source="admission.ward.name", read_only=True)
    bed_number = serializers.CharField(source="admission.bed.bed_number", read_only=True)
    shift_notes = KardexShiftNoteSerializer(many=True, read_only=True)
    handover_notes = KardexHandoverNoteSerializer(many=True, read_only=True)
    care_plan_entries = NursingCarePlanEntrySerializer(many=True, read_only=True)
    fall_risk_display = serializers.CharField(source="get_fall_risk_display", read_only=True)
    pressure_sore_risk_display = serializers.CharField(
        source="get_pressure_sore_risk_display", read_only=True
    )
    maternity_continuity_action_display = serializers.CharField(
        source="get_maternity_continuity_action_display", read_only=True
    )
    code_status_display = serializers.CharField(source="get_code_status_display", read_only=True)
    field_change_history = KardexFieldChangeSerializer(many=True, read_only=True)
    schedule_items = serializers.SerializerMethodField()

    def get_schedule_items(self, obj):
        items = obj.schedule_items.all().order_by("scheduled_for")
        return KardexScheduleItemSerializer(items, many=True).data

    class Meta:
        model = NursingKardex
        fields = [
            "id",
            "admission",
            "admission_number",
            "patient_name",
            "ward_name",
            "bed_number",
            # Basic care information
            "mobility_status",
            "dietary_requirements",
            "allergies",
            "iv_access",
            "code_status",
            "code_status_display",
            "code_status_notes",
            "current_medications",
            "iv_fluids",
            "hygiene_precautions",
            "maternity_continuity_action",
            "maternity_continuity_action_display",
            "maternity_continuity_notes",
            # Legacy nursing care plan fields (deprecated)
            "nursing_problems",
            "interventions",
            "monitoring_requirements",
            "care_task_frequency",
            # Risk assessments
            "fall_risk",
            "fall_risk_display",
            "pressure_sore_risk",
            "pressure_sore_risk_display",
            # Isolation
            "isolation_required",
            "isolation_type",
            # Related notes and care plan entries
            "shift_notes",
            "handover_notes",
            "schedule_items",
            "care_plan_entries",
            "field_change_history",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "admission", "created_at", "updated_at"]

    def get_patient_name(self, obj) -> str:
        """Get patient full name."""
        patient = obj.admission.patient
        return f"{patient.first_name} {patient.last_name}"


class KardexScheduleItemSerializer(serializers.ModelSerializer):
    """Serializer for kardex schedule/timing entries."""

    item_type_display = serializers.CharField(source="get_item_type_display", read_only=True)
    status_display = serializers.CharField(source="get_status_display", read_only=True)
    created_by_username = serializers.CharField(source="created_by.username", read_only=True)

    class Meta:
        model = KardexScheduleItem
        fields = [
            "id",
            "kardex",
            "item_type",
            "item_type_display",
            "title",
            "scheduled_for",
            "frequency",
            "status",
            "status_display",
            "notes",
            "created_by",
            "created_by_username",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "kardex", "created_by", "created_at", "updated_at"]


class KardexScheduleItemCreateSerializer(serializers.Serializer):
    """Request serializer for creating a kardex schedule item."""

    item_type = serializers.ChoiceField(
        choices=[c[0] for c in KardexScheduleItem.ITEM_TYPE_CHOICES]
    )
    title = serializers.CharField(max_length=255)
    scheduled_for = serializers.DateTimeField()
    frequency = serializers.CharField(max_length=100, required=False, allow_blank=True, default="")
    status = serializers.ChoiceField(
        choices=[c[0] for c in KardexScheduleItem.STATUS_CHOICES], required=False, default="PENDING"
    )
    notes = serializers.CharField(required=False, allow_blank=True, default="")


class KardexScheduleItemUpdateSerializer(serializers.Serializer):
    """Request serializer for partially updating a kardex schedule item."""

    item_type = serializers.ChoiceField(
        choices=[c[0] for c in KardexScheduleItem.ITEM_TYPE_CHOICES], required=False
    )
    title = serializers.CharField(max_length=255, required=False)
    scheduled_for = serializers.DateTimeField(required=False)
    frequency = serializers.CharField(max_length=100, required=False, allow_blank=True)
    status = serializers.ChoiceField(
        choices=[c[0] for c in KardexScheduleItem.STATUS_CHOICES], required=False
    )
    notes = serializers.CharField(required=False, allow_blank=True)


class ShiftHandoverSerializer(serializers.ModelSerializer):
    """Serializer for ShiftHandover model."""

    ward_name = serializers.CharField(source="ward.name", read_only=True)
    outgoing_nurse_username = serializers.CharField(
        source="outgoing_nurse.username", read_only=True
    )
    incoming_nurse_username = serializers.CharField(
        source="incoming_nurse.username", read_only=True
    )
    shift_ending_display = serializers.CharField(source="get_shift_ending_display", read_only=True)
    is_acknowledged = serializers.ReadOnlyField()

    class Meta:
        model = ShiftHandover
        fields = [
            "id",
            "ward",
            "ward_name",
            "shift_date",
            "shift_ending",
            "shift_ending_display",
            "outgoing_nurse",
            "outgoing_nurse_username",
            "incoming_nurse",
            "incoming_nurse_username",
            "total_patients",
            "critical_patients",
            "new_admissions",
            "discharges_pending",
            "general_notes",
            "acknowledged_at",
            "is_acknowledged",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "acknowledged_at", "created_at", "updated_at"]


# =============================================================================
# Supervisor Alert Serializers (for polling fallback)
# =============================================================================


class ConstraintViolationSerializer(serializers.Serializer):
    """Serializer for constraint violation details."""

    code = serializers.CharField(help_text="Violation code (e.g., 'GENDER_MISMATCH')")
    message = serializers.CharField(help_text="Human-readable violation message")
    severity = serializers.ChoiceField(
        choices=["WARNING", "CRITICAL"],
        help_text="Violation severity level",
    )


class SupervisorAlertSerializer(serializers.Serializer):
    """Serializer for supervisor critical violation alerts."""

    admission_id = serializers.IntegerField(help_text="Admission ID")
    admission_number = serializers.CharField(help_text="Admission number")
    patient_id = serializers.IntegerField(help_text="Patient ID")
    patient_name = serializers.CharField(help_text="Patient full name")
    patient_mrn = serializers.CharField(help_text="Patient MRN")
    ward_id = serializers.IntegerField(help_text="Ward ID")
    ward_name = serializers.CharField(help_text="Ward name")
    bed_number = serializers.CharField(help_text="Bed number")
    admitted_by = serializers.CharField(help_text="Name of admitting officer")
    critical_violations = ConstraintViolationSerializer(
        many=True, help_text="List of CRITICAL constraint violations"
    )
    override_reason = serializers.CharField(
        allow_null=True, help_text="Reason provided for override"
    )
    timestamp = serializers.DateTimeField(help_text="Admission timestamp")


class SupervisorAlertsResponseSerializer(serializers.Serializer):
    """Response serializer for supervisor alerts list endpoint."""

    alerts = SupervisorAlertSerializer(many=True, help_text="List of critical alerts")


# =============================================================================
# Ward Updates Serializers (for polling fallback)
# =============================================================================


class WardUpdateEventSerializer(serializers.Serializer):
    """Serializer for ward update events."""

    type = serializers.ChoiceField(
        choices=[
            "ward_constraints_updated",
            "compatibility_violation",
            "bed_availability_changed",
        ],
        help_text="Type of ward update event",
    )
    admission_id = serializers.IntegerField(
        required=False, allow_null=True, help_text="Related admission ID (if applicable)"
    )
    patient_name = serializers.CharField(
        required=False, allow_null=True, help_text="Patient name (if applicable)"
    )
    violations = serializers.ListField(
        child=serializers.CharField(),
        required=False,
        help_text="List of violation messages (if applicable)",
    )
    timestamp = serializers.DateTimeField(help_text="Event timestamp")


class WardCurrentStateSerializer(serializers.Serializer):
    """Serializer for current ward constraint state."""

    ward_id = serializers.IntegerField(help_text="Ward ID")
    ward_name = serializers.CharField(help_text="Ward name")
    gender_restriction = serializers.CharField(
        allow_null=True, help_text="Gender restriction (ANY, MALE_ONLY, FEMALE_ONLY)"
    )
    min_age_years = serializers.IntegerField(
        allow_null=True, help_text="Minimum patient age in years"
    )
    max_age_years = serializers.IntegerField(
        allow_null=True, help_text="Maximum patient age in years"
    )
    isolation_capable = serializers.BooleanField(help_text="Ward has isolation capability")
    oxygen_equipped = serializers.BooleanField(help_text="Ward has oxygen equipment")
    ventilator_capable = serializers.BooleanField(help_text="Ward has ventilator capability")
    maternity_designated = serializers.BooleanField(
        help_text="Ward is designated for maternity patients"
    )
    available_beds = serializers.IntegerField(help_text="Number of available beds")


class WardUpdatesResponseSerializer(serializers.Serializer):
    """Response serializer for ward updates polling endpoint."""

    events = WardUpdateEventSerializer(many=True, help_text="List of ward update events")
    current_state = WardCurrentStateSerializer(help_text="Current ward constraint state")


# =============================================================================
# Alert Acknowledgment Serializers
# =============================================================================


class SupervisorAlertAcknowledgmentSerializer(serializers.ModelSerializer):
    """Serializer for SupervisorAlertAcknowledgment model."""

    acknowledged_by_username = serializers.CharField(
        source="acknowledged_by.username", read_only=True
    )
    admission_number = serializers.CharField(source="admission.admission_number", read_only=True)

    class Meta:
        model = SupervisorAlertAcknowledgment
        fields = [
            "id",
            "admission",
            "admission_number",
            "acknowledged_by",
            "acknowledged_by_username",
            "acknowledged_at",
            "notes",
            "created_at",
        ]
        read_only_fields = ["id", "acknowledged_at", "created_at"]


class AcknowledgeAlertRequestSerializer(serializers.Serializer):
    """Request serializer for acknowledging a supervisor alert."""

    admission_id = serializers.IntegerField(help_text="Admission ID to acknowledge")
    notes = serializers.CharField(
        required=False,
        allow_blank=True,
        default="",
        help_text="Optional notes from the supervisor",
    )


# =============================================================================
# Constraint Override Metrics Serializers
# =============================================================================


class ViolationTypeBreakdownSerializer(serializers.Serializer):
    """Breakdown of violations by type."""

    code = serializers.CharField(help_text="Violation code (e.g., 'GENDER_MISMATCH')")
    count = serializers.IntegerField(help_text="Count of this violation type")


class WardOverrideStatsSerializer(serializers.Serializer):
    """Override statistics for a single ward."""

    ward_id = serializers.IntegerField(help_text="Ward ID")
    ward_name = serializers.CharField(help_text="Ward name")
    override_count = serializers.IntegerField(help_text="Number of overrides")


class ConstraintOverrideMetricsSerializer(serializers.Serializer):
    """Response serializer for constraint override metrics."""

    # Overview stats
    total_admissions = serializers.IntegerField(help_text="Total admissions in period")
    override_count = serializers.IntegerField(help_text="Admissions with constraint overrides")
    override_rate = serializers.FloatField(help_text="Percentage of admissions with overrides")
    critical_override_count = serializers.IntegerField(
        help_text="Admissions with CRITICAL violations overridden"
    )
    acknowledged_count = serializers.IntegerField(
        help_text="CRITICAL overrides acknowledged by supervisors"
    )
    pending_acknowledgment_count = serializers.IntegerField(
        help_text="CRITICAL overrides pending acknowledgment"
    )

    # Breakdowns
    violation_breakdown = ViolationTypeBreakdownSerializer(
        many=True, help_text="Violations by type"
    )
    ward_breakdown = WardOverrideStatsSerializer(many=True, help_text="Overrides by ward")

    # Common override reasons
    common_reasons = serializers.ListField(
        child=serializers.DictField(),
        help_text="Most common override reasons with counts",
    )


class CriticalCareTransferMatrixRowSerializer(serializers.Serializer):
    """Aggregated transfer counts by ward-type transition."""

    from_ward_type = serializers.CharField(help_text="Source ward type")
    to_ward_type = serializers.CharField(help_text="Destination ward type")
    count = serializers.IntegerField(help_text="Number of transfers in this transition")


class CriticalCareWardLoadSerializer(serializers.Serializer):
    """Current active load for a ward relevant to critical-care flow."""

    ward_id = serializers.IntegerField(help_text="Ward ID")
    ward_name = serializers.CharField(help_text="Ward name")
    ward_type = serializers.CharField(help_text="Ward type")
    active_admissions = serializers.IntegerField(help_text="Currently active admissions in ward")
    occupancy_rate = serializers.FloatField(help_text="Current occupancy rate percentage")


class CriticalCareWorkflowHealthSerializer(serializers.Serializer):
    """Response serializer for ICU/HDU/NBU workflow health metrics."""

    period_days = serializers.IntegerField(help_text="Reporting window in days")
    generated_at = serializers.DateTimeField(help_text="Generation timestamp")
    totals = serializers.DictField(help_text="Top-level critical-care workflow counters")
    transfer_matrix = CriticalCareTransferMatrixRowSerializer(
        many=True,
        help_text="Transfer counts grouped by source and destination ward type",
    )
    ward_load = CriticalCareWardLoadSerializer(
        many=True,
        help_text="Current load snapshot for ICU/HDU/NBU wards",
    )


# =============================================================================
# Observation Chart Serializers
# =============================================================================
