# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""
KENHDD data-element seeding service.

Use this helper from API views or management commands to seed
``KENHDDDataElement`` rows from JSON. If no ``elements_path`` is provided,
it loads ``backend/data/kenhdd_elements.json``. Input args:
- elements_path: optional Path to a JSON file containing a list of elements.
- dry_run: when True, validates and counts without writing database rows.
"""

from __future__ import annotations

import json
from pathlib import Path

from hmis.apps.kenhdd.models import KENHDDDataElement

DEFAULT_ELEMENTS_PATH = Path(__file__).resolve().parents[4] / "data" / "kenhdd_elements.json"


def seed_kenhdd_elements(
    *, elements_path: Path | None = None, dry_run: bool = False
) -> dict[str, int]:
    """Seed KENHDD data elements from JSON, skipping existing element IDs."""
    source_path = elements_path or DEFAULT_ELEMENTS_PATH
    if not source_path.is_file():
        raise FileNotFoundError(f"Elements file not found: {source_path}")

    with open(source_path, encoding="utf-8") as fh:
        elements_data = json.load(fh)

    if not isinstance(elements_data, list):
        raise ValueError("KENHDD elements JSON must contain a top-level list")

    created_count = 0
    skipped_count = 0

    for elem in elements_data:
        if not isinstance(elem, dict):
            skipped_count += 1
            continue

        element_id = str(elem.get("element_id", "")).strip()
        if not element_id:
            skipped_count += 1
            continue

        if KENHDDDataElement.objects.filter(element_id=element_id).exists():
            skipped_count += 1
            continue

        if dry_run:
            created_count += 1
            continue

        KENHDDDataElement.objects.create(
            element_id=element_id,
            name=elem.get("name", element_id),
            description=elem.get("description", ""),
            resource_type=elem.get("resource_type", "PATIENT"),
            model_field=elem.get("model_field", ""),
            requirement_level=elem.get("requirement_level", "OPTIONAL"),
            data_type=elem.get("data_type", "STRING"),
            coding_system=elem.get("coding_system", ""),
            max_length=elem.get("max_length"),
            format_pattern=elem.get("format_pattern", ""),
            condition_expression=elem.get("condition_expression", ""),
        )
        created_count += 1

    return {
        "created": created_count,
        "skipped": skipped_count,
        "total": len(elements_data),
    }
