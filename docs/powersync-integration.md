# PowerSync Integration — Single Source of Truth

> **Status**: Phases 1-3 Complete (Infrastructure + Clinical + Pharmacy/Lab/Billing)
> **Last Updated**: April 9, 2026

---

## Overview

PowerSync provides offline-first data sync for the Vitora HMIS web app. It streams data from PostgreSQL → browser SQLite (via WASM) using logical replication, enabling clinicians to work without internet in rural Kenya.

**Architecture:**

```
Browser (SQLite/WASM)  ←→  PowerSync Cloud  ←→  PostgreSQL (Neon)
       ↑ reads locally          ↑ logical replication     ↑ writes via REST
  @powersync/web SDK       sync-rules.yaml           Django REST API
```

- **Reads**: Local SQLite queries (instant, offline-capable)
- **Writes**: `uploadData()` in connector → Django REST API (existing endpoints)
- **Real-time push**: WebSockets (Django Channels) — unchanged, complements PowerSync

---

## Environment Configuration

| Env Var | Where | Dev | Staging | Production |
|---------|-------|-----|---------|------------|
| `NEXT_PUBLIC_POWERSYNC_URL` | Web-app `.env` | *(empty — disabled)* | `https://<id>.powersync.journeyapps.com` | `https://<id>.powersync.journeyapps.com` |
| `POWERSYNC_URL` | Backend `.env` | *(empty)* | Same as above | Same as above |
| `DJANGO_SECRET_KEY` | Backend `.env` | Dev key | Production key | Production key |

- **Local dev**: Leave `NEXT_PUBLIC_POWERSYNC_URL` empty. App runs in API-only mode (React Query → Django). No PowerSync needed.
- **Staging/Production**: PowerSync Cloud connects to Neon PostgreSQL via logical replication.

---

## PowerSync Cloud Configuration

| Setting | Value |
|---------|-------|
| **Region** | EU Central (matches Neon `eu-central-1`) |
| **DB Host** | `ep-patient-cake-almonm9l.c-3.eu-central-1.aws.neon.tech` (**no** `-pooler`) |
| **DB Port** | `5432` |
| **Database** | `neondb` |
| **Username** | `neondb_owner` |
| **SSL Mode** | `require` |
| **Publication** | `powersync` |
| **Certificates** | None (Neon uses publicly trusted CAs, no mTLS) |

### JWT Configuration

| Setting | Value |
|---------|-------|
| **Algorithm** | HS256 |
| **Secret** | `DJANGO_SECRET_KEY` value (SimpleJWT default signing key) |
| **Audience** | `powersync` |
| **Issuer** | `vitora-hmis` |

---

## Files Reference

### Backend

| File | Purpose |
|------|---------|
| `backend/hmis/apps/core/powersync_tokens.py` | Custom JWT serializer — adds `facility_id`, `organization_id`, `iss`, `aud` claims |
| `backend/hmis/settings/base.py` | Registers `TOKEN_OBTAIN_SERIALIZER` in SIMPLE_JWT config |
| `backend/hmis/settings/{staging,production,development}.py` | `POWERSYNC_URL` env var |
| `backend/powersync/powersync.yaml` | PowerSync service config (self-hosted reference) |
| `backend/powersync/sync-rules.yaml` | Defines which tables sync to which users, scoped by tenant |
| `backend/scripts/setup_powersync_replication.sql` | PostgreSQL publication + replication user DDL |
| `backend/tests/test_powersync_tokens.py` | JWT claims tests |

### Web-app

| File | Purpose |
|------|---------|
| `web-app/lib/powersync/schema.ts` | Client-side SQLite schema (mirrors sync rules) |
| `web-app/lib/powersync/connector.ts` | `fetchCredentials()` + `uploadData()` implementation |
| `web-app/lib/powersync/hooks.ts` | `usePowerSyncQuery()`, `usePowerSyncQueryFirst()`, `usePowerSyncDatabase()` |
| `web-app/lib/powersync/index.ts` | Barrel export |
| `web-app/lib/context/sync-context.tsx` | `SyncProvider` wrapping PowerSync SDK |
| `web-app/next.config.js` | COOP/COEP headers + WASM webpack config |

---

## Synced Tables

### Phase 1: Core (Complete)

| Bucket | Table | Scope | Notes |
|--------|-------|-------|-------|
| `global_counties` | `core_county` | All users | 47 counties, rarely changes |
| `global_sub_counties` | `core_subcounty` | All users | ~289 sub-counties |
| `global_wards` | `core_ward` | All users | ~1448 wards |
| `org_patients` | `patients_patient` | Organization | **Excludes** `national_id`, `phone_number`, `identification_number` (encrypted/PII) |
| `facility_encounters` | `encounters_encounter` | Facility | Core clinical data |
| `facility_emergency_contacts` | `patients_emergencycontact` | Organization (via patient) | Emergency contact info |

### Phase 2: Clinical Workflow (Complete)

| Bucket | Table | Scope | Notes |
|--------|-------|-------|-------|
| `global_icd10_codes` | `encounters_icd10code` | All users | ICD-10 lookup (~70K codes, active only) |
| `global_clinical_templates` | `clinical_templates_clinicaltemplate` | All users | Treatment plan templates (active only) |
| `facility_triage` | `triage_triageassessment` | Facility | Triage assessments, KETA categories, vitals |
| `facility_diagnoses` | `encounters_diagnosis` | Facility (via encounter) | ICD-10/11/SNOMED diagnoses |
| `facility_treatment_plans` | `encounters_treatmentplan` | Facility (via encounter) | Treatment plans with follow-up |
| `facility_medications` | `encounters_medication` | Facility (via treatment_plan→encounter) | Prescribed medications |

### Phase 3: Pharmacy, Laboratory, Billing (Complete)

| Bucket | Table | Scope | Notes |
|--------|-------|-------|-------|
| `facility_prescriptions` | `pharmacy_prescription` | Facility | Prescription headers |
| `facility_prescription_items` | `pharmacy_prescriptionitem` | Facility (via prescription) | Prescription line items |
| `facility_lab_orders` | `laboratory_laborder` | Facility | Lab order headers |
| `facility_lab_order_items` | `laboratory_laborderitem` | Facility (via lab_order) | Lab order line items/test list |
| `facility_lab_results` | `laboratory_labresult` | Facility (via order_item→lab_order) | Results (**excludes** file attachments) |
| `facility_invoices` | `billing_invoice` | Facility | Invoice headers (**excludes** `internal_notes`) |

### Never Sync

| Table | Reason |
|-------|--------|
| `core_auditlog` | Write-only, extremely high volume, sensitive |
| `imaging_*` (DICOM) | Binary blobs, too large for client SQLite |
| `core_syncqueue` | Legacy sync infrastructure being replaced |
| `surveillance_*` | Upload-only (write to API, not read locally) |
| `django_session`, `auth_*` | Framework internals |
| Any model with Fernet-encrypted fields | Ciphertext is useless without the key; exposing keys client-side violates Kenya DPA |

---

## Security

### Encrypted Fields Exclusion

Fields encrypted with Fernet (AES-128) are **never** synced to client SQLite:

- `Patient.national_id`
- `Patient.phone_number`
- `Patient.identification_number`

These remain API-only. The detail view fetches them via REST when the user has network access and appropriate permissions.

**Rationale**: Fernet ciphertext in the browser SQLite is useless without the encryption key. Shipping the key client-side would violate Kenya Data Protection Act 2019.

### Tenant Isolation

- Sync rules use `token_parameters.facility_id` and `token_parameters.organization_id` from JWT claims
- A user at Facility A's browser will **never** contain Facility B data
- Global reference data (counties, wards) is safe for all users

### Sensitive Patients

- `is_sensitive=true` patients (HIV, GBV, Mental Health) are synced to the org bucket
- Access control is enforced at the **API layer** (`view_sensitive_patient` permission), not in sync rules
- The sync rules do not filter by `is_sensitive` — this is intentional so the patient record exists locally but the detail view permission check still applies

---

## How It Works

### Read Flow (Offline-capable)

```
Component → usePowerSyncQuery('SELECT * FROM patients_patient WHERE ...') 
         → Local SQLite (instant) → Re-renders on data change
```

### Write Flow (Online required for upload)

```
Component → db.execute('INSERT INTO patients_patient ...') 
         → Local SQLite (immediate) → PowerSync upload queue
         → uploadData() → POST /api/patients/ (Django REST API)
         → PowerSync replicates back to all clients
```

### Fallback (No PowerSync URL configured)

```
Component → useQuery() (React Query) → GET /api/patients/ (Django REST API)
```

This is the default in local development.

---

## Adding a New Table to PowerSync

1. **Backend**: Add the table to the publication in Neon SQL Editor:
   ```sql
   ALTER PUBLICATION powersync ADD TABLE app_modelname;
   ```

2. **Sync Rules**: Add a bucket/data entry in `backend/powersync/sync-rules.yaml`
   - Choose correct scope: `token_parameters.facility_id` or `token_parameters.organization_id`
   - **Never include** Fernet-encrypted or PII fields

3. **Client Schema**: Add a `Table` definition in `web-app/lib/powersync/schema.ts`
   - Column types must match: `column.text`, `column.integer`, `column.real`
   - Add to the `Schema` constructor with the exact PostgreSQL table name as key

4. **Connector** (if writable): Add the table → endpoint mapping in `web-app/lib/powersync/connector.ts` `TABLE_TO_ENDPOINT`

5. **Upload sync rules** to PowerSync Cloud dashboard

6. **Test**: Verify data appears in browser DevTools → Application → IndexedDB

---

## Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| "Publication not found" | Name mismatch | Ensure publication name matches PowerSync Cloud config (`powersync`) |
| No data syncing | Pooler host used | Remove `-pooler` from Neon hostname — logical replication needs direct connection |
| `SharedArrayBuffer` undefined | Missing COOP/COEP headers | Check `next.config.js` headers for `Cross-Origin-Opener-Policy: same-origin` |
| JWT verification fails | Wrong secret | PowerSync Cloud JWT secret must match `DJANGO_SECRET_KEY` exactly |
| Empty local SQLite | Missing `NEXT_PUBLIC_POWERSYNC_URL` | Set the env var (empty = API-only mode) |
| Data from wrong facility | JWT claims missing | Check that `powersync_tokens.py` is registered in SIMPLE_JWT settings |
| 3rd-party embed broken | COEP too strict | We use `credentialless` (not `require-corp`) to mitigate this |
