# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
# ruff: noqa: F401, SIM105
"""Inpatient serializers ward admission for Vitora HMIS.

What this file is for:
- Implement serializers ward admission logic for the inpatient domain.

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
    BedAssignmentRequest,
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
            "maternity_designated",
            "emergency_buffer_percent",
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


class BedTurnoverActionSerializer(serializers.Serializer):
    """Serializer for housekeeping turnover actions."""

    notes = serializers.CharField(
        required=False,
        allow_blank=True,
        default="",
        help_text="Optional housekeeping or turnover notes",
    )


class BedAssignmentRequestSerializer(serializers.ModelSerializer):
    """Serializer for facility-scoped bed assignment requests."""

    patient_name = serializers.CharField(source="patient.full_name", read_only=True)
    patient_mrn = serializers.CharField(source="patient.mrn", read_only=True)
    requested_ward_name = serializers.CharField(source="requested_ward.name", read_only=True)
    assigned_bed_number = serializers.CharField(source="assigned_bed.bed_number", read_only=True)
    requested_by_username = serializers.CharField(source="requested_by.username", read_only=True)
    assigned_by_username = serializers.CharField(source="assigned_by.username", read_only=True)
    status_display = serializers.CharField(source="get_status_display", read_only=True)
    priority_display = serializers.CharField(source="get_priority_display", read_only=True)

    class Meta:
        model = BedAssignmentRequest
        fields = [
            "id",
            "patient",
            "patient_name",
            "patient_mrn",
            "recommendation",
            "requested_ward",
            "requested_ward_name",
            "priority",
            "priority_display",
            "reason",
            "requested_by",
            "requested_by_username",
            "status",
            "status_display",
            "assigned_bed",
            "assigned_bed_number",
            "assigned_by",
            "assigned_by_username",
            "assigned_at",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "requested_by",
            "status",
            "assigned_bed",
            "assigned_by",
            "assigned_at",
            "created_at",
            "updated_at",
        ]

    def validate(self, attrs):
        """Ensure supplied records belong to the active facility context."""
        attrs = super().validate(attrs)
        request = self.context.get("request")
        facility = getattr(request, "facility", None)
        if facility is None:
            return attrs

        patient = attrs.get("patient") or getattr(self.instance, "patient", None)
        ward = attrs.get("requested_ward") or getattr(self.instance, "requested_ward", None)
        recommendation = attrs.get("recommendation") or getattr(
            self.instance, "recommendation", None
        )
        errors = {}
        if patient and patient.organization_id != facility.organization_id:
            errors["patient"] = "Patient must belong to the active facility organization."
        if ward and ward.facility_id != facility.id:
            errors["requested_ward"] = "Requested ward must belong to the active facility."
        if recommendation and recommendation.encounter.facility_id != facility.id:
            errors["recommendation"] = "Recommendation must belong to the active facility."
        if errors:
            raise serializers.ValidationError(errors)
        return attrs


class BedAssignmentRequestAssignSerializer(serializers.Serializer):
    """Input for reserving a bed for an existing assignment request."""

    bed = serializers.PrimaryKeyRelatedField(queryset=Bed.objects.all())


class AdmissionRecommendationSerializer(serializers.ModelSerializer):
    """Serializer for AdmissionRecommendation model."""

    recommended_by_username = serializers.CharField(
        source="recommended_by.username", read_only=True
    )
    resolved_by_username = serializers.CharField(
        source="resolved_by.username", read_only=True, allow_null=True
    )
    patient_id = serializers.IntegerField(source="encounter.patient_id", read_only=True)
    patient_name = serializers.CharField(source="encounter.patient.full_name", read_only=True)
    patient_mrn = serializers.CharField(source="encounter.patient.mrn", read_only=True)
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
    patient_age = serializers.SerializerMethodField()
    patient_gender = serializers.SerializerMethodField()
    source_encounter = serializers.IntegerField(
        source="opd_encounter_id",
        read_only=True,
        help_text="Alias for opd_encounter used by some frontend admission flows.",
    )
    clinical_context = serializers.SerializerMethodField(
        help_text="AI-ready clinical context: comorbidities, medications, allergies, recent lab results.",
    )
    mch_registration_number = serializers.CharField(
        source="mch_registration.mch_number", read_only=True
    )
    admitting_officer_username = serializers.CharField(
        source="admitting_officer.username", read_only=True
    )
    attending_doctor_username = serializers.CharField(
        source="attending_doctor.username", read_only=True
    )
    ward_name = serializers.CharField(source="ward.name", read_only=True)
    ward_type = serializers.CharField(source="ward.ward_type", read_only=True)
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
            "public_id",
            "admission_number",
            "patient",
            "patient_name",
            "patient_age",
            "patient_gender",
            "source_encounter",
            "clinical_context",
            "opd_encounter",
            "mch_registration",
            "mch_registration_number",
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
            "ward_type",
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
            "expected_discharge_date",
            "length_of_stay",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "public_id",
            "admission_number",
            "ipd_encounter",
            "admission_status",
            "constraint_override",
            "constraint_violations",
            "created_at",
            "updated_at",
        ]

    def to_internal_value(self, data):
        source_encounter = data.get("source_encounter") if hasattr(data, "get") else None
        opd_encounter = data.get("opd_encounter") if hasattr(data, "get") else None

        has_source = source_encounter not in (None, "", "null")
        has_opd = opd_encounter not in (None, "", "null")

        if has_source and has_opd and str(source_encounter) != str(opd_encounter):
            raise serializers.ValidationError(
                {
                    "source_encounter": (
                        "source_encounter must match opd_encounter when both are provided."
                    )
                }
            )

        if has_source and not has_opd:
            data = data.copy() if hasattr(data, "copy") else dict(data)
            data["opd_encounter"] = source_encounter

        return super().to_internal_value(data)

    def validate(self, attrs):
        patient = attrs.get("patient") or getattr(self.instance, "patient", None)
        ward = attrs.get("ward") or getattr(self.instance, "ward", None)
        mch_registration = (
            attrs.get("mch_registration")
            if "mch_registration" in attrs
            else getattr(self.instance, "mch_registration", None)
        )

        if ward and ward.ward_type == "MATERNITY" and mch_registration is None:
            raise serializers.ValidationError(
                {"mch_registration": "Maternity admissions require an MCH registration."}
            )

        if patient and mch_registration and mch_registration.mother_id != patient.id:
            raise serializers.ValidationError(
                {"mch_registration": "MCH registration mother must match the admission patient."}
            )

        return attrs

    def get_patient_name(self, obj) -> str:
        """Get patient full name."""
        return f"{obj.patient.first_name} {obj.patient.last_name}"

    def get_patient_age(self, obj) -> int | None:
        """Get patient age in years from date of birth."""
        dob = getattr(obj.patient, "date_of_birth", None)
        if not dob:
            return None
        from datetime import date

        today = date.today()
        return today.year - dob.year - ((today.month, today.day) < (dob.month, dob.day))

    def get_patient_gender(self, obj) -> str | None:
        """Get patient gender (M, F, O)."""
        return getattr(obj.patient, "gender", None)

    def get_clinical_context(self, obj) -> dict:
        """Return AI-ready clinical context derived from linked encounter, allergies, and labs.

        Only populated on retrieve (detail) — returns ``None`` on list to avoid N+1 queries.
        """
        # Skip on list actions to avoid N+1 (list view seldom needs this)
        view = self.context.get("view")
        if view and getattr(view, "action", None) == "list":
            return None  # type: ignore[return-value]

        result: dict = {
            "comorbidities": [],
            "current_medications": [],
            "allergies_structured": [],
            "lab_results_summary": [],
        }

        # --- From IPD encounter ---
        encounter = getattr(obj, "ipd_encounter", None)
        if encounter:
            if encounter.chronic_conditions:
                result["comorbidities"] = [
                    c.strip()
                    for c in encounter.chronic_conditions.replace("\n", ",").split(",")
                    if c.strip()
                ]
            if encounter.current_medications:
                result["current_medications"] = [
                    m.strip()
                    for m in encounter.current_medications.replace("\n", ",").split(",")
                    if m.strip()
                ]

        # --- Structured allergies from Patient ---
        try:
            allergies_qs = obj.patient.patient_allergies.filter(status="active")
            result["allergies_structured"] = [a.substance for a in allergies_qs]
        except (
            AttributeError,
            TypeError,
            ValueError,
            RuntimeError,
            OSError,
            AssertionError,
            ImportError,
        ):
            pass

        # --- Recent verified lab results for this admission ---
        try:
            from hmis.apps.laboratory.models import LabResult

            lab_results = (
                LabResult.objects.filter(
                    order_item__lab_order__admission=obj,
                    verification_status="VERIFIED",
                    numeric_value__isnull=False,
                )
                .select_related("order_item__test")
                .order_by("-entered_at")[:20]
            )
            result["lab_results_summary"] = [
                {
                    "test_name": lr.order_item.test.name,
                    "value": float(lr.numeric_value),
                    "unit": lr.result_unit,
                }
                for lr in lab_results
            ]
        except (
            AttributeError,
            TypeError,
            ValueError,
            RuntimeError,
            OSError,
            AssertionError,
            ImportError,
        ):
            pass

        return result

    def create(self, validated_data):
        """Create an admission and auto-create the linked IPD encounter."""
        patient = validated_data["patient"]
        opd_encounter = validated_data.get("opd_encounter")
        organization = validated_data.get("organization")
        facility = validated_data.get("facility")

        # Auto-create IPD encounter (Track D requirement)
        ipd_encounter_kwargs: dict = {
            "patient": patient,
            "encounter_type": "IPD",
            "chief_complaint": "Admitted for inpatient care",
        }
        if organization:
            ipd_encounter_kwargs["organization"] = organization
        if facility:
            ipd_encounter_kwargs["facility"] = facility
        ipd_encounter = Encounter.objects.create(**ipd_encounter_kwargs)
        validated_data["ipd_encounter"] = ipd_encounter

        admission = super().create(validated_data)

        # If admission is created from a recommendation, mark it accepted if still pending.
        recommendation = admission.recommendation
        if recommendation and recommendation.status == "PENDING":
            try:
                recommendation.accept(admission.admitting_officer)
            except ValueError:
                pass

        self._sync_ipd_encounter_diagnoses(admission, source_encounter=opd_encounter)

        return admission

    def _sync_ipd_encounter_diagnoses(
        self, admission: Admission, source_encounter: Encounter | None
    ):
        """Carry forward diagnoses into the newly created IPD encounter."""
        from hmis.apps.encounters.models import Diagnosis, ICD10Code

        ipd_encounter = admission.ipd_encounter

        # 1) Carry forward all diagnoses from the source OPD encounter, if available.
        if source_encounter is not None:
            for source in source_encounter.diagnoses.all():
                Diagnosis.objects.create(
                    encounter=ipd_encounter,
                    icd10_code=source.icd10_code,
                    icd11_code=source.icd11_code,
                    icd11_display=source.icd11_display,
                    snomed_code=source.snomed_code,
                    snomed_display=source.snomed_display,
                    diagnosis_type=source.diagnosis_type,
                    free_text_diagnosis=source.free_text_diagnosis,
                    notes=source.notes,
                    is_confirmed=source.is_confirmed,
                    certainty=source.certainty,
                    diagnosed_by=source.diagnosed_by,
                )

        # 2) Ensure admission diagnosis is reflected as IPD PRIMARY diagnosis.
        # If a primary exists (copied from OPD), update it. Otherwise create one.
        admission_code = (admission.admitting_diagnosis or "").strip()
        admission_text = (admission.admitting_diagnosis_text or "").strip()
        if not admission_code and not admission_text:
            return

        icd10_obj = None
        if admission_code:
            icd10_obj = ICD10Code.objects.filter(code=admission_code, is_active=True).first()

        primary = Diagnosis.objects.filter(
            encounter=ipd_encounter, diagnosis_type="PRIMARY"
        ).first()
        free_text = "" if icd10_obj else (admission_text or admission_code)

        if primary is not None:
            primary.icd10_code = icd10_obj
            primary.free_text_diagnosis = free_text
            primary.is_confirmed = True
            primary.certainty = "confirmed"
            primary.diagnosed_by = admission.attending_doctor or admission.admitting_officer
            primary.notes = admission_text if admission_text else primary.notes
            primary.save()
            return

        Diagnosis.objects.create(
            encounter=ipd_encounter,
            icd10_code=icd10_obj,
            diagnosis_type="PRIMARY",
            free_text_diagnosis=free_text,
            notes=admission_text,
            is_confirmed=True,
            certainty="confirmed",
            diagnosed_by=admission.attending_doctor or admission.admitting_officer,
        )


class AdmissionICUReadinessSerializer(serializers.Serializer):
    """Normalized ICU predictor readiness payload for an admission."""

    admission_id = serializers.IntegerField()
    can_run_predict = serializers.BooleanField()
    missing_required = serializers.ListField(child=serializers.CharField())
    missing_advisory = serializers.ListField(child=serializers.CharField())
    vitals = serializers.DictField(child=serializers.FloatField(allow_null=True), required=False)
    labs = serializers.DictField(child=serializers.FloatField(allow_null=True), required=False)
    gcs = serializers.IntegerField(allow_null=True, required=False)
    on_vasopressors = serializers.BooleanField(allow_null=True, required=False)
    vasopressor_dose_mcg_kg_min = serializers.FloatField(allow_null=True, required=False)
    on_mechanical_ventilation = serializers.BooleanField(allow_null=True, required=False)
    urine_output_ml_day = serializers.IntegerField(allow_null=True, required=False)
    field_sources = serializers.DictField(child=serializers.CharField(), required=False)
