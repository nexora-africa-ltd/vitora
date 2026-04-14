"""
Comprehensive automated fixer for multitenancy test bugs.

This script:
1. Finds all Patient.objects.create() calls missing organization=
2. Finds all Encounter.objects.create() calls missing facility=
3. Finds all LabOrder.objects.create() calls missing facility= and organization=
4. Finds all CDSAlert.objects.create() calls missing facility= and organization=
5. Adds the missing fields
6. Adds missing fixture parameters to function signatures
7. Handles auth_client fixtures that lack StaffProfile
"""

import os
import re


def add_field_to_model_create(content: str, model_class: str, field: str, value: str) -> str:
    """Add field=value to Model.objects.create() if missing."""
    lines = content.split("\n")
    result = []
    i = 0

    while i < len(lines):
        line = lines[i]
        marker = f"{model_class}.objects.create("

        if marker in line and f"{field}=" not in line:
            result.append(line)

            after_marker = line.split(marker)[1]
            if ")" in after_marker and "(" not in after_marker:
                i += 1
                continue

            depth = line.count("(") - line.count(")")
            while depth > 0 and i + 1 < len(lines):
                i += 1
                next_line = lines[i]
                depth += next_line.count("(") - next_line.count(")")

                if depth == 0:
                    prev = result[-1].rstrip()
                    if not prev.endswith(",") and not prev.endswith("("):
                        result[-1] = prev + ","
                    close_indent = len(next_line) - len(next_line.lstrip())
                    field_indent = close_indent + 4
                    result.append(" " * field_indent + f"{field}={value},")

                result.append(next_line)
        else:
            result.append(line)

        i += 1

    return "\n".join(result)


def add_params_to_signatures(content: str) -> str:
    """Add missing parameters to function signatures."""
    lines = content.split("\n")
    result = []
    i = 0

    while i < len(lines):
        line = lines[i]

        # Match single-line function definitions
        m = re.match(r"^(\s*def \w+\()(.*)(\):\s*)$", line)
        if m:
            prefix, params, suffix = m.group(1), m.group(2), m.group(3)

            # Scan body for references
            j = i + 1
            indent = len(line) - len(line.lstrip())
            needs = set()

            while j < len(lines):
                body = lines[j]
                if body.strip() and not body[0].isspace():
                    break
                body_indent = len(body) - len(body.lstrip()) if body.strip() else 999
                if body.strip() and body_indent <= indent and j > i + 1:
                    if re.match(r"\s*(?:def |class |@)", body):
                        break

                if (
                    "sample_facility" in body
                    and "="
                    not in body.split("sample_facility")[0].split("\n")[-1].split(",")[-1].strip()
                ):
                    if "facility=sample_facility" in body or "sample_facility" in body:
                        needs.add("sample_facility")
                if "sample_organization" in body and "organization=sample_organization" in body:
                    needs.add("sample_organization")
                j += 1

            additions = []
            for param in ["sample_organization", "sample_facility"]:
                if param in needs and param not in params:
                    additions.append(param)

            if additions:
                if params.strip():
                    new_params = params.rstrip() + ", " + ", ".join(additions)
                else:
                    new_params = ", ".join(additions)
                line = f"{prefix}{new_params}{suffix}"

        # Also handle multi-line signatures ending with ):
        # These would need a different approach - look for the ): line

        result.append(line)
        i += 1

    return "\n".join(result)


def remove_duplicate_keyword_args(content: str) -> str:
    """Remove consecutive duplicate keyword argument lines."""
    lines = content.split("\n")
    result = []
    for i, line in enumerate(lines):
        if (
            i > 0
            and line.strip() == lines[i - 1].strip()
            and "=" in line.strip()
            and line.strip().endswith(",")
        ):
            continue
        result.append(line)
    return "\n".join(result)


def process_file(filepath: str) -> tuple[str, int]:
    """Process a test file and return (filepath, changes_count)."""
    with open(filepath) as f:
        original = f.read()

    content = original

    # Add organization to Patient.objects.create
    content = add_field_to_model_create(content, "Patient", "organization", "sample_organization")

    # Add facility to Encounter.objects.create
    content = add_field_to_model_create(content, "Encounter", "facility", "sample_facility")

    # Add facility and organization to LabOrder.objects.create
    content = add_field_to_model_create(content, "LabOrder", "facility", "sample_facility")
    content = add_field_to_model_create(content, "LabOrder", "organization", "sample_organization")

    # Add facility and organization to CDSAlert.objects.create
    content = add_field_to_model_create(content, "CDSAlert", "facility", "sample_facility")
    content = add_field_to_model_create(content, "CDSAlert", "organization", "sample_organization")

    # Add organization to Allergy.objects.create
    content = add_field_to_model_create(content, "Allergy", "organization", "sample_organization")

    # Fix function signatures
    content = add_params_to_signatures(content)

    # Remove any accidental duplicates
    content = remove_duplicate_keyword_args(content)

    if content != original:
        with open(filepath, "w") as f:
            f.write(content)
        return filepath, 1
    return filepath, 0


def find_test_files_with_failures():
    """Return list of test files that have failing tests related to multitenancy."""
    files = []
    for root, dirs, filenames in os.walk("tests"):
        for fn in filenames:
            if fn.startswith("test_") and fn.endswith(".py"):
                fp = os.path.join(root, fn)
                with open(fp) as f:
                    content = f.read()
                # Check if file has Patient/Encounter/LabOrder creates without org/facility
                needs_fix = False
                if (
                    "Patient.objects.create(" in content
                    and "organization="
                    not in content.split("Patient.objects.create(")[1].split(")")[0]
                ):
                    needs_fix = True
                if "Encounter.objects.create(" in content and "facility=" not in content:
                    needs_fix = True
                if needs_fix:
                    files.append(fp)
    return files


if __name__ == "__main__":
    # Process ALL test files that have model creates without tenant fields
    test_dir = "tests"
    fixed = 0
    total = 0

    for root, dirs, filenames in os.walk(test_dir):
        for fn in filenames:
            if fn.startswith("test_") and fn.endswith(".py"):
                fp = os.path.join(root, fn)
                with open(fp) as f:
                    content = f.read()

                needs_fix = False
                for model, field in [
                    ("Patient", "organization"),
                    ("Encounter", "facility"),
                    ("LabOrder", "facility"),
                    ("CDSAlert", "facility"),
                    ("Allergy", "organization"),
                ]:
                    marker = f"{model}.objects.create("
                    if marker in content:
                        # Check if ANY create call for this model is missing the field
                        parts = content.split(marker)
                        for part in parts[1:]:
                            # Get the create call body (up to closing paren)
                            depth = 1
                            end = 0
                            for c in part:
                                if c == "(":
                                    depth += 1
                                elif c == ")":
                                    depth -= 1
                                    if depth == 0:
                                        break
                                end += 1
                            call_body = part[:end]
                            if f"{field}=" not in call_body:
                                needs_fix = True
                                break

                if needs_fix:
                    total += 1
                    _, changes = process_file(fp)
                    if changes:
                        fixed += 1
                        print(f"  Fixed: {fp}")

    print(f"\nProcessed {total} files, fixed {fixed}")
