"""
Comprehensive script to fix multitenancy test bugs across ALL failing test files.
Handles two patterns:
1. Adding sample_facility parameter to fixture/test method signatures where
   facility=sample_facility is used inside the body
2. Adding sample_organization parameter where organization=sample_organization is used
"""

import re


def add_missing_params_to_signatures(content: str) -> str:
    """
    Find functions/methods that reference sample_facility or sample_organization
    in their body but don't have them in their signature, and add them.
    """
    lines = content.split("\n")
    result = []
    i = 0

    while i < len(lines):
        line = lines[i]

        # Match function/method definitions (both fixture and test methods)
        m = re.match(r"^(\s*def \w+\()(.*?)(\):)\s*$", line)
        if m:
            prefix = m.group(1)
            params = m.group(2)
            suffix = m.group(3)

            # Scan the body for references
            j = i + 1
            needs_facility = False
            needs_org = False
            indent = len(line) - len(line.lstrip())

            while j < len(lines):
                body_line = lines[j]
                # Stop at next function at same or lower indent
                body_m = re.match(r"^(\s*)(?:def |class |@pytest)", body_line)
                if body_m and len(body_m.group(1)) <= indent and j > i + 1:
                    break

                if "sample_facility" in body_line and "def " not in body_line:
                    needs_facility = True
                if "sample_organization" in body_line and "def " not in body_line:
                    needs_org = True
                j += 1

            additions = []
            if needs_facility and "sample_facility" not in params:
                additions.append("sample_facility")
            if needs_org and "sample_organization" not in params:
                additions.append("sample_organization")

            if additions:
                if params.strip():
                    new_params = params + ", " + ", ".join(additions)
                else:
                    new_params = ", ".join(additions)
                line = f"{prefix}{new_params}{suffix}"

        result.append(line)
        i += 1

    return "\n".join(result)


def add_field_to_model_create(content: str, model_name: str, field: str, value: str) -> str:
    """
    Add a field=value to Model.objects.create() calls that don't already have it.
    Handles multi-line create calls.
    """
    lines = content.split("\n")
    result = []
    i = 0

    while i < len(lines):
        line = lines[i]
        marker = f"{model_name}.objects.create("

        if marker in line and f"{field}=" not in line:
            result.append(line)

            # Check if single-line (has closing paren on same line)
            after_marker = line.split(marker)[1]
            if ")" in after_marker:
                # Single line - skip (too complex to modify safely)
                i += 1
                continue

            # Multi-line - find closing paren
            depth = line.count("(") - line.count(")")
            while depth > 0 and i + 1 < len(lines):
                i += 1
                next_line = lines[i]
                depth += next_line.count("(") - next_line.count(")")

                if depth == 0:
                    # This is the closing line - insert field before it
                    # Ensure previous line has trailing comma
                    prev = result[-1].rstrip()
                    if not prev.endswith(",") and not prev.endswith("("):
                        result[-1] = prev + ","
                    # Calculate indent from closing paren line + 4 spaces
                    close_indent = len(next_line) - len(next_line.lstrip())
                    field_indent = close_indent + 4
                    result.append(" " * field_indent + f"{field}={value},")

                result.append(next_line)
        else:
            result.append(line)

        i += 1

    return "\n".join(result)


def fix_auth_client_fixture(content: str, username: str, employee_id: str) -> str:
    """
    Find 'def auth_client(api_client, auth_user):' and add StaffProfile setup.
    Returns modified content.
    """
    old_pattern = "@pytest.fixture\ndef auth_client(api_client, auth_user):\n"

    if old_pattern not in content:
        return content

    # Find the full fixture (up to the next fixture or class)
    idx = content.index(old_pattern)
    # Find the return statement or next fixture
    rest = content[idx:]
    lines = rest.split("\n")
    end_idx = 0
    for j in range(2, len(lines)):
        if lines[j] and not lines[j].startswith(" ") and not lines[j].startswith("\t"):
            end_idx = j
            break

    old_fixture = "\n".join(lines[:end_idx])

    new_fixture = f'''@pytest.fixture
def auth_client(
    api_client, auth_user, sample_organization, sample_facility, sample_department, sample_role
):
    """Provide authenticated API client with multitenancy context."""
    from datetime import date as _date

    from hmis.apps.core.models import StaffProfile

    StaffProfile.objects.get_or_create(
        user=auth_user,
        defaults={{
            "employee_id": "{employee_id}",
            "organization": sample_organization,
            "primary_facility": sample_facility,
            "primary_department": sample_department,
            "primary_role": sample_role,
            "date_joined": _date.today(),
        }},
    )
    api_client.force_authenticate(user=auth_user)
    return api_client'''

    return content.replace(old_fixture, new_fixture)


def process_file(
    filepath: str,
    models_to_fix: dict[str, list[tuple[str, str]]],
    fix_auth: bool = False,
    auth_username: str = "",
    employee_id: str = "",
):
    """
    Process a single test file.

    models_to_fix: dict mapping model name to list of (field, value) tuples
        e.g. {"Patient": [("organization", "sample_organization")],
              "Encounter": [("facility", "sample_facility")]}
    """
    with open(filepath) as f:
        content = f.read()

    original = content

    # Step 1: Fix auth_client fixture if needed
    if fix_auth:
        content = fix_auth_client_fixture(content, auth_username, employee_id)

    # Step 2: Add missing fields to model creates
    for model_name, fields in models_to_fix.items():
        for field, value in fields:
            content = add_field_to_model_create(content, model_name, field, value)

    # Step 3: Fix function signatures
    content = add_missing_params_to_signatures(content)

    if content != original:
        with open(filepath, "w") as f:
            f.write(content)
        print(f"  Fixed: {filepath}")
    else:
        print(f"  No changes: {filepath}")


if __name__ == "__main__":
    # encounter_pre_triage
    process_file(
        "tests/encounters/test_encounter_pre_triage_queue_api.py",
        {
            "Patient": [("organization", "sample_organization")],
            "Encounter": [("facility", "sample_facility")],
        },
    )

    # encounter_api
    process_file(
        "tests/encounters/test_encounter_api.py",
        {
            "Patient": [("organization", "sample_organization")],
            "Encounter": [("facility", "sample_facility")],
        },
    )

    # lab_api
    process_file(
        "tests/laboratory/test_lab_api.py",
        {"LabOrder": [("facility", "sample_facility"), ("organization", "sample_organization")]},
    )

    # lab_specimen_api
    process_file(
        "tests/laboratory/test_lab_specimen_api.py",
        {"LabOrder": [("facility", "sample_facility"), ("organization", "sample_organization")]},
    )

    print("\nDone!")
