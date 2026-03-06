"""
Local fallback for discharge readiness assessment.

Provides basic checklist-based scoring when TibaBot is unavailable.
No ML-based readmission risk or advanced vitals trending.
"""

from __future__ import annotations

from typing import Any


def _check_vitals_stability(vitals_history: list[dict[str, Any]]) -> str | None:
    """Simple vitals stability check based on last two readings."""
    if len(vitals_history) < 2:
        return None

    last = vitals_history[-1]
    prev = vitals_history[-2]

    # Check for instability markers
    unstable_count = 0
    for vital in ("heart_rate", "systolic_bp", "temperature", "respiratory_rate", "oxygen_saturation"):
        curr_val = last.get(vital)
        prev_val = prev.get(vital)
        if curr_val is not None and prev_val is not None:
            change_pct = abs(curr_val - prev_val) / max(prev_val, 1) * 100
            if change_pct > 20:
                unstable_count += 1

    if unstable_count >= 2:
        return "unstable"
    if unstable_count == 1:
        return "improving"
    return "stable"


def assess_discharge_fallback(payload: dict[str, Any]) -> dict[str, Any]:
    """
    Basic discharge readiness assessment using a simple checklist.

    Evaluates functional criteria and social factors without ML scoring.
    """
    criteria: list[dict[str, Any]] = []
    met_count = 0
    total_count = 0

    # Vitals stability
    vitals_history = payload.get("vitals_history", [])
    vitals_stability = _check_vitals_stability(vitals_history)
    vitals_stable = vitals_stability in ("stable", "improving")
    criteria.append({
        "name": "Vital signs stable",
        "category": "vitals",
        "met": vitals_stable,
        "details": f"Vitals {vitals_stability or 'not assessed'}",
    })
    total_count += 1
    if vitals_stable:
        met_count += 1

    # Functional status
    can_ambulate = payload.get("can_ambulate")
    if can_ambulate is not None:
        criteria.append({
            "name": "Patient can ambulate",
            "category": "functional",
            "met": can_ambulate,
            "details": "Ambulatory" if can_ambulate else "Not ambulatory",
        })
        total_count += 1
        if can_ambulate:
            met_count += 1

    can_tolerate_oral = payload.get("can_tolerate_oral")
    if can_tolerate_oral is not None:
        criteria.append({
            "name": "Tolerates oral intake",
            "category": "functional",
            "met": can_tolerate_oral,
            "details": "Oral intake tolerated" if can_tolerate_oral else "Unable to tolerate oral intake",
        })
        total_count += 1
        if can_tolerate_oral:
            met_count += 1

    # Follow-up
    has_follow_up = payload.get("has_follow_up_arranged", False)
    criteria.append({
        "name": "Follow-up appointment arranged",
        "category": "follow_up",
        "met": has_follow_up,
        "details": "Arranged" if has_follow_up else "Not arranged",
    })
    total_count += 1
    if has_follow_up:
        met_count += 1

    # Social — Kenya-specific
    has_caregiver = payload.get("has_caregiver_at_home")
    if has_caregiver is not None:
        criteria.append({
            "name": "Caregiver available at home",
            "category": "social",
            "met": has_caregiver,
            "details": "Available" if has_caregiver else "Not available",
        })
        total_count += 1
        if has_caregiver:
            met_count += 1

    has_nhif_sha = payload.get("has_nhif_or_sha")
    if has_nhif_sha is not None:
        criteria.append({
            "name": "NHIF/SHA coverage confirmed",
            "category": "social",
            "met": has_nhif_sha,
            "details": "Covered" if has_nhif_sha else "Not covered",
        })
        total_count += 1
        if has_nhif_sha:
            met_count += 1

    chw_referral = payload.get("chw_referral_made")
    if chw_referral is not None:
        criteria.append({
            "name": "CHW referral made",
            "category": "social",
            "met": chw_referral,
            "details": "Referred" if chw_referral else "Not referred",
        })
        total_count += 1
        if chw_referral:
            met_count += 1

    # Score
    readiness_score = round(met_count / max(total_count, 1), 2)
    unmet_count = total_count - met_count

    if readiness_score >= 0.8:
        readiness_level = "ready"
    elif readiness_score >= 0.5:
        readiness_level = "near_ready"
    else:
        readiness_level = "not_ready"

    # Recommendations for unmet criteria
    recommendations = [
        f"Address: {c['name']}" for c in criteria if not c["met"]
    ]

    return {
        "readiness_score": readiness_score,
        "readiness_level": readiness_level,
        "criteria": criteria,
        "unmet_criteria_count": unmet_count,
        "readmission_risk": None,
        "readmission_risk_level": None,
        "recommendations": recommendations,
        "vitals_stability": vitals_stability,
        "mode": "fallback",
    }
