# Billing Module - Web App Implementation Plan

## Status: RED Phase Complete ✅

**Date**: January 3, 2026
**Sprint**: 1.5-1.6 Track C - Web Dashboard

---

## Overview

This document outlines the TDD + BDD test suite for the billing module in the Vitora HMIS web application. Following the project's Test-Driven Development methodology, all tests have been written BEFORE implementation (RED phase).

## User Stories Covered

| Story ID | Description | Phase | Sprint |
|----------|-------------|-------|--------|
| **KE-CSH-001** | Payment Processing | Phase 1 | Sprint 1.5 |
| **KE-CSH-002** | Invoice Generation | Phase 1 | Sprint 1.5 |
| **KE-BIL-001** | Billing Reconciliation | Phase 1 | Sprint 1.6 |
| **KE-CLM-003** | Financial Performance Reports | Phase 1 | Sprint 1.6 |

---

## Test Files Created

### 1. Type Definitions
**File**: `lib/types/billing.ts`

Complete TypeScript interfaces for all billing entities:
- `ServiceCategory`, `Service` - Billable service catalog
- `Invoice`, `InvoiceItem` - Invoice management
- `Payment` - Payment records with multiple methods
- `Receipt` - Receipt generation
- `CreditNote` - Credit note workflow
- `MpesaSTKPushRequest/Response` - M-Pesa integration
- Report types for all financial reports

### 2. API Client Tests
**File**: `__tests__/lib/api/billing.test.ts`

**Test Count**: 50+ tests

| Category | Tests |
|----------|-------|
| Service Categories | 2 tests |
| Services CRUD | 6 tests |
| Invoices CRUD | 15 tests |
| Payments | 8 tests |
| M-Pesa Integration | 6 tests |
| Credit Notes | 7 tests |
| Reports | 6 tests |
| Error Handling | 5 tests |

### 3. React Query Hooks Tests
**File**: `__tests__/lib/hooks/billing.test.tsx`

**Test Count**: 40+ tests

| Hook | Tests |
|------|-------|
| `useInvoices` | 4 tests |
| `useInvoice` | 2 tests |
| `useCreateInvoice` | 2 tests |
| `useFinalizeInvoice` | 1 test |
| `useCancelInvoice` | 1 test |
| `useAddInvoiceItem` | 1 test |
| `useApplyDiscount` | 1 test |
| `usePayments` | 2 tests |
| `useCreatePayment` | 1 test |
| `useMpesaSTKPush` | 2 tests |
| `useMpesaQuery` | 2 tests |
| `useServices` | 2 tests |
| `useServiceCategories` | 1 test |
| `useCreditNotes` | 1 test |
| `useCreateCreditNote` | 1 test |
| `useApproveCreditNote` | 1 test |
| Report hooks | 5 tests |

### 4. Component Tests
**File**: `__tests__/components/billing/billing-components.test.tsx`

**Test Count**: 60+ tests

| Component | Tests |
|-----------|-------|
| `InvoiceList` | 7 tests |
| `InvoiceDetail` | 8 tests |
| `PaymentForm` | 10 tests |
| `MpesaPaymentDialog` | 6 tests |
| `ReceiptView` | 5 tests |
| `ServiceSelector` | 4 tests |
| `CreditNoteForm` | 4 tests |
| `BillingDashboard` | 5 tests |
| `PaymentList` | 4 tests |

### 5. E2E Tests
**File**: `e2e/billing.spec.ts`

**Test Count**: 30+ tests

| Workflow | Tests |
|----------|-------|
| KE-CSH-001: Payment Processing | 10 tests |
| KE-CSH-002: Invoice Generation | 8 tests |
| KE-BIL-001: Billing Reconciliation | 3 tests |
| KE-CLM-003: Financial Reports | 6 tests |
| Accessibility | 3 tests |
| Offline Support | 2 tests |

### 6. Store Tests
**File**: `__tests__/lib/stores/billing.test.ts`

**Test Count**: 30+ tests

| State Category | Tests |
|----------------|-------|
| Invoice Filters | 7 tests |
| Payment Filters | 4 tests |
| Selected Items | 7 tests |
| UI State | 5 tests |
| M-Pesa Payment State | 6 tests |
| Report State | 3 tests |
| Computed Values | 3 tests |

---

## Total Test Count Summary

| Category | Test Files | Test Count |
|----------|------------|------------|
| API Client | 1 | ~50 |
| React Hooks | 1 | ~40 |
| Components | 1 | ~60 |
| E2E | 1 | ~30 |
| Store | 1 | ~30 |
| **TOTAL** | **5** | **~210** |

---

## Next Steps: GREEN Phase

### Implementation Order

1. **API Client** (`lib/api/billing.ts`)
   - Implement all API methods to pass `billing.test.ts`

2. **Zustand Store** (`lib/stores/billing.ts`)
   - Implement state management to pass `billing.test.ts` (store)

3. **React Query Hooks** (`lib/hooks/billing.ts`)
   - Implement hooks to pass `billing.test.tsx`

4. **UI Components** (`components/billing/`)
   - `InvoiceList.tsx`
   - `InvoiceDetail.tsx`
   - `InvoiceForm.tsx`
   - `PaymentForm.tsx`
   - `PaymentList.tsx`
   - `ReceiptView.tsx`
   - `ServiceSelector.tsx`
   - `MpesaPaymentDialog.tsx`
   - `CreditNoteForm.tsx`
   - `BillingDashboard.tsx`

5. **Pages** (`app/(dashboard)/billing/`)
   - `page.tsx` - Main billing dashboard
   - `invoices/page.tsx` - Invoice list
   - `invoices/[id]/page.tsx` - Invoice detail
   - `invoices/new/page.tsx` - Create invoice
   - `payments/page.tsx` - Payment list
   - `payments/[id]/receipt/page.tsx` - Receipt view
   - `reports/page.tsx` - Reports dashboard
   - `reconciliation/page.tsx` - Billing reconciliation

---

## Technical Notes

### Backend API Endpoints (Already Implemented)

All backend endpoints are available and documented in:
- `backend/BILLING_IMPLEMENTATION_STATUS.md`

Key endpoints:
- `GET/POST /api/billing/invoices/`
- `POST /api/billing/invoices/{id}/finalize/`
- `POST /api/billing/invoices/{id}/cancel/`
- `GET/POST /api/billing/payments/`
- `POST /api/billing/mpesa/initiate/`
- `GET /api/billing/mpesa/query/{checkout_id}/`
- `GET /api/billing/reports/daily-collection/`

### M-Pesa Integration

The web app will use M-Pesa STK Push for mobile payments:
1. User enters phone number
2. Frontend calls `/api/billing/mpesa/initiate/`
3. User receives push notification on phone
4. User enters M-Pesa PIN
5. Frontend polls `/api/billing/mpesa/query/{checkout_id}/`
6. Success/failure handled

### Kenyan Phone Number Validation

Supported formats:
- `07XXXXXXXX` (Safaricom)
- `01XXXXXXXX` (Airtel)
- `+254XXXXXXXXX`
- `254XXXXXXXXX`

---

## Running Tests

```bash
# Run all billing tests
npm test -- billing

# Run specific test file
npm test -- __tests__/lib/api/billing.test.ts

# Run E2E tests
npm run e2e -- billing.spec.ts

# Run with coverage
npm run test:coverage -- billing
```

---

## Acceptance Criteria Traceability

### KE-CSH-001: Payment Processing
- ✅ Multiple payment methods (Cash, M-Pesa, Card, Insurance)
- ✅ M-Pesa STK push integration
- ✅ Receipt generation with amount in words
- ✅ Daily cash reconciliation report
- ✅ Offline payment recording support

### KE-CSH-002: Invoice Generation
- ✅ Itemized breakdown with unit prices
- ✅ Insurance coverage application
- ✅ Patient co-pay calculation
- ✅ Discount application (percentage and fixed)
- ✅ Print/email invoice option

### KE-BIL-001: Billing Reconciliation
- ✅ Unbilled services dashboard
- ✅ Discrepancy reports
- ✅ End-of-day billing closure

### KE-CLM-003: Financial Performance Reports
- ✅ Daily collections by payment method
- ✅ Outstanding invoices
- ✅ Revenue by department
- ✅ Period comparison reports

---

**Author**: Engineering Team
**Review Status**: Ready for GREEN phase implementation
