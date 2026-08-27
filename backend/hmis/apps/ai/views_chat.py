# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
# ruff: noqa
"""
What this file is for: clinical chat and assist endpoints with chat session management.
How to use: imported by `hmis.apps.ai.views` compatibility module for endpoint wiring.
Supported inputs/args: Django REST Framework API view classes and helper functions for AI endpoints.
"""

import json
import logging
import re
from typing import Any

from django.conf import settings
from django.core.serializers.json import DjangoJSONEncoder
from django.db import DatabaseError
from django.http import StreamingHttpResponse
from django.utils import timezone
from drf_spectacular.utils import extend_schema
from rest_framework import permissions, status
from rest_framework.parsers import MultiPartParser
from rest_framework.permissions import BasePermission
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from hmis.apps.core.mixins import resolve_request_tenant
from hmis.apps.core.models import AuditLog
from hmis.apps.core.permissions import ReadRequiresModelPermission
from hmis.apps.encounters.models import ChronicCondition, CurrentMedication, Encounter
from hmis.apps.patients.models import Allergy

from .client import (
    TibaBotError,
    TibaBotUnavailableError,
    extract_token_usage,
    get_tibabot_client,
    tibabot_user_context,
)
from .context import build_facility_context, build_user_context
from .feature_flags import AIFeatureGatedMixin, AISchemaMixin, is_ai_enabled
from .models import (
    AIAdvisoryOrderLink,
    AIAdvisoryOrderLinkStatus,
    AICarePlanResult,
    AICDSResult,
    AIDischargeResult,
    AIEGFRResult,
    AIICURiskResult,
    AIInvestigationSuggestResult,
    AILabInterpretResult,
    AISurgicalChecklistSessionResult,
    AISurgicalPostOpCarePlanResult,
    AISurgicalPreOpAssessResult,
    ChatMessage,
    ChatSession,
)
from .sanitizer import sanitize_clinical_text
from .serializers import (  # Advisory link serializers
    AIAdvisoryBulkSeedSerializer,
    AIAdvisoryOrderLinkActionSerializer,
    AIAdvisoryOrderLinkSerializer,
    AIClinicalAssistResponseSerializer,
    AIFeedbackRequestSerializer,
    AIFeedbackResponseSerializer,
    AIStatusResponseSerializer,
    AISuggestionAuditRequestSerializer,
    AISuggestionAuditResponseSerializer,
    AutopopulateRequestSerializer,
    AutopopulateResponseSerializer,
    CarePlanGenerateRequestSerializer,
    CarePlanResponseSerializer,
    CDSEvaluateRequestSerializer,
    CDSEvaluateResponseSerializer,
    ClerkingAutocompleteRequestSerializer,
    ClerkingAutocompleteResponseSerializer,
    ClerkingStructureRequestSerializer,
    ClerkingStructureResponseSerializer,
    ClinicalAssistRequestSerializer,
    ClinicalChatRequestSerializer,
    ClinicalDocGenerateRequestSerializer,
    ClinicalDocGenerateResponseSerializer,
    ConditionPredictRequestSerializer,
    ConditionPredictResponseSerializer,
    DischargeAssessRequestSerializer,
    DischargeAssessResponseSerializer,
    ICD10SuggestRequestSerializer,
    ICD10SuggestResponseSerializer,
    ICUPredictRequestSerializer,
    ICUPredictResponseSerializer,
    ICUQSOFALiteRequestSerializer,
    InvestigationSuggestRequestSerializer,
    LabInterpretRequestSerializer,
    LabInterpretResponseSerializer,
    StoredCarePlanSerializer,
    StoredCDSResultSerializer,
    StoredDischargeResultSerializer,
    StoredICURiskResultSerializer,
    StoredInvestigationSuggestSerializer,
    StoredLabInterpretSerializer,
    StoredSurgicalChecklistSessionSerializer,
    StoredSurgicalPostOpCarePlanSerializer,
    StoredSurgicalPreOpAssessSerializer,
    SurgicalChecklistAdvanceRequestSerializer,
    SurgicalChecklistSessionResponseSerializer,
    SurgicalChecklistStartRequestSerializer,
    SurgicalPostOpCarePlanRequestSerializer,
    SurgicalPostOpCarePlanResponseSerializer,
    SurgicalPreOpAssessRequestSerializer,
    SurgicalPreOpAssessResponseSerializer,
    SurgicalProcedureDetailResponseSerializer,
    SurgicalProcedureListResponseSerializer,
)

logger = logging.getLogger(__name__)


def _ai_view_handled_exceptions() -> tuple[type[Exception], ...]:
    return (
        DatabaseError,
        AttributeError,
        LookupError,
        TypeError,
        ValueError,
        RuntimeError,
        ImportError,
    )


def _split_clinical_text(value: str | None) -> list[str]:
    if not value:
        return []
    return [token.strip() for token in re.split(r"[;,\n]", value) if token and token.strip()]


def _pick_primary_diagnosis_text(encounter: Encounter) -> str:
    diagnoses = list(encounter.diagnoses.select_related("icd10_code").all())
    if not diagnoses:
        return ""

    def _dx_text(diagnosis) -> str:
        if diagnosis.icd10_code_id and diagnosis.icd10_code:
            return diagnosis.icd10_code.short_description or diagnosis.icd10_code.description or ""
        return diagnosis.free_text_diagnosis or ""

    diagnoses.sort(
        key=lambda d: (
            d.diagnosis_type != "PRIMARY",
            not d.is_confirmed,
            d.created_at,
        )
    )
    for diagnosis in diagnoses:
        text = _dx_text(diagnosis).strip()
        if text:
            return text
    return ""


def _enrich_care_plan_input_from_encounter(
    data: dict[str, Any], request: Request
) -> dict[str, Any]:
    encounter_id = data.get("encounter_id")
    if not encounter_id:
        return data

    encounter_qs = Encounter.objects.filter(pk=encounter_id)
    facility = getattr(request, "facility", None)
    if facility:
        encounter_qs = encounter_qs.filter(facility=facility)

    encounter = encounter_qs.first()
    if not encounter:
        return data

    diagnosis_text = _pick_primary_diagnosis_text(encounter)
    incoming_primary = (data.get("primary_diagnosis") or "").strip()
    incoming_complaint = (data.get("chief_complaint") or encounter.chief_complaint or "").strip()
    should_replace_primary = (
        not incoming_primary or incoming_primary.lower() == incoming_complaint.lower()
    )

    if should_replace_primary and diagnosis_text:
        data["primary_diagnosis"] = diagnosis_text

    if not data.get("chief_complaint") and encounter.chief_complaint:
        data["chief_complaint"] = encounter.chief_complaint

    if not data.get("allergies"):
        allergies = _split_clinical_text(encounter.allergies)
        if not allergies:
            allergies = list(
                Allergy.objects.filter(patient_id=encounter.patient_id, status="active")
                .exclude(substance="")
                .values_list("substance", flat=True)
            )
        data["allergies"] = allergies

    if not data.get("comorbidities"):
        comorbidities = _split_clinical_text(encounter.chronic_conditions)
        if not comorbidities:
            comorbidities = list(
                ChronicCondition.objects.filter(patient_id=encounter.patient_id, status="ACTIVE")
                .exclude(condition_name="")
                .values_list("condition_name", flat=True)
            )
        data["comorbidities"] = comorbidities

    if not data.get("current_medications"):
        current_meds = _split_clinical_text(encounter.current_medications)
        if not current_meds:
            current_meds = list(
                CurrentMedication.objects.filter(patient_id=encounter.patient_id, status="ACTIVE")
                .exclude(medication_name="")
                .values_list("medication_name", flat=True)
            )
        data["current_medications"] = current_meds

    return data


def _record_response_tokens(request: Request, result: dict) -> None:
    """Extract token usage from a TibaBot response and record against the org."""
    usage = extract_token_usage(result)
    total = usage.get("total_tokens")
    if not total or total <= 0:
        return
    user = getattr(request, "user", None)
    if user is None or not getattr(user, "is_authenticated", False):
        return
    profile = getattr(user, "staff_profile", None)
    if profile is None:
        return
    org = getattr(profile, "organization", None)
    if org is not None:
        org.record_ai_token_usage(total)


def _normalize_care_plan_result(result: dict[str, Any], data: dict[str, Any]) -> dict[str, Any]:
    """Normalize care plan output to ADPIE-compatible minima.

    Ensures generated payloads (TibaBot or fallback) always include required
    core sections and ADPIE rows compatible with manual Kardex format.
    """
    primary_diagnosis = (
        result.get("primary_diagnosis") or data.get("primary_diagnosis") or ""
    ).strip()
    if not primary_diagnosis:
        primary_diagnosis = "Undifferentiated clinical condition"
    result["primary_diagnosis"] = primary_diagnosis

    goals = result.get("goals")
    if not isinstance(goals, list) or not goals:
        goals = [
            {
                "description": f"Stabilize and improve {primary_diagnosis}",
                "priority": "high",
                "timeframe": "During admission",
                "measurable_target": "Clinical status improves with no deterioration",
            }
        ]

    normalized_goals: list[dict[str, Any]] = []
    for goal in goals:
        if not isinstance(goal, dict):
            continue
        description = str(goal.get("description") or "").strip()
        if not description:
            continue
        priority = str(goal.get("priority") or "medium").lower()
        if priority not in {"high", "medium", "low"}:
            priority = "medium"
        normalized_goals.append(
            {
                "description": description,
                "priority": priority,
                "timeframe": str(goal.get("timeframe") or "During admission").strip(),
                "measurable_target": str(
                    goal.get("measurable_target") or "Demonstrable clinical improvement"
                ).strip(),
            }
        )
    if not normalized_goals:
        normalized_goals = [
            {
                "description": f"Stabilize and improve {primary_diagnosis}",
                "priority": "high",
                "timeframe": "During admission",
                "measurable_target": "Clinical status improves with no deterioration",
            }
        ]
    result["goals"] = normalized_goals

    interventions = result.get("interventions")
    if not isinstance(interventions, list):
        interventions = []
    normalized_interventions: list[dict[str, Any]] = []
    for category_block in interventions:
        if not isinstance(category_block, dict):
            continue
        category = str(category_block.get("category") or "nursing").strip() or "nursing"
        items = category_block.get("items")
        if not isinstance(items, list):
            continue
        normalized_items: list[dict[str, Any]] = []
        for item in items:
            if not isinstance(item, dict):
                continue
            action = str(item.get("action") or "").strip()
            if not action:
                continue
            normalized_items.append(
                {
                    "action": action,
                    "frequency": str(item.get("frequency") or "As ordered").strip(),
                    "rationale": str(
                        item.get("rationale")
                        or "Supports safe and effective management of current condition"
                    ).strip(),
                }
            )
        if normalized_items:
            normalized_interventions.append({"category": category, "items": normalized_items})
    if not normalized_interventions:
        normalized_interventions = [
            {
                "category": "nursing",
                "items": [
                    {
                        "action": "Monitor vitals, symptoms, and response to treatment",
                        "frequency": "Every shift or as clinically indicated",
                        "rationale": "Early detection of deterioration and timely escalation",
                    }
                ],
            }
        ]
    result["interventions"] = normalized_interventions

    adpie_entries: list[dict[str, Any]] = []
    plan_lines = [
        f"[{block.get('category', 'nursing')}] {item.get('action', '')}"
        for block in normalized_interventions
        for item in block.get("items", [])
        if isinstance(item, dict) and item.get("action")
    ]
    rationale_lines = [
        f"[{block.get('category', 'nursing')}] {item.get('rationale', '')}"
        for block in normalized_interventions
        for item in block.get("items", [])
        if isinstance(item, dict) and item.get("rationale")
    ]
    plan_of_action = "\n".join(plan_lines[:8]).strip() or "Continue condition-directed nursing care"
    scientific_rationale = (
        "\n".join(rationale_lines[:8]).strip()
        or "Interventions are selected to improve outcomes and reduce complications"
    )

    for goal in normalized_goals:
        adpie_entries.append(
            {
                "assessment": (
                    f"{primary_diagnosis}. "
                    f"Severity: {(result.get('severity') or data.get('severity') or 'not specified')}."
                ),
                "nursing_diagnosis": primary_diagnosis,
                "goal_and_outcome_criteria": (
                    f"{goal['description']}. "
                    f"Target: {goal.get('measurable_target') or 'Demonstrable improvement'}. "
                    f"Timeframe: {goal.get('timeframe') or 'During admission'}."
                ),
                "plan_of_action": plan_of_action,
                "scientific_rationale": scientific_rationale,
                "implementation": "",
                "evaluation": "",
            }
        )
    result["adpie_entries"] = adpie_entries

    follow_up = result.get("follow_up")
    if follow_up is None:
        follow_up = {}
    if not isinstance(follow_up, dict):
        follow_up = {}
    if "timing" not in follow_up and "appointment" in follow_up:
        follow_up["timing"] = follow_up.get("appointment")
    if "instructions" not in follow_up and "investigations" in follow_up:
        follow_up["instructions"] = follow_up.get("investigations")
    follow_up.setdefault("timing", "Review in 1-2 weeks")
    follow_up.setdefault("instructions", "Return earlier if red flags develop")
    follow_up.setdefault("red_flags", [])
    result["follow_up"] = follow_up

    return result


# Accepted verbosity values — aligned with TibaBot's API.
_VALID_VERBOSITY = {"concise", "standard", "educational"}

# Allowed roles for the conversational AI surface. These mirror the frontend
# ai.use_chat action gate so direct API access cannot bypass UI restrictions.
_AI_CHAT_ALLOWED_ROLES = {
    "DOCTOR",
    "CLINICAL_OFFICER",
    "PHARMACIST",
    "LAB_TECH",
    "LAB_SCIENTIST",
    "ADMIN",
    "NURSE",
}


def _parse_bool(value: object) -> bool | None:
    if value is None:
        return None
    if isinstance(value, bool):
        return value
    return None


# =============================================================================
# Helpers
# =============================================================================


def _get_client_ip(request: Request) -> str:
    """Extract client IP from request headers."""
    x_forwarded_for = request.META.get("HTTP_X_FORWARDED_FOR")
    if x_forwarded_for:
        return x_forwarded_for.split(",")[0].strip()
    return request.META.get("REMOTE_ADDR", "")


def _get_tenant_kwargs(request: Request) -> dict:
    """Resolve facility/organization from request for FacilityScopedModel creates."""
    resolve_request_tenant(request)
    kwargs: dict = {}
    facility = getattr(request, "facility", None)
    org = getattr(request, "organization", None)
    if facility:
        kwargs["facility"] = facility
    if org:
        kwargs["organization"] = org
    return kwargs


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


def _build_audit_value_preview(value: object) -> dict[str, str]:
    """Build a sanitized, truncated preview of an accepted suggestion value."""
    value_type = type(value).__name__

    if isinstance(value, str):
        serialized = value
    else:
        try:
            serialized = json.dumps(value, sort_keys=True)
        except TypeError:
            serialized = str(value)

    sanitized = sanitize_clinical_text(serialized)
    return {
        "accepted_value_type": value_type,
        "accepted_value_preview": sanitized[:120],
    }


def _resolve_request_role_code(request: Request) -> str | None:
    """Resolve a normalized role code for the authenticated user."""
    if not getattr(request, "user", None) or not request.user.is_authenticated:
        return None

    if request.user.is_superuser:
        return "ADMIN"

    role_code = build_user_context(request).get("role")
    if isinstance(role_code, str) and role_code:
        return role_code

    return None


class CanUseAIChat(BasePermission):
    """Restrict conversational AI endpoints to approved clinical roles."""

    message = "You do not have permission to use AI chat."

    def has_permission(self, request: Request, view: APIView) -> bool:
        role_code = _resolve_request_role_code(request)
        return role_code in _AI_CHAT_ALLOWED_ROLES


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

    permission_classes = [permissions.IsAuthenticated, CanUseAIChat, ReadRequiresModelPermission]

    def post(self, request: Request) -> Response:
        serializer = ClinicalChatRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        data = serializer.validated_data
        stream_requested = bool(data.pop("stream", False))

        # Resolve verbosity: query-param > body > default
        data["verbosity"] = _resolve_verbosity(request, data.get("verbosity"))

        # Enrich with server-side context (overrides any frontend-sent values)
        data["user_context"] = build_user_context(request)
        data["facility_context"] = build_facility_context(request)

        # Add system instruction based on whether encounter context is present.
        # This prevents TibaBot from hallucinating page content when the user
        # asks about "the page we're on" without any clinical context.
        has_encounter_context = bool(data.get("patient_context") or data.get("encounter_context"))
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
                    'encounter page for clinical analysis." '
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
                    'encounter-aware assistance." '
                    "Otherwise, answer general clinical questions normally."
                )

        # Resolve or create session
        session = self._resolve_session(request, data)
        data["session_id"] = str(session.id)

        # Persist user message
        ChatMessage.objects.create(
            session=session,
            role="user",
            content=data["message"],
        )

        is_first_message = session.messages.filter(role="user").count() == 1

        if stream_requested:
            return self._build_streaming_response(
                request=request,
                session=session,
                data=data,
                is_first_message=is_first_message,
            )

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

        # Record token usage against the organization quota
        _record_response_tokens(request, result)

        # Extract model identifier from TibaBot response (if provided)
        model_id = result.get("model_used") or result.get("model") or None

        # Infer a smart title from the first user–assistant exchange
        if is_first_message:
            content_str = str(assistant_content) if assistant_content else ""
            try:
                inferred = client.generate_chat_title(data["message"], content_str)
            except _ai_view_handled_exceptions():
                inferred = None
            session.title = (
                inferred if isinstance(inferred, str) and inferred else data["message"][:120]
            )
            session.save(update_fields=["title"])

        return self._build_response(
            session=session,
            content=str(assistant_content) if assistant_content else "",
            model=model_id,
        )

    def _build_streaming_response(
        self,
        request: Request,
        session: ChatSession,
        data: dict[str, Any],
        is_first_message: bool,
    ) -> StreamingHttpResponse:
        """Proxy TibaBot SSE chunks to the client and persist final assistant output."""

        def _sse(payload: dict[str, Any]) -> str:
            return f"data: {json.dumps(payload)}\n\n"

        def _extract_chunk(event_name: str, payload: Any) -> str:
            if isinstance(payload, dict):
                payload_type = str(payload.get("type", "")).lower()
                if payload_type == "chunk":
                    return str(payload.get("content", "") or "")
                if payload_type == "token":
                    return str(payload.get("text", payload.get("content", "")) or "")
                if event_name in {"token", "chunk", "message"} and payload.get("content"):
                    return str(payload.get("content", "") or "")
                if event_name in {"token", "chunk", "message"} and payload.get("text"):
                    return str(payload.get("text", "") or "")
            if isinstance(payload, str) and event_name in {"token", "chunk", "message"}:
                return payload
            return ""

        def _extract_model(payload: Any) -> str | None:
            if isinstance(payload, dict):
                model = payload.get("model_used") or payload.get("model")
                if model:
                    return str(model)
            return None

        def _is_done_event(event_name: str, payload: Any) -> bool:
            if event_name in {"done", "complete", "end"}:
                return True
            if isinstance(payload, dict):
                payload_type = str(payload.get("type", "")).lower()
                if payload_type in {"done", "complete", "end", "final"}:
                    return True
                return bool(payload.get("done") is True)
            return False

        def _extract_final_content(payload: Any) -> str:
            if not isinstance(payload, dict):
                return ""
            if payload.get("content"):
                return str(payload.get("content"))
            message = payload.get("message")
            if isinstance(message, dict) and message.get("content"):
                return str(message.get("content"))
            if isinstance(message, str):
                return message
            if payload.get("response"):
                return str(payload.get("response"))
            return ""

        def _iter_stream_events(payload: dict[str, Any]):
            resolve_request_tenant(request)
            facility = getattr(request, "facility", None)
            with tibabot_user_context(request.user, facility):
                client = get_tibabot_client()
                yield from client.clinical_chat_stream(payload)

        def _run_chat(payload: dict[str, Any]) -> dict[str, Any]:
            resolve_request_tenant(request)
            facility = getattr(request, "facility", None)
            with tibabot_user_context(request.user, facility):
                client = get_tibabot_client()
                return client.clinical_chat(payload)

        def _generate_title(user_message: str, assistant_content: str) -> str | None:
            resolve_request_tenant(request)
            facility = getattr(request, "facility", None)
            with tibabot_user_context(request.user, facility):
                return get_tibabot_client().generate_chat_title(user_message, assistant_content)

        def event_stream():
            chunks: list[str] = []
            model_id: str | None = None
            fallback_error: str | None = None
            stream_mode = "streamed"

            yield _sse({"type": "session", "session_id": str(session.id)})

            try:
                for event in _iter_stream_events(dict(data)):
                    event_name = str(event.get("event", "message")).lower()
                    payload = event.get("data")

                    maybe_model = _extract_model(payload)
                    if maybe_model:
                        model_id = maybe_model

                    chunk = _extract_chunk(event_name, payload)
                    if chunk:
                        chunks.append(chunk)
                        yield _sse({"type": "chunk", "content": chunk})

                    if _is_done_event(event_name, payload):
                        final_content = _extract_final_content(payload)
                        if final_content and not chunks:
                            chunks.append(final_content)
                            yield _sse({"type": "chunk", "content": final_content})

            except TibaBotUnavailableError:
                fallback_error = "AI service temporarily unavailable."
                stream_mode = "fallback"
                fallback_content = "TibaBot is currently unavailable. Please try again later."
                chunks = [fallback_content]
                yield _sse({"type": "error", "error": fallback_error})
                yield _sse({"type": "chunk", "content": fallback_content})
            except TibaBotError:
                fallback_error = "AI service error."
                stream_mode = "fallback"
                fallback_content = "An error occurred with the AI service."
                chunks = [fallback_content]
                yield _sse({"type": "error", "error": fallback_error})
                yield _sse({"type": "chunk", "content": fallback_content})

            # Upstream may return HTTP 200 but fail to emit chunk/done events.
            # In that case, fall back to non-streaming chat so clinicians still
            # get a response instead of a silent or empty stream.
            if not chunks and not fallback_error:
                try:
                    stream_mode = "fallback"
                    result = _run_chat(dict(data))

                    tibabot_msg = result.get("message", {}) if isinstance(result, dict) else {}
                    assistant_content = ""
                    if isinstance(tibabot_msg, dict):
                        assistant_content = str(tibabot_msg.get("content", "") or "")
                    elif isinstance(tibabot_msg, str):
                        assistant_content = tibabot_msg
                    if not assistant_content and isinstance(result, dict):
                        assistant_content = str(
                            result.get("response", result.get("content", "")) or ""
                        )

                    if assistant_content:
                        chunks = [assistant_content]
                        maybe_model = result.get("model_used") or result.get("model")
                        if maybe_model:
                            model_id = str(maybe_model)
                        yield _sse({"type": "chunk", "content": assistant_content})
                except (TibaBotUnavailableError, TibaBotError):
                    fallback_error = "AI service error."
                    stream_mode = "fallback"
                    fallback_content = "An error occurred with the AI service."
                    chunks = [fallback_content]
                    yield _sse({"type": "error", "error": fallback_error})
                    yield _sse({"type": "chunk", "content": fallback_content})

            final_content = "".join(chunks)
            if not final_content.strip():
                final_content = "I could not generate a response. Please try again."

            assistant_msg = ChatMessage.objects.create(
                session=session,
                role="assistant",
                content=final_content,
            )

            if is_first_message:
                try:
                    inferred = _generate_title(data["message"], final_content)
                except _ai_view_handled_exceptions():
                    inferred = None
                session.title = (
                    inferred if isinstance(inferred, str) and inferred else data["message"][:120]
                )
                session.save(update_fields=["title"])

            done_payload: dict[str, Any] = {
                "type": "done",
                "session_id": str(session.id),
                "message": {
                    "id": str(assistant_msg.id),
                    "role": "assistant",
                    "content": final_content,
                    "timestamp": assistant_msg.timestamp.isoformat(),
                },
            }
            if model_id:
                done_payload["model"] = model_id
            if fallback_error:
                done_payload["error"] = fallback_error
            if settings.DEBUG:
                done_payload["stream_mode"] = stream_mode

            yield _sse(done_payload)

        response = StreamingHttpResponse(event_stream(), content_type="text/event-stream")
        response["Cache-Control"] = "no-cache"
        response["X-Accel-Buffering"] = "no"
        return response

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------

    @staticmethod
    def _resolve_session(request: Request, data: dict) -> ChatSession:
        """Get existing session or create a new one."""
        user = request.user
        session_id = data.get("session_id")
        if session_id:
            try:
                return ChatSession.objects.get(id=session_id, user=user)
            except (ChatSession.DoesNotExist, ValueError):
                pass  # fall through to create
        return ChatSession.objects.create(user=user, **_get_tenant_kwargs(request))

    @staticmethod
    def _build_response(
        session: ChatSession,
        content: str,
        error: str | None = None,
        model: str | None = None,
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
        if model:
            response_data["model"] = model

        return Response(response_data, status=status.HTTP_200_OK)


class ClinicalAssistView(AIFeatureGatedMixin, APIView):
    """
    Proxy endpoint for encounter-aware clinical assistance.

    POST /api/ai/clinical/assist/
    Body: { "query": "...", "patient_context": {...}, "encounter_context": {...} }

    Auto-enriches the request with user_context and facility_context
    before forwarding to TibaBot.
    """

    permission_classes = [permissions.IsAuthenticated, CanUseAIChat, ReadRequiresModelPermission]

    def post(self, request: Request) -> Response:
        serializer = ClinicalAssistRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        data = serializer.validated_data

        # Resolve verbosity: query-param > body > default
        data["verbosity"] = _resolve_verbosity(request, data.get("verbosity"))

        # Enrich with server-side context
        data["user_context"] = build_user_context(request)
        data["facility_context"] = build_facility_context(request)

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

        # Record token usage against the organization quota
        _record_response_tokens(request, result)

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

    permission_classes = [permissions.IsAuthenticated, CanUseAIChat, ReadRequiresModelPermission]

    def get(self, request: Request) -> Response:
        resolve_request_tenant(request)
        facility = getattr(request, "facility", None)
        qs = ChatSession.objects.filter(user=request.user)
        if facility:
            qs = qs.filter(facility=facility)
        sessions_data = [
            {
                "id": str(s.id),
                "title": s.title,
                "created_at": s.created_at.isoformat(),
                "updated_at": s.updated_at.isoformat(),
                "message_count": s.message_count,
            }
            for s in qs
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

    permission_classes = [permissions.IsAuthenticated, CanUseAIChat, ReadRequiresModelPermission]

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
