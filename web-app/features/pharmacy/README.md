# Pharmacy Module - Gherkin Feature Files

This directory contains Behavior-Driven Development (BDD) feature files for the Vitora HMIS Pharmacy Module, implementing drug inventory management, prescription processing, dispensing workflows, and stock alerts for Kenya's healthcare context.

## Feature Files

| File | Description | Scenarios |
|------|-------------|-----------|
| [drug-catalog.feature](./drug-catalog.feature) | Drug catalog management with KEML support | ~45 |
| [stock-inventory.feature](./stock-inventory.feature) | Stock batch tracking and FEFO management | ~50 |
| [prescription.feature](./prescription.feature) | Prescription creation, validation, and queue | ~55 |
| [dispensing.feature](./dispensing.feature) | Drug dispensing workflow and returns | ~55 |
| [stock-alerts.feature](./stock-alerts.feature) | Low stock, expiry, and recall alerts | ~45 |
| [pharmacy-reports.feature](./pharmacy-reports.feature) | Inventory, dispensing, and financial reports | ~40 |

**Total Scenarios**: ~290

## Drug Schedules

Kenya pharmaceutical schedules supported:

| Schedule | Code | Description | Requires Prescription | Requires Verification |
|----------|------|-------------|----------------------|----------------------|
| Over The Counter | OTC | Can be sold without pharmacist | No | No |
| Pharmacy Only | P | Requires pharmacist supervision | No | No |
| Prescription Only | POM | Requires valid prescription | Yes | No |
| Controlled Drug | CD | Restricted substances | Yes | Yes (dual) |

## FEFO (First Expiry First Out)

The pharmacy module enforces FEFO ordering for all dispensing:

1. Batches ordered by expiry date (earliest first)
2. Expired batches automatically excluded
3. Quarantined/recalled batches blocked
4. Multi-batch dispensing when single batch insufficient

## KEML Integration

Support for Kenya Essential Medicines List (KEML):

- KEML codes on all essential drugs
- KEML availability reporting
- NHIF/SHA code mapping for claims
- Essential medicines prioritization

## Tags Reference

### Feature Tags
- `@pharmacy` - All pharmacy-related scenarios
- `@drug-catalog` - Drug catalog management
- `@stock` / `@inventory` - Stock management
- `@prescription` - Prescription workflows
- `@dispensing` - Dispensing operations
- `@alerts` - Stock alerts
- `@reports` - Reporting and analytics

### Priority Tags
- `@smoke` - Critical path scenarios (run first)
- `@controlled` - Controlled drug scenarios
- `@keml` - Kenya Essential Medicines List

### Functional Tags
- `@fefo` - First Expiry First Out logic
- `@otc` - Over-the-counter dispensing
- `@returns` - Medication returns
- `@recall` - Product recall handling
- `@allergy` - Allergy checking
- `@interaction` - Drug interaction checking

### Quality Tags
- `@offline` - Offline functionality
- `@sync` - Data synchronization
- `@validation` - Input validation
- `@permissions` - Permission/authorization tests
- `@audit` - Audit trail scenarios

## Running Tests

### Using Playwright with Cucumber

```bash
# Install dependencies
npm install

# Run all pharmacy feature tests
npm run test:e2e -- --grep "@pharmacy"

# Run only smoke tests
npm run test:e2e -- --grep "@pharmacy @smoke"

# Run specific feature file
npm run test:e2e -- features/pharmacy/dispensing.feature

# Run scenarios with specific tag
npm run test:e2e -- --grep "@fefo"

# Run controlled drug scenarios
npm run test:e2e -- --grep "@controlled"
```

### Using Jest with jest-cucumber

```bash
# Run component tests with Gherkin
npm run test -- --testPathPattern="pharmacy"
```

## Mapping to Components

| Feature | Component Path |
|---------|---------------|
| drug-catalog | `components/pharmacy/DrugCatalog.tsx` |
| stock-inventory | `components/pharmacy/StockInventory.tsx` |
| prescription | `components/pharmacy/PrescriptionForm.tsx` |
| dispensing | `components/pharmacy/DispensingScreen.tsx` |
| stock-alerts | `components/pharmacy/StockAlertsPanel.tsx` |
| pharmacy-reports | `app/(dashboard)/reports/pharmacy/page.tsx` |

## Mapping to Backend API

| Feature | API Endpoints |
|---------|--------------|
| Drug Catalog | `GET/POST/PATCH /api/pharmacy/drugs/` |
| Stock Batches | `GET/POST/PATCH /api/pharmacy/stock/` |
| Stock Receive | `POST /api/pharmacy/stock/receive/` |
| Prescriptions | `GET/POST/PATCH /api/prescriptions/` |
| Dispensing | `GET/POST /api/dispensings/` |
| Returns | `POST /api/dispensings/{id}/return/` |
| Alerts | `GET/POST /api/pharmacy/alerts/` |
| Reports | `GET /api/pharmacy/reports/*` |

## Stock Alert Types

| Alert Type | Severity Levels | Description |
|------------|-----------------|-------------|
| LOW_STOCK | MEDIUM, HIGH, CRITICAL | Stock below reorder level |
| OUT_OF_STOCK | CRITICAL | Zero available stock |
| EXPIRING_SOON | LOW, MEDIUM, HIGH, CRITICAL | Within 90/60/30/14 days |
| EXPIRED | CRITICAL | Past expiry date |
| RECALLED | CRITICAL | Manufacturer recall |

## Prescription States

```
PENDING ─────┬──────► DISPENSED (all items filled)
             │
             ├──────► PARTIAL (some items filled)
             │
             ├──────► CANCELLED (cancelled by prescriber)
             │
             └──────► EXPIRED (validity period passed)
```

## Dispensing Workflow

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│ Prescription│────►│   Select    │────►│   FEFO      │
│   Queue     │     │   Items     │     │   Batches   │
└─────────────┘     └─────────────┘     └─────────────┘
                                               │
                                               ▼
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Print     │◄────│  Patient    │◄────│   Verify    │
│   Labels    │     │  Counseling │     │  (if CD)    │
└─────────────┘     └─────────────┘     └─────────────┘
                                               │
                                               ▼
                                        ┌─────────────┐
                                        │  Complete   │
                                        │  & Billing  │
                                        └─────────────┘
```

## Controlled Drug Requirements

For Schedule CD (Controlled Drugs):

1. **Prescription Requirements**:
   - Patient ID number mandatory
   - Quantity in words
   - Diagnosis/indication
   - Maximum duration limits

2. **Dispensing Requirements**:
   - Dual pharmacist verification
   - Verifying pharmacist ≠ dispensing pharmacist
   - Register entry with running balance
   - Enhanced audit trail

3. **Reporting**:
   - Controlled drug register (monthly)
   - Balance reconciliation
   - Variance explanations

## Offline Capabilities

The pharmacy module supports offline operation:

| Function | Offline Support |
|----------|-----------------|
| View drug catalog | ✅ Cached |
| View stock levels | ✅ Cached |
| Dispense medications | ✅ Local storage |
| Receive stock | ✅ Local storage |
| View alerts | ✅ Cached |
| Create prescriptions | ✅ Local storage |

All offline operations sync when connectivity is restored.

## Compliance Requirements

### Kenya Data Protection Act 2019
- 7-year retention for pharmacy records
- Audit trail on all dispensing
- Patient consent for data processing

### Pharmacy & Poisons Board
- Controlled drug register maintenance
- Pharmacist verification records
- Stock reconciliation documentation

### NHIF/SHA Integration
- NHIF/SHA drug codes supported
- Claims-compatible dispensing records
- Eligibility verification integration

## Document Information

| Field | Value |
|-------|-------|
| **Version** | 1.0 |
| **Created** | January 7, 2026 |
| **Last Updated** | January 7, 2026 |
| **Sprint** | 1.3-1.4 Track A |
| **Status** | ✅ Complete |

## Related Documentation

- [Sprint 1.3-1.4 Track A Deliverables](../../../docs/sprint-1.3-1.4-track-a-pharmacy-deliverables.md)
- [Pharmacy Implementation Status](../../../backend/PHARMACY_IMPLEMENTATION_STATUS.md)
- [Ideal Patient Flow - Pharmacy Section](../../../docs/ideal-patient-flow.md#6-pharmacy-workflow)
- [User Stories - Pharmacist Role](../../../docs/user-stories.md)
