"""
ICU lab enrichment service.

Fetches a patient's most recent verified lab results and maps them
to the flat field names expected by the ICU predictor
(wbc, platelets, creatinine, bilirubin, lactate, pao2_fio2_ratio).

The mapping uses LOINC codes as the canonical key for interoperability,
with TestCatalog.code as a fallback for facilities that haven't adopted
LOINC yet.
"""

from __future__ import annotations

import logging
from decimal import Decimal

from django.db.models import Q

logger = logging.getLogger(__name__)

# ─────────────────────────────────────────────────────────────────────
# LOINC → ICU field mapping
# ─────────────────────────────────────────────────────────────────────
# Each entry: LOINC code → (icu_field_name, unit_hint)
# unit_hint documents the expected unit for the ICU predictor.
LOINC_TO_ICU_FIELD: dict[str, tuple[str, str]] = {
    "6690-2": ("wbc", "x10^9/L"),         # Leukocytes [#/volume]
    "777-3": ("platelets", "x10^9/L"),     # Platelets [#/volume]
    "2160-0": ("creatinine", "mg/dL"),     # Creatinine [Mass/volume]
    "1975-2": ("bilirubin", "mg/dL"),      # Total Bilirubin [Mass/volume]
    "2524-7": ("lactate", "mmol/L"),       # Lactate [Moles/volume]
    # PaO2/FiO2 ratio is typically computed, not a single LOINC test,
    # but if a facility reports it directly:
    "50984-4": ("pao2_fio2_ratio", "mmHg"),  # PaO2/FiO2 in arterial blood
}

# Fallback: TestCatalog.code → ICU field (for catalogs without LOINC)
CODE_TO_ICU_FIELD: dict[str, tuple[str, str]] = {
    "WBC": ("wbc", "x10^9/L"),
    "PLT": ("platelets", "x10^9/L"),
    "CREA": ("creatinine", "mg/dL"),
    "CR": ("creatinine", "mg/dL"),
    "TBIL": ("bilirubin", "mg/dL"),
    "LACT": ("lactate", "mmol/L"),
}

# All LOINC codes and catalog codes we care about
_RELEVANT_LOINC_CODES = set(LOINC_TO_ICU_FIELD.keys())
_RELEVANT_CATALOG_CODES = set(CODE_TO_ICU_FIELD.keys())


def get_latest_labs_for_icu(
    patient_id: int,
    admission_id: int | None = None,
) -> dict[str, float]:
    """
    Return the latest verified lab values for ICU risk scoring.

    For each ICU-relevant lab (wbc, platelets, creatinine, bilirubin,
    lactate, pao2_fio2_ratio), finds the most recent VERIFIED result
    and returns it as a flat dict of floats.

    Lookup strategy:
    1. If admission_id is provided, prefer results from that admission's
       lab orders (most clinically relevant).
    2. Fall back to any verified result for the patient (within 7 days).

    Args:
        patient_id: Patient primary key.
        admission_id: Optional admission to scope results to.

    Returns:
        Dict mapping ICU field names to float values, e.g.:
        {"wbc": 15.2, "platelets": 120.0, "creatinine": 2.1}
        Only includes fields with available verified results.
    """
    # Import here to avoid circular imports at module level
    from datetime import timedelta

    from django.utils import timezone

    from hmis.apps.laboratory.models import LabResult

    seven_days_ago = timezone.now() - timedelta(days=7)

    # Build base queryset: verified results with a numeric value,
    # for tests we care about (by LOINC or catalog code)
    base_qs = LabResult.objects.filter(
        verification_status="VERIFIED",
        numeric_value__isnull=False,
    ).filter(
        Q(order_item__test__loinc_code__in=_RELEVANT_LOINC_CODES)
        | Q(order_item__test__code__in=_RELEVANT_CATALOG_CODES)
    ).select_related(
        "order_item__test",
        "order_item__lab_order",
    )

    results: dict[str, float] = {}

    # Strategy 1: Admission-scoped results (prefer these)
    if admission_id is not None:
        admission_qs = base_qs.filter(
            order_item__lab_order__admission_id=admission_id,
        ).order_by("-verified_at")

        results = _extract_lab_values(admission_qs)

    # Strategy 2: Fill gaps with recent patient-wide results
    missing_fields = _ICU_FIELDS - set(results.keys())
    if missing_fields:
        patient_qs = base_qs.filter(
            order_item__lab_order__patient_id=patient_id,
            verified_at__gte=seven_days_ago,
        ).order_by("-verified_at")

        patient_results = _extract_lab_values(patient_qs)

        # Only fill fields not already found from admission
        for field, value in patient_results.items():
            if field not in results:
                results[field] = value

    if results:
        logger.info(
            "ICU lab enrichment: found %d lab values for patient %s (admission %s): %s",
            len(results),
            patient_id,
            admission_id,
            list(results.keys()),
        )

    return results


# All fields the ICU predictor accepts
_ICU_FIELDS = {"wbc", "platelets", "creatinine", "bilirubin", "lactate", "pao2_fio2_ratio"}


def _extract_lab_values(queryset) -> dict[str, float]:
    """
    Iterate over a LabResult queryset and extract the first (most recent)
    value for each ICU field.
    """
    found: dict[str, float] = {}

    for result in queryset.iterator():
        test = result.order_item.test

        # Map via LOINC first, then catalog code
        mapping = None
        if test.loinc_code and test.loinc_code in LOINC_TO_ICU_FIELD:
            mapping = LOINC_TO_ICU_FIELD[test.loinc_code]
        elif test.code in CODE_TO_ICU_FIELD:
            mapping = CODE_TO_ICU_FIELD[test.code]

        if mapping is None:
            continue

        field_name, _unit_hint = mapping

        # Only take the first (most recent due to ordering) for each field
        if field_name not in found:
            try:
                found[field_name] = float(Decimal(str(result.numeric_value)))
            except (ValueError, TypeError, ArithmeticError):
                logger.warning(
                    "Could not convert lab result %s (value=%r) to float",
                    result.id,
                    result.numeric_value,
                )

        # Stop early if we have all fields
        if len(found) == len(_ICU_FIELDS):
            break

    return found
