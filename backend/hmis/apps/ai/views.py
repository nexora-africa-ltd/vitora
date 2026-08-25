# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
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

import json
import logging
import re
from typing import Any

from django.conf import settings
from django.core.serializers.json import DjangoJSONEncoder
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


class AISuggestionAuditView(AIFeatureGatedMixin, APIView):
    """Audit accepted or applied AI suggestions for accountability."""

    permission_classes = [permissions.IsAuthenticated, ReadRequiresModelPermission]

    def post(self, request: Request) -> Response | StreamingHttpResponse:
        serializer = AISuggestionAuditRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        audited_suggestions = []
        for suggestion in data["suggestions"]:
            item = {
                "field_name": suggestion["field_name"],
                "source": suggestion.get("source", "ai"),
            }
            if suggestion.get("suggestion_id"):
                item["suggestion_id"] = suggestion["suggestion_id"]
            if suggestion.get("confidence") is not None:
                item["confidence"] = suggestion["confidence"]
            if "accepted_value" in suggestion:
                item.update(_build_audit_value_preview(suggestion["accepted_value"]))
            audited_suggestions.append(item)

        action = f"ai_suggestion_{data['event_type']}"
        details = {
            "suggestion_type": data["suggestion_type"],
            "event_type": data["event_type"],
            "logged_count": len(audited_suggestions),
            "suggestions": audited_suggestions,
        }
        if data.get("note_format"):
            details["note_format"] = data["note_format"]
        if data.get("encounter_type"):
            details["encounter_type"] = data["encounter_type"]

        AuditLog.log(
            action=action,
            user=request.user,
            resource_type="AI",
            resource_id=0,
            ip_address=_get_client_ip(request),
            user_agent=request.META.get("HTTP_USER_AGENT", ""),
            details=details,
        )

        response = AISuggestionAuditResponseSerializer(
            {
                "status": "logged",
                "message": "Suggestion audit event recorded.",
                "logged_count": len(audited_suggestions),
            }
        )
        return Response(response.data, status=status.HTTP_200_OK)


class ICD10SuggestView(AIFeatureGatedMixin, APIView):
    """
    Proxy endpoint for TibaBot ICD-10 auto-coding.

    POST /api/ai/icd10-suggest/
    Body: { "clinical_text": "patient presenting with malaria symptoms and fever" }

    Returns ranked ICD-10 code suggestions with confidence scores.
    Advisory only — clinician must confirm/reject each suggestion.
    """

    permission_classes = [permissions.IsAuthenticated, ReadRequiresModelPermission]

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

        # Normalize the response — TibaBot returns "codes" key
        suggestions = result.get("codes") or result.get("suggestions") or []
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


class AIStatusView(AISchemaMixin, APIView):
    """
    Check AI feature status.

    GET /api/ai/status/

    Returns whether AI features are enabled and if TibaBot is reachable.
    This endpoint is NOT gated — it's used by the frontend to decide
    whether to render AI components.
    """

    permission_classes = [permissions.IsAuthenticated, ReadRequiresModelPermission]

    def get(self, request: Request) -> Response:
        enabled = is_ai_enabled()
        service_available = False
        rag_initialized = False
        demo_mode = False

        if enabled:
            try:
                resolve_request_tenant(request)
                facility = getattr(request, "facility", None)
                with tibabot_user_context(request.user, facility):
                    client = get_tibabot_client()
                    # Quick health check — returns rag/demo status
                    health = client._request("GET", "/health")
                service_available = True
                rag_initialized = bool(health.get("rag_initialized", False))
                demo_mode = bool(health.get("demo_mode", False))
            except (TibaBotError, Exception):
                service_available = False

        data = {
            "enabled": enabled,
            "service_name": "TibaBot",
            "service_available": service_available,
            "rag_initialized": rag_initialized,
            "demo_mode": demo_mode,
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
            except Exception:
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

        def event_stream():
            chunks: list[str] = []
            model_id: str | None = None
            fallback_error: str | None = None
            stream_mode = "streamed"

            yield _sse({"type": "session", "session_id": str(session.id)})

            try:
                client = get_tibabot_client()
                for event in client.clinical_chat_stream(dict(data)):
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
                    client = get_tibabot_client()
                    result = client.clinical_chat(dict(data))

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
                    inferred = get_tibabot_client().generate_chat_title(
                        data["message"], final_content
                    )
                except Exception:
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

    permission_classes = [permissions.IsAuthenticated, ReadRequiresModelPermission]

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
            patient_features["allergies"] = sanitize_clinical_text(patient_features["allergies"])

        # Enrich with user and facility context
        payload = {
            "patient_features": patient_features,
            "user_context": build_user_context(request),
            "facility_context": build_facility_context(request),
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
                "chief_complaint_category": patient_features.get("chief_complaint_category", ""),
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

    permission_classes = [permissions.IsAuthenticated, CanUseAIChat, ReadRequiresModelPermission]

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

    permission_classes = [permissions.IsAuthenticated, ReadRequiresModelPermission]

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


class AIInsightsView(AIFeatureGatedMixin, APIView):
    """
    GET /api/ai/insights/

    Aggregated AI usage insights for the admin dashboard.

    Returns:
    - Stored result counts (per type)
    - Suggestion audit accept/reject rates
    - Feedback stats (proxied from TibaBot)
    - Chat session metrics
    - Usage breakdown by action type (last 30 days)
    """

    permission_classes = [permissions.IsAuthenticated, ReadRequiresModelPermission]

    def get(self, request: Request) -> Response:
        from datetime import timedelta

        from django.db.models import Count, Q

        resolve_request_tenant(request)
        facility = getattr(request, "facility", None)

        # Date range for recent stats
        now = timezone.now()
        thirty_days_ago = now - timedelta(days=30)
        seven_days_ago = now - timedelta(days=7)

        # -- Stored result counts (facility-scoped) --
        result_filters = {}
        if facility:
            result_filters["facility"] = facility

        stored_results = {
            "care_plans": AICarePlanResult.objects.filter(**result_filters).count(),
            "cds_evaluations": AICDSResult.objects.filter(**result_filters).count(),
            "lab_interpretations": AILabInterpretResult.objects.filter(**result_filters).count(),
            "discharge_assessments": AIDischargeResult.objects.filter(**result_filters).count(),
            "icu_risk_predictions": AIICURiskResult.objects.filter(**result_filters).count(),
            "investigation_suggestions": AIInvestigationSuggestResult.objects.filter(
                **result_filters
            ).count(),
            "surgical_pre_op": AISurgicalPreOpAssessResult.objects.filter(**result_filters).count(),
            "surgical_checklists": AISurgicalChecklistSessionResult.objects.filter(
                **result_filters
            ).count(),
            "surgical_post_op": AISurgicalPostOpCarePlanResult.objects.filter(
                **result_filters
            ).count(),
        }
        stored_results["total"] = sum(stored_results.values())

        # -- Suggestion audit rates (from AuditLog) --
        audit_base = AuditLog.objects.filter(
            action__startswith="ai_suggestion_",
            timestamp__gte=thirty_days_ago,
        )
        if facility:
            audit_base = audit_base.filter(facility=facility)

        suggestion_stats = audit_base.aggregate(
            accepted=Count("id", filter=Q(action="ai_suggestion_accepted")),
            applied=Count("id", filter=Q(action="ai_suggestion_applied")),
            acknowledged=Count("id", filter=Q(action="ai_suggestion_acknowledged")),
        )
        suggestion_total = sum(v for v in suggestion_stats.values() if v)
        suggestion_stats["total"] = suggestion_total

        # -- Chat session metrics --
        chat_filters: dict = {}
        if facility:
            chat_filters["facility"] = facility

        chat_metrics = {
            "total_sessions": ChatSession.objects.filter(**chat_filters).count(),
            "recent_sessions": ChatSession.objects.filter(
                **chat_filters, created_at__gte=seven_days_ago
            ).count(),
            "total_messages": ChatMessage.objects.filter(
                session__in=ChatSession.objects.filter(**chat_filters)
            ).count(),
        }

        # -- AI usage by action (last 30 days from AuditLog) --
        usage_base = AuditLog.objects.filter(
            action__startswith="ai_",
            timestamp__gte=thirty_days_ago,
        )
        if facility:
            usage_base = usage_base.filter(facility=facility)

        usage_breakdown = list(
            usage_base.values("action").annotate(count=Count("id")).order_by("-count")[:15]
        )

        total_ai_actions = usage_base.count()

        # -- Feedback stats (proxy from TibaBot, graceful fallback) --
        feedback_stats = {"total_up": 0, "total_down": 0, "recent_negatives": 0}
        try:
            client = get_tibabot_client()
            result = client.get_feedback_stats()
            feedback_stats = {
                "total_up": result.get("total_up", 0),
                "total_down": result.get("total_down", 0),
                "recent_negatives": result.get("recent_negatives", 0),
            }
        except (TibaBotError, TibaBotUnavailableError, Exception):  # noqa: S110
            pass

        # -- Advisory link stats --
        advisory_base = AIAdvisoryOrderLink.objects.all()
        if facility:
            advisory_base = advisory_base.filter(facility=facility)

        advisory_stats = {
            "total": advisory_base.count(),
            "ordered": advisory_base.filter(status=AIAdvisoryOrderLinkStatus.ORDERED).count(),
            "declined": advisory_base.filter(status=AIAdvisoryOrderLinkStatus.DECLINED).count(),
            "suggested": advisory_base.filter(status=AIAdvisoryOrderLinkStatus.SUGGESTED).count(),
        }

        return Response(
            {
                "stored_results": stored_results,
                "suggestion_audit": suggestion_stats,
                "chat_metrics": chat_metrics,
                "usage_breakdown": usage_breakdown,
                "total_ai_actions_30d": total_ai_actions,
                "feedback": feedback_stats,
                "advisory_links": advisory_stats,
                "period": {
                    "start": thirty_days_ago.isoformat(),
                    "end": now.isoformat(),
                },
            }
        )


# =============================================================================
# Phase 4 — ICU Predictor
# =============================================================================


class ICULabEnrichmentView(AIFeatureGatedMixin, APIView):
    """
    Return the latest verified lab values for ICU risk scoring.

    GET /api/ai/predict/icu/labs/?admission_id=49

    Returns a flat dict of lab values mapped from verified LabResults,
    e.g. {"wbc": 15.2, "platelets": 120.0, "creatinine": 2.1}.
    The frontend can display these before triggering a prediction.
    """

    permission_classes = [permissions.IsAuthenticated, ReadRequiresModelPermission]

    def get(self, request: Request) -> Response:
        admission_id = request.query_params.get("admission_id")
        if not admission_id:
            return Response(
                {"detail": "admission_id query parameter is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            admission_id_int = int(admission_id)
        except (ValueError, TypeError):
            return Response(
                {"detail": "admission_id must be an integer."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            from hmis.apps.inpatient.models import Admission

            admission = Admission.objects.only("id", "patient_id").get(pk=admission_id_int)
        except Admission.DoesNotExist:
            return Response(
                {"detail": "Admission not found."},
                status=status.HTTP_404_NOT_FOUND,
            )

        from .services.icu_lab_enrichment import get_latest_labs_for_icu

        lab_values = get_latest_labs_for_icu(
            patient_id=admission.patient_id,
            admission_id=admission_id_int,
        )

        return Response(lab_values)


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

    permission_classes = [permissions.IsAuthenticated, ReadRequiresModelPermission]

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
        admission_id = serializer.validated_data.get("admission_id")

        # Auto-enrich lab values from verified results when admission is
        # provided.  Only fills fields the frontend didn't already supply.
        if admission_id is not None:
            try:
                from hmis.apps.inpatient.models import Admission

                admission = Admission.objects.select_related("patient").get(pk=admission_id)
                patient_id = admission.patient_id

                from .services.icu_lab_enrichment import get_latest_labs_for_icu

                lab_values = get_latest_labs_for_icu(
                    patient_id=patient_id,
                    admission_id=admission_id,
                )
                lab_fields = (
                    "wbc",
                    "platelets",
                    "creatinine",
                    "bilirubin",
                    "lactate",
                    "pao2_fio2_ratio",
                )
                for field in lab_fields:
                    if patient_data.get(field) is None and field in lab_values:
                        patient_data[field] = lab_values[field]
            except Exception:
                logger.warning("Failed to enrich ICU prediction with lab data", exc_info=True)

        # Sanitize free-text fields
        if patient_data.get("admission_diagnosis"):
            patient_data["admission_diagnosis"] = sanitize_clinical_text(
                patient_data["admission_diagnosis"]
            )

        # TibaBot requires numeric values for all lab fields.  When labs
        # are unavailable (not yet drawn / not yet verified), substitute
        # clinically normal defaults so the prediction can still run and
        # track which fields were defaulted so the UI can warn the user.
        _LAB_NORMAL_DEFAULTS: dict[str, float] = {
            "creatinine": 0.9,  # mg/dL — mid-normal
            "wbc": 7.5,  # x10^9/L
            "platelets": 250.0,  # x10^9/L
            "lactate": 1.0,  # mmol/L
        }
        defaulted_labs: list[str] = []
        for lab_field, normal_val in _LAB_NORMAL_DEFAULTS.items():
            if patient_data.get(lab_field) is None:
                patient_data[lab_field] = normal_val
                defaulted_labs.append(lab_field)

        # Enrich with user and facility context
        payload = {
            "patient_data": patient_data,
            "user_context": build_user_context(request),
            "facility_context": build_facility_context(request),
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

        # Validate and normalize the response.
        # TibaBot returns sofa_score and qsofa_score as structured objects;
        # the frontend expects a numeric total + a separate breakdown/criteria.
        raw_sofa = result.get("sofa_score")
        if isinstance(raw_sofa, dict):
            sofa_total = raw_sofa.get("total")
            sofa_breakdown = {
                k: raw_sofa.get(k)
                for k in (
                    "respiratory",
                    "coagulation",
                    "liver",
                    "cardiovascular",
                    "neurological",
                    "renal",
                )
                if raw_sofa.get(k) is not None
            }
            # TibaBot uses "cns" instead of "neurological"
            if "cns" in raw_sofa and "neurological" not in sofa_breakdown:
                sofa_breakdown["neurological"] = raw_sofa["cns"]
        else:
            sofa_total = raw_sofa
            sofa_breakdown = result.get("sofa_breakdown")

        raw_qsofa = result.get("qsofa_score")
        if isinstance(raw_qsofa, dict):
            qsofa_total = raw_qsofa.get("total")
            qsofa_criteria: list[str] = []
            if raw_qsofa.get("altered_mentation"):
                qsofa_criteria.append("Altered mentation (GCS < 15)")
            if raw_qsofa.get("respiratory_rate_high"):
                qsofa_criteria.append("Respiratory rate >= 22")
            if raw_qsofa.get("systolic_bp_low"):
                qsofa_criteria.append("Systolic BP <= 100")
        else:
            qsofa_total = raw_qsofa
            qsofa_criteria = result.get("qsofa_criteria", [])

        # Derive risk_score from risk_level if TibaBot didn't provide one
        risk_level = result.get("risk_level", "low")
        risk_score = result.get("risk_score")
        if risk_score is None:
            risk_score = {"critical": 0.95, "high": 0.75, "moderate": 0.5, "low": 0.2}.get(
                risk_level, 0.0
            )

        response_data = {
            "risk_level": risk_level,
            "risk_score": risk_score,
            "sofa_score": sofa_total,
            "sofa_breakdown": sofa_breakdown or None,
            "qsofa_score": qsofa_total,
            "qsofa_criteria": qsofa_criteria,
            "critical_alerts": result.get("critical_alerts", result.get("alerts", [])),
            "escalation": result.get("escalation"),
            "recommendations": result.get("recommendations", result.get("recommended_actions", [])),
            "sepsis_probability": result.get("sepsis_probability"),
            "aki_probability": result.get("aki_probability"),
            "deterioration_probability": result.get("deterioration_probability"),
            "defaulted_labs": defaulted_labs,
        }

        # Persist result
        try:
            stored = AIICURiskResult.objects.create(
                created_by=request.user,
                admission_id=admission_id,
                prediction_type=prediction_type,
                risk_level=response_data.get("risk_level", ""),
                risk_score=response_data.get("risk_score"),
                request_data={"patient_data": patient_data},
                result_data=response_data,
                service_mode="tibabot",
                **_get_tenant_kwargs(request),
            )
            response_data["stored_id"] = str(stored.id)
        except Exception:
            logger.exception("Failed to persist ICU risk result")

        response_serializer = ICUPredictResponseSerializer(data=response_data)
        if response_serializer.is_valid():
            return Response(response_serializer.data)

        # Fallback — return whatever TibaBot gave us
        return Response(response_data)


class ICUQSOFALiteView(AIFeatureGatedMixin, APIView):
    """
    Proxy endpoint for qSOFA-lite scoring via TibaBot.

    POST /api/ai/predict/icu/qsofa-lite/
    Body: {
        "respiratory_rate": 24,
        "systolic_bp": 98,
        "gcs_total": 13
    }

    ``gcs_total`` may be replaced by ``altered_mentation`` when GCS is not
    available at triage.
    """

    permission_classes = [permissions.IsAuthenticated, ReadRequiresModelPermission]

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
    }

    def post(self, request: Request) -> Response:
        serializer = ICUQSOFALiteRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        AuditLog.log(
            action="ai_icu_qsofa_lite",
            user=request.user,
            resource_type="AI",
            resource_id=0,
            ip_address=_get_client_ip(request),
            details={
                "respiratory_rate": data.get("respiratory_rate"),
                "systolic_bp": data.get("systolic_bp"),
                "has_gcs_total": data.get("gcs_total") is not None,
                "has_altered_mentation": data.get("altered_mentation") is not None,
            },
        )

        try:
            result = get_tibabot_client().predict_icu_qsofa_lite(data)
        except TibaBotUnavailableError:
            return Response(
                {
                    **self._EMPTY_RESPONSE,
                    "error": "AI service is temporarily unavailable. Please proceed with clinical assessment.",
                },
                status=status.HTTP_200_OK,
            )
        except TibaBotError:
            return Response(
                {
                    **self._EMPTY_RESPONSE,
                    "error": "AI service error. Please proceed with clinical assessment.",
                },
                status=status.HTTP_200_OK,
            )

        raw_qsofa = result.get("qsofa_score")
        if isinstance(raw_qsofa, dict):
            qsofa_total = raw_qsofa.get("total")
            qsofa_criteria: list[str] = []
            if raw_qsofa.get("altered_mentation"):
                qsofa_criteria.append("Altered mentation (GCS < 15)")
            if raw_qsofa.get("respiratory_rate_high"):
                qsofa_criteria.append("Respiratory rate >= 22")
            if raw_qsofa.get("systolic_bp_low"):
                qsofa_criteria.append("Systolic BP <= 100")
        else:
            qsofa_total = raw_qsofa
            qsofa_criteria = result.get("qsofa_criteria", [])

        qsofa_risk_map = {
            0: ("low", 0.2),
            1: ("moderate", 0.5),
            2: ("high", 0.75),
            3: ("critical", 0.95),
        }
        risk_level, risk_score = qsofa_risk_map.get(int(qsofa_total or 0), ("low", 0.2))

        response_data = {
            **self._EMPTY_RESPONSE,
            "risk_level": result.get("risk_level", risk_level),
            "risk_score": result.get("risk_score", risk_score),
            "qsofa_score": qsofa_total,
            "qsofa_criteria": qsofa_criteria,
            "critical_alerts": result.get("critical_alerts", result.get("alerts", [])),
            "recommendations": result.get("recommendations", result.get("recommended_actions", [])),
        }

        response_serializer = ICUPredictResponseSerializer(data=response_data)
        if response_serializer.is_valid():
            return Response(response_serializer.data)
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

    permission_classes = [permissions.IsAuthenticated, ReadRequiresModelPermission]

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
                                suggested_fields.append(
                                    {
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
                                    }
                                )
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
                        suggested_fields.append(
                            {
                                "field_name": "assessment",
                                "value": assist_response,
                                "confidence": 0.75,
                                "reason": "AI-generated clinical assessment based on encounter context",
                                "source": "ai",
                            }
                        )
                except TibaBotError:
                    logger.warning("TibaBot clinical assist failed during autopopulate")

        except TibaBotUnavailableError:
            logger.warning("TibaBot unavailable for autopopulate")
            return Response(
                AutopopulateResponseSerializer(
                    {
                        "suggested_fields": [],
                        "icd10_suggestions": [],
                        "error": "AI suggestions temporarily unavailable.",
                    }
                ).data,
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
            AutopopulateResponseSerializer(
                {
                    "suggested_fields": [],
                    "icd10_suggestions": [],
                    "error": "AI returned unexpected response shape.",
                }
            ).data,
            status=status.HTTP_200_OK,
        )


# =============================================================================
# eGFR Calculator
# =============================================================================


class EGFRCalculateView(AIFeatureGatedMixin, APIView):
    """
    AI-powered eGFR calculation with CKD staging.

    POST /api/ai/egfr/calculate/

    Returns CKD-EPI 2021 eGFR, Cockcroft-Gault CrCl, CKD stage,
    dose adjustment band, and clinical action flags.
    """

    permission_classes = [permissions.IsAuthenticated, ReadRequiresModelPermission]

    def post(self, request: Request) -> Response:
        from .serializers import EGFRCalculateRequestSerializer, EGFRCalculateResponseSerializer

        serializer = EGFRCalculateRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        AuditLog.log(
            action="ai_egfr_calculate",
            user=request.user,
            resource_type="AI",
            resource_id=0,
            ip_address=_get_client_ip(request),
            details={
                "age": data.get("age"),
                "sex": data.get("sex"),
                "creatinine_unit": data.get("creatinine_unit"),
            },
        )

        # Build TibaBot payload (exclude internal link fields)
        tibabot_payload = {k: v for k, v in data.items() if k not in ("encounter_id", "patient_id")}

        try:
            client = get_tibabot_client()
            result = client.calculate_egfr(tibabot_payload)
            result["mode"] = "tibabot"
        except (TibaBotUnavailableError, TibaBotError) as e:
            logger.warning("TibaBot unavailable for eGFR — using fallback: %s", e)
            from .services.egfr_fallback import calculate_egfr_fallback

            result = calculate_egfr_fallback(data)

        # Persist result
        try:
            stored = AIEGFRResult.objects.create(
                created_by=request.user,
                encounter_id=data.get("encounter_id"),
                patient_id=data.get("patient_id"),
                ckd_stage=result.get("ckd_stage", ""),
                egfr_ckd_epi=result.get("egfr_ckd_epi"),
                dose_adjustment_band=result.get("dose_adjustment_band", ""),
                request_data={
                    k: v for k, v in data.items() if k not in ("encounter_id", "patient_id")
                },
                result_data=result,
                service_mode=result.get("mode", "tibabot"),
                **_get_tenant_kwargs(request),
            )
            result["stored_id"] = str(stored.id)
        except Exception:
            logger.exception("Failed to persist eGFR result")

        response_serializer = EGFRCalculateResponseSerializer(data=result)
        if response_serializer.is_valid():
            return Response(response_serializer.data)
        return Response(result)


class StoredEGFRResultListView(AIFeatureGatedMixin, APIView):
    """
    GET /api/ai/results/egfr/?encounter_id=X or ?patient_id=X

    Returns saved eGFR calculation results.
    """

    permission_classes = [permissions.IsAuthenticated, ReadRequiresModelPermission]

    def get(self, request: Request) -> Response:
        from .serializers import StoredEGFRResultSerializer

        qs = AIEGFRResult.objects.select_related("created_by")
        encounter_id = request.query_params.get("encounter_id")
        patient_id = request.query_params.get("patient_id")
        if encounter_id:
            qs = qs.filter(encounter_id=encounter_id)
        elif patient_id:
            qs = qs.filter(patient_id=patient_id)
        else:
            return Response([])
        resolve_request_tenant(request)
        facility = getattr(request, "facility", None)
        if facility:
            qs = qs.filter(facility=facility)
        return Response(StoredEGFRResultSerializer(qs[:10], many=True).data)


# =============================================================================
# Phase 5 — Lab Assist
# =============================================================================


class LabInterpretView(AIFeatureGatedMixin, APIView):
    """
    AI-powered lab result interpretation.

    POST /api/ai/lab/interpret/

    Returns flagged results with reference ranges, detected multi-lab
    patterns, and critical alerts. Falls back to local reference range
    engine when TibaBot is unavailable.
    """

    permission_classes = [permissions.IsAuthenticated, ReadRequiresModelPermission]

    def post(self, request: Request) -> Response:
        serializer = LabInterpretRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        AuditLog.log(
            action="ai_lab_interpret",
            user=request.user,
            resource_type="AI",
            resource_id=0,
            ip_address=_get_client_ip(request),
            details={
                "patient_age": data.get("patient_age"),
                "lab_count": len(data.get("lab_results", [])),
            },
        )

        try:
            client = get_tibabot_client()
            result = client.interpret_lab(data)
            result["mode"] = "tibabot"
        except TibaBotUnavailableError:
            logger.warning("TibaBot unavailable for lab interpret — using fallback")
            from .services.lab_fallback import interpret_lab_fallback

            result = interpret_lab_fallback(data)
        except TibaBotError as e:
            logger.error("TibaBot error for lab interpret: %s", e)
            from .services.lab_fallback import interpret_lab_fallback

            result = interpret_lab_fallback(data)

        # Persist result
        try:
            flags = result.get("flags", [])
            stored = AILabInterpretResult.objects.create(
                created_by=request.user,
                lab_result_id=data.get("lab_result_id"),
                encounter_id=data.get("encounter_id"),
                abnormal_count=sum(1 for f in flags if f.get("status") in ("abnormal", "critical")),
                critical_count=sum(1 for f in flags if f.get("status") == "critical"),
                request_data={
                    k: v for k, v in data.items() if k not in ("lab_result_id", "encounter_id")
                },
                result_data=result,
                service_mode=result.get("mode", "tibabot"),
                **_get_tenant_kwargs(request),
            )
            result["stored_id"] = str(stored.id)
        except Exception:
            logger.exception("Failed to persist lab interpretation result")

        response_serializer = LabInterpretResponseSerializer(data=result)
        if response_serializer.is_valid():
            return Response(response_serializer.data)
        return Response(result)


# =============================================================================
# Phase 5 — Discharge Readiness
# =============================================================================


class DischargeAssessView(AIFeatureGatedMixin, APIView):
    """
    AI-powered discharge readiness assessment.

    POST /api/ai/discharge/assess/

    Evaluates condition-specific criteria, vitals stability, social
    factors (Kenya-specific), and readmission risk. Falls back to
    checklist scoring when TibaBot is unavailable.
    """

    permission_classes = [permissions.IsAuthenticated, ReadRequiresModelPermission]

    def post(self, request: Request) -> Response:
        serializer = DischargeAssessRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        # Sanitize diagnosis text
        data["primary_diagnosis"] = sanitize_clinical_text(data["primary_diagnosis"])
        json_safe_data = json.loads(json.dumps(data, cls=DjangoJSONEncoder))

        AuditLog.log(
            action="ai_discharge_assess",
            user=request.user,
            resource_type="AI",
            resource_id=0,
            ip_address=_get_client_ip(request),
            details={
                "patient_age": data.get("patient_age"),
                "days_admitted": data.get("days_admitted"),
                "admission_type": data.get("admission_type"),
            },
        )

        try:
            client = get_tibabot_client()
            # Strip internal-only fields before sending to TibaBot
            tibabot_payload = {k: v for k, v in json_safe_data.items() if k != "admission_id"}
            result = client.assess_discharge(tibabot_payload)
            result["mode"] = "tibabot"

            # Supplement shallow TibaBot responses with local criteria
            # for data categories the LLM ignored
            from .services.discharge_fallback import assess_discharge_fallback

            tibabot_categories = {c.get("category") for c in result.get("criteria", [])}
            fallback = assess_discharge_fallback(json_safe_data)
            supplemented = []
            for fc in fallback.get("criteria", []):
                if fc["category"] not in tibabot_categories:
                    fc["source"] = "local"
                    supplemented.append(fc)
            if supplemented:
                result["criteria"] = result.get("criteria", []) + supplemented
                # Recompute unmet count and score
                all_criteria = result["criteria"]
                met = sum(1 for c in all_criteria if c.get("met"))
                total = len(all_criteria)
                result["unmet_criteria_count"] = total - met
                result["readiness_score"] = round(met / max(total, 1), 2)
                if result["readiness_score"] >= 0.8:
                    result["readiness_level"] = "ready"
                elif result["readiness_score"] >= 0.5:
                    result["readiness_level"] = "near_ready"
                else:
                    result["readiness_level"] = "not_ready"
                # Merge recommendations
                tibabot_recs = set(result.get("recommendations", []))
                for fc in supplemented:
                    if not fc["met"]:
                        rec = f"Address: {fc.get('name', fc.get('criterion', ''))}"
                        if rec not in tibabot_recs:
                            result.setdefault("recommendations", []).append(rec)
                # Use fallback vitals_stability if TibaBot didn't provide one
                if not result.get("vitals_stability"):
                    result["vitals_stability"] = fallback.get("vitals_stability")
        except TibaBotUnavailableError:
            logger.warning("TibaBot unavailable for discharge assess — using fallback")
            from .services.discharge_fallback import assess_discharge_fallback

            result = assess_discharge_fallback(json_safe_data)
        except TibaBotError as e:
            logger.error("TibaBot error for discharge assess: %s", e)
            from .services.discharge_fallback import assess_discharge_fallback

            result = assess_discharge_fallback(json_safe_data)

        # Persist result
        try:
            stored = AIDischargeResult.objects.create(
                created_by=request.user,
                admission_id=json_safe_data.get("admission_id"),
                readiness_level=result.get("readiness_level", ""),
                readiness_score=result.get("readiness_score"),
                request_data={k: v for k, v in json_safe_data.items() if k != "admission_id"},
                result_data=result,
                service_mode=result.get("mode", "tibabot"),
                **_get_tenant_kwargs(request),
            )
            result["stored_id"] = str(stored.id)
        except Exception:
            logger.exception("Failed to persist discharge assessment result")

        response_serializer = DischargeAssessResponseSerializer(data=result)
        if response_serializer.is_valid():
            return Response(response_serializer.data)
        return Response(result)


class DischargeConditionsListView(AIFeatureGatedMixin, APIView):
    """
    List conditions supported by discharge readiness assessment.

    GET /api/ai/discharge/conditions/
    """

    permission_classes = [permissions.IsAuthenticated, ReadRequiresModelPermission]

    def get(self, request: Request) -> Response:
        try:
            client = get_tibabot_client()
            result = client.list_discharge_conditions()
        except (TibaBotUnavailableError, TibaBotError):
            logger.warning("TibaBot unavailable for discharge conditions list")
            return Response({"conditions": [], "count": 0})

        return Response(result)


# =============================================================================
# Phase 5 — Care Plan Generator
# =============================================================================


class CarePlanGenerateView(AIFeatureGatedMixin, APIView):
    """
    Generate structured, evidence-based care plan.

    POST /api/ai/care-plan/generate/

    Returns goals, interventions (grouped by category), discharge
    criteria, follow-up instructions, and CDS safety alerts.
    Falls back to generic template when TibaBot is unavailable.
    """

    permission_classes = [permissions.IsAuthenticated, ReadRequiresModelPermission]

    def post(self, request: Request) -> Response:
        serializer = CarePlanGenerateRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        # Sanitize text fields
        if data.get("primary_diagnosis"):
            data["primary_diagnosis"] = sanitize_clinical_text(data["primary_diagnosis"])
        if data.get("chief_complaint"):
            data["chief_complaint"] = sanitize_clinical_text(data["chief_complaint"])

        # Enrich from encounter context when request omitted key clinical fields.
        # This ensures encounter-linked generation still has diagnosis/history payload.
        data = _enrich_care_plan_input_from_encounter(data, request)

        # Re-sanitize potentially enriched text fields.
        if data.get("primary_diagnosis"):
            data["primary_diagnosis"] = sanitize_clinical_text(data["primary_diagnosis"])
        if data.get("chief_complaint"):
            data["chief_complaint"] = sanitize_clinical_text(data["chief_complaint"])

        # Ensure primary_diagnosis has a value for the downstream LLM/fallback.
        # Prefer confirmed diagnosis; fall back to chief complaint.
        if not data.get("primary_diagnosis"):
            data["primary_diagnosis"] = data.get("chief_complaint", "")

        # Enrich with context
        payload = {
            **data,
            "user_context": build_user_context(request),
            "facility_context": build_facility_context(request),
        }

        AuditLog.log(
            action="ai_care_plan_generate",
            user=request.user,
            resource_type="AI",
            resource_id=0,
            ip_address=_get_client_ip(request),
            details={
                "primary_diagnosis": data.get("primary_diagnosis", "")[:100],
                "patient_age": data.get("patient_age"),
                "has_comorbidities": len(data.get("comorbidities", [])) > 0,
            },
        )

        try:
            client = get_tibabot_client()
            result = client.generate_care_plan(payload)
            result["mode"] = "tibabot"
        except TibaBotUnavailableError:
            logger.warning("TibaBot unavailable for care plan — using fallback")
            from .services.care_plan_fallback import generate_care_plan_fallback

            result = generate_care_plan_fallback(data)
        except TibaBotError as e:
            logger.error("TibaBot error for care plan: %s", e)
            from .services.care_plan_fallback import generate_care_plan_fallback

            result = generate_care_plan_fallback(data)

        result = _normalize_care_plan_result(result, data)

        # Persist result
        try:
            stored = AICarePlanResult.objects.create(
                created_by=request.user,
                encounter_id=data.get("encounter_id"),
                admission_id=data.get("admission_id"),
                primary_diagnosis=data.get("primary_diagnosis", "")[:500],
                request_data={
                    k: v for k, v in data.items() if k not in ("encounter_id", "admission_id")
                },
                result_data=result,
                service_mode=result.get("mode", "tibabot"),
                **_get_tenant_kwargs(request),
            )
            result["stored_id"] = str(stored.id)
        except Exception:
            logger.exception("Failed to persist care plan result")

        response_serializer = CarePlanResponseSerializer(data=result)
        if response_serializer.is_valid():
            return Response(response_serializer.data)
        return Response(result)


class CarePlanGenerateFHIRView(AIFeatureGatedMixin, APIView):
    """
    Generate care plan as FHIR R4 CarePlan resource.

    POST /api/ai/care-plan/generate/fhir/

    Same input as /care-plan/generate/ but returns FHIR R4 JSON.
    No fallback — requires TibaBot.
    """

    permission_classes = [permissions.IsAuthenticated, ReadRequiresModelPermission]

    def post(self, request: Request) -> Response:
        serializer = CarePlanGenerateRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        data["primary_diagnosis"] = sanitize_clinical_text(data["primary_diagnosis"])

        payload = {
            **data,
            "user_context": build_user_context(request),
            "facility_context": build_facility_context(request),
        }

        AuditLog.log(
            action="ai_care_plan_fhir_generate",
            user=request.user,
            resource_type="AI",
            resource_id=0,
            ip_address=_get_client_ip(request),
            details={"primary_diagnosis": data.get("primary_diagnosis", "")[:100]},
        )

        try:
            client = get_tibabot_client()
            result = client.generate_care_plan_fhir(payload)
        except TibaBotUnavailableError:
            return Response(
                {"error": "FHIR care plan generation requires TibaBot. Service unavailable."},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )
        except TibaBotError as e:
            logger.error("TibaBot error for FHIR care plan: %s", e)
            return Response(
                {"error": "FHIR care plan generation failed."},
                status=status.HTTP_502_BAD_GATEWAY,
            )

        return Response(result)


class CarePlanConditionsListView(AIFeatureGatedMixin, APIView):
    """
    List conditions with care plan templates.

    GET /api/ai/care-plan/conditions/
    """

    permission_classes = [permissions.IsAuthenticated, ReadRequiresModelPermission]

    def get(self, request: Request) -> Response:
        try:
            client = get_tibabot_client()
            result = client.list_care_plan_conditions()
        except (TibaBotUnavailableError, TibaBotError):
            logger.warning("TibaBot unavailable for care plan conditions list")
            return Response({"conditions": [], "count": 0})

        return Response(result)


# =============================================================================
# Phase 5 — Clerking Assist
# =============================================================================


class ClerkingAutocompleteView(AIFeatureGatedMixin, APIView):
    """
    Context-aware medical autocomplete for clinical notes.

    POST /api/ai/clerking/autocomplete/

    No meaningful fallback — returns empty suggestions when unavailable.
    """

    permission_classes = [permissions.IsAuthenticated, ReadRequiresModelPermission]

    def post(self, request: Request) -> Response:
        serializer = ClerkingAutocompleteRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        AuditLog.log(
            action="ai_clerking_autocomplete",
            user=request.user,
            resource_type="AI",
            resource_id=0,
            ip_address=_get_client_ip(request),
            details={
                "field_name": data.get("field_name"),
                "text_length": len(data.get("text", "")),
            },
        )

        try:
            client = get_tibabot_client()
            result = client.clerking_autocomplete(data)
            result["mode"] = "tibabot"
        except (TibaBotUnavailableError, TibaBotError):
            logger.warning("TibaBot unavailable for clerking autocomplete")
            from .services.clerking_fallback import clerking_autocomplete_fallback

            result = clerking_autocomplete_fallback(data)

        response_serializer = ClerkingAutocompleteResponseSerializer(data=result)
        if response_serializer.is_valid():
            return Response(response_serializer.data)
        return Response(result)


class ClerkingStructureView(AIFeatureGatedMixin, APIView):
    """
    Convert free-text clinical notes to structured format (SOAP/SBAR).

    POST /api/ai/clerking/structure/

    Falls back to empty structure template when TibaBot is unavailable.
    """

    permission_classes = [permissions.IsAuthenticated, ReadRequiresModelPermission]

    def post(self, request: Request) -> Response:
        serializer = ClerkingStructureRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        AuditLog.log(
            action="ai_clerking_structure",
            user=request.user,
            resource_type="AI",
            resource_id=0,
            ip_address=_get_client_ip(request),
            details={
                "note_format": data.get("note_format"),
                "text_length": len(data.get("free_text", "")),
            },
        )

        try:
            client = get_tibabot_client()
            result = client.clerking_structure(data)
            result["mode"] = "tibabot"
        except (TibaBotUnavailableError, TibaBotError):
            logger.warning("TibaBot unavailable for clerking structure")
            from .services.clerking_fallback import clerking_structure_fallback

            result = clerking_structure_fallback(data)

        response_serializer = ClerkingStructureResponseSerializer(data=result)
        if response_serializer.is_valid():
            return Response(response_serializer.data)
        return Response(result)


# =============================================================================
# Phase 6 — Clinical Document Generation
# =============================================================================


class ClinicalDocumentGenerateView(AIFeatureGatedMixin, APIView):
    """
    Generate structured clinical documents using TibaBot LLM.

    POST /api/ai/clinical/document/

    Supports: discharge_summary, soap, progress_note, referral_letter,
    clerking_note. Output formats: markdown, structured, fhir.

    Falls back to empty template when TibaBot is unavailable.
    """

    permission_classes = [permissions.IsAuthenticated, ReadRequiresModelPermission]

    def post(self, request: Request) -> Response:
        serializer = ClinicalDocGenerateRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        # Enrich with server-side context
        payload = {
            **data,
            "user_context": build_user_context(request),
        }
        # Merge facility context: prefer client-supplied, fill gaps from server
        client_facility = data.get("facility_context") or {}
        server_facility = build_facility_context(request)
        raw_level = client_facility.get("level") or server_facility.get("facility_level")
        # Coerce level to int — settings may store it as "L3" / "L4" etc.
        facility_level: int | None = None
        if raw_level is not None:
            if isinstance(raw_level, int):
                facility_level = raw_level
            elif isinstance(raw_level, str):
                digits = "".join(c for c in raw_level if c.isdigit())
                facility_level = int(digits) if digits else None
        payload["facility_context"] = {
            "level": facility_level,
            "county": client_facility.get("county") or server_facility.get("county"),
        }

        AuditLog.log(
            action="ai_clinical_document_generate",
            user=request.user,
            resource_type="AI",
            resource_id=0,
            ip_address=_get_client_ip(request),
            details={
                "document_type": data["document_type"],
                "output_format": data.get("output_format", "markdown"),
                "generation_mode": data.get("generation_mode", "suggest"),
            },
        )

        try:
            client = get_tibabot_client()
            result = client.generate_clinical_document(payload)
            result["mode"] = "tibabot"
        except (TibaBotUnavailableError, TibaBotError) as exc:
            logger.warning(
                "TibaBot unavailable for clinical document generation: %s: %s",
                type(exc).__name__,
                exc,
            )
            from .services.clerking_fallback import clinical_document_fallback

            result = clinical_document_fallback(data)

        response_serializer = ClinicalDocGenerateResponseSerializer(data=result)
        if response_serializer.is_valid():
            return Response(response_serializer.data)
        return Response(result)


# =============================================================================
# Phase 5 — Enhanced CDS Evaluation
# =============================================================================


class CDSEvaluateView(AIFeatureGatedMixin, APIView):
    """
    TibaBot-powered CDS rule evaluation (supplements local engine).

    POST /api/ai/cds/evaluate/

    Checks for DDI, contraindications, protocol adherence, formulary
    compliance. Designed to augment (not replace) the local CDS engine.

    No fallback — returns empty alerts when TibaBot is unavailable.
    """

    permission_classes = [permissions.IsAuthenticated, ReadRequiresModelPermission]

    def post(self, request: Request) -> Response:
        serializer = CDSEvaluateRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        # Enrich with context
        payload = {
            **data,
            "user_context": build_user_context(request),
            "facility_context": build_facility_context(request),
        }

        AuditLog.log(
            action="ai_cds_evaluate",
            user=request.user,
            resource_type="AI",
            resource_id=0,
            ip_address=_get_client_ip(request),
            details={
                "medication_count": len(data.get("medications", [])),
                "diagnosis_count": len(data.get("diagnoses", [])),
            },
        )

        try:
            client = get_tibabot_client()
            result = client.evaluate_cds_rules(payload)
            result["mode"] = "tibabot"
        except (TibaBotUnavailableError, TibaBotError):
            logger.warning("TibaBot unavailable for CDS evaluate")
            result = {
                "alerts": [],
                "recommendations": [],
                "rules_evaluated": 0,
                "rules_fired": 0,
                "processing_time_ms": 0.0,
                "mode": "fallback",
            }

        # Persist result
        try:
            stored = AICDSResult.objects.create(
                created_by=request.user,
                encounter_id=data.get("encounter_id"),
                rules_fired=result.get("rules_fired", 0),
                alert_count=len(result.get("alerts", [])),
                request_data={k: v for k, v in data.items() if k != "encounter_id"},
                result_data=result,
                service_mode=result.get("mode", "tibabot"),
                **_get_tenant_kwargs(request),
            )
            result["stored_id"] = str(stored.id)
        except Exception:
            logger.exception("Failed to persist CDS result")

        response_serializer = CDSEvaluateResponseSerializer(data=result)
        if response_serializer.is_valid():
            return Response(response_serializer.data)
        return Response(result)


# =============================================================================
# Stored AI result retrieval views
# =============================================================================


# =============================================================================
# Phase 7 — Investigation Suggestions
# =============================================================================


class InvestigationSuggestView(AIFeatureGatedMixin, APIView):
    """
    Suggest investigations for a clinical encounter.

    POST /api/ai/investigations/suggest/

    Returns structured investigation suggestions with LOINC codes and
    optional FHIR R4 ServiceRequest resources. Advisory only — clinician
    must explicitly accept each suggestion.
    """

    permission_classes = [permissions.IsAuthenticated, ReadRequiresModelPermission]

    def post(self, request: Request) -> Response:
        serializer = InvestigationSuggestRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        # Sanitize text fields
        if data.get("chief_complaint"):
            data["chief_complaint"] = sanitize_clinical_text(data["chief_complaint"])

        # Enrich with facility context
        facility_ctx = build_facility_context(request)
        if not data.get("facility_level") and facility_ctx.get("keph_level"):
            keph = facility_ctx["keph_level"]
            # Map KEPH L1-L6 to H1-H5 if needed
            if keph and keph.startswith("L"):
                data["facility_level"] = f"H{keph[1:]}"

        # Strip encounter_id before forwarding to TibaBot
        encounter_id = data.pop("encounter_id", None)

        AuditLog.log(
            action="ai_investigation_suggest",
            user=request.user,
            resource_type="AI",
            resource_id=0,
            ip_address=_get_client_ip(request),
            details={
                "diagnoses": data.get("diagnoses", [])[:5],
                "symptom_count": len(data.get("symptoms", [])),
                "include_fhir": data.get("include_fhir", False),
            },
        )

        try:
            client = get_tibabot_client()
            result = client.suggest_investigations(data)
            result["mode"] = "tibabot"
        except TibaBotUnavailableError:
            logger.warning("TibaBot unavailable for investigation suggestions")
            return Response(
                {"error": "TibaBot AI service is currently unavailable."},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )
        except TibaBotError as e:
            logger.error("TibaBot error for investigation suggestions: %s", e)
            return Response(
                {"error": str(e)},
                status=status.HTTP_502_BAD_GATEWAY,
            )

        # Persist result
        try:
            stored = AIInvestigationSuggestResult.objects.create(
                created_by=request.user,
                encounter_id=encounter_id,
                matched_conditions=result.get("matched_conditions", []),
                suggestion_count=result.get("total_suggestions", 0),
                request_data={k: v for k, v in data.items() if k != "encounter_id"},
                result_data=result,
                service_mode=result.get("mode", "tibabot"),
                **_get_tenant_kwargs(request),
            )
            result["stored_id"] = str(stored.id)
        except Exception:
            logger.exception("Failed to persist investigation suggestion result")

        return Response(result)


class StoredInvestigationSuggestListView(AIFeatureGatedMixin, APIView):
    """
    GET /api/ai/results/investigation-suggestions/?encounter_id=X

    Returns saved investigation suggestion results.
    When no filter is provided, returns the 20 most recent results (facility-scoped).
    """

    permission_classes = [permissions.IsAuthenticated, ReadRequiresModelPermission]

    def get(self, request: Request) -> Response:
        qs = AIInvestigationSuggestResult.objects.select_related("created_by").order_by(
            "-created_at"
        )
        encounter_id = request.query_params.get("encounter_id")
        if encounter_id:
            qs = qs.filter(encounter_id=encounter_id)
        resolve_request_tenant(request)
        facility = getattr(request, "facility", None)
        if facility:
            qs = qs.filter(facility=facility)
        return Response(StoredInvestigationSuggestSerializer(qs[:20], many=True).data)


# =============================================================================
# Stored AI Results
# =============================================================================


class StoredCarePlanListView(AIFeatureGatedMixin, APIView):
    """
    GET /api/ai/results/care-plans/?encounter_id=X or ?admission_id=X

    Returns saved care plan results (most recent first).
    When no filter is provided, returns the 20 most recent results (facility-scoped).
    """

    permission_classes = [permissions.IsAuthenticated, ReadRequiresModelPermission]

    def get(self, request: Request) -> Response:
        qs = AICarePlanResult.objects.select_related("created_by").order_by("-created_at")
        encounter_id = request.query_params.get("encounter_id")
        admission_id = request.query_params.get("admission_id")
        if encounter_id:
            qs = qs.filter(encounter_id=encounter_id)
        elif admission_id:
            qs = qs.filter(admission_id=admission_id)
        resolve_request_tenant(request)
        facility = getattr(request, "facility", None)
        if facility:
            qs = qs.filter(facility=facility)
        results = qs[:20]
        return Response(StoredCarePlanSerializer(results, many=True).data)


class StoredCarePlanDeleteView(AIFeatureGatedMixin, APIView):
    """
    DELETE /api/ai/results/care-plans/<uuid:pk>/

    Delete a stored care plan result. Only the creator can delete.
    """

    permission_classes = [permissions.IsAuthenticated, ReadRequiresModelPermission]

    def delete(self, request: Request, pk=None) -> Response:
        try:
            result = AICarePlanResult.objects.get(pk=pk)
        except AICarePlanResult.DoesNotExist:
            return Response(
                {"error": "Care plan result not found"},
                status=status.HTTP_404_NOT_FOUND,
            )
        if result.created_by_id and result.created_by_id != request.user.id:
            return Response(
                {"error": "You can only delete your own care plan results"},
                status=status.HTTP_403_FORBIDDEN,
            )
        result.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class StoredCDSResultListView(AIFeatureGatedMixin, APIView):
    """
    GET /api/ai/results/cds/?encounter_id=X

    Returns saved CDS evaluation results.
    When no filter is provided, returns the 20 most recent results (facility-scoped).
    """

    permission_classes = [permissions.IsAuthenticated, ReadRequiresModelPermission]

    def get(self, request: Request) -> Response:
        qs = AICDSResult.objects.select_related("created_by").order_by("-created_at")
        encounter_id = request.query_params.get("encounter_id")
        if encounter_id:
            qs = qs.filter(encounter_id=encounter_id)
        resolve_request_tenant(request)
        facility = getattr(request, "facility", None)
        if facility:
            qs = qs.filter(facility=facility)
        return Response(StoredCDSResultSerializer(qs[:20], many=True).data)


class StoredLabInterpretListView(AIFeatureGatedMixin, APIView):
    """
    GET /api/ai/results/lab-interpretations/?lab_result_id=X or ?encounter_id=X

    Returns saved lab interpretation results.
    When no filter is provided, returns the 20 most recent results (facility-scoped).
    """

    permission_classes = [permissions.IsAuthenticated, ReadRequiresModelPermission]

    def get(self, request: Request) -> Response:
        qs = AILabInterpretResult.objects.select_related("created_by").order_by("-created_at")
        lab_result_id = request.query_params.get("lab_result_id")
        encounter_id = request.query_params.get("encounter_id")
        if lab_result_id:
            qs = qs.filter(lab_result_id=lab_result_id)
        elif encounter_id:
            qs = qs.filter(encounter_id=encounter_id)
        resolve_request_tenant(request)
        facility = getattr(request, "facility", None)
        if facility:
            qs = qs.filter(facility=facility)
        return Response(StoredLabInterpretSerializer(qs[:20], many=True).data)


class StoredDischargeResultListView(AIFeatureGatedMixin, APIView):
    """
    GET /api/ai/results/discharge/?admission_id=X

    Returns saved discharge readiness assessments.
    When no filter is provided, returns the 20 most recent results (facility-scoped).
    """

    permission_classes = [permissions.IsAuthenticated, ReadRequiresModelPermission]

    def get(self, request: Request) -> Response:
        qs = AIDischargeResult.objects.select_related("created_by").order_by("-created_at")
        admission_id = request.query_params.get("admission_id")
        if admission_id:
            qs = qs.filter(admission_id=admission_id)
        resolve_request_tenant(request)
        facility = getattr(request, "facility", None)
        if facility:
            qs = qs.filter(facility=facility)
        return Response(StoredDischargeResultSerializer(qs[:20], many=True).data)


class StoredICURiskResultListView(AIFeatureGatedMixin, APIView):
    """
    GET /api/ai/results/icu-risk/?admission_id=X

    Returns saved ICU risk results.
    When no filter is provided, returns the 20 most recent results (facility-scoped).
    """

    permission_classes = [permissions.IsAuthenticated, ReadRequiresModelPermission]

    def get(self, request: Request) -> Response:
        qs = AIICURiskResult.objects.select_related("created_by").order_by("-created_at")
        admission_id = request.query_params.get("admission_id")
        if admission_id:
            qs = qs.filter(admission_id=admission_id)
        resolve_request_tenant(request)
        facility = getattr(request, "facility", None)
        if facility:
            qs = qs.filter(facility=facility)
        return Response(StoredICURiskResultSerializer(qs[:20], many=True).data)


# =============================================================================
# Phase 8 — Surgical Assistant
# =============================================================================


class SurgicalPreOpAssessView(AIFeatureGatedMixin, APIView):
    """Proxy surgical pre-operative risk assessment and persist results."""

    permission_classes = [permissions.IsAuthenticated, ReadRequiresModelPermission]

    def post(self, request: Request) -> Response:
        serializer = SurgicalPreOpAssessRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        surgery_case_id = data.pop("surgery_case_id")
        payload = {
            **data,
            "user_context": build_user_context(request),
            "facility_context": build_facility_context(request),
        }

        AuditLog.log(
            action="ai_surgical_pre_op_assess",
            user=request.user,
            resource_type="SurgeryCase",
            resource_id=surgery_case_id,
            ip_address=_get_client_ip(request),
            details={
                "procedure_key": data.get("procedure_key", ""),
                "asa_class": data.get("asa_class"),
                "include_fhir": data.get("include_fhir", False),
            },
        )

        try:
            client = get_tibabot_client()
            result = client.assess_surgical_pre_op(payload)
            result["mode"] = "tibabot"
        except TibaBotUnavailableError:
            logger.warning("TibaBot unavailable for surgical pre-op assessment")
            return Response(
                {"error": "TibaBot AI service is currently unavailable."},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )
        except TibaBotError as e:
            logger.error("TibaBot error for surgical pre-op assessment: %s", e)
            return Response(
                {"error": str(e)},
                status=status.HTTP_502_BAD_GATEWAY,
            )

        risk_scores = result.get("risk_scores", {})
        try:
            stored = AISurgicalPreOpAssessResult.objects.create(
                created_by=request.user,
                surgery_case_id=surgery_case_id,
                overall_risk_level=risk_scores.get("overall_risk_level", "")[:20],
                facility_capable=_parse_bool(result.get("facility_capable")),
                request_data=data,
                result_data=result,
                service_mode=result.get("mode", "tibabot"),
                **_get_tenant_kwargs(request),
            )
            result["stored_id"] = str(stored.id)
        except Exception:
            logger.exception("Failed to persist surgical pre-op assessment result")

        response_serializer = SurgicalPreOpAssessResponseSerializer(data=result)
        if response_serializer.is_valid():
            return Response(response_serializer.data)
        return Response(result)


class SurgicalChecklistStartView(AIFeatureGatedMixin, APIView):
    """Start a TibaBot advisory checklist session and persist the initial snapshot."""

    permission_classes = [permissions.IsAuthenticated, ReadRequiresModelPermission]

    def post(self, request: Request) -> Response:
        serializer = SurgicalChecklistStartRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        surgery_case_id = data.pop("surgery_case_id")

        AuditLog.log(
            action="ai_surgical_checklist_start",
            user=request.user,
            resource_type="SurgeryCase",
            resource_id=surgery_case_id,
            ip_address=_get_client_ip(request),
            details={"procedure_key": data.get("procedure_key", "")},
        )

        try:
            client = get_tibabot_client()
            result = client.start_surgical_checklist(data)
            result["mode"] = "tibabot"
        except TibaBotUnavailableError:
            logger.warning("TibaBot unavailable for surgical checklist start")
            return Response(
                {"error": "TibaBot AI service is currently unavailable."},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )
        except TibaBotError as e:
            logger.error("TibaBot error for surgical checklist start: %s", e)
            return Response({"error": str(e)}, status=status.HTTP_502_BAD_GATEWAY)

        session = result.get("session", {})
        tibabot_session_id = (
            session.get("session_id") or session.get("id") or result.get("session_id") or ""
        )
        progress = result.get("progress", {})
        # Derive progress from session items if TibaBot didn't include a progress block
        if not progress and session.get("items"):
            items = session["items"]
            total = len(items)
            checked = sum(1 for i in items if isinstance(i, dict) and i.get("checked"))
            progress = {
                "current_phase": session.get("state", ""),
                "total_items": total,
                "total_checked": checked,
                "percent_complete": round(checked / total * 100) if total else 0,
            }
            result["progress"] = progress
        try:
            stored = AISurgicalChecklistSessionResult.objects.create(
                created_by=request.user,
                surgery_case_id=surgery_case_id,
                tibabot_session_id=tibabot_session_id,
                current_phase=(session.get("state") or progress.get("current_phase") or "")[:40],
                percent_complete=progress.get("percent_complete"),
                phase_complete=bool(result.get("phase_complete", False)),
                request_data=data,
                result_data=result,
                service_mode=result.get("mode", "tibabot"),
                **_get_tenant_kwargs(request),
            )
            result["stored_id"] = str(stored.id)
            result["tibabot_session_id"] = tibabot_session_id
        except Exception:
            logger.exception("Failed to persist surgical checklist session result")

        response_serializer = SurgicalChecklistSessionResponseSerializer(data=result)
        if response_serializer.is_valid():
            return Response(response_serializer.data)
        return Response(result)


class SurgicalChecklistAdvanceView(AIFeatureGatedMixin, APIView):
    """Advance a persisted TibaBot advisory checklist session."""

    permission_classes = [permissions.IsAuthenticated, ReadRequiresModelPermission]

    def post(self, request: Request, session_id: str) -> Response:
        serializer = SurgicalChecklistAdvanceRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        AuditLog.log(
            action="ai_surgical_checklist_advance",
            user=request.user,
            resource_type="AI",
            resource_id=0,
            ip_address=_get_client_ip(request),
            details={"tibabot_session_id": session_id},
        )

        try:
            client = get_tibabot_client()
            result = client.advance_surgical_checklist(session_id, data)
            result["mode"] = "tibabot"
        except TibaBotUnavailableError:
            logger.warning("TibaBot unavailable for surgical checklist advance")
            return Response(
                {"error": "TibaBot AI service is currently unavailable."},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )
        except TibaBotError as e:
            logger.error("TibaBot error for surgical checklist advance: %s", e)
            return Response({"error": str(e)}, status=status.HTTP_502_BAD_GATEWAY)

        latest = (
            AISurgicalChecklistSessionResult.objects.filter(tibabot_session_id=session_id)
            .order_by("-created_at")
            .first()
        )
        session = result.get("session", {})
        progress = result.get("progress", {})
        # Derive progress from session items if TibaBot didn't include a progress block
        if not progress and session.get("items"):
            items = session["items"]
            total = len(items)
            checked = sum(1 for i in items if isinstance(i, dict) and i.get("checked"))
            progress = {
                "current_phase": session.get("state", ""),
                "total_items": total,
                "total_checked": checked,
                "percent_complete": round(checked / total * 100) if total else 0,
            }
            result["progress"] = progress
        if latest is not None:
            try:
                stored = AISurgicalChecklistSessionResult.objects.create(
                    created_by=request.user,
                    surgery_case=latest.surgery_case,
                    tibabot_session_id=session_id,
                    current_phase=(session.get("state") or progress.get("current_phase") or "")[
                        :40
                    ],
                    percent_complete=progress.get("percent_complete"),
                    phase_complete=bool(result.get("phase_complete", False)),
                    request_data=data,
                    result_data=result,
                    service_mode=result.get("mode", "tibabot"),
                    facility=latest.facility,
                    organization=latest.organization,
                )
                result["stored_id"] = str(stored.id)
            except Exception:
                logger.exception("Failed to persist surgical checklist advance result")
        result["tibabot_session_id"] = session_id

        response_serializer = SurgicalChecklistSessionResponseSerializer(data=result)
        if response_serializer.is_valid():
            return Response(response_serializer.data)
        return Response(result)


class SurgicalChecklistStatusView(AIFeatureGatedMixin, APIView):
    """Fetch live status for a TibaBot advisory checklist session."""

    permission_classes = [permissions.IsAuthenticated, ReadRequiresModelPermission]

    def get(self, request: Request, session_id: str) -> Response:
        try:
            client = get_tibabot_client()
            result = client.get_surgical_checklist_status(session_id)
            result["mode"] = "tibabot"
            result["tibabot_session_id"] = session_id
            # Derive progress from session items if TibaBot didn't include a progress block
            session = result.get("session", {})
            progress = result.get("progress", {})
            if not progress and session.get("items"):
                items = session["items"]
                total = len(items)
                checked = sum(1 for i in items if isinstance(i, dict) and i.get("checked"))
                result["progress"] = {
                    "current_phase": session.get("state", ""),
                    "total_items": total,
                    "total_checked": checked,
                    "percent_complete": round(checked / total * 100) if total else 0,
                }
        except TibaBotUnavailableError:
            logger.warning("TibaBot unavailable for surgical checklist status")
            return Response(
                {"error": "TibaBot AI service is currently unavailable."},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )
        except TibaBotError as e:
            logger.error("TibaBot error for surgical checklist status: %s", e)
            return Response({"error": str(e)}, status=status.HTTP_502_BAD_GATEWAY)

        response_serializer = SurgicalChecklistSessionResponseSerializer(data=result)
        if response_serializer.is_valid():
            return Response(response_serializer.data)
        return Response(result)


class SurgicalPostOpCarePlanView(AIFeatureGatedMixin, APIView):
    """Generate a TibaBot post-operative care plan and persist it."""

    permission_classes = [permissions.IsAuthenticated, ReadRequiresModelPermission]

    def post(self, request: Request) -> Response:
        serializer = SurgicalPostOpCarePlanRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        surgery_case_id = data.pop("surgery_case_id")
        if data.get("findings"):
            data["findings"] = sanitize_clinical_text(data["findings"])

        AuditLog.log(
            action="ai_surgical_post_op_care_plan",
            user=request.user,
            resource_type="SurgeryCase",
            resource_id=surgery_case_id,
            ip_address=_get_client_ip(request),
            details={"procedure_key": data.get("procedure_key", "")},
        )

        try:
            client = get_tibabot_client()
            result = client.generate_surgical_post_op_care_plan(data)
            result["mode"] = "tibabot"
        except TibaBotUnavailableError:
            logger.warning("TibaBot unavailable for surgical post-op care plan")
            return Response(
                {"error": "TibaBot AI service is currently unavailable."},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )
        except TibaBotError as e:
            logger.error("TibaBot error for surgical post-op care plan: %s", e)
            return Response({"error": str(e)}, status=status.HTTP_502_BAD_GATEWAY)

        surgical_apgar = result.get("surgical_apgar") or {}
        try:
            stored = AISurgicalPostOpCarePlanResult.objects.create(
                created_by=request.user,
                surgery_case_id=surgery_case_id,
                procedure_key=data.get("procedure_key", "")[:100],
                surgical_apgar_score=surgical_apgar.get("score"),
                risk_level=surgical_apgar.get("risk_level", "")[:20],
                request_data=data,
                result_data=result,
                service_mode=result.get("mode", "tibabot"),
                **_get_tenant_kwargs(request),
            )
            result["stored_id"] = str(stored.id)
        except Exception:
            logger.exception("Failed to persist surgical post-op care plan result")

        response_serializer = SurgicalPostOpCarePlanResponseSerializer(data=result)
        if response_serializer.is_valid():
            return Response(response_serializer.data)
        return Response(result)


class SurgicalProcedureListView(AIFeatureGatedMixin, APIView):
    """List TibaBot surgical procedure templates for mapping and UI fallback."""

    permission_classes = [permissions.IsAuthenticated, ReadRequiresModelPermission]

    @extend_schema(operation_id="api_ai_surgical_procedures_list")
    def get(self, request: Request) -> Response:
        try:
            client = get_tibabot_client()
            result = client.list_surgical_procedures()
        except TibaBotUnavailableError:
            logger.warning("TibaBot unavailable for surgical procedures list")
            return Response(
                {"error": "TibaBot AI service is currently unavailable."},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )
        except TibaBotError as e:
            logger.error("TibaBot error for surgical procedures list: %s", e)
            return Response({"error": str(e)}, status=status.HTTP_502_BAD_GATEWAY)

        response_serializer = SurgicalProcedureListResponseSerializer(data=result)
        if response_serializer.is_valid():
            return Response(response_serializer.data)
        return Response(result)


class SurgicalProcedureDetailView(AIFeatureGatedMixin, APIView):
    """Get a single TibaBot surgical procedure template."""

    permission_classes = [permissions.IsAuthenticated, ReadRequiresModelPermission]

    @extend_schema(operation_id="api_ai_surgical_procedures_detail_retrieve")
    def get(self, request: Request, procedure_key: str) -> Response:
        try:
            client = get_tibabot_client()
            result = client.get_surgical_procedure(procedure_key)
        except TibaBotUnavailableError:
            logger.warning("TibaBot unavailable for surgical procedure detail")
            return Response(
                {"error": "TibaBot AI service is currently unavailable."},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )
        except TibaBotError as e:
            logger.error("TibaBot error for surgical procedure detail: %s", e)
            return Response({"error": str(e)}, status=status.HTTP_502_BAD_GATEWAY)

        response_serializer = SurgicalProcedureDetailResponseSerializer(data=result)
        if response_serializer.is_valid():
            return Response(response_serializer.data)
        return Response(result)


class StoredSurgicalPreOpAssessListView(AIFeatureGatedMixin, APIView):
    """Return saved surgical pre-op assessments for a surgery case."""

    permission_classes = [permissions.IsAuthenticated, ReadRequiresModelPermission]

    def get(self, request: Request) -> Response:
        surgery_case_id = request.query_params.get("surgery_case_id")
        if not surgery_case_id:
            return Response([])
        resolve_request_tenant(request)
        facility = getattr(request, "facility", None)
        qs = AISurgicalPreOpAssessResult.objects.select_related("created_by").filter(
            surgery_case_id=surgery_case_id,
        )
        if facility:
            qs = qs.filter(facility=facility)
        return Response(StoredSurgicalPreOpAssessSerializer(qs[:10], many=True).data)


class StoredSurgicalChecklistSessionListView(AIFeatureGatedMixin, APIView):
    """Return saved advisory checklist session snapshots for a surgery case."""

    permission_classes = [permissions.IsAuthenticated, ReadRequiresModelPermission]

    def get(self, request: Request) -> Response:
        surgery_case_id = request.query_params.get("surgery_case_id")
        if not surgery_case_id:
            return Response([])
        resolve_request_tenant(request)
        facility = getattr(request, "facility", None)
        qs = AISurgicalChecklistSessionResult.objects.select_related("created_by").filter(
            surgery_case_id=surgery_case_id,
        )
        if facility:
            qs = qs.filter(facility=facility)
        return Response(StoredSurgicalChecklistSessionSerializer(qs[:10], many=True).data)


class StoredSurgicalPostOpCarePlanListView(AIFeatureGatedMixin, APIView):
    """Return saved surgical post-op care plans for a surgery case."""

    permission_classes = [permissions.IsAuthenticated, ReadRequiresModelPermission]

    def get(self, request: Request) -> Response:
        surgery_case_id = request.query_params.get("surgery_case_id")
        if not surgery_case_id:
            return Response([])
        resolve_request_tenant(request)
        facility = getattr(request, "facility", None)
        qs = AISurgicalPostOpCarePlanResult.objects.select_related("created_by").filter(
            surgery_case_id=surgery_case_id,
        )
        if facility:
            qs = qs.filter(facility=facility)
        return Response(StoredSurgicalPostOpCarePlanSerializer(qs[:10], many=True).data)


# =============================================================================
# AI Advisory → Order link views
# =============================================================================

_AI_RESULT_MODEL_MAP: dict[str, type] = {
    "pre_op_assessment": AISurgicalPreOpAssessResult,
    "post_op_care_plan": AISurgicalPostOpCarePlanResult,
}

# Category → extraction function that returns list[(category, index, text)].
_SUGGESTION_EXTRACTORS: dict[
    str,
    # callable(result_data) -> list[(category, index, text)]
    type[None],  # placeholder for type hint, actual callables below
] = {}  # type: ignore[assignment]


def _extract_suggestions(
    result_data: dict,
) -> list[tuple[str, int, str]]:
    """Extract all actionable suggestion lines from a result_data dict."""
    suggestions: list[tuple[str, int, str]] = []

    # ── Medications ──────────────────────────────────────────────────────
    meds = result_data.get("medications")
    if isinstance(meds, list):
        for i, med in enumerate(meds):
            if isinstance(med, str) and med.strip():
                suggestions.append(("medications", i, med.strip()))

    # ── Pre-op checklist investigations ──────────────────────────────────
    checklist = result_data.get("pre_op_checklist")
    if isinstance(checklist, dict):
        invs = checklist.get("investigations")
        if isinstance(invs, list):
            for i, inv in enumerate(invs):
                if isinstance(inv, str) and inv.strip():
                    suggestions.append(("pre_op_checklist.investigations", i, inv.strip()))

    # ── Anaesthesia options (display-only, usually not orderable) ────────
    # Skipped intentionally — clinical workflow doesn't produce "orders".

    # ── Required equipment ───────────────────────────────────────────────
    equip = result_data.get("required_equipment")
    if isinstance(equip, list):
        for i, item in enumerate(equip):
            if isinstance(item, str) and item.strip():
                suggestions.append(("required_equipment", i, item.strip()))

    # ── Complications to watch ───────────────────────────────────────────
    complications = result_data.get("complications_to_watch") or result_data.get(
        "complications_watchlist"
    )
    if isinstance(complications, list):
        for i, comp in enumerate(complications):
            text = comp.get("complication", "") if isinstance(comp, dict) else str(comp)
            if text.strip():
                suggestions.append(("complications_to_watch", i, text.strip()))

    # ── Discharge criteria ───────────────────────────────────────────────
    discharge = result_data.get("discharge_criteria")
    if isinstance(discharge, list):
        for i, crit in enumerate(discharge):
            if isinstance(crit, str) and crit.strip():
                suggestions.append(("discharge_criteria", i, crit.strip()))

    # ── Follow-up red flags ──────────────────────────────────────────────
    follow_up = result_data.get("follow_up")
    if isinstance(follow_up, dict):
        red_flags = follow_up.get("red_flags")
        if isinstance(red_flags, list):
            for i, flag in enumerate(red_flags):
                if isinstance(flag, str) and flag.strip():
                    suggestions.append(("follow_up.red_flags", i, flag.strip()))

    # ── Post-op care sub-fields ──────────────────────────────────────────
    post_op_care = result_data.get("post_op_care")
    if isinstance(post_op_care, dict):
        post_op_meds = post_op_care.get("medications")
        if isinstance(post_op_meds, list):
            for i, med in enumerate(post_op_meds):
                if isinstance(med, str) and med.strip():
                    suggestions.append(("post_op_care.medications", i, med.strip()))

    # ── Monitoring (single text → index 0) ───────────────────────────────
    monitoring = result_data.get("monitoring")
    if isinstance(monitoring, str) and monitoring.strip():
        suggestions.append(("monitoring", 0, monitoring.strip()))

    # ── Activity (single text → index 0) ─────────────────────────────────
    activity = result_data.get("activity")
    if isinstance(activity, str) and activity.strip():
        suggestions.append(("activity", 0, activity.strip()))

    # ── Nutrition (single text → index 0) ────────────────────────────────
    nutrition = result_data.get("nutrition")
    if isinstance(nutrition, str) and nutrition.strip():
        suggestions.append(("nutrition", 0, nutrition.strip()))

    # ── Wound care (single text → index 0) ───────────────────────────────
    wound_care = result_data.get("wound_care")
    if isinstance(wound_care, str) and wound_care.strip():
        suggestions.append(("wound_care", 0, wound_care.strip()))

    return suggestions


class AIAdvisoryOrderLinkListView(AISchemaMixin, APIView):
    """List links for a given AI result or seed them from result_data."""

    permission_classes = [permissions.IsAuthenticated, ReadRequiresModelPermission]

    def get(self, request: Request) -> Response:
        """GET /api/ai/advisory-links/?ai_result_id=<uuid>"""
        ai_result_id = request.query_params.get("ai_result_id")
        if not ai_result_id:
            return Response([], status=status.HTTP_200_OK)

        qs = AIAdvisoryOrderLink.objects.filter(ai_result_id=ai_result_id).select_related(
            "lab_order", "imaging_order", "prescription"
        )
        return Response(AIAdvisoryOrderLinkSerializer(qs, many=True).data)

    def post(self, request: Request) -> Response:
        """POST /api/ai/advisory-links/ — seed suggestion rows from result_data."""
        from django.contrib.contenttypes.models import ContentType

        serializer = AIAdvisoryBulkSeedSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        model_cls = _AI_RESULT_MODEL_MAP.get(data["ai_result_type"])
        if not model_cls:
            return Response(
                {"error": f"Unknown ai_result_type: {data['ai_result_type']}"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            ai_result = model_cls.objects.get(pk=data["ai_result_id"])
        except model_cls.DoesNotExist:
            return Response(
                {"error": "AI result not found."},
                status=status.HTTP_404_NOT_FOUND,
            )

        ct = ContentType.objects.get_for_model(model_cls)
        result_data = ai_result.result_data or {}
        suggestions = _extract_suggestions(result_data)

        created = 0
        for category, index, text in suggestions:
            _, was_created = AIAdvisoryOrderLink.objects.get_or_create(
                ai_result_content_type=ct,
                ai_result_id=ai_result.pk,
                suggestion_category=category,
                suggestion_index=index,
                defaults={
                    "suggestion_text": text,
                    "facility": ai_result.facility,
                    "organization": ai_result.organization,
                },
            )
            if was_created:
                created += 1

        qs = AIAdvisoryOrderLink.objects.filter(
            ai_result_content_type=ct, ai_result_id=ai_result.pk
        ).select_related("lab_order", "imaging_order", "prescription")
        return Response(
            {
                "created": created,
                "total": qs.count(),
                "links": AIAdvisoryOrderLinkSerializer(qs, many=True).data,
            },
            status=status.HTTP_201_CREATED if created else status.HTTP_200_OK,
        )


class AIAdvisoryOrderLinkActionView(AISchemaMixin, APIView):
    """Action a single suggestion: mark as ORDERED / DECLINED / NOT_APPLICABLE."""

    permission_classes = [permissions.IsAuthenticated, ReadRequiresModelPermission]

    def patch(self, request: Request, pk: int) -> Response:
        """PATCH /api/ai/advisory-links/<id>/action/"""
        try:
            link = AIAdvisoryOrderLink.objects.select_related(
                "lab_order", "imaging_order", "prescription"
            ).get(pk=pk)
        except AIAdvisoryOrderLink.DoesNotExist:
            return Response(
                {"error": "Link not found."},
                status=status.HTTP_404_NOT_FOUND,
            )

        serializer = AIAdvisoryOrderLinkActionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        link.status = data["status"]
        link.actioned_by = request.user
        link.actioned_at = timezone.now()

        if data["status"] == "ORDERED":
            link.lab_order_id = data.get("lab_order_id")
            link.imaging_order_id = data.get("imaging_order_id")
            link.prescription_id = data.get("prescription_id")
        else:
            link.lab_order = None
            link.imaging_order = None
            link.prescription = None

        link.save()
        return Response(AIAdvisoryOrderLinkSerializer(link).data)


class AIAdvisoryHasOrdersView(AISchemaMixin, APIView):
    """Check whether an AI result has non-draft orders linked.

    Used by the frontend to disable 'Ask again' when live orders exist.
    """

    permission_classes = [permissions.IsAuthenticated, ReadRequiresModelPermission]

    def get(self, request: Request) -> Response:
        """GET /api/ai/advisory-links/has-orders/?ai_result_id=<uuid>"""
        ai_result_id = request.query_params.get("ai_result_id")
        if not ai_result_id:
            return Response({"has_orders": False})

        qs = AIAdvisoryOrderLink.objects.filter(
            ai_result_id=ai_result_id,
            status=AIAdvisoryOrderLinkStatus.ORDERED,
        )

        # Check that the linked orders are not drafts
        for link in qs.select_related("lab_order", "imaging_order", "prescription"):
            if link.lab_order and link.lab_order.status != "DRAFT":
                return Response({"has_orders": True})
            if link.imaging_order and link.imaging_order.status != "DRAFT":
                return Response({"has_orders": True})
            if link.prescription and link.prescription.status not in ("DRAFT", ""):
                return Response({"has_orders": True})

        return Response({"has_orders": False})


# =============================================================================
# Proactive Insights
# =============================================================================


class ProactiveInsightsView(AIFeatureGatedMixin, APIView):
    """
    Generate proactive clinical insights based on encounter context.

    POST /api/ai/clinical/proactive-insights/

    Three-tier insight generation:
    - Tier 1: Rule-based vital alerts (deterministic, instant)
    - Tier 2: Pattern-based clinical nudges (rules engine, instant)
    - Tier 3: LLM-powered insights (TibaBot, async, conditional)

    Rate-limited: max 2 requests per 30 seconds per user.
    Context deduplication: returns empty if context_hash matches previous call.
    """

    permission_classes = [permissions.IsAuthenticated, ReadRequiresModelPermission]
    throttle_scope = "ai_proactive"

    def post(self, request: Request) -> Response:
        from .proactive import compute_context_hash, generate_proactive_insights
        from .serializers import (
            ProactiveInsightsRequestSerializer,
            ProactiveInsightsResponseSerializer,
        )

        serializer = ProactiveInsightsRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        patient_context = data["patient_context"]
        encounter_context = data["encounter_context"]
        include_llm = data.get("include_llm", True)
        previous_hash = data.get("context_hash", "")

        # Context deduplication — skip if context hasn't changed
        current_hash = compute_context_hash(encounter_context)
        if previous_hash and previous_hash == current_hash:
            return Response(
                {
                    "insights": [],
                    "context_hash": current_hash,
                    "tier_counts": {"tier1": 0, "tier2": 0, "tier3": 0},
                    "total": 0,
                },
                status=status.HTTP_200_OK,
            )

        # Enrich with server-side context
        user_context = build_user_context(request)
        facility_context = build_facility_context(request)

        # Generate insights
        result = generate_proactive_insights(
            patient_context=patient_context,
            encounter_context=encounter_context,
            user_context=user_context,
            facility_context=facility_context,
            include_llm=include_llm,
        )

        # Override context_hash from engine
        result["context_hash"] = current_hash

        # Audit log
        AuditLog.log(
            action="ai_proactive_insight",
            user=request.user,
            resource_type="AI",
            resource_id=0,
            ip_address=_get_client_ip(request),
            user_agent=request.META.get("HTTP_USER_AGENT", ""),
            details={
                "total_insights": result["total"],
                "tier_counts": result["tier_counts"],
                "include_llm": include_llm,
                "context_hash": current_hash,
            },
        )

        # Record token usage if LLM was called
        _record_response_tokens(request, result)

        response_serializer = ProactiveInsightsResponseSerializer(data=result)
        if response_serializer.is_valid():
            return Response(response_serializer.data)
        return Response(result)


# =============================================================================
# Webhook Management
# =============================================================================


class WebhookRegisterView(AIFeatureGatedMixin, APIView):
    """
    Register a new TibaBot webhook subscription.

    POST /api/ai/webhooks/
    """

    permission_classes = [permissions.IsAuthenticated, ReadRequiresModelPermission]

    def post(self, request: Request) -> Response:
        from .serializers import WebhookRegisterRequestSerializer

        serializer = WebhookRegisterRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        payload = {
            "url": data["url"],
            "events": data["events"],
            "secret": data["secret"],
        }

        try:
            client = get_tibabot_client()
            result = client.register_webhook(payload)
        except TibaBotUnavailableError:
            return Response(
                {"error": "TibaBot service is currently unavailable."},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )
        except TibaBotError as e:
            return Response(
                {"error": str(e)},
                status=e.status_code or status.HTTP_502_BAD_GATEWAY,
            )

        AuditLog.log(
            action="ai_webhook_register",
            user=request.user,
            resource_type="AI",
            resource_id=0,
            ip_address=_get_client_ip(request),
            user_agent=request.META.get("HTTP_USER_AGENT", ""),
            details={"events": data["events"], "url": data["url"][:200]},
        )

        return Response(result, status=status.HTTP_201_CREATED)


class WebhookListView(AIFeatureGatedMixin, APIView):
    """
    List registered TibaBot webhooks.

    GET /api/ai/webhooks/
    """

    permission_classes = [permissions.IsAuthenticated, ReadRequiresModelPermission]

    def get(self, request: Request) -> Response:
        try:
            client = get_tibabot_client()
            result = client.list_webhooks()
        except TibaBotUnavailableError:
            return Response(
                {"error": "TibaBot service is currently unavailable."},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )
        except TibaBotError as e:
            return Response(
                {"error": str(e)},
                status=e.status_code or status.HTTP_502_BAD_GATEWAY,
            )

        return Response(result)


class WebhookDetailView(AIFeatureGatedMixin, APIView):
    """
    Get, update, or delete a TibaBot webhook subscription.

    GET    /api/ai/webhooks/{id}/
    PUT    /api/ai/webhooks/{id}/
    DELETE /api/ai/webhooks/{id}/
    """

    permission_classes = [permissions.IsAuthenticated, ReadRequiresModelPermission]

    def get(self, request: Request, webhook_id: str) -> Response:
        try:
            client = get_tibabot_client()
            result = client.get_webhook(webhook_id)
        except TibaBotUnavailableError:
            return Response(
                {"error": "TibaBot service is currently unavailable."},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )
        except TibaBotError as e:
            return Response(
                {"error": str(e)},
                status=e.status_code or status.HTTP_502_BAD_GATEWAY,
            )

        return Response(result)

    def put(self, request: Request, webhook_id: str) -> Response:
        from .serializers import WebhookUpdateRequestSerializer

        serializer = WebhookUpdateRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        payload: dict[str, Any] = {}
        if "url" in data:
            payload["url"] = data["url"]
        if "events" in data:
            payload["events"] = data["events"]
        if "secret" in data:
            payload["secret"] = data["secret"]

        try:
            client = get_tibabot_client()
            result = client.update_webhook(webhook_id, payload)
        except TibaBotUnavailableError:
            return Response(
                {"error": "TibaBot service is currently unavailable."},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )
        except TibaBotError as e:
            return Response(
                {"error": str(e)},
                status=e.status_code or status.HTTP_502_BAD_GATEWAY,
            )

        AuditLog.log(
            action="ai_webhook_update",
            user=request.user,
            resource_type="AI",
            resource_id=0,
            ip_address=_get_client_ip(request),
            user_agent=request.META.get("HTTP_USER_AGENT", ""),
            details={"webhook_id": webhook_id},
        )

        return Response(result)

    def delete(self, request: Request, webhook_id: str) -> Response:
        try:
            client = get_tibabot_client()
            result = client.delete_webhook(webhook_id)
        except TibaBotUnavailableError:
            return Response(
                {"error": "TibaBot service is currently unavailable."},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )
        except TibaBotError as e:
            return Response(
                {"error": str(e)},
                status=e.status_code or status.HTTP_502_BAD_GATEWAY,
            )

        AuditLog.log(
            action="ai_webhook_delete",
            user=request.user,
            resource_type="AI",
            resource_id=0,
            ip_address=_get_client_ip(request),
            user_agent=request.META.get("HTTP_USER_AGENT", ""),
            details={"webhook_id": webhook_id},
        )

        return Response(result)


class WebhookPauseView(AIFeatureGatedMixin, APIView):
    """
    Pause a TibaBot webhook delivery.

    POST /api/ai/webhooks/{id}/pause/
    """

    permission_classes = [permissions.IsAuthenticated, ReadRequiresModelPermission]

    def post(self, request: Request, webhook_id: str) -> Response:
        try:
            client = get_tibabot_client()
            result = client.pause_webhook(webhook_id)
        except TibaBotUnavailableError:
            return Response(
                {"error": "TibaBot service is currently unavailable."},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )
        except TibaBotError as e:
            return Response(
                {"error": str(e)},
                status=e.status_code or status.HTTP_502_BAD_GATEWAY,
            )

        AuditLog.log(
            action="ai_webhook_pause",
            user=request.user,
            resource_type="AI",
            resource_id=0,
            ip_address=_get_client_ip(request),
            user_agent=request.META.get("HTTP_USER_AGENT", ""),
            details={"webhook_id": webhook_id},
        )

        return Response(result)


class WebhookActivateView(AIFeatureGatedMixin, APIView):
    """
    Resume a TibaBot webhook delivery.

    POST /api/ai/webhooks/{id}/activate/
    """

    permission_classes = [permissions.IsAuthenticated, ReadRequiresModelPermission]

    def post(self, request: Request, webhook_id: str) -> Response:
        try:
            client = get_tibabot_client()
            result = client.activate_webhook(webhook_id)
        except TibaBotUnavailableError:
            return Response(
                {"error": "TibaBot service is currently unavailable."},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )
        except TibaBotError as e:
            return Response(
                {"error": str(e)},
                status=e.status_code or status.HTTP_502_BAD_GATEWAY,
            )

        AuditLog.log(
            action="ai_webhook_activate",
            user=request.user,
            resource_type="AI",
            resource_id=0,
            ip_address=_get_client_ip(request),
            user_agent=request.META.get("HTTP_USER_AGENT", ""),
            details={"webhook_id": webhook_id},
        )

        return Response(result)


class WebhookDeliveryHistoryView(AIFeatureGatedMixin, APIView):
    """
    List delivery history for a TibaBot webhook.

    GET /api/ai/webhooks/{id}/deliveries/
    """

    permission_classes = [permissions.IsAuthenticated, ReadRequiresModelPermission]

    def get(self, request: Request, webhook_id: str) -> Response:
        try:
            client = get_tibabot_client()
            result = client.get_webhook_deliveries(webhook_id)
        except TibaBotUnavailableError:
            return Response(
                {"error": "TibaBot service is currently unavailable."},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )
        except TibaBotError as e:
            return Response(
                {"error": str(e)},
                status=e.status_code or status.HTTP_502_BAD_GATEWAY,
            )

        return Response(result)


# =============================================================================
# Facility Knowledge Base
# =============================================================================


class FacilityKBInfoView(AIFeatureGatedMixin, APIView):
    """
    Get facility knowledge base info and document list.

    GET /api/ai/facility/knowledge-base/
    """

    permission_classes = [permissions.IsAuthenticated, ReadRequiresModelPermission]

    def get(self, request: Request) -> Response:
        try:
            client = get_tibabot_client()
            result = client.get_facility_kb()
        except TibaBotUnavailableError as e:
            logger.warning("TibaBot facility KB unavailable: %s", e, exc_info=True)
            return Response(
                {"error": str(e)},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )
        except TibaBotError as e:
            logger.warning("TibaBot facility KB error: %s", e, exc_info=True)
            return Response(
                {"error": str(e)},
                status=e.status_code or status.HTTP_502_BAD_GATEWAY,
            )

        return Response(result)


class FacilityKBUploadView(AIFeatureGatedMixin, APIView):
    """
    Upload a document to the facility knowledge base.

    POST /api/ai/facility/knowledge-base/documents/

    Accepts multipart/form-data with a single ``file`` field.
    """

    permission_classes = [permissions.IsAuthenticated, ReadRequiresModelPermission]
    parser_classes = [MultiPartParser]

    def post(self, request: Request) -> Response:
        uploaded_file = request.FILES.get("file")
        if not uploaded_file:
            return Response(
                {"error": "No file provided. Include a 'file' field in the multipart form."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        file_data = uploaded_file.read()
        filename = uploaded_file.name or "upload"
        content_type = uploaded_file.content_type or "application/octet-stream"

        max_size_mb = 20
        if len(file_data) > max_size_mb * 1024 * 1024:
            return Response(
                {"error": f"File exceeds {max_size_mb} MB limit."},
                status=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            )

        try:
            client = get_tibabot_client()
            result = client.upload_to_facility_kb(file_data, filename, content_type)
        except TibaBotUnavailableError:
            return Response(
                {"error": "TibaBot service is currently unavailable."},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )
        except TibaBotError as e:
            return Response(
                {"error": str(e)},
                status=e.status_code or status.HTTP_502_BAD_GATEWAY,
            )

        AuditLog.log(
            action="ai_facility_kb_upload",
            user=request.user,
            resource_type="AI",
            resource_id=0,
            ip_address=_get_client_ip(request),
            user_agent=request.META.get("HTTP_USER_AGENT", ""),
            details={"filename": filename, "size_bytes": len(file_data)},
        )

        return Response(result, status=status.HTTP_201_CREATED)


class FacilityKBDocumentDeleteView(AIFeatureGatedMixin, APIView):
    """
    Delete a document from the facility knowledge base.

    DELETE /api/ai/facility/knowledge-base/documents/{document_id}/
    """

    permission_classes = [permissions.IsAuthenticated, ReadRequiresModelPermission]

    def delete(self, request: Request, document_id: str) -> Response:
        try:
            client = get_tibabot_client()
            result = client.delete_facility_kb_document(document_id)
        except TibaBotUnavailableError:
            return Response(
                {"error": "TibaBot service is currently unavailable."},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )
        except TibaBotError as e:
            return Response(
                {"error": str(e)},
                status=e.status_code or status.HTTP_502_BAD_GATEWAY,
            )

        AuditLog.log(
            action="ai_facility_kb_delete",
            user=request.user,
            resource_type="AI",
            resource_id=0,
            ip_address=_get_client_ip(request),
            user_agent=request.META.get("HTTP_USER_AGENT", ""),
            details={"document_id": document_id},
        )

        return Response(result)


class FacilityKBSearchView(AIFeatureGatedMixin, APIView):
    """
    Search the facility knowledge base.

    GET /api/ai/facility/knowledge-base/search/?q=<query>&limit=10
    """

    permission_classes = [permissions.IsAuthenticated, ReadRequiresModelPermission]

    def get(self, request: Request) -> Response:
        query = request.query_params.get("q", "").strip()
        if not query:
            return Response(
                {"error": "Query parameter 'q' is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            limit = int(request.query_params.get("limit", "10"))
        except (TypeError, ValueError):
            limit = 10
        limit = max(1, min(limit, 50))

        try:
            client = get_tibabot_client()
            result = client.search_facility_kb(query, limit)
        except TibaBotUnavailableError:
            return Response(
                {"error": "TibaBot service is currently unavailable."},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )
        except TibaBotError as e:
            return Response(
                {"error": str(e)},
                status=e.status_code or status.HTTP_502_BAD_GATEWAY,
            )

        AuditLog.log(
            action="ai_facility_kb_search",
            user=request.user,
            resource_type="AI",
            resource_id=0,
            ip_address=_get_client_ip(request),
            user_agent=request.META.get("HTTP_USER_AGENT", ""),
            details={"query": query[:200], "limit": limit},
        )

        return Response(result)
