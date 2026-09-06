# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""
Create a Google Sheets-compatible financial scenario workbook for Vitora and TibaBot.

Run: python3 scripts/create_financial_scenario_workbook.py
Output: docs/vitora-financial-scenarios.xlsx
Inputs: No CLI arguments. Edit the workbook's Inputs tab after uploading it to Google Sheets.
"""

from __future__ import annotations

from pathlib import Path
from xml.sax.saxutils import escape
from zipfile import ZIP_DEFLATED, ZipFile


OUTPUT_PATH = Path(__file__).resolve().parents[1] / "docs" / "vitora-financial-scenarios.xlsx"
YEARS = ["Y1", "Y2", "Y3", "Y4", "Y5"]


def column_name(index: int) -> str:
    """Return an Excel column name for a one-based index."""
    result = ""
    while index:
        index, remainder = divmod(index - 1, 26)
        result = chr(65 + remainder) + result
    return result


def cell(reference: str, value: object, style: int = 0, formula: bool = False) -> str:
    """Render one worksheet cell using inline strings, numeric values, or formulas."""
    style_attr = f' s="{style}"' if style else ""
    if formula:
        return f'<c r="{reference}"{style_attr}><f>{escape(str(value).removeprefix("="))}</f></c>'
    if isinstance(value, str):
        return f'<c r="{reference}" t="inlineStr"{style_attr}><is><t>{escape(value)}</t></is></c>'
    return f'<c r="{reference}"{style_attr}><v>{value}</v></c>'


def row(index: int, values: list[tuple[object, int, bool]]) -> str:
    """Render a row from value, style, and formula tuples."""
    cells = "".join(
        cell(f"{column_name(column)}{index}", value, style, formula)
        for column, (value, style, formula) in enumerate(values, start=1)
    )
    return f'<row r="{index}">{cells}</row>'


def worksheet(rows: list[str], widths: list[tuple[int, int, int]]) -> str:
    """Render worksheet XML with configured column widths."""
    column_xml = "".join(
        f'<col min="{start}" max="{end}" width="{width}" customWidth="1"/>'
        for start, end, width in widths
    )
    return (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
        f'<cols>{column_xml}</cols><sheetData>{"".join(rows)}</sheetData>'
        '</worksheet>'
    )


def build_workbook() -> dict[str, str]:
    """Build the workbook XML parts using the reconciled multi-tenant base case."""
    instructions = [
        row(1, [("Vitora Financial Scenario Model", 1, False)]),
        row(3, [("How to use", 1, False)]),
        row(4, [("1. Change blue input cells in the Inputs tab to test scenarios.", 0, False)]),
        row(5, [("2. Review customer growth, costs, P&L, and funding headroom in the other tabs.", 0, False)]),
        row(6, [("3. Clinics and hospitals are shared tenants; only enterprise customers use dedicated environments.", 0, False)]),
        row(7, [("4. This is an annual planning model. Add a monthly collections and working-capital model before fundraising decisions.", 0, False)]),
    ]

    inputs = [row(1, [("Scenario Inputs", 1, False)]), row(2, [("Input", 2, False), *[(year, 2, False) for year in YEARS]])]
    input_rows = [
        ("Scenario revenue multiplier", [1, 1, 1, 1, 1]),
        ("Scenario cost multiplier", [1, 1, 1, 1, 1]),
        ("Scenario new-customer multiplier", [1, 1, 1, 1, 1]),
        ("Total FTE", [6, 11, 19, 26, 33]),
        ("All-in FTE cost per month (KES)", [100000, 100000, 100000, 100000, 100000]),
        ("Shared cloud baseline per month (KES)", [80000, 80000, 80000, 80000, 80000]),
        ("Shared tenant cloud per month (KES)", [100, 100, 100, 100, 100]),
        ("Enterprise cloud per month (KES)", [10000, 10000, 10000, 10000, 10000]),
        ("Clinic variable CAC (KES)", [45000, 45000, 45000, 45000, 45000]),
        ("Hospital variable CAC (KES)", [130000, 130000, 130000, 130000, 130000]),
        ("Enterprise variable CAC (KES)", [260000, 260000, 260000, 260000, 260000]),
        ("Clinic onboarding (KES)", [5000, 5000, 5000, 5000, 5000]),
        ("Hospital onboarding (KES)", [15000, 15000, 15000, 15000, 15000]),
        ("Enterprise dedicated deployment (KES)", [120000, 120000, 120000, 120000, 120000]),
        ("Shared release and enablement reserve (KES)", [500000, 600000, 800000, 1200000, 1600000]),
        ("Office and G&A (KES)", [1200000, 1500000, 2400000, 3600000, 4800000]),
        ("Legal, compliance, and governance (KES)", [600000, 900000, 1200000, 1800000, 2400000]),
        ("TibaBot delivery reserve (KES)", [0, 600000, 1200000, 2400000, 4000000]),
        ("Sales and marketing spend (KES)", [1200000, 3000000, 6300000, 9600000, 13200000]),
        ("Funding tranche (KES)", [32500000, 32500000, 32500000, 32500000, 32500000]),
        ("KES per US dollar", [130, 130, 130, 130, 130]),
    ]
    for row_index, (label, values) in enumerate(input_rows, start=3):
        inputs.append(row(row_index, [(label, 0, False), *[(value, 3, False) for value in values]]))

    customers = [row(1, [("Customer Growth and Revenue", 1, False)]), row(2, [("Metric", 2, False), *[(year, 2, False) for year in YEARS]])]
    customer_rows = [
        ("New clinics", [15, 55, 120, 180, 234]),
        ("New hospitals", [3, 14, 40, 48, 60]),
        ("New enterprise", [0, 3, 6, 9, 12]),
        ("Churned customers", [3, 9, 19, 24, 29]),
        ("Ending clinics", [12, 58, 160, 320, 525]),
        ("Ending hospitals", [3, 17, 56, 100, 160]),
        ("Ending enterprise", [0, 3, 9, 18, 30]),
        ("Total active customers", [15, 78, 225, 438, 715]),
        ("Clinic MRR incl. expected add-ons (KES)", [14124] * 5),
        ("Hospital MRR incl. expected add-ons (KES)", [55124] * 5),
        ("Enterprise MRR incl. expected add-ons (KES)", [85125] * 5),
    ]
    addon_bases = {
        "Clinic MRR incl. expected add-ons (KES)": 8999,
        "Hospital MRR incl. expected add-ons (KES)": 49999,
        "Enterprise MRR incl. expected add-ons (KES)": 80000,
    }
    for row_index, (label, values) in enumerate(customer_rows, start=3):
        if label in addon_bases:
            customers.append(
                row(
                    row_index,
                    [(label, 0, False), *[(f"{addon_bases[label]}+'Add-ons'!$B$8", 3, True) for _ in YEARS]],
                )
            )
        else:
            customers.append(row(row_index, [(label, 0, False), *[(value, 3, False) for value in values]]))
    customers.extend([
        row(15, [("Average clinics", 0, False), ("=B7/2", 0, True), *[(f"=({column_name(col - 1)}7+{column_name(col)}7)/2", 0, True) for col in range(3, 7)]]),
        row(16, [("Average hospitals", 0, False), ("=B8/2", 0, True), *[(f"=({column_name(col - 1)}8+{column_name(col)}8)/2", 0, True) for col in range(3, 7)]]),
        row(17, [("Average enterprise", 0, False), ("=B9/2", 0, True), *[(f"=({column_name(col - 1)}9+{column_name(col)}9)/2", 0, True) for col in range(3, 7)]]),
        row(18, [("Annual revenue (KES)", 2, False), *[(f"(({column_name(col)}15*{column_name(col)}11*12)+({column_name(col)}16*{column_name(col)}12*12)+({column_name(col)}17*{column_name(col)}13*12))*Inputs!{column_name(col)}3", 2, True) for col in range(2, 7)]]),
    ])

    costs = [row(1, [("Driver-Based Costs", 1, False)]), row(2, [("Cost Category", 2, False), *[(year, 2, False) for year in YEARS]])]
    cost_formulas = [
        ("Product, commercial, and G&A payroll (KES)", "(Inputs!{c}6-{support})*Inputs!{c}7*12"),
        ("Support payroll in delivery COGS (KES)", "{support}*Inputs!{c}7*12"),
        ("Shared cloud platform (KES)", "Inputs!{c}8*12+((Customers!{c}15+Customers!{c}16)*Inputs!{c}9*12)"),
        ("Enterprise cloud environments (KES)", "Customers!{c}17*Inputs!{c}10*12"),
        ("Sales and marketing spend (KES)", "Inputs!{c}21"),
        ("Shared tenant onboarding (KES)", "Customers!{c}3*Inputs!{c}14+Customers!{c}4*Inputs!{c}15"),
        ("Enterprise deployment (KES)", "Customers!{c}5*Inputs!{c}16"),
        ("Shared release and enablement (KES)", "Inputs!{c}17"),
        ("Office and G&A (KES)", "Inputs!{c}18"),
        ("Legal, compliance, and governance (KES)", "Inputs!{c}19"),
        ("TibaBot delivery reserve (KES)", "Inputs!{c}20"),
    ]
    support_fte = [1, 2, 3, 5, 7]
    for row_index, (label, template) in enumerate(cost_formulas, start=3):
        formulas = []
        for column in range(2, 7):
            formulas.append((template.format(c=column_name(column), support=support_fte[column - 2]), 0, True))
        costs.append(row(row_index, [(label, 0, False), *formulas]))
    costs.extend([
        row(14, [("Total operating costs (KES)", 2, False), *[(f"SUM({column_name(col)}3:{column_name(col)}13)*Inputs!{column_name(col)}4", 2, True) for col in range(2, 7)]]),
        row(15, [("Delivery COGS (KES)", 2, False), *[(f"SUM({column_name(col)}4:{column_name(col)}6,{column_name(col)}8:{column_name(col)}10,{column_name(col)}13)*Inputs!{column_name(col)}4", 2, True) for col in range(2, 7)]]),
    ])

    pnl = [row(1, [("Profit and Loss", 1, False)]), row(2, [("Metric", 2, False), *[(year, 2, False) for year in YEARS]])]
    pnl_rows = [
        ("Revenue (KES)", "Customers!{c}18"),
        ("Delivery COGS (KES)", "Costs!{c}15"),
        ("Gross profit (KES)", "{c}3-{c}4"),
        ("Gross margin", "IFERROR({c}5/{c}3,0)"),
        ("Operating costs (KES)", "Costs!{c}14"),
        ("EBITDA (KES)", "{c}3-{c}7"),
        ("Cumulative operating result (KES)", "{c}8"),
        ("Funding headroom (KES)", "Inputs!{c}22+MIN($B$9:{c}9)"),
    ]
    for row_index, (label, template) in enumerate(pnl_rows, start=3):
        formulas = []
        for column in range(2, 7):
            col = column_name(column)
            prior = column_name(column - 1)
            formula = template.format(c=col)
            if row_index == 9 and column > 2:
                formula = f"{prior}9+{col}8"
            formulas.append((formula, 2 if row_index in {5, 8, 9, 10} else 0, True))
        pnl.append(row(row_index, [(label, 2 if row_index in {5, 8, 9, 10} else 0, False), *formulas]))

    dashboard = [
        row(1, [("Scenario Dashboard", 1, False)]),
        row(3, [("Metric", 2, False), ("Base scenario output", 2, False)]),
        row(4, [("Peak operating deficit (KES)", 0, False), ("=-MIN('Profit and Loss'!B9:F9)", 2, True)]),
        row(5, [("Peak operating deficit (USD)", 0, False), ("=B4/Inputs!B23", 2, True)]),
        row(6, [("Funding tranche (KES)", 0, False), ("=Inputs!B22", 2, True)]),
        row(7, [("Annual-model headroom (KES)", 0, False), ("=B6-B4", 2, True)]),
        row(8, [("First positive EBITDA year", 0, False), ("=IF('Profit and Loss'!B8>0,\"Y1\",IF('Profit and Loss'!C8>0,\"Y2\",IF('Profit and Loss'!D8>0,\"Y3\",IF('Profit and Loss'!E8>0,\"Y4\",\"Y5\"))))", 2, True)]),
        row(9, [("Year 5 EBITDA (KES)", 0, False), ("='Profit and Loss'!F8", 2, True)]),
        row(10, [("Year 5 active customers", 0, False), ("=Customers!F10", 2, True)]),
        row(12, [("Scenario controls", 1, False)]),
        row(13, [("Edit Inputs!B3:F5 to test revenue, cost, and customer-growth multipliers.", 0, False)]),
    ]

    addons = [
        row(1, [("Add-On Module Logic", 1, False)]),
        row(2, [("Module", 2, False), ("Monthly price (KES)", 2, False), ("Attach rate", 2, False), ("Expected MRR contribution (KES)", 2, False)]),
        row(3, [("TibaBot AI", 0, False), (5000, 3, False), (0.35, 3, False), ("=B3*C3", 2, True)]),
        row(4, [("Offline Sync", 0, False), (3000, 3, False), (0.45, 3, False), ("=B4*C4", 2, True)]),
        row(5, [("Advanced LIS", 0, False), (7000, 3, False), (0.20, 3, False), ("=B5*C5", 2, True)]),
        row(6, [("SMS & WhatsApp", 0, False), (2500, 3, False), ("=0.25", 3, True), ("=B6*C6", 2, True)]),
        row(8, [("Expected add-on MRR per customer (KES)", 1, False), ("=SUM(D3:D6)", 2, True)]),
        row(10, [("Use", 1, False)]),
        row(11, [("Update prices and attach rates to simulate add-on adoption. Customer MRR in the Customers tab updates automatically.", 0, False)]),
    ]

    return {
        "xl/worksheets/sheet1.xml": worksheet(instructions, [(1, 1, 100)]),
        "xl/worksheets/sheet2.xml": worksheet(inputs, [(1, 1, 48), (2, 6, 18)]),
        "xl/worksheets/sheet3.xml": worksheet(customers, [(1, 1, 48), (2, 6, 18)]),
        "xl/worksheets/sheet4.xml": worksheet(costs, [(1, 1, 48), (2, 6, 18)]),
        "xl/worksheets/sheet5.xml": worksheet(pnl, [(1, 1, 48), (2, 6, 18)]),
        "xl/worksheets/sheet6.xml": worksheet(dashboard, [(1, 1, 48), (2, 2, 30)]),
        "xl/worksheets/sheet7.xml": worksheet(addons, [(1, 1, 36), (2, 4, 26)]),
    }


def write_workbook() -> None:
    """Write a minimal OOXML workbook that imports into Google Sheets."""
    sheets = ["Instructions", "Inputs", "Customers", "Costs", "Profit and Loss", "Dashboard", "Add-ons"]
    rels = "".join(
        f'<Relationship Id="rId{index}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet{index}.xml"/>'
        for index in range(1, 8)
    )
    workbook_sheets = "".join(
        f'<sheet name="{escape(name)}" sheetId="{index}" r:id="rId{index}"/>'
        for index, name in enumerate(sheets, start=1)
    )
    styles = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
        '<fonts count="2"><font><sz val="11"/><name val="Aptos"/></font><font><b/><sz val="11"/><name val="Aptos"/></font></fonts>'
        '<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>'
        '<borders count="1"><border/></borders><cellStyleXfs count="1"><xf/></cellStyleXfs>'
        '<cellXfs count="4"><xf xfId="0"/><xf xfId="0" fontId="1" applyFont="1"/><xf xfId="0" fontId="1" applyFont="1"/><xf xfId="0"/></cellXfs>'
        '</styleSheet>'
    )
    content_types = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
        '<Default Extension="xml" ContentType="application/xml"/>'
        '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
        '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>'
        + "".join(
            f'<Override PartName="/xl/worksheets/sheet{index}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'
            for index in range(1, 8)
        )
        + '</Types>'
    )
    root_rels = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>'
        '</Relationships>'
    )
    workbook = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" '
        'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
        f'<sheets>{workbook_sheets}</sheets></workbook>'
    )
    workbook_rels = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
        f'{rels}<Relationship Id="rId8" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>'
        '</Relationships>'
    )
    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    with ZipFile(OUTPUT_PATH, "w", ZIP_DEFLATED) as archive:
        archive.writestr("[Content_Types].xml", content_types)
        archive.writestr("_rels/.rels", root_rels)
        archive.writestr("xl/workbook.xml", workbook)
        archive.writestr("xl/_rels/workbook.xml.rels", workbook_rels)
        archive.writestr("xl/styles.xml", styles)
        for path, content in build_workbook().items():
            archive.writestr(path, content)


if __name__ == "__main__":
    write_workbook()
    print(OUTPUT_PATH)
