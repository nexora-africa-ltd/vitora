# PII Encryption Plan — Kenya DPA 2019 Compliance

> **Status**: PLANNING
> **Created**: 2026-05-01
> **Priority**: HIGH — Current plaintext storage of national IDs, phone numbers, and emails violates Kenya Data Protection Act 2019 § 41 (Integrity & Confidentiality).

---

## 1. Problem Statement

The codebase documents Fernet encryption for `national_id` and `phone_number` (copilot-instructions.md, DPIA), but in practice the KMS infrastructure is **only used for billing API credentials** (`FacilityBillingConfig`). All patient and staff PII is stored as plaintext `CharField`/`EmailField` in SQLite/PostgreSQL.

---

## 2. PII Field Inventory

### 2.1 Tier 1 — CRITICAL (Government IDs, must encrypt)

| App | Model | Field | Type | Notes |
|-----|-------|-------|------|-------|
| patients | Patient | `identification_number` | CharField | National ID / Passport |
| patients | Patient | `national_id` | CharField | Legacy field (may be duplicate) |
| patients | Patient | `principal_national_id` | CharField | SHA principal's national ID |
| billing | SHAMember | `national_id` | CharField | SHA member national ID |
| billing | ConsentToken | `identification_number` | CharField | Verification ID |
| core | StaffProfile | `hwr_national_id` | CharField | HWR registry lookup ID |

### 2.2 Tier 2 — HIGH (Contact info, should encrypt)

| App | Model | Field | Type | Notes |
|-----|-------|-------|------|-------|
| patients | Patient | `phone_number` | CharField | |
| patients | Patient | `email` | EmailField | |
| patients | EmergencyContact | `phone_number` | CharField | |
| patients | EmergencyContact | `alternative_phone` | CharField | |
| billing | Payment | `mpesa_phone` | CharField | M-Pesa payment phone |
| core | StaffProfile | `phone_number` | CharField | |
| core | StaffProfile | `emergency_contact_phone` | CharField | |

### 2.3 Tier 3 — MEDIUM (Addresses, encrypt if feasible)

| App | Model | Field | Type | Notes |
|-----|-------|-------|------|-------|
| patients | Patient | `address` | TextField | Physical address |
| core | Organization | `address` | TextField | Business address |
| core | Organization | `contact_phone` | CharField | |
| core | Organization | `contact_email` | EmailField | |

### 2.4 Tier 4 — LOW PRIORITY (Names, tokens, IPs)

| Field Category | Examples | Action |
|----------------|----------|--------|
| Names (first/last/middle) | Patient, StaffProfile, EmergencyContact | Not encrypted — pseudonymization at export instead |
| SHA tokens | `ConsentToken.consent_token`, `auth_guid` | Short-lived (10 min), low risk |
| IP addresses | `AuditLog.ip_address`, `Shift.clock_in_ip` | Retain for compliance auditing |
| Audit details JSON | `AuditLog.details` | May contain old PII values — see § 6 |

### 2.5 Already Encrypted (KMS)

| Model | Field | Provider |
|-------|-------|----------|
| FacilityBillingConfig | `mpesa_consumer_key_encrypted` | KMS (Fernet/Azure/GCP) |
| FacilityBillingConfig | `mpesa_consumer_secret_encrypted` | KMS (Fernet/Azure/GCP) |
| FacilityBillingConfig | `sha_client_secret_encrypted` | KMS (Fernet/Azure/GCP) |

---

## 3. Encryption Architecture

### 3.1 Approach: Application-Layer Field Encryption

Use the existing `KMSProvider` infrastructure (`core/kms/`) for field-level encryption. This is preferred over database-level TDE because:

- Works with SQLite (dev) and PostgreSQL (prod)
- Per-field granularity — only encrypt what's needed
- Key rotation support via KMS providers
- Searchable plaintext fields can use HMAC lookup (see § 3.3)

### 3.2 Field Pattern (Existing — Proven in FacilityBillingConfig)

```python
# Model
class Patient(models.Model):
    # Encrypted storage
    identification_number_encrypted = models.TextField(blank=True, default='')

    # Property getter/setter for transparent access
    @property
    def identification_number(self) -> str:
        if not self.identification_number_encrypted:
            return ''
        return get_kms_provider().decrypt_string(self.identification_number_encrypted)

    @identification_number.setter
    def identification_number(self, value: str) -> None:
        if value:
            self.identification_number_encrypted = get_kms_provider().encrypt_string(value)
        else:
            self.identification_number_encrypted = ''
```

### 3.3 Searchable Encrypted Fields (HMAC Lookup Index)

Some fields need to be searchable (e.g., find patient by national ID). Use a blind index:

```python
class Patient(models.Model):
    identification_number_encrypted = models.TextField(blank=True, default='')
    identification_number_hmac = models.CharField(max_length=64, blank=True, default='', db_index=True)

    @identification_number.setter
    def identification_number(self, value: str) -> None:
        if value:
            self.identification_number_encrypted = get_kms_provider().encrypt_string(value)
            self.identification_number_hmac = get_kms_provider().compute_hmac(value)
        else:
            self.identification_number_encrypted = ''
            self.identification_number_hmac = ''

    @classmethod
    def find_by_identification_number(cls, value: str):
        hmac_val = get_kms_provider().compute_hmac(value)
        return cls.objects.filter(identification_number_hmac=hmac_val)
```

Fields needing search capability:
- `Patient.identification_number` (patient lookup by ID)
- `Patient.phone_number` (duplicate detection)
- `SHAMember.national_id` (SHA eligibility)
- `StaffProfile.hwr_national_id` (HWR verification)

### 3.4 KMS Provider Enhancement

Add `compute_hmac()` method to `KMSProvider` base class:

```python
# core/kms/base.py
import hmac
import hashlib

class KMSProvider:
    def compute_hmac(self, plaintext: str) -> str:
        """Compute HMAC-SHA256 for blind index lookup."""
        key = self._get_hmac_key()
        return hmac.new(key, plaintext.encode(), hashlib.sha256).hexdigest()
```

New env var: `PII_HMAC_KEY` (separate from encryption key for defense in depth).

---

## 4. Migration Strategy

### Phase A: Add Encrypted Fields (Non-breaking)

1. **Migration 1**: Add `*_encrypted` TextField and `*_hmac` CharField columns alongside existing plaintext columns. All nullable/blank defaults.
2. **No code changes yet** — plaintext columns still used by all reads/writes.
3. **Deploy** — zero downtime, no behavior change.

### Phase B: Data Migration (Backfill)

1. **Management command**: `python manage.py encrypt_pii_fields --batch-size=500`
   - Reads each plaintext value
   - Encrypts → writes to `*_encrypted` column
   - Computes HMAC → writes to `*_hmac` column
   - Progress bar, resumable (skips rows where `*_encrypted` is non-empty)
2. **Run in production** during low-traffic window.
3. **Verify**: Count mismatches between plaintext and encrypted columns.

### Phase C: Switch to Encrypted (Code Change)

1. Remove the plaintext `CharField` from model (or rename to `_legacy`).
2. Add `@property` getter/setter on the original field name.
3. Update serializers to use the property (transparent — field name unchanged).
4. Update any `filter()` / `exclude()` calls to use `*_hmac` for lookups.
5. Update admin `search_fields` to use custom search via HMAC.
6. **Deploy** — reads now decrypt, writes now encrypt.

### Phase D: Clean Up (Remove Plaintext)

1. **Migration**: Drop the legacy plaintext columns.
2. **Verify**: All tests pass, all API responses return decrypted values.
3. **Audit**: Confirm no plaintext PII remains in database.

### Rollback Plan

- Phase A/B: Drop new columns (data loss of encrypted copies only, plaintext still intact).
- Phase C: Revert code, plaintext columns still exist with data.
- Phase D: **IRREVERSIBLE** — only proceed after Phase C is verified in production for 1+ week.

---

## 5. Implementation Order

| Sprint | Fields | Models | Est. Effort |
|--------|--------|--------|-------------|
| **Sprint 1** | `identification_number`, `phone_number`, `email` | Patient | Core — highest risk |
| **Sprint 1** | `phone_number`, `alternative_phone` | EmergencyContact | Part of patient data |
| **Sprint 2** | `national_id` | SHAMember | Billing integration |
| **Sprint 2** | `identification_number` | ConsentToken | Billing integration |
| **Sprint 2** | `mpesa_phone` | Payment | Billing integration |
| **Sprint 3** | `hwr_national_id`, `phone_number`, `emergency_contact_phone` | StaffProfile | Staff data |
| **Sprint 3** | `address`, `national_id` (legacy), `principal_national_id` | Patient | Lower-priority patient fields |
| **Sprint 4** | `contact_phone`, `contact_email`, `address` | Organization | Org data |

---

## 6. Audit Log PII Handling

`AuditLog.details` is a JSONField that may contain old/new values of PII fields (e.g., when a phone number is updated, both old and new values are logged).

**Options**:
1. **Encrypt the entire `details` JSONField** — Simple but prevents audit log queries.
2. **Redact PII keys in details at write time** — Replace values with `"[REDACTED]"` for known PII field names.
3. **Encrypt only PII values within the JSON** — Complex, fragile.

**Recommendation**: Option 2 (Redact at write time). Create a `REDACTED_FIELDS` set and filter in `AuditLog.log()`:

```python
REDACTED_FIELDS = {
    'identification_number', 'phone_number', 'email', 'national_id',
    'address', 'mpesa_phone', 'alternative_phone', 'hwr_national_id',
    'principal_national_id', 'emergency_contact_phone',
}

@classmethod
def log(cls, action, user, resource_type, resource_id, **kwargs):
    details = kwargs.get('details', {})
    if isinstance(details, dict):
        for key in REDACTED_FIELDS:
            if key in details:
                details[key] = '[REDACTED]'
            # Handle nested old_values/new_values
            for nested in ('old_values', 'new_values', 'changes'):
                if nested in details and isinstance(details[nested], dict):
                    if key in details[nested]:
                        details[nested][key] = '[REDACTED]'
    kwargs['details'] = details
    # ... continue with log creation
```

---

## 7. PowerSync Considerations

The `sync-streams.yaml` already **excludes** encrypted PII fields from sync. After migration:

- Encrypted fields (`*_encrypted`) must NOT be added to sync streams.
- HMAC fields (`*_hmac`) can be synced for local search (they're one-way hashes).
- Frontend continues to receive decrypted values via API responses.

---

## 8. Environment Variables

| Variable | Purpose | Required By |
|----------|---------|-------------|
| `ENCRYPTION_KEY` | Fernet encryption key (existing) | KMS LocalProvider |
| `PII_HMAC_KEY` | HMAC key for blind index (new) | Searchable encrypted fields |

Add to all 4 deploy surfaces per env var sync checklist.

---

## 9. Testing Strategy

1. **Unit tests**: Encrypt → decrypt roundtrip for each field.
2. **HMAC tests**: Same plaintext → same HMAC, different plaintext → different HMAC.
3. **Search tests**: `find_by_identification_number()` returns correct patient.
4. **Migration tests**: Backfill command encrypts all rows, plaintext matches decrypted.
5. **API tests**: Serializer responses return decrypted values (transparent to frontend).
6. **Admin tests**: Admin search works via HMAC lookup.
7. **Audit log tests**: PII fields are redacted in `details` JSON.

---

## 10. Acceptance Criteria

- [ ] All Tier 1 fields encrypted at rest (identification numbers)
- [ ] All Tier 2 fields encrypted at rest (phone numbers, emails)
- [ ] Searchable fields have HMAC blind indexes
- [ ] `encrypt_pii_fields` management command works and is resumable
- [ ] API responses unchanged (decrypted values returned)
- [ ] Frontend unaware of encryption (transparent)
- [ ] Audit logs redact PII in details JSON
- [ ] PowerSync sync streams do not include `*_encrypted` columns
- [ ] All existing tests pass after migration
- [ ] Key rotation procedure documented
- [ ] `PII_HMAC_KEY` added to all deploy surfaces
