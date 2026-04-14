# Inpatient Pharmacy Stock Gap Catalog

## 1. Inpatient Prescription Link Uses Wrong Identifier

- Status: Confirmed bug
- Symptom: Admission orders link to pharmacy prescription detail using `prescription_number` instead of numeric `id`.
- Impact: Staff can land on an invalid prescription detail URL from the inpatient orders tab, blocking the normal pharmacy dispense flow.
- Proposed fix: Update the inpatient orders tab to link with the prescription `id` and add a component regression test.
- Resolution status: Fixed in current change set.

### Sweep Result

- Completed a targeted frontend sweep for remaining `prescription_number` usages in routes, query params, and API calls.
- No additional app-code replacements were needed after the inpatient orders fix.
- Rule going forward: use `id` for routes and API identifiers; keep `prescription_number` for user-facing labels, printouts, QR payloads, and other business-reference displays.
- Not in scope for this fix: timeline event IDs such as `rx-1`, which belong to the patient-history event contract rather than the pharmacy prescription routing contract.

## 2. Admission-Linked Dispensing Lacks Integration Coverage

- Status: Confirmed gap
- Symptom: Existing tests prove pharmacy dispensing reduces stock, but there is no regression test that an admission-linked prescription item can be dispensed and reduce stock.
- Impact: Inpatient-to-pharmacy stock debit can regress without detection.
- Proposed fix: Add an API integration test that dispenses an admission-linked prescription item through the pharmacy endpoint and asserts batch stock reduction and prescription status update.
- Resolution status: Fixed in current change set.

## 3. Inpatient Consumables Do Not Debit Pharmacy Stock

- Status: Confirmed architectural gap
- Symptom: No inpatient consumables workflow creates `Dispensing` records or updates pharmacy stock batches.
- Impact: Consumables used during admission are not reflected in pharmacy stock, creating inventory drift.
- Proposed fix: Introduce a dedicated consumables stock model and an inpatient issue/use workflow that records stock movements explicitly, with tests for debit and reversal.
- Resolution status: Fixed at backend/API level in current change set.

### Implemented

- Added `InpatientConsumableUsage` as an explicit inpatient stock-usage record linked to an admission and pharmacy stock batch.
- Recording usage now debits the selected stock batch immediately.
- Reversing usage restores stock to the original batch and records the reversal reason and actor.
- Added admission API actions for create, list, and reverse.
- Added pharmacy stock movement report entries for inpatient consumable usage.

### Remaining Follow-up

- Add a dedicated frontend workflow for recording inpatient consumable usage from the admission or kardex UI.
