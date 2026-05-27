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

### Current Status (May 2026)

| Component | Status | Tests | Coverage |
|-----------|--------|-------|----------|
| **Backend (Django)** | ✅ Phase 0 Complete | 467+ | 82.21% |
| **Backend Contract Tests** | ✅ Implemented | 67 serializer tests | - |
| **DHA HIE Integration** | ✅ Claims & Preauths | 4 test suites | - |
| **Desktop App (Electron)** | ✅ Phase 0 Complete | 66+ unit, 6 E2E | 70%+ |
| **Mobile App (React Native)** | 📋 Planned Phase 1 | - | - |
| **Web Frontend (Next.js)** | 📋 Planned Phase 2 | - | - |

### Completed Features (Sprint 0.1-0.7)
- ✅ Patient registration with auto-MRN (`MRN-YYYYMMDD-XXXX`)
- ✅ Kenya location hierarchy (47 Counties → 289 Sub-Counties → 1448 Wards)
- ✅ Emergency contacts with relationship tracking
- ✅ Clinical encounters with vitals (including SpO2 with critical alerts <95%)
- ✅ Medical history section (allergies, chronic conditions, medications, surgeries, family/social history)
- ✅ JWT authentication with refresh tokens (login by username or email)
- ✅ Fernet field-level encryption for sensitive data (national_id, phone_number)
- ✅ Offline sync queue with conflict resolution
- ✅ Audit logging (Kenya DPA 2019 compliant - 7 year retention)
- ✅ ICD-10 diagnosis codes with search
- ✅ Treatment plan templates
- ✅ Sensitive patient filtering (HIV, GBV, Mental Health)
- ✅ Django admin restricted to Nexora superusers (tenant staff use web-app admin)
- ✅ Admin MFA enforcement (TOTP verification before accessing `/admin/`)
- ✅ MFA onboarding grace period (72h configurable, then mandatory for required roles)
- ✅ Staff scheduling: weekly roster grid, 13 shift types, constraint-aware auto-fill
- ✅ Staff constraints (NO_NIGHTS, NO_WEEKENDS, LIGHT_DUTY, NO_OVERTIME, MAX_HOURS, MAX_CONSECUTIVE, PREFERRED_SHIFTS)
- ✅ Cross-facility conflict detection (org-scoped) for shift scheduling
- ✅ Scheduling settings per facility (max days/staff, max night shifts/week, default shift pattern)
- ✅ Staff detail page shows organization and primary facility (read-only)
- ✅ Shift lifecycle: clock-in/out with state machine (SCHEDULED → ACTIVE ↔ ON_BREAK → COMPLETED)
- ✅ Clock-in guards: block after shift end time, punctuality enforcement with late cutoff
- ✅ Active shift enforcement (`RequiresActiveShiftPermission`): write ops require an active/on-break shift
- ✅ Admin role exemption: ADMIN, ORG-ADMIN, OWNER bypass active-shift enforcement
- ✅ Roster RBAC: `ManageSchedulesWritePermission` gates roster write ops; view-only for non-managers
- ✅ `scheduling.manage_schedules` custom permission on Shift model
- ✅ Department FK on Resource, Clinic, and Shift models (replaces legacy CharField; backfill migration preserves old data in `department_legacy`)
- ✅ Room-aware clock-in: staff clock into a room (PLACE resource) + clinic; auto-opens/closes ClinicSession
- ✅ ClinicRoom M2M: rooms can be linked to multiple clinics; `room_or_linked_clinic` filter for schedule scoping
- ✅ Resource detail page: 24h timeline, off-day filtering, linked clinics display
- ✅ Public queue display API (no auth): `/api/clinics/{id}/public-queue/`
- ✅ Organization self-service signup with email verification
- ✅ Staff invitation system (create, resend, revoke, accept)
- ✅ Setup wizard for first-run initialization
- ✅ Organization onboarding checklist (configure modules, create clinic, invite staff)
- ✅ Onboarding enforcement middleware (blocks admin roles after 7-day grace period)
- ✅ Onboarding banner in dashboard + post-login redirect for admin roles
- ✅ Password reset flow (request + confirm) and authenticated change-password
- ✅ DHA HIE Claims integration: document-type enforcement, OTP consent, biometrics consent, claim submission
- ✅ DHA HIE Preauthorizations: 7-type wizard (normal/surgical/elective/oncology/renal/imaging/optical), doctor-consent polling
- ✅ SHA Remittance module: fetch from DHA, auto-reconcile to local claims, SHARemittance/SHARemittanceLine models
- ✅ Time-barring alerts: Celery task (30min), 24h emergency / 14-day query deadlines, domain events
- ✅ Intervention combination rules: client-side guard for ALONE packages (SHA-01/05/06/09/10/12/18)
- ✅ Intervention retire/restore lifecycle with DHA ILM integration
- ✅ Payer claim adjudication preview: 14 payer states, processing notes, invoice flags
- ✅ PFMS/vulnerable coverage flagging: PMF scheme matrix, eligibility badges (vulnerable/elderly/disabled/orphan/indigent)

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
│   ├── powersync/
│   │   ├── sync-streams.yaml      # PowerSync Sync Streams config (deploy to dashboard)
│   │   ├── sync-rules.yaml        # Legacy Sync Rules (reference only)
│   │   └── powersync.yaml         # Self-hosted config (reference only)
│   ├── scripts/
│   │   └── setup_powersync_replication.sql  # One-time Neon publication setup
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

    # --- API-only computed fields (not on model, read-only on serializer) ---
    # allergy_summary: list[str]           # Active allergy substances (from Allergy model)
    # chronic_conditions_summary: str      # From latest Encounter.chronic_conditions
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

## 🔄 PowerSync Offline-First Sync (Implemented)

Vitora uses **PowerSync Cloud** + **Neon PostgreSQL** for offline-first data sync, plus **WebSockets** (Django Channels) for instant notifications.

> **SSOT**: `docs/powersync-integration.md` — full architecture, file reference, table inventory, troubleshooting.

### How It Works

```
Browser (SQLite/WASM)  ←→  PowerSync Cloud  ←→  PostgreSQL (Neon)
       ↑ reads locally          ↑ logical replication     ↑ writes via REST
  @powersync/web SDK       sync-streams.yaml         Django REST API
```

- **Reads**: Local SQLite queries via `usePowerSyncQuery()` (instant, offline-capable)
- **Writes**: `uploadData()` in connector → Django REST API (existing endpoints)
- **Local dev**: `NEXT_PUBLIC_POWERSYNC_URL` is empty → app falls back to API-only mode (React Query)

### Environment Variables

| Env Var | Where | Dev | Staging/Production |
|---------|-------|-----|--------------------|
| `NEXT_PUBLIC_POWERSYNC_URL` | Vercel | *(empty)* | `https://69d7e1b30e377e689729cf08.powersync.journeyapps.com` |
| `POWERSYNC_URL` | Azure Container App | *(empty)* | Same as above |
| `POWERSYNC_JWT_KID` | Azure Container App | `vitora-dev` | `vitora-hmis-1` |
| `POWERSYNC_JWT_AUDIENCE` | Azure Container App | *(empty)* | `https://69d7e1b30e377e689729cf08.powersync.journeyapps.com` |

### PowerSync Cloud Configuration

| Setting | Value |
|---------|-------|
| **Region** | EU Central (matches Neon `eu-central-1`) |
| **DB Host** | `ep-patient-cake-almonm9l.c-3.eu-central-1.aws.neon.tech` (**no** `-pooler`) |
| **Publication** | `powersync` |
| **JWT** | HS256, `kid`=`POWERSYNC_JWT_KID`, `aud`=PowerSync instance URL, `iss`=`vitora-hmis`, `sub`=user ID |

> ⚠️ **JWT Pitfalls** (resolved in production):
> - **`kid` header is required**: PowerSync Cloud uses `kid` to look up the signing key. Django SimpleJWT does not support custom headers, so we use a **dedicated endpoint** (`GET /api/powersync/credentials/`) that generates JWTs with PyJWT directly.
> - **Dashboard secret must be base64url-encoded**: Paste the output of `python3 -c "import base64; print(base64.urlsafe_b64encode(b'YOUR_SECRET_KEY').decode())"` into the dashboard, not the raw key.
> - **`aud` must be the instance URL**: Set `POWERSYNC_JWT_AUDIENCE` to `https://69d7e1b30e377e689729cf08.powersync.journeyapps.com`, not a custom string like `"powersync"`.

### Synced Tables (18 tables across 3 phases)

| Scope | Tables | Notes |
|-------|--------|-------|
| **Global (all users)** | `core_county`, `core_subcounty`, `core_ward`, `encounters_icd10code`, `clinical_templates_clinicaltemplate` | Reference data, `auto_subscribe: true` |
| **Organization** | `patients_patient`, `patients_emergencycontact` | Scoped by `auth.parameter('organization_id')`. **Excludes** encrypted PII fields |
| **Facility** | `encounters_encounter`, `triage_triageassessment`, `encounters_diagnosis`, `encounters_treatmentplan`, `encounters_medication`, `pharmacy_prescription`, `pharmacy_prescriptionitem`, `laboratory_laborder`, `laboratory_laborderitem`, `laboratory_labresult`, `billing_invoice` | Scoped by `auth.parameter('facility_id')` |

### Key Files

| File | Purpose |
|------|--------|
| `backend/powersync/sync-streams.yaml` | **Sync Streams config** — paste into PowerSync Cloud dashboard to deploy |
| `backend/hmis/apps/core/powersync_tokens.py` | `PowerSyncCredentialsView` (dedicated JWT endpoint with `kid` header) + `PowerSyncTokenObtainPairSerializer` |
| `backend/hmis/urls.py` | Routes `api/powersync/credentials/` to `PowerSyncCredentialsView` |
| `web-app/lib/powersync/schema.ts` | Client-side SQLite schema (must mirror sync-streams.yaml) |
| `web-app/lib/powersync/connector.ts` | `fetchCredentials()` (calls `/api/powersync/credentials/`) + `uploadData()` — bridges PowerSync ↔ Django API |
| `web-app/lib/powersync/hooks.ts` | `usePowerSyncQuery()`, `usePowerSyncQueryFirst()`, `usePowerSyncDatabase()` |
| `web-app/lib/context/sync-context.tsx` | `SyncProvider` — initializes PowerSync SDK, exposes `hasSynced` + `powerSyncHealth`, falls back to API-only mode |
| `backend/scripts/setup_powersync_replication.sql` | One-time Neon publication setup (reference — already run) |
| `backend/tests/test_powersync_tokens.py` | JWT claims tests |

### PowerSync vs WebSockets

| Use Case | PowerSync | WebSocket |
|----------|-----------|----------|
| Load patient record | ✅ Local SQLite query | ❌ |
| Save encounter offline | ✅ Built-in | ❌ |
| 🚨 Critical lab alert | ❌ | ✅ Instant push |
| Triage queue display | ✅ Data | ✅ Position changes |
| Dashboard stats | ✅ Cached locally | ❌ |

### Adding a New Table to PowerSync

1. **Neon SQL**: `ALTER PUBLICATION powersync ADD TABLE app_modelname;`
2. **sync-streams.yaml**: Add a stream with correct scope (`auth.parameter('facility_id')` or `auth.parameter('organization_id')`)
3. **schema.ts**: Add a `Table` definition + row type export
4. **connector.ts** (if writable): Add `TABLE_TO_ENDPOINT` mapping
5. **Deploy**: Paste updated sync-streams.yaml into PowerSync Cloud dashboard → Deploy
6. **Never sync**: Fernet-encrypted fields, audit logs, binary blobs (DICOM), framework internals

### Sync Streams Format (NOT Legacy Sync Rules)

PowerSync now uses **Sync Streams** (edition 3), not the legacy `bucket_definitions` format:

```yaml
# ✅ CORRECT — Sync Streams (edition 3)
config:
  edition: 3

streams:
  facility_encounters:
    auto_subscribe: true
    priority: 1
    query: >
      SELECT id, patient_id, ...
      FROM encounters_encounter
      WHERE facility_id = auth.parameter('facility_id')

# ❌ WRONG — Legacy Sync Rules (do not use)
bucket_definitions:
  facility_encounters:
    parameters: SELECT token_parameters.facility_id AS fac_id
    data:
      - SELECT ... WHERE facility_id = bucket.fac_id
```
```

---

## �🔌 API Endpoints Reference

### Authentication (JWT)
```
POST   /api/token/           # Login: {username, password} → {access, refresh}
                              # username field accepts username OR email
POST   /api/token/refresh/   # Refresh: {refresh} → {access}
POST   /api/token/verify/    # Verify: {token} → 200 OK or 401
```

### Auth & Onboarding (Cookie-based)
```
POST   /api/auth/login/                         # Cookie login: sets httpOnly access+refresh cookies
POST   /api/auth/refresh/                        # Cookie refresh: rotates httpOnly cookies
POST   /api/auth/logout/                         # Cookie logout: clears httpOnly cookies
POST   /api/core/auth/signup/                    # Org self-service signup (public)
POST   /api/core/auth/verify-email/              # Email verification token (public)
POST   /api/core/auth/password-reset/request/    # Request password reset (public)
POST   /api/core/auth/password-reset/confirm/    # Confirm password reset (public)
POST   /api/core/auth/change-password/           # Change password (authenticated)
GET    /api/core/setup/check/                    # Check if setup wizard needed (public)
POST   /api/core/setup/initialize/               # First-run initialization (public)
GET    /api/core/onboarding/status/              # Onboarding checklist (authenticated)
POST   /api/core/onboarding/status/              # Mark onboarding complete (authenticated)
```

### Invitations (Admin)
```
GET    /api/invitations/                         # List invitations (paginated)
POST   /api/invitations/                         # Create invitation
GET    /api/invitations/{id}/                    # Get invitation detail
POST   /api/invitations/{id}/resend/             # Resend invitation email
POST   /api/invitations/{id}/revoke/             # Revoke invitation
GET    /api/invitations/{token}/                 # Public invitation lookup (no auth)
POST   /api/invitations/accept/                  # Accept invitation (public)
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

### Scheduling (Roster & Shifts)
```
GET|POST        /api/scheduling/shifts/                       # List/bulk-create shifts
PATCH|DELETE    /api/scheduling/shifts/{id}/                   # Update/delete shift
POST            /api/scheduling/shifts/bulk_delete/            # Bulk delete by ID list
GET             /api/scheduling/shifts/cross_facility_conflicts/  # Detect same-staff overlaps (org-scoped)
GET|POST|PATCH  /api/scheduling/settings/                      # Per-facility scheduling settings
GET             /api/scheduling/settings/current/              # Current facility's settings
GET|POST        /api/scheduling/staff-constraints/             # Staff scheduling constraints
PATCH|DELETE    /api/scheduling/staff-constraints/{id}/        # Update/delete constraint
POST            /api/scheduling/resources/sync_from_staff/     # Sync resources from staff profiles
POST            /api/scheduling/resources/sync_from_clinics/   # Sync PLACE resources from clinics
POST            /api/scheduling/resources/sync_from_wards/     # Sync PLACE resources from wards
GET             /api/scheduling/resources/{id}/linked_clinics/ # Clinics linked via ClinicRoom

# Room-aware clock-in/out — requires scheduling.manage_schedules for roster writes
POST            /api/scheduling/shifts/{id}/start/             # Clock in {room_id?, clinic_id?, method?} — blocks after shift end time
POST            /api/scheduling/shifts/{id}/complete/          # Clock out — auto-closes ClinicSession if last active shift
POST            /api/scheduling/shifts/{id}/cancel/            # Cancel shift
POST            /api/scheduling/shifts/{id}/take_break/        # Start break (ACTIVE → ON_BREAK)
POST            /api/scheduling/shifts/{id}/resume/            # Resume from break (ON_BREAK → ACTIVE)
GET             /api/scheduling/shifts/staff-workload/         # Staff workload stats for date range
GET             /api/scheduling/shifts/my-shift-today/         # Current user's shift for today
GET             /api/scheduling/shifts/available-rooms/        # Unoccupied PLACE resources for clock-in

# Clinic rooms (ClinicRoom M2M)
GET|POST        /api/clinics/{id}/rooms/                       # List/add rooms for a clinic
DELETE          /api/clinics/{id}/rooms/{room_id}/             # Remove room from clinic
GET             /api/clinics/{id}/public-queue/                # Public queue display (no auth required)
```

### SHA / DHA HIE Integration
```
# Eligibility
POST   /api/sha/eligibility/check/                          # Check patient eligibility (includes PFMS fields)

# Consent & Visit
POST   /api/sha/consent/send-otp/                           # Send consent OTP to patient
POST   /api/sha/consent/validate-otp/                       # Validate OTP → consent token
POST   /api/sha/consent/start-visit/                        # Start visit with DHA
POST   /api/sha/consent/authorize/                          # Initiate biometric auth → {auth_guid, iframe_url}
GET    /api/sha/consent/authorize/{guid}/status/             # Poll biometric status

# Claims
POST   /api/sha/claims/{id}/validate/                       # Pre-submit validation
POST   /api/sha/claims/{id}/submit/                         # Submit claim to DHA
POST   /api/sha/claims/{id}/ilm/interventions/retire/       # Retire intervention
POST   /api/sha/claims/{id}/ilm/interventions/restore/      # Restore intervention
POST   /api/sha/claims/{id}/ilm/preview-payer/              # Fetch payer-side adjudication view

# Preauthorizations
POST   /api/sha/ilm/preauth/create/                         # Create preauth (7 types)
POST   /api/sha/preauth/submit/                             # Submit preauth
POST   /api/sha/ilm/preauth/cancel/                         # Cancel preauth
GET    /api/sha/ilm/preauth/fetch/                           # Fetch preauth status
POST   /api/sha/ilm/preauth/doctor-consent/                 # Request doctor consent (Practice360)
GET    /api/sha/ilm/preauth/doctor-consent/poll/             # Poll doctor consent status
GET    /api/sha/preauths/                                    # List preauths

# Remittances
GET    /api/sha/remittances/                                 # List remittances (facility-scoped)
GET    /api/sha/remittances/{id}/                            # Remittance detail
GET    /api/sha/remittances/{id}/claims/                     # Claims paid in remittance
POST   /api/sha/remittances/fetch/                           # Trigger DHA remittance fetch
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

> ⚠️ **CRITICAL**: Never place test files in the root `backend/tests/` directory. Every test file **MUST** go in a subfolder matching the app it tests (e.g., `tests/patients/`, `tests/scheduling/`, `tests/core/`). If no subfolder exists, create one with an `__init__.py`. The root `tests/` folder should only contain `conftest.py` and subfolders.

```python
# backend/tests/{app}/test_{feature}.py  — e.g. tests/patients/test_patient_api.py

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
7. BACKEND SIGNALS     → Domain event publishing via publish_event() in signals.py
8. BACKEND TESTS       → Comprehensive tests: model, workflow, serializer validation, API, events
9. FRONTEND TYPES      → TypeScript interfaces in lib/types/{module}.ts
10. FRONTEND SCHEMAS   → Zod schemas in lib/schemas/{module}.schema.ts
11. FRONTEND API       → API client methods with parseResponse() in lib/api/{module}.ts
12. FRONTEND PAGES     → List page, Detail page, Create/New page
13. FRONTEND NAV       → Sidebar entry in lib/config/navigation.ts
14. DOCS UPDATE        → Update DHA compliance roadmap status + domain-events.md SSOT
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

**6. Domain Event Wiring Is Part of Every Feature**

Any model with state transitions (status changes, creation of clinically significant records) **MUST** publish domain events. This enables real-time WebSocket notifications, read-model projections, and audit trails. See `docs/domain-events.md` for the full SSOT.

**7. Verify at Each Layer**

After completing the backend (steps 1-8), verify with `poetry run pytest tests/test_{feature}.py --no-cov`.
After completing the frontend (steps 9-13), verify with `npx tsc --noEmit`.
Only then update docs (step 14) and commit.

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

### 11. Organization/Facility Scoping Is MANDATORY for All New Models

> ⚠️ **CRITICAL**: Every new model that stores tenant-specific data **MUST** inherit from `OrganizationScopedModel` or `FacilityScopedModel`. Failure to enforce this causes **cross-tenant data leaks** and **data integrity corruption** that is extremely difficult to fix retroactively.

**Why this matters:**
- Without scoping, queries return data from ALL organizations/facilities.
- A user at Facility A would see patients, stock, and records from Facility B.
- Retroactively adding scoping to an existing model requires a data migration to backfill `organization`/`facility` for every existing row — risky and time-consuming.

**Decision matrix:**

| Scope Level | When to Use | Example Models |
|-------------|-------------|----------------|
| **`FacilityScopedModel`** | Data created at / belonging to a specific facility | `Encounter`, `Triage`, `Invoice`, `LabOrder`, `VaccineStock`, `ImmunizationRecord`, `ColdChainEquipment` |
| **`OrganizationScopedModel`** | Data shared across all facilities in an org | `Patient`, `Allergy`, shared catalogues |
| **No scoping** | Global reference data (read-only, not tenant-specific) | `VaccineDefinition`, `ICD10Code`, `DrugCatalogue` |
| **`NestedTenantScopeMixin`** (view only) | Models with no direct facility FK but reachable via parent chain | `Diagnosis` (→ Encounter → Facility), `TemperatureLog` (→ Equipment → Facility) |

**Model pattern:**

```python
from hmis.apps.core.mixins import FacilityScopedModel, resolve_tenant_from_related
from hmis.apps.core.models import TimeStampedModel

class MyModel(FacilityScopedModel, TimeStampedModel):
    patient = models.ForeignKey("patients.Patient", on_delete=models.PROTECT)
    encounter = models.ForeignKey("encounters.Encounter", on_delete=models.SET_NULL, null=True)
    # ... other fields ...

    def save(self, *args, **kwargs):
        # Auto-resolve facility/org from encounter or patient if not already set
        resolve_tenant_from_related(self, encounter_field="encounter", patient_field="patient")
        super().save(*args, **kwargs)
```

**ViewSet pattern:**

```python
from hmis.apps.core.mixins import TenantScopedViewMixin

class MyModelViewSet(TenantScopedViewMixin, viewsets.ModelViewSet):
    queryset = MyModel.objects.select_related("patient", "encounter")
    tenant_scope = "facility"  # or "organization"

    def perform_create(self, serializer):
        instance = serializer.save(**self.get_tenant_save_kwargs())
        # ... audit logging ...
```

**Test fixture pattern:**

```python
# ❌ WRONG - Missing facility, invisible to tenant-scoped queries
@pytest.fixture
def my_record(db, sample_patient):
    return MyModel.objects.create(patient=sample_patient, ...)

# ✅ CORRECT - Include sample_facility
@pytest.fixture
def my_record(db, sample_patient, sample_facility):
    return MyModel.objects.create(patient=sample_patient, facility=sample_facility, ...)
```

**Checklist for every new model:**
- [ ] Inherits from `FacilityScopedModel` or `OrganizationScopedModel`
- [ ] ViewSet uses `TenantScopedViewMixin` with correct `tenant_scope`
- [ ] `perform_create()` calls `self.get_tenant_save_kwargs()`
- [ ] Test fixtures include `sample_facility` / `sample_organization`
- [ ] Admin class includes `facility` in `list_display`, `list_filter`, and `raw_id_fields`

### 12. Split Create/Read Serializers Require `ReadOnCreateMixin`

When a ViewSet uses `get_serializer_class()` to return a write-only `CreateSerializer` for `action == "create"` and a different read serializer for other actions, DRF's default `create()` serializes the 201 response with the **create** serializer — omitting `id`, computed properties, and nested relations. Frontend Zod schemas that expect the full read shape then throw a validation error, making the 201 look like a failure.

**Always** add `ReadOnCreateMixin` (from `hmis.apps.core.mixins`) **before** `ModelViewSet` in the MRO:

```python
from hmis.apps.core.mixins import ReadOnCreateMixin

# ✅ CORRECT
class MyViewSet(ReadOnCreateMixin, viewsets.ModelViewSet):
    def get_serializer_class(self):
        if self.action == "create":
            return MyCreateSerializer
        return MyReadSerializer

# ❌ WRONG — 201 response will only contain input fields
class MyViewSet(viewsets.ModelViewSet):
    def get_serializer_class(self):
        if self.action == "create":
            return MyCreateSerializer
        return MyReadSerializer
```

The mixin re-queries the instance through `get_queryset()` (honouring `select_related`/`prefetch_related`) and re-serializes with the read serializer.

### 13. Domain Event Wiring Is MANDATORY for New Models with State Transitions

> ⚠️ **CRITICAL**: Every new model that has state transitions (status fields, clinically significant creation, workflow actions) **MUST** publish domain events via `publish_event()` in `signals.py`. Failure to wire events means WebSocket consumers, read-model projections, and the EventStore audit trail will be blind to those changes.

> **SSOT**: `docs/domain-events.md` — full architecture, event catalog, signal wiring tables, testing patterns, how-to guides.

**When to wire events:**

| Scenario | Required? | Example |
|----------|-----------|--------|
| New model with status field (TextChoices enum) | ✅ Always | Admission, LabOrder, Prescription |
| Creation of clinically significant records | ✅ Always | Encounter, TriageAssessment, ImmunizationRecord |
| Soft-delete / archival | ✅ Always | Patient deactivation |
| Reference data updates (read-only catalogues) | ❌ Skip | ICD10Code, DrugCatalogue |
| Intermediate join tables with no business meaning | ❌ Skip | M2M through tables |

**Step 1: Define event type constants** in `hmis/apps/core/events/types.py`:

```python
class MyModuleEvents:
    """Events for my_module app."""
    RECORD_CREATED = "my_module.record.created"
    RECORD_UPDATED = "my_module.record.updated"
    STATUS_CHANGED = "my_module.record.status_changed"
```

**Step 2: Wire signals** in `hmis/apps/{module}/signals.py`:

```python
from django.db.models.signals import post_save
from django.dispatch import receiver
from hmis.apps.core.events import publish_event
from hmis.apps.core.events.types import MyModuleEvents

@receiver(post_save, sender=MyModel)
def publish_my_model_event(sender, instance, created, **kwargs):
    event_type = MyModuleEvents.RECORD_CREATED if created else MyModuleEvents.RECORD_UPDATED
    publish_event(event_type, {
        "id": instance.pk,
        "status": instance.status,
        # Include fields needed by WebSocket consumers / projections
    })
```

**Step 3: Register signals** in `hmis/apps/{module}/apps.py`:

```python
def ready(self):
    import hmis.apps.my_module.signals  # noqa: F401
```

**Step 4: Write event tests** in `tests/core/test_signal_events_extended.py` or `tests/test_{module}_events.py`:

```python
def test_my_model_creation_publishes_event(self, db, mocker):
    mock_publish = mocker.patch("hmis.apps.my_module.signals.publish_event")
    instance = MyModel.objects.create(...)
    mock_publish.assert_called_once_with(MyModuleEvents.RECORD_CREATED, mocker.ANY)
```

**Step 5: Update the SSOT** — add your new events to `docs/domain-events.md` (event catalog table + signal wiring table).

**Checklist for every new model with state transitions:**
- [ ] Event type constants defined in `core/events/types.py`
- [ ] Constants exported in `core/events/__init__.py`
- [ ] `post_save` signal handler calls `publish_event()` in `{module}/signals.py`
- [ ] `apps.py` `ready()` imports signals module
- [ ] Tests verify event publication (mock `publish_event`)
- [ ] `docs/domain-events.md` SSOT updated with new events

### 14. Delete Endpoints MUST Enforce `has_perm` Checks

> ⚠️ **CRITICAL**: Every `destroy()` method on a ViewSet **MUST** check `request.user.has_perm("{app_label}.delete_{model}")` before proceeding. Without this, any authenticated user can delete records regardless of their role's `permissions_matrix`.

The `roles.json` fixture declares `"delete": true/false` per role, and `sync_role_group_permissions` maps these to Django's built-in `delete_{model}` permissions. But these are only enforced if the ViewSet explicitly checks them.

**Pattern:**

```python
def destroy(self, request, *args, **kwargs):
    """Delete with permission check and audit logging."""
    if not request.user.has_perm("app_label.delete_modelname"):
        return Response(
            {"detail": "You do not have permission to delete this resource."},
            status=status.HTTP_403_FORBIDDEN,
        )

    instance = self.get_object()
    # ... audit logging and deletion ...
```

**Already enforced on:**
- `PatientViewSet` → `patients.delete_patient`
- `EncounterViewSet` → `encounters.delete_encounter`
- `DiagnosisViewSet` → `encounters.delete_diagnosis`
- `ImagingOrderViewSet` → `imaging.delete_imagingorder`
- `InventoryViewSet` → `check_write_permission()` (custom)
- `CommentViewSet` → author-or-admin check
- `ClinicalTemplateViewSet` → ownership + system template check

**Checklist for every new ViewSet with destroy:**
- [ ] `destroy()` calls `has_perm("{app_label}.delete_{model}")`
- [ ] Returns 403 with clear error message if denied
- [ ] Test exists verifying a user WITHOUT the permission gets 403
- [ ] Test exists verifying a user WITH the permission can delete

**Test pattern for granting permission in tests:**

```python
def test_delete_with_permission(self, authenticated_client):
    from django.contrib.auth import get_user_model
    from django.contrib.auth.models import Permission

    User = get_user_model()
    # Get the user from the client's internal state
    user = authenticated_client.handler._force_user
    perm = Permission.objects.get(codename="delete_mymodel")
    user.user_permissions.add(perm)
    # Re-fetch to clear Django's permission cache
    user = User.objects.get(pk=user.pk)
    authenticated_client.force_authenticate(user=user)

    response = authenticated_client.delete(f"/api/mymodels/{instance.id}/")
    assert response.status_code == 204
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

### Email-or-Username Login

```python
# Users can log in with either username or email via EmailOrUsernameBackend
# See: hmis/apps/core/backends.py
AUTHENTICATION_BACKENDS = ["hmis.apps.core.backends.EmailOrUsernameBackend"]

# Email uniqueness is enforced at three layers:
# 1. Database: partial unique index on LOWER(email) WHERE email != ''
# 2. Application: pre_save signal on auth.User (hmis/apps/core/signals.py)
# 3. Serializers: validate_email() in StaffProfileCreateSerializer et al.
```

### Encrypted Fields & PII Convention

```python
# These fields are encrypted at rest using Fernet (AES-128) via encrypted_pii_property()
# See: hmis/apps/core/pii.py, hmis/apps/patients/models.py
Patient.identification_number  # Encrypted (national ID / passport number)
Patient.phone_number           # Encrypted
Patient.email                  # Encrypted
Patient.address                # Encrypted
Patient.national_id            # Encrypted (legacy field)
Patient.principal_national_id  # Encrypted (SHA principal)

# Encryption key configured in settings
ENCRYPTION_KEY = os.getenv('ENCRYPTION_KEY')  # 32-byte Fernet key
```

**PII classification for Vitora (Kenya DPA 2019 § 41):**

| Category | Examples | Encrypted? | Rationale |
|----------|----------|------------|-----------|
| **Direct identifiers** | National ID, phone, email, address, passport | ✅ Fernet | Can uniquely identify a person on their own |
| **Patient names** | first_name, last_name | ❌ Not encrypted | Needed for clinical workflow display; protected by tenant scoping + RBAC |
| **Staff names** | ordered_by, referring_physician_name | ❌ Not encrypted | Staff are not data subjects in the same sense; names needed for audit trails |
| **Clinical data** | diagnoses, findings, indications, medications | ❌ Not encrypted | Protected by tenant scoping + RBAC + sensitive patient filtering |
| **Communication recipients** | critical_communicated_to | ❌ Not encrypted | Staff/clinician workflow metadata |
| **DICOM metadata** | PatientName, PatientID (from tags) | ❌ Not encrypted at rest | Used for matching/verification only; never surfaced in bulk listing APIs |
| **Reference/catalog data** | procedure names, ICD codes, drug names | ❌ Not encrypted | Non-identifying clinical reference data |

**PII encryption decision rules:**
1. **Encrypt** if the field alone can identify a natural person (direct identifiers): national_id, phone, email, physical address, passport number, SHA principal ID
2. **Do NOT encrypt** patient names — they require clinical context (FK lookup) and are protected by tenant scoping, RBAC, and `is_sensitive` filtering
3. **Do NOT encrypt** staff/clinician names — staff are system users, not data subjects under the same DPA provisions
4. **Do NOT encrypt** clinical notes, findings, indications, or any freetext clinical data — protected by tenant scoping and access controls
5. **Do NOT encrypt** metadata fields extracted from DICOM headers (PatientName, PatientID) — used only for matching, never in bulk listing APIs
6. **Never sync** encrypted fields via PowerSync (excluded in sync-streams.yaml)
7. **Always audit** access to sensitive patient records (is_sensitive=True) via AuditLog

**When adding new models:**
- If the model stores direct patient identifiers (ID numbers, phone, email, address), use `encrypted_pii_property()` from `hmis.apps.core.pii`
- Patient names derived via FK (e.g., `get_patient_name` on serializers) are acceptable as read-only computed fields
- DICOM metadata containing patient names should only be used for matching/verification, never exposed in bulk listing APIs
- Never expose encrypted fields through PowerSync (sync-streams.yaml excludes them)

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

### Django Admin Access Control

```python
# Django admin is restricted to Nexora platform staff (superusers only).
# Tenant org-admins use the web-app admin pages, NOT /admin/.
# See: hmis/apps/core/middleware.AdminAccessMiddleware

# Access matrix:
# | User Type              | is_staff | is_superuser | /admin/ access |
# |------------------------|----------|--------------|----------------|
# | Nexora platform staff  | True     | True         | ✅ Allowed      |
# | Tenant org-admin       | False    | False        | ❌ 403          |
# | Tenant clinical staff  | False    | False        | ❌ 403          |

# MFA is enforced on admin login when the superuser has a TOTP device.
# Flow: /admin/login/ → TOTP verify at /admin/mfa-verify/ → admin dashboard
```

### Active Shift Enforcement

```python
# When ACTIVE_SHIFT_ENFORCEMENT is True, write operations (POST/PUT/PATCH/DELETE)
# require the user to have an ACTIVE or ON_BREAK shift for today.
# See: hmis/apps/core/permissions.py → RequiresActiveShiftPermission

# Settings:
ACTIVE_SHIFT_ENFORCEMENT = True       # base.py (True in production)
ACTIVE_SHIFT_ENFORCEMENT = False      # development.py / test.py

# Exempt roles (bypass active-shift requirement):
# - Superusers (is_superuser=True)
# - ADMIN, ORG-ADMIN, OWNER (checked via staff_profile.primary_role.code)

# Frontend: useRequiresActiveShift() hook + ShiftGate component
# - ShiftGate wraps action buttons; shows overlay when user has no active shift
# - Admin users (isAdmin from usePermissions()) auto-bypass the gate

# Roster RBAC: ManageSchedulesWritePermission
# - Roster write operations require scheduling.manage_schedules permission
# - Personal shift actions (start, complete, take_break, resume, cancel) are exempt
# - Frontend hides roster edit controls for users without the permission
```

### MFA Onboarding Grace Period

```python
# Roles requiring MFA: ADMIN, CLINICAL_SENIOR, MANAGEMENT, superusers
# See: hmis/apps/core/mfa/utils.py → is_mfa_required()

# Grace period flow:
# 1. First login with MFA-required role → mfa_grace_deadline set (now + 72h)
# 2. Login response includes: mfa_setup_required=True, mfa_grace_deadline=ISO8601
# 3. During grace period: full API access + dismissible frontend banner
# 4. After grace period: API returns 403 {code: "mfa_setup_required"}
#    Only /api/token/, /api/mfa/, /api/auth/change-password/ remain accessible

# Settings:
MFA_ENFORCEMENT = True              # Master toggle (False in dev/test)
MFA_GRACE_PERIOD_HOURS = 72         # Configurable, 0 = immediate

# Model field:
# StaffProfile.mfa_grace_deadline   # DateTimeField, set once, never extended
```

### Organization Onboarding Enforcement

```python
# After org signup, admin users must complete an onboarding checklist:
#   1. Configure facility modules (enable >1 module beyond defaults)
#   2. Create first clinic
#   3. Invite at least one team member
# See: hmis/apps/core/middleware.OnboardingEnforcementMiddleware

# Enforcement flow:
# 1. Org created → onboarding_completed_at is NULL
# 2. Login response includes: onboarding_complete=False
# 3. Frontend redirects admin roles (ADMIN, ORG-ADMIN, OWNER) to /onboarding
# 4. During grace period (7 days from org creation): full API access + dismissible banner
# 5. After grace period: API returns 403 {code: "onboarding_required"}
#    Exempt paths: /api/token/, /api/auth/, /api/core/onboarding/, /api/staff/me/,
#                  /api/core/facilities/, /api/core/departments/, /api/core/roles/,
#                  /api/core/invitations/, /api/clinics/, /api/locations/, /admin/, /api/mfa/
# 6. POST /api/core/onboarding/status/ marks onboarding complete (sets onboarding_completed_at)
# 7. Frontend does window.location.href = '/dashboard' (hard refresh) to clear cached state

# Settings:
ONBOARDING_ENFORCEMENT = True              # Master toggle (False in dev/test)
ONBOARDING_GRACE_PERIOD_DAYS = 7           # Configurable

# Model field:
# Organization.onboarding_completed_at     # DateTimeField, NULL until complete
# Organization.onboarding_complete         # Property: returns onboarding_completed_at is not None

# Frontend components:
# - /onboarding page: standalone checklist with progress bar, step cards, completion button
# - OnboardingBanner: dismissible banner in dashboard layout (session-scoped dismissal)
# - API client interceptor: 403 {code: "onboarding_required"} → redirect to /onboarding
# - Login page: post-login redirect to /onboarding for admin roles with incomplete onboarding
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
| `docs/domain-events.md` | Domain events SSOT: architecture, catalog, wiring tables, projections |
| `docs/contract-testing-recommendations.md` | API contract testing strategy (Layer 1-4) |
| `docs/dha-hie-implementation.md` | DHA HIE Claims & Preauths implementation guide (Phases 1-4) |

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
- [ ] Tests written BEFORE implementation (TDD)
- [ ] Audit logging added for new CRUD operations
- [ ] **Domain events wired** for models with state transitions (see Gotcha #13)
- [ ] `docs/domain-events.md` SSOT updated if new events added
- [ ] Sensitive fields use encryption
- [ ] Kenya locations validated (county → sub_county → ward cascade)
- [ ] API endpoints require authentication
- [ ] **API responses validated with Zod schemas** (see below)
- [ ] Documentation updated (docstrings, README if needed)
- [ ] Contract tests pass: `make test-contracts` (if serializer changed)
- [ ] **Environment variables synced** across all deploy surfaces (see below)

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
| Patients | `lib/schemas/patient.schema.ts` | ✅ Implemented |
| Encounters | `lib/schemas/encounter.schema.ts` | 📋 Placeholder |
| Pharmacy | `lib/schemas/pharmacy.schema.ts` | 📋 Placeholder |
| Laboratory | `lib/schemas/laboratory.schema.ts` | 📋 Placeholder |
| Billing | `lib/schemas/billing.schema.ts` | 📋 Placeholder |
| Triage | `lib/schemas/triage.schema.ts` | 📋 Placeholder |
| Inpatient | `lib/schemas/inpatient.schema.ts` | 📋 Placeholder |
| RBAC | `lib/schemas/rbac.schema.ts` | 📋 Placeholder |
| SHA | `lib/schemas/sha.schema.ts` | ✅ Implemented |
| Core | `lib/schemas/core.schema.ts` | 📋 Placeholder |
| AI | `lib/schemas/ai.schema.ts` | ✅ Implemented |
| Onboarding | `lib/schemas/onboarding.schema.ts` | ✅ Implemented |

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

### Sortable Table Column Headers

**Sorting is built into `ResponsiveTable`.** Add `sortable: true` to any data column to make it sortable. Action columns (e.g., Export, Delete) should NOT have `sortable`.

**Column sort props:**

```tsx
{
  key: 'name',
  header: 'Name',
  sortable: true,               // Enables the sort toggle button
  sortType: 'string',           // 'string' (default) | 'number' | 'date'
  sortFn: (a, b) => ...,        // Optional custom comparator (overrides sortType)
  cell: (item) => item.name,
}
```

**`sortType` behavior:**
- `'string'` — `localeCompare` (default). First click sorts ascending.
- `'number'` — numeric subtraction. First click sorts ascending.
- `'date'` — `Date.getTime()` comparison. **First click sorts descending** (newest first).

**Custom comparator (`sortFn`)** — Use when the column `key` doesn't point to a sortable primitive (e.g., composed names, nested fields):

```tsx
{
  key: 'name',
  header: 'Name',
  sortable: true,
  sortFn: (a, b) => `${a.first_name} ${a.last_name}`.localeCompare(`${b.first_name} ${b.last_name}`),
  cell: (item) => <>{item.first_name} {item.last_name}</>,
}
```

**Default sort on mount:**

```tsx
<ResponsiveTable
  data={items}
  defaultSortColumn="created_at"
  defaultSortDirection="desc"
  columns={[...]}
/>
```

**Guidelines:**
- Sorting is client-side and renders `ArrowUp`/`ArrowDown`/`ChevronsUpDown` icons automatically
- Date/time columns default to descending (newest first); text/number columns default to ascending
- Action columns (buttons, dropdowns, links) are NOT sortable — omit `sortable`
- Boolean columns: use `sortFn: (a, b) => Number(a.flag) - Number(b.flag)`
- For raw `<table>` elements (not using `ResponsiveTable`), use the manual pattern with `useState` + `useMemo`

### Table Responsiveness

**For list pages with clickable rows, use `ResponsiveTable`** which provides automatic mobile card layouts and built-in column sorting:

```tsx
import { ResponsiveTable } from '@/components/ui/responsive-table';

<ResponsiveTable
  data={items}
  keyExtractor={(item) => item.id}
  onRowClick={handleRowClick}
  columns={[
    { key: 'name', header: 'Name', sortable: true, cell: (item) => item.name },
    { key: 'date', header: 'Date', sortable: true, sortType: 'date', cell: (item) => formatDate(item.date), hideOnMobile: true },
    { key: 'status', header: 'Status', sortable: true, cell: (item) => <StatusBadge status={item.status} /> },
    { key: 'actions', header: '', cell: (item) => <ActionMenu item={item} /> },
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
- **Built-in column sorting** with `sortable: true` (no manual state management)
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

### Switch/Toggle Label Pattern

When using a `Switch` to toggle between two modes, show **only the active label** next to the switch — not both labels side by side. Add a **hover tooltip** that shows the alternative option so users know what toggling will do. This keeps the UI clean and avoids confusion about which state is active:

```tsx
// ❌ AVOID: Both labels shown side by side
<div className="flex items-center gap-2">
  <span className={`text-sm ${!checked ? 'font-medium' : ''}`}>Option A</span>
  <Switch checked={checked} onCheckedChange={setChecked} />
  <span className={`text-sm ${checked ? 'font-medium' : ''}`}>Option B</span>
</div>

// ✅ PREFERRED: Single dynamic label with tooltip for alternative
<TooltipProvider delayDuration={300}>
  <Tooltip>
    <TooltipTrigger asChild>
      <div className="flex items-center gap-2 w-fit cursor-default">
        <Switch checked={checked} onCheckedChange={setChecked} />
        <span className="text-sm font-medium">
          {checked ? 'Option B' : 'Option A'}
        </span>
      </div>
    </TooltipTrigger>
    <TooltipContent>
      <p>Switch to {checked ? 'Option A' : 'Option B'}</p>
    </TooltipContent>
  </Tooltip>
</TooltipProvider>
```

**Default state:** Switches should default to the **on (checked)** position. Map the primary/recommended mode to `checked={true}` so the toggle appears active on first render. The "off" state should be the less common alternative.

---

## ✅ Commit Discipline (Required)

Every commit must follow these rules:

1. **Write comprehensive commit messages**
    - The commit message must encapsulate the change and act as the summary.
    - Include a clear subject line plus a body that explains *what changed* and *why* (and notable API/model/test/migration impacts).

---

## 🔄 Environment Variable Sync (Required)

> ⚠️ **CRITICAL**: When adding, renaming, or removing environment variables in Django settings or backend code, you **MUST** update all four deploy surfaces. Failing to do so causes staging/production to silently fall back to code defaults, which may be incorrect or empty.

### The Four Files to Keep in Sync

| # | File | Purpose | Sensitive values |
|---|------|---------|------------------|
| 1 | `backend/.env` | Local development & source of truth for variable names | Plain text |
| 2 | `backend/scripts/azure-update-env.sh` | Manual Azure deploy (secrets dict + `--set-env-vars`) | `secretref:` for secrets |
| 3 | `.github/workflows/deploy-backend.yml` | CI/CD deploy (`environmentVariables:` block) | `secretref:` for secrets, `${{ vars.* }}` for configurable values |
| 4 | `backend/Makefile` | `make staging-deploy` chains `azure-update-env.sh` | Inherits from #2 |

### Decision: Plain Env Var vs Secret

| Contains | Example | Treatment |
|----------|---------|-----------|
| API keys, passwords, tokens, crypto keys | `DJANGO_SECRET_KEY`, `ENCRYPTION_KEY`, `METABASE_EMBEDDING_SECRET` | **Secret**: add to `SECRETS` dict in `azure-update-env.sh`, reference as `secretref:secret-name` in env vars |
| URLs, feature flags, non-sensitive config | `POWERSYNC_URL`, `TIBABOT_ENABLED`, `FACILITY_LEVEL` | **Plain env var**: add directly to `--set-env-vars` |

### Decision: Hardcoded vs `${{ vars.* }}` in CI Workflow

| Value is... | Example | Treatment in workflow |
|-------------|---------|----------------------|
| Same across all environments | `SHA_AGENT=DHABP05113`, `POWERSYNC_JWT_KID=vitora-hmis-1` | Hardcode in the workflow |
| Different per environment (staging vs prod) | `ALLOWED_HOSTS`, `CORS_ALLOWED_ORIGINS`, `POWERSYNC_URL` | Use `${{ vars.VAR_NAME }}` and set in GitHub environment settings |

### Checklist for Every New Environment Variable

- [ ] Added to `backend/.env` with comment
- [ ] Added to `backend/scripts/azure-update-env.sh` (secret dict or `--set-env-vars`)
- [ ] Added to `.github/workflows/deploy-backend.yml` `environmentVariables:` block
- [ ] If using `${{ vars.* }}`, documented which GitHub environment vars need to be set
- [ ] Verified `backend/Makefile` `staging-deploy` still works (it chains `azure-update-env.sh`)

---

**Last Updated**: May 1, 2026
**Maintainer**: Engineering Lead
**Version**: 3.3 (DHA HIE claims, preauths, remittances, PFMS coverage)
