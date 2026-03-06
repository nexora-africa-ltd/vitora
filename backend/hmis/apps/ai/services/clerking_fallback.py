"""
Local fallback for clerking assist features.

Returns empty suggestions when TibaBot is unavailable.
Autocomplete and structure features require LLM — no meaningful fallback.
"""

from __future__ import annotations

from typing import Any

# Standard note format sections
_NOTE_SECTIONS: dict[str, list[str]] = {
    "soap": ["Subjective", "Objective", "Assessment", "Plan"],
    "sbar": ["Situation", "Background", "Assessment", "Recommendation"],
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
        "structured_note": {section: "" for section in sections},
        "sections": sections,
        "original_text": free_text,
        "mode": "fallback",
    }
