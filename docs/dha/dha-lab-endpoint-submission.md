<!--
Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
Purpose: DHA laboratory portal evidence matrix for the 21 requested certification capabilities.
Use: seed DHA-only test data, validate each GET URL, capture the listed supporting evidence, then submit each row through the DHA portal.
Inputs: staging API, credentials in secrets/dha_lab_creds.txt, resource IDs from DHA Certification Test Organization, and sanitized screenshots/reports.
-->

# DHA Lab — 21 Capability Evidence Submission Matrix

**Application:** APP-2026-ETXL5Z
**API base:** `https://staging-api.vitora.digital/api/`
**FHIR base:** `https://staging-api.vitora.digital/fhir/`
**DHA test facility header:** `X-Facility-ID: 13`

## Portal rule

For **every portal capability**, submit:

1. One live, externally reachable **GET** endpoint returning a structured payload.
2. A sanitized sample response.
3. Supporting evidence: screenshot, OpenAPI/Swagger excerpt, or automated test report.

FHIR is required for the interoperability rows. Native Vitora API endpoints are the evidence endpoints for the functionality, reporting, and security rows.

## Authentication

Paste the pre-request script from `secrets/dha_lab_prerequest_script.js` into the DHA portal field for every endpoint submission. It embeds the dedicated DHA staging API-reader credential, obtains a short-lived JWT, caches it, and refreshes it only when it expires or is within 60 seconds of expiry. The authentication request is not an attestation endpoint; it is only the secure authentication step required before DHA calls the submitted GET URLs.

```bash
curl --request POST 'https://staging-api.vitora.digital/api/token/' \
  --header 'Content-Type: application/json' \
  --data '{"username":"dha_lab_api","password":"<from-secrets-file>"}'
```

For every endpoint, send:

```text
Authorization: Bearer <access token>
X-Facility-ID: 13
```

Do not place a live access token in the portal: it will expire. The pre-request script is the portal-compatible authentication mechanism for these submissions. Use only the dedicated staging reader account; rotate or disable it immediately after DHA testing.

## Evidence matrix

Replace every `<...>` placeholder with an ID from DHA-only synthetic data. Do not submit a URL until it returns HTTP `200` within 30 seconds.

| # | DHA test case | Endpoint title | GET endpoint evidence | Supporting evidence to attach |
|---:|---|---|---|---|
| 1 | `FUNC-DEMO-001` Patient demographics | Retrieve DHA synthetic patient demographics | `/api/patients/402/` | Patient-registration screenshot; patient serializer/OpenAPI schema; future-DOB validation screenshot. |
| 2 | `FUNC-CPOE-001` CPOE | Retrieve encounter and computerized orders | `/api/encounters/<ENCOUNTER_ID>/` | Medication, lab, imaging, vitals, and billing screenshots; encounter/order response samples. |
| 3 | `FUNC-PROB-001` Problem list | Retrieve coded patient problem list | `/api/encounters/<ENCOUNTER_ID>/diagnoses/` | ICD-11/KENHDD lookup screenshot; diagnosis-history response. |
| 4 | `FUNC-MED-001` Medication/allergy/HPT | Retrieve patient allergy and medication safety data | `/api/patients/402/allergies/` | Current-medications response; allergy-warning screenshot; HPT registry evidence. |
| 5 | `FUNC-CDS-001` CDS | Retrieve evidence-based CDS interventions | `/api/cds/alerts/evidence/?encounter_id=<ENCOUNTER_ID>` | CDS alert screenshot showing trigger, intervention, evidence level, and clinical reference; endpoint response. |
| 6 | `FUNC-SUMM-001` Clinical summary | Retrieve FHIR clinical patient summary | `/fhir/Patient/402/$summary` | Human-readable summary screenshot; exported FHIR Bundle. |
| 7 | `FUNC-EPRES-001` E-prescribing | Retrieve electronic prescription and status | `/api/pharmacy/prescriptions/?patient_id=402` | Prescription and pharmacy-receipt screenshots; prescription-status response. |
| 8 | `FUNC-QUAL-001` Clinical quality measures | Retrieve clinical quality dashboard metrics | `/api/quality/dashboard/?year=2026&clinic_id=<IMMUNIZATION_CLINIC_ID>` | Immunization source-record screenshot; evaluation response for `KE-CQM-007`; tenant-scoped dashboard screenshot; PDF and XLSX result exports; calculation test report. |

### FUNC-QUAL-001 — Clinical quality measures evidence procedure

Use DHA-only synthetic data. The vaccination demonstration uses the canonical **KE-CQM-007 — Under-5 Immunization Completeness** measure and a clinic whose type is `CWC` or `IMMUNIZATION`; it must not be run against a General OPD clinic.

1. Capture source records for eligible children under five through the immunization workflow. For each child, create the due KEPI dose at `POST /api/immunizations/records/`; record completion with `POST /api/immunizations/records/{id}/administer/`.
2. For the selected reporting period, submit `POST /api/quality/results/evaluate/` with `clinic_id`, `year`, `period`, and `period_type`. Retain the response showing the numerator, denominator, calculated percentage, and evaluation status.
3. Confirm the persisted calculation using `GET /api/quality/results/?clinic=<id>&year=<year>&period_type=MONTHLY`, then open `GET /api/quality/dashboard/?year=<year>&clinic_id=<id>` while using the facility context header.
4. Download `GET /api/quality/results/export/?export_format=xlsx&year=<year>` and the equivalent `pdf` export. Confirm both include the vaccination measure, reporting period, numerator, denominator, percentage, and target result.

For the standard audit cohort, ten children with due doses and eight children complete produce **8 / 10 = 80.00%**. A period with no due KEPI records must be labelled `NOT_EVALUABLE`, rather than reported as a zero-performance rate.
| 9 | `REP-IMM-001` Immediate disease reporting | Retrieve DHA synthetic immediate notifiable case | `/api/surveillance/cases/<IMMEDIATE_CASE_ID>/` | Cholera diagnosis and alert screenshots; `GET /api/surveillance/cases/<IMMEDIATE_CASE_ID>/notification_deliveries/` evidence showing the authorized recipient, delivery state, and county acknowledgement; corresponding audit record. |
| 10 | `REP-IDSR-001` IDSR weekly reports | Retrieve weekly IDSR report | `/api/surveillance/idsr/<IDSR_REPORT_ID>/` | Weekly report screenshot; `GET /api/surveillance/idsr/<IDSR_REPORT_ID>/submission_attempts/` confirmation after approved DHIS2/KHIS submission; DHIS2 payload/ADX/SDMX export sample. |
| 11 | `REP-PHE-001` Public-health event detection | Retrieve DHA synthetic detected outbreak alert | `/api/surveillance/alerts/<OUTBREAK_ALERT_ID>/` | Five-case outbreak screenshot; configured threshold; source case `GET /api/surveillance/cases/<OUTBREAK_CASE_ID>/notification_deliveries/` evidence showing delivery to the authorized recipient; generated event report. |
| 12 | `REP-IHR-001` IHR reporting | Retrieve IHR escalation report | `/api/surveillance/ihr/<IHR_REPORT_ID>/` | IHR report screenshot; WHO escalation-path procedure; submitted/report status and external WHO-reference evidence. |
| 13 | `REP-ROUT-001` Routine health reporting | Retrieve a DHA synthetic MOH monthly report | `/api/moh-reports/705/<MOH705_REPORT_ID>/` | MOH 705 review screenshot; source aggregate-data evidence; DHIS2/KHIS preview/submission result. Use the separately validated quarterly/annual report endpoints and export evidence only after their PDF/XLSX routes are confirmed. |
| 14 | `SEC-AUTH-001` Authentication and authorization | Retrieve authenticated staff access profile | `/api/staff/me/` | Login/MFA/RBAC screenshots; role-permission matrix; failed-login, `account_locked`, and `session_idle_revoked` audit evidence. |
| 15 | `SEC-AUDIT-001` Audit trail | Retrieve patient audit-trail entries | `/api/auditlogs/?patient_id=402` | CRUD audit-log screenshot showing actor, timestamp, affected record, and before/after values; retention policy. |
| 16 | `SEC-ENC-001` Encryption | Retrieve HTTPS service health confirmation | `/` (HTTPS health response) | Browser certificate/TLS screenshot; encryption and key-management documents; encrypted-backup evidence. |
| 17 | `SEC-BCK-001` Backup and DR | Retrieve backup-policy/status evidence | `/api/core/onboarding/backup-policy/` **if exposed as GET; otherwise DHA-confirmed health/status endpoint** | Backup schedule, off-site storage evidence, DR plan, restore-test result, RTO/RPO statement. |
| 18 | `SEC-INT-001` Data validation and integrity | Retrieve data-validation and integrity control status | `/api/core/security/data-integrity-status/` | Future-DOB, malformed-ID, and negative-measurement validation captures; checksum, signature, and referential-integrity evidence. |
| 19 | `INTER-HIE-001` Kenya HIE | Retrieve FHIR patient for HIE exchange | `/fhir/Patient/402` | HIE send/receive screenshots, consent evidence, patient-matching result, and HIE transaction audit trail. |
| 20 | `INTER-STD-001` FHIR standards | Retrieve FHIR DiagnosticReport | `/fhir/DiagnosticReport/<DIAGNOSTIC_REPORT_ID>` | Validated FHIR Patient, Encounter, Observation, and DiagnosticReport examples; FHIR R4 validator report. |
| 21 | `INTER-SEM-001` Semantic interoperability | Retrieve semantically coded FHIR Condition | `/fhir/Condition/<CONDITION_ID>` | ICD-11/SNOMED and LOINC mapping evidence; bidirectional exchange screenshot; semantic-validation report. |

## Required pre-submission data

- Patient `402` is ready and synthetic.
- Seed one DHA synthetic encounter containing: coded diagnosis, allergies, active medications, vitals, lab result with LOINC, prescription, and care plan.
- Seed one each: immediate notifiable case with county delivery evidence, IDSR report, outbreak alert with county delivery evidence, IHR report, and MOH 705 routine report.
- Seed a FHIR DiagnosticReport and Condition from the synthetic clinical data.
- Capture all screenshots before the test date; do not use real patient data.

## Validate each endpoint

```bash
curl --silent --show-error --fail --max-time 30 \
  --header "Authorization: Bearer $DHA_ACCESS_TOKEN" \
  --header 'X-Facility-ID: 13' \
  'https://staging-api.vitora.digital/api/patients/402/' | jq .
```

For FHIR endpoints add:

```text
Accept: application/fhir+json
```

## Submission checklist

- [ ] URL is a documented GET endpoint and returns `200` within 30 seconds.
- [ ] Response is from DHA-only synthetic data and is saved as a sanitized sample.
- [ ] Screenshot/test report/document evidence is attached to the matching portal row.
- [ ] DHA receives authentication instructions through its approved secure channel.
- [ ] Every endpoint was retested from outside the internal network immediately before submission.

## Notes

- The PDF lists 22 numbered test cases while claiming 23 total. This matrix follows the 21 portal capability rows requested by DHA; add the terminology row separately if it appears in the portal.
- Confirm the exact reporting route names in Swagger before submission; report IDs must refer to successfully generated DHA synthetic reports.
- OpenAPI: `https://staging-api.vitora.digital/api/schema/`
  Swagger: `https://staging-api.vitora.digital/api/docs/`
