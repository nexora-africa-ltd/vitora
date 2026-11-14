# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
<!-- SEC-INT-001 evidence-package collection instructions. -->

# SEC-INT-001 evidence package

## Purpose

Collect only sanitized staging evidence for DHA **SEC-INT-001 — Data Validation
& Integrity**. The package proves validation, checksum calculation, digital
signature verification, and referential integrity without disclosing clinical,
credential, or cryptographic private material.

## Required captures

| File | Source | Status |
| --- | --- | --- |
| `01-data-integrity-status-response.json` | Authenticated `GET /api/core/security/data-integrity-status/` | Capture after staging deployment |
| `02-invalid-input-validation.txt` | Synthetic future-DOB and malformed-ID `400` responses | Capture during DHA lab |
| `03-attachment-checksum-evidence.txt` | Synthetic claim attachment response plus automated test output | Capture during DHA lab |
| `04-digital-signature-verification.txt` | Synthetic sign/verify and modified-content result | Capture during DHA lab |
| `05-referential-integrity-test-report.txt` | `tests/infrastructure/test_integrity_constraints.py` output | Regenerate before submission |
| `SHA256SUMS.txt` | SHA-256 manifest over final approved files | Generate last |

## Access boundary

Grant the DHA evidence reader the Django permission
`core.view_data_integrity_evidence`; staff status is not required. The
SEC-INT-001 endpoint is evidence-only and cannot trigger a validation test,
file upload, document signature, or database operation.

## Finalization

1. Use only DHA synthetic records.
2. Redact identifiers, timestamps where operationally sensitive, URLs with
   signed query strings, all authentication tokens, and signature values.
3. Obtain required reviewer approval.
4. Generate and verify `SHA256SUMS.txt` only after all evidence is final.
