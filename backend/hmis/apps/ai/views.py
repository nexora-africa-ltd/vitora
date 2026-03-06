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
    AutopopulateRequestSerializer,
    AutopopulateResponseSerializer,
    ClinicalAssistRequestSerializer,
    ClinicalChatRequestSerializer,
    ConditionPredictRequestSerializer,
    ConditionPredictResponseSerializer,
    ICD10SuggestRequestSerializer,
    ICD10SuggestResponseSerializer,
    ICUPredictRequestSerializer,
    ICUPredictResponseSerializer,
)

logger = logging.getLogger(__name__)

# Accepted verbosity values — aligned with TibaBot's API.
_VALID_VERBOSITY = {"concise", "standard", "educational"}


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


# =============================================================================
# Phase 4 — ICU Predictor
# =============================================================================


class ICUPredictView(AIFeatureGatedMixin, APIView):
    """
    Proxy endpoint for ICU risk prediction via TibaBot.

    POST /api/ai/predict/icu/
    Body: {
        "patient_data": {
            "age": 65, "gender": "M",
            "temperature": 38.5, "heart_rate": 110, "spo2": 91,
            "systolic_bp": 90, "respiratory_rate": 24,
            "wbc": 15.2, "platelets": 120, "creatinine": 2.1, ...
        },
        "prediction_type": "predict" | "risk-stratify"
    }

    Returns SOFA/qSOFA scores, critical alerts, escalation recommendations.
    Advisory only — clinician must review and confirm.

    Supports two prediction types:
    - ``predict``: ICU admission risk with SOFA/qSOFA scores
    - ``risk-stratify``: Sepsis/AKI/deterioration composite risk scores

    Both types are forwarded to TibaBot's respective endpoints:
    - POST /predict/icu/predict
    - POST /predict/icu/risk-stratify
    """

    permission_classes = [permissions.IsAuthenticated]

    # Default empty response structure for graceful degradation
    _EMPTY_RESPONSE: dict = {
        "risk_level": "low",
        "risk_score": 0.0,
        "sofa_score": None,
        "sofa_breakdown": None,
        "qsofa_score": None,
        "qsofa_criteria": [],
        "critical_alerts": [],
        "escalation": None,
        "recommendations": [],
        "sepsis_probability": None,
        "aki_probability": None,
        "deterioration_probability": None,
    }

    def post(self, request: Request) -> Response:
        # Validate input
        serializer = ICUPredictRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        patient_data = serializer.validated_data["patient_data"]
        prediction_type = serializer.validated_data.get("prediction_type", "predict")

        # Sanitize free-text fields
        if patient_data.get("admission_diagnosis"):
            patient_data["admission_diagnosis"] = sanitize_clinical_text(
                patient_data["admission_diagnosis"]
            )

        # Enrich with user and facility context
        payload = {
            "patient_data": patient_data,
            "user_context": build_user_context(request),
            "facility_context": build_facility_context(),
        }

        # Audit log
        AuditLog.log(
            action="ai_icu_predict",
            user=request.user,
            resource_type="AI",
            resource_id=0,
            ip_address=_get_client_ip(request),
            details={
                "age": patient_data.get("age"),
                "gender": patient_data.get("gender"),
                "prediction_type": prediction_type,
                "has_lab_data": any(
                    patient_data.get(k) is not None
                    for k in ("wbc", "platelets", "creatinine", "bilirubin", "lactate")
                ),
            },
        )

        try:
            client = get_tibabot_client()
            if prediction_type == "risk-stratify":
                result = client.predict_icu_risk_stratify(payload)
            else:
                result = client.predict_icu(payload)
        except TibaBotUnavailableError:
            logger.warning("TibaBot unavailable for ICU prediction")
            return Response(
                {
                    **self._EMPTY_RESPONSE,
                    "error": "AI service is temporarily unavailable. "
                    "Please proceed with clinical assessment.",
                },
                status=status.HTTP_200_OK,
            )
        except TibaBotError as e:
            logger.error("TibaBot error for ICU prediction: %s", e)
            return Response(
                {
                    **self._EMPTY_RESPONSE,
                    "error": "AI service error. Please proceed with clinical assessment.",
                },
                status=status.HTTP_200_OK,
            )

        # Validate and normalize the response
        response_data = {
            "risk_level": result.get("risk_level", "low"),
            "risk_score": result.get("risk_score", 0.0),
            "sofa_score": result.get("sofa_score"),
            "sofa_breakdown": result.get("sofa_breakdown"),
            "qsofa_score": result.get("qsofa_score"),
            "qsofa_criteria": result.get("qsofa_criteria", []),
            "critical_alerts": result.get("critical_alerts", []),
            "escalation": result.get("escalation"),
            "recommendations": result.get("recommendations", []),
            "sepsis_probability": result.get("sepsis_probability"),
            "aki_probability": result.get("aki_probability"),
            "deterioration_probability": result.get("deterioration_probability"),
        }

        response_serializer = ICUPredictResponseSerializer(data=response_data)
        if response_serializer.is_valid():
            return Response(response_serializer.data)

        # Fallback — return whatever TibaBot gave us
        return Response(response_data)


# =============================================================================
# Phase 4a — Smart Autopopulate
# =============================================================================


class AutopopulateView(AIFeatureGatedMixin, APIView):
    """
    AI-powered encounter form autopopulation.

    POST /api/ai/autopopulate/

    Accepts encounter context (chief complaint, vitals, patient info) and
    returns structured field suggestions for the encounter form.

    Gated behind both the AI feature flag (TIBABOT_ENABLED) and the
    smart_autopopulate feature flag. Returns 404 if either is disabled.

    All suggestions require explicit user confirmation before being applied.
    """

    permission_classes = [permissions.IsAuthenticated]

    def post(self, request: Request) -> Response:
        from hmis.apps.core.models import FeatureFlag

        # Double-gate: AI must be enabled AND smart_autopopulate flag must be on
        if not FeatureFlag.is_flag_enabled("smart_autopopulate"):
            return Response(
                {"error": "Smart autopopulate is not enabled for this facility."},
                status=status.HTTP_404_NOT_FOUND,
            )

        serializer = AutopopulateRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        # Audit log the request
        AuditLog.log(
            action="ai_autopopulate_request",
            user=request.user,
            resource_type="AI",
            resource_id=0,
            ip_address=_get_client_ip(request),
            user_agent=request.META.get("HTTP_USER_AGENT", ""),
            details={
                "has_chief_complaint": bool(data.get("chief_complaint")),
                "has_vitals": bool(data.get("vitals")),
                "has_clinical_notes": bool(data.get("clinical_notes")),
            },
        )

        suggested_fields: list[dict] = []
        icd10_suggestions: list[dict] = []

        # Build the clinical_assist prompt from encounter context
        chief_complaint = data.get("chief_complaint", "")
        clinical_notes = data.get("clinical_notes", "")
        patient_age = data.get("patient_age")
        patient_sex = data.get("patient_sex", "")

        try:
            client = get_tibabot_client()

            # 1. Get ICD-10 suggestions if chief complaint provided
            if chief_complaint:
                sanitized = sanitize_clinical_text(chief_complaint)
                try:
                    icd10_result = client.suggest_icd10(sanitized)
                    raw_suggestions = icd10_result.get("suggestions", [])
                    if isinstance(raw_suggestions, list):
                        icd10_suggestions = raw_suggestions
                        # Add top suggestion as a recommended diagnosis field
                        for s in raw_suggestions[:1]:
                            confidence = s.get("confidence", 0.0)
                            if confidence >= 0.85:
                                suggested_fields.append({
                                    "field_name": "primary_diagnosis",
                                    "value": {
                                        "icd10_code": s.get("code", ""),
                                        "description": s.get("description", ""),
                                        "diagnosis_type": "PROVISIONAL",
                                    },
                                    "confidence": confidence,
                                    "reason": f"AI suggests {s.get('code', '')} — "
                                              f"{s.get('description', '')} "
                                              f"(confidence: {confidence:.0%})",
                                    "source": "ai",
                                })
                except TibaBotError:
                    logger.warning("TibaBot ICD-10 suggest failed during autopopulate")

            # 2. Get clinical assist suggestions for assessment/plan
            assist_text_parts = []
            if chief_complaint:
                assist_text_parts.append(f"Chief complaint: {chief_complaint}")
            if clinical_notes:
                assist_text_parts.append(f"Clinical notes: {clinical_notes}")
            if patient_age:
                assist_text_parts.append(f"Patient age: {patient_age}")
            if patient_sex:
                assist_text_parts.append(f"Sex: {patient_sex}")

            allergies = data.get("allergies", [])
            if allergies:
                assist_text_parts.append(f"Known allergies: {', '.join(allergies)}")

            medications = data.get("current_medications", [])
            if medications:
                assist_text_parts.append(f"Current medications: {', '.join(medications)}")

            if assist_text_parts:
                sanitized_assist = sanitize_clinical_text("\n".join(assist_text_parts))
                try:
                    assist_prompt = (
                        "Based on the following encounter data, provide:\n"
                        "1. A concise clinical assessment\n"
                        "2. A treatment plan\n"
                        "3. Any relevant chronic conditions to document\n\n"
                        f"{sanitized_assist}"
                    )
                    assist_result = client.clinical_assist(
                        query=assist_prompt,
                        patient_context={
                            "patient_age": patient_age or 0,
                            "patient_sex": patient_sex or "O",
                            "allergies": allergies,
                            "current_medications": medications,
                        },
                    )
                    assist_response = assist_result.get("response", "")
                    if assist_response:
                        suggested_fields.append({
                            "field_name": "assessment",
                            "value": assist_response,
                            "confidence": 0.75,
                            "reason": "AI-generated clinical assessment based on encounter context",
                            "source": "ai",
                        })
                except TibaBotError:
                    logger.warning("TibaBot clinical assist failed during autopopulate")

        except TibaBotUnavailableError:
            logger.warning("TibaBot unavailable for autopopulate")
            return Response(
                AutopopulateResponseSerializer({
                    "suggested_fields": [],
                    "icd10_suggestions": [],
                    "error": "AI suggestions temporarily unavailable.",
                }).data,
                status=status.HTTP_200_OK,
            )

        # Build and validate response
        response_data = {
            "suggested_fields": suggested_fields,
            "icd10_suggestions": icd10_suggestions,
        }
        response_serializer = AutopopulateResponseSerializer(data=response_data)
        if response_serializer.is_valid():
            return Response(response_serializer.data)

        # Graceful fallback
        return Response(
            AutopopulateResponseSerializer({
                "suggested_fields": [],
                "icd10_suggestions": [],
                "error": "AI returned unexpected response shape.",
            }).data,
            status=status.HTTP_200_OK,
        )
