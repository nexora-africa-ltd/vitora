# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
<!-- SEC-INT-001 DHA portal narrative. Use with the controlled evidence package below. -->

# SEC-INT-001 — Data Validation & Integrity

## Live-system endpoint

| Portal field | Value |
| --- | --- |
| Endpoint title | Retrieve data validation and integrity control status — SEC-INT-001 |
| HTTP method | `GET` |
| URL | `https://staging-api.vitora.digital/api/core/security/data-integrity-status/` |
| Authentication | DHA staging evidence-reader bearer JWT with `core.view_data_integrity_evidence` |
| Expected response | `200 OK` with sanitized validation, checksum, signature, referential-integrity, and automated-test evidence |

The endpoint is deliberately read-only. It does not create synthetic patients,
upload files, execute signatures, disclose patient data, return attachment
contents/checksums, expose certificate private material, or expose database
schema or credentials.

## DHA lab demonstration

Use DHA-only synthetic data and capture each request/response:

1. `POST /api/patients/` with a future `date_of_birth` returns `400` and a
   `date_of_birth` validation error.
2. `POST /api/patients/` with `identification_type=national_id` and
   `identification_number=NOT-A-NATIONAL-ID` returns `400`. National IDs accept
   only seven or eight decimal digits.
3. `POST /api/encounters/` with a synthetic patient and `weight=-10` returns
   `400` with a `weight` validation error.
4. Upload an allowed synthetic PDF to a test SHA claim at
   `POST /api/sha/claims/{id}/attachments/`; the system calculates and persists
   a SHA-256 checksum. Capture the sanitized attachment metadata response.
5. Sign an eligible synthetic clinical document with
   `POST /api/core/signatures/sign/`, then verify with
   `POST /api/core/signatures/verify/`. The signature service validates the
   X.509 certificate, content hash, and RSA signature. Demonstrate that
   verification reports invalid after an authorized test modification.
6. Demonstrate related-record consistency using a synthetic patient and
   encounter. Retain the automated referential-integrity test report; it covers
   duplicate patient identifiers, active-admission/bed constraints, transactions,
   and foreign-key relations.

## Submission attachments

| Attachment | DHA criterion |
| --- | --- |
| `SEC-INT-001/README.md` | Evidence collection and sanitization instructions |
| `SEC-INT-001/01-data-integrity-status-response.json` | Authenticated live endpoint capture |
| `SEC-INT-001/02-invalid-input-validation.txt` | Future-DOB and malformed-national-ID lab captures |
| `SEC-INT-001/03-attachment-checksum-evidence.txt` | Synthetic upload metadata and checksum test evidence |
| `SEC-INT-001/04-digital-signature-verification.txt` | Sign, verify, and modified-content detection evidence |
| `SEC-INT-001/05-referential-integrity-test-report.txt` | Automated database integrity test output |
| `SEC-INT-001/SHA256SUMS.txt` | Final attachment integrity manifest |

No attachment may contain real patient information, bearer tokens, private
keys, certificates containing private material, storage credentials, or file
contents.
