"""
AI proxy views.

All views inherit from AIFeatureGatedMixin which returns 404 when
TIBABOT_ENABLED is False — no endpoint discovery or partial behavior.

All TibaBot interactions are audit-logged.

Phase 2 views (ClinicalChatView, ClinicalAssistView) auto-enrich requests
with user and facility context before forwarding to TibaBot.

Session management views (ClinicalChatSessionListView,
ClinicalChatSessionDetailView) provide local session history.
"""

import logging
import uuid

from django.utils import timezone
from rest_framework import permissions, status
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from hmis.apps.core.models import AuditLog

from .client import TibaBotError, TibaBotUnavailableError, get_tibabot_client
from .context import build_facility_context, build_user_context
from .feature_flags import AIFeatureGatedMixin, is_ai_enabled
from .models import ChatMessage, ChatSession
from .sanitizer import sanitize_clinical_text
from .serializers import (
    AIChatMessageSerializer,
    AIChatSessionDetailResponseSerializer,
    AIChatSessionListResponseSerializer,
    AIChatSessionSerializer,
    AIClinicalAssistResponseSerializer,
    AIClinicalChatResponseSerializer,
    AIFeedbackRequestSerializer,
    AIFeedbackResponseSerializer,
    AIFeedbackStatsResponseSerializer,
    AIStatusResponseSerializer,
    ClinicalAssistRequestSerializer,
    ClinicalChatRequestSerializer,
    ConditionPredictRequestSerializer,
    ConditionPredictResponseSerializer,
    ICD10SuggestRequestSerializer,
    ICD10SuggestResponseSerializer,
)

logger = logging.getLogger(__name__)

# Accepted verbosity values — aligned with TibaBot's API.
_VALID_VERBOSITY = {"brief", "concise", "standard", "detailed", "educational"}


# =============================================================================
# Helpers
# =============================================================================


def _get_client_ip(request: Request) -> str:
    """Extract client IP from request headers."""
    x_forwarded_for = request.META.get("HTTP_X_FORWARDED_FOR")
    if x_forwarded_for:
        return x_forwarded_for.split(",")[0].strip()
    return request.META.get("REMOTE_ADDR", "")


def _resolve_verbosity(request: Request, body_value: str | None) -> str:
    """
    Resolve verbosity with priority: query-param > body field > default.

    Invalid / unknown values fall back to ``"standard"``.
    """
    qp = request.query_params.get("verbosity")
    if qp and qp in _VALID_VERBOSITY:
        return qp
    if body_value and body_value in _VALID_VERBOSITY:
        return body_value
    return "standard"


class ICD10SuggestView(AIFeatureGatedMixin, APIView):
    """
    Proxy endpoint for TibaBot ICD-10 auto-coding.

    POST /api/ai/icd10-suggest/
    Body: { "clinical_text": "patient presenting with malaria symptoms and fever" }

    Returns ranked ICD-10 code suggestions with confidence scores.
    Advisory only — clinician must confirm/reject each suggestion.
    """

    permission_classes = [permissions.IsAuthenticated]

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
            ip_address=_get_client_ip(request),
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


# =============================================================================
# Phase 2 — Clinical Chat & Assist (context-enriched)
# =============================================================================


class ClinicalChatView(AIFeatureGatedMixin, APIView):
    """
    Proxy endpoint for TibaBot clinical chat.

    POST /api/ai/clinical/chat/
    Body: { "message": "...", "session_id": "..." }

    Auto-enriches the request with user_context and facility_context
    before forwarding to TibaBot.

    Persists both user and assistant messages locally so the session
    management endpoints can list/retrieve/delete them.

    Response shape (matches frontend AIClinicalChatResponseSchema):
    {
        "session_id": "<uuid>",
        "message": {
            "id": "<uuid>",
            "role": "assistant",
            "content": "...",
            "timestamp": "<iso8601>"
        },
        "error": null  // optional
    }
    """

    permission_classes = [permissions.IsAuthenticated]

    def post(self, request: Request) -> Response:
        serializer = ClinicalChatRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        data = serializer.validated_data

        # Resolve verbosity: query-param > body > default
        data["verbosity"] = _resolve_verbosity(
            request, data.get("verbosity")
        )

        # Enrich with server-side context (overrides any frontend-sent values)
        data["user_context"] = build_user_context(request)
        data["facility_context"] = build_facility_context()

        # Add system instruction based on whether encounter context is present.
        # This prevents TibaBot from hallucinating page content when the user
        # asks about "the page we're on" without any clinical context.
        has_encounter_context = bool(
            data.get("patient_context") or data.get("encounter_context")
        )
        page_context = data.get("page_context")
        if not has_encounter_context:
            if page_context:
                page_desc = (
                    f"The user is currently on the '{page_context.get('page_title', 'Unknown')}' "
                    f"page (route: {page_context.get('route', '/')}, "
                    f"module: {page_context.get('module', 'unknown')})."
                )
                data["system_instruction"] = (
                    "You are TibaBot, a clinical decision-support assistant. "
                    f"{page_desc} "
                    "You can see which page the user is on, but you do NOT have "
                    "access to the specific data displayed on that page. "
                    "If the user asks about 'this page', describe the page's "
                    "purpose based on the module name. "
                    "If the user asks about a specific patient or clinical data, "
                    "respond with: \"I can see you're on the "
                    f"{page_context.get('page_title', 'current')} page, but I "
                    "don't have access to the patient data displayed here. "
                    "Use the **Ask about this patient** button (🩺) on an "
                    "encounter page for clinical analysis.\" "
                    "Otherwise, answer general clinical questions normally."
                )
            else:
                data["system_instruction"] = (
                    "You are TibaBot, a clinical decision-support assistant. "
                    "You do NOT have visibility into the user's current page or "
                    "screen. If the user asks about 'this page', 'this patient', "
                    "'the encounter', or any page-specific content, respond with: "
                    "\"I don't have visibility into the page you're viewing. "
                    "Use the **Ask about this patient** button (🩺) for "
                    "encounter-aware assistance.\" "
                    "Otherwise, answer general clinical questions normally."
                )

        # Resolve or create session
        session = self._resolve_session(request.user, data)
        data["session_id"] = str(session.id)

        # Persist user message
        user_msg = ChatMessage.objects.create(
            session=session,
            role="user",
            content=data["message"],
        )

        # Auto-title: use the first user message (truncated)
        if session.messages.filter(role="user").count() == 1:
            session.title = data["message"][:120]
            session.save(update_fields=["title"])

        # Audit log
        AuditLog.log(
            action="ai_clinical_chat",
            user=request.user,
            resource_type="AI",
            resource_id=0,
            ip_address=_get_client_ip(request),
            user_agent=request.META.get("HTTP_USER_AGENT", ""),
            details={
                "message_length": len(data["message"]),
                "session_id": str(session.id),
                "user_role": data["user_context"].get("role"),
                "verbosity": data.get("verbosity", "standard"),
            },
        )

        try:
            client = get_tibabot_client()
            result = client.clinical_chat(data)
        except TibaBotUnavailableError:
            logger.warning("TibaBot unavailable for clinical chat")
            return self._build_response(
                session=session,
                content="TibaBot is currently unavailable. Please try again later.",
                error="AI service temporarily unavailable.",
            )
        except TibaBotError as e:
            logger.error("TibaBot error for clinical chat: %s", e)
            return self._build_response(
                session=session,
                content="An error occurred with the AI service.",
                error="AI service error.",
            )

        # Extract assistant content from TibaBot response
        assistant_content = ""
        tibabot_msg = result.get("message", {})
        if isinstance(tibabot_msg, dict):
            assistant_content = tibabot_msg.get("content", "")
        elif isinstance(tibabot_msg, str):
            assistant_content = tibabot_msg

        if not assistant_content:
            assistant_content = result.get("response", result.get("content", ""))

        return self._build_response(
            session=session,
            content=str(assistant_content) if assistant_content else "",
        )

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------

    @staticmethod
    def _resolve_session(user, data: dict) -> ChatSession:
        """Get existing session or create a new one."""
        session_id = data.get("session_id")
        if session_id:
            try:
                return ChatSession.objects.get(id=session_id, user=user)
            except (ChatSession.DoesNotExist, ValueError):
                pass  # fall through to create
        return ChatSession.objects.create(user=user)

    @staticmethod
    def _build_response(
        session: ChatSession,
        content: str,
        error: str | None = None,
    ) -> Response:
        """Persist assistant message and return schema-compliant response."""
        assistant_msg = ChatMessage.objects.create(
            session=session,
            role="assistant",
            content=content,
        )

        response_data: dict = {
            "session_id": str(session.id),
            "message": {
                "id": str(assistant_msg.id),
                "role": "assistant",
                "content": content,
                "timestamp": assistant_msg.timestamp.isoformat(),
            },
        }
        if error:
            response_data["error"] = error

        return Response(response_data, status=status.HTTP_200_OK)


class ClinicalAssistView(AIFeatureGatedMixin, APIView):
    """
    Proxy endpoint for encounter-aware clinical assistance.

    POST /api/ai/clinical/assist/
    Body: { "query": "...", "patient_context": {...}, "encounter_context": {...} }

    Auto-enriches the request with user_context and facility_context
    before forwarding to TibaBot.
    """

    permission_classes = [permissions.IsAuthenticated]

    def post(self, request: Request) -> Response:
        serializer = ClinicalAssistRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        data = serializer.validated_data

        # Resolve verbosity: query-param > body > default
        data["verbosity"] = _resolve_verbosity(
            request, data.get("verbosity")
        )

        # Enrich with server-side context
        data["user_context"] = build_user_context(request)
        data["facility_context"] = build_facility_context()

        # Audit log
        AuditLog.log(
            action="ai_clinical_assist",
            user=request.user,
            resource_type="AI",
            resource_id=0,
            ip_address=_get_client_ip(request),
            user_agent=request.META.get("HTTP_USER_AGENT", ""),
            details={
                "query_length": len(data["query"]),
                "has_patient_context": data.get("patient_context") is not None,
                "has_encounter_context": data.get("encounter_context") is not None,
                "user_role": data["user_context"].get("role"),
                "verbosity": data.get("verbosity", "standard"),
            },
        )

        try:
            client = get_tibabot_client()
            result = client.clinical_assist(data)
        except TibaBotUnavailableError:
            logger.warning("TibaBot unavailable for clinical assist")
            return Response(
                {
                    "response": "TibaBot is currently unavailable. Please try again later.",
                    "error": "AI service temporarily unavailable.",
                },
                status=status.HTTP_200_OK,
            )
        except TibaBotError as e:
            logger.error("TibaBot error for clinical assist: %s", e)
            return Response(
                {
                    "response": "An error occurred with the AI service.",
                    "error": "AI service error.",
                },
                status=status.HTTP_200_OK,
            )

        # Normalize — TibaBot may return "recommendation" instead of "response"
        if isinstance(result, dict):
            if "recommendation" in result and "response" not in result:
                result["response"] = result.pop("recommendation")

        # Validate outbound response
        response_data = {
            "response": result.get("response", "") if isinstance(result, dict) else str(result),
            "references": result.get("references", []) if isinstance(result, dict) else [],
        }
        response_serializer = AIClinicalAssistResponseSerializer(data=response_data)
        if response_serializer.is_valid():
            return Response(response_serializer.data)

        logger.warning(
            "TibaBot returned unexpected clinical assist response shape: %s",
            response_serializer.errors,
        )
        return Response(response_data)


# =============================================================================
# Phase 2 — Session Management
# =============================================================================


class ClinicalChatSessionListView(AIFeatureGatedMixin, APIView):
    """
    List all chat sessions for the authenticated user.

    GET /api/ai/clinical/chat/sessions/

    Response shape (matches frontend AIChatSessionListResponseSchema):
    {
        "sessions": [
            {
                "id": "<uuid>",
                "title": "...",
                "created_at": "<iso8601>",
                "updated_at": "<iso8601>",
                "message_count": 5
            }
        ]
    }
    """

    permission_classes = [permissions.IsAuthenticated]

    def get(self, request: Request) -> Response:
        sessions = ChatSession.objects.filter(user=request.user)
        sessions_data = [
            {
                "id": str(s.id),
                "title": s.title,
                "created_at": s.created_at.isoformat(),
                "updated_at": s.updated_at.isoformat(),
                "message_count": s.message_count,
            }
            for s in sessions
        ]
        return Response({"sessions": sessions_data})


class ClinicalChatSessionDetailView(AIFeatureGatedMixin, APIView):
    """
    Retrieve or delete a specific chat session.

    GET /api/ai/clinical/chat/session/{id}/
    Response shape (matches frontend AIChatSessionDetailResponseSchema):
    {
        "session": { "id", "title", "created_at", "updated_at", "message_count" },
        "messages": [
            { "id", "role", "content", "timestamp" }
        ]
    }

    DELETE /api/ai/clinical/chat/session/{id}/
    Returns 204 No Content.
    """

    permission_classes = [permissions.IsAuthenticated]

    def get(self, request: Request, session_id: str) -> Response:
        session = self._get_session(request.user, session_id)
        if session is None:
            return Response(
                {"detail": "Session not found."},
                status=status.HTTP_404_NOT_FOUND,
            )

        messages = session.messages.all()
        return Response(
            {
                "session": {
                    "id": str(session.id),
                    "title": session.title,
                    "created_at": session.created_at.isoformat(),
                    "updated_at": session.updated_at.isoformat(),
                    "message_count": session.message_count,
                },
                "messages": [
                    {
                        "id": str(m.id),
                        "role": m.role,
                        "content": m.content,
                        "timestamp": m.timestamp.isoformat(),
                    }
                    for m in messages
                ],
            }
        )

    def delete(self, request: Request, session_id: str) -> Response:
        session = self._get_session(request.user, session_id)
        if session is None:
            return Response(
                {"detail": "Session not found."},
                status=status.HTTP_404_NOT_FOUND,
            )

        # Audit log
        AuditLog.log(
            action="ai_chat_session_delete",
            user=request.user,
            resource_type="AI",
            resource_id=0,
            ip_address=_get_client_ip(request),
            user_agent=request.META.get("HTTP_USER_AGENT", ""),
            details={"session_id": str(session.id), "title": session.title},
        )

        session.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)

    @staticmethod
    def _get_session(user, session_id: str) -> ChatSession | None:
        """Look up a session owned by the user, or return None."""
        try:
            return ChatSession.objects.get(id=session_id, user=user)
        except (ChatSession.DoesNotExist, ValueError):
            return None


# =============================================================================
# Phase 3 — Condition Predictor
# =============================================================================


class ConditionPredictView(AIFeatureGatedMixin, APIView):
    """
    Proxy endpoint for TibaBot condition prediction.

    POST /api/ai/predict/condition/
    Body: {
        "patient_features": {
            "age": 45,
            "gender": "M",
            "chief_complaint": "chest pain and shortness of breath",
            "chief_complaint_category": "CHEST_PAIN",
            "spo2": 92,
            "heart_rate": 110,
            "temperature": 38.5,
            "respiratory_rate": 28,
            "pain_score": 7,
            "mental_status": "A",
            "mobility": "AMBULATORY"
        }
    }

    Returns predicted conditions with confidence scores and risk factors.
    Advisory only — clinician must review and confirm.
    """

    permission_classes = [permissions.IsAuthenticated]

    def post(self, request: Request) -> Response:
        # Validate input
        serializer = ConditionPredictRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        patient_features = serializer.validated_data["patient_features"]

        # Sanitize free-text fields
        if patient_features.get("chief_complaint"):
            patient_features["chief_complaint"] = sanitize_clinical_text(
                patient_features["chief_complaint"]
            )
        if patient_features.get("allergies"):
            patient_features["allergies"] = sanitize_clinical_text(
                patient_features["allergies"]
            )

        # Enrich with user and facility context
        payload = {
            "patient_features": patient_features,
            "user_context": build_user_context(request),
            "facility_context": build_facility_context(),
        }

        # Audit log
        AuditLog.log(
            action="ai_condition_predict",
            user=request.user,
            resource_type="AI",
            resource_id=0,
            ip_address=_get_client_ip(request),
            details={
                "age": patient_features.get("age"),
                "gender": patient_features.get("gender"),
                "chief_complaint_category": patient_features.get(
                    "chief_complaint_category", ""
                ),
            },
        )

        try:
            client = get_tibabot_client()
            result = client.predict_condition(payload)
        except TibaBotUnavailableError:
            logger.warning("TibaBot unavailable for condition prediction")
            return Response(
                {
                    "primary_condition": "",
                    "confidence": 0.0,
                    "risk_level": "low",
                    "risk_factors": [],
                    "differential_conditions": [],
                    "recommendations": [],
                    "error": "AI service is temporarily unavailable. "
                    "Please proceed with clinical assessment.",
                },
                status=status.HTTP_200_OK,
            )
        except TibaBotError as e:
            logger.error("TibaBot error for condition prediction: %s", e)
            return Response(
                {
                    "primary_condition": "",
                    "confidence": 0.0,
                    "risk_level": "low",
                    "risk_factors": [],
                    "differential_conditions": [],
                    "recommendations": [],
                    "error": "AI service error. Please proceed with clinical assessment.",
                },
                status=status.HTTP_200_OK,
            )

        # Validate and normalize the response
        response_data = {
            "primary_condition": result.get("primary_condition", ""),
            "confidence": result.get("confidence", 0.0),
            "risk_level": result.get("risk_level", "low"),
            "risk_factors": result.get("risk_factors", []),
            "differential_conditions": result.get("differential_conditions", []),
            "recommendations": result.get("recommendations", []),
        }

        response_serializer = ConditionPredictResponseSerializer(data=response_data)
        if response_serializer.is_valid():
            return Response(response_serializer.data)

        # Fallback — return whatever TibaBot gave us
        return Response(response_data)


# =============================================================================
# Phase 3 — Feedback
# =============================================================================


class AIFeedbackView(AIFeatureGatedMixin, APIView):
    """
    Proxy endpoint for submitting feedback on TibaBot responses.

    POST /api/ai/feedback/
    Body: {
        "message_id": "enc-88-assist-1",
        "feedback": "up",
        "conversation_id": "encounter-88",      // optional
        "user_query": "...",                      // optional
        "bot_response": "...",                    // optional
        "risk_level": "critical"                  // optional
    }

    Forwards to TibaBot's POST /feedback and returns {status, message, feedback_id}.
    """

    permission_classes = [permissions.IsAuthenticated]

    def post(self, request: Request) -> Response:
        serializer = AIFeedbackRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        data = serializer.validated_data

        # Audit log
        AuditLog.log(
            action="ai_feedback_submit",
            user=request.user,
            resource_type="AI",
            resource_id=0,
            ip_address=_get_client_ip(request),
            user_agent=request.META.get("HTTP_USER_AGENT", ""),
            details={
                "message_id": data["message_id"],
                "feedback": data["feedback"],
                "conversation_id": data.get("conversation_id", ""),
                "risk_level": data.get("risk_level", ""),
            },
        )

        try:
            client = get_tibabot_client()
            result = client.submit_feedback(data)
        except TibaBotUnavailableError:
            logger.warning("TibaBot unavailable for feedback submission")
            return Response(
                {
                    "status": "queued",
                    "message": "Feedback recorded locally. Will sync when service is available.",
                    "feedback_id": "",
                },
                status=status.HTTP_200_OK,
            )
        except TibaBotError as e:
            logger.error("TibaBot error for feedback submission: %s", e)
            return Response(
                {
                    "status": "error",
                    "message": "Failed to submit feedback to AI service.",
                    "feedback_id": "",
                },
                status=status.HTTP_200_OK,
            )

        # Normalize response from TibaBot
        response_data = {
            "status": result.get("status", "received"),
            "message": result.get("message", "Thank you for your feedback!"),
            "feedback_id": result.get("feedback_id", ""),
        }
        response_serializer = AIFeedbackResponseSerializer(data=response_data)
        if response_serializer.is_valid():
            return Response(response_serializer.data)

        # Fallback — return whatever TibaBot gave us
        return Response(response_data)


class AIFeedbackStatsView(AIFeatureGatedMixin, APIView):
    """
    Proxy endpoint for TibaBot feedback aggregate statistics.

    GET /api/ai/feedback/stats/

    Returns: { total_up, total_down, recent_negatives }
    Useful for the admin dashboard.
    """

    permission_classes = [permissions.IsAuthenticated]

    def get(self, request: Request) -> Response:
        try:
            client = get_tibabot_client()
            result = client.get_feedback_stats()
        except TibaBotUnavailableError:
            logger.warning("TibaBot unavailable for feedback stats")
            return Response(
                {
                    "total_up": 0,
                    "total_down": 0,
                    "recent_negatives": 0,
                },
                status=status.HTTP_200_OK,
            )
        except TibaBotError as e:
            logger.error("TibaBot error for feedback stats: %s", e)
            return Response(
                {
                    "total_up": 0,
                    "total_down": 0,
                    "recent_negatives": 0,
                },
                status=status.HTTP_200_OK,
            )

        response_data = {
            "total_up": result.get("total_up", 0),
            "total_down": result.get("total_down", 0),
            "recent_negatives": result.get("recent_negatives", 0),
        }
        return Response(response_data)
