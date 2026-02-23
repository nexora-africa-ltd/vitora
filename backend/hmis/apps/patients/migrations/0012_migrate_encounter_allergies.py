"""
Data migration to parse existing Encounter.allergies text into structured Allergy records.

This migration:
1. Reads all encounters with non-empty allergies text
2. Parses the text to extract individual allergens
3. Creates Allergy records for each unique allergen per patient

Parsing handles common formats:
- Comma-separated: "Penicillin, Sulfa drugs, Peanuts"
- Semicolon-separated: "Penicillin; Sulfa drugs; Peanuts"
- With severity in parentheses: "Penicillin (severe - anaphylaxis), Sulfa (moderate)"
"""

import re

from django.db import migrations


def parse_allergies_text(text: str) -> list[dict]:
    """
    Parse free-text allergies into structured data.

    Returns list of dicts with keys: substance, severity, reaction_type, notes
    """
    if not text or not text.strip():
        return []

    # Split by common delimiters
    # Handle comma, semicolon, newline separators
    parts = re.split(r"[,;\n]", text)

    allergies = []
    for part in parts:
        part = part.strip()
        if not part or part.lower() in ("none", "no known allergies", "nkda", "n/a", "nil"):
            continue

        allergy = {
            "substance": part,
            "severity": "moderate",  # Default
            "reaction_type": "other",
            "notes": "",
        }

        # Try to extract severity from parentheses
        # e.g., "Penicillin (severe - anaphylaxis)"
        severity_match = re.search(r"\(([^)]+)\)", part)
        if severity_match:
            severity_text = severity_match.group(1).lower()
            # Extract substance without parentheses
            allergy["substance"] = part[: severity_match.start()].strip()
            allergy["notes"] = severity_match.group(1)

            # Map severity keywords
            if any(kw in severity_text for kw in ["severe", "anaphyl", "life", "critical"]):
                allergy["severity"] = "severe"
            elif any(kw in severity_text for kw in ["mild", "minor", "slight"]):
                allergy["severity"] = "mild"

            # Map reaction type keywords
            reaction_map = {
                "anaphyl": "anaphylaxis",
                "rash": "rash",
                "hives": "hives",
                "itch": "itching",
                "swell": "swelling",
                "nausea": "nausea",
                "vomit": "vomiting",
                "breath": "dyspnea",
            }
            for keyword, reaction in reaction_map.items():
                if keyword in severity_text:
                    allergy["reaction_type"] = reaction
                    break

        # Clean up substance name
        allergy["substance"] = allergy["substance"].strip()

        # Skip empty substances
        if allergy["substance"]:
            allergies.append(allergy)

    return allergies


def migrate_allergies_forward(apps, schema_editor):
    """Migrate Encounter.allergies text to structured Allergy records."""
    Encounter = apps.get_model("encounters", "Encounter")
    Allergy = apps.get_model("patients", "Allergy")

    # Track created allergies to avoid duplicates
    created_count = 0
    skipped_count = 0

    # Get all encounters with allergies text
    encounters_with_allergies = Encounter.objects.exclude(allergies="").exclude(
        allergies__isnull=True
    )

    # Track patient allergies to avoid duplicates
    patient_allergens = {}  # {patient_id: set(substance_lower)}

    for encounter in encounters_with_allergies:
        patient_id = encounter.patient_id
        if patient_id not in patient_allergens:
            # Check for existing allergies for this patient
            existing = set(
                Allergy.objects.filter(patient_id=patient_id).values_list(
                    "substance__iexact", flat=True
                )
            )
            patient_allergens[patient_id] = existing

        # Parse allergies text
        parsed = parse_allergies_text(encounter.allergies)

        for allergy_data in parsed:
            substance_lower = allergy_data["substance"].lower()

            # Skip if already exists for this patient
            if substance_lower in patient_allergens[patient_id]:
                skipped_count += 1
                continue

            # Create new Allergy record
            Allergy.objects.create(
                patient_id=patient_id,
                substance=allergy_data["substance"],
                substance_type="medication",  # Default assumption
                reaction_type=allergy_data["reaction_type"],
                severity=allergy_data["severity"],
                status="active",
                verification_status="unconfirmed",  # From free text, so unconfirmed
                notes=f"Migrated from encounter allergies text: {encounter.allergies}"
                if allergy_data["notes"]
                else f"Migrated from encounter. Original text: {encounter.allergies}",
                source_encounter_id=encounter.id,
            )

            patient_allergens[patient_id].add(substance_lower)
            created_count += 1

    print(
        f"\n  Migration complete: Created {created_count} allergy records, "
        f"skipped {skipped_count} duplicates"
    )


def migrate_allergies_backward(apps, schema_editor):
    """
    Reverse migration removes auto-created Allergy records.

    Only removes records that have source_encounter set (indicating migration origin).
    """
    Allergy = apps.get_model("patients", "Allergy")

    # Delete allergies that have source_encounter (created by migration)
    deleted_count, _ = Allergy.objects.exclude(source_encounter__isnull=True).delete()
    print(f"\n  Rollback complete: Deleted {deleted_count} migrated allergy records")


class Migration(migrations.Migration):
    dependencies = [
        ("patients", "0011_add_allergy_model"),
        ("encounters", "0022_add_disposition_fields"),  # Ensure encounter model exists
    ]

    operations = [
        migrations.RunPython(
            migrate_allergies_forward,
            migrate_allergies_backward,
        ),
    ]
