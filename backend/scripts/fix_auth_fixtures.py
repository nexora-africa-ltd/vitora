"""
Fix auth fixtures in test files to include StaffProfile for multi-tenancy.

This script finds test files with local authenticated_client/auth_client fixtures
that are missing StaffProfile creation, and adds the required tenant context.

Strategy:
1. Find files with local auth fixtures (force_authenticate calls)
2. Check if they already create a StaffProfile
3. If not, modify the fixture to add StaffProfile via ensure_staff_profile()
"""
import ast
import os
import re
import sys


def find_auth_fixtures_needing_profile(filepath: str) -> list[dict]:
    """Find auth fixtures that call force_authenticate but don't create StaffProfile."""
    with open(filepath) as f:
        content = f.read()

    # Quick check: does the file even have force_authenticate?
    if "force_authenticate" not in content:
        return []

    # If all force_authenticate calls already have StaffProfile nearby, skip
    # We look for fixtures/functions that call force_authenticate but don't mention StaffProfile
    issues = []

    try:
        tree = ast.parse(content)
    except SyntaxError:
        return []

    lines = content.splitlines()

    for node in ast.walk(tree):
        if not isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            continue

        # Get the source for this function
        func_source = ast.get_source_segment(content, node)
        if func_source is None:
            continue

        # Check if it's a fixture that calls force_authenticate
        if "force_authenticate" not in func_source:
            continue

        # Check if it already creates StaffProfile
        if "StaffProfile" in func_source or "ensure_staff_profile" in func_source:
            continue

        # Check if it's a pytest fixture (has @pytest.fixture decorator or is in a class)
        is_fixture = False
        for decorator in node.decorator_list:
            decorator_source = ast.get_source_segment(content, decorator)
            if decorator_source and "fixture" in decorator_source:
                is_fixture = True
                break

        # Also check: is this a method named authenticated_client / auth_client etc?
        fixture_names = [
            "authenticated_client", "auth_client", "admin_client",
            "clearance_client", "rx_client", "timeline_authenticated_client",
            "admin_client_sf",
        ]
        is_auth_fixture = node.name in fixture_names

        if not is_fixture and not is_auth_fixture:
            continue

        # Get the parameter names
        param_names = set()
        for arg in node.args.args:
            param_names.add(arg.arg)

        issues.append({
            "name": node.name,
            "lineno": node.lineno,
            "end_lineno": node.end_lineno or node.lineno,
            "params": param_names,
            "is_method": "self" in param_names,
        })

    return issues


def process_file(filepath: str, dry_run: bool = False) -> int:
    """Process a single test file. Returns number of fixes."""
    issues = find_auth_fixtures_needing_profile(filepath)
    if not issues:
        return 0

    with open(filepath) as f:
        content = f.read()

    lines = content.splitlines(keepends=True)
    fixes = 0

    # Process in reverse to preserve line numbers
    for issue in reversed(issues):
        func_name = issue["name"]
        start_line = issue["lineno"] - 1  # 0-indexed
        end_line = issue["end_lineno"] - 1

        # Find the fixture decorator line (above the def line)
        decorator_line = start_line
        while decorator_line > 0 and (
            lines[decorator_line - 1].strip().startswith("@")
            or lines[decorator_line - 1].strip() == ""
        ):
            if lines[decorator_line - 1].strip().startswith("@"):
                decorator_line -= 1
            else:
                break

        # Get the function source
        func_lines = lines[start_line:end_line + 1]
        func_source = "".join(func_lines)

        # Find the force_authenticate call to get the user variable name
        user_var = None
        fa_match = re.search(r"force_authenticate\(user=(\w+)\)", func_source)
        if fa_match:
            user_var = fa_match.group(1)

        if not user_var:
            continue

        # Determine indentation
        def_line = lines[start_line]
        indent = len(def_line) - len(def_line.lstrip())
        body_indent = " " * (indent + 4)

        # Add sample_organization and sample_facility to fixture params if not present
        params = issue["params"]
        new_params_needed = []
        if "sample_organization" not in params:
            new_params_needed.append("sample_organization")
        if "sample_facility" not in params:
            new_params_needed.append("sample_facility")

        if new_params_needed:
            # Find the def line and add params
            def_line_content = lines[start_line]

            # Handle single-line and multi-line signatures
            # Find the complete signature
            sig_end = start_line
            sig_text = lines[start_line]
            while "):" not in sig_text and sig_end < end_line:
                sig_end += 1
                sig_text += lines[sig_end]

            # Add new params before the closing ):
            close_line_idx = sig_end
            close_line = lines[close_line_idx]

            if start_line == sig_end:
                # Single line: def foo(a, b):
                close_idx = close_line.rindex("):")
                before = close_line[:close_idx]
                after = close_line[close_idx:]
                new_params = ", " + ", ".join(new_params_needed)
                lines[close_line_idx] = before + new_params + after
            else:
                # Multi-line: add before ):
                param_indent = body_indent
                new_param_lines = []
                for p in new_params_needed:
                    new_param_lines.append(f"{param_indent}{p},\n")

                # Ensure previous line has trailing comma
                prev_idx = close_line_idx - 1
                prev_line = lines[prev_idx].rstrip("\n")
                if prev_line.rstrip() and not prev_line.rstrip().endswith(",") and not prev_line.rstrip().endswith("("):
                    lines[prev_idx] = prev_line.rstrip() + ",\n"

                for nl in reversed(new_param_lines):
                    lines.insert(close_line_idx, nl)
                end_line += len(new_param_lines)

        # Now add the ensure_staff_profile call before force_authenticate
        # Find the force_authenticate line
        for i in range(start_line, end_line + 1):
            if "force_authenticate" in lines[i]:
                fa_line_idx = i
                fa_indent = len(lines[i]) - len(lines[i].lstrip())
                profile_line = (
                    f"{' ' * fa_indent}ensure_staff_profile("
                    f"{user_var}, sample_organization, sample_facility)\n"
                )
                lines.insert(fa_line_idx, profile_line)
                end_line += 1
                break

        # Add import for ensure_staff_profile if not present
        # (will do at file level after processing all issues)

        fixes += 1

    if fixes > 0:
        new_content = "".join(lines)

        # Add import for ensure_staff_profile if not already present
        if "ensure_staff_profile" not in content and "ensure_staff_profile" in new_content:
            # Find the right place to add the import
            # Add after the last import line
            import_line = "from tests.conftest import ensure_staff_profile\n"

            # Find where to insert - after the last top-level import
            insert_idx = 0
            for i, line in enumerate(lines):
                stripped = line.strip()
                if stripped.startswith("import ") or stripped.startswith("from "):
                    insert_idx = i + 1
                elif stripped and not stripped.startswith("#") and not stripped.startswith("\"\"\"") and insert_idx > 0:
                    # We've passed the imports section
                    break

            lines.insert(insert_idx, import_line)
            new_content = "".join(lines)

        if not dry_run:
            with open(filepath, "w") as f:
                f.write(new_content)

    return fixes


def main():
    dry_run = "--dry-run" in sys.argv

    total_fixes = 0
    test_dirs = ["tests"]

    for test_dir in test_dirs:
        for root, dirs, files in os.walk(test_dir):
            for fn in files:
                if fn.endswith(".py") and fn.startswith("test_"):
                    fp = os.path.join(root, fn)
                    fixes = process_file(fp, dry_run=dry_run)
                    if fixes:
                        total_fixes += fixes
                        prefix = "[DRY RUN] " if dry_run else ""
                        print(f"  {prefix}Fixed {fixes} fixture(s) in {fp}")

    print(f"\nTotal: {total_fixes} fixtures {'would be ' if dry_run else ''}fixed")

    if not dry_run:
        # Verify no syntax errors
        errors = 0
        for test_dir in test_dirs:
            for root, dirs, files in os.walk(test_dir):
                for fn in files:
                    if fn.endswith(".py"):
                        fp = os.path.join(root, fn)
                        try:
                            with open(fp) as f:
                                compile(f.read(), fp, "exec")
                        except SyntaxError as e:
                            print(f"  SYNTAX ERROR: {fp}: {e}")
                            errors += 1

        if errors:
            print(f"\n{errors} files have syntax errors!")
        else:
            print("\nAll files compile cleanly!")


if __name__ == "__main__":
    main()
