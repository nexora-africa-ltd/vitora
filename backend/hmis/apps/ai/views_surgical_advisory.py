# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
# ruff: noqa: ARG002, F401
"""Ai views surgical advisory for Vitora HMIS.

What this file is for:
- Implement views surgical advisory logic for the ai domain.

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
                {"error": "Upstream AI service request failed."},
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
        except _ai_view_handled_exceptions():
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
            return Response(
                {"error": "Upstream AI service request failed."},
                status=status.HTTP_502_BAD_GATEWAY,
            )

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
        except _ai_view_handled_exceptions():
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
            return Response(
                {"error": "Upstream AI service request failed."},
                status=status.HTTP_502_BAD_GATEWAY,
            )

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
            except _ai_view_handled_exceptions():
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
            return Response(
                {"error": "Upstream AI service request failed."},
                status=status.HTTP_502_BAD_GATEWAY,
            )

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
            return Response(
                {"error": "Upstream AI service request failed."},
                status=status.HTTP_502_BAD_GATEWAY,
            )

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
        except _ai_view_handled_exceptions():
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
            return Response(
                {"error": "Upstream AI service request failed."},
                status=status.HTTP_502_BAD_GATEWAY,
            )

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
            return Response(
                {"error": "Upstream AI service request failed."},
                status=status.HTTP_502_BAD_GATEWAY,
            )

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
