<!--
Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
Purpose: DHA reporting-domain evidence index for Facility 13's controlled staging dataset.
Use: Attach the sanitized JSON index and the per-capability guides to the DHA portal after retesting each GET endpoint.
Inputs: Staging Facility 13, Patient 402, evidence marker DHA-CERT-D2-2026-F13-P402, and the DHA staging API-reader authentication workflow.
-->

# Domain 2 — Reporting Evidence Index

**Facility:** `13` · **Patient:** `402` · **Environment:** staging
**Evidence marker:** `DHA-CERT-D2-2026-F13-P402`

This directory contains evidence for the five Reporting-domain DHA field-test cases. All records are explicitly synthetic. The immediate county email was sent through Facility 13 SMTP; no DHIS2/KHIS or WHO submission has been claimed or fabricated.

| Test case | GET endpoint | Current evidence state |
| --- | --- | --- |
| `REP-IMM-001` | `/api/surveillance/cases/418/` | County email delivery `6` accepted through SMTP; case is `NOTIFIED`. |
| `REP-IDSR-001` | `/api/surveillance/idsr/404/` | Approved report for `2026W45`; payload preview/export is ready, but DHIS2/KHIS settings are not provisioned. |
| `REP-PHE-001` | `/api/surveillance/alerts/407/` | Five synthetic Measles cases across three days with a configured `5 / 3-day` threshold. |
| `REP-IHR-001` | `/api/surveillance/ihr/404/` | Escalated to National; no WHO transmission or external reference is claimed. |
| `REP-ROUT-001` | `/api/moh-reports/705/405/` | MOH 705, 711, and 717 reports generated for August–October 2026. |

## Authentication and endpoint rules

Use the DHA staging API-reader workflow in [`../../dha-lab-endpoint-submission.md`](../../dha-lab-endpoint-submission.md). Every portal endpoint is an externally reachable authenticated **GET** request with:

```text
Authorization: Bearer <short-lived DHA reader JWT>
X-Facility-ID: 13
```

## DHIS2/KHIS disclosure

The IDSR report deliberately remains `APPROVED`, not `SUBMITTED`. DHA has not provisioned the Facility 13 DHIS2/KHIS base URL, credentials, organisation-unit ID, or production-approved data-element mappings. Attach the validation outcome in `domain2-evidence-index.json` and request the DHA-approved UAT alternative; do not create a synthetic success response.

## Files

| File | Purpose |
| --- | --- |
| `domain2-evidence-index.json` | Sanitized live staging capture of record IDs, workflow states, transport status, and DHIS2/KHIS validation gap. |
| `automated-test-report.txt` | Targeted surveillance and MOH-reporting regression suite: 256 passed, one existing async warning. |
| `SHA256SUMS.txt` | SHA-256 checksums for the structured staging capture and automated test report. |
| `../REP-IMM-001-immediate-disease-reporting.md` | Immediate-reporting endpoint and live county-email evidence procedure. |
| `../REP-IDSR-001-idsr-weekly-reports.md` | IDSR payload/export evidence and DHIS2/KHIS dependency disclosure. |
| `../REP-PHE-001-public-health-event-detection.md` | Outbreak threshold and alert evidence procedure. |
| `../REP-IHR-001-international-concern-reporting.md` | IHR County/National escalation evidence and WHO-reference boundary. |
| `../REP-ROUT-001-routine-health-reporting.md` | Monthly routine-report evidence for MOH 705, 711, and 717. |
