# Billing Module — Comprehensive Documentation

> **Module**: `backend/hmis/apps/billing/` + `web-app/components/billing/`
> **Status**: ✅ Fully Implemented (Sprint 1.5–1.7+, Q1 2026)
> **Tests**: 1,097 passing | **Coverage**: ≥ 85 %
> **Last Updated**: March 22, 2026

---

## Table of Contents

1. [Overview](#1-overview)
2. [Architecture](#2-architecture)
3. [Data Models](#3-data-models)
4. [API Reference](#4-api-reference)
5. [Business Logic & Workflows](#5-business-logic--workflows)
6. [SHA (Social Health Authority) Integration](#6-sha-social-health-authority-integration)
7. [M-Pesa Integration](#7-m-pesa-integration)
8. [Billing Agent (Automation)](#8-billing-agent-automation)
9. [Reports](#9-reports)
10. [Frontend (Web App)](#10-frontend-web-app)
11. [Admin Interface](#11-admin-interface)
12. [Testing](#12-testing)
13. [Configuration](#13-configuration)
14. [Troubleshooting](#14-troubleshooting)

---

## 1. Overview

The Vitora HMIS Billing Module provides **end-to-end financial management** for Kenyan healthcare facilities:

- **Invoice lifecycle** — Draft → Pending → Partial → Paid (with proforma support)
- **Multi-method payments** — Cash, M-Pesa STK Push, Card, Bank Transfer, Insurance, Corporate, Cheque
- **SHA claims** — Full lifecycle from eligibility check through submission, adjudication, and payment
- **DHA integration** — Client Registry, Terminology (ICD-11/LOINC), Facility & Practitioner validation
- **Automated billing** — Event-driven invoice creation, daily bed charges, overdue flagging
- **Financial reporting** — Daily collections, revenue summaries, outstanding balances, service utilization

### Key Numbers

| Metric | Value |
|--------|-------|
| Models | 14 |
| ViewSets / API Views | 19 |
| Service Classes | 12 |
| Celery Tasks | 3 |
| Backend Tests | 1,097 |
| Database Migrations | 22 |

---

## 2. Architecture

### Backend Structure

```
backend/hmis/apps/billing/
├── models.py              # 14 models (see §3)
├── serializers.py         # Core serializers (Service, Invoice, Payment, Receipt, CreditNote)
├── sha_serializers.py     # SHA-specific serializers (Member, Tariff, Claim)
├── views.py               # Core ViewSets (Invoice, Payment, CreditNote, Mpesa, Reports)
├── sha_views.py           # SHA ViewSets (Member, Tariff, Claim, Eligibility, Client Registry)
├── urls.py                # Router + custom URL patterns
├── filters.py             # Case-insensitive FilterSets
├── reports.py             # BillingReportService (daily, revenue, outstanding)
├── agent.py               # BillingAgentService (automation orchestrator)
├── tasks.py               # Celery tasks (bed charges, overdue, SHA submission)
├── signals.py             # Django signals (encounter → auto-invoice, discharge → finalize)
├── renderers.py           # Custom DRF renderers (PDF receipt)
├── admin.py               # Django admin configuration
├── services/
│   ├── mpesa.py           # Safaricom M-Pesa Daraja API
│   ├── sha.py             # SHA API base client
│   ├── sha_auth.py        # SHA JWT authentication
│   ├── sha_claims.py      # SHA claim creation & submission
│   ├── sha_eligibility.py # SHA eligibility checks
│   ├── sha_pii.py         # PII masking for SHA data
│   ├── client_registry.py # Kenya National Client Registry
│   ├── terminology.py     # ICD-11, LOINC, KES Drug terminology
│   ├── dha_search.py      # DHA practitioner/facility search
│   ├── icd11_local.py     # Local ICD-11 search fallback
│   └── clinic_billing.py  # Clinic-based billing integration
└── management/commands/
    └── seed_service_catalog.py  # Seed billable services
```

### Frontend Structure

```
web-app/
├── app/(dashboard)/billing/
│   ├── page.tsx                      # Billing dashboard
│   ├── loading.tsx                   # Loading skeleton
│   ├── invoices/
│   │   ├── [id]/page.tsx            # Invoice detail
│   │   └── new/page.tsx             # Create invoice
│   ├── receipts/[id]/page.tsx       # Receipt view
│   └── sha-claims/
│       ├── page.tsx                  # SHA claims list
│       ├── loading.tsx
│       └── [id]/page.tsx            # SHA claim detail
├── components/billing/
│   ├── BillingDashboard.tsx          # KPI stats + overview
│   ├── InvoiceList.tsx               # Invoice list with filters
│   ├── InvoiceDetail.tsx             # Full invoice view + actions
│   ├── InvoiceForm.tsx               # Invoice creation form
│   ├── PaymentForm.tsx               # Multi-method payment form
│   ├── PaymentList.tsx               # Payment history
│   ├── ReceivePaymentModal.tsx       # Payment recording dialog
│   ├── MpesaPaymentDialog.tsx        # M-Pesa STK Push tracker
│   ├── ServiceSelector.tsx           # Searchable service dropdown
│   ├── AddInvoiceItemDialog.tsx      # Add line items
│   ├── ApplyDiscountDialog.tsx       # Discount application
│   ├── CreditNoteForm.tsx            # Credit note creation
│   ├── ReceiptView.tsx               # Receipt display
│   ├── ReceiptDialog.tsx             # Receipt in dialog
│   ├── DailyCollectionReport.tsx     # Daily collection view
│   ├── ProformaConvertDialog.tsx     # Proforma → Invoice conversion
│   ├── ProformaRenewDialog.tsx       # Proforma renewal
│   ├── SHAClaimForm.tsx              # SHA claim submission form
│   └── sha/
│       ├── EligibilityBanner.tsx     # SHA eligibility status
│       ├── SHAVerificationModal.tsx  # SHA member verification
│       ├── SHAInterventionSelect.tsx # SHA intervention picker
│       ├── ClientRegistryLookup.tsx  # National client registry
│       ├── ClaimComponents.tsx       # Claim UI components
│       ├── ClaimItemsTable.tsx       # Claim items management
│       ├── DependentsView.tsx        # SHA dependents
│       ├── FacilityValidation.tsx    # Facility MFL validation
│       └── PFMSToggle.tsx            # PFMS eligibility toggle
├── lib/types/billing.ts              # TypeScript input/request types
├── lib/schemas/billing.schema.ts     # Zod validation schemas
└── lib/api/billing.ts                # API client (billingApi)
```

---

## 3. Data Models

### 3.1 ServiceCategory

Categories for grouping billable services.

| Field | Type | Notes |
|-------|------|-------|
| `id` | BigAutoField | PK |
| `name` | CharField(100) | Unique |
| `code` | CharField(20) | Unique, e.g. `"CONS"`, `"LAB"`, `"PHARM"`, `"IPD"` |
| `description` | TextField | Optional |
| `is_active` | BooleanField | Default `True` |
| `display_order` | IntegerField | For UI sorting |

### 3.2 Service

Master catalog of billable items.

| Field | Type | Notes |
|-------|------|-------|
| `id` | BigAutoField | PK |
| `category` | FK → ServiceCategory | `PROTECT` |
| `code` | CharField(20) | Unique, e.g. `"CONS-001"`, `"LAB-CBC"` |
| `name` | CharField(200) | |
| `description` | TextField | Optional |
| `unit_price` | Decimal(10,2) | Must be > 0 |
| `currency` | CharField(3) | Default `"KES"` |
| `sha_code` | CharField(20) | SHA tariff mapping |
| `icd10_code` | CharField(10) | For procedure billing |
| `is_active` | BooleanField | Soft-delete via `is_active=False` |
| `requires_quantity` | BooleanField | True for consumables |
| `is_taxable` | BooleanField | Medical services typically exempt |
| `created_by` | FK → User | `PROTECT` |

**Key Methods:**
- `calculate_line_total(quantity)` → `unit_price × quantity`
- `is_available()` → returns `is_active`
- `get_display_name()` → `"{category} - {name}"`

### 3.3 Invoice

Core billing entity. Auto-numbers as `INV-YYYYMMDD-XXXX` (or `PRO-YYYYMMDD-XXXX` for proformas).

| Field | Type | Notes |
|-------|------|-------|
| `id` | BigAutoField | PK |
| `invoice_number` | CharField(50) | Unique, auto-generated, not editable |
| `patient` | FK → Patient | `PROTECT` |
| `encounter` | FK → Encounter | `PROTECT`, nullable |
| `clinic_visit` | FK → ClinicVisit | `SET_NULL`, nullable |
| `status` | CharField(20) | TextChoices (see below) |
| `payment_type` | CharField(20) | TextChoices (see below) |
| `invoice_date` | DateField | Default `today()` |
| `due_date` | DateField | Auto-set from `BILLING_DEFAULT_DUE_DAYS` |
| `subtotal` | Decimal(12,2) | Sum of line items |
| `discount_type` | CharField(12) | `"percentage"` or `"fixed"` |
| `discount_value` | Decimal(12,2) | Percentage (0–100) or fixed KES amount |
| `discount_amount` | Decimal(12,2) | Computed KES amount |
| `discount_reason` | CharField(200) | |
| `tax_amount` | Decimal(12,2) | |
| `total_amount` | Decimal(12,2) | `subtotal - discount + tax` |
| `amount_paid` | Decimal(12,2) | Running total of payments |
| `balance_due` | Decimal(12,2) | `total - paid` |
| `insurance_provider` | CharField(100) | |
| `insurance_member_no` | CharField(50) | |
| `insurance_coverage` | Decimal(5,2) | Percentage (0–100) |
| `insurance_amount` | Decimal(12,2) | |
| `sha_claim_number` | CharField(50) | |
| `notes` | TextField | Patient-visible |
| `internal_notes` | TextField | Staff-only |
| `valid_until` | DateField | Proforma expiry (default 30 days) |
| `is_converted` | BooleanField | Proforma fully converted? |
| `converted_at` | DateTimeField | When converted |
| `converted_from_proforma` | FK → self | Source proforma |
| `renewed_to` | FK → self | New proforma after renewal |
| `is_voided` | BooleanField | |
| `voided_at` | DateTimeField | |
| `voided_by` | FK → User | |
| `void_reason` | TextField | |
| `cancelled_by` | FK → User | |
| `cancelled_at` | DateTimeField | |
| `cancellation_reason` | TextField | |
| `created_by` | FK → User | Auto-set in view/signal |

#### Invoice Status Enum

| Value | Label | Description |
|-------|-------|-------------|
| `proforma` | Proforma Invoice | Quote/estimate, cannot accept payments directly |
| `draft` | Draft | Editable, items can be added/removed |
| `pending` | Pending Payment | Finalized, awaiting payment |
| `partial` | Partially Paid | Some payments recorded |
| `paid` | Paid | Fully paid (`balance_due = 0`) |
| `overdue` | Overdue | Past due date + grace period |
| `cancelled` | Cancelled | Voided with reason |
| `written_off` | Written Off | Bad debt |

#### Invoice Payment Type Enum

| Value | Label |
|-------|-------|
| `cash` | Cash |
| `mpesa` | M-Pesa |
| `insurance` | Insurance |
| `corporate` | Corporate Account |
| `mixed` | Mixed Payment |

**Key Methods:**
- `calculate_totals()` — Recomputes subtotal, discount_amount, total_amount, balance_due from items
- `apply_discount(amount, reason, discount_type?, discount_value?)` — Apply percentage or fixed discount
- `record_payment(amount)` — Update amount_paid, status transitions
- `cancel(user, reason)` — Set cancelled status (rejects if already paid)
- `finalize()` — Draft → Pending (requires ≥ 1 item)
- `mark_overdue()` — Pending → Overdue if past grace period
- `void(voided_by, reason)` — Void the invoice
- `convert_to_invoice(user, item_ids?)` — Proforma → Invoice (full or partial)
- `renew(user, validity_days?)` — Renew expired proforma
- `can_be_edited()` — True if Draft or Proforma
- `is_overdue()` — True if past due and not paid/cancelled

**Properties:**
- `is_valid` — True if proforma is not expired
- `days_until_expiry` — Days remaining for proforma validity
- `can_convert` — True if proforma can be converted

### 3.4 InvoiceItem

Line items on invoices.

| Field | Type | Notes |
|-------|------|-------|
| `id` | BigAutoField | PK |
| `invoice` | FK → Invoice | `CASCADE` |
| `item_type` | CharField(20) | `service`, `pharmacy`, `lab`, `imaging`, `consumable`, `other` |
| `service` | FK → Service | Nullable |
| `drug` | FK → Drug | Nullable (pharmacy items) |
| `dispensing` | FK → Dispensing | Nullable |
| `lab_order` | FK → LabOrder | Nullable |
| `imaging_order` | FK → ImagingOrder | Nullable |
| `description` | CharField(300) | |
| `quantity` | Decimal(10,2) | Default 1.00 |
| `unit_price` | Decimal(10,2) | Must be > 0 |
| `line_total` | Decimal(12,2) | Auto-calculated |
| `discount_amount` | Decimal(10,2) | Item-level discount |
| `discount_reason` | CharField(200) | |
| `sha_code` | CharField(20) | For SHA claims |
| `is_covered_by_insurance` | BooleanField | |
| `insurance_approved_amount` | Decimal(10,2) | |
| `stock_batch` | FK → StockBatch | For pharmacy stock tracking |
| `stock_allocated` | Decimal(10,2) | Quantity from stock batch |
| `is_converted` | BooleanField | Proforma conversion tracking |
| `converted_at` | DateTimeField | |
| `converted_from_item` | FK → self | |

**Key Behavior:**
- `save()` auto-calculates `line_total = (quantity × unit_price) - discount_amount`
- After save, triggers `invoice.calculate_totals()` to update parent
- `delete()` also triggers `invoice.calculate_totals()`
- Stock validation is deferred to the Dispensing model (not at billing time)

### 3.5 Payment

Payment records against invoices.

| Field | Type | Notes |
|-------|------|-------|
| `id` | BigAutoField | PK |
| `payment_reference` | CharField(100) | Unique, auto-generated: `PAY-YYYYMMDD-XXXX` |
| `invoice` | FK → Invoice | `PROTECT` |
| `payment_point` | FK → PaymentPoint | Nullable |
| `method` | CharField(20) | TextChoices (see below) |
| `amount` | Decimal(12,2) | Must be > 0 |
| `currency` | CharField(3) | Default `"KES"` |
| `status` | CharField(20) | `pending`, `completed`, `failed`, `reversed`, `refunded` |
| `payment_details` | JSONField | Method-specific data |
| `mpesa_receipt_number` | CharField(50) | M-Pesa receipt |
| `mpesa_transaction_id` | CharField(50) | M-Pesa checkout request ID |
| `mpesa_phone` | CharField(15) | M-Pesa phone number |
| `payment_date` | DateTimeField | Default `now()` |
| `processed_at` | DateTimeField | When completed |
| `notes` | TextField | |
| `failure_reason` | TextField | |
| `received_by` | FK → User | Auto-set from request user |

#### Payment Method Enum

| Value | Label |
|-------|-------|
| `cash` | Cash |
| `mpesa` | M-Pesa |
| `card` | Card |
| `bank_transfer` | Bank Transfer |
| `insurance` | Insurance Claim |
| `corporate` | Corporate Account |
| `cheque` | Cheque |

#### Payment Status Enum

| Value | Label |
|-------|-------|
| `pending` | Pending |
| `completed` | Completed |
| `failed` | Failed |
| `reversed` | Reversed |
| `refunded` | Refunded |

**Key Methods:**
- `process()` — Mark completed, update invoice via `record_payment()`
- `reverse(reason)` — Reverse completed payment, adjust invoice amounts/status
- `refund(amount, reason)` — Process refund
- `is_mpesa()` — Check if M-Pesa payment

**Validation Rules:**
- Amount must be > 0
- Amount must not exceed invoice `balance_due`
- Cannot pay cancelled invoices
- Cannot pay proforma invoices (convert first)
- Payment point method must match payment method

### 3.6 PaymentPoint

Physical or virtual payment collection points.

| Field | Type | Notes |
|-------|------|-------|
| `id` | BigAutoField | PK |
| `name` | CharField(120) | e.g. "Main Cashier" |
| `code` | CharField(50) | Unique, e.g. `"CASH-01"`, `"MPESA-02"` |
| `method` | CharField(20) | Must match Payment.Method |
| `till_number` | CharField(30) | M-Pesa Buy Goods |
| `paybill_number` | CharField(30) | M-Pesa PayBill |
| `paybill_account_number` | CharField(60) | PayBill account |
| `bank_name` | CharField(120) | |
| `bank_account_name` | CharField(120) | |
| `bank_account_number` | CharField(60) | |
| `bank_branch` | CharField(120) | |
| `is_active` | BooleanField | |
| `notes` | TextField | |
| `created_by` | FK → User | |

**Validation:**
- M-Pesa points require `till_number` or `paybill_number`
- Bank transfer points require `bank_account_number`

### 3.7 Receipt

Official payment receipts with PDF generation.

| Field | Type | Notes |
|-------|------|-------|
| `id` | BigAutoField | PK |
| `receipt_number` | CharField(50) | Unique, auto: `RCP-YYYYMMDD-XXXX` |
| `payment` | OneToOne → Payment | `PROTECT` |
| `invoice` | FK → Invoice | `PROTECT` |
| `patient` | FK → Patient | `PROTECT` |
| `receipt_date` | DateTimeField | Default `now()` |
| `amount` | Decimal(12,2) | |
| `amount_in_words` | CharField(300) | Auto-generated via `num2words` |
| `payment_method` | CharField(20) | |
| `facility_name` | CharField(200) | Denormalized for receipt |
| `facility_address` | TextField | |
| `facility_phone` | CharField(20) | |
| `facility_kra_pin` | CharField(20) | |
| `patient_name` | CharField(200) | Denormalized |
| `patient_mrn` | CharField(50) | Denormalized |
| `is_voided` | BooleanField | |
| `voided_at` | DateTimeField | |
| `voided_by` | FK → User | |
| `void_reason` | TextField | |
| `issued_by` | FK → User | |

**Features:**
- `convert_amount_to_words()` — e.g. "Five Hundred Shillings Only"
- `generate_pdf()` — ReportLab A5 PDF with facility header, line items, QR code, amount in words
- `void(user, reason)` — Mark receipt as voided

### 3.8 CreditNote

Refunds and adjustments with mandatory two-person approval.

| Field | Type | Notes |
|-------|------|-------|
| `id` | BigAutoField | PK |
| `credit_note_number` | CharField(50) | Unique, auto: `CN-YYYYMMDD-XXXX` |
| `invoice` | FK → Invoice | `PROTECT` |
| `patient` | FK → Patient | `PROTECT` |
| `original_payment` | FK → Payment | Nullable |
| `amount` | Decimal(12,2) | Must be > 0, ≤ invoice total |
| `reason` | CharField(30) | TextChoices (see below) |
| `reason_detail` | TextField | Required |
| `status` | CharField(20) | `draft`, `approved`, `rejected`, `refunded` |
| `refund_method` | CharField(20) | |
| `refund_reference` | CharField(100) | |
| `refunded_at` | DateTimeField | |
| `requested_by` | FK → User | |
| `approved_by` | FK → User | Nullable (set on approve) |
| `approved_at` | DateTimeField | |

#### Credit Note Reason Enum

| Value | Label |
|-------|-------|
| `service_not_rendered` | Service Not Rendered |
| `overcharge` | Overcharge Correction |
| `duplicate` | Duplicate Charge |
| `insurance` | Insurance Adjustment |
| `goodwill` | Goodwill Gesture |
| `other` | Other |

**Key Methods & Rules:**
- `approve(user)` — Approver must differ from requester (self-approval blocked)
- `reject(user, reason)` — Only draft notes can be rejected
- `process_refund(method, reference)` — Only approved notes can be refunded

### 3.9 SHAMember

SHA (Social Health Authority) membership for patients.

| Field | Type | Notes |
|-------|------|-------|
| `id` | BigAutoField | PK |
| `patient` | OneToOne → Patient | `CASCADE` |
| `sha_number` | CharField(20) | Unique, format `SHA-XXXXXXXXXX` |
| `national_id` | CharField(20) | Indexed |
| `membership_type` | CharField(20) | `principal`, `spouse`, `child`, `parent`, `other` |
| `principal_sha_number` | CharField(20) | External reference for dependents |
| `principal` | FK → self | Internal FK for dependents |
| `status` | CharField(20) | `active`, `inactive`, `suspended`, `expired`, `pending_verification` |
| `last_eligibility_check` | DateTimeField | |
| `eligibility_valid_until` | DateField | |
| `eligibility_response` | JSONField | Cached SHA response |
| `coverage_start_date` | DateField | |
| `coverage_end_date` | DateField | |
| `benefit_package` | CharField(50) | SHA benefit package code |
| `is_pfms_eligible` | BooleanField | Government subsidy (vulnerable populations) |
| `pfms_category` | CharField(20) | `vulnerable`, `elderly`, `disabled`, `orphan`, `indigent` |
| `pfms_verified` | BooleanField | |
| `pfms_verified_at` | DateTimeField | |
| `verified_by` | FK → User | |
| `verified_at` | DateTimeField | |
| `created_by` | FK → User | |

**Key Methods:**
- `is_eligible()` — Checks status, coverage end, eligibility validity
- `needs_eligibility_check()` — True if no check or last check > 24 hours ago
- `get_eligibility_display()` — Human-readable status

**Validation:**
- SHA number must start with `"SHA-"`
- Principal members require national ID
- Dependents must reference a principal member
- Coverage end must be after start
- PFMS category required when `is_pfms_eligible=True`

### 3.10 SHATariff

SHA reimbursement rates by category and facility level.

| Field | Type | Notes |
|-------|------|-------|
| `id` | BigAutoField | PK |
| `code` | CharField(20) | Unique, e.g. `"SHA-CONS-001"` |
| `name` | CharField(200) | |
| `description` | TextField | |
| `category` | CharField(20) | 14 categories (consultation, laboratory, radiology, pharmacy, procedure, surgery, inpatient, maternity, dental, optical, physiotherapy, dialysis, oncology, other) |
| `facility_level` | CharField(5) | L1–L6 (Dispensary → Tertiary) |
| `sha_amount` | Decimal(10,2) | Approved reimbursement (KES) |
| `effective_date` | DateField | |
| `expiry_date` | DateField | Nullable |
| `is_active` | BooleanField | |
| `internal_service` | FK → Service | Auto-mapping |
| `applicable_icd10_codes` | JSONField | List of ICD-10 codes |
| `requires_preauthorization` | BooleanField | |
| `max_quantity_per_claim` | IntegerField | |
| `waiting_period_days` | IntegerField | |

**Key Methods:**
- `is_valid_on_date(date)` — Active, effective, not expired
- `get_active_tariffs(category?, facility_level?)` — QuerySet of valid tariffs
- `find_tariff_for_service(service, facility_level)` — Lookup by FK or SHA code

### 3.11 SHAClaim

SHA claim lifecycle management.

| Field | Type | Notes |
|-------|------|-------|
| `id` | BigAutoField | PK |
| `claim_number` | CharField(30) | Unique, auto: `CLM-YYYYMMDD-XXXX` |
| `sha_claim_reference` | CharField(50) | SHA-assigned reference |
| `patient` | FK → Patient | `PROTECT` |
| `sha_member` | FK → SHAMember | `PROTECT` |
| `encounter` | FK → Encounter | `PROTECT` |
| `invoice` | FK → Invoice | Nullable |
| `claim_type` | CharField(20) | `outpatient`, `inpatient`, `maternity`, `surgery`, `chronic`, `emergency`, `dental`, `optical`, `dialysis` |
| `status` | CharField(20) | 12-step lifecycle (see below) |
| `service_date` | DateField | |
| `admission_date` | DateField | Required for inpatient |
| `discharge_date` | DateField | |
| `primary_diagnosis_code` | CharField(10) | ICD-10 |
| `primary_diagnosis_description` | CharField(255) | |
| `secondary_diagnosis_codes` | JSONField | |
| `claimed_amount` | Decimal(12,2) | Sum of claim items |
| `approved_amount` | Decimal(12,2) | |
| `paid_amount` | Decimal(12,2) | |
| `patient_copay` | Decimal(12,2) | |
| `submission_method` | CharField(20) | `api`, `portal`, `manual` |
| `submitted_at` | DateTimeField | |
| `submission_response` | JSONField | |
| `adjudication_date` | DateField | |
| `adjudication_notes` | TextField | |
| `rejection_reason` | TextField | |
| `rejection_code` | CharField(20) | |
| `payment_date` | DateField | |
| `payment_reference` | CharField(50) | |
| `preauth_number` | CharField(50) | |
| `facility_code` | CharField(20) | MFL code |
| `facility_level` | CharField(5) | L1–L6 |
| `version` | IntegerField | For resubmissions |
| `parent_claim` | FK → self | Original claim for appeals |
| `created_by` | FK → User | |
| `submitted_by` | FK → User | |

#### SHA Claim Status Lifecycle

```
DRAFT → VALIDATED → PENDING_SUBMISSION → SUBMITTED → ACKNOWLEDGED
                                                      ↓
                                              UNDER_REVIEW → QUERY
                                                      ↓
                                    APPROVED / PARTIALLY_APPROVED / REJECTED
                                         ↓                          ↓
                                       PAID                     APPEALED
                                                                    ↓
                                                              (new claim)
```

| Status | Label |
|--------|-------|
| `draft` | Draft |
| `validated` | Validated |
| `pending_submission` | Pending Submission (Queued) |
| `submitted` | Submitted |
| `acknowledged` | Acknowledged by SHA |
| `under_review` | Under Review |
| `query` | Query Raised |
| `approved` | Approved |
| `partial` | Partially Approved |
| `rejected` | Rejected |
| `appealed` | Appealed |
| `paid` | Paid |
| `written_off` | Written Off |

**Key Methods:**
- `calculate_claimed_amount()` — Sum from SHAClaimItem
- `validate_for_submission()` → `(bool, list[str])` — Checks status, eligibility, items, tariffs, attachments, amount
- `submit(user)` — Mark submitted + timestamp
- `can_appeal()` — True if rejected or partially approved
- `create_appeal(reason, user)` → new SHAClaim — Copies claim + items, increments version
- `get_age_days()` — Days since submission

**Custom Permissions:**
- `submit_sha_claim`
- `approve_sha_claim`
- `appeal_sha_claim`

### 3.12 SHAClaimItem

Line items within a SHA claim, mapped to tariff codes.

| Field | Type | Notes |
|-------|------|-------|
| `claim` | FK → SHAClaim | `CASCADE` |
| `tariff` | FK → SHATariff | Nullable |
| `service` | FK → Service | Nullable |
| `invoice_item` | FK → InvoiceItem | Nullable |
| `description` | CharField(255) | |
| `service_date` | DateField | Nullable |
| `coverage_type` | CharField(10) | `sha`, `pfms`, `both` |
| `quantity` | Decimal(10,2) | |
| `unit_price` | Decimal(10,2) | |
| `claimed_amount` | Decimal(12,2) | |
| `approved_amount` | Decimal(12,2) | |
| `rejection_reason` | CharField(255) | |
| `status` | CharField(20) | `pending`, `approved`, `rejected`, `adjusted` |

### 3.13 SHAClaimAttachment

Supporting documents for claims.

| Field | Type | Notes |
|-------|------|-------|
| `claim` | FK → SHAClaim | `CASCADE` |
| `attachment_type` | CharField | `clinical_notes`, `invoice`, `lab_report`, `imaging`, `prescription`, `referral`, `preauth`, `other` |
| `file` | FileField | Uploaded document |
| `description` | CharField | |

### 3.14 SHAEligibilityCheck

Records of SHA eligibility verification queries.

| Field | Type | Notes |
|-------|------|-------|
| `sha_member` | FK → SHAMember | |
| `check_date` | DateTimeField | |
| `is_eligible` | BooleanField | |
| `response_data` | JSONField | Full API response |
| `checked_by` | FK → User | |

---

## 4. API Reference

**Base URL**: `/api/billing/`

All endpoints require JWT authentication (`Authorization: Bearer <access_token>`).

### 4.1 Service Categories

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/billing/service-categories/` | List categories |
| `POST` | `/api/billing/service-categories/` | Create category |
| `GET` | `/api/billing/service-categories/{id}/` | Get category |
| `PATCH` | `/api/billing/service-categories/{id}/` | Update category |
| `DELETE` | `/api/billing/service-categories/{id}/` | Delete category |

**Filters**: search by `name`, `code`, `description`

### 4.2 Services

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/billing/services/` | List services |
| `POST` | `/api/billing/services/` | Create service |
| `GET` | `/api/billing/services/{id}/` | Get service |
| `PATCH` | `/api/billing/services/{id}/` | Update service |
| `DELETE` | `/api/billing/services/{id}/` | Soft-delete (`is_active=False`) |

**Filters**: `category`, `is_active`, `is_taxable`, `sha_code`
**Search**: `name`, `code`, `description`, `sha_code`

### 4.3 Invoices

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/billing/invoices/` | List invoices |
| `POST` | `/api/billing/invoices/` | Create invoice |
| `GET` | `/api/billing/invoices/{id}/` | Get invoice detail |
| `PATCH` | `/api/billing/invoices/{id}/` | Update (draft only) |
| `POST` | `/api/billing/invoices/{id}/finalize/` | Draft → Pending |
| `POST` | `/api/billing/invoices/{id}/cancel/` | Cancel with reason |
| `POST` | `/api/billing/invoices/{id}/apply-discount/` | Apply discount |
| `GET` | `/api/billing/invoices/{id}/items/` | List line items |
| `POST` | `/api/billing/invoices/{id}/items/` | Add line item |
| `DELETE` | `/api/billing/invoices/{id}/items/{item_id}/` | Remove line item |
| `GET` | `/api/billing/invoices/overdue/` | List overdue invoices |
| `POST` | `/api/billing/invoices/{id}/convert/` | Proforma → Invoice |
| `POST` | `/api/billing/invoices/{id}/renew/` | Renew expired proforma |

**Filters**: `status` (case-insensitive), `patient`, `encounter`, `payment_type`
**Query Params**: `start_date`, `end_date`, `clinic`, `clinic_type`
**Search**: `invoice_number`, `patient.first_name`, `patient.last_name`, `patient.mrn`

#### Finalize Invoice

```http
POST /api/billing/invoices/{id}/finalize/
```
- Requires status = `DRAFT` and ≥ 1 item
- Returns updated invoice with status `PENDING`

#### Cancel Invoice

```http
POST /api/billing/invoices/{id}/cancel/
Content-Type: application/json

{ "reason": "Patient requested cancellation" }
```
- Cannot cancel paid invoices

#### Apply Discount

```http
POST /api/billing/invoices/{id}/apply-discount/
Content-Type: application/json

{
  "discount_amount": "500.00",
  "discount_reason": "Loyalty discount"
}
```

#### Convert Proforma

```http
POST /api/billing/invoices/{id}/convert/
Content-Type: application/json

// Full conversion (all items):
{}

// Partial conversion (specific items):
{ "item_ids": [1, 3, 5] }
```
- Returns newly created invoice
- Original proforma marked as converted

#### Renew Proforma

```http
POST /api/billing/invoices/{id}/renew/
Content-Type: application/json

{ "validity_days": 60 }  // Optional, default 30
```
- Returns new proforma, original is cancelled

### 4.4 Payments

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/billing/payments/` | List payments |
| `POST` | `/api/billing/payments/` | Record payment |
| `GET` | `/api/billing/payments/{id}/` | Get payment detail |
| `GET` | `/api/billing/payments/{id}/receipt/` | Get/generate receipt |
| `GET` | `/api/billing/payments/{id}/receipt/pdf/` | Download PDF receipt |

**Filters**: `method`, `status`, `invoice`
**Search**: `reference`, `mpesa_receipt_number`, `transaction_reference`

#### Record Payment

```http
POST /api/billing/payments/
Content-Type: application/json

{
  "invoice": 42,
  "amount": "1500.00",
  "method": "cash",
  "payment_point": 1,
  "notes": "Cash received at front desk"
}
```
- Auto-processes: status → `completed`, invoice updated
- Returns payment with `payment_reference` (e.g. `PAY-20260322-0001`)

### 4.5 Payment Points

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/billing/payment-points/` | List payment points |
| `POST` | `/api/billing/payment-points/` | Create payment point |
| `GET` | `/api/billing/payment-points/{id}/` | Get payment point |
| `PATCH` | `/api/billing/payment-points/{id}/` | Update payment point |

**Filters**: `method`, `is_active`

### 4.6 M-Pesa

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/billing/mpesa/initiate/` | Initiate STK Push |
| `POST` | `/api/billing/mpesa/callback/` | Daraja callback |
| `GET` | `/api/billing/mpesa/query/{checkout_request_id}/` | Query transaction status |

#### Initiate STK Push

```http
POST /api/billing/mpesa/initiate/
Content-Type: application/json

{
  "invoice_id": 42,
  "phone_number": "254712345678",
  "amount": "1500.00",
  "payment_point": 2
}
```

**Response:**
```json
{
  "success": true,
  "checkout_request_id": "ws_CO_22032026...",
  "merchant_request_id": "29115-...",
  "response_code": "0",
  "response_description": "Success. Request accepted for processing",
  "customer_message": "Success. Request accepted for processing",
  "payment_id": 15,
  "payment_reference": "PAY-20260322-0003"
}
```

**Flow:**
1. Frontend calls `initiate/` → User sees STK Push prompt on phone
2. User enters M-Pesa PIN
3. Safaricom calls `callback/` → Payment status updated
4. Frontend polls `query/` for real-time status

### 4.7 Credit Notes

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/billing/credit-notes/` | List credit notes |
| `POST` | `/api/billing/credit-notes/` | Create credit note |
| `GET` | `/api/billing/credit-notes/{id}/` | Get credit note |
| `POST` | `/api/billing/credit-notes/{id}/approve/` | Approve |
| `POST` | `/api/billing/credit-notes/{id}/reject/` | Reject |
| `POST` | `/api/billing/credit-notes/{id}/refund/` | Process refund |

**Filters**: `status`, `reason`, `invoice`, `patient`

#### Create Credit Note

```http
POST /api/billing/credit-notes/
Content-Type: application/json

{
  "invoice": 42,
  "amount": "500.00",
  "reason": "overcharge",
  "reason_detail": "Patient was billed for procedure not performed"
}
```

#### Approve / Reject / Refund

```http
POST /api/billing/credit-notes/{id}/approve/

POST /api/billing/credit-notes/{id}/reject/
{ "reason": "Insufficient documentation" }

POST /api/billing/credit-notes/{id}/refund/
{ "refund_method": "mpesa", "refund_reference": "TX-123456" }
```

### 4.8 SHA Members

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/billing/sha-members/` | List SHA members |
| `POST` | `/api/billing/sha-members/` | Register member |
| `GET` | `/api/billing/sha-members/{id}/` | Get member |
| `PATCH` | `/api/billing/sha-members/{id}/` | Update member |

**Filters**: `status`, `membership_type`, `patient`

### 4.9 SHA Tariffs

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/billing/sha-tariffs/` | List tariffs |
| `GET` | `/api/billing/sha-tariffs/{id}/` | Get tariff |

### 4.10 SHA Claims

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/billing/claims/` | List claims |
| `POST` | `/api/billing/claims/` | Create claim |
| `GET` | `/api/billing/claims/{id}/` | Get claim detail |
| `PATCH` | `/api/billing/claims/{id}/` | Update claim |

### 4.11 SHA Eligibility

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/billing/eligibility/check/` | Check via SHA member |
| `POST` | `/api/billing/eligibility/direct/` | Direct check by SHA/ID number |

### 4.12 DHA Integration

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/billing/terminology/{type}/` | Search ICD-11, LOINC, Drug codes |
| `GET/POST` | `/api/billing/client-registry/fetch/` | Fetch patient from NCRH |
| `POST` | `/api/billing/client-registry/register/` | Register patient in NCRH |
| `POST` | `/api/billing/client-registry/update/` | Update patient in NCRH |
| `GET` | `/api/billing/facility/validate/` | Validate facility MFL code |
| `GET` | `/api/billing/practitioner/validate/` | Validate practitioner |
| `GET` | `/api/billing/dha/practitioner-search/` | Search health workers |

### 4.13 Reports

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/billing/reports/daily-collection/?date=YYYY-MM-DD` | Daily collections by method |
| `GET` | `/api/billing/reports/revenue-summary/?start_date=...&end_date=...` | Revenue with period comparison |
| `GET` | `/api/billing/reports/outstanding-balances/` | Outstanding invoices |
| `GET` | `/api/billing/reports/service-utilization/?start_date=...&end_date=...` | Service usage |
| `GET` | `/api/billing/reports/payment-analysis/?start_date=...&end_date=...` | Payment method breakdown |
| `GET` | `/api/billing/reports/daily-closure/?date=YYYY-MM-DD` | End-of-day closure |
| `GET` | `/api/billing/reports/discrepancies/` | Billing discrepancies |
| `GET` | `/api/billing/reports/unbilled-services/` | Services missing invoices |

---

## 5. Business Logic & Workflows

### 5.1 Invoice Lifecycle

```
                      ┌───────────────┐
                      │  Auto-created │
                      │  by signal    │
                      └──────┬────────┘
                             │
                      ┌──────▼────────┐
              ┌───────│    DRAFT      │───────┐
              │       │ (editable)    │       │
              │       └──────┬────────┘       │
              │              │                │
         [void/cancel]  [finalize]      [add/remove items]
              │              │
              │       ┌──────▼────────┐
              │       │   PENDING     │
              │       │ (awaiting $)  │
              │       └──────┬────────┘
              │              │
              │    ┌─────────┼─────────┐
              │    │         │         │
              │ [payment] [payment] [overdue]
              │    │         │         │
              │ ┌──▼──┐  ┌──▼──┐  ┌───▼───┐
              │ │PAID  │  │PART-│  │OVER-  │
              │ │      │  │IAL  │  │DUE    │
              │ └──────┘  └─────┘  └───────┘
              │
         ┌────▼─────┐
         │CANCELLED  │
         └──────────┘
```

### 5.2 Auto-Invoice Creation (Signal)

When an `Encounter` is created, a signal in `signals.py` automatically:
1. Checks for an existing draft invoice for the same patient from today
2. If found, links it to the encounter
3. If not, creates a new draft invoice

### 5.3 Proforma Workflow

```
PROFORMA (quote)
    │
    ├── [convert] → New DRAFT Invoice (full or partial items)
    │                    └── Standard lifecycle continues
    ├── [renew] → New PROFORMA (original cancelled)
    └── [void]  → CANCELLED
```

- Proformas have `valid_until` (default 30 days)
- Cannot accept payments until converted
- Partial conversion: select specific items to move to invoice
- Unconverted items remain on the proforma for future conversion

### 5.4 Payment Processing

```
User records payment
    │
    ├── Validation:
    │   ├── Amount > 0
    │   ├── Amount ≤ invoice.balance_due
    │   ├── Invoice not cancelled
    │   └── Invoice not proforma
    │
    ├── Payment created (status: PENDING)
    │
    ├── payment.process():
    │   ├── Status → COMPLETED
    │   ├── processed_at = now()
    │   └── invoice.record_payment(amount):
    │       ├── amount_paid += amount
    │       ├── balance_due = total - paid
    │       ├── If balance = 0 → status = PAID
    │       └── If paid > 0   → status = PARTIAL
    │
    └── Receipt auto-generated (if requested)
```

### 5.5 Credit Note Workflow

```
DRAFT (requested)
    │
    ├── [approve] → APPROVED (different user required)
    │                   │
    │                   └── [refund] → REFUNDED
    │
    └── [reject]  → REJECTED (reason required)
```

- Self-approval is blocked: `approver != requester`
- Only draft credit notes can be approved or rejected

### 5.6 Discount Application

Two discount types:
- **Percentage**: `discount_amount = subtotal × (discount_value / 100)`
- **Fixed**: `discount_amount = min(discount_value, subtotal)`

After applying: `total_amount = subtotal - discount_amount + tax_amount`

---

## 6. SHA (Social Health Authority) Integration

### 6.1 Eligibility Verification

Before submitting a claim, the system checks member eligibility:

1. Patient's `SHAMember` record is checked
2. If `needs_eligibility_check()` returns True (no check or > 24h old), call SHA API
3. Cache response in `eligibility_response` and update `eligibility_valid_until`
4. Check: status `ACTIVE`, coverage not expired, eligibility not expired

### 6.2 Claim Submission Flow

1. **Create claim** — Auto-created by `BillingAgentService` on discharge, or manually
2. **Add items** — Map invoice line items to SHA tariff codes
3. **Add attachments** — Clinical notes and invoice are mandatory
4. **Validate** — `validate_for_submission()` checks:
   - Status in `[DRAFT, VALIDATED, PENDING_SUBMISSION]`
   - Member is eligible
   - Has ≥ 1 item
   - All items have tariff codes
   - Required attachments present
   - Claimed amount > 0
5. **Submit** — `SHAClaimsService.submit_claim()` sends FHIR bundle to SHA API
6. **Track** — Monitor through acknowledgment, review, adjudication

### 6.3 PFMS (Government Subsidy) Support

For vulnerable populations (elderly, disabled, orphans, indigent):
- `SHAMember.is_pfms_eligible` marks PFMS members
- `SHAClaimItem.coverage_type` can be `sha`, `pfms`, or `both`
- Special handling for government-subsidized coverage

### 6.4 Appeals

Rejected or partially approved claims can be appealed:
1. `claim.can_appeal()` checks status
2. `claim.create_appeal(reason, user)` creates a new claim:
   - Copies all items and metadata
   - Increments `version`
   - Links to original via `parent_claim`
   - Original status → `APPEALED`

### 6.5 DHA Services

| Service | Purpose |
|---------|---------|
| `ClientRegistryService` | Fetch/register/update patients in Kenya's NCRH |
| `TerminologyService` | Search ICD-11, LOINC, KES drug codes via SHA Gateway |
| `SHAEligibilityService` | Check SHA member eligibility |
| `SHAClaimsService` | Create, validate, submit claims |
| `SHAPiiService` | Mask/unmask PII in SHA data |

---

## 7. M-Pesa Integration

### Service: `services/mpesa.py`

Integrates with Safaricom's Daraja API for M-Pesa payments.

### STK Push Flow

```
┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐
│ Frontend  │    │ Backend  │    │ Safaricom│    │ User's   │
│           │    │          │    │ Daraja   │    │ Phone    │
└────┬──────┘    └────┬─────┘    └────┬─────┘    └────┬─────┘
     │                │               │               │
     │ POST /initiate │               │               │
     │───────────────►│               │               │
     │                │ STK Push req  │               │
     │                │──────────────►│               │
     │                │               │ Push prompt   │
     │                │               │──────────────►│
     │ 201 (pending)  │               │               │
     │◄───────────────│               │               │
     │                │               │               │
     │                │               │  User enters  │
     │                │               │  M-Pesa PIN   │
     │                │               │◄──────────────│
     │                │               │               │
     │                │  Callback     │               │
     │                │◄──────────────│               │
     │                │               │               │
     │ Poll /query    │               │               │
     │───────────────►│               │               │
     │ Payment status │               │               │
     │◄───────────────│               │               │
```

### Key Features
- Phone number normalization (07xxx → 254xxx)
- Sandbox and production environments
- Callback URL configured in settings
- Pending payment created immediately (correlated by checkout_request_id)
- Automatic `Payment.process()` on successful callback

---

## 8. Billing Agent (Automation)

### Service: `agent.py` — `BillingAgentService`

The billing agent is the central orchestrator for all automated billing actions.

### Event-Driven Handlers

| Event | Handler | Action |
|-------|---------|--------|
| Lab order confirmed | `handle_lab_order_confirmed()` | Add lab test line items to draft invoice |
| Admission created | `handle_admission_created()` | Add admission fee + first bed night |
| Patient discharged | `handle_discharge()` | Calculate remaining bed nights, finalize invoice, auto-create SHA claim |

### Scheduled Tasks (Celery Beat)

| Task | Schedule | Action |
|------|----------|--------|
| `apply_daily_bed_charges` | Midnight daily | Charge all active IPD admissions 1 bed night |
| `flag_overdue_invoices` | 6:00 AM daily | PENDING → OVERDUE for past-due invoices |
| `submit_pending_sha_claims` | Hourly | Batch-submit up to 20 DRAFT SHA claims |

### Core Methods

```python
# Get or reuse today's draft invoice for a patient
BillingAgentService.get_or_create_draft_invoice(patient, encounter?)

# Add a billable line item
BillingAgentService.add_line_item(invoice, service=, quantity=1, description="", item_type=, lab_order=)

# Bed charge helper
BillingAgentService._add_bed_charge(invoice, admission, nights=1)

# SHA claim auto-creation (if patient has active SHA membership)
BillingAgentService._maybe_create_sha_claim(invoice, encounter)
```

---

## 9. Reports

### Service: `reports.py` — `BillingReportService`

### 9.1 Daily Collection Report

```
GET /api/billing/reports/daily-collection/?date=2026-03-22
```

Returns:
- `total_collections` — Sum of completed payments for the day
- `by_payment_method` — Breakdown: `{ "cash": 15000.00, "mpesa": 8500.00 }`
- `invoice_count` — Number of invoices with payments
- `top_services` — Top 5 services by revenue
- `outstanding_balance` — Total outstanding across all unpaid invoices

### 9.2 Revenue Summary

```
GET /api/billing/reports/revenue-summary/?start_date=2026-03-01&end_date=2026-03-22
```

Returns:
- `total_revenue` — Completed payments in period
- `by_payment_method` — Method breakdown
- `by_category` — Revenue per service category with count
- `previous_period` — Comparison with same-length preceding period + `change_percent`

### 9.3 Outstanding Balances

```
GET /api/billing/reports/outstanding-balances/
```

Returns list of unpaid invoices sorted by days overdue:
- Invoice number, patient name/MRN, dates, amounts, status
- `days_overdue` calculated from `due_date`

### 9.4 Service Utilization

```
GET /api/billing/reports/service-utilization/?start_date=...&end_date=...
```

### 9.5 Payment Method Analysis

```
GET /api/billing/reports/payment-analysis/?start_date=...&end_date=...
```

### 9.6 Daily Closure Report

```
GET /api/billing/reports/daily-closure/?date=2026-03-22
```

End-of-day summary: invoiced, collected, outstanding, by department, by method.

### 9.7 Billing Discrepancies

```
GET /api/billing/reports/discrepancies/
```

Flags mismatches between expected and billed amounts.

### 9.8 Unbilled Services

```
GET /api/billing/reports/unbilled-services/
```

Services rendered but not yet on any invoice.

---

## 10. Frontend (Web App)

### 10.1 API Client

All billing API calls go through `billingApi` in `lib/api/billing.ts`:

```typescript
import { billingApi } from '@/lib/api/billing';

// List invoices
const invoices = await billingApi.getInvoices({ status: 'PENDING' });

// Create payment
const payment = await billingApi.createPayment({
  invoice: 42,
  amount: '1500.00',
  method: 'CASH',
  payment_point: 1,
});

// M-Pesa STK Push
const result = await billingApi.initiateMpesaSTKPush({
  invoice_id: 42,
  phone_number: '254712345678',
  amount: '1500.00',
  payment_point: 2,
});
```

Every API response is validated with Zod schemas (`lib/schemas/billing.schema.ts`) using `parseResponse()` to catch type mismatches at runtime.

### 10.2 Zod Schemas

Case-insensitive enum handling: backend sends lowercase (`"pending"`), frontend normalizes to uppercase (`"PENDING"`) via `caseInsensitiveEnum()` transformer.

Key schemas:
- `InvoiceSchema` — Full invoice with nested `items`, proforma fields, QR code
- `PaymentSchema` — Payment with method/status enums
- `ReceiptSchema` — Receipt with line items, QR code, payment point info
- `CreditNoteSchema` — Credit note with approval workflow fields
- `DailyCollectionReportSchema`, `RevenueSummarySchema` — Report shapes

### 10.3 TypeScript Types

Entity types are derived from Zod schemas (`z.infer<>`). Input/request types are manually defined:

| Type | Purpose |
|------|---------|
| `InvoiceCreateData` | Create invoice request |
| `InvoiceItemCreateData` | Add line item |
| `PaymentCreateData` | Record payment |
| `MpesaSTKPushRequest` | Initiate M-Pesa |
| `CreditNoteCreateData` | Create credit note |
| `ApplyDiscountData` | Apply discount |
| `ProformaConvertRequest` | Proforma conversion |
| `ProformaRenewRequest` | Proforma renewal |

### 10.4 Pages

| Route | Component | Description |
|-------|-----------|-------------|
| `/billing` | `BillingDashboard` | Financial KPIs, collection overview, quick actions |
| `/billing/invoices/new` | `InvoiceForm` | Create new invoice |
| `/billing/invoices/[id]` | `InvoiceDetail` | View invoice, manage items, record payments |
| `/billing/receipts/[id]` | `ReceiptView` | View/print receipt |
| `/billing/sha-claims` | SHA claims list | SHA claims management |
| `/billing/sha-claims/[id]` | SHA claim detail | Claim status, items, attachments |

### 10.5 Key Components

**BillingDashboard** — Top-level view with:
- Revenue stats (today, week, month)
- Outstanding balance summary
- Recent invoices table
- Payment method distribution

**InvoiceDetail** — Full invoice management:
- Summary bar (patient, MRN, status, amounts)
- Line items table with add/remove
- Payment history
- Action buttons: Finalize, Cancel, Apply Discount, Print
- Proforma actions: Convert, Renew, Void
- QR code for verification

**PaymentForm** — Multi-method payment recording:
- Cash, Card, Bank Transfer: immediate processing
- M-Pesa: triggers STK Push via `MpesaPaymentDialog`
- Payment point selection (matches method)

**MpesaPaymentDialog** — Real-time M-Pesa tracking:
- Shows STK Push status
- Polls `query/` endpoint for updates
- Auto-closes on success
- Displays failure reason on error

**SHAClaimForm** — Claim submission:
- Eligibility verification banner
- Diagnosis selection (ICD-10)
- Map invoice items to SHA tariffs
- Attachment upload (clinical notes, invoice)
- Validation before submission

---

## 11. Admin Interface

The Django admin provides management for:

| Model | Features |
|-------|----------|
| `ServiceCategory` | List with active filter, search by name/code |
| `Service` | List with category filter, SHA code display, fieldsets |
| `Invoice` | List with status/date filters, inline items, balance display |
| `InvoiceItem` | Inline on Invoice (tabular) |
| `Payment` | List with method/status filters |
| `PaymentPoint` | Method/active filtering |
| `Receipt` | Receipt number search |
| `CreditNote` | Status/approval workflow |

---

## 12. Testing

### Test Structure

```
backend/tests/billing/
├── conftest.py                          # Billing-specific fixtures
├── test_models/
│   ├── test_service.py                  # Service model tests
│   ├── test_invoice.py                  # Invoice lifecycle tests
│   ├── test_invoice_item.py             # Line item calculation tests
│   ├── test_payment.py                  # Payment processing tests
│   ├── test_receipt.py                  # Receipt generation tests
│   ├── test_credit_note.py             # Credit note workflow tests
│   ├── test_sha_member.py              # SHA membership tests
│   ├── test_sha_tariff.py              # Tariff validation tests
│   ├── test_sha_claim.py               # Claim lifecycle tests
│   ├── test_sha_claim_item.py          # Claim item tests
│   ├── test_sha_claim_attachment.py     # Attachment tests
│   └── test_sha_eligibility_check.py   # Eligibility check tests
├── test_api/
│   ├── test_invoice_api.py             # Invoice API endpoint tests
│   ├── test_payment_api.py             # Payment API tests
│   ├── test_payment_points_api.py      # Payment point API tests
│   ├── test_service_api.py             # Service CRUD tests
│   ├── test_report_api.py             # Report endpoint tests
│   ├── test_sha_api.py                # SHA API tests
│   ├── test_client_registry_api.py    # Client registry tests
│   └── test_dha_practitioner_search_api.py
├── test_services/
│   ├── test_mpesa.py                   # M-Pesa service tests
│   ├── test_sha_claims_service.py      # Claims service tests
│   └── test_sha_eligibility_service.py # Eligibility service tests
├── test_dha_services/
│   ├── test_client_registry_service.py
│   ├── test_terminology_service.py
│   └── test_search_service.py
├── test_sha_compliance/                 # SHA API compliance tests
├── test_shr_compliance/                 # SHR FHIR compliance tests
├── test_billing_agent.py               # Billing agent automation tests
├── test_auto_invoice_signals.py        # Signal-based auto-invoice tests
├── test_encounter_invoice_integration.py
├── test_proforma_invoice.py            # Proforma lifecycle tests
├── test_reports.py                     # Report service tests
├── test_renderers.py                   # PDF renderer tests
├── test_admin.py                       # Admin interface tests
├── test_sha_stub.py                    # SHA stub/mock tests
├── test_sha_pii.py                     # PII masking tests
└── test_icd11_local.py                 # Local ICD-11 search tests
```

### Running Tests

```bash
cd backend

# All billing tests
poetry run pytest tests/billing/ -v --no-cov

# Specific category
poetry run pytest tests/billing/test_models/ -v
poetry run pytest tests/billing/test_api/ -v
poetry run pytest tests/billing/test_services/ -v

# With coverage
poetry run pytest tests/billing/ --cov=hmis.apps.billing --cov-report=term-missing

# Pattern matching
poetry run pytest -k "invoice and finalize"
poetry run pytest -k "mpesa"
poetry run pytest -k "sha_claim and submit"
```

### Frontend Tests

```
web-app/__tests__/components/billing/
└── billing-components.test.tsx
```

---

## 13. Configuration

### Django Settings

Add these to your settings file (or `.env`):

```python
# Billing configuration
BILLING_INVOICE_PREFIX = "INV-"        # Invoice number prefix
BILLING_PAYMENT_PREFIX = "PAY-"        # Payment reference prefix
BILLING_RECEIPT_PREFIX = "RCP-"        # Receipt number prefix
BILLING_DEFAULT_DUE_DAYS = 30          # Days until invoice due
BILLING_OVERDUE_GRACE_DAYS = 0         # Grace period after due date

# M-Pesa (Daraja API)
MPESA_CONSUMER_KEY = ""
MPESA_CONSUMER_SECRET = ""
MPESA_SHORTCODE = ""
MPESA_PASSKEY = ""
MPESA_CALLBACK_URL = ""
MPESA_ENV = "sandbox"                  # "sandbox" or "production"

# SHA Integration
SHA_API_BASE_URL = ""
SHA_CLIENT_ID = ""
SHA_CLIENT_SECRET = ""
SHA_FACILITY_CODE = ""                 # MFL code
SHA_FACILITY_LEVEL = "L4"             # L1-L6
```

### Celery Beat Schedule

```python
CELERY_BEAT_SCHEDULE = {
    'apply-daily-bed-charges': {
        'task': 'hmis.apps.billing.tasks.apply_daily_bed_charges',
        'schedule': crontab(hour=0, minute=0),  # Midnight
    },
    'flag-overdue-invoices': {
        'task': 'hmis.apps.billing.tasks.flag_overdue_invoices',
        'schedule': crontab(hour=6, minute=0),  # 6 AM
    },
    'submit-pending-sha-claims': {
        'task': 'hmis.apps.billing.tasks.submit_pending_sha_claims',
        'schedule': crontab(minute=0),  # Every hour
    },
}
```

### Seeding Service Catalog

```bash
python manage.py seed_service_catalog
```

---

## 14. Troubleshooting

### Common Issues

| Problem | Solution |
|---------|----------|
| `"Only draft invoices can be modified"` | Invoice has been finalized. Create a credit note instead. |
| `"Payment amount exceeds invoice balance"` | Check `balance_due`. Multiple payments may have been recorded. |
| `"Cannot create payment for proforma invoice"` | Convert proforma to invoice first via `/convert/`. |
| `"Cannot self-approve credit note"` | A different user must approve. |
| `"SHA number must start with 'SHA-'"` | Format: `SHA-1234567890` |
| `"Proforma has expired"` | Use `/renew/` to create a new proforma. |
| `"No available stock for drug"` | Stock validation happens at dispensing, not billing. |
| M-Pesa STK Push not received | Check phone number format (must be `254xxxxxxxxx`). Verify Daraja credentials. |
| Invoice totals incorrect | Call `invoice.calculate_totals()` to recompute from items. |

### Debugging

```bash
# Check invoice state
python manage.py shell
>>> from hmis.apps.billing.models import Invoice
>>> inv = Invoice.objects.get(invoice_number="INV-20260322-0001")
>>> inv.status, inv.subtotal, inv.total_amount, inv.balance_due
>>> inv.items.all().values("description", "quantity", "unit_price", "line_total")

# Recalculate totals
>>> inv.calculate_totals()

# Check SHA claim validation
>>> from hmis.apps.billing.models import SHAClaim
>>> claim = SHAClaim.objects.get(claim_number="CLM-20260322-0001")
>>> claim.validate_for_submission()
# (False, ['Missing required attachment: clinical_notes'])
```

---

## Document History

| Date | Version | Changes |
|------|---------|---------|
| 2026-03-22 | 1.0 | Initial comprehensive documentation |
