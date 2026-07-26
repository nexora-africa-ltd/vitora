"""Document type mapping utilities for SHA/DHA claim attachments."""

from __future__ import annotations

LOCAL_TO_DHA_DOCUMENT_TYPE_MAP: dict[str, str] = {
    "clinical_notes": "CASE_NOTE",
    "medical_report": "MEDICAL_REPORT",
    "lab_report": "LAB_RESULTS",
    "radiology_report": "IMAGING_REPORT",
    "prescription": "PRESCRIPTION",
    "invoice": "INVOICE",
    "discharge_summary": "DISCHARGE_SUMMARY",
    "operative_notes": "THEATRE_NOTES",
    "preauth_approval": "PREAUTH_FORM",
    "other": "OTHER",
}


DHA_TO_LOCAL_ATTACHMENT_TYPE_MAP: dict[str, str] = {
    "CASE_NOTE": "clinical_notes",
    "MEDICAL_REPORT": "medical_report",
    "CRITICAL_CARE_UNIT_CASE": "clinical_notes",
    "LAB_RESULTS": "lab_report",
    "LAB_REPORT": "lab_report",
    "IMAGING_REPORT": "radiology_report",
    "PRESCRIPTION": "prescription",
    "FINAL_BILL": "invoice",
    "INVOICE": "invoice",
    "DISCHARGE_SUMMARY": "discharge_summary",
    "THEATRE_NOTES": "operative_notes",
    "OPERATIVE_NOTES": "operative_notes",
    "SURGICAL_NOTES": "operative_notes",
    "PREAUTH_FORM": "preauth_approval",
    "CLAIM_FORM": "other",
    "OTHER": "other",
}


def normalize_local_attachment_type(value: str) -> str:
    return str(value or "").strip().lower()


def normalize_dha_document_type(value: str) -> str:
    normalized = str(value or "").strip().upper().replace("-", "_").replace(" ", "_")
    while "__" in normalized:
        normalized = normalized.replace("__", "_")
    return normalized


def local_to_dha_document_type(local_attachment_type: str, *, default: str = "OTHER") -> str:
    normalized = normalize_local_attachment_type(local_attachment_type)
    return LOCAL_TO_DHA_DOCUMENT_TYPE_MAP.get(normalized, default)


def dha_document_type_to_local_attachment_type(
    dha_document_type: str,
    *,
    default: str = "other",
) -> str:
    normalized = normalize_dha_document_type(dha_document_type)
    mapped = DHA_TO_LOCAL_ATTACHMENT_TYPE_MAP.get(normalized)
    if mapped:
        return mapped
    fallback = normalize_local_attachment_type(dha_document_type)
    return fallback or default
