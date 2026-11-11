<!--
Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
Purpose: DHA portal submission guide for SEC-AUDIT-001 Audit Logging & Trail.
Use: Submit the documented GET endpoint and attach the listed sanitized staging evidence.
Inputs: DHA staging bearer token, X-Facility-ID 13, synthetic patient 402, and the evidence files listed below.
-->

# SEC-AUDIT-001 — Audit Logging & Trail

**Priority:** Critical
**Test method:** Live System Test
**Endpoint submission method:** **GET only** — no POST endpoint is submitted to DHA.

## Endpoint submitted to DHA

| Portal field | Value |
| --- | --- |
| Endpoint title | Retrieve DHA synthetic patient audit-trail entries |
| HTTP method | `GET` |
| URL | `https://staging-api.vitora.digital/api/auditlogs/?patient_id=402&ordering=-timestamp` |
| Authentication | Bearer JWT |
| Tenant header | `X-Facility-ID: 13` |
| Expected response | `200 OK`; paginated audit entries limited to synthetic patient `402` in facility `13` |
| Required display fields | Actor (`user`/`username`), action, timestamp, resource type/ID, patient ID, structured details, and hash-chain sequence fields |

The `patient_id` query parameter is an exact API filter. It must return no entries for other patients.

## GET-only supporting evidence

Use the same DHA staging access token and facility header for each capture. Do not attach bearer tokens, cookies, encrypted identifiers, or unsanitized PII.

```bash
export DHA_ACCESS_TOKEN='<DHA staging token>'
export API_BASE_URL='https://staging-api.vitora.digital'

curl --silent --show-error --fail --max-time 30 \
  --header "Authorization: Bearer ${DHA_ACCESS_TOKEN}" \
  --header 'X-Facility-ID: 13' \
  "${API_BASE_URL}/api/auditlogs/?patient_id=402&ordering=-timestamp" \
  | jq . > 01-patient-402-audit-log-response.json

curl --silent --show-error --fail --max-time 30 \
  --header "Authorization: Bearer ${DHA_ACCESS_TOKEN}" \
  --header 'X-Facility-ID: 13' \
  "${API_BASE_URL}/api/patients/402/history/" \
  | jq . > 02-patient-402-version-history-response.json
```

An authorized facility administrator or Nexora platform user may also capture the read-only integrity summary with GET:

```bash
curl --silent --show-error --fail --max-time 30 \
  --header "Authorization: Bearer ${DHA_ACCESS_TOKEN}" \
  --header 'X-Facility-ID: 13' \
  "${API_BASE_URL}/api/core/auditlogs/chain_status/" \
  | jq . > 03-audit-chain-status-response.json
```

`POST /api/*` endpoints, including manual integrity verification, are operational controls and are **not** part of this DHA endpoint submission.

## Seeded staging evidence

The DHA synthetic patient `402` in facility `13` has idempotent SEC-AUDIT seed entries:

| Evidence | What it demonstrates |
| --- | --- |
| `patient_update` | Actor, timestamp, patient/resource context, and a `changes.village.old/new` before/after record |
| Patient version history | A durable version-history row for the same controlled synthetic update |
| `patient_view` | Read/access activity recorded against the patient |
| Hash fields | Chained sequence number and entry hash on seeded audit entries |

The seed intentionally does **not** fabricate a `patient_delete` audit event. During the DHA live procedure, perform create, read, update, and delete against DHA-approved synthetic test data; then refresh the GET endpoint capture.

## Attachment checklist

Attach the following under `docs/dha/submissions/SEC-AUDIT-001/` after sanitization:

| File | Source | DHA criterion |
| --- | --- | --- |
| `01-patient-402-audit-log-response.json` | GET audit-log response above | User action, timestamp, affected record, before/after details |
| `02-patient-402-version-history-response.json` | GET patient-history response above | Version-history maintenance |
| `03-audit-chain-status-response.json` | GET chain-status response above, facility administrator or platform staff | Tamper-evident chain coverage and status |
| `04-audit-chain-integrity-dashboard.png` | Admin → Audit Integrity (read-only dashboard) | Human-readable chain count, hash coverage, and tamper-alert state |
| `04-audit-log-viewer-patient-402.png` | Admin → Audit Logs filtered to patient 402 | Lab-team review access and filtering — pending a populated UI view |
| `05-audit-log-read-only-admin.png` | Attempted AuditLog edit/delete screen | Audit logs cannot be altered/deleted by administrators |
| `06-patient-history-402.png` | Patient 402 history screen | Human-readable patient-history timeline |
| `07-retention-policy-seven-years.png` | Django Admin → Core → Organizations → Compliance | Seven-year minimum retention configuration |
| `automated-test-report.txt` | Source-controlled backend test run | Regression coverage for filtering, immutability, retention, chaining, and schedule |
| `SHA256SUMS.txt` | `sha256sum` over the captured files | Attachment integrity |

## Control mapping

| DHA pass criterion | Implementation / evidence |
| --- | --- |
| User actions are logged | `AuditLog.log()` captures authenticated actor, action, request/resource context, and time. |
| Before/after data changes are tracked | Patient update audit details and `GET /api/patients/402/history/`. |
| Logs cannot be altered or deleted | Audit API is list/retrieve only; Django Admin denies add/change/delete, including superusers. |
| Version history is maintained | `django-simple-history` records Patient versions; the patient history GET endpoint returns field-level diffs. |
| Logs retained for seven years | Organization retention defaults to 7; validation and database constraint reject lower values. Only Nexora platform staff can extend the setting. |
| Search and filtering work | Audit-log endpoint supports exact `patient_id`, action, resource type, and actor filters. |

## Automated verification

Run from `backend/` before packaging evidence:

```bash
poetry run pytest \
  tests/core/test_audit_log.py \
  tests/core/test_audit_integrity.py \
  tests/core/test_kms.py \
  tests/core/test_history.py \
  tests/core/test_multitenancy.py \
  --no-cov -q
```

Current local verification for this implementation: see the attached `automated-test-report.txt`.

## Submission readiness

The endpoint, seeded read/update audit records, filter coverage, retention guard, and integrity schedule are ready. Capture the listed live-system artifacts, including the DHA-performed CRUD/delete evidence, before marking the DHA portal row as submitted.
