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

### Current Status (February 2026)

| Component | Status | Tests | Coverage |
|-----------|--------|-------|----------|
| **Backend (Django)** | ✅ Phase 0 Complete | 467+ | 82.21% |
| **Backend Contract Tests** | ✅ Implemented | 67 serializer tests | - |
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

# Run development server (WSGI - no WebSocket)
python manage.py runserver  # Default: http://127.0.0.1:9088

# Run with WebSocket support (ASGI - recommended)
make api                      # Starts daphne on port 9088
make kill-api                 # Stop the server

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
# Terminal 1: Backend (with WebSocket support)
cd backend && make api        # Uses daphne (ASGI) for WebSocket support

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

## � Real-Time & Sync Architecture

Vitora uses a **hybrid approach**: PowerSync for offline-first data sync + WebSockets for instant notifications.

### PowerSync vs WebSockets Decision Matrix

| Capability | PowerSync | WebSockets |
|------------|-----------|------------|
| **Data sync/persistence** | ✅ Primary purpose | ❌ Not designed for this |
| **Offline support** | ✅ Built-in | ❌ Requires online |
| **Conflict resolution** | ✅ Built-in | ❌ You build it |
| **Instant server→client push** | ⚠️ Sync latency (seconds) | ✅ Milliseconds |
| **Ephemeral events** | ❌ Not designed for this | ✅ Primary purpose |
| **Presence/live cursors** | ❌ No | ✅ Yes |

### When to Use Each

| Use Case | PowerSync | WebSocket | Notes |
|----------|-----------|-----------|-------|
| Load patient record | ✅ | ❌ | Local SQLite query (instant) |
| Save encounter offline | ✅ | ❌ | Built-in, automatic |
| 🚨 Critical lab result alert | ❌ | ✅ | Instant push required |
| Lab result ready notification | ⚠️ | ✅ | WS triggers sync |
| Triage queue display | ✅ | ✅ | WS for position changes |
| Multi-user conflict warning | ❌ | ✅ | "Dr. Smith is viewing" |
| Dashboard stats refresh | ✅ | ❌ | Cached locally |

### Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                    Vitora Real-time Architecture                 │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │                    Frontend (Electron/Web/Mobile)         │   │
│  │                                                           │   │
│  │  ┌─────────────────┐       ┌─────────────────┐           │   │
│  │  │  PowerSync      │       │  WebSocket      │           │   │
│  │  │  - Local SQLite │       │  - Notifications│           │   │
│  │  │  - Data queries │       │  - Critical     │           │   │
│  │  │  - Offline ops  │       │    alerts       │           │   │
│  │  │  - Background   │       │  - Queue updates│           │   │
│  │  │    sync         │       │  - Presence     │           │   │
│  │  └────────┬────────┘       └────────┬────────┘           │   │
│  └───────────┼─────────────────────────┼────────────────────┘   │
│              │                         │                        │
│  ┌───────────▼─────────┐   ┌───────────▼────────┐               │
│  │  PowerSync Service  │   │  Django Channels   │               │
│  │  (Sync Gateway)     │   │  (WebSocket Server)│               │
│  └───────────┬─────────┘   └───────────┬────────┘               │
│              │                         │                        │
│              └────────────┬────────────┘                        │
│                           │                                     │
│                  ┌────────▼────────┐                            │
│                  │   PostgreSQL    │                            │
│                  └─────────────────┘                            │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Implementation Pattern

```typescript
// Combined hook for a page with durable data + real-time events
export function useEncounterData(encounterId: string) {
  // Durable data from PowerSync (offline-capable)
  const encounter = usePowerSyncQuery(
    `SELECT * FROM encounters WHERE id = ?`,
    [encounterId]
  );
  
  // Real-time events via WebSocket
  const { lastMessage } = useWebSocket(`/ws/encounters/${encounterId}/`);
  
  useEffect(() => {
    if (lastMessage?.type === 'lab_result_verified') {
      // Trigger PowerSync to pull latest
      db.triggerSync();
      toast.info('Lab results verified - refreshing...');
    }
  }, [lastMessage]);
  
  return { encounter };
}
```

---

## �🔌 API Endpoints Reference

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

### AI Stored Results (Persisted TibaBot Outputs)
```
GET    /api/ai/results/care-plans/?encounter_id={id}           # Stored care plans
GET    /api/ai/results/cds/?encounter_id={id}                  # Stored CDS evaluations
GET    /api/ai/results/lab-interpretations/?encounter_id={id}   # Stored lab interpretations
GET    /api/ai/results/lab-interpretations/?lab_result_id={id}  # Stored lab interpretations by lab result
GET    /api/ai/results/discharge/?admission_id={id}            # Stored discharge assessments
GET    /api/ai/results/icu-risk/?admission_id={id}             # Stored ICU risk predictions
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

## 🚀 Full-Stack Feature Implementation Pattern

When implementing a new module or DHA compliance gap, follow this **single-pass full-stack approach**. It was proven efficient on the IHR Compliance Framework (gap #24: 15 files, 3953 lines, backend + frontend + docs in one session).

### Implementation Order

Execute these layers **sequentially in one pass** — do NOT implement backend and frontend in separate PRs:

```
1. BACKEND MODEL       → Model with TextChoices enums, state-transition methods, properties
2. BACKEND SERIALIZER  → Create, List, Detail serializers + action serializers
3. BACKEND VIEWS       → ViewSet with get_serializer_class(), filter class, custom @actions
4. BACKEND URLS        → Register in app router + verify in main urls.py
5. BACKEND MIGRATION   → makemigrations + migrate
6. BACKEND ADMIN       → Admin class with colored badges, fieldsets, raw_id_fields
7. BACKEND TESTS       → Comprehensive tests: model, workflow, serializer validation, API
8. FRONTEND TYPES      → TypeScript interfaces in lib/types/{module}.ts
9. FRONTEND SCHEMAS    → Zod schemas in lib/schemas/{module}.schema.ts
10. FRONTEND API       → API client methods with parseResponse() in lib/api/{module}.ts
11. FRONTEND PAGES     → List page, Detail page, Create/New page
12. FRONTEND NAV       → Sidebar entry in lib/config/navigation.ts
13. DOCS UPDATE        → Update DHA compliance roadmap status
```

### Key Principles

**1. State-Transition Methods on the Model**

Put workflow logic (status changes, timestamps, audit fields) directly on the model as methods. Views become thin — they just validate input and call the model method:

```python
# ✅ Model owns the workflow
class IHRNotification(models.Model):
    def submit_to_county(self, user=None, notes=""):
        self.status = IHRNotificationStatus.SUBMITTED_COUNTY
        self.county_notified_at = timezone.now()
        if user: self.county_reviewed_by = user
        if notes: self.county_notes = notes
        self.save(update_fields=[...])

# ✅ View is thin — validates then delegates
@action(detail=True, methods=["post"])
def submit_to_county(self, request, pk=None):
    notification = self.get_object()
    if notification.status not in VALID_STATUSES:
        return Response({"error": "..."}, status=400)
    serializer = IHRSubmitToCountySerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    notification.submit_to_county(user=request.user, notes=serializer.validated_data.get("notes", ""))
    return Response(IHRNotificationSerializer(notification).data)
```

**2. Separate Serializers per Action**

Use `get_serializer_class()` to return the right serializer for each ViewSet action:

```python
def get_serializer_class(self):
    if self.action == "list": return ListSerializer
    if self.action == "create": return CreateSerializer
    if self.action == "submit_to_county": return SubmitSerializer
    return DetailSerializer
```

**3. Computed Properties for Business Logic**

Use `@property` on models for derived state (overdue checks, escalation status), then expose via read-only serializer fields:

```python
# Model
@property
def is_overdue(self) -> bool:
    if self.is_who_notified: return False
    hours = self.hours_since_detection
    return hours is not None and hours > 24

# Serializer
is_overdue = serializers.BooleanField(read_only=True)
```

**4. Frontend Schema-First**

Always define the Zod schema alongside the TypeScript type. The schema validates at runtime what the type checks at compile time:

```typescript
// schema file
export const ItemListSchema = z.object({ id: z.number(), name: z.string(), ... });

// api file
async list(): Promise<Item[]> {
  const response = await apiClient.get('/api/items/');
  return parseResponse(ItemListSchema, response.data, { context: 'itemsApi.list' });
}
```

**5. Three Pages per Module**

Every module needs at minimum:
- **List page** — with dashboard stats, filters, search, `ResponsiveTable`, pagination, `PullToRefresh`
- **Detail page** — with summary bar, status badges, action buttons/dialogs, related data cards
- **Create page** — with form cards, dropdowns fetched from API, validation, cancel/submit

**6. Verify at Each Layer**

After completing the backend (steps 1-7), verify with `poetry run pytest tests/test_{feature}.py --no-cov`.
After completing the frontend (steps 8-12), verify with `npx tsc --noEmit`.
Only then update docs (step 13) and commit.

### Commit Convention

One comprehensive commit per feature with a subject line and body:

```
feat({module}): implement {Feature Name} (gap #{N})

Backend:
- Model, serializers, views, migration, admin, tests
Frontend:
- Types, schemas, API client, pages, navigation
Docs:
- DHA compliance roadmap updated
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

### 9. Serializer Naming — Avoid Duplicates

Some models exist in multiple apps (e.g., `Ward` in both `core` and `inpatient`). Their serializers MUST have unique names to avoid OpenAPI schema conflicts:

| Model | Core App | Inpatient App |
|-------|----------|---------------|
| Ward | `WardSerializer` (location hierarchy) | `InpatientWardSerializer` (beds, occupancy) |

```python
# ❌ WRONG - Causes OpenAPI schema corruption
class WardSerializer(...)  # in core/serializers.py
class WardSerializer(...)  # in inpatient/serializers.py

# ✅ CORRECT - Unique names
class WardSerializer(...)           # in core/serializers.py
class InpatientWardSerializer(...)  # in inpatient/serializers.py
```

### 10. Ward Bed Auto-Generation

Wards have a `capacity` field but individual `Bed` records must exist for admissions. Beds are auto-generated:

**On Ward Creation:**
```python
# When a new ward is created with capacity=20, 20 Bed records are auto-created:
# B-001, B-002, ..., B-020 (all with status='AVAILABLE')
ward = Ward.objects.create(name="Medical Ward 1", code="MW001", capacity=20, ...)
# ward.beds.count() == 20  # Automatic!
```

**Backfill Existing Wards:**
```bash
# Generate missing beds for all wards
python manage.py generate_ward_beds

# Dry run to preview
python manage.py generate_ward_beds --dry-run

# Specific ward only
python manage.py generate_ward_beds --ward MW001
```

**API Endpoint:**
```
POST /api/inpatient/wards/{id}/generate_beds/
# Returns: { created: 10, total: 20, capacity: 20, message: "Generated 10 bed(s)" }
```

**Frontend:** The admission form shows a "Generate Beds" button when ward has capacity but no beds.

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
| `docs/contract-testing-recommendations.md` | API contract testing strategy (Layer 1-4) |

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
- [ ] Contract tests pass: `make test-contracts` (if serializer changed)

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
| AI | `lib/schemas/ai.schema.ts` | ✅ Implemented |

### When Adding New API Endpoints

1. **Always** create/update the corresponding schema file
2. **Always** use `parseResponse()` to validate the response
3. **Include context** in parseResponse for debugging: `{ context: 'moduleName.methodName' }`
4. Schema should match the TypeScript type in `lib/types/{module}.ts`

---

## 🎨 UI/UX Patterns & Responsive Design

Follow these established patterns when creating or modifying frontend components.

### Responsive Breakpoints

Use Tailwind's standard breakpoints consistently:

| Breakpoint | Size | Usage |
|------------|------|-------|
| `sm` | 640px | Large phones - show abbreviated text, basic icons |
| `md` | 768px | Tablets - show search bar (compact), 2-column grids |
| `lg` | 1024px | Small laptops, tablets landscape - **sidebar still hidden** |
| `xl` | 1280px | Desktops - **persistent sidebar**, full status text |
| `2xl` | 1536px | Large desktops - maximum content width |

> ⚠️ **IMPORTANT**: The sidebar becomes persistent at `xl` (1280px), NOT `lg` (1024px).
> At 1024px, the sidebar is still in hamburger menu mode to prevent crowding.

**Breakpoint Usage Summary:**
- **Sidebar visible**: `xl:translate-x-0`, `xl:ml-64`
- **Mobile menu button**: `xl:hidden`
- **Full status text**: `xl:inline`, short text uses `sm:inline xl:hidden`
- **Search bar widths**: `w-48` → `lg:w-56` → `xl:w-64`
- **Gap sizing**: `gap-1.5` → `sm:gap-2` → `lg:gap-3` → `xl:gap-4`

### Page Header Pattern

Always use the `PageHeader` component for page titles instead of custom `<h1>` tags:

```tsx
import { PageHeader } from '@/components/shared/page-header';

// Basic usage
<PageHeader title="Invoices" />

// With help tooltip (preferred for detail pages)
<PageHeader
  title={`Invoice ${invoice?.invoice_number || ''}`}
  helpContent="View and manage invoice details. Record payments, add items, and submit SHA claims."
/>

// With actions
<PageHeader
  title="Patients"
  helpContent="Search and manage patient records."
  actions={<Button>Add Patient</Button>}
/>
```

**Guidelines:**
- ❌ Don't use separate `<h1>` and `<p>` for page headers
- ❌ Don't include back buttons in pages (users can use browser back/keyboard)
- ✅ Use `helpContent` prop instead of description text for contextual help
- ✅ Place action buttons in the `actions` prop

### Help Tooltips vs Descriptions (Declutter UI)

**Use help tooltips for ALL descriptions** to keep the UI clean and uncluttered. Static descriptions take up space and add visual noise. Help tooltips provide the same information on-demand:

```tsx
// ❌ AVOID: Static description
<DialogHeader>
  <DialogTitle>Apply Discount</DialogTitle>
  <DialogDescription>Apply a discount to this invoice</DialogDescription>
</DialogHeader>

// ✅ PREFERRED: Help tooltip
import { HelpPopover } from '@/components/shared/help-popover';

<DialogHeader>
  <div className="flex items-center gap-2">
    <DialogTitle>Apply Discount</DialogTitle>
    <HelpPopover content="Apply a percentage or fixed amount discount. The discount will be reflected in the invoice total." />
  </div>
</DialogHeader>
```

**Where to use help tooltips:**
- Page headers (use `helpContent` prop on `PageHeader`)
- Dialog/modal titles
- Card headers for complex sections
- Form field labels for non-obvious fields
- Table column headers with special meanings

### Status Indicator Responsive Text

For status indicators that show time-based text, use different formats at different breakpoints:

```tsx
import { formatLastFetch, formatLastFetchShort } from '@/lib/context/page-refresh-context';

// Icon only on mobile, short text on sm-lg, full text on xl+
<>
  <StatusIndicator state={isOnline ? 'active' : 'down'} size="sm" />
  {/* Short text on sm-lg screens */}
  <span className="hidden sm:inline xl:hidden">
    {isOnline ? formatLastFetchShort(lastFetchTime) : 'Off'}
  </span>
  {/* Full text on xl+ screens */}
  <span className="hidden xl:inline">
    {isOnline ? formatLastFetch(lastFetchTime) : 'Offline'}
  </span>
</>
```

| Format | Example Output |
|--------|----------------|
| `formatLastFetch()` | "Just now", "5s ago", "1 min ago", "2 hrs ago" |
| `formatLastFetchShort()` | "now", "5s", "1m", "2h" |

### Breadcrumb Responsive Pattern

Show full breadcrumb trail only on xl+ screens (when sidebar is visible):

```tsx
{/* Mobile to lg: current page only */}
<div className="xl:hidden text-sm font-medium truncate">
  {currentLabel}
</div>

{/* xl+: full breadcrumb trail */}
<div className="hidden xl:flex items-center text-sm">
  {/* ... full trail ... */}
</div>
```

### Badge Sizing on Mobile

Prevent badges from stretching full-width on mobile:

```tsx
// ✅ CORRECT: Fits content on mobile
<Badge className={`${statusColors[status]} shrink-0 w-fit self-start sm:self-auto`}>
  {status}
</Badge>
```

### Table Responsiveness

**For list pages with clickable rows, use `ResponsiveTable`** which provides automatic mobile card layouts:

```tsx
import { ResponsiveTable } from '@/components/ui/responsive-table';

<ResponsiveTable
  data={items}
  keyExtractor={(item) => item.id}
  onRowClick={handleRowClick}
  columns={[
    { key: 'name', header: 'Name', cell: (item) => item.name },
    { key: 'date', header: 'Date', cell: (item) => formatDate(item.date), hideOnMobile: true },
    { key: 'status', header: 'Status', cell: (item) => <StatusBadge status={item.status} /> },
  ]}
  mobileCard={(item) => (
    <Card className="p-3">
      {/* Custom mobile layout */}
      <div className="flex justify-between">
        <span>{item.name}</span>
        <StatusBadge status={item.status} />
      </div>
    </Card>
  )}
/>
```

**Benefits of `ResponsiveTable`:**
- Auto card layout on mobile (< md breakpoint)
- `hideOnMobile: true` to hide columns on mobile cards
- Custom `mobileCard` prop for optimized mobile layouts
- Built-in loading/empty states
- Consistent pattern across list pages

**For inline tables (e.g., invoice line items), use horizontal scroll:**

```tsx
<Card>
  <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
    <CardTitle className="text-base sm:text-lg">Line Items</CardTitle>
    {canEdit && (
      <Button size="sm" className="w-full sm:w-auto">Add Item</Button>
    )}
  </CardHeader>
  <CardContent className="px-0 sm:px-6">
    <div className="overflow-x-auto">
      <Table className="min-w-[500px]">
        {/* ... table content ... */}
      </Table>
    </div>
  </CardContent>
</Card>
```

### Action Button Layouts

Stack action buttons vertically on mobile, horizontally on larger screens:

```tsx
{/* Action Buttons */}
<div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:justify-end">
  <Button variant="outline">Print</Button>
  <Button variant="outline">Email</Button>
  <Button>Submit</Button>
</div>
```

### Spacing Patterns

Use responsive spacing for page sections:

```tsx
<div className="space-y-4 sm:space-y-6">
  {/* Page content */}
</div>
```

### Summary Bar Pattern

For detail pages, use a compact summary bar instead of large header sections:

```tsx
{/* Invoice Summary Bar */}
<div className="flex flex-col gap-3 sm:flex-row sm:justify-between sm:items-center p-3 sm:p-4 rounded-lg bg-muted/50">
  <div className="flex flex-col gap-1 min-w-0">
    <p className="text-sm font-medium truncate">
      {patient_name}
      <span className="text-muted-foreground"> • {mrn}</span>
    </p>
    <p className="text-xs sm:text-sm text-muted-foreground">
      Created {formatDate(date)}
    </p>
  </div>
  <Badge className="shrink-0 w-fit self-start sm:self-auto">
    {status}
  </Badge>
</div>
```

### Navigation Guidelines

- ❌ Don't add back buttons to pages
- ✅ Rely on browser navigation (back button, Alt+Left, backspace)
- ✅ Use breadcrumbs for hierarchical navigation context
- ✅ Use links for explicit navigation between related items

### Pull-to-Refresh for Mobile & Tablet

Implement pull-to-refresh on list pages and data-heavy views for mobile and tablet users. Use the `PullToRefresh` component:

```tsx
import { PullToRefresh } from '@/components/shared/pull-to-refresh';
import { usePageRefresh } from '@/lib/context/page-refresh-context';

export function PatientListPage() {
  const { refresh, isRefreshing } = usePageRefresh();

  return (
    <PullToRefresh onRefresh={refresh} isRefreshing={isRefreshing}>
      <div className="space-y-4">
        {/* Page content */}
      </div>
    </PullToRefresh>
  );
}
```

**Guidelines:**
- Wrap the main scrollable content area
- Use `usePageRefresh()` hook for refresh logic (invalidates React Query cache)
- The component shows a visual indicator when pulled past threshold
- Shows "Release to refresh" prompt with glow effect
- Desktop users have a refresh button in the header instead

**Important refresh wiring notes:**
- `refresh` invalidates React Query cache; pages should fetch via React Query for the header refresh and Pull-to-Refresh to actually reload data.
- Avoid wiring Pull-to-Refresh to ad-hoc `refetch()` functions unless the page is already integrated with `usePageRefresh()`.
- After write actions (create/update/verify/upload), prefer `queryClient.invalidateQueries()` over manual reloads so the header refresh and Pull-to-Refresh stay consistent.
- Prefer semantic theme tokens (`text-destructive`, `bg-destructive/10`, `text-muted-foreground`) over hard-coded colors.

### Responsive Short Labels (Mobile)

When tab/button labels are too long on small screens, render a shorter label on mobile and the full label on `sm+`:

```tsx
<TabsTrigger value="results" className="gap-2">
  <Icon className="h-4 w-4" />
  <span className="sm:hidden">Pending</span>
  <span className="hidden sm:inline">Pending Verification</span>
</TabsTrigger>
```

### Subtle Radial Gradient (Data-Display Cards Only)

Apply a dual radial gradient to **data-display / highlight cards** (stat cards, KPI cards, entity cards, hero panels) to give them subtle visual depth. **Do NOT add it to the base `Card` component** — form containers, dialog bodies, settings panels, table wrappers, and empty states should stay plain.

**Principle:** The gradient is opt-in per component. It adds meaning to cards that surface key numbers or identity, not ambient decoration to every container.

**Full-intensity** (hero panels, welcome bars):

```tsx
<div className="relative overflow-hidden rounded-xl border border-primary/20 bg-card">
  <div
    className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.18),transparent_38%),radial-gradient(circle_at_bottom_right,rgba(59,130,246,0.14),transparent_34%)]"
    aria-hidden="true"
  />
  <div className="relative p-6">{/* content */}</div>
</div>
```

**Subtle** (stat cards, KPI cards, entity cards):

```tsx
<Card className="relative overflow-hidden">
  <div
    className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.06),transparent_50%),radial-gradient(circle_at_bottom_right,rgba(59,130,246,0.05),transparent_50%)]"
    aria-hidden="true"
  />
  <CardContent className="relative">{/* content */}</CardContent>
</Card>
```

**Where to apply:**
- `StatsCard` (dashboard) — subtle
- `KPICard` (reports) — subtle
- `EntityCard` (staff/patient grids) — subtle
- `AdminStatCard` (admin overview) — subtle
- Dashboard welcome panel — full-intensity
- Admin hero card — full-intensity
- `AIChatPanel` container — subtle

**Where NOT to apply:**
- Base `Card` component (`components/ui/card.tsx`)
- Ghost, muted, dashed card variants
- Form/dialog containers
- Table wrapper cards
- Empty state cards

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

**Last Updated**: March 2, 2026
**Maintainer**: Engineering Lead
**Version**: 2.6 (Added full-stack feature implementation pattern from IHR gap #24)
