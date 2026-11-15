<!--
Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
Purpose: DHA portal submission evidence for REP-ROUT-001 Routine Health Reporting.
Use: Retest the monthly report endpoints and capture PDF/XLSX exports after their routes are confirmed.
Inputs: Staging Facility 13, Patient 402, and synthetic MOH report periods August through October 2026.
-->

# REP-ROUT-001 — Routine Health Reporting

**Status:** Three months of synthetic source data and monthly report records are ready.

| Report | August | September | October |
| --- | --- | --- | --- |
| MOH 705 | `/api/moh-reports/705/405/` | `/api/moh-reports/705/406/` | `/api/moh-reports/705/407/` |
| MOH 711 | `/api/moh-reports/711/4/` | `/api/moh-reports/711/5/` | `/api/moh-reports/711/6/` |
| MOH 717 | `/api/moh-reports/717/4/` | `/api/moh-reports/717/5/` | `/api/moh-reports/717/6/` |

Use the MOH 705 August record as the primary DHA portal GET endpoint:

```text
https://staging-api.vitora.digital/api/moh-reports/705/405/
```

All records remain `DRAFT` and are clearly marked `DHA-CERT-D2-2026-F13-P402`. Do not claim external DHIS2/KHIS submission until DHA provides the UAT configuration and a real import result is recorded.
