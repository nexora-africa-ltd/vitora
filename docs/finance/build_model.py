# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""Build Nexora's editable, formula-driven US$750,000 financial workbook.

Run from repository root: python3 docs/finance/build_model.py
Args: --output PATH (default docs/nexora-750000-financial-model.xlsx),
--values-output PATH (optional preview-only copy), --summary.
Requires XlsxWriter; no environment variables. The internal formula evaluator
supplies validated cached results so the workbook is readable before Excel opens.
Regeneration restores planning defaults; save edited workbooks separately.
"""

from __future__ import annotations

import argparse
import ast
import calendar
import datetime as dt
import json
import math
import operator
import re
from dataclasses import dataclass
from pathlib import Path

import xlsxwriter
from xlsxwriter.utility import xl_col_to_name


def col(number):
    return xl_col_to_name(number - 1)


def ref(sheet, row, column=2):
    return f"'{sheet}'!{col(column)}{row}"


def excel_date(date):
    return (date - dt.date(1899, 12, 30)).days


def edate(serial, months):
    date = dt.date(1899, 12, 30) + dt.timedelta(days=int(serial))
    year, month = divmod(date.year * 12 + date.month - 1 + int(months), 12)
    return excel_date(dt.date(year, month + 1, min(date.day, calendar.monthrange(year, month + 1)[1])))


@dataclass
class Cell:
    value: object
    editable: bool = False
    style: str = "number"
    note: str = ""


class Model:
    """Cell graph with a restricted evaluator for the formulas emitted here."""

    reference = re.compile(r"(?:(?:'([^']+)')!)?(\$?[A-Z]{1,3}\$?\d+)(?::(\$?[A-Z]{1,3}\$?\d+))?")
    operators = {
        ast.Add: operator.add, ast.Sub: operator.sub, ast.Mult: operator.mul,
        ast.Div: operator.truediv, ast.Pow: operator.pow, ast.Eq: operator.eq,
        ast.NotEq: operator.ne, ast.Lt: operator.lt, ast.LtE: operator.le,
        ast.Gt: operator.gt, ast.GtE: operator.ge,
    }

    def __init__(self):
        self.sheets = {}
        self.cache = {}
        self.visiting = set()
        self.parsed = {}

    def put(self, sheet, row, column, value, editable=False, style="number", note=""):
        self.sheets.setdefault(sheet, {})[(row, column)] = Cell(value, editable, style, note)
        self.cache.clear()

    def text(self, sheet, row, column, value, style="text"):
        self.put(sheet, row, column, value, style=style)

    @staticmethod
    def address(address):
        letters, row = re.fullmatch(r"([A-Z]+)(\d+)", address.replace("$", "")).groups()
        column = 0
        for letter in letters:
            column = column * 26 + ord(letter) - 64
        return int(row), column

    def get(self, sheet, row, column=2):
        key = (sheet, row, column)
        if key in self.cache:
            return self.cache[key]
        cell = self.sheets[sheet].get((row, column))
        if cell is None:
            return 0
        value = cell.value
        if isinstance(value, str) and value.startswith("="):
            if key in self.visiting:
                raise ValueError(f"Circular formula: {key}")
            self.visiting.add(key)
            try:
                value = self.evaluate(value[1:], sheet)
            finally:
                self.visiting.remove(key)
        if isinstance(value, (int, float)) and not math.isfinite(value):
            raise ValueError(f"Nonfinite result: {key}")
        self.cache[key] = value
        return value

    def evaluate(self, expression, sheet):
        parse_key = (sheet, expression)
        if parse_key not in self.parsed:
            def substitute(match):
                target = match[1] or sheet
                if match[3]:
                    return f"RANGE({target!r},{match[2]!r},{match[3]!r})"
                return f"CELL({target!r},{match[2]!r})"
            translated = self.reference.sub(substitute, expression)
            translated = translated.replace("^", "**").replace("<>", "!=")
            translated = re.sub(r"(?<![<>=!])=(?!=)", "==", translated)
            self.parsed[parse_key] = ast.parse(translated, mode="eval").body

        def flatten(values):
            for item in values:
                if isinstance(item, list):
                    yield from flatten(item)
                else:
                    yield item

        def visit(node):
            if isinstance(node, ast.Constant):
                return node.value
            if isinstance(node, ast.BinOp) and type(node.op) in self.operators:
                return self.operators[type(node.op)](visit(node.left), visit(node.right))
            if isinstance(node, ast.UnaryOp) and isinstance(node.op, (ast.USub, ast.UAdd)):
                return -visit(node.operand) if isinstance(node.op, ast.USub) else visit(node.operand)
            if isinstance(node, ast.Compare) and len(node.ops) == 1:
                return self.operators[type(node.ops[0])](visit(node.left), visit(node.comparators[0]))
            if isinstance(node, ast.Call) and isinstance(node.func, ast.Name):
                name = node.func.id
                if name == "IF":
                    return visit(node.args[1] if visit(node.args[0]) else node.args[2])
                args = [visit(arg) for arg in node.args]
                if name == "CELL":
                    return self.get(args[0], *self.address(args[1]))
                if name == "RANGE":
                    r1, c1 = self.address(args[1])
                    r2, c2 = self.address(args[2])
                    return [self.get(args[0], r, c) for r in range(r1, r2 + 1) for c in range(c1, c2 + 1)]
                functions = {"SUM": lambda *v: sum(flatten(v)), "MIN": lambda *v: min(flatten(v)),
                             "MAX": lambda *v: max(flatten(v)), "ABS": abs, "EDATE": edate}
                if name in functions:
                    return functions[name](*args)
            raise ValueError(f"Unsupported formula node: {ast.dump(node)}")
        return visit(self.parsed[parse_key])


INPUT_SPEC = [
    ("start", "Forecast start date", excel_date(dt.date(2027, 1, 1)), "date", "Placeholder funding/start date; planning years are successive 12-month periods, not historic actuals."),
    ("fx", "KES per USD", 130, "number", "Original supplied conversion basis; fixed planning FX, not a current market quotation."),
    ("raise", "Primary financing proceeds, USD", 750000, "money", "Proposed raise; edit Funding sheet for closing month and subsequent financing."),
    ("opening_cash", "Opening unrestricted cash, USD", 0, "money", "Unconfirmed placeholder; excludes new financing. Replace with reconciled bank balances."),
    ("reserve", "Protected reserve, USD", 65000, "money", "Cash earmark, not expenditure. Funding sheet authorisations release protection only."),
    ("opening_clinics", "Opening paying clinics", 0, "number", "Unconfirmed placeholder, not a statement of current traction."),
    ("opening_hospitals", "Opening paying hospitals", 0, "number", "Unconfirmed placeholder."),
    ("opening_enterprises", "Opening paying enterprises", 0, "number", "Unconfirmed placeholder."),
    ("conversion", "Pilot-to-paid conversion", .55, "percent", "Original supplied assumption. Pipeline volumes are sized at a fixed reference conversion of 55%."),
    ("churn", "Monthly churn of opening customers", .01, "percent", "New illustrative replacement for unallocated annual churn counts; no extra aggregate churn deduction."),
    ("collection_lag", "Customer collection lag, months (0–3)", 1, "integer", "Illustrative timing; applies to gross invoices. Changes cash and receivables, not earned revenue."),
    ("collectability", "Share of invoices collected", 1, "percent", "Uncollected share is expensed and written off in invoice month; no unsupported permanent receivable buildup."),
    ("provider_lag", "Provider settlement lag, months (0–3)", 0, "integer", "Illustrative. Provider dues are owed independently of customer collection."),
    ("mpesa_mix", "M-Pesa collection share", .60, "percent", "Original supplied mix; bank share is the balance."),
    ("mpesa_fee", "M-Pesa effective fee", .015, "percent", "Illustrative effective merchant fee; replace with agreement."),
    ("bank_fee", "Bank effective fee", .005, "percent", "Illustrative effective fee; replace with banking charges."),
    ("vat", "VAT on SaaS and setup invoices", 0, "percent", "UNCONFIRMED tax treatment. Zero is a modelling placeholder, not an exemption claim. Remitted in invoice month; services excluded pending review."),
    ("income_tax", "Illustrative corporate income-tax rate", .30, "percent", "Simplified tax with forecast losses carried forward; paid in accrual month, no deferred tax or statutory instalment schedule."),
    ("opening_tax_loss", "Opening available tax losses, USD", 0, "money", "Unconfirmed; no expiry or utilisation limits modelled."),
    ("asset_life", "New equipment life, months", 36, "integer", "Straight-line depreciation; no opening assets, salvage, disposal or development capitalisation assumed."),
    ("inflation", "Annual recurring-cost escalation after month 18", .05, "percent", "Illustrative; fixed 18-month procurement budgets do not inflate in the base case."),
    ("cloud_base", "Baseline cloud, KES/month", 80000, "money", "Original driver; replaces a duplicate flat cloud expense."),
    ("cloud_tenant", "Shared cloud, KES/customer/month", 100, "money", "Original driver for clinics and hospitals."),
    ("cloud_enterprise", "Dedicated enterprise cloud, KES/month", 10000, "money", "Original driver; enterprise environments only."),
    ("office", "Office/admin, KES/month", 100000, "money", "Original hybrid-operation assumption; equipment purchase is separate capex."),
    ("ai_facility", "Variable AI cost, KES/AI-attached facility/month", 500, "money", "New placeholder; validate against measured token/audio usage."),
    ("ai_consult", "Variable AI cost, KES/consultation", 20, "money", "New illustrative usage cost; baseline production capacity is separately scheduled."),
    ("tele_launch", "Vitora telemedicine launch month", 7, "integer", "Provisional launch subject to readiness and clinical capacity."),
    ("tele_price", "Patient consultation price, KES", 1200, "money", "New commercial hypothesis, not validated pricing."),
    ("tele_provider", "Clinician amount per consultation, KES", 900, "money", "New placeholder; requires clinical-provider agreement."),
    ("tele_gross", "Telemedicine gross principal presentation (1), net agent (0)", 0, "integer", "Accounting decision pending contract review. Cash receipts/payouts remain gross under both presentations."),
    ("slots", "Consultations per clinician/month capacity", 60, "number", "New capacity hypothesis; volume is capped by available clinicians."),
    ("care_launch", "Continuous-care launch month", 10, "integer", "One pilot programme."),
    ("care_price", "Monthly care fee per member, KES", 1500, "money", "New pilot pricing hypothesis; gross service presentation."),
    ("care_provider", "Monthly clinical delivery per member, KES", 800, "money", "Variable clinical service cost; distinct from programme coordinator payroll."),
    ("approved", "Management input review complete (0/1)", 0, "integer", "Leave zero until opening balances, prices, tax, salaries, data quotes and scenarios have been reviewed."),
]
INPUT = {item[0]: i + 5 for i, item in enumerate(INPUT_SPEC)}

METRICS = [
    "new_clinics", "new_hospitals", "new_enterprises", "opening_clinics", "opening_hospitals", "opening_enterprises",
    "churn_clinics", "churn_hospitals", "churn_enterprises", "closing_clinics", "closing_hospitals", "closing_enterprises",
    "avg_clinics", "avg_hospitals", "avg_enterprises", "active", "pilots",
    "clinic_revenue", "hospital_revenue", "enterprise_revenue", "base_revenue", "addon_revenue", "setup_revenue",
    "consultations", "tele_billings", "tele_provider", "tele_revenue", "care_members", "care_billings", "care_provider",
    "revenue", "exit_mrr", "exit_arr", "vat_invoices", "gross_billings", "bad_debt", "collections",
    "cloud", "ai_cost", "payment_fees", "onboarding", "acquisition", "provider_expense", "delivery_payroll", "cogs", "gross_profit",
    "rd_payroll", "commercial_payroll", "ga_payroll", "payroll", "nonstaff_rd", "nonstaff_other", "office", "opex", "ebitda",
    "capex", "depreciation", "ebit", "tax_loss_open", "taxable", "tax", "tax_loss_close", "net_income",
    "opening_ar", "closing_ar", "provider_accrual", "provider_paid", "opening_ap", "closing_ap",
    "financing", "opening_cash", "operating_cash", "closing_cash", "protected_reserve", "available_cash", "exceptional_spend",
    "cash_check", "ar_check", "ap_check", "cohort_check",
    "foundation_spend", "transcription_spend", "ai_spend", "wound_spend", "revenue_spend", "care_spend", "validation_spend",
    "total_programme_spend", "headcount", "cash_shortfall", "reserve_shortfall",
]
ROW = {name: index + 5 for index, name in enumerate(METRICS)}
PROGRAMMES = ["Foundation", "Transcription", "Clinical AI", "Wound / imaging", "Revenue / referrals", "Continuous care", "Validation", "Reserve"]
ENVELOPES = [250000, 120000, 70000, 60000, 85000, 45000, 55000, 65000]

# Role, programme, P&L function, FTE, loaded USD/month, start, end,
# retained share after month 18. All costs are planning assumptions, not offers.
STAFF = [
    ("Core engineer", 1, "R&D", 2, 1400, 1, 60, 1),
    ("Product/design", 1, "R&D", .5, 1800, 1, 60, 1),
    ("Sales / business development", 1, "Commercial", 1, 1000, 1, 60, 1),
    ("Implementation / customer support", 1, "Delivery", 1, 900, 1, 60, 1),
    ("Finance / administration", 1, "G&A", .5, 1000, 1, 60, 1),
    ("Speech ML engineer", 2, "R&D", 1, 2000, 4, 60, .5),
    ("Speech annotation coordinator", 2, "R&D", .5, 1000, 4, 18, 0),
    ("Clinical-AI engineer", 3, "R&D", 1, 2100, 4, 60, 1),
    ("Wound ML specialist", 4, "R&D", .5, 2200, 7, 18, 0),
    ("Revenue / referral engineer", 5, "R&D", 1, 1800, 4, 60, 1),
    ("Referral implementation specialist", 5, "Delivery", .5, 1200, 7, 18, 0),
    ("Care coordinator", 6, "Delivery", .5, 1200, 9, 60, 1),
    ("Care product integration", 6, "R&D", .25, 2000, 9, 18, 0),
]

# Description, programme, classification, reserved column, total OR monthly USD,
# first month, last month, monthly flag. Fixed amounts spread evenly over window.
COSTS = [
    ("Staff laptops / shared equipment (quote pending)", 1, "Capex", "", 9000, 1, 1, 0),
    ("Office setup / connectivity installation", 1, "Other", "", 2000, 1, 2, 0),
    ("Core security and release tooling", 1, "Other", "", 5000, 1, 18, 0),
    ("Targeted marketing and sales materials", 1, "Other", "", 6000, 1, 18, 0),
    ("Payer / professional / clinical partnerships", 1, "Other", "", 20000, 1, 18, 0),
    ("Core legal and privacy", 1, "Other", "", 5000, 1, 18, 0),
    ("Scoped strategic advice", 1, "Other", "", 13000, 1, 18, 0),
    ("Regional discovery / travel", 1, "Other", "", 8000, 4, 18, 0),
    ("Baseline usability and workflow evaluation", 1, "R&D", "", 10000, 4, 18, 0),
    ("Training and clinical network onboarding", 1, "Other", "", 6000, 3, 18, 0),
    ("Speech data collection/licensing", 2, "R&D", "", 25000, 3, 12, 0),
    ("Speech annotation / clinical reviewers", 2, "R&D", "", 30000, 4, 15, 0),
    ("Speech rented GPU / experiment infrastructure", 2, "R&D", "", 15000, 4, 18, 0),
    ("Regional language benchmarks", 2, "R&D", "", 10000, 10, 18, 0),
    ("Clinical-AI integration contractors", 3, "R&D", "", 20000, 4, 15, 0),
    ("Clinical-AI content / domain review", 3, "R&D", "", 10000, 4, 18, 0),
    ("AI application tooling", 3, "R&D", "", 5000, 4, 18, 0),
    ("Wound data preparation", 4, "R&D", "", 10000, 5, 12, 0),
    ("Wound annotation / specialist review", 4, "R&D", "", 15000, 6, 15, 0),
    ("Wound rented GPU / technical evaluation", 4, "R&D", "", 5000, 7, 18, 0),
    ("One additional imaging feasibility task", 4, "R&D", "", 10000, 10, 18, 0),
    ("Wound pilot integration", 4, "R&D", "", 5000, 10, 18, 0),
    ("Revenue/referral interfaces and contractors", 5, "R&D", "", 25000, 4, 15, 0),
    ("Revenue/referral pilot enablement", 5, "Other", "", 10000, 7, 18, 0),
    ("Revenue/referral analysis and testing", 5, "R&D", "", 10000, 7, 18, 0),
    ("Care programme design", 6, "R&D", "", 10000, 7, 12, 0),
    ("Care enrolment and patient support", 6, "Other", "", 5000, 9, 18, 0),
    ("Independent clinical / workflow validation", 7, "R&D", "", 20000, 7, 18, 0),
    ("Incremental security / privacy reviews", 7, "Other", "", 15000, 4, 18, 0),
    ("Incremental production hosting / model capacity", 7, "Other", "", 12000, 4, 18, 0),
    ("Specialist deployment and recovery support", 7, "Other", "", 8000, 7, 18, 0),
    ("Ongoing legal / security assurance", 1, "Other", "", 500, 19, 60, 1),
    ("Ongoing marketing / partner management", 1, "Other", "", 800, 19, 60, 1),
    ("Ongoing data / model evaluation", 2, "R&D", "", 500, 19, 60, 1),
    ("Ongoing incremental production capacity", 7, "Other", "", 700, 19, 60, 1),
]


def title(model, sheet, heading, subtitle=""):
    model.text(sheet, 1, 1, heading, "title")
    model.text(sheet, 2, 1, subtitle, "subtitle")


def inputs(model):
    title(model, "Inputs", "Editable assumptions — USD reporting / KES commercial drivers",
          "Blue cells are editable. Defaults are illustrative unless marked supplied. Review status starts at zero.")
    for key, label, value, style, note in INPUT_SPEC:
        row = INPUT[key]
        model.text("Inputs", row, 1, label)
        model.put("Inputs", row, 2, value, True, style, note)
        model.text("Inputs", row, 3, note)

    title(model, "Pricing", "Facility pricing, acquisition and delivery drivers",
          "KES source assumptions reconstructed from the supplied model at FX 130. No annual discount. Setup price zero is editable.")
    headers = ["Segment", "KES/month", "Setup fee KES", "Variable CAC KES", "Onboard cost KES", "Kenya count (unverified)", "USD/month", "Base TAM USD/year"]
    for c, text in enumerate(headers, 1):
        model.text("Pricing", 4, c, text, "header")
    for row, values in enumerate([("Clinic", 9000, 0, 45000, 5000, 13000), ("Hospital", 50000, 0, 130000, 15000, 800), ("Enterprise buyer", 80000, 0, 260000, 120000, 50)], 5):
        for c, value in enumerate(values, 1):
            model.put("Pricing", row, c, value, c > 1, "text" if c == 1 else "number")
        model.put("Pricing", row, 7, f"=B{row}/{ref('Inputs', INPUT['fx'])}", style="money")
        model.put("Pricing", row, 8, f"=G{row}*12*F{row}", style="money")
    for c, text in enumerate(["Add-on", "KES/month", "Attach rate", "Expected USD/customer/month"], 1):
        model.text("Pricing", 9, c, text, "header")
    for row, values in enumerate([("TibaBot AI", 5000, .35), ("Offline sync", 3000, .45), ("Advanced LIS", 7000, .20), ("SMS / WhatsApp", 2500, .25)], 10):
        for c, value in enumerate(values, 1):
            model.put("Pricing", row, c, value, c > 1, "percent" if c == 3 else "number")
        model.put("Pricing", row, 4, f"=B{row}*C{row}/{ref('Inputs', INPUT['fx'])}", style="money")
    model.text("Pricing", 15, 1, "Expected add-on value (counted once)")
    model.put("Pricing", 15, 4, "=SUM(D10:D13)", style="money")
    model.text("Pricing", 17, 1, "Market counts are unverified; enterprise buyers may overlap facilities. Segment TAMs are not summed into a validated market size.")

    title(model, "Growth", "Pipeline and service-demand assumptions — planning years 1–5",
          "Original annual paid-win targets size pilots at 55% reference conversion. One-month pilot lag; expected customers may be fractional.")
    for c, text in enumerate(["Plan year", "Clinic wins at 55%", "Hospital wins at 55%", "Enterprise wins at 55%", "Consults/month at year end", "Care members at year end", "Available clinicians", "Post-M18 staff scale"], 1):
        model.text("Growth", 4, c, text, "header")
    plans = [(15, 3, 0, 40, 50, 2, 1), (55, 14, 3, 150, 150, 4, 1.05), (120, 40, 6, 350, 350, 8, 1.25), (180, 48, 9, 700, 600, 12, 1.6), (234, 60, 12, 1000, 900, 20, 2)]
    for row, values in enumerate(plans, 5):
        model.put("Growth", row, 1, row - 4)
        for c, value in enumerate(values, 2):
            model.put("Growth", row, c, value, True)
    model.text("Growth", 12, 1, "Consultation/member targets and staffing scales are new placeholders. Service volumes ramp within each year; consultations are capacity-capped.")

    title(model, "Scenarios", "Editable sensitivities — calculated concurrently",
          "Multipliers change activity and costs; they are not probabilities or promised outcomes. No automatic bridge funding or spending cuts.")
    for c, text in enumerate(["Scenario", "Pilot activity", "Conversion", "Add-on attach", "Cost factor", "Churn factor", "Extra collection months", "Service demand"], 1):
        model.text("Scenarios", 4, c, text, "header")
    for row, values in enumerate([("Base", 1, 1, 1, 1, 1, 0, 1), ("Downside", .6, .85, .8, 1.15, 1.5, 1, .7), ("Upside", 1.3, 1.05, 1.15, 1.05, .8, 0, 1.3)], 5):
        for c, value in enumerate(values, 1):
            model.put("Scenarios", row, c, value, c > 1)

    title(model, "Funding", "Financing, reserve authorisations and exceptional operating spend",
          "Release of protected cash is not income or expenditure. Enter actual exceptional costs separately. All values USD.")
    for row, label in [(5, "Financing proceeds"), (6, "Reserve authorisation"), (7, "Exceptional operating expense")]:
        model.text("Funding", row, 1, label)
    for month in range(1, 61):
        c = month + 2
        model.put("Funding", 4, c, f"=EDATE({ref('Inputs', INPUT['start'])},{month-1})", style="date")
        model.put("Funding", 5, c, f"={ref('Inputs', INPUT['raise'])}" if month == 1 else 0, True, "money")
        model.put("Funding", 6, c, 0, True, "money")
        model.put("Funding", 7, c, 0, True, "money")


def schedules(model):
    title(model, "Staff", "Loaded payroll schedule — included in programme budgets",
          "Edit FTE, monthly USD cost, start/end months and retained share. R&D is expensed. Classification/programme changes require regeneration.")
    headers = ["Role", "Programme", "P&L function", "FTE", "Loaded USD/month", "Start month", "End month", "Retained after M18", "Basis"]
    for c, label in enumerate(headers, 1):
        model.text("Staff", 4, c, label, "header")
    for row, data in enumerate(STAFF, 5):
        for c, value in enumerate(data, 1):
            model.put("Staff", row, c, value, c in (4, 5, 6, 7, 8))
        model.text("Staff", row, 9, "Illustrative loaded compensation; confirm tax, benefits, availability and hiring dates.")
        for month in range(1, 61):
            scale = "1" if month <= 18 else f"$H{row}*{ref('Growth', (month-1)//12+5, 8)}"
            formula = f"=IF({month}<$F{row},0,IF({month}>$G{row},0,$D{row}*$E{row}*({scale})))"
            model.put("Staff", row, month + 9, formula, style="money")
    title(model, "Costs", "Non-payroll and equipment schedule — USD",
          "Edit amount and start/end months. Flag 0 spreads a total; 1 is a monthly recurring amount. Capex is depreciated, not included in EBITDA.")
    headers = ["Description", "Programme", "Class", "", "USD total / monthly", "Start month", "End month", "Monthly flag", "Basis"]
    for c, label in enumerate(headers, 1):
        model.text("Costs", 4, c, label, "header")
    for row, data in enumerate(COSTS, 5):
        for c, value in enumerate(data, 1):
            model.put("Costs", row, c, value, c in (5, 6, 7, 8))
        model.text("Costs", row, 9, "Planning allowance; supplier scope/quote pending. Recurring costs after M18 escalate annually.")
        for month in range(1, 61):
            inflation = "1" if month <= 18 else f"(1+{ref('Inputs', INPUT['inflation'])})^{(month-1)//12}"
            formula = f"=IF({month}<$F{row},0,IF({month}>$G{row},0,IF($H{row}=1,$E{row}*({inflation}),$E{row}/MAX(1,$G{row}-$F{row}+1))))"
            model.put("Costs", row, month + 9, formula, style="money")
    for sheet in ["Staff", "Costs"]:
        for month in range(1, 61):
            model.put(sheet, 4, month + 9, f"=EDATE({ref('Inputs', INPUT['start'])},{month-1})", style="date")


def monthly(model, sheet, scenario_row):
    title(model, sheet, f"{sheet} — 60 linked months; first 18 months are the funding period",
          "USD. Costs are positive; profit/cash may be negative. Half-month recognition for new/churned facilities. No existing AR/AP assumed.")
    for name, row in ROW.items():
        model.text(sheet, row, 1, name.replace("_", " ").title())
    inp = lambda key: ref("Inputs", INPUT[key])
    scenario = lambda column: ref("Scenarios", scenario_row, column)
    for month in range(1, 61):
        c = month + 2
        model.put(sheet, 4, c, f"=EDATE({inp('start')},{month-1})", style="date")
        local = lambda key, m=month: f"{col(m+2)}{ROW[key]}"
        def put(name, expression):
            model.put(sheet, ROW[name], c, "=" + expression, style="money" if name not in ("active", "headcount", "consultations", "care_members", "pilots") and not any(name.startswith(p) for p in ["new_", "opening_cl", "opening_h", "opening_e", "closing_cl", "closing_h", "closing_e", "avg_", "churn_"]) else "number")
        def total(keys):
            return "+".join(local(key) for key in keys) or "0"
        def staff_sum(function=None, programme=None, fte=False):
            terms = []
            for row, data in enumerate(STAFF, 5):
                if (function is None or data[2] == function) and (programme is None or data[1] == programme):
                    term = ref("Staff", row, month + 9)
                    if fte:
                        term = f"IF({ref('Staff',row,5)}>0,{term}/{ref('Staff',row,5)},0)"
                    terms.append(term)
            return "(" + ("+".join(terms) or "0") + ")" + ("" if fte else "*" + scenario(5))
        def cost_sum(kind=None, programme=None):
            terms = [ref("Costs", row, month + 9) for row, data in enumerate(COSTS, 5)
                     if (kind is None or data[2] == kind) and (programme is None or data[1] == programme)]
            return "(" + ("+".join(terms) or "0") + ")*" + scenario(5)
        year_row = (month - 1) // 12 + 5
        within = (month - 1) % 12 + 1
        fx = inp("fx")
        for index, segment in enumerate(["clinics", "hospitals", "enterprises"]):
            pipeline = "0" if month == 1 else f"{ref('Growth',(month-2)//12+5,index+2)}/12/0.55*{scenario(2)}"
            put(f"new_{segment}", f"({pipeline})*MIN(1,{inp('conversion')}*{scenario(3)})")
            put(f"opening_{segment}", inp(f"opening_{segment}") if month == 1 else local(f"closing_{segment}", month-1))
            put(f"churn_{segment}", f"{local('opening_'+segment)}*MIN(1,{inp('churn')}*{scenario(6)})")
            put(f"closing_{segment}", f"{local('opening_'+segment)}+{local('new_'+segment)}-{local('churn_'+segment)}")
            put(f"avg_{segment}", f"({local('opening_'+segment)}+{local('closing_'+segment)})/2")
            put(["clinic_revenue", "hospital_revenue", "enterprise_revenue"][index], f"{local('avg_'+segment)}*{ref('Pricing',5+index,2)}/{fx}")
        average = "(" + total(["avg_clinics", "avg_hospitals", "avg_enterprises"]) + ")"
        put("active", total(["closing_clinics", "closing_hospitals", "closing_enterprises"]))
        put("pilots", f"SUM({ref('Growth',year_row,2)}:{col(4)}{year_row})/12/0.55*{scenario(2)}")
        put("base_revenue", total(["clinic_revenue", "hospital_revenue", "enterprise_revenue"]))
        addon = "+".join(f"{ref('Pricing',r,2)}*MIN(1,{ref('Pricing',r,3)}*{scenario(4)})/{fx}" for r in range(10, 14))
        put("addon_revenue", f"{average}*({addon})")
        put("setup_revenue", "+".join(f"{local('new_'+s)}*{ref('Pricing',i+5,3)}/{fx}" for i, s in enumerate(["clinics", "hospitals", "enterprises"])))
        for metric, growth_column, launch in [("consultations", 5, "tele_launch"), ("care_members", 6, "care_launch")]:
            previous = "0" if year_row == 5 else ref("Growth", year_row-1, growth_column)
            demand = f"({previous}+({ref('Growth',year_row,growth_column)}-{previous})*{within}/12)*{scenario(8)}"
            if metric == "consultations":
                demand = f"MIN({demand},{ref('Growth',year_row,7)}*{inp('slots')})"
            put(metric, f"IF({month}<{inp(launch)},0,{demand})")
        put("tele_billings", f"{local('consultations')}*{inp('tele_price')}/{fx}")
        put("tele_provider", f"{local('consultations')}*{inp('tele_provider')}/{fx}*{scenario(5)}")
        put("tele_revenue", f"{local('tele_billings')}-IF({inp('tele_gross')}=1,0,{local('tele_provider')})")
        put("care_billings", f"{local('care_members')}*{inp('care_price')}/{fx}")
        put("care_provider", f"{local('care_members')}*{inp('care_provider')}/{fx}*{scenario(5)}")
        put("revenue", total(["base_revenue", "addon_revenue", "setup_revenue", "tele_revenue", "care_billings"]))
        exit_base = "+".join(f"{local('closing_'+s)}*{ref('Pricing',i+5,2)}/{fx}" for i, s in enumerate(["clinics", "hospitals", "enterprises"]))
        put("exit_mrr", f"{exit_base}+{local('active')}*({addon})")
        put("exit_arr", f"{local('exit_mrr')}*12")
        put("vat_invoices", f"({total(['base_revenue','addon_revenue','setup_revenue'])})*{inp('vat')}")
        put("gross_billings", total(["base_revenue", "addon_revenue", "setup_revenue", "tele_billings", "care_billings", "vat_invoices"]))
        put("bad_debt", f"{local('gross_billings')}*(1-{inp('collectability')})")
        # Explicit lag selectors allow native spreadsheet edits without INDIRECT.
        collection = "0"
        for lag in reversed(range(7)):
            value = "0" if month-lag < 1 else f"{local('gross_billings',month-lag)}*{inp('collectability')}"
            collection = f"IF({inp('collection_lag')}+{scenario(7)}={lag},{value},{collection})"
        put("collections", collection)
        escalation = "1" if month <= 18 else f"(1+{inp('inflation')})^{(month-1)//12}"
        put("cloud", f"({inp('cloud_base')}+({local('avg_clinics')}+{local('avg_hospitals')})*{inp('cloud_tenant')}+{local('avg_enterprises')}*{inp('cloud_enterprise')})/{fx}*{scenario(5)}*{escalation}")
        put("ai_cost", f"({average}*MIN(1,{ref('Pricing',10,3)}*{scenario(4)})*{inp('ai_facility')}+{local('consultations')}*{inp('ai_consult')})/{fx}*{scenario(5)}")
        put("payment_fees", f"{local('collections')}*({inp('mpesa_mix')}*{inp('mpesa_fee')}+(1-{inp('mpesa_mix')})*{inp('bank_fee')})")
        for metric, pricing_column in [("onboarding", 5), ("acquisition", 4)]:
            put(metric, "(" + "+".join(f"{local('new_'+s)}*{ref('Pricing',i+5,pricing_column)}/{fx}" for i, s in enumerate(["clinics", "hospitals", "enterprises"])) + f")*{scenario(5)}")
        put("provider_expense", f"{local('care_provider')}+IF({inp('tele_gross')}=1,{local('tele_provider')},0)")
        for metric, function in [("delivery_payroll", "Delivery"), ("rd_payroll", "R&D"), ("commercial_payroll", "Commercial"), ("ga_payroll", "G&A")]:
            put(metric, staff_sum(function=function))
        put("payroll", total(["delivery_payroll", "rd_payroll", "commercial_payroll", "ga_payroll"]))
        put("cogs", total(["cloud", "ai_cost", "payment_fees", "onboarding", "provider_expense", "delivery_payroll"]))
        put("gross_profit", f"{local('revenue')}-{local('cogs')}")
        put("nonstaff_rd", cost_sum(kind="R&D"))
        put("nonstaff_other", cost_sum(kind="Other"))
        put("office", f"{inp('office')}/{fx}*{scenario(5)}*{escalation}")
        put("exceptional_spend", ref("Funding", 7, c))
        put("opex", total(["rd_payroll", "commercial_payroll", "ga_payroll", "nonstaff_rd", "nonstaff_other", "office", "acquisition", "bad_debt", "exceptional_spend"]))
        put("ebitda", f"{local('gross_profit')}-{local('opex')}")
        put("capex", cost_sum(kind="Capex"))
        put("depreciation", "+".join(f"IF({month-purchase}<{inp('asset_life')},{local('capex',purchase)}/{inp('asset_life')},0)" for purchase in range(1, month+1)))
        put("ebit", f"{local('ebitda')}-{local('depreciation')}")
        put("tax_loss_open", inp("opening_tax_loss") if month == 1 else local("tax_loss_close", month-1))
        put("taxable", f"MAX(0,{local('ebit')}-{local('tax_loss_open')})")
        put("tax", f"{local('taxable')}*{inp('income_tax')}")
        put("tax_loss_close", f"MAX(0,{local('tax_loss_open')}-{local('ebit')})")
        put("net_income", f"{local('ebit')}-{local('tax')}")
        put("opening_ar", "0" if month == 1 else local("closing_ar", month-1))
        put("closing_ar", f"{local('opening_ar')}+{local('gross_billings')}-{local('bad_debt')}-{local('collections')}")
        put("provider_accrual", total(["tele_provider", "care_provider"]))
        payout = "0"
        for lag in reversed(range(4)):
            value = "0" if month-lag < 1 else local("provider_accrual", month-lag)
            payout = f"IF({inp('provider_lag')}={lag},{value},{payout})"
        put("provider_paid", payout)
        put("opening_ap", "0" if month == 1 else local("closing_ap", month-1))
        put("closing_ap", f"{local('opening_ap')}+{local('provider_accrual')}-{local('provider_paid')}")
        put("financing", ref("Funding", 5, c))
        put("opening_cash", inp("opening_cash") if month == 1 else local("closing_cash", month-1))
        expenses = total(["cloud", "ai_cost", "payment_fees", "onboarding", "acquisition", "payroll", "nonstaff_rd", "nonstaff_other", "office", "exceptional_spend"])
        put("operating_cash", f"{local('collections')}-{local('provider_paid')}-({expenses})-{local('tax')}-{local('vat_invoices')}")
        put("closing_cash", f"{local('opening_cash')}+{local('financing')}+{local('operating_cash')}-{local('capex')}")
        put("protected_reserve", f"MAX(0,{inp('reserve')}-SUM({ref('Funding',6,3)}:{col(c)}6))")
        put("available_cash", f"{local('closing_cash')}-{local('protected_reserve')}")
        # Independent indirect-cash bridge includes agency settlement liabilities.
        indirect = f"{local('ebitda')}-({local('closing_ar')}-{local('opening_ar')})+({local('closing_ap')}-{local('opening_ap')})-{local('tax')}"
        put("cash_check", f"{local('operating_cash')}-({indirect})")
        put("ar_check", f"{local('opening_ar')}+{local('gross_billings')}-{local('bad_debt')}-{local('collections')}-{local('closing_ar')}")
        put("ap_check", f"{local('opening_ap')}+{local('provider_accrual')}-{local('provider_paid')}-{local('closing_ap')}")
        put("cohort_check", f"{local('active')}-({total(['opening_clinics','opening_hospitals','opening_enterprises','new_clinics','new_hospitals','new_enterprises'])})+({total(['churn_clinics','churn_hospitals','churn_enterprises'])})")
        # Programme uses are gross cash outlays, including clinician remittances.
        tele_paid = "0"
        care_paid = "0"
        for lag in reversed(range(4)):
            tele_paid = f"IF({inp('provider_lag')}={lag},{'0' if month-lag<1 else local('tele_provider',month-lag)},{tele_paid})"
            care_paid = f"IF({inp('provider_lag')}={lag},{'0' if month-lag<1 else local('care_provider',month-lag)},{care_paid})"
        programme_metrics = ["foundation_spend", "transcription_spend", "ai_spend", "wound_spend", "revenue_spend", "care_spend", "validation_spend"]
        for programme, metric in enumerate(programme_metrics, 1):
            extra = "0"
            if programme == 1:
                extra = total(["cloud", "ai_cost", "payment_fees", "onboarding", "acquisition", "office"]) + f"+({tele_paid})"
            elif programme == 6:
                extra = care_paid
            put(metric, f"{staff_sum(programme=programme)}+{cost_sum(programme=programme)}+({extra})")
        put("total_programme_spend", total(programme_metrics + ["exceptional_spend"]))
        put("headcount", staff_sum(fte=True))
        put("cash_shortfall", f"MAX(0,-{local('closing_cash')})")
        put("reserve_shortfall", f"MAX(0,-{local('available_cash')})")


def reports(model):
    title(model, "Budget", "Use-of-funds reconciliation — first 18 months",
          "Budgets are allocations; forecasts are driver-based gross cash uses. Positive variance means headroom. Tax/working capital are shown separately.")
    for c, label in enumerate(["Programme", "Envelope USD", "Base cash uses", "Headroom", "Downside cash uses", "Upside cash uses"], 1):
        model.text("Budget", 4, c, label, "header")
    names = ["foundation_spend", "transcription_spend", "ai_spend", "wound_spend", "revenue_spend", "care_spend", "validation_spend", "exceptional_spend"]
    for row, (programme, envelope, name) in enumerate(zip(PROGRAMMES, ENVELOPES, names), 5):
        model.text("Budget", row, 1, programme)
        model.put("Budget", row, 2, envelope, True, "money", "Plan allocation. Changes do not automatically change spending or financing.")
        for c, scenario in [(3, "Base"), (5, "Downside"), (6, "Upside")]:
            model.put("Budget", row, c, f"=SUM({ref('Monthly '+scenario,ROW[name],3)}:T{ROW[name]})", style="money")
        model.put("Budget", row, 4, f"=B{row}-C{row}", style="money")
    model.text("Budget", 13, 1, "TOTAL / remaining allocation")
    for c in range(2, 7):
        model.put("Budget", 13, c, f"=SUM({col(c)}5:{col(c)}12)", style="money")
    extra = [(15, "Financing vs plan (zero = reconciled)", f"{ref('Inputs',INPUT['raise'])}-B13"),
             (16, "Protected reserve vs plan (zero = reconciled)", f"{ref('Inputs',INPUT['reserve'])}-B12"),
             (17, "Income tax paid, M1–18", f"SUM({ref('Monthly Base',ROW['tax'],3)}:T{ROW['tax']})"),
             (18, "VAT remitted, M1–18", f"SUM({ref('Monthly Base',ROW['vat_invoices'],3)}:T{ROW['vat_invoices']})"),
             (19, "Customer collections, M1–18", f"SUM({ref('Monthly Base',ROW['collections'],3)}:T{ROW['collections']})"),
             (20, "Funding period closing cash", ref("Monthly Base",ROW["closing_cash"],20)),
             (21, "Protected cash at M18", ref("Monthly Base",ROW["protected_reserve"],20)),
             (22, "Available cash above reserve at M18", ref("Monthly Base",ROW["available_cash"],20)),
             (23, "Uses-to-cash bridge (zero = reconciled)", f"{ref('Inputs',INPUT['opening_cash'])}+SUM({ref('Funding',5,3)}:T5)+C19-C13-C17-C18-C20")]
    for row, label, formula in extra:
        model.text("Budget", row, 1, label)
        model.put("Budget", row, 3, "="+formula, style="money")

    title(model, "Cash 18 Months", "Monthly deployment and cash runway — base case",
          "Linked to the 60-month model. A negative closing balance indicates unmet financing needs, not an automatic loan.")
    view = ["revenue", "collections", "payroll", "total_programme_spend", "capex", "tax", "vat_invoices", "operating_cash", "financing", "opening_cash", "closing_cash", "protected_reserve", "available_cash", "closing_ar", "closing_ap", "cash_check"]
    for r, name in enumerate(view, 5):
        model.text("Cash 18 Months", r, 1, name.replace("_", " ").title())
        for month in range(1, 19):
            model.put("Cash 18 Months", r, month+2, "="+ref("Monthly Base", ROW[name], month+2), style="money")
    for month in range(1, 19):
        model.put("Cash 18 Months", 4, month+2, "="+ref("Monthly Base",4,month+2), style="date")
    model.text("Cash 18 Months", 23, 1, "Programme spend includes capex: do not add capex again. Operating cash excludes capex and financing. All cash costs are paid in the scheduled month except provider settlements.")

    title(model, "Five Year", "Five-year financial projection — base case",
          "Successive 12-month planning years from Inputs start date. SaaS exit ARR excludes setup fees and clinical services.")
    annual = [
        (5, "Total recognised revenue", "revenue", "sum"),
        (6, "Clinic subscriptions", "clinic_revenue", "sum"), (7, "Hospital subscriptions", "hospital_revenue", "sum"),
        (8, "Enterprise subscriptions", "enterprise_revenue", "sum"), (9, "Add-ons, once", "addon_revenue", "sum"),
        (10, "Setup revenue", "setup_revenue", "sum"), (11, "Telemedicine recognised revenue", "tele_revenue", "sum"),
        (12, "Continuous-care revenue", "care_billings", "sum"), (13, "COGS", "cogs", "sum"),
        (14, "Gross profit", "gross_profit", "sum"), (16, "R&D payroll", "rd_payroll", "sum"),
        (17, "Commercial payroll", "commercial_payroll", "sum"), (18, "G&A payroll", "ga_payroll", "sum"),
        (19, "Non-payroll R&D", "nonstaff_rd", "sum"), (20, "Other scheduled operating costs", "nonstaff_other", "sum"),
        (21, "Office / administration", "office", "sum"), (22, "Variable acquisition expense", "acquisition", "sum"),
        (23, "Bad debt", "bad_debt", "sum"), (24, "Exceptional operating costs", "exceptional_spend", "sum"),
        (25, "EBITDA", "ebitda", "sum"), (27, "Depreciation", "depreciation", "sum"),
        (28, "Income tax", "tax", "sum"), (29, "Net income", "net_income", "sum"),
        (30, "Operating cash flow", "operating_cash", "sum"), (31, "Capex", "capex", "sum"),
        (32, "Financing", "financing", "sum"), (33, "Closing cash", "closing_cash", "end"),
        (34, "Closing receivables", "closing_ar", "end"), (35, "Provider payables", "closing_ap", "end"),
        (36, "Exit MRR (facility subscriptions + add-ons)", "exit_mrr", "end"), (37, "Exit ARR", "exit_arr", "end"),
        (38, "Active facilities, expected", "active", "end"), (39, "Clinics", "closing_clinics", "end"),
        (40, "Hospitals", "closing_hospitals", "end"), (41, "Enterprise buyers", "closing_enterprises", "end"),
        (42, "Year-end FTE equivalent", "headcount", "end"), (43, "Total payroll (already included above)", "payroll", "sum"),
    ]
    for year in range(1, 6):
        c = year + 2
        first, last = (year-1)*12+3, year*12+2
        model.text("Five Year", 4, c, f"Planning year {year}", "header")
        for row, label, name, kind in annual:
            model.text("Five Year", row, 1, label)
            formula = ref("Monthly Base",ROW[name],last) if kind == "end" else f"SUM({ref('Monthly Base',ROW[name],first)}:{col(last)}{ROW[name]})"
            model.put("Five Year", row, c, "="+formula, style="number" if row in range(38,43) else "money")
        for row, label, numerator in [(15,"Gross margin",14),(26,"EBITDA margin",25)]:
            model.text("Five Year", row, 1, label)
            model.put("Five Year", row, c, f"=IF({col(c)}5=0,0,{col(c)}{numerator}/{col(c)}5)", style="percent")
        model.text("Five Year", 45, 1, "Revenue stream reconciliation (zero)")
        model.put("Five Year", 45, c, f"={col(c)}5-SUM({col(c)}6:{col(c)}12)")

    title(model, "Sensitivity", "Funding and operating sensitivity — no assumed future funding",
          "Negative cash and reserve breaches remain visible. Additional capital is not calculated as automatic income.")
    sensitivity = [(5,"Revenue, first 18 months","revenue","sum18"),(6,"Gross cash uses, first 18 months","total_programme_spend","sum18"),
                   (7,"Closing cash, month 18","closing_cash","m18"),(8,"Minimum month-end cash, M1–18","closing_cash","min18"),
                   (9,"Minimum available cash above reserve, M1–18","available_cash","min18"),
                   (10,"Required additional cash to maintain reserve, M1–18","reserve_shortfall","max18"),
                   (11,"Year 5 revenue","revenue","year5"),(12,"Year 5 EBITDA","ebitda","year5"),
                   (13,"Month 60 cash","closing_cash","m60"),(14,"Maximum cash shortfall, M1–60","cash_shortfall","max60"),
                   (18,"Minimum month-end cash, M1–60","closing_cash","min60"),
                   (19,"Maximum additional cash to maintain reserve, M1–60","reserve_shortfall","max60")]
    for c, scenario in enumerate(["Base", "Downside", "Upside"], 3):
        sheet = "Monthly " + scenario
        model.text("Sensitivity", 4, c, scenario, "header")
        for row, label, name, mode in sensitivity:
            model.text("Sensitivity", row, 1, label)
            first = ref(sheet,ROW[name],3)
            if mode == "m18": formula = ref(sheet,ROW[name],20)
            elif mode == "m60": formula = ref(sheet,ROW[name],62)
            elif mode == "year5": formula = f"SUM({ref(sheet,ROW[name],51)}:BJ{ROW[name]})"
            else:
                function = "SUM" if mode.startswith("sum") else "MIN" if mode.startswith("min") else "MAX"
                last = "BJ" if mode.endswith("60") else "T"
                formula = f"{function}({first}:{last}{ROW[name]})"
            model.put("Sensitivity", row, c, "="+formula, style="money")
        for row, label, condition in [(16,"First cash-negative month (0 = none within 60)","closing_cash"), (17,"First reserve-breach month (0 = none within 60)","available_cash")]:
            formula = "0"
            for month in reversed(range(1,61)):
                formula = f"IF({ref(sheet,ROW[condition],month+2)}<0,{month},{formula})"
            model.text("Sensitivity", row, 1, label)
            model.put("Sensitivity", row, c, "="+formula, style="integer")

    title(model, "Unit Economics", "Illustrative direct contribution — not company EBITDA or LTV",
          "Variable CAC and onboarding are separate from sales payroll/overhead. Default add-on attach rates apply once. excludes shared fixed delivery payroll.")
    labels = ["Segment", "Monthly base USD", "Add-on USD", "Variable direct cost", "Direct contribution", "CAC USD", "Onboard USD", "Contribution payback months", "Onboarding shortfall USD"]
    for c, label in enumerate(labels,1): model.text("Unit Economics",4,c,label,"header")
    for row in range(5,8):
        model.text("Unit Economics",row,1,["Clinic","Hospital","Enterprise"][row-5])
        model.put("Unit Economics",row,2,"="+ref("Pricing",row,7),style="money")
        model.put("Unit Economics",row,3,"="+ref("Pricing",15,4),style="money")
        hosting = ref("Inputs",INPUT["cloud_enterprise" if row==7 else "cloud_tenant"])
        fees = f"({ref('Inputs',INPUT['mpesa_mix'])}*{ref('Inputs',INPUT['mpesa_fee'])}+(1-{ref('Inputs',INPUT['mpesa_mix'])})*{ref('Inputs',INPUT['bank_fee'])})"
        model.put("Unit Economics",row,4,f"=({hosting}+{ref('Inputs',INPUT['ai_facility'])}*{ref('Pricing',10,3)})/{ref('Inputs',INPUT['fx'])}+(B{row}+C{row})*{fees}",style="money")
        model.put("Unit Economics",row,5,f"=B{row}+C{row}-D{row}",style="money")
        for c, pc in [(6,4),(7,5)]: model.put("Unit Economics",row,c,f"={ref('Pricing',row,pc)}/{ref('Inputs',INPUT['fx'])}",style="money")
        model.put("Unit Economics",row,8,f"=IF(E{row}>0,(F{row}+G{row})/E{row},-1)")
        model.put("Unit Economics",row,9,f"=G{row}-{ref('Pricing',row,3)}/{ref('Inputs',INPUT['fx'])}",style="money")
    model.text("Unit Economics",10,1,"Payback excludes corporate overhead and retention assumptions; -1 means nonpositive contribution. LTV:CAC is not estimated.")


def checks_and_guide(model):
    title(model, "Checks", "Model checks and outstanding decisions",
          "Mathematical checks: zero = reconciled. Review flags: zero = unresolved. Budget/cash warnings must be assessed, not suppressed.")
    model.text("Checks",4,1,"Check","header")
    model.text("Checks",4,2,"Value","header")
    model.text("Checks",4,3,"Interpretation","header")
    checks = [
        ("Allocation less proposed financing", f"{ref('Budget',13)}-{ref('Inputs',INPUT['raise'])}", "Zero; mismatches mean the ask and allocations differ."),
        ("Reserve allocation less cash earmark", f"{ref('Budget',12)}-{ref('Inputs',INPUT['reserve'])}", "Zero."),
        ("Budget-to-cash bridge", ref("Budget",23,3), "Zero; gross cash uses reconcile to financing, collections, tax and closing cash."),
        ("Management review complete", ref("Inputs",INPUT['approved']), "Must become 1 after input verification; currently provisional."),
        ("Reserve authorisations above earmark", f"MAX(0,SUM({ref('Funding',6,3)}:BJ6)-{ref('Inputs',INPUT['reserve'])})", "Zero; releases cannot exceed protected allocation."),
    ]
    for sheet in ["Monthly Base","Monthly Downside","Monthly Upside"]:
        for metric in ["cash_check","ar_check","ap_check","cohort_check"]:
            expression = "+".join(f"ABS({ref(sheet,ROW[metric],m+2)})" for m in range(1,61))
            checks.append((f"{sheet}: {metric}", expression, "Zero within floating-point tolerance."))
    for row,(label,formula,meaning) in enumerate(checks,5):
        model.text("Checks",row,1,label)
        model.put("Checks",row,2,"="+formula)
        model.text("Checks",row,3,meaning)
    for row, (label, formula, meaning) in enumerate([
        ("Foundation allocation overrun", f"MAX(0,-{ref('Budget',5,4)})", "Positive requires an explicit scope change or approved reallocation; total headroom does not erase a programme overrun."),
        ("Base: 18-month protected cash shortfall", ref("Sensitivity",10,3), "Zero means reserve is maintained through month 18."),
        ("Downside: 18-month protected cash shortfall", ref("Sensitivity",10,4), "Positive is the amount needed to maintain the reserve under this scenario."),
        ("Base: 60-month protected cash shortfall", ref("Sensitivity",19,3), "Later reserve use or financing needs require a separate management decision."),
    ], 24):
        model.text("Checks",row,1,label)
        model.put("Checks",row,2,"="+formula,style="money")
        model.text("Checks",row,3,meaning)

    title(model,"Read Me","Nexora | US$750,000 financial planning workbook",
          "Company-owned planning model. All forward projections are conditional assumptions, not established results.")
    instructions = [
        ("Purpose", "We link an 18-month funding plan to five planning years, with facility SaaS, TibaBot add-ons and Vitora patient-facing services modelled separately."),
        ("Start here", "Edit blue cells in Inputs, Pricing, Growth, Scenarios, Staff, Costs, Funding and Budget. Save a working copy. Formulas recalculate in Excel/LibreOffice; cached initial results are included."),
        ("Dates / actuals", "Default start 1 January 2027 is unconfirmed. No historic actuals are included. Five Year uses rolling 12-month planning years, not asserted FY2026–2030 results."),
        ("Traction", "Opening customers, cash, receivables, provider payables and tax losses are not verified. Opening customers/cash/losses are editable; this version assumes zero opening receivables and payables."),
        ("Original source", "KES tier/add-on prices, CAC/onboarding, cloud/admin drivers and annual acquisition targets derive from the user-supplied US$250k model. Figures are unverified planning inputs."),
        ("Corrections", "We recalculate every revenue line and acquisition expense. We do not inherit the inconsistent original Y1 total, Year-3 breakeven claim, 715-customer exit or rounded dollar prices."),
        ("Pilot cohorts", "Annual supplied wins size monthly pilot starts at fixed 55% reference conversion. A one-month free pilot delays wins. Scenario conversion applies once. Opening cohorts churn monthly; new/churned cohorts receive half-month revenue."),
        ("Fractional customers", "Cohorts represent expected values, not promises of fractional invoices. Growth plans must be reconciled to named opportunities and implementation capacity."),
        ("Telemedicine", "Vitora owns patient-facing consultations. Default net agent presentation recognises patient fees less clinician dues. Gross principal mode changes revenue and COGS equally; gross cash receipts/payouts are unchanged."),
        ("Services", "Consultations ramp to annual monthly targets and are capped by clinician capacity. Continuous care is one programme, ramping to member targets. Both require validated pricing and contracts."),
        ("Cost ownership", "All payroll and scheduled costs are allocated to one programme. Variable CAC is additional to salaried commercial overhead. Budgets are ceilings/allocations, not automatic expenses or additional payroll."),
        ("Gross uses", "Budget reports actual forecast gross cash uses, including clinician remittances. Customer receipts finance some uses. Tax and working capital are bridged separately. Positive headroom does not authorise discretionary spend."),
        ("Staffing", "All salaries are illustrative loaded USD costs, not a KES100k universal cap. R&D is expensed; post-M18 staffing scales are assumptions. Role programme/classification edits or extra rows require the generator to be updated."),
        ("Equipment / GPUs", "US$9k equipment capex is a quote-pending allowance, not a priced inventory. Training compute is rented in the default case. Any GPU purchase needs an explicit replacement allocation and a capex schedule."),
        ("Tax / accounting", "VAT default zero is unresolved, not exempt status. Only SaaS/setup VAT is supported; remittance is in invoice month. Income tax uses simplified indefinite loss carryforward and same-month payment. Obtain transaction-specific tax review."),
        ("Working capital", "Invoices follow monthly recognised SaaS/setup and delivered services. Collection lags are editable; uncollectible shares are expensed immediately. Providers accrue and settle separately. Other operating costs are paid in scheduled months; no annual prepayments modelled."),
        ("Reserve", "US$65k remains protected until authorised on Funding. Release is neither an expense nor a financing receipt. Record exceptional operating costs separately. Negative available cash flags a reserve breach."),
        ("Further funding", "Only the initial US$750k is included by default. Later financing is zero unless entered. Negative cash quantifies an unmet funding need; scenarios do not automatically borrow or cut spending."),
        ("Market opportunity", "Facility counts are unverified and enterprise purchasers may overlap facility counts. Segment base TAM is indicative; there is no asserted aggregate addressable market or investor valuation."),
        ("Future features", "Regional launches, extra languages, broad imaging, devices and a developer marketplace have no incremental revenue assumed. Revenue/referral functionality is included in facility pricing until monetisation is validated."),
        ("Rounding", "Formulas use unrounded KES prices converted at editable FX. Display rounding does not alter calculation. ARR is exit facility MRR x12, not recognised annual revenue."),
        ("Evidence / review", "We will verify the date, opening position, salaries, supplier quotes, service economics, tax and collections before setting Inputs review flag to 1. This workbook is a planning model, not an audited statement."),
        ("Regeneration", "python3 docs/finance/build_model.py rebuilds planning defaults. It does not import workbook edits. Save scenario/customised copies separately."),
    ]
    for row,(heading,body) in enumerate(instructions,5):
        model.text("Read Me",row,1,heading)
        model.text("Read Me",row,2,body)
    for column, sheet in enumerate(["Cash 18 Months","Five Year","Sensitivity","Budget","Checks"],2):
        model.text("Read Me",31,column,sheet)


def build_model():
    model = Model()
    # Stable order keeps the guide and outputs ahead of technical schedules.
    for sheet in ["Read Me","Cash 18 Months","Five Year","Sensitivity","Budget","Unit Economics","Inputs","Pricing","Growth","Scenarios","Staff","Costs","Funding","Monthly Base","Monthly Downside","Monthly Upside","Checks"]:
        model.sheets[sheet] = {}
    inputs(model)
    schedules(model)
    for row, scenario in enumerate(["Base","Downside","Upside"],5):
        monthly(model,"Monthly "+scenario,row)
    reports(model)
    checks_and_guide(model)
    return model


def export_workbook(model, path, values_only=False):
    with xlsxwriter.Workbook(path) as workbook:
        workbook.set_properties({"title":"Nexora US$750,000 financial model","author":"Nexora Consulting Limited","comments":"Provisional planning inputs; read the Read Me and Checks sheets."})
        workbook.set_calc_mode("auto")
        formats = {}
        for editable in [False, True]:
            for style in ["number","money","kes","integer","percent","date","text","title","subtitle","header"]:
                options = {"font_name":"Aptos","font_size":10,"font_color":"#1662A5" if editable else "#172B4D"}
                if editable: options["bg_color"] = "#EDF5FF"
                if style == "number": options["num_format"] = '#,##0.00;[Red](#,##0.00);"–"'
                if style == "money": options["num_format"] = '"US$ "#,##0.00;[Red]("US$ "#,##0.00);"US$ –"'
                if style == "kes": options["num_format"] = '"KES "#,##0.00;[Red]("KES "#,##0.00);"KES –"'
                if style == "integer": options["num_format"] = '0;[Red](0);"–"'
                if style == "percent": options["num_format"] = '0.0%;[Red](0.0%);"–"'
                if style == "date": options["num_format"] = "mmm yyyy"
                if style in ["text","subtitle"]: options["text_wrap"] = True
                if style in ["title","header"]: options.update({"bold":True,"bg_color":"#123C54","font_color":"white","text_wrap":True})
                if style == "title": options["font_size"] = 16
                formats[(editable,style)] = workbook.add_format(options)
        negative = workbook.add_format({"font_color":"#9C0006","bg_color":"#FFC7CE"})
        for name,cells in model.sheets.items():
            sheet = workbook.add_worksheet(name)
            sheet.freeze_panes(4,2)
            sheet.hide_gridlines(2)
            sheet.set_zoom(85)
            sheet.set_column(0,0,48)
            sheet.set_column(1,61,21)
            sheet.set_row(0,32)
            sheet.set_row(1,48)
            sheet.set_row(3,42)
            sheet.set_landscape()
            sheet.fit_to_pages(1,0)
            sheet.repeat_rows(0,3)
            sheet.set_footer("Nexora Consulting Limited | Provisional planning model | Page &P")
            for (row,column),cell in cells.items():
                style = cell.style
                if name == "Inputs" and column == 2 and style == "money" and "KES" in model.get(name,row,1):
                    style = "kes"
                fmt = formats[(cell.editable and not values_only,style)]
                if row in (1,2) and column == 1:
                    text = cell.value
                    if values_only and row == 1:
                        text = "VALUES ONLY | " + text
                    if values_only and row == 2:
                        text = "Static preview; use the editable workbook for assumptions and recalculation. " + text
                    sheet.merge_range(row-1,0,row-1,7,text,fmt)
                elif isinstance(cell.value,str) and cell.value.startswith("="):
                    if values_only:
                        sheet.write_number(row-1,column-1,model.get(name,row,column),fmt)
                    else:
                        sheet.write_formula(row-1,column-1,cell.value,fmt,model.get(name,row,column))
                elif values_only and name == "Read Me" and (row,column) == (6,2):
                    sheet.write(row-1,column-1,"This copy contains fixed results for VS Code Office Viewer and other previewers. To change assumptions, open nexora-750000-financial-model.xlsx in Excel or LibreOffice. Regenerate this snapshot after changes.",fmt)
                else:
                    sheet.write(row-1,column-1,cell.value,fmt)
                if cell.note:
                    sheet.write_comment(row-1,column-1,cell.note,{"author":"Nexora planning assumptions"})
                if cell.editable and not values_only and isinstance(cell.value,(int,float)):
                    validation = {"validate":"decimal","criteria":">=","value":0,"input_title":"Planning assumption","input_message":"Editable input. Review linked outputs and Checks after changes."}
                    if cell.style == "percent": validation.update({"criteria":"between","minimum":0,"maximum":1})
                    if name == "Inputs" and row in [INPUT[k] for k in ["collection_lag","provider_lag"]]: validation.update({"validate":"integer","criteria":"between","minimum":0,"maximum":3})
                    if name == "Inputs" and row in [INPUT[k] for k in ["tele_gross","approved"]]: validation.update({"validate":"integer","criteria":"between","minimum":0,"maximum":1})
                    if name == "Inputs" and row in [INPUT[k] for k in ["fx","asset_life"]]: validation.update({"criteria":">","value":0})
                    if name == "Scenarios" and column == 7: validation.update({"validate":"integer","criteria":"between","minimum":0,"maximum":3})
                    if name in ["Staff","Costs"] and column in [6,7]: validation.update({"validate":"integer","criteria":"between","minimum":1,"maximum":60})
                    if name == "Staff" and column == 8: validation.update({"criteria":"between","minimum":0,"maximum":1})
                    if name == "Costs" and column == 8: validation.update({"validate":"integer","criteria":"between","minimum":0,"maximum":1})
                    sheet.data_validation(row-1,column-1,row-1,column-1,validation)
            if name == "Read Me":
                sheet.set_column(1,1,105)
                for row in range(4,28): sheet.set_row(row,64)
                for column,target in enumerate(["Cash 18 Months","Five Year","Sensitivity","Budget","Checks"],2):
                    sheet.write_url(30,column-1,f"internal:'{target}'!A1",string=target)
            elif name == "Inputs":
                sheet.set_column(2,2,100)
                for row in range(4,4+len(INPUT_SPEC)): sheet.set_row(row,43)
            elif name in ["Staff","Costs"]:
                sheet.freeze_panes(4,9)
                sheet.set_column(8,8,34)
                for row in range(4,4+(len(STAFF) if name=="Staff" else len(COSTS))): sheet.set_row(row,44)
            elif name == "Checks": sheet.set_column(2,2,85)
            if name.startswith("Monthly"):
                for metric in ["closing_cash","available_cash","ebitda"]:
                    r = ROW[metric]-1
                    sheet.conditional_format(r,2,r,61,{"type":"cell","criteria":"<","value":0,"format":negative})
            if name == "Budget":
                sheet.conditional_format("D5:D12",{"type":"cell","criteria":"<","value":0,"format":negative})
            if name == "Five Year":
                chart = workbook.add_chart({"type":"column"})
                for row,label in [(5,"Revenue"),(25,"EBITDA")]:
                    chart.add_series({"name":label,"categories":[name,3,2,3,6],"values":[name,row-1,2,row-1,6]})
                chart.set_title({"name":"Illustrative revenue and EBITDA"})
                chart.set_y_axis({"num_format":"$#,##0"})
                sheet.insert_chart("C48",chart)


def summary(model):
    return {
        "review_status": "Provisional: inputs not yet management-verified",
        "budget": model.get("Budget",13),
        "forecast_gross_uses_18m": model.get("Budget",13,3),
        "programme_headroom": {PROGRAMMES[i]:round(model.get("Budget",i+5,4),2) for i in range(8)},
        "scenarios": {scenario:{model.get("Sensitivity",row,1):round(model.get("Sensitivity",row,c),2) for row in [5,7,8,9,10,11,12,13,14,16,17,18,19]} for c,scenario in enumerate(["Base","Downside","Upside"],3)},
        "annual": [{"year":year,"revenue":round(model.get("Five Year",5,year+2),2),"ebitda":round(model.get("Five Year",25,year+2),2),"exit_arr":round(model.get("Five Year",37,year+2),2),"active":round(model.get("Five Year",38,year+2),2)} for year in range(1,6)],
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output",type=Path,default=Path("docs/nexora-750000-financial-model.xlsx"))
    parser.add_argument("--values-output",type=Path,help="Optional values-only workbook for previewers without formula support.")
    parser.add_argument("--summary",action="store_true")
    args = parser.parse_args()
    if not args.output.parent.is_dir():
        parser.error("Output parent directory must already exist.")
    if args.values_output and not args.values_output.parent.is_dir():
        parser.error("Values-output parent directory must already exist.")
    if args.values_output and args.values_output.resolve() == args.output.resolve():
        parser.error("Editable and values-only workbooks must have different paths.")
    model = build_model()
    export_workbook(model,args.output)
    print(f"Created {args.output}")
    if args.values_output:
        export_workbook(model,args.values_output,values_only=True)
        print(f"Created values-only preview {args.values_output}")
    if args.summary: print(json.dumps(summary(model),indent=2))


if __name__ == "__main__":
    main()
