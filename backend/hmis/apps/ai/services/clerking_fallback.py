"""
Local fallback for clerking assist and clinical document generation features.

Returns empty suggestions/templates when TibaBot is unavailable.
Autocomplete, structure, and document generation features require LLM —
no meaningful fallback.
"""

from __future__ import annotations

from typing import Any

# Standard note format sections
_NOTE_SECTIONS: dict[str, list[str]] = {
    "soap": ["Subjective", "Objective", "Assessment", "Plan"],
    "sbar": ["Situation", "Background", "Assessment", "Recommendation"],
}

# Default document section templates per document type
_DOCUMENT_SECTIONS: dict[str, list[dict[str, str]]] = {
    "discharge_summary": [
        {"section_id": "patient_information", "title": "Patient Information", "content": ""},
        {"section_id": "diagnosis", "title": "Diagnosis", "content": ""},
        {"section_id": "history", "title": "History", "content": ""},
        {"section_id": "complaints", "title": "Complaints", "content": ""},
        {"section_id": "hospital_course", "title": "Hospital Course", "content": ""},
        {"section_id": "physical_examination", "title": "Physical Examination", "content": ""},
        {"section_id": "investigations", "title": "Investigations Done", "content": ""},
        {"section_id": "management", "title": "Management", "content": ""},
        {"section_id": "significant_findings", "title": "Significant Findings", "content": ""},
        {"section_id": "condition_at_discharge", "title": "Condition at Discharge", "content": ""},
        {"section_id": "patient_education", "title": "Patient Education", "content": ""},
        {"section_id": "discharge_medications", "title": "Discharge Medications", "content": ""},
        {"section_id": "discharge_instructions", "title": "Discharge Instructions", "content": ""},
        {"section_id": "follow_up", "title": "Follow-Up and Instructions", "content": ""},
    ],
    "soap": [
        {"section_id": "subjective", "title": "Subjective", "content": ""},
        {"section_id": "objective", "title": "Objective", "content": ""},
        {"section_id": "assessment", "title": "Assessment", "content": ""},
        {"section_id": "plan", "title": "Plan", "content": ""},
    ],
    "progress_note": [
        {"section_id": "interval_history", "title": "Interval History", "content": ""},
        {"section_id": "examination", "title": "Examination", "content": ""},
        {"section_id": "assessment", "title": "Assessment", "content": ""},
        {"section_id": "plan", "title": "Plan", "content": ""},
    ],
    "referral_letter": [
        {"section_id": "referral_to", "title": "Referral To", "content": ""},
        {"section_id": "clinical_summary", "title": "Clinical Summary", "content": ""},
        {"section_id": "reason_for_referral", "title": "Reason for Referral", "content": ""},
        {"section_id": "current_management", "title": "Current Management", "content": ""},
    ],
    "clerking_note": [
        {"section_id": "presenting_complaint", "title": "Presenting Complaint", "content": ""},
        {"section_id": "history", "title": "History of Presenting Illness", "content": ""},
        {"section_id": "examination", "title": "Examination", "content": ""},
        {"section_id": "assessment_plan", "title": "Assessment and Plan", "content": ""},
    ],
}


def clerking_autocomplete_fallback(payload: dict[str, Any]) -> dict[str, Any]:
    """Return empty suggestions when TibaBot is unavailable."""
    return {
        "suggestions": [],
        "mode": "fallback",
    }


def clerking_structure_fallback(payload: dict[str, Any]) -> dict[str, Any]:
    """Return the original text with empty structure when TibaBot is unavailable."""
    note_format = payload.get("note_format", "soap")
    free_text = payload.get("free_text", "")
    sections = _NOTE_SECTIONS.get(note_format, _NOTE_SECTIONS["soap"])

    return {
        "structured_note": dict.fromkeys(sections, ""),
        "sections": sections,
        "original_text": free_text,
        "mode": "fallback",
    }


def clinical_document_fallback(payload: dict[str, Any]) -> dict[str, Any]:
    """Return empty document template when TibaBot is unavailable."""
    document_type = payload.get("document_type", "discharge_summary")
    sections = _DOCUMENT_SECTIONS.get(document_type, _DOCUMENT_SECTIONS["discharge_summary"])

    return {
        "document_type": document_type,
        "sections": sections,
        "full_text": "",
        "suggested_icd10_codes": [],
        "safety_alerts": [],
        "has_safety_concerns": False,
        "citations": [],
        "disclaimer": (
            "AI document generation unavailable. "
            "Empty template provided — please complete manually."
        ),
        "mode": "fallback",
    }
