"""
Local fallback store for SHA BenefitsAndInterventions.

Loads intervention data from the JSONL file scraped from DHA KNHTS
(https://nhts.dha.go.ke/orgs/MOH-KENYA/sources/BenefitsAndInterventions/)
and provides search/lookup capabilities when the DHA API is unavailable.

The JSONL file is loaded lazily on first access and cached in memory.
"""

import json
import logging
from decimal import Decimal, InvalidOperation
from pathlib import Path

from django.conf import settings

logger = logging.getLogger(__name__)

# Default path relative to BASE_DIR
_DEFAULT_JSONL_PATH = "data/sha/benefits_and_interventions.jsonl"

# Module-level cache
_interventions_cache: list[dict] | None = None
_interventions_by_code: dict[str, dict] | None = None


def _get_jsonl_path() -> Path:
    """Resolve the path to the interventions JSONL file."""
    custom_path = getattr(settings, "SHA_INTERVENTIONS_JSONL_PATH", None)
    if custom_path:
        return Path(custom_path)
    return Path(settings.BASE_DIR) / _DEFAULT_JSONL_PATH


def _load_interventions() -> tuple[list[dict], dict[str, dict]]:
    """Load and index interventions from the JSONL file."""
    global _interventions_cache, _interventions_by_code

    if _interventions_cache is not None:
        return _interventions_cache, _interventions_by_code  # type: ignore[return-value]

    jsonl_path = _get_jsonl_path()
    if not jsonl_path.exists():
        logger.warning("Interventions JSONL not found: %s", jsonl_path)
        _interventions_cache = []
        _interventions_by_code = {}
        return _interventions_cache, _interventions_by_code

    interventions = []
    by_code: dict[str, dict] = {}

    with open(jsonl_path, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                record = json.loads(line)
            except json.JSONDecodeError:
                continue

            # Only index actionable concepts (interventions and sub-interventions)
            concept_class = record.get("concept_class", "")
            if concept_class not in ("code", "Code", "Procedure"):
                continue

            interventions.append(record)
            by_code[record["id"]] = record

    _interventions_cache = interventions
    _interventions_by_code = by_code
    logger.info(
        "Loaded %d SHA interventions from local fallback (%s)",
        len(interventions),
        jsonl_path.name,
    )
    return interventions, by_code


def clear_cache() -> None:
    """Clear the in-memory cache (useful for testing)."""
    global _interventions_cache, _interventions_by_code
    _interventions_cache = None
    _interventions_by_code = None


def _extract_min_facility_level(extras: dict) -> int | None:
    """Extract minimum facility level from extras.levels_applicable."""
    levels = extras.get("levels_applicable", [])
    if not levels:
        return None
    level_nums = []
    for level_str in levels:
        # Format: "LEVEL 2", "LEVEL 3", etc.
        if isinstance(level_str, str):
            parts = level_str.strip().split()
            if len(parts) == 2 and parts[1].isdigit():
                level_nums.append(int(parts[1]))
    return min(level_nums) if level_nums else None


def _get_tariff_for_level(extras: dict, facility_level: int | None) -> Decimal | None:
    """Get the tariff amount for a specific facility level."""
    if facility_level is None:
        # Try level_4_tariff as default (most common)
        for lvl in (4, 5, 6, 3, 2):
            key = f"level_{lvl}_tariff"
            val = extras.get(key)
            if val and val != 0:
                try:
                    return Decimal(str(val))
                except (InvalidOperation, ValueError):
                    continue
        # Fallback to flat "Tariff (KES)" for Procedure types
        tariff_str = extras.get("Tariff (KES)")
        if tariff_str:
            try:
                return Decimal(str(tariff_str))
            except (InvalidOperation, ValueError):
                pass
        return None

    key = f"level_{facility_level}_tariff"
    val = extras.get(key)
    if val is not None:
        try:
            return Decimal(str(val))
        except (InvalidOperation, ValueError):
            pass

    # Fallback for Procedure types
    tariff_str = extras.get("Tariff (KES)")
    if tariff_str:
        try:
            return Decimal(str(tariff_str))
        except (InvalidOperation, ValueError):
            pass
    return None


# SHA/PMF benefit package code → human-readable category
_BENEFIT_PACKAGE_LABELS: dict[str, str] = {
    "SHA-01": "Emergency & Ambulance",
    "SHA-02": "Laboratory",
    "SHA-03": "Pharmacy",
    "SHA-05": "Chronic Disease Management",
    "SHA-06": "Oncology",
    "SHA-07": "Surgical",
    "SHA-08": "Maternity",
    "SHA-09": "Radiology & Imaging",
    "SHA-10": "Mental Health",
    "SHA-11": "Dental",
    "SHA-12": "Outpatient",
    "SHA-13": "Rehabilitation",
    "SHA-15": "Palliative Care",
    "SHA-16": "Renal",
    "SHA-17": "Organ Transplant",
    "SHA-18": "Cardiac",
    "SHA-19": "Ophthalmic & ENT",
    "SHA-20": "Orthopedic",
    "PMF-01": "Emergency (PMF)",
    "PMF-03": "Pharmacy (PMF)",
    "PMF-07": "Surgical (PMF)",
    "PMF-10": "Mental Health (PMF)",
    "PMF-12": "Outpatient (PMF)",
    "PMF-13": "Rehabilitation (PMF)",
}


def _derive_category(code: str, extras: dict) -> str:
    """Derive a human-readable category label from the intervention code prefix."""
    import re

    # Try to match SHA-XX or PMF-XX prefix from the code itself
    m = re.match(r"((?:SHA|PMF)\s*-\s*\d+)", code.replace(" ", ""))
    if m:
        prefix = m.group(1).replace(" ", "")
        label = _BENEFIT_PACKAGE_LABELS.get(prefix)
        if label:
            return label

    # Try from the benefit field
    benefit = extras.get("benefit", "")
    if benefit:
        m = re.match(r"((?:SHA|PMF)-\d+)", benefit)
        if m:
            label = _BENEFIT_PACKAGE_LABELS.get(m.group(1))
            if label:
                return label

    return extras.get("concept_class", "")


def _requires_preauth(extras: dict) -> bool:
    """Check if any pre-authorization flag is set."""
    preauth_keys = (
        "requires_surgical_preauth",
        "requires_oncology_preauth",
        "requires_optical_preauth",
        "requires_renal_preauth",
        "requires_radiology_preauth",
        "needs_manual_preauth_approval",
    )
    return any(extras.get(k) == "True" for k in preauth_keys)


def _record_to_intervention_kwargs(record: dict, facility_level: int | None = None) -> dict:
    """Convert a JSONL record to InterventionCode constructor kwargs."""
    extras = record.get("extras", {})
    min_level = _extract_min_facility_level(extras)

    code = record["id"]
    return {
        "code": code,
        "name": record.get("display_name", ""),
        "description": record.get("description"),
        "category": _derive_category(code, extras),
        "price": _get_tariff_for_level(extras, facility_level),
        "facility_level": min_level,
        "is_active": extras.get("active", "True") == "True" and not record.get("retired", False),
        "effective_date": None,
        "raw_data": extras,
        # Additional fields for Procedure-type sub-interventions
        "max_amount_per_test": extras.get("Total Maximum Amount per test"),
        "quantity_per_year": extras.get(
            "Sub-Intervention quantity per year. Maximum No of markers "
            "(Drop down for number of tests done at a time)"
        ),
        "requires_preauthorization": _requires_preauth(extras),
    }


def search_local_interventions(
    query: str,
    facility_level: int | None = None,
    category: str | None = None,
    limit: int = 50,
    offset: int = 0,
) -> tuple[list[dict], int]:
    """
    Search local interventions by name or code.

    Returns a tuple of (results, total_count) where results is a list of kwargs
    dicts suitable for InterventionCode(**kwargs), sliced by offset/limit.
    """
    interventions, _ = _load_interventions()

    query_lower = query.lower().strip() if query else ""
    matched = []

    for record in interventions:
        # Filter by active status
        extras = record.get("extras", {})
        if extras.get("active") == "False" or record.get("retired"):
            continue

        # Filter by facility level
        if facility_level is not None:
            levels = extras.get("levels_applicable", [])
            if levels:
                level_str = f"LEVEL {facility_level}"
                if level_str not in levels:
                    continue

        # Filter by category (benefit code)
        if category and extras.get("benefit", "").lower() != category.lower():
            continue

        # Filter by search query (match against id or display_name)
        if query_lower:
            name = (record.get("display_name") or "").lower()
            code = record.get("id", "").lower()
            if query_lower not in name and query_lower not in code:
                continue

        matched.append(record)

    total = len(matched)
    page_records = matched[offset : offset + limit]
    results = [_record_to_intervention_kwargs(r, facility_level) for r in page_records]

    return results, total


def get_local_intervention(code: str, facility_level: int | None = None) -> dict | None:
    """
    Get a single intervention by code.

    Returns kwargs dict for InterventionCode(**kwargs), or None if not found.
    """
    _, by_code = _load_interventions()
    record = by_code.get(code)
    if record is None:
        return None
    return _record_to_intervention_kwargs(record, facility_level)
