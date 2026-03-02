"""
AI proxy views.

All views inherit from AIFeatureGatedMixin which returns 404 when
TIBABOT_ENABLED is False — no endpoint discovery or partial behavior.

All TibaBot interactions are audit-logged.
"""

import logging

from rest_framework import permissions, status
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from hmis.apps.core.models import AuditLog

from .client import TibaBotError, TibaBotUnavailableError, get_tibabot_client
from .feature_flags import AIFeatureGatedMixin, is_ai_enabled
from .sanitizer import sanitize_clinical_text
from .serializers import (
    AIStatusResponseSerializer,
    ICD10SuggestRequestSerializer,
    ICD10SuggestResponseSerializer,
)

logger = logging.getLogger(__name__)


class ICD10SuggestView(AIFeatureGatedMixin, APIView):
    """
    Proxy endpoint for TibaBot ICD-10 auto-coding.

    POST /api/ai/icd10-suggest/
    Body: { "clinical_text": "patient presenting with malaria symptoms and fever" }

    Returns ranked ICD-10 code suggestions with confidence scores.
    Advisory only — clinician must confirm/reject each suggestion.
    """

    permission_classes = [permissions.IsAuthenticated]

    @staticmethod
    def _get_client_ip(request: Request) -> str:
        """Extract client IP from request headers."""
        x_forwarded_for = request.META.get("HTTP_X_FORWARDED_FOR")
        if x_forwarded_for:
            return x_forwarded_for.split(",")[0].strip()
        return request.META.get("REMOTE_ADDR", "")

    def post(self, request: Request) -> Response:
        # Validate input
        serializer = ICD10SuggestRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        clinical_text: str = serializer.validated_data["clinical_text"]

        # Sanitize before sending to TibaBot
        sanitized_text = sanitize_clinical_text(clinical_text)

        # Audit log the AI request
        AuditLog.log(
            action="ai_icd10_suggest",
            user=request.user,
            resource_type="AI",
            resource_id=0,
            ip_address=self._get_client_ip(request),
            user_agent=request.META.get("HTTP_USER_AGENT", ""),
            details={
                "text_length": len(clinical_text),
                "sanitized_text_preview": sanitized_text[:100],
            },
        )

        # Call TibaBot with sanitized text
        try:
            client = get_tibabot_client()
            result = client.suggest_icd10(sanitized_text)
        except TibaBotUnavailableError:
            logger.warning("TibaBot unavailable for ICD-10 suggest")
            return Response(
                {
                    "suggestions": [],
                    "error": "AI suggestions temporarily unavailable. Use manual search.",
                },
                status=status.HTTP_200_OK,
            )
        except TibaBotError as e:
            logger.error("TibaBot error for ICD-10 suggest: %s", e)
            return Response(
                {
                    "suggestions": [],
                    "error": "AI service error. Use manual search.",
                },
                status=status.HTTP_200_OK,
            )

        # Normalize the response — TibaBot may return different shapes
        suggestions = result.get("suggestions", [])
        if not isinstance(suggestions, list):
            suggestions = []

        # Validate outbound response
        response_data = {
            "suggestions": suggestions,
            "clinical_text_preview": sanitized_text[:100],
        }
        response_serializer = ICD10SuggestResponseSerializer(data=response_data)
        if response_serializer.is_valid():
            return Response(response_serializer.data)

        # If TibaBot returned unexpected shape, return empty gracefully
        logger.warning(
            "TibaBot returned unexpected response shape: %s",
            response_serializer.errors,
        )
        return Response(
            {
                "suggestions": [],
                "error": "AI returned unexpected data. Use manual search.",
            },
            status=status.HTTP_200_OK,
        )


class AIStatusView(APIView):
    """
    Check AI feature status.

    GET /api/ai/status/

    Returns whether AI features are enabled and if TibaBot is reachable.
    This endpoint is NOT gated — it's used by the frontend to decide
    whether to render AI components.
    """

    permission_classes = [permissions.IsAuthenticated]

    def get(self, request: Request) -> Response:
        enabled = is_ai_enabled()
        service_available = False

        if enabled:
            try:
                client = get_tibabot_client()
                # Quick health check — try a lightweight request
                client._request("GET", "/health")
                service_available = True
            except (TibaBotError, Exception):
                service_available = False

        data = {
            "enabled": enabled,
            "service_name": "TibaBot",
            "service_available": service_available,
        }
        serializer = AIStatusResponseSerializer(data)
        return Response(serializer.data)
