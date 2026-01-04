# Billing Module Implementation Status

## Current Status: Core Implementation Complete ✅

**Last Updated**: January 3, 2026
**Total Tests**: 182 passing
**Overall Test Coverage**: 86.15%
**Sprint**: 1.5-1.6 Track A

---

## Module Coverage Summary

| Component | Coverage | Status | Notes |
|-----------|----------|--------|-------|
| `models.py` | 90.83% | ✅ Complete | Invoice, Payment, Receipt, CreditNote |
| `serializers.py` | 100% | ✅ Complete | All serializers implemented |
| `views.py` | 81.39% | ✅ Complete | CRUD + custom actions |
| `reports.py` | 96.77% | ✅ Complete | 5 report types |
| `services/mpesa.py` | 96.27% | ✅ Complete | STK Push, callback, query |
| `services/sha.py` | 100% | ✅ Complete | Stub implementation |
| `admin.py` | 85.90% | ✅ Complete | All models registered |
| `urls.py` | 100% | ✅ Complete | All routes configured |

---

## What Has Been Implemented

### ✅ Models (100% Complete)

#### ServiceCategory Model
- Category name, code, description
- Display ordering
- Active/inactive status

#### Service Model
- Billable service catalog
- Unit pricing in KES
- SHA code mapping for insurance
- ICD-10 procedure codes
- Active/inactive status

#### Invoice Model
- Auto-generated invoice numbers (INV-YYYYMMDD-XXXX)
- Patient and encounter linkage
- Status workflow: DRAFT → PENDING → PARTIAL → PAID/CANCELLED/OVERDUE
- Discount support (percentage and fixed)
- Due date validation
- SHA claim number tracking
- Methods: `calculate_totals()`, `record_payment()`, `cancel()`, `is_overdue()`

#### InvoiceItem Model
- Line items linked to services, drugs, or lab orders
- Quantity and unit price
- Line total calculation with discount
- Insurance coverage tracking
- SHA code propagation

#### Payment Model
- Auto-generated payment references (PAY-YYYYMMDD-XXXX)
- 5 payment methods: CASH, MPESA, CARD, INSURANCE, BANK_TRANSFER
- Status workflow: PENDING → COMPLETED/FAILED/REFUNDED/REVERSED
- M-Pesa receipt number tracking
- Card details (masked)
- Reversal and refund support
- Methods: `process()`, `reverse()`, `refund()`

#### Receipt Model
- Auto-generated receipt numbers (RCP-YYYYMMDD-XXXX)
- Amount in words conversion
- Facility and patient denormalization
- Void functionality with reason
- PDF generation support

#### CreditNote Model
- Auto-generated credit note numbers (CN-YYYYMMDD-XXXX)
- 4 reasons: OVERCHARGE, SERVICE_NOT_RENDERED, DUPLICATE_BILLING, OTHER
- Approval workflow (self-approval prevented)
- Refund processing

### ✅ API Endpoints (100% Complete)

#### Invoice Endpoints
- `GET /api/billing/invoices/` - List with filters (status, patient, date range)
- `POST /api/billing/invoices/` - Create invoice
- `GET /api/billing/invoices/{id}/` - Get detail
- `PATCH /api/billing/invoices/{id}/` - Update (draft only)
- `POST /api/billing/invoices/{id}/finalize/` - Finalize invoice
- `POST /api/billing/invoices/{id}/cancel/` - Cancel invoice
- `POST /api/billing/invoices/{id}/add_item/` - Add line item
- `DELETE /api/billing/invoices/{id}/remove_item/{item_id}/` - Remove item
- `POST /api/billing/invoices/{id}/apply_discount/` - Apply discount
- `GET /api/billing/invoices/overdue/` - List overdue invoices

#### Payment Endpoints
- `GET /api/billing/payments/` - List payments
- `POST /api/billing/payments/` - Record payment
- `GET /api/billing/payments/{id}/` - Get detail
- `GET /api/billing/payments/{id}/receipt/` - Get/generate receipt

#### M-Pesa Endpoints
- `POST /api/billing/mpesa/initiate/` - Initiate STK Push
- `POST /api/billing/mpesa/callback/` - Receive M-Pesa callback
- `GET /api/billing/mpesa/query/{checkout_id}/` - Query transaction status

#### Credit Note Endpoints
- `GET /api/billing/credit-notes/` - List credit notes
- `POST /api/billing/credit-notes/` - Request credit note
- `POST /api/billing/credit-notes/{id}/approve/` - Approve credit note
- `POST /api/billing/credit-notes/{id}/process-refund/` - Process refund

#### Service Endpoints
- `GET /api/billing/services/` - List with filters (category, active, search)
- `POST /api/billing/services/` - Create service
- `GET /api/billing/services/{id}/` - Get detail
- `PATCH /api/billing/services/{id}/` - Update service
- `DELETE /api/billing/services/{id}/` - Delete service
- `GET /api/billing/categories/` - List service categories
- `GET /api/billing/categories/{id}/` - Get category detail

#### Report Endpoints
- `GET /api/billing/reports/daily-collection/` - Daily collection report
- `GET /api/billing/reports/revenue-summary/` - Revenue summary by period
- `GET /api/billing/reports/outstanding-balances/` - Outstanding invoices
- `GET /api/billing/reports/service-utilization/` - Service usage report
- `GET /api/billing/reports/payment-analysis/` - Payment method analysis

### ✅ Services (100% Complete)

#### MpesaService
- OAuth token management with caching
- Phone number formatting for Kenya (07xx, 01xx, 254xx, +254, 7xx, 1xx)
- STK Push initiation
- Callback processing
- Transaction status queries
- Password generation

#### SHAClaimsService (Stub)
- `submit_claim()` - Mock claim submission
- `query_claim_status()` - Mock status query
- `get_preauthorization()` - Mock preauth request

### ✅ Reports (100% Complete)

#### BillingReportService
- `daily_collection_report(date)` - Total collections, by method, invoice count
- `revenue_summary(start_date, end_date)` - Revenue by category and method
- `outstanding_balances()` - List of unpaid invoices with aging
- `service_utilization(start_date, end_date)` - Service usage statistics
- `payment_method_analysis(start_date, end_date)` - Method breakdown, M-Pesa metrics

---

## Test Summary

| Test Category | Count | Status |
|---------------|-------|--------|
| Service/Category Model Tests | 12 | ✅ |
| Invoice Model Tests | 18 | ✅ |
| Invoice Item Model Tests | 12 | ✅ |
| Payment Model Tests | 16 | ✅ |
| Receipt Model Tests | 10 | ✅ |
| Credit Note Model Tests | 8 | ✅ |
| Invoice API Tests | 15 | ✅ |
| Payment API Tests | 15 | ✅ |
| Service API Tests | 11 | ✅ |
| Report API Tests | 8 | ✅ |
| Report Service Tests | 10 | ✅ |
| M-Pesa Service Tests | 30 | ✅ |
| SHA Stub Tests | 7 | ✅ |
| Admin Tests | 10 | ✅ |
| **TOTAL** | **182** | ✅ |

---

## Remaining Gaps / Future Enhancements ( # TODO: Not in current scope)

### Phase 2 Priorities (Sprint 1.7+)

---

### 1. SHA Full API Integration 🏥

**Current State**: Stub implementation complete (`services/sha.py`)
**Priority**: HIGH
**Estimated Effort**: 2-3 weeks
**Dependencies**: SHA API credentials, SHA API documentation

#### Prerequisites Needed
| Item | Description | Status |
|------|-------------|--------|
| SHA API Credentials | Production consumer key/secret | ⏳ Pending from SHA |
| SHA API Documentation | Official API specs | ⏳ Request from SHA |
| SHA Test Environment | Sandbox for testing | ⏳ Pending |
| SHA Service Codes | Mapping of services to SHA codes | ⏳ Need SHA codebook |
| Facility SHA ID | Registered facility identifier | ⏳ Facility registration |

#### Models to Implement
```python
class SHAClaim(models.Model):
    """SHA insurance claim submission."""
    invoice = models.ForeignKey(Invoice, on_delete=models.PROTECT)
    claim_number = models.CharField(max_length=50, unique=True)
    sha_reference = models.CharField(max_length=100, blank=True)  # SHA-assigned
    status = models.CharField(choices=[
        ('DRAFT', 'Draft'),
        ('SUBMITTED', 'Submitted'),
        ('ACCEPTED', 'Accepted'),
        ('REJECTED', 'Rejected'),
        ('PAID', 'Paid'),
        ('DISPUTED', 'Disputed'),
    ])
    submission_date = models.DateTimeField(null=True)
    response_date = models.DateTimeField(null=True)
    rejection_reason = models.TextField(blank=True)
    approved_amount = models.DecimalField(max_digits=10, decimal_places=2, null=True)
    paid_amount = models.DecimalField(max_digits=10, decimal_places=2, null=True)
    payment_date = models.DateField(null=True)

class SHAPreauthorization(models.Model):
    """Pre-authorization for expensive procedures."""
    patient = models.ForeignKey(Patient, on_delete=models.PROTECT)
    service = models.ForeignKey(Service, on_delete=models.PROTECT)
    preauth_number = models.CharField(max_length=50, unique=True)
    status = models.CharField(choices=['PENDING', 'APPROVED', 'DENIED', 'EXPIRED'])
    requested_amount = models.DecimalField(max_digits=10, decimal_places=2)
    approved_amount = models.DecimalField(max_digits=10, decimal_places=2, null=True)
    valid_from = models.DateField(null=True)
    valid_until = models.DateField(null=True)
    diagnosis_code = models.CharField(max_length=10)  # ICD-10
```

#### API Endpoints to Implement
- `POST /api/billing/sha/claims/` - Submit claim to SHA
- `GET /api/billing/sha/claims/{id}/status/` - Query claim status
- `POST /api/billing/sha/claims/{id}/resubmit/` - Resubmit rejected claim
- `POST /api/billing/sha/preauth/` - Request pre-authorization
- `GET /api/billing/sha/preauth/{id}/status/` - Check preauth status
- `GET /api/billing/sha/patient/{member_id}/eligibility/` - Check patient eligibility
- `POST /api/billing/sha/reconcile/` - Reconcile SHA payments

#### Service Methods to Implement
```python
class SHAClaimsService:
    def verify_member_eligibility(self, member_id: str) -> dict
    def submit_claim(self, invoice: Invoice) -> dict
    def query_claim_status(self, claim_number: str) -> dict
    def request_preauthorization(self, patient, service, diagnosis) -> dict
    def check_preauthorization_status(self, preauth_number: str) -> dict
    def process_claim_response(self, response_data: dict) -> None
    def reconcile_payments(self, start_date, end_date) -> dict
```

#### Tests Required (~25 tests)
- Member eligibility verification (valid, invalid, expired)
- Claim submission (success, validation errors, API errors)
- Claim status tracking (all status transitions)
- Pre-authorization workflow
- Payment reconciliation
- Error handling and retries

---

### 2. Insurance Module 🛡️

**Current State**: Not implemented
**Priority**: HIGH
**Estimated Effort**: 3-4 weeks
**Dependencies**: Insurance provider API access

#### Models to Implement
```python
class InsuranceProvider(models.Model):
    """Insurance company/scheme."""
    name = models.CharField(max_length=200)
    code = models.CharField(max_length=20, unique=True)  # e.g., "JUBILEE", "AAR"
    provider_type = models.CharField(choices=[
        ('PRIVATE', 'Private Insurance'),
        ('CORPORATE', 'Corporate Scheme'),
        ('SHA', 'Social Health Authority'),
        ('OTHER', 'Other'),
    ])
    contact_email = models.EmailField(blank=True)
    contact_phone = models.CharField(max_length=20, blank=True)
    api_endpoint = models.URLField(blank=True)
    api_credentials = models.JSONField(default=dict)  # Encrypted
    is_active = models.BooleanField(default=True)
    payment_terms_days = models.IntegerField(default=30)

class InsurancePlan(models.Model):
    """Specific insurance plan/package."""
    provider = models.ForeignKey(InsuranceProvider, on_delete=models.CASCADE)
    name = models.CharField(max_length=200)
    plan_code = models.CharField(max_length=50)
    coverage_type = models.CharField(choices=[
        ('INPATIENT', 'Inpatient Only'),
        ('OUTPATIENT', 'Outpatient Only'),
        ('COMPREHENSIVE', 'Comprehensive'),
    ])
    annual_limit = models.DecimalField(max_digits=12, decimal_places=2, null=True)
    copay_percentage = models.DecimalField(max_digits=5, decimal_places=2, default=0)
    copay_amount = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    requires_preauth = models.BooleanField(default=False)
    preauth_threshold = models.DecimalField(max_digits=10, decimal_places=2, null=True)

class PatientInsurance(models.Model):
    """Patient's insurance enrollment."""
    patient = models.ForeignKey(Patient, on_delete=models.CASCADE, related_name='insurance_policies')
    plan = models.ForeignKey(InsurancePlan, on_delete=models.PROTECT)
    member_number = models.CharField(max_length=50)
    policy_number = models.CharField(max_length=50, blank=True)
    relationship = models.CharField(choices=[
        ('PRINCIPAL', 'Principal Member'),
        ('SPOUSE', 'Spouse'),
        ('CHILD', 'Child'),
        ('DEPENDENT', 'Other Dependent'),
    ])
    principal_name = models.CharField(max_length=200, blank=True)  # If dependent
    principal_member_number = models.CharField(max_length=50, blank=True)
    effective_date = models.DateField()
    expiry_date = models.DateField(null=True)
    is_active = models.BooleanField(default=True)

class InsuranceClaim(models.Model):
    """Insurance claim for non-SHA providers."""
    invoice = models.ForeignKey(Invoice, on_delete=models.PROTECT)
    patient_insurance = models.ForeignKey(PatientInsurance, on_delete=models.PROTECT)
    claim_number = models.CharField(max_length=50, unique=True)
    status = models.CharField(choices=[
        ('DRAFT', 'Draft'),
        ('SUBMITTED', 'Submitted'),
        ('IN_REVIEW', 'In Review'),
        ('APPROVED', 'Approved'),
        ('PARTIALLY_APPROVED', 'Partially Approved'),
        ('REJECTED', 'Rejected'),
        ('PAID', 'Paid'),
    ])
    submitted_amount = models.DecimalField(max_digits=10, decimal_places=2)
    approved_amount = models.DecimalField(max_digits=10, decimal_places=2, null=True)
    patient_responsibility = models.DecimalField(max_digits=10, decimal_places=2, null=True)
    submission_date = models.DateTimeField(null=True)
    adjudication_date = models.DateTimeField(null=True)
    payment_date = models.DateField(null=True)
    rejection_codes = models.JSONField(default=list)
    notes = models.TextField(blank=True)
```

#### API Endpoints to Implement
- `GET /api/billing/insurance/providers/` - List insurance providers
- `POST /api/billing/insurance/providers/` - Add provider
- `GET /api/billing/insurance/plans/` - List plans (filter by provider)
- `POST /api/billing/patients/{id}/insurance/` - Add patient insurance
- `GET /api/billing/patients/{id}/insurance/` - Get patient's policies
- `POST /api/billing/patients/{id}/insurance/verify/` - Verify coverage
- `POST /api/billing/insurance/claims/` - Submit insurance claim
- `GET /api/billing/insurance/claims/{id}/` - Get claim details
- `POST /api/billing/insurance/claims/{id}/resubmit/` - Resubmit claim
- `GET /api/billing/insurance/remittance/` - View remittance advice

#### Tests Required (~30 tests)
- Provider and plan CRUD
- Patient insurance enrollment
- Coverage verification
- Claim submission and tracking
- Copay calculations
- Pre-authorization workflow
- Remittance processing

---

### 3. Invoice PDF Generation 📄

**Current State**: Not implemented
**Priority**: MEDIUM
**Estimated Effort**: 1-2 weeks
**Dependencies**: `reportlab` or `weasyprint` library

#### Implementation Requirements

**Library Choice**: `weasyprint` (HTML to PDF) or `reportlab` (programmatic PDF)

**Install Dependencies**:
```bash
poetry add weasyprint  # For HTML-based templates
# OR
poetry add reportlab   # For programmatic PDF generation
```

#### Template Requirements
```
Invoice PDF must include:
├── Header
│   ├── Facility logo
│   ├── Facility name, address, phone
│   ├── KRA PIN number
│   └── Invoice title
├── Invoice Details
│   ├── Invoice number
│   ├── Invoice date
│   ├── Due date
│   └── Patient details (name, MRN, phone)
├── Line Items Table
│   ├── # | Description | Qty | Unit Price | Total
│   └── Each service/drug/lab item
├── Totals Section
│   ├── Subtotal
│   ├── Discount (if any)
│   ├── Tax (if applicable)
│   └── Grand Total
├── Payment Information
│   ├── Amount paid
│   ├── Balance due
│   └── Payment methods accepted
└── Footer
    ├── Terms and conditions
    ├── Bank account details
    ├── M-Pesa Paybill/Till
    └── "Computer generated - no signature required"
```

#### Code to Implement
```python
# hmis/apps/billing/pdf.py
from weasyprint import HTML, CSS
from django.template.loader import render_to_string

class InvoicePDFGenerator:
    def __init__(self, invoice: Invoice):
        self.invoice = invoice
    
    def generate(self) -> bytes:
        """Generate PDF bytes for invoice."""
        html_content = render_to_string('billing/invoice_pdf.html', {
            'invoice': self.invoice,
            'items': self.invoice.items.all(),
            'facility': self._get_facility_info(),
            'payment_info': self._get_payment_info(),
        })
        
        pdf = HTML(string=html_content).write_pdf(
            stylesheets=[CSS(filename='billing/invoice_styles.css')]
        )
        return pdf
    
    def save_to_file(self, filepath: str) -> None:
        """Save PDF to filesystem."""
        pdf_bytes = self.generate()
        with open(filepath, 'wb') as f:
            f.write(pdf_bytes)
    
    def _get_facility_info(self) -> dict:
        return {
            'name': settings.FACILITY_NAME,
            'address': settings.FACILITY_ADDRESS,
            'phone': settings.FACILITY_PHONE,
            'email': settings.FACILITY_EMAIL,
            'kra_pin': settings.FACILITY_KRA_PIN,
            'logo_path': settings.FACILITY_LOGO_PATH,
        }
```

#### API Endpoint
- `GET /api/billing/invoices/{id}/pdf/` - Download invoice PDF

#### Templates to Create
- `templates/billing/invoice_pdf.html` - Invoice HTML template
- `static/billing/invoice_styles.css` - PDF styling
- `templates/billing/receipt_pdf.html` - Receipt template

#### Tests Required (~10 tests)
- PDF generation with valid invoice
- PDF includes all required sections
- Line items render correctly
- Totals calculated correctly
- Logo and branding applied
- Empty invoice handling
- Large invoice (many items) handling

---

### 4. Payment Reconciliation 🔄

**Current State**: Not implemented
**Priority**: MEDIUM
**Estimated Effort**: 2-3 weeks
**Dependencies**: Bank statement format specs, M-Pesa statement API

#### Models to Implement
```python
class BankStatement(models.Model):
    """Imported bank statement for reconciliation."""
    account_name = models.CharField(max_length=200)
    account_number = models.CharField(max_length=50)
    bank_name = models.CharField(max_length=100)
    statement_date = models.DateField()
    opening_balance = models.DecimalField(max_digits=12, decimal_places=2)
    closing_balance = models.DecimalField(max_digits=12, decimal_places=2)
    import_date = models.DateTimeField(auto_now_add=True)
    imported_by = models.ForeignKey(User, on_delete=models.PROTECT)
    file = models.FileField(upload_to='statements/')
    status = models.CharField(choices=[
        ('PENDING', 'Pending Reconciliation'),
        ('IN_PROGRESS', 'In Progress'),
        ('COMPLETED', 'Completed'),
        ('PARTIAL', 'Partially Reconciled'),
    ])

class BankTransaction(models.Model):
    """Individual transaction from bank statement."""
    statement = models.ForeignKey(BankStatement, on_delete=models.CASCADE, related_name='transactions')
    transaction_date = models.DateField()
    value_date = models.DateField()
    reference = models.CharField(max_length=100)
    description = models.TextField()
    debit = models.DecimalField(max_digits=12, decimal_places=2, null=True)
    credit = models.DecimalField(max_digits=12, decimal_places=2, null=True)
    balance = models.DecimalField(max_digits=12, decimal_places=2)
    
    # Reconciliation
    is_reconciled = models.BooleanField(default=False)
    matched_payment = models.ForeignKey(Payment, on_delete=models.SET_NULL, null=True)
    reconciled_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True)
    reconciled_at = models.DateTimeField(null=True)
    reconciliation_notes = models.TextField(blank=True)

class MpesaStatement(models.Model):
    """M-Pesa statement for reconciliation."""
    statement_date = models.DateField()
    till_number = models.CharField(max_length=20)
    paybill_number = models.CharField(max_length=20, blank=True)
    import_date = models.DateTimeField(auto_now_add=True)
    imported_by = models.ForeignKey(User, on_delete=models.PROTECT)
    total_received = models.DecimalField(max_digits=12, decimal_places=2)
    transaction_count = models.IntegerField()
    status = models.CharField(choices=['PENDING', 'COMPLETED', 'PARTIAL'])

class MpesaTransaction(models.Model):
    """Individual M-Pesa transaction."""
    statement = models.ForeignKey(MpesaStatement, on_delete=models.CASCADE)
    receipt_number = models.CharField(max_length=20, unique=True)
    transaction_date = models.DateTimeField()
    phone_number = models.CharField(max_length=15)
    sender_name = models.CharField(max_length=100)
    amount = models.DecimalField(max_digits=10, decimal_places=2)
    
    # Reconciliation
    is_reconciled = models.BooleanField(default=False)
    matched_payment = models.ForeignKey(Payment, on_delete=models.SET_NULL, null=True)
    discrepancy_amount = models.DecimalField(max_digits=10, decimal_places=2, null=True)
    discrepancy_reason = models.CharField(max_length=200, blank=True)
```

#### Service Methods
```python
class ReconciliationService:
    def import_bank_statement(self, file, account_info: dict) -> BankStatement
    def import_mpesa_statement(self, file) -> MpesaStatement
    def auto_match_transactions(self, statement_id: int) -> dict
    def manual_match(self, transaction_id: int, payment_id: int) -> None
    def get_unreconciled_payments(self, date_range) -> QuerySet
    def get_unmatched_transactions(self, statement_id: int) -> QuerySet
    def generate_reconciliation_report(self, date_range) -> dict
    def flag_discrepancies(self, threshold: Decimal) -> list
```

#### API Endpoints
- `POST /api/billing/reconciliation/bank/import/` - Import bank statement
- `POST /api/billing/reconciliation/mpesa/import/` - Import M-Pesa statement
- `POST /api/billing/reconciliation/{statement_id}/auto-match/` - Auto-match
- `POST /api/billing/reconciliation/manual-match/` - Manual match
- `GET /api/billing/reconciliation/unreconciled/` - List unreconciled items
- `GET /api/billing/reconciliation/discrepancies/` - List discrepancies
- `GET /api/billing/reconciliation/report/` - Reconciliation report

#### Tests Required (~20 tests)
- Bank statement import (CSV, Excel formats)
- M-Pesa statement import
- Auto-matching by reference/receipt number
- Manual matching
- Discrepancy detection
- Reconciliation report generation

---

### 5. KRA eTIMS Integration 🏛️

**Current State**: Not implemented
**Priority**: HIGH (Legal requirement for VAT-registered businesses)
**Estimated Effort**: 3-4 weeks
**Dependencies**: KRA eTIMS API credentials, eTIMS device registration

#### Prerequisites Needed
| Item | Description | Status |
|------|-------------|--------|
| KRA PIN | Business KRA PIN | ⏳ Facility registration |
| eTIMS Registration | Register on eTIMS portal | ⏳ Pending |
| eTIMS Device | Virtual/Physical TIMS device | ⏳ Pending |
| API Credentials | Client ID and Secret | ⏳ After registration |
| Test Environment | Sandbox access | ⏳ Pending |

#### Models to Implement
```python
class ETIMSInvoice(models.Model):
    """eTIMS-registered invoice."""
    invoice = models.OneToOneField(Invoice, on_delete=models.PROTECT)
    cu_serial_number = models.CharField(max_length=50)  # Control Unit serial
    cu_invoice_number = models.CharField(max_length=50)  # eTIMS invoice number
    qr_code = models.TextField()  # QR code data
    verification_url = models.URLField()
    submission_date = models.DateTimeField()
    status = models.CharField(choices=[
        ('PENDING', 'Pending Submission'),
        ('SUBMITTED', 'Submitted'),
        ('ACCEPTED', 'Accepted'),
        ('REJECTED', 'Rejected'),
    ])
    rejection_reason = models.TextField(blank=True)
    
    # Tax breakdown
    taxable_amount_a = models.DecimalField(max_digits=12, decimal_places=2, default=0)  # 16% VAT
    taxable_amount_b = models.DecimalField(max_digits=12, decimal_places=2, default=0)  # 8% VAT
    taxable_amount_c = models.DecimalField(max_digits=12, decimal_places=2, default=0)  # 0% VAT
    taxable_amount_d = models.DecimalField(max_digits=12, decimal_places=2, default=0)  # Exempt
    tax_amount_a = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    tax_amount_b = models.DecimalField(max_digits=12, decimal_places=2, default=0)

class ETIMSCreditNote(models.Model):
    """eTIMS-registered credit note."""
    credit_note = models.OneToOneField(CreditNote, on_delete=models.PROTECT)
    original_etims_invoice = models.ForeignKey(ETIMSInvoice, on_delete=models.PROTECT)
    cu_credit_note_number = models.CharField(max_length=50)
    qr_code = models.TextField()
    submission_date = models.DateTimeField()
    status = models.CharField(choices=['PENDING', 'SUBMITTED', 'ACCEPTED', 'REJECTED'])
```

#### Service Methods
```python
class ETIMSService:
    def __init__(self):
        self.base_url = settings.ETIMS_API_URL
        self.client_id = settings.ETIMS_CLIENT_ID
        self.client_secret = settings.ETIMS_CLIENT_SECRET
        self.cu_serial = settings.ETIMS_CU_SERIAL
    
    def register_invoice(self, invoice: Invoice) -> ETIMSInvoice
    def register_credit_note(self, credit_note: CreditNote) -> ETIMSCreditNote
    def verify_invoice(self, cu_invoice_number: str) -> dict
    def get_tax_codes(self) -> list  # Fetch valid tax codes
    def generate_qr_code(self, invoice_data: dict) -> str
    def submit_daily_summary(self, date: date) -> dict
    def query_submission_status(self, cu_invoice_number: str) -> dict
```

#### API Endpoints
- `POST /api/billing/etims/invoices/{id}/register/` - Register invoice with eTIMS
- `GET /api/billing/etims/invoices/{id}/status/` - Check registration status
- `GET /api/billing/etims/invoices/{id}/qr/` - Get QR code
- `POST /api/billing/etims/credit-notes/{id}/register/` - Register credit note
- `GET /api/billing/etims/daily-summary/` - Daily eTIMS summary

#### Invoice PDF Updates
- Add QR code to invoice PDF
- Add eTIMS invoice number
- Add verification URL
- Add tax breakdown by category

#### Tests Required (~15 tests)
- Invoice registration with eTIMS
- QR code generation
- Tax calculation by category
- Credit note registration
- Daily summary submission
- Error handling and retries

---

### 6. Mobile App - Payment Initiation 📱

**Current State**: Not implemented
**Priority**: MEDIUM
**Estimated Effort**: 2-3 weeks (backend) + mobile app work
**Dependencies**: Mobile app development, push notification service

#### Backend API Endpoints to Implement

```python
# hmis/apps/billing/views_mobile.py

class MobilePaymentViewSet(viewsets.ViewSet):
    """Payment endpoints optimized for mobile app."""
    
    @action(detail=False, methods=['get'])
    def my_invoices(self, request):
        """Get invoices for the logged-in patient."""
        # Patient-linked user account required
        pass
    
    @action(detail=True, methods=['post'])
    def initiate_payment(self, request, pk=None):
        """Initiate payment from mobile (M-Pesa STK Push)."""
        pass
    
    @action(detail=True, methods=['get'])
    def payment_status(self, request, pk=None):
        """Check payment status (for polling)."""
        pass
```

#### Mobile-Specific API Endpoints
- `GET /api/mobile/billing/invoices/` - List patient's invoices
- `GET /api/mobile/billing/invoices/{id}/` - Invoice detail
- `POST /api/mobile/billing/invoices/{id}/pay/` - Initiate M-Pesa payment
- `GET /api/mobile/billing/payments/{id}/status/` - Payment status
- `GET /api/mobile/billing/receipts/` - List receipts
- `GET /api/mobile/billing/receipts/{id}/pdf/` - Download receipt PDF

#### Push Notification Integration
```python
class PaymentNotificationService:
    def notify_payment_received(self, payment: Payment) -> None:
        """Send push notification when payment is received."""
        # Use Firebase Cloud Messaging or similar
        pass
    
    def notify_invoice_created(self, invoice: Invoice) -> None:
        """Notify patient of new invoice."""
        pass
    
    def notify_payment_reminder(self, invoice: Invoice) -> None:
        """Send payment reminder for overdue invoices."""
        pass
```

#### Models/Updates Needed
```python
class PatientDevice(models.Model):
    """Mobile device registration for push notifications."""
    patient = models.ForeignKey(Patient, on_delete=models.CASCADE)
    device_token = models.CharField(max_length=255)  # FCM token
    device_type = models.CharField(choices=[('IOS', 'iOS'), ('ANDROID', 'Android')])
    is_active = models.BooleanField(default=True)
    last_active = models.DateTimeField(auto_now=True)
```

#### Mobile App Requirements (React Native)
```
screens/
├── BillingScreen.tsx           # Invoice list
├── InvoiceDetailScreen.tsx     # Invoice detail with pay button
├── PaymentScreen.tsx           # M-Pesa payment flow
├── PaymentStatusScreen.tsx     # Payment confirmation
└── ReceiptsScreen.tsx          # Receipt history

components/
├── InvoiceCard.tsx
├── PaymentMethodSelector.tsx
├── MpesaPaymentForm.tsx
└── ReceiptDownloadButton.tsx
```

#### Tests Required (~15 tests)
- Patient invoice listing
- Invoice detail retrieval
- M-Pesa payment initiation from mobile
- Payment status polling
- Push notification delivery
- Receipt PDF download

---

## Implementation Roadmap

| Phase | Feature | Estimated Duration | Priority |
|-------|---------|-------------------|----------|
| 2.1 | SHA Full Integration | 2-3 weeks | HIGH |
| 2.2 | KRA eTIMS Integration | 3-4 weeks | HIGH |
| 2.3 | Insurance Module | 3-4 weeks | HIGH |
| 2.4 | Invoice PDF Generation | 1-2 weeks | MEDIUM |
| 2.5 | Payment Reconciliation | 2-3 weeks | MEDIUM |
| 2.6 | Mobile Payment Integration | 2-3 weeks | MEDIUM |

**Total Estimated Effort**: 13-19 weeks (Phase 2)

---

## Integration Points

### Current Integrations
- ✅ Patient Module - Invoices linked to patients
- ✅ Encounter Module - Invoices linked to encounters
- ✅ Pharmacy Module - Invoice items for drugs (InvoiceItem.drug FK)
- ✅ Laboratory Module - Invoice items for lab orders (InvoiceItem.lab_order FK)
- ✅ RBAC - Permission-based access control

### Pending Integrations
- ⏳ SHA API - Full integration (stub complete)
- ⏳ KRA eTIMS - Tax compliance (Kenya requirement)
- ⏳ Mobile App - Payment initiation from mobile
- ⏳ Private Insurance APIs - Provider-specific integrations
- ⏳ Push Notifications - Firebase Cloud Messaging

---

## Configuration

### Settings (in `.env`)
```
# M-Pesa Daraja API (Sandbox)
MPESA_CONSUMER_KEY=your_consumer_key
MPESA_CONSUMER_SECRET=your_consumer_secret
MPESA_SHORTCODE=174379
MPESA_PASSKEY=bfb279f9aa9bdbcf158e97dd71a467cd2e0c893059b10f78e6b72ada1ed2c919
MPESA_ENV=sandbox
MPESA_CALLBACK_URL=https://your-domain.com/api/billing/mpesa/callback/
```

### Django Settings
```python
# billing-specific settings in base.py
BILLING_SETTINGS = {
    'invoice_prefix': 'INV',
    'payment_prefix': 'PAY',
    'receipt_prefix': 'RCP',
    'credit_note_prefix': 'CN',
    'default_currency': 'KES',
    'default_due_days': 30,
    'vat_rate': Decimal('0.00'),  # Medical services exempt
}
```

---

## Sprint Completion Criteria ✅

- [x] All 6 billing models implemented with validations
- [x] Invoice workflow (create → finalize → pay → close)
- [x] Payment processing (Cash, M-Pesa, Card)
- [x] Receipt generation
- [x] Credit note workflow
- [x] M-Pesa STK Push integration
- [x] SHA claims stub
- [x] 5 financial reports
- [x] Full API coverage
- [x] Admin interface
- [x] 182+ tests passing
- [x] 86%+ coverage

**Sprint 1.5-1.6 Track A: COMPLETE** ✅
