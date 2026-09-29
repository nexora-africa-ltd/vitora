# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""Inspect persisted spreadsheet results and optionally compare planning defaults.

Run: python3 docs/finance/verify_workbook.py WORKBOOK.xlsx [--compare-defaults]
Inputs: an XLSX file, including copies recalculated by Excel or LibreOffice.
No environment variables; the workbook is read without modification.
"""

import argparse
import json
import math
import posixpath
import zipfile
from xml.etree import ElementTree as ET

from build_model import build_model, col


def inspect_workbook(path, compare_defaults=False):
    ns = {"s": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
    relation_ns = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"
    values = {}
    errors = []
    formulas = 0
    missing_caches = []
    with zipfile.ZipFile(path) as archive:
        workbook = ET.fromstring(archive.read("xl/workbook.xml"))
        relationships = ET.fromstring(archive.read("xl/_rels/workbook.xml.rels"))
        targets = {item.get("Id"): item.get("Target") for item in relationships}
        for sheet in workbook.findall("s:sheets/s:sheet", ns):
            target = targets[sheet.get(f"{{{relation_ns}}}id")]
            target = target.lstrip("/") if target.startswith("/") else posixpath.normpath("xl/" + target)
            root = ET.fromstring(archive.read(target))
            for cell in root.findall(".//s:sheetData/s:row/s:c", ns):
                key = (sheet.get("name"), cell.get("r"))
                value = cell.find("s:v", ns)
                formula = cell.find("s:f", ns)
                if formula is not None:
                    formulas += 1
                    if value is None or value.text is None:
                        missing_caches.append(key)
                if cell.get("t") == "e":
                    errors.append({"cell": key, "error": value.text if value is not None else None})
                elif value is not None and cell.get("t") not in ("s", "str", "inlineStr", "d"):
                    values[key] = float(value.text) if value.text else 0

    mismatches = []
    if compare_defaults:
        model = build_model()
        for sheet, cells in model.sheets.items():
            for (row, column), cell in cells.items():
                if isinstance(cell.value, (int, float)) or (isinstance(cell.value, str) and cell.value.startswith("=")):
                    key = (sheet, f"{col(column)}{row}")
                    expected = model.get(sheet, row, column)
                    actual = values.get(key)
                    if actual is None or not math.isclose(actual, expected, rel_tol=1e-8, abs_tol=1e-6):
                        mismatches.append({"cell": key, "expected": expected, "actual": actual})
    checkpoints = [("Inputs", "B7"), ("Budget", "B13"), ("Five Year", "C5"),
                   ("Five Year", "G5"), ("Sensitivity", "C7")]
    checkpoints += [("Five Year", f"{column}{row}") for row in (25, 30, 33)
                    for column in "CDEFG"]
    result = {
        "path": str(path), "formula_count": formulas,
        "numeric_cells": len(values), "nonzero_numeric_cells": sum(v != 0 for v in values.values()),
        "checkpoints": {f"{s}!{a}": values.get((s, a)) for s, a in checkpoints},
        "errors": errors[:20], "error_count": len(errors),
        "missing_formula_cache_count": len(missing_caches),
        "default_mismatch_count": len(mismatches), "default_mismatches": mismatches[:20],
    }
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("workbook")
    parser.add_argument("--compare-defaults", action="store_true")
    args = parser.parse_args()
    result = inspect_workbook(args.workbook, args.compare_defaults)
    print(json.dumps(result, indent=2))
    if result["error_count"] or result["missing_formula_cache_count"] or result["default_mismatch_count"]:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
