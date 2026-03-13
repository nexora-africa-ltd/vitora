# Active Kenya HIE Integration

> **Gap #27**: Active Kenya HIE Integration  
> **Sprint**: 3.B — Advanced Interoperability  
> **Priority**: P3 (Enhancement)  
> **Status**: ✅ Complete  
> **Completed**: March 13, 2026

---

## Overview

Vitora HMIS has been upgraded from **passive** Client Registry (CR) storage to **active** Health Information Exchange (HIE) participation. The system now:

- **Auto-looks up patients** in the national Client Registry on registration
- **Auto-registers new patients** in the CR when not found
- **Exports aggregate data** in ADX (Aggregate Data Exchange) XML format for DHIS2
- **Shares clinical documents** via the Shared Health Record (SHR) using FHIR Bundles

All HIE operations are **asynchronous** (Celery tasks) to preserve Vitora's offline-first architecture — patient registration is never blocked by external API availability.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                   Active HIE Integration                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Patient Registration                                            │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  1. Patient saved locally (immediate)                    │   │
│  │  2. Celery task fired via transaction.on_commit          │   │
│  │     ┌──────────────────────────────────────────────┐     │   │
│  │     │  lookup_and_register_patient_in_cr()          │     │   │
│  │     │  ┌────────────────┐                           │     │   │
│  │     │  │ CR Fetch       │ ← national_id lookup      │     │   │
│  │     │  │ Found? → store │   via DHA API              │     │   │
│  │     │  │  cr_id         │                           │     │   │
│  │     │  ├────────────────┤                           │     │   │
│  │     │  │ Not found?     │                           │     │   │
│  │     │  │ → CR Register  │ ← push demographics       │     │   │
│  │     │  │ → store cr_id  │   to DHA API              │     │   │
│  │     │  └────────────────┘                           │     │   │
│  │     └──────────────────────────────────────────────┘     │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                  │
│  Aggregate Data Exchange                                         │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  IDSR Weekly Report → ADX XML → DHIS2 /api/dataValueSets│   │
│  │  (Alternative to existing JSON DataValueSet format)      │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                  │
│  Shared Health Record                                            │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  Encounter completed → FHIR IPS Bundle → SHA SHR API    │   │
│  │  On demand: pull patient summary from SHR                │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Components

### 1. Patient Model Updates

**File**: `hmis/apps/patients/models.py`

New field added:

| Field | Type | Description |
|-------|------|-------------|
| `cr_synced_at` | DateTimeField(null) | When last synced with Client Registry |

The existing `cr_number` field stores the CR patient ID.

### 2. CR Async Lookup & Registration

**File**: `hmis/apps/patients/tasks.py`

```python
@shared_task(bind=True, max_retries=3, default_retry_delay=60)
def lookup_and_register_patient_in_cr(self, patient_id: int) -> dict:
    """
    Async CR sync: lookup patient by national_id/identification_number,
    then register if not found.
    """
```

**Flow**:
1. Look up patient in CR using `ClientRegistryService.fetch_client()`
2. If found → store `cr_number` and `cr_synced_at`
3. If not found → register via `ClientRegistryService.register_client()`
4. On failure → retry with 60s delay (max 3 retries)

**Trigger**: Automatically fired after patient creation via `transaction.on_commit()` in `PatientViewSet.perform_create()`.

### 3. ADX Export Service

**File**: `hmis/apps/surveillance/adx_service.py`

```python
class ADXExportService:
    def export_idsr_to_adx(report: IDSRWeeklyReport) -> str  # ADX XML
```

**ADX format** (IHE QRPH ADX profile):

```xml
<?xml version="1.0" encoding="UTF-8"?>
<adx xmlns="urn:ihe:qrph:adx:2015">
  <group orgUnit="FACILITY_001" period="2026W08" dataSet="IDSR_WEEKLY">
    <dataValue dataElement="TOTAL_CASES" value="42"/>
    <dataValue dataElement="TOTAL_DEATHS" value="2"/>
    <dataValue dataElement="IMMEDIATE_CASES" value="5"/>
    <dataValue dataElement="LAB_CONFIRMED" value="15"/>
  </group>
</adx>
```

**API Endpoint**:
```
POST /api/surveillance/idsr-reports/{id}/export_adx/
```

Returns `application/xml` with `Content-Disposition: attachment`.

### 4. SHR Document Sharing

**File**: `hmis/apps/core/fhir/shr_service.py`

```python
class SHRService:
    def push_document(patient, document_bundle: dict) -> dict  # Push to SHR
    def pull_summary(cr_id: str) -> dict | None                # Pull from SHR
```

**Document push**: Sends FHIR IPS/clinical document bundles to Kenya's SHA SHR endpoint (`/v1/shr-submission`).

**Summary pull**: Retrieves patient summary from SHR using CR ID (`/v1/shr/summary/{cr_id}`).

Both methods use `SHAAuthService` for JWT authentication against the Kenya Digital Superhighway.

---

## Configuration

```python
# settings/base.py

# CR auto-lookup on patient registration (async, non-blocking)
HIE_AUTO_CR_LOOKUP = os.getenv("HIE_AUTO_CR_LOOKUP", "true").lower() == "true"

# CR auto-registration when patient not found
HIE_AUTO_CR_REGISTER = os.getenv("HIE_AUTO_CR_REGISTER", "true").lower() == "true"

# Auto-push clinical documents to SHR on encounter completion
HIE_AUTO_SHR_PUSH = os.getenv("HIE_AUTO_SHR_PUSH", "false").lower() == "true"

# Use ADX format for DHIS2 submissions (alternative to JSON DataValueSet)
HIE_ADX_ENABLED = os.getenv("HIE_ADX_ENABLED", "false").lower() == "true"
```

**Default behavior**:
- CR lookup/registration: **enabled** (safe — async, non-blocking)
- SHR document push: **disabled** (requires opt-in per facility)
- ADX format: **disabled** (JSON DataValueSet remains default)

---

## Integration Points

### Patient Creation Flow

```
PatientViewSet.perform_create()
  │
  ├── 1. Save patient locally (immediate)
  ├── 2. Create emergency contacts
  ├── 3. Audit log
  └── 4. transaction.on_commit:
          └── lookup_and_register_patient_in_cr.delay(patient.id)
                │
                ├── CR fetch (by national_id) → found? store cr_number
                └── CR register (if not found) → store cr_number
```

### Existing ClientRegistryService (reused)

**File**: `hmis/apps/billing/services/client_registry.py`

| Method | Description |
|--------|-------------|
| `fetch_client(id_type, id_number)` | Look up patient in national CR |
| `register_client(patient_data)` | Register new patient in CR |
| `update_client(cr_id, updates)` | Update existing CR record |

### Existing SHA/DHIS2 Settings (reused)

| Setting | Purpose |
|---------|---------|
| `SHA_API_BASE_URL` | Base URL for SHA/DHA API |
| `SHA_FHIR_BASE_URL` | FHIR server URL |
| `DHIS2_BASE_URL` | KHIS/DHIS2 instance |
| `DHIS2_ORG_UNIT` | Facility DHIS2 UID |

---

## Frontend Updates

### Patient Types

`web-app/lib/types/patient.ts` and `mobile/lib/types/patient.ts`:
```typescript
export interface Patient {
  // ...existing fields...
  cr_synced_at?: string | null;  // NEW: When last synced with CR
}
```

### Patient Schema

`web-app/lib/schemas/patient.schema.ts`:
```typescript
cr_synced_at: z.string().optional().nullable(),
```

---

## Tests

**File**: `tests/core/test_hie_integration.py`  
**Count**: 18 tests

| Test Class | Tests | Covers |
|------------|:-----:|--------|
| `TestCRAsyncTask` | 5 | CR lookup found, not found + register, fetch error retry, disabled config |
| `TestPatientCreationCRHook` | 3 | Task fired on create, national_id passed, disabled when config off |
| `TestADXExport` | 5 | ADX XML structure, data values, empty report, namespace, API endpoint |
| `TestSHRService` | 5 | Document push, summary pull, auth token, error handling, disabled config |

---

## Migrations

**File**: `hmis/apps/patients/migrations/0015_add_cr_synced_at.py`

Adds `cr_synced_at` DateTimeField to Patient model and HistoricalPatient.

---

## Security Considerations

- **CR lookup uses national_id**: This is encrypted at rest (Fernet). The task decrypts it only for the API call.
- **SHR auth uses JWT**: Tokens obtained via `SHAAuthService` with short expiry and auto-refresh.
- **All CR/SHR operations are audit-logged**: Actions recorded in `AuditLog` with `cr_sync`, `shr_push`, `shr_pull` action types.
- **Failure isolation**: CR/SHR failures never block patient registration or clinical workflows.
