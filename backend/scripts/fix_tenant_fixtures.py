"""
Fix test fixtures that create model objects without tenant context.

Models with facility/organization fields need those set in tests
so TenantScopedViewMixin doesn't filter them out.

This script finds test fixture functions that call Model.objects.create()
for tenant-scoped models, and adds facility/organization fields.
"""
import ast
import os
import re
import sys

# Models that have facility and/or organization fields
# (from the Django model introspection above)
MODELS_WITH_FACILITY = {
    "Clinic", "ClinicSession", "ClinicVisit", "ClinicEnrollment",
    "Encounter", "LabOrder", "Prescription", "Dispensing", "StockBatch",
    "Invoice", "Ward", "Admission", "TriageAssessment",
    "NotifiableCase", "SurveillanceAlert", "IHRNotification",
    "ProcedureCatalog", "ProcedureOrder", "ProcedureConsent",
    "ProcedureLog", "ProcedureOutcome",
    "ChatSession", "AICarePlanResult", "AICDSResult",
    "AILabInterpretResult", "AIDischargeResult", "AIICURiskResult",
    "PhysiotherapyOrder", "NutritionConsultation",
    "OccupationalTherapyOrder", "SocialWorkReferral",
    "CounsellingReferral", "MCHRegistration", "CDSAlert",
    "StockAlert",
}

MODELS_ORG_ONLY = {
    "Patient", "Allergy",
}


def get_fixture_info(filepath):
    """Parse a test file and find fixtures that create objects without tenant context."""
    with open(filepath) as f:
        content = f.read()

    if ".objects.create" not in content:
        return []

    try:
        tree = ast.parse(content)
    except SyntaxError:
        return []

    lines = content.splitlines(keepends=True)
    issues = []

    for node in ast.walk(tree):
        if not isinstance(node, ast.FunctionDef):
            continue

        # Check if it's a fixture (has @pytest.fixture decorator)
        is_fixture = False
        for decorator in node.decorator_list:
            dsrc = ast.get_source_segment(content, decorator)
            if dsrc and "fixture" in dsrc:
                is_fixture = True
                break

        if not is_fixture:
            continue

        func_source = ast.get_source_segment(content, node)
        if func_source is None:
            continue

        # Check for .objects.create calls for models that need facility
        param_names = {arg.arg for arg in node.args.args}

        needs_facility = False
        needs_org = False

        for model_name in MODELS_WITH_FACILITY:
            pattern = rf'{model_name}\.objects\.create\('
            if re.search(pattern, func_source):
                # Check if facility= is already in the create call
                # Find the specific create call block
                create_pattern = rf'{model_name}\.objects\.create\([^)]*\)'
                # Actually need to handle multi-line... use simpler check
                if "facility=" not in func_source and "facility" not in func_source:
                    needs_facility = True
                    needs_org = True
                    break

        if not needs_facility:
            for model_name in MODELS_ORG_ONLY:
                pattern = rf'{model_name}\.objects\.create\('
                if re.search(pattern, func_source):
                    if "organization=" not in func_source:
                        needs_org = True
                        break

        if needs_facility or needs_org:
            issues.append({
                "name": node.name,
                "lineno": node.lineno,
                "end_lineno": node.end_lineno or node.lineno,
                "params": param_names,
                "needs_facility": needs_facility,
                "needs_org": needs_org,
                "source": func_source,
            })

    return issues


def add_kwargs_to_create_call(lines, start_line, end_line, model_names, add_facility, add_org):
    """Add facility= and/or organization= kwargs to .objects.create() calls."""
    modified = False
    i = start_line
    while i <= end_line:
        line = lines[i]
        for model_name in model_names:
            if f"{model_name}.objects.create(" in line:
                # Find the closing paren - may be multi-line
                paren_depth = 0
                j = i
                found_close = False
                while j <= end_line:
                    for ch in lines[j]:
                        if ch == '(':
                            paren_depth += 1
                        elif ch == ')':
                            paren_depth -= 1
                            if paren_depth == 0:
                                found_close = True
                                break
                    if found_close:
                        break
                    j += 1

                if found_close:
                    # j is the line with the closing paren
                    close_line = lines[j]
                    close_idx = close_line.rindex(')')

                    # Get indentation of the create content
                    # Find a line with an argument to get the right indent
                    arg_indent = None
                    for k in range(i, j + 1):
                        stripped = lines[k].strip()
                        if '=' in stripped and not stripped.startswith('#') and model_name not in stripped:
                            arg_indent = len(lines[k]) - len(lines[k].lstrip())
                            break

                    if arg_indent is None:
                        arg_indent = len(lines[i]) - len(lines[i].lstrip()) + 8

                    new_lines = []
                    if add_facility:
                        new_lines.append(f"{' ' * arg_indent}facility=sample_facility,\n")
                    if add_org:
                        new_lines.append(f"{' ' * arg_indent}organization=sample_organization,\n")

                    if new_lines:
                        # Ensure the previous arg line has a trailing comma
                        prev_line_idx = j
                        if i != j:  # Multi-line
                            prev_line_idx = j - 1
                            while prev_line_idx > i and not lines[prev_line_idx].strip():
                                prev_line_idx -= 1
                            pl = lines[prev_line_idx].rstrip('\n')
                            if pl.strip() and not pl.rstrip().endswith(',') and not pl.rstrip().endswith('('):
                                lines[prev_line_idx] = pl.rstrip() + ',\n'

                        # Insert before the closing paren line
                        for nl in reversed(new_lines):
                            lines.insert(j, nl)
                            end_line += 1
                        modified = True
        i += 1

    return end_line, modified


def process_file(filepath, dry_run=False):
    """Process a single test file."""
    issues = get_fixture_info(filepath)
    if not issues:
        return 0

    with open(filepath) as f:
        content = f.read()

    lines = content.splitlines(keepends=True)
    fixes = 0

    # Process in reverse order to preserve line numbers
    for issue in sorted(issues, key=lambda x: x["lineno"], reverse=True):
        start = issue["lineno"] - 1
        end = issue["end_lineno"] - 1
        params = issue["params"]

        # Determine which models in this fixture need fixing
        models_to_fix = set()
        func_src = issue["source"]

        if issue["needs_facility"]:
            for m in MODELS_WITH_FACILITY:
                if f"{m}.objects.create(" in func_src and "facility=" not in func_src:
                    models_to_fix.add(m)

        if issue["needs_org"]:
            for m in MODELS_ORG_ONLY:
                if f"{m}.objects.create(" in func_src and "organization=" not in func_src:
                    models_to_fix.add(m)

        if not models_to_fix:
            continue

        # Add facility/org kwargs to the create calls
        end, modified = add_kwargs_to_create_call(
            lines, start, end, models_to_fix,
            add_facility=issue["needs_facility"],
            add_org=issue["needs_org"]
        )

        if not modified:
            continue

        # Add fixture params if needed
        new_params = []
        if issue["needs_facility"] and "sample_facility" not in params:
            new_params.append("sample_facility")
        if (issue["needs_facility"] or issue["needs_org"]) and "sample_organization" not in params:
            new_params.append("sample_organization")

        if new_params:
            # Find the def line
            def_line = lines[start]

            # Find end of signature
            sig_end = start
            while "):" not in "".join(lines[start:sig_end+1]) and sig_end < end:
                sig_end += 1

            close_line = lines[sig_end]

            if start == sig_end:
                # Single-line def
                close_idx = close_line.rindex("):")
                before = close_line[:close_idx]
                after = close_line[close_idx:]
                new_param_str = ", " + ", ".join(new_params)
                lines[sig_end] = before + new_param_str + after
            else:
                # Multi-line def
                indent = len(lines[start]) - len(lines[start].lstrip()) + 4
                param_lines = [f"{' ' * indent}{p},\n" for p in new_params]

                prev_idx = sig_end - 1
                while prev_idx > start and not lines[prev_idx].strip():
                    prev_idx -= 1
                pl = lines[prev_idx].rstrip('\n')
                if pl.strip() and not pl.rstrip().endswith(',') and not pl.rstrip().endswith('('):
                    lines[prev_idx] = pl.rstrip() + ',\n'

                for nl in reversed(param_lines):
                    lines.insert(sig_end, nl)

        fixes += 1

    if fixes > 0 and not dry_run:
        with open(filepath, 'w') as f:
            f.write(''.join(lines))

    return fixes


def main():
    dry_run = "--dry-run" in sys.argv
    total = 0

    for root, dirs, files in os.walk("tests"):
        for fn in files:
            if fn.endswith(".py") and fn.startswith("test_"):
                fp = os.path.join(root, fn)
                n = process_file(fp, dry_run=dry_run)
                if n:
                    prefix = "[DRY RUN] " if dry_run else ""
                    print(f"  {prefix}{fp}: {n} fixture(s)")
                    total += n

    print(f"\nTotal: {total} fixtures {'would be ' if dry_run else ''}fixed")

    if not dry_run:
        import py_compile
        errors = 0
        for root, dirs, files in os.walk("tests"):
            for fn in files:
                if fn.endswith(".py"):
                    fp = os.path.join(root, fn)
                    try:
                        py_compile.compile(fp, doraise=True)
                    except py_compile.PyCompileError as e:
                        print(f"  SYNTAX ERROR: {fp}: {e}")
                        errors += 1

        if errors:
            print(f"\n{errors} files have syntax errors!")
        else:
            print("\nAll files compile cleanly!")


if __name__ == "__main__":
    main()
