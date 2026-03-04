"""
Serializers for AI proxy endpoints.

Validates requests to and responses from the TibaBot AI service.
Includes user/facility context serializers for context-enriched requests.
"""

from rest_framework import serializers


# =============================================================================
# Phase 1 — ICD-10 Auto-coding
# =============================================================================


class ICD10SuggestRequestSerializer(serializers.Serializer):
    """Validates the ICD-10 suggestion request from the frontend."""

    clinical_text = serializers.CharField(
        min_length=3,
        max_length=5000,
        help_text="Clinical text to analyze for ICD-10 code suggestions.",
    )


class ICD10SuggestionSerializer(serializers.Serializer):
    """Represents a single ICD-10 code suggestion from TibaBot."""

    code = serializers.CharField(
        help_text="ICD-10 code (e.g., 'B50.9').",
    )
    description = serializers.CharField(
        help_text="Human-readable description of the ICD-10 code.",
    )
    confidence = serializers.FloatField(
        min_value=0.0,
        max_value=1.0,
        help_text="Confidence score (0.0 to 1.0).",
    )


class ICD10SuggestResponseSerializer(serializers.Serializer):
    """Response serializer for ICD-10 suggestions."""

    suggestions = ICD10SuggestionSerializer(many=True)
    clinical_text_preview = serializers.CharField(
        required=False,
        help_text="Sanitized preview of the input text (for debugging).",
    )
    error = serializers.CharField(
        required=False,
        help_text="Error message when TibaBot is unavailable (graceful degradation).",
    )


class AIStatusResponseSerializer(serializers.Serializer):
    """Response serializer for AI feature status check."""

    enabled = serializers.BooleanField()
    service_name = serializers.CharField()
    service_available = serializers.BooleanField()


# =============================================================================
# Phase 2 — Context Enrichment (User / Facility)
# =============================================================================


class AIUserContextSerializer(serializers.Serializer):
    """
    User context sent to TibaBot — no PII.

    Allows TibaBot to calibrate response depth:
    - role: DOCTOR → concise differentials; CLINICAL_OFFICER → step-by-step
    - seniority: inferred from Role.hierarchy_level (0=highest)
    - specialization: from StaffProfile.specialization

    All fields nullable so the frontend/backend can send what's available.
    """

    role = serializers.CharField(
        required=False,
        allow_null=True,
        help_text="User role code (DOCTOR, NURSE, CLINICAL_OFFICER, etc.).",
    )
    seniority = serializers.CharField(
        required=False,
        allow_null=True,
        help_text="Seniority level inferred from RBAC hierarchy (SENIOR, MID, JUNIOR).",
    )
    specialization = serializers.CharField(
        required=False,
        allow_null=True,
        help_text="Clinical specialization (e.g., Pediatrics, Surgery).",
    )


class AIFacilityContextSerializer(serializers.Serializer):
    """
    Facility context sent to TibaBot.

    Enables capability-aware and epidemiologically appropriate suggestions:
    - keph_level: L2 dispensary cannot do CT scans → recommend referral
    - county: malaria prevalence differs by region
    - capability flags: has_icu, has_laboratory, etc.

    All fields nullable to support incremental modelling.
    """

    keph_level = serializers.CharField(
        required=False,
        allow_null=True,
        help_text="KEPH level (L1–L6) from facility settings.",
    )
    county = serializers.CharField(
        required=False,
        allow_null=True,
        help_text="County for epidemiological context.",
    )
    has_icu = serializers.BooleanField(
        required=False,
        allow_null=True,
        help_text="Whether facility has an ICU.",
    )
    has_laboratory = serializers.BooleanField(
        required=False,
        allow_null=True,
        help_text="Whether facility has a laboratory.",
    )
    has_imaging = serializers.BooleanField(
        required=False,
        allow_null=True,
        help_text="Whether facility has imaging (X-ray, CT, MRI).",
    )
    has_pharmacy = serializers.BooleanField(
        required=False,
        allow_null=True,
        help_text="Whether facility has a pharmacy.",
    )


# =============================================================================
# Phase 2 — Clinical Chat
# =============================================================================


class AIVitalsSerializer(serializers.Serializer):
    """Vital signs subset for encounter context."""

    spo2 = serializers.FloatField(required=False, allow_null=True)
    pulse = serializers.IntegerField(required=False, allow_null=True)
    temperature = serializers.FloatField(required=False, allow_null=True)
    rr = serializers.IntegerField(required=False, allow_null=True)
    map = serializers.IntegerField(
        required=False,
        allow_null=True,
        help_text="Mean Arterial Pressure (MAP) in mmHg - calculated from BP",
    )


class AIPatientContextSerializer(serializers.Serializer):
    """Patient context for Clinical Assist — no PII."""

    patient_age = serializers.IntegerField()
    patient_sex = serializers.CharField()
    facility_level = serializers.IntegerField(required=False, allow_null=True)
    allergies = serializers.ListField(
        child=serializers.CharField(), required=False, default=list
    )
    comorbidities = serializers.ListField(
        child=serializers.CharField(), required=False, default=list
    )
    current_medications = serializers.ListField(
        child=serializers.CharField(), required=False, default=list
    )


class AIEncounterContextSerializer(serializers.Serializer):
    """Encounter context for Clinical Assist.

    Includes optional inpatient fields that are populated when the
    clinician is on an admission or ward round page.
    """

    chief_complaint = serializers.CharField(required=False, allow_null=True)
    vitals = AIVitalsSerializer(required=False, allow_null=True)

    # Inpatient fields (optional — only set on admission/ward round pages)
    admission_diagnosis = serializers.CharField(
        required=False, allow_null=True, allow_blank=True,
        help_text="Admitting diagnosis text (no PII).",
    )
    ward_name = serializers.CharField(
        required=False, allow_null=True, allow_blank=True,
        help_text="Ward name (e.g., 'Medical Ward 1').",
    )
    bed_number = serializers.CharField(
        required=False, allow_null=True, allow_blank=True,
        help_text="Bed number (e.g., 'B-005').",
    )
    admission_status = serializers.CharField(
        required=False, allow_null=True, allow_blank=True,
        help_text="Admission status (ACTIVE, DISCHARGED, etc.).",
    )
    length_of_stay_days = serializers.IntegerField(
        required=False, allow_null=True,
        help_text="Days since admission.",
    )
    condition_status = serializers.CharField(
        required=False, allow_null=True, allow_blank=True,
        help_text="Latest ward round condition (STABLE, IMPROVING, DETERIORATING, CRITICAL).",
    )
    diet = serializers.CharField(
        required=False, allow_null=True, allow_blank=True,
        help_text="Diet orders for the patient.",
    )
    special_instructions = serializers.CharField(
        required=False, allow_null=True, allow_blank=True,
        help_text="Special nursing instructions.",
    )


class AIPageContextSerializer(serializers.Serializer):
    """
    Page context sent to TibaBot.

    Tells TibaBot which page the user is currently viewing so it can
    provide contextually relevant responses. No PII — just route,
    page title, and module name.
    """

    route = serializers.CharField(
        max_length=500,
        help_text="Current route path (e.g., '/patients/123', '/pharmacy').",
    )
    page_title = serializers.CharField(
        max_length=200,
        help_text="Human-readable page title from navigation config.",
    )
    module = serializers.CharField(
        max_length=100,
        help_text="Top-level module (e.g., 'patients', 'encounters', 'pharmacy').",
    )


class ClinicalChatRequestSerializer(serializers.Serializer):
    """Request body for POST /api/ai/clinical/chat/."""

    message = serializers.CharField(
        min_length=1,
        max_length=10000,
        help_text="User message to the clinical assistant.",
    )
    session_id = serializers.CharField(
        required=False,
        allow_null=True,
        help_text="Existing session ID to continue a conversation.",
    )
    # Encounter-aware context (optional — forwarded when clinician is on encounter page)
    patient_context = AIPatientContextSerializer(required=False, allow_null=True)
    encounter_context = AIEncounterContextSerializer(required=False, allow_null=True)
    # Page context — auto-populated by the frontend from the current route
    page_context = AIPageContextSerializer(required=False, allow_null=True)
    # Context — auto-enriched by the view, but accepted if sent by frontend
    user_context = AIUserContextSerializer(required=False, allow_null=True)
    facility_context = AIFacilityContextSerializer(required=False, allow_null=True)
    verbosity = serializers.ChoiceField(
        choices=["concise", "standard", "educational"],
        default="standard",
        required=False,
        help_text=(
            "Response detail level. "
            "'concise' → terse bullet points (<150 words); "
            "'standard' → balanced with context (default); "
            "'educational' → full reasoning, explains 'why'."
        ),
    )


class ClinicalAssistRequestSerializer(serializers.Serializer):
    """Request body for POST /api/ai/clinical/assist/."""

    query = serializers.CharField(
        min_length=1,
        max_length=10000,
        help_text="Clinical query for contextual reasoning.",
    )
    patient_context = AIPatientContextSerializer(required=False, allow_null=True)
    encounter_context = AIEncounterContextSerializer(required=False, allow_null=True)
    page_context = AIPageContextSerializer(required=False, allow_null=True)
    user_context = AIUserContextSerializer(required=False, allow_null=True)
    facility_context = AIFacilityContextSerializer(required=False, allow_null=True)
    verbosity = serializers.ChoiceField(
        choices=["concise", "standard", "educational"],
        default="standard",
        required=False,
        help_text=(
            "Response detail level. "
            "'concise' → terse bullet points (<150 words); "
            "'standard' → balanced with context (default); "
            "'educational' → full reasoning, explains 'why'."
        ),
    )


# =============================================================================
# Phase 2 — Response Serializers (match frontend Zod schemas exactly)
# =============================================================================


class AIChatMessageSerializer(serializers.Serializer):
    """
    A single chat message — matches frontend ``AIChatMessageSchema``.

    Fields:
        id: string (UUID)
        role: 'user' | 'assistant' | 'system'
        content: string
        timestamp: string (ISO 8601)

    Note: ``isStreaming`` is frontend-only UI state; the backend never sends it.
    """

    id = serializers.CharField(help_text="Message UUID.")
    role = serializers.ChoiceField(
        choices=["user", "assistant", "system"],
        help_text="Message author role.",
    )
    content = serializers.CharField(help_text="Message text content.")
    timestamp = serializers.CharField(help_text="ISO 8601 timestamp.")


class AIClinicalChatResponseSerializer(serializers.Serializer):
    """
    Response from POST /api/ai/clinical/chat/ — matches
    frontend ``AIClinicalChatResponseSchema``.
    """

    session_id = serializers.CharField(help_text="Chat session UUID.")
    message = AIChatMessageSerializer(help_text="Assistant reply message.")
    error = serializers.CharField(
        required=False,
        allow_null=True,
        help_text="Error message when TibaBot is unreachable.",
    )


class AIClinicalAssistResponseSerializer(serializers.Serializer):
    """
    Response from POST /api/ai/clinical/assist/ — matches
    frontend ``AIClinicalAssistResponseSchema``.
    """

    response = serializers.CharField(help_text="Clinical reasoning text.")
    references = serializers.ListField(
        child=serializers.CharField(),
        required=False,
        help_text="Clinical references / guideline citations.",
    )
    error = serializers.CharField(
        required=False,
        allow_null=True,
        help_text="Error message when TibaBot is unreachable.",
    )


class AIChatSessionSerializer(serializers.Serializer):
    """
    Chat session summary — matches frontend ``AIChatSessionSchema``.
    """

    id = serializers.CharField(help_text="Session UUID.")
    title = serializers.CharField(help_text="Session title.")
    created_at = serializers.CharField(help_text="ISO 8601 creation timestamp.")
    updated_at = serializers.CharField(help_text="ISO 8601 last-update timestamp.")
    message_count = serializers.IntegerField(help_text="Number of messages.")


class AIChatSessionListResponseSerializer(serializers.Serializer):
    """
    Response from GET /api/ai/clinical/chat/sessions/ — matches
    frontend ``AIChatSessionListResponseSchema``.
    """

    sessions = AIChatSessionSerializer(many=True)


class AIChatSessionDetailResponseSerializer(serializers.Serializer):
    """
    Response from GET /api/ai/clinical/chat/session/{id}/ — matches
    frontend ``AIChatSessionDetailResponseSchema``.
    """

    session = AIChatSessionSerializer()
    messages = AIChatMessageSerializer(many=True)


# =============================================================================
# Phase 3 — Condition Predictor
# =============================================================================


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
        default=False,
        help_text="Whether patient is on vasopressor support.",
    )
    on_mechanical_ventilation = serializers.BooleanField(
        required=False,
        default=False,
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

    patient_data = ICUPredictPatientDataSerializer(
        help_text="Patient clinical data for ICU risk prediction.",
    )
    prediction_type = serializers.ChoiceField(
        choices=["predict", "risk-stratify"],
        default="predict",
        help_text='"predict" for ICU admission prediction, '
        '"risk-stratify" for sepsis/deterioration composite score.',
    )


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

    alert_type = serializers.CharField(help_text="Alert category (e.g., sepsis, aki, respiratory_failure).")
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

    error = serializers.CharField(
        required=False,
        allow_null=True,
        help_text="Error message when TibaBot is unreachable.",
    )
