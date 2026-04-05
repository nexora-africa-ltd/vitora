# Immunizations Module — Single Source of Truth

> **Last Updated**: April 5, 2026
> **Backend App**: `hmis.apps.immunizations`
> **Frontend Route**: `/immunizations/*`

---

## Overview

Facility-wide immunization management supporting KEPI (Kenya Expanded Programme on Immunization) for children, adult routine vaccines, mass campaigns, occupational/travel vaccines, AEFI reporting, batch-level stock tracking, cold chain monitoring, and incident reporting.

Replaces the MCH-only vaccine models with a standalone module that serves all departments.

---

## Backend

### Models

#### Enums

| Enum | Values |
|------|--------|
| `TargetPopulation` | `INFANT`, `CHILD`, `ADOLESCENT`, `ADULT`, `ALL` |
| `VaccineProgram` | `KEPI`, `ROUTINE`, `CAMPAIGN`, `OCCUPATIONAL`, `TRAVEL`, `CATCH_UP` |
| `VaccineRoute` | `ORAL`, `IM`, `SC`, `ID` |
| `ImmunizationStatus` | `SCHEDULED`, `ADMINISTERED`, `MISSED`, `CONTRAINDICATED`, `DEFERRED` |
| `AdministrationSite` | `LEFT_ARM`, `RIGHT_ARM`, `LEFT_THIGH`, `RIGHT_THIGH`, `ORAL` |
| `CampaignStatus` | `PLANNED`, `ACTIVE`, `COMPLETED`, `CANCELLED` |
| `AEFIEventType` | `LOCAL_REACTION`, `SYSTEMIC_REACTION`, `SEVERE`, `DEATH` |
| `AEFISeverity` | `MILD`, `MODERATE`, `SEVERE` |
| `AEFIOutcome` | `RECOVERED`, `RECOVERING`, `NOT_RECOVERED`, `SEQUELAE`, `DEATH`, `UNKNOWN` |
| `StockTransactionType` | `RECEIVE`, `ISSUE`, `WASTAGE`, `ADJUSTMENT`, `TRANSFER_IN`, `TRANSFER_OUT`, `EXPIRED` |
| `ColdChainEquipmentType` | `FRIDGE`, `FREEZER`, `COLD_BOX`, `VACCINE_CARRIER`, `COLD_ROOM` |
| `ColdChainEquipmentStatus` | `OPERATIONAL`, `FAULTY`, `DECOMMISSIONED`, `UNDER_REPAIR` |
| `IncidentType` | `POWER_OUTAGE`, `COLD_CHAIN_BREAK`, `EQUIPMENT_FAILURE`, `STOCK_DAMAGE`, `THEFT`, `EXPIRED_STOCK`, `OTHER` |
| `IncidentSeverity` | `LOW`, `MEDIUM`, `HIGH`, `CRITICAL` |
| `IncidentStatus` | `OPEN`, `INVESTIGATING`, `RESOLVED`, `CLOSED` |

---

#### VaccineDefinition (reference data)

| Field | Type | Notes |
|-------|------|-------|
| `code` | CharField(30) | **Unique.** e.g. `BCG`, `PENTA1`, `COVID19_PF` |
| `name` | CharField(200) | Full vaccine name |
| `description` | TextField | Optional |
| `disease_target` | CharField(200) | Disease(s) targeted |
| `standard_age_days` | PositiveInt | Age in days from birth (KEPI only) |
| `route` | CharField(5) | `VaccineRoute` choices |
| `dose_number` | PositiveSmallInt | Dose number in series (1-indexed) |
| `total_doses` | PositiveSmallInt | Total doses in series |
| `series_name` | CharField(50) | Series grouping (e.g. "Pentavalent") |
| `interval_days` | PositiveInt | Min days between doses |
| `target_population` | CharField(20) | `TargetPopulation` choices |
| `program` | CharField(20) | `VaccineProgram` choices |
| `min_age_days` | PositiveInt | Min eligibility age (0 = none) |
| `max_age_days` | PositiveInt | Max eligibility age (0 = none) |
| `is_active` | Boolean | Active flag |

**Ordering**: `standard_age_days`, `code`

---

#### ImmunizationRecord

| Field | Type | Notes |
|-------|------|-------|
| `patient` | FK → Patient | `PROTECT`, related: `immunization_records` |
| `vaccine` | FK → VaccineDefinition | `PROTECT` |
| `scheduled_date` | DateField | Required |
| `administered_date` | DateField | Nullable — set on administration |
| `status` | CharField(20) | `ImmunizationStatus`, default `SCHEDULED` |
| `dose_number` | PositiveSmallInt | Default 1 |
| `batch_number` | CharField(50) | Filled on administration |
| `lot_number` | CharField(50) | Optional |
| `expiry_date` | DateField | Nullable |
| `site` | CharField(20) | `AdministrationSite` |
| `administered_by` | FK → User | Nullable, `SET_NULL` |
| `next_dose_date` | DateField | Nullable |
| `encounter` | FK → Encounter | Nullable, optional link |
| `campaign` | FK → VaccineCampaign | Nullable, optional link |
| `notes` | TextField | Optional |

**Unique constraint**: `(patient, vaccine, dose_number)`
**Ordering**: `patient`, `scheduled_date`
**History**: `simple_history` enabled

**Computed properties**:
- `is_overdue: bool` — Scheduled and past date
- `days_overdue: int | None` — Days past scheduled date

---

#### VaccineCampaign

| Field | Type | Notes |
|-------|------|-------|
| `name` | CharField(200) | Campaign name |
| `description` | TextField | Optional |
| `start_date` | DateField | Required |
| `end_date` | DateField | Required |
| `target_population` | CharField(20) | `TargetPopulation`, default `ALL` |
| `vaccines` | M2M → VaccineDefinition | Vaccines in campaign |
| `status` | CharField(20) | `CampaignStatus`, default `PLANNED` |
| `target_count` | PositiveInt | Target vaccinations |

**Ordering**: `-start_date`

**Computed properties**:
- `is_running: bool` — Status is `ACTIVE` and within date range

---

#### AEFI

| Field | Type | Notes |
|-------|------|-------|
| `immunization_record` | FK → ImmunizationRecord | `PROTECT` |
| `event_date` | DateField | Default `today` |
| `event_type` | CharField(30) | `AEFIEventType` |
| `severity` | CharField(10) | `AEFISeverity` |
| `description` | TextField | Required |
| `outcome` | CharField(20) | `AEFIOutcome`, default `UNKNOWN` |
| `reported_to_authorities` | Boolean | Default False |
| `report_date` | DateField | Nullable |
| `investigated_by` | FK → User | Nullable |
| `investigation_notes` | TextField | Optional |

**Ordering**: `-event_date`
**History**: `simple_history` enabled

---

#### VaccineStock

| Field | Type | Notes |
|-------|------|-------|
| `vaccine` | FK → VaccineDefinition | `PROTECT` |
| `batch_number` | CharField(50) | Required |
| `quantity_received` | PositiveInt | Original quantity |
| `quantity_on_hand` | PositiveInt | Current available |
| `expiry_date` | DateField | Required |
| `manufacturer` | CharField(200) | Optional |
| `supplier` | CharField(200) | Optional |
| `received_date` | DateField | Required |
| `received_by` | FK → User | Nullable |
| `storage_location` | CharField(100) | Optional |
| `vvm_status` | CharField(20) | VVM stage (1-4) |
| `min_stock_level` | PositiveInt | Alert threshold, default 10 |
| `notes` | TextField | Optional |

**Unique constraint**: `(vaccine, batch_number)`
**Ordering**: `expiry_date`

**Computed properties**:
- `is_expired: bool` — Past expiry date
- `is_low_stock: bool` — Qty ≤ min_stock_level
- `is_near_expiry: bool` — Within 30 days of expiry (not yet expired)

---

#### StockTransaction

| Field | Type | Notes |
|-------|------|-------|
| `stock` | FK → VaccineStock | `PROTECT` |
| `transaction_type` | CharField(20) | `StockTransactionType` |
| `quantity` | IntegerField | +ve for additions, -ve for reductions |
| `balance_after` | PositiveInt | Stock balance after txn |
| `reference` | CharField(200) | Optional reference |
| `immunization_record` | FK → ImmunizationRecord | Nullable (for ISSUE) |
| `performed_by` | FK → User | Nullable |
| `reason` | TextField | Wastage/adjustment reason |
| `notes` | TextField | Optional |

**Ordering**: `-created_at`

---

#### ColdChainEquipment

| Field | Type | Notes |
|-------|------|-------|
| `name` | CharField(200) | Equipment label |
| `equipment_type` | CharField(20) | `ColdChainEquipmentType` |
| `model_number` | CharField(100) | Optional |
| `serial_number` | CharField(100) | **Unique, required** |
| `manufacturer` | CharField(200) | Optional |
| `location` | CharField(200) | Physical location |
| `capacity_litres` | Decimal(6,1) | Nullable |
| `min_temp` | Decimal(5,2) | Default 2.0°C |
| `max_temp` | Decimal(5,2) | Default 8.0°C |
| `status` | CharField(20) | `ColdChainEquipmentStatus`, default `OPERATIONAL` |
| `installation_date` | DateField | Nullable |
| `last_maintenance_date` | DateField | Nullable |
| `next_maintenance_date` | DateField | Nullable |
| `power_source` | CharField(100) | e.g. Mains, Solar |
| `has_backup_power` | Boolean | Default False |
| `notes` | TextField | Optional |

**Ordering**: `name`

---

#### TemperatureLog

| Field | Type | Notes |
|-------|------|-------|
| `equipment` | FK → ColdChainEquipment | `CASCADE` |
| `temperature` | Decimal(5,2) | Reading in °C |
| `recorded_at` | DateTimeField | When reading was taken |
| `recorded_by` | FK → User | Nullable, auto-set |
| `is_excursion` | Boolean | **Auto-calculated** on save |
| `action_taken` | TextField | Optional, for excursions |

**Ordering**: `-recorded_at`
**Auto-logic**: `save()` compares temperature against equipment's `min_temp`/`max_temp` to auto-flag excursions.

---

#### VaccineIncident

| Field | Type | Notes |
|-------|------|-------|
| `title` | CharField(200) | Brief description |
| `incident_type` | CharField(30) | `IncidentType` |
| `severity` | CharField(10) | `IncidentSeverity`, default `MEDIUM` |
| `status` | CharField(20) | `IncidentStatus`, default `OPEN` |
| `description` | TextField | Required |
| `occurred_at` | DateTimeField | Required |
| `resolved_at` | DateTimeField | Nullable, set on resolve |
| `duration_minutes` | PositiveInt | Nullable, auto-calculated |
| `affected_equipment` | M2M → ColdChainEquipment | Optional |
| `affected_batches` | M2M → VaccineStock | Optional |
| `doses_affected` | PositiveInt | Estimated affected, default 0 |
| `doses_lost` | PositiveInt | Confirmed lost, default 0 |
| `corrective_actions` | TextField | Optional, filled on resolve |
| `preventive_actions` | TextField | Optional, filled on resolve |
| `reported_by` | FK → User | Auto-set on create |
| `investigated_by` | FK → User | Auto-set on resolve |
| `reported_to_county` | Boolean | Default False |

**Ordering**: `-occurred_at`
**History**: `simple_history` enabled

---

### API Endpoints

Base path: `/api/immunizations/`

#### Vaccine Definitions (read-only)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/vaccines/` | List active vaccines (unpaginated) |
| GET | `/vaccines/{id}/` | Get vaccine detail |

**Filters**: `VaccineDefinitionFilter` (program, target_population, series_name)

---

#### Immunization Records (CRUD + actions)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/records/` | List records (paginated) |
| POST | `/records/` | Create record |
| GET | `/records/{id}/` | Get record detail |
| PATCH | `/records/{id}/` | Update record |
| DELETE | `/records/{id}/` | Delete record |
| POST | `/records/{id}/administer/` | Mark as administered |
| POST | `/records/generate-kepi-schedule/` | Generate KEPI child schedule |
| POST | `/records/generate-adult-schedule/` | Generate adult multi-dose schedule |

**Filters**: `ImmunizationRecordFilter` (patient, vaccine, status, program, campaign)
**Serializer routing**: `list` → ListSerializer, `administer` → AdministerVaccineSerializer, `generate_adult_schedule` → GenerateAdultScheduleSerializer, default → full serializer

**Administer action**: Sets `administered_date`, `batch_number`, `lot_number`, `expiry_date`, `site`, `notes`, `status=ADMINISTERED`, `administered_by=request.user`.

**KEPI schedule**: Body `{ patient: <id> }` → creates all KEPI dose records based on patient DOB.

**Adult schedule**: Body `{ patient: <id>, vaccine: <id>, start_date?: "YYYY-MM-DD" }` → creates multi-dose series.

---

#### Vaccine Campaigns (CRUD)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/campaigns/` | List campaigns (paginated) |
| POST | `/campaigns/` | Create campaign |
| GET | `/campaigns/{id}/` | Get campaign detail |
| PATCH | `/campaigns/{id}/` | Update campaign |
| DELETE | `/campaigns/{id}/` | Delete campaign |

**Filters**: `VaccineCampaignFilter` (status, target_population)

---

#### AEFI Reports (CRUD)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/aefi/` | List AEFI reports (paginated) |
| POST | `/aefi/` | Create AEFI report |
| GET | `/aefi/{id}/` | Get AEFI detail |
| PATCH | `/aefi/{id}/` | Update AEFI |
| DELETE | `/aefi/{id}/` | Delete AEFI |

**Filters**: `AEFIFilter` (event_type, severity, immunization_record)

---

#### Vaccine Stock (CRUD + actions)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/stock/` | List stock batches (paginated) |
| POST | `/stock/` | Receive new stock batch |
| GET | `/stock/{id}/` | Get stock detail |
| PATCH | `/stock/{id}/` | Update stock |
| DELETE | `/stock/{id}/` | Delete stock |
| POST | `/stock/{id}/issue/` | Issue stock (wastage/adjustment/transfer/expired) |
| GET | `/stock/{id}/transactions/` | List transactions for batch |

**Filters**: `VaccineStockFilter` (vaccine, is_expired, is_low_stock)

**Create side-effect**: Auto-creates a `RECEIVE` StockTransaction, sets `received_by=request.user`.

**Issue action**: Body `{ quantity, transaction_type, reason?, notes? }`. Valid types: `WASTAGE`, `ADJUSTMENT`, `TRANSFER_OUT`, `EXPIRED`. Validates quantity ≤ quantity_on_hand.

---

#### Cold Chain Equipment (CRUD + actions)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/cold-chain/` | List equipment (paginated) |
| POST | `/cold-chain/` | Register equipment |
| GET | `/cold-chain/{id}/` | Get equipment detail |
| PATCH | `/cold-chain/{id}/` | Update equipment |
| DELETE | `/cold-chain/{id}/` | Delete equipment |
| GET | `/cold-chain/{id}/temperatures/` | List temperature logs (last 100) |

**Filters**: `ColdChainEquipmentFilter` (equipment_type, status)

---

#### Temperature Logs (CRUD)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/temperature-logs/` | List logs (paginated) |
| POST | `/temperature-logs/` | Create log entry |
| GET | `/temperature-logs/{id}/` | Get log detail |

**Query params**: `equipment` (filter by ID), `excursions_only=true`
**Create side-effect**: `recorded_by` auto-set. `is_excursion` auto-calculated on model save. Excursions generate an audit log entry (`temperature_excursion`).

---

#### Vaccine Incidents (CRUD + resolve action)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/incidents/` | List incidents (paginated) |
| POST | `/incidents/` | Report incident |
| GET | `/incidents/{id}/` | Get incident detail |
| PATCH | `/incidents/{id}/` | Update incident |
| DELETE | `/incidents/{id}/` | Delete incident |
| POST | `/incidents/{id}/resolve/` | Resolve incident |

**Filters**: `VaccineIncidentFilter` (incident_type, severity, status)

**Create side-effect**: `reported_by=request.user`.

**Resolve action**: Body `{ corrective_actions, preventive_actions?, doses_lost? }`. Sets `status=RESOLVED`, `resolved_at=now()`, `investigated_by=request.user`, auto-calculates `duration_minutes`.

---

#### Coverage (functional view)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/coverage/?vaccine_code=BCG&start_date=&end_date=` | Coverage stats |

**Required**: `vaccine_code`. Optional: `start_date`, `end_date` (ISO format).

**Response**:
```json
{
  "vaccine_code": "BCG",
  "total": 150,
  "administered": 120,
  "missed": 10,
  "scheduled": 20,
  "coverage_pct": 80.0
}
```

---

### Audit Log Actions

| Action | Trigger |
|--------|---------|
| `immunization_record_create` | Record created |
| `immunization_administered` | Vaccine administered |
| `vaccine_campaign_create` | Campaign created |
| `aefi_create` | AEFI report created |
| `vaccine_stock_receive` | Stock batch received |
| `vaccine_stock_issue` | Stock issued (wastage/transfer/expired) |
| `cold_chain_equipment_create` | Equipment registered |
| `temperature_excursion` | Temperature log with excursion detected |
| `vaccine_incident_create` | Incident reported |
| `vaccine_incident_resolve` | Incident resolved |

---

### Migrations

| Migration | Description |
|-----------|-------------|
| `0001_initial` | VaccineDefinition, VaccineCampaign, ImmunizationRecord, AEFI |
| `0002_add_stock_coldchain_incidents` | VaccineStock, StockTransaction, ColdChainEquipment, TemperatureLog, VaccineIncident |
| `0003_cold_chain_serial_number_required` | ColdChainEquipment.serial_number: removed blank/default, made required |

---

## Frontend

### File Map

| Layer | File |
|-------|------|
| Types | `web-app/lib/types/immunizations.ts` |
| Zod Schemas | `web-app/lib/schemas/immunizations.schema.ts` |
| API Client | `web-app/lib/api/immunizations.ts` |
| Records page | `web-app/app/(dashboard)/immunizations/page.tsx` |
| Campaigns page | `web-app/app/(dashboard)/immunizations/campaigns/page.tsx` |
| AEFI page | `web-app/app/(dashboard)/immunizations/aefi/page.tsx` |
| Coverage page | `web-app/app/(dashboard)/immunizations/coverage/page.tsx` |
| Stock page | `web-app/app/(dashboard)/immunizations/stock/page.tsx` |
| Cold Chain page | `web-app/app/(dashboard)/immunizations/cold-chain/page.tsx` |
| Incidents page | `web-app/app/(dashboard)/immunizations/incidents/page.tsx` |

---

### API Client Exports

```typescript
import {
  vaccineDefinitionsApi,
  immunizationRecordsApi,
  vaccineCampaignsApi,
  aefiApi,
  coverageApi,
  vaccineStockApi,
  coldChainApi,
  temperatureLogApi,
  incidentApi,
  immunizationsModule,   // combined namespace
} from '@/lib/api/immunizations';
```

All methods use `parseResponse()` with Zod schema validation.

---

### Navigation

Sidebar parent: **Immunizations** (icon: `Syringe`, moduleKey: `immunizations`)

| Label | Route | Action Key |
|-------|-------|------------|
| Records | `/immunizations` | `immunizations.view_records` |
| Campaigns | `/immunizations/campaigns` | `immunizations.manage_campaigns` |
| AEFI Reports | `/immunizations/aefi` | `immunizations.view_records` |
| Stock | `/immunizations/stock` | `immunizations.manage_stock` |
| Cold Chain | `/immunizations/cold-chain` | `immunizations.manage_cold_chain` |
| Incidents | `/immunizations/incidents` | `immunizations.report_incident` |
| Coverage | `/immunizations/coverage` | `immunizations.view_coverage` |

---

### Permissions

**Module access** (Layer 1 — sidebar visibility):

```
immunizations: 'immunizations.view_immunizationrecord'
```

**Action permissions** (Layer 2 — page/button visibility):

| Action Key | Allowed Roles |
|------------|---------------|
| `immunizations.view_records` | NURSE, MIDWIFE, CLINICAL_OFFICER, DOCTOR, PHARMACIST, CHW |
| `immunizations.administer` | NURSE, MIDWIFE, CLINICAL_OFFICER, DOCTOR |
| `immunizations.manage_campaigns` | NURSE, ADMIN, SURVEILLANCE_OFFICER |
| `immunizations.manage_stock` | NURSE, PHARMACIST, PHARMACY_TECH, ADMIN, STORE_KEEPER |
| `immunizations.manage_cold_chain` | NURSE, PHARMACIST, PHARMACY_TECH, ADMIN, STORE_KEEPER |
| `immunizations.report_incident` | NURSE, PHARMACIST, PHARMACY_TECH, ADMIN, STORE_KEEPER, SURVEILLANCE_OFFICER |
| `immunizations.view_coverage` | NURSE, MIDWIFE, CLINICAL_OFFICER, DOCTOR, ADMIN, SURVEILLANCE_OFFICER |

---

### Page Features Summary

| Page | Stats Cards | Filters | Create Dialog | Action Dialog | Table |
|------|-------------|---------|---------------|---------------|-------|
| Records | — | Patient search, status, program | Manual record | Administer, Generate KEPI/Adult Schedule | ResponsiveTable |
| Campaigns | — | Status, population | Create campaign | — | ResponsiveTable |
| AEFI | — | Severity | Report AEFI | — | ResponsiveTable |
| Stock | Total doses, batches, low stock, expired/near-expiry | — | Receive stock | Issue (wastage/transfer/adjust) | ResponsiveTable |
| Cold Chain | Total, operational, faulty, excursions | Status | Add equipment | Log temperature | ResponsiveTable |
| Incidents | Total, open/investigating, critical, doses lost | Status, severity | Report incident | Resolve incident | ResponsiveTable |
| Coverage | — | Vaccine code, date range | — | — | Stats display |

---

### Key Business Rules

1. **KEPI schedule generation** creates all infant dose records from DOB using `VaccineDefinition` reference data (BCG at birth, OPV at 6/10/14 weeks, etc.)
2. **Adult schedule generation** calculates dose dates from a start date using `interval_days` from the VaccineDefinition.
3. **Stock receipt** auto-creates a `RECEIVE` transaction and sets `received_by`.
4. **Stock issue** validates `quantity ≤ quantity_on_hand` before allowing wastage/transfer/expiry.
5. **Temperature excursions** are auto-detected on `TemperatureLog.save()` by comparing against equipment's min/max range.
6. **Incident resolution** auto-calculates `duration_minutes` from `occurred_at` to `resolved_at`.
7. **ColdChainEquipment.serial_number** is required and unique (cannot save blank).
8. **ImmunizationRecord** uniqueness is `(patient, vaccine, dose_number)` — supports multi-dose series.
9. **VaccineStock** uniqueness is `(vaccine, batch_number)` — one record per batch per vaccine.
