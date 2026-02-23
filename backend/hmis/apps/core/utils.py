"""
Core utility functions for Vitora HMIS.

This module provides shared utility functions used across the application.
"""

from datetime import datetime

from django.conf import settings


def generate_prc_number(facility_code: str | None = None) -> str:
    """
    Generate a unique Post-Rape Care (PRC) Number.

    PRC Numbers are used to track sexual assault/GBV cases across
    medical, legal, and psychosocial services in Kenya's healthcare system.

    Format: {FACILITY_CODE}-PRC-{SEQUENCE}/{YEAR}
    Example: FAC-PRC-0042/2026

    Args:
        facility_code: Optional facility code. If not provided, uses
                      settings.FACILITY_MFL_CODE or defaults to 'FAC'.

    Returns:
        str: A unique PRC number string
    """
    # Import here to avoid circular imports
    from hmis.apps.encounters.models import Encounter

    year = datetime.now().year
    code = facility_code or getattr(settings, "FACILITY_MFL_CODE", "FAC")

    # Build the prefix pattern for searching
    prefix_pattern = f"{code}-PRC-"
    suffix = f"/{year}"

    # Find all GBV/Forensic encounters this year and extract PRC numbers
    all_prc_encounters = Encounter.objects.filter(
        clinical_template__specialty="GBV/Forensic",
        created_at__year=year,
    ).exclude(clinical_template_data__isnull=True)

    max_sequence = 0
    for encounter in all_prc_encounters:
        if encounter.clinical_template_data:
            # Check various section structures
            prc_number = None

            # Try "Survivor Information" section
            if "Survivor Information" in encounter.clinical_template_data:
                prc_number = encounter.clinical_template_data.get("Survivor Information", {}).get(
                    "prc_number"
                )

            # Try flat structure
            if not prc_number and "prc_number" in encounter.clinical_template_data:
                prc_number = encounter.clinical_template_data.get("prc_number")

            if prc_number and suffix in str(prc_number):
                try:
                    # Extract sequence: FAC-PRC-0042/2026 -> 42
                    seq_part = prc_number.split("-PRC-")[1].split("/")[0]
                    sequence = int(seq_part)
                    max_sequence = max(max_sequence, sequence)
                except (IndexError, ValueError):
                    continue

    next_sequence = max_sequence + 1
    return f"{prefix_pattern}{next_sequence:04d}{suffix}"


def generate_ob_number(facility_code: str | None = None) -> str:
    """
    Generate a reference OB (Occurrence Book) Number format.

    OB Numbers are assigned by police, but this provides a placeholder
    format that matches the expected pattern.

    Format: OB/{SEQUENCE}/{YEAR}
    Example: OB/1234/2026

    Note: Actual OB numbers are assigned by police. This is for reference only.

    Args:
        facility_code: Not used, kept for API consistency.

    Returns:
        str: A placeholder OB number format
    """
    year = datetime.now().year
    return f"OB/____/{year}"


def generate_case_number(prefix: str, facility_code: str | None = None) -> str:
    """
    Generate a generic case number with a given prefix.

    Format: {FACILITY_CODE}-{PREFIX}-{SEQUENCE}/{YEAR}

    Args:
        prefix: The case type prefix (e.g., 'GBV', 'RTA', 'TRAUMA')
        facility_code: Optional facility code. Uses settings.FACILITY_MFL_CODE if not provided.

    Returns:
        str: A unique case number string
    """
    from hmis.apps.encounters.models import Encounter

    year = datetime.now().year
    code = facility_code or getattr(settings, "FACILITY_MFL_CODE", "FAC")
    full_prefix = f"{code}-{prefix}-"
    suffix = f"/{year}"

    # Count existing cases this year with this prefix
    # This is a simplified approach - in production you might want a dedicated counter table
    count = (
        Encounter.objects.filter(
            created_at__year=year,
        )
        .exclude(clinical_template_data__isnull=True)
        .count()
    )

    return f"{full_prefix}{count + 1:04d}{suffix}"
