# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
# ruff: noqa
"""
What this file is for: AI audit, ICD-10 suggestion, and AI status endpoints.
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
            except TibaBotError:
                service_available = False
            except _ai_view_handled_exceptions():
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
