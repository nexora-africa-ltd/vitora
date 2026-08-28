# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
# ruff: noqa
"""Ai serializers core context for Vitora HMIS.

What this file is for:
- Implement serializers core context logic for the ai domain.

How to use it:
- Import classes and functions from this module in Django app code and tests.

Supported inputs/args:
- Python imports and Django ORM/runtime inputs; no standalone CLI arguments.
"""

from rest_framework import serializers


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
    is_billable = serializers.BooleanField(
        required=False,
        default=False,
        help_text="Whether this code is specific enough for billing/SHA claims.",
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
    allergies = serializers.ListField(child=serializers.CharField(), required=False, default=list)
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
    clinical_notes = serializers.CharField(
        required=False,
        allow_null=True,
        allow_blank=True,
        help_text="Compact clinical summary for source encounter and ward-round progression.",
    )
    vitals = AIVitalsSerializer(required=False, allow_null=True)

    # Inpatient fields (optional — only set on admission/ward round pages)
    admission_diagnosis = serializers.CharField(
        required=False,
        allow_null=True,
        allow_blank=True,
        help_text="Admitting diagnosis text (no PII).",
    )
    ward_name = serializers.CharField(
        required=False,
        allow_null=True,
        allow_blank=True,
        help_text="Ward name (e.g., 'Medical Ward 1').",
    )
    bed_number = serializers.CharField(
        required=False,
        allow_null=True,
        allow_blank=True,
        help_text="Bed number (e.g., 'B-005').",
    )
    admission_status = serializers.CharField(
        required=False,
        allow_null=True,
        allow_blank=True,
        help_text="Admission status (ACTIVE, DISCHARGED, etc.).",
    )
    length_of_stay_days = serializers.IntegerField(
        required=False,
        allow_null=True,
        help_text="Days since admission.",
    )
    condition_status = serializers.CharField(
        required=False,
        allow_null=True,
        allow_blank=True,
        help_text="Latest ward round condition (STABLE, IMPROVING, DETERIORATING, CRITICAL).",
    )
    diet = serializers.CharField(
        required=False,
        allow_null=True,
        allow_blank=True,
        help_text="Diet orders for the patient.",
    )
    special_instructions = serializers.CharField(
        required=False,
        allow_null=True,
        allow_blank=True,
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
    stream = serializers.BooleanField(
        required=False,
        default=False,
        help_text="When true, response is streamed as SSE chunks.",
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
