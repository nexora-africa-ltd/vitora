# Vitora HMIS
> Vitora HMIS — Built for Care Without Limits

**Version**: 1.0.0  
**Last Updated**: January 17, 2026  
**Status**: Phase 1 Complete ✅ | Phase 2 In Progress 🚧

---

## Quick Links
- [Quick Start](#quick-start)
- [Project Overview](#project-overview)
- [Architecture](#architecture)
- [Development Setup](#development-setup)
- [API Reference](#api-reference)
- [Testing](#testing)
- [Deployment](#deployment)

---

## Current Status

### ✅ Phase 0 Complete (Foundation)
- Offline-first desktop application with Electron
- JWT authentication with refresh tokens
- Patient registration with auto-MRN generation
- Encounter management with vitals capture
- Kenya location hierarchy (47 Counties → 289 Sub-Counties → 1448 Wards)
- Fernet field-level encryption for sensitive data
- Offline sync queue with conflict resolution
- Audit logging (Kenya DPA 2019 compliant)

### ✅ Phase 1 Complete (Clinical Core + SHA Integration)
- **SHA Integration** (all 15 DHA APIs):
  - Authentication, Eligibility, Claims submission
  - Client Registry (fetch, register, update)
  - Terminology services (ICD-11, LOINC, ICHI, SHA Interventions, Drug Products)
  - Facility (MFL) and Practitioner (HWR) validation
- **Laboratory Module**: Orders, results, queue management, PDF requisitions
- **Pharmacy Module**: Inventory, dispensing, prescriptions, stock alerts
- **Billing Module**: Invoices, payments, M-Pesa integration
- **Inpatient Module**: Wards, beds, admissions, nursing Kardex, discharges
- **Triage Module**: KETA scale, priority queues, nurse override
- **RBAC**: Roles, departments, permission matrix
- **Mobile App**: React Native with offline sync
- **Web App**: Next.js dashboard with real-time updates

### 📊 Test Coverage
| Component | Tests | Coverage |
|-----------|-------|----------|
| Backend (Django) | 900+ | 82%+ |
| Desktop (Jest) | 66+ | 70%+ |
| E2E (Playwright) | 15+ suites | - |

---

## Quick Start

### Backend (Django)
\`\`\`bash
cd backend
poetry install
poetry shell
python manage.py migrate
python manage.py createsuperuser
python manage.py runserver  # http://127.0.0.1:9088
\`\`\`

### Desktop App (Electron)
\`\`\`bash
cd desktop-app
npm install
npm run dev  # Starts backend + Electron
\`\`\`

### Web App (Next.js)
\`\`\`bash
cd web-app
npm install
npm run dev  # http://localhost:3009
\`\`\`

### Mobile App (React Native)
\`\`\`bash
cd mobile-app
npm install
npx expo start
\`\`\`

### Run Tests
\`\`\`bash
# Backend
cd backend && make test

# Desktop
cd desktop-app && npm test

# E2E
cd desktop-app && npm run test:e2e
\`\`\`

---

## Project Overview

A modular Hospital Management Information System built for Kenya's healthcare infrastructure:

- **Offline-First**: Full functionality without internet, critical for rural facilities
- **Kenya Compliance**: DPA 2019, SHA claims, KHIS/DHIS2 reporting
- **FHIR R4**: International interoperability standards
- **Scalable**: Single clinic → Multi-facility → Regional network

### Target Stack
| Layer | Technology |
|-------|------------|
| Backend | Python 3.12, Django 5.x, Django REST Framework |
| Desktop | Electron (Node.js) with embedded Django |
| Web | Next.js 14+, TypeScript, TailwindCSS, shadcn/ui |
| Mobile | React Native (Expo), SQLite |
| Database | SQLite (standalone) / PostgreSQL 16 (cloud) |
| Auth | JWT (Simple JWT) with refresh tokens |
| Queue | Celery + Redis |
| CI/CD | GitHub Actions |

---

## Architecture

\`\`\`
┌─────────────────────────────────────────────────────────────────────────────┐
│                           Vitora HMIS Architecture                          │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐       │
│  │  Desktop App    │     │   Mobile App    │     │   Web Frontend  │       │
│  │  (Electron)     │     │  (React Native) │     │    (Next.js)    │       │
│  │  ✅ Complete    │     │  ✅ Complete    │     │   ✅ Complete   │       │
│  └────────┬────────┘     └────────┬────────┘     └────────┬────────┘       │
│           │                       │                       │                 │
│           └───────────────────────┼───────────────────────┘                 │
│                                   │                                         │
│                         ┌─────────▼─────────┐                               │
│                         │  Django REST API   │                               │
│                         │  ✅ Complete       │                               │
│                         └─────────┬─────────┘                               │
│                                   │                                         │
│           ┌───────────────────────┼───────────────────────┐                 │
│           │                       │                       │                 │
│  ┌────────▼────────┐    ┌────────▼────────┐    ┌────────▼────────┐         │
│  │    SQLite       │    │     Redis       │    │   PostgreSQL    │         │
│  │  (Standalone)   │    │    (Celery)     │    │    (Cloud)      │         │
│  └─────────────────┘    └─────────────────┘    └─────────────────┘         │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
\`\`\`

### Folder Structure
\`\`\`
vitora/
├── backend/                    # Django REST API
│   ├── hmis/
│   │   ├── apps/
│   │   │   ├── core/          # AuditLog, Sync, Locations, RBAC
│   │   │   ├── patients/      # Patient, EmergencyContact
│   │   │   ├── encounters/    # Encounter, Diagnosis, TreatmentPlan
│   │   │   ├── laboratory/    # LabOrder, LabResult, LabQueue
│   │   │   ├── pharmacy/      # Drug, Prescription, Dispensing
│   │   │   ├── billing/       # Invoice, Payment, SHA Claims
│   │   │   ├── inpatient/     # Ward, Bed, Admission, Discharge
│   │   │   ├── triage/        # TriageAssessment, WaitingQueue
│   │   │   └── clinical_templates/
│   │   └── settings/
│   ├── tests/                  # Pytest test suites
│   ├── data/                   # CSV imports (ICD-10, Kenya locations)
│   └── Makefile               # make test, make quality
│
├── desktop-app/               # Electron desktop application
│   ├── src/
│   │   ├── main/             # Main process
│   │   ├── preload/          # Context bridge
│   │   └── renderer/         # UI (HTML/CSS/JS)
│   └── tests/                # Jest + Playwright tests
│
├── web-app/                   # Next.js web frontend
│   ├── src/
│   │   ├── app/              # App router pages
│   │   ├── components/       # React components
│   │   └── lib/              # API client, utilities
│   └── package.json
│
├── mobile-app/                # React Native (Expo)
│   ├── src/
│   │   ├── screens/          # App screens
│   │   ├── components/       # Shared components
│   │   └── services/         # API, offline sync
│   └── app.json
│
├── docs/                      # Documentation
├── scripts/                   # Utility scripts
└── ROADMAP.md                # Development roadmap
\`\`\`

---

## Development Setup

### Prerequisites
- Python 3.12+
- Node.js 20+
- Poetry (Python package manager)
- Docker (optional, for Redis/PostgreSQL)

### Backend Setup
\`\`\`bash
cd backend
poetry install
poetry shell

# Environment variables
cp .env.example .env
# Edit .env with your settings

# Database
python manage.py migrate
python manage.py createsuperuser
python manage.py import_kenya_locations  # Load Kenya counties/sub-counties/wards
python manage.py import_icd10            # Load ICD-10 codes

# Run server (default port 9088)
python manage.py runserver
\`\`\`

### Desktop App Setup
\`\`\`bash
cd desktop-app
npm install

# Development (auto-starts backend)
npm run dev

# Build for distribution
npm run build:linux   # or build:win, build:mac
\`\`\`

### Web App Setup
\`\`\`bash
cd web-app
npm install
npm run dev  # http://localhost:3009
\`\`\`

### Mobile App Setup
\`\`\`bash
cd mobile-app
npm install
npx expo start
\`\`\`

### Environment Variables
Key variables for backend (see \`backend/.env.example\`):
\`\`\`bash
# Django
SECRET_KEY=your-secret-key
DEBUG=true
ALLOWED_HOSTS=localhost,127.0.0.1

# Database
DB_ENGINE=sqlite  # or postgres
DATABASE_URL=sqlite:///vitora.db

# Security
ENCRYPTION_KEY=your-fernet-key

# SHA Integration (optional)
SHA_BASE_URL=https://api.sha.go.ke
SHA_CLIENT_ID=your-client-id
SHA_CLIENT_SECRET=your-client-secret
\`\`\`

---

## API Reference

### Authentication
\`\`\`
POST   /api/token/              # Login: {username, password} → {access, refresh}
POST   /api/token/refresh/      # Refresh: {refresh} → {access}
POST   /api/token/verify/       # Verify: {token} → 200 OK
\`\`\`

### Patients
\`\`\`
GET    /api/patients/                        # List (paginated, filterable)
POST   /api/patients/                        # Create (auto-generates MRN)
GET    /api/patients/{id}/                   # Detail
PATCH  /api/patients/{id}/                   # Update
DELETE /api/patients/{id}/                   # Delete

# Nested
GET    /api/patients/{id}/emergency-contacts/
POST   /api/patients/{id}/emergency-contacts/
\`\`\`

### Encounters
\`\`\`
GET    /api/encounters/                      # List
POST   /api/encounters/                      # Create
GET    /api/encounters/{id}/                 # Detail
PATCH  /api/encounters/{id}/                 # Update
POST   /api/encounters/{id}/finalize/        # Complete encounter
\`\`\`

### Laboratory
\`\`\`
GET    /api/laboratory/orders/               # List lab orders
POST   /api/laboratory/orders/               # Create lab order
GET    /api/laboratory/queue/                # Lab queue (in-house)
POST   /api/laboratory/orders/{id}/results/  # Enter results
\`\`\`

### Pharmacy
\`\`\`
GET    /api/pharmacy/drugs/                  # Drug catalog
GET    /api/pharmacy/inventory/              # Stock levels
POST   /api/pharmacy/prescriptions/          # Create prescription
POST   /api/pharmacy/dispense/               # Dispense medication
\`\`\`

### Billing
\`\`\`
GET    /api/billing/invoices/                # List invoices
POST   /api/billing/invoices/                # Create invoice
POST   /api/billing/payments/                # Record payment
GET    /api/billing/invoices/{id}/receipt/   # Generate receipt PDF
\`\`\`

### SHA Integration
\`\`\`
GET    /api/sha/members/                     # SHA member lookup
POST   /api/sha/members/{id}/verify/         # Verify eligibility
GET    /api/sha/claims/                      # List claims
POST   /api/sha/claims/                      # Create claim
POST   /api/sha/claims/{id}/submit/          # Submit to SHA
GET    /api/sha/tariffs/                     # SHA tariff lookup
\`\`\`

### Triage
\`\`\`
GET    /api/triage/queue/                    # Waiting queue
POST   /api/triage/checkin/                  # Check in patient
POST   /api/triage/assessments/              # Create assessment
PATCH  /api/triage/queue/{id}/call/          # Call patient
\`\`\`

### Inpatient
\`\`\`
GET    /api/inpatient/wards/                 # List wards
GET    /api/inpatient/beds/                  # List beds (filterable by ward)
GET    /api/inpatient/beds/available/        # Available beds
POST   /api/inpatient/admissions/            # Admit patient
GET    /api/inpatient/admissions/{id}/       # Admission detail
POST   /api/inpatient/admissions/{id}/discharge/  # Discharge patient
GET    /api/inpatient/dashboard/             # Bed occupancy dashboard
\`\`\`

### Kenya Locations
\`\`\`
GET    /api/locations/counties/              # All 47 counties
GET    /api/locations/sub-counties/?county=1 # Sub-counties by county
GET    /api/locations/wards/?sub_county=1    # Wards by sub-county
\`\`\`

---

## Testing

### Backend Tests
\`\`\`bash
cd backend

# Run all tests with coverage
make test  # or: poetry run pytest --cov=hmis

# Run specific test file
poetry run pytest tests/test_patient_api.py -v

# Run specific test
poetry run pytest tests/test_patient_api.py::TestPatientCreation::test_create_patient -v

# Quality checks
make quality  # ruff + mypy + bandit
\`\`\`

### Desktop Tests
\`\`\`bash
cd desktop-app

# Unit tests (Jest)
npm test

# E2E tests (Playwright)
npm run test:e2e

# Coverage
npm run test:coverage
\`\`\`

### Test Coverage Requirements
- **Backend**: ≥80% coverage enforced
- **Desktop**: ≥70% coverage target
- **CI/CD**: All tests must pass before merge

---

## Deployment

### Desktop (Standalone)
\`\`\`bash
cd desktop-app
npm run build:linux   # Creates .AppImage, .deb
npm run build:win     # Creates .exe installer
npm run build:mac     # Creates .dmg
\`\`\`

Distribution includes:
- Embedded Python + Django backend
- SQLite database (offline-first)
- Auto-update mechanism

### Docker (Development/Staging)
\`\`\`bash
cd backend
docker compose up -d
\`\`\`

Services:
- Django backend (port 9088)
- PostgreSQL (port 5432)
- Redis (port 6379)

### Production Checklist
- [ ] Set \`DEBUG=false\`
- [ ] Configure proper \`SECRET_KEY\`
- [ ] Set up SSL/TLS certificates
- [ ] Configure backup strategy
- [ ] Enable monitoring (Prometheus/Grafana)
- [ ] Set up log aggregation

---

## Security & Compliance

### Kenya Data Protection Act 2019
- ✅ Explicit consent tracking with timestamps
- ✅ Data minimization (only necessary fields)
- ✅ Right to access (data export APIs)
- ✅ Audit trail (7-year retention)
- ✅ Encryption at rest (Fernet for sensitive fields)

### Sensitive Patient Records
Records marked \`is_sensitive=True\` (HIV, GBV, Mental Health) require:
- \`view_sensitive_patient\` permission
- Additional audit logging
- No bulk export

### Authentication
- JWT tokens with 30-minute access / 7-day refresh
- Password hashing (PBKDF2)
- Rate limiting on auth endpoints
- Session management

---

## Contributing

1. Fork the repository
2. Create a feature branch (\`git checkout -b feature/amazing-feature\`)
3. Write tests first (TDD approach)
4. Ensure all tests pass (\`make test\`)
5. Ensure quality checks pass (\`make quality\`)
6. Commit with conventional commits (\`feat:\`, \`fix:\`, \`docs:\`)
7. Push and create Pull Request

### Code Style
- **Python**: Black + isort + Ruff
- **JavaScript/TypeScript**: Prettier + ESLint
- **Commits**: Conventional Commits

---

## Support & Documentation

- **Detailed Roadmap**: [ROADMAP.md](ROADMAP.md)
- **Sprint Deliverables**: [docs/](docs/)
- **API Documentation**: Auto-generated at \`/api/docs/\` (when running)

### Contact
- **Engineering Lead**: dev@nexora.africa
- **Company**: Nexora Africa Ltd

---

## License

Proprietary - Nexora Africa Ltd © 2026

---

**Built with ❤️ for Kenya's Healthcare**
