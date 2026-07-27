# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
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
        "access_point": extras.get("access_point", ""),
        "payment_mechanism": extras.get("payment_mechanism", ""),
        "benefit_code": extras.get("benefit", ""),
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
    payment_mechanism: str | None = None,
    exclude_payment_mechanisms: list[str] | None = None,
    active_only: bool = False,
    access_point: str | None = None,
    patient_gender: str | None = None,
    scheme: str | None = "SHA",
) -> tuple[list[dict], int]:
    """
    Search local interventions by name or code.

    Args:
        query: Free-text search against display_name and code.
        facility_level: Filter to interventions applicable at this facility level.
        category: Filter by benefit code (e.g. "SHA-12-SC-01").
        limit / offset: Pagination.
        payment_mechanism: Filter by DHA payment mechanism
            (e.g. "FEE FOR SERVICE", "CAPITATION", "CASE BASED"). Case-insensitive.
        exclude_payment_mechanisms: Exclude these DHA payment mechanisms.
            Case-insensitive. Applied before ``payment_mechanism`` filter.
        active_only: If True, exclude retired or inactive interventions.
        access_point: Filter by access point. Accepts "OP" (matches "OP" and
            "OP and IP") or "IP" (matches "IP" and "OP and IP"). Case-insensitive.
        patient_gender: "M" or "F". When set, excludes interventions whose
            `applicable_gender` is exclusively for the other gender (e.g. maternity
            SHA-08 codes are `FEMALE`-only and will be hidden for male patients).
        scheme: Filter by applicable scheme. Defaults to "SHA" which excludes PMF
            (Public Officers Medical Fund) interventions. Pass None or "" to include
            all schemes.

    Returns a tuple of (results, total_count) where results is a list of kwargs
    dicts suitable for InterventionCode(**kwargs), sliced by offset/limit.
    """
    interventions, _ = _load_interventions()

    query_lower = query.lower().strip() if query else ""
    pm_lower = payment_mechanism.lower().strip() if payment_mechanism else None
    excluded_pm = {
        mechanism.lower().strip()
        for mechanism in (exclude_payment_mechanisms or [])
        if mechanism and mechanism.strip()
    }
    ap_upper = access_point.upper().strip() if access_point else None
    gender_upper = patient_gender.upper().strip() if patient_gender else None
    matched = []

    for record in interventions:
        # Filter by active status
        extras = record.get("extras", {})
        record_active = extras.get("active") != "False" and not record.get("retired")
        if active_only and not record_active:
            continue
        if not active_only and (extras.get("active") == "False" or record.get("retired")):
            # Preserve legacy behaviour: default view still hides inactive rows.
            continue

        # Filter by applicable scheme (exclude PMF codes from SHA searches)
        if scheme:
            applicable_schemes = extras.get("applicable_schemes", [])
            if applicable_schemes:
                # Record has explicit scheme list — check if requested scheme is in it
                scheme_upper = scheme.upper()
                record_schemes_upper = [s.upper() for s in applicable_schemes]
                # SHA, UHC, and SHIF are all part of the same national scheme
                sha_family = {"SHA", "UHC", "SHIF"}
                if scheme_upper in sha_family:
                    if not any(s in sha_family for s in record_schemes_upper):
                        continue
                elif scheme_upper not in record_schemes_upper:
                    continue
            else:
                # No applicable_schemes specified — infer from code prefix
                code = record.get("id", "")
                if code.startswith("PMF-") and scheme.upper() not in ("PMF",):
                    continue

        # Filter by facility level.
        # KEPH levels appear as "LEVEL 2", "LEVEL 3", "LEVEL 3A/B/C", "LEVEL 4A/B/C",
        # "LEVEL 6A/B", etc. A facility at KEPH level N is entitled to any
        # intervention whose numeric level starts with N (e.g. Level 3 matches
        # "LEVEL 3", "LEVEL 3A", "LEVEL 3B", but not "LEVEL 4").
        if facility_level is not None:
            levels = extras.get("levels_applicable", [])
            if not levels:
                # No level specified on the intervention — hide from strict
                # facility-scoped browsing to avoid leaking higher-level codes.
                continue
            allowed_numeric = set()
            for lvl in levels:
                text = str(lvl).upper().strip()
                # Extract the leading digit block after "LEVEL "
                # Handles "LEVEL 3", "LEVEL 3A", "LEVEL 6B", "L3", "3A" etc.
                for token in text.replace("LEVEL", "").split():
                    digits = "".join(c for c in token if c.isdigit())
                    if digits:
                        import contextlib

                        with contextlib.suppress(ValueError):
                            allowed_numeric.add(int(digits))
                        break
            if facility_level not in allowed_numeric:
                continue

        # Filter by category (benefit code)
        if category and extras.get("benefit", "").lower() != category.lower():
            continue

        # Filter by payment mechanism (DHA rejects capitation codes at start_visit)
        # Comma-separated values: "FEE FOR SERVICE,FIXED FEE FOR SERVICE" matches either.
        if pm_lower:
            record_pm = str(extras.get("payment_mechanism", "")).lower()
            if excluded_pm and record_pm in excluded_pm:
                continue
            allowed = [p.strip() for p in pm_lower.split(",")]
            if record_pm not in allowed:
                continue
        elif excluded_pm:
            record_pm = str(extras.get("payment_mechanism", "")).lower()
            if record_pm in excluded_pm:
                continue

        # Filter by access point (OP matches "OP" and "OP and IP", etc.)
        if ap_upper:
            record_ap = str(extras.get("access_point", "")).upper()
            if ap_upper == "OP":
                if record_ap not in ("OP", "OP AND IP") and "OP" not in record_ap:
                    continue
            elif ap_upper == "IP":
                if record_ap not in ("IP", "OP AND IP") and "IP" not in record_ap:
                    continue
            else:
                if record_ap != ap_upper:
                    continue

        # Filter by patient gender (maternity codes are FEMALE-only, etc.)
        if gender_upper:
            applicable_gender = str(extras.get("applicable_gender", "ALL")).upper()
            if applicable_gender == "FEMALE" and gender_upper != "F":
                continue
            if applicable_gender == "MALE" and gender_upper != "M":
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


def _coerce_tariff(value: object) -> Decimal | None:
    if value in (None, ""):
        return None
    try:
        return Decimal(str(value))
    except (InvalidOperation, ValueError):
        return None


def _coerce_keph_level(value: object) -> int | None:
    if isinstance(value, int):
        return value
    if isinstance(value, str):
        text = value.strip().upper()
        if text.startswith("L") and text[1:].isdigit():
            return int(text[1:])
        if text.isdigit():
            return int(text)
    return None


def get_local_intervention_claim_defaults(code: str, facility_level: object = None) -> dict:
    """Return SHAClaimIntervention defaults for a code from the local catalog.

    Falls back to empty/safe defaults when the code is not in the catalog so
    callers can always spread the result into update_or_create/create defaults.
    """
    info = get_local_intervention(code)
    extras = info.get("raw_data", {}) if info else {}
    payment_mechanism = str(extras.get("payment_mechanism", "")).strip()
    access_point = str(extras.get("access_point", "")).strip()
    applicable_document_types = extras.get("applicable_document_types")
    if not isinstance(applicable_document_types, list):
        applicable_document_types = []

    level_int = _coerce_keph_level(facility_level)
    tariff_amount = _get_tariff_for_level(extras, level_int)

    def _flag(key: str) -> bool:
        return str(extras.get(key, "")).strip().lower() == "true"

    return {
        "intervention_name": info.get("name", "") if info else "",
        "benefit_code": info.get("benefit_code", "")
        if info
        else (code.rsplit("-", 1)[0] if "-" in code else ""),
        "payment_mechanism": payment_mechanism,
        "access_point": access_point,
        "tariff_amount": tariff_amount,
        "level2_tariff": _coerce_tariff(extras.get("level_2_tariff")),
        "level3_tariff": _coerce_tariff(extras.get("level_3_tariff")),
        "level4_tariff": _coerce_tariff(extras.get("level_4_tariff")),
        "level5_tariff": _coerce_tariff(extras.get("level_5_tariff")),
        "level6_tariff": _coerce_tariff(extras.get("level_6_tariff")),
        "required_document_types": [
            str(v).strip() for v in applicable_document_types if str(v).strip()
        ],
        "needs_preauth": _requires_preauth(extras),
        "needs_manual_preauth_approval": _flag("needs_manual_preauth_approval"),
        "is_surgical_preauth": _flag("requires_surgical_preauth"),
        "is_renal_preauth": _flag("requires_renal_preauth"),
        "is_oncology_preauth": _flag("requires_oncology_preauth"),
        "is_imaging_preauth": _flag("requires_radiology_preauth"),
        "is_optical_preauth": _flag("requires_optical_preauth"),
    }
