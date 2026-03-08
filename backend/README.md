# Vitora HMIS Backend

Django REST API backend for Vitora Hospital Management Information System.

![Python](https://img.shields.io/badge/Python-3.12+-blue.svg)
![Django](https://img.shields.io/badge/Django-5.x-green.svg)
![Tests](https://img.shields.io/badge/tests-3624%20passing-brightgreen.svg)
![Coverage](https://img.shields.io/badge/coverage-87%25-brightgreen.svg)

---

## 📋 Table of Contents

- [Features](#-features)
- [Prerequisites](#-prerequisites)
- [Setup](#-setup)
- [Development](#-development)
- [Project Structure](#-project-structure)
- [Django Apps](#-django-apps)
- [Testing](#-testing)
- [Code Quality](#-code-quality)
- [API Documentation](#-api-documentation)
- [Celery Tasks](#-celery-tasks)
- [Configuration](#-configuration)

---

## ✨ Features

### Core Functionality
- **Patient Management**: Registration, MRN auto-generation, Kenya location hierarchy
- **Encounters**: Clinical visits with vitals, diagnoses, treatment plans
- **Clinics**: 8 clinic types with sessions, queues, enrollments
- **Laboratory**: Orders, results, queue management, PDF requisitions
- **Pharmacy**: Drug catalog, inventory (FEFO), prescriptions, dispensing
- **Billing**: Invoices, payments, M-Pesa integration, receipts
- **Inpatient**: Wards, beds, admissions, nursing Kardex, discharges
- **Triage**: KETA scale (RED/ORANGE/YELLOW/GREEN/BLUE), priority queues

### Integrations
- **SHA (Social Health Authority)**: All 15 DHA APIs integrated
- **M-Pesa**: Payment gateway integration
- **ICD-10/ICD-11**: Diagnosis coding
- **LOINC**: Lab test coding

### Security & Compliance
- **Kenya DPA 2019**: Full audit logging (7-year retention)
- **Fernet Encryption**: Sensitive fields (national_id, phone_number)
- **RBAC**: Role-based access control with department scoping
- **Sensitive Records**: Protected HIV/GBV/Mental Health access

---

## 🔧 Prerequisites

| Requirement | Version | Check Command |
|-------------|---------|---------------|
| Python | ≥3.12 | \`python --version\` |
| Poetry | Latest | \`poetry --version\` |
| Redis | Optional | \`redis-cli ping\` |

---

## 🚀 Setup

### 1. Install Poetry (if not installed)
\`\`\`bash
curl -sSL https://install.python-poetry.org | python3 -
\`\`\`

### 2. Install Dependencies
\`\`\`bash
cd backend
poetry install
poetry shell
\`\`\`

### 3. Enable Git Hooks (Mandatory)
\`\`\`bash
cd ..
./scripts/setup-git-hooks.sh
cd backend
\`\`\`

### 4. Environment Configuration
\`\`\`bash
cp .env.example .env
# Edit .env with your settings
\`\`\`

### 5. Database Setup
\`\`\`bash
python manage.py migrate
python manage.py createsuperuser

# Load Kenya locations (47 Counties → 289 Sub-Counties → 1,448 Wards)
python manage.py import_kenya_locations

# Load ICD-10 codes
python manage.py import_icd10

# Load clinical templates
python manage.py load_clinical_templates
\`\`\`

### 6. Run Development Server
\`\`\`bash
# Standard WSGI server (no WebSocket support)
python manage.py runserver  # Default: http://127.0.0.1:9088

# ASGI server with WebSocket support (recommended)
make api        # Starts daphne on port 9088 (background)
make kill-api   # Stop the server
\`\`\`

---

## 🛠 Development

### Running the Server
\`\`\`bash
poetry shell

# Standard WSGI (no WebSocket)
python manage.py runserver 0.0.0.0:9088

# ASGI with WebSocket support (recommended for lab/clinic real-time updates)
daphne -b 0.0.0.0 -p 9088 hmis.asgi:application
# Or use make:
make api        # Runs daphne in background
\`\`\`

### Database Commands
\`\`\`bash
python manage.py makemigrations
python manage.py migrate
python manage.py migrate --run-syncdb  # If tables exist
\`\`\`

### Management Commands
\`\`\`bash
# Data imports
python manage.py import_kenya_locations
python manage.py import_icd10
python manage.py load_clinical_templates
python manage.py populate_clinic_default_templates

# User management
python manage.py createsuperuser
\`\`\`

### MCH Clinic Unification Commands
\`\`\`bash
# Backfill canonical clinic visits for historical ANC or PNC records
python manage.py backfill_mch_clinic_visits --module anc --dry-run
python manage.py backfill_mch_clinic_visits --module pnc --from-date 2026-01-01 --report-file reports/pnc-backfill.json

# Recompute ANC enrollment counters from canonical linked clinic visits
python manage.py reconcile_clinic_enrollment_attendance --dry-run
python manage.py reconcile_clinic_enrollment_attendance --report-file reports/anc-enrollment-reconcile.csv

# Read-only validation and observability
python manage.py validate_mch_clinic_links --json
python manage.py validate_enrollment_attendance_counts --json
python manage.py validate_mch_encounter_consistency --json
python manage.py mch_clinic_unification_metrics --json
\`\`\`

Operational guidance:
- Run \`backfill_mch_clinic_visits\` with \`--dry-run\` first and review the emitted report before applying changes.
- The backfill command is idempotent and supports \`--module\`, \`--from-date\`, \`--to-date\`, \`--clinic-id\`, \`--limit\`, \`--batch-size\`, and \`--start-after-id\` for controlled rollout windows.
- Run \`reconcile_clinic_enrollment_attendance\` after backfill to align ANC enrollment counters with canonical attendance.
- The validation commands are read-only and intended for pre-rollout checks, post-rollout verification, and ongoing observability.

---

## 📁 Project Structure

\`\`\`
backend/
├── hmis/                       # Main application package
│   ├── __init__.py
│   ├── celery.py               # Celery configuration
│   ├── settings/
│   │   ├── base.py             # Common settings
│   │   ├── development.py      # DEBUG=True, SQLite
│   │   ├── production.py       # DEBUG=False, PostgreSQL
│   │   └── test.py             # Test configuration
│   ├── urls.py                 # API routes
│   └── apps/                   # 10 Django apps
│       ├── billing/            # Invoices, payments, SHA
│       ├── clinical_templates/ # Clinical templates
│       ├── clinics/            # 8 clinic types
│       ├── core/               # RBAC, sync, audit, locations
│       ├── encounters/         # Visits, diagnoses
│       ├── inpatient/          # Wards, admissions
│       ├── laboratory/         # Lab orders/results
│       ├── patients/           # Patient registration
│       ├── pharmacy/           # Drugs, dispensing
│       └── triage/             # Emergency triage
├── tests/                      # Test suite (3,624+ tests)
│   ├── conftest.py             # Pytest fixtures
│   └── test_*.py               # Test files
├── data/                       # CSV imports, templates
│   ├── kenya_locations.csv
│   ├── icd10_codes.csv
│   └── clinical_templates/
├── pyproject.toml              # Poetry configuration
├── Makefile                    # Build commands
├── Dockerfile
├── compose.yml
└── README.md
\`\`\`

---

## 📦 Django Apps

| App | Description | Key Models |
|-----|-------------|------------|
| **core** | Shared infrastructure | AuditLog, FrontendEvent, ActivityFeed, SyncQueue, County, SubCounty, Ward, Department, Role, StaffProfile, Notification |
| **patients** | Patient management | Patient, EmergencyContact |
| **encounters** | Clinical visits | ICD10Code, Encounter, Diagnosis, TreatmentPlan, Medication |
| **clinics** | Outpatient clinics | Clinic, ClinicSchedule, ClinicStaff, ClinicSession, ClinicVisit, ClinicEnrollment, MonthlyClinicReport |
| **triage** | Emergency triage | WaitingQueue, TriageVitalThreshold, TriageAssessment, TriageQueue |
| **pharmacy** | Drug management | Drug, DrugCategory, StockBatch, StockAlert, Prescription, PrescriptionItem, Dispensing, StockAdjustment |
| **laboratory** | Lab testing | TestCatalog, LOINCCode, LabOrder, LabOrderItem, LabResult, LabQueue, LabResultTemplate |
| **billing** | Billing & SHA | ServiceCategory, Service, Invoice, InvoiceItem, Payment, PaymentPoint, Receipt, SHAMember, SHATariff |
| **inpatient** | Inpatient care | Ward, Bed, AdmissionRecommendation, Admission, Discharge, Transfer, WardRound, NursingKardex, ShiftHandover |
| **clinical_templates** | Clinical templates | ClinicalTemplate |

---

## 🧪 Testing

### Running Tests
\`\`\`bash
# Run all tests with coverage
make test
# or
poetry run pytest --cov=hmis --cov-report=html

# Run specific test file
poetry run pytest tests/test_patient_api.py -v

# Run tests by marker
poetry run pytest -m unit
poetry run pytest -m integration

# Run with output (print statements)
poetry run pytest -s

# Run tests matching pattern
poetry run pytest -k "patient and create"
\`\`\`

### Coverage Report
\`\`\`bash
poetry run pytest --cov=hmis --cov-report=html
open htmlcov/index.html
\`\`\`

### Test Standards
- **Minimum Coverage**: 80% (currently 87%+)
- **Test Types**: Unit, Integration, E2E
- **Naming**: \`test_*.py\` or \`*_test.py\`
- **Markers**: \`@pytest.mark.unit\`, \`@pytest.mark.integration\`, \`@pytest.mark.e2e\`

---

## ✅ Code Quality

### All Quality Checks
\`\`\`bash
make quality  # Runs ruff + mypy + bandit
\`\`\`

### Individual Commands
\`\`\`bash
# Ruff linter
poetry run ruff check .
poetry run ruff check . --fix  # Auto-fix

# Black formatter
poetry run black .
poetry run black --check .

# isort imports
poetry run isort .
poetry run isort --check .

# mypy type checking
poetry run mypy hmis

# Bandit security scan
poetry run bandit -r hmis
\`\`\`

### Format All
\`\`\`bash
make format  # Black + isort
\`\`\`

---

## 📚 API Documentation

### Authentication
\`\`\`
POST   /api/token/           # Login → {access, refresh}
POST   /api/token/refresh/   # Refresh → {access}
POST   /api/token/verify/    # Verify → 200 OK
\`\`\`

### Core Endpoints
\`\`\`
# Patients
GET/POST   /api/patients/
GET/PATCH  /api/patients/{id}/

# Encounters
GET/POST   /api/encounters/
GET/PATCH  /api/encounters/{id}/
POST       /api/encounters/{id}/finalize/

# Clinics
GET/POST   /api/clinics/
GET        /api/clinics/sessions/
POST       /api/clinics/sessions/{id}/checkin/

# Laboratory
GET/POST   /api/laboratory/orders/
POST       /api/laboratory/orders/{id}/results/
GET        /api/laboratory/queue/

# Pharmacy
GET        /api/pharmacy/drugs/
GET        /api/pharmacy/inventory/
POST       /api/pharmacy/dispense/

# Billing
GET/POST   /api/billing/invoices/
POST       /api/billing/payments/

# SHA Integration
POST       /api/sha/auth/token/
GET        /api/sha/members/{id}/
POST       /api/sha/claims/
\`\`\`

---

## ⚙️ Celery Tasks

Celery is used for background tasks. Optional in development unless testing async flows.

### Setup
\`\`\`bash
# Set broker URL
CELERY_BROKER_URL=redis://localhost:6379/0
\`\`\`

### Run Worker + Beat
\`\`\`bash
# Terminal 1: Worker
poetry run celery -A hmis worker --loglevel=info

# Terminal 2: Beat (scheduler)
poetry run celery -A hmis beat --loglevel=info
\`\`\`

### Scheduled Tasks
- **Monthly Clinic Reports**: 1st of every month at 01:00 (Africa/Nairobi)

---

## 🔧 Configuration

All tool configurations in \`pyproject.toml\`:
- Poetry dependencies
- Pytest settings
- Coverage settings
- Ruff linting rules
- Black formatting
- isort import sorting
- mypy type checking
- Bandit security scanning

### Key Environment Variables
\`\`\`bash
# Django
SECRET_KEY=your-secret-key
DEBUG=true
ALLOWED_HOSTS=localhost,127.0.0.1

# Database
DB_ENGINE=sqlite  # or postgres
DATABASE_URL=sqlite:///vitora.db

# Security
ENCRYPTION_KEY=your-32-byte-fernet-key

# Celery
CELERY_BROKER_URL=redis://localhost:6379/0

# SHA (optional)
SHA_BASE_URL=https://api.sha.go.ke
SHA_CLIENT_ID=your-client-id
SHA_CLIENT_SECRET=your-client-secret
\`\`\`

---

## CI/CD

The CI/CD pipeline automatically runs:
1. Ruff linting
2. Black formatting check
3. isort import check
4. mypy type checking
5. Pytest with coverage (≥80%)
6. Bandit security scanning
7. Trivy vulnerability scanning

All checks must pass before merging to main branch.

---

## License

Apache-2.0 - Nexora Africa Ltd © 2026
