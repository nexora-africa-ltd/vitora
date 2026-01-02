# Billing Module Implementation Plan

**Sprint**: 1.5-1.6 Track A
**Status**: 🚧 IN PROGRESS
**Created**: January 2, 2026
**Target Completion**: Q1 2026

---

## Executive Summary

This document outlines the complete implementation plan for the Vitora HMIS Billing Module, which enables invoice generation, payment processing (Cash, M-Pesa, Insurance), receipt generation, and financial reporting. The implementation follows strict TDD principles and is designed for Kenya's healthcare billing context with support for SHA (Social Health Authority) claims.

**Total Planned Tests**: ~130 tests
**Target Coverage**: ≥85%
**Estimated Duration**: 4 weeks (Weeks 9-12)

---

## Implementation Phases

The implementation is divided into 4 phases, each with specific deliverables and checkpoints.

---

## Phase 1: Core Billing Models (Week 9)

### Objective
Set up the billing app structure and implement core models for services and invoices.

### Tasks Checklist

- [ ] **Phase 1.1: App Setup & Infrastructure**
  - [ ] Create billing Django app
  - [ ] Add billing app to INSTALLED_APPS
  - [ ] Create billing app directory structure
  - [ ] Create billing test directory structure
  - [ ] Add billing URL configuration
  - [ ] Update settings with billing configuration constants
  - [ ] Create billing conftest.py with fixtures

- [ ] **Phase 1.2: Service/Fee Catalog Models**
  - [ ] Create ServiceCategory model
  - [ ] Create Service model with pricing
  - [ ] Add SHA code support to Service
  - [ ] Implement service search methods
  - [ ] Add service availability checks
  - [ ] Write 10 tests for Service models
  - [ ] Create migration for Service models
  - [ ] Test migration rollback

- [ ] **Phase 1.3: Invoice Model**
  - [ ] Create Invoice model with status workflow
  - [ ] Implement auto-generated invoice number (INV-YYYYMMDD-XXXX)
  - [ ] Add patient and encounter linkage
  - [ ] Implement invoice status transitions
  - [ ] Add discount and payment tracking
  - [ ] Implement insurance/SHA fields
  - [ ] Create invoice calculation methods
  - [ ] Add invoice cancellation support
  - [ ] Write 18 tests for Invoice model
  - [ ] Create migration for Invoice model
  - [ ] Test migration rollback

- [ ] **Phase 1.4: Invoice Item Model**
  - [ ] Create InvoiceItem model
  - [ ] Add service linkage
  - [ ] Add pharmacy item linkage (future)
  - [ ] Add lab order linkage (future)
  - [ ] Implement line total calculation
  - [ ] Add item-level discount support
  - [ ] Implement insurance coverage tracking
  - [ ] Create signal to update invoice totals
  - [ ] Write 12 tests for InvoiceItem model
  - [ ] Create migration for InvoiceItem model
  - [ ] Test migration rollback

- [ ] **Phase 1.5: Sample Data**
  - [ ] Create sample service categories data migration
  - [ ] Create sample services data migration
  - [ ] Document how to load sample data
  - [ ] Test sample data migration

### Deliverables
- ✅ Billing app created and integrated
- ✅ Service, ServiceCategory, Invoice, InvoiceItem models implemented
- ✅ 40+ tests passing (Service: 10, Invoice: 18, InvoiceItem: 12)
- ✅ Database migrations created and tested
- ✅ Sample data available

### Success Criteria
- All 40+ Phase 1 tests passing
- Models accessible via Django admin
- Sample services can be created
- Invoice creation works with items

---

## Phase 2: Payment Processing & M-Pesa (Week 10)

### Objective
Implement payment recording, M-Pesa integration, and receipt generation.

### Tasks Checklist

- [ ] **Phase 2.1: Payment Model**
  - [ ] Create Payment model
  - [ ] Implement auto-generated payment reference (PAY-YYYYMMDD-XXXX)
  - [ ] Add payment method support (cash, mpesa, card, etc.)
  - [ ] Add payment status workflow
  - [ ] Implement M-Pesa specific fields
  - [ ] Create payment validation methods
  - [ ] Implement payment processing logic
  - [ ] Add payment reversal support
  - [ ] Add payment refund support
  - [ ] Create signal to update invoice status on payment
  - [ ] Write 16 tests for Payment model
  - [ ] Create migration for Payment model
  - [ ] Test migration rollback

- [ ] **Phase 2.2: M-Pesa Integration Service**
  - [ ] Install requests library (already in pyproject.toml)
  - [ ] Create MpesaService class
  - [ ] Implement OAuth token generation
  - [ ] Implement STK Push initiation
  - [ ] Implement STK Push status query
  - [ ] Implement callback processing
  - [ ] Add phone number formatting
  - [ ] Add sandbox/production environment support
  - [ ] Write 14 tests for MpesaService (with mocking)
  - [ ] Add M-Pesa settings to base.py
  - [ ] Document M-Pesa configuration
  - [ ] Create .env.example for M-Pesa credentials

- [ ] **Phase 2.3: Receipt Model**
  - [ ] Create Receipt model
  - [ ] Implement auto-generated receipt number (RCP-YYYYMMDD-XXXX)
  - [ ] Add payment linkage
  - [ ] Implement amount-to-words conversion
  - [ ] Add facility details denormalization
  - [ ] Add patient details denormalization
  - [ ] Implement receipt void support
  - [ ] Add receipt generation helper
  - [ ] Write 10 tests for Receipt model
  - [ ] Create migration for Receipt model
  - [ ] Test migration rollback

- [ ] **Phase 2.4: Credit Note Model**
  - [ ] Create CreditNote model
  - [ ] Implement auto-generated credit note number (CN-YYYYMMDD-XXXX)
  - [ ] Add credit note reason types
  - [ ] Implement approval workflow
  - [ ] Add refund tracking
  - [ ] Create credit note validation
  - [ ] Write 8 tests for CreditNote model
  - [ ] Create migration for CreditNote model
  - [ ] Test migration rollback

### Deliverables
- ✅ Payment, Receipt, CreditNote models implemented
- ✅ M-Pesa integration service complete
- ✅ 48+ tests passing (Payment: 16, M-Pesa: 14, Receipt: 10, CreditNote: 8)
- ✅ Payment processing functional
- ✅ M-Pesa STK Push working in sandbox

### Success Criteria
- All 48+ Phase 2 tests passing
- Payments can be recorded
- M-Pesa STK Push can be initiated
- Receipts auto-generate
- Credit notes can be created

---

## Phase 3: API Endpoints & Integration (Week 11)

### Objective
Create REST API endpoints for all billing operations and integrate with existing systems.

### Tasks Checklist

- [ ] **Phase 3.1: Service API**
  - [ ] Create ServiceSerializer
  - [ ] Create ServiceCategorySerializer
  - [ ] Create ServiceViewSet
  - [ ] Add service listing endpoint
  - [ ] Add service detail endpoint
  - [ ] Add service search/filter
  - [ ] Add category filtering
  - [ ] Write API tests for services
  - [ ] Document service endpoints

- [ ] **Phase 3.2: Invoice API**
  - [ ] Create InvoiceSerializer
  - [ ] Create InvoiceItemSerializer
  - [ ] Create InvoiceViewSet
  - [ ] Add invoice CRUD endpoints
  - [ ] Add invoice finalize endpoint
  - [ ] Add invoice cancel endpoint
  - [ ] Add invoice item add/remove endpoints
  - [ ] Add discount application endpoint
  - [ ] Add overdue invoices endpoint
  - [ ] Add invoice filtering (status, patient, date)
  - [ ] Write 14 tests for Invoice API
  - [ ] Document invoice endpoints

- [ ] **Phase 3.3: Payment API**
  - [ ] Create PaymentSerializer
  - [ ] Create PaymentViewSet
  - [ ] Add payment recording endpoint
  - [ ] Add receipt generation endpoint
  - [ ] Add M-Pesa initiate endpoint
  - [ ] Add M-Pesa callback endpoint
  - [ ] Add M-Pesa query endpoint
  - [ ] Add payment filtering
  - [ ] Write 12 tests for Payment API
  - [ ] Document payment endpoints

- [ ] **Phase 3.4: Credit Note API**
  - [ ] Create CreditNoteSerializer
  - [ ] Create CreditNoteViewSet
  - [ ] Add credit note request endpoint
  - [ ] Add credit note approve endpoint
  - [ ] Add credit note refund endpoint
  - [ ] Add credit note filtering
  - [ ] Write API tests for credit notes
  - [ ] Document credit note endpoints

- [ ] **Phase 3.5: URL Configuration**
  - [ ] Create billing/urls.py
  - [ ] Register all billing routes
  - [ ] Add billing URLs to main urls.py
  - [ ] Test all endpoint URLs
  - [ ] Document API URL structure

### Deliverables
- ✅ Full REST API for billing operations
- ✅ 26+ API tests passing (Invoice: 14, Payment: 12)
- ✅ API documentation complete
- ✅ All endpoints authenticated and authorized

### Success Criteria
- All 26+ Phase 3 tests passing
- All CRUD operations work via API
- M-Pesa endpoints functional
- Proper error handling
- JWT authentication enforced

---

## Phase 4: Reports & SHA Stub (Week 12)

### Objective
Implement financial reports and SHA claims stub for future integration.

### Tasks Checklist

- [ ] **Phase 4.1: Financial Reports Service**
  - [ ] Create BillingReportService class
  - [ ] Implement daily collection report
  - [ ] Implement revenue summary report
  - [ ] Implement outstanding balances report
  - [ ] Implement service utilization report
  - [ ] Implement payment method analysis
  - [ ] Write 10 tests for reports
  - [ ] Document report formats

- [ ] **Phase 4.2: Report API Endpoints**
  - [ ] Create report endpoints
  - [ ] Add daily collection endpoint
  - [ ] Add revenue summary endpoint
  - [ ] Add outstanding balances endpoint
  - [ ] Add service utilization endpoint
  - [ ] Add payment method analysis endpoint
  - [ ] Add date range filtering
  - [ ] Write API tests for reports
  - [ ] Document report endpoints

- [ ] **Phase 4.3: SHA Claims Stub**
  - [ ] Create SHAClaimsService class (stub)
  - [ ] Implement submit_claim stub method
  - [ ] Implement query_claim_status stub method
  - [ ] Implement get_preauthorization stub method
  - [ ] Add SHA stub flag
  - [ ] Write 6 tests for SHA stub
  - [ ] Document SHA integration plan
  - [ ] Add SHA configuration to settings

- [ ] **Phase 4.4: Admin Interface**
  - [ ] Register all billing models in admin
  - [ ] Customize Service admin
  - [ ] Customize Invoice admin with items inline
  - [ ] Customize Payment admin
  - [ ] Customize Receipt admin
  - [ ] Add admin actions (cancel invoice, void receipt, etc.)
  - [ ] Test admin interface
  - [ ] Document admin usage

- [ ] **Phase 4.5: Integration Testing**
  - [ ] Test complete invoice creation flow
  - [ ] Test payment processing flow
  - [ ] Test M-Pesa end-to-end (sandbox)
  - [ ] Test receipt generation
  - [ ] Test credit note workflow
  - [ ] Test report generation
  - [ ] Test with real encounter data
  - [ ] Test with pharmacy dispensing
  - [ ] Test edge cases and error scenarios
  - [ ] Load test with large datasets

- [ ] **Phase 4.6: Documentation & Cleanup**
  - [ ] Update README with billing setup
  - [ ] Create billing module documentation
  - [ ] Document M-Pesa integration steps
  - [ ] Document SHA stub and future integration
  - [ ] Add code comments where needed
  - [ ] Review all audit logging
  - [ ] Review security considerations
  - [ ] Update API documentation
  - [ ] Create user guide for billing
  - [ ] Add troubleshooting guide

### Deliverables
- ✅ Financial reports implemented
- ✅ SHA claims stub complete
- ✅ 16+ tests passing (Reports: 10, SHA: 6)
- ✅ Admin interface configured
- ✅ Complete documentation
- ✅ All integration tests passing

### Success Criteria
- All 16+ Phase 4 tests passing
- Reports generate accurate data
- SHA stub returns mock responses
- Admin interface fully functional
- End-to-end flows working
- Documentation complete

---

## Overall Progress Tracking

### Test Count Summary

| Component | Planned Tests | Status |
|-----------|--------------|--------|
| Service Models | 10 | ⏳ Pending |
| Invoice Model | 18 | ⏳ Pending |
| InvoiceItem Model | 12 | ⏳ Pending |
| Payment Model | 16 | ⏳ Pending |
| M-Pesa Service | 14 | ⏳ Pending |
| Receipt Model | 10 | ⏳ Pending |
| CreditNote Model | 8 | ⏳ Pending |
| Invoice API | 14 | ⏳ Pending |
| Payment API | 12 | ⏳ Pending |
| Reports | 10 | ⏳ Pending |
| SHA Stub | 6 | ⏳ Pending |
| **TOTAL** | **130** | **0/130** |

### Phase Completion

- [ ] Phase 1: Core Billing Models (0/4 sub-phases)
- [ ] Phase 2: Payment Processing & M-Pesa (0/4 sub-phases)
- [ ] Phase 3: API Endpoints & Integration (0/5 sub-phases)
- [ ] Phase 4: Reports & SHA Stub (0/6 sub-phases)

---

## Dependencies & Prerequisites

### Internal Dependencies
- ✅ `patients` app - Patient model
- ✅ `encounters` app - Encounter model
- ⚠️ `pharmacy` app - Drug, Dispensing models (optional for now)
- ⚠️ `laboratory` app - LabOrder model (not yet implemented)

### External Dependencies
All required dependencies already in pyproject.toml:
- ✅ `requests>=2.31.0` - For M-Pesa API calls
- ✅ `reportlab>=4.4.7` - For PDF receipt generation
- ⚠️ Need to add: `num2words>=0.5.12` - For amount to words conversion

### Configuration Requirements
- [ ] Add M-Pesa credentials to .env
- [ ] Add billing configuration to settings
- [ ] Set up ngrok for M-Pesa callback URL (development)
- [ ] Configure facility details for receipts

---

## Risk Mitigation

| Risk | Probability | Impact | Mitigation |
|------|------------|--------|------------|
| M-Pesa sandbox issues | Medium | High | Use mock testing, fallback to manual testing |
| SHA API unavailable | High | Low | Use stub implementation, defer to Phase 2 |
| Complex payment scenarios | Low | Medium | Comprehensive test coverage |
| Performance with large datasets | Low | Medium | Add database indexes early |
| Integration with pharmacy/lab | Medium | Low | Design for loose coupling |

---

## Testing Strategy

### Unit Tests
- Test each model method independently
- Test all model validations
- Test all business logic
- Mock external services (M-Pesa)

### Integration Tests
- Test API endpoints with authentication
- Test payment flows end-to-end
- Test invoice-payment-receipt workflow
- Test with real database data

### Manual Testing
- Test M-Pesa in Safaricom sandbox
- Test report generation with sample data
- Test admin interface operations
- Test concurrent payment scenarios

---

## Code Quality Standards

All code must meet these standards before PR approval:

- [ ] All tests passing (pytest)
- [ ] Coverage ≥85% (pytest-cov)
- [ ] No linting errors (ruff)
- [ ] No type errors (mypy)
- [ ] No security issues (bandit)
- [ ] Code formatted (black, isort)
- [ ] Audit logging implemented
- [ ] Documentation complete
- [ ] No hardcoded credentials

---

## Rollout Plan

### Development Environment
1. Implement all phases in development
2. Test with SQLite database
3. Use M-Pesa sandbox

### Staging Environment
1. Deploy to staging
2. Test with PostgreSQL
3. Test M-Pesa with real credentials (if available)
4. Load test with sample data

### Production Environment
1. Create deployment checklist
2. Run all migrations
3. Load sample service catalog
4. Configure M-Pesa production credentials
5. Monitor first transactions
6. Collect user feedback

---

## Success Metrics

### Technical Metrics
- ✅ All 130+ tests passing
- ✅ Coverage ≥85%
- ✅ No critical security issues
- ✅ API response time <500ms
- ✅ Zero data loss incidents

### Business Metrics
- ✅ Invoice generation functional
- ✅ Payment recording accurate
- ✅ M-Pesa integration working
- ✅ Receipt generation complete
- ✅ Reports generating accurate data
- ✅ User acceptance achieved

---

## Post-Implementation Tasks

- [ ] User training materials
- [ ] Video tutorials for billing workflows
- [ ] FAQ document
- [ ] Performance optimization review
- [ ] Security audit
- [ ] User feedback collection
- [ ] Plan Phase 2 SHA full integration

---

## Appendix A: File Structure

```
backend/
├── hmis/
│   ├── apps/
│   │   └── billing/
│   │       ├── __init__.py
│   │       ├── admin.py
│   │       ├── apps.py
│   │       ├── models.py
│   │       ├── serializers.py
│   │       ├── views.py
│   │       ├── urls.py
│   │       ├── services/
│   │       │   ├── __init__.py
│   │       │   ├── mpesa.py
│   │       │   └── sha.py
│   │       ├── reports.py
│   │       └── migrations/
│   │           ├── 0001_initial_billing.py
│   │           ├── 0002_invoice_models.py
│   │           ├── 0003_payment_models.py
│   │           ├── 0004_credit_note.py
│   │           ├── 0005_indexes.py
│   │           └── 0006_sample_services.py
│   └── settings/
│       └── base.py  (add billing config)
└── tests/
    └── billing/
        ├── __init__.py
        ├── conftest.py
        ├── test_models/
        │   ├── test_service.py
        │   ├── test_invoice.py
        │   ├── test_invoice_item.py
        │   ├── test_payment.py
        │   ├── test_receipt.py
        │   └── test_credit_note.py
        ├── test_services/
        │   ├── test_mpesa.py
        │   └── test_sha_stub.py
        ├── test_api/
        │   ├── test_invoice_api.py
        │   └── test_payment_api.py
        └── test_reports/
            └── test_reports.py
```

---

## Appendix B: Configuration Template

```python
# Add to hmis/settings/base.py

# Billing Configuration
BILLING_INVOICE_PREFIX = 'INV-'
BILLING_RECEIPT_PREFIX = 'RCP-'
BILLING_PAYMENT_PREFIX = 'PAY-'
BILLING_CREDIT_NOTE_PREFIX = 'CN-'
BILLING_DEFAULT_CURRENCY = 'KES'
BILLING_DEFAULT_DUE_DAYS = 30
BILLING_OVERDUE_GRACE_DAYS = 7

# Facility Configuration
FACILITY_NAME = os.getenv('FACILITY_NAME', '[Your Facility Name]')
FACILITY_KRA_PIN = os.getenv('FACILITY_KRA_PIN', 'P000000000X')
FACILITY_ADDRESS = os.getenv('FACILITY_ADDRESS', '')
FACILITY_PHONE = os.getenv('FACILITY_PHONE', '')

# M-Pesa Configuration
MPESA_ENVIRONMENT = os.getenv('MPESA_ENVIRONMENT', 'sandbox')
MPESA_CONSUMER_KEY = os.getenv('MPESA_CONSUMER_KEY', '')
MPESA_CONSUMER_SECRET = os.getenv('MPESA_CONSUMER_SECRET', '')
MPESA_SHORTCODE = os.getenv('MPESA_SHORTCODE', '174379')
MPESA_PASSKEY = os.getenv('MPESA_PASSKEY', '')
MPESA_CALLBACK_URL = os.getenv('MPESA_CALLBACK_URL', '')

# SHA Configuration (stub)
SHA_ENABLED = os.getenv('SHA_ENABLED', 'false').lower() == 'true'
SHA_API_URL = os.getenv('SHA_API_URL', '')
SHA_API_KEY = os.getenv('SHA_API_KEY', '')
```

---

## Appendix C: .env.example

```bash
# Billing Configuration
FACILITY_NAME=Demo Health Facility
FACILITY_KRA_PIN=P000000000X
FACILITY_ADDRESS=123 Health Street, Nairobi, Kenya
FACILITY_PHONE=+254712345678

# M-Pesa Daraja API (Sandbox)
MPESA_ENVIRONMENT=sandbox
MPESA_CONSUMER_KEY=your_consumer_key_here
MPESA_CONSUMER_SECRET=your_consumer_secret_here
MPESA_SHORTCODE=174379
MPESA_PASSKEY=your_passkey_here
MPESA_CALLBACK_URL=https://your-ngrok-url.ngrok.io/api/billing/payments/mpesa/callback/

# SHA Configuration (Stub - Phase 1)
SHA_ENABLED=false
SHA_API_URL=
SHA_API_KEY=
```

---

**Document Status**: 📋 READY FOR IMPLEMENTATION
**Last Updated**: January 2, 2026
**Next Review**: After Phase 1 completion
