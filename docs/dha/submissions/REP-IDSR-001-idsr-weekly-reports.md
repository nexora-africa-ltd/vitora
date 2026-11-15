<!--
Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
Purpose: DHA portal submission evidence for REP-IDSR-001 IDSR Weekly Reports.
Use: Submit read-only evidence now; add a real UAT import result only after DHA provisions KHIS/DHIS2 access.
Inputs: Staging Facility 13, IDSR report 404 for week 2026W45, and DHA-approved KHIS/DHIS2 configuration when supplied.
-->

# REP-IDSR-001 — IDSR Weekly Reports

**Status:** Approved report and export evidence ready; external DHIS2/KHIS import blocked pending DHA provisioning.

| GET evidence | URL |
| --- | --- |
| Approved weekly report | `https://staging-api.vitora.digital/api/surveillance/idsr/404/` |
| DataValueSet preview | `https://staging-api.vitora.digital/api/surveillance/idsr/404/dhis2_preview/` |
| SDMX export | `https://staging-api.vitora.digital/api/surveillance/idsr/404/export-sdmx/` |
| ADX export | `https://staging-api.vitora.digital/api/surveillance/idsr/404/export-adx/` |
| Submission attempts | `https://staging-api.vitora.digital/api/surveillance/idsr/404/submission_attempts/` |

The report is `APPROVED` for `2026W45`, with one lab-confirmed case each of Cholera, Measles, and Malaria.

## Required DHA action

Facility 13 requires DHA/KHIS-provided UAT base URL, credentials, organisation-unit ID, and approved data-element mappings before `POST .../submit_to_dhis2/` can be used. The current validation result is preserved in `REP-DOMAIN-2-2026-F13/domain2-evidence-index.json`; it must be disclosed, not replaced with a synthetic import result.
