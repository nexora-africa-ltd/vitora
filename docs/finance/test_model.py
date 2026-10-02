# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""Verify the funding workbook's economic behaviour and exported formula caches.

Run: python3 -m unittest discover -s docs/finance -v
Inputs: none; temporary workbooks are created under /tmp/opencode.
"""

import tempfile
import unittest
import zipfile
from pathlib import Path
from xml.etree import ElementTree as ET

from build_model import INPUT, ROW, build_model, export_workbook


class FinancialModelTests(unittest.TestCase):
    def setUp(self):
        self.model = build_model()

    def value(self, name, month=1, sheet="Monthly Base"):
        return self.model.get(sheet, ROW[name], month + 2)

    def change(self, name, value):
        self.model.put("Inputs", INPUT[name], 2, value)

    def test_budget_and_cash_reconcile_in_all_scenarios(self):
        self.assertEqual(self.model.get("Budget", 13, 2), 750000)
        for sheet in ["Monthly Base", "Monthly Downside", "Monthly Upside"]:
            for month in range(1, 61):
                for metric in ["cash_check", "ar_check", "ap_check", "cohort_check"]:
                    self.assertAlmostEqual(self.value(metric, month, sheet), 0, places=6)

    def test_financing_changes_cash_not_profit(self):
        cash = self.value("closing_cash")
        profit = self.value("ebitda")
        self.change("raise", 0)
        self.assertAlmostEqual(self.value("closing_cash"), cash - 750000)
        self.assertEqual(self.value("ebitda"), profit)

    def test_net_and_gross_telemedicine_have_same_profit_and_cash(self):
        month = 10
        revenue = self.value("revenue", month)
        profit = self.value("ebitda", month)
        cash = self.value("closing_cash", month)
        provider = self.value("tele_provider", month)
        self.assertGreater(provider, 0)
        self.change("tele_gross", 1)
        self.assertAlmostEqual(self.value("revenue", month), revenue + provider)
        self.assertAlmostEqual(self.value("ebitda", month), profit)
        self.assertAlmostEqual(self.value("closing_cash", month), cash)

    def test_collection_delay_changes_cash_not_revenue(self):
        self.change("opening_clinics", 10)
        self.change("collection_lag", 0)
        revenue = self.value("revenue")
        cash = self.value("closing_cash")
        self.change("collection_lag", 1)
        self.assertEqual(self.value("revenue"), revenue)
        self.assertLess(self.value("closing_cash"), cash)
        self.assertGreater(self.value("closing_ar"), 0)
        self.assertAlmostEqual(self.value("cash_check"), 0, places=6)

    def test_equipment_is_capex_not_ebitda_expense(self):
        cash = self.value("closing_cash")
        profit = self.value("ebitda")
        depreciation = self.value("depreciation")
        # First cost schedule entry is the month-one equipment purchase.
        self.model.put("Costs", 5, 5, 10000)
        self.assertAlmostEqual(self.value("closing_cash"), cash - 1000)
        self.assertEqual(self.value("ebitda"), profit)
        self.assertGreater(self.value("depreciation"), depreciation)

    def test_reserve_release_is_not_an_expense_or_cash_receipt(self):
        cash = self.value("closing_cash")
        profit = self.value("ebitda")
        protected = self.value("protected_reserve")
        self.model.put("Funding", 6, 3, 5000)
        self.assertEqual(self.value("closing_cash"), cash)
        self.assertEqual(self.value("ebitda"), profit)
        self.assertEqual(self.value("protected_reserve"), protected - 5000)

    def test_addons_are_separate_and_not_double_counted(self):
        month = 12
        addon = self.value("addon_revenue", month)
        revenue = self.value("revenue", month)
        base = self.value("base_revenue", month)
        for row in range(10, 14):
            self.model.put("Pricing", row, 3, 0)
        self.assertAlmostEqual(self.value("revenue", month), revenue - addon)
        self.assertEqual(self.value("base_revenue", month), base)

    def test_zero_demand_does_not_create_facility_revenue(self):
        for row in range(5, 10):
            for col in range(2, 5):
                self.model.put("Growth", row, col, 0)
        self.assertEqual(self.value("base_revenue", 60), 0)
        self.assertEqual(self.value("addon_revenue", 60), 0)
        self.assertGreater(self.value("payroll", 60), 0)

    def test_pilot_lag_and_conversion_are_applied_once(self):
        self.assertEqual(self.value("new_clinics", 1), 0)
        self.assertAlmostEqual(self.value("new_clinics", 2), 15 / 12)
        self.change("conversion", 0.275)
        self.assertAlmostEqual(self.value("new_clinics", 2), 15 / 12 / 2)

    def test_fx_changes_kes_revenue_not_usd_salary_schedule(self):
        revenue = self.value("base_revenue", 12)
        payroll = self.value("payroll", 12)
        self.change("fx", 260)
        self.assertAlmostEqual(self.value("base_revenue", 12), revenue / 2)
        self.assertEqual(self.value("payroll", 12), payroll)

    def test_risks_are_visible_without_automatic_funding(self):
        self.assertGreater(self.model.get("Checks", 24, 2), 0)
        self.assertGreater(self.model.get("Sensitivity", 10, 4), 0)
        self.assertEqual(sum(self.model.get("Funding", 5, m + 2) for m in range(2, 61)), 0)
        self.assertEqual(self.model.get("Inputs", INPUT["approved"]), 0)

    def test_bad_debt_vat_and_provider_delays_reconcile(self):
        self.change("collectability", 0.95)
        self.change("vat", 0.16)
        self.change("provider_lag", 2)
        for month in range(1, 61):
            self.assertAlmostEqual(self.value("cash_check", month), 0, places=6)
            self.assertAlmostEqual(self.value("ar_check", month), 0, places=6)
        self.assertGreater(self.value("bad_debt", 12), 0)
        self.assertGreater(self.value("closing_ap", 12), 0)

    def test_annual_revenue_is_sum_of_months_not_exit_arr(self):
        for year in range(1, 6):
            expected = sum(self.value("revenue", m) for m in range((year - 1) * 12 + 1, year * 12 + 1))
            self.assertAlmostEqual(self.model.get("Five Year", 5, year + 2), expected)
        self.assertNotEqual(self.model.get("Five Year", 5, 3), self.value("exit_arr", 12))

    def test_markdown_summary_matches_initial_workbook_scenario(self):
        document = (Path(__file__).resolve().parents[1] / "usd-750000-funding-deployment-plan.md").read_text()
        for year in range(1, 6):
            for row in (5, 25, 37):
                value = self.model.get("Five Year", row, year + 2)
                displayed = f"(${abs(value):,.0f})" if value < 0 else f"${value:,.0f}"
                self.assertIn(displayed, document)
        for col in (3, 4, 5):
            self.assertIn(f"${self.model.get('Sensitivity', 7, col):,.0f}", document)
        self.assertIn(f"US${self.model.get('Budget', 13, 3):,.0f}", document)

    def test_export_has_formulas_caches_and_editable_inputs(self):
        with tempfile.TemporaryDirectory(dir="/tmp/opencode") as directory:
            path = Path(directory) / "model.xlsx"
            export_workbook(self.model, path)
            with zipfile.ZipFile(path) as archive:
                ns = {"s": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
                formula_count = 0
                for name in archive.namelist():
                    if name.startswith("xl/worksheets/sheet") and name.endswith(".xml"):
                        root = ET.fromstring(archive.read(name))
                        for cell in root.findall(".//s:c", ns):
                            self.assertNotEqual(cell.get("t"), "e", name)
                            if cell.find("s:f", ns) is not None:
                                formula_count += 1
                                self.assertIsNotNone(cell.find("s:v", ns), name)
                self.assertGreater(formula_count, 10000)
                annual = ET.fromstring(archive.read("xl/worksheets/sheet3.xml"))
                revenue_cell = annual.find(".//s:c[@r='C5']/s:v", ns)
                self.assertAlmostEqual(float(revenue_cell.text), self.model.get("Five Year", 5, 3))
                self.assertIn(b'fullCalcOnLoad="1"', archive.read("xl/workbook.xml"))

    def test_values_only_export_displays_results_without_formula_support(self):
        with tempfile.TemporaryDirectory(dir="/tmp/opencode") as directory:
            path = Path(directory) / "values.xlsx"
            export_workbook(self.model, path, values_only=True)
            with zipfile.ZipFile(path) as archive:
                ns = {"s": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
                for name in archive.namelist():
                    if name.startswith("xl/worksheets/sheet") and name.endswith(".xml"):
                        root = ET.fromstring(archive.read(name))
                        self.assertEqual(root.findall(".//s:f", ns), [])
                annual = ET.fromstring(archive.read("xl/worksheets/sheet3.xml"))
                for address, row, column in [("C5", 5, 3), ("G5", 5, 7), ("C30", 30, 3), ("G30", 30, 7)]:
                    value = annual.find(f".//s:c[@r='{address}']/s:v", ns)
                    self.assertAlmostEqual(float(value.text), self.model.get("Five Year", row, column))
                styles = archive.read("xl/styles.xml")
                self.assertIn(b'US$', styles)
                self.assertIn(b'KES', styles)


if __name__ == "__main__":
    unittest.main()
