<!--
Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
Purpose: Controlled DHA INTER-TERM-001 standard terminology usage evidence package.
Use: Attach the frozen Facility 13 staging artifacts to the DHA portal after verifying the endpoint remains available.
Inputs: Facility 13, ICD-11 BA00, SNOMED CT 38341003, LOINC 57021-8, and the files in this directory.
-->

# INTER-TERM-001 — Standard Terminology Usage Evidence

## Demonstrated standards

| Standard | Code | Description | Release | Evidence |
| --- | --- | --- | --- | --- |
| ICD-11 MMS | `BA00` | Essential hypertension | `2026-01` | DHA Clinical Concepts lookup |
| SNOMED CT | `38341003` | Hypertensive disorder | `20261030` | Vitora release-pinned clinical terminology cache/search |
| LOINC | `57021-8` | CBC W Auto Differential panel - Blood | `2.83` | DHA Clinical Concepts lookup and Facility 13 lab-test assignment |

## Staging evidence run

`standard-usage-response.json` is the successful, authenticated staging response captured at `2026-11-14T22:58:14.359670+00:00` from:

```text
GET /api/terminology/standard-usage/
X-Facility-ID: 13
```

The endpoint fails closed (`503`) if it cannot resolve any required terminology code. `facility-13-loinc-assignment.json` records the successful retrieval of the active synthetic Facility 13 lab catalogue entry carrying the LOINC assignment.

## Rendered UI evidence

- `ui-icd11-ba00-lookup.png` shows the Facility 13 diagnosis-entry ICD-11 search returning `BA00 — Essential hypertension`.
- `ui-loinc-facility-13-assignment.png` shows the active Facility 13 `DHA-TERM-CBC` test catalogue entry with LOINC `57021-8`.
- `ui-diagnosis-entry.png` and `ui-snomed-lookup.png` show the same diagnosis-entry workflow and its SNOMED CT `38341003` search result.

## Evidence integrity

`SHA256SUMS.txt` contains hashes for every frozen attachment in this package. Regenerate it only if an attachment is deliberately replaced.
