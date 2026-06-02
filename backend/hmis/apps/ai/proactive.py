"""
Proactive AI Insights Engine.

Generates proactive clinical insights based on encounter context without
explicit user request. Three tiers:

- Tier 1: Rule-based alerts (deterministic, no LLM) — vitals, drug interactions
- Tier 2: Pattern-based nudges (rules engine) — protocol adherence, screenings
- Tier 3: LLM-powered insights (TibaBot) — contextual clinical suggestions

Rate-limited per session (max 1 call per 30s). Context deduplication prevents
redundant insight generation when context hasn't meaningfully changed.
"""

import contextlib
import hashlib
import json
import logging
from typing import Any

from .client import TibaBotError, TibaBotUnavailableError, get_tibabot_client

logger = logging.getLogger(__name__)


# =============================================================================
# Tier 1: Rule-based alerts (deterministic, no LLM)
# =============================================================================

# Critical vital thresholds (Kenya clinical guidelines)
VITAL_RULES: list[dict[str, Any]] = [
    {
        "id": "hypoxemia",
        "field": "spo2",
        "op": "lt",
        "threshold": 95,
        "severity": "critical",
        "title": "Hypoxemia Detected",
        "message": "SpO2 < 95% — consider supplemental oxygen and pulse oximetry monitoring.",
        "category": "vitals",
    },
    {
        "id": "severe_hypoxemia",
        "field": "spo2",
        "op": "lt",
        "threshold": 90,
        "severity": "critical",
        "title": "Severe Hypoxemia",
        "message": "SpO2 < 90% — immediate intervention required. Consider high-flow oxygen or intubation.",
        "category": "vitals",
    },
    {
        "id": "hypertensive_crisis",
        "field": "systolic_bp",
        "op": "gte",
        "threshold": 180,
        "severity": "critical",
        "title": "Hypertensive Crisis",
        "message": "Systolic BP ≥ 180 mmHg — assess for end-organ damage. Consider IV antihypertensives.",
        "category": "vitals",
    },
    {
        "id": "severe_hypotension",
        "field": "systolic_bp",
        "op": "lt",
        "threshold": 90,
        "severity": "critical",
        "title": "Severe Hypotension",
        "message": "Systolic BP < 90 mmHg — assess for shock. Consider IV fluid resuscitation.",
        "category": "vitals",
    },
    {
        "id": "tachycardia",
        "field": "pulse",
        "op": "gte",
        "threshold": 120,
        "severity": "warning",
        "title": "Significant Tachycardia",
        "message": "Heart rate ≥ 120 bpm — evaluate for pain, dehydration, sepsis, or cardiac cause.",
        "category": "vitals",
    },
    {
        "id": "bradycardia",
        "field": "pulse",
        "op": "lt",
        "threshold": 50,
        "severity": "warning",
        "title": "Bradycardia",
        "message": "Heart rate < 50 bpm — assess for medication effect (beta-blockers), heart block, or hypothyroidism.",
        "category": "vitals",
    },
    {
        "id": "hyperthermia",
        "field": "temperature",
        "op": "gte",
        "threshold": 39.5,
        "severity": "warning",
        "title": "High Fever",
        "message": "Temperature ≥ 39.5°C — consider blood cultures, malaria screening (endemic area), and antipyretics.",
        "category": "vitals",
    },
    {
        "id": "hypothermia",
        "field": "temperature",
        "op": "lt",
        "threshold": 35.0,
        "severity": "warning",
        "title": "Hypothermia",
        "message": "Temperature < 35°C — assess for sepsis, exposure, or endocrine cause.",
        "category": "vitals",
    },
    {
        "id": "tachypnea",
        "field": "respiratory_rate",
        "op": "gte",
        "threshold": 30,
        "severity": "warning",
        "title": "Tachypnea",
        "message": "Respiratory rate ≥ 30/min — assess for respiratory distress, sepsis, or metabolic acidosis.",
        "category": "vitals",
    },
]


def evaluate_vital_rules(vitals: dict[str, Any]) -> list[dict[str, Any]]:
    """
    Evaluate rule-based vital sign alerts.

    Args:
        vitals: Dict with keys like spo2, pulse, temperature, respiratory_rate,
                systolic_bp, diastolic_bp.

    Returns:
        List of triggered alert dicts with id, severity, title, message, category.
    """
    alerts: list[dict[str, Any]] = []

    for rule in VITAL_RULES:
        value = vitals.get(rule["field"])
        if value is None:
            continue

        try:
            value = float(value)
        except (ValueError, TypeError):
            continue

        triggered = False
        if (
            rule["op"] == "lt"
            and value < rule["threshold"]
            or rule["op"] == "gte"
            and value >= rule["threshold"]
        ):
            triggered = True

        if triggered:
            alerts.append(
                {
                    "id": rule["id"],
                    "tier": 1,
                    "severity": rule["severity"],
                    "title": rule["title"],
                    "message": rule["message"],
                    "category": rule["category"],
                    "confidence": 1.0,  # Deterministic rules = 100% confidence
                    "source": "rules_engine",
                }
            )

    # Deduplicate: if severe_hypoxemia fires, remove hypoxemia
    alert_ids = {a["id"] for a in alerts}
    if "severe_hypoxemia" in alert_ids and "hypoxemia" in alert_ids:
        alerts = [a for a in alerts if a["id"] != "hypoxemia"]

    return alerts


# =============================================================================
# Tier 2: Pattern-based nudges (no LLM)
# =============================================================================

# Kenya-relevant screening and protocol nudges
PATTERN_RULES: list[dict[str, Any]] = [
    {
        "id": "malaria_screen",
        "condition": "fever_endemic",
        "severity": "info",
        "title": "Consider Malaria Screening",
        "message": "Patient presents with fever in malaria-endemic area. Consider RDT or blood smear.",
        "category": "screening",
    },
    {
        "id": "tb_workup",
        "condition": "chronic_cough",
        "severity": "info",
        "title": "Consider TB Workup",
        "message": "Cough persisting >2 weeks in high-prevalence setting. Consider sputum AFB/GeneXpert.",
        "category": "screening",
    },
    {
        "id": "hiv_test",
        "condition": "sti_presentation",
        "severity": "info",
        "title": "HIV Testing Recommended",
        "message": "Kenya guidelines recommend opt-out HIV testing for patients presenting with STI symptoms.",
        "category": "screening",
    },
]


def evaluate_pattern_rules(
    vitals: dict[str, Any],
    chief_complaint: str | None,
    diagnoses: list[str] | None,
    allergies: list[str] | None,  # noqa: ARG001 — reserved for allergy-drug cross-check rules
    medications: list[str] | None,
) -> list[dict[str, Any]]:
    """
    Evaluate pattern-based clinical nudges.

    These are context-aware suggestions based on combinations of clinical data
    that suggest further workup or screening.

    Returns:
        List of triggered nudge dicts.
    """
    alerts: list[dict[str, Any]] = []
    complaint_lower = (chief_complaint or "").lower()
    diagnoses_lower = [d.lower() for d in (diagnoses or [])]

    # Fever + endemic area → malaria screening
    # Suppressed for trauma/injury presentations where fever is likely physiological
    temp = vitals.get("temperature")
    has_fever = False
    if temp is not None:
        with contextlib.suppress(ValueError, TypeError):
            has_fever = float(temp) >= 38.0

    trauma_keywords = [
        "rta",
        "accident",
        "trauma",
        "fracture",
        "injury",
        "wound",
        "burn",
        "laceration",
        "fall",
        "assault",
        "stabbing",
        "gunshot",
        "motorcycle",
        "collision",
        "hit",
        "struck",
        "crush",
    ]
    is_trauma = any(kw in complaint_lower for kw in trauma_keywords)

    if not is_trauma and (has_fever or "fever" in complaint_lower or "malaria" in complaint_lower):
        alerts.append(
            {
                "id": "malaria_screen",
                "tier": 2,
                "severity": "info",
                "title": "Consider Malaria Screening",
                "message": "Patient presents with fever in malaria-endemic area. Consider RDT or blood smear.",
                "category": "screening",
                "confidence": 0.85,
                "source": "pattern_engine",
            }
        )

    # Chronic cough → TB workup (suppressed for trauma)
    cough_keywords = ["cough", "chronic cough", "productive cough", "hemoptysis"]
    if not is_trauma and any(kw in complaint_lower for kw in cough_keywords):
        alerts.append(
            {
                "id": "tb_workup",
                "tier": 2,
                "severity": "info",
                "title": "Consider TB Workup",
                "message": "Cough in high TB-prevalence setting. Consider sputum AFB/GeneXpert per Kenya guidelines.",
                "category": "screening",
                "confidence": 0.75,
                "source": "pattern_engine",
            }
        )

    # Drug interaction check: Metformin + renal concern
    meds_lower = [m.lower() for m in (medications or [])]
    if any("metformin" in m for m in meds_lower):
        # Check for renal indicators in diagnoses
        renal_keywords = ["renal", "kidney", "ckd", "creatinine", "contrast"]
        if any(any(rk in d for rk in renal_keywords) for d in diagnoses_lower):
            alerts.append(
                {
                    "id": "metformin_renal",
                    "tier": 2,
                    "severity": "warning",
                    "title": "Metformin + Renal Impairment",
                    "message": "Patient on Metformin with renal concerns. Assess eGFR and consider dose adjustment or hold.",
                    "category": "drug_interaction",
                    "confidence": 0.9,
                    "source": "pattern_engine",
                }
            )

    return alerts


# =============================================================================
# Tier 3: LLM-powered insights (TibaBot)
# =============================================================================


def generate_llm_insights(
    patient_context: dict[str, Any],
    encounter_context: dict[str, Any],
    user_context: dict[str, Any],
    facility_context: dict[str, Any],
) -> list[dict[str, Any]]:
    """
    Generate LLM-powered proactive insights via TibaBot's /clinical/assist endpoint.

    Only called when Tier 1 and 2 produce fewer than 2 insights and
    sufficient clinical context is available.

    Args:
        patient_context: Age, sex, allergies, comorbidities, medications
        encounter_context: Chief complaint, vitals, diagnoses, clinical notes
        user_context: Role, seniority, specialization
        facility_context: Facility level, capabilities

    Returns:
        List of insight dicts from TibaBot, or empty list on failure.
    """
    try:
        client = get_tibabot_client()

        # Build a focused query for the /clinical/assist endpoint
        query = (
            "Based on this patient's clinical context, provide up to 3 proactive clinical insights. "
            "Focus on: missed diagnoses, recommended investigations, drug interactions, "
            "screening opportunities, or safety concerns. "
            "Return ONLY a JSON array of objects with keys: "
            "id (string), severity (critical|warning|info), title (string), "
            "message (string), category (string), confidence (0.0-1.0), references (array of strings). "
            "If no actionable insights, return an empty array []."
        )

        payload = {
            "query": query,
            "patient_context": patient_context,
            "encounter_context": encounter_context,
            "user_context": user_context,
            "facility_context": facility_context,
            "verbosity": "concise",
            "response_format": "json",
        }

        result = client._request(
            method="POST",
            endpoint="/clinical/assist",
            data=payload,
        )

        # Parse the response — TibaBot returns {recommendation: "...", ...}
        response_text = result.get("recommendation") or result.get("response", "")

        # Try to extract JSON array from the response
        insights = _parse_insights_from_response(response_text)

        # Normalize each insight
        normalized: list[dict[str, Any]] = []
        for insight in insights[:3]:  # Cap at 3
            if not isinstance(insight, dict):
                continue
            normalized.append(
                {
                    "id": insight.get("id", f"llm_{len(normalized)}"),
                    "tier": 3,
                    "severity": insight.get("severity", "info")
                    if insight.get("severity") in ("critical", "warning", "info")
                    else "info",
                    "title": insight.get("title", "Clinical Insight"),
                    "message": insight.get("message", ""),
                    "category": insight.get("category", "clinical"),
                    "confidence": min(max(float(insight.get("confidence", 0.7)), 0.0), 1.0),
                    "source": "tibabot_llm",
                    "references": insight.get("references", []),
                }
            )

        return normalized

    except (TibaBotUnavailableError, TibaBotError) as e:
        logger.warning("TibaBot unavailable for proactive insights: %s", e)
        return []
    except Exception:
        logger.exception("Unexpected error generating LLM insights")
        return []


def _parse_insights_from_response(response_text: str) -> list[dict[str, Any]]:
    """Extract a JSON array of insights from TibaBot's text response."""
    import json

    # Try direct JSON parse first
    try:
        parsed = json.loads(response_text)
        if isinstance(parsed, list):
            return parsed
        if isinstance(parsed, dict) and "insights" in parsed:
            return parsed["insights"]
    except (json.JSONDecodeError, ValueError):
        pass

    # Try to find JSON array in markdown code blocks or inline
    import re

    json_match = re.search(r"\[[\s\S]*?\]", response_text)
    if json_match:
        try:
            parsed = json.loads(json_match.group())
            if isinstance(parsed, list):
                return parsed
        except (json.JSONDecodeError, ValueError):
            pass

    return []


# =============================================================================
# Tier 2.5: CDS-evaluate via TibaBot (structured rule checks)
# =============================================================================


def evaluate_cds_insights(
    medications: list[str],
    diagnoses: list[str],
    allergies: list[str],
    chief_complaint: str | None,
    patient_context: dict[str, Any],
) -> list[dict[str, Any]]:
    """
    Call TibaBot's /cds/evaluate endpoint for structured DDI, contraindication,
    and protocol adherence checks.

    This is more reliable than the LLM tier because /cds/evaluate uses TibaBot's
    built-in rule engine with Kenya formulary awareness.

    Returns:
        List of insight dicts from CDS alerts, or empty list on failure.
    """
    try:
        client = get_tibabot_client()

        # Map M/F/O to male/female as required by TibaBot
        sex_map = {"M": "male", "F": "female"}
        raw_sex = patient_context.get("patient_sex", "")
        mapped_sex = sex_map.get(raw_sex, raw_sex) if raw_sex else None

        payload: dict[str, Any] = {
            "medications": medications,
            "diagnoses": diagnoses,
            "allergies": allergies,
            "symptoms": [chief_complaint] if chief_complaint else [],
            "patient_age": patient_context.get("patient_age"),
            "patient_sex": mapped_sex,
        }

        result = client.evaluate_cds_rules(payload)

        # Convert CDS alerts to proactive insight format
        insights: list[dict[str, Any]] = []
        for alert in result.get("alerts", [])[:3]:  # Cap at 3
            if not isinstance(alert, dict):
                continue
            severity = alert.get("severity", "info")
            if severity not in ("critical", "warning", "info"):
                severity = "info"
            insights.append(
                {
                    "id": f"cds_{alert.get('rule_id', len(insights))}",
                    "tier": 2,
                    "severity": severity,
                    "title": alert.get("title", alert.get("type", "CDS Alert")),
                    "message": alert.get("message", alert.get("description", "")),
                    "category": alert.get("category", "cds"),
                    "confidence": 0.9,
                    "source": "pattern_engine",
                }
            )

        # Also include recommendations as info-level insights
        for rec in result.get("recommendations", [])[:2]:  # Cap at 2
            if not isinstance(rec, dict):
                continue
            insights.append(
                {
                    "id": f"cds_rec_{len(insights)}",
                    "tier": 2,
                    "severity": "info",
                    "title": rec.get("title", "Recommendation"),
                    "message": rec.get("message", rec.get("description", "")),
                    "category": rec.get("category", "protocol"),
                    "confidence": 0.85,
                    "source": "pattern_engine",
                }
            )

        return insights[:5]  # Cap total at 5

    except (TibaBotError, TibaBotUnavailableError) as e:
        logger.debug("CDS evaluate unavailable for proactive insights: %s", e)
        return []
    except Exception:
        logger.debug("Unexpected error in CDS evaluate for proactive insights", exc_info=True)
        return []


# =============================================================================
# Context hashing (deduplication)
# =============================================================================


def compute_context_hash(context: dict[str, Any]) -> str:
    """
    Compute a stable hash of the clinical context for deduplication.

    Two contexts that produce the same hash should generate the same insights.
    """
    # Extract only the clinically-meaningful fields for hashing
    hashable = {
        "vitals": context.get("vitals", {}),
        "chief_complaint": context.get("chief_complaint", ""),
        "diagnoses": sorted(context.get("diagnoses", [])),
        "medications": sorted(context.get("medications", [])),
        "allergies": sorted(context.get("allergies", [])),
    }
    serialized = json.dumps(hashable, sort_keys=True, default=str)
    return hashlib.sha256(serialized.encode()).hexdigest()[:16]


# =============================================================================
# Main orchestrator
# =============================================================================


def generate_proactive_insights(
    patient_context: dict[str, Any],
    encounter_context: dict[str, Any],
    user_context: dict[str, Any] | None = None,
    facility_context: dict[str, Any] | None = None,
    include_llm: bool = True,
) -> dict[str, Any]:
    """
    Generate proactive clinical insights from all three tiers.

    This is the main entry point called by the view. It orchestrates:
    1. Tier 1 — Rule-based vital alerts
    2. Tier 2 — Pattern-based nudges
    3. Tier 3 — LLM insights (only if tiers 1+2 yield <2 results and include_llm=True)

    Args:
        patient_context: Patient demographics, allergies, medications
        encounter_context: Vitals, chief complaint, diagnoses
        user_context: Clinician role/seniority
        facility_context: Facility capabilities
        include_llm: Whether to call TibaBot for Tier 3 (default True)

    Returns:
        Dict with insights list, context_hash, and metadata.
    """
    vitals = encounter_context.get("vitals", {})
    chief_complaint = encounter_context.get("chief_complaint")
    diagnoses = encounter_context.get("diagnoses", [])
    allergies = patient_context.get("allergies", [])
    medications = patient_context.get("current_medications", [])

    # Tier 1: Vital sign alerts
    tier1_alerts = evaluate_vital_rules(vitals)

    # Tier 2: Pattern-based nudges
    tier2_alerts = evaluate_pattern_rules(
        vitals=vitals,
        chief_complaint=chief_complaint,
        diagnoses=diagnoses,
        allergies=allergies,
        medications=medications,
    )

    # Tier 2.5: CDS-evaluate via TibaBot (structured DDI/contraindication checks)
    # Only when there are medications or diagnoses to check and tiers 1+2 are sparse
    cds_alerts: list[dict[str, Any]] = []
    if include_llm and len(tier1_alerts) + len(tier2_alerts) < 2 and (medications or diagnoses):
        cds_alerts = evaluate_cds_insights(
            medications=medications,
            diagnoses=diagnoses,
            allergies=allergies,
            chief_complaint=chief_complaint,
            patient_context=patient_context,
        )

    # Tier 3: LLM insights (conditional)
    tier3_insights: list[dict[str, Any]] = []
    combined_count = len(tier1_alerts) + len(tier2_alerts) + len(cds_alerts)
    if include_llm and combined_count < 2:
        # Only call LLM if there's sufficient context
        has_sufficient_context = bool(chief_complaint or vitals or diagnoses)
        if has_sufficient_context:
            tier3_insights = generate_llm_insights(
                patient_context=patient_context,
                encounter_context=encounter_context,
                user_context=user_context or {},
                facility_context=facility_context or {},
            )

    all_insights = tier1_alerts + tier2_alerts + cds_alerts + tier3_insights

    # Compute context hash for deduplication
    context_hash = compute_context_hash(encounter_context)

    return {
        "insights": all_insights,
        "context_hash": context_hash,
        "tier_counts": {
            "tier1": len(tier1_alerts),
            "tier2": len(tier2_alerts) + len(cds_alerts),
            "tier3": len(tier3_insights),
        },
        "total": len(all_insights),
    }
