# Security Architecture — Tamper-Resistant Audit Logs & Digital Signatures

**Module**: Security Hardening (Sprint 3.C)
**DHA Compliance**: Gaps #31 (Audit Integrity), #32 (Digital Signatures)
**Status**: ✅ Implemented — March 14, 2026
**Last Updated**: March 14, 2026

---

## Table of Contents

1. [Overview](#overview)
2. [Tamper-Resistant Audit Log](#tamper-resistant-audit-log)
   - [Hash Chain Design](#hash-chain-design)
   - [AuditLog Fields](#auditlog-fields)
   - [Integrity Verification](#integrity-verification)
   - [Celery Periodic Verification](#celery-periodic-verification)
   - [API Endpoints](#audit-integrity-api)
   - [Backfill Command](#backfill-command)
3. [X.509 PKI Infrastructure](#x509-pki-infrastructure)
   - [Architecture](#pki-architecture)
   - [Certificate Authority (CA)](#certificate-authority)
   - [User Certificates](#user-certificates)
   - [Certificate Revocation](#certificate-revocation)
   - [Key Storage](#key-storage)
   - [PKI Management Commands](#pki-management-commands)
   - [PKI API Endpoints](#pki-api-endpoints)
4. [Digital Document Signatures](#digital-document-signatures)
   - [Signing Process](#signing-process)
   - [Verification Process](#verification-process)
   - [Supported Document Types](#supported-document-types)
   - [Content Serialization](#content-serialization)
   - [Signing API Endpoints](#signing-api-endpoints)
5. [Threat Model & Mitigations](#threat-model--mitigations)
6. [Deployment & Operations](#deployment--operations)
7. [Testing](#testing)
8. [Frontend Integration](#frontend-integration)

---

## Overview

Sprint 3.C introduces two foundational security features for healthcare compliance:

1. **Tamper-Resistant Audit Logs (Gap #31)** — SHA-256 hash chaining on every audit entry, forming a cryptographic chain that detects any modification, deletion, or reordering of audit records. Meets Kenya DPA 2019 requirements for audit integrity.

2. **Digital Signatures (Gap #32)** — Full X.509 PKI infrastructure with RSA-2048 signatures for clinical documents. Clinicians sign lab results, prescriptions, radiology reports, and discharge summaries, creating non-repudiable evidence of authorship.

### Technology Stack

| Component | Technology | Purpose |
|---|---|---|
| Hash algorithm | SHA-256 | Audit log chaining, document content hashing |
| Signing algorithm | RSA-2048 with PKCS1v15 padding | Clinical document signatures |
| Certificate format | X.509 v3 | CA and user certificates |
| Key encryption at rest | Fernet (AES-128-CBC) via KMS | Private key protection |
| Crypto library | `cryptography` (Python) | All cryptographic operations |
| Revocation | CRL (Certificate Revocation List) | Certificate revocation checking |

---

## Tamper-Resistant Audit Log

### Hash Chain Design

Every `AuditLog` entry includes a SHA-256 hash computed over its content **and the hash of the previous entry**, forming a linked cryptographic chain. Modifying any entry invalidates all subsequent hashes.

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│  Entry #1    │     │  Entry #2    │     │  Entry #3    │
│              │     │              │     │              │
│  prev: 000…0 │────▶│  prev: H(#1) │────▶│  prev: H(#2) │
│  hash: H(#1) │     │  hash: H(#2) │     │  hash: H(#3) │
└──────────────┘     └──────────────┘     └──────────────┘
     genesis               chain link            chain link
```

**Hash computation formula:**

```
payload = "{seq}|{previous_hash}|{action}|{user_id}|{timestamp_iso}|{resource_type}|{resource_id}|{json_details}"
entry_hash = SHA-256(payload)
```

- **Genesis entry**: `previous_hash = "0" * 64` (64 zero characters)
- **Subsequent entries**: `previous_hash = entry_hash` of the immediately preceding entry
- **Details**: Serialized with `json.dumps(details, sort_keys=True, default=str)` for determinism
- **Anonymous entries**: `user_id = 0` when no user is associated

### AuditLog Fields

| Field | Type | Description |
|---|---|---|
| `sequence_number` | `BigIntegerField(unique=True)` | Monotonically increasing sequence, starting at 1 |
| `entry_hash` | `CharField(max_length=64)` | SHA-256 hex digest of this entry's content |
| `previous_hash` | `CharField(max_length=64)` | Hash of the preceding entry (genesis = 64 zeros) |

These fields are computed **inside** `AuditLog.log()` within a database transaction. Callers do not set them directly.

### Concurrency Control

```python
with transaction.atomic():
    # PostgreSQL: SELECT ... FOR UPDATE on last entry
    # SQLite: inherent serialization (no select_for_update needed)
    qs = AuditLog.objects.filter(sequence_number__isnull=False).order_by("-sequence_number")
    if connection.vendor != "sqlite":
        qs = qs.select_for_update()
    last_entry = qs.values("sequence_number", "entry_hash").first()
    # ... compute next_seq, prev_hash, entry_hash ...
    AuditLog.objects.create(sequence_number=next_seq, previous_hash=prev_hash, entry_hash=entry_hash, ...)
```

This ensures chain integrity even under concurrent writes.

### Integrity Verification

**Service**: `hmis.apps.core.services.audit_integrity.AuditIntegrityService`

| Method | Description |
|---|---|
| `verify_chain(start_seq, end_seq)` | Verify hash chain over a range. Returns `IntegrityResult` |
| `verify_latest(count=100)` | Verify the last N entries (quick check) |
| `get_chain_status()` | Summary: total entries, hash coverage, tamper alerts, last verification |

**`IntegrityResult` dataclass:**

```python
@dataclass
class IntegrityResult:
    valid: bool                          # Overall result
    entries_checked: int                 # Number of entries verified
    first_mismatch_seq: int | None       # Sequence number of first failure
    first_mismatch_detail: str           # What went wrong
    errors: list[str]                    # All detected issues
    checked_at: datetime                 # When verification ran
```

**Verification algorithm:**
1. Load entries ordered by `sequence_number` ASC
2. For each entry, recompute `compute_hash()` using stored fields
3. Compare recomputed hash against stored `entry_hash`
4. Verify `previous_hash` matches the preceding entry's `entry_hash`
5. Report first mismatch with details

### Celery Periodic Verification

**Task**: `hmis.apps.core.tasks.verify_audit_chain_integrity`

- **Schedule**: Hourly (via Celery Beat)
- **Scope**: Last 1,000 entries (sliding window)
- **On tamper detection**:
  1. Creates a `Notification` with `priority=CRITICAL`, `notification_type='audit_tamper_detected'` for **all superusers**
  2. Logs the result to `AuditLog` itself (`action='audit_integrity_check'`)
- **On success**: Logs silently to `AuditLog`

### Audit Integrity API

| Method | Endpoint | Permission | Description |
|---|---|---|---|
| `GET` | `/api/core/auditlogs/chain_status/` | Admin only | Chain health summary |
| `POST` | `/api/core/auditlogs/verify_integrity/` | Admin only | Trigger on-demand verification |

**Chain Status Response:**

```json
{
  "total_entries": 45230,
  "chain_length": 45230,
  "last_verified_at": "2026-03-14T10:00:00Z",
  "last_verification_valid": true,
  "tamper_alerts_count": 0,
  "entries_with_hashes": 45230,
  "entries_without_hashes": 0
}
```

**Verify Integrity Response:**

```json
{
  "valid": true,
  "entries_checked": 1000,
  "first_mismatch_seq": null,
  "details": "All 1000 entries verified successfully.",
  "checked_at": "2026-03-14T12:30:00Z"
}
```

### Backfill Command

For deployments that existed before hash chaining was enabled:

```bash
# Preview what would be backfilled
python manage.py backfill_audit_hashes --dry-run

# Backfill hashes (idempotent — skips already-hashed entries)
python manage.py backfill_audit_hashes
```

---

## X.509 PKI Infrastructure

### PKI Architecture

```
┌─────────────────────────────────────────────┐
│            Vitora HMIS PKI                   │
│                                              │
│   ┌───────────────────────────────┐          │
│   │     Root CA (Self-Signed)     │          │
│   │   CN=Vitora HMIS Root CA     │          │
│   │   O=Nexora Africa Ltd        │          │
│   │   C=KE                       │          │
│   │   RSA-2048, 10-year validity  │          │
│   └─────────┬─────────────────────┘          │
│             │ issues                         │
│   ┌─────────▼─────────────────────┐          │
│   │    User Certificates          │          │
│   │   CN=Dr. Jane Smith           │          │
│   │   RSA-2048, 2-year validity   │          │
│   │   Key Usage: Digital Signature│          │
│   └───────────────────────────────┘          │
│                                              │
│   ┌───────────────────────────────┐          │
│   │    CRL (Revocation List)      │          │
│   │   Serial: 4a3f...             │          │
│   │   Reason: KEY_COMPROMISE      │          │
│   └───────────────────────────────┘          │
└─────────────────────────────────────────────┘
```

**Service**: `hmis.apps.core.services.pki_service.PKIService`

### Certificate Authority

**Model**: `CertificateAuthority`

| Field | Purpose |
|---|---|
| `name` | Display name (e.g., "Vitora HMIS Root CA") |
| `serial_number` | Hex serial (auto-generated UUID-based) |
| `subject_dn` | Distinguished Name: `CN={name}, O={org}, C={country}` |
| `certificate_pem` | Self-signed X.509 certificate |
| `public_key_pem` | RSA public key |
| `private_key_pem_encrypted` | RSA private key **encrypted via KMS** |
| `valid_from` / `valid_to` | Validity period (default: 10 years) |
| `key_size` | RSA key bits (default: 2048) |
| `is_root` | Always `True` for now (intermediate CAs not yet implemented) |
| `is_active` | Can be deactivated to stop new issuance |

**X.509 Extensions:**
- `BasicConstraints(ca=True, path_length=None)` — marks as CA
- `KeyUsage(digital_signature=True, key_cert_sign=True, crl_sign=True)` — signing only

### User Certificates

**Model**: `UserCertificate`

Each clinical user who needs to sign documents receives a certificate.

| Field | Purpose |
|---|---|
| `user` | FK to Django User |
| `certificate_authority` | FK to issuing CA |
| `serial_number` | Unique hex serial |
| `subject_dn` | `CN={full_name}, O={org}, C=KE` |
| `certificate_pem` | X.509 certificate signed by CA |
| `public_key_pem` | User's RSA public key |
| `private_key_pem_encrypted` | User's RSA private key **encrypted via KMS** |
| `valid_from` / `valid_to` | Validity (default: 2 years) |
| `is_revoked` | Revocation flag |
| `revocation_reason` | One of: `KEY_COMPROMISE`, `AFFILIATION_CHANGED`, `SUPERSEDED`, `CESSATION`, `PRIVILEGE_WITHDRAWN` |

**X.509 Extensions:**
- `BasicConstraints(ca=False)` — not a CA
- `KeyUsage(digital_signature=True, content_commitment=True)` — signing + non-repudiation

**Properties:**
- `is_expired` — `timezone.now() > valid_to`
- `is_valid` — not revoked AND not expired AND CA is active

### Certificate Revocation

**Model**: `CertificateRevocation`

CRL entries are created when certificates are revoked:

| Field | Purpose |
|---|---|
| `certificate` | FK to revoked `UserCertificate` |
| `revoked_at` | Timestamp of revocation |
| `reason` | Revocation reason (TextChoices) |
| `revoked_by` | FK to admin user who performed revocation |

**CRL Generation**: `PKIService.get_crl(ca)` returns DER-encoded X.509 CRL.

### Key Storage

**All private keys are encrypted at rest** using the configured KMS provider:

```python
from hmis.apps.core.kms import get_kms_provider

kms = get_kms_provider()
encrypted_key = kms.encrypt(private_key_pem_bytes, context={"purpose": "ca_private_key"})
# Stored in DB as: private_key_pem_encrypted
```

| KMS Provider | Configuration | Use Case |
|---|---|---|
| `LocalKMSProvider` | `KMS_PROVIDER=local`, `ENCRYPTION_KEY=<Fernet key>` | Development, single-server |
| `AzureKeyVaultProvider` | `KMS_PROVIDER=azure`, `AZURE_KEY_VAULT_URL=...` | Production (Azure) |
| `GCPKMSProvider` | `KMS_PROVIDER=gcp`, `GCP_PROJECT_ID=...` | Production (GCP) |

**Important**: The `ENCRYPTION_KEY` must be a valid 32-byte url-safe base64-encoded Fernet key. Generate one with:

```bash
python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
```

### PKI Management Commands

#### Initialize Root CA

```bash
# Initialize with defaults (idempotent — skips if active CA exists)
python manage.py init_pki_ca

# Custom options
python manage.py init_pki_ca \
  --name "My Hospital Root CA" \
  --org "My Hospital" \
  --country KE \
  --key-size 4096 \
  --validity-years 15
```

#### Issue User Certificate

```bash
# Issue 2-year certificate for a user
python manage.py issue_user_cert --username dr.smith

# Custom validity
python manage.py issue_user_cert --username dr.smith --validity-years 3
```

### PKI API Endpoints

| Method | Endpoint | Permission | Description |
|---|---|---|---|
| `GET` | `/api/core/certificates/` | Authenticated | List user's certificates (admin sees all) |
| `GET` | `/api/core/certificates/{id}/` | Authenticated | Certificate detail |
| `GET` | `/api/core/certificates/ca/` | Authenticated | List active CAs (public info) |
| `POST` | `/api/core/certificates/issue/` | Admin only | Issue certificate: `{user_id, validity_years}` |
| `POST` | `/api/core/certificates/{id}/revoke/` | Admin only | Revoke: `{reason}` |
| `GET` | `/api/core/certificates/{id}/verify/` | Authenticated | Verify certificate validity |

---

## Digital Document Signatures

### Signing Process

**Service**: `hmis.apps.core.services.signing_service.DocumentSigningService`

```
User clicks "Sign" on a finalized clinical document
        │
        ▼
┌─────────────────────────────────────┐
│  1. Get user's active certificate    │
│     (not revoked, not expired)       │
└─────────────┬───────────────────────┘
              │
              ▼
┌─────────────────────────────────────┐
│  2. Serialize document to canonical  │
│     JSON (deterministic, sorted)     │
└─────────────┬───────────────────────┘
              │
              ▼
┌─────────────────────────────────────┐
│  3. Compute SHA-256 hash of content  │
│     content_hash = SHA-256(JSON)     │
└─────────────┬───────────────────────┘
              │
              ▼
┌─────────────────────────────────────┐
│  4. Decrypt private key via KMS      │
│     key = kms.decrypt(encrypted_pem) │
└─────────────┬───────────────────────┘
              │
              ▼
┌─────────────────────────────────────┐
│  5. Sign content with RSA-2048       │
│     sig = RSA_SIGN(PKCS1v15, SHA256) │
└─────────────┬───────────────────────┘
              │
              ▼
┌─────────────────────────────────────┐
│  6. Store DocumentSignature record   │
│     content_hash, base64(signature)  │
│     + AuditLog entry (document_sign) │
└─────────────────────────────────────┘
```

### Verification Process

```
User or system requests verification
        │
        ▼
┌─────────────────────────────────────┐
│  1. Check certificate validity       │
│     • Not expired                    │
│     • Not revoked                    │
│     • CA is active                   │
└─────────────┬───────────────────────┘
              │
              ▼
┌─────────────────────────────────────┐
│  2. Re-serialize document content    │
│     Same canonical JSON as signing   │
└─────────────┬───────────────────────┘
              │
              ▼
┌─────────────────────────────────────┐
│  3. Compare content hashes           │
│     current_hash == stored_hash?     │
│     (detects document modification)  │
└─────────────┬───────────────────────┘
              │
              ▼
┌─────────────────────────────────────┐
│  4. Verify RSA signature             │
│     public_key.verify(sig, content,  │
│       PKCS1v15, SHA256)              │
└─────────────┬───────────────────────┘
              │
              ▼
┌─────────────────────────────────────┐
│  5. Return VerificationResult        │
│     valid = cert_ok AND content_ok   │
│             AND sig_ok               │
│     + AuditLog (document_verify)     │
└─────────────────────────────────────┘
```

### Supported Document Types

| Document Type | Source Model | Key Signed Fields |
|---|---|---|
| `LabResult` | `laboratory.LabResult` | patient_id, numeric_value, text_value, result_unit, reference range, verification_status, verified_at |
| `Prescription` | `pharmacy.Prescription` | patient_id, prescription_number, prescribed_by, prescribed_at, status, all line items (drug, dosage, frequency, duration, quantity) |
| `Discharge` | `inpatient.Discharge` | patient_id, admission_id, discharge_date, discharge_type, final_diagnosis_text, treatment_summary, discharged_by |
| `RadiologyReport` | `imaging.RadiologyReport` | patient_id, findings, impression, recommendations, status, reported_by |

### Content Serialization

Each document type has a dedicated content extractor that selects the clinically significant fields and serializes them to **canonical JSON** (`json.dumps(data, sort_keys=True, default=str)`).

This ensures:
- **Determinism** — same document always produces the same hash
- **Stability** — non-clinical fields (timestamps on related objects, display names) are excluded
- **Auditability** — any change to signed fields invalidates the signature

### Signing API Endpoints

| Method | Endpoint | Permission | Description |
|---|---|---|---|
| `POST` | `/api/core/signatures/sign/` | Authenticated | Sign a document: `{document_type, document_id}` |
| `POST` | `/api/core/signatures/verify/` | Authenticated | Verify: `{signature_id}` |
| `GET` | `/api/core/signatures/` | Authenticated | List all signatures |
| `GET` | `/api/core/signatures/{id}/` | Authenticated | Signature detail |
| `GET` | `/api/core/signatures/for_document/?type=X&id=Y` | Authenticated | Get signatures for a document |

**Sign Response (201 Created):**

```json
{
  "id": 42,
  "document_type": "LabResult",
  "document_id": 157,
  "signer": 5,
  "signer_username": "dr.smith",
  "signer_full_name": "Dr. Jane Smith",
  "certificate": 3,
  "certificate_serial": "4a3f8c21...",
  "content_hash": "a1b2c3d4e5f6...",
  "signature": "base64_encoded_rsa_signature...",
  "hash_algorithm": "SHA-256",
  "signed_at": "2026-03-14T14:30:00Z",
  "is_valid": true,
  "verification_note": "",
  "created_at": "2026-03-14T14:30:00Z"
}
```

**Verify Response:**

```json
{
  "valid": true,
  "certificate_valid": true,
  "content_match": true,
  "signature_match": true,
  "signer": "Dr. Jane Smith",
  "signed_at": "2026-03-14T14:30:00Z",
  "details": "Signature verified successfully."
}
```

---

## Threat Model & Mitigations

### Audit Log Threats

| Threat | Mitigation |
|---|---|
| **Direct DB modification** of audit entry | Hash chain breaks — detected by `verify_chain()`. Hourly Celery task sends CRITICAL notification to superusers. |
| **Deletion** of audit entry in the middle | Sequence gap detected. Hash of next entry references deleted entry's hash, which no longer exists. |
| **Reordering** of entries | Sequence numbers are monotonic and unique. Reordering breaks both sequence and hash chain. |
| **Appending fake entries** | Without the preceding entry's hash, an attacker cannot compute a valid `entry_hash`. |
| **Modifying the latest entry** | Next entry will reference wrong `previous_hash`. Also detected if re-verification runs. |
| **Concurrent write attacks** | `SELECT ... FOR UPDATE` (PostgreSQL) serializes chain writes within a transaction. |

### PKI Threats

| Threat | Mitigation |
|---|---|
| **Private key theft from DB** | Keys stored encrypted via Fernet/KMS. Decryption requires KMS access. |
| **Compromised user key** | Certificate revocation (CRL). Revoked certs cannot sign new documents. |
| **Forged certificates** | Certificates are signed by the Root CA. Verification checks the full chain. |
| **Expired certificates used for signing** | `is_expired` check in `sign_document()`. Expired certs are rejected. |
| **Signing after employment termination** | Admin revokes certificate. Old signatures remain valid (signed while cert was active). |
| **Document modification after signing** | SHA-256 content hash comparison detects any change. Verification returns `content_match: false`. |
| **Signature replay (reusing sig on different doc)** | Signature includes `document_type` + `document_id`. Content hash is document-specific. |

### What This Does NOT Protect Against

| Scenario | Why | Future Mitigation |
|---|---|---|
| Full DB replacement (wipe + rebuild chain) | Attacker could rebuild all hashes from scratch | External hash anchoring (e.g., blockchain timestamp, external notary) |
| KMS key compromise | All encrypted private keys become accessible | HSM-backed KMS, key ceremony procedures |
| Compromised application server | Can intercept private keys in memory during signing | TEE/SGX enclaves, client-side signing |
| Admin with DB + KMS access | Can forge signatures by decrypting any key | Separation of duties, dual-control for CA operations |

---

## Deployment & Operations

### Initial Setup

```bash
# 1. Generate and set a Fernet encryption key (if not already set)
export ENCRYPTION_KEY=$(python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())")

# 2. Apply migrations
python manage.py migrate

# 3. Backfill hashes for any existing audit entries
python manage.py backfill_audit_hashes

# 4. Initialize the Root CA (one-time per deployment)
python manage.py init_pki_ca

# 5. Issue certificates for clinical staff
python manage.py issue_user_cert --username dr.smith
python manage.py issue_user_cert --username dr.jones
```

### Celery Beat Configuration

Add to your Celery Beat schedule:

```python
CELERY_BEAT_SCHEDULE = {
    'verify-audit-chain': {
        'task': 'hmis.apps.core.tasks.verify_audit_chain_integrity',
        'schedule': 3600.0,  # Every hour
    },
}
```

### Certificate Lifecycle

| Event | Action | Who |
|---|---|---|
| New staff needs signing | `issue_user_cert --username X` or API `POST /api/core/certificates/issue/` | Admin |
| Staff leaves organization | Revoke certificate (reason: `CESSATION` or `PRIVILEGE_WITHDRAWN`) | Admin |
| Key compromise suspected | Revoke certificate (reason: `KEY_COMPROMISE`), issue new one | Admin |
| Certificate expires | Issue new certificate (old one stays for verification of past signatures) | Admin |
| CA certificate expires | Initialize new CA (old CA's certs remain valid for verification until their own expiry) | System admin |

### Monitoring & Alerts

| What to Monitor | How |
|---|---|
| Audit chain integrity | Celery task output + Notification model alerts |
| Tamper alerts | `Notification.objects.filter(notification_type='audit_tamper_detected', is_read=False)` |
| Expiring certificates | `UserCertificate.objects.filter(valid_to__lte=now + 30 days, is_revoked=False)` |
| Signing failures | Application logs (`hmis.apps.core.services.signing_service`) |
| KMS health | `get_kms_provider().is_healthy()` |

---

## Testing

### Test Suites

| File | Tests | Coverage |
|---|---|---|
| `tests/test_audit_integrity.py` | 23 passed, 1 skipped | Hash chaining, tamper detection, API, Celery task, backfill |
| `tests/test_digital_signatures.py` | 33 passed | CA init, cert issuance/revocation, CRL, signing 4 doc types, verification, API |

**Total: 56 tests (1 skipped — SQLite concurrency limitation)**

### Key Test Scenarios

**Audit Integrity:**
- Hash is computed on every `AuditLog.log()` call
- Sequential entries chain correctly (N+1 references hash of N)
- Tamper detection: modified details → `verify_chain()` returns failure
- Tamper detection: modified hash → detected
- Tamper detection: deleted entry → sequence gap detected
- Genesis entry has `previous_hash` of 64 zeros
- Celery task creates CRITICAL notification on tamper
- Backfill command is idempotent

**Digital Signatures:**
- CA generates valid X.509 certificate (self-signed)
- User certificate issuance is signed by CA
- Certificate revocation creates CRL entry
- Sign lab result / prescription → creates `DocumentSignature`
- Verify valid signature → `valid: true`
- Verify tampered document → `valid: false` (content changed)
- User without certificate cannot sign
- Content serialization is deterministic
- API: sign/verify require authentication
- API: issue/revoke require admin

### Running Tests

```bash
# Both suites
poetry run pytest tests/test_audit_integrity.py tests/test_digital_signatures.py -v --no-cov

# Just audit
poetry run pytest tests/test_audit_integrity.py -v --no-cov

# Just signatures
poetry run pytest tests/test_digital_signatures.py -v --no-cov
```

---

## Frontend Integration

### Web App Pages

| Page | Path | Purpose |
|---|---|---|
| Audit Integrity Dashboard | `/admin/audit-integrity` | Chain status, "Verify Now" button, tamper alerts |
| Certificate Management | `/admin/certificates` | List CAs, user certs, issue/revoke |

### Reusable Component

**`<SignatureBadge>`** (`components/shared/signature-badge.tsx`)

Shows the digital signature status on any clinical document detail page:

```tsx
import { SignatureBadge } from '@/components/shared/signature-badge';

// On a lab result detail page:
<SignatureBadge
  documentType="LabResult"
  documentId={labResult.id}
  canSign={currentUser.hasCertificate}
/>
```

States:
- **Unsigned**: "Unsigned" badge with optional "Sign" button
- **Signed**: Green "Signed by Dr. Smith" badge (clickable → opens verification dialog)
- **Verification dialog**: Shows certificate validity, content integrity, RSA signature status

### API Clients (Zod-validated)

| Client | File | Methods |
|---|---|---|
| `auditIntegrityApi` | `lib/api/audit-integrity.ts` | `getChainStatus()`, `verifyIntegrity()` |
| `certificatesApi` | `lib/api/certificates.ts` | `list()`, `get()`, `listCAs()`, `issue()`, `revoke()` |
| `signaturesApi` | `lib/api/certificates.ts` | `list()`, `sign()`, `verify()`, `forDocument()` |

---

## File Reference

### Backend

| File | Purpose |
|---|---|
| `hmis/apps/core/models.py` | `AuditLog` (hash fields), `CertificateAuthority`, `UserCertificate`, `CertificateRevocation`, `DocumentSignature` |
| `hmis/apps/core/services/audit_integrity.py` | `AuditIntegrityService` — hash chain verification |
| `hmis/apps/core/services/pki_service.py` | `PKIService` — X.509 CA, cert issuance, revocation, CRL |
| `hmis/apps/core/services/signing_service.py` | `DocumentSigningService` — sign, verify, content extraction |
| `hmis/apps/core/views.py` | `CertificateViewSet`, `DocumentSignatureViewSet`, audit actions |
| `hmis/apps/core/serializers.py` | Serializers for all PKI/signature models |
| `hmis/apps/core/admin.py` | Admin for CA, UserCertificate, DocumentSignature |
| `hmis/apps/core/tasks.py` | `verify_audit_chain_integrity` Celery task |
| `hmis/apps/core/management/commands/init_pki_ca.py` | Initialize root CA |
| `hmis/apps/core/management/commands/issue_user_cert.py` | Issue user certificate |
| `hmis/apps/core/management/commands/backfill_audit_hashes.py` | Backfill hashes on existing entries |
| `hmis/apps/core/migrations/0026_add_audit_hash_chaining.py` | Hash chain fields migration |
| `hmis/apps/core/migrations/0027_add_pki_and_document_signatures.py` | PKI models migration |
| `tests/test_audit_integrity.py` | 23 audit integrity tests |
| `tests/test_digital_signatures.py` | 33 PKI/signature tests |

### Frontend

| File | Purpose |
|---|---|
| `web-app/lib/types/security.ts` | TypeScript interfaces |
| `web-app/lib/schemas/security.schema.ts` | Zod validation schemas |
| `web-app/lib/api/audit-integrity.ts` | Audit integrity API client |
| `web-app/lib/api/certificates.ts` | Certificates + signatures API client |
| `web-app/app/(dashboard)/admin/audit-integrity/page.tsx` | Audit integrity dashboard |
| `web-app/app/(dashboard)/admin/certificates/page.tsx` | Certificate management page |
| `web-app/components/shared/signature-badge.tsx` | Reusable signature badge component |
| `web-app/lib/config/navigation.ts` | Sidebar entries (Audit Integrity, Certificates) |
