"""
Serializers for the inpatient app.
"""

from rest_framework import serializers

from hmis.apps.encounters.models import Encounter

from .models import (
    Admission,
    AdmissionRecommendation,
    Bed,
    Discharge,
    KardexHandoverNote,
    KardexShiftNote,
    NursingKardex,
    ShiftHandover,
    SupervisorAlertAcknowledgment,
    Transfer,
    Ward,
    WardRound,
)


class InpatientWardSerializer(serializers.ModelSerializer):
    """Serializer for Ward model (inpatient-specific with occupancy stats)."""

    available_beds = serializers.ReadOnlyField()
    total_beds = serializers.ReadOnlyField()
    occupied_beds = serializers.ReadOnlyField()
    occupancy_rate = serializers.ReadOnlyField()
    ward_type_display = serializers.CharField(source="get_ward_type_display", read_only=True)

    class Meta:
        model = Ward
        fields = [
            "id",
            "name",
            "code",
            "ward_type",
            "ward_type_display",
            "floor",
            "capacity",
            "description",
            "is_active",
            "daily_rate",
            "gender_restriction",
            "min_age_years",
            "max_age_years",
            "isolation_capable",
            "oxygen_equipped",
            "ventilator_capable",
            "available_beds",
            "total_beds",
            "occupied_beds",
            "occupancy_rate",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]


class BedSerializer(serializers.ModelSerializer):
    """Serializer for Bed model."""

    ward_name = serializers.CharField(source="ward.name", read_only=True)
    status_display = serializers.CharField(source="get_status_display", read_only=True)
    status_changed_by_username = serializers.CharField(
        source="status_changed_by.username", read_only=True, allow_null=True
    )

    class Meta:
        model = Bed
        fields = [
            "id",
            "ward",
            "ward_name",
            "bed_number",
            "status",
            "status_display",
            "notes",
            "status_changed_by",
            "status_changed_by_username",
            "status_changed_at",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "status_changed_at", "created_at", "updated_at"]


class AdmissionRecommendationSerializer(serializers.ModelSerializer):
    """Serializer for AdmissionRecommendation model."""

    recommended_by_username = serializers.CharField(
        source="recommended_by.username", read_only=True
    )
    resolved_by_username = serializers.CharField(
        source="resolved_by.username", read_only=True, allow_null=True
    )
    patient_id = serializers.IntegerField(source="encounter.patient_id", read_only=True)
    patient_name = serializers.CharField(
        source="encounter.patient.full_name", read_only=True
    )
    patient_mrn = serializers.CharField(
        source="encounter.patient.mrn", read_only=True
    )
    status_display = serializers.CharField(source="get_status_display", read_only=True)
    urgency_display = serializers.CharField(source="get_urgency_display", read_only=True)
    is_expired = serializers.SerializerMethodField()

    class Meta:
        model = AdmissionRecommendation
        fields = [
            "id",
            "encounter",
            "recommended_by",
            "recommended_by_username",
            "patient_id",
            "patient_name",
            "patient_mrn",
            "reason",
            "provisional_diagnosis",
            "provisional_diagnosis_text",
            "urgency",
            "urgency_display",
            "preferred_ward_type",
            "status",
            "status_display",
            "expires_at",
            "resolved_at",
            "resolved_by",
            "resolved_by_username",
            "decline_reason",
            "is_expired",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "status",
            "resolved_at",
            "resolved_by",
            "created_at",
            "updated_at",
        ]

    def get_is_expired(self, obj) -> bool:
        return obj.is_expired()


class AdmissionSerializer(serializers.ModelSerializer):
    """Serializer for Admission model.

    Supports automatic bed assignment via `auto_assign_bed=true` in request body.
    When auto_assign_bed is true, the `bed` field becomes optional as the system
    will automatically select the first available bed in the ward.
    """

    patient_name = serializers.SerializerMethodField()
    admitting_officer_username = serializers.CharField(
        source="admitting_officer.username", read_only=True
    )
    attending_doctor_username = serializers.CharField(
        source="attending_doctor.username", read_only=True
    )
    ward_name = serializers.CharField(source="ward.name", read_only=True)
    bed_number = serializers.CharField(source="bed.bed_number", read_only=True)
    admission_status_display = serializers.CharField(
        source="get_admission_status_display", read_only=True
    )
    payer_type_display = serializers.CharField(source="get_payer_type_display", read_only=True)
    length_of_stay = serializers.ReadOnlyField()

    # Make bed optional to support auto_assign_bed workflow
    bed = serializers.PrimaryKeyRelatedField(
        queryset=Bed.objects.all(),
        required=False,
        allow_null=True,
        help_text="Bed ID. Optional when auto_assign_bed=true is provided.",
    )

    class Meta:
        model = Admission
        fields = [
            "id",
            "admission_number",
            "patient",
            "patient_name",
            "opd_encounter",
            "ipd_encounter",
            "recommendation",
            "admission_date",
            "admitting_diagnosis",
            "admitting_diagnosis_text",
            "admitting_officer",
            "admitting_officer_username",
            "attending_doctor",
            "attending_doctor_username",
            "ward",
            "ward_name",
            "bed",
            "bed_number",
            "admission_status",
            "admission_status_display",
            "payer_type",
            "payer_type_display",
            "insurance_details",
            "constraint_override",
            "constraint_override_reason",
            "constraint_violations",
            "length_of_stay",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "admission_number",
            "ipd_encounter",
            "admission_status",
            "constraint_override",
            "constraint_violations",
            "created_at",
            "updated_at",
        ]

    def get_patient_name(self, obj) -> str:
        """Get patient full name."""
        return f"{obj.patient.first_name} {obj.patient.last_name}"

    def create(self, validated_data):
        """Create an admission and auto-create the linked IPD encounter."""
        patient = validated_data["patient"]
        # opd_encounter is stored for reference but auto-creating IPD encounter
        validated_data.get("opd_encounter")

        # Auto-create IPD encounter (Track D requirement)
        ipd_encounter = Encounter.objects.create(
            patient=patient,
            encounter_type="IPD",
            chief_complaint="Admitted for inpatient care",
        )
        validated_data["ipd_encounter"] = ipd_encounter

        admission = super().create(validated_data)

        # If admission is created from a recommendation, mark it accepted if still pending.
        recommendation = admission.recommendation
        if recommendation and recommendation.status == "PENDING":
            try:
                recommendation.accept(admission.admitting_officer)
            except ValueError:
                pass

        return admission


class DischargeSerializer(serializers.ModelSerializer):
    """Serializer for Discharge model."""

    admission_number = serializers.CharField(source="admission.admission_number", read_only=True)
    patient_name = serializers.SerializerMethodField()
    discharged_by_username = serializers.CharField(source="discharged_by.username", read_only=True)
    discharge_type_display = serializers.CharField(
        source="get_discharge_type_display", read_only=True
    )
    length_of_stay = serializers.ReadOnlyField()

    class Meta:
        model = Discharge
        fields = [
            "id",
            "admission",
            "admission_number",
            "patient_name",
            "discharge_type",
            "discharge_type_display",
            "discharge_date",
            "discharged_by",
            "discharged_by_username",
            "admission_diagnosis",
            "final_diagnosis",
            "final_diagnosis_text",
            "procedures_performed",
            "treatment_summary",
            "discharge_medications",
            "follow_up_date",
            "follow_up_instructions",
            "referral_facility",
            "referral_reason",
            "patient_instructions",
            "pharmacy_cleared",
            "billing_cleared",
            "lab_results_acknowledged",
            "length_of_stay",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]

    def get_patient_name(self, obj) -> str:
        """Get patient full name."""
        patient = obj.admission.patient
        return f"{patient.first_name} {patient.last_name}"


class TransferSerializer(serializers.ModelSerializer):
    """Serializer for Transfer model."""

    admission_number = serializers.CharField(source="admission.admission_number", read_only=True)
    patient_name = serializers.SerializerMethodField()
    source_ward_name = serializers.CharField(source="source_ward.name", read_only=True)
    source_bed_number = serializers.CharField(source="source_bed.bed_number", read_only=True)
    destination_ward_name = serializers.CharField(source="destination_ward.name", read_only=True)
    destination_bed_number = serializers.CharField(
        source="destination_bed.bed_number", read_only=True
    )
    transferred_by_username = serializers.CharField(
        source="transferred_by.username", read_only=True
    )
    reason_display = serializers.CharField(source="get_reason_display", read_only=True)

    class Meta:
        model = Transfer
        fields = [
            "id",
            "admission",
            "admission_number",
            "patient_name",
            "source_ward",
            "source_ward_name",
            "source_bed",
            "source_bed_number",
            "destination_ward",
            "destination_ward_name",
            "destination_bed",
            "destination_bed_number",
            "reason",
            "reason_display",
            "reason_details",
            "transferred_by",
            "transferred_by_username",
            "transfer_date",
            "clinical_handover_notes",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]

    def get_patient_name(self, obj) -> str:
        """Get patient full name."""
        patient = obj.admission.patient
        return f"{patient.first_name} {patient.last_name}"


class WardRoundSerializer(serializers.ModelSerializer):
    """Serializer for WardRound model."""

    admission_number = serializers.CharField(source="admission.admission_number", read_only=True)
    patient_name = serializers.SerializerMethodField()
    conducted_by_username = serializers.CharField(source="conducted_by.username", read_only=True)
    condition_status_display = serializers.CharField(
        source="get_condition_status_display", read_only=True
    )

    class Meta:
        model = WardRound
        fields = [
            "id",
            "admission",
            "admission_number",
            "patient_name",
            "round_date",
            "round_time",
            "conducted_by",
            "conducted_by_username",
            "subjective",
            "objective",
            "assessment",
            "plan",
            "condition_status",
            "condition_status_display",
            "requires_consultant_review",
            "consultant_specialty",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]

    def get_patient_name(self, obj) -> str:
        """Get patient full name."""
        patient = obj.admission.patient
        return f"{patient.first_name} {patient.last_name}"


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


class NursingKardexSerializer(serializers.ModelSerializer):
    """Serializer for NursingKardex model."""

    admission_number = serializers.CharField(source="admission.admission_number", read_only=True)
    patient_name = serializers.SerializerMethodField()
    ward_name = serializers.CharField(source="admission.ward.name", read_only=True)
    bed_number = serializers.CharField(source="admission.bed.bed_number", read_only=True)
    shift_notes = KardexShiftNoteSerializer(many=True, read_only=True)
    handover_notes = KardexHandoverNoteSerializer(many=True, read_only=True)
    fall_risk_display = serializers.CharField(source="get_fall_risk_display", read_only=True)
    pressure_sore_risk_display = serializers.CharField(
        source="get_pressure_sore_risk_display", read_only=True
    )

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
            # Nursing care plan
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
            # Related notes
            "shift_notes",
            "handover_notes",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "admission", "created_at", "updated_at"]

    def get_patient_name(self, obj) -> str:
        """Get patient full name."""
        patient = obj.admission.patient
        return f"{patient.first_name} {patient.last_name}"


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
