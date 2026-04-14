"""
DHIS2 Data Element Mapping Service for IDSR Reporting.

This module provides a hybrid approach to manage DHIS2 data element UIDs:

1. **JSON file** (`data/dhis2_element_mappings.json`):
   - Version-controlled default mappings
   - Good for initial setup and development

2. **Database** (`DHIS2DataElementMapping` model):
   - Managed via Django admin
   - Overrides JSON when records exist
   - Supports multiple environments (local, staging, production)

Lookup priority:
1. Database (if active mapping exists for environment)
2. JSON file (fallback)

Usage:
    from hmis.apps.surveillance.dhis2_mappings import (
        get_data_element_uid,
        get_all_mappings,
        validate_mappings,
    )

    # Get single UID
    uid = get_data_element_uid("Cholera", "cases_under_5", "local")

    # Get all mappings for payload generation
    mappings = get_all_mappings("local")

    # Validate all diseases are mapped
    result = validate_mappings("local")
"""

import json
import logging
import os
from functools import lru_cache
from pathlib import Path
from typing import TypedDict

from django.conf import settings

logger = logging.getLogger(__name__)


# Type definitions
class IndicatorMapping(TypedDict, total=False):
    cases_under_5: str
    cases_5_and_above: str
    deaths_under_5: str
    deaths_5_and_above: str


INDICATOR_TYPES = [
    "cases_under_5",
    "cases_5_and_above",
    "deaths_under_5",
    "deaths_5_and_above",
]

# Environment mapping
ENVIRONMENT_ALIASES = {
    "dev": "local",
    "development": "local",
    "test": "local",
    "uat": "staging",
    "prod": "production",
    "khis": "production",
}


def get_environment() -> str:
    """
    Get current DHIS2 environment from settings/env.

    Reads DHIS2_ENVIRONMENT env var, defaults to 'local'.
    """
    env = os.getenv("DHIS2_ENVIRONMENT", "local").lower()
    return ENVIRONMENT_ALIASES.get(env, env)


@lru_cache(maxsize=1)
def _load_json_mappings() -> dict:
    """
    Load mappings from JSON file (cached).

    Returns:
        Dict with data_elements and metadata
    """
    json_path = Path(settings.BASE_DIR) / "data" / "dhis2_element_mappings.json"

    if not json_path.exists():
        logger.warning(f"DHIS2 mappings JSON not found: {json_path}")
        return {"data_elements": {}}

    try:
        with open(json_path, encoding="utf-8") as f:
            data = json.load(f)
            logger.debug(f"Loaded {len(data.get('data_elements', {}))} disease mappings from JSON")
            return data
    except json.JSONDecodeError as e:
        logger.error(f"Error parsing DHIS2 mappings JSON: {e}")
        return {"data_elements": {}}


def _normalize_disease_key(disease_name: str) -> str:
    """
    Normalize disease name to mapping key format.

    Handles: "Cholera" -> "cholera"
             "Typhoid Fever" -> "typhoid_fever"
             "Acute Flaccid Paralysis (Polio)" -> "acute_flaccid_paralysis_(polio)"
    """
    return disease_name.lower().replace(" ", "_")


def _get_db_mapping(
    disease_name: str,
    indicator_type: str,
    environment: str,
) -> str | None:
    """
    Get mapping from database.

    Returns None if model not migrated or no mapping found.
    """
    try:
        from hmis.apps.surveillance.models import DHIS2DataElementMapping

        return DHIS2DataElementMapping.get_uid(
            disease_name=disease_name,
            indicator_type=indicator_type,
            environment=environment,
        )
    except Exception as e:
        # Table might not exist yet (pre-migration)
        logger.debug(f"Database mapping lookup failed: {e}")
        return None


def _get_json_mapping(
    disease_key: str,
    indicator_type: str,
) -> str | None:
    """Get mapping from JSON file."""
    data = _load_json_mappings()
    disease_data = data.get("data_elements", {}).get(disease_key, {})

    # Filter out metadata keys starting with _
    if indicator_type.startswith("_"):
        return None

    return disease_data.get(indicator_type)


def get_data_element_uid(
    disease_name: str,
    indicator_type: str,
    environment: str | None = None,
) -> str | None:
    """
    Get DHIS2 data element UID for a disease indicator.

    Checks database first, falls back to JSON file.

    Args:
        disease_name: Disease name (case-insensitive, e.g., "Cholera")
        indicator_type: One of 'cases_under_5', 'cases_5_and_above',
                       'deaths_under_5', 'deaths_5_and_above'
        environment: DHIS2 environment (default from DHIS2_ENVIRONMENT env var)

    Returns:
        DHIS2 data element UID or None if not mapped

    Example:
        >>> get_data_element_uid("Cholera", "cases_under_5")
        'jOdkuwpQGKX'
    """
    if environment is None:
        environment = get_environment()

    # Validate indicator type
    if indicator_type not in INDICATOR_TYPES:
        logger.warning(f"Invalid indicator_type: {indicator_type}")
        return None

    # Try database first (allows runtime updates)
    db_uid = _get_db_mapping(disease_name, indicator_type, environment)
    if db_uid:
        return db_uid

    # Fall back to JSON
    disease_key = _normalize_disease_key(disease_name)
    json_uid = _get_json_mapping(disease_key, indicator_type)

    if json_uid:
        return json_uid

    logger.warning(
        f"No DHIS2 mapping found for {disease_name}/{indicator_type} "
        f"in environment '{environment}'"
    )
    return None


def get_all_mappings(environment: str | None = None) -> dict[str, IndicatorMapping]:
    """
    Get all active mappings for an environment.

    Merges database and JSON mappings (database takes priority).

    Args:
        environment: DHIS2 environment (default from DHIS2_ENVIRONMENT env var)

    Returns:
        Dict in format: {disease_key: {indicator_type: uid}}

    Example:
        >>> mappings = get_all_mappings("local")
        >>> mappings["cholera"]["cases_under_5"]
        'jOdkuwpQGKX'
    """
    if environment is None:
        environment = get_environment()

    # Start with JSON mappings
    json_data = _load_json_mappings()
    result: dict[str, IndicatorMapping] = {}

    for disease_key, disease_data in json_data.get("data_elements", {}).items():
        result[disease_key] = {}
        for indicator in INDICATOR_TYPES:
            if indicator in disease_data:
                result[disease_key][indicator] = disease_data[indicator]  # type: ignore

    # Override with database mappings
    try:
        from hmis.apps.surveillance.models import DHIS2DataElementMapping

        db_mappings = DHIS2DataElementMapping.get_all_mappings(environment)
        for disease_key, indicators in db_mappings.items():
            if disease_key not in result:
                result[disease_key] = {}
            result[disease_key].update(indicators)  # type: ignore
    except Exception as e:
        logger.debug(f"Database mapping lookup failed (may not be migrated): {e}")

    return result


def validate_mappings(environment: str | None = None) -> dict:
    """
    Validate that all active notifiable diseases have complete mappings.

    Returns:
        Dict with:
            - valid: bool (all diseases mapped)
            - missing: list of missing mappings
            - mapped_count: number of fully mapped diseases
            - total_diseases: total active diseases

    Example:
        >>> result = validate_mappings()
        >>> if not result["valid"]:
        ...     print(result["missing"])
    """
    if environment is None:
        environment = get_environment()

    mappings = get_all_mappings(environment)
    missing: list[str] = []
    mapped_count = 0

    try:
        from hmis.apps.surveillance.models import NotifiableDisease

        diseases = NotifiableDisease.objects.filter(is_active=True)

        for disease in diseases:
            disease_key = _normalize_disease_key(disease.name)

            if disease_key not in mappings:
                missing.append(f"{disease.name}: No mapping found")
                continue

            disease_complete = True
            for indicator in INDICATOR_TYPES:
                if indicator not in mappings.get(disease_key, {}):
                    missing.append(f"{disease.name}: Missing {indicator}")
                    disease_complete = False

            if disease_complete:
                mapped_count += 1

        return {
            "valid": len(missing) == 0,
            "missing": missing,
            "mapped_count": mapped_count,
            "total_diseases": diseases.count(),
            "environment": environment,
        }

    except Exception as e:
        logger.error(f"Error validating mappings: {e}")
        return {
            "valid": False,
            "missing": [f"Error: {e}"],
            "mapped_count": 0,
            "total_diseases": 0,
            "environment": environment,
        }


def clear_cache() -> None:
    """Clear cached JSON mappings (call after file updates)."""
    _load_json_mappings.cache_clear()
    logger.info("DHIS2 mapping cache cleared")


def sync_json_to_database(environment: str = "local", overwrite: bool = False) -> dict:
    """
    Import mappings from JSON file into database.

    Useful for initializing database from JSON defaults.

    Args:
        environment: Target environment for imports
        overwrite: If True, update existing mappings

    Returns:
        Dict with created/updated/skipped counts
    """
    from hmis.apps.surveillance.models import (
        DHIS2DataElementMapping,
        NotifiableDisease,
    )

    json_data = _load_json_mappings()
    stats = {"created": 0, "updated": 0, "skipped": 0, "errors": []}

    for disease_key, indicators in json_data.get("data_elements", {}).items():
        # Try to find matching disease
        try:
            # First try exact match
            disease = NotifiableDisease.objects.filter(is_active=True).get(
                name__iexact=disease_key.replace("_", " ")
            )
        except NotifiableDisease.DoesNotExist:
            # Try with parentheses for AFP
            try:
                search_name = disease_key.replace("_", " ").replace("(", "\\(").replace(")", "\\)")
                disease = NotifiableDisease.objects.filter(is_active=True).get(
                    name__iregex=f"^{search_name}$"
                )
            except NotifiableDisease.DoesNotExist:
                stats["errors"].append(f"Disease not found: {disease_key}")
                continue

        for indicator_type in INDICATOR_TYPES:
            uid = indicators.get(indicator_type)
            if not uid:
                continue

            short_name = indicators.get(
                "_short_name", f"IDSR_{disease_key.upper()}_{indicator_type.upper()}"
            )

            mapping, created = DHIS2DataElementMapping.objects.get_or_create(
                disease=disease,
                indicator_type=indicator_type,
                environment=environment,
                defaults={
                    "data_element_uid": uid,
                    "short_name": short_name,
                    "is_active": True,
                },
            )

            if created:
                stats["created"] += 1
            elif overwrite:
                mapping.data_element_uid = uid
                mapping.save()
                stats["updated"] += 1
            else:
                stats["skipped"] += 1

    return stats
