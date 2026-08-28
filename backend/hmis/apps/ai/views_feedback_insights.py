# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
# ruff: noqa: ARG002, F401
"""Ai views feedback insights for Vitora HMIS.

What this file is for:
- Implement views feedback insights logic for the ai domain.

How to use it:
- Import classes and functions from this module in Django app code and tests.

Supported inputs/args:
- Python imports and Django ORM/runtime inputs; no standalone CLI arguments.
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
