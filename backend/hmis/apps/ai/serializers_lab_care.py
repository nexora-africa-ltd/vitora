# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
# ruff: noqa
"""
What this file is for: lab interpretation, discharge assessment, care-plan, and clerking serializers.
How to use: imported by `hmis.apps.ai.serializers` compatibility shim.
Supported inputs/args: DRF serializers for lab and care-plan AI endpoints.
"""

from rest_framework import serializers

from hmis.apps.ai.serializers_core_context import AIPatientContextSerializer


class LabResultItemSerializer(serializers.Serializer):
    """A single lab result for interpretation."""

    test_name = serializers.CharField(
        max_length=200,
        help_text="Standardized test name (e.g., 'serum_creatinine', 'hemoglobin').",
    )
    value = serializers.FloatField(
        help_text="Numeric result value.",
    )
    unit = serializers.CharField(
        max_length=50,
        help_text="Unit of measurement (e.g., 'mg/dL', 'mmol/L').",
    )
    reference_low = serializers.FloatField(
        required=False,
        allow_null=True,
        default=None,
        help_text="Lower bound of normal reference range.",
    )
    reference_high = serializers.FloatField(
        required=False,
        allow_null=True,
        default=None,
        help_text="Upper bound of normal reference range.",
    )
    flag = serializers.CharField(
        max_length=20,
        required=False,
        allow_blank=True,
        default="",
        help_text="Result flag: NORMAL, HIGH, LOW, CRITICAL_HIGH, CRITICAL_LOW, ABNORMAL.",
    )
    timestamp = serializers.DateTimeField(
        required=False,
        allow_null=True,
        help_text="When the sample was collected.",
    )


class LabInterpretRequestSerializer(serializers.Serializer):
    """Request body for POST /api/ai/lab/interpret/."""

    lab_result_id = serializers.IntegerField(
        required=False,
        allow_null=True,
        default=None,
        help_text="Link result to this lab result for persistence.",
    )
    encounter_id = serializers.IntegerField(
        required=False,
        allow_null=True,
        default=None,
        help_text="Link result to this encounter for persistence.",
    )
    patient_age = serializers.IntegerField(
        min_value=0,
        max_value=120,
        help_text="Patient age in years.",
    )
    patient_sex = serializers.ChoiceField(
        choices=["male", "female"],
        help_text="Patient sex.",
    )
    is_pregnant = serializers.BooleanField(
        required=False,
        default=False,
        help_text="Whether patient is pregnant.",
    )
    gestational_weeks = serializers.IntegerField(
        required=False,
        allow_null=True,
        min_value=0,
        max_value=45,
        help_text="Gestational age if pregnant.",
    )
    lab_results = LabResultItemSerializer(
        many=True,
        help_text="Lab results to interpret (at least 1).",
    )
    diagnoses = serializers.ListField(
        child=serializers.CharField(max_length=200),
        required=False,
        default=list,
        help_text="Current diagnoses for context.",
    )


class LabFlagSerializer(serializers.Serializer):
    """A single flagged lab result."""

    test_name = serializers.CharField()
    value = serializers.FloatField()
    unit = serializers.CharField()
    status = serializers.CharField(
        help_text="normal, high, low, critical_high, critical_low, or unknown.",
    )
    reference_range = serializers.DictField(
        required=False,
        allow_null=True,
        help_text="Reference range {low, high, unit}.",
    )
    deviation_percent = serializers.FloatField(
        required=False,
        allow_null=True,
        help_text="Deviation % from nearest reference boundary.",
    )
    message = serializers.CharField(
        required=False,
        allow_blank=True,
    )


class LabPatternSerializer(serializers.Serializer):
    """A detected multi-lab pattern."""

    pattern_name = serializers.CharField(help_text="Pattern name (e.g., 'DKA triad').")
    significance = serializers.ChoiceField(
        choices=["critical", "significant", "monitor"],
        help_text="Clinical significance level.",
    )
    confidence = serializers.FloatField(
        min_value=0.0,
        max_value=1.0,
        help_text="Detection confidence.",
    )
    description = serializers.CharField(
        required=False,
        allow_blank=True,
    )
    contributing_tests = serializers.ListField(
        child=serializers.CharField(),
        required=False,
        help_text="Tests that formed this pattern.",
    )


class LabInterpretResponseSerializer(serializers.Serializer):
    """Response from POST /api/ai/lab/interpret/."""

    flags = LabFlagSerializer(many=True)
    patterns = LabPatternSerializer(many=True, required=False)
    interpretation_summary = serializers.CharField(
        required=False,
        allow_blank=True,
    )
    suggested_followup_labs = serializers.ListField(
        child=serializers.CharField(),
        required=False,
    )
    critical_alerts = serializers.ListField(
        child=serializers.CharField(),
        required=False,
    )
    mode = serializers.CharField(
        required=False,
        help_text="'tibabot' or 'fallback'.",
    )
    error = serializers.CharField(
        required=False,
        allow_null=True,
    )


# =============================================================================
# Phase 5 — Discharge Readiness
# =============================================================================


class VitalsSnapshotSerializer(serializers.Serializer):
    """A single vitals reading for discharge assessment."""

    timestamp = serializers.DateTimeField(help_text="When vitals were taken.")
    heart_rate = serializers.FloatField(required=False, allow_null=True, min_value=0, max_value=300)
    systolic_bp = serializers.FloatField(
        required=False, allow_null=True, min_value=0, max_value=300
    )
    diastolic_bp = serializers.FloatField(
        required=False, allow_null=True, min_value=0, max_value=200
    )
    temperature = serializers.FloatField(
        required=False, allow_null=True, min_value=25, max_value=45
    )
    respiratory_rate = serializers.FloatField(
        required=False, allow_null=True, min_value=0, max_value=80
    )
    oxygen_saturation = serializers.FloatField(
        required=False, allow_null=True, min_value=0, max_value=100
    )


class DischargeAssessRequestSerializer(serializers.Serializer):
    """Request body for POST /api/ai/discharge/assess/."""

    admission_id = serializers.IntegerField(
        required=False,
        allow_null=True,
        default=None,
        help_text="Link result to this admission for persistence.",
    )
    patient_age = serializers.IntegerField(
        min_value=0,
        max_value=120,
        help_text="Patient age in years.",
    )
    primary_diagnosis = serializers.CharField(
        max_length=500,
        help_text="Primary diagnosis.",
    )
    admission_type = serializers.ChoiceField(
        choices=["medical", "surgical", "obstetric", "pediatric"],
        default="medical",
        required=False,
    )
    days_admitted = serializers.IntegerField(
        min_value=0,
        help_text="Days since admission.",
    )
    vitals_history = VitalsSnapshotSerializer(
        many=True,
        required=False,
        default=list,
        help_text="Vitals from last 48h, chronologically ordered.",
    )
    lab_results = LabResultItemSerializer(
        many=True,
        required=False,
        default=list,
    )
    current_medications = serializers.ListField(
        child=serializers.CharField(max_length=200),
        required=False,
        default=list,
    )
    can_ambulate = serializers.BooleanField(required=False, allow_null=True)
    can_tolerate_oral = serializers.BooleanField(required=False, allow_null=True)
    has_follow_up_arranged = serializers.BooleanField(required=False, default=False)
    has_caregiver_at_home = serializers.BooleanField(required=False, allow_null=True)
    has_nhif_or_sha = serializers.BooleanField(required=False, allow_null=True)
    chw_referral_made = serializers.BooleanField(required=False, allow_null=True)


class DischargeCriterionSerializer(serializers.Serializer):
    """A single discharge criterion evaluation."""

    # TibaBot returns 'criterion', fallback returns 'name' — accept both
    name = serializers.CharField(required=False, allow_blank=True)
    criterion = serializers.CharField(required=False, allow_blank=True)
    category = serializers.CharField(
        help_text="vitals, labs, functional, medication, social, follow_up.",
    )
    met = serializers.BooleanField()
    details = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    current_value = serializers.CharField(required=False, allow_null=True)
    target_value = serializers.CharField(required=False, allow_null=True)
    notes = serializers.CharField(required=False, allow_null=True)
    source = serializers.CharField(required=False)


class DischargeAssessResponseSerializer(serializers.Serializer):
    """Response from POST /api/ai/discharge/assess/."""

    readiness_score = serializers.FloatField(min_value=0.0, max_value=1.0)
    readiness_level = serializers.ChoiceField(
        choices=["ready", "near_ready", "not_ready"],
    )
    criteria = DischargeCriterionSerializer(many=True)
    unmet_criteria_count = serializers.IntegerField()
    readmission_risk = serializers.FloatField(
        required=False,
        allow_null=True,
        min_value=0.0,
        max_value=1.0,
    )
    readmission_risk_level = serializers.CharField(
        required=False,
        allow_null=True,
    )
    recommendations = serializers.ListField(
        child=serializers.CharField(),
        required=False,
    )
    vitals_stability = serializers.CharField(
        required=False,
        allow_null=True,
    )
    mode = serializers.CharField(required=False)
    error = serializers.CharField(required=False, allow_null=True)
    stored_id = serializers.CharField(required=False, allow_null=True)


# =============================================================================
# Phase 5 — Care Plan Generator
# =============================================================================


class CarePlanGenerateRequestSerializer(serializers.Serializer):
    """Request body for POST /api/ai/care-plan/generate/."""

    encounter_id = serializers.IntegerField(
        required=False,
        allow_null=True,
        default=None,
        help_text="Link result to this encounter for persistence.",
    )
    admission_id = serializers.IntegerField(
        required=False,
        allow_null=True,
        default=None,
        help_text="Link result to this admission for persistence.",
    )
    primary_diagnosis = serializers.CharField(
        required=False,
        allow_blank=True,
        max_length=500,
        help_text="Confirmed primary diagnosis (if available).",
    )
    chief_complaint = serializers.CharField(
        required=False,
        allow_blank=True,
        max_length=500,
        help_text="Presenting complaint from triage (used when no diagnosis yet).",
    )
    icd10_code = serializers.CharField(
        required=False,
        allow_blank=True,
        max_length=20,
    )
    severity = serializers.CharField(
        required=False,
        allow_blank=True,
        max_length=100,
    )
    comorbidities = serializers.ListField(
        child=serializers.CharField(max_length=200),
        required=False,
        default=list,
    )
    patient_age = serializers.IntegerField(min_value=0, max_value=120)
    patient_sex = serializers.ChoiceField(choices=["male", "female"])
    is_pregnant = serializers.BooleanField(required=False, default=False)
    facility_level = serializers.CharField(
        required=False,
        default="H3",
        help_text="Kenya facility level (H1-H5).",
    )
    allergies = serializers.ListField(
        child=serializers.CharField(max_length=200),
        required=False,
        default=list,
    )
    current_medications = serializers.ListField(
        child=serializers.CharField(max_length=200),
        required=False,
        default=list,
    )
    vitals = serializers.DictField(required=False, default=dict)
    lab_results = LabResultItemSerializer(
        many=True,
        required=False,
        default=list,
    )
    output_format = serializers.ChoiceField(
        choices=["standard", "adpie"],
        required=False,
        default="adpie",
        help_text="Requested output contract for care plan generation.",
    )


class CarePlanGoalSerializer(serializers.Serializer):
    """A single care plan goal."""

    description = serializers.CharField()
    priority = serializers.ChoiceField(choices=["high", "medium", "low"])
    timeframe = serializers.CharField(required=False, allow_blank=True)
    measurable_target = serializers.CharField(required=False, allow_blank=True)


class CarePlanInterventionItemSerializer(serializers.Serializer):
    """A single intervention action."""

    action = serializers.CharField()
    frequency = serializers.CharField(required=False, allow_blank=True)
    rationale = serializers.CharField(required=False, allow_blank=True)


class CarePlanInterventionCategorySerializer(serializers.Serializer):
    """Interventions grouped by category."""

    category = serializers.CharField(
        help_text="medications, investigations, nursing, nutrition, "
        "patient_education, rehabilitation, referrals.",
    )
    items = CarePlanInterventionItemSerializer(many=True)


class CarePlanFollowUpSerializer(serializers.Serializer):
    """Follow-up instructions."""

    timing = serializers.CharField(required=False, allow_blank=True)
    instructions = serializers.CharField(required=False, allow_blank=True)
    red_flags = serializers.ListField(
        child=serializers.CharField(),
        required=False,
    )


class CarePlanADPIEEntrySerializer(serializers.Serializer):
    """ADPIE-aligned nursing care-plan row derived from generated output."""

    assessment = serializers.CharField()
    nursing_diagnosis = serializers.CharField()
    goal_and_outcome_criteria = serializers.CharField()
    plan_of_action = serializers.CharField()
    scientific_rationale = serializers.CharField()
    implementation = serializers.CharField(required=False, allow_blank=True)
    evaluation = serializers.CharField(required=False, allow_blank=True)


class CarePlanResponseSerializer(serializers.Serializer):
    """Response from POST /api/ai/care-plan/generate/."""

    primary_diagnosis = serializers.CharField()
    icd10_code = serializers.CharField(required=False, allow_null=True)
    severity = serializers.CharField(required=False, allow_null=True)
    goals = CarePlanGoalSerializer(many=True)
    interventions = CarePlanInterventionCategorySerializer(many=True)
    discharge_criteria = serializers.ListField(
        child=serializers.CharField(),
        required=False,
    )
    follow_up = CarePlanFollowUpSerializer(required=False, allow_null=True)
    adpie_entries = CarePlanADPIEEntrySerializer(many=True, required=False)
    references = serializers.ListField(
        child=serializers.CharField(),
        required=False,
    )
    cds_alerts = serializers.ListField(
        child=serializers.DictField(),
        required=False,
    )
    facility_level_notes = serializers.ListField(
        child=serializers.CharField(),
        required=False,
    )
    template_used = serializers.CharField(required=False, allow_null=True)
    mode = serializers.CharField(required=False)
    llm_enriched = serializers.BooleanField(required=False)
    evidence_sources = serializers.ListField(
        child=serializers.CharField(),
        required=False,
    )
    error = serializers.CharField(required=False, allow_null=True)


# =============================================================================
# Phase 5 — Clerking Assist
# =============================================================================


class ClerkingAutocompleteRequestSerializer(serializers.Serializer):
    """Request body for POST /api/ai/clerking/autocomplete/."""

    text = serializers.CharField(
        min_length=1,
        max_length=5000,
        help_text="Current text being typed.",
    )
    field_name = serializers.CharField(
        max_length=100,
        help_text="Form field name (e.g., 'chief_complaint', 'examination').",
    )
    note_format = serializers.ChoiceField(
        choices=["soap", "sbar"],
        default="soap",
        required=False,
    )
    patient_context = AIPatientContextSerializer(required=False, allow_null=True)


class ClerkingAutocompleteSuggestionSerializer(serializers.Serializer):
    """A single autocomplete suggestion."""

    text = serializers.CharField()
    confidence = serializers.FloatField(min_value=0.0, max_value=1.0)
    category = serializers.CharField(required=False, allow_blank=True)


class ClerkingAutocompleteResponseSerializer(serializers.Serializer):
    """Response from POST /api/ai/clerking/autocomplete/."""

    suggestions = ClerkingAutocompleteSuggestionSerializer(many=True)
    mode = serializers.CharField(required=False)
    error = serializers.CharField(required=False, allow_null=True)


class ClerkingStructureRequestSerializer(serializers.Serializer):
    """Request body for POST /api/ai/clerking/structure/."""

    free_text = serializers.CharField(
        min_length=10,
        max_length=20000,
        help_text="Free-text clinical note to structure.",
    )
    note_format = serializers.ChoiceField(
        choices=["soap", "sbar"],
        default="soap",
        help_text="Target note format.",
    )


class ClerkingStructureResponseSerializer(serializers.Serializer):
    """Response from POST /api/ai/clerking/structure/."""

    structured_note = serializers.DictField(
        help_text="Structured note sections (e.g., {Subjective: ..., Objective: ...}).",
    )
    sections = serializers.ListField(child=serializers.CharField())
    original_text = serializers.CharField()
    mode = serializers.CharField(required=False)
    error = serializers.CharField(required=False, allow_null=True)


# =============================================================================
# Phase 6 — Clinical Document Generation
# =============================================================================

DOCUMENT_TYPE_CHOICES = [
    ("discharge_summary", "Discharge Summary"),
    ("soap", "SOAP Note"),
    ("progress_note", "Progress Note"),
    ("referral_letter", "Referral Letter"),
    ("clerking_note", "Clerking Note"),
]

DISCHARGE_TYPE_CHOICES = [
    ("NORMAL", "Normal"),
    ("AMA", "Against Medical Advice"),
    ("TRANSFER", "Transfer"),
    ("DEATH", "Death"),
    ("DAMA", "Discharge Against Medical Advice"),
]

OUTPUT_FORMAT_CHOICES = [
    ("markdown", "Markdown"),
    ("structured", "Structured JSON"),
    ("fhir", "FHIR R4 Composition"),
]

GENERATION_MODE_CHOICES = [
    ("suggest", "Suggest — rich draft with AI-synthesised narratives"),
    ("generate", "Generate — strict facts-only output for audit trails"),
]
