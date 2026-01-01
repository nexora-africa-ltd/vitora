# Sprint 1.5-1.6 Track A: Billing Module - Deliverables

**Sprint Duration**: Weeks 9-12 (Phase 1)
**Status**: 📋 PLANNED
**Target Date**: Q1 2026
**Dependencies**: Sprint 1.3-1.4 (Pharmacy Module, Encounters)

---

## Executive Summary

Track A of Sprint 1.5-1.6 implements a comprehensive Billing Module for Vitora HMIS, enabling invoice generation, payment processing (Cash, M-Pesa, Insurance), receipt generation, and financial reporting. The module is designed for Kenya's healthcare billing context with support for SHA (Social Health Authority) claims and offline-first operation.

### Key Deliverables

| Deliverable | Tests Required | Priority | User Input Needed |
|-------------|----------------|----------|-------------------|
| Service/Fee Model | 10 tests | High | ❌ |
| Invoice Model | 18 tests | High | ❌ |
| Invoice Item Model | 12 tests | High | ❌ |
| Payment Model | 16 tests | High | ❌ |
| M-Pesa Integration | 14 tests | High | ✅ **Credentials Provided** |
| Receipt Model | 10 tests | Medium | ❌ |
| Credit/Refund Model | 8 tests | Medium | ❌ |
| Invoice API | 14 tests | Medium | ❌ |
| Payment API | 12 tests | Medium | ❌ |
| Financial Reports | 10 tests | Medium | ❌ |
| SHA Claims Stub | 6 tests | Low | ✅ **SHA API Docs** |

**Total Planned Tests**: ~130 tests
**Target Coverage**: ≥85%

---

## ⚠️ User Input Required

Before implementation begins, the following inputs are needed:

### 1. M-Pesa Daraja API Sandbox ✅ CONFIGURED

| Item | Value | Status |
|------|-------|--------|
| **Consumer Key** | `Of3TQl...` (in `.env`) | ✅ Provided |
| **Consumer Secret** | `5BuAga...` (in `.env`) | ✅ Provided |
| **Business Shortcode** | `174379` (Sandbox default) | ✅ Configured |
| **Passkey** | `bfb279f9aa...` (Sandbox default) | ✅ Configured |
| **Callback URL** | Will use ngrok for local dev | ⏳ Setup during implementation |

**Note**: The shortcode `174379` and passkey are standard Safaricom sandbox test credentials used by all developers.

**Timeline**: ✅ Ready for implementation

### 2. SHA (Social Health Authority) Integration (LOW PRIORITY - Stub Only)

| Item | Description | Status |
|------|-------------|--------|
| **SHA API Documentation** | Claims submission format | If available, share docs |
| **SHA Test Environment** | Sandbox credentials | If available for testing |
| **Claim Codes** | Service codes for SHA billing | Reference from NHIF/SHA portal |

**Note**: For Sprint 1.5-1.6, we'll implement a **stub/mock** for SHA integration. Full integration planned for Phase 2.

### 3. Facility Configuration

| Item | Description | Default |
|------|-------------|---------|
| **KRA PIN** | For receipt compliance | Mock: P000000000X |
| **Facility Name** | For invoice headers | "[Your Facility Name]" |
| **Invoice Prefix** | Invoice numbering | "INV-" |
| **Receipt Prefix** | Receipt numbering | "RCP-" |
| **Currency** | Billing currency | KES |
| **VAT Rate** | If applicable | 0% (medical exempt) |

---

## Components to Implement

### 1. Service/Fee Catalog Model

**Module**: `hmis/apps/billing/models.py`

**Purpose**: Master catalog of billable services and their fees. Includes consultation fees, procedure fees, and links to pharmacy items.

**Fields**:
```python
class ServiceCategory(models.Model):
    """Category for billable services."""
    
    id = models.BigAutoField(primary_key=True)
    name = models.CharField(max_length=100, unique=True)
    description = models.TextField(blank=True)
    code = models.CharField(max_length=20, unique=True)  # e.g., "CONS", "LAB", "PHARM"
    is_active = models.BooleanField(default=True)
    display_order = models.IntegerField(default=0)
    
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)


class Service(models.Model):
    """Billable service with pricing."""
    
    id = models.BigAutoField(primary_key=True)
    category = models.ForeignKey(ServiceCategory, on_delete=models.PROTECT, related_name='services')
    
    # Service identification
    code = models.CharField(max_length=20, unique=True)  # e.g., "CONS-001", "LAB-CBC"
    name = models.CharField(max_length=200)
    description = models.TextField(blank=True)
    
    # Pricing
    unit_price = models.DecimalField(max_digits=10, decimal_places=2)
    currency = models.CharField(max_length=3, default='KES')
    
    # SHA/Insurance coding
    sha_code = models.CharField(max_length=20, blank=True)  # SHA service code
    icd10_code = models.CharField(max_length=10, blank=True)  # For procedure billing
    
    # Flags
    is_active = models.BooleanField(default=True)
    requires_quantity = models.BooleanField(default=False)  # True for consumables
    is_taxable = models.BooleanField(default=False)  # Medical services typically exempt
    
    # Audit
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT)
    
    class Meta:
        ordering = ['category', 'name']
        indexes = [
            models.Index(fields=['code']),
            models.Index(fields=['sha_code']),
        ]
```

**Methods**:
- `get_display_name()`: "Category - Service Name"
- `calculate_line_total(quantity)`: unit_price × quantity
- `is_available()`: Check if service is active

**Test Coverage**: 10 tests

| Test | Description |
|------|-------------|
| `test_service_creation_with_required_fields` | Service created with category, code, name, price |
| `test_service_code_uniqueness` | Duplicate codes rejected |
| `test_service_category_linkage` | Service must belong to category |
| `test_service_price_positive` | Price must be > 0 |
| `test_sha_code_format` | SHA code follows expected format |
| `test_service_display_name` | Formatted as "Category - Name" |
| `test_calculate_line_total` | Quantity × unit_price |
| `test_inactive_service_not_available` | is_available() returns False |
| `test_service_search_by_name` | Search functionality |
| `test_service_search_by_code` | Search by service code |

---

### 2. Invoice Model

**Module**: `hmis/apps/billing/models.py`

**Purpose**: Track invoices for patient encounters with line items, totals, and payment status.

**Fields**:
```python
class Invoice(models.Model):
    """Patient invoice for services rendered."""
    
    class Status(models.TextChoices):
        DRAFT = 'draft', 'Draft'
        PENDING = 'pending', 'Pending Payment'
        PARTIAL = 'partial', 'Partially Paid'
        PAID = 'paid', 'Paid'
        OVERDUE = 'overdue', 'Overdue'
        CANCELLED = 'cancelled', 'Cancelled'
        WRITTEN_OFF = 'written_off', 'Written Off'
    
    class PaymentType(models.TextChoices):
        CASH = 'cash', 'Cash'
        MPESA = 'mpesa', 'M-Pesa'
        INSURANCE = 'insurance', 'Insurance'
        CORPORATE = 'corporate', 'Corporate Account'
        MIXED = 'mixed', 'Mixed Payment'
    
    id = models.BigAutoField(primary_key=True)
    
    # Invoice identification
    invoice_number = models.CharField(max_length=50, unique=True, editable=False)
    
    # Patient and encounter linkage
    patient = models.ForeignKey('patients.Patient', on_delete=models.PROTECT, related_name='invoices')
    encounter = models.ForeignKey('encounters.Encounter', on_delete=models.PROTECT, 
                                   related_name='invoices', null=True, blank=True)
    
    # Status
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.DRAFT)
    payment_type = models.CharField(max_length=20, choices=PaymentType.choices, default=PaymentType.CASH)
    
    # Dates
    invoice_date = models.DateField(default=date.today)
    due_date = models.DateField()
    
    # Amounts (calculated from items)
    subtotal = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal('0.00'))
    tax_amount = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal('0.00'))
    discount_amount = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal('0.00'))
    discount_reason = models.CharField(max_length=200, blank=True)
    total_amount = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal('0.00'))
    amount_paid = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal('0.00'))
    balance_due = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal('0.00'))
    
    # Insurance/SHA details (if applicable)
    insurance_provider = models.CharField(max_length=100, blank=True)
    insurance_member_no = models.CharField(max_length=50, blank=True)
    sha_claim_number = models.CharField(max_length=50, blank=True)
    insurance_amount = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal('0.00'))
    
    # Notes
    notes = models.TextField(blank=True)
    internal_notes = models.TextField(blank=True)  # Staff-only notes
    
    # Audit
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, 
                                    related_name='invoices_created')
    cancelled_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT,
                                      related_name='invoices_cancelled', null=True, blank=True)
    cancelled_at = models.DateTimeField(null=True, blank=True)
    cancellation_reason = models.TextField(blank=True)
    
    class Meta:
        ordering = ['-invoice_date', '-created_at']
        indexes = [
            models.Index(fields=['invoice_number']),
            models.Index(fields=['patient', 'status']),
            models.Index(fields=['status', 'due_date']),
        ]
```

**Auto-generated Invoice Number Format**: `INV-YYYYMMDD-XXXX`
- Example: `INV-20260115-0042`

**Methods**:
- `generate_invoice_number()`: Auto-generate unique invoice number
- `calculate_totals()`: Sum items, apply discounts, calculate balance
- `add_item(service, quantity, unit_price)`: Add line item
- `remove_item(item_id)`: Remove line item
- `apply_discount(amount, reason)`: Apply discount
- `record_payment(amount, method)`: Record payment, update status
- `cancel(user, reason)`: Cancel invoice
- `is_overdue()`: Check if past due date
- `mark_overdue()`: Update status to overdue
- `get_payment_summary()`: Summary of all payments
- `can_be_edited()`: Only draft invoices can be edited

**Test Coverage**: 18 tests

| Test | Description |
|------|-------------|
| `test_invoice_creation_with_patient` | Invoice created with patient linkage |
| `test_invoice_number_auto_generated` | Invoice number follows format |
| `test_invoice_number_uniqueness` | Duplicate numbers rejected |
| `test_invoice_encounter_linkage` | Optional encounter linkage |
| `test_invoice_due_date_required` | Due date must be set |
| `test_invoice_due_date_not_past` | Due date >= invoice date |
| `test_calculate_totals_from_items` | Subtotal calculated from items |
| `test_discount_applied_to_total` | Total = subtotal - discount |
| `test_balance_due_calculation` | Balance = total - paid |
| `test_status_transition_draft_to_pending` | Finalize invoice |
| `test_status_transition_to_partial` | Partial payment recorded |
| `test_status_transition_to_paid` | Full payment recorded |
| `test_record_payment_updates_balance` | Payment reduces balance |
| `test_overpayment_prevented` | Cannot pay more than balance |
| `test_cancel_invoice` | Cancellation with reason |
| `test_cancelled_invoice_cannot_accept_payment` | Payment rejected |
| `test_is_overdue_check` | Past due date detection |
| `test_draft_invoice_editable` | Only drafts can be modified |

---

### 3. Invoice Item Model

**Module**: `hmis/apps/billing/models.py`

**Purpose**: Individual line items on an invoice, linked to services, pharmacy, or lab.

**Fields**:
```python
class InvoiceItem(models.Model):
    """Line item on an invoice."""
    
    class ItemType(models.TextChoices):
        SERVICE = 'service', 'Service'
        PHARMACY = 'pharmacy', 'Pharmacy Item'
        LAB = 'lab', 'Lab Test'
        CONSUMABLE = 'consumable', 'Consumable'
        OTHER = 'other', 'Other'
    
    id = models.BigAutoField(primary_key=True)
    invoice = models.ForeignKey(Invoice, on_delete=models.CASCADE, related_name='items')
    
    # Item identification
    item_type = models.CharField(max_length=20, choices=ItemType.choices, default=ItemType.SERVICE)
    service = models.ForeignKey('billing.Service', on_delete=models.PROTECT, 
                                 null=True, blank=True, related_name='invoice_items')
    
    # For pharmacy items
    drug = models.ForeignKey('pharmacy.Drug', on_delete=models.PROTECT,
                              null=True, blank=True, related_name='invoice_items')
    dispensing = models.ForeignKey('pharmacy.Dispensing', on_delete=models.PROTECT,
                                    null=True, blank=True, related_name='invoice_items')
    
    # For lab items
    lab_order = models.ForeignKey('laboratory.LabOrder', on_delete=models.PROTECT,
                                   null=True, blank=True, related_name='invoice_items')
    
    # Item details
    description = models.CharField(max_length=300)
    quantity = models.DecimalField(max_digits=10, decimal_places=2, default=Decimal('1.00'))
    unit_price = models.DecimalField(max_digits=10, decimal_places=2)
    
    # Calculated
    line_total = models.DecimalField(max_digits=12, decimal_places=2)
    
    # Discount at item level (optional)
    discount_amount = models.DecimalField(max_digits=10, decimal_places=2, default=Decimal('0.00'))
    discount_reason = models.CharField(max_length=200, blank=True)
    
    # For insurance claims
    sha_code = models.CharField(max_length=20, blank=True)
    is_covered_by_insurance = models.BooleanField(default=False)
    insurance_approved_amount = models.DecimalField(max_digits=10, decimal_places=2, 
                                                      default=Decimal('0.00'))
    
    # Audit
    created_at = models.DateTimeField(auto_now_add=True)
    
    class Meta:
        ordering = ['created_at']
```

**Methods**:
- `calculate_line_total()`: (quantity × unit_price) - discount
- `save()`: Auto-calculate line_total, update invoice totals

**Test Coverage**: 12 tests

| Test | Description |
|------|-------------|
| `test_item_creation_with_service` | Item linked to service |
| `test_item_creation_with_drug` | Item linked to pharmacy drug |
| `test_item_creation_with_lab_order` | Item linked to lab order |
| `test_item_description_required` | Description must be provided |
| `test_quantity_positive` | Quantity must be > 0 |
| `test_unit_price_positive` | Unit price must be > 0 |
| `test_line_total_calculation` | quantity × unit_price |
| `test_line_total_with_discount` | (qty × price) - discount |
| `test_item_save_updates_invoice` | Invoice totals recalculated |
| `test_item_delete_updates_invoice` | Invoice totals recalculated |
| `test_insurance_coverage_flag` | Insurance item tracking |
| `test_sha_code_propagation` | SHA code from service |

---

### 4. Payment Model

**Module**: `hmis/apps/billing/models.py`

**Purpose**: Track payments against invoices with multiple payment methods.

**Fields**:
```python
class Payment(models.Model):
    """Payment record against an invoice."""
    
    class Method(models.TextChoices):
        CASH = 'cash', 'Cash'
        MPESA = 'mpesa', 'M-Pesa'
        CARD = 'card', 'Card'
        BANK_TRANSFER = 'bank_transfer', 'Bank Transfer'
        INSURANCE = 'insurance', 'Insurance Claim'
        CORPORATE = 'corporate', 'Corporate Account'
        CHEQUE = 'cheque', 'Cheque'
    
    class Status(models.TextChoices):
        PENDING = 'pending', 'Pending'
        COMPLETED = 'completed', 'Completed'
        FAILED = 'failed', 'Failed'
        REVERSED = 'reversed', 'Reversed'
        REFUNDED = 'refunded', 'Refunded'
    
    id = models.BigAutoField(primary_key=True)
    
    # Payment identification
    payment_reference = models.CharField(max_length=100, unique=True)
    
    # Linkage
    invoice = models.ForeignKey(Invoice, on_delete=models.PROTECT, related_name='payments')
    
    # Payment details
    method = models.CharField(max_length=20, choices=Method.choices)
    amount = models.DecimalField(max_digits=12, decimal_places=2)
    currency = models.CharField(max_length=3, default='KES')
    
    # Status
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.PENDING)
    
    # Method-specific details (stored as JSON for flexibility)
    payment_details = models.JSONField(default=dict, blank=True)
    # For M-Pesa: {'mpesa_receipt': 'XXX', 'phone': '254...', 'transaction_id': '...'}
    # For Card: {'last_four': '1234', 'card_type': 'visa', 'auth_code': '...'}
    # For Insurance: {'claim_number': '...', 'provider': '...', 'policy_number': '...'}
    
    # M-Pesa specific (for quick access)
    mpesa_receipt_number = models.CharField(max_length=50, blank=True)
    mpesa_transaction_id = models.CharField(max_length=50, blank=True)
    mpesa_phone = models.CharField(max_length=15, blank=True)
    
    # Timestamps
    payment_date = models.DateTimeField(default=timezone.now)
    processed_at = models.DateTimeField(null=True, blank=True)
    
    # Notes
    notes = models.TextField(blank=True)
    failure_reason = models.TextField(blank=True)
    
    # Audit
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    received_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT,
                                     related_name='payments_received')
    
    class Meta:
        ordering = ['-payment_date']
        indexes = [
            models.Index(fields=['payment_reference']),
            models.Index(fields=['mpesa_receipt_number']),
            models.Index(fields=['invoice', 'status']),
        ]
```

**Auto-generated Payment Reference Format**: `PAY-YYYYMMDD-XXXX`

**Methods**:
- `generate_reference()`: Auto-generate unique reference
- `process()`: Mark as completed, update invoice
- `reverse(reason)`: Reverse payment
- `refund(amount, reason)`: Process refund
- `is_mpesa()`: Check if M-Pesa payment
- `validate_amount()`: Amount > 0 and <= invoice balance

**Test Coverage**: 16 tests

| Test | Description |
|------|-------------|
| `test_payment_creation_with_invoice` | Payment linked to invoice |
| `test_payment_reference_auto_generated` | Reference follows format |
| `test_payment_reference_uniqueness` | Duplicate references rejected |
| `test_payment_amount_positive` | Amount must be > 0 |
| `test_payment_amount_not_exceed_balance` | Cannot overpay invoice |
| `test_cash_payment_processing` | Cash payment completed |
| `test_mpesa_payment_with_receipt` | M-Pesa details stored |
| `test_payment_updates_invoice_paid` | Invoice amount_paid updated |
| `test_payment_updates_invoice_status` | Status changes to partial/paid |
| `test_multiple_payments_on_invoice` | Split payment support |
| `test_payment_reversal` | Payment reversed, invoice updated |
| `test_payment_refund` | Refund processed |
| `test_failed_payment_status` | Failed status recorded |
| `test_payment_on_cancelled_invoice` | Payment rejected |
| `test_pending_payment_timeout` | Pending payments expire |
| `test_payment_audit_trail` | received_by recorded |

---

### 5. M-Pesa Integration Service

**Module**: `hmis/apps/billing/services/mpesa.py`

**Purpose**: Integration with Safaricom Daraja API for M-Pesa STK Push payments.

**Implementation**:
```python
from django.conf import settings
import requests
import base64
from datetime import datetime
from typing import Optional, Dict, Any

class MpesaService:
    """M-Pesa Daraja API integration."""
    
    def __init__(self):
        self.consumer_key = settings.MPESA_CONSUMER_KEY
        self.consumer_secret = settings.MPESA_CONSUMER_SECRET
        self.shortcode = settings.MPESA_SHORTCODE
        self.passkey = settings.MPESA_PASSKEY
        self.callback_url = settings.MPESA_CALLBACK_URL
        self.environment = settings.MPESA_ENVIRONMENT  # 'sandbox' or 'production'
        
        self.base_url = (
            'https://sandbox.safaricom.co.ke' if self.environment == 'sandbox'
            else 'https://api.safaricom.co.ke'
        )
    
    def get_access_token(self) -> str:
        """Get OAuth access token from Daraja API."""
        url = f"{self.base_url}/oauth/v1/generate?grant_type=client_credentials"
        credentials = base64.b64encode(
            f"{self.consumer_key}:{self.consumer_secret}".encode()
        ).decode()
        
        response = requests.get(url, headers={
            'Authorization': f'Basic {credentials}'
        })
        response.raise_for_status()
        return response.json()['access_token']
    
    def initiate_stk_push(
        self,
        phone_number: str,
        amount: int,
        account_reference: str,
        transaction_desc: str,
    ) -> Dict[str, Any]:
        """
        Initiate M-Pesa STK Push request.
        
        Args:
            phone_number: Customer phone (254XXXXXXXXX format)
            amount: Amount in KES (integer, no decimals)
            account_reference: Invoice number or reference
            transaction_desc: Description shown to customer
            
        Returns:
            Dict with CheckoutRequestID and response details
        """
        access_token = self.get_access_token()
        timestamp = datetime.now().strftime('%Y%m%d%H%M%S')
        password = base64.b64encode(
            f"{self.shortcode}{self.passkey}{timestamp}".encode()
        ).decode()
        
        url = f"{self.base_url}/mpesa/stkpush/v1/processrequest"
        payload = {
            "BusinessShortCode": self.shortcode,
            "Password": password,
            "Timestamp": timestamp,
            "TransactionType": "CustomerPayBillOnline",
            "Amount": amount,
            "PartyA": phone_number,
            "PartyB": self.shortcode,
            "PhoneNumber": phone_number,
            "CallBackURL": self.callback_url,
            "AccountReference": account_reference,
            "TransactionDesc": transaction_desc,
        }
        
        response = requests.post(url, json=payload, headers={
            'Authorization': f'Bearer {access_token}',
            'Content-Type': 'application/json'
        })
        response.raise_for_status()
        return response.json()
    
    def query_stk_status(self, checkout_request_id: str) -> Dict[str, Any]:
        """Query the status of an STK Push request."""
        access_token = self.get_access_token()
        timestamp = datetime.now().strftime('%Y%m%d%H%M%S')
        password = base64.b64encode(
            f"{self.shortcode}{self.passkey}{timestamp}".encode()
        ).decode()
        
        url = f"{self.base_url}/mpesa/stkpushquery/v1/query"
        payload = {
            "BusinessShortCode": self.shortcode,
            "Password": password,
            "Timestamp": timestamp,
            "CheckoutRequestID": checkout_request_id,
        }
        
        response = requests.post(url, json=payload, headers={
            'Authorization': f'Bearer {access_token}',
            'Content-Type': 'application/json'
        })
        response.raise_for_status()
        return response.json()
    
    def process_callback(self, callback_data: Dict[str, Any]) -> Dict[str, Any]:
        """
        Process M-Pesa callback data.
        
        Returns:
            Parsed callback with success status and transaction details
        """
        result = callback_data.get('Body', {}).get('stkCallback', {})
        result_code = result.get('ResultCode')
        
        if result_code == 0:
            # Successful payment
            metadata = result.get('CallbackMetadata', {}).get('Item', [])
            parsed = {
                'success': True,
                'result_code': result_code,
                'result_desc': result.get('ResultDesc'),
                'checkout_request_id': result.get('CheckoutRequestID'),
                'merchant_request_id': result.get('MerchantRequestID'),
            }
            
            # Extract metadata items
            for item in metadata:
                name = item.get('Name')
                value = item.get('Value')
                if name == 'Amount':
                    parsed['amount'] = value
                elif name == 'MpesaReceiptNumber':
                    parsed['mpesa_receipt'] = value
                elif name == 'PhoneNumber':
                    parsed['phone'] = value
                elif name == 'TransactionDate':
                    parsed['transaction_date'] = value
            
            return parsed
        else:
            return {
                'success': False,
                'result_code': result_code,
                'result_desc': result.get('ResultDesc'),
                'checkout_request_id': result.get('CheckoutRequestID'),
            }
    
    @staticmethod
    def format_phone_number(phone: str) -> str:
        """
        Format phone number to 254XXXXXXXXX format.
        
        Accepts: 0712345678, +254712345678, 254712345678, 712345678
        Returns: 254712345678
        """
        phone = phone.strip().replace(' ', '').replace('-', '')
        
        if phone.startswith('+'):
            phone = phone[1:]
        
        if phone.startswith('0'):
            phone = '254' + phone[1:]
        elif phone.startswith('7') or phone.startswith('1'):
            phone = '254' + phone
        
        return phone
```

**Test Coverage**: 14 tests

| Test | Description |
|------|-------------|
| `test_get_access_token_success` | Token retrieved from sandbox |
| `test_get_access_token_invalid_credentials` | Error on bad credentials |
| `test_stk_push_initiation` | STK push request sent |
| `test_stk_push_invalid_phone` | Validation on phone format |
| `test_stk_push_invalid_amount` | Amount must be positive integer |
| `test_query_stk_status` | Query checkout status |
| `test_process_callback_success` | Successful payment callback |
| `test_process_callback_failure` | Failed payment callback |
| `test_process_callback_cancelled` | User cancelled payment |
| `test_format_phone_07xx` | Format 0712345678 → 254712345678 |
| `test_format_phone_254xx` | Format 254712345678 → unchanged |
| `test_format_phone_plus254` | Format +254712345678 → 254712345678 |
| `test_format_phone_7xx` | Format 712345678 → 254712345678 |
| `test_mpesa_timeout_handling` | Handle timeout gracefully |

**Configuration Required** (`.env`):
```bash
# M-Pesa Daraja API (Sandbox)
MPESA_ENVIRONMENT=sandbox
MPESA_CONSUMER_KEY=your_consumer_key
MPESA_CONSUMER_SECRET=your_consumer_secret
MPESA_SHORTCODE=174379  # Sandbox shortcode
MPESA_PASSKEY=your_passkey
MPESA_CALLBACK_URL=https://your-domain.com/api/billing/mpesa/callback/
```

---

### 6. Receipt Model

**Module**: `hmis/apps/billing/models.py`

**Purpose**: Generate official receipts for payments, with KRA compliance support.

**Fields**:
```python
class Receipt(models.Model):
    """Official receipt for payment."""
    
    id = models.BigAutoField(primary_key=True)
    
    # Receipt identification
    receipt_number = models.CharField(max_length=50, unique=True, editable=False)
    
    # Linkage
    payment = models.OneToOneField(Payment, on_delete=models.PROTECT, related_name='receipt')
    invoice = models.ForeignKey(Invoice, on_delete=models.PROTECT, related_name='receipts')
    patient = models.ForeignKey('patients.Patient', on_delete=models.PROTECT, related_name='receipts')
    
    # Receipt details
    receipt_date = models.DateTimeField(default=timezone.now)
    amount = models.DecimalField(max_digits=12, decimal_places=2)
    amount_in_words = models.CharField(max_length=300)
    payment_method = models.CharField(max_length=20)
    
    # Facility details (denormalized for receipt printing)
    facility_name = models.CharField(max_length=200)
    facility_address = models.TextField()
    facility_phone = models.CharField(max_length=20)
    facility_kra_pin = models.CharField(max_length=20, blank=True)
    
    # Patient details (denormalized)
    patient_name = models.CharField(max_length=200)
    patient_mrn = models.CharField(max_length=50)
    
    # Notes
    notes = models.TextField(blank=True)
    
    # Audit
    created_at = models.DateTimeField(auto_now_add=True)
    issued_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT)
    
    # Void support
    is_voided = models.BooleanField(default=False)
    voided_at = models.DateTimeField(null=True, blank=True)
    voided_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT,
                                   related_name='receipts_voided', null=True, blank=True)
    void_reason = models.TextField(blank=True)
    
    class Meta:
        ordering = ['-receipt_date']
        indexes = [
            models.Index(fields=['receipt_number']),
        ]
```

**Auto-generated Receipt Number Format**: `RCP-YYYYMMDD-XXXX`

**Methods**:
- `generate_receipt_number()`: Auto-generate unique number
- `convert_amount_to_words()`: "One Thousand Two Hundred Shillings Only"
- `void(user, reason)`: Void receipt
- `generate_pdf()`: Generate printable PDF receipt

**Test Coverage**: 10 tests

| Test | Description |
|------|-------------|
| `test_receipt_creation_with_payment` | Receipt linked to payment |
| `test_receipt_number_auto_generated` | Number follows format |
| `test_receipt_number_uniqueness` | Duplicate numbers rejected |
| `test_amount_in_words_conversion` | Correct text conversion |
| `test_receipt_patient_denormalization` | Patient details copied |
| `test_receipt_facility_denormalization` | Facility details copied |
| `test_receipt_void` | Void with reason |
| `test_voided_receipt_cannot_be_voided_again` | Double void prevented |
| `test_receipt_pdf_generation` | PDF created successfully |
| `test_receipt_audit_trail` | issued_by recorded |

---

### 7. Credit/Refund Model

**Module**: `hmis/apps/billing/models.py`

**Purpose**: Track credit notes and refunds.

**Fields**:
```python
class CreditNote(models.Model):
    """Credit note for refunds or adjustments."""
    
    class Reason(models.TextChoices):
        SERVICE_NOT_RENDERED = 'service_not_rendered', 'Service Not Rendered'
        OVERCHARGE = 'overcharge', 'Overcharge Correction'
        DUPLICATE_CHARGE = 'duplicate', 'Duplicate Charge'
        INSURANCE_ADJUSTMENT = 'insurance', 'Insurance Adjustment'
        GOODWILL = 'goodwill', 'Goodwill Gesture'
        OTHER = 'other', 'Other'
    
    class Status(models.TextChoices):
        DRAFT = 'draft', 'Draft'
        APPROVED = 'approved', 'Approved'
        REFUNDED = 'refunded', 'Refunded'
        REJECTED = 'rejected', 'Rejected'
    
    id = models.BigAutoField(primary_key=True)
    
    # Credit note identification
    credit_note_number = models.CharField(max_length=50, unique=True, editable=False)
    
    # Linkage
    invoice = models.ForeignKey(Invoice, on_delete=models.PROTECT, related_name='credit_notes')
    patient = models.ForeignKey('patients.Patient', on_delete=models.PROTECT, related_name='credit_notes')
    original_payment = models.ForeignKey(Payment, on_delete=models.PROTECT, 
                                          related_name='credit_notes', null=True, blank=True)
    
    # Credit details
    amount = models.DecimalField(max_digits=12, decimal_places=2)
    reason = models.CharField(max_length=30, choices=Reason.choices)
    reason_detail = models.TextField()
    
    # Status
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.DRAFT)
    
    # Refund details
    refund_method = models.CharField(max_length=20, blank=True)  # cash, mpesa, etc.
    refund_reference = models.CharField(max_length=100, blank=True)
    refunded_at = models.DateTimeField(null=True, blank=True)
    
    # Approval workflow
    requested_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT,
                                      related_name='credit_notes_requested')
    approved_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT,
                                     related_name='credit_notes_approved', null=True, blank=True)
    approved_at = models.DateTimeField(null=True, blank=True)
    
    # Audit
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        ordering = ['-created_at']
```

**Test Coverage**: 8 tests

| Test | Description |
|------|-------------|
| `test_credit_note_creation` | Credit note with invoice |
| `test_credit_note_number_auto_generated` | Number follows format |
| `test_credit_note_amount_not_exceed_invoice` | Amount <= invoice total |
| `test_approval_workflow` | Draft → Approved → Refunded |
| `test_approval_by_different_user` | Cannot self-approve |
| `test_refund_processing` | Refund details recorded |
| `test_rejected_credit_note` | Rejection with reason |
| `test_credit_note_audit_trail` | All users recorded |

---

### 8. Invoice API Endpoints

**Module**: `hmis/apps/billing/views.py`

**Endpoints**:

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/billing/invoices/` | GET | List invoices (paginated, filterable) |
| `/api/billing/invoices/` | POST | Create new invoice |
| `/api/billing/invoices/{id}/` | GET | Get invoice details |
| `/api/billing/invoices/{id}/` | PATCH | Update draft invoice |
| `/api/billing/invoices/{id}/finalize/` | POST | Finalize invoice (draft → pending) |
| `/api/billing/invoices/{id}/cancel/` | POST | Cancel invoice |
| `/api/billing/invoices/{id}/items/` | GET | List invoice items |
| `/api/billing/invoices/{id}/items/` | POST | Add invoice item |
| `/api/billing/invoices/{id}/items/{item_id}/` | DELETE | Remove invoice item |
| `/api/billing/invoices/{id}/payments/` | GET | List payments for invoice |
| `/api/billing/invoices/{id}/apply-discount/` | POST | Apply discount |
| `/api/billing/invoices/overdue/` | GET | List overdue invoices |
| `/api/billing/services/` | GET | List billable services |
| `/api/billing/services/{id}/` | GET | Get service details |

**Test Coverage**: 14 tests

| Test | Description |
|------|-------------|
| `test_list_invoices_authenticated` | List with pagination |
| `test_list_invoices_filter_by_status` | Filter pending, paid, etc. |
| `test_list_invoices_filter_by_patient` | Filter by patient ID |
| `test_create_invoice` | Create with patient |
| `test_create_invoice_with_encounter` | Create linked to encounter |
| `test_get_invoice_detail` | Full invoice with items |
| `test_update_draft_invoice` | Modify draft |
| `test_update_finalized_invoice_rejected` | Non-draft read-only |
| `test_finalize_invoice` | Status change to pending |
| `test_cancel_invoice` | Cancel with reason |
| `test_add_invoice_item` | Add service item |
| `test_remove_invoice_item` | Remove item, recalculate |
| `test_apply_discount` | Discount with reason |
| `test_list_overdue_invoices` | Filter overdue |

---

### 9. Payment API Endpoints

**Module**: `hmis/apps/billing/views.py`

**Endpoints**:

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/billing/payments/` | GET | List payments |
| `/api/billing/payments/` | POST | Record payment (cash, card) |
| `/api/billing/payments/{id}/` | GET | Get payment details |
| `/api/billing/payments/{id}/receipt/` | GET | Get/generate receipt |
| `/api/billing/payments/mpesa/initiate/` | POST | Initiate M-Pesa STK push |
| `/api/billing/payments/mpesa/callback/` | POST | M-Pesa callback handler |
| `/api/billing/payments/mpesa/query/{checkout_id}/` | GET | Query M-Pesa status |
| `/api/billing/credit-notes/` | GET | List credit notes |
| `/api/billing/credit-notes/` | POST | Request credit note |
| `/api/billing/credit-notes/{id}/approve/` | POST | Approve credit note |
| `/api/billing/credit-notes/{id}/refund/` | POST | Process refund |

**Test Coverage**: 12 tests

| Test | Description |
|------|-------------|
| `test_list_payments` | List with pagination |
| `test_record_cash_payment` | Cash payment processed |
| `test_record_card_payment` | Card payment with details |
| `test_payment_updates_invoice` | Invoice status updated |
| `test_get_receipt` | Receipt generated/retrieved |
| `test_mpesa_initiate_stk` | STK push initiated |
| `test_mpesa_callback_success` | Successful callback processed |
| `test_mpesa_callback_failure` | Failed callback handled |
| `test_mpesa_query_status` | Status query works |
| `test_request_credit_note` | Credit note created |
| `test_approve_credit_note` | Approval workflow |
| `test_process_refund` | Refund recorded |

---

### 10. Financial Reports

**Module**: `hmis/apps/billing/reports.py`

**Reports**:

```python
class BillingReportService:
    """Generate billing and financial reports."""
    
    def daily_collection_report(self, date: date) -> Dict[str, Any]:
        """
        Daily cash collection report.
        
        Returns:
            - Total collections by payment method
            - Invoice count
            - Top services billed
            - Outstanding balances
        """
        pass
    
    def revenue_summary(self, start_date: date, end_date: date) -> Dict[str, Any]:
        """
        Revenue summary for date range.
        
        Returns:
            - Total revenue
            - Revenue by category
            - Revenue by payment method
            - Comparison to previous period
        """
        pass
    
    def outstanding_balances(self) -> List[Dict[str, Any]]:
        """
        List of invoices with outstanding balances.
        
        Returns:
            - Invoice details
            - Patient info
            - Days overdue
            - Total outstanding
        """
        pass
    
    def service_utilization(self, start_date: date, end_date: date) -> Dict[str, Any]:
        """
        Service utilization report.
        
        Returns:
            - Service count
            - Revenue per service
            - Trend analysis
        """
        pass
    
    def payment_method_analysis(self, start_date: date, end_date: date) -> Dict[str, Any]:
        """
        Payment method breakdown.
        
        Returns:
            - Collections by method
            - M-Pesa success rate
            - Average transaction value
        """
        pass
```

**Test Coverage**: 10 tests

| Test | Description |
|------|-------------|
| `test_daily_collection_report` | Correct totals for date |
| `test_daily_collection_by_method` | Breakdown by payment type |
| `test_revenue_summary_date_range` | Sum for period |
| `test_revenue_by_category` | Grouped by service category |
| `test_outstanding_balances_list` | Unpaid invoices listed |
| `test_outstanding_balances_days_overdue` | Correct aging |
| `test_service_utilization_count` | Service usage count |
| `test_service_utilization_revenue` | Revenue per service |
| `test_payment_method_analysis` | Method breakdown |
| `test_mpesa_success_rate` | M-Pesa metrics |

---

### 11. SHA Claims Stub (Future Integration)

**Module**: `hmis/apps/billing/services/sha.py`

**Purpose**: Stub implementation for SHA claims submission (full integration in Phase 2).

**Implementation**:
```python
class SHAClaimsService:
    """
    SHA (Social Health Authority) claims integration stub.
    
    Note: This is a stub for Phase 1. Full integration planned for Phase 2
    when SHA API becomes available.
    """
    
    def __init__(self):
        self.is_stub = True
        
    def submit_claim(self, invoice: Invoice) -> Dict[str, Any]:
        """
        Submit claim to SHA (stub).
        
        Returns mock response for testing.
        """
        if self.is_stub:
            return {
                'success': True,
                'claim_number': f"SHA-STUB-{invoice.invoice_number}",
                'status': 'pending_review',
                'message': 'Stub: Claim submitted for review',
                'submitted_at': timezone.now().isoformat(),
            }
        # Real implementation in Phase 2
        raise NotImplementedError("SHA integration not yet implemented")
    
    def query_claim_status(self, claim_number: str) -> Dict[str, Any]:
        """Query claim status (stub)."""
        if self.is_stub:
            return {
                'claim_number': claim_number,
                'status': 'approved',  # or 'rejected', 'pending'
                'approved_amount': Decimal('1000.00'),
                'message': 'Stub: Claim approved',
            }
        raise NotImplementedError("SHA integration not yet implemented")
    
    def get_preauthorization(self, patient_id: str, service_codes: List[str]) -> Dict[str, Any]:
        """Get preauthorization for services (stub)."""
        if self.is_stub:
            return {
                'preauth_number': f"PA-STUB-{patient_id[:8]}",
                'status': 'approved',
                'valid_until': (timezone.now() + timedelta(days=30)).isoformat(),
                'approved_services': service_codes,
            }
        raise NotImplementedError("SHA integration not yet implemented")
```

**Test Coverage**: 6 tests

| Test | Description |
|------|-------------|
| `test_submit_claim_stub` | Returns mock claim number |
| `test_query_claim_status_stub` | Returns mock status |
| `test_preauthorization_stub` | Returns mock preauth |
| `test_stub_flag_is_set` | is_stub = True |
| `test_invoice_sha_claim_linkage` | Invoice stores claim number |
| `test_sha_service_codes` | Service SHA codes used |

---

## Database Migrations

### Migration Order

1. `0001_initial_billing.py` - ServiceCategory, Service models
2. `0002_invoice_models.py` - Invoice, InvoiceItem models
3. `0003_payment_models.py` - Payment, Receipt models
4. `0004_credit_note.py` - CreditNote model
5. `0005_indexes.py` - Performance indexes

### Sample Data Migration

```python
# 0006_sample_services.py
def create_sample_services(apps, schema_editor):
    ServiceCategory = apps.get_model('billing', 'ServiceCategory')
    Service = apps.get_model('billing', 'Service')
    
    # Create categories
    consultation = ServiceCategory.objects.create(
        name='Consultation',
        code='CONS',
        description='Doctor consultation services'
    )
    
    lab = ServiceCategory.objects.create(
        name='Laboratory',
        code='LAB',
        description='Laboratory tests'
    )
    
    # Create sample services
    Service.objects.create(
        category=consultation,
        code='CONS-GEN',
        name='General Consultation',
        unit_price=Decimal('500.00'),
        sha_code='SHA-CONS-001',
    )
    
    Service.objects.create(
        category=consultation,
        code='CONS-SPEC',
        name='Specialist Consultation',
        unit_price=Decimal('1500.00'),
        sha_code='SHA-CONS-002',
    )
    
    Service.objects.create(
        category=lab,
        code='LAB-CBC',
        name='Complete Blood Count',
        unit_price=Decimal('800.00'),
        sha_code='SHA-LAB-001',
    )
```

---

## Settings Configuration

Add to `hmis/settings/base.py`:

```python
# Billing Configuration
BILLING_INVOICE_PREFIX = 'INV-'
BILLING_RECEIPT_PREFIX = 'RCP-'
BILLING_PAYMENT_PREFIX = 'PAY-'
BILLING_CREDIT_NOTE_PREFIX = 'CN-'
BILLING_DEFAULT_CURRENCY = 'KES'
BILLING_DEFAULT_DUE_DAYS = 30  # Days until invoice due
BILLING_OVERDUE_GRACE_DAYS = 7  # Grace period before marking overdue

# M-Pesa Configuration (from environment)
MPESA_ENVIRONMENT = env('MPESA_ENVIRONMENT', default='sandbox')
MPESA_CONSUMER_KEY = env('MPESA_CONSUMER_KEY', default='')
MPESA_CONSUMER_SECRET = env('MPESA_CONSUMER_SECRET', default='')
MPESA_SHORTCODE = env('MPESA_SHORTCODE', default='174379')
MPESA_PASSKEY = env('MPESA_PASSKEY', default='')
MPESA_CALLBACK_URL = env('MPESA_CALLBACK_URL', default='')

# SHA Configuration (stub for now)
SHA_ENABLED = env.bool('SHA_ENABLED', default=False)
SHA_API_URL = env('SHA_API_URL', default='')
SHA_API_KEY = env('SHA_API_KEY', default='')
```

---

## Implementation Timeline

| Week | Tasks | Deliverables |
|------|-------|--------------|
| **Week 9** | Service/Fee models, Invoice model, tests | Models with 30+ tests passing |
| **Week 10** | Payment model, M-Pesa integration, tests | M-Pesa STK working in sandbox |
| **Week 11** | Receipt, Credit Note, APIs, tests | Full API suite |
| **Week 12** | Reports, integration testing, documentation | Complete billing module |

---

## Dependencies

### Internal Dependencies
- `patients` app - Patient model
- `encounters` app - Encounter model
- `pharmacy` app - Drug, Dispensing models (for pharmacy billing)
- `laboratory` app - LabOrder model (for lab billing)

### External Dependencies
```
# Add to pyproject.toml
requests>=2.31.0  # For M-Pesa API calls
num2words>=0.5.12  # For amount to words conversion
weasyprint>=60.0  # For PDF receipt generation (optional)
```

---

## Risk Mitigation

| Risk | Impact | Mitigation |
|------|--------|------------|
| M-Pesa sandbox issues | High | Early credential setup, fallback to mock |
| SHA API unavailable | Medium | Stub implementation, defer full integration |
| Complex invoice scenarios | Medium | Comprehensive test coverage |
| Performance with large datasets | Low | Database indexes, pagination |

---

## Success Criteria

- [ ] All 130+ tests passing
- [ ] ≥85% code coverage
- [ ] M-Pesa STK Push working in sandbox
- [ ] Invoice CRUD operations functional
- [ ] Payment recording for all methods
- [ ] Receipt generation (PDF)
- [ ] Daily collection report accurate
- [ ] API documentation complete
- [ ] No critical security issues

---

## Appendix: Sample Test File Structure

```
backend/tests/
├── billing/
│   ├── __init__.py
│   ├── conftest.py              # Billing fixtures
│   ├── test_models/
│   │   ├── test_service.py      # 10 tests
│   │   ├── test_invoice.py      # 18 tests
│   │   ├── test_invoice_item.py # 12 tests
│   │   ├── test_payment.py      # 16 tests
│   │   ├── test_receipt.py      # 10 tests
│   │   └── test_credit_note.py  # 8 tests
│   ├── test_services/
│   │   ├── test_mpesa.py        # 14 tests
│   │   └── test_sha_stub.py     # 6 tests
│   ├── test_api/
│   │   ├── test_invoice_api.py  # 14 tests
│   │   └── test_payment_api.py  # 12 tests
│   └── test_reports/
│       └── test_reports.py      # 10 tests
```

---

**Document Version**: 1.0
**Created**: January 2, 2026
**Author**: Engineering Team
**Review Status**: DRAFT - Pending stakeholder review
