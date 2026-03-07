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
    rag_initialized = serializers.BooleanField(required=False, default=False)
    demo_mode = serializers.BooleanField(required=False, default=False)


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
        choices=["autopopulate", "clerking_autocomplete"],
        help_text="Suggestion workflow that produced the accepted value.",
    )
    event_type = serializers.ChoiceField(
        choices=["accepted", "applied"],
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

    admission_id = serializers.IntegerField(
        required=False, allow_null=True, default=None,
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


# =============================================================================
# Phase 5 — Lab Assist
# =============================================================================


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
    timestamp = serializers.DateTimeField(
        required=False,
        allow_null=True,
        help_text="When the sample was collected.",
    )


class LabInterpretRequestSerializer(serializers.Serializer):
    """Request body for POST /api/ai/lab/interpret/."""

    lab_result_id = serializers.IntegerField(
        required=False, allow_null=True, default=None,
        help_text="Link result to this lab result for persistence.",
    )
    encounter_id = serializers.IntegerField(
        required=False, allow_null=True, default=None,
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
        required=False, allow_blank=True,
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
    systolic_bp = serializers.FloatField(required=False, allow_null=True, min_value=0, max_value=300)
    diastolic_bp = serializers.FloatField(required=False, allow_null=True, min_value=0, max_value=200)
    temperature = serializers.FloatField(required=False, allow_null=True, min_value=25, max_value=45)
    respiratory_rate = serializers.FloatField(required=False, allow_null=True, min_value=0, max_value=80)
    oxygen_saturation = serializers.FloatField(required=False, allow_null=True, min_value=0, max_value=100)


class DischargeAssessRequestSerializer(serializers.Serializer):
    """Request body for POST /api/ai/discharge/assess/."""

    admission_id = serializers.IntegerField(
        required=False, allow_null=True, default=None,
        help_text="Link result to this admission for persistence.",
    )
    patient_age = serializers.IntegerField(
        min_value=0, max_value=120,
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

    name = serializers.CharField()
    category = serializers.CharField(
        help_text="vitals, labs, functional, medication, social, follow_up.",
    )
    met = serializers.BooleanField()
    details = serializers.CharField(required=False, allow_blank=True)


class DischargeAssessResponseSerializer(serializers.Serializer):
    """Response from POST /api/ai/discharge/assess/."""

    readiness_score = serializers.FloatField(min_value=0.0, max_value=1.0)
    readiness_level = serializers.ChoiceField(
        choices=["ready", "near_ready", "not_ready"],
    )
    criteria = DischargeCriterionSerializer(many=True)
    unmet_criteria_count = serializers.IntegerField()
    readmission_risk = serializers.FloatField(
        required=False, allow_null=True, min_value=0.0, max_value=1.0,
    )
    readmission_risk_level = serializers.CharField(
        required=False, allow_null=True,
    )
    recommendations = serializers.ListField(
        child=serializers.CharField(),
        required=False,
    )
    vitals_stability = serializers.CharField(
        required=False, allow_null=True,
    )
    mode = serializers.CharField(required=False)
    error = serializers.CharField(required=False, allow_null=True)


# =============================================================================
# Phase 5 — Care Plan Generator
# =============================================================================


class CarePlanGenerateRequestSerializer(serializers.Serializer):
    """Request body for POST /api/ai/care-plan/generate/."""

    encounter_id = serializers.IntegerField(
        required=False, allow_null=True, default=None,
        help_text="Link result to this encounter for persistence.",
    )
    admission_id = serializers.IntegerField(
        required=False, allow_null=True, default=None,
        help_text="Link result to this admission for persistence.",
    )
    primary_diagnosis = serializers.CharField(
        required=False, allow_blank=True, max_length=500,
        help_text="Confirmed primary diagnosis (if available).",
    )
    chief_complaint = serializers.CharField(
        required=False, allow_blank=True, max_length=500,
        help_text="Presenting complaint from triage (used when no diagnosis yet).",
    )
    icd10_code = serializers.CharField(
        required=False, allow_blank=True, max_length=20,
    )
    severity = serializers.CharField(
        required=False, allow_blank=True, max_length=100,
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
        many=True, required=False, default=list,
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
# Phase 5 — Enhanced CDS Evaluation
# =============================================================================


class CDSEvaluateRequestSerializer(serializers.Serializer):
    """Request body for POST /api/ai/cds/evaluate/."""

    encounter_id = serializers.IntegerField(
        required=False, allow_null=True, default=None,
        help_text="Link result to this encounter for persistence.",
    )
    medications = serializers.ListField(
        child=serializers.CharField(max_length=200),
        required=False, default=list,
    )
    diagnoses = serializers.ListField(
        child=serializers.CharField(max_length=200),
        required=False, default=list,
    )
    symptoms = serializers.ListField(
        child=serializers.CharField(max_length=200),
        required=False, default=list,
    )
    pending_procedures = serializers.ListField(
        child=serializers.CharField(max_length=200),
        required=False, default=list,
    )
    lab_results = serializers.DictField(
        required=False, default=dict,
        help_text="Lab results as test_name → value mapping.",
    )
    allergies = serializers.ListField(
        child=serializers.CharField(max_length=200),
        required=False, default=list,
    )
    patient_age = serializers.IntegerField(
        required=False, allow_null=True, min_value=0, max_value=120,
    )
    patient_sex = serializers.ChoiceField(
        choices=["male", "female"],
        required=False, allow_null=True,
    )
    is_pregnant = serializers.BooleanField(required=False, default=False)
    region = serializers.CharField(
        required=False, allow_blank=True, max_length=100,
    )
    facility_level = serializers.CharField(
        required=False, allow_blank=True, max_length=10,
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
