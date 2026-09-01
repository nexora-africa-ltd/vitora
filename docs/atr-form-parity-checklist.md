<!--
File purpose: field-by-field parity checklist between the provided PPB ATR form text and the implemented Vitora ATR UI/print workflow.
How to use: review each line item status (exact/partial/missing) when validating ATR compliance and planning gaps.
Supported inputs: source text from FOM20/MIP/PMS/SOP/001 and current implementation in web-app/backend.
-->

# ATR Form Parity Checklist (FOM20/MIP/PMS/SOP/001)

Status legend:

- `exact`: implemented with matching meaning
- `partial`: implemented but not identical in UX/data semantics
- `missing`: not implemented

## Header and submission instructions

| Form line item | Status | Notes |
|---|---|---|
| Form reference `(FOM20/MIP/PMS/SOP/001)` | exact | Printed template includes exact form code. |
| MOH + PPB title block and contacts | exact | Printed template includes board address/phones/email. |
| Severe reaction submission instruction text | partial | Present in print; UI guidance is concise, not full verbatim block. |

## Patient information

| Form line item | Status | Notes |
|---|---|---|
| Patient name | exact | Derived from transfusion/admission patient. |
| Age | partial | Calculated from DOB, not manually entered. |
| Gender (checkboxes) | partial | Stored/displayed as value, not checkbox input UI. |
| Patient No | partial | Implemented as MRN display (`patient_mrn`). |
| Diagnosis | partial | Uses transfusion diagnosis context. |
| Ward | partial | Derived from admission context (`ward_name`) when available. |
| Pre-transfusion HB | exact | Field captured (`pre_transfusion_hb`). |
| Reason for transfusion | partial | Reuses diagnosis/indication context; no separate free-text field named exactly this. |
| Current medications | exact | Captured (`current_medications`). |

## Reaction information

| Form line item | Status | Notes |
|---|---|---|
| 1. General reaction options | exact | Fever, chills/rigors, flushing, nausea/vomiting supported. |
| 2. Dermatological options | exact | Urticaria, other skin rash supported. |
| 3. Cardiac/respiratory options | exact | Chest pain, dyspnoea, hypotension, tachycardia supported. |
| 4. Renal options | exact | Haemoglobinuria, oliguria, anuria supported. |
| 5. Haematological option | exact | Unexplained bleeding supported. |
| 6. Others (specify) | exact | Free-text `other_reactions` supported. |
| Vital signs at start (BP/T/P/R) | exact | Captured/displayed. |
| Vital signs during 15 min (BP/T/P/R) | exact | Captured/displayed. |
| Vital signs at stop (BP/T/P/R) | exact | Captured/displayed. |
| Obstetric history N/A/Gravid/Para | exact | Supported with gravida/para fields. |
| Previous transfusion Yes/No + comment | exact | Supported. |
| Previous reactions Yes/No + comment | exact | Supported. |

## Component information

| Form line item | Status | Notes |
|---|---|---|
| Type of component | exact | Included in ATR print view. |
| Pint No | exact | Mapped to blood unit/bag number. |
| Expiry date | exact | Printed from transfusion-linked unit expiry. |
| Volume transfused | exact | Printed from ATR/transfusion amount. |
| Name of nurse/doctor | partial | Derived from transfusion starter (`started_by_name`), not explicit manual ATR field. |
| Signature | partial | Blank signature line on print; no digital signature capture. |

## Required specimens block

| Form line item | Status | Notes |
|---|---|---|
| Specimen list items 1-5 | exact | Included verbatim-like in print template. |

## Lab investigation (Transfusion manager)

| Form line item | Status | Notes |
|---|---|---|
| 1. Recipient supernatant hemolysis + severity | exact | Supported with present/absent/equivocal + mild/moderate/marked. |
| 2. Recipient agglutination | exact | Present/absent supported. |
| 3. Haematological results WBC/HB/RBC/HCT/MCV/MCH/MCHC/PLT | exact | Structured fields supported. |
| Film RBC/WBC/PLT | exact | Supported. |
| 4. Donor supernatant hemolysis | exact | Present/absent supported. |
| 5. Age of donor pack | exact | Supported (`donor_pack_age`). |
| 6. Culture donor pack results | exact | Supported. |
| 7. Culture recipient blood results | exact | Supported. |
| 8. Compatibility testing (Saline RT/37, AHG, Albumin 37) | exact | Compatible/incompatible matrix supported. |
| 9. Enzyme-treated cells result | exact | Supported. |
| 10. Anti-A and Anti-B titres | exact | Supported. |
| 11. Urinalysis | exact | Supported. |
| 12. Evaluation diagnosis | exact | Supported. |
| 13. Reaction related to transfusion (Yes/No/Inconclusive) | exact | Supported. |

## Reporter details and PPB submission details

| Form line item | Status | Notes |
|---|---|---|
| Name of initial reporter | partial | Auto-derived from authenticated user; no explicit editable name field. |
| Cadre/designation (initial reporter) | exact | Supported (`initial_reporter_cadre`). |
| Mobile no (initial reporter) | exact | Supported (`initial_reporter_mobile`). |
| Email (initial reporter) | exact | Supported (`initial_reporter_email`). |
| Date of report | exact | Auto-recorded (`report_date`). |
| Name of person submitting to PPB (if different) | exact | Supported on submit dialog. |
| Cadre/designation (PPB submitter) | exact | Supported. |
| Mobile no (PPB submitter) | exact | Supported. |
| Email (PPB submitter) | exact | Supported. |
| Date of submission | exact | Auto-recorded (`submission_date`). |

## Footer policy statements

| Form line item | Status | Notes |
|---|---|---|
| "You need not be certain..." slogan | exact | Present in print output. |
| Pharmacovigilance support statement | exact | Present in print output. |
| Non-admission legal statement | exact | Present in print output. |
| Confidentiality + submission instruction paragraph | partial | Present but slightly condensed wording. |

## PPB official use section

| Form line item | Status | Notes |
|---|---|---|
| ADR Report No | exact | Captured during acknowledgment (`adr_report_number`). |
| Date Received | exact | Auto-set when acknowledged (`ppb_date_received`). |
| Vigiflow Entry Number | exact | Captured during acknowledgment (`vigiflow_entry_number`). |
| Date Committed | missing | Currently placeholder in print (`—`). |

## Workflow gap note (non-field, process parity)

| Workflow item | Status | Notes |
|---|---|---|
| Real PPB API credentialed electronic submission | missing | Current `submit-to-ppb` marks local status/metadata only; no external PPB API auth/push. |
