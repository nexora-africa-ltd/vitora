# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
# ruff: noqa: ARG002, F401
"""Ai views icu autopopulate for Vitora HMIS.

What this file is for:
- Implement views icu autopopulate logic for the ai domain.

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
            except Exception:  # noqa: BLE001 - lab enrichment is best-effort and must not block ICU prediction
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
        except _ai_view_handled_exceptions():
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
        except _ai_view_handled_exceptions():
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
