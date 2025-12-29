# Copilot Instructions for Vitora HMIS

## Project Overview
**Offline-first Hospital Management System** for Kenya: Django backend + Electron desktop app. Operates standalone (SQLite) with optional cloud sync. 82% test coverage, 467+ backend tests.

**Status**: Sprint 0.7 complete - Patient registration with Kenya location hierarchy, emergency contacts, SpO2 vitals.

**Upcoming (Phase 1+)**: FHIR R4 compliance, KHIS/DHIS2 reporting, SHA claims integration.

---

## Before Implementing Code Changes

**Always read these files first** for full project context:
- `ROADMAP.md` - Sprint status, completed features, implementation details
- `README.md` - Architecture decisions, deployment modes, full tech stack

---

## Quick Commands

```bash
# Backend (always from backend/ directory)
cd backend && poetry install && poetry shell
make test        # Pytest + 80% coverage (CI enforced)
make quality     # lint + type-check + security (must pass before PR)
make format      # Black + isort auto-fix

# Desktop App
cd desktop-app && npm install
npm run dev      # Starts backend + Electron
npm test && npm run test:e2e  # Jest + Playwright

# Celery Workers (for background sync)
cd backend && poetry shell
celery -A hmis worker --loglevel=info              # Start worker
celery -A hmis beat --loglevel=info                # Start scheduler (separate terminal)
# Or run both with: celery -A hmis worker -B --loglevel=info
```

---

## Architecture

### Django Apps (`backend/hmis/apps/`)
- **core/**: `AuditLog`, `SyncQueue`, `SyncConflict`, Kenya locations (`County`→`SubCounty`→`Ward`), permissions, Celery tasks
- **patients/**: `Patient` (auto-MRN: `MRN-YYYYMMDD-XXXX`), `EmergencyContact`
- **encounters/**: Clinical visits with vitals (SpO2 critical alert <95%)

### API Structure (`backend/hmis/urls.py`)
```
/api/patients/, /api/encounters/, /api/auditlogs/  # DefaultRouter
/api/locations/{counties,sub-counties,wards}/       # Location hierarchy
/api/patients/<id>/emergency-contacts/              # Nested resource
/api/token/, /api/token/refresh/, /api/token/verify/  # JWT auth
```

### Celery Configuration (`backend/hmis/celery.py`)
- **Broker**: Redis (default `redis://localhost:6379/0`, configure via `CELERY_BROKER_URL`)
- **Key task**: `core.tasks.process_sync_queue` - processes offline changes when online
- **Dev without Redis**: Tests mock Celery; for local sync testing, run `docker run -p 6379:6379 redis`

### Key Patterns

**1. All ViewSets require authentication + audit logging:**
```python
# See patients/views.py - override CRUD methods to add AuditLog.log()
permission_classes = [IsAuthenticated, SensitiveAccessPermission]
```

**2. Sensitive patient filtering** - `is_sensitive=True` (HIV/GBV) hidden unless user has `patients.view_sensitive_patient` permission. See `core/permissions.py:SensitiveAccessPermission`.

**3. Auto-fields in Patient model:**
- `mrn` - auto-generated, read-only
- `registered_by` - set via `serializer.save(registered_by=request.user)` in view

**4. Offline sync** (`core/sync.py`): `ConnectivityChecker` polls server, `SyncQueue` batches changes, Celery task `process_sync_queue` syncs when online.

---

## Test Fixtures (`backend/tests/conftest.py`)

```python
authenticated_client  # Force-authenticated DRF client (use for all API tests)
sample_patient        # Patient with Kenya county/sub-county
sample_encounter      # Encounter linked to sample_patient
sample_county, sample_sub_county, sample_ward  # Kenya location hierarchy
```

**Test file naming**: `test_{feature}.py` (e.g., `test_patient_api.py`, `test_spo2_vital.py`)

---

## Critical Gotchas

1. **Never call API without `authenticated_client`** - all endpoints require JWT
2. **Don't set `mrn` in tests** - auto-generated on `Patient.save()`
3. **Kenya locations required** - Patient needs `county` and `sub_county` in fixtures
4. **Use `poetry add`** not pip - manages `pyproject.toml`
5. **Desktop IPC** - Electron main process (`src/main/index.js`) spawns Django backend on port 9088

---

## Kenya Compliance

- **Encrypted fields**: `national_id`, `phone_number` (Fernet)
- **Consent**: `consent_given`, `consent_date` on Patient
- **Audit retention**: 7 years per Kenya Data Protection Act 2019
- **DPIA**: `docs/dpia.md`
