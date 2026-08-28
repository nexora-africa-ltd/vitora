# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
# ruff: noqa
"""
What this file is for: condition prediction, feedback, suggestion audit, autopopulate, and ICU serializers.
How to use: imported by `hmis.apps.ai.serializers` compatibility shim.
Supported inputs/args: DRF serializers for diagnostic risk and feedback workflows.
"""

from rest_framework import serializers

from hmis.apps.ai.serializers_core_context import AIVitalsSerializer, ICD10SuggestionSerializer


class ConditionPredictPatientFeaturesSerializer(serializers.Serializer):
    """Patient features for condition prediction — no PII."""

    age = serializers.IntegerField(
        min_value=0,
        max_value=150,
        help_text="Patient age in years.",
    )
    gender = serializers.ChoiceField(
        choices=["M", "F", "O"],
        help_text="Patient gender (M, F, O).",
    )
    chief_complaint = serializers.CharField(
        required=False,
        allow_blank=True,
        max_length=2000,
        help_text="Chief complaint text.",
    )
    chief_complaint_category = serializers.CharField(
        required=False,
        allow_blank=True,
        max_length=100,
        help_text="Chief complaint category (e.g., CHEST_PAIN, FEVER).",
    )

    # Vital signs
    spo2 = serializers.FloatField(required=False, allow_null=True)
    heart_rate = serializers.IntegerField(required=False, allow_null=True)
    systolic_bp = serializers.IntegerField(required=False, allow_null=True)
    diastolic_bp = serializers.IntegerField(required=False, allow_null=True)
    temperature = serializers.FloatField(required=False, allow_null=True)
    respiratory_rate = serializers.IntegerField(required=False, allow_null=True)

    # Clinical assessment
    pain_score = serializers.IntegerField(
        required=False, allow_null=True, min_value=0, max_value=10
    )
    mental_status = serializers.ChoiceField(
        choices=["A", "V", "P", "U"],
        required=False,
        allow_blank=True,
        help_text="AVPU mental status.",
    )
    mobility = serializers.CharField(
        required=False,
        allow_blank=True,
        max_length=50,
        help_text="Mobility status.",
    )
    allergies = serializers.CharField(
        required=False,
        allow_blank=True,
        max_length=2000,
        help_text="Known allergies.",
    )


class ConditionPredictRequestSerializer(serializers.Serializer):
    """Request body for POST /api/ai/predict/condition/."""

    patient_features = ConditionPredictPatientFeaturesSerializer(
        help_text="Patient features for condition prediction.",
    )


class ConditionRiskFactorSerializer(serializers.Serializer):
    """A single identified risk factor."""

    factor = serializers.CharField(help_text="Risk factor name.")
    severity = serializers.ChoiceField(
        choices=["low", "moderate", "high", "critical"],
        help_text="Severity level of this risk factor.",
    )
    description = serializers.CharField(
        required=False,
        allow_blank=True,
        help_text="Explanation of why this is a risk factor.",
    )


class DifferentialConditionSerializer(serializers.Serializer):
    """A differential condition with confidence score."""

    condition = serializers.CharField(help_text="Condition name.")
    confidence = serializers.FloatField(
        min_value=0.0,
        max_value=1.0,
        help_text="Confidence score (0.0 to 1.0).",
    )
    icd10_code = serializers.CharField(
        required=False,
        allow_blank=True,
        help_text="ICD-10 code if available.",
    )


class ConditionPredictResponseSerializer(serializers.Serializer):
    """Response from POST /api/ai/predict/condition/."""

    primary_condition = serializers.CharField(
        help_text="Most likely condition.",
    )
    confidence = serializers.FloatField(
        min_value=0.0,
        max_value=1.0,
        help_text="Confidence score for primary condition.",
    )
    risk_level = serializers.ChoiceField(
        choices=["low", "moderate", "high", "critical"],
        help_text="Overall risk level assessment.",
    )
    risk_factors = ConditionRiskFactorSerializer(
        many=True,
        required=False,
        help_text="Identified risk factors.",
    )
    differential_conditions = DifferentialConditionSerializer(
        many=True,
        required=False,
        help_text="Other possible conditions.",
    )
    recommendations = serializers.ListField(
        child=serializers.CharField(),
        required=False,
        help_text="Clinical recommendations.",
    )
    error = serializers.CharField(
        required=False,
        allow_null=True,
        help_text="Error message when TibaBot is unreachable.",
    )


# =============================================================================
# Phase 3 — Feedback
# =============================================================================


class AIFeedbackRequestSerializer(serializers.Serializer):
    """
    Request body for POST /api/ai/feedback/.

    Submits thumbs-up/down feedback on a TibaBot response.
    Proxied to TibaBot's ``POST /feedback`` endpoint.
    """

    message_id = serializers.CharField(
        max_length=200,
        help_text=(
            "Unique ID for the response being rated. "
            "Vitora uses its own scheme (e.g., 'enc-88-assist-1')."
        ),
    )
    conversation_id = serializers.CharField(
        required=False,
        allow_blank=True,
        max_length=200,
        help_text="Group feedback by encounter/session.",
    )
    feedback = serializers.ChoiceField(
        choices=["up", "down"],
        help_text="Thumbs up or down.",
    )
    user_query = serializers.CharField(
        required=False,
        allow_blank=True,
        max_length=10000,
        help_text="Original query text (for analysis).",
    )
    bot_response = serializers.CharField(
        required=False,
        allow_blank=True,
        max_length=10000,
        help_text="The response being rated (truncated to 500 chars server-side by TibaBot).",
    )
    risk_level = serializers.CharField(
        required=False,
        allow_blank=True,
        max_length=50,
        help_text="Echo back the risk_level from the /clinical/assist response.",
    )
    service_type = serializers.CharField(
        required=False,
        allow_blank=True,
        max_length=50,
        default="chat",
        help_text=(
            "Which service generated the response: chat, care_plan, "
            "lab_assist, discharge_readiness, cds_rules, clerking_assist, "
            "icu_predictor, etc."
        ),
    )
    metadata = serializers.DictField(
        required=False,
        default=dict,
        help_text="Service-specific context for quality analysis.",
    )


class AIFeedbackResponseSerializer(serializers.Serializer):
    """Response from POST /api/ai/feedback/ — proxied from TibaBot."""

    status = serializers.CharField(help_text="Acknowledgement status (e.g. 'received').")
    message = serializers.CharField(help_text="Human-readable confirmation.")
    feedback_id = serializers.CharField(
        required=False,
        allow_blank=True,
        help_text="Server-assigned feedback ID.",
    )


class AIFeedbackStatsResponseSerializer(serializers.Serializer):
    """Response from GET /api/ai/feedback/stats/ — aggregate feedback counts."""

    total_up = serializers.IntegerField(help_text="Total thumbs-up count.")
    total_down = serializers.IntegerField(help_text="Total thumbs-down count.")
    recent_negatives = serializers.IntegerField(
        required=False,
        help_text="Thumbs-down in the last 7 days.",
    )


class AISuggestionAuditItemSerializer(serializers.Serializer):
    """A single accepted or applied AI suggestion event."""

    suggestion_id = serializers.CharField(
        required=False,
        allow_blank=True,
        max_length=200,
        help_text="Client-side suggestion identifier when available.",
    )
    field_name = serializers.CharField(
        max_length=100,
        help_text="Field that received the suggestion.",
    )
    source = serializers.ChoiceField(
        choices=["ai", "cds", "history"],
        default="ai",
        help_text="Origin of the suggestion.",
    )
    confidence = serializers.FloatField(
        required=False,
        allow_null=True,
        min_value=0.0,
        max_value=1.0,
        help_text="Confidence score for the suggestion.",
    )
    accepted_value = serializers.JSONField(
        required=False,
        help_text="Accepted value for audit preview generation.",
    )


class AISuggestionAuditRequestSerializer(serializers.Serializer):
    """Request body for POST /api/ai/suggestion-audit/."""

    suggestion_type = serializers.ChoiceField(
        choices=["autopopulate", "clerking_autocomplete", "mode_change"],
        help_text="Suggestion workflow that produced the accepted value.",
    )
    event_type = serializers.ChoiceField(
        choices=["accepted", "applied", "acknowledged"],
        help_text="Whether the suggestion was accepted inline or applied in batch.",
    )
    suggestions = AISuggestionAuditItemSerializer(
        many=True,
        allow_empty=False,
        help_text="Accepted or applied suggestions to audit.",
    )
    note_format = serializers.ChoiceField(
        choices=["soap", "sbar"],
        required=False,
        help_text="Clinical note format for clerking autocomplete events.",
    )
    encounter_type = serializers.CharField(
        required=False,
        allow_blank=True,
        max_length=50,
        help_text="Encounter type context when available.",
    )


class AISuggestionAuditResponseSerializer(serializers.Serializer):
    """Response from POST /api/ai/suggestion-audit/."""

    status = serializers.CharField(help_text="Acknowledgement status.")
    message = serializers.CharField(help_text="Human-readable confirmation.")
    logged_count = serializers.IntegerField(help_text="Number of suggestion events logged.")


# =============================================================================
# Phase 4a — Smart Autopopulate
# =============================================================================


class AutopopulateSuggestedFieldSerializer(serializers.Serializer):
    """A single field suggestion from AI autopopulate."""

    field_name = serializers.CharField(
        help_text="Target form field (e.g., 'assessment', 'chronic_conditions').",
    )
    value = serializers.JSONField(
        help_text="Suggested value — string, list, or structured object.",
    )
    confidence = serializers.FloatField(
        min_value=0.0,
        max_value=1.0,
        help_text="Confidence score (0.0 to 1.0).",
    )
    reason = serializers.CharField(
        required=False,
        allow_blank=True,
        help_text="Clinical reasoning for this suggestion.",
    )
    source = serializers.ChoiceField(
        choices=["ai", "cds", "history"],
        default="ai",
        help_text="Origin of the suggestion.",
    )


class AutopopulateRequestSerializer(serializers.Serializer):
    """Request body for POST /api/ai/autopopulate/."""

    chief_complaint = serializers.CharField(
        required=False,
        allow_blank=True,
        max_length=5000,
        help_text="Chief complaint text.",
    )
    vitals = AIVitalsSerializer(required=False, allow_null=True)
    patient_age = serializers.IntegerField(
        required=False,
        allow_null=True,
        help_text="Patient age in years.",
    )
    patient_sex = serializers.CharField(
        required=False,
        allow_blank=True,
        help_text="M, F, or O.",
    )
    allergies = serializers.ListField(
        child=serializers.CharField(),
        required=False,
        default=list,
        help_text="Known patient allergies.",
    )
    current_medications = serializers.ListField(
        child=serializers.CharField(),
        required=False,
        default=list,
        help_text="Current medications.",
    )
    clinical_notes = serializers.CharField(
        required=False,
        allow_blank=True,
        max_length=10000,
        help_text="Additional clinical notes / HPI text.",
    )
    encounter_type = serializers.CharField(
        required=False,
        allow_blank=True,
        help_text="OPD, IPD, or EMERGENCY.",
    )


class AutopopulateResponseSerializer(serializers.Serializer):
    """Response from POST /api/ai/autopopulate/."""

    suggested_fields = AutopopulateSuggestedFieldSerializer(
        many=True,
        help_text="List of field suggestions for the encounter form.",
    )
    icd10_suggestions = ICD10SuggestionSerializer(
        many=True,
        required=False,
        help_text="ICD-10 code suggestions if chief complaint provided.",
    )
    error = serializers.CharField(
        required=False,
        allow_null=True,
        help_text="Error message when AI is unavailable.",
    )


# =============================================================================
# Phase 4 — ICU Predictor
# =============================================================================


class ICUPredictPatientDataSerializer(serializers.Serializer):
    """Patient clinical data for ICU risk prediction — no PII."""

    age = serializers.IntegerField(
        min_value=0,
        max_value=150,
        help_text="Patient age in years.",
    )
    gender = serializers.ChoiceField(
        choices=["M", "F", "O"],
        help_text="Patient gender (M, F, O).",
    )

    # Vital signs
    temperature = serializers.FloatField(required=False, allow_null=True)
    heart_rate = serializers.IntegerField(required=False, allow_null=True)
    systolic_bp = serializers.IntegerField(required=False, allow_null=True)
    diastolic_bp = serializers.IntegerField(required=False, allow_null=True)
    respiratory_rate = serializers.IntegerField(required=False, allow_null=True)
    spo2 = serializers.FloatField(required=False, allow_null=True)
    mean_arterial_pressure = serializers.FloatField(required=False, allow_null=True)

    # Lab values (for SOFA scoring)
    wbc = serializers.FloatField(
        required=False,
        allow_null=True,
        help_text="White blood cell count (x10^9/L).",
    )
    platelets = serializers.FloatField(
        required=False,
        allow_null=True,
        help_text="Platelet count (x10^9/L).",
    )
    creatinine = serializers.FloatField(
        required=False,
        allow_null=True,
        help_text="Serum creatinine (mg/dL).",
    )
    bilirubin = serializers.FloatField(
        required=False,
        allow_null=True,
        help_text="Serum bilirubin (mg/dL).",
    )
    lactate = serializers.FloatField(
        required=False,
        allow_null=True,
        help_text="Serum lactate (mmol/L).",
    )
    pao2_fio2_ratio = serializers.FloatField(
        required=False,
        allow_null=True,
        help_text="PaO2/FiO2 ratio for respiratory SOFA.",
    )
    gcs = serializers.IntegerField(
        required=False,
        allow_null=True,
        min_value=3,
        max_value=15,
        help_text="Glasgow Coma Scale (3-15).",
    )

    # Clinical context
    urine_output_ml_day = serializers.FloatField(
        required=False,
        allow_null=True,
        help_text="24-hour urine output in mL.",
    )
    on_vasopressors = serializers.BooleanField(
        required=False,
        allow_null=True,
        help_text="Whether patient is on vasopressor support.",
    )
    on_mechanical_ventilation = serializers.BooleanField(
        required=False,
        allow_null=True,
        help_text="Whether patient is on mechanical ventilation.",
    )
    admission_diagnosis = serializers.CharField(
        required=False,
        allow_blank=True,
        max_length=2000,
        help_text="Admitting diagnosis.",
    )
    length_of_stay_days = serializers.IntegerField(
        required=False,
        allow_null=True,
        min_value=0,
        help_text="Current length of stay in days.",
    )


class ICUPredictRequestSerializer(serializers.Serializer):
    """Request body for POST /api/ai/predict/icu/."""

    # Minimum practical fields for reliable SOFA/qSOFA inference in TibaBot.
    ICU_REQUIRED_MINIMUM_FIELDS = (
        "respiratory_rate",
        "systolic_bp",
        "diastolic_bp",
    )

    admission_id = serializers.IntegerField(
        required=False,
        allow_null=True,
        default=None,
        help_text="Link result to this admission for persistence.",
    )
    patient_data = ICUPredictPatientDataSerializer(
        help_text="Patient clinical data for ICU risk prediction.",
    )
    prediction_type = serializers.ChoiceField(
        choices=["predict", "risk-stratify"],
        default="predict",
        help_text='"predict" for ICU admission prediction, '
        '"risk-stratify" for sepsis/deterioration composite score.',
    )

    def validate(self, attrs):  # type: ignore[override]
        attrs = super().validate(attrs)
        pd = attrs.get("patient_data", {})
        missing_fields = [f for f in self.ICU_REQUIRED_MINIMUM_FIELDS if pd.get(f) is None]

        if missing_fields:
            raise serializers.ValidationError(
                {
                    "patient_data": (
                        f"ICU risk prediction requires minimum practical SOFA fields: "
                        f"{', '.join(missing_fields)}. Please record them "
                        f"before running the assessment."
                    ),
                    "missing_fields": missing_fields,
                }
            )
        return attrs


class ICUQSOFALiteRequestSerializer(serializers.Serializer):
    """Request body for POST /api/ai/predict/icu/qsofa-lite/."""

    respiratory_rate = serializers.FloatField(min_value=0)
    systolic_bp = serializers.FloatField(min_value=0)
    gcs_total = serializers.IntegerField(required=False, allow_null=True, min_value=3, max_value=15)
    altered_mentation = serializers.BooleanField(required=False, allow_null=True)

    def validate(self, attrs):  # type: ignore[override]
        attrs = super().validate(attrs)
        gcs_total = attrs.get("gcs_total")
        altered_mentation = attrs.get("altered_mentation")
        if gcs_total is None and altered_mentation is None:
            raise serializers.ValidationError(
                {
                    "non_field_errors": [
                        "Provide either gcs_total or altered_mentation for qSOFA-lite assessment."
                    ]
                }
            )
        return attrs


class SOFAScoreBreakdownSerializer(serializers.Serializer):
    """SOFA score component breakdown."""

    respiratory = serializers.IntegerField(
        required=False,
        allow_null=True,
        min_value=0,
        max_value=4,
        help_text="Respiratory SOFA (PaO2/FiO2).",
    )
    coagulation = serializers.IntegerField(
        required=False,
        allow_null=True,
        min_value=0,
        max_value=4,
        help_text="Coagulation SOFA (platelets).",
    )
    liver = serializers.IntegerField(
        required=False,
        allow_null=True,
        min_value=0,
        max_value=4,
        help_text="Liver SOFA (bilirubin).",
    )
    cardiovascular = serializers.IntegerField(
        required=False,
        allow_null=True,
        min_value=0,
        max_value=4,
        help_text="Cardiovascular SOFA (MAP/vasopressors).",
    )
    neurological = serializers.IntegerField(
        required=False,
        allow_null=True,
        min_value=0,
        max_value=4,
        help_text="Neurological SOFA (GCS).",
    )
    renal = serializers.IntegerField(
        required=False,
        allow_null=True,
        min_value=0,
        max_value=4,
        help_text="Renal SOFA (creatinine/urine output).",
    )


class ICUCriticalAlertSerializer(serializers.Serializer):
    """A single critical alert from ICU prediction."""

    alert_type = serializers.CharField(
        help_text="Alert category (e.g., sepsis, aki, respiratory_failure)."
    )
    severity = serializers.ChoiceField(
        choices=["warning", "critical"],
        help_text="Alert severity level.",
    )
    message = serializers.CharField(help_text="Human-readable alert description.")
    recommendation = serializers.CharField(
        required=False,
        allow_blank=True,
        help_text="Recommended action.",
    )


class ICUEscalationSerializer(serializers.Serializer):
    """Escalation recommendation from ICU prediction."""

    recommended = serializers.BooleanField(
        help_text="Whether ICU escalation is recommended.",
    )
    urgency = serializers.ChoiceField(
        choices=["routine", "urgent", "immediate"],
        required=False,
        help_text="Urgency of escalation if recommended.",
    )
    reasoning = serializers.CharField(
        required=False,
        allow_blank=True,
        help_text="Clinical reasoning for escalation recommendation.",
    )


class ICUPredictResponseSerializer(serializers.Serializer):
    """Response from POST /api/ai/predict/icu/."""

    # Overall risk assessment
    risk_level = serializers.ChoiceField(
        choices=["low", "moderate", "high", "critical"],
        help_text="Overall ICU risk level.",
    )
    risk_score = serializers.FloatField(
        min_value=0.0,
        max_value=1.0,
        help_text="Overall risk score (0.0 to 1.0).",
    )

    # Scoring systems
    sofa_score = serializers.IntegerField(
        required=False,
        allow_null=True,
        min_value=0,
        max_value=24,
        help_text="Sequential Organ Failure Assessment score (0-24).",
    )
    sofa_breakdown = SOFAScoreBreakdownSerializer(
        required=False,
        allow_null=True,
        help_text="SOFA score component breakdown.",
    )
    qsofa_score = serializers.IntegerField(
        required=False,
        allow_null=True,
        min_value=0,
        max_value=3,
        help_text="Quick SOFA score (0-3).",
    )
    qsofa_criteria = serializers.ListField(
        child=serializers.CharField(),
        required=False,
        help_text="qSOFA criteria met (e.g., 'Altered mentation', 'RR >= 22', 'SBP <= 100').",
    )

    # Alerts and recommendations
    critical_alerts = ICUCriticalAlertSerializer(
        many=True,
        required=False,
        help_text="Critical alerts requiring immediate attention.",
    )
    escalation = ICUEscalationSerializer(
        required=False,
        allow_null=True,
        help_text="ICU escalation recommendation.",
    )
    recommendations = serializers.ListField(
        child=serializers.CharField(),
        required=False,
        help_text="Clinical recommendations.",
    )

    # Risk stratification (only for prediction_type='risk-stratify')
    sepsis_probability = serializers.FloatField(
        required=False,
        allow_null=True,
        min_value=0.0,
        max_value=1.0,
        help_text="Sepsis probability (0.0 to 1.0).",
    )
    aki_probability = serializers.FloatField(
        required=False,
        allow_null=True,
        min_value=0.0,
        max_value=1.0,
        help_text="Acute Kidney Injury probability (0.0 to 1.0).",
    )
    deterioration_probability = serializers.FloatField(
        required=False,
        allow_null=True,
        min_value=0.0,
        max_value=1.0,
        help_text="Clinical deterioration probability (0.0 to 1.0).",
    )

    defaulted_labs = serializers.ListField(
        child=serializers.CharField(),
        required=False,
        default=list,
        help_text="Lab fields that were substituted with normal defaults "
        "because actual results were unavailable.",
    )

    error = serializers.CharField(
        required=False,
        allow_null=True,
        help_text="Error message when TibaBot is unreachable.",
    )


# =============================================================================
# Phase 5 — Lab Assist
# =============================================================================
