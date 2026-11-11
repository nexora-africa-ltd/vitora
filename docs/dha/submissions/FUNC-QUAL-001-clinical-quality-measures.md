<!--
Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
Purpose: DHA capability submission evidence for FUNC-QUAL-001 Clinical Quality Measures.
Use: Attach the referenced sanitized staging artifacts to the DHA portal after confirming the GET endpoint remains available.
Inputs: Facility 13, Immunization Clinic 43, November 2026 DHA-only synthetic cohort, and the artifacts in FUNC-QUAL-001/.
-->

# FUNC-QUAL-001 — Clinical Quality Measures

**Priority:** Medium
**Test method:** Live System Test
**Status:** **Ready for portal submission** — live staging calculation and PDF/XLSX exports captured on 5 November 2026.

## Capability statement

Vitora captures vaccination source data as scheduled and administered KEPI immunization records, calculates facility-scoped clinical quality measures, persists the numerator/denominator outcome per reporting period, presents tenant-scoped dashboard metrics, and exports quality reports in PDF and XLSX formats.

The DHA demonstration uses **KE-CQM-007 — Under-5 Immunization Completeness** at Facility `13`, Immunization Clinic `43`. The controlled DHA-only cohort has ten eligible children, with eight complete and two outstanding doses:

```text
Numerator:   8 complete children
Denominator: 10 eligible children
Calculation: 8 / 10 × 100 = 80.00%
Target:      90.00% (not met, as expected for the controlled follow-up scenario)
```

## DHA portal endpoint submission

| Portal field | Value |
|---|---|
| Endpoint title | `Retrieve DHA synthetic clinical quality dashboard — FUNC-QUAL-001` |
| HTTP method | `GET` |
| URL | `https://staging-api.vitora.digital/api/quality/dashboard/?year=2026&clinic_id=43` |
| Authentication | Bearer JWT via DHA clinician pre-request script |
| Required header | `X-Facility-ID: 13` |
| Expected result | `200 OK` in under 30 seconds with quality measure, domain, and trend data scoped to Facility 13 |

Use the following authenticated workflow endpoints as supporting evidence; do not submit the `POST` evaluation endpoint as the portal's read endpoint.

```text
POST /api/quality/results/evaluate/
GET  /api/quality/results/?clinic=43&year=2026&period_type=MONTHLY
GET  /api/quality/results/export/?export_format=pdf&year=2026
GET  /api/quality/results/export/?export_format=xlsx&year=2026
```

Evaluation request body:

```json
{
  "clinic_id": 43,
  "year": 2026,
  "period": 11,
  "period_type": "MONTHLY"
}
```

## Captured attachments

All listed payloads contain aggregate DHA synthetic data only; no access token, password, direct identifier, or patient-level data is included.

| Attachment | Evidence |
|---|---|
| `FUNC-QUAL-001/evaluation-response-2026-11.json` | Live calculation response. `KE-CQM-007` is evaluable with numerator `8`, denominator `10`, percentage `80.00`, and a follow-up recommendation. |
| `FUNC-QUAL-001/results-response-2026-11.json` | Persisted Facility 13 / Clinic 43 result, including the rule snapshot, target gap, and calculation timestamp. |
| `FUNC-QUAL-001/dashboard-response-2026.json` | Live tenant-scoped dashboard response for Clinic 43 and 2026. |
| `FUNC-QUAL-001/quality-measure-ke-cqm-007-clinic-43-2026-monthly-11.pdf` | Downloaded single-row PDF quality-measure report. |
| `FUNC-QUAL-001/quality-measure-ke-cqm-007-clinic-43-2026-monthly-11.xlsx` | Downloaded single-row XLSX quality-measure report. |
| `FUNC-QUAL-001/xlsx-content-verification.txt` | Verification that the downloaded XLSX contains Clinic 43's `KE-CQM-007` row: `8`, `10`, `80.00%`. |
| `FUNC-QUAL-001/automated-test-report.txt` | Automated backend and serializer-contract test report: 106 passed. |
| `FUNC-QUAL-001/openapi-quality-endpoints.json` | Extract from the live staging OpenAPI document for the dashboard, result, evaluation, and export routes. |
| `FUNC-QUAL-001/SHA256SUMS.txt` | Integrity checksums for the captured attachment set. |

## Audit observations

- Legacy `KE-CQM-IMM-001 — Under-Five Vaccination Coverage` has been retired on staging and its 30 Facility 13 historical result rows deleted. A live active-measure check confirms that `KE-CQM-007` is the sole active vaccination/immunization quality measure.
- `KE-CQM-011` correctly returns `NOT_EVALUABLE` because the demonstration facility has no tracked stock source data. This is not a failed zero-percent quality score.
- The dashboard is an aggregate view. The persisted result attachment is the authoritative numerator/denominator evidence for the vaccination calculation.

## Final portal checklist

1. Verify the dashboard URL returns `200 OK` with `X-Facility-ID: 13` immediately before submission.
2. Upload the four JSON evidence files, PDF, XLSX, automated-test report, XLSX verification, and checksum manifest.
3. Capture and attach a contemporaneous Quality dashboard UI screenshot for Clinic 43 if the DHA portal requires a visual attachment in addition to the structured response.
4. Use the DHA clinician pre-request script; never paste a live token or credential into the portal.
