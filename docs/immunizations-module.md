# Immunizations Module — Comprehensive Documentation

> **Module**: `backend/hmis/apps/immunizations/` + `web-app/app/(dashboard)/immunizations/`
> **Status**: ✅ Fully Implemented (Phase 1, Sprint 1.4–1.7)
> **Tests**: 156+ passing | **Coverage**: ≥ 80%
> **Last Updated**: April 6, 2026

---

## Table of Contents

1. [Overview](#1-overview)
2. [Architecture](#2-architecture)
3. [Data Models](#3-data-models)
4. [API Reference](#4-api-reference)
5. [Business Logic & Workflows](#5-business-logic--workflows)
6. [Cross-Module Integrations](#6-cross-module-integrations)
7. [AEFI Reporting (MOH Compliance)](#7-aefi-reporting-moh-compliance)
8. [Frontend (Web App)](#8-frontend-web-app)
9. [Testing](#9-testing)
10. [Troubleshooting](#10-troubleshooting)

---

## 1. Overview

The Immunizations module provides **facility-wide** vaccine management supporting:

- **KEPI** (Kenya Expanded Programme on Immunization) for children 0–23 months
- **Adult routine** vaccines (Hepatitis B, Td boosters, HPV)
- **Campaign** vaccines (COVID-19, Polio mop-up)
- **Occupational & travel** vaccines
- **AEFI** (Adverse Event Following Immunization) reporting aligned with the Kenya MOH AEFI Reporting Form
- **Cold chain** equipment and temperature monitoring
- **Vaccine stock** management with VVM tracking

This replaces the earlier MCH-only vaccine models with a standalone app that serves all facility departments.

---

## 2. Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                  Immunizations Module Architecture               │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────────────┐     ┌──────────────────┐                  │
│  │ VaccineDefinition│     │  VaccineCampaign  │                  │
│  │  (Reference Data) │     │  (Mass Campaigns) │                  │
│  └────────┬─────────┘     └────────┬─────────┘                  │
│           │                        │                             │
│  ┌────────▼────────────────────────▼─────────┐                  │
│  │         ImmunizationRecord                 │                  │
│  │  (SCHEDULED → ADMINISTERED / MISSED)       │                  │
│  └────────┬─────────┬──────────┬─────────────┘                  │
│           │         │          │                                 │
│  ┌────────▼──┐ ┌────▼────┐ ┌──▼──────────┐                     │
│  │   AEFI    │ │Scheduling│ │   Billing   │                     │
│  │ Reporting │ │Appointment│ │ Auto-Invoice│                     │
│  └────────┬──┘ └──────────┘ └─────────────┘                     │
│           │                                                      │
│  ┌────────▼──────────┐    ┌──────────────────┐                  │
│  │ Surveillance Alert│    │ DHIS2 AEFI       │                  │
│  │ (Severe/Death)    │    │ Tracker Submit   │                  │
│  └───────────────────┘    └──────────────────┘                  │
│                                                                  │
│  ┌──────────────────┐    ┌──────────────────┐                   │
│  │  VaccineStock     │    │ColdChainEquipment│                   │
│  │  + Transactions   │    │ + TemperatureLogs│                   │
│  └──────────────────┘    └──────────────────┘                   │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Key Design Decisions

| Decision | Rationale |
|----------|-----------|
| Standalone app (not MCH-only) | Immunizations serve all departments — CWC, ANC, PNC, adult clinics, campaigns |
| Optional encounter FK | Mass campaigns and outreach have no clinical encounter |
| Multi-dose `unique_together` on `(patient, vaccine, dose_number)` | Supports adult series (3-dose Hep B) and boosters |
| `VaccineDefinition` is global (no facility scoping) | Reference data shared across all tenants |
| `ImmunizationRecord` is `FacilityScopedModel` | Patient vaccination data scoped to facility |

---

## 3. Data Models

### VaccineDefinition

Global reference data for all vaccine types.

| Field | Type | Description |
|-------|------|-------------|
| `code` | CharField(unique) | e.g., `BCG`, `PENTA1`, `COVID19_PF` |
| `name` | CharField | Full vaccine name |
| `program` | TextChoices | `KEPI`, `ROUTINE`, `CAMPAIGN`, `OCCUPATIONAL`, `TRAVEL`, `CATCH_UP` |
| `target_population` | TextChoices | `INFANT`, `CHILD`, `ADOLESCENT`, `ADULT`, `ALL` |
| `standard_age_days` | int | Days from birth for KEPI scheduling |
| `dose_number` / `total_doses` | int | Series position and total doses |
| `interval_days` | int | Minimum days between doses |
| `billing_service` | FK → `billing.Service` | Linked billing service for auto-invoicing |
| `base_fee` | Decimal | Fallback fee when no billing service linked |
| `sha_tariff_code` | CharField | SHA intervention tariff code |

**`billing_price` property**: Resolves `billing_service.unit_price` → `base_fee` → `None`.

### ImmunizationRecord

Individual vaccination event per patient.

| Field | Type | Description |
|-------|------|-------------|
| `patient` | FK → Patient | Patient receiving the vaccine |
| `vaccine` | FK → VaccineDefinition | Vaccine being administered |
| `scheduled_date` | DateField | When the dose is due |
| `administered_date` | DateField | When actually given |
| `status` | TextChoices | `SCHEDULED`, `ADMINISTERED`, `MISSED`, `CONTRAINDICATED`, `DEFERRED` |
| `dose_number` | int | Dose number in the series |
| `batch_number` / `lot_number` | CharField | Vaccine batch/lot tracking |
| `vaccine_manufacturer` | CharField | Manufacturer captured at admin time |
| `diluent_batch_number` / `diluent_manufacturer` / `diluent_expiry_date` | Various | Diluent tracking (MOH AEFI form requirement) |
| `vaccination_service_type` | TextChoices | `STATIC`, `MASS`, `OUTREACH` |
| `encounter` | FK (optional) | Clinical encounter (null for campaigns/outreach) |
| `campaign` | FK (optional) | Mass vaccination campaign |
| `facility` / `organization` | FK | Auto-resolved from encounter or patient |

**Unique constraint**: `(patient, vaccine, dose_number)` — prevents duplicate scheduling.

### AEFI

Adverse Event Following Immunization report aligned with Kenya MOH AEFI Reporting Form.

| Field | Type | Description |
|-------|------|-------------|
| `immunization_record` | FK | The vaccination that caused the event |
| `report_type` | TextChoices | `INITIAL` / `FOLLOW_UP` |
| `parent_report` | FK (self) | For follow-up report chains |
| `event_types` | JSONField | Multi-select: BCG_LYMPHADENITIS, CONVULSION, ANAPHYLAXIS, etc. |
| `severity` | TextChoices | `MILD`, `MODERATE`, `SEVERE` |
| `outcome` | TextChoices | `RECOVERED`, `RECOVERING`, `NOT_RECOVERED`, `SEQUELAE`, `DEATH`, `UNKNOWN` |
| `vaccination_service_type` | TextChoices | `STATIC`, `MASS`, `OUTREACH` |
| `guardian_name` | CharField | Required for child patients (MOH form) |
| `vaccination_centre_name` / `institution_mfl_code` | CharField | Auto-populated from facility |
| `treatment_given` / `treatment_details` | Bool + Text | Action taken |
| `specimen_collected` / `specimen_type` | Bool + Text | Investigation specimens |
| `reported_to_authorities` / `report_date` | Bool + DateTime | Submission status |
| `dhis2_submitted_at` / `dhis2_response` | DateTime + JSON | DHIS2 AEFI Tracker sync status |

### Other Models

- **VaccineCampaign**: Mass campaign metadata (date range, target population, status)
- **VaccineStock**: Batch-level inventory with VVM status, min stock levels
- **StockTransaction**: Stock movements (receive, issue, wastage, transfer, expired)
- **ColdChainEquipment**: Refrigerators, cold boxes with temperature monitoring
- **TemperatureLog**: Temperature readings with excursion alerts

---

## 4. API Reference

### Vaccine Definitions
```
GET    /api/immunizations/vaccines/              # List (filterable by program, target_population)
GET    /api/immunizations/vaccines/{id}/          # Detail
```

### Immunization Records
```
GET    /api/immunizations/records/                # List (filterable by patient, status, program)
POST   /api/immunizations/records/                # Create record
GET    /api/immunizations/records/{id}/            # Detail
PATCH  /api/immunizations/records/{id}/            # Update
POST   /api/immunizations/records/{id}/administer/ # Record administration
POST   /api/immunizations/records/generate-kepi-schedule/  # Auto-generate KEPI schedule
POST   /api/immunizations/records/generate-adult-schedule/  # Generate multi-dose adult schedule
```

### AEFI Reports
```
GET    /api/immunizations/aefi/                    # List (filterable by severity, report_type)
POST   /api/immunizations/aefi/                    # Create AEFI report
GET    /api/immunizations/aefi/{id}/               # Detail
POST   /api/immunizations/aefi/{id}/follow-up/     # Create follow-up report
POST   /api/immunizations/aefi/{id}/submit-to-authorities/  # Submit to national authorities + DHIS2
```

### Campaigns, Stock, Cold Chain
```
GET/POST  /api/immunizations/campaigns/            # List/Create campaigns
GET/PATCH /api/immunizations/campaigns/{id}/       # Detail/Update

GET/POST  /api/immunizations/stock/                # List/Create stock
GET/PATCH /api/immunizations/stock/{id}/           # Detail/Update
POST      /api/immunizations/stock/{id}/transaction/  # Record stock transaction

GET       /api/immunizations/cold-chain/           # List equipment
GET       /api/immunizations/cold-chain/{id}/      # Detail
POST      /api/immunizations/cold-chain/{id}/log-temperature/  # Record temperature
```

### Coverage Analytics
```
GET    /api/immunizations/coverage/                # Coverage stats by vaccine
```

---

## 5. Business Logic & Workflows

### KEPI Schedule Generation

```
generate_kepi_schedule(patient) →
  For each active KEPI VaccineDefinition:
    scheduled_date = patient.DOB + vaccine.standard_age_days
    get_or_create ImmunizationRecord(patient, vaccine, dose_number)
  → List[ImmunizationRecord]
```

This is idempotent — running it multiple times won't create duplicates.

### Vaccine Administration

```
administer(record, data) →
  1. Validate record.status == SCHEDULED
  2. Set status=ADMINISTERED, administered_date, batch_number, etc.
  3. Save record → triggers:
     a. Billing signal → BillingAgentService.handle_immunization_administered()
     b. Stock deduction (if VaccineStock linked)
     c. Scheduling appointment status sync
```

### Overdue Detection

```python
@property
def is_overdue(self) -> bool:
    return self.status == 'SCHEDULED' and self.scheduled_date < date.today()
```

---

## 6. Cross-Module Integrations

### → Scheduling (Appointments)

When KEPI/adult schedules are generated, `create_vaccination_appointment()` auto-creates scheduling appointments:

```
ImmunizationRecord(SCHEDULED) → Appointment(type=VACCINATION, resource=IMM-CLINIC)
```

**Facility-scoped**: Resource lookup filters by `facility=record.facility` to prevent cross-tenant leakage.

When a VACCINATION appointment is completed → `ImmunizationRecord.status` is synced to `ADMINISTERED` (via signal in `immunizations/signals.py`).

### → Billing (Auto-Invoicing)

When `ImmunizationRecord.status` changes to `ADMINISTERED`, the billing agent auto-creates an invoice line item:

```
Resolution order:
1. VaccineDefinition.billing_service FK (preferred)
2. Service.code == vaccine.code match
3. Service name match within IMM category
4. VaccineDefinition.base_fee fallback (no Service link)
```

Invoice item uses `item_type=VACCINATION` and `immunization_record` FK for traceability.

### → Surveillance (AEFI Alerts)

When an AEFI report is created with `severity=SEVERE` or `outcome=DEATH`:
- A `SurveillanceAlert` is auto-created (via signal)
- A `NotifiableCase` for "AEFI - Severe" is auto-created with encounter link (when available)

### → DHIS2 (AEFI Tracker)

The `submit-to-authorities` action on AEFI enqueues a Celery task to submit the report to the DHIS2 AEFI Tracker program. Fields are mapped via `immunizations/services/dhis2_tracker.py`.

---

## 7. AEFI Reporting (MOH Compliance)

### MOH AEFI Reporting Form Sections

The AEFI data model and frontend form cover all 9 sections of the Kenya MOH AEFI Reporting Form:

| Section | Description | Implementation |
|---------|-------------|----------------|
| 1 | Patient Details | Auto-populated from `ImmunizationRecord.patient` |
| 2 | Vaccination Centre | Auto-populated from facility (name, MFL code, county) |
| 3 | Type of AEFI | Multi-select `event_types` JSONField (11 MOH checkbox types) |
| 4 | Event Details | `event_date`, `onset_time`, `severity`, `description` |
| 5 | Suspected Vaccine | Auto-populated from record (vaccine, dose, batch, manufacturer, diluent) |
| 6 | Past Medical History | `past_medical_history_notes` free text |
| 7 | Action Taken | `treatment_given`, `treatment_details`, `specimen_collected`, `specimen_type` |
| 8 | Outcome | `outcome` (6 MOH outcome categories) |
| 9 | Reporter | `reported_by` (auto), `reported_by_designation` |

### AEFI Event Types (MOH Checkboxes)

```
BCG_LYMPHADENITIS, INJECTION_SITE_ABSCESS, CONVULSION, HIGH_FEVER,
SEVERE_LOCAL_REACTION, GENERALIZED_URTICARIA, ANAPHYLAXIS,
ENCEPHALOPATHY, PARALYSIS, TOXIC_SHOCK, OTHER
```

### Follow-up Reports

Initial AEFI reports can have follow-up reports linked via `parent_report` FK. Follow-ups carry forward context and allow updating severity, outcome, and treatment details.

### Printing

The AEFI detail page supports `window.print()` with dedicated CSS that:
- Adds "MINISTRY OF HEALTH — AEFI REPORTING FORM" header
- Strips navigation, buttons, and dialogs
- Formats cards as bordered sections for paper output

---

## 8. Frontend (Web App)

### Pages

| Page | Path | Description |
|------|------|-------------|
| Immunization Records | `/immunizations` | Patient-specific vaccine schedule with grouped records |
| AEFI List | `/immunizations/aefi` | Filterable list with `ResponsiveTable` |
| AEFI Create | `/immunizations/aefi/new` | 9-section MOH form |
| AEFI Detail | `/immunizations/aefi/[id]` | Full report detail with actions |

### Key Features

- **Generate KEPI Schedule** button: One-click to populate the full childhood vaccination card
- **Generate Adult Schedule** dialog: Select vaccine + start date for multi-dose series
- **Administer dialog**: Records administration with batch, lot, manufacturer, site, and diluent fields
- **AEFI event type checkboxes**: Visual grid matching MOH form layout
- **Submit to Authorities**: Dialog with optional notes, triggers DHIS2 submission
- **Create Follow-up**: Dialog to update condition/outcome over time
- **Print MOH Form**: Browser print with MOH-formatted CSS

### Files

```
web-app/
├── lib/types/immunizations.ts        # TypeScript interfaces
├── lib/schemas/immunizations.schema.ts  # Zod validation schemas
├── lib/api/immunizations.ts          # API client with parseResponse()
└── app/(dashboard)/immunizations/
    ├── page.tsx                       # Records page (patient-specific)
    └── aefi/
        ├── page.tsx                   # AEFI list
        ├── new/page.tsx              # AEFI create (9 MOH sections)
        └── [id]/page.tsx             # AEFI detail + actions
```

---

## 9. Testing

### Backend Tests

```bash
# Run all immunization tests
cd backend && poetry run pytest tests/immunizations/ -v --no-cov

# Specific test files
poetry run pytest tests/immunizations/test_immunization_scheduling.py -v   # 6 tests
poetry run pytest tests/immunizations/test_immunization_billing.py -v      # 10 tests
poetry run pytest tests/immunizations/test_aefi_moh_compliance.py -v       # 10 tests
```

### Key Test Coverage

| Area | Tests | What's Covered |
|------|-------|----------------|
| Schedule generation | 6 | KEPI schedule, duplicate prevention, batch creation |
| Appointment integration | 6 | Facility-scoped resource lookup, appointment creation, cross-tenant isolation |
| Billing integration | 10 | billing_service FK priority, base_fee fallback, idempotency, signal triggers |
| AEFI MOH compliance | 10 | Create/follow-up workflow, multi-select event types, submit to authorities, severe → surveillance alert |

### Frontend

```bash
cd web-app && npx tsc --noEmit  # Type-check (should be zero errors)
```

---

## 10. Troubleshooting

### "No immunization clinic resource found"

The `create_vaccination_appointment()` service requires an active `Resource` with `code="IMM-CLINIC"` at the patient's facility. Create one:

```python
Resource.objects.create(
    name="Immunization Clinic",
    code="IMM-CLINIC",
    resource_type="PLACE",
    is_active=True,
    facility=facility,
    organization=facility.organization,
)
```

### Vaccines not auto-billing

Check the resolution order:
1. `VaccineDefinition.billing_service` FK is set and active?
2. `Service.code` matches `VaccineDefinition.code`?
3. `Service` in `IMM` category matches vaccine name?
4. `VaccineDefinition.base_fee` is set?

If none match, the billing agent logs a warning.

### KEPI schedule not generating

Ensure `VaccineDefinition` records exist with `program="KEPI"` and `is_active=True`. Seed them:

```bash
cd backend && poetry run python manage.py seed_vaccines
```

### AEFI severe alert not creating surveillance case

The signal only fires for `severity="SEVERE"` or `outcome="DEATH"`. It also requires:
- `NotifiableDisease` named "AEFI - Severe" to exist (auto-created on first trigger)
- The `immunization_record.encounter` to be set (surveillance `NotifiableCase` requires encounter)
