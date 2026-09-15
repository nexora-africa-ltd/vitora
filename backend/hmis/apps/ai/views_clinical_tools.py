# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
# ruff: noqa: ARG002, F401
"""Ai views clinical tools for Vitora HMIS.

What this file is for:
- Implement views clinical tools logic for the ai domain.

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
    "ORG-ADMIN",
    "OWNER",
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
        except _ai_view_handled_exceptions():
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
        except _ai_view_handled_exceptions():
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
        except _ai_view_handled_exceptions():
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
        except _ai_view_handled_exceptions():
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
        except TibaBotError as exc:
            logger.error("TibaBot error for investigation suggestions: %s", exc)
            return Response(
                {"error": "Unable to fetch investigation suggestions from TibaBot."},
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
        except _ai_view_handled_exceptions():
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
