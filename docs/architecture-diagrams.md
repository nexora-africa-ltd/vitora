# Vitora HMIS — Architecture Diagrams

> **Last Updated**: July 2026
> **Purpose**: Visual reference for the full system architecture

---

## 1. High-Level System Architecture

```mermaid
graph TB
    subgraph Clients["Client Applications"]
        WEB["Web App<br/>(Next.js 16 / React 19)"]
        DESK["Desktop App<br/>(Tauri + Next.js Sidecar)"]
        MOB["Mobile App<br/>(React Native / Expo 54)"]
    end

    subgraph Cloud["Cloud Tier"]
        API["Django REST API<br/>(Python 3.12 / DRF)"]
        PG["PostgreSQL 16<br/>(Neon - Cloud DB)"]
        REDIS["Redis<br/>(Celery Broker)"]
        CELERY["Celery Workers<br/>(Background Tasks)"]
        PS["PowerSync Cloud<br/>(Logical Replication)"]
        WS["WebSocket Server<br/>(Django Channels)"]
    end

    subgraph Facility["Facility Tier (LAN)"]
        HUB["Facility Hub<br/>(Django + SQLite/PostgreSQL)"]
        PC1["Workstation 1<br/>(Tauri + SQLite)"]
        PC2["Workstation 2<br/>(Tauri + SQLite)"]
        PC3["Workstation 3<br/>(Tauri + SQLite)"]
    end

    subgraph External["External Integrations"]
        SHA["SHA / DHA HIE<br/>(Claims, Preauths)"]
        KHIS["KHIS / DHIS2<br/>(Health Reporting)"]
        MPESA["M-Pesa<br/>(Payments)"]
        FHIR["FHIR R4<br/>(Interoperability)"]
    end

    WEB -->|"REST + PowerSync"| API
    WEB <-->|"Sync Stream"| PS
    MOB -->|"REST API"| API
    DESK -->|"REST (when online)"| API

    API --> PG
    API --> REDIS
    REDIS --> CELERY
    PG -->|"Logical Replication"| PS
    API --> WS

    HUB -->|"Batch Sync (when online)"| API
    PC1 <-->|"LAN HTTP + WS"| HUB
    PC2 <-->|"LAN HTTP + WS"| HUB
    PC3 <-->|"LAN HTTP + WS"| HUB

    API --> SHA
    API --> KHIS
    API --> MPESA
    API --> FHIR
```

---

## 2. Deployment Modes

```mermaid
graph LR
    subgraph Mode1["Standalone Mode"]
        S1["Single PC<br/>(Tauri + SQLite)"]
        S1 -->|"Sync when online"| CLOUD1["Cloud API"]
    end

    subgraph Mode2["LAN Hub Mode"]
        H["Hub Server<br/>(Django + DB)"]
        C1["Client PC 1"]
        C2["Client PC 2"]
        C1 -->|LAN| H
        C2 -->|LAN| H
        H -->|"Sync when online"| CLOUD2["Cloud API"]
    end

    subgraph Mode3["Web-Only Mode"]
        B["Browser<br/>(Next.js PWA)"]
        B -->|"PowerSync + REST"| CLOUD3["Cloud API +<br/>PowerSync"]
    end
```

---

## 3. Backend Application Structure (38 Django Apps)

```mermaid
graph TB
    subgraph Core["Core Platform"]
        CORE["core<br/>(Auth, RBAC, Audit,<br/>Locations, Sync, Events)"]
        SCHED["scheduling<br/>(Shifts, Roster,<br/>Appointments)"]
        CHECKIN["checkin<br/>(Patient Check-in)"]
    end

    subgraph Clinical["Clinical Modules"]
        PAT["patients<br/>(Registration, MRN)"]
        ENC["encounters<br/>(Visits, Diagnosis,<br/>Treatment Plans)"]
        TRIAGE["triage<br/>(KETA Scale,<br/>Priority Queue)"]
        CLINIC["clinics<br/>(8 Clinic Types,<br/>Sessions, Visits)"]
        CDS_APP["cds<br/>(Decision Support)"]
        TEMPLATES["clinical_templates"]
    end

    subgraph Pharmacy_Lab["Pharmacy & Lab"]
        PHARM["pharmacy<br/>(Drugs, Dispensing,<br/>Inventory, FEFO)"]
        LAB["laboratory<br/>(Orders, Results,<br/>Queue, PDF Reqs)"]
    end

    subgraph Inpatient_Module["Inpatient & Procedures"]
        INP["inpatient<br/>(Wards, Beds,<br/>Admissions, Kardex)"]
        THEATRE_APP["theatre<br/>(Surgery Cases,<br/>Checklists)"]
        PROC["procedures<br/>(Clinical Procedures)"]
    end

    subgraph Finance["Finance & Insurance"]
        BILL["billing<br/>(Invoices, Payments,<br/>M-Pesa, Receipts)"]
        INS["insurance<br/>(SHA Claims,<br/>Preauths)"]
    end

    subgraph Diagnostics["Diagnostics & Imaging"]
        IMG["imaging<br/>(DICOM, PACS,<br/>Radiology Orders)"]
        DIALYSIS["dialysis"]
        BLOOD["blood_bank"]
    end

    subgraph PublicHealth["Public Health"]
        SURV["surveillance<br/>(IDSR, IHR,<br/>Outbreak Alerts)"]
        MCH["mch<br/>(ANC, Delivery,<br/>PNC, Growth, KEPI)"]
        IMMUN["immunizations<br/>(Vaccine Registry)"]
        INV["inventory<br/>(Medical Supplies)"]
    end

    subgraph Allied["Allied Health"]
        AH["allied_health<br/>(Umbrella)"]
        PHYSIO["physiotherapy"]
        OT["occupational_therapy"]
        NUTR["nutrition"]
        SW["social_work"]
        COUNS["counselling"]
    end

    subgraph Support["Support & Quality"]
        REF["referrals<br/>(Inter-facility)"]
        QUAL["quality<br/>(Improvement)"]
        AI_APP["ai<br/>(TibaBot, Care Plans,<br/>CDS, Lab Interpret)"]
        COMMENTS["comments"]
        SICK["sick_notes"]
    end

    subgraph Interop["Interoperability"]
        HL7["hl7<br/>(HL7v2 ADT)"]
        KENHDD["kenhdd<br/>(Kenya HDD)"]
        MOH["moh_reporting<br/>(MOH Returns)"]
        LIC["licensing<br/>(Facility Licensing)"]
        ANALYTICS["analytics"]
    end

    CORE --> PAT
    CORE --> ENC
    PAT --> ENC
    ENC --> TRIAGE
    ENC --> CLINIC
    ENC --> LAB
    ENC --> PHARM
    ENC --> BILL
    ENC --> IMG
    INP --> ENC
```

---

## 4. Data Flow — Patient Journey

```mermaid
sequenceDiagram
    participant P as Patient
    participant R as Reception
    participant T as Triage
    participant D as Doctor
    participant L as Lab
    participant PH as Pharmacy
    participant B as Billing

    P->>R: Arrives at Facility
    R->>R: Check-in / Registration
    R-->>P: MRN Assigned (MRN-YYYYMMDD-XXXX)

    R->>T: Send to Triage Queue
    T->>T: KETA Assessment<br/>(RED/ORANGE/YELLOW/GREEN/BLUE)
    T->>D: Priority-sorted Queue

    D->>D: Create Encounter<br/>(Vitals, Chief Complaint)
    D->>D: Diagnosis (ICD-10/ICD-11)
    D->>D: Treatment Plan

    alt Lab Required
        D->>L: Lab Order
        L->>L: Sample Collection
        L->>L: Results Entry
        L-->>D: Results Available
    end

    alt Medication Prescribed
        D->>PH: Prescription
        PH->>PH: Dispense (FEFO)
        PH-->>P: Medication Issued
    end

    D->>B: Invoice Generated
    B-->>P: Payment (Cash / M-Pesa / SHA)
```

---

## 5. Multi-Tenancy Architecture

```mermaid
graph TB
    subgraph Org["Organization (Tenant)"]
        direction TB
        ORG["Organization<br/>e.g., 'Nairobi Hospital Group'"]

        subgraph Shared["Organization-Scoped (Shared)"]
            PATIENTS["Patients"]
            ALLERGIES["Allergies"]
            ROLES["Custom Roles"]
        end

        subgraph FacA["Facility A"]
            ENC_A["Encounters"]
            TRIAGE_A["Triage"]
            INV_A["Invoices"]
            LAB_A["Lab Orders"]
            WARD_A["Wards / Beds"]
        end

        subgraph FacB["Facility B"]
            ENC_B["Encounters"]
            TRIAGE_B["Triage"]
            INV_B["Invoices"]
            LAB_B["Lab Orders"]
            WARD_B["Wards / Beds"]
        end
    end

    subgraph Isolation["Isolation Mechanism"]
        MW["Middleware<br/>(X-Facility-Id Header)"]
        VM["TenantScopedViewMixin<br/>(Auto-filter QuerySet)"]
        FM["FacilityScopedModel<br/>(FK to Facility)"]
    end

    ORG --> Shared
    ORG --> FacA
    ORG --> FacB
    MW --> VM
    VM --> FM
```

---

## 6. Authentication & Security

```mermaid
graph TB
    subgraph Auth["Authentication Flow"]
        LOGIN["POST /api/auth/login/"]
        LOGIN -->|"Credentials"| BACKEND["Django Backend"]
        BACKEND -->|"Validate"| DB["User DB"]
        BACKEND -->|"Set httpOnly Cookies"| COOKIES["Access + Refresh<br/>JWT Cookies"]
    end

    subgraph MFA["MFA Enforcement"]
        MFA_CHECK{"MFA Required?<br/>(ADMIN, CLINICAL_SENIOR,<br/>MANAGEMENT)"}
        MFA_CHECK -->|"Yes + Grace Period Active"| GRACE["72h Grace Period<br/>(Full Access + Banner)"]
        MFA_CHECK -->|"Yes + Grace Expired"| BLOCK["403: mfa_setup_required<br/>(Only auth/MFA endpoints)"]
        MFA_CHECK -->|"No"| PASS["Full Access"]
        GRACE --> TOTP["TOTP Setup<br/>(Authenticator App)"]
        TOTP --> PASS
    end

    subgraph Security["Security Layers"]
        FERNET["Fernet Encryption<br/>(PII: national_id, phone, email)"]
        AUDIT["Audit Log<br/>(7yr retention, DPA 2019)"]
        RBAC["RBAC<br/>(Roles → Permissions Matrix)"]
        SENSITIVE["Sensitive Patient Filter<br/>(HIV, GBV, Mental Health)"]
        PKI["PKI / Digital Signatures<br/>(RSA-2048)"]
        HASHCHAIN["Tamper-Resistant Audit<br/>(SHA-256 Hash Chain)"]
    end

    COOKIES --> MFA_CHECK
```

---

## 7. Offline-First Data Sync

```mermaid
graph LR
    subgraph Browser["Web Client (Browser)"]
        WASM["SQLite WASM<br/>(Local Reads)"]
        SDK["@powersync/web SDK"]
        RQ["React Query<br/>(API Fallback)"]
    end

    subgraph PowerSync["PowerSync Cloud"]
        STREAM["Sync Streams<br/>(18 tables, 3 scopes)"]
    end

    subgraph Backend["Cloud Backend"]
        DJANGO["Django REST API"]
        NEON["Neon PostgreSQL"]
    end

    subgraph Desktop["Desktop Client (Tauri)"]
        LOCAL_DB["Local SQLite<br/>(better-sqlite3)"]
        SIDECAR["Node.js Sidecar<br/>(Next.js Standalone)"]
    end

    WASM <-->|"Read (instant)"| SDK
    SDK <-->|"Bidirectional Sync"| STREAM
    STREAM <-->|"Logical Replication"| NEON
    SDK -->|"uploadData()"| DJANGO
    RQ -->|"REST (fallback)"| DJANGO
    DJANGO --> NEON

    LOCAL_DB <-->|"Read/Write"| SIDECAR
    SIDECAR -->|"REST Batch Sync<br/>(when online)"| DJANGO
```

---

## 8. Domain Events & Real-Time Architecture

```mermaid
graph TB
    subgraph Trigger["Event Sources"]
        SIGNAL["Django Signals<br/>(post_save, etc.)"]
        VIEW["ViewSet Actions<br/>(status transitions)"]
    end

    subgraph EventBus["Event Infrastructure"]
        PUB["publish_event()"]
        BUS["EventBus<br/>(Singleton, Thread-safe)"]
        STORE["EventStore<br/>(Immutable DB Log)"]
    end

    subgraph Consumers["Event Consumers"]
        PROJ["Read-Model<br/>Projections"]
        WSOCK["WebSocket<br/>Consumers (6)"]
        TASK["Celery Tasks<br/>(9 modules)"]
    end

    subgraph WSChannels["WebSocket Channels"]
        QUEUE["Queue Updates"]
        ALERTS["Critical Alerts"]
        LAB_WS["Lab Results"]
        TRIAGE_WS["Triage Priority"]
        BILLING_WS["Payment Notifications"]
        SYNC_WS["Sync Status"]
    end

    SIGNAL --> PUB
    VIEW --> PUB
    PUB --> BUS
    BUS --> STORE
    BUS --> PROJ
    BUS --> WSOCK
    BUS --> TASK
    WSOCK --> QUEUE
    WSOCK --> ALERTS
    WSOCK --> LAB_WS
    WSOCK --> TRIAGE_WS
    WSOCK --> BILLING_WS
    WSOCK --> SYNC_WS
```

---

## 9. SHA / DHA HIE Integration

```mermaid
sequenceDiagram
    participant V as Vitora HMIS
    participant DHA as DHA HIE Gateway
    participant SHA_SYS as SHA Systems

    Note over V,SHA_SYS: Authentication
    V->>DHA: POST /auth/token (JWT)
    DHA-->>V: Access Token (5-min expiry)

    Note over V,SHA_SYS: Patient Eligibility
    V->>DHA: POST /eligibility/check
    DHA-->>V: Coverage Status + PFMS Flags

    Note over V,SHA_SYS: Consent & Visit
    V->>DHA: POST /consent/send-otp
    DHA-->>V: OTP Sent to Patient
    V->>DHA: POST /consent/validate-otp
    DHA-->>V: Consent Token
    V->>DHA: POST /consent/start-visit
    DHA-->>V: Visit Started

    Note over V,SHA_SYS: Claims Submission
    V->>V: Generate FHIR R4 Bundle
    V->>DHA: POST /claims/submit
    DHA->>SHA_SYS: Route to SHA
    SHA_SYS-->>DHA: Adjudication Result
    DHA-->>V: Claim Status

    Note over V,SHA_SYS: Remittance
    V->>DHA: GET /remittances/fetch
    DHA-->>V: Payment Details
    V->>V: Auto-reconcile to Local Claims
```

---

## 10. CI/CD Pipeline

```mermaid
graph LR
    subgraph Trigger["Triggers"]
        PUSH["Push / PR"]
        SCHED["Schedule<br/>(Nightly)"]
        MANUAL["Manual<br/>Dispatch"]
    end

    subgraph Parallel["Parallel Jobs"]
        BE["Backend<br/>• Ruff Lint<br/>• Black Format<br/>• Pytest (80%+)<br/>• mypy Types"]
        FE["Frontend<br/>• ESLint<br/>• Jest Tests<br/>• Build Check<br/>• tsc --noEmit"]
        SEC["Security<br/>• Bandit<br/>• Trivy<br/>• CodeQL<br/>• Secret Scan"]
        FHIR_CI["FHIR<br/>• Inferno IPS<br/>• Profile Validation"]
    end

    subgraph Gate["Quality Gate"]
        QG{"All Pass?<br/>Coverage ≥80%<br/>No Critical Vulns"}
    end

    subgraph Deploy["Deployment"]
        STG["Staging<br/>(Azure Container App)"]
        PROD["Production<br/>(Azure + Neon)"]
    end

    PUSH --> Parallel
    SCHED --> SEC
    MANUAL --> Parallel

    BE --> QG
    FE --> QG
    SEC --> QG
    FHIR_CI --> QG

    QG -->|"Pass"| STG
    STG -->|"Manual Approve"| PROD
```

---

## 11. Frontend Architecture (Web App)

```mermaid
graph TB
    subgraph NextJS["Next.js 16 App Router"]
        LAYOUT["Root Layout<br/>(Providers, Auth Guard)"]
        DASH["(dashboard) Group<br/>(38 Route Groups)"]
        LOGIN_PAGE["Login Page"]
        ONBOARD["Onboarding Flow"]
    end

    subgraph Providers["Context Providers"]
        AUTH_CTX["AuthProvider<br/>(User, Permissions)"]
        FAC_CTX["FacilityProvider<br/>(Active Facility)"]
        SYNC_CTX["SyncProvider<br/>(PowerSync / API Mode)"]
        THEME["ThemeProvider<br/>(Dark/Light)"]
        QUERY["QueryClientProvider<br/>(React Query)"]
    end

    subgraph DataLayer["Data Layer"]
        API_CLIENT["API Client<br/>(Axios + Interceptors)"]
        ZOD["Zod Schemas<br/>(62 files, runtime validation)"]
        HOOKS["Custom Hooks<br/>(usePowerSyncQuery,<br/>usePermissions, etc.)"]
        POWERSYNC_SDK["PowerSync SDK<br/>(Offline reads)"]
    end

    subgraph UI["UI Components"]
        SHADCN["shadcn/ui<br/>(Base Components)"]
        SHARED["Shared Components<br/>(PageHeader, ResponsiveTable,<br/>PullToRefresh, StatusBadge)"]
        FORMS["Form Components<br/>(Zod + React Hook Form)"]
    end

    LAYOUT --> Providers
    Providers --> DASH
    DASH --> DataLayer
    DataLayer --> UI
    API_CLIENT --> ZOD
```

---

## 12. Database Schema — Core Relationships

```mermaid
erDiagram
    Organization ||--o{ Facility : has
    Organization ||--o{ Patient : owns
    Facility ||--o{ Encounter : hosts
    Facility ||--o{ StaffProfile : employs
    Facility ||--o{ Ward : contains
    Facility ||--o{ Clinic : runs

    Patient ||--o{ Encounter : has
    Patient ||--o{ EmergencyContact : has
    Patient ||--o{ Allergy : has

    Encounter ||--o{ Diagnosis : contains
    Encounter ||--o{ TreatmentPlan : has
    Encounter ||--o{ LabOrder : generates
    Encounter ||--o{ Prescription : generates
    Encounter ||--o{ Invoice : billed_via

    Ward ||--o{ Bed : contains
    Ward ||--o{ Admission : hosts
    Admission }o--|| Patient : for
    Admission }o--|| Encounter : linked_to

    LabOrder ||--o{ LabOrderItem : has
    LabOrderItem ||--o{ LabResult : produces

    Prescription ||--o{ PrescriptionItem : contains
    PrescriptionItem ||--o{ Dispensing : fulfilled_by

    Invoice ||--o{ InvoiceItem : contains
    Invoice ||--o{ Payment : receives

    StaffProfile }o--|| User : extends
    StaffProfile }o--|| Role : has
    StaffProfile }o--|| Department : belongs_to

    Clinic ||--o{ ClinicSession : schedules
    ClinicSession ||--o{ ClinicVisit : contains
```

---

## 13. Technology Stack Summary

```mermaid
mindmap
  root((Vitora HMIS))
    Backend
      Python 3.12
      Django 5.x
      Django REST Framework
      Celery + Redis
      Django Channels (WebSocket)
      PostgreSQL 16 / SQLite
    Frontend
      Next.js 16
      React 19
      TypeScript
      TailwindCSS
      shadcn/ui
      PowerSync SDK
      React Query
      Zod Validation
    Mobile
      React Native 0.81
      Expo 54
      WatermelonDB
      Offline Sync
    Desktop
      Tauri v2
      Next.js Standalone Sidecar
      better-sqlite3
      Local SQLite
    Integrations
      SHA / DHA HIE (15 APIs)
      FHIR R4
      HL7v2
      KHIS / DHIS2
      M-Pesa
      SNOMED CT
      ICD-10 / ICD-11
    Infrastructure
      Azure Container Apps
      Neon PostgreSQL
      PowerSync Cloud
      GitHub Actions (4 workflows)
      Docker
    Security
      Fernet Encryption (PII)
      JWT + httpOnly Cookies
      MFA (TOTP)
      RBAC (Role Matrix)
      PKI (RSA-2048)
      Audit Hash Chain (SHA-256)
      Kenya DPA 2019 Compliant
```

---

## 14. Network Topology — Production

```mermaid
graph TB
    subgraph Users["End Users"]
        BROWSER["Web Browser"]
        TAURI["Desktop (Tauri)"]
        MOBILE_APP["Mobile (React Native)"]
    end

    subgraph Azure["Azure Cloud"]
        ACA["Azure Container App<br/>(Django API + Daphne)"]
        STORAGE["Azure Blob Storage<br/>(Media / Documents)"]
    end

    subgraph Neon["Neon (Database)"]
        NEON_PG["PostgreSQL 16<br/>(eu-central-1)"]
    end

    subgraph PowerSyncCloud["PowerSync Cloud"]
        PS_INSTANCE["PowerSync Instance<br/>(EU Central)"]
    end

    subgraph Redis_Cloud["Redis Cloud"]
        REDIS_INST["Redis<br/>(Celery Broker + Cache)"]
    end

    subgraph CDN["Vercel"]
        VERCEL["Next.js Frontend<br/>(Static + SSR)"]
    end

    BROWSER --> VERCEL
    VERCEL --> ACA
    BROWSER <--> PS_INSTANCE
    TAURI --> ACA
    MOBILE_APP --> ACA

    ACA --> NEON_PG
    ACA --> REDIS_INST
    ACA --> STORAGE
    NEON_PG -->|"Logical Replication"| PS_INSTANCE
```

---

## Notes

- All diagrams use Mermaid syntax and render on GitHub and in VS Code (with bierner.markdown-mermaid extension).
- For the module list and descriptions, see `docs/modules-reference.md`.
- For API endpoint details, see `docs/api-reference.md`.
- For domain event catalog, see `docs/domain-events.md`.
- For multi-tenancy details, see `docs/multitenancy.md`.
