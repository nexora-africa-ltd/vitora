# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
# ruff: noqa
"""Inpatient serializers atr templates for Vitora HMIS.

What this file is for:
- Implement serializers atr templates logic for the inpatient domain.

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


def _validate_reaction_choices(values, choices_enum, field_name):
    """Validate that all values in a list are valid choices for the given enum."""
    if not isinstance(values, list):
        raise serializers.ValidationError({field_name: "Must be a list."})
    valid_values = {c.value for c in choices_enum}
    invalid = [v for v in values if v not in valid_values]
    if invalid:
        raise serializers.ValidationError(
            {field_name: f"Invalid values: {invalid}. Valid: {list(valid_values)}"}
        )
    return values


class ATRCreateSerializer(serializers.ModelSerializer):
    """Serializer for creating an Adverse Transfusion Reaction report."""

    # PII property fields (encrypted at rest)
    initial_reporter_mobile = serializers.CharField(required=False, allow_blank=True, default="")
    initial_reporter_email = serializers.CharField(required=False, allow_blank=True, default="")

    class Meta:
        model = AdverseTransfusionReaction
        fields = [
            "transfusion",
            # Patient history
            "pre_transfusion_hb",
            "obstetric_status",
            "gravida",
            "para",
            "previous_transfusion",
            "previous_transfusion_comment",
            "previous_reactions",
            "previous_reactions_comment",
            "current_medications",
            # Reaction categories
            "general_reactions",
            "dermatological_reactions",
            "cardiac_respiratory_reactions",
            "renal_reactions",
            "haematological_reactions",
            "other_reactions",
            "volume_transfused_ml",
            # Reporter fields
            "initial_reporter_cadre",
            "initial_reporter_mobile",
            "initial_reporter_email",
        ]

    def validate_transfusion(self, value):
        """Ensure the transfusion has reaction_occurred=True."""
        if not value.reaction_occurred:
            raise serializers.ValidationError(
                "ATR can only be created for transfusions where a reaction occurred."
            )
        if hasattr(value, "adverse_reaction_report"):
            raise serializers.ValidationError("An ATR report already exists for this transfusion.")
        return value

    def validate_general_reactions(self, value):
        return _validate_reaction_choices(value, GeneralReaction, "general_reactions")

    def validate_dermatological_reactions(self, value):
        return _validate_reaction_choices(value, DermatologicalReaction, "dermatological_reactions")

    def validate_cardiac_respiratory_reactions(self, value):
        return _validate_reaction_choices(
            value, CardiacRespiratoryReaction, "cardiac_respiratory_reactions"
        )

    def validate_renal_reactions(self, value):
        return _validate_reaction_choices(value, RenalReaction, "renal_reactions")

    def validate_haematological_reactions(self, value):
        return _validate_reaction_choices(value, HaematologicalReaction, "haematological_reactions")

    def validate(self, attrs):
        """Ensure at least one reaction category is non-empty."""
        reaction_fields = [
            "general_reactions",
            "dermatological_reactions",
            "cardiac_respiratory_reactions",
            "renal_reactions",
            "haematological_reactions",
        ]
        has_any = any(bool(attrs.get(f, [])) for f in reaction_fields)
        if not has_any and not attrs.get("other_reactions"):
            raise serializers.ValidationError("At least one reaction category must be selected.")
        return attrs


class ATRDetailSerializer(serializers.ModelSerializer):
    """Full detail serializer for Adverse Transfusion Reaction reports."""

    # PII property fields (encrypted at rest)
    initial_reporter_mobile = serializers.CharField(read_only=True, default="")
    initial_reporter_email = serializers.CharField(read_only=True, default="")
    ppb_submitter_mobile = serializers.CharField(read_only=True, default="")
    ppb_submitter_email = serializers.CharField(read_only=True, default="")

    has_lab_investigation = serializers.BooleanField(read_only=True)
    reaction_categories_display = serializers.ListField(
        child=serializers.CharField(), read_only=True
    )
    status_display = serializers.CharField(source="get_status_display", read_only=True)
    initial_reporter_username = serializers.CharField(
        source="initial_reporter.username", read_only=True, default=None
    )
    patient_name = serializers.CharField(
        source="transfusion.admission.patient.full_name", read_only=True
    )
    patient_mrn = serializers.CharField(source="transfusion.admission.patient.mrn", read_only=True)
    patient_gender = serializers.CharField(
        source="transfusion.admission.patient.get_gender_display", read_only=True
    )
    patient_date_of_birth = serializers.DateField(
        source="transfusion.admission.patient.date_of_birth", read_only=True
    )
    ward_name = serializers.SerializerMethodField(read_only=True)
    transfusion_diagnosis = serializers.CharField(
        source="transfusion.diagnosis", read_only=True, default=""
    )
    started_by_name = serializers.SerializerMethodField(read_only=True)
    admission_id = serializers.IntegerField(source="transfusion.admission_id", read_only=True)
    blood_product_display = serializers.CharField(
        source="transfusion.get_blood_product_display", read_only=True
    )
    blood_unit_number = serializers.CharField(
        source="transfusion.blood_unit_number", read_only=True
    )
    blood_product = serializers.CharField(source="transfusion.blood_product", read_only=True)
    amount_ml = serializers.IntegerField(source="transfusion.amount_ml", read_only=True)
    transfusion_expiry_date = serializers.DateField(
        source="transfusion.expiry_date", read_only=True
    )
    lab_order_id = serializers.IntegerField(source="lab_order.id", read_only=True, default=None)
    lab_order_number = serializers.CharField(
        source="lab_order.order_number", read_only=True, default=None
    )
    lab_order_status = serializers.CharField(
        source="lab_order.status", read_only=True, default=None
    )

    def get_ward_name(self, obj):
        admission = obj.transfusion.admission
        if hasattr(admission, "ward") and admission.ward:
            return admission.ward.name
        return ""

    def get_started_by_name(self, obj):
        user = obj.transfusion.started_by
        if user:
            full = user.get_full_name()
            return full if full else user.username
        return ""

    class Meta:
        model = AdverseTransfusionReaction
        fields = [
            "id",
            "transfusion",
            # Nested transfusion context
            "patient_name",
            "patient_mrn",
            "patient_gender",
            "patient_date_of_birth",
            "ward_name",
            "transfusion_diagnosis",
            "started_by_name",
            "admission_id",
            "blood_product",
            "blood_product_display",
            "blood_unit_number",
            "amount_ml",
            "volume_transfused_ml",
            "transfusion_expiry_date",
            # Patient history
            "pre_transfusion_hb",
            "obstetric_status",
            "gravida",
            "para",
            "previous_transfusion",
            "previous_transfusion_comment",
            "previous_reactions",
            "previous_reactions_comment",
            "current_medications",
            # Reaction categories
            "general_reactions",
            "dermatological_reactions",
            "cardiac_respiratory_reactions",
            "renal_reactions",
            "haematological_reactions",
            "other_reactions",
            "reaction_categories_display",
            # Vital signs snapshot
            "vitals_at_start_bp",
            "vitals_at_start_temp",
            "vitals_at_start_pulse",
            "vitals_at_start_rr",
            "vitals_during_bp",
            "vitals_during_temp",
            "vitals_during_pulse",
            "vitals_during_rr",
            "vitals_at_stop_bp",
            "vitals_at_stop_temp",
            "vitals_at_stop_pulse",
            "vitals_at_stop_rr",
            # Lab investigation
            "recipient_supernatant_hemolysis",
            "recipient_hemolysis_severity",
            "recipient_agglutination",
            "haematological_results",
            "blood_film_rbc",
            "blood_film_wbc",
            "blood_film_plt",
            "donor_supernatant_hemolysis",
            "donor_pack_age",
            "culture_donor_pack_results",
            "culture_recipient_blood_results",
            "compatibility_saline_rt",
            "compatibility_saline_37",
            "compatibility_ahg",
            "compatibility_albumin_37",
            "enzyme_treated_cells_result",
            "anti_a_titres",
            "anti_b_titres",
            "urinalysis",
            "evaluation_diagnosis",
            "reaction_related_to_transfusion",
            "has_lab_investigation",
            # Lab order link
            "lab_order_id",
            "lab_order_number",
            "lab_order_status",
            # Reporter details
            "initial_reporter",
            "initial_reporter_username",
            "initial_reporter_cadre",
            "initial_reporter_mobile",
            "initial_reporter_email",
            "report_date",
            "ppb_submitter_name",
            "ppb_submitter_cadre",
            "ppb_submitter_mobile",
            "ppb_submitter_email",
            "submission_date",
            # PPB tracking
            "status",
            "status_display",
            "adr_report_number",
            "vigiflow_entry_number",
            "ppb_date_received",
            # Timestamps
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]


class ATRListSerializer(serializers.ModelSerializer):
    """Compact list serializer for Adverse Transfusion Reaction reports."""

    reaction_categories_display = serializers.ListField(
        child=serializers.CharField(), read_only=True
    )
    has_lab_investigation = serializers.BooleanField(read_only=True)
    status_display = serializers.CharField(source="get_status_display", read_only=True)
    patient_name = serializers.CharField(
        source="transfusion.admission.patient.full_name", read_only=True
    )
    blood_product_display = serializers.CharField(
        source="transfusion.get_blood_product_display", read_only=True
    )
    admission_id = serializers.IntegerField(source="transfusion.admission_id", read_only=True)
    lab_order_number = serializers.CharField(
        source="lab_order.order_number", read_only=True, default=None
    )
    lab_order_status = serializers.CharField(
        source="lab_order.status", read_only=True, default=None
    )

    class Meta:
        model = AdverseTransfusionReaction
        fields = [
            "id",
            "transfusion",
            "admission_id",
            "patient_name",
            "blood_product_display",
            "status",
            "status_display",
            "report_date",
            "reaction_categories_display",
            "has_lab_investigation",
            "lab_order_number",
            "lab_order_status",
            "created_at",
        ]


class ATRLabInvestigationSerializer(serializers.ModelSerializer):
    """Serializer for updating lab investigation fields on an ATR report."""

    class Meta:
        model = AdverseTransfusionReaction
        fields = [
            "recipient_supernatant_hemolysis",
            "recipient_hemolysis_severity",
            "recipient_agglutination",
            "haematological_results",
            "blood_film_rbc",
            "blood_film_wbc",
            "blood_film_plt",
            "donor_supernatant_hemolysis",
            "donor_pack_age",
            "culture_donor_pack_results",
            "culture_recipient_blood_results",
            "compatibility_saline_rt",
            "compatibility_saline_37",
            "compatibility_ahg",
            "compatibility_albumin_37",
            "enzyme_treated_cells_result",
            "anti_a_titres",
            "anti_b_titres",
            "urinalysis",
            "evaluation_diagnosis",
            "reaction_related_to_transfusion",
        ]


class ATRSubmitToPPBSerializer(serializers.Serializer):
    """Serializer for submitting an ATR report to PPB."""

    ppb_submitter_name = serializers.CharField(required=False, allow_blank=True)
    ppb_submitter_cadre = serializers.CharField(required=False, allow_blank=True)
    ppb_submitter_mobile = serializers.CharField(required=False, allow_blank=True)
    ppb_submitter_email = serializers.EmailField(required=False, allow_blank=True)


class ATRAcknowledgeSerializer(serializers.Serializer):
    """Serializer for recording PPB acknowledgment."""

    adr_report_number = serializers.CharField(required=True)
    vigiflow_entry_number = serializers.CharField(required=False, allow_blank=True, default="")


# =============================================================================
# DISCHARGE TEMPLATE SERIALIZERS
# =============================================================================


class DischargeTemplateSerializer(serializers.ModelSerializer):
    """Read serializer for DischargeTemplate."""

    layout_display = serializers.CharField(source="get_layout_display", read_only=True)

    class Meta:
        model = DischargeTemplate
        fields = [
            "id",
            "name",
            "layout",
            "layout_display",
            "is_default",
            "is_active",
            "sections",
            "header_title",
            "header_subtitle",
            "show_signature_lines",
            "show_qr_code",
            "facility",
            "organization",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "facility",
            "organization",
            "created_at",
            "updated_at",
        ]


class DischargeTemplateCreateSerializer(serializers.ModelSerializer):
    """Write serializer — facility/organization set by the ViewSet."""

    class Meta:
        model = DischargeTemplate
        fields = [
            "name",
            "layout",
            "is_default",
            "is_active",
            "sections",
            "header_title",
            "header_subtitle",
            "show_signature_lines",
            "show_qr_code",
        ]
