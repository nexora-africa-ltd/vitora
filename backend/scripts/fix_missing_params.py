"""
Robust fixer for missing sample_facility/sample_organization parameters.

Strategy: Use AST parsing to find functions that reference sample_facility
or sample_organization but don't have them as parameters.
"""

import ast
import os


def find_functions_needing_params(filepath: str) -> list[dict]:
    """Find functions that reference sample_facility/org but don't have them as params."""
    with open(filepath) as f:
        content = f.read()

    try:
        tree = ast.parse(content)
    except SyntaxError:
        return []

    issues = []

    for node in ast.walk(tree):
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            # Get parameter names
            param_names = set()
            for arg in node.args.args:
                param_names.add(arg.arg)
            for arg in node.args.kwonlyargs:
                param_names.add(arg.arg)

            # Check if body references sample_facility or sample_organization
            body_source = ast.get_source_segment(content, node)
            if body_source is None:
                continue

            needs = []
            if "sample_facility" in body_source and "sample_facility" not in param_names:
                # Make sure it's actually used as a name, not just in a string
                for child in ast.walk(node):
                    if isinstance(child, ast.Name) and child.id == "sample_facility":
                        needs.append("sample_facility")
                        break

            if "sample_organization" in body_source and "sample_organization" not in param_names:
                for child in ast.walk(node):
                    if isinstance(child, ast.Name) and child.id == "sample_organization":
                        needs.append("sample_organization")
                        break

            if needs:
                issues.append(
                    {
                        "name": node.name,
                        "lineno": node.lineno,
                        "end_lineno": node.end_lineno,
                        "needs": needs,
                        "has_defaults": bool(node.args.defaults),
                    }
                )

    return issues


def fix_function_params(filepath: str) -> int:
    """Add missing params to functions in the file. Returns count of fixes."""
    issues = find_functions_needing_params(filepath)
    if not issues:
        return 0

    with open(filepath) as f:
        lines = f.readlines()

    fixes = 0
    # Process in reverse order to preserve line numbers
    for issue in reversed(issues):
        func_line_idx = issue["lineno"] - 1
        func_line = lines[func_line_idx]

        # Find the complete function signature (may span multiple lines)
        sig_lines = [func_line_idx]
        sig_text = func_line

        # Check if signature is complete (has ):)
        if "):" not in sig_text:
            # Multi-line signature - find the ): line
            j = func_line_idx + 1
            while j < len(lines) and "):" not in lines[j]:
                sig_lines.append(j)
                sig_text += lines[j]
                j += 1
            if j < len(lines):
                sig_lines.append(j)
                sig_text += lines[j]

        # Now add the missing params
        params_to_add = issue["needs"]

        if len(sig_lines) == 1:
            # Single-line signature: def func(a, b, c):
            line = lines[func_line_idx]
            close_idx = line.rindex("):")
            before = line[:close_idx].rstrip()
            after = line[close_idx:]

            # Check if we need to handle default params
            if before.endswith("("):
                new_params = ", ".join(params_to_add)
            else:
                new_params = ", " + ", ".join(params_to_add)

            lines[func_line_idx] = before + new_params + after
            fixes += 1
        else:
            # Multi-line signature: add params before the closing ):
            close_line_idx = sig_lines[-1]
            close_line = lines[close_line_idx]

            # Get indentation from existing params
            if len(sig_lines) > 1:
                param_line = lines[sig_lines[1]]
                indent = len(param_line) - len(param_line.lstrip())
            else:
                indent = 4

            # Insert new param lines before the closing ):
            new_param_lines = []
            for param in params_to_add:
                new_param_lines.append(" " * indent + param + ",\n")

            # Ensure previous line has trailing comma
            prev_idx = close_line_idx - 1
            prev_line = lines[prev_idx].rstrip()
            if prev_line and not prev_line.endswith(",") and not prev_line.endswith("("):
                lines[prev_idx] = prev_line + ",\n"

            # Insert before close line
            for nl in reversed(new_param_lines):
                lines.insert(close_line_idx, nl)
            fixes += 1

    if fixes:
        with open(filepath, "w") as f:
            f.writelines(lines)

    return fixes


if __name__ == "__main__":
    total_fixes = 0
    for root, dirs, files in os.walk("tests"):
        for fn in files:
            if fn.endswith(".py") and fn.startswith("test_"):
                fp = os.path.join(root, fn)
                fixes = fix_function_params(fp)
                if fixes:
                    total_fixes += fixes
                    print(f"  Fixed {fixes} function(s) in {fp}")

    print(f"\nTotal: {total_fixes} functions fixed")

    # Verify no syntax errors introduced
    errors = 0
    for root, dirs, files in os.walk("tests"):
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
