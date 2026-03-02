"""
Serializers for AI proxy endpoints.

Validates requests to and responses from the TibaBot AI service.
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
