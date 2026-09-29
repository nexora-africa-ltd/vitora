<!--
Purpose: Explain how to use and reproduce Nexora's US$750,000 financial model.
Use: Open the linked workbook in Excel or LibreOffice; use the commands below to rebuild or test it.
Inputs: Editable workbook assumptions; generator accepts --output PATH, --values-output PATH, and --summary. No environment variables.
-->

# Nexora financial model

[Editable workbook](../nexora-750000-financial-model.xlsx) · [Values-only preview](../nexora-750000-financial-model-values.xlsx) · [Funding deployment plan](../usd-750000-funding-deployment-plan.md)

The workbook links 60 monthly periods to an 18-month cash view, a five-year forecast, three simultaneous scenarios, and a use-of-funds reconciliation. It contains native spreadsheet formulas and calculated initial values; it is not a set of static output tables.

## Editing the model

1. Save a working copy and read **Read Me** and **Checks**.
2. Edit blue cells in **Inputs**, **Pricing**, **Growth**, **Scenarios**, **Staff**, **Costs**, **Funding**, and **Budget**.
3. Review **Cash 18 Months**, **Five Year**, **Sensitivity**, **Unit Economics**, and **Budget** after recalculation.
4. Keep the management-review input at zero until the starting position, costs, pricing, tax and operating assumptions have been verified.

The January 2027 start date, opening cash and customers, service economics, salaries, scenarios, and tax treatment are provisional. Original KES pricing and operating drivers are labelled as supplied or reconstructed assumptions, not independently verified facts. Market counts are unverified and enterprise purchasers may overlap facility counts.

Use Excel or LibreOffice for the editable workbook. The VS Code Office Viewer was reported to display zeros even though the file contains non-zero cached results and recalculates correctly in LibreOffice. Use the **values-only preview** in viewers without compatible formula support; it contains numeric results rather than formulas and does not update when assumptions change.

Financial outputs display **US$**. Commercial and operating inputs labelled **KES** are in Kenyan shillings and are converted using the editable planning exchange rate. Planning years are rolling 12-month periods from the start date. The **Cash 18 Months** sheet has monthly columns, not annual columns; the **Five Year** sheet has annual results.

## Workbook structure

| Sheet | Purpose |
|---|---|
| Read Me | Scope, source assumptions, accounting conventions, and instructions. |
| Cash 18 Months | Monthly funding-period cash flow and protected reserve. |
| Five Year | Annual revenue, margins, profit, cash, customers, payroll, and exit ARR. |
| Sensitivity | Base/downside/upside funding gaps and first cash or reserve breach. |
| Budget | Eight allocation envelopes against driver-based 18-month gross cash uses. |
| Unit Economics | Direct facility contribution and payback, excluding fixed overhead and LTV claims. |
| Inputs | Timing, FX, opening position, churn, collections, fees, costs, service terms, and review status. |
| Pricing | Facility tiers, add-ons, setup prices, CAC, onboarding, and indicative segment TAM. |
| Growth | Pipeline-sizing assumptions, service demand, clinical capacity, and later staffing scale. |
| Scenarios | Editable activity, conversion, cost, churn, collection-delay, and service-demand multipliers. |
| Staff | Loaded employment costs, FTE, hiring windows, retained capacity, and monthly payroll. |
| Costs | Non-payroll project costs, recurring costs, equipment capex, and timing. |
| Funding | Investment receipts, reserve authorisations, and actual exceptional operating costs. |
| Monthly Base / Downside / Upside | Complete monthly cohorts, revenue, costs, tax, working capital, and cash calculations. |
| Checks | Arithmetic reconciliations, unreviewed-input status, budget overrun, and cash warnings. |

## Important modelling conventions

- The original acquisition targets size a pilot pipeline at a fixed reference conversion of 55%. Actual scenario conversion applies once after a one-month free pilot. Fractional cohorts are expected values. Revenue uses average opening/closing paying customers; exit ARR uses closing facility MRR.
- Add-ons are separate from base subscriptions and counted once. Revenue/referral features have no additional fee assumed pending pricing validation.
- Telemedicine belongs to Vitora. Net-agent and gross-principal presentation produce the same EBITDA and cash, with different revenue and provider COGS. The contract-specific accounting decision remains open.
- Collections are based on gross billings with editable lags. Providers accrue separately and can be paid before collections. Uncollectible invoices are expensed and written off. Opening receivables and payables are assumed zero in this version.
- Loaded staff costs are already allocated to programmes. They are not added again to an expenditure envelope. Variable CAC is distinct from sales payroll and fixed marketing overhead.
- Gross programme cash uses include clinician remittances, which patient collections partly fund. Income tax and VAT are bridged separately. The reserve is a cash earmark, not an expense. Authorising reserve use does not create cash or spending.
- The equipment allowance is capex with straight-line depreciation. Training compute is rented by default. Development, datasets and annotation are expensed. No asset sale, opening fixed assets, or development capitalisation is assumed.
- VAT defaults to zero pending advice; that is not a claim of exemption. The model can apply VAT to SaaS/setup invoices, with same-month remittance. Service VAT and transaction-specific rules need review. Income tax is a simplified same-month cash tax after carried-forward forecast losses, not a statutory tax-return calculation.
- Further financing is zero by default. Negative cash and reserve breaches remain visible; the model does not automatically borrow or cancel spending. A first-breach value of zero means no breach within the 60-month horizon, not unlimited runway.
- Rate, amount and timing cells can be edited directly. Programme classifications and the count of staff/cost lines are fixed by the generator. Adding rows requires updating the source and regeneration so all aggregations include the new rows.

## Rebuilding and verification

The generator requires Python 3.10+ and XlsxWriter 3.2.x. A compatible XlsxWriter version is already available in the development environment. Dependency specification: `requirements.txt` in this directory.

From the repository root:

```bash
python3 docs/finance/build_model.py --summary
python3 docs/finance/build_model.py --values-output docs/nexora-750000-financial-model-values.xlsx
python3 -m unittest discover -s docs/finance -v
python3 docs/finance/verify_workbook.py docs/nexora-750000-financial-model.xlsx --compare-defaults
```

To preserve a customised workbook, generate a separate file:

```bash
python3 docs/finance/build_model.py --output /tmp/opencode/nexora-model-review.xlsx --summary
```

The output parent directory must already exist. Regeneration restores source defaults and does **not** import workbook edits.

The generator evaluates its supported formula graph and writes cached results alongside Excel formulas. Tests cover cohort and cash reconciliation, collection timing, VAT and bad debt, gross/net consultation accounting, capex, reserve authorisations, add-on revenue, annual aggregation, and workbook formula/cache integrity. The preview export is tested to contain numeric results with no worksheet formulas.

The editable workbook has also been opened and re-saved by headless LibreOffice Calc 24.2. Its 20,271 formulas produced results matching the generator across all numeric model cells within rounding tolerance. `verify_workbook.py` can inspect any recalculated copy and compare it to the source defaults. This establishes formula compatibility with that Calc version; it does not establish compatibility with every preview extension or replace review of the business assumptions.
