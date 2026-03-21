# Billing Module Implementation Plan

**Sprint**: 1.5-1.6 Track A (Core), 1.7+ (SHA/DHA/SHR Compliance)
**Status**: ✅ COMPLETE (All phases delivered)
**Created**: January 2, 2026
**Last Updated**: March 22, 2026
**Completion**: Q1 2026 ✅

---

## Reference Specification

**Base Document**: [`docs/sprint-1.5-1.6-track-a-billing-deliverables.md`](./sprint-1.5-1.6-track-a-billing-deliverables.md)

> **Important**: The code snippets and model definitions in the deliverables specification document serve as the **baseline/reference point** for this implementation. These specifications define the minimum requirements, expected fields, methods, and behaviors.
>
> **Implementation Flexibility**: While adhering to the specification baseline, reasonable improvements and enhancements may be made where opportunities are identified, such as:
> - Additional validation or error handling
> - Performance optimizations (additional indexes, query optimization)
> - Enhanced logging or audit capabilities
> - Improved code organization or documentation
> - Additional helper methods that don't alter core behavior
>
> Any deviations or enhancements from the baseline spec should be documented and justified.

---

## Executive Summary

The Vitora HMIS Billing Module is **fully implemented**, providing end-to-end invoice generation, payment processing (Cash, M-Pesa, Insurance), receipt generation, SHA claims management, DHA integration (Client Registry, Terminology, Practitioner/Facility Search), SHR compliance (IPS bundles, medication workflows), and automated billing orchestration. The module follows strict TDD principles and is designed for Kenya's healthcare billing context.

**Total Tests**: 1,097 (all passing ✅)
**Target Coverage**: ≥85%
**Models**: 14
**ViewSets/APIViews**: 19
**Service Classes**: 12
**Source Lines**: ~15,000 (app code + services)

### Module Capabilities
- ✅ **Phase 1**: Core Billing Models — Service, Invoice, InvoiceItem, Payment, Receipt, CreditNote
- ✅ **Phase 2**: Payment Processing — Cash, M-Pesa STK Push, Insurance, Split Payments
- ✅ **Phase 3**: API Endpoints — Full REST API with 19 ViewSets/APIViews
- ✅ **Phase 4**: Reports, Admin, SHA Stub, Integration Tests
- ✅ **Phase 5**: SHA Claims — Full lifecycle (DRAFT → SUBMITTED → ADJUDICATED → PAID/REJECTED)
- ✅ **Phase 6**: DHA Integration — Client Registry, Terminology, Facility/Practitioner Search
- ✅ **Phase 7**: SHR Compliance — IPS Bundles, Medication Request/Dispense, FHIR profiles
- ✅ **Phase 8**: Billing Agent — Automated billing orchestration with Celery tasks

---

## Implementation Phases

All phases are complete. Below is the final state of each phase.

---

## Phase 1: Core Billing Models ✅ COMPLETE

### Models Implemented (14 total)

| Model | Description | Tests |
|-------|-------------|-------|
| `ServiceCategory` | Fee categories (Lab, Pharmacy, IPD, OPD, etc.) | 12 |
| `Service` | Individual billable services with pricing | — |
| `Invoice` | Patient invoices with auto-numbering (`INV-YYYYMMDD-XXXX`) | 18 |
| `InvoiceItem` | Line items with auto-calculation of `line_total` | 12 |
| `Payment` | Cash, M-Pesa, Insurance payments with split support | 16 |
| `PaymentPoint` | Physical payment collection locations | 5 |
| `Receipt` | Auto-generated receipts with KES amount-to-words | 10 |
| `CreditNote` | Refund/credit with approval workflow | 8 |
| `SHAMember` | SHA membership with PFMS verification | 37 |
| `SHATariff` | SHA tariff schedules by facility level | 30 |
| `SHAClaim` | SHA claim lifecycle (Draft→Submitted→Adjudicated→Paid) | 46 |
| `SHAClaimItem` | Individual claim line items | 28 |
| `SHAClaimAttachment` | Supporting documents for claims | 30 |
| `SHAEligibilityCheck` | Eligibility verification records | 27 |

### Key Design Decisions
- `InvoiceItem.save()` auto-calculates `line_total = quantity × unit_price` and triggers `invoice.calculate_totals()`
- `Invoice.save()` runs `full_clean()` for data integrity
- `SHAClaim.save()` auto-generates `claim_number` and runs validation
- Self-approval prevention on `CreditNote`
- Receipt PDF generation via ReportLab (A5, facility header, line items, KES amount in words)
- 22 database migrations (migration 0022 is a no-op — seed data moved to management command)

---

## Phase 2: Payment Processing ✅ COMPLETE

### Capabilities
- **Cash payments** with receipt auto-generation
- **M-Pesa STK Push** via Daraja API (sandbox + production)
- **Insurance (SHA)** payment tracking
- **Split payments** — multiple payments per invoice with automatic status transitions (PENDING → PARTIAL → PAID)
- **Overpayment prevention** — validation rejects payments exceeding invoice balance
- **Credit notes** with mandatory approval workflow (different user from requester)

### M-Pesa Integration (`services/mpesa.py` — 327 lines)
- STK Push initiation
- Callback processing
- Transaction status queries
- 30 tests covering all M-Pesa flows

---

## Phase 3: API Endpoints ✅ COMPLETE

### ViewSets & APIViews (19 total)

| Endpoint Group | ViewSet/View | Custom Actions |
|---------------|--------------|----------------|
| **Core Billing** | | |
| Services | `ServiceCategoryViewSet`, `ServiceViewSet` | — |
| Invoices | `InvoiceViewSet` | `finalize`, `cancel`, `apply-discount`, `overdue`, `items` |
| Payments | `PaymentViewSet` | Receipt generation |
| Payment Points | `PaymentPointViewSet` | — |
| Credit Notes | `CreditNoteViewSet` | `approve`, `refund` |
| M-Pesa | `MpesaViewSet` | STK push, callback |
| Reports | `ReportViewSet` | Revenue, collection, outstanding summaries |
| **SHA Integration** | | |
| SHA Members | `SHAMemberViewSet` | PFMS verification |
| SHA Tariffs | `SHATariffViewSet` (read-only) | — |
| SHA Claims | `SHAClaimViewSet` | `submit`, `validate`, bulk operations |
| **DHA Integration** | | |
| Terminology | `TerminologySearchView` | ICD-11, LOINC, ICHI, drug search |
| Client Registry | `ClientRegistryView` | Register, search, update patients |
| Facility Search | `FacilitySearchView` | MFL code lookup |
| Practitioner Search | `PractitionerSearchView` | National ID, registration # lookup |
| Eligibility | `EligibilityCheckView`, `DirectEligibilityCheckView` | Real-time SHA eligibility |
| Webhook | `SHAWebhookView` | SHA callback processing |
| Validation | `SHAValidateView` | Pre-submission claim validation |

### API Test Coverage

| Test File | Tests |
|-----------|-------|
| `test_api/test_service_api.py` | 11 |
| `test_api/test_invoice_api.py` | 15 |
| `test_api/test_payment_api.py` | 15 |
| `test_api/test_payment_points_api.py` | 5 |
| `test_api/test_report_api.py` | 13 |
| `test_api/test_sha_api.py` | 99 |
| `test_api/test_client_registry_api.py` | 3 |
| `test_api/test_dha_practitioner_search_api.py` | 3 |

---

## Phase 4: Reports & Admin ✅ COMPLETE

### Financial Reports (`reports.py` — 480 lines)
- Revenue summary by date range, category, payment type
- Collection reports with daily/monthly aggregation
- Outstanding invoice reports with aging analysis
- 10 report tests + 13 report API tests

### Admin Interface (`admin.py` — 399 lines)
- All 14 models registered with colored status badges, fieldsets, `raw_id_fields`
- 11 admin tests

---

## Phase 5: SHA Claims Integration ✅ COMPLETE

### Services
| Service | File | Lines | Description |
|---------|------|-------|-------------|
| `SHAClaimsService` | `services/sha_claims.py` | 1,531 | Full claim lifecycle, FHIR bundle generation, submission |
| `SHAEligibilityService` | `services/sha_eligibility.py` | 584 | Real-time eligibility checks via SHA API |
| `SHAAuthService` | `services/sha_auth.py` | 352 | OAuth2 token management for SHA API |
| `SHAPiiService` | `services/sha_pii.py` | 122 | PII protection for SHA data exchange |

### SHA Compliance Tests

| Test Suite | Tests | Focus |
|------------|-------|-------|
| `test_sha_compliance/test_claims_submission.py` | 15 | End-to-end claim submission |
| `test_sha_compliance/test_configuration.py` | 18 | SHA settings validation |
| `test_sha_compliance/test_eligibility_api.py` | 15 | Eligibility endpoint testing |
| `test_sha_compliance/test_facility_registry.py` | 13 | MFL code validation |
| `test_sha_compliance/test_fhir_bundle_structure.py` | 23 | FHIR R4 bundle compliance |
| `test_sha_compliance/test_health_worker_registry.py` | 12 | Practitioner registry |
| `test_sha_compliance/test_patient_registry.py` | 15 | Client registry compliance |
| `test_sha_compliance/test_pfms_coverage.py` | 14 | PFMS coverage verification |
| `test_sha_pii.py` | 16 | PII encryption/masking |
| `test_sha_stub.py` | 7 | SHA stub fallback |

---

## Phase 6: DHA Integration ✅ COMPLETE

### Services
| Service | File | Lines | Description |
|---------|------|-------|-------------|
| `ClientRegistryService` | `services/client_registry.py` | 792 | Patient registration/search in national registry |
| `DHA Search Service` | `services/dha_search.py` | 908 | Facility, practitioner, intervention search |
| `TerminologyService` | `services/terminology.py` | 1,421 | ICD-11, LOINC, ICHI, drug product search |
| `ICD-11 Local Service` | `services/icd11_local.py` | 236 | Offline ICD-11 fallback |

### DHA Integration Tests

| Test Suite | Tests |
|------------|-------|
| `test_dha_services/test_client_registry_service.py` | 38 |
| `test_dha_services/test_search_service.py` | 23 |
| `test_dha_services/test_terminology_service.py` | 23 |
| `test_icd11_local.py` | 23 |

---

## Phase 7: SHR Compliance ✅ COMPLETE

### FHIR R4 Resource Generation
- **IPS (International Patient Summary)** bundles
- **MedicationRequest** FHIR resources from prescriptions
- **MedicationDispense** FHIR resources from dispensing records
- **Patient** FHIR resources for SHR submission
- **SHA Claim Profiles** — Kenya-specific FHIR profiles
- **Refill calculation** logic for medication workflows

### SHR Compliance Tests

| Test Suite | Tests |
|------------|-------|
| `test_shr_compliance/test_ips_bundle.py` | 30 |
| `test_shr_compliance/test_medication_dispense.py` | 32 |
| `test_shr_compliance/test_medication_request.py` | 31 |
| `test_shr_compliance/test_patient_resource.py` | 26 |
| `test_shr_compliance/test_refill_calculation.py` | 14 |
| `test_shr_compliance/test_sha_profiles.py` | 54 |
| `test_shr_compliance/test_shr_configuration.py` | 22 |

---

## Phase 8: Billing Agent (Automated Orchestration) ✅ COMPLETE

### `BillingAgentService` (`agent.py` — 404 lines)

Event-driven billing automation that reacts to clinical events and runs periodic tasks.

| Trigger | Handler | Effect |
|---------|---------|--------|
| Encounter created | Signal → `create_invoice_for_encounter` | Draft invoice created |
| Admission created | Signal → `handle_admission_created` | Admission fee + first bed night |
| Lab order → ORDERED | Signal → `handle_lab_order_confirmed` | Lab test line items added |
| Discharge created | Signal → `handle_discharge` | Remaining bed nights, finalize invoice, auto SHA claim |
| Midnight (Celery) | `apply_daily_bed_charges` | One bed night per active admission |
| 6 AM daily (Celery) | `flag_overdue_invoices` | PENDING invoices past due → OVERDUE |
| Hourly (Celery) | `submit_pending_sha_claims` | Up to 20 draft SHA claims validated & submitted |

### Billing Agent Tests: 29

### Additional Integration Tests

| Test Suite | Tests |
|------------|-------|
| `test_auto_invoice_signals.py` | 11 |
| `test_encounter_invoice_integration.py` | 13 |
| `test_proforma_invoice.py` | 42 |
| `test_renderers.py` | 14 |

---

## Test Count Summary

### By Category

| Category | Test File(s) | Tests | Status |
|----------|-------------|-------|--------|
| **Core Models** | | **181** | ✅ |
| Service | `test_models/test_service.py` | 12 | ✅ |
| Invoice | `test_models/test_invoice.py` | 18 | ✅ |
| InvoiceItem | `test_models/test_invoice_item.py` | 12 | ✅ |
| Payment | `test_models/test_payment.py` | 16 | ✅ |
| Receipt | `test_models/test_receipt.py` | 10 | ✅ |
| CreditNote | `test_models/test_credit_note.py` | 8 | ✅ |
| SHA Member | `test_models/test_sha_member.py` | 37 | ✅ |
| SHA Tariff | `test_models/test_sha_tariff.py` | 30 | ✅ |
| SHA Claim | `test_models/test_sha_claim.py` | 46 | ✅ |
| SHA Claim Item | `test_models/test_sha_claim_item.py` | 28 | ✅ |
| SHA Claim Attachment | `test_models/test_sha_claim_attachment.py` | 30 | ✅ |
| SHA Eligibility Check | `test_models/test_sha_eligibility_check.py` | 27 | ✅ |
| **API Endpoints** | | **164** | ✅ |
| Service API | `test_api/test_service_api.py` | 11 | ✅ |
| Invoice API | `test_api/test_invoice_api.py` | 15 | ✅ |
| Payment API | `test_api/test_payment_api.py` | 15 | ✅ |
| Payment Points API | `test_api/test_payment_points_api.py` | 5 | ✅ |
| Report API | `test_api/test_report_api.py` | 13 | ✅ |
| SHA API | `test_api/test_sha_api.py` | 99 | ✅ |
| Client Registry API | `test_api/test_client_registry_api.py` | 3 | ✅ |
| Practitioner Search API | `test_api/test_dha_practitioner_search_api.py` | 3 | ✅ |
| **Services** | | **133** | ✅ |
| M-Pesa Service | `test_services/test_mpesa.py` | 30 | ✅ |
| SHA Claims Service | `test_services/test_sha_claims_service.py` | 19 | ✅ |
| SHA Eligibility Service | `test_services/test_sha_eligibility_service.py` | 16 | ✅ |
| Client Registry Service | `test_dha_services/test_client_registry_service.py` | 38 | ✅ |
| Search Service | `test_dha_services/test_search_service.py` | 23 | ✅ |
| Terminology Service | `test_dha_services/test_terminology_service.py` | 23 | ✅ |
| ICD-11 Local | `test_icd11_local.py` | 23 | ✅ |
| **SHA Compliance** | | **125** | ✅ |
| Claims Submission | `test_sha_compliance/test_claims_submission.py` | 15 | ✅ |
| Configuration | `test_sha_compliance/test_configuration.py` | 18 | ✅ |
| Eligibility API | `test_sha_compliance/test_eligibility_api.py` | 15 | ✅ |
| Facility Registry | `test_sha_compliance/test_facility_registry.py` | 13 | ✅ |
| FHIR Bundle Structure | `test_sha_compliance/test_fhir_bundle_structure.py` | 23 | ✅ |
| Health Worker Registry | `test_sha_compliance/test_health_worker_registry.py` | 12 | ✅ |
| Patient Registry | `test_sha_compliance/test_patient_registry.py` | 15 | ✅ |
| PFMS Coverage | `test_sha_compliance/test_pfms_coverage.py` | 14 | ✅ |
| **SHR Compliance** | | **209** | ✅ |
| IPS Bundle | `test_shr_compliance/test_ips_bundle.py` | 30 | ✅ |
| Medication Dispense | `test_shr_compliance/test_medication_dispense.py` | 32 | ✅ |
| Medication Request | `test_shr_compliance/test_medication_request.py` | 31 | ✅ |
| Patient Resource | `test_shr_compliance/test_patient_resource.py` | 26 | ✅ |
| Refill Calculation | `test_shr_compliance/test_refill_calculation.py` | 14 | ✅ |
| SHA Profiles | `test_shr_compliance/test_sha_profiles.py` | 54 | ✅ |
| SHR Configuration | `test_shr_compliance/test_shr_configuration.py` | 22 | ✅ |
| **Integration & Other** | | **285** | ✅ |
| Admin | `test_admin.py` | 11 | ✅ |
| Auto Invoice Signals | `test_auto_invoice_signals.py` | 11 | ✅ |
| Billing Agent | `test_billing_agent.py` | 29 | ✅ |
| Encounter Invoice Integration | `test_encounter_invoice_integration.py` | 13 | ✅ |
| Proforma Invoice | `test_proforma_invoice.py` | 42 | ✅ |
| Renderers | `test_renderers.py` | 14 | ✅ |
| Reports | `test_reports.py` | 10 | ✅ |
| SHA PII | `test_sha_pii.py` | 16 | ✅ |
| SHA Stub | `test_sha_stub.py` | 7 | ✅ |
| **GRAND TOTAL** | | **1,097** | **✅ All passing** |

---

## File Structure

```
backend/hmis/apps/billing/
├── __init__.py
├── admin.py                    # 399 lines — All 14 models registered
├── agent.py                    # 404 lines — BillingAgentService (automated orchestration)
├── apps.py                     # App config with cross-app signal connections
├── filters.py                  # 113 lines — Django-filter classes
├── models.py                   # 2,692 lines — 14 models
├── renderers.py                # PDF/receipt rendering
├── reports.py                  # 480 lines — Financial report generation
├── serializers.py              # 532 lines — Core billing serializers
├── sha_serializers.py          # 459 lines — SHA-specific serializers
├── sha_urls.py                 # SHA/DHA URL routing
├── sha_views.py                # 2,162 lines — SHA/DHA ViewSets & APIViews
├── signals.py                  # 112 lines — Invoice/admission/discharge signals
├── tasks.py                    # 34 lines — Celery tasks (bed charges, overdue, SHA)
├── urls.py                     # Core billing URL routing
├── views.py                    # 968 lines — Core billing ViewSets
├── services/
│   ├── __init__.py             # 71 lines
│   ├── client_registry.py      # 792 lines — Kenya Client Registry integration
│   ├── clinic_billing.py       # 120 lines — Clinic visit billing
│   ├── dha_search.py           # 908 lines — DHA facility/practitioner search
│   ├── icd11_local.py          # 236 lines — Offline ICD-11 fallback
│   ├── mpesa.py                # 327 lines — M-Pesa Daraja API integration
│   ├── sha.py                  # 161 lines — SHA stub (offline fallback, tested by test_sha_stub.py)
│   ├── sha_auth.py             # 352 lines — SHA OAuth2 authentication
│   ├── sha_claims.py           # 1,531 lines — SHA claims lifecycle
│   ├── sha_eligibility.py      # 584 lines — Eligibility verification
│   ├── sha_pii.py              # 122 lines — PII protection
│   └── terminology.py          # 1,421 lines — ICD-11/LOINC/ICHI terminology
├── management/
│   └── commands/
│       └── seed_service_catalog.py  # Seed standard Kenya service categories & services
└── migrations/
    ├── 0001_initial.py
    ├── ...
    ├── 0021_change_imaging_order_on_delete.py
    └── 0022_sample_service_catalog.py  # No-op (seed data moved to management command)
```

```
backend/tests/billing/
├── conftest.py
├── test_admin.py                               # 11 tests
├── test_auto_invoice_signals.py                # 11 tests
├── test_billing_agent.py                       # 29 tests
├── test_encounter_invoice_integration.py       # 13 tests
├── test_icd11_local.py                         # 23 tests
├── test_proforma_invoice.py                    # 42 tests
├── test_renderers.py                           # 14 tests
├── test_reports.py                             # 10 tests
├── test_sha_pii.py                             # 16 tests
├── test_sha_stub.py                            #  7 tests
├── test_api/                                   # 164 tests
│   ├── test_client_registry_api.py             #  3
│   ├── test_dha_practitioner_search_api.py     #  3
│   ├── test_invoice_api.py                     # 15
│   ├── test_payment_api.py                     # 15
│   ├── test_payment_points_api.py              #  5
│   ├── test_report_api.py                      # 13
│   ├── test_service_api.py                     # 11
│   └── test_sha_api.py                         # 99
├── test_dha_services/                          # 84 tests
│   ├── test_client_registry_service.py         # 38
│   ├── test_search_service.py                  # 23
│   └── test_terminology_service.py             # 23
├── test_models/                                # 274 tests
│   ├── test_credit_note.py                     #  8
│   ├── test_invoice.py                         # 18
│   ├── test_invoice_item.py                    # 12
│   ├── test_payment.py                         # 16
│   ├── test_receipt.py                         # 10
│   ├── test_service.py                         # 12
│   ├── test_sha_claim.py                       # 46
│   ├── test_sha_claim_attachment.py            # 30
│   ├── test_sha_claim_item.py                  # 28
│   ├── test_sha_eligibility_check.py           # 27
│   ├── test_sha_member.py                      # 37
│   └── test_sha_tariff.py                      # 30
├── test_services/                              # 65 tests
│   ├── test_mpesa.py                           # 30
│   ├── test_sha_claims_service.py              # 19
│   └── test_sha_eligibility_service.py         # 16
├── test_sha_compliance/                        # 125 tests
│   ├── test_claims_submission.py               # 15
│   ├── test_configuration.py                   # 18
│   ├── test_eligibility_api.py                 # 15
│   ├── test_facility_registry.py               # 13
│   ├── test_fhir_bundle_structure.py           # 23
│   ├── test_health_worker_registry.py          # 12
│   ├── test_patient_registry.py                # 15
│   └── test_pfms_coverage.py                   # 14
└── test_shr_compliance/                        # 209 tests
    ├── test_ips_bundle.py                      # 30
    ├── test_medication_dispense.py             # 32
    ├── test_medication_request.py              # 31
    ├── test_patient_resource.py                # 26
    ├── test_refill_calculation.py              # 14
    ├── test_sha_profiles.py                    # 54
    └── test_shr_configuration.py               # 22
```

---

## Implementation Improvements & Deviations

### Core Billing Enhancements (beyond baseline spec)

1. **Invoice Model**: `full_clean()` in `save()`, `calculate_totals()` handles empty items, discount support (percentage/fixed), proforma invoice support
2. **Service Model**: `clean()` for price validation, prevents negative/zero prices
3. **InvoiceItem Model**: Auto-calculation, links to lab orders and imaging orders, stock allocation tracking
4. **Payment Model**: Overpayment prevention, cancellation guards, split payment with auto status transitions
5. **Credit Note Model**: Self-approval prevention, mandatory approval workflow
6. **Decimal Precision**: `Decimal.quantize(Decimal('0.01'), ROUND_HALF_UP)` for all financial calculations

### SHA/DHA/SHR Enhancements (beyond initial stub)

1. **SHA Claims**: Full lifecycle instead of stub — FHIR R4 bundle generation, batch submission, adjudication tracking, resubmission with version tracking
2. **DHA Integration**: Client Registry (register/search/update), terminology search (ICD-11, LOINC, ICHI), facility/practitioner lookup, offline ICD-11 fallback
3. **SHR Compliance**: IPS bundles, MedicationRequest/MedicationDispense FHIR resources, Kenya-specific SHA profiles, refill calculation
4. **PII Protection**: Encryption/masking for SHA data exchange (Kenya DPA 2019 compliance)
5. **PFMS Coverage**: PFMS verification and coverage tracking for SHA members

### Billing Agent Automation

1. **Signal-driven billing**: Encounter → invoice, Admission → fee + bed, Lab order → line items, Discharge → finalize + SHA claim
2. **Celery beat tasks**: Daily bed charges (midnight), overdue flagging (6 AM), SHA claim submission (hourly)
3. **Idempotent operations**: Safe to re-run, uses `get_or_create` patterns

### Service Catalog Seed Data

Seed data for 14 service categories and 34 billable services is provided via a management command (not a migration) to avoid polluting the test database:

```bash
python manage.py seed_service_catalog            # create missing only
python manage.py seed_service_catalog --force     # overwrite existing
python manage.py seed_service_catalog --dry-run   # preview, no writes
```

### SHA Stub Architecture

`services/sha.py` is an intentional **offline fallback stub**, not dead code. The real implementations live in `sha_claims.py` and `sha_eligibility.py`. The stub is retained for:
- `test_sha_stub.py` (7 tests verifying offline-safe behavior)
- Lightweight fallback when SHA API configuration is unavailable
- No production code imports it directly — real services are used via `sha_claims.py` and `sha_eligibility.py`

---

## Dependencies & Prerequisites

### Internal Dependencies
- ✅ `patients` app — Patient model
- ✅ `encounters` app — Encounter model
- ✅ `pharmacy` app — Drug, Dispensing models (medication billing)
- ✅ `laboratory` app — LabOrder model (lab order billing via signals)
- ✅ `inpatient` app — Admission, Discharge, Ward models (admission billing, bed charges)
- ✅ `clinics` app — Clinic visit billing

### External Dependencies
- ✅ `requests>=2.31.0` — M-Pesa API, SHA API, DHA API calls
- ✅ `reportlab>=4.4.7` — PDF receipt generation
- ✅ `num2words>=0.5.14` — Amount to words conversion
- ✅ `celery` — Background tasks (bed charges, overdue flagging, SHA submission)

---

## Code Quality

- ✅ 1,097 tests passing
- ✅ No linting errors (ruff)
- ✅ No security issues (bandit)
- ✅ Code formatted (black, isort)
- ✅ Audit logging on all CRUD operations
- ✅ JWT authentication on all endpoints
- ✅ PII protection for SHA data exchange
- ✅ Kenya DPA 2019 compliance (7-year audit retention)

---

**Document Status**: ✅ COMPLETE
**Last Updated**: March 22, 2026

