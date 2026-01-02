"""
Billing models for Vitora HMIS.

This module contains all billing-related models including:
- ServiceCategory: Categories for billable services
- Service: Master catalog of billable services with pricing
- Invoice: Patient invoices for services rendered
- InvoiceItem: Individual line items on invoices
- Payment: Payment records against invoices
- Receipt: Official receipts for payments
- CreditNote: Credit notes for refunds or adjustments

All models follow TDD approach and Kenya healthcare billing requirements.
"""

from datetime import date, timedelta
from decimal import Decimal

from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import models
from django.utils import timezone


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
    
    class Meta:
        verbose_name = "Service Category"
        verbose_name_plural = "Service Categories"
        ordering = ['display_order', 'name']
    
    def __str__(self):
        return self.name


class Service(models.Model):
    """Billable service with pricing."""
    
    id = models.BigAutoField(primary_key=True)
    category = models.ForeignKey(
        ServiceCategory, 
        on_delete=models.PROTECT, 
        related_name='services'
    )
    
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
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, 
        on_delete=models.PROTECT,
        related_name='services_created'
    )
    
    class Meta:
        ordering = ['category', 'name']
        indexes = [
            models.Index(fields=['code']),
            models.Index(fields=['sha_code']),
        ]
    
    def __str__(self):
        return f"{self.code} - {self.name}"
    
    def clean(self):
        """Validate service data."""
        if self.unit_price is not None and self.unit_price <= 0:
            raise ValidationError({'unit_price': 'Unit price must be greater than 0.'})
    
    def save(self, *args, **kwargs):
        """Override save to run validation."""
        self.full_clean()
        super().save(*args, **kwargs)
    
    def get_display_name(self) -> str:
        """Return formatted display name."""
        return f"{self.category.name} - {self.name}"
    
    def calculate_line_total(self, quantity: Decimal) -> Decimal:
        """Calculate line total for given quantity."""
        return self.unit_price * quantity
    
    def is_available(self) -> bool:
        """Check if service is available for billing."""
        return self.is_active


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
    patient = models.ForeignKey(
        'patients.Patient', 
        on_delete=models.PROTECT, 
        related_name='invoices'
    )
    encounter = models.ForeignKey(
        'encounters.Encounter', 
        on_delete=models.PROTECT,
        related_name='invoices', 
        null=True, 
        blank=True
    )
    
    # Status
    status = models.CharField(
        max_length=20, 
        choices=Status.choices, 
        default=Status.DRAFT
    )
    payment_type = models.CharField(
        max_length=20, 
        choices=PaymentType.choices, 
        default=PaymentType.CASH
    )
    
    # Dates
    invoice_date = models.DateField(default=date.today)
    due_date = models.DateField()
    
    # Amounts (calculated from items)
    subtotal = models.DecimalField(
        max_digits=12, 
        decimal_places=2, 
        default=Decimal('0.00')
    )
    tax_amount = models.DecimalField(
        max_digits=12, 
        decimal_places=2, 
        default=Decimal('0.00')
    )
    discount_amount = models.DecimalField(
        max_digits=12, 
        decimal_places=2, 
        default=Decimal('0.00')
    )
    discount_reason = models.CharField(max_length=200, blank=True)
    total_amount = models.DecimalField(
        max_digits=12, 
        decimal_places=2, 
        default=Decimal('0.00')
    )
    amount_paid = models.DecimalField(
        max_digits=12, 
        decimal_places=2, 
        default=Decimal('0.00')
    )
    balance_due = models.DecimalField(
        max_digits=12, 
        decimal_places=2, 
        default=Decimal('0.00')
    )
    
    # Insurance/SHA details (if applicable)
    insurance_provider = models.CharField(max_length=100, blank=True)
    insurance_member_no = models.CharField(max_length=50, blank=True)
    sha_claim_number = models.CharField(max_length=50, blank=True)
    insurance_amount = models.DecimalField(
        max_digits=12, 
        decimal_places=2, 
        default=Decimal('0.00')
    )
    
    # Notes
    notes = models.TextField(blank=True)
    internal_notes = models.TextField(blank=True)  # Staff-only notes
    
    # Audit
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, 
        on_delete=models.PROTECT,
        related_name='invoices_created'
    )
    cancelled_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, 
        on_delete=models.PROTECT,
        related_name='invoices_cancelled', 
        null=True, 
        blank=True
    )
    cancelled_at = models.DateTimeField(null=True, blank=True)
    cancellation_reason = models.TextField(blank=True)
    
    class Meta:
        ordering = ['-invoice_date', '-created_at']
        indexes = [
            models.Index(fields=['invoice_number']),
            models.Index(fields=['patient', 'status']),
            models.Index(fields=['status', 'due_date']),
        ]
    
    def __str__(self):
        return f"{self.invoice_number} - {self.patient}"
    
    def clean(self):
        """Validate invoice data."""
        if self.due_date and self.invoice_date and self.due_date < self.invoice_date:
            raise ValidationError({
                'due_date': 'Due date must be on or after invoice date.'
            })
    
    def save(self, *args, **kwargs):
        """Override save to generate invoice number and validate."""
        if not self.invoice_number:
            self.invoice_number = self.generate_invoice_number()
        if not self.due_date:
            self.due_date = self.invoice_date + timedelta(
                days=settings.BILLING_DEFAULT_DUE_DAYS
            )
        self.full_clean()
        super().save(*args, **kwargs)
    
    @staticmethod
    def generate_invoice_number() -> str:
        """Generate unique invoice number in format INV-YYYYMMDD-XXXX."""
        from datetime import date
        
        today = date.today()
        date_str = today.strftime('%Y%m%d')
        prefix = f"{settings.BILLING_INVOICE_PREFIX}{date_str}-"
        
        # Get the last invoice number for today
        last_invoice = Invoice.objects.filter(
            invoice_number__startswith=prefix
        ).order_by('-invoice_number').first()
        
        if last_invoice:
            # Extract the sequence number and increment
            last_seq = int(last_invoice.invoice_number.split('-')[-1])
            new_seq = last_seq + 1
        else:
            new_seq = 1
        
        return f"{prefix}{new_seq:04d}"
    
    def calculate_totals(self):
        """Calculate invoice totals from items."""
        items = self.items.all()
        self.subtotal = sum(item.line_total for item in items) if items else Decimal('0.00')
        self.total_amount = self.subtotal - self.discount_amount + self.tax_amount
        self.balance_due = self.total_amount - self.amount_paid
        self.save(update_fields=[
            'subtotal', 
            'total_amount', 
            'balance_due', 
            'updated_at'
        ])
    
    def apply_discount(self, amount: Decimal, reason: str):
        """Apply discount to invoice."""
        if amount < 0:
            raise ValidationError("Discount amount must be positive.")
        if amount > self.subtotal:
            raise ValidationError("Discount cannot exceed subtotal.")
        
        self.discount_amount = amount
        self.discount_reason = reason
        self.calculate_totals()
    
    def record_payment(self, amount: Decimal):
        """Record payment and update status."""
        if amount <= 0:
            raise ValidationError("Payment amount must be positive.")
        
        # Prevent payment on cancelled invoices
        if self.status == self.Status.CANCELLED:
            raise ValidationError("Cannot record payment on cancelled invoice.")
        
        new_paid = self.amount_paid + amount
        if new_paid > self.total_amount:
            raise ValidationError("Payment exceeds invoice total.")
        
        self.amount_paid = new_paid
        self.balance_due = self.total_amount - self.amount_paid
        
        # Update status
        if self.balance_due == 0:
            self.status = self.Status.PAID
        elif self.amount_paid > 0:
            self.status = self.Status.PARTIAL
        
        self.save(update_fields=[
            'amount_paid', 
            'balance_due', 
            'status', 
            'updated_at'
        ])
    
    def cancel(self, user, reason: str):
        """Cancel the invoice."""
        if self.status == self.Status.CANCELLED:
            raise ValidationError("Invoice is already cancelled.")
        if self.status == self.Status.PAID:
            raise ValidationError("Cannot cancel a paid invoice.")
        
        self.status = self.Status.CANCELLED
        self.cancelled_by = user
        self.cancelled_at = timezone.now()
        self.cancellation_reason = reason
        self.save()
    
    def is_overdue(self) -> bool:
        """Check if invoice is past due date."""
        if self.status in [self.Status.PAID, self.Status.CANCELLED]:
            return False
        return date.today() > self.due_date
    
    def mark_overdue(self):
        """Mark invoice as overdue if past grace period."""
        grace_period = timedelta(days=settings.BILLING_OVERDUE_GRACE_DAYS)
        if date.today() > (self.due_date + grace_period):
            if self.status in [self.Status.PENDING, self.Status.PARTIAL]:
                self.status = self.Status.OVERDUE
                self.save(update_fields=['status', 'updated_at'])
    
    def can_be_edited(self) -> bool:
        """Check if invoice can be edited."""
        return self.status == self.Status.DRAFT


class InvoiceItem(models.Model):
    """Line item on an invoice."""
    
    class ItemType(models.TextChoices):
        SERVICE = 'service', 'Service'
        PHARMACY = 'pharmacy', 'Pharmacy Item'
        LAB = 'lab', 'Lab Test'
        CONSUMABLE = 'consumable', 'Consumable'
        OTHER = 'other', 'Other'
    
    id = models.BigAutoField(primary_key=True)
    invoice = models.ForeignKey(
        Invoice, 
        on_delete=models.CASCADE, 
        related_name='items'
    )
    
    # Item identification
    item_type = models.CharField(
        max_length=20, 
        choices=ItemType.choices, 
        default=ItemType.SERVICE
    )
    service = models.ForeignKey(
        'billing.Service', 
        on_delete=models.PROTECT,
        null=True, 
        blank=True, 
        related_name='invoice_items'
    )
    
    # For pharmacy items (future integration)
    drug = models.ForeignKey(
        'pharmacy.Drug', 
        on_delete=models.PROTECT,
        null=True, 
        blank=True, 
        related_name='invoice_items'
    )
    dispensing = models.ForeignKey(
        'pharmacy.Dispensing', 
        on_delete=models.PROTECT,
        null=True, 
        blank=True, 
        related_name='invoice_items'
    )
    
    # For lab items (future integration)
    lab_order = models.ForeignKey(
        'laboratory.LabOrder', 
        on_delete=models.PROTECT,
        null=True, 
        blank=True, 
        related_name='invoice_items'
    )
    
    # Item details
    description = models.CharField(max_length=300)
    quantity = models.DecimalField(
        max_digits=10, 
        decimal_places=2, 
        default=Decimal('1.00')
    )
    unit_price = models.DecimalField(max_digits=10, decimal_places=2)
    
    # Calculated
    line_total = models.DecimalField(max_digits=12, decimal_places=2)
    
    # Discount at item level (optional)
    discount_amount = models.DecimalField(
        max_digits=10, 
        decimal_places=2, 
        default=Decimal('0.00')
    )
    discount_reason = models.CharField(max_length=200, blank=True)
    
    # For insurance claims
    sha_code = models.CharField(max_length=20, blank=True)
    is_covered_by_insurance = models.BooleanField(default=False)
    insurance_approved_amount = models.DecimalField(
        max_digits=10, 
        decimal_places=2,
        default=Decimal('0.00')
    )
    
    # Audit
    created_at = models.DateTimeField(auto_now_add=True)
    
    class Meta:
        ordering = ['created_at']
    
    def __str__(self):
        return f"{self.description} - {self.quantity} x {self.unit_price}"
    
    def clean(self):
        """Validate invoice item data."""
        if self.quantity is not None and self.quantity <= 0:
            raise ValidationError({'quantity': 'Quantity must be greater than 0.'})
        if self.unit_price is not None and self.unit_price <= 0:
            raise ValidationError({'unit_price': 'Unit price must be greater than 0.'})
    
    def calculate_line_total(self) -> Decimal:
        """Calculate line total."""
        from decimal import Decimal, ROUND_HALF_UP
        line_total = (self.quantity * self.unit_price) - self.discount_amount
        # Round to 2 decimal places to avoid validation errors
        return line_total.quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)
    
    def save(self, *args, **kwargs):
        """Override save to calculate line total and update invoice."""
        # Calculate line_total before validation if not set
        if not self.line_total:
            self.line_total = self.calculate_line_total()
        self.full_clean()
        self.line_total = self.calculate_line_total()  # Recalculate after validation
        super().save(*args, **kwargs)
        # Update invoice totals
        self.invoice.calculate_totals()
    
    def delete(self, *args, **kwargs):
        """Override delete to update invoice totals."""
        invoice = self.invoice
        super().delete(*args, **kwargs)
        invoice.calculate_totals()


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
    payment_reference = models.CharField(max_length=100, unique=True, editable=False)
    
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
    received_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, 
        on_delete=models.PROTECT,
        related_name='payments_received'
    )
    
    class Meta:
        ordering = ['-payment_date']
        indexes = [
            models.Index(fields=['payment_reference']),
            models.Index(fields=['mpesa_receipt_number']),
            models.Index(fields=['invoice', 'status']),
        ]
    
    def __str__(self):
        return f"{self.payment_reference} - {self.amount}"
    
    def clean(self):
        """Validate payment data."""
        if self.amount is not None and self.amount <= 0:
            raise ValidationError({'amount': 'Payment amount must be greater than 0.'})
        
        # Skip balance validation if payment is being reversed or refunded
        if self.pk and self.status in [self.Status.REVERSED, self.Status.REFUNDED]:
            return
        
        # Check invoice balance
        if self.invoice and self.amount:
            if self.amount > self.invoice.balance_due:
                raise ValidationError({'amount': 'Payment amount exceeds invoice balance.'})
        
        # Check invoice status
        if self.invoice and self.invoice.status == Invoice.Status.CANCELLED:
            raise ValidationError('Cannot create payment for cancelled invoice.')
    
    def save(self, *args, **kwargs):
        """Override save to generate payment reference and validate."""
        if not self.payment_reference:
            self.payment_reference = self.generate_reference()
        self.full_clean()
        super().save(*args, **kwargs)
    
    @staticmethod
    def generate_reference() -> str:
        """Generate unique payment reference in format PAY-YYYYMMDD-XXXX."""
        today = date.today()
        date_str = today.strftime('%Y%m%d')
        prefix = f"{settings.BILLING_PAYMENT_PREFIX}{date_str}-"
        
        # Get the last payment reference for today
        last_payment = Payment.objects.filter(
            payment_reference__startswith=prefix
        ).order_by('-payment_reference').first()
        
        if last_payment:
            last_seq = int(last_payment.payment_reference.split('-')[-1])
            new_seq = last_seq + 1
        else:
            new_seq = 1
        
        return f"{prefix}{new_seq:04d}"
    
    def process(self):
        """Mark payment as completed and update invoice."""
        self.status = self.Status.COMPLETED
        self.processed_at = timezone.now()
        self.save(update_fields=['status', 'processed_at', 'updated_at'])
        
        # Update invoice
        self.invoice.record_payment(self.amount)
    
    def reverse(self, reason: str):
        """Reverse payment."""
        if self.status != self.Status.COMPLETED:
            raise ValidationError("Can only reverse completed payments.")
        
        self.status = self.Status.REVERSED
        self.failure_reason = reason
        self.save(update_fields=['status', 'failure_reason', 'updated_at'])
        
        # Update invoice (reverse the payment)
        self.invoice.amount_paid -= self.amount
        self.invoice.balance_due = self.invoice.total_amount - self.invoice.amount_paid
        
        # Update status
        if self.invoice.amount_paid == 0:
            self.invoice.status = Invoice.Status.PENDING
        elif self.invoice.amount_paid > 0:
            self.invoice.status = Invoice.Status.PARTIAL
        
        self.invoice.save(update_fields=['amount_paid', 'balance_due', 'status', 'updated_at'])
    
    def refund(self, amount: Decimal, reason: str):
        """Process refund."""
        if amount <= 0 or amount > self.amount:
            raise ValidationError("Invalid refund amount.")
        
        self.status = self.Status.REFUNDED
        self.notes = f"Refund: {reason}"
        self.save(update_fields=['status', 'notes', 'updated_at'])
    
    def is_mpesa(self) -> bool:
        """Check if M-Pesa payment."""
        return self.method == self.Method.MPESA


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
    voided_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, 
        on_delete=models.PROTECT,
        related_name='receipts_voided', 
        null=True, 
        blank=True
    )
    void_reason = models.TextField(blank=True)
    
    class Meta:
        ordering = ['-receipt_date']
        indexes = [
            models.Index(fields=['receipt_number']),
        ]
    
    def __str__(self):
        return f"{self.receipt_number} - {self.amount}"
    
    def save(self, *args, **kwargs):
        """Override save to generate receipt number and convert amount."""
        if not self.receipt_number:
            self.receipt_number = self.generate_receipt_number()
        if not self.amount_in_words:
            self.amount_in_words = self.convert_amount_to_words()
        super().save(*args, **kwargs)
    
    @staticmethod
    def generate_receipt_number() -> str:
        """Generate unique receipt number in format RCP-YYYYMMDD-XXXX."""
        today = date.today()
        date_str = today.strftime('%Y%m%d')
        prefix = f"{settings.BILLING_RECEIPT_PREFIX}{date_str}-"
        
        # Get the last receipt number for today
        last_receipt = Receipt.objects.filter(
            receipt_number__startswith=prefix
        ).order_by('-receipt_number').first()
        
        if last_receipt:
            last_seq = int(last_receipt.receipt_number.split('-')[-1])
            new_seq = last_seq + 1
        else:
            new_seq = 1
        
        return f"{prefix}{new_seq:04d}"
    
    def convert_amount_to_words(self) -> str:
        """Convert amount to words."""
        from num2words import num2words
        # num2words doesn't support KES directly, so use generic currency
        amount_int = int(self.amount)
        amount_cents = int((self.amount - amount_int) * 100)
        
        if amount_cents > 0:
            words = f"{num2words(amount_int).title()} Shillings and {num2words(amount_cents).title()} Cents Only"
        else:
            words = f"{num2words(amount_int).title()} Shillings Only"
        
        return words
    
    def void(self, user, reason: str):
        """Void receipt."""
        if self.is_voided:
            raise ValidationError("Receipt is already voided.")
        
        self.is_voided = True
        self.voided_by = user
        self.voided_at = timezone.now()
        self.void_reason = reason
        self.save()
    
    def generate_pdf(self):
        """Generate printable PDF receipt."""
        # Placeholder for PDF generation
        # In full implementation, use reportlab to generate PDF
        return b"PDF_DATA_HERE"


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
    original_payment = models.ForeignKey(
        Payment, 
        on_delete=models.PROTECT,
        related_name='credit_notes', 
        null=True, 
        blank=True
    )
    
    # Credit details
    amount = models.DecimalField(max_digits=12, decimal_places=2)
    reason = models.CharField(max_length=30, choices=Reason.choices)
    reason_detail = models.TextField()
    
    # Status
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.DRAFT)
    
    # Refund details
    refund_method = models.CharField(max_length=20, blank=True)
    refund_reference = models.CharField(max_length=100, blank=True)
    refunded_at = models.DateTimeField(null=True, blank=True)
    
    # Approval workflow
    requested_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, 
        on_delete=models.PROTECT,
        related_name='credit_notes_requested'
    )
    approved_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, 
        on_delete=models.PROTECT,
        related_name='credit_notes_approved', 
        null=True, 
        blank=True
    )
    approved_at = models.DateTimeField(null=True, blank=True)
    
    # Audit
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        ordering = ['-created_at']
    
    def __str__(self):
        return f"{self.credit_note_number} - {self.amount}"
    
    def clean(self):
        """Validate credit note data."""
        if self.amount is not None and self.amount <= 0:
            raise ValidationError({'amount': 'Credit note amount must be greater than 0.'})
        
        # Check against invoice total
        if self.invoice and self.amount and self.amount > self.invoice.total_amount:
            raise ValidationError({'amount': 'Credit note amount cannot exceed invoice total.'})
    
    def save(self, *args, **kwargs):
        """Override save to generate credit note number and validate."""
        if not self.credit_note_number:
            self.credit_note_number = self.generate_credit_note_number()
        self.full_clean()
        super().save(*args, **kwargs)
    
    @staticmethod
    def generate_credit_note_number() -> str:
        """Generate unique credit note number in format CN-YYYYMMDD-XXXX."""
        today = date.today()
        date_str = today.strftime('%Y%m%d')
        prefix = f"CN-{date_str}-"
        
        # Get the last credit note number for today
        last_credit_note = CreditNote.objects.filter(
            credit_note_number__startswith=prefix
        ).order_by('-credit_note_number').first()
        
        if last_credit_note:
            last_seq = int(last_credit_note.credit_note_number.split('-')[-1])
            new_seq = last_seq + 1
        else:
            new_seq = 1
        
        return f"{prefix}{new_seq:04d}"
    
    def approve(self, user):
        """Approve credit note."""
        if self.status != self.Status.DRAFT:
            raise ValidationError("Only draft credit notes can be approved.")
        
        if user == self.requested_by:
            raise ValidationError("Cannot self-approve credit note.")
        
        self.status = self.Status.APPROVED
        self.approved_by = user
        self.approved_at = timezone.now()
        self.save()
    
    def reject(self, user, reason: str):
        """Reject credit note."""
        if self.status != self.Status.DRAFT:
            raise ValidationError("Only draft credit notes can be rejected.")
        
        self.status = self.Status.REJECTED
        self.reason_detail += f"\n\nRejection reason: {reason}"
        self.save()
    
    def process_refund(self, method: str, reference: str):
        """Process refund for approved credit note."""
        if self.status != self.Status.APPROVED:
            raise ValidationError("Credit note must be approved before refund.")
        
        self.status = self.Status.REFUNDED
        self.refund_method = method
        self.refund_reference = reference
        self.refunded_at = timezone.now()
        self.save()
