"""Quality measure import/export services."""

from __future__ import annotations

import csv
import io
import json
from typing import Any

from hmis.apps.quality.models import QualityMeasure


def import_measures_from_json(data: list[dict[str, Any]]) -> dict[str, int]:
    """Import quality measures from a list of dicts.

    Uses update_or_create keyed on `code` so re-imports update existing measures.

    Returns dict with 'created' and 'updated' counts.
    """
    created_count = 0
    updated_count = 0

    for item in data:
        code = item.get("code")
        if not code:
            continue

        defaults = {
            "name": item.get("name", ""),
            "description": item.get("description", ""),
            "domain": item.get("domain", "CLINICAL"),
            "status": item.get("status", "DRAFT"),
            "numerator_logic": item.get("numerator_logic", ""),
            "denominator_logic": item.get("denominator_logic", ""),
            "exclusion_logic": item.get("exclusion_logic", ""),
            "reporting_period": item.get("reporting_period", "QUARTERLY"),
            "dhis2_indicator_id": item.get("dhis2_indicator_id", ""),
            "reference_url": item.get("reference_url", ""),
            "applicable_clinic_types": item.get("applicable_clinic_types", []),
        }

        # Handle optional numeric fields
        if "target_percentage" in item and item["target_percentage"]:
            defaults["target_percentage"] = item["target_percentage"]
        if "low_threshold" in item and item["low_threshold"]:
            defaults["low_threshold"] = item["low_threshold"]

        _, created = QualityMeasure.objects.update_or_create(
            code=code,
            defaults=defaults,
        )

        if created:
            created_count += 1
        else:
            updated_count += 1

    return {"created": created_count, "updated": updated_count}


def import_measures_from_csv(file_content: str) -> dict[str, int]:
    """Import quality measures from CSV content.

    Expected columns: code, name, description, domain, status,
    numerator_logic, denominator_logic, exclusion_logic,
    target_percentage, low_threshold, reporting_period,
    dhis2_indicator_id, reference_url
    """
    reader = csv.DictReader(io.StringIO(file_content))
    data: list[dict[str, Any]] = []

    for row in reader:
        item: dict[str, Any] = dict(row)
        # CSV returns strings; convert applicable_clinic_types
        if "applicable_clinic_types" in item:
            try:
                item["applicable_clinic_types"] = json.loads(
                    item["applicable_clinic_types"]
                )
            except (json.JSONDecodeError, TypeError):
                item["applicable_clinic_types"] = []

        # Convert numeric fields
        for field in ("target_percentage", "low_threshold"):
            val = item.get(field, "")
            if val and val.strip():
                try:
                    item[field] = float(val)
                except (ValueError, TypeError):
                    item[field] = None
            else:
                item[field] = None

        data.append(item)

    return import_measures_from_json(data)


def export_measures_to_json(
    measures: list[QualityMeasure] | None = None,
) -> list[dict[str, Any]]:
    """Export quality measures as a list of dicts (JSON-serializable)."""
    if measures is None:
        measures = list(QualityMeasure.objects.all())

    result = []
    for m in measures:
        result.append(
            {
                "code": m.code,
                "name": m.name,
                "description": m.description,
                "domain": m.domain,
                "status": m.status,
                "numerator_logic": m.numerator_logic,
                "denominator_logic": m.denominator_logic,
                "exclusion_logic": m.exclusion_logic,
                "target_percentage": float(m.target_percentage) if m.target_percentage else None,
                "low_threshold": float(m.low_threshold) if m.low_threshold else None,
                "reporting_period": m.reporting_period,
                "dhis2_indicator_id": m.dhis2_indicator_id,
                "reference_url": m.reference_url,
                "applicable_clinic_types": m.applicable_clinic_types,
            }
        )
    return result


def export_measures_to_csv(
    measures: list[QualityMeasure] | None = None,
) -> str:
    """Export quality measures as CSV string."""
    data = export_measures_to_json(measures)
    if not data:
        return ""

    output = io.StringIO()
    writer = csv.DictWriter(output, fieldnames=data[0].keys())
    writer.writeheader()

    for item in data:
        # Convert list to JSON string for CSV
        if isinstance(item.get("applicable_clinic_types"), list):
            item["applicable_clinic_types"] = json.dumps(item["applicable_clinic_types"])
        writer.writerow(item)

    return output.getvalue()


def export_measures_to_qrda(
    measures: list[QualityMeasure] | None = None,
) -> dict[str, Any]:
    """Export quality measures in a simplified QRDA-style format.

    Returns a JSON-compatible dict with QRDA-like structure.
    """
    if measures is None:
        measures = list(QualityMeasure.objects.all())

    return {
        "document_type": "quality_measure_set",
        "version": "1.0",
        "measures": [
            {
                "identifier": {"code": m.code, "system": "vitora-hmis"},
                "title": m.name,
                "description": m.description,
                "status": m.status,
                "measure_type": "proportion",
                "improvement_notation": "increase",
                "population_criteria": {
                    "numerator": {"description": m.numerator_logic},
                    "denominator": {"description": m.denominator_logic},
                    "exclusions": {"description": m.exclusion_logic or "None"},
                },
                "supplemental_data": {
                    "domain": m.domain,
                    "reporting_period": m.reporting_period,
                    "target_percentage": (
                        float(m.target_percentage) if m.target_percentage else None
                    ),
                    "dhis2_indicator_id": m.dhis2_indicator_id or None,
                },
            }
            for m in measures
        ],
    }
