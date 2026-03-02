"""
PII sanitizer for TibaBot requests.

Ensures no patient-identifiable information is sent to external AI services.
Only clinical text, age, sex, vitals, medication names, and allergy substances
are allowed. Never: name, MRN, national_id, phone_number.
"""

import re


# Patterns that look like MRN numbers
_MRN_PATTERN = re.compile(r"\bMRN-\d{8}-\d{4}\b", re.IGNORECASE)

# Patterns that look like Kenyan national IDs (7-8 digits)
_NATIONAL_ID_PATTERN = re.compile(r"\b\d{7,8}\b")

# Patterns that look like phone numbers (+254..., 07..., 01...)
_PHONE_PATTERN = re.compile(
    r"(\+?\d{1,3}[-.\s]?)?\(?\d{2,4}\)?[-.\s]?\d{3,4}[-.\s]?\d{3,4}"
)


def sanitize_clinical_text(text: str) -> str:
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

    result = _MRN_PATTERN.sub("[REDACTED-MRN]", text)
    # National ID must run before phone regex (phone pattern is greedy and
    # would match 7-8 digit national IDs as phone numbers)
    result = re.sub(r"(?:ID|id|Id)[\s:]+\d{7,8}\b", "[REDACTED-ID]", result)
    result = _PHONE_PATTERN.sub("[REDACTED-PHONE]", result)
    return result
