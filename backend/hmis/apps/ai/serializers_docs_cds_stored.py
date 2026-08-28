# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""Ai serializers docs cds stored for Vitora HMIS.

What this file is for:
- Implement serializers docs cds stored logic for the ai domain.

How to use it:
- Import classes and functions from this module in Django app code and tests.

Supported inputs/args:
- Python imports and Django ORM/runtime inputs; no standalone CLI arguments.
"""

from rest_framework import serializers

from hmis.apps.ai.serializers_lab_care import (
    DISCHARGE_TYPE_CHOICES,
    DOCUMENT_TYPE_CHOICES,
    GENERATION_MODE_CHOICES,
    OUTPUT_FORMAT_CHOICES,
)


class ClinicalDocPatientContextSerializer(serializers.Serializer):
    """Patient demographics and clinical context for clinical document generation."""

    patient_age = serializers.IntegerField(
        min_value=0,
        max_value=150,
        help_text="Patient age in years.",
    )
    patient_sex = serializers.CharField(
        help_text='Patient sex: "M", "F", "male", or "female".',
    )
    allergies = serializers.ListField(
        child=serializers.CharField(max_length=200),
        required=False,
        default=list,
    )
    comorbidities = serializers.ListField(
        child=serializers.CharField(max_length=200),
        required=False,
        default=list,
    )
    current_medications = serializers.ListField(
        child=serializers.CharField(max_length=200),
        required=False,
        default=list,
    )
    facility_level = serializers.IntegerField(
        required=False,
        allow_null=True,
        min_value=1,
        max_value=6,
    )


class ClinicalDocAdmissionContextSerializer(serializers.Serializer):
    """Admission / encounter data for clinical document generation."""

    _MEDICATION_KEYS = {"drug_name", "dose", "route", "frequency", "duration"}

    def _validate_medication_list(self, value: list, field_name: str) -> list:
        """Accept each item as either a string or a dict with medication keys."""
        result = []
        for i, item in enumerate(value):
            if isinstance(item, str):
                result.append(item)
            elif isinstance(item, dict):
                unknown = set(item.keys()) - self._MEDICATION_KEYS
                if unknown:
                    raise serializers.ValidationError(
                        {field_name: {str(i): [f"Unknown keys: {unknown}"]}}
                    )
                result.append(item)
            else:
                raise serializers.ValidationError(
                    {field_name: {str(i): ["Must be a string or object."]}}
                )
        return result

    def validate_medications_given(self, value: list) -> list:
        return self._validate_medication_list(value, "medications_given")

    def validate_discharge_medications(self, value: list) -> list:
        return self._validate_medication_list(value, "discharge_medications")

    primary_diagnosis = serializers.CharField(
        min_length=2,
        max_length=500,
        help_text="Primary diagnosis (free text or ICD-10 description).",
    )
    icd10_code = serializers.CharField(
        required=False,
        allow_blank=True,
        max_length=20,
        help_text='ICD-10 code e.g. "A54.0".',
    )
    secondary_diagnoses = serializers.ListField(
        child=serializers.CharField(max_length=300),
        required=False,
        default=list,
    )
    admission_date = serializers.CharField(
        required=False,
        allow_blank=True,
        help_text="Admission date (ISO 8601).",
    )
    discharge_date = serializers.CharField(
        required=False,
        allow_blank=True,
        help_text="Discharge date (ISO 8601).",
    )
    length_of_stay_days = serializers.IntegerField(
        required=False,
        allow_null=True,
        min_value=0,
        max_value=3650,
    )
    ward = serializers.CharField(
        required=False,
        allow_blank=True,
        max_length=200,
    )
    discharge_type = serializers.ChoiceField(
        choices=DISCHARGE_TYPE_CHOICES,
        required=False,
    )
    procedures_performed = serializers.ListField(
        child=serializers.CharField(max_length=300),
        required=False,
        default=list,
    )
    medications_given = serializers.ListField(
        required=False,
        default=list,
        help_text="List of medications: strings or {drug_name, dose, route, frequency, duration} objects.",
    )
    discharge_medications = serializers.ListField(
        required=False,
        default=list,
        help_text="Discharge medications: strings or {drug_name, dose, route, frequency, duration} objects.",
    )
    key_investigations = serializers.ListField(
        child=serializers.CharField(max_length=300),
        required=False,
        default=list,
    )
    complications = serializers.ListField(
        child=serializers.CharField(max_length=300),
        required=False,
        default=list,
    )
    condition_at_discharge = serializers.CharField(
        required=False,
        allow_blank=True,
        max_length=1000,
    )
    follow_up_instructions = serializers.CharField(
        required=False,
        allow_blank=True,
        max_length=2000,
        help_text="Follow-up plan / TCA instructions.",
    )
    clinical_notes = serializers.ListField(
        child=serializers.CharField(max_length=5000),
        required=False,
        default=list,
        help_text="Ward round progress notes / clinical notes in chronological order.",
    )


class ClinicalDocVitalsSerializer(serializers.Serializer):
    """Vitals for encounter context."""

    blood_pressure_systolic = serializers.IntegerField(
        required=False,
        allow_null=True,
    )
    blood_pressure_diastolic = serializers.IntegerField(
        required=False,
        allow_null=True,
    )
    heart_rate = serializers.IntegerField(
        required=False,
        allow_null=True,
    )
    temperature = serializers.FloatField(
        required=False,
        allow_null=True,
    )
    respiratory_rate = serializers.IntegerField(
        required=False,
        allow_null=True,
    )
    spo2 = serializers.FloatField(
        required=False,
        allow_null=True,
    )


class ClinicalDocEncounterContextSerializer(serializers.Serializer):
    """Encounter context for clinical document generation."""

    chief_complaint = serializers.CharField(
        required=False,
        allow_blank=True,
        max_length=2000,
    )
    clinical_notes = serializers.CharField(
        required=False,
        allow_blank=True,
        max_length=10000,
        help_text="Compact clinical summary for source encounter and ward-round progression.",
    )
    vitals = ClinicalDocVitalsSerializer(required=False)
    hpi = serializers.CharField(
        required=False,
        allow_blank=True,
        max_length=5000,
        help_text="History of Present Illness.",
    )
    examination_findings = serializers.CharField(
        required=False,
        allow_blank=True,
        max_length=5000,
    )


class ClinicalDocFacilityContextSerializer(serializers.Serializer):
    """Facility context for clinical document generation."""

    level = serializers.IntegerField(
        required=False,
        allow_null=True,
        min_value=1,
        max_value=6,
    )
    county = serializers.CharField(
        required=False,
        allow_blank=True,
        max_length=100,
    )


class ClinicalDocGenerateRequestSerializer(serializers.Serializer):
    """Request body for POST /api/ai/clinical/document/."""

    document_type = serializers.ChoiceField(
        choices=DOCUMENT_TYPE_CHOICES,
        help_text="Type of clinical document to generate.",
    )
    patient_context = ClinicalDocPatientContextSerializer()
    admission_context = ClinicalDocAdmissionContextSerializer()
    encounter_context = ClinicalDocEncounterContextSerializer(required=False)
    facility_context = ClinicalDocFacilityContextSerializer(required=False)
    output_format = serializers.ChoiceField(
        choices=OUTPUT_FORMAT_CHOICES,
        default="markdown",
        required=False,
    )
    include_icd10_codes = serializers.BooleanField(
        default=True,
        required=False,
    )
    additional_instructions = serializers.CharField(
        required=False,
        allow_blank=True,
        max_length=4000,
    )
    generation_mode = serializers.ChoiceField(
        choices=GENERATION_MODE_CHOICES,
        default="suggest",
        required=False,
        help_text='"suggest" (default): rich draft for clinician review. "generate": strict facts-only output.',
    )
    system_instruction = serializers.CharField(
        required=False,
        allow_blank=True,
        max_length=2000,
    )
    discharge_layout = serializers.ChoiceField(
        choices=[("STANDARD", "Standard"), ("STRUCTURED", "Structured"), ("MINIMAL", "Minimal")],
        required=False,
        help_text='Selects TibaBot built-in layout: "STANDARD", "STRUCTURED", or "MINIMAL".',
    )
    template_sections = serializers.ListField(
        child=serializers.DictField(),
        required=False,
        help_text="Pass the discharge template sections array [{key, label, enabled}] for full control.",
    )


class ClinicalDocSectionSerializer(serializers.Serializer):
    """A single section of a generated clinical document."""

    section_id = serializers.CharField()
    title = serializers.CharField()
    content = serializers.CharField()


class ClinicalDocICD10SuggestionSerializer(serializers.Serializer):
    """Suggested ICD-10 code from the generated document."""

    code = serializers.CharField()
    description = serializers.CharField()
    confidence = serializers.FloatField(min_value=0.0, max_value=1.0)


class ClinicalDocCitationSerializer(serializers.Serializer):
    """Citation from clinical guidelines."""

    source = serializers.CharField()
    section = serializers.CharField(required=False, allow_blank=True)


class ClinicalDocGenerateResponseSerializer(serializers.Serializer):
    """Response from POST /api/ai/clinical/document/."""

    document_type = serializers.CharField()
    sections = ClinicalDocSectionSerializer(many=True)
    full_text = serializers.CharField(allow_blank=True)
    suggested_icd10_codes = ClinicalDocICD10SuggestionSerializer(
        many=True,
        required=False,
    )
    safety_alerts = serializers.ListField(
        child=serializers.CharField(),
        required=False,
        default=list,
    )
    has_safety_concerns = serializers.BooleanField(required=False, default=False)
    citations = ClinicalDocCitationSerializer(many=True, required=False)
    fhir_resource = serializers.DictField(required=False, allow_null=True)
    processing_time_ms = serializers.FloatField(required=False)
    model_used = serializers.CharField(required=False, allow_blank=True)
    disclaimer = serializers.CharField(required=False)
    generation_mode = serializers.CharField(required=False)
    section_provenance = serializers.DictField(
        child=serializers.CharField(),
        required=False,
    )
    mode = serializers.CharField(required=False)
    error = serializers.CharField(required=False, allow_null=True)


# =============================================================================
# Phase 5 — Enhanced CDS Evaluation
# =============================================================================


class CDSEvaluateRequestSerializer(serializers.Serializer):
    """Request body for POST /api/ai/cds/evaluate/."""

    encounter_id = serializers.IntegerField(
        required=False,
        allow_null=True,
        default=None,
        help_text="Link result to this encounter for persistence.",
    )
    medications = serializers.ListField(
        child=serializers.CharField(max_length=200),
        required=False,
        default=list,
    )
    diagnoses = serializers.ListField(
        child=serializers.CharField(max_length=200),
        required=False,
        default=list,
    )
    symptoms = serializers.ListField(
        child=serializers.CharField(max_length=200),
        required=False,
        default=list,
    )
    pending_procedures = serializers.ListField(
        child=serializers.CharField(max_length=200),
        required=False,
        default=list,
    )
    lab_results = serializers.DictField(
        required=False,
        default=dict,
        help_text="Lab results as test_name → value mapping.",
    )
    allergies = serializers.ListField(
        child=serializers.CharField(max_length=200),
        required=False,
        default=list,
    )
    patient_age = serializers.IntegerField(
        required=False,
        allow_null=True,
        min_value=0,
        max_value=120,
    )
    patient_sex = serializers.ChoiceField(
        choices=["male", "female"],
        required=False,
        allow_null=True,
    )
    is_pregnant = serializers.BooleanField(required=False, default=False)
    region = serializers.CharField(
        required=False,
        allow_blank=True,
        max_length=100,
    )
    facility_level = serializers.CharField(
        required=False,
        allow_blank=True,
        max_length=10,
    )


class CDSAlertItemSerializer(serializers.Serializer):
    """A single CDS alert from TibaBot evaluation."""

    rule_id = serializers.CharField(required=False, allow_blank=True)
    severity = serializers.ChoiceField(
        choices=["critical", "high", "medium", "low"],
    )
    category = serializers.CharField(
        help_text="drug-interaction, contraindication, protocol-adherence, "
        "lab-critical, dosing, formulary.",
    )
    title = serializers.CharField()
    message = serializers.CharField()
    recommendation = serializers.CharField(required=False, allow_blank=True)
    evidence_level = serializers.CharField(required=False, allow_blank=True)


class CDSEvaluateResponseSerializer(serializers.Serializer):
    """Response from POST /api/ai/cds/evaluate/."""

    alerts = CDSAlertItemSerializer(many=True)
    recommendations = CDSAlertItemSerializer(many=True, required=False)
    rules_evaluated = serializers.IntegerField()
    rules_fired = serializers.IntegerField()
    processing_time_ms = serializers.FloatField()
    mode = serializers.CharField(required=False)
    error = serializers.CharField(required=False, allow_null=True)


# =============================================================================
# Stored AI result serializers (read-only, for GET endpoints)
# =============================================================================


class StoredAIResultSerializer(serializers.Serializer):
    """Base fields for all persisted AI results."""

    id = serializers.UUIDField(read_only=True)
    result_data = serializers.JSONField(read_only=True)
    service_mode = serializers.CharField(read_only=True)
    created_at = serializers.DateTimeField(read_only=True)
    created_by = serializers.SerializerMethodField()

    def get_created_by(self, obj: object) -> str:
        user = getattr(obj, "created_by", None)
        if user:
            full = f"{user.first_name} {user.last_name}".strip()
            return full or user.username
        return ""


class StoredCarePlanSerializer(StoredAIResultSerializer):
    """Persisted care plan result for GET endpoint."""

    encounter_id = serializers.IntegerField(allow_null=True, read_only=True)
    admission_id = serializers.IntegerField(allow_null=True, read_only=True)
    primary_diagnosis = serializers.CharField(read_only=True)


class StoredCDSResultSerializer(StoredAIResultSerializer):
    """Persisted CDS evaluation result for GET endpoint."""

    encounter_id = serializers.IntegerField(allow_null=True, read_only=True)
    rules_fired = serializers.IntegerField(read_only=True)
    alert_count = serializers.IntegerField(read_only=True)


class StoredLabInterpretSerializer(StoredAIResultSerializer):
    """Persisted lab interpretation result for GET endpoint."""

    lab_result_id = serializers.IntegerField(allow_null=True, read_only=True)
    encounter_id = serializers.IntegerField(allow_null=True, read_only=True)
    abnormal_count = serializers.IntegerField(read_only=True)
    critical_count = serializers.IntegerField(read_only=True)


class StoredDischargeResultSerializer(StoredAIResultSerializer):
    """Persisted discharge readiness assessment for GET endpoint."""

    admission_id = serializers.IntegerField(allow_null=True, read_only=True)
    readiness_level = serializers.CharField(read_only=True)
    readiness_score = serializers.FloatField(read_only=True)


class StoredICURiskResultSerializer(StoredAIResultSerializer):
    """Persisted ICU risk result for GET endpoint."""

    admission_id = serializers.IntegerField(allow_null=True, read_only=True)
    prediction_type = serializers.CharField(read_only=True)
    risk_level = serializers.CharField(read_only=True)
    risk_score = serializers.FloatField(read_only=True)


# =============================================================================
# eGFR Calculator
# =============================================================================


class EGFRCalculateRequestSerializer(serializers.Serializer):
    """Request body for POST /api/ai/egfr/calculate/."""

    encounter_id = serializers.IntegerField(
        required=False,
        allow_null=True,
        default=None,
        help_text="Link result to this encounter for persistence.",
    )
    patient_id = serializers.IntegerField(
        required=False,
        allow_null=True,
        default=None,
        help_text="Link result to this patient for persistence.",
    )
    creatinine = serializers.FloatField(
        min_value=0.01,
        help_text="Serum creatinine value (>0).",
    )
    creatinine_unit = serializers.ChoiceField(
        choices=["mg/dL", "umol/L"],
        default="umol/L",
        required=False,
        help_text="Creatinine unit. Kenya labs typically report µmol/L.",
    )
    age = serializers.IntegerField(
        min_value=18,
        max_value=120,
        help_text="Patient age in years (18-120).",
    )
    sex = serializers.ChoiceField(
        choices=["male", "female"],
        help_text="Patient sex.",
    )
    weight_kg = serializers.FloatField(
        required=False,
        allow_null=True,
        min_value=1,
        max_value=500,
        help_text="Body weight in kg (needed for Cockcroft-Gault).",
    )
    height_cm = serializers.FloatField(
        required=False,
        allow_null=True,
        min_value=30,
        max_value=300,
        help_text="Height in cm (future BSA adjustment).",
    )


class EGFRCalculateResponseSerializer(serializers.Serializer):
    """Response from POST /api/ai/egfr/calculate/."""

    egfr_ckd_epi = serializers.FloatField(
        help_text="eGFR by CKD-EPI 2021 (mL/min/1.73m²).",
    )
    egfr_cockcroft_gault = serializers.FloatField(
        allow_null=True,
        help_text="CrCl by Cockcroft-Gault (mL/min). Null if weight not provided.",
    )
    ckd_stage = serializers.CharField(
        help_text="KDIGO stage: G1, G2, G3a, G3b, G4, G5.",
    )
    category = serializers.CharField(
        help_text="Human-readable kidney function category.",
    )
    dose_adjustment_band = serializers.CharField(
        help_text="Renal dosing band: normal, mild, moderate, severe, dialysis.",
    )
    flags = serializers.ListField(
        child=serializers.CharField(),
        help_text="Clinical action flags.",
    )
    interpretation = serializers.CharField(
        help_text="Provider-facing summary text.",
    )
    creatinine_used_mg_dl = serializers.FloatField(
        help_text="Creatinine value used (converted to mg/dL).",
    )
    mode = serializers.CharField(
        required=False,
        default="tibabot",
        help_text="'tibabot' or 'fallback'.",
    )
    stored_id = serializers.CharField(
        required=False,
        allow_null=True,
        help_text="UUID of the persisted result.",
    )


class StoredEGFRResultSerializer(StoredAIResultSerializer):
    """Persisted eGFR calculation result for GET endpoint."""

    encounter_id = serializers.IntegerField(allow_null=True, read_only=True)
    patient_id = serializers.IntegerField(allow_null=True, read_only=True)
    ckd_stage = serializers.CharField(read_only=True)
    egfr_ckd_epi = serializers.FloatField(allow_null=True, read_only=True)
    dose_adjustment_band = serializers.CharField(read_only=True)


# =============================================================================
# Phase 8 — Surgical Assistant
# =============================================================================
