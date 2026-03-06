"""
Local fallback for care plan generation.

Returns a generic care plan structure when TibaBot is unavailable.
No LLM enrichment, no CDS cross-checks, no FHIR output.
"""

from __future__ import annotations

from typing import Any


def generate_care_plan_fallback(payload: dict[str, Any]) -> dict[str, Any]:
    """
    Generate a basic care plan from the provided diagnosis.

    Returns a minimal structure with generic goals and recommendations.
    """
    diagnosis = payload.get("primary_diagnosis", "Unknown")
    severity = payload.get("severity")
    patient_age = payload.get("patient_age")

    goals: list[dict[str, Any]] = [
        {
            "description": f"Resolve {diagnosis}",
            "priority": "high",
            "timeframe": "During admission",
            "measurable_target": "Clinical improvement and symptom resolution",
        },
        {
            "description": "Prevent complications",
            "priority": "high",
            "timeframe": "Ongoing",
            "measurable_target": "No secondary infections or adverse events",
        },
        {
            "description": "Patient education on condition management",
            "priority": "medium",
            "timeframe": "Before discharge",
            "measurable_target": "Patient demonstrates understanding of care plan",
        },
    ]

    interventions: list[dict[str, Any]] = [
        {
            "category": "investigations",
            "items": [
                {
                    "action": "Complete blood count, metabolic panel",
                    "frequency": "On admission, then as clinically indicated",
                    "rationale": "Baseline assessment and monitoring",
                },
            ],
        },
        {
            "category": "nursing",
            "items": [
                {
                    "action": "Monitor vital signs",
                    "frequency": "Every 4-6 hours",
                    "rationale": "Early detection of deterioration",
                },
                {
                    "action": "Fluid balance monitoring",
                    "frequency": "Every shift",
                    "rationale": "Prevent dehydration and overload",
                },
            ],
        },
        {
            "category": "patient_education",
            "items": [
                {
                    "action": "Educate on diagnosis, treatment plan, and warning signs",
                    "frequency": "Before discharge",
                    "rationale": "Improve self-management and reduce readmission",
                },
            ],
        },
    ]

    discharge_criteria = [
        "Vital signs stable for 24 hours",
        "Tolerating oral intake",
        "Able to ambulate independently",
        "Follow-up appointment arranged",
    ]

    return {
        "primary_diagnosis": diagnosis,
        "icd10_code": payload.get("icd10_code"),
        "severity": severity,
        "goals": goals,
        "interventions": interventions,
        "discharge_criteria": discharge_criteria,
        "follow_up": {
            "timing": "1-2 weeks post-discharge",
            "instructions": "Return if symptoms worsen or new symptoms develop.",
            "red_flags": [
                "High fever (>38.5°C)",
                "Difficulty breathing",
                "Persistent vomiting",
                "Altered consciousness",
            ],
        },
        "references": [],
        "cds_alerts": [],
        "facility_level_notes": [],
        "template_used": None,
        "mode": "fallback",
        "llm_enriched": False,
        "evidence_sources": [],
    }
