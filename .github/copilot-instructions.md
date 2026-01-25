# Copilot Instructions for Vitora HMIS

> **Purpose**: This document provides comprehensive onboarding context for AI agents working on the Vitora HMIS codebase. Read this ENTIRELY before making any changes.

---

## 🏥 Project Overview

## 🎯 Current Frontend Focus

**Frontend priority is `web-app/` (Next.js).** Implement and stabilize the web frontend first.

Only after the web app implementation is complete should we shift focus to offline-first and platform clients:
- `desktop-app/` (Electron)
- `mobile-app/` (React Native)

### Product & Company Context

**Vitora HMIS** is a **software product** developed by **Nexora Africa Ltd**, an IT company.

> ⚠️ **IMPORTANT**: Vitora is the **name of the software product**, NOT a healthcare facility. When creating placeholder facility names, use generic names like "Demo Health Facility", "Sample Clinic", or "[Facility Name]" - never use "Vitora" as a facility name.

**Vitora HMIS** is an **offline-first Hospital Management Information System** built specifically for **Kenya's healthcare infrastructure**. It addresses the unique challenges of Kenyan healthcare facilities:

- **Unreliable internet** in rural areas
- **Kenya Data Protection Act 2019** compliance requirements
- **KHIS/DHIS2** mandatory health reporting
- **SHA (Social Health Authority)** claims integration
- **FHIR R4** interoperability standards

### Architecture Summary

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           Vitora HMIS Architecture                          │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐       │
│  │  Desktop App    │     │   Mobile App    │     │   Web Frontend  │       │
│  │  (Electron)     │     │  (React Native) │     │    (Next.js)    │       │
│  │  ✅ Phase 0     │     │  📋 Phase 1     │     │   📋 Phase 2    │       │
│  └────────┬────────┘     └────────┬────────┘     └────────┬────────┘       │
│           │                       │                       │                 │
│           └───────────────────────┼───────────────────────┘                 │
│                                   │                                         │
│                         ┌─────────▼─────────┐                               │
│                         │  Django REST API   │                               │
│                         │  (DRF + JWT Auth)  │                               │
│                         │  ✅ Phase 0        │                               │
│                         └─────────┬─────────┘                               │
│                                   │                                         │
│           ┌───────────────────────┼───────────────────────┐                 │
│           │                       │                       │                 │
│  ┌────────▼────────┐    ┌────────▼────────┐    ┌────────▼────────┐         │
│  │    SQLite       │    │     Redis       │    │   PostgreSQL    │         │
│  │  (Standalone)   │    │    (Celery)     │    │    (Cloud)      │         │
│  │  ✅ Default     │    │  📋 Optional    │    │  📋 Phase 2+    │         │
│  └─────────────────┘    └─────────────────┘    └─────────────────┘         │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Current Status (December 2025)

| Component | Status | Tests | Coverage |
|-----------|--------|-------|----------|
| **Backend (Django)** | ✅ Phase 0 Complete | 467+ | 82.21% |
| **Desktop App (Electron)** | ✅ Phase 0 Complete | 66+ unit, 6 E2E | 70%+ |
| **Mobile App (React Native)** | 📋 Planned Phase 1 | - | - |
| **Web Frontend (Next.js)** | 📋 Planned Phase 2 | - | - |

### Completed Features (Sprint 0.1-0.7)
- ✅ Patient registration with auto-MRN (`MRN-YYYYMMDD-XXXX`)
- ✅ Kenya location hierarchy (47 Counties → 289 Sub-Counties → 1448 Wards)
- ✅ Emergency contacts with relationship tracking
- ✅ Clinical encounters with vitals (including SpO2 with critical alerts <95%)
- ✅ Medical history section (allergies, chronic conditions, medications, surgeries, family/social history)
- ✅ JWT authentication with refresh tokens
- ✅ Fernet field-level encryption for sensitive data (national_id, phone_number)
- ✅ Offline sync queue with conflict resolution
- ✅ Audit logging (Kenya DPA 2019 compliant - 7 year retention)
- ✅ ICD-10 diagnosis codes with search
- ✅ Treatment plan templates
- ✅ Sensitive patient filtering (HIV, GBV, Mental Health)

---

## 📁 Project Structure

```
vitora/
├── .github/
│   ├── copilot-instructions.md    # THIS FILE - AI agent onboarding
│   └── workflows/                  # GitHub Actions CI/CD
│
├── backend/                        # Django REST API
│   ├── hmis/
│   │   ├── apps/
│   │   │   ├── core/              # Shared: AuditLog, Sync, Locations, Permissions
│   │   │   ├── patients/          # Patient, EmergencyContact models
│   │   │   ├── encounters/        # Encounter, ICD10Code, TreatmentPlan models
│   │   │   └── clinical_templates/ # ClinicalTemplate for treatment plans
│   │   ├── settings/
│   │   │   ├── base.py            # Common settings
│   │   │   ├── development.py     # DEBUG=True, SQLite
│   │   │   ├── production.py      # DEBUG=False, PostgreSQL
│   │   │   └── test.py            # Test configuration
│   │   ├── celery.py              # Celery config (Redis broker)
│   │   └── urls.py                # API routes
│   ├── tests/                      # All pytest tests
│   │   ├── conftest.py            # Fixtures: authenticated_client, sample_patient, etc.
│   │   └── test_*.py              # Test files by feature
│   ├── data/                       # CSV imports (diseases, ICD-10, Kenya locations)
│   ├── Makefile                    # make test, make quality, make format
│   └── pyproject.toml             # Poetry dependencies
│
├── desktop-app/                    # Electron desktop application
│   ├── src/
│   │   ├── main/
│   │   │   └── index.js           # Main process: backend lifecycle, IPC handlers
│   │   ├── preload/
│   │   │   └── preload.js         # Context bridge: exposes safe APIs to renderer
│   │   └── renderer/
│   │       ├── index.html         # Main HTML
│   │       ├── app.js             # UI logic, patient/encounter forms
│   │       └── styles.css         # Styling with dark mode support
│   ├── tests/
│   │   ├── *.test.js              # Jest unit tests
│   │   └── e2e/                   # Playwright E2E tests
│   ├── package.json
│   ├── jest.config.js
│   └── playwright.config.js
│
├── docs/                           # Sprint deliverables, standards, DPIA
│   ├── sprint-*.md                # Sprint deliverable documents
│   ├── tdd-guidelines.md          # Test-Driven Development process
│   ├── coding-standards.md        # Code style and conventions
│   └── dpia.md                    # Data Protection Impact Assessment
│
├── ROADMAP.md                      # Complete development roadmap (Phase 0-4)
└── README.md                       # Architecture, setup, deployment
```

---

## 🔧 Essential Commands

### Backend Development

```bash
# Navigate to backend (ALWAYS do this first)
cd backend

# Install dependencies (use Poetry, NOT pip)
poetry install
poetry shell  # Activate virtual environment

# Run development server
python manage.py runserver  # Default: http://127.0.0.1:9088

# Database operations
python manage.py migrate                          # Apply migrations
python manage.py createsuperuser                  # Create admin user
python manage.py loaddata data/kenya_locations.csv  # Load Kenya locations
python manage.py import_icd10                     # Import ICD-10 codes

# Testing (CI requires 80% coverage)
make test          # Run pytest with coverage (MUST PASS before PR)
make quality       # Run lint + type-check + security scan (MUST PASS)
make format        # Auto-fix with Black + isort

# Individual quality checks
poetry run ruff check .                 # Linting
poetry run mypy .                       # Type checking
poetry run bandit -r hmis/ -f json     # Security scan
poetry run pytest --cov=hmis --cov-report=term-missing

# Celery (for background sync - optional, requires Redis)
celery -A hmis worker --loglevel=info    # Start worker
celery -A hmis beat --loglevel=info      # Start scheduler
# Or combined: celery -A hmis worker -B --loglevel=info
```

### Desktop App Development

```bash
# Navigate to desktop-app
cd desktop-app

# Install dependencies
npm install

# Development (starts backend + Electron)
npm run dev

# Testing
npm test                    # Jest unit tests
npm run test:coverage       # With coverage report (70% threshold)
npm run test:e2e            # Playwright E2E tests

# Building
npm run build               # All platforms
npm run build:win           # Windows
npm run build:mac           # macOS
npm run build:linux         # Linux
```

### Quick Development Workflow

```bash
# Terminal 1: Backend
cd backend && poetry shell && python manage.py runserver

# Terminal 2: Run tests on save (optional)
cd backend && poetry run pytest-watch

# Terminal 3: Desktop app (uses backend from Terminal 1)
cd desktop-app && npm run dev
```

---

## 📊 Data Models Reference

### Patient Model (`hmis/apps/patients/models.py`)

```python
class Patient(models.Model):
    # Auto-generated (NEVER set manually)
    mrn = models.CharField(unique=True, editable=False)  # Format: MRN-YYYYMMDD-XXXX

    # Required fields
    first_name = models.CharField(max_length=100)
    last_name = models.CharField(max_length=100)
    date_of_birth = models.DateField()  # MUST NOT be in the future
    gender = models.CharField(choices=[('M', 'Male'), ('F', 'Female'), ('O', 'Other')])

    # Kenya location hierarchy (FKs)
    county = models.ForeignKey('core.County')           # 47 Kenya counties
    sub_county = models.ForeignKey('core.SubCounty')    # 289 sub-counties
    ward = models.ForeignKey('core.Ward', null=True)    # 1448 wards (optional)

    # Privacy (ENCRYPTED with Fernet)
    national_id = models.CharField(null=True)           # Encrypted at rest
    phone_number = models.CharField(null=True)          # Encrypted at rest

    # Sensitive access control
    is_sensitive = models.BooleanField(default=False)   # HIV/GBV/Mental Health

    # Consent (Kenya DPA compliance)
    consent_given = models.BooleanField(default=False)
    consent_date = models.DateTimeField(null=True)

    # Tracking
    registered_by = models.ForeignKey(User)             # Auto-set in view
    referral_source = models.CharField(choices=['self', 'clinic', 'other_facility'])

    # Emergency contact (quick access)
    emergency_contact_name = models.CharField(blank=True)
    emergency_contact_phone = models.CharField(blank=True)
    emergency_contact_relationship = models.CharField(blank=True)
```

### Encounter Model (`hmis/apps/encounters/models.py`)

```python
class Encounter(models.Model):
    # Core fields
    patient = models.ForeignKey(Patient, related_name='encounters')
    encounter_type = models.CharField(choices=['OPD', 'IPD', 'EMERGENCY'])
    encounter_date = models.DateField(default=date.today)
    chief_complaint = models.TextField()

    # Vital signs
    temperature = models.DecimalField(null=True)        # Celsius (36.1-37.2 normal)
    pulse = models.IntegerField(null=True)              # BPM (60-100 normal adult)
    blood_pressure = models.CharField(null=True)        # "120/80" format
    respiratory_rate = models.IntegerField(null=True)   # Breaths/min (12-20 normal)
    spo2 = models.DecimalField(null=True)               # Oxygen saturation (95-100% normal)
    weight = models.DecimalField(null=True)             # kg
    height = models.DecimalField(null=True)             # cm

    # Medical history (captured per encounter)
    allergies = models.TextField(blank=True)
    chronic_conditions = models.TextField(blank=True)
    current_medications = models.TextField(blank=True)
    past_surgeries = models.TextField(blank=True)
    family_history = models.TextField(blank=True)
    social_history = models.TextField(blank=True)       # Smoking, alcohol, occupation

    # Critical alert methods
    def has_critical_vitals(self) -> bool:
        """Returns True if SpO2 < 95% (hypoxemia)."""

    def get_alerts(self) -> list[str]:
        """Returns list of critical vital alerts."""
```

### Core Models (`hmis/apps/core/models.py`)

```python
# Kenya Location Hierarchy
class County(models.Model):
    code = models.IntegerField(unique=True)  # 1-47
    name = models.CharField()                 # e.g., "Nairobi", "Mombasa"

class SubCounty(models.Model):
    county = models.ForeignKey(County)
    name = models.CharField()

class Ward(models.Model):
    sub_county = models.ForeignKey(SubCounty)
    name = models.CharField()

# Audit Logging (Kenya DPA 2019 - 7 year retention)
class AuditLog(models.Model):
    user = models.ForeignKey(User, null=True)
    action = models.CharField()              # 'patient_create', 'patient_view', etc.
    resource_type = models.CharField()       # 'Patient', 'Encounter'
    resource_id = models.BigIntegerField()
    timestamp = models.DateTimeField()
    ip_address = models.GenericIPAddressField()
    details = models.JSONField()             # Changes, purpose, etc.

    @classmethod
    def log(cls, action, user, resource_type, resource_id, **kwargs):
        """Create audit log entry. Call this in every ViewSet CRUD method."""

# Offline Sync (Sprint 0.5)
class SyncQueue(models.Model):
    operation = models.CharField(choices=['CREATE', 'UPDATE', 'DELETE'])
    model_name = models.CharField()
    record_id = models.CharField()
    data = models.JSONField()
    status = models.CharField(choices=['PENDING', 'SYNCING', 'SYNCED', 'FAILED', 'CONFLICT'])
    retry_count = models.IntegerField(default=0)

class SyncConflict(models.Model):
    sync_entry = models.ForeignKey(SyncQueue)
    local_data = models.JSONField()
    remote_data = models.JSONField()
    resolution_strategy = models.CharField(choices=['AUTO', 'MANUAL', 'LOCAL_WINS', 'REMOTE_WINS'])
    resolved = models.BooleanField(default=False)
```

---

## 🔌 API Endpoints Reference

### Authentication (JWT)
```
POST   /api/token/           # Login: {username, password} → {access, refresh}
POST   /api/token/refresh/   # Refresh: {refresh} → {access}
POST   /api/token/verify/    # Verify: {token} → 200 OK or 401
```

### Patients
```
GET    /api/patients/                    # List patients (paginated, filterable)
POST   /api/patients/                    # Create patient (auto-generates MRN)
GET    /api/patients/{id}/               # Get patient detail
PATCH  /api/patients/{id}/               # Update patient
DELETE /api/patients/{id}/               # Delete patient (soft delete)

# Nested emergency contacts
GET    /api/patients/{id}/emergency-contacts/
POST   /api/patients/{id}/emergency-contacts/
PATCH  /api/patients/{id}/emergency-contacts/{contact_id}/
DELETE /api/patients/{id}/emergency-contacts/{contact_id}/
```

### Encounters
```
GET    /api/encounters/                  # List encounters
POST   /api/encounters/                  # Create encounter
GET    /api/encounters/{id}/             # Get encounter detail
PATCH  /api/encounters/{id}/             # Update encounter
DELETE /api/encounters/{id}/             # Delete encounter
```

### Kenya Locations (Cascading)
```
GET    /api/locations/counties/                        # All 47 counties
GET    /api/locations/sub-counties/?county={id}        # Sub-counties for county
GET    /api/locations/wards/?sub_county={id}           # Wards for sub-county
```

### Audit Logs
```
GET    /api/auditlogs/                   # List audit logs (admin only)
GET    /api/auditlogs/?user={id}         # Filter by user
GET    /api/auditlogs/?action=patient_view  # Filter by action
```

---

## ✅ Test-Driven Development (TDD) Process

**This project STRICTLY follows TDD. ALWAYS write tests BEFORE implementation.**

### TDD Workflow

```
1. RED    → Write a failing test that defines expected behavior
2. GREEN  → Write minimal code to make the test pass
3. REFACTOR → Improve code while keeping tests green
```

### Test File Conventions

```python
# backend/tests/test_{feature}.py

import pytest # type: ignore
from rest_framework import status

class TestPatientCreation:
    """Tests for patient creation."""

    def test_create_patient_with_valid_data(self, authenticated_client, patient_data):
        """Should create patient and auto-generate MRN."""
        response = authenticated_client.post('/api/patients/', patient_data)

        assert response.status_code == status.HTTP_201_CREATED
        assert response.data['mrn'].startswith('MRN-')
        assert response.data['first_name'] == patient_data['first_name']

    def test_create_patient_without_auth_fails(self, api_client, patient_data):
        """Should reject unauthenticated requests."""
        response = api_client.post('/api/patients/', patient_data)

        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_create_patient_with_future_dob_fails(self, authenticated_client, patient_data):
        """Should reject future date of birth."""
        patient_data['date_of_birth'] = '2030-01-01'
        response = authenticated_client.post('/api/patients/', patient_data)

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert 'date_of_birth' in response.data
```

### Available Test Fixtures (`backend/tests/conftest.py`)

```python
# Authentication
api_client              # Unauthenticated DRF APIClient
test_user               # User instance (username: testuser)
authenticated_client    # APIClient with force_authenticate(test_user)

# Kenya Locations
sample_county           # County(code=1, name="Mombasa")
sample_sub_county       # SubCounty linked to sample_county
sample_ward             # Ward linked to sample_sub_county

# Patient
patient_data            # Dict with valid patient fields (includes county/sub_county)
sample_patient          # Patient instance (Jane Smith, DOB 1985-05-20)

# Encounter
encounter_data          # Dict with valid encounter fields
sample_encounter        # Encounter instance linked to sample_patient
```

### Running Tests

```bash
cd backend

# Run all tests with coverage
make test  # or: poetry run pytest --cov=hmis

# Run specific test file
poetry run pytest tests/test_patient_api.py -v

# Run specific test class
poetry run pytest tests/test_patient_api.py::TestPatientCreation -v

# Run specific test
poetry run pytest tests/test_patient_api.py::TestPatientCreation::test_create_patient_with_valid_data -v

# Run with output (print statements)
poetry run pytest -s

# Run tests matching pattern
poetry run pytest -k "patient and create"
```

---

## ⚠️ Critical Gotchas & Common Mistakes

### 1. Authentication Required on ALL Endpoints

```python
# ❌ WRONG - Will get 401 Unauthorized
def test_get_patients(self, api_client):
    response = api_client.get('/api/patients/')
    assert response.status_code == 200  # FAILS!

# ✅ CORRECT - Use authenticated_client fixture
def test_get_patients(self, authenticated_client):
    response = authenticated_client.get('/api/patients/')
    assert response.status_code == 200
```

### 2. Never Set MRN Manually

```python
# ❌ WRONG - MRN is auto-generated
patient = Patient.objects.create(
    mrn='MRN-12345',  # This will be IGNORED or cause error
    first_name='John',
    ...
)

# ✅ CORRECT - Let the model generate MRN
patient = Patient.objects.create(
    first_name='John',
    last_name='Doe',
    date_of_birth='1990-01-01',
    gender='M',
    county=sample_county,
    sub_county=sample_sub_county,
)
# patient.mrn is now 'MRN-20251230-0001'
```

### 3. Kenya Locations Are Required

```python
# ❌ WRONG - Missing county/sub_county
patient_data = {
    'first_name': 'John',
    'last_name': 'Doe',
    'date_of_birth': '1990-01-01',
    'gender': 'M',
}

# ✅ CORRECT - Include county and sub_county
patient_data = {
    'first_name': 'John',
    'last_name': 'Doe',
    'date_of_birth': '1990-01-01',
    'gender': 'M',
    'county': sample_county.id,
    'sub_county': sample_sub_county.id,
}
```

### 4. Use Poetry, Not Pip

```bash
# ❌ WRONG - Breaks dependency tracking
pip install some-package

# ✅ CORRECT - Updates pyproject.toml
poetry add some-package
poetry add --group dev some-dev-package
```

### 5. Date of Birth Validation

```python
# ❌ WRONG - Future dates are rejected
patient_data = {
    'date_of_birth': '2030-01-01',  # ValidationError!
    ...
}

# ✅ CORRECT - Past or today
patient_data = {
    'date_of_birth': '1990-01-01',
    ...
}
```

### 6. Sensitive Patient Access

```python
# Patients with is_sensitive=True (HIV, GBV, Mental Health)
# are HIDDEN from users without 'patients.view_sensitive_patient' permission

# Grant permission for tests
from django.contrib.auth.models import Permission
permission = Permission.objects.get(codename='view_sensitive_patient')
test_user.user_permissions.add(permission)
```

### 7. registered_by Is Set in View, Not Serializer

```python
# In views.py
def perform_create(self, serializer):
    serializer.save(registered_by=self.request.user)  # Auto-set

# In tests - don't include registered_by in patient_data
patient_data = {
    'first_name': 'John',
    # 'registered_by': user.id,  # NOT NEEDED - set automatically
    ...
}
```

### 8. Desktop App Ports

```
Backend (Django):  http://127.0.0.1:9088  (dev) or http://127.0.0.1:9088 (Electron)
Electron spawns backend on port 9088 when running via `npm run dev`
```

---

## 🔐 Security & Compliance

### Kenya Data Protection Act 2019 Compliance

| Requirement | Implementation |
|-------------|----------------|
| **Data Minimization** | Only collect necessary patient data |
| **Purpose Limitation** | `AuditLog.details['purpose']` tracks processing purpose |
| **Storage Limitation** | 7-year audit log retention |
| **Integrity & Confidentiality** | Fernet encryption for national_id, phone_number |
| **Accountability** | Full audit trail on all data access |
| **Data Subject Rights** | Export/delete patient data via API |

### Encrypted Fields

```python
# These fields are encrypted at rest using Fernet (AES-128)
Patient.national_id   # Encrypted
Patient.phone_number  # Encrypted

# Encryption key configured in settings
ENCRYPTION_KEY = os.getenv('ENCRYPTION_KEY')  # 32-byte Fernet key
```

### Sensitive Patient Filtering

```python
# Patients with is_sensitive=True require special permission
# See: hmis/apps/core/permissions.py

class SensitiveAccessPermission(permissions.BasePermission):
    """
    Only allows access to sensitive patients if user has
    'patients.view_sensitive_patient' permission.
    """
```

### Audit Log Actions

```python
# All these actions are logged automatically
'login_success', 'login_failed', 'logout'
'patient_create', 'patient_view', 'patient_update', 'patient_delete'
'encounter_create', 'encounter_view', 'encounter_update', 'encounter_delete'
'view_sensitive_patient', 'sensitive_access_denied'
'data_export'
```

---

## 🗺️ Development Roadmap Summary

| Phase | Timeline | Focus | Key Deliverables |
|-------|----------|-------|------------------|
| **Phase 0** ✅ | Jan-Mar 2026 | Foundation | Desktop app, Backend API, Offline sync |
| **Phase 1** 📋 | Apr-Sep 2026 | Clinical Core | Encounters, Pharmacy, Billing, Mobile app, Pilots |
| **Phase 2** 📋 | Oct 2026-Mar 2027 | Integration | SHA claims, KHIS/DHIS2, Cloud sync, Web frontend |
| **Phase 3** 📋 | Apr-Sep 2027 | Expansion | MCH, Imaging, BI, Multi-site |
| **Phase 4** 📋 | Oct-Dec 2027 | Advanced | AI/ML, Global scaling |

### Upcoming Sprint Details

**Phase 1, Sprint 1.1-1.2 (Weeks 1-4)**:
- Track A: Encounter management (vitals, diagnosis, treatment plans)
- Track B: Mobile app foundation (React Native, offline storage)

See `ROADMAP.md` for complete sprint breakdown.

---

## 📚 Reference Documents

| Document | Purpose |
|----------|---------|
| `ROADMAP.md` | Complete development roadmap with sprint details |
| `README.md` | Architecture overview, setup guide, tech stack |
| `docs/tdd-guidelines.md` | TDD methodology and best practices |
| `docs/coding-standards.md` | Code style, naming conventions |
| `docs/dpia.md` | Data Protection Impact Assessment |
| `docs/sprint-*.md` | Sprint deliverables with implementation details |

---

## 🆘 Troubleshooting

### Backend Issues

```bash
# "No module named 'hmis'"
cd backend && poetry shell  # Ensure virtualenv is active

# "DJANGO_SETTINGS_MODULE not set"
export DJANGO_SETTINGS_MODULE=hmis.settings.development

# Database migration errors
python manage.py migrate --run-syncdb
python manage.py migrate --fake-initial  # If tables exist

# Redis not running (Celery errors)
docker run -p 6379:6379 redis  # Start Redis container
# Or mock Celery in tests (already configured)
```

### Desktop App Issues

```bash
# Backend port 8000 in use
lsof -i :9088 && kill -9 <PID>

# Electron won't start
rm -rf node_modules && npm install

# E2E tests timeout
# Increase timeout in playwright.config.js
```

### Test Failures

```bash
# Coverage below threshold
# Check which lines are uncovered:
poetry run pytest --cov=hmis --cov-report=html
open htmlcov/index.html

# Fixture not found
# Ensure test file imports from conftest.py (automatic)
# Check fixture names match exactly
```

---

## 📝 Code Review Checklist

Before submitting a PR, verify:

- [ ] All tests pass: `make test`
- [ ] Quality checks pass: `make quality`
- [ ] Coverage ≥80%: `poetry run pytest --cov=hmis`
- [ ] Pre-commit hooks pass: `pre-commit run --all-files`
- [ ] Tests written BEFORE implementation (TDD)
- [ ] Audit logging added for new CRUD operations
- [ ] Sensitive fields use encryption
- [ ] Kenya locations validated (county → sub_county → ward cascade)
- [ ] API endpoints require authentication
- [ ] **API responses validated with Zod schemas** (see below)
- [ ] Documentation updated (docstrings, README if needed)

---

## 🛡️ API Response Validation (Required)

**All new API client methods MUST validate responses with Zod schemas.**

This prevents runtime TypeErrors (e.g., `staff.map is not a function`) when API responses don't match expected shapes.

### Implementation Pattern

```typescript
// 1. Define schema in lib/schemas/{module}.schema.ts
export const PatientSchema = z.object({
  id: z.number(),
  mrn: z.string(),
  first_name: z.string(),
  // ... all fields
});

// 2. Use parseResponse in lib/api/{module}.ts
import { parseResponse } from '@/lib/schemas/validation';
import { PatientSchema } from '@/lib/schemas/patient.schema';

export const patientsApi = {
  get: async (id: number): Promise<Patient> => {
    const response = await apiClient.get(`/api/patients/${id}/`);
    return parseResponse(PatientSchema, response.data, { context: 'patientsApi.get' });
  },
};
```

### Schema Files

| Module | Schema File | Status |
|--------|-------------|--------|
| Clinics | `lib/schemas/clinic.schema.ts` | ✅ Implemented |
| Patients | `lib/schemas/patient.schema.ts` | 📋 Placeholder |
| Encounters | `lib/schemas/encounter.schema.ts` | 📋 Placeholder |
| Pharmacy | `lib/schemas/pharmacy.schema.ts` | 📋 Placeholder |
| Laboratory | `lib/schemas/laboratory.schema.ts` | 📋 Placeholder |
| Billing | `lib/schemas/billing.schema.ts` | 📋 Placeholder |
| Triage | `lib/schemas/triage.schema.ts` | 📋 Placeholder |
| Inpatient | `lib/schemas/inpatient.schema.ts` | 📋 Placeholder |
| RBAC | `lib/schemas/rbac.schema.ts` | 📋 Placeholder |
| SHA | `lib/schemas/sha.schema.ts` | 📋 Placeholder |
| Core | `lib/schemas/core.schema.ts` | 📋 Placeholder |

### When Adding New API Endpoints

1. **Always** create/update the corresponding schema file
2. **Always** use `parseResponse()` to validate the response
3. **Include context** in parseResponse for debugging: `{ context: 'moduleName.methodName' }`
4. Schema should match the TypeScript type in `lib/types/{module}.ts`

---

## ✅ Commit Discipline (Required)

Every commit must follow these rules:

1. **Run pre-commit before committing**
    - Run: `pre-commit run --all-files`
    - Fix any failures (formatting, linting, etc.) before `git commit`.

2. **Write comprehensive commit messages**
    - The commit message must encapsulate the change and act as the summary.
    - Include a clear subject line plus a body that explains *what changed* and *why* (and notable API/model/test/migration impacts).

---

**Last Updated**: December 30, 2025
**Maintainer**: Engineering Lead
**Version**: 2.0 (Comprehensive AI Agent Onboarding)
