#!/usr/bin/env python3
"""
PDF Case Definition Extraction Helper for MOH Standard Case Definitions.

This script assists with extracting case definitions from scanned PDFs.
Since the MOH PDF is scan-based (not text-based), this provides:

1. Manual extraction template
2. OCR output processor
3. AI-assisted extraction prompt generator
4. JSON format validator

Usage:
    # Generate extraction template
    python extract_case_definitions.py --template

    # Process OCR output
    python extract_case_definitions.py --ocr ocr_output.txt

    # Validate JSON format
    python extract_case_definitions.py --validate extracted.json

    # Generate AI prompt for a disease
    python extract_case_definitions.py --ai-prompt "Cholera"

    # Merge extracted data into main JSON
    python extract_case_definitions.py --merge extracted.json --output ../data/notifiable_diseases.json
"""

import argparse
import json
import re
import sys
from pathlib import Path

# MOH 502 diseases in order they appear in the PDF (update as needed)
DISEASE_ORDER = [
    "Cholera",
    "Yellow Fever",
    "Plague",
    "Viral Hemorrhagic Fevers",
    "Measles",
    "Acute Flaccid Paralysis (Polio)",
    "Meningococcal Meningitis",
    "Rabies (Human)",
    "Diphtheria",
    "Neonatal Tetanus",
    "Pertussis (Whooping Cough)",
    "Anthrax",
    "SARS/Novel Coronavirus",
    "Influenza (Novel/Pandemic)",
    "Smallpox",
    "Malaria",
    "Typhoid Fever",
    "Dysentery",
    "Tuberculosis",
    "Acute Respiratory Infections (ARI)",
    "Pneumonia",
    "Diarrhea (Non-Bloody)",
    "Leprosy",
    "Brucellosis",
    "Tetanus (Non-Neonatal)",
    "Hepatitis (Viral)",
    "Chikungunya",
    "Dengue Fever",
    "Rift Valley Fever",
    "Trypanosomiasis (Sleeping Sickness)",
    "Leishmaniasis (Kala-azar)",
    "Schistosomiasis (Bilharzia)",
    "Trachoma",
    "Onchocerciasis (River Blindness)",
    "Lymphatic Filariasis",
    "Maternal Deaths",
    "Perinatal Deaths",
    "Severe Acute Malnutrition",
    "Animal Bites",
    "Snake Bites",
]


def generate_template():
    """Generate a template for manual extraction."""
    template = {
        "_instructions": [
            "Fill in the case definitions from the MOH PDF",
            "For each disease, extract:",
            "  - suspected: Clinical/epidemiological criteria for suspected case",
            "  - confirmed: Laboratory/definitive criteria for confirmed case",
            "  - specimen: What specimens to collect",
            "  - test: Laboratory tests to perform",
            "  - turnaround: Expected turnaround time",
            "  - page_number: Page in the PDF where this disease appears",
            "Run: python extract_case_definitions.py --validate template.json",
        ],
        "diseases": [],
    }

    for disease in DISEASE_ORDER:
        template["diseases"].append(
            {
                "name": disease,
                "page_number": None,
                "case_definition": {
                    "suspected": "",
                    "confirmed": "",
                    "source": "MOH Standard Case Definitions, Page X",
                },
                "laboratory_criteria": {"specimen": "", "test": "", "turnaround": "", "source": ""},
            }
        )

    return template


def generate_ai_prompt(disease_name: str) -> str:
    """Generate a prompt for AI-assisted extraction."""
    return f"""
You are extracting case definitions from the Kenya MOH "Standard Case Definitions for Priority Diseases" PDF.

For the disease "{disease_name}", please extract:

1. SUSPECTED CASE DEFINITION:
   - What clinical signs/symptoms define a suspected case?
   - What epidemiological criteria (travel, contact, exposure)?
   - Are there age-specific criteria?

2. CONFIRMED CASE DEFINITION:
   - What laboratory tests confirm the diagnosis?
   - What specimens are required?
   - Is epidemiological linkage sufficient for confirmation?

3. LABORATORY CRITERIA:
   - Specimen type(s) to collect
   - Specific test(s) to perform
   - Expected turnaround time
   - Biosafety requirements

Return the information in this exact JSON format:
```json
{{
  "name": "{disease_name}",
  "case_definition": {{
    "suspected": "...",
    "confirmed": "...",
    "source": "MOH Standard Case Definitions, Page X"
  }},
  "laboratory_criteria": {{
    "specimen": "...",
    "test": "...",
    "turnaround": "...",
    "biosafety": "...",
    "source": "MOH Standard Case Definitions"
  }}
}}
```

Be precise and use exact wording from the source document where possible.
"""


def validate_extracted_json(filepath: str) -> tuple[bool, list[str]]:
    """Validate extracted JSON format."""
    errors = []

    try:
        with open(filepath, "r") as f:
            data = json.load(f)
    except json.JSONDecodeError as e:
        return False, [f"Invalid JSON: {e}"]
    except FileNotFoundError:
        return False, [f"File not found: {filepath}"]

    if "diseases" not in data:
        errors.append("Missing 'diseases' array")
        return False, errors

    for i, disease in enumerate(data["diseases"]):
        prefix = f"Disease {i + 1}"

        if "name" not in disease:
            errors.append(f"{prefix}: Missing 'name' field")
            continue

        name = disease["name"]
        prefix = f"'{name}'"

        # Check case_definition
        case_def = disease.get("case_definition")
        if case_def:
            if isinstance(case_def, dict):
                if not case_def.get("suspected"):
                    errors.append(f"{prefix}: Empty 'suspected' case definition")
                if not case_def.get("confirmed"):
                    errors.append(f"{prefix}: Empty 'confirmed' case definition")
            elif isinstance(case_def, str):
                if not case_def.strip():
                    errors.append(f"{prefix}: Empty case_definition string")
        else:
            errors.append(f"{prefix}: Missing 'case_definition'")

        # Check laboratory_criteria
        lab_criteria = disease.get("laboratory_criteria")
        if lab_criteria:
            if isinstance(lab_criteria, dict):
                if not lab_criteria.get("specimen"):
                    errors.append(f"{prefix}: Empty 'specimen' in laboratory_criteria")
                if not lab_criteria.get("test"):
                    errors.append(f"{prefix}: Empty 'test' in laboratory_criteria")
            elif isinstance(lab_criteria, str):
                if not lab_criteria.strip():
                    errors.append(f"{prefix}: Empty laboratory_criteria string")
        else:
            errors.append(f"{prefix}: Missing 'laboratory_criteria'")

    return len(errors) == 0, errors


def process_ocr_output(ocr_filepath: str) -> dict:
    """
    Process OCR output and attempt to extract case definitions.

    This is a best-effort parser for OCR text. Results should be reviewed.
    """
    with open(ocr_filepath, "r") as f:
        ocr_text = f.read()

    extracted = {"diseases": [], "_warnings": []}

    # Common patterns in case definitions
    suspected_patterns = [
        r"suspected\s*case[:\s]+(.+?)(?=confirmed|laboratory|$)",
        r"clinical\s*case[:\s]+(.+?)(?=confirmed|laboratory|$)",
    ]

    confirmed_patterns = [
        r"confirmed\s*case[:\s]+(.+?)(?=specimen|laboratory|$)",
        r"laboratory.?confirmed[:\s]+(.+?)(?=specimen|$)",
    ]

    for disease in DISEASE_ORDER:
        # Try to find this disease in the OCR text
        disease_pattern = re.escape(disease)
        match = re.search(
            f"{disease_pattern}(.{{500,2000}})", ocr_text, re.IGNORECASE | re.DOTALL
        )

        if match:
            section = match.group(1)

            suspected = ""
            confirmed = ""

            for pattern in suspected_patterns:
                m = re.search(pattern, section, re.IGNORECASE | re.DOTALL)
                if m:
                    suspected = m.group(1).strip()[:500]
                    break

            for pattern in confirmed_patterns:
                m = re.search(pattern, section, re.IGNORECASE | re.DOTALL)
                if m:
                    confirmed = m.group(1).strip()[:500]
                    break

            if suspected or confirmed:
                extracted["diseases"].append(
                    {
                        "name": disease,
                        "case_definition": {
                            "suspected": suspected,
                            "confirmed": confirmed,
                            "source": "Extracted from OCR - NEEDS REVIEW",
                        },
                        "_ocr_confidence": "low",
                    }
                )
            else:
                extracted["_warnings"].append(
                    f"Found '{disease}' in OCR but couldn't parse case definitions"
                )
        else:
            extracted["_warnings"].append(f"'{disease}' not found in OCR text")

    return extracted


def merge_into_main_json(extracted_filepath: str, main_filepath: str, output_filepath: str):
    """Merge extracted data into main notifiable_diseases.json."""
    with open(extracted_filepath, "r") as f:
        extracted = json.load(f)

    with open(main_filepath, "r") as f:
        main_data = json.load(f)

    # Create lookup for extracted diseases
    extracted_lookup = {d["name"]: d for d in extracted.get("diseases", [])}

    # Update main data
    updated_count = 0
    for disease in main_data["diseases"]:
        name = disease["name"]
        if name in extracted_lookup:
            ext = extracted_lookup[name]

            # Update case_definition if present
            if "case_definition" in ext:
                disease["case_definition"] = ext["case_definition"]
                updated_count += 1

            # Update laboratory_criteria if present
            if "laboratory_criteria" in ext:
                disease["laboratory_criteria"] = ext["laboratory_criteria"]

    # Update metadata
    main_data["_metadata"]["notes"] = (
        f"Enhanced with extracted case definitions. {updated_count} diseases updated."
    )

    # Write output
    with open(output_filepath, "w") as f:
        json.dump(main_data, f, indent=2)

    return updated_count


def main():
    parser = argparse.ArgumentParser(
        description="Extract case definitions from MOH PDF",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__,
    )

    parser.add_argument(
        "--template", action="store_true", help="Generate extraction template"
    )
    parser.add_argument(
        "--ai-prompt", metavar="DISEASE", help="Generate AI extraction prompt for disease"
    )
    parser.add_argument(
        "--validate", metavar="FILE", help="Validate extracted JSON file"
    )
    parser.add_argument(
        "--ocr", metavar="FILE", help="Process OCR text output"
    )
    parser.add_argument(
        "--merge",
        metavar="FILE",
        help="Merge extracted JSON into main notifiable_diseases.json",
    )
    parser.add_argument(
        "--output",
        metavar="FILE",
        default="../data/notifiable_diseases.json",
        help="Output file for merge (default: ../data/notifiable_diseases.json)",
    )
    parser.add_argument(
        "--main-json",
        metavar="FILE",
        default="../data/notifiable_diseases.json",
        help="Main JSON file to merge into",
    )

    args = parser.parse_args()

    if args.template:
        template = generate_template()
        print(json.dumps(template, indent=2))
        print("\n# Save this to a file and fill in the case definitions", file=sys.stderr)

    elif args.ai_prompt:
        print(generate_ai_prompt(args.ai_prompt))

    elif args.validate:
        valid, errors = validate_extracted_json(args.validate)
        if valid:
            print(f"✓ {args.validate} is valid")
            sys.exit(0)
        else:
            print(f"✗ {args.validate} has {len(errors)} issue(s):")
            for error in errors:
                print(f"  - {error}")
            sys.exit(1)

    elif args.ocr:
        extracted = process_ocr_output(args.ocr)
        print(json.dumps(extracted, indent=2))

        if extracted["_warnings"]:
            print(f"\n# {len(extracted['_warnings'])} warnings:", file=sys.stderr)
            for warning in extracted["_warnings"]:
                print(f"#   - {warning}", file=sys.stderr)

    elif args.merge:
        script_dir = Path(__file__).parent
        main_json = script_dir / args.main_json
        output_json = script_dir / args.output

        count = merge_into_main_json(args.merge, str(main_json), str(output_json))
        print(f"✓ Merged {count} disease(s) into {output_json}")

    else:
        parser.print_help()


if __name__ == "__main__":
    main()
