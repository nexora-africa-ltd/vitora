# PowerSync Integration — Single Source of Truth

> **Status**: All phases complete — dual-mode hooks, sync UI, and hybrid PII implemented
> **Last Updated**: April 9, 2026

---

## Overview

PowerSync provides offline-first data sync for the Vitora HMIS web app. It streams data from PostgreSQL → browser SQLite (via WASM) using logical replication, enabling clinicians to work without internet in rural Kenya.

**Architecture:**

```
Browser (SQLite/WASM)  ←→  PowerSync Cloud  ←→  PostgreSQL (Neon)
       ↑ reads locally          ↑ logical replication     ↑ writes via REST
  @powersync/web SDK       sync-streams.yaml         Django REST API
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
| `backend/powersync/sync-streams.yaml` | Sync Streams config (edition 3) — deploy to PowerSync Cloud dashboard |
| `backend/scripts/setup_powersync_replication.sql` | PostgreSQL publication + replication user DDL |
| `backend/tests/test_powersync_tokens.py` | JWT claims tests |

### Web-app — PowerSync Infrastructure

| File | Purpose |
|------|--------|
| `web-app/lib/powersync/schema.ts` | Client-side SQLite schema (mirrors sync streams) |
| `web-app/lib/powersync/connector.ts` | `fetchCredentials()` + `uploadData()` + `SyncUploadEvent` bus |
| `web-app/lib/powersync/hooks.ts` | `usePowerSyncQuery()`, `usePowerSyncQueryFirst()`, `usePowerSyncDatabase()` |
| `web-app/lib/powersync/use-offline-query.ts` | Dual-mode read hook — PowerSync SQL with React Query API fallback |
| `web-app/lib/powersync/use-offline-mutation.ts` | Dual-mode write hook — local SQLite INSERT/UPDATE/DELETE with API fallback |
| `web-app/lib/powersync/sql-builders.ts` | Parameterized SQL builders (`buildListQuery`, `buildInsertQuery`, etc.) |
| `web-app/lib/powersync/transforms.ts` | Row → TypeScript type mappers (12 transform functions) |
| `web-app/lib/powersync/uuid.ts` | Client-side UUID generation (`generateId()`) |
| `web-app/lib/powersync/index.ts` | Barrel export |
| `web-app/lib/context/sync-context.tsx` | `SyncProvider` — `isReady`, `pendingChanges`, `lastError`, CRUD queue polling |
| `web-app/next.config.js` | COOP/COEP headers + WASM webpack config |

### Web-app — Sync UI Components

| File | Purpose |
|------|--------|
| `web-app/components/shared/offline-banner.tsx` | `OfflineBanner` — 4-state banner (offline/back-online/pending/error) |
| `web-app/components/shared/pending-sync-badge.tsx` | `PendingSyncBadge` + `isPendingSync()` helper for placeholder fields |
| `web-app/app/(dashboard)/layout.tsx` | Renders `<OfflineBanner />` above page content |
| `web-app/components/patients/patient-table.tsx` | Uses `PendingSyncBadge` for MRN in desktop column + mobile card |
| `web-app/app/(dashboard)/patients/[id]/page.tsx` | Uses `PendingSyncBadge` for MRN in summary bar |

### Web-app — Migrated Hook Files

| File | Dual-mode hooks |
|------|----------------|
| `web-app/lib/hooks/use-locations.ts` | `useCounties`, `useSubCounties`, `useWards` |
| `web-app/lib/hooks/use-encounter-form.ts` | `useICD10Search` |
| `web-app/lib/hooks/use-clinical-templates.ts` | List, detail, search, by-specialty, active assessment |
| `web-app/lib/hooks/use-patients.ts` | `usePatients`, `usePatient` (hybrid PII), `useCreatePatient`, `useUpdatePatient`, `useDeletePatient`, `usePatientEmergencyContacts`, `usePatientEncounters` |
| `web-app/lib/hooks/use-encounters.ts` | `useEncounters`, `useEncounter`, `useEncounterDiagnoses`, `useEncounterTreatmentPlan`, `useEncounterMedications`, create/update/delete mutations |
| `web-app/lib/hooks/use-triage.ts` | `useTriageAssessment`, `useTriageAssessmentByEncounter`, `useTriageQueue`, create/update mutations |
| `web-app/lib/hooks/use-pharmacy.ts` | `usePrescriptions`, `usePrescription`, by-patient/encounter, `useCreatePrescription` |
| `web-app/lib/hooks/use-laboratory.ts` | `useLabOrders`, `useLabOrder`, by-patient/encounter, `useCreateLabOrder` |
| `web-app/lib/hooks/billing.ts` | `useInvoices`, `useInvoice`, `useOverdueInvoices`, `useCreateInvoice`, `useUpdateInvoice` |

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

These remain API-only. The `usePatient` hook implements a **hybrid PII pattern**:

1. Base patient data loads from local PowerSync SQLite (offline-capable)
2. A supplementary `useQuery` fetches PII fields from the API **only when online** and when the base data source is local
3. The results are merged — PII fields show when available, base data is always present

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

### Dual-Mode Hook Architecture

All data hooks use `useOfflineQuery` (reads) and `useOfflineMutation` (writes) — generic wrappers that internally call both `usePowerSyncQuery` and React Query's `useQuery`/`useMutation`, toggling which is active via `enabled` flags based on `SyncProvider.isReady`.

```
useOfflineQuery({ sql, params, transform, queryKey, queryFn })
  ├─ When PowerSync ready → usePowerSyncQuery(sql, params) → transform(rows) → data
  └─ When API-only mode  → useQuery({ queryKey, queryFn }) → data
```

Both paths are always called (React rules of hooks). The `enabled` flag prevents execution on the inactive path.

### Read Flow (Offline-capable)

```
Component → usePatients() → useOfflineQuery()
  ├─ [PowerSync] SQL with JOINs → Local SQLite (instant) → transformPatientRow()
  └─ [API-only]  React Query → GET /api/patients/ (Django REST API)
```

### Write Flow (Online required for upload)

```
Component → useCreatePatient() → useOfflineMutation()
  ├─ [PowerSync] generateId() → db.execute(INSERT) → Local SQLite (immediate)
  │              → PowerSync upload queue → uploadData() → POST /api/patients/
  │              → Sync-down reconciles local UUID with server PK
  └─ [API-only]  React Query useMutation → POST /api/patients/
```

**Server-generated fields** (MRN, invoice_number, order_number): Set to empty/placeholder on local create. Real values arrive after sync. UI shows `PendingSyncBadge` next to placeholder values.

### Fallback (No PowerSync URL configured)

```
Component → useOfflineQuery() → isReady=false → useQuery() → Django REST API
```

This is the default in local development.

### Sync Status UI

- **`OfflineBanner`**: Rendered in dashboard layout. Shows 4 states: offline (amber), back-online (green), pending writes (blue with count), sync error (red).
- **`PendingSyncBadge`**: Blue outline badge shown next to MRN or other server-generated fields when `isPendingSync()` returns true (null, empty, or `PENDING*` value).
- **`SyncProvider` context**: Exposes `pendingChanges` (polled from `ps_crud` table), `lastError`, `isSyncing`, `lastSyncTime` to all consumers.

---

## Adding a New Table to PowerSync

1. **Backend**: Add the table to the publication in Neon SQL Editor:
   ```sql
   ALTER PUBLICATION powersync ADD TABLE app_modelname;
   ```

2. **Sync Streams**: Add a stream in `backend/powersync/sync-streams.yaml` (edition 3)
   - Choose correct scope: `auth.parameter('facility_id')` or `auth.parameter('organization_id')`
   - **Never include** Fernet-encrypted or PII fields

3. **Client Schema**: Add a `Table` definition in `web-app/lib/powersync/schema.ts`
   - Column types must match: `column.text`, `column.integer`, `column.real`
   - Add to the `Schema` constructor with the exact PostgreSQL table name as key

4. **Connector** (if writable): Add the table → endpoint mapping in `web-app/lib/powersync/connector.ts` `TABLE_TO_ENDPOINT`

5. **Dual-mode hook**: Create or update the module's hook file to use `useOfflineQuery`/`useOfflineMutation`
   - Add a transform function in `transforms.ts` for the new table
   - Use parameterized SQL with JOINs as needed

6. **Upload sync streams** to PowerSync Cloud dashboard → Deploy

7. **Test**: Verify data appears in browser DevTools → Application → IndexedDB

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

---

## Not in Scope (API-only)

These modules have no matching PowerSync tables and remain entirely API-only:

| Module | Reason |
|--------|--------|
| Auth / RBAC / setup pages | Configuration, not clinical data |
| Clinics (`use-clinics.ts`) | Facility config — rarely changes, not needed offline |
| Consultation queue (`use-consultation-queue.ts`) | Separate model, real-time queue management |
| Waiting queue (`useWaitingQueue`) | Separate model from triage assessments |
| Drug catalogue, lab test catalogue | Reference lookups not in sync-streams |
| Dashboard stats / aggregations | Separate optimization concern |
| AI/CDS, SHA claims, DHIS2/HL7 | External integrations requiring connectivity |
| Imaging, inpatient, allied health, MCH | Not yet in sync-streams |
| Audit logs | Write-only, high volume, sensitive |
| Payments, invoice line items | Business validation requiring API roundtrip |
