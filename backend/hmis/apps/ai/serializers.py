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
    bp = serializers.CharField(required=False, allow_null=True)


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
    """Encounter context for Clinical Assist."""

    chief_complaint = serializers.CharField(required=False, allow_null=True)
    vitals = AIVitalsSerializer(required=False, allow_null=True)


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
    # Context — auto-enriched by the view, but accepted if sent by frontend
    user_context = AIUserContextSerializer(required=False, allow_null=True)
    facility_context = AIFacilityContextSerializer(required=False, allow_null=True)


class ClinicalAssistRequestSerializer(serializers.Serializer):
    """Request body for POST /api/ai/clinical/assist/."""

    query = serializers.CharField(
        min_length=1,
        max_length=10000,
        help_text="Clinical query for contextual reasoning.",
    )
    patient_context = AIPatientContextSerializer(required=False, allow_null=True)
    encounter_context = AIEncounterContextSerializer(required=False, allow_null=True)
    user_context = AIUserContextSerializer(required=False, allow_null=True)
    facility_context = AIFacilityContextSerializer(required=False, allow_null=True)
    verbosity = serializers.ChoiceField(
        choices=["brief", "standard", "detailed"],
        default="standard",
        required=False,
        help_text="Response detail level.",
    )
