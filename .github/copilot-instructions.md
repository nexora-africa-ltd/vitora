# Copilot Instructions for Vitora HMIS

## Project Overview
Vitora HMIS is an **offline-first Hospital Management Information System** for Kenya, built with Django backend and Electron desktop app. The system operates standalone without internet (using SQLite) while supporting optional cloud sync for multi-facility deployments.

**Core Architecture**: Modular monolith with offline-first design, FHIR R4 compliance, KHIS/DHIS2 reporting, and Social Health Authority (SHA) claims integration.

## Current Phase: Sprint 0.6 (Integration & Demo)
✅ **Completed**: Sprints 0.1-0.5 (Foundation, Backend, Desktop, Security, Offline Sync)
📊 **Test Coverage**: 248+ tests, ~88% coverage

---

## Critical Context

### Test-Driven Development (TDD) - MANDATORY
Write tests BEFORE implementation. Coverage minimum: **80%** (CI/CD enforced).

```bash
cd backend
poetry run pytest                                  # All tests
poetry run pytest --cov=hmis --cov-fail-under=80   # With coverage
poetry run pytest -k "test_patient"                # Pattern match
poetry run pytest --lf                             # Last failed only
```

### Development Commands
```bash
# Backend (Django + DRF)
cd backend
poetry install && poetry shell    # Setup
make test                         # Tests with 80% coverage
make lint && make format          # Ruff + Black
make quality                      # All checks

# Desktop App (Electron)
cd desktop-app
npm install
npm run dev                       # Backend + Electron
npm test && npm run test:e2e      # Jest + Playwright
```

---

## Architecture Patterns

### 1. Django Apps (`backend/hmis/apps/`)
```
core/           # AuditLog, SyncQueue, SyncConflict, permissions, tasks
patients/       # Patient model with MRN auto-generation, consent tracking
encounters/     # Clinical encounters with vitals validation
```

### 2. Authentication (JWT via SimpleJWT)
```python
# Endpoints in hmis/urls.py
POST /api/token/         # Obtain token (AuditedTokenObtainPairView - logs auth)
POST /api/token/refresh/ # Refresh access token
POST /api/token/verify/  # Verify token validity

# All ViewSets require authentication
permission_classes = [IsAuthenticated, SensitiveAccessPermission]
```

### 3. Audit Logging (Kenya DPA Compliance)
```python
# Use in views after CRUD (see patients/views.py for pattern)
from hmis.apps.core.models import AuditLog
from hmis.apps.core.permissions import get_client_ip

AuditLog.log(
    action="patient_view",  # See ACTION_CHOICES in core/models.py
    user=request.user,
    resource_type="Patient",
    resource_id=obj.id,
    ip_address=get_client_ip(request),
    details={"patient_mrn": obj.mrn},
)
```

### 4. Sensitive Data Access Control
Patients with `is_sensitive=True` (HIV, GBV, Mental Health) need special permission:
```python
# core/permissions.py - SensitiveAccessPermission
# Users need 'patients.view_sensitive_patient' permission
# Access attempts logged automatically (granted and denied)
```

### 5. Offline Sync System (`core/sync.py`, `core/models.py`)
```python
SyncQueue       # Queues CREATE/UPDATE/DELETE for sync
SyncConflict    # Stores local vs remote snapshots
NetworkStatus   # Persists connectivity state
ConnectivityChecker / ConnectivityMonitor  # Network detection

# Background sync via Celery (core/tasks.py)
process_sync_queue.delay(batch_size=100)
```

### 6. MRN Generation
Auto-generated on `Patient.save()`, format: `MRN-YYYYMMDD-XXXX`
```python
# patients/models.py:generate_mrn() - Sequential daily counter
# Example: MRN-20251228-0001
```

---

## Test Fixtures (`tests/conftest.py`)

```python
@pytest.fixture
def api_client():                              # Unauthenticated DRF client
@pytest.fixture
def authenticated_client(api_client, test_user):  # JWT authenticated
@pytest.fixture
def sample_patient(db, test_user):             # Pre-created patient
@pytest.fixture
def sample_encounter(db, sample_patient):      # Pre-created encounter
```

---

## Key Files Reference

| Purpose | Location |
|---------|----------|
| API Routes | `backend/hmis/urls.py` |
| Patient Model/Views | `backend/hmis/apps/patients/` |
| Encounter Model/Views | `backend/hmis/apps/encounters/` |
| AuditLog, SyncQueue | `backend/hmis/apps/core/models.py` |
| Permissions | `backend/hmis/apps/core/permissions.py` |
| Sync Logic | `backend/hmis/apps/core/sync.py` |
| Celery Tasks | `backend/hmis/apps/core/tasks.py` |
| Test Config | `backend/tests/conftest.py` |
| Electron Main | `desktop-app/src/main/index.js` |
| Desktop UI | `desktop-app/src/renderer/` |

---

## Kenya-Specific Requirements

- **Patient identifiers**: `national_id`, `phone_number` (Fernet encrypted)
- **Consent tracking**: `consent_given`, `consent_date` fields
- **Sensitive flag**: `is_sensitive` for HIV/GBV/Mental Health
- **Audit retention**: 7 years per Kenya Data Protection Act 2019
- **DPIA**: See `docs/dpia.md` for compliance documentation

---

## Common Gotchas

1. **Always use `authenticated_client`** - API endpoints require JWT auth
2. **MRN is read-only** - Auto-generated in `save()`, not serializer
3. **Sensitive patients hidden** - `get_queryset()` filters by permission
4. **Audit logs on all CRUD** - Override ViewSet methods (see `patients/views.py`)
5. **Use `poetry add`** - Not pip (manages pyproject.toml)
6. **Desktop has no login UI** - Backend auth ready, UI pending Sprint 0.6

---

## CI/CD Pipeline

GitHub Actions enforces all checks - PRs blocked until passing:
- ✅ Ruff linting (zero warnings)
- ✅ Black formatting
- ✅ Pytest 80% coverage minimum
- ✅ Mypy type checking
- ✅ Bandit security scan

---

## Documentation

| Document | Purpose |
|----------|---------|
| `docs/tdd-guidelines.md` | TDD methodology and examples |
| `docs/coding-standards.md` | Style guide and review process |
| `docs/dpia.md` | Kenya Data Protection compliance |
| `docs/sprint-0.4-deliverables.md` | Security implementation details |
| `docs/sprint-0.5-deliverables.md` | Offline sync implementation |
