# Procedures Module — Comprehensive Documentation

> **Module**: `backend/hmis/apps/procedures/` + `web-app/app/(dashboard)/procedures/`
> **Status**: ✅ Implemented (Sprint 1.7, Q1 2026)
> **Tests**: 85 passing | **Coverage**: Module-scoped
> **Last Updated**: March 30, 2026

---

## Table of Contents

1. [Overview](#1-overview)
2. [Architecture](#2-architecture)
3. [Data Models](#3-data-models)
4. [API Reference](#4-api-reference)
5. [Workflows](#5-workflows)
6. [Billing Integration](#6-billing-integration)
7. [Seed Data & Management Commands](#7-seed-data--management-commands)
8. [Frontend (Web App)](#8-frontend-web-app)
9. [Admin Interface](#9-admin-interface)
10. [Testing](#10-testing)
11. [Troubleshooting](#11-troubleshooting)

---

## 1. Overview

The Procedures module manages the full lifecycle of outpatient and minor clinical procedures — from catalog definition and ordering through informed consent, real-time performance tracking, consumable usage, auto-billing, and follow-up outcome assessment.

> **Scope**: Minor/outpatient procedures only. Major surgical procedures requiring a theatre are handled by the future Theatre module. The `SURGICAL` category is reserved for that purpose.

### Key Capabilities

| Capability | Description |
|------------|-------------|
| **Procedure Catalog** | 46 pre-seeded procedures across 11 categories with standard coding (ICHI, CPT, ICD-10-PCS) |
| **Order Workflow** | 7-state lifecycle: Ordered → Consent Pending → Scheduled → Ready → In Progress → Completed / Cancelled |
| **Informed Consent** | 4-checkbox checklist, patient/guardian signatures, witness support, verbal/emergency consent types |
| **Performance Log** | Real-time procedure recording with anesthesia, technique, specimens, and duration auto-calculation |
| **Consumable Tracking** | Pharmacy stock deduction with FEFO batch tracking and cost capture |
| **Auto-Billing** | Automatic invoice item creation on completion via `BillingAgentService` |
| **Outcome Assessment** | Multiple follow-up recordings per procedure for healing progress tracking |
| **Procedure Kits** | Pre-defined consumable kits for quick addition during procedures |

### Key Numbers

| Metric | Value |
|--------|-------|
| Models | 8 |
| ViewSets / API Views | 3 |
| Custom @actions | 12 |
| Seeded Procedures | 46 |
| Backend Tests | 85 |
| Frontend Pages | 8 |

---

## 2. Architecture

### Backend Structure

```
backend/hmis/apps/procedures/
├── models.py              # 8 models (see §3)
├── serializers.py         # 14 serializers (list, detail, create, action)
├── views.py               # 2 ViewSets + 1 APIView, 12 custom @actions
├── urls.py                # Router registration + dashboard endpoint
├── filters.py             # DjangoFilterBackend filter classes
├── admin.py               # Django admin with colored badges
├── apps.py                # AppConfig
└── management/
    └── commands/
        └── seed_procedure_catalog.py  # 46 procedures + billing linkage
```

### Frontend Structure

```
web-app/
├── app/(dashboard)/procedures/
│   ├── page.tsx                          # Dashboard (stats + quick links)
│   ├── catalog/
│   │   ├── page.tsx                      # Catalog list (paginated, filterable)
│   │   ├── new/page.tsx                  # Create new catalog entry
│   │   └── [id]/
│   │       ├── page.tsx                  # Catalog entry detail
│   │       └── edit/page.tsx             # Edit catalog entry
│   └── orders/
│       ├── page.tsx                      # Orders list (paginated, filterable)
│       ├── new/page.tsx                  # Create new order (patient + procedure picker)
│       └── [orderId]/page.tsx            # Order detail (4 tabs: Overview, Consent, Perform, Outcomes)
├── components/procedures/
│   └── procedure-form.tsx                # Shared form for create/edit catalog entries
└── lib/
    ├── api/procedures.ts                 # API client with Zod validation
    └── types/procedure.ts                # TypeScript interfaces + status color maps
```

### Module Dependencies

```
procedures ──→ patients      (ProcedureOrder.patient FK)
           ──→ encounters    (ProcedureOrder.encounter FK)
           ──→ clinics       (ProcedureOrder.clinic_visit FK, ProcedureCatalog.follow_up_clinic FK)
           ──→ inpatient     (ProcedureOrder.admission FK)
           ──→ pharmacy      (ProcedureConsumable.drug FK, ProcedureKitItem.drug FK)
           ──→ billing       (ProcedureCatalog.billing_service FK, auto-billing on complete)
           ──→ scheduling    (ProcedureOrder.appointment FK)
           ──→ core          (TimeStampedModel, Organization, Facility, TenantScopedViewMixin)
```

---

## 3. Data Models

### 3.1 ProcedureCatalog

Master catalog of procedure definitions. Shared across all facilities in an organization (`tenant_scope = "organization"`).

| Field | Type | Notes |
|-------|------|-------|
| `code` | CharField(20), unique | Internal code, e.g. `PROC-WC-003` |
| `name` | CharField(200) | Procedure name |
| `description` | TextField | Detailed description |
| `category` | CharField (TextChoices) | See categories below |
| `body_system` | CharField (TextChoices) | See body systems below |
| `risk_level` | CharField (TextChoices) | LOW, MEDIUM, HIGH |
| `ichi_code` | CharField(20) | WHO ICHI procedure code |
| `cpt_code` | CharField(10) | CPT code (if applicable) |
| `icd10_pcs_code` | CharField(10) | ICD-10-PCS code |
| `consent_required` | BooleanField | Default: True |
| `consent_template` | TextField | Default consent form text |
| `guardian_consent_required` | BooleanField | For minors |
| `witness_required` | BooleanField | Witness signature needed |
| `requires_anesthesia` | BooleanField | |
| `anesthesia_type` | CharField(50) | local, general, sedation |
| `typical_duration_minutes` | PositiveIntegerField | Default: 30 |
| `requires_fasting` | BooleanField | |
| `pre_procedure_instructions` | TextField | Instructions for patient |
| `post_procedure_instructions` | TextField | Post-procedure care |
| `required_qualifications` | TextField | e.g., "Surgeon, Nurse" |
| `minimum_staff_count` | PositiveIntegerField | Default: 1 |
| `billing_service` | FK → billing.Service | Linked billing service |
| `base_fee` | DecimalField | Base fee (KES), fallback if no billing_service |
| `sha_tariff_code` | CharField(50) | SHA intervention tariff |
| `sha_package_code` | CharField(50) | SHA package code |
| `requires_follow_up` | BooleanField | |
| `default_follow_up_days` | PositiveIntegerField | Default: 7 |
| `follow_up_clinic` | FK → clinics.Clinic | Default follow-up clinic |
| `is_active` | BooleanField | Default: True |
| `organization` | FK → core.Organization | Tenant scoping |
| `facility` | FK → core.Facility | Tenant scoping |

**Property**: `billing_price` — resolves `billing_service.unit_price` → `base_fee` → `None`.

**Categories** (TextChoices):

| Code | Label |
|------|-------|
| MINOR | Minor Procedure |
| DIAGNOSTIC | Diagnostic Procedure |
| THERAPEUTIC | Therapeutic Procedure |
| PREVENTIVE | Preventive Procedure |
| EMERGENCY | Emergency Procedure |
| DENTAL | Dental Procedure |
| OPHTHALMIC | Ophthalmic Procedure |
| ENT | ENT Procedure |
| OBSTETRIC | Obstetric Procedure |
| WOUND_CARE | Wound Care |
| INJECTION | Injection/Infusion |
| OTHER | Other |

**Body Systems** (TextChoices): INTEGUMENTARY, MUSCULOSKELETAL, RESPIRATORY, CARDIOVASCULAR, DIGESTIVE, URINARY, REPRODUCTIVE, NERVOUS, ENDOCRINE, LYMPHATIC, SENSORY, DENTAL, GENERAL.

### 3.2 ProcedureKit

Standard consumable kit templates for procedures.

| Field | Type | Notes |
|-------|------|-------|
| `procedure` | FK → ProcedureCatalog | Parent procedure |
| `name` | CharField(100) | e.g., "Standard Suturing Kit" |
| `description` | TextField | |
| `is_default` | BooleanField | Auto-selected for this procedure |
| `is_active` | BooleanField | |

### 3.3 ProcedureKitItem

Individual items in a procedure kit.

| Field | Type | Notes |
|-------|------|-------|
| `kit` | FK → ProcedureKit | Parent kit |
| `drug` | FK → pharmacy.Drug | Drug/consumable from pharmacy |
| `quantity` | PositiveIntegerField | Quantity needed |
| `is_optional` | BooleanField | Whether item is optional |
| `notes` | CharField(200) | |

### 3.4 ProcedureOrder

Clinical request for a procedure. Central entity that owns the workflow state machine.

| Field | Type | Notes |
|-------|------|-------|
| `order_number` | CharField(20), unique, auto | Format: `PROC-YYYYMMDD-XXXX` |
| `procedure` | FK → ProcedureCatalog | Procedure to perform |
| `patient` | FK → patients.Patient | Target patient |
| `encounter` | FK → encounters.Encounter | Originating encounter (nullable) |
| `clinic_visit` | FK → clinics.ClinicVisit | Originating clinic visit (nullable) |
| `admission` | FK → inpatient.Admission | If ordered for inpatient (nullable) |
| `status` | CharField (TextChoices) | See states below |
| `priority` | CharField (TextChoices) | EMERGENCY, URGENT, ROUTINE, ELECTIVE |
| `indication` | TextField | Clinical reason (required) |
| `clinical_notes` | TextField | Additional notes |
| `body_site` | CharField(100) | e.g., "Right forearm" |
| `laterality` | CharField (TextChoices) | LEFT, RIGHT, BILATERAL, NA |
| `appointment` | FK → scheduling.Appointment | Optional scheduling link |
| `scheduled_date` | DateField | Scheduled procedure date |
| `scheduled_time` | TimeField | Scheduled procedure time |
| `scheduled_location` | CharField(100) | Procedure room/location |
| `estimated_duration_minutes` | PositiveIntegerField | Override from catalog |
| `ordered_by` | FK → User | Clinician who ordered |
| `ordered_at` | DateTimeField (auto) | |
| `assigned_performer` | FK → User | Staff assigned to perform |
| `cancelled_by` | FK → User | |
| `cancelled_at` | DateTimeField | |
| `cancellation_reason` | TextField | |
| `organization` | FK → core.Organization | |
| `facility` | FK → core.Facility | |

**Order States** (TextChoices):

```
ORDERED → CONSENT_PENDING → SCHEDULED → READY → IN_PROGRESS → COMPLETED
                                                              → CANCELLED (from any state except COMPLETED)
```

**State-Transition Methods**:

| Method | Transition | Side Effects |
|--------|-----------|--------------|
| `request_consent()` | → CONSENT_PENDING | — |
| `schedule(date, time, location, duration)` | → SCHEDULED | Sets scheduling fields |
| `mark_ready()` | → READY | — |
| `start_procedure(performed_by)` | → IN_PROGRESS | Creates ProcedureLog |
| `complete()` | → COMPLETED | Called by ProcedureLog.complete() |
| `cancel(user, reason)` | → CANCELLED | Sets cancelled_by/at/reason |

**Properties**:
- `can_perform() → (bool, str)` — Checks status + consent validity
- `is_overdue → bool` — True if scheduled_date is past and not completed/cancelled

### 3.5 ProcedureConsent

Informed consent record. OneToOne with ProcedureOrder.

| Field | Type | Notes |
|-------|------|-------|
| `order` | OneToOne → ProcedureOrder | |
| `status` | CharField (TextChoices) | PENDING, SIGNED, DECLINED, WITHDRAWN |
| `consent_type` | CharField (TextChoices) | WRITTEN, VERBAL, EMERGENCY |
| `consent_text` | TextField | Full consent form text |
| `procedure_explained` | BooleanField | ✅ Checklist item |
| `risks_explained` | BooleanField | ✅ Checklist item |
| `alternatives_explained` | BooleanField | ✅ Checklist item |
| `questions_answered` | BooleanField | ✅ Checklist item |
| `signed_by_patient` | BooleanField | |
| `patient_signature` | TextField | Base64 image or typed name |
| `patient_signed_at` | DateTimeField | |
| `signed_by_guardian` | BooleanField | For minors |
| `guardian_name` | CharField(200) | |
| `guardian_relationship` | CharField(50) | |
| `guardian_id_number` | CharField(50) | |
| `guardian_signature` | TextField | |
| `guardian_signed_at` | DateTimeField | |
| `witness_required` | BooleanField | |
| `witness_name` | CharField(200) | |
| `witness_signature` | TextField | |
| `witness_signed_at` | DateTimeField | |
| `witnessed_by` | FK → User | |
| `obtained_by` | FK → User | Staff who obtained consent |
| `obtained_at` | DateTimeField | |
| `decline_reason` | TextField | |
| `declined_at` | DateTimeField | |

**Methods**: `is_valid()`, `sign(user)`, `decline(reason)`, `withdraw(reason)`.

**Validation** (`is_valid()` checks):
1. Status must be SIGNED
2. `procedure_explained` and `risks_explained` must both be True
3. If `guardian_consent_required` → `signed_by_guardian` must be True
4. Otherwise → `signed_by_patient` must be True
5. If `witness_required` → `witness_signature` must exist

### 3.6 ProcedureLog

Records the actual performance of a procedure. OneToOne with ProcedureOrder. Created automatically by `ProcedureOrder.start_procedure()`.

| Field | Type | Notes |
|-------|------|-------|
| `order` | OneToOne → ProcedureOrder | |
| `started_at` | DateTimeField | Auto-set on creation |
| `ended_at` | DateTimeField | Set on completion |
| `actual_duration_minutes` | PositiveIntegerField | Auto-calculated |
| `performed_by` | FK → User | Primary performer |
| `assistant` | FK → User | Assistant (nullable) |
| `location` | CharField(100) | Procedure room |
| `anesthesia_used` | BooleanField | |
| `anesthesia_type` | CharField(50) | |
| `anesthesia_agent` | CharField(100) | Drug name |
| `anesthesia_dose` | CharField(50) | |
| `pre_procedure_findings` | TextField | |
| `technique_description` | TextField | |
| `specimens_collected` | BooleanField | |
| `specimen_details` | TextField | |
| `status` | CharField | COMPLETED, PARTIAL, COMPLICATED, ABANDONED |
| `immediate_outcome` | TextField | |
| `complications_occurred` | BooleanField | |
| `complication_details` | TextField | |
| `post_procedure_instructions_given` | BooleanField | |
| `post_procedure_instructions` | TextField | |
| `notes` | TextField | |

**Methods**:
- `complete(status, outcome)` — Sets `ended_at`, auto-calculates duration, calls `order.complete()`, triggers auto-billing
- `abandon(reason)` — Sets ABANDONED status, cancels parent order

**Auto-duration**: On `save()`, if both `started_at` and `ended_at` are set, `actual_duration_minutes` is computed automatically.

### 3.7 ProcedureConsumable

Tracks drugs/items used during a procedure. Stock is auto-deducted from pharmacy.

| Field | Type | Notes |
|-------|------|-------|
| `log` | FK → ProcedureLog | |
| `drug` | FK → pharmacy.Drug | |
| `batch` | FK → pharmacy.StockBatch | For FEFO tracking (nullable) |
| `quantity` | PositiveIntegerField | |
| `unit_cost` | DecimalField | At time of use |
| `total_cost` | DecimalField | Auto: quantity × unit_cost |
| `notes` | CharField(200) | |
| `recorded_at` | DateTimeField (auto) | |
| `recorded_by` | FK → User | |

**Auto-deduction**: On first save, `_deduct_stock()` decrements `batch.quantity_available`.

### 3.8 ProcedureOutcome

Follow-up outcome assessments. Multiple per ProcedureLog.

| Field | Type | Notes |
|-------|------|-------|
| `log` | FK → ProcedureLog | |
| `assessment_date` | DateField | |
| `outcome` | CharField (TextChoices) | See outcomes below |
| `findings` | TextField | Clinical findings |
| `notes` | TextField | |
| `assessed_by` | FK → User | |
| `next_follow_up` | DateField | Nullable |
| `follow_up_notes` | TextField | |
| `images` | JSONField | Image file references (nullable) |

**Outcome Statuses**: SUCCESSFUL, PARTIAL_SUCCESS, HEALING, DELAYED_HEALING, INFECTION, COMPLICATION, RE_PROCEDURE_NEEDED, REFERRED.

---

## 4. API Reference

Base path: `/api/procedures/`

### 4.1 Catalog Endpoints

| Method | Path | Serializer | Description |
|--------|------|------------|-------------|
| GET | `/catalog/` | CatalogList | List procedures (paginated, filterable) |
| POST | `/catalog/` | CatalogDetail | Create catalog entry |
| GET | `/catalog/{id}/` | CatalogDetail | Get catalog entry detail |
| PATCH | `/catalog/{id}/` | CatalogDetail | Update catalog entry |
| DELETE | `/catalog/{id}/` | — | Delete catalog entry |

**Tenant Scope**: `organization` (shared across all facilities in the org).

**Filters** (`ProcedureCatalogFilter`):

| Parameter | Type | Notes |
|-----------|------|-------|
| `category` | string | e.g., `WOUND_CARE`, `DENTAL` |
| `body_system` | string | e.g., `INTEGUMENTARY` |
| `risk_level` | string | `LOW`, `MEDIUM`, `HIGH` |
| `is_active` | boolean | |
| `facility` | integer | Facility ID |
| `search` | string | Searches code, name, ichi_code, cpt_code |

**List Serializer Fields**: `id`, `code`, `name`, `category`, `body_system`, `risk_level`, `base_fee`, `typical_duration_minutes`, `consent_required`, `is_active`.

**Detail Serializer Fields**: All model fields + `billing_price` (read-only), `billing_service_name` (read-only).

### 4.2 Order Endpoints

| Method | Path | Serializer | Description |
|--------|------|------------|-------------|
| GET | `/orders/` | OrderList | List orders (paginated, filterable) |
| POST | `/orders/` | OrderCreate | Create order |
| GET | `/orders/{id}/` | OrderDetail | Get order with nested procedure, consent, log |
| PATCH | `/orders/{id}/` | OrderDetail | Update order |
| DELETE | `/orders/{id}/` | — | Delete order |

**Tenant Scope**: `facility` (orders belong to a specific facility).

**Filters** (`ProcedureOrderFilter`):

| Parameter | Type | Notes |
|-----------|------|-------|
| `status` | string | Order status |
| `priority` | string | EMERGENCY, URGENT, ROUTINE, ELECTIVE |
| `patient` | integer | Patient ID |
| `facility` | integer | Facility ID |
| `scheduled_date_from` | date | |
| `scheduled_date_to` | date | |
| `search` | string | Searches order_number, patient name, procedure name |

**Create Request Body**:

```json
{
  "procedure": 1,
  "patient": 42,
  "encounter": 10,
  "priority": "ROUTINE",
  "indication": "Wound repair needed for 3cm laceration",
  "body_site": "Left forearm",
  "laterality": "LEFT"
}
```

**Detail Response** (nested objects):

```json
{
  "id": 1,
  "order_number": "PROC-20260330-0001",
  "procedure": { "id": 3, "code": "PROC-WC-003", "name": "Suturing (Simple)", ... },
  "patient": 42,
  "status": "ORDERED",
  "priority": "ROUTINE",
  "consent": null,
  "log": null,
  "is_overdue": false,
  ...
}
```

### 4.3 Order Workflow Actions

| Method | Path | Request Body | Description |
|--------|------|-------------|-------------|
| POST | `/orders/{id}/schedule/` | `{ scheduled_date, scheduled_time?, scheduled_location?, estimated_duration_minutes? }` | Schedule the procedure |
| POST | `/orders/{id}/start/` | `{}` | Start procedure (creates ProcedureLog) |
| POST | `/orders/{id}/complete/` | `{ status?, immediate_outcome?, complications_occurred?, complication_details? }` | Complete procedure |
| POST | `/orders/{id}/cancel/` | `{ reason }` | Cancel with reason (required) |

**Complete Serializer Fields** (all optional except default):

| Field | Type | Default |
|-------|------|---------|
| `status` | ChoiceField | `"COMPLETED"` (also: `PARTIAL`, `COMPLICATED`) |
| `immediate_outcome` | CharField | `""` (allow_blank) |
| `complications_occurred` | BooleanField | `false` |
| `complication_details` | CharField | `""` (allow_blank) |

### 4.4 Consent Actions

| Method | Path | Request Body | Description |
|--------|------|-------------|-------------|
| GET | `/orders/{id}/consent/` | — | Get consent record |
| POST | `/orders/{id}/consent/create/` | See below | Create consent record |
| POST | `/orders/{id}/consent/sign/` | `{}` | Sign consent (PENDING → SIGNED) |
| POST | `/orders/{id}/consent/decline/` | `{ reason? }` | Decline consent |

**Create Consent Body**:

```json
{
  "consent_type": "WRITTEN",
  "consent_text": "I consent to the procedure...",
  "procedure_explained": true,
  "risks_explained": true,
  "alternatives_explained": true,
  "questions_answered": true,
  "signed_by_patient": true,
  "signed_by_guardian": false,
  "guardian_name": "",
  "guardian_relationship": "",
  "witness_required": false,
  "witness_name": ""
}
```

### 4.5 Consumable Actions

| Method | Path | Request Body | Description |
|--------|------|-------------|-------------|
| GET | `/orders/{id}/consumables/` | — | List consumables used |
| POST | `/orders/{id}/consumables/add/` | `{ drug, batch?, quantity, notes? }` | Add consumable (deducts stock) |

### 4.6 Outcome Actions

| Method | Path | Request Body | Description |
|--------|------|-------------|-------------|
| GET | `/orders/{id}/outcomes/` | — | List outcomes |
| POST | `/orders/{id}/outcomes/add/` | See below | Add outcome assessment |

**Add Outcome Body**:

```json
{
  "assessment_date": "2026-04-06",
  "outcome": "HEALING",
  "findings": "Wound edges approximated, no erythema",
  "notes": "",
  "next_follow_up": "2026-04-13",
  "follow_up_notes": "Return for suture removal"
}
```

### 4.7 Dashboard

| Method | Path | Description |
|--------|------|-------------|
| GET | `/dashboard/` | Procedure statistics (counts by status, overdue, today's schedule) |

---

## 5. Workflows

### 5.1 Complete Procedure Lifecycle

```
┌──────────────────────────────────────────────────────────────────────┐
│                    Procedure Order Lifecycle                          │
├──────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  Clinician orders procedure                                          │
│  POST /orders/                                                       │
│       │                                                              │
│       ▼                                                              │
│  ┌─────────┐    consent_required?                                    │
│  │ ORDERED │───── Yes ──→ POST /consent/create/ ──→ ┌──────────────┐│
│  └────┬────┘                                        │CONSENT_PENDING││
│       │ No                                          └──────┬───────┘│
│       │              POST /consent/sign/ ◄──────────────────┘       │
│       │                        │                                     │
│       ▼                        ▼                                     │
│  POST /schedule/ ◄─────────────┘                                     │
│       │                                                              │
│       ▼                                                              │
│  ┌───────────┐                                                       │
│  │ SCHEDULED │─── patient arrives ──→ mark_ready() ──→ ┌───────┐    │
│  └─────┬─────┘                                         │ READY │    │
│        │                                               └───┬───┘    │
│        └──────────────────────┬─────────────────────────────┘       │
│                               │                                      │
│                    POST /start/                                       │
│                               │                                      │
│                               ▼                                      │
│                        ┌─────────────┐                               │
│                        │ IN_PROGRESS │  ← ProcedureLog created       │
│                        └──────┬──────┘                               │
│                               │                                      │
│                    POST /complete/                                    │
│                               │                                      │
│                               ▼                                      │
│                        ┌───────────┐                                 │
│                        │ COMPLETED │  → Auto-billing triggered       │
│                        └─────┬─────┘  → InvoiceItem created          │
│                              │                                       │
│                    POST /outcomes/add/ (multiple times)               │
│                              │                                       │
│                              ▼                                       │
│                     Follow-up assessments                            │
│                                                                      │
│  ╔══════════════════════════════════════════════════════════╗         │
│  ║  CANCELLED (from any state except COMPLETED)            ║         │
│  ║  POST /cancel/ { reason: "..." }                        ║         │
│  ╚══════════════════════════════════════════════════════════╝         │
│                                                                      │
└──────────────────────────────────────────────────────────────────────┘
```

### 5.2 Consent Flow

```
1. Staff creates consent record (POST /consent/create/)
   → ProcedureConsent created with status=PENDING
   → ProcedureOrder transitions: ORDERED → CONSENT_PENDING

2. Staff explains procedure to patient, checks 4 boxes:
   ✅ Procedure explained
   ✅ Risks and complications explained
   ✅ Alternative treatments discussed
   ✅ Patient's questions answered

3. Patient signs → Staff clicks "Sign Consent" (POST /consent/sign/)
   → Consent: PENDING → SIGNED
   → Order can now be scheduled

4. (Alternative) Patient declines (POST /consent/decline/)
   → Consent: PENDING → DECLINED

5. (Alternative) Patient later withdraws consent
   → Consent: SIGNED → WITHDRAWN

Consent Types:
  WRITTEN   — Standard paper/digital consent form
  VERBAL    — Verbal consent documented by staff (for low-risk procedures)
  EMERGENCY — Implied consent (patient incapacitated, life-threatening)
```

### 5.3 Performing a Procedure

```
1. Click "Start Procedure" (POST /start/)
   → ProcedureLog auto-created:
     - started_at = now
     - performed_by = current user
     - location = scheduled_location
   → Order: SCHEDULED/READY → IN_PROGRESS

2. During procedure, staff can:
   - Add consumables (POST /consumables/add/)
     → Pharmacy stock auto-deducted via StockBatch.quantity_available

3. Click "Complete" (POST /complete/)
   → ProcedureLog updated:
     - ended_at = now
     - actual_duration_minutes = auto-calculated
     - status, immediate_outcome, complications
   → ProcedureOrder: IN_PROGRESS → COMPLETED
   → BillingAgentService.handle_procedure_completed() triggered
```

### 5.4 Outcome Tracking

```
Outcomes are recorded as follow-up assessments after procedure completion.
A single procedure can have multiple outcome records over time.

Example timeline for wound suturing:

  Day 0   POST /outcomes/add/ → SUCCESSFUL (immediate: "Good hemostasis")
  Day 3   POST /outcomes/add/ → HEALING ("Wound edges approximated, no infection")
  Day 7   POST /outcomes/add/ → SUCCESSFUL ("Complete healing, sutures removed")

Each outcome records:
  - Assessment date
  - Outcome status (8 options from SUCCESSFUL to REFERRED)
  - Clinical findings
  - Next follow-up date (optional)
  - Follow-up instructions (optional)
```

---

## 6. Billing Integration

Procedures are automatically billed when completed. The billing agent is triggered from `ProcedureLog.complete()`.

### Resolution Order

`BillingAgentService.handle_procedure_completed(order)` resolves the billable amount:

1. **`catalog.billing_service`** — If the catalog entry has a linked `billing.Service`, use `service.unit_price`
2. **Code match** — Search for a `billing.Service` with the same code in the `PROC` category
3. **Base fee fallback** — Use `catalog.base_fee` directly as the invoice item amount

### Auto-Billing Flow

```
ProcedureLog.complete()
  │
  ├── Calls BillingAgentService.handle_procedure_completed(order)
  │     │
  │     ├── Find/create draft Invoice for patient + encounter
  │     ├── Resolve unit_price (service → code match → base_fee)
  │     ├── Create InvoiceItem:
  │     │     service = billing_service
  │     │     description = "Procedure: {name}"
  │     │     quantity = 1
  │     │     unit_price = resolved price
  │     └── Recalculate invoice total
  │
  └── If billing fails → exception logged, procedure still completes
```

### Linking Catalog to Billing Services

```bash
# Seed catalog + create matching billing.Service records
python manage.py seed_procedure_catalog --link-billing

# Or separately after seeding
python manage.py seed_service_catalog  # Creates PROC category services
```

---

## 7. Seed Data & Management Commands

### 7.1 seed_procedure_catalog

Seeds 46 baseline procedures across 11 categories.

```bash
# Preview
python manage.py seed_procedure_catalog --dry-run

# Seed with auto-detected facility (demo HQ or first active)
python manage.py seed_procedure_catalog

# Seed to specific facility
python manage.py seed_procedure_catalog --facility 12351

# Also create/link billing.Service records
python manage.py seed_procedure_catalog --link-billing
```

**Arguments**:

| Flag | Description |
|------|-------------|
| `--dry-run` | Preview without creating |
| `--facility <mfl_code>` | Target facility MFL code |
| `--link-billing` | Create billing.Service records and link to catalog |

**Facility Resolution** (priority order):
1. Explicit `--facility` MFL code
2. Demo HQ facility (`mfl_code=DEMO-HQ-001`)
3. First active facility in the database

**Backfill Behavior**: If a catalog entry already exists (by code), the command backfills `organization` and `facility` if they're missing.

**Billing Linkage** (`--link-billing`):
- Creates a `billing.ServiceCategory` with code `PROC` if it doesn't exist
- For each catalog entry without a `billing_service`:
  - Checks for existing `billing.Service` with the same code
  - If not found, creates one with `unit_price = base_fee`
  - Links `catalog.billing_service = service`

### 7.2 Seeded Procedures (46 total)

| Category | Count | Examples |
|----------|-------|---------|
| WOUND_CARE | 5 | Wound Dressing (Simple/Complex), Suturing (Simple/Complex), Suture Removal |
| MINOR | 5 | Incision & Drainage, Foreign Body Removal (Skin), Cyst/Lipoma Excision, Nail Removal |
| PREVENTIVE | 2 | Male Circumcision (Adult/Pediatric) |
| INJECTION | 5 | IM/IV/SC Injection, IV Cannulation, IV Infusion Setup |
| OPHTHALMIC | 3 | Eye Irrigation, Foreign Body Removal (Eye), Eye Examination |
| ENT | 4 | Ear Syringing, Foreign Body Removal (Ear/Nose), Nasal Packing |
| THERAPEUTIC | 5 | Urethral Catheterization, Catheter Change, Bladder Irrigation, NG Tube Insertion/Removal |
| DIAGNOSTIC | 6 | Gastric Lavage, Rectal Examination, Enema, Lumbar Puncture, Paracentesis, Thoracentesis, Bone Marrow Aspiration |
| OBSTETRIC | 5 | Vaginal/Cervical Examination, MVA, Episiotomy/Perineal Tear Repair |
| DENTAL | 5 | Extraction (Simple/Surgical), Scaling, Filling, Root Canal |

**Price Range**: KES 200 (IM Injection) to KES 15,000 (Root Canal Treatment).

### 7.3 Staging Deployment

The seed command is included in `scripts/seed.sh` (runs after `backfill_org_facility`):

```bash
python manage.py backfill_org_facility
python manage.py seed_procedure_catalog --link-billing
python manage.py seed_service_catalog
```

---

## 8. Frontend (Web App)

### 8.1 Pages

| Page | Path | Description |
|------|------|-------------|
| Dashboard | `/procedures` | Stats cards (total orders, pending, in-progress, completed today) |
| Catalog List | `/procedures/catalog` | Paginated list with search, category/risk filters, "New Procedure" button |
| Catalog Detail | `/procedures/catalog/{id}` | Full procedure details, coding, consent requirements, "Edit" button |
| Catalog New | `/procedures/catalog/new` | Create form (7 cards: Basic Info, Coding, Clinical, Consent, Billing, Follow-up, Actions) |
| Catalog Edit | `/procedures/catalog/{id}/edit` | Edit form (same layout, code field disabled) |
| Orders List | `/procedures/orders` | Paginated list with status/priority filters, "New Order" button |
| New Order | `/procedures/orders/new` | 3-step form: Patient selector → Procedure search → Order details |
| Order Detail | `/procedures/orders/{orderId}` | 4-tab view (see below) |

### 8.2 Order Detail Page — 4 Tabs

**Overview Tab**:
- Procedure details card (name, code, category, risk, fee, duration, consent required)
- Order information card (priority, indication, notes, body site, location)
- Cancellation card (if cancelled)

**Consent Tab** (3 states):
- Consent not required → informational message
- No consent yet → "Obtain Consent" button → opens Create Consent dialog
- Consent exists → ConsentCard with 4-checkbox status, Sign/Decline buttons

**Perform Tab**:
- Before start → "Start Procedure" button
- During/after → PerformanceCard (start/end time, duration timer, performer, anesthesia, technique, specimens, outcome, complications)

**Outcomes Tab**:
- "Add Outcome Assessment" button (visible when order is COMPLETED)
- Inline form: assessment date, outcome status (8 options), findings, notes, next follow-up
- Timeline of outcome cards

### 8.3 Action Buttons (Status-Dependent)

| Order Status | Available Actions |
|-------------|-------------------|
| ORDERED | Schedule, Cancel |
| CONSENT_PENDING | Schedule (if consent signed), Cancel |
| SCHEDULED | Start Procedure, Cancel |
| READY | Start Procedure, Cancel |
| IN_PROGRESS | Complete, Cancel |
| COMPLETED | (none — only outcomes can be added) |
| CANCELLED | (none) |

### 8.4 Dialogs

| Dialog | Trigger | Fields |
|--------|---------|--------|
| Schedule | "Schedule" button | Date*, Time, Location |
| Cancel | "Cancel" button | Reason* |
| Complete | "Complete" button | Outcome status, Immediate outcome, Complications checkbox + details |
| Create Consent | "Obtain Consent" button | Consent type, 4-checkbox checklist, Patient/Guardian/Witness sections |

### 8.5 Components

| Component | File | Description |
|-----------|------|-------------|
| `ProcedureForm` | `components/procedures/procedure-form.tsx` | Shared create/edit form with 7 card sections, Zod validation |
| `ConsentCard` | Inline in order detail | Displays consent status, checklist, sign/decline buttons |
| `PerformanceCard` | Inline in order detail | Shows procedure log with timing, technique, outcome |
| `OutcomesTab` | Inline in order detail | Lists outcomes + inline add form |

### 8.6 API Client

Location: `lib/api/procedures.ts`

| Method | Description |
|--------|-------------|
| `listCatalog(params)` | List catalog entries (paginated) |
| `getCatalogEntry(id)` | Get catalog detail |
| `createCatalogEntry(data)` | Create catalog entry |
| `updateCatalogEntry(id, data)` | Update catalog entry |
| `listOrders(params)` | List orders (paginated) |
| `getOrder(id)` | Get order detail |
| `createOrder(data)` | Create order |
| `scheduleOrder(id, data)` | Schedule order |
| `startProcedure(id)` | Start procedure |
| `completeProcedure(id, data)` | Complete procedure |
| `cancelOrder(id, reason)` | Cancel order |
| `signConsent(id)` | Sign consent |
| `declineConsent(id, reason)` | Decline consent |
| `createConsent(id, data)` | Create consent |
| `listConsumables(id)` | List consumables |
| `addConsumable(id, data)` | Add consumable |
| `listOutcomes(id)` | List outcomes |
| `addOutcome(id, data)` | Add outcome |
| `getDashboard()` | Dashboard stats |

### 8.7 TypeScript Types

Location: `lib/types/procedure.ts`

| Interface | Used For |
|-----------|----------|
| `ProcedureCatalogEntry` | Catalog list items |
| `ProcedureCatalogDetail` | Catalog detail (all fields) |
| `ProcedureOrderListItem` | Order list items |
| `ProcedureOrder` | Order detail (nested procedure, consent, log) |
| `ProcedureConsent` | Consent record |
| `ProcedureLog` | Performance log |
| `ProcedureConsumable` | Consumable record |
| `ProcedureOutcome` | Outcome assessment |
| `ProcedureDashboard` | Dashboard stats |

**Color Maps**: `PROCEDURE_STATUS_COLORS`, `PROCEDURE_STATUS_LABELS`, `PROCEDURE_PRIORITY_COLORS`, `RISK_LEVEL_COLORS`.

---

## 9. Admin Interface

All 7 data models are registered in Django admin (`admin.py`):

| Admin Class | Features |
|-------------|----------|
| `ProcedureCatalogAdmin` | List: code, name, colored category/risk badges, fee, consent, active. Fieldsets: Basic Info, Classification, Coding, Consent, Clinical, Staffing, Billing, Follow-up, System. Search: code, name, ichi_code. |
| `ProcedureKitAdmin` | Inline `ProcedureKitItem` (tabular). Filter: procedure, is_default, is_active. |
| `ProcedureOrderAdmin` | List: order_number, patient, procedure, colored status/priority badges, scheduled_date. `raw_id_fields`: patient, encounter, ordered_by. |
| `ProcedureConsentAdmin` | List: order, status badge, consent_type, obtained_by, obtained_at. |
| `ProcedureLogAdmin` | List: order, started_at, ended_at, duration, performed_by, status badge. |
| `ProcedureConsumableAdmin` | List: log, drug, quantity, unit_cost, total_cost, recorded_by. |
| `ProcedureOutcomeAdmin` | List: log, assessment_date, outcome badge, assessed_by, next_follow_up. |

---

## 10. Testing

### 10.1 Test Files

| File | Tests | Coverage Area |
|------|-------|---------------|
| `tests/procedures/test_procedure_api.py` | 31 | Full CRUD + all workflow actions |
| `tests/procedures/test_procedure_models.py` | 20 | State transitions, auto-MRN, computed properties |
| `tests/procedures/test_procedure_serializers.py` | 18 | Validation rules, nested serializer output |
| `tests/procedures/test_procedure_billing.py` | 16 | Billing integration, auto-invoicing, price resolution |
| **Total** | **85** | |

### 10.2 Running Tests

```bash
cd backend

# All procedure tests
poetry run pytest tests/procedures/ -v --no-cov

# Specific test file
poetry run pytest tests/procedures/test_procedure_api.py -v --no-cov

# With coverage
poetry run pytest tests/procedures/ --cov=hmis.apps.procedures --cov-report=term-missing

# Run just API workflow tests
poetry run pytest tests/procedures/test_procedure_api.py -k "workflow" -v --no-cov
```

### 10.3 Key Test Scenarios

**API Tests** (`test_procedure_api.py`):
- Catalog CRUD (list, create, filter by category, unauthenticated rejection)
- Order CRUD (create, list, retrieve, auto-set ordered_by, missing indication rejection)
- Workflow: schedule → start → complete (happy path)
- Workflow: start wrong status (should fail)
- Workflow: complete wrong status (should fail)
- Cancel order (with reason, without reason fails, completed order fails)
- Consent: create → get → sign → decline
- Consumables: list, add
- Outcomes: list, add
- Dashboard: stats, unauthenticated rejection

**Model Tests** (`test_procedure_models.py`):
- Order number auto-generation (PROC-YYYYMMDD-XXXX)
- State transitions: request_consent, schedule, mark_ready, start_procedure, complete, cancel
- `can_perform()` validation (consent check)
- `is_overdue` property
- ProcedureLog auto-duration calculation
- ProcedureConsumable auto-cost calculation
- Consent `is_valid()` checks

**Billing Tests** (`test_procedure_billing.py`):
- Auto-billing on procedure completion
- Price resolution: billing_service → code match → base_fee
- Invoice item creation
- Billing failure handling (procedure still completes)

---

## 11. Troubleshooting

### Catalog is empty in the frontend

**Symptom**: `/procedures/catalog` shows "No procedures found" after restarting backend.

**Cause**: Catalog entries exist but are scoped to a different facility than the logged-in user.

**Fix**: The `ProcedureCatalogViewSet` uses `tenant_scope = "organization"` (not `"facility"`). If entries were seeded before this fix, run:

```bash
python manage.py seed_procedure_catalog  # Backfills org/facility
```

### "complication_details: this field may not be blank"

**Symptom**: Completing a procedure without checking "Complications occurred" fails with 400.

**Cause**: DRF `CharField` rejects empty strings by default even with `required=False`.

**Fix**: Applied in `ProcedureCompleteSerializer` — `allow_blank=True` on `complication_details` and `immediate_outcome`.

### "A component is changing an uncontrolled input to be controlled"

**Symptom**: Console warning on the New Procedure form.

**Cause**: Optional string fields in the form defaultValues were missing (undefined → empty string transition).

**Fix**: All optional string fields now have explicit `''` defaults in the create-mode defaultValues.

### Consent tab shows "not created yet" with no button

**Symptom**: Order requires consent but there's no way to create it from the UI.

**Fix**: "Obtain Consent" button added to the consent empty state. Opens the Create Consent dialog with the 4-checkbox checklist.

### Auto-billing doesn't trigger

**Symptom**: Completing a procedure doesn't create an invoice item.

**Check**:
1. Is `billing_service` linked on the catalog entry?
   ```bash
   python manage.py shell -c "from hmis.apps.procedures.models import ProcedureCatalog; print(ProcedureCatalog.objects.filter(billing_service__isnull=True).count())"
   ```
2. Does a `billing.Service` exist with the procedure code?
3. Does the catalog entry have a `base_fee`?

**Fix**: Run `python manage.py seed_procedure_catalog --link-billing` to create/link billing services.

### Orders return empty list

**Symptom**: `/procedures/orders` shows no results.

**Cause**: Orders are tenant-scoped by `facility`. The logged-in user must be at the same facility where orders were created.

**Check**: Verify the user's facility assignment:
```bash
python manage.py shell -c "
from django.contrib.auth import get_user_model
u = get_user_model().objects.get(username='your-user')
print(u.staff_profile.primary_facility)
"
```
