# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""
PII sanitizer for TibaBot requests.

Minimizes direct identifiers in JSON/text sent to external AI services.
Use sanitize_ai_payload at the transport boundary and sanitize_clinical_text
for individual text. This is deterministic redaction, not guaranteed anonymization
of arbitrary narratives or binary uploads. Inputs are JSON values and known identifiers.
"""

import re
from pathlib import PurePath
from typing import Any

# Patterns that look like MRN numbers
_MRN_PATTERN = re.compile(r"\bMRN-\d{8}-\d{4}\b", re.IGNORECASE)

# Patterns that look like Kenyan national IDs (7-8 digits)
_NATIONAL_ID_PATTERN = re.compile(r"\b\d{7,8}\b")

# Patterns that look like phone numbers (+254..., 07..., 01...)
_PHONE_PATTERN = re.compile(r"(\+?\d{1,3}[-.\s]?)?\(?\d{2,4}\)?[-.\s]?\d{3,4}[-.\s]?\d{3,4}")
_EMAIL_PATTERN = re.compile(r"\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b", re.IGNORECASE)
_IDENTITY_LINE = re.compile(
    r"^(\s*(?:patient\s+name|full\s+name|name|address|postal\s+address)\s*[:=])[^\n;]+",
    re.IGNORECASE | re.MULTILINE,
)
_PATIENT_NAME = re.compile(
    r"\b([Pp]atient\s+)([A-Z][a-z]+(?:[ -][A-Z][a-z]+){1,3})"
    r"(?=\s+(?:presents|reports|complains|was|is|has)\b)"
)
_IDENTIFIER_KEYS = {
    "first_name",
    "middle_name",
    "last_name",
    "full_name",
    "patient_name",
    "patient_mrn",
    "mrn",
    "national_id",
    "identification_number",
    "passport_number",
    "principal_national_id",
    "phone_number",
    "alternative_phone",
    "email",
    "address",
    "date_of_birth",
    "dob",
    "sha_number",
    "cr_number",
    "member_number",
}
_PATIENT_CONTAINERS = {
    "patient",
    "patient_context",
    "patient_data",
    "patient_features",
    "demographics",
}


def _is_identifier(key: str, parent: str) -> bool:
    return key.lower() in _IDENTIFIER_KEYS or (
        key.lower() == "name" and parent in _PATIENT_CONTAINERS
    )


def safe_upload_filename(filename: str) -> str:
    """Keep format detection without forwarding patient names in filenames."""
    suffix = PurePath(filename).suffix.lower()
    if not re.fullmatch(r"\.[a-z0-9]{1,8}", suffix):
        suffix = ""
    return f"upload{suffix}"


def sanitize_clinical_text(text: str, identifiers: tuple[str, ...] = ()) -> str:
    """
    Strip potential PII from clinical text before sending to TibaBot.

    Removes:
    - MRN patterns (MRN-YYYYMMDD-XXXX)
    - Phone number patterns
    - National ID patterns (7-8 digit numbers)

    Preserves:
    - Clinical descriptions
    - ICD codes
    - Medication names
    - Vital measurements
    """
    if not text:
        return text

    result = text
    for identifier in sorted(set(identifiers), key=len, reverse=True):
        if len(identifier.strip()) >= 3:
            result = re.sub(
                r"(?<!\w)" + re.escape(identifier) + r"(?!\w)",
                "[REDACTED]",
                result,
                flags=re.IGNORECASE,
            )
    result = _IDENTITY_LINE.sub(r"\1 [REDACTED]", result)
    result = _PATIENT_NAME.sub(r"\1[REDACTED-NAME]", result)
    result = _EMAIL_PATTERN.sub("[REDACTED-EMAIL]", result)
    result = _MRN_PATTERN.sub("[REDACTED-MRN]", result)
    # National ID must run before phone regex (phone pattern is greedy and
    # would match 7-8 digit national IDs as phone numbers)
    result = re.sub(r"(?:ID|id|Id)[\s:]+\d{7,8}\b", "[REDACTED-ID]", result)
    result = _PHONE_PATTERN.sub("[REDACTED-PHONE]", result)
    return result


def sanitize_ai_payload(payload: Any) -> Any:
    """Copy a JSON payload, remove direct identifiers and scrub all nested text.

    Collect known identifiers before removing fields so the same name/contact
    repeated in a history/message is also redacted. Clinical drug/test names,
    numeric measurements and routing/session identifiers remain usable.
    """
    identifiers: list[str] = []

    def collect(value, parent=""):
        if isinstance(value, dict):
            for key, child in value.items():
                if _is_identifier(key, parent) and isinstance(child, str):
                    identifiers.append(child)
                collect(child, key.lower())
        elif isinstance(value, list):
            for child in value:
                collect(child, parent)

    collect(payload)

    def scrub(value, parent=""):
        if isinstance(value, dict):
            return {
                key: scrub(child, key.lower())
                for key, child in value.items()
                if not _is_identifier(key, parent)
            }
        if isinstance(value, list):
            return [scrub(child, parent) for child in value]
        if isinstance(value, str):
            return sanitize_clinical_text(value, tuple(identifiers))
        return value

    return scrub(payload)
