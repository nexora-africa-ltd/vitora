# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.

<!--
Purpose: DHA-facing specification for Vitora HMIS IDSR weekly reporting and DHIS2/KHIS exchange.
Use: Configure, review, approve, preview, submit, and evidence weekly IDSR reports.
Inputs: Active notifiable-disease catalogue, approved DHIS2 mappings, facility organization-unit data, and DHIS2 credentials.
-->

# IDSR Reporting Specification

**System:** Vitora HMIS Surveillance Module
**Reporting format:** Weekly aggregate IDSR / MOH reporting data
**Week standard:** ISO 8601, Monday through Sunday

## 1. Weekly Report Content

Vitora generates an `IDSRWeeklyReport` for an epidemiological year/week. The report aggregates notifiable cases by disease and includes:

- Cases under five years and cases aged five years and above.
- Deaths under five years and deaths aged five years and above.
- Laboratory-confirmed cases.
- Total cases, deaths, immediate cases, and configured outbreak indicators.
- Facility, county, and sub-county reporting context where configured.

The report workflow is:

```text
DRAFT -> PENDING_REVIEW -> APPROVED -> SUBMITTED
                              \-> FAILED
```

Only an approved report can be submitted to DHIS2/KHIS.

## 2. Generation And Review

| Activity             | Mechanism                                                                                               |
| -------------------- | ------------------------------------------------------------------------------------------------------- |
| Scheduled generation | Celery Beat at Sunday 00:00 in the configured Kenya timezone, generating the prior epidemiological week |
| Manual generation    | `POST /api/surveillance/idsr/generate/` with optional `epi_year` and `epi_week`                         |
| Review/approval      | `POST /api/surveillance/idsr/{id}/approve/`                                                             |
| Payload preview      | `GET /api/surveillance/idsr/{id}/dhis2_preview/`                                                        |
| Submit               | `POST /api/surveillance/idsr/{id}/submit_to_dhis2/`                                                     |
| Dashboard            | `GET /api/surveillance/idsr/dashboard/`                                                                 |

The facility reporting officer must review completeness, outbreak indicators, source records, and reporting period before approval. Automated generation does not remove the requirement for authorized review.

## 3. DHIS2/KHIS Exchange

The submission path sends a DHIS2 JSON DataValueSet to the configured DHIS2 endpoint with a 30-second timeout. The system records the response and import summary and marks reports `SUBMITTED` or `FAILED` according to the outcome.

Each disease can map four aggregate indicators:

| Indicator            | Meaning                       |
| -------------------- | ----------------------------- |
| `cases_under_5`      | Cases in children under five  |
| `cases_5_and_above`  | Cases aged five and above     |
| `deaths_under_5`     | Deaths in children under five |
| `deaths_5_and_above` | Deaths aged five and above    |

The reporting period is encoded as `YYYYWww`. Mapping lookup uses approved database mappings before JSON defaults. Nonzero indicators without a mapping are omitted and recorded as unmapped metadata; they must be remediated before production submission.

Vitora also supports ADX and SDMX XML export for controlled exchange or evidence purposes. The current automatic submission path uses JSON DataValueSet, not ADX.

## 4. Required Production Configuration

Before enabling live KHIS/DHIS2 submission, the organization must configure and validate:

- DHIS2 base URL and approved credentials.
- Organization/facility DHIS2 organization-unit identifier.
- Production data-element mappings for all active reportable indicators.
- County HRIO/facility reporting-owner review and sign-off.
- A successful preview and non-production/UAT submission where available.

The repository's bundled mapping data is development/test reference data and must not be treated as production KHIS configuration.

## 5. Facility Tenant Isolation

Scheduled weekly generation iterates active facilities with surveillance enabled and creates or updates one report per facility and epidemiological week. The report is bound to `facility_ref` and its organization, and aggregates only `NotifiableCase` records from that facility. A failure generating one facility's report is recorded without blocking generation for other facilities.

DHIS2 JSON submission and ADX export resolve credentials and organization unit from the report's `facility_ref`. Facility reporting officers remain responsible for review, approval, payload preview, and authorized submission.

## 6. Hub Reporting And Synchronization Status

Surveillance reporting is not currently a hub-syncable workflow. The hub synchronization registry explicitly excludes `NotifiableCase`, surveillance alerts, county notification deliveries, IHR notifications, contact-tracing records, and facility surveillance settings while the workflow remains under planned phase closure. `IDSRWeeklyReport` is not registered as a hub-synchronized model.

Accordingly, facility hubs must not be represented as automatically generating, synchronizing, or submitting IDSR/KHIS reports. Cloud reporting remains authoritative. A hub may retain local clinical data under its offline workflow, but surveillance reporting must be completed through the cloud deployment after the relevant records are available there, or through a separately designed and approved hub reporting capability.

## 7. Audit And Retention

Generation, approval, and submission actions create audit evidence. Submitted report records retain DHIS2 response/import summary data. Facilities must retain report and submission evidence in line with applicable MOH, county, and records-retention requirements.
