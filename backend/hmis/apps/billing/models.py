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
        if self.unit_price and self.unit_price <= 0:
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
        from hmis.apps.core.models import generate_unique_number
        prefix = settings.BILLING_INVOICE_PREFIX
        return generate_unique_number(Invoice, 'invoice_number', prefix)
    
    def calculate_totals(self):
        """Calculate invoice totals from items."""
        items = self.items.all()
        self.subtotal = sum(item.line_total for item in items)
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
        if self.quantity and self.quantity <= 0:
            raise ValidationError({'quantity': 'Quantity must be greater than 0.'})
        if self.unit_price and self.unit_price <= 0:
            raise ValidationError({'unit_price': 'Unit price must be greater than 0.'})
    
    def calculate_line_total(self) -> Decimal:
        """Calculate line total."""
        return (self.quantity * self.unit_price) - self.discount_amount
    
    def save(self, *args, **kwargs):
        """Override save to calculate line total and update invoice."""
        self.full_clean()
        self.line_total = self.calculate_line_total()
        super().save(*args, **kwargs)
        # Update invoice totals
        self.invoice.calculate_totals()
    
    def delete(self, *args, **kwargs):
        """Override delete to update invoice totals."""
        invoice = self.invoice
        super().delete(*args, **kwargs)
        invoice.calculate_totals()
