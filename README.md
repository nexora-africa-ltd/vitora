# Vitora HMIS
> Vitora HMIS — Built for Care Without Limits

---

# Kenya HMIS (Hospital Management Information System)
_Comprehensive Technical Blueprint & Implementation Guide (Kenya-Tailored)_
_Last Updated: January 31, 2026_

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Current Status](#2-current-status)
3. [Folder & File Structure](#3-folder--file-structure)
4. [Local Development Setup](#4-local-development-setup)
5. [Backend (Django + DRF) Implementation](#5-backend-django--drf-implementation)
6. [Frontend (Next.js) Implementation](#6-frontend-nextjs-implementation)
7. [Desktop App (Electron) Implementation](#7-desktop-app-electron-implementation)
8. [Mobile App (React Native) Implementation](#8-mobile-app-react-native-implementation)
9. [Database Schema (Core Modules)](#9-database-schema-core-modules)
10. [Security & Privacy (Kenya Data Protection Act)](#10-security--privacy-kenya-data-protection-act)
11. [Interoperability (FHIR, KHIS/DHIS2, SHA)](#11-interoperability-fhir-khisdhis2-sha)
12. [Testing Strategy & Quality Gates](#12-testing-strategy--quality-gates)
13. [Deployment & Operations](#13-deployment--operations)
14. [Future AI/ML Integration Roadmap](#14-future-aiml-integration-roadmap)
15. [Appendix](#15-appendix)

---

## 1. Project Overview

### 1.1 Context & Goals
A modular-monolith Hospital Management Information System tailored for Kenya, combining the best of standalone offline operations and optional cloud connectivity:

- **Offline-first** for rural / low-bandwidth facilities
- **FHIR R4-compliant** interoperability
- **KHIS (DHIS2)** aggregate reporting and Social Health Authority (SHA) claims integration
- **Strong auditability and privacy** under the Kenya Data Protection Act (2019)
- **Progressive scale**: single facility → multi-facility tenancy (PostgreSQL RLS) → regional DR

**Core Vision**:
- **Offline-First Standalone Desktop Application**: Runs fully on local machines or hospital servers without internet, supporting essential workflows (patient records, appointments, billing, reporting). Uses lightweight embedded databases like SQLite for single-site setups or PostgreSQL for multi-department loads. Ensures continuity during outages, ideal for Kenya's infrastructure challenges.
- **Optional Cloud Integration**: Enables sync with a cloud backend for multi-location access, centralized analytics, secure off-site backups, and real-time collaboration. Background synchronization handles conflicts gracefully, allowing hospitals to start standalone and scale gradually.
- **Flexible Architecture**: Desktop GUI via Electron (wrapping frontend for quick deployment); backend via Python Django (primary). Mobile app option for out-of-office tasks like rural outreach.
- **Kenya-First with Global Standards**: FHIR R4-compliant interoperability, KHIS (DHIS2) aggregate reporting, Social Health Authority (SHA) claims integration, and strong auditability/privacy under the Kenya Data Protection Act (2019).
- **Why This Approach**: Hospitals can adopt affordably (standalone first, no cloud costs initially), ensuring uninterrupted care while enabling growth. Forward-looking for AI (e.g., sepsis predictions) and analytics, aligned with Kenya's health goals and global standards like WHO digital health guidelines.

### 1.2 Target Stack
| Layer | Technology | Status |
|-------|------------|--------|
| Desktop GUI | Electron (Node.js) with embedded Django backend | ✅ Complete |
| Web Frontend | Next.js 16+, React 19, TypeScript, TailwindCSS, shadcn/ui | ✅ Complete |
| Mobile | React Native 0.81 (Expo 54), WatermelonDB, Offline sync | ✅ Complete |
| Backend | Python 3.12, Django 5.x, Django REST Framework, Celery | ✅ Complete |
| Auth | Django + Simple JWT (refresh tokens) | ✅ Complete |
| DB | SQLite (standalone/offline) or PostgreSQL 16 (cloud) | ✅ Complete |
| Object Storage | Local file system (standalone) or S3-compatible | ✅ Complete |
| Messaging | Celery + Redis for background tasks | ✅ Complete |
| CI/CD | GitHub Actions (3 workflows) | ✅ Complete |
| Container | Docker / Docker Compose | ✅ Complete |

### 1.3 Kenya-Specific Considerations
- **Identifiers**: National ID / Passport / Phone; multiple support with Fernet encryption
- **Compliance**: DPIA completed, Data Processing Register, breach response protocols
- **SHA**: Claims packaging (tariffs, eligibility, attachments) - All 15 DHA APIs integrated
- **KHIS**: Mandatory indicators mapping (planned Phase 2)
- **Sensitive Access**: Restrictions for HIV, GBV, Mental Health with permission-based access
- **Kenya Locations**: Full hierarchy - 47 Counties → 289 Sub-Counties → 1448 Wards
- **Affordability**: Standalone mode requires minimal hardware; cloud optional

### 1.4 Phased Delivery
| Phase | Timeline | Focus | Status |
|-------|----------|-------|--------|
| **Phase 0** | Jan-Mar 2026 | Foundation, Desktop Prototype, Security | ✅ Complete |
| **Phase 1** | Apr-Sep 2026 | Clinical Core, SHA Integration, Mobile, Web | ✅ Complete |
| **Phase 2** | Oct 2026-Mar 2027 | Theatre, Inventory, KHIS Reporting, Cloud Sync | 🚧 In Progress |
| **Phase 3** | Apr-Sep 2027 | MCH/Immunization, Imaging, BI Mart | 📋 Planned |
| **Phase 4** | Oct-Dec 2027 | AI/Advanced Analytics, Global Scaling | 📋 Planned |

---

## 2. Current Status

### 2.1 Implementation Progress

#### ✅ Phase 0 Complete (Foundation)
- Offline-first desktop application with Electron
- JWT authentication with refresh tokens
- Patient registration with auto-MRN generation (MRN-YYYYMMDD-XXXX)
- Encounter management with vitals capture
- Kenya location hierarchy (47 Counties → 289 Sub-Counties → 1448 Wards)
- Fernet field-level encryption for sensitive data (national_id, phone_number)
- Offline sync queue with conflict resolution
- Audit logging (Kenya DPA 2019 compliant - 7 year retention)

#### ✅ Phase 1 Complete (Clinical Core + SHA Integration)
- **SHA Integration** (all 15 DHA APIs):
  - Authentication: JWT token management with 5-min expiry buffer
  - Eligibility: Coverage verification with retry logic
  - Claims: FHIR R4 bundle generation and submission
  - Client Registry: Full CRUD (fetch, register, update)
  - Search: Facility (MFL) and Practitioner (HWR) validation
  - Terminology: ICD-11, LOINC, ICHI, SHA Interventions, Drug Products
- **Laboratory Module**: Orders, results, queue management, PDF requisitions
- **Pharmacy Module**: Inventory, dispensing, prescriptions, stock alerts, FEFO
- **Billing Module**: Invoices, payments, M-Pesa integration, receipts
- **Inpatient Module**: Wards, beds, admissions, nursing Kardex, discharges
- **Triage Module**: KETA scale (RED/ORANGE/YELLOW/GREEN/BLUE), priority queues
- **RBAC**: Roles, departments, permission matrix
- **Mobile App**: React Native with offline sync
- **Web App**: Next.js dashboard with real-time updates

### 2.2 Test Coverage
| Component | Tests | Coverage |
|-----------|-------|----------|
| Backend (Django) | 3,624+ | 87.08% |
| Web App (Jest + Playwright) | 142+ files | E2E + Unit |
| Desktop (Jest) | 66+ | 70%+ |
| Mobile (Jest) | 388+ | - |
| **Total** | **4,200+** | **80%+ enforced** |

### 2.3 Key Metrics Achieved
- ✅ 87%+ backend test coverage (3,624+ tests)
- ✅ Zero critical security vulnerabilities (Bandit + Trivy scan)
- ✅ 100% Kenya Data Protection Act compliance
- ✅ All 15 SHA/DHA APIs integrated
- ✅ Offline-first architecture validated
- ✅ Full RBAC with department-scoped permissions
- ✅ 21 route groups in web dashboard
- ✅ 18 API client modules with Zod validation

---

## 3. Folder & File Structure

\`\`\`
vitora/
├── backend/                        # Django REST API (Python 3.12)
│   ├── manage.py
│   ├── pyproject.toml              # Poetry dependencies
│   ├── Makefile                    # make test, make quality, make format
│   ├── Dockerfile
│   ├── compose.yml
│   ├── hmis/
│   │   ├── settings/
│   │   │   ├── base.py             # Common settings
│   │   │   ├── development.py      # DEBUG=True, SQLite
│   │   │   ├── production.py       # DEBUG=False, PostgreSQL
│   │   │   └── test.py             # Test configuration
│   │   ├── urls.py                 # API routes
│   │   ├── celery.py               # Celery configuration
│   │   └── apps/                   # 10 Django apps
│   │       ├── core/               # AuditLog, Sync, Locations, RBAC, Permissions
│   │       ├── patients/           # Patient, EmergencyContact
│   │       ├── encounters/         # Encounter, Diagnosis, TreatmentPlan
│   │       ├── clinics/            # Clinic, Session, Visit, Enrollment (8 clinic types)
│   │       ├── laboratory/         # LabOrder, LabResult, LabQueue
│   │       ├── pharmacy/           # Drug, Prescription, Dispensing, Inventory
│   │       ├── billing/            # Invoice, Payment, SHA Claims, M-Pesa
│   │       ├── inpatient/          # Ward, Bed, Admission, Discharge, NursingKardex
│   │       ├── triage/             # TriageAssessment, WaitingQueue, KETA scale
│   │       └── clinical_templates/ # ClinicalTemplate, TemplateSection
│   ├── tests/                      # Pytest test suites (3,624+ tests)
│   └── data/                       # CSV imports, clinical templates
│
├── desktop-app/                    # Electron desktop application
│   ├── package.json
│   ├── jest.config.js
│   ├── playwright.config.js
│   ├── src/
│   │   ├── main/               # Electron main process
│   │   ├── preload/            # Context bridge
│   │   └── renderer/           # UI layer
│   └── tests/
│
├── web-app/                        # Next.js 16 web frontend (React 19)
│   ├── package.json
│   ├── next.config.js
│   ├── tailwind.config.js
│   ├── app/                        # 21 route groups
│   │   ├── (dashboard)/            # Protected routes
│   │   │   ├── patients/
│   │   │   ├── encounters/
│   │   │   ├── clinics/            # 8 clinic types
│   │   │   ├── pharmacy/
│   │   │   ├── laboratory/
│   │   │   ├── billing/
│   │   │   ├── triage/
│   │   │   ├── wards/
│   │   │   ├── admissions/
│   │   │   ├── reports/
│   │   │   ├── admin/
│   │   │   ├── finance/
│   │   │   ├── insurance/
│   │   │   └── notifications/
│   │   └── login/
│   ├── components/
│   ├── lib/
│   │   ├── api/                    # 18 API client modules
│   │   ├── schemas/                # Zod validation schemas
│   │   └── hooks/
│   ├── features/                   # BDD feature files (~750 scenarios)
│   └── e2e/                        # Playwright E2E tests
│
├── mobile-app/                     # React Native (Expo 54)
│   ├── package.json
│   ├── app.config.js
│   ├── app/
│   │   ├── (auth)/                 # Authentication screens
│   │   └── (main)/                 # Main app screens
│   ├── components/
│   ├── lib/
│   │   ├── db/                     # WatermelonDB offline storage
│   │   └── sync/                   # Background sync
│   └── __tests__/                  # Jest tests (388+)
│
├── docs/                           # Documentation
├── scripts/                        # Utility scripts
├── docker/                         # Docker configurations
├── .github/
│   ├── copilot-instructions.md     # AI agent onboarding
│   └── workflows/                  # CI/CD pipelines (3 workflows)
├── ROADMAP.md                      # Development roadmap
└── README.md                       # This document
\`\`\`

---

## 4. Local Development Setup

### 4.1 Prerequisites
- Python 3.12+
- Node.js 20+
- Poetry (Python package manager)
- Docker + Docker Compose (optional, for Redis/PostgreSQL)

### 4.2 Backend Setup
\`\`\`bash
cd backend
poetry install
poetry shell

# Enable mandatory git hooks (runs pre-commit on every commit)
cd ..
./scripts/setup-git-hooks.sh
cd backend

# Environment setup
cp .env.example .env
# Edit .env with your settings

# Database migrations
python manage.py migrate
python manage.py createsuperuser

# Load Kenya locations (47 counties, 289 sub-counties, 1448 wards)
python manage.py import_kenya_locations

# Load ICD-10 codes
python manage.py import_icd10

# Run development server (default port 9088)
python manage.py runserver

# Run tests
make test          # Full test suite with coverage
make quality       # Ruff + mypy + bandit
make format        # Black + isort
\`\`\`

### 4.3 Desktop App Setup
\`\`\`bash
cd desktop-app
npm install

# Development (auto-starts backend on port 9088)
npm run dev

# Run tests
npm test                    # Jest unit tests
npm run test:e2e            # Playwright E2E tests
npm run test:coverage       # Coverage report

# Build for distribution
npm run build:linux         # Creates .AppImage, .deb
npm run build:win           # Creates .exe installer
npm run build:mac           # Creates .dmg
\`\`\`

### 4.4 Web App Setup
\`\`\`bash
cd web-app
npm install
npm run dev                 # http://localhost:3009

# Run tests
npm test
npm run test:coverage
\`\`\`

### 4.5 Mobile App Setup
\`\`\`bash
cd mobile-app
npm install
npx expo start              # Opens Expo developer tools
\`\`\`

### 4.6 Environment Variables
Key variables for backend (see \`backend/.env.example\`):
\`\`\`bash
# Django
SECRET_KEY=your-secret-key
DEBUG=true
ALLOWED_HOSTS=localhost,127.0.0.1

# Database
DB_ENGINE=sqlite            # or postgres
DATABASE_URL=sqlite:///vitora.db

# Security
ENCRYPTION_KEY=your-32-byte-fernet-key

# Celery (optional, for background sync)
CELERY_BROKER_URL=redis://localhost:6379/0

# SHA Integration (optional)
SHA_BASE_URL=https://api.sha.go.ke
SHA_CLIENT_ID=your-client-id
SHA_CLIENT_SECRET=your-client-secret
\`\`\`

### 4.7 Verification Checklist
- [ ] Backend: \`python manage.py runserver\` starts on port 9088
- [ ] Tests: \`make test\` passes with ≥80% coverage
- [ ] Quality: \`make quality\` passes (ruff, mypy, bandit)
- [ ] Desktop: \`npm run dev\` opens Electron window
- [ ] Login: Can authenticate with test user
- [ ] Offline: App works without network connection

---

## 5. Backend (Django + DRF) Implementation

### 5.1 Core Models & Architecture
The backend uses Django 5.x with Django REST Framework. All models inherit from \`TimeStampedModel\` with audit fields.

#### 5.1.1 Patient Model (\`hmis/apps/patients/models.py\`)
\`\`\`python
class Patient(TimeStampedModel):
    """Patient master record with Kenya-specific considerations."""
    # Auto-generated (NEVER set manually)
    mrn = models.CharField(unique=True, editable=False)  # Format: MRN-YYYYMMDD-XXXX

    # Required fields
    first_name = models.CharField(max_length=100)
    last_name = models.CharField(max_length=100)
    date_of_birth = models.DateField()  # MUST NOT be in the future
    gender = models.CharField(choices=[('M', 'Male'), ('F', 'Female'), ('O', 'Other')])

    # Kenya location hierarchy (FKs)
    county = models.ForeignKey('core.County', on_delete=models.SET_NULL, null=True)
    sub_county = models.ForeignKey('core.SubCounty', on_delete=models.SET_NULL, null=True)
    ward = models.ForeignKey('core.Ward', on_delete=models.SET_NULL, null=True, blank=True)

    # Privacy (ENCRYPTED with Fernet)
    national_id = models.CharField(null=True)           # Encrypted at rest
    phone_number = models.CharField(null=True)          # Encrypted at rest

    # Sensitive access control
    is_sensitive = models.BooleanField(default=False)   # HIV/GBV/Mental Health

    # Consent (Kenya DPA compliance)
    consent_given = models.BooleanField(default=False)
    consent_date = models.DateTimeField(null=True)

    # Tracking
    registered_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True)
    referral_source = models.CharField(choices=['self', 'clinic', 'other_facility'])

    # Emergency contact (quick access)
    emergency_contact_name = models.CharField(max_length=200, blank=True)
    emergency_contact_phone = models.CharField(max_length=20, blank=True)
    emergency_contact_relationship = models.CharField(max_length=50, blank=True)

    # Sync metadata
    sync_status = models.CharField(max_length=20, default='synced')
    last_synced_at = models.DateTimeField(null=True, blank=True)
\`\`\`

#### 5.1.2 Encounter Model (\`hmis/apps/encounters/models.py\`)
\`\`\`python
class Encounter(TimeStampedModel):
    """Clinical encounter with vitals, diagnoses, and status workflow."""
    patient = models.ForeignKey('patients.Patient', on_delete=models.CASCADE, related_name='encounters')
    encounter_type = models.CharField(choices=[('OPD', 'Outpatient'), ('IPD', 'Inpatient'), ('EMERGENCY', 'Emergency')])
    encounter_date = models.DateField(default=date.today)
    chief_complaint = models.TextField()

    # Status workflow: DRAFT → IN_PROGRESS → COMPLETED
    STATUS_CHOICES = [
        ('DRAFT', 'Draft'),
        ('IN_PROGRESS', 'In Progress'),
        ('COMPLETED', 'Completed'),
        ('CANCELLED', 'Cancelled'),
    ]
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='DRAFT')

    # Vital signs
    temperature = models.DecimalField(null=True)        # °C (36.1-37.2 normal)
    pulse = models.IntegerField(null=True)              # BPM (60-100 normal adult)
    blood_pressure = models.CharField(null=True)        # "120/80" format
    respiratory_rate = models.IntegerField(null=True)   # breaths/min (12-20 normal)
    spo2 = models.DecimalField(null=True)               # % (95-100 normal)
    weight = models.DecimalField(null=True)             # kg
    height = models.DecimalField(null=True)             # cm

    # Medical history (captured per encounter)
    allergies = models.TextField(blank=True)
    chronic_conditions = models.TextField(blank=True)
    current_medications = models.TextField(blank=True)
    past_surgeries = models.TextField(blank=True)
    family_history = models.TextField(blank=True)
    social_history = models.TextField(blank=True)       # Smoking, alcohol, occupation

    def has_critical_vitals(self) -> bool:
        """Returns True if any vital is critical (e.g., SpO2 < 95%)."""

    def get_alerts(self) -> list[str]:
        """Returns list of critical vital alerts."""
\`\`\`

#### 5.1.3 Laboratory Models (\`hmis/apps/laboratory/models.py\`)
\`\`\`python
class LabOrder(TimeStampedModel):
    """Lab order with in-house vs external workflow."""
    ORDER_TYPE_CHOICES = [
        ('IN_HOUSE', 'In-house'),
        ('EXTERNAL', 'External/Referral'),
    ]
    STATUS_CHOICES = [
        ('ORDERED', 'Ordered'),
        ('SPECIMEN_COLLECTED', 'Specimen Collected'),
        ('IN_PROGRESS', 'In Progress'),
        ('COMPLETED', 'Completed'),
        ('CANCELLED', 'Cancelled'),
    ]

    encounter = models.ForeignKey(Encounter, on_delete=models.CASCADE)
    test_name = models.CharField(max_length=200)
    loinc_code = models.CharField(max_length=20, blank=True)
    order_type = models.CharField(choices=ORDER_TYPE_CHOICES)
    status = models.CharField(choices=STATUS_CHOICES, default='ORDERED')
    priority = models.CharField(choices=['routine', 'urgent', 'stat'], default='routine')
    ordered_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True)

    # External lab details
    external_lab_name = models.CharField(max_length=200, blank=True)
    requisition_pdf = models.FileField(upload_to='lab_requisitions/', blank=True)


class LabResult(TimeStampedModel):
    """Lab result linked to a LabOrder."""
    order = models.OneToOneField(LabOrder, on_delete=models.CASCADE, related_name='result')
    result_value = models.TextField()
    unit = models.CharField(max_length=50, blank=True)
    reference_range = models.CharField(max_length=100, blank=True)
    is_abnormal = models.BooleanField(default=False)
    attachments = models.JSONField(default=list)        # Scanned results from external labs
    interpretation = models.TextField(blank=True)
\`\`\`

#### 5.1.4 Pharmacy Models (\`hmis/apps/pharmacy/models.py\`)
\`\`\`python
class Drug(TimeStampedModel):
    """Drug catalog with SHA integration."""
    name = models.CharField(max_length=200)
    generic_name = models.CharField(max_length=200)
    drug_code = models.CharField(max_length=50, unique=True)
    sha_code = models.CharField(max_length=50, blank=True)  # SHA drug product code
    unit_of_measure = models.CharField(max_length=50)
    requires_prescription = models.BooleanField(default=True)
    is_controlled = models.BooleanField(default=False)


class InventoryItem(TimeStampedModel):
    """Pharmacy inventory with FEFO tracking."""
    drug = models.ForeignKey(Drug, on_delete=models.CASCADE)
    batch_number = models.CharField(max_length=100)
    quantity = models.IntegerField(default=0)
    unit_cost = models.DecimalField(max_digits=10, decimal_places=2)
    expiry_date = models.DateField()
    reorder_level = models.IntegerField(default=10)

    @property
    def needs_reorder(self):
        return self.quantity <= self.reorder_level


class Prescription(TimeStampedModel):
    """Prescription linked to encounter."""
    encounter = models.ForeignKey(Encounter, on_delete=models.CASCADE)
    drug = models.ForeignKey(Drug, on_delete=models.CASCADE)
    dosage = models.CharField(max_length=100)
    frequency = models.CharField(max_length=100)
    duration = models.CharField(max_length=100)
    quantity = models.IntegerField()
    instructions = models.TextField(blank=True)
    prescribed_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True)
\`\`\`

#### 5.1.5 Billing Models (\`hmis/apps/billing/models.py\`)
\`\`\`python
class Invoice(TimeStampedModel):
    """Patient invoice with SHA claims integration."""
    STATUS_CHOICES = [
        ('DRAFT', 'Draft'),
        ('PENDING', 'Pending Payment'),
        ('PARTIAL', 'Partially Paid'),
        ('PAID', 'Fully Paid'),
        ('CANCELLED', 'Cancelled'),
    ]

    patient = models.ForeignKey(Patient, on_delete=models.CASCADE)
    encounter = models.ForeignKey(Encounter, on_delete=models.CASCADE, null=True)
    invoice_number = models.CharField(max_length=50, unique=True)
    status = models.CharField(choices=STATUS_CHOICES, default='DRAFT')
    total_amount = models.DecimalField(max_digits=12, decimal_places=2)
    paid_amount = models.DecimalField(max_digits=12, decimal_places=2, default=0)

    # SHA claims
    sha_claim_id = models.CharField(max_length=100, blank=True)
    sha_claim_status = models.CharField(max_length=50, blank=True)


class Payment(TimeStampedModel):
    """Payment record with M-Pesa integration."""
    PAYMENT_METHOD_CHOICES = [
        ('CASH', 'Cash'),
        ('MPESA', 'M-Pesa'),
        ('CARD', 'Card'),
        ('INSURANCE', 'Insurance'),
        ('SHA', 'SHA'),
    ]

    invoice = models.ForeignKey(Invoice, on_delete=models.CASCADE)
    amount = models.DecimalField(max_digits=12, decimal_places=2)
    payment_method = models.CharField(choices=PAYMENT_METHOD_CHOICES)
    reference_number = models.CharField(max_length=100, blank=True)
    received_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True)
\`\`\`

#### 5.1.6 Inpatient Models (\`hmis/apps/inpatient/models.py\`)
\`\`\`python
class Ward(TimeStampedModel):
    """Hospital ward configuration."""
    WARD_TYPE_CHOICES = [
        ('MEDICAL', 'Medical'),
        ('SURGICAL', 'Surgical'),
        ('PEDIATRIC', 'Pediatric'),
        ('MATERNITY', 'Maternity'),
        ('ICU', 'Intensive Care Unit'),
        ('ISOLATION', 'Isolation'),
    ]

    name = models.CharField(max_length=100)
    ward_type = models.CharField(choices=WARD_TYPE_CHOICES)
    capacity = models.IntegerField()
    floor = models.IntegerField(default=1)


class Bed(TimeStampedModel):
    """Individual bed tracking."""
    STATUS_CHOICES = [
        ('AVAILABLE', 'Available'),
        ('OCCUPIED', 'Occupied'),
        ('MAINTENANCE', 'Under Maintenance'),
        ('RESERVED', 'Reserved'),
    ]

    ward = models.ForeignKey(Ward, on_delete=models.CASCADE)
    bed_number = models.CharField(max_length=20)
    status = models.CharField(choices=STATUS_CHOICES, default='AVAILABLE')


class Admission(TimeStampedModel):
    """Patient admission record."""
    patient = models.ForeignKey(Patient, on_delete=models.CASCADE)
    encounter = models.ForeignKey(Encounter, on_delete=models.CASCADE)
    bed = models.ForeignKey(Bed, on_delete=models.SET_NULL, null=True)
    admission_date = models.DateTimeField()
    discharge_date = models.DateTimeField(null=True)
    admitting_diagnosis = models.TextField()
    admitting_officer = models.ForeignKey(User, on_delete=models.SET_NULL, null=True)
\`\`\`

#### 5.1.7 Triage Models (\`hmis/apps/triage/models.py\`)
\`\`\`python
class TriageAssessment(TimeStampedModel):
    """Triage assessment using KETA scale."""
    CATEGORY_CHOICES = [
        ('RED', 'Emergency - Immediate'),
        ('ORANGE', 'Very Urgent - <10 min'),
        ('YELLOW', 'Urgent - <60 min'),
        ('GREEN', 'Standard - <240 min'),
        ('BLUE', 'Non-urgent - Scheduled'),
    ]
    AVPU_CHOICES = [
        ('A', 'Alert'),
        ('V', 'Voice Responsive'),
        ('P', 'Pain Responsive'),
        ('U', 'Unresponsive'),
    ]

    encounter = models.OneToOneField(Encounter, on_delete=models.CASCADE)
    chief_complaint = models.TextField()

    # Clinical assessment
    pain_score = models.IntegerField(null=True)         # 0-10 scale
    avpu = models.CharField(choices=AVPU_CHOICES, default='A')
    mobility = models.CharField(max_length=50)

    # Triage category
    auto_calculated_category = models.CharField(choices=CATEGORY_CHOICES)
    triage_category = models.CharField(choices=CATEGORY_CHOICES)
    category_override_reason = models.TextField(blank=True)

    triaged_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True)
\`\`\`

#### 5.1.8 RBAC Models (\`hmis/apps/core/models.py\`)
\`\`\`python
class Department(models.Model):
    """Hospital department for role scoping."""
    name = models.CharField(max_length=100)
    code = models.CharField(max_length=20, unique=True)
    is_active = models.BooleanField(default=True)


class Role(models.Model):
    """System roles with granular permissions."""
    ROLE_CHOICES = [
        ('ADMIN', 'Administrator'),
        ('DOCTOR', 'Doctor/Clinician'),
        ('NURSE', 'Nurse'),
        ('PHARMACIST', 'Pharmacist'),
        ('LAB_TECH', 'Lab Technician'),
        ('RECEPTIONIST', 'Receptionist'),
        ('BILLING_CLERK', 'Billing Clerk'),
        ('TRIAGE_NURSE', 'Triage Nurse'),
    ]

    name = models.CharField(choices=ROLE_CHOICES, unique=True)
    permissions = models.ManyToManyField('auth.Permission', blank=True)
    can_access_sensitive = models.BooleanField(default=False)
    can_prescribe = models.BooleanField(default=False)
    can_order_labs = models.BooleanField(default=False)
    can_finalize_encounters = models.BooleanField(default=False)


class StaffProfile(models.Model):
    """Extended user profile with role and department."""
    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name='staff_profile')
    role = models.ForeignKey(Role, on_delete=models.PROTECT)
    departments = models.ManyToManyField(Department)
    employee_id = models.CharField(max_length=50, unique=True)
    license_number = models.CharField(max_length=50, blank=True)
\`\`\`

### 5.2 Permission Matrix

| Role | Patients | Encounters | Lab Orders | Lab Results | Pharmacy | Billing | Reports | Sensitive |
|------|----------|------------|------------|-------------|----------|---------|---------|-----------|
| Admin | Full | Full | Full | Full | Full | Full | Full | Yes |
| Doctor | View, Edit | Full | Create, View | View | View | View | View | Yes* |
| Nurse | View, Edit | Create, View, Edit | View | View | View | - | View | No |
| Lab Tech | View | View | View | Full | - | - | View | No |
| Pharmacist | View | View | - | - | Full | View | View | No |
| Receptionist | Create, View, Edit | View | - | - | - | Create | - | No |
| Billing Clerk | View | View | - | - | - | Full | View | No |
| Triage Nurse | View | Create (Triage) | - | - | - | - | View | No |

*Doctors require explicit \`view_sensitive_patient\` permission for HIV/GBV/Mental Health records

### 5.3 API Endpoints

#### Authentication
\`\`\`
POST   /api/token/                  # Login → {access, refresh}
POST   /api/token/refresh/          # Refresh → {access}
POST   /api/token/verify/           # Verify → 200 OK
\`\`\`

#### Patients
\`\`\`
GET    /api/patients/               # List (paginated, filterable)
POST   /api/patients/               # Create (auto-generates MRN)
GET    /api/patients/{id}/          # Detail
PATCH  /api/patients/{id}/          # Update
DELETE /api/patients/{id}/          # Soft delete
GET    /api/patients/{id}/emergency-contacts/
POST   /api/patients/{id}/emergency-contacts/
\`\`\`

#### Encounters
\`\`\`
GET    /api/encounters/             # List
POST   /api/encounters/             # Create
GET    /api/encounters/{id}/        # Detail
PATCH  /api/encounters/{id}/        # Update
POST   /api/encounters/{id}/finalize/  # Complete encounter
GET    /api/encounters/{id}/diagnoses/
POST   /api/encounters/{id}/diagnoses/
\`\`\`

#### Laboratory
\`\`\`
GET    /api/laboratory/orders/      # List lab orders
POST   /api/laboratory/orders/      # Create lab order
GET    /api/laboratory/queue/       # Lab queue (in-house)
POST   /api/laboratory/orders/{id}/results/  # Enter results
GET    /api/laboratory/orders/{id}/requisition/  # PDF requisition
\`\`\`

#### Pharmacy
\`\`\`
GET    /api/pharmacy/drugs/         # Drug catalog
GET    /api/pharmacy/inventory/     # Stock levels
GET    /api/pharmacy/inventory/low-stock/  # Items needing reorder
GET    /api/pharmacy/inventory/expiring/   # Expiring items
POST   /api/pharmacy/prescriptions/ # Create prescription
POST   /api/pharmacy/dispense/      # Dispense medication
\`\`\`

#### Billing
\`\`\`
GET    /api/billing/invoices/       # List invoices
POST   /api/billing/invoices/       # Create invoice
GET    /api/billing/invoices/{id}/  # Invoice detail
POST   /api/billing/payments/       # Record payment
GET    /api/billing/invoices/{id}/receipt/  # Generate receipt PDF
\`\`\`

#### SHA Integration
\`\`\`
POST   /api/sha/auth/token/         # Get SHA access token
GET    /api/sha/members/{id}/       # SHA member lookup
POST   /api/sha/members/{id}/verify/  # Verify eligibility
POST   /api/sha/claims/             # Create claim
POST   /api/sha/claims/{id}/submit/ # Submit to SHA
GET    /api/sha/claims/{id}/status/ # Check claim status
GET    /api/sha/terminology/icd11/  # ICD-11 code lookup
GET    /api/sha/terminology/interventions/  # SHA interventions
GET    /api/sha/facilities/         # MFL facility search
GET    /api/sha/practitioners/      # HWR practitioner search
\`\`\`

#### Triage
\`\`\`
GET    /api/triage/queue/           # Waiting queue
POST   /api/triage/checkin/         # Check in patient
POST   /api/triage/assessments/     # Create assessment
PATCH  /api/triage/queue/{id}/call/ # Call patient
GET    /api/triage/reports/wait-times/  # Wait time report
\`\`\`

#### Inpatient
\`\`\`
GET    /api/inpatient/wards/        # List wards
GET    /api/inpatient/beds/         # List beds
GET    /api/inpatient/beds/available/  # Available beds
POST   /api/inpatient/admissions/   # Admit patient
GET    /api/inpatient/admissions/{id}/  # Admission detail
POST   /api/inpatient/admissions/{id}/discharge/  # Discharge
POST   /api/inpatient/admissions/{id}/kardex/  # Add Kardex entry
GET    /api/inpatient/dashboard/    # Bed occupancy dashboard
\`\`\`

#### Kenya Locations
\`\`\`
GET    /api/locations/counties/     # All 47 counties
GET    /api/locations/sub-counties/?county={id}  # Cascading
GET    /api/locations/wards/?sub_county={id}     # Cascading
\`\`\`

---

## 6. Frontend (Next.js) Implementation

### 6.1 Architecture
- **Framework**: Next.js 16+ with App Router (React 19)
- **Styling**: TailwindCSS + shadcn/ui component library
- **State Management**: TanStack Query 5 for server state, Zustand 4 for local state
- **Forms**: React Hook Form 7 + Zod 3.22 validation
- **Offline Support**: Service Workers + IndexedDB
- **API Validation**: Zod schemas for all API responses

### 6.2 Web App Modules
| Module | Routes | Status |
|--------|--------|--------|
| **Dashboard** | `/dashboard` | ✅ Complete |
| **Patients** | `/patients`, `/patients/new`, `/patients/[id]` | ✅ Complete |
| **Encounters** | `/encounters`, `/encounters/[id]` | ✅ Complete |
| **Clinics** | `/clinics` (8 types: General OPD, MCH, Dental, Eye, Chronic Care, Immunization, Surgical, Enrollments) | ✅ Complete |
| **Triage** | `/triage`, reports, settings | ✅ Complete |
| **Pharmacy** | Dispensing, drugs, prescriptions, stock, reports | ✅ Complete |
| **Laboratory** | Orders, results, tests | ✅ Complete |
| **Billing** | Invoices, receipts, SHA claims | ✅ Complete |
| **Wards** | `/wards`, `/wards/[id]` | ✅ Complete |
| **Admissions** | `/admissions` | ✅ Complete |
| **Reports** | `/reports` | ✅ Complete |
| **Admin** | `/admin` | ✅ Complete |
| **Finance** | `/finance` | ✅ Complete |
| **Insurance** | `/insurance` | ✅ Complete |
| **Notifications** | `/notifications` | ✅ Complete |
| **Imaging** | `/imaging` | 📋 Planned |
| **Theatre** | `/theatre` | 📋 Planned |

### 6.3 API Client Modules (18 modules)
All API clients include Zod validation schemas:
- `billing.ts`, `clinical-templates.ts`, `clinics.ts`, `consultation-queue.ts`
- `core.ts`, `encounters.ts`, `events.ts`, `inpatient.ts`
- `laboratory.ts`, `locations.ts`, `notifications.ts`, `patients.ts`
- `pharmacy.ts`, `rbac.ts`, `sha.ts`, `triage.ts`

### 6.4 Project Structure
\`\`\`
web-app/
├── app/
│   ├── (dashboard)/           # Protected routes with auth
│   │   ├── layout.tsx         # Sidebar + Header layout
│   │   ├── page.tsx           # Dashboard with stats
│   │   ├── patients/          # Patient management
│   │   ├── encounters/        # Encounter management
│   │   ├── pharmacy/          # Pharmacy module
│   │   ├── laboratory/        # Laboratory module
│   │   ├── billing/           # Billing module
│   │   ├── triage/            # Triage queue
│   │   ├── inpatient/         # Inpatient module
│   │   └── reports/           # Reporting dashboard
│   └── login/                 # Authentication
├── components/
│   ├── layout/
│   │   ├── sidebar.tsx        # Collapsible sidebar (64px/256px)
│   │   ├── header.tsx         # Breadcrumb, search, notifications
│   │   └── breadcrumb.tsx     # Dynamic breadcrumb
│   ├── ui/                    # shadcn/ui components
│   └── shared/                # LoadingSpinner, EmptyState, PageHeader
└── lib/
    ├── api/                   # Axios client with interceptors
    ├── auth/                  # AuthProvider, AuthGuard, useAuth
    └── hooks/                 # Custom hooks
\`\`\`

### 6.3 Key Features
- **Responsive Design**: Mobile-first with overlay sidebar on mobile
- **Dark Mode**: System preference detection + manual toggle
- **Real-time Updates**: WebSocket notifications for critical alerts
- **Offline Support**: Service Worker caching for static assets
- **Role-based UI**: Components render based on user permissions

### 6.4 Brand Colors (Vitora HMIS)
\`\`\`css
:root {
  --primary: #3D000F;      /* Deep Burgundy */
  --secondary: #1A4D5C;    /* Teal */
  --accent: #D4A574;       /* Warm Gold */
}
\`\`\`

---

## 7. Desktop App (Electron) Implementation

### 7.1 Architecture
The desktop app embeds the Django backend and provides offline-first functionality:

\`\`\`
desktop-app/
├── src/
│   ├── main/
│   │   └── index.js           # Main process
│   │       - Spawns Django backend on startup
│   │       - Manages window lifecycle
│   │       - IPC handlers for token management
│   │       - Auto-update mechanism
│   ├── preload/
│   │   └── preload.js         # Context bridge
│   │       - Exposes safe APIs to renderer
│   │       - electronAPI.login(), logout(), getToken()
│   │       - electronAPI.showNotification()
│   └── renderer/
│       ├── index.html         # Main HTML
│       ├── app.js             # UI logic
│       │   - Login form
│       │   - Patient registration
│       │   - Encounter management
│       │   - Offline queue display
│       └── styles.css         # Styling with dark mode
\`\`\`

### 7.2 Features
- **Backend Integration**: Spawns Django on port 9088
- **Token Management**: Encrypted electron-store for JWT tokens
- **Auto-refresh**: Tokens refreshed 5 min before expiry
- **Offline Queue**: Visual indicator of pending sync items
- **Dark Mode**: System preference with manual toggle
- **System Tray**: Background sync status indicator
- **Auto-update**: Electron auto-updater for releases

### 7.3 IPC Handlers
\`\`\`javascript
// Main process handlers
ipcMain.handle('auth:login', async (event, credentials) => { ... });
ipcMain.handle('auth:logout', async () => { ... });
ipcMain.handle('auth:getToken', async () => { ... });
ipcMain.handle('sync:getStatus', async () => { ... });
ipcMain.handle('sync:forceSync', async () => { ... });
\`\`\`

---

## 8. Mobile App (React Native) Implementation

### 8.1 Architecture
- **Framework**: React Native with Expo
- **Database**: SQLite (expo-sqlite) for offline storage
- **Sync**: Background sync with queue management
- **Navigation**: React Navigation

### 8.2 Key Features
- Patient lookup and registration
- Vital signs recording during rural outreach
- Offline-first data persistence
- Background sync when connectivity available
- Biometric authentication support
- Push notifications for critical alerts

### 8.3 Use Cases
- Rural outreach clinics
- Ward rounds without WiFi
- Community health worker visits
- Emergency mobile response teams

---

## 9. Database Schema (Core Modules)

### 9.1 Entity Relationship Overview
\`\`\`
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│   Patient    │────<│  Encounter   │────<│   LabOrder   │
└──────────────┘     └──────────────┘     └──────────────┘
       │                    │                    │
       │                    │                    │
       ▼                    ▼                    ▼
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│EmergencyContact│    │  Diagnosis   │     │  LabResult   │
└──────────────┘     └──────────────┘     └──────────────┘
       │                    │
       │                    │
       ▼                    ▼
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│    County    │     │TreatmentPlan │     │ Prescription │
└──────────────┘     └──────────────┘     └──────────────┘
       │                    │                    │
       ▼                    │                    ▼
┌──────────────┐            │             ┌──────────────┐
│  SubCounty   │            │             │  Dispensing  │
└──────────────┘            │             └──────────────┘
       │                    │
       ▼                    ▼
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│     Ward     │     │   Invoice    │────<│   Payment    │
└──────────────┘     └──────────────┘     └──────────────┘
\`\`\`

### 9.2 Key Tables

See Section 5 for detailed model definitions. Core tables:
- \`patients_patient\`: Patient master record
- \`encounters_encounter\`: Clinical encounters with vitals
- \`laboratory_laborder\`: Lab orders (in-house/external)
- \`laboratory_labresult\`: Lab results
- \`pharmacy_drug\`: Drug catalog
- \`pharmacy_inventoryitem\`: Inventory with FEFO
- \`pharmacy_prescription\`: Prescriptions
- \`billing_invoice\`: Patient invoices
- \`billing_payment\`: Payment records
- \`inpatient_ward\`: Ward configuration
- \`inpatient_bed\`: Bed tracking
- \`inpatient_admission\`: Admission records
- \`triage_triageassessment\`: Triage assessments
- \`core_auditlog\`: Audit trail (7-year retention)

---

## 10. Security & Privacy (Kenya Data Protection Act)

### 10.1 Data Protection Act (2019) Compliance
| Requirement | Implementation |
|-------------|----------------|
| **Consent Management** | Explicit consent tracking with timestamps |
| **Data Minimization** | Only necessary patient data collected |
| **Purpose Limitation** | AuditLog.details['purpose'] tracks processing purpose |
| **Storage Limitation** | 7-year audit log retention |
| **Integrity & Confidentiality** | Fernet encryption for sensitive fields |
| **Accountability** | Full audit trail on all data access |
| **Data Subject Rights** | Export/delete patient data via API |

### 10.2 Security Measures

#### Authentication & Authorization
- JWT-based authentication with 30-min access / 7-day refresh tokens
- Role-Based Access Control (RBAC) with permission matrix
- Session timeout and management
- Rate limiting on auth endpoints

#### Data Protection
- **In Transit**: TLS 1.3 for all network communications
- **At Rest**: Fernet encryption for national_id, phone_number
- **Sensitive Data**: Additional access controls for HIV/GBV/Mental Health

#### Audit Logging
All data access is logged:
\`\`\`python
AuditLog.log(
    action='patient_view',
    user=request.user,
    resource_type='Patient',
    resource_id=patient.id,
    ip_address=get_client_ip(request),
    details={'purpose': 'clinical_care'}
)
\`\`\`

#### SensitiveAccessPermission
\`\`\`python
class SensitiveAccessPermission(BasePermission):
    """Restricts access to sensitive patient records."""
    def has_object_permission(self, request, view, obj):
        if obj.is_sensitive:
            return request.user.has_perm('patients.view_sensitive_patient')
        return True
\`\`\`

### 10.3 DPIA Completed
Data Protection Impact Assessment documented in \`docs/dpia.md\`.

---

## 11. Interoperability (FHIR, KHIS/DHIS2, SHA)

### 11.1 SHA Integration (Complete ✅)
All 15 DHA APIs integrated:

| Service | Endpoint | Status |
|---------|----------|--------|
| Authentication | /v1/hie-auth | ✅ Complete |
| Eligibility | /v2/eligibility | ✅ Complete |
| Claims Submit | /v1/shr-med/bundle | ✅ Complete |
| Claims Status | /v1/shr-med/claim-status | ✅ Complete |
| Client Registry Fetch | /v3/client-registry/fetch-client | ✅ Complete |
| Client Registry Register | /v3/uat-cr-registration | ✅ Complete |
| Client Registry Update | /v3/update-client | ✅ Complete |
| Facility Search | /v1/facility-search | ✅ Complete |
| Practitioner Search | /v1/practitioner-search | ✅ Complete |
| ICD-11 | /v1/icd-11 | ✅ Complete |
| LOINC | /v1/loinc | ✅ Complete |
| ICHI | /v1/ichi | ✅ Complete |
| SHA Interventions | /v1/sha-interventions | ✅ Complete |
| Drug Products | /v1/drug-products | ✅ Complete |
| Active Components | /v1/active-component | ✅ Complete |

See \`docs/sha-guides/\` for detailed integration documentation.

### 11.2 KHIS/DHIS2 Integration (Planned Phase 2)
- OPD attendance indicators
- IPD admissions indicators
- Immunization coverage
- Disease surveillance

### 11.3 FHIR R4 Compliance
Support for key FHIR resources:
- Patient: Map to internal Patient model
- Encounter: Clinical visit mapping
- Observation: Vitals and lab results
- MedicationRequest: Prescriptions

---

## 12. Testing Strategy & Quality Gates

### 12.1 TDD Approach
All features developed using Test-Driven Development:
1. **RED**: Write failing tests first
2. **GREEN**: Write minimal code to pass tests
3. **REFACTOR**: Improve code while keeping tests green

### 12.2 Testing Pyramid
- **Unit Tests** (70%): Fast, isolated, models and utilities
- **Integration Tests** (20%): API endpoints, database operations
- **E2E Tests** (10%): Critical user workflows, Playwright

### 12.3 Backend Testing
\`\`\`bash
cd backend

# Run all tests with coverage
make test  # or: poetry run pytest --cov=hmis --cov-fail-under=80

# Run specific test file
poetry run pytest tests/test_patient_api.py -v

# Quality checks
make quality  # ruff + mypy + bandit
\`\`\`

### 12.4 Coverage Requirements
- **Backend**: ≥80% coverage enforced (currently 82%+)
- **Desktop**: ≥70% coverage target (currently 70%+)
- **CI/CD**: All tests must pass before merge

### 12.5 Quality Gates
Before merge:
- [ ] All tests pass
- [ ] Code coverage ≥80%
- [ ] Ruff linting passes
- [ ] Type checking passes (mypy)
- [ ] Security scan clean (Bandit)
- [ ] No known vulnerabilities in dependencies

---

## 13. Deployment & Operations

### 13.1 Deployment Modes

#### Standalone Desktop (Offline-First)
\`\`\`bash
cd desktop-app
npm run build:linux   # Creates .AppImage, .deb
npm run build:win     # Creates .exe installer
npm run build:mac     # Creates .dmg
\`\`\`

Distribution includes:
- Embedded Python + Django backend
- SQLite database
- Auto-update mechanism

#### Docker (Development/Staging)
\`\`\`bash
cd backend
docker compose up -d
\`\`\`

Services:
- Django backend (port 9088)
- PostgreSQL (port 5432)
- Redis (port 6379)

### 13.2 Production Checklist
- [ ] Set \`DEBUG=false\`
- [ ] Configure proper \`SECRET_KEY\`
- [ ] Set up SSL/TLS certificates
- [ ] Configure backup strategy
- [ ] Enable monitoring (Prometheus/Grafana)
- [ ] Set up log aggregation
- [ ] Configure rate limiting
- [ ] Set up health checks

### 13.3 Backup & Recovery
- **Standalone**: Automated daily backups with encryption
- **Cloud**: PostgreSQL point-in-time recovery
- **RTO**: <4 hours standalone, <15 minutes cloud
- **RPO**: <24 hours standalone, <5 minutes cloud

---

## 14. Future AI/ML Integration Roadmap

### 14.1 Phase 4 AI Capabilities (Planned Q4 2027)

#### Predictive Analytics
- **Sepsis Early Warning**: Real-time risk scoring based on vitals
- **No-Show Prediction**: Appointment adherence modeling
- **Resource Optimization**: Bed and staff allocation predictions

#### Clinical Decision Support
- **Drug Interaction Alerts**: Automated pharmacy safety checks
- **Diagnosis Assistance**: Symptom-based differential suggestions
- **Treatment Recommendations**: Evidence-based protocol guidance

#### Operational Intelligence
- **Inventory Forecasting**: Stock prediction using historical patterns
- **Patient Flow Optimization**: Queue management and wait time reduction

### 14.2 Implementation Strategy
- **Local Models**: ONNX format for edge deployment (offline mode)
- **Cloud Models**: API-based inference for connected facilities
- **Privacy**: On-device processing for sensitive data

---

## 15. Appendix

### A. Sample .env File
\`\`\`bash
# Django
SECRET_KEY=your-secret-key-here
DEBUG=False
ALLOWED_HOSTS=localhost,127.0.0.1

# Database
DB_ENGINE=sqlite
DATABASE_URL=sqlite:///vitora.db

# Security
ENCRYPTION_KEY=your-32-byte-fernet-key

# Celery (optional)
CELERY_BROKER_URL=redis://localhost:6379/0

# SHA Integration (optional)
SHA_BASE_URL=https://api.sha.go.ke
SHA_CLIENT_ID=your-client-id
SHA_CLIENT_SECRET=your-client-secret
\`\`\`

### B. Available Test Fixtures
\`\`\`python
# backend/tests/conftest.py
api_client              # Unauthenticated DRF APIClient
test_user               # User instance
authenticated_client    # APIClient with force_authenticate
sample_county           # County(code=1, name="Mombasa")
sample_sub_county       # SubCounty linked to sample_county
sample_ward             # Ward linked to sample_sub_county
patient_data            # Dict with valid patient fields
sample_patient          # Patient instance
encounter_data          # Dict with valid encounter fields
sample_encounter        # Encounter instance
\`\`\`

### C. Common Commands
\`\`\`bash
# Backend
cd backend
make test              # Run tests with coverage
make quality           # Ruff + mypy + bandit
make format            # Black + isort
python manage.py migrate
python manage.py createsuperuser
python manage.py runserver

# Desktop
cd desktop-app
npm run dev            # Development
npm test               # Unit tests
npm run test:e2e       # E2E tests
npm run build:linux    # Build for Linux

# Web
cd web-app
npm run dev            # Development
npm test               # Tests

# Mobile
cd mobile-app
npx expo start         # Development
\`\`\`

### D. Key Documentation
- **Roadmap**: [ROADMAP.md](ROADMAP.md)
- **TDD Guidelines**: [docs/tdd-guidelines.md](docs/tdd-guidelines.md)
- **Coding Standards**: [docs/coding-standards.md](docs/coding-standards.md)
- **DPIA**: [docs/dpia.md](docs/dpia.md)
- **SHA Guides**: [docs/sha-guides/](docs/sha-guides/)
- **Sprint Deliverables**: [docs/sprint-*.md](docs/)

---

## Contributing

1. Fork the repository
2. Create a feature branch (\`git checkout -b feature/amazing-feature\`)
3. **Write tests first** (TDD approach)
4. Ensure all tests pass (\`make test\`)
5. Ensure quality checks pass (\`make quality\`)
6. Commit with conventional commits (\`feat:\`, \`fix:\`, \`docs:\`)
7. Push and create Pull Request

### Code Style
- **Python**: Black + isort + Ruff
- **JavaScript/TypeScript**: Prettier + ESLint
- **Commits**: Conventional Commits

---

## Support

- **Documentation**: [docs/](docs/)
- **Issues**: GitHub Issues
- **Contact**: dev@nexora.africa
- **Company**: Nexora Africa Ltd

---

## License

Proprietary - Nexora Africa Ltd © 2026

---

**Built with ❤️ for Kenya's Healthcare**
