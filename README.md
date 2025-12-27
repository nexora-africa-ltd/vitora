# Vitora 
>Vitora HMIS — Built for Care Without Limits

---

# Vitora HMIS (Hospital Management Information System)
_Comprehensive Technical Blueprint & Implementation Guide (Kenya-Tailored)_  
_Last Updated: December 27, 2025_

---

## Table of Contents

1. Project Overview & Vision Alignment  
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
12. Deployment & Operations (Standalone, Cloud, Hybrid)  
13. Future AI/ML Integration Roadmap  
14. Appendix  
   - A. Sample .env Files  
   - B. API Endpoint Inventory (REST + FHIR)  
   - C. KHIS/DHIS2 Indicator Mapping (Starter)  
   - D. Role Matrix (Sample)  
   - E. Definition of Done Checklist  

---

## 1. Project Overview & Vision Alignment

### 1.1 Context & Goals
Vitora HMIS is a modular, hybrid Hospital Management Information System tailored for Kenya, combining the best of standalone offline operations and optional cloud connectivity. It transforms healthcare delivery by streamlining patient care, administrative tasks, and compliance, even in low-connectivity rural areas.

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
| Web Frontend | Next.js (React 18), TypeScript, TailwindCSS, TanStack Query (for optional browser access). |
| Mobile | React Native (Android focus), SQLite (WatermelonDB / Expo SQLite), Offline sync. |
| Backend | Python 3.12, Django 5.x, Django REST Framework, Celery; optional C# .NET Core for cloud. |
| Auth | Django + Simple JWT (or Keycloak/OAuth2 provider). |
| DB | SQLite (standalone/offline) or PostgreSQL 16 (Row Level Security); optional TimescaleDB for vitals. |
| Object Storage | Local file system (standalone) or S3-compatible (MinIO in dev, AWS S3 in cloud). |
| Messaging | Postgres LISTEN/NOTIFY → Kafka (scale). |
| Observability | OpenTelemetry, Prometheus, Grafana, Loki, Tempo/OTel collector. |
| CI/CD | GitHub Actions. |
| IaC | Terraform + optional Helm for K8s (cloud only). |
| Container | Docker / Kubernetes (cloud/hybrid). |

### 1.3 Kenya-Specific Considerations
- Identifiers: National ID / Passport / Phone; multiple support.
- Compliance: DPIA, Data Processing Register, breach response.
- SHA: Claims packaging (tariffs, eligibility, attachments).
- KHIS: Mandatory indicators mapping.
- Sensitive Access: Restrictions for HIV, GBV, Mental Health.
- Affordability: Standalone mode requires minimal hardware (e.g., Raspberry Pi-compatible for rural clinics); cloud optional with low-cost providers like AWS Africa.

### 1.4 Phased Delivery (High Level)
1. Phase 0 – Inception & Readiness (Infrastructure, Security, Standalone Desktop Prototype).  
2. Phase 1 – Clinical Core (PAS, Encounters, Orders, Pharmacy, Basic Billing; Offline Desktop/Mobile).  
3. Phase 2 – Claims, Theatre, Inventory, Reporting v1; Cloud Sync Introduction.  
4. Phase 3 – MCH/Immunization, Imaging, BI Mart; Multi-Site Hybrid.  
5. Phase 4 – AI/Advanced Analytics; Global Scaling.

---

## 2. Folder & File Structure

```
nex-hmis/
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
      # ... (unchanged from original)
  frontend-web/  # For web/browser access; wrapped in desktop
    # ... (unchanged)
  desktop-app/  # New: Standalone desktop wrapper
    package.json  # For Electron
    main.js       # Electron entry
    or pyqt_main.py  # PyQt alternative
    src/
      # Integrates frontend-web
    scripts/
      build-desktop.sh  # Packaging for Windows/Linux/Mac
  mobile-app/
    # ... (unchanged)
  infrastructure/
    docker-compose.yml  # For local/cloud dev
    standalone-compose.yml  # New: Offline-only setup with SQLite
    k8s/  # Cloud only
      # ... (unchanged)
    terraform/
      # ... (unchanged)
  scripts/
    init_db.sql
    load_demo_data.py
    backup.sh
    restore.sh
    sync-cloud.py  # New: Manual/offline sync script
  docs/
    architecture.md
    api-reference.md
    dpia.md
    data-processing-register.md
    standalone-guide.md  # New: Offline deployment instructions
  .github/
    workflows/
      ci.yml
      security.yml
      release.yml  # Add desktop build/release
  .env.example
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
git clone https://github.com/your-org/nex-hmis.git
cd nex-hmis
cp .env.example .env
# For standalone: Use SQLite
sed -i 's/DATABASE_URL=postgres:/DATABASE_URL=sqlite:///' .env
docker compose -f infrastructure/standalone-compose.yml up -d --build  # Runs local backend + desktop
# Or without Docker: poetry run python manage.py runserver (backend) + electron . (desktop)
```

### 3.3 Quick Start (Hybrid/Cloud Dev)
Similar to original, using docker-compose.yml for full stack.

### 3.4 Desktop Setup (New)
```bash
cd desktop-app
pnpm install
pnpm electron:serve  # Dev mode
pnpm electron:build  # Package for distribution
```
For PyQt alternative:
```bash
pip install pyqt6
python pyqt_main.py
```

### 3.5 Other Setups
- Backend/Python: Unchanged.
- Frontend: Unchanged.
- Mobile: Unchanged.
- Environment Variables: Add `DB_ENGINE=sqlite` for standalone; `CLOUD_SYNC_ENABLED=false` default.

### 3.6 Verification Checklist
- [ ] Standalone mode: App runs offline, logs vitals, syncs on connect.
- [ ] Desktop: Local DB access, no browser needed.
- [ ] Cloud: Sync test between desktop/mobile.

---

## 4. Backend (Django + DRF) Implementation Plan
Unchanged from original, but add SQLite support in settings (e.g., `if os.environ.get('DB_ENGINE') == 'sqlite': ...`). Enhance sync logic for optional cloud (e.g., Celery tasks for background uploads).

## 5. Frontend (Next.js) Implementation Plan
Unchanged, but add offline enhancements: Mandatory Service Worker + IndexedDB for caching (e.g., patient drafts). This frontend is wrapped in desktop for standalone use.

## 6. Desktop App (Electron/PyQt) Implementation Plan (New)
### 6.1 Tech Choices
- Electron: Wraps Next.js for quick cross-platform desktop (Windows/Linux/Mac). Embed local Django server or use SQLite directly.
- PyQt: Native GUI for performance; integrates Django models via Python.
- Offline Strategy: Local DB (SQLite), queue sync requests for cloud.

### 6.2 Setup & Integration
- Embed backend: Run Django as subprocess or use Django's ASGI for local server.
- Features: Same as web, plus system tray for background sync, auto-backups to local encrypted files.
- Example Main (Electron):
```javascript
const { app, BrowserWindow } = require('electron');
app.whenReady().then(() => {
  const win = new BrowserWindow({ width: 800, height: 600 });
  win.loadURL('http://localhost:3000');  // Next.js dev server
  // Or load built Next.js for production
});
```

### 6.3 Conflict Resolution
Same as mobile: Last-write-wins with prompts for critical fields.

## 7. Mobile App (React Native) Implementation Plan
Unchanged; emphasizes optional use for outreach, integrating with desktop/cloud sync.

## 8. Database Schema (Core Modules)
Add SQLite compatibility notes; no schema changes needed.

## 9. Security & Privacy (Kenya DPA)
Unchanged; add local encryption for standalone (e.g., SQLCipher for SQLite).

## 10. Interoperability
Unchanged.

## 11. Testing Strategy & Quality Gates
Add tests for standalone/offline scenarios (e.g., no-network integration tests).

## 12. Deployment & Operations (Standalone, Cloud, Hybrid)
- **Standalone**: Package as executable (Electron/PyQt installer); local backups via scripts.
- **Hybrid**: Docker for local server + cloud sync; Kubernetes for full cloud.
- **Operations**: Add offline monitoring (local logs), cloud autoscaling.

## 13. Future AI/ML Integration Roadmap
Unchanged; ensure AI models run locally (e.g., ONNX for edge) or cloud-optional.

## 14. Appendix
Unchanged, with added standalone env vars.

---
