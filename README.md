# Vitora HMIS 
> Vitora HMIS — Built for Care Without Limits

---

# Kenya HMIS (Hospital Management Information System)
_Comprehensive Technical Blueprint & Implementation Guide (Kenya-Tailored)_  
_Last Updated: December 27, 2025_

---

## Table of Contents

1. Project Overview  
2. Folder & File Structure  
3. Local Development Setup  
4. Backend (Django + DRF) Implementation Plan  
5. Frontend (Next.js) Implementation Plan  
6. Desktop App (Electron/PyQt) Implementation Plan  
7. Mobile App (React Native) Implementation Plan  
8. Database Schema (Core Modules)  
9. Security & Privacy (Kenya Data Protection Act Alignment)  
10. Interoperability (FHIR, KHIS/DHIS2, SHA)  
11. Testing Strategy & Quality Gates  
12. Deployment & Operations (Docker / Kubernetes / Monitoring)  
13. Future AI/ML Integration Roadmap  
14. Appendix  
   - A. Sample .env Files  
   - B. API Endpoint Inventory (REST + FHIR)  
   - C. KHIS/DHIS2 Indicator Mapping (Starter)  
   - D. Role Matrix (Sample)  
   - E. Definition of Done Checklist  

---

## 1. Project Overview

### 1.1 Context & Goals
A modular-monolith Hospital Management Information System tailored for Kenya, combining the best of standalone offline operations and optional cloud connectivity:

- **Offline-first** for rural / low-bandwidth facilities.
- **FHIR R4-compliant** interoperability.
- **KHIS (DHIS2)** aggregate reporting and Social Health Authority (SHA) claims integration.
- **Strong auditability and privacy** under the Kenya Data Protection Act (2019).
- **Progressive scale**: single facility → multi-facility tenancy (PostgreSQL RLS) → regional DR.

**Core Vision**:
- **Offline-First Standalone Desktop Application**: Runs fully on local machines or hospital servers without internet, supporting essential workflows (e.g., patient records, appointments, billing, reporting). Uses lightweight embedded databases like SQLite for single-site setups or PostgreSQL for multi-department loads. Ensures continuity during outages, ideal for Kenya's infrastructure challenges.
- **Optional Cloud Integration**: Enables sync with a cloud backend for multi-location access, centralized analytics, secure off-site backups, and real-time collaboration. Background synchronization handles conflicts gracefully, allowing hospitals to start standalone and scale gradually.
- **Flexible Architecture**: Desktop GUI via Python PyQt (cross-platform) or Electron (wrapping Next.js for quick deployment); backend/cloud via Python Django/FastAPI (primary) or C# .NET Core (alternative for enterprise integrations). Mobile app option for out-of-office tasks like rural outreach.
- **Kenya-First with Global Standards**: FHIR R4-compliant interoperability, KHIS (DHIS2) aggregate reporting, Social Health Authority (SHA) claims integration, and strong auditability/privacy under the Kenya Data Protection Act (2019). Progressive scale: single clinic → multi-facility tenancy → regional disaster recovery (DR).
- **Why This Approach**: Hospitals can adopt affordably (standalone first, no cloud costs initially), ensuring uninterrupted care while enabling growth. Forward-looking for AI (e.g., sepsis predictions) and analytics, aligned with Kenya's health goals and global standards like WHO digital health guidelines.

### 1.2 Target Stack
| Layer | Technology |
|-------|------------|
| Desktop GUI | Electron (wrapping Next.js) or PyQt (native Python cross-platform); optional C# WPF/WinForms for Windows-only. |
| Web Frontend | Next.js (React 18), TypeScript, TailwindCSS, TanStack Query |
| Mobile | React Native (Android focus), SQLite (WatermelonDB / Expo SQLite), Offline sync |
| Backend | Python 3.12, Django 5.x, Django REST Framework, Celery |
| Auth | Django + Simple JWT (or Keycloak/OAuth2 provider) |
| DB | SQLite (standalone/offline) or PostgreSQL 16 (Row Level Security); optional TimescaleDB for time-series vitals |
| Object Storage | Local file system (standalone) or S3-compatible (MinIO in dev, AWS S3/Wasabi in production) |
| Messaging | Postgres LISTEN/NOTIFY → Kafka (scale) |
| Observability | OpenTelemetry, Prometheus, Grafana, Loki, Tempo/OTel collector |
| CI/CD | GitHub Actions |
| IaC | Terraform + optional Helm for K8s (cloud only) |
| Container | Docker / Kubernetes (cloud/hybrid) |

### 1.3 Kenya-Specific Considerations
- **Identifiers**: National ID / Passport / Phone; multiple support.
- **Compliance**: DPIA, Data Processing Register, breach response.
- **SHA**: Claims packaging (tariffs, eligibility, attachments).
- **KHIS**: Mandatory indicators mapping.
- **Sensitive Access**: Restrictions for HIV, GBV, Mental Health.
- **Affordability**: Standalone mode requires minimal hardware (e.g., Raspberry Pi-compatible for rural clinics); cloud optional with low-cost providers like AWS Africa.

### 1.4 Phased Delivery (High Level)
1. **Phase 0** – Inception & Readiness (Infrastructure, Security, Standalone Desktop Prototype).  
2. **Phase 1** – Clinical Core (PAS, Encounters, Orders, Pharmacy, Basic Billing; Offline Desktop/Mobile).  
3. **Phase 2** – Claims, Theatre, Inventory, Reporting v1; Cloud Sync Introduction.  
4. **Phase 3** – MCH/Immunization, Imaging, BI Mart; Multi-Site Hybrid.  
5. **Phase 4** – AI/Advanced Analytics; Global Scaling.

---

## 2. Folder & File Structure

```
vitora/
  backend/  # Shared for standalone/cloud
    manage.py
    pyproject.toml
    poetry.lock
    Dockerfile
    Makefile
    README.md
    requirements/
      base.txt
      dev.txt
    hmis/
      __init__.py
      settings/
        __init__.py
        base.py
        development.py
        production.py
        test.py
      urls.py
      wsgi.py
      asgi.py
      apps/
        patients/
          __init__.py
          models.py
          serializers.py
          views.py
          permissions.py
          urls.py
          management/
            commands/
              generate_mrn.py
        encounters/
          __init__.py
          models.py  # Encounter, ICD10Code, Diagnosis, TreatmentPlan
          serializers.py
          views.py
          urls.py
          admin.py
        clinical_templates/  # Phase 1: Sprint 1.1-1.2
          __init__.py
          models.py  # ClinicalTemplate, TemplateSection
          serializers.py
          views.py
          urls.py
          admin.py
        pharmacy/
          __init__.py
          models.py
          serializers.py
          views.py
          urls.py
        billing/
          __init__.py
          models.py
          serializers.py
          views.py
          urls.py
        reporting/
          __init__.py
          models.py
          views.py
          exporters/
            khis.py
            sha.py
      core/
        __init__.py
        models.py  # Base models with audit fields
        permissions.py
        utils.py
        sync.py  # Offline sync utilities
  frontend-web/  # For web/browser access; wrapped in desktop
    package.json
    next.config.js
    tsconfig.json
    src/
      app/
        layout.tsx
        page.tsx
        patients/
        encounters/
        pharmacy/
      components/
        ui/
        forms/
      lib/
        api.ts
        auth.ts
      hooks/
        useOfflineSync.ts
    public/
      service-worker.js  # Offline support
  desktop-app/  # Standalone desktop wrapper
    package.json  # For Electron
    main.js       # Electron entry
    preload.js
    or pyqt_main.py  # PyQt alternative
    src/
      # Integrates frontend-web
    scripts/
      build-desktop.sh  # Packaging for Windows/Linux/Mac
      start-backend.sh
  mobile-app/
    package.json
    app.json
    App.tsx
    src/
      screens/
        patients/
        encounters/
      components/
      services/
        sync.ts
        sqlite.ts
      navigation/
  infrastructure/
    docker-compose.yml  # For local/cloud dev
    standalone-compose.yml  # Offline-only setup with SQLite
    Dockerfile.backend
    Dockerfile.frontend
    k8s/  # Cloud only
      deployment.yaml
      service.yaml
      ingress.yaml
    terraform/
      main.tf
      variables.tf
      outputs.tf
  scripts/
    init_db.sql
    load_demo_data.py
    backup.sh
    restore.sh
    sync-cloud.py  # Manual/offline sync script
  tests/
    conftest.py
    test_patients.py
    test_encounters.py
    test_sync.py
  docs/
    architecture.md
    api-reference.md
    dpia.md
    data-processing-register.md
    standalone-guide.md  # Offline deployment instructions
    development-guide.md
  .github/
    workflows/
      ci.yml
      security.yml
      release.yml  # Desktop build/release
  .env.example
  .gitignore
  LICENSE
  README.md (this doc)
```

---

## 3. Local Development Setup

### 3.1 Prerequisites
- Python 3.12+
- Node.js 20+ / pnpm or yarn
- Docker + Docker Compose (for hybrid/cloud)
- Electron/PyQt (for desktop)
- PostgreSQL 16 or SQLite (standalone)

### 3.2 Quick Start (Standalone Offline)
```bash
git clone https://github.com/nexora-africa-ltd/vitora.git
cd vitora
cp .env.example .env
# For standalone: Use SQLite (default)
docker compose -f infrastructure/standalone-compose.yml up -d --build  # Runs local backend + desktop
# Or without Docker: 
cd backend
poetry install
poetry run python manage.py migrate
poetry run python manage.py runserver
# In another terminal:
cd desktop-app
npm install
npm run electron:serve
```

### 3.3 Quick Start (Hybrid/Cloud Dev)
```bash
git clone https://github.com/nexora-africa-ltd/vitora.git
cd vitora
cp .env.example .env
# Configure for PostgreSQL
docker compose -f infrastructure/docker-compose.yml up -d --build
```

### 3.4 Desktop Setup
```bash
cd desktop-app
npm install
npm run electron:serve  # Dev mode
npm run electron:build  # Package for distribution
```
For PyQt alternative:
```bash
cd desktop-app
pip install pyqt6
python pyqt_main.py
```

### 3.5 Backend Setup
```bash
cd backend
poetry install
poetry run python manage.py migrate
poetry run python manage.py createsuperuser
poetry run python manage.py runserver
```

### 3.6 Frontend Setup
```bash
cd frontend-web
npm install
npm run dev
```

### 3.7 Mobile Setup
```bash
cd mobile-app
npm install
npx expo start
```

### 3.8 Environment Variables
Key environment variables (see `.env.example` for full list):
- `DB_ENGINE=sqlite` (standalone) or `postgres` (cloud)
- `DATABASE_URL=sqlite:///vitora.db` or `postgres://...`
- `CLOUD_SYNC_ENABLED=false` (standalone) or `true` (cloud)
- `SECRET_KEY=<django-secret-key>`
- `DEBUG=true` (development only)
- `ALLOWED_HOSTS=localhost,127.0.0.1`

### 3.9 Verification Checklist
- [ ] Standalone mode: App runs offline, logs vitals, syncs on connect.
- [ ] Desktop: Local DB access, no browser needed.
- [ ] Cloud: Sync test between desktop/mobile.
- [ ] Tests pass: `pytest` in backend.
- [ ] Linting passes: `ruff check .` in backend.

---

## 4. Backend (Django + DRF) Implementation Plan

### 4.1 Core Models & Architecture
The backend uses Django 5.x with Django REST Framework for API endpoints. All models inherit from a base `TimeStampedModel` with audit fields.

#### 4.1.1 Patient Model (`hmis/apps/patients/models.py`)
```python
from django.db import models
from hmis.core.models import TimeStampedModel

class Patient(TimeStampedModel):
    """Patient master record with Kenya-specific considerations."""
    mrn = models.CharField(max_length=20, unique=True, db_index=True)  # Medical Record Number
    national_id = models.CharField(max_length=20, blank=True, null=True, db_index=True)
    passport_number = models.CharField(max_length=20, blank=True, null=True)
    phone_number = models.CharField(max_length=15, blank=True, null=True)
    
    first_name = models.CharField(max_length=100)
    middle_name = models.CharField(max_length=100, blank=True)
    last_name = models.CharField(max_length=100)
    date_of_birth = models.DateField()
    gender = models.CharField(max_length=10, choices=[('M', 'Male'), ('F', 'Female'), ('O', 'Other')])
    
    # Consent & Privacy
    consent_given = models.BooleanField(default=False)
    consent_date = models.DateTimeField(null=True, blank=True)
    is_sensitive = models.BooleanField(default=False)  # HIV, GBV, Mental Health
    
    # Sync metadata
    sync_status = models.CharField(max_length=20, default='synced')
    last_synced_at = models.DateTimeField(null=True, blank=True)
```

#### 4.1.2 Encounter Model (`hmis/apps/encounters/models.py`)
```python
class Encounter(TimeStampedModel):
    """Clinical encounter with vitals and diagnoses."""
    patient = models.ForeignKey('patients.Patient', on_delete=models.CASCADE)
    encounter_type = models.CharField(max_length=50)  # OPD, IPD, Emergency
    encounter_date = models.DateTimeField(auto_now_add=True)
    
    # Vitals
    temperature = models.DecimalField(max_digits=4, decimal_places=1, null=True, blank=True)
    blood_pressure_systolic = models.IntegerField(null=True, blank=True)
    blood_pressure_diastolic = models.IntegerField(null=True, blank=True)
    pulse = models.IntegerField(null=True, blank=True)
    respiratory_rate = models.IntegerField(null=True, blank=True)
    weight = models.DecimalField(max_digits=5, decimal_places=2, null=True, blank=True)
    height = models.DecimalField(max_digits=5, decimal_places=2, null=True, blank=True)
    spo2 = models.DecimalField(max_digits=5, decimal_places=2, null=True, blank=True)  # Oxygen saturation
    
    # Medical History (captured per encounter)
    allergies = models.TextField(blank=True)
    chronic_conditions = models.TextField(blank=True)
    current_medications = models.TextField(blank=True)
    past_surgeries = models.TextField(blank=True)
    family_history = models.TextField(blank=True)
    social_history = models.TextField(blank=True)
    
    # Clinical notes
    chief_complaint = models.TextField()
    notes = models.TextField(blank=True)
    
    # Sync
    sync_status = models.CharField(max_length=20, default='synced')
    
    def has_critical_vitals(self) -> bool:
        """Check for critical vital signs (temp, pulse, RR, SpO2)."""
    
    def get_alerts(self) -> str:
        """Return alert messages for abnormal vitals."""


class ICD10Code(models.Model):
    """ICD-10 diagnosis code reference table (Phase 1: Sprint 1.1-1.2)."""
    code = models.CharField(max_length=10, unique=True, db_index=True)
    short_description = models.CharField(max_length=255)
    long_description = models.TextField(blank=True)
    chapter = models.CharField(max_length=100)
    category = models.CharField(max_length=100)
    is_billable = models.BooleanField(default=True)
    is_active = models.BooleanField(default=True)


class Diagnosis(models.Model):
    """Diagnosis entry linked to an encounter (Phase 1: Sprint 1.1-1.2)."""
    encounter = models.ForeignKey(Encounter, on_delete=models.CASCADE, related_name='diagnoses')
    icd10_code = models.ForeignKey(ICD10Code, on_delete=models.PROTECT)
    diagnosis_type = models.CharField(max_length=20)  # principal, secondary, differential
    certainty = models.CharField(max_length=20)  # confirmed, provisional, suspected
    clinical_notes = models.TextField(blank=True)
    diagnosed_by = models.ForeignKey('auth.User', on_delete=models.SET_NULL, null=True)
    diagnosed_at = models.DateTimeField(auto_now_add=True)


class TreatmentPlanTemplate(models.Model):
    """Reusable treatment plan templates (Phase 1: Sprint 1.1-1.2)."""
    name = models.CharField(max_length=200)
    diagnosis_codes = models.ManyToManyField(ICD10Code, blank=True)
    default_medications = models.JSONField(blank=True, null=True)
    default_procedures = models.JSONField(blank=True, null=True)
    default_instructions = models.TextField(blank=True)
    follow_up_days = models.PositiveIntegerField(null=True, blank=True)
    department = models.CharField(max_length=100, blank=True)
    is_active = models.BooleanField(default=True)


class TreatmentPlan(models.Model):
    """Treatment plan for an encounter (Phase 1: Sprint 1.1-1.2)."""
    encounter = models.OneToOneField(Encounter, on_delete=models.CASCADE, related_name='treatment_plan')
    template = models.ForeignKey(TreatmentPlanTemplate, on_delete=models.SET_NULL, null=True, blank=True)
    status = models.CharField(max_length=20, default='draft')  # draft, active, completed, cancelled
    medications = models.JSONField(blank=True, null=True)
    procedures = models.JSONField(blank=True, null=True)
    patient_instructions = models.TextField(blank=True)
    follow_up_date = models.DateField(null=True, blank=True)
    referral_needed = models.BooleanField(default=False)
    referral_specialty = models.CharField(max_length=100, blank=True)
```

#### 4.1.3 PharmacyStock Model (`hmis/apps/pharmacy/models.py`)
```python
class PharmacyStock(TimeStampedModel):
    """Basic pharmacy inventory management."""
    drug_name = models.CharField(max_length=200, db_index=True)
    drug_code = models.CharField(max_length=50, unique=True)
    quantity_in_stock = models.IntegerField(default=0)
    reorder_level = models.IntegerField(default=10)
    unit_price = models.DecimalField(max_digits=10, decimal_places=2)
    expiry_date = models.DateField(null=True, blank=True)
    
    @property
    def needs_reorder(self):
        return self.quantity_in_stock <= self.reorder_level
```

#### 4.1.4 Clinical Templates (`hmis/apps/clinical_templates/models.py`)
```python
class ClinicalTemplate(models.Model):
    """Master clinical template for common conditions (Phase 1: Sprint 1.1-1.2)."""
    TEMPLATE_TYPE_CHOICES = [
        ('encounter', 'Encounter Template'),
        ('note', 'Clinical Note Template'),
        ('assessment', 'Assessment Template'),
        ('procedure', 'Procedure Template'),
    ]
    
    name = models.CharField(max_length=200)
    template_type = models.CharField(max_length=20, choices=TEMPLATE_TYPE_CHOICES)
    specialty = models.CharField(max_length=100, blank=True)
    description = models.TextField(blank=True)
    content = models.JSONField()  # Template structure as JSON
    is_system = models.BooleanField(default=False)  # System vs user-created
    is_active = models.BooleanField(default=True)
    usage_count = models.PositiveIntegerField(default=0)
    created_by = models.ForeignKey('auth.User', on_delete=models.SET_NULL, null=True)


class TemplateSection(models.Model):
    """Reusable template sections."""
    template = models.ForeignKey(ClinicalTemplate, on_delete=models.CASCADE, related_name='sections')
    name = models.CharField(max_length=100)
    order = models.PositiveIntegerField(default=0)
    is_required = models.BooleanField(default=False)
    fields = models.JSONField()  # Section fields definition
```

**Pre-built Kenya-specific Templates**:
1. General OPD Visit
2. Antenatal Care (ANC)
3. Child Wellness Check
4. Chronic Disease Follow-up (Diabetes, Hypertension)
5. Emergency Triage
6. HIV/AIDS Care (sensitive access)
7. Malaria Assessment
8. Respiratory Infection
9. Diarrheal Disease
10. Trauma Assessment

### 4.2 Serializers & Validation
Located in respective app `serializers.py` files using Django REST Framework serializers with custom validation.

### 4.3 ViewSets & Permissions
RESTful API endpoints with custom permissions:
- `SensitiveAccessPermission`: Restricts access to sensitive patient records
- `RoleBasedPermission`: Enforces role-based access control

### 4.4 SQLite/PostgreSQL Switch
Settings support both databases via environment variable:
```python
if os.environ.get('DB_ENGINE') == 'sqlite':
    DATABASES = {
        'default': {
            'ENGINE': 'django.db.backends.sqlite3',
            'NAME': BASE_DIR / 'vitora.db',
        }
    }
else:
    DATABASES = {
        'default': dj_database_url.config(default=os.environ.get('DATABASE_URL'))
    }
```

### 4.5 Offline Sync Logic
Celery tasks handle background synchronization when cloud sync is enabled. Models track sync status and timestamps for conflict resolution.

## 5. Frontend (Next.js) Implementation Plan

### 5.1 Architecture
- **Framework**: Next.js 14+ with App Router
- **Styling**: TailwindCSS for responsive, mobile-first UI
- **State Management**: TanStack Query for server state, React Context for local state
- **Offline Support**: Service Workers + IndexedDB for caching

### 5.2 Key Features
- Patient registration and search
- Encounter recording with vitals entry
- Offline data caching and queue
- Real-time sync status indicators
- Role-based UI rendering

### 5.3 Offline Enhancements
Mandatory Service Worker implementation:
```javascript
// public/service-worker.js
self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request).then((response) => {
      return response || fetch(event.request);
    })
  );
});
```

IndexedDB for patient drafts and pending updates when offline.

### 5.4 API Integration
Custom API client with retry logic and offline queueing:
```typescript
// src/lib/api.ts
export const apiClient = {
  get: async (url: string) => {
    try {
      return await fetch(url);
    } catch (error) {
      // Queue for offline sync
      await queueOfflineRequest('GET', url);
    }
  }
};
```

## 6. Desktop App (Electron/PyQt) Implementation Plan

### 6.1 Tech Choices
- **Electron**: Wraps Next.js for quick cross-platform desktop (Windows/Linux/Mac). Embed local Django server or use SQLite directly.
- **PyQt**: Native GUI for performance; integrates Django models via Python.
- **Offline Strategy**: Local DB (SQLite), queue sync requests for cloud when available.

### 6.2 Electron Setup & Integration
The desktop app embeds both the backend and frontend:

#### Main Process (`desktop-app/main.js`)
```javascript
const { app, BrowserWindow } = require('electron');
const { spawn } = require('child_process');
const path = require('path');

let backendProcess = null;

function startBackend() {
  const pythonPath = path.join(__dirname, '../backend/manage.py');
  backendProcess = spawn('python', [pythonPath, 'runserver', '--noreload']);
  
  backendProcess.stdout.on('data', (data) => {
    console.log(`Backend: ${data}`);
  });
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
    }
  });

  // Load Next.js app
  win.loadURL('http://localhost:3000');
}

app.whenReady().then(() => {
  startBackend();
  // Wait for backend to start
  setTimeout(createWindow, 3000);
});

app.on('window-all-closed', () => {
  if (backendProcess) {
    backendProcess.kill();
  }
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
```

### 6.3 Features
- **System Tray**: Background sync status indicator
- **Auto-backups**: Local encrypted database backups
- **Offline Mode**: Full functionality without internet
- **Update Mechanism**: Auto-update for desktop releases

### 6.4 PyQt Alternative
For native Python GUI:
```python
# desktop-app/pyqt_main.py
import sys
from PyQt6.QtWidgets import QApplication, QMainWindow
from PyQt6.QtWebEngineWidgets import QWebEngineView
from PyQt6.QtCore import QUrl

class VitoraHMIS(QMainWindow):
    def __init__(self):
        super().__init__()
        self.browser = QWebEngineView()
        self.browser.setUrl(QUrl("http://localhost:8000"))
        self.setCentralWidget(self.browser)
        self.setWindowTitle("Vitora HMIS")
        self.setGeometry(100, 100, 1200, 800)

if __name__ == '__main__':
    app = QApplication(sys.argv)
    window = VitoraHMIS()
    window.show()
    sys.exit(app.exec())
```

### 6.5 Conflict Resolution
Last-write-wins strategy with user prompts for critical fields during sync conflicts.

## 7. Mobile App (React Native) Implementation Plan

### 7.1 Architecture
- **Framework**: React Native with Expo
- **Database**: SQLite (via expo-sqlite or WatermelonDB)
- **Offline Sync**: Background sync with queue management
- **Navigation**: React Navigation

### 7.2 Key Features
- Patient lookup and registration
- Vital signs recording during rural outreach
- Offline-first data persistence
- Background sync when connectivity available
- Biometric authentication support

### 7.3 Offline Data Management
```typescript
// mobile-app/src/services/sqlite.ts
import * as SQLite from 'expo-sqlite';

const db = SQLite.openDatabase('vitora.db');

export const initDatabase = () => {
  db.transaction(tx => {
    tx.executeSql(
      'CREATE TABLE IF NOT EXISTS patients (id INTEGER PRIMARY KEY, mrn TEXT, name TEXT, sync_status TEXT);'
    );
  });
};
```

### 7.4 Sync Strategy
- Queue all changes locally
- Sync in background when network available
- Handle conflicts with last-write-wins
- User notification for sync status

### 7.5 Use Cases
- Rural outreach clinics
- Ward rounds without WiFi
- Community health worker visits
- Emergency mobile response teams

## 8. Database Schema (Core Modules)

### 8.1 Core Tables

#### patients_patient
| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| id | UUID | PK | Primary identifier |
| mrn | VARCHAR(20) | UNIQUE, INDEX | Medical Record Number |
| national_id | VARCHAR(20) | INDEX | Kenya National ID |
| passport_number | VARCHAR(20) | - | International ID |
| phone_number | VARCHAR(15) | - | Contact number |
| first_name | VARCHAR(100) | NOT NULL | Patient first name |
| middle_name | VARCHAR(100) | - | Middle name |
| last_name | VARCHAR(100) | NOT NULL | Last name |
| date_of_birth | DATE | NOT NULL | Birth date |
| gender | VARCHAR(10) | NOT NULL | M/F/O |
| consent_given | BOOLEAN | DEFAULT FALSE | Data consent |
| consent_date | TIMESTAMP | - | When consent given |
| is_sensitive | BOOLEAN | DEFAULT FALSE | HIV/GBV/Mental Health |
| sync_status | VARCHAR(20) | DEFAULT 'synced' | Sync state |
| last_synced_at | TIMESTAMP | - | Last sync time |
| created_at | TIMESTAMP | NOT NULL | Record creation |
| updated_at | TIMESTAMP | NOT NULL | Last update |

#### encounters_encounter
| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| id | UUID | PK | Primary identifier |
| patient_id | UUID | FK → patients | Patient reference |
| encounter_type | VARCHAR(50) | NOT NULL | OPD/IPD/Emergency |
| encounter_date | TIMESTAMP | NOT NULL | Encounter time |
| temperature | DECIMAL(4,1) | - | °C |
| bp_systolic | INTEGER | - | mmHg |
| bp_diastolic | INTEGER | - | mmHg |
| pulse | INTEGER | - | bpm |
| respiratory_rate | INTEGER | - | breaths/min |
| spo2 | DECIMAL(5,2) | - | Oxygen saturation % |
| weight | DECIMAL(5,2) | - | kg |
| height | DECIMAL(5,2) | - | cm |
| chief_complaint | TEXT | NOT NULL | Main complaint |
| allergies | TEXT | - | Known allergies |
| chronic_conditions | TEXT | - | Chronic conditions |
| current_medications | TEXT | - | Current medications |
| past_surgeries | TEXT | - | Past surgeries |
| family_history | TEXT | - | Family history |
| social_history | TEXT | - | Social history |
| notes | TEXT | - | Clinical notes |
| sync_status | VARCHAR(20) | DEFAULT 'synced' | Sync state |
| created_at | TIMESTAMP | NOT NULL | Record creation |
| updated_at | TIMESTAMP | NOT NULL | Last update |

#### encounters_icd10code (Phase 1: Sprint 1.1-1.2)
| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| id | UUID | PK | Primary identifier |
| code | VARCHAR(10) | UNIQUE, INDEX | ICD-10 code (e.g., J06.9) |
| short_description | VARCHAR(255) | NOT NULL | Short description |
| long_description | TEXT | - | Full description |
| chapter | VARCHAR(100) | INDEX | ICD-10 chapter |
| category | VARCHAR(100) | - | Code category |
| is_billable | BOOLEAN | DEFAULT TRUE | Terminal billing code |
| is_active | BOOLEAN | DEFAULT TRUE | Active/deprecated |

#### encounters_diagnosis (Phase 1: Sprint 1.1-1.2)
| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| id | UUID | PK | Primary identifier |
| encounter_id | UUID | FK → encounters | Encounter reference |
| icd10_code_id | UUID | FK → icd10code | ICD-10 code reference |
| diagnosis_type | VARCHAR(20) | NOT NULL | principal/secondary/differential |
| certainty | VARCHAR(20) | DEFAULT 'confirmed' | confirmed/provisional/suspected |
| clinical_notes | TEXT | - | Additional notes |
| diagnosed_by_id | UUID | FK → users | Clinician who diagnosed |
| diagnosed_at | TIMESTAMP | NOT NULL | Diagnosis timestamp |

#### encounters_treatmentplan (Phase 1: Sprint 1.1-1.2)
| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| id | UUID | PK | Primary identifier |
| encounter_id | UUID | FK → encounters, UNIQUE | One plan per encounter |
| template_id | UUID | FK → templates | Template used (optional) |
| status | VARCHAR(20) | DEFAULT 'draft' | draft/active/completed/cancelled |
| medications | JSON | - | Prescribed medications |
| procedures | JSON | - | Planned procedures |
| patient_instructions | TEXT | - | Instructions for patient |
| follow_up_date | DATE | - | Follow-up appointment |
| referral_needed | BOOLEAN | DEFAULT FALSE | Referral flag |
| referral_specialty | VARCHAR(100) | - | Specialty if referred |
| created_at | TIMESTAMP | NOT NULL | Record creation |
| updated_at | TIMESTAMP | NOT NULL | Last update |

#### clinical_templates_clinicaltemplate (Phase 1: Sprint 1.1-1.2)
| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| id | UUID | PK | Primary identifier |
| name | VARCHAR(200) | NOT NULL | Template name |
| template_type | VARCHAR(20) | NOT NULL | encounter/note/assessment/procedure |
| specialty | VARCHAR(100) | - | Medical specialty |
| description | TEXT | - | Template description |
| content | JSON | NOT NULL | Template structure |
| is_system | BOOLEAN | DEFAULT FALSE | System vs user template |
| is_active | BOOLEAN | DEFAULT TRUE | Active/inactive |
| usage_count | INTEGER | DEFAULT 0 | Times used |
| created_by_id | UUID | FK → users | Creator |
| created_at | TIMESTAMP | NOT NULL | Record creation |
| updated_at | TIMESTAMP | NOT NULL | Last update |

#### pharmacy_stock
| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| id | UUID | PK | Primary identifier |
| drug_name | VARCHAR(200) | INDEX | Drug name |
| drug_code | VARCHAR(50) | UNIQUE | Drug code |
| quantity_in_stock | INTEGER | DEFAULT 0 | Current stock |
| reorder_level | INTEGER | DEFAULT 10 | Alert threshold |
| unit_price | DECIMAL(10,2) | NOT NULL | Price per unit |
| expiry_date | DATE | - | Expiration date |
| created_at | TIMESTAMP | NOT NULL | Record creation |
| updated_at | TIMESTAMP | NOT NULL | Last update |

### 8.2 SQLite Compatibility
All schemas work with both SQLite and PostgreSQL:
- UUID fields use TEXT in SQLite
- TIMESTAMP uses TEXT in SQLite (ISO 8601 format)
- Indexes maintained in both engines
- No PostgreSQL-specific features in Phase 1

## 9. Security & Privacy (Kenya Data Protection Act Alignment)

### 9.1 Data Protection Act (2019) Compliance
- **Consent Management**: Explicit consent tracking with timestamps
- **Data Minimization**: Collect only necessary patient information
- **Right to Access**: API endpoints for patient data export
- **Right to Erasure**: Soft delete with anonymization
- **Data Breach Protocol**: Automated alerts and logging

### 9.2 Security Measures

#### Authentication & Authorization
- JWT-based authentication with refresh tokens
- Role-Based Access Control (RBAC)
- Multi-factor authentication support
- Session timeout and management

#### Data Protection
- **In Transit**: TLS 1.3 for all network communications
- **At Rest**: 
  - SQLCipher for SQLite encryption (standalone mode)
  - PostgreSQL encryption at rest (cloud mode)
- **Sensitive Data**: Additional access controls for HIV/GBV/Mental Health records

#### Audit Logging
```python
# All models inherit audit fields
class TimeStampedModel(models.Model):
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    created_by = models.ForeignKey(User, related_name='+', null=True)
    updated_by = models.ForeignKey(User, related_name='+', null=True)
    
    class Meta:
        abstract = True
```

#### SensitiveAccessPermission
```python
# hmis/apps/patients/permissions.py
class SensitiveAccessPermission(BasePermission):
    """Restricts access to sensitive patient records."""
    def has_object_permission(self, request, view, obj):
        if obj.is_sensitive:
            return request.user.has_perm('patients.view_sensitive_records')
        return True
```

### 9.3 Data Processing Register
Maintained in `docs/data-processing-register.md`:
- Purpose of processing
- Categories of data subjects
- Legal basis for processing
- Data retention periods
- International transfers (if applicable)

### 9.4 Local Encryption (Standalone)
SQLCipher integration for encrypted local databases:
```bash
pip install pysqlcipher3
# Configure in settings for standalone mode
```

## 10. Interoperability (FHIR, KHIS/DHIS2, SHA)

### 10.1 FHIR R4 Compliance
Support for key FHIR resources:
- **Patient**: Map to internal Patient model
- **Encounter**: Clinical visit mapping
- **Observation**: Vitals and lab results
- **Medication**: Pharmacy orders

Example FHIR Patient endpoint:
```
GET /fhir/Patient/{id}
POST /fhir/Patient
```

### 10.2 KHIS/DHIS2 Integration
Automated reporting of mandatory indicators:
- OPD attendance
- IPD admissions
- Immunization coverage
- Disease surveillance

Export utility:
```python
# hmis/apps/reporting/exporters/khis.py
class KHISExporter:
    def export_monthly_report(self, month, year):
        """Generate DHIS2-compatible JSON payload."""
        pass
```

### 10.3 SHA (Social Health Authority) Claims
Claims submission support:
- Tariff code mapping
- Eligibility verification
- Claims packaging
- Attachment management

### 10.4 Data Exchange Formats
- **Import**: CSV, HL7v2, FHIR JSON
- **Export**: CSV, Excel, FHIR JSON, DHIS2 JSON
- **Interoperability Standards**: ICD-10, LOINC, SNOMED CT (planned)

## 11. Testing Strategy & Quality Gates

### 11.1 Testing Pyramid
- **Unit Tests**: 70% coverage minimum
- **Integration Tests**: API endpoints and database operations
- **E2E Tests**: Critical user workflows
- **Offline Tests**: Network disconnect scenarios

### 11.2 Backend Testing (Pytest)
```bash
cd backend
poetry run pytest
poetry run pytest --cov=hmis --cov-report=html
```

Test structure:
```python
# tests/test_patients.py
import pytest
from django.test import TestCase
from hmis.apps.patients.models import Patient

class TestPatientModel(TestCase):
    def test_mrn_generation(self):
        """Test automatic MRN generation."""
        patient = Patient.objects.create(
            first_name="John",
            last_name="Doe",
            date_of_birth="1990-01-01",
            gender="M"
        )
        assert patient.mrn.startswith("MRN")
        
    def test_sensitive_patient_access(self):
        """Test sensitive patient record permissions."""
        pass
```

### 11.3 Frontend Testing
- Jest for unit tests
- React Testing Library for components
- Playwright for E2E tests

### 11.4 Offline Testing
Dedicated tests for offline scenarios:
- Network disconnect handling
- Data queue management
- Sync conflict resolution
- SQLite operations

### 11.5 Quality Gates
Required checks before merge:
- [ ] All tests pass
- [ ] Code coverage ≥ 70%
- [ ] Ruff linting passes
- [ ] Type checking passes (mypy)
- [ ] Security scan clean (Bandit)
- [ ] No known vulnerabilities in dependencies

## 12. Deployment & Operations (Docker / Kubernetes / Monitoring)

### 12.1 Deployment Modes

#### Standalone Desktop (Offline-First)
```bash
# Package for distribution
cd desktop-app
npm run electron:build  # Creates installers for Windows/Linux/Mac
```

Distribution:
- Windows: `.exe` installer with SQLite embedded
- macOS: `.dmg` package with auto-update
- Linux: `.AppImage` or `.deb` package

#### Hybrid Mode (Docker)
```bash
docker compose -f infrastructure/docker-compose.yml up -d
```

Services:
- Backend (Django)
- Frontend (Next.js)
- PostgreSQL
- Redis (for Celery)
- Nginx (reverse proxy)

#### Cloud Mode (Kubernetes)
```bash
cd infrastructure/terraform
terraform init
terraform apply

kubectl apply -f ../k8s/
```

### 12.2 Operations

#### Backup & Restore
Standalone:
```bash
# Automated daily backups
./scripts/backup.sh  # Creates encrypted backup of vitora.db
./scripts/restore.sh <backup-file>
```

Cloud:
- Automated PostgreSQL backups (daily)
- Point-in-time recovery enabled
- S3 bucket versioning

#### Monitoring
- **Standalone**: Local logs + file-based monitoring
- **Cloud**: 
  - Prometheus metrics
  - Grafana dashboards
  - Loki for log aggregation
  - Alert manager for critical issues

#### Updates
- **Desktop**: Auto-update mechanism via Electron
- **Cloud**: Rolling updates with zero downtime
- **Database Migrations**: Automated via Django migrations

### 12.3 Scaling Strategy
1. **Single Clinic**: Standalone desktop (1 user)
2. **Small Clinic**: Standalone with local server (5-10 users)
3. **Hospital**: Hybrid mode with cloud sync (50+ users)
4. **Regional Network**: Full cloud with multiple sites (500+ users)

### 12.4 Disaster Recovery
- **Standalone**: USB backup drives + offsite copies
- **Cloud**: Multi-region replication, automated failover
- **RTO**: < 4 hours for standalone, < 15 minutes for cloud
- **RPO**: < 24 hours for standalone, < 5 minutes for cloud

## 13. Future AI/ML Integration Roadmap

### 13.1 Phase 4 AI Capabilities
Planned AI features for improved clinical outcomes:

#### Predictive Analytics
- **Sepsis Early Warning**: Real-time risk scoring based on vitals
- **No-Show Prediction**: Appointment adherence modeling
- **Resource Optimization**: Bed and staff allocation predictions

#### Clinical Decision Support
- **Drug Interaction Alerts**: Automated pharmacy safety checks
- **Diagnosis Assistance**: Symptom-based differential diagnosis suggestions
- **Treatment Recommendations**: Evidence-based protocol guidance

#### Operational Intelligence
- **Inventory Forecasting**: Stock prediction using historical patterns
- **Patient Flow Optimization**: Queue management and wait time reduction
- **Revenue Cycle Management**: Claims denial prediction

### 13.2 Implementation Strategy

#### Data Preparation
```python
# Collect structured data from encounters
class EncounterFeatureExtractor:
    def extract_features(self, encounter):
        """Extract ML-ready features from encounter data."""
        return {
            'age': calculate_age(encounter.patient.date_of_birth),
            'vitals': self.normalize_vitals(encounter),
            'history': self.encode_history(encounter.patient)
        }
```

#### Model Deployment
- **Local Models**: ONNX format for edge deployment (offline mode)
- **Cloud Models**: TensorFlow Serving or SageMaker endpoints
- **Fallback**: Always maintain rule-based alternatives

#### Privacy Considerations
- On-device processing for sensitive data
- Federated learning for multi-site model training
- Differential privacy for shared datasets

### 13.3 Technology Stack
- **Training**: Python (scikit-learn, PyTorch, TensorFlow)
- **Deployment**: ONNX Runtime (local), MLflow (tracking)
- **Monitoring**: Model drift detection, performance metrics
- **Explainability**: SHAP values for clinical interpretability

### 13.4 Ethical AI Framework
- **Bias Mitigation**: Regular fairness audits across demographics
- **Transparency**: Explainable AI for all clinical recommendations
- **Human-in-the-Loop**: Clinicians always make final decisions
- **Continuous Monitoring**: Track model performance in production

## 14. Appendix

### A. Sample .env Files

#### Standalone Mode (.env.standalone)
```bash
# Django
SECRET_KEY=your-secret-key-here
DEBUG=False
ALLOWED_HOSTS=localhost,127.0.0.1

# Database (SQLite for standalone)
DB_ENGINE=sqlite
DATABASE_URL=sqlite:///vitora.db

# Sync
CLOUD_SYNC_ENABLED=false

# Security
ENCRYPTION_KEY=your-encryption-key-for-local-db

# Logging
LOG_LEVEL=INFO
LOG_TO_FILE=true
```

#### Cloud Mode (.env.cloud)
```bash
# Django
SECRET_KEY=your-secret-key-here
DEBUG=False
ALLOWED_HOSTS=vitora.example.com

# Database (PostgreSQL for cloud)
DB_ENGINE=postgres
DATABASE_URL=postgres://user:pass@db:5432/vitora

# Redis (for Celery)
REDIS_URL=redis://redis:6379/0

# Sync
CLOUD_SYNC_ENABLED=true

# Object Storage
S3_BUCKET_NAME=vitora-attachments
AWS_ACCESS_KEY_ID=your-key
AWS_SECRET_ACCESS_KEY=your-secret

# Security
ENCRYPTION_KEY=your-encryption-key

# Monitoring
SENTRY_DSN=your-sentry-dsn
```

### B. API Endpoint Inventory (REST + FHIR)

#### REST API Endpoints
```
# Authentication
POST   /api/auth/login/
POST   /api/auth/logout/
POST   /api/auth/refresh/

# Patients
GET    /api/patients/
POST   /api/patients/
GET    /api/patients/{id}/
PUT    /api/patients/{id}/
DELETE /api/patients/{id}/
GET    /api/patients/search/?q=<query>

# Encounters
GET    /api/encounters/
POST   /api/encounters/
GET    /api/encounters/{id}/
PUT    /api/encounters/{id}/
GET    /api/patients/{id}/encounters/

# Pharmacy
GET    /api/pharmacy/stock/
POST   /api/pharmacy/stock/
GET    /api/pharmacy/stock/low/  # Items needing reorder

# Sync
GET    /api/sync/status/
POST   /api/sync/push/
GET    /api/sync/pull/
```

#### FHIR API Endpoints
```
GET    /fhir/Patient/{id}
POST   /fhir/Patient
GET    /fhir/Encounter/{id}
POST   /fhir/Encounter
GET    /fhir/Observation/{id}
POST   /fhir/Observation
```

### C. KHIS/DHIS2 Indicator Mapping (Starter)

| KHIS Indicator | Data Element | Source Model | Calculation |
|----------------|--------------|--------------|-------------|
| OPD Attendance | New OPD Cases | Encounter | Count where type=OPD |
| IPD Admissions | IPD Admissions | Encounter | Count where type=IPD |
| Immunization Coverage | BCG Given | Immunization | Count by age group |
| Malaria Cases | Confirmed Malaria | Encounter | Diagnosis contains malaria |

### D. Role Matrix (Sample)

| Role | Patients | Encounters | Pharmacy | Reports | Settings | Sensitive Data |
|------|----------|------------|----------|---------|----------|----------------|
| Administrator | Full | Full | Full | Full | Full | Yes |
| Doctor | View, Edit | Full | View | View | - | Yes (authorized) |
| Nurse | View, Edit | Create, View, Edit | View | View | - | No |
| Pharmacist | View | View | Full | View | - | No |
| Receptionist | Create, View, Edit | View | - | - | - | No |
| Lab Technician | View | View (labs only) | - | View | - | No |

### E. Definition of Done Checklist

For any feature to be considered complete:
- [ ] Code written and reviewed
- [ ] Unit tests written and passing (≥70% coverage)
- [ ] Integration tests passing
- [ ] Offline functionality verified (if applicable)
- [ ] Security review completed
- [ ] API documentation updated
- [ ] User documentation updated
- [ ] Linting passes (Ruff for Python, ESLint for JS)
- [ ] Type checking passes (mypy, TypeScript)
- [ ] Accessibility tested (WCAG 2.1 AA)
- [ ] Performance benchmarked
- [ ] Database migrations tested
- [ ] Rollback plan documented
- [ ] Monitoring/logging configured
- [ ] Deployed to staging and verified

---

## Contributing

Please read our contributing guidelines before submitting pull requests. Key points:
- Follow the code style (Black for Python, Prettier for JS/TS)
- Write tests for new features
- Update documentation
- Ensure offline functionality is maintained

## License

[Specify license here]

## Support

For support, please contact: [support email or link]

---

**Last Updated**: December 27, 2025  
**Version**: 0.1.0  
**Status**: Phase 0 - Initial Development
