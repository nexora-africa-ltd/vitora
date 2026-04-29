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

from hmis.apps.core.mixins import FacilityScopedModel


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
        ordering = ["display_order", "name"]

    def __str__(self):
        return self.name


class ICD11CodeReference(models.Model):
    """Local ICD-11 reference catalog for offline terminology fallback."""

    code = models.CharField(max_length=20, unique=True)
    title = models.CharField(max_length=500)
    description = models.TextField(blank=True, default="")
    chapter = models.CharField(max_length=50, blank=True, default="")
    chapter_no = models.CharField(max_length=20, blank=True, default="")
    class_kind = models.CharField(max_length=20, default="category")
    depth_in_kind = models.PositiveIntegerField(default=0)
    entity_id = models.CharField(max_length=50, blank=True, default="")
    foundation_uri = models.CharField(max_length=500, blank=True, default="")
    linearization_uri = models.CharField(max_length=500, blank=True, default="")
    is_leaf = models.BooleanField(default=True)
    is_residual = models.BooleanField(default=False)
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ["code"]
        verbose_name = "ICD-11 Code Reference"
        verbose_name_plural = "ICD-11 Code References"
        indexes = [
            models.Index(fields=["code"]),
            models.Index(fields=["chapter_no"]),
            models.Index(fields=["title"]),
        ]

    def __str__(self):
        return f"{self.code} - {self.title}"

    def save(self, *args, **kwargs):
        """Normalize code casing before save."""
        if self.code:
            self.code = self.code.upper()
        super().save(*args, **kwargs)


class Service(models.Model):
    """Billable service with pricing."""

    id = models.BigAutoField(primary_key=True)
    category = models.ForeignKey(ServiceCategory, on_delete=models.PROTECT, related_name="services")

    # Service identification
    code = models.CharField(max_length=20, unique=True)  # e.g., "CONS-001", "LAB-CBC"
    name = models.CharField(max_length=200)
    description = models.TextField(blank=True)

    # Pricing
    unit_price = models.DecimalField(max_digits=10, decimal_places=2)
    currency = models.CharField(max_length=3, default="KES")

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
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="services_created"
    )

    class Meta:
        ordering = ["category", "name"]
        indexes = [
            models.Index(fields=["code"]),
            models.Index(fields=["sha_code"]),
        ]

    def __str__(self):
        return f"{self.code} - {self.name}"

    def save(self, *args, **kwargs):
        """Override save to run validation."""
        self.full_clean()
        super().save(*args, **kwargs)

    def clean(self):
        """Validate service data."""
        if self.unit_price is not None and self.unit_price <= 0:
            raise ValidationError({"unit_price": "Unit price must be greater than 0."})

    def get_display_name(self) -> str:
        """Return formatted display name."""
        return f"{self.category.name} - {self.name}"

    def calculate_line_total(self, quantity: Decimal) -> Decimal:
        """Calculate line total for given quantity."""
        return self.unit_price * quantity

    def is_available(self) -> bool:
        """Check if service is available for billing."""
        return self.is_active


class Invoice(FacilityScopedModel):
    """Patient invoice for services rendered."""

    class Status(models.TextChoices):
        PROFORMA = "proforma", "Proforma Invoice"
        DRAFT = "draft", "Draft"
        PENDING = "pending", "Pending Payment"
        PARTIAL = "partial", "Partially Paid"
        PAID = "paid", "Paid"
        OVERDUE = "overdue", "Overdue"
        CANCELLED = "cancelled", "Cancelled"
        WRITTEN_OFF = "written_off", "Written Off"

    class PaymentType(models.TextChoices):
        CASH = "cash", "Cash"
        MPESA = "mpesa", "M-Pesa"
        INSURANCE = "insurance", "Insurance"
        CORPORATE = "corporate", "Corporate Account"
        MIXED = "mixed", "Mixed Payment"

    # Default proforma validity in days
    DEFAULT_PROFORMA_VALIDITY_DAYS = 30

    id = models.BigAutoField(primary_key=True)

    # Invoice identification
    invoice_number = models.CharField(max_length=50, unique=True, editable=False)

    # Patient and encounter linkage
    patient = models.ForeignKey(
        "patients.Patient", on_delete=models.PROTECT, related_name="invoices"
    )
    encounter = models.ForeignKey(
        "encounters.Encounter",
        on_delete=models.PROTECT,
        related_name="invoices",
        null=True,
        blank=True,
    )

    # Optional clinic visit linkage (for clinic-based reporting)
    clinic_visit = models.ForeignKey(
        "clinics.ClinicVisit",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="invoices",
    )

    # Status
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.DRAFT)
    payment_type = models.CharField(
        max_length=20, choices=PaymentType.choices, default=PaymentType.CASH
    )

    # Dates
    invoice_date = models.DateField(default=date.today)
    due_date = models.DateField()

    # Discount configuration
    class DiscountType(models.TextChoices):
        PERCENTAGE = "percentage", "Percentage"
        FIXED = "fixed", "Fixed Amount"

    discount_type = models.CharField(
        max_length=12,
        choices=DiscountType.choices,
        blank=True,
        default="",
        help_text="Type of discount applied (percentage or fixed amount)",
    )
    discount_value = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        default=Decimal("0.00"),
        help_text="Discount value (percentage 0-100 or fixed amount in KES)",
    )

    # Amounts (calculated from items)
    subtotal = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal("0.00"))
    tax_amount = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal("0.00"))
    discount_amount = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        default=Decimal("0.00"),
        help_text="Computed discount amount in KES (derived from discount_type + discount_value)",
    )
    discount_reason = models.CharField(max_length=200, blank=True)
    total_amount = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal("0.00"))
    amount_paid = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal("0.00"))
    balance_due = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal("0.00"))

    # Insurance/SHA details (if applicable)
    insurance_provider = models.CharField(max_length=100, blank=True)
    insurance_member_no = models.CharField(max_length=50, blank=True)
    sha_claim_number = models.CharField(max_length=50, blank=True)
    insurance_amount = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal("0.00"))
    insurance_coverage = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        default=Decimal("0.00"),
        help_text="Insurance coverage percentage (0-100)",
    )

    # Notes
    notes = models.TextField(blank=True)
    internal_notes = models.TextField(blank=True)  # Staff-only notes

    # Audit
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="invoices_created"
    )
    cancelled_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="invoices_cancelled",
        null=True,
        blank=True,
    )
    cancelled_at = models.DateTimeField(null=True, blank=True)
    cancellation_reason = models.TextField(blank=True)

    # Proforma-specific fields
    valid_until = models.DateField(
        null=True,
        blank=True,
        help_text="Validity date for proforma invoices (default 30 days from creation)",
    )
    is_converted = models.BooleanField(
        default=False,
        help_text="True if this proforma has been converted to invoice(s)",
    )
    converted_at = models.DateTimeField(
        null=True,
        blank=True,
        help_text="When this proforma was fully converted",
    )
    converted_from_proforma = models.ForeignKey(
        "self",
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="converted_invoices",
        help_text="The proforma invoice this was converted from",
    )
    renewed_to = models.ForeignKey(
        "self",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="renewed_from",
        help_text="The new proforma created when this one was renewed",
    )

    # Void support
    is_voided = models.BooleanField(default=False)
    voided_at = models.DateTimeField(null=True, blank=True)
    voided_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="invoices_voided",
        null=True,
        blank=True,
    )
    void_reason = models.TextField(blank=True)

    class Meta:
        ordering = ["-invoice_date", "-created_at"]
        indexes = [
            models.Index(fields=["invoice_number"]),
            models.Index(fields=["patient", "status"]),
            models.Index(fields=["status", "due_date"]),
            models.Index(fields=["valid_until"]),  # For proforma expiry queries
        ]

    def __str__(self):
        return f"{self.invoice_number} - {self.patient}"

    def save(self, *args, **kwargs):
        """Override save to generate invoice number, set defaults, and validate."""
        if not self.invoice_number:
            self.invoice_number = self.generate_invoice_number()
        if not self.due_date:
            self.due_date = self.invoice_date + timedelta(days=settings.BILLING_DEFAULT_DUE_DAYS)
        # Set default validity for proforma invoices
        if self.status == self.Status.PROFORMA and not self.valid_until:
            self.valid_until = self.invoice_date + timedelta(
                days=self.DEFAULT_PROFORMA_VALIDITY_DAYS
            )
        self.full_clean()
        super().save(*args, **kwargs)

    def clean(self):
        """Validate invoice data."""
        if self.due_date and self.invoice_date and self.due_date < self.invoice_date:
            raise ValidationError({"due_date": "Due date must be on or after invoice date."})

        # Proforma cannot transition directly to PAID
        if self.pk:
            old_instance = Invoice.objects.filter(pk=self.pk).first()
            if (
                old_instance
                and old_instance.status == self.Status.PROFORMA
                and self.status == self.Status.PAID
            ):
                raise ValidationError(
                    {
                        "status": "Proforma invoices cannot be paid directly. Convert to invoice first."
                    }
                )

    def generate_invoice_number(self) -> str:
        """Generate unique invoice number based on status.

        Format:
        - Proforma: PRO-YYYYMMDD-XXXX
        - Regular Invoice: INV-YYYYMMDD-XXXX
        """
        today = date.today()
        date_str = today.strftime("%Y%m%d")

        # Use different prefix for proforma vs regular invoice
        if self.status == self.Status.PROFORMA:
            prefix = f"PRO-{date_str}-"
        else:
            prefix = f"{settings.BILLING_INVOICE_PREFIX}{date_str}-"

        # Get the last invoice number for today with this prefix
        last_invoice = (
            Invoice.objects.filter(invoice_number__startswith=prefix)
            .order_by("-invoice_number")
            .first()
        )

        if last_invoice:
            # Extract the sequence number and increment
            last_seq = int(last_invoice.invoice_number.split("-")[-1])
            new_seq = last_seq + 1
        else:
            new_seq = 1

        return f"{prefix}{new_seq:04d}"

    def calculate_totals(self):
        """Calculate invoice totals from items.

        Recomputes discount_amount from discount_type/discount_value,
        then derives total_amount and balance_due.
        """
        # Clear any prefetch cache so we get fresh items from the DB.
        # Without this, prefetch_related("items") on the queryset causes
        # stale data when items are added/removed in the same request.
        if hasattr(self, "_prefetched_objects_cache"):
            self._prefetched_objects_cache.pop("items", None)

        items = self.items.all()
        self.subtotal = sum(item.line_total for item in items) if items else Decimal("0.00")

        # Compute discount_amount from discount_type + discount_value
        if self.discount_type == self.DiscountType.PERCENTAGE and self.discount_value > 0:
            self.discount_amount = (self.subtotal * self.discount_value / Decimal("100")).quantize(
                Decimal("0.01")
            )
        elif self.discount_type == self.DiscountType.FIXED and self.discount_value > 0:
            self.discount_amount = min(self.discount_value, self.subtotal)
        # If no discount_type is set, keep existing discount_amount (backward compat)

        self.total_amount = self.subtotal - self.discount_amount + self.tax_amount
        self.balance_due = self.total_amount - self.amount_paid
        self.save(
            update_fields=[
                "subtotal",
                "discount_amount",
                "total_amount",
                "balance_due",
                "updated_at",
            ]
        )

    def apply_discount(
        self,
        amount: Decimal,
        reason: str,
        discount_type: str = "",
        discount_value: Decimal | None = None,
    ):
        """Apply discount to invoice.

        Args:
            amount: The absolute discount amount in KES (used as fallback
                    if discount_type/discount_value are not provided).
            reason: Human-readable reason for the discount.
            discount_type: 'percentage' or 'fixed' (optional).
            discount_value: The percentage (0-100) or fixed amount (optional).
        """
        if amount < 0:
            raise ValidationError("Discount amount must be positive.")

        # Handle zero subtotal case (no items yet)
        if self.subtotal == Decimal("0.00") and amount > Decimal("0.00"):
            raise ValidationError("Cannot apply discount to invoice with zero subtotal.")

        if amount > self.subtotal:
            raise ValidationError("Discount cannot exceed subtotal.")

        # Store structured discount if provided
        if discount_type and discount_value is not None:
            self.discount_type = discount_type
            self.discount_value = discount_value

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

        self.save(update_fields=["amount_paid", "balance_due", "status", "updated_at"])

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
        if date.today() > (self.due_date + grace_period) and self.status in [
            self.Status.PENDING,
            self.Status.PARTIAL,
        ]:
            self.status = self.Status.OVERDUE
            self.save(update_fields=["status", "updated_at"])

    def can_be_edited(self) -> bool:
        """Check if invoice can be edited."""
        return self.status in [self.Status.DRAFT, self.Status.PROFORMA]

    # =========================================================================
    # Proforma Invoice Methods
    # =========================================================================

    @property
    def is_valid(self) -> bool:
        """Check if proforma is still valid (not expired)."""
        if self.status != self.Status.PROFORMA:
            return True  # Non-proforma invoices don't have validity concept
        if not self.valid_until:
            return True
        return date.today() <= self.valid_until

    @property
    def days_until_expiry(self) -> int:
        """Get number of days until proforma expires."""
        if self.status != self.Status.PROFORMA or not self.valid_until:
            return -1  # N/A for non-proforma
        delta = self.valid_until - date.today()
        return max(0, delta.days)

    @property
    def can_convert(self) -> bool:
        """Check if proforma can be converted to invoice."""
        return (
            self.status == self.Status.PROFORMA
            and self.is_valid
            and not self.is_converted
            and self.items.filter(is_converted=False).exists()
        )

    def void(self, voided_by, reason: str = ""):
        """Void the invoice/proforma."""
        if self.is_voided:
            raise ValidationError("Invoice is already voided.")
        if self.status == self.Status.PAID:
            raise ValidationError("Cannot void a paid invoice.")

        self.is_voided = True
        self.voided_at = timezone.now()
        self.voided_by = voided_by
        self.void_reason = reason
        self.status = self.Status.CANCELLED
        self.save()

    def convert_to_invoice(self, converted_by, item_ids: list = None) -> "Invoice":
        """
        Convert proforma to a real invoice.

        Args:
            converted_by: User performing the conversion
            item_ids: Optional list of specific item IDs to convert.
                     If None, converts all unconverted items.

        Returns:
            The newly created Invoice

        Raises:
            ValidationError: If conversion is not allowed
        """
        # Validate proforma status
        if self.status != self.Status.PROFORMA:
            raise ValidationError("Only proforma invoices can be converted to invoices.")

        # Check validity
        if not self.is_valid:
            raise ValidationError(
                "This proforma has expired. Please renew it or create a new proforma."
            )

        # Check if already fully converted
        if self.is_converted:
            raise ValidationError("This proforma has already been converted.")

        # Determine which items to convert
        if item_ids:
            items_to_convert = self.items.filter(pk__in=item_ids, is_converted=False)
            if items_to_convert.count() != len(item_ids):
                # Some items were already converted or don't exist
                raise ValidationError("Some items have already been converted or do not exist.")
        else:
            items_to_convert = self.items.filter(is_converted=False)

        if not items_to_convert.exists():
            raise ValidationError("No items available for conversion.")

        # Create the new invoice
        new_invoice = Invoice.objects.create(
            patient=self.patient,
            encounter=self.encounter,
            invoice_date=date.today(),
            due_date=date.today() + timedelta(days=settings.BILLING_DEFAULT_DUE_DAYS),
            status=self.Status.DRAFT,
            payment_type=self.payment_type,
            insurance_provider=self.insurance_provider,
            insurance_member_no=self.insurance_member_no,
            notes=f"Converted from proforma {self.invoice_number}",
            created_by=converted_by,
            converted_from_proforma=self,
        )

        # Copy items to new invoice
        for item in items_to_convert:
            InvoiceItem.objects.create(
                invoice=new_invoice,
                item_type=item.item_type,
                service=item.service,
                drug=item.drug,
                dispensing=item.dispensing,
                lab_order=item.lab_order,
                surgery_case=item.surgery_case,
                theatre_consumable=item.theatre_consumable,
                description=item.description,
                quantity=item.quantity,
                unit_price=item.unit_price,
                line_total=item.line_total,
                discount_amount=item.discount_amount,
                discount_reason=item.discount_reason,
                sha_code=item.sha_code,
                is_covered_by_insurance=item.is_covered_by_insurance,
                insurance_approved_amount=item.insurance_approved_amount,
                converted_from_item=item,
            )
            # Mark original item as converted
            item.is_converted = True
            item.converted_at = timezone.now()
            item.save(update_fields=["is_converted", "converted_at", "updated_at"])

        # Calculate totals for new invoice
        new_invoice.calculate_totals()

        # Check if all items are now converted
        if not self.items.filter(is_converted=False).exists():
            self.is_converted = True
            self.converted_at = timezone.now()
            self.save(update_fields=["is_converted", "converted_at", "updated_at"])

        return new_invoice

    def renew(self, renewed_by, validity_days: int = None) -> "Invoice":
        """
        Create a new proforma by copying an expired proforma.

        Args:
            renewed_by: User performing the renewal
            validity_days: Optional custom validity period

        Returns:
            The newly created proforma Invoice
        """
        if self.status != self.Status.PROFORMA:
            raise ValidationError("Only proforma invoices can be renewed.")

        validity = validity_days or self.DEFAULT_PROFORMA_VALIDITY_DAYS

        # Create new proforma
        new_proforma = Invoice.objects.create(
            patient=self.patient,
            encounter=self.encounter,
            invoice_date=date.today(),
            due_date=date.today() + timedelta(days=settings.BILLING_DEFAULT_DUE_DAYS),
            status=self.Status.PROFORMA,
            payment_type=self.payment_type,
            valid_until=date.today() + timedelta(days=validity),
            insurance_provider=self.insurance_provider,
            insurance_member_no=self.insurance_member_no,
            notes=f"Renewed from proforma {self.invoice_number}",
            created_by=renewed_by,
        )

        # Copy items
        for item in self.items.all():
            InvoiceItem.objects.create(
                invoice=new_proforma,
                item_type=item.item_type,
                service=item.service,
                drug=item.drug,
                surgery_case=item.surgery_case,
                theatre_consumable=item.theatre_consumable,
                description=item.description,
                quantity=item.quantity,
                unit_price=item.unit_price,
                line_total=item.line_total,
                discount_amount=item.discount_amount,
                discount_reason=item.discount_reason,
                sha_code=item.sha_code,
            )

        # Calculate totals
        new_proforma.calculate_totals()

        # Mark original as renewed and cancel it
        self.renewed_to = new_proforma
        self.status = self.Status.CANCELLED
        self.cancellation_reason = f"Renewed to {new_proforma.invoice_number}"
        self.save(update_fields=["renewed_to", "status", "cancellation_reason", "updated_at"])

        return new_proforma


class InvoiceItem(models.Model):
    """Line item on an invoice."""

    class ItemType(models.TextChoices):
        SERVICE = "service", "Service"
        PHARMACY = "pharmacy", "Pharmacy Item"
        LAB = "lab", "Lab Test"
        IMAGING = "imaging", "Imaging/Radiology"
        VACCINATION = "vaccination", "Vaccination"
        CONSUMABLE = "consumable", "Consumable"
        OTHER = "other", "Other"

    id = models.BigAutoField(primary_key=True)
    invoice = models.ForeignKey(Invoice, on_delete=models.CASCADE, related_name="items")

    # Item identification
    item_type = models.CharField(max_length=20, choices=ItemType.choices, default=ItemType.SERVICE)
    service = models.ForeignKey(
        "billing.Service",
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="invoice_items",
    )

    # For pharmacy items
    drug = models.ForeignKey(
        "pharmacy.Drug",
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="invoice_items",
    )
    dispensing = models.ForeignKey(
        "pharmacy.Dispensing",
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="invoice_items",
    )

    # For lab items
    lab_order = models.ForeignKey(
        "laboratory.LabOrder",
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="invoice_items",
    )

    # For imaging items
    # Note: CASCADE is used so draft orders can be deleted with their invoice items.
    # For finalized orders, deletion is typically blocked at the business logic level.
    imaging_order = models.ForeignKey(
        "imaging.ImagingOrder",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="invoice_items",
    )

    # For immunization items
    immunization_record = models.ForeignKey(
        "immunizations.ImmunizationRecord",
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="invoice_items",
    )
    surgery_case = models.ForeignKey(
        "theatre.SurgeryCase",
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="invoice_items",
    )
    theatre_consumable = models.ForeignKey(
        "theatre.TheatreConsumable",
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="invoice_items",
    )

    # Item details
    description = models.CharField(max_length=300)
    quantity = models.DecimalField(max_digits=10, decimal_places=2, default=Decimal("1.00"))
    unit_price = models.DecimalField(max_digits=10, decimal_places=2)

    # Calculated
    line_total = models.DecimalField(max_digits=12, decimal_places=2)

    # Discount at item level (optional)
    discount_amount = models.DecimalField(max_digits=10, decimal_places=2, default=Decimal("0.00"))
    discount_reason = models.CharField(max_length=200, blank=True)

    # For insurance claims
    sha_code = models.CharField(max_length=20, blank=True)
    is_covered_by_insurance = models.BooleanField(default=False)
    insurance_approved_amount = models.DecimalField(
        max_digits=10, decimal_places=2, default=Decimal("0.00")
    )

    # Stock allocation tracking (for pharmacy items)
    stock_batch = models.ForeignKey(
        "pharmacy.StockBatch",
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="invoice_items",
        help_text="Stock batch allocated for pharmacy items",
    )
    stock_allocated = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        default=Decimal("0.00"),
        help_text="Quantity allocated from stock batch",
    )

    # Proforma conversion tracking
    is_converted = models.BooleanField(
        default=False,
        help_text="True if this item has been converted from a proforma",
    )
    converted_at = models.DateTimeField(
        null=True,
        blank=True,
        help_text="When this item was converted",
    )
    converted_from_item = models.ForeignKey(
        "self",
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="converted_to_items",
        help_text="The proforma item this was converted from",
    )

    # Audit
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["created_at"]

    def __str__(self):
        return f"{self.description} - {self.quantity} x {self.unit_price}"

    def save(self, *args, **kwargs):
        """Override save to calculate line total, handle stock allocation, and update invoice."""
        # Calculate line_total before validation if not set
        if not self.line_total:
            self.line_total = self.calculate_line_total()
        self.full_clean()
        self.line_total = self.calculate_line_total()  # Recalculate after validation

        # NOTE: Stock allocation is handled by the Dispensing model, not here.
        # InvoiceItem records what's being charged; stock is deducted when dispensed.

        super().save(*args, **kwargs)
        # Update invoice totals
        self.invoice.calculate_totals()

    def clean(self):
        """Validate invoice item data."""
        if self.quantity is not None and self.quantity <= 0:
            raise ValidationError({"quantity": "Quantity must be greater than 0."})
        if self.unit_price is not None and self.unit_price <= 0:
            raise ValidationError({"unit_price": "Unit price must be greater than 0."})
        if self.theatre_consumable_id and not self.surgery_case_id:
            raise ValidationError(
                {"surgery_case": "Theatre consumable invoice items must link to a surgery case."}
            )

        # NOTE: Stock validation is intentionally NOT done here.
        # Stock availability is validated at DISPENSING time, not billing time.
        # This allows prescriptions to be billed even when stock may not be
        # immediately available (e.g., awaiting restock, patient to return later).
        # The Dispensing model handles stock allocation and validation.

    def delete(self, *args, **kwargs):
        """Override delete to update invoice totals."""
        invoice = self.invoice

        # NOTE: Stock deallocation is handled by the Dispensing model, not here.
        # If a dispensing record exists, it must be cancelled separately.

        super().delete(*args, **kwargs)
        invoice.calculate_totals()

    def _validate_stock_availability(self):
        """Validate that sufficient stock is available for pharmacy items."""
        from hmis.apps.pharmacy.models import StockBatch

        # Get available stock (FEFO - First Expiry, First Out)
        available_batches = StockBatch.objects.filter(
            drug=self.drug,
            status="AVAILABLE",
            quantity_available__gt=0,
            expiry_date__gt=date.today(),  # Not expired
        ).order_by("expiry_date")

        total_available = sum(batch.quantity_available for batch in available_batches)

        # For updates, account for currently allocated stock
        currently_allocated = Decimal("0")
        if self.pk:
            try:
                old_item = InvoiceItem.objects.get(pk=self.pk)
                currently_allocated = old_item.stock_allocated
            except InvoiceItem.DoesNotExist:
                pass

        if total_available + currently_allocated < self.quantity:
            raise ValidationError(
                {
                    "quantity": f"Insufficient stock available. Requested: {self.quantity}, "
                    f"Available: {total_available + currently_allocated}"
                }
            )

        if not available_batches.exists():
            raise ValidationError(
                {
                    "drug": f"No available stock for {self.drug.generic_name}. "
                    "All batches are either expired or depleted."
                }
            )

    def _handle_stock_allocation(self, quantity_change: Decimal):
        """Handle stock allocation/deallocation for pharmacy items."""
        from hmis.apps.pharmacy.models import StockBatch

        if quantity_change > 0:
            # Need to allocate more stock (FEFO - First Expiry, First Out)
            available_batches = StockBatch.objects.filter(
                drug=self.drug,
                status="AVAILABLE",
                quantity_available__gt=0,
                expiry_date__gt=date.today(),
            ).order_by("expiry_date")

            remaining_to_allocate = quantity_change

            for batch in available_batches:
                if remaining_to_allocate <= 0:
                    break

                allocate_from_batch = min(batch.quantity_available, remaining_to_allocate)
                batch.quantity_available -= allocate_from_batch
                batch.save()

                # Track the batch used (use first batch for simplicity)
                if not self.stock_batch:
                    self.stock_batch = batch

                self.stock_allocated += allocate_from_batch
                remaining_to_allocate -= allocate_from_batch

        elif quantity_change < 0:
            # Need to deallocate stock (return to batch)
            quantity_to_return = abs(quantity_change)

            if self.stock_batch and self.stock_allocated >= quantity_to_return:
                self.stock_batch.quantity_available += quantity_to_return
                self.stock_batch.save()
                self.stock_allocated -= quantity_to_return

    def calculate_line_total(self) -> Decimal:
        """Calculate line total."""
        from decimal import ROUND_HALF_UP, Decimal

        line_total = (self.quantity * self.unit_price) - self.discount_amount
        # Round to 2 decimal places to avoid validation errors
        return line_total.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


class Payment(models.Model):
    """Payment record against an invoice."""

    class Method(models.TextChoices):
        CASH = "cash", "Cash"
        MPESA = "mpesa", "M-Pesa"
        CARD = "card", "Card"
        BANK_TRANSFER = "bank_transfer", "Bank Transfer"
        INSURANCE = "insurance", "Insurance Claim"
        CORPORATE = "corporate", "Corporate Account"
        CHEQUE = "cheque", "Cheque"

    class Status(models.TextChoices):
        PENDING = "pending", "Pending"
        COMPLETED = "completed", "Completed"
        FAILED = "failed", "Failed"
        REVERSED = "reversed", "Reversed"
        REFUNDED = "refunded", "Refunded"

    id = models.BigAutoField(primary_key=True)

    # Payment identification
    payment_reference = models.CharField(max_length=100, unique=True, editable=False)

    # Linkage
    invoice = models.ForeignKey(Invoice, on_delete=models.PROTECT, related_name="payments")

    # Payment point / cashier / account used (supports multiple tills/cashiers)
    payment_point = models.ForeignKey(
        "billing.PaymentPoint",
        on_delete=models.PROTECT,
        related_name="payments",
        null=True,
        blank=True,
    )

    # Payment details
    method = models.CharField(max_length=20, choices=Method.choices)
    amount = models.DecimalField(max_digits=12, decimal_places=2)
    currency = models.CharField(max_length=3, default="KES")

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
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="payments_received"
    )

    class Meta:
        ordering = ["-payment_date"]
        indexes = [
            models.Index(fields=["payment_reference"]),
            models.Index(fields=["mpesa_receipt_number"]),
            models.Index(fields=["invoice", "status"]),
        ]

    def __str__(self):
        return f"{self.payment_reference} - {self.amount}"

    def save(self, *args, **kwargs):
        """Override save to generate payment reference and validate."""
        if not self.payment_reference:
            self.payment_reference = self.generate_reference()
        self.full_clean()
        super().save(*args, **kwargs)

    def clean(self):
        """Validate payment data."""
        if self.amount is not None and self.amount <= 0:
            raise ValidationError({"amount": "Payment amount must be greater than 0."})

        if self.payment_point and self.payment_point.method != self.method:
            raise ValidationError(
                {"payment_point": "Payment point method must match payment method."}
            )

        # Skip balance validation if payment is being reversed or refunded
        if self.pk and self.status in [self.Status.REVERSED, self.Status.REFUNDED]:
            return

        # Prevent payment on proforma invoices
        if self.invoice and self.invoice.status == Invoice.Status.PROFORMA:
            raise ValidationError(
                "Cannot create payment for proforma invoice. Convert to invoice first."
            )

        # Check invoice balance
        if self.invoice and self.amount and self.amount > self.invoice.balance_due:
            raise ValidationError({"amount": "Payment amount exceeds invoice balance."})

        # Check invoice status
        if self.invoice and self.invoice.status == Invoice.Status.CANCELLED:
            raise ValidationError("Cannot create payment for cancelled invoice.")

    @staticmethod
    def generate_reference() -> str:
        """Generate unique payment reference in format PAY-YYYYMMDD-XXXX."""
        today = date.today()
        date_str = today.strftime("%Y%m%d")
        prefix = f"{settings.BILLING_PAYMENT_PREFIX}{date_str}-"

        # Get the last payment reference for today
        last_payment = (
            Payment.objects.filter(payment_reference__startswith=prefix)
            .order_by("-payment_reference")
            .first()
        )

        if last_payment:
            last_seq = int(last_payment.payment_reference.split("-")[-1])
            new_seq = last_seq + 1
        else:
            new_seq = 1

        return f"{prefix}{new_seq:04d}"

    def process(self):
        """Mark payment as completed and update invoice."""
        self.status = self.Status.COMPLETED
        self.processed_at = timezone.now()
        self.save(update_fields=["status", "processed_at", "updated_at"])

        # Update invoice
        self.invoice.record_payment(self.amount)

    def reverse(self, reason: str):
        """Reverse payment."""
        if self.status != self.Status.COMPLETED:
            raise ValidationError("Can only reverse completed payments.")

        self.status = self.Status.REVERSED
        self.failure_reason = reason
        self.save(update_fields=["status", "failure_reason", "updated_at"])

        # Update invoice (reverse the payment)
        self.invoice.amount_paid -= self.amount
        self.invoice.balance_due = self.invoice.total_amount - self.invoice.amount_paid

        # Update status
        if self.invoice.amount_paid == 0:
            self.invoice.status = Invoice.Status.PENDING
        elif self.invoice.amount_paid > 0:
            self.invoice.status = Invoice.Status.PARTIAL

        self.invoice.save(update_fields=["amount_paid", "balance_due", "status", "updated_at"])

    def refund(self, amount: Decimal, reason: str):
        """Process refund."""
        if amount <= 0 or amount > self.amount:
            raise ValidationError("Invalid refund amount.")

        self.status = self.Status.REFUNDED
        self.notes = f"Refund: {reason}"
        self.save(update_fields=["status", "notes", "updated_at"])

    def is_mpesa(self) -> bool:
        """Check if M-Pesa payment."""
        return self.method == self.Method.MPESA


class PaymentPoint(FacilityScopedModel):
    """A payment point/account used to collect payments.

    Supports multiple cashiers/payment counters by representing the configured
    cash drawer, M-Pesa till/paybill, or bank account used for collections.
    """

    id = models.BigAutoField(primary_key=True)

    name = models.CharField(max_length=120)
    code = models.CharField(
        max_length=50,
        unique=True,
        help_text="Short unique code (e.g. CASH-01, MPESA-02)",
    )

    # Must match Payment.Method values
    method = models.CharField(max_length=20, choices=Payment.Method.choices)

    # M-Pesa specific
    till_number = models.CharField(
        max_length=30,
        blank=True,
        help_text="M-Pesa Till number (Buy Goods) for this payment point",
    )
    paybill_number = models.CharField(
        max_length=30,
        blank=True,
        help_text="M-Pesa PayBill number for this payment point",
    )
    paybill_account_number = models.CharField(
        max_length=60,
        blank=True,
        help_text="PayBill account/reference number (if applicable)",
    )

    # Bank specific
    bank_name = models.CharField(max_length=120, blank=True)
    bank_account_name = models.CharField(max_length=120, blank=True)
    bank_account_number = models.CharField(max_length=60, blank=True)
    bank_branch = models.CharField(max_length=120, blank=True)

    is_active = models.BooleanField(default=True)
    notes = models.TextField(blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="payment_points_created",
    )

    class Meta:
        ordering = ["method", "name"]
        indexes = [
            models.Index(fields=["method", "is_active"]),
        ]

    def __str__(self) -> str:
        return f"{self.code} - {self.name}"

    def clean(self):
        if self.method == Payment.Method.MPESA and not (self.till_number or self.paybill_number):
            raise ValidationError(
                "M-Pesa payment points must have a till number or paybill number."
            )
        if self.method == Payment.Method.BANK_TRANSFER and not self.bank_account_number:
            raise ValidationError("Bank transfer payment points must have a bank account number.")


class Receipt(models.Model):
    """Official receipt for payment."""

    id = models.BigAutoField(primary_key=True)

    # Receipt identification
    receipt_number = models.CharField(max_length=50, unique=True, editable=False)

    # Linkage
    payment = models.OneToOneField(Payment, on_delete=models.PROTECT, related_name="receipt")
    invoice = models.ForeignKey(Invoice, on_delete=models.PROTECT, related_name="receipts")
    patient = models.ForeignKey(
        "patients.Patient", on_delete=models.PROTECT, related_name="receipts"
    )

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
        related_name="receipts_voided",
        null=True,
        blank=True,
    )
    void_reason = models.TextField(blank=True)

    class Meta:
        ordering = ["-receipt_date"]
        indexes = [
            models.Index(fields=["receipt_number"]),
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
        date_str = today.strftime("%Y%m%d")
        prefix = f"{settings.BILLING_RECEIPT_PREFIX}{date_str}-"

        # Get the last receipt number for today
        last_receipt = (
            Receipt.objects.filter(receipt_number__startswith=prefix)
            .order_by("-receipt_number")
            .first()
        )

        if last_receipt:
            last_seq = int(last_receipt.receipt_number.split("-")[-1])
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
        """Generate printable PDF receipt using ReportLab."""
        import io

        from reportlab.lib import colors
        from reportlab.lib.pagesizes import A5
        from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
        from reportlab.lib.units import mm
        from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

        buffer = io.BytesIO()
        doc = SimpleDocTemplate(
            buffer,
            pagesize=A5,
            leftMargin=15 * mm,
            rightMargin=15 * mm,
            topMargin=15 * mm,
            bottomMargin=15 * mm,
        )

        styles = getSampleStyleSheet()
        elements = []

        # --- Facility Header ---
        header_style = ParagraphStyle(
            "ReceiptHeader", parent=styles["Title"], fontSize=14, alignment=1
        )
        sub_header = ParagraphStyle("SubHeader", parent=styles["Normal"], fontSize=9, alignment=1)
        elements.append(Paragraph(self.facility_name, header_style))
        if self.facility_address:
            elements.append(Paragraph(self.facility_address, sub_header))
        if self.facility_phone:
            elements.append(Paragraph(f"Tel: {self.facility_phone}", sub_header))
        if self.facility_kra_pin:
            elements.append(Paragraph(f"KRA PIN: {self.facility_kra_pin}", sub_header))
        elements.append(Spacer(1, 6 * mm))

        # --- Receipt Title ---
        title_style = ParagraphStyle(
            "ReceiptTitle", parent=styles["Heading2"], fontSize=12, alignment=1
        )
        voided_label = " (VOIDED)" if self.is_voided else ""
        elements.append(Paragraph(f"OFFICIAL RECEIPT{voided_label}", title_style))
        elements.append(Spacer(1, 4 * mm))

        # --- Receipt Details ---
        detail_data = [
            ["Receipt No:", self.receipt_number],
            ["Date:", self.receipt_date.strftime("%d/%m/%Y %H:%M")],
            ["Patient:", f"{self.patient_name} ({self.patient_mrn})"],
            ["Invoice:", self.invoice.invoice_number],
            ["Payment Method:", self.payment_method.replace("_", " ").title()],
        ]
        detail_table = Table(detail_data, colWidths=[35 * mm, 75 * mm])
        detail_table.setStyle(
            TableStyle(
                [
                    ("FONTSIZE", (0, 0), (-1, -1), 9),
                    ("FONTNAME", (0, 0), (0, -1), "Helvetica-Bold"),
                    ("VALIGN", (0, 0), (-1, -1), "TOP"),
                    ("BOTTOMPADDING", (0, 0), (-1, -1), 2),
                ]
            )
        )
        elements.append(detail_table)
        elements.append(Spacer(1, 4 * mm))

        # --- Line Items ---
        items = self.invoice.items.all().order_by("id")
        if items.exists():
            item_data = [["#", "Description", "Qty", "Amount"]]
            for idx, item in enumerate(items, 1):
                item_data.append(
                    [
                        str(idx),
                        item.description[:40],
                        str(item.quantity),
                        f"{item.line_total:,.2f}",
                    ]
                )
            item_table = Table(item_data, colWidths=[8 * mm, 55 * mm, 15 * mm, 32 * mm])
            item_table.setStyle(
                TableStyle(
                    [
                        ("FONTSIZE", (0, 0), (-1, -1), 8),
                        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                        ("LINEBELOW", (0, 0), (-1, 0), 0.5, colors.black),
                        ("ALIGN", (2, 0), (-1, -1), "RIGHT"),
                        ("BOTTOMPADDING", (0, 0), (-1, -1), 2),
                    ]
                )
            )
            elements.append(item_table)
            elements.append(Spacer(1, 3 * mm))

        # --- Amount ---
        amount_style = ParagraphStyle("Amount", parent=styles["Normal"], fontSize=11, alignment=2)
        bold_amount = ParagraphStyle("BoldAmount", parent=amount_style, fontName="Helvetica-Bold")
        elements.append(Paragraph(f"Amount Paid: KES {self.amount:,.2f}", bold_amount))
        elements.append(Spacer(1, 2 * mm))

        # --- Amount in Words ---
        words_style = ParagraphStyle(
            "Words", parent=styles["Normal"], fontSize=8, fontName="Helvetica-Oblique"
        )
        elements.append(Paragraph(f"({self.amount_in_words})", words_style))
        elements.append(Spacer(1, 6 * mm))

        # --- Footer ---
        footer_style = ParagraphStyle(
            "Footer", parent=styles["Normal"], fontSize=8, alignment=1, textColor=colors.grey
        )
        issued_by_name = ""
        if self.issued_by:
            issued_by_name = self.issued_by.get_full_name() or self.issued_by.username
        elements.append(Paragraph(f"Issued by: {issued_by_name}", footer_style))
        elements.append(Paragraph("Thank you for choosing our facility.", footer_style))

        doc.build(elements)
        return buffer.getvalue()


class CreditNote(models.Model):
    """Credit note for refunds or adjustments."""

    class Reason(models.TextChoices):
        SERVICE_NOT_RENDERED = "service_not_rendered", "Service Not Rendered"
        OVERCHARGE = "overcharge", "Overcharge Correction"
        DUPLICATE_CHARGE = "duplicate", "Duplicate Charge"
        INSURANCE_ADJUSTMENT = "insurance", "Insurance Adjustment"
        GOODWILL = "goodwill", "Goodwill Gesture"
        OTHER = "other", "Other"

    class Status(models.TextChoices):
        DRAFT = "draft", "Draft"
        APPROVED = "approved", "Approved"
        REFUNDED = "refunded", "Refunded"
        REJECTED = "rejected", "Rejected"

    id = models.BigAutoField(primary_key=True)

    # Credit note identification
    credit_note_number = models.CharField(max_length=50, unique=True, editable=False)

    # Linkage
    invoice = models.ForeignKey(Invoice, on_delete=models.PROTECT, related_name="credit_notes")
    patient = models.ForeignKey(
        "patients.Patient", on_delete=models.PROTECT, related_name="credit_notes"
    )
    original_payment = models.ForeignKey(
        Payment, on_delete=models.PROTECT, related_name="credit_notes", null=True, blank=True
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
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="credit_notes_requested"
    )
    approved_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="credit_notes_approved",
        null=True,
        blank=True,
    )
    approved_at = models.DateTimeField(null=True, blank=True)

    # Audit
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.credit_note_number} - {self.amount}"

    def save(self, *args, **kwargs):
        """Override save to generate credit note number and validate."""
        if not self.credit_note_number:
            self.credit_note_number = self.generate_credit_note_number()
        self.full_clean()
        super().save(*args, **kwargs)

    def clean(self):
        """Validate credit note data."""
        if self.amount is not None and self.amount <= 0:
            raise ValidationError({"amount": "Credit note amount must be greater than 0."})

        # Check against invoice total
        if self.invoice and self.amount and self.amount > self.invoice.total_amount:
            raise ValidationError({"amount": "Credit note amount cannot exceed invoice total."})

    @staticmethod
    def generate_credit_note_number() -> str:
        """Generate unique credit note number in format CN-YYYYMMDD-XXXX."""
        today = date.today()
        date_str = today.strftime("%Y%m%d")
        prefix = f"CN-{date_str}-"

        # Get the last credit note number for today
        last_credit_note = (
            CreditNote.objects.filter(credit_note_number__startswith=prefix)
            .order_by("-credit_note_number")
            .first()
        )

        if last_credit_note:
            last_seq = int(last_credit_note.credit_note_number.split("-")[-1])
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

    def reject(self, _user, reason: str):
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


class SHAMember(models.Model):
    """
    SHA (Social Health Authority) membership record for a patient.

    Stores membership details required for eligibility checks and claims.
    Each patient can have one active SHA membership at a time.

    SHA is the successor to NHIF in Kenya, managing universal health coverage.
    """

    class MembershipStatus(models.TextChoices):
        ACTIVE = "active", "Active"
        INACTIVE = "inactive", "Inactive"
        SUSPENDED = "suspended", "Suspended"
        EXPIRED = "expired", "Expired"
        PENDING_VERIFICATION = "pending_verification", "Pending Verification"

    class MembershipType(models.TextChoices):
        PRINCIPAL = "principal", "Principal Member"
        SPOUSE = "spouse", "Spouse"
        CHILD = "child", "Child/Dependent"
        PARENT = "parent", "Parent"
        OTHER_DEPENDENT = "other", "Other Dependent"

    id = models.BigAutoField(primary_key=True)

    # Patient linkage - OneToOne ensures one SHA membership per patient
    patient = models.OneToOneField(
        "patients.Patient", on_delete=models.CASCADE, related_name="sha_member"
    )

    # SHA identification
    sha_number = models.CharField(
        max_length=20, unique=True, help_text="SHA member number (format: SHA-XXXXXXXXXX)"
    )
    national_id = models.CharField(
        max_length=20, db_index=True, blank=True, help_text="Kenya National ID linked to SHA"
    )

    # Membership details
    membership_type = models.CharField(
        max_length=20, choices=MembershipType.choices, default=MembershipType.PRINCIPAL
    )
    principal_sha_number = models.CharField(
        max_length=20,
        blank=True,
        help_text="Principal member's SHA number (for dependents) - external reference",
    )
    # ForeignKey for internal referential integrity
    principal = models.ForeignKey(
        "self",
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="dependents",
        help_text="Principal member this dependent belongs to",
    )

    # Status
    status = models.CharField(
        max_length=20,
        choices=MembershipStatus.choices,
        default=MembershipStatus.PENDING_VERIFICATION,
    )

    # Eligibility cache
    last_eligibility_check = models.DateTimeField(null=True, blank=True)
    eligibility_valid_until = models.DateField(null=True, blank=True)
    eligibility_response = models.JSONField(
        default=dict, blank=True, help_text="Cached response from last eligibility check"
    )

    # Coverage details
    coverage_start_date = models.DateField(null=True, blank=True)
    coverage_end_date = models.DateField(null=True, blank=True)
    benefit_package = models.CharField(
        max_length=50, blank=True, help_text="SHA benefit package code"
    )

    # PFMS (Public Finance Management System) Coverage
    # For vulnerable populations: indigent, elderly, disabled, orphans
    # Reference: SHA Integration Checklist item #13
    class PFMSCategory(models.TextChoices):
        VULNERABLE = "vulnerable", "Vulnerable Population"
        ELDERLY = "elderly", "Elderly (65+)"
        DISABLED = "disabled", "Persons with Disability"
        ORPHAN = "orphan", "Orphan/Vulnerable Child"
        INDIGENT = "indigent", "Indigent"

    is_pfms_eligible = models.BooleanField(
        default=False, help_text="Is this member eligible for PFMS (government subsidy)?"
    )
    pfms_category = models.CharField(
        max_length=20,
        choices=PFMSCategory.choices,
        blank=True,
        help_text="PFMS category for government-subsidized coverage",
    )
    pfms_verified = models.BooleanField(
        default=False, help_text="Has PFMS eligibility been verified?"
    )
    pfms_verified_at = models.DateTimeField(null=True, blank=True)

    # Audit
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="sha_members_created"
    )
    verified_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="sha_members_verified",
        null=True,
        blank=True,
    )
    verified_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        verbose_name = "SHA Member"
        verbose_name_plural = "SHA Members"
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["sha_number"]),
            models.Index(fields=["national_id"]),
            models.Index(fields=["status"]),
            models.Index(fields=["is_pfms_eligible"]),
        ]

    def __str__(self):
        return f"{self.sha_number} - {self.patient}"

    def save(self, *args, **kwargs):
        """Override save to run validation."""
        self.full_clean()
        super().save(*args, **kwargs)

    def clean(self):
        """Validate SHA member data."""
        errors = {}

        # Validate SHA number format (must start with SHA-)
        if self.sha_number and not self.sha_number.startswith("SHA-"):
            errors["sha_number"] = 'SHA number must start with "SHA-"'

        # Principal members should have a National ID; dependents may not
        if self.membership_type == self.MembershipType.PRINCIPAL and not self.national_id:
            errors["national_id"] = "National ID is required for principal members"

        # Dependents must have principal SHA number or principal FK
        if (
            self.membership_type != self.MembershipType.PRINCIPAL
            and not self.principal_sha_number
            and not self.principal
        ):
            errors["principal_sha_number"] = (
                "Dependents must have a principal SHA number or principal member reference"
            )
        # Validate principal FK points to a principal member
        if (
            self.membership_type != self.MembershipType.PRINCIPAL
            and self.principal
            and self.principal.membership_type != self.MembershipType.PRINCIPAL
        ):
            errors["principal"] = "Principal reference must point to a principal member"

        # Coverage dates validation
        if (
            self.coverage_start_date
            and self.coverage_end_date
            and self.coverage_end_date < self.coverage_start_date
        ):
            errors["coverage_end_date"] = "Coverage end date must be after start date"

        # PFMS validation: category required when PFMS eligible
        if self.is_pfms_eligible and not self.pfms_category:
            errors["pfms_category"] = "PFMS category is required when member is PFMS eligible"

        if errors:
            raise ValidationError(errors)

    def is_eligible(self) -> bool:
        """
        Check if member is currently eligible for claims.

        Returns False if:
        - Status is not ACTIVE
        - Coverage has expired
        - Eligibility validity has passed
        """
        if self.status != self.MembershipStatus.ACTIVE:
            return False

        today = date.today()

        # Check coverage end date
        if self.coverage_end_date and self.coverage_end_date < today:
            return False

        # Check eligibility validity
        return not (self.eligibility_valid_until and self.eligibility_valid_until < today)

    def needs_eligibility_check(self) -> bool:
        """
        Determine if eligibility should be re-verified.

        Returns True if:
        - No previous eligibility check
        - Last check was more than 24 hours ago
        """
        if not self.last_eligibility_check:
            return True

        # Re-check if last check was more than 24 hours ago
        threshold = timezone.now() - timedelta(hours=24)
        return self.last_eligibility_check < threshold

    def get_eligibility_display(self) -> str:
        """Return human-readable eligibility status."""
        if self.is_eligible():
            return "Eligible"
        return f"Not Eligible ({self.get_status_display()})"


class SHATariff(models.Model):
    """
    SHA Tariff code catalog for standardized claims pricing.

    Maps facility services to SHA-recognized tariff codes with
    approved reimbursement amounts. This is the master catalog
    used for claims submission and reimbursement calculations.

    Kenya SHA Context:
    - Tariffs are standardized across all SHA-accredited facilities
    - Different pricing tiers exist for facility levels (L1-L6)
    - Some services require pre-authorization
    - ICD-10 codes may be linked for diagnosis-based pricing
    """

    class TariffCategory(models.TextChoices):
        """Categories of SHA tariff codes."""

        CONSULTATION = "consultation", "Consultation"
        LABORATORY = "laboratory", "Laboratory"
        RADIOLOGY = "radiology", "Radiology/Imaging"
        PHARMACY = "pharmacy", "Pharmacy/Drugs"
        PROCEDURE = "procedure", "Procedures"
        SURGERY = "surgery", "Surgery"
        INPATIENT = "inpatient", "Inpatient Services"
        MATERNITY = "maternity", "Maternity"
        DENTAL = "dental", "Dental"
        OPTICAL = "optical", "Optical"
        PHYSIOTHERAPY = "physiotherapy", "Physiotherapy"
        DIALYSIS = "dialysis", "Dialysis"
        ONCOLOGY = "oncology", "Oncology"
        OTHER = "other", "Other Services"

    class TariffLevel(models.TextChoices):
        """Kenya healthcare facility levels."""

        LEVEL_1 = "L1", "Level 1 (Dispensary)"
        LEVEL_2 = "L2", "Level 2 (Health Centre)"
        LEVEL_3 = "L3", "Level 3 (Sub-County Hospital)"
        LEVEL_4 = "L4", "Level 4 (County Hospital)"
        LEVEL_5 = "L5", "Level 5 (National Referral)"
        LEVEL_6 = "L6", "Level 6 (Tertiary/Specialized)"

    id = models.BigAutoField(primary_key=True)

    # Tariff identification
    code = models.CharField(
        max_length=20, unique=True, help_text="SHA tariff code (e.g., SHA-CONS-001)"
    )
    name = models.CharField(max_length=200)
    description = models.TextField(blank=True)

    # Classification
    category = models.CharField(max_length=20, choices=TariffCategory.choices, db_index=True)
    facility_level = models.CharField(
        max_length=5, choices=TariffLevel.choices, help_text="Applicable facility level"
    )

    # Pricing
    sha_amount = models.DecimalField(
        max_digits=10, decimal_places=2, help_text="SHA approved reimbursement amount (KES)"
    )
    currency = models.CharField(max_length=3, default="KES")

    # Validity
    effective_date = models.DateField(help_text="Date from which this tariff is effective")
    expiry_date = models.DateField(
        null=True, blank=True, help_text="Date when tariff expires (null = no expiry)"
    )
    is_active = models.BooleanField(default=True)

    # Mapping to internal services
    internal_service = models.ForeignKey(
        "billing.Service",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="sha_tariffs",
        help_text="Linked internal service for auto-mapping",
    )

    # ICD-10 linkage (for diagnosis-based tariffs)
    applicable_icd10_codes = models.JSONField(
        default=list, blank=True, help_text="List of ICD-10 codes this tariff applies to"
    )

    # Requirements
    requires_preauthorization = models.BooleanField(
        default=False, help_text="Whether pre-authorization is required"
    )
    max_quantity_per_claim = models.IntegerField(
        default=1, help_text="Maximum quantity claimable per encounter"
    )
    waiting_period_days = models.IntegerField(
        default=0, help_text="Waiting period before claimable (days)"
    )

    # Audit
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "SHA Tariff"
        verbose_name_plural = "SHA Tariffs"
        ordering = ["category", "code"]
        indexes = [
            models.Index(fields=["code"]),
            models.Index(fields=["category", "is_active"]),
            models.Index(fields=["facility_level"]),
        ]

    def __str__(self):
        return f"{self.code} - {self.name} (KES {self.sha_amount})"

    def save(self, *args, **kwargs):
        """Override save to run validation."""
        self.full_clean()
        super().save(*args, **kwargs)

    def clean(self):
        """Validate tariff data."""
        errors = {}

        # SHA amount must be positive
        if self.sha_amount is not None and self.sha_amount <= 0:
            errors["sha_amount"] = "SHA amount must be greater than 0"

        # Expiry date must be after effective date
        if self.expiry_date and self.effective_date and self.expiry_date < self.effective_date:
            errors["expiry_date"] = "Expiry date must be after effective date"

        # Max quantity must be at least 1
        if self.max_quantity_per_claim < 1:
            errors["max_quantity_per_claim"] = "Maximum quantity must be at least 1"

        if errors:
            raise ValidationError(errors)

    def is_valid_on_date(self, check_date: date = None) -> bool:
        """
        Check if tariff is valid on given date.

        Args:
            check_date: Date to check validity for. Defaults to today.

        Returns:
            True if tariff is active, effective, and not expired.
        """
        check_date = check_date or date.today()

        # Must be active
        if not self.is_active:
            return False

        # Must be effective (not future)
        if self.effective_date > check_date:
            return False

        # Must not be expired (expiry is inclusive)
        return not (self.expiry_date and self.expiry_date < check_date)

    @classmethod
    def get_active_tariffs(cls, category: str = None, facility_level: str = None):
        """
        Get all currently valid tariffs, optionally filtered.

        Args:
            category: Optional TariffCategory to filter by
            facility_level: Optional TariffLevel to filter by

        Returns:
            QuerySet of valid SHATariff instances
        """
        today = date.today()
        qs = cls.objects.filter(is_active=True, effective_date__lte=today).filter(
            models.Q(expiry_date__isnull=True) | models.Q(expiry_date__gte=today)
        )

        if category:
            qs = qs.filter(category=category)
        if facility_level:
            qs = qs.filter(facility_level=facility_level)

        return qs

    @classmethod
    def find_tariff_for_service(cls, service, facility_level: str):
        """
        Find matching SHA tariff for an internal service.

        Lookup priority:
        1. Direct mapping via internal_service FK
        2. Matching SHA code on service

        Args:
            service: Service instance to find tariff for
            facility_level: TariffLevel to match

        Returns:
            Matching SHATariff or None
        """
        # First try direct mapping
        tariff = (
            cls.get_active_tariffs(facility_level=facility_level)
            .filter(internal_service=service)
            .first()
        )

        if tariff:
            return tariff

        # Try matching by SHA code on service
        if service.sha_code:
            tariff = (
                cls.get_active_tariffs(facility_level=facility_level)
                .filter(code=service.sha_code)
                .first()
            )

        return tariff


class SHAClaim(FacilityScopedModel):
    """
    SHA Claim submission record.

    Represents a complete claim package submitted to SHA for reimbursement.
    Tracks full lifecycle: Draft → Submitted → Under Review → Approved/Rejected → Paid.

    Kenya SHA Context:
    - Claims must include patient eligibility verification
    - Required attachments: clinical notes, invoices, lab reports (when applicable)
    - Pre-authorization required for some procedures
    - Appeals process available for rejected/partially approved claims
    """

    class ClaimStatus(models.TextChoices):
        """SHA claim lifecycle statuses."""

        DRAFT = "draft", "Draft"
        VALIDATED = "validated", "Validated"
        PENDING_SUBMISSION = "pending_submission", "Pending Submission (Queued)"
        SUBMITTED = "submitted", "Submitted"
        ACKNOWLEDGED = "acknowledged", "Acknowledged by SHA"
        UNDER_REVIEW = "under_review", "Under Review"
        QUERY = "query", "Query Raised"
        APPROVED = "approved", "Approved"
        PARTIALLY_APPROVED = "partial", "Partially Approved"
        REJECTED = "rejected", "Rejected"
        APPEALED = "appealed", "Appealed"
        PAID = "paid", "Paid"
        WRITTEN_OFF = "written_off", "Written Off"

    class ClaimType(models.TextChoices):
        """Types of SHA claims."""

        OUTPATIENT = "outpatient", "Outpatient"
        INPATIENT = "inpatient", "Inpatient"
        MATERNITY = "maternity", "Maternity"
        SURGERY = "surgery", "Surgery"
        CHRONIC = "chronic", "Chronic Disease Management"
        EMERGENCY = "emergency", "Emergency"
        DENTAL = "dental", "Dental"
        OPTICAL = "optical", "Optical"
        DIALYSIS = "dialysis", "Dialysis"

    class SubmissionMethod(models.TextChoices):
        """Methods for submitting claims to SHA."""

        API = "api", "API Integration"
        PORTAL = "portal", "SHA Portal"
        MANUAL = "manual", "Manual Submission"

    class ClaimFlow(models.TextChoices):
        """DHA HIE claim routing flow determined by eligibility + facility level."""

        PHC = "phc", "Primary Health Care (UHC, Level 2-3)"
        SHIF = "shif", "SHIF (Level 3+, biometric/OTP consent)"
        ECCIF = "eccif", "Emergency (ECCIF, bundled tariffs)"

    id = models.BigAutoField(primary_key=True)

    # Claim identification
    claim_number = models.CharField(
        max_length=30,
        unique=True,
        editable=False,
        help_text="Internal claim reference (format: CLM-YYYYMMDD-XXXX)",
    )
    sha_claim_reference = models.CharField(
        max_length=50, blank=True, db_index=True, help_text="SHA-assigned claim reference number"
    )

    # Patient and encounter linkage
    patient = models.ForeignKey(
        "patients.Patient", on_delete=models.PROTECT, related_name="sha_claims"
    )
    sha_member = models.ForeignKey(
        "billing.SHAMember",
        on_delete=models.PROTECT,
        related_name="claims",
        null=True,  # Allow null for validation error testing
    )
    encounter = models.ForeignKey(
        "encounters.Encounter", on_delete=models.PROTECT, related_name="sha_claims"
    )
    invoice = models.ForeignKey(
        "billing.Invoice",
        on_delete=models.PROTECT,
        related_name="sha_claims",
        null=True,
        blank=True,
    )

    # Claim details
    claim_type = models.CharField(max_length=20, choices=ClaimType.choices)
    status = models.CharField(max_length=20, choices=ClaimStatus.choices, default=ClaimStatus.DRAFT)

    # Service dates
    service_date = models.DateField(help_text="Date service was provided")
    admission_date = models.DateField(
        null=True, blank=True, help_text="Admission date (for inpatient claims)"
    )
    discharge_date = models.DateField(
        null=True, blank=True, help_text="Discharge date (for inpatient claims)"
    )

    # Diagnosis (ICD-10)
    primary_diagnosis_code = models.CharField(
        max_length=10, help_text="Primary ICD-10 diagnosis code"
    )
    primary_diagnosis_description = models.CharField(max_length=255)
    secondary_diagnosis_codes = models.JSONField(
        default=list, blank=True, help_text="List of secondary ICD-10 diagnosis codes"
    )

    # Amounts
    claimed_amount = models.DecimalField(
        max_digits=12, decimal_places=2, default=Decimal("0.00"), help_text="Total amount claimed"
    )
    approved_amount = models.DecimalField(
        max_digits=12, decimal_places=2, default=Decimal("0.00"), help_text="Amount approved by SHA"
    )
    paid_amount = models.DecimalField(
        max_digits=12, decimal_places=2, default=Decimal("0.00"), help_text="Amount actually paid"
    )
    patient_copay = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        default=Decimal("0.00"),
        help_text="Amount to be paid by patient",
    )

    # Submission details
    submission_method = models.CharField(
        max_length=20, choices=SubmissionMethod.choices, default=SubmissionMethod.API
    )
    submitted_at = models.DateTimeField(null=True, blank=True)
    submission_response = models.JSONField(
        default=dict, blank=True, help_text="Response from SHA on submission"
    )

    # DHA HIE claim flow routing
    claim_flow = models.CharField(
        max_length=5,
        choices=ClaimFlow.choices,
        blank=True,
        help_text="DHA HIE claim flow (PHC/SHIF/ECCIF), set by flow router",
    )
    is_emergency_claim = models.BooleanField(
        default=False,
        help_text="Whether this is an emergency claim (ECCIF flow)",
    )

    # Adjudication
    adjudication_date = models.DateField(null=True, blank=True)
    adjudication_notes = models.TextField(blank=True)
    rejection_reason = models.TextField(blank=True)
    rejection_code = models.CharField(max_length=20, blank=True)

    # Payment
    payment_date = models.DateField(null=True, blank=True)
    payment_reference = models.CharField(max_length=50, blank=True)

    # Pre-authorization (if required)
    preauth_number = models.CharField(
        max_length=50, blank=True, help_text="Pre-authorization reference number"
    )
    preauth_date = models.DateField(null=True, blank=True)
    preauth_valid_until = models.DateField(null=True, blank=True)

    # Facility details
    facility_code = models.CharField(max_length=20, help_text="MFL (Master Facility List) code")
    facility_level = models.CharField(max_length=5, choices=SHATariff.TariffLevel.choices)

    # Audit
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="sha_claims_created"
    )
    submitted_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="sha_claims_submitted",
        null=True,
        blank=True,
    )

    # Version tracking for resubmissions
    version = models.IntegerField(default=1)
    parent_claim = models.ForeignKey(
        "self",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="resubmissions",
        help_text="Original claim if this is a resubmission",
    )

    # DHA HIE Middleware (ILM) lifecycle tracking
    dha_external_id = models.CharField(
        max_length=64,
        blank=True,
        default="",
        help_text="DHA-side claim identifier returned by /api/v1/claims/visit",
    )
    dha_correlation_id = models.CharField(
        max_length=64,
        blank=True,
        default="",
        help_text="Last X-Correlation-Id used when calling DHA HIE",
    )
    last_dha_status = models.CharField(
        max_length=32,
        blank=True,
        default="",
        help_text="Last DHA-side status (VISIT_STARTED, SUBMITTED, CLOSED, ...)",
    )
    last_dha_payload_at = models.DateTimeField(
        null=True,
        blank=True,
        help_text="Timestamp of the most recent successful DHA HIE call",
    )
    dha_visit_started_at = models.DateTimeField(
        null=True,
        blank=True,
        help_text="When /api/v1/claims/visit succeeded for this claim",
    )

    class Meta:
        verbose_name = "SHA Claim"
        verbose_name_plural = "SHA Claims"
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["claim_number"]),
            models.Index(fields=["sha_claim_reference"]),
            models.Index(fields=["patient", "status"]),
            models.Index(fields=["status", "submitted_at"]),
            models.Index(fields=["service_date"]),
        ]
        permissions = [
            ("submit_sha_claim", "Can submit SHA claims"),
            ("approve_sha_claim", "Can approve SHA claims locally"),
            ("appeal_sha_claim", "Can submit SHA claim appeals"),
        ]

    def __str__(self):
        return f"{self.claim_number} - {self.patient} ({self.get_status_display()})"

    def save(self, *args, **kwargs):
        """Override save to generate claim number, auto-resolve tenant, and run validation."""
        if not self.claim_number:
            self.claim_number = self.generate_claim_number()
        # Auto-resolve facility from encounter if not explicitly set
        if not self.facility_id and self.encounter_id:
            try:
                enc = self.encounter
                if enc.facility_id:
                    self.facility_id = enc.facility_id
            except Exception:  # noqa: S110
                pass  # Encounter may not be loaded yet during migrations
        # Backfill facility_code from facility FK if not set
        if self.facility and not self.facility_code:
            self.facility_code = self.facility.mfl_code or ""
        self.full_clean()
        super().save(*args, **kwargs)

    def clean(self):
        """Validate claim data."""
        errors = {}

        # Validate patient has SHA membership
        if self.sha_member is None:
            errors["sha_member"] = "Patient must have SHA membership for claims"

        # Validate service date not in future
        if self.service_date and self.service_date > date.today():
            errors["service_date"] = "Service date cannot be in the future"

        # Validate inpatient claims have admission date
        if self.claim_type == self.ClaimType.INPATIENT and not self.admission_date:
            errors["admission_date"] = "Inpatient claims require admission date"

        # Validate discharge after admission
        if (
            self.admission_date
            and self.discharge_date
            and self.discharge_date < self.admission_date
        ):
            errors["discharge_date"] = "Discharge date must be on or after admission date"

        # Validate claimed amount is not negative
        if self.claimed_amount is not None and self.claimed_amount < 0:
            errors["claimed_amount"] = "Claimed amount cannot be negative"

        # Validate status is a valid choice
        if self.status and self.status not in [c[0] for c in self.ClaimStatus.choices]:
            errors["status"] = "Invalid status"

        # Validate claim_type is a valid choice
        if self.claim_type and self.claim_type not in [c[0] for c in self.ClaimType.choices]:
            errors["claim_type"] = "Invalid claim type"

        if errors:
            raise ValidationError(errors)

    @staticmethod
    def generate_claim_number() -> str:
        """Generate unique claim number in format CLM-YYYYMMDD-XXXX."""
        today = date.today()
        date_str = today.strftime("%Y%m%d")
        prefix = f"CLM-{date_str}-"

        last_claim = (
            SHAClaim.objects.filter(claim_number__startswith=prefix)
            .order_by("-claim_number")
            .first()
        )

        if last_claim:
            last_seq = int(last_claim.claim_number.split("-")[-1])
            new_seq = last_seq + 1
        else:
            new_seq = 1

        return f"{prefix}{new_seq:04d}"

    def calculate_claimed_amount(self):
        """Calculate total claimed amount from claim items."""
        # Avoid using the related manager cache when this claim was prefetched
        # (e.g., queryset.prefetch_related('items')), otherwise newly created
        # items in the same request may not be reflected.
        items = SHAClaimItem.objects.filter(claim=self).only("claimed_amount")
        self.claimed_amount = (
            sum(item.claimed_amount for item in items) if items.exists() else Decimal("0.00")
        )
        self.save(update_fields=["claimed_amount", "updated_at"])

    def validate_for_submission(self) -> tuple[bool, list[str]]:
        """
        Validate claim is ready for submission.

        Returns:
            Tuple of (is_valid, list_of_errors)
        """
        errors = []

        # Check claim is not already submitted
        # Allow DRAFT, VALIDATED, and PENDING_SUBMISSION (for queued claims being retried)
        allowed_statuses = [
            self.ClaimStatus.DRAFT,
            self.ClaimStatus.VALIDATED,
            self.ClaimStatus.PENDING_SUBMISSION,
        ]
        if self.status not in allowed_statuses:
            errors.append(f"Claim status '{self.get_status_display()}' cannot be submitted")

        # Check SHA member eligibility
        if self.sha_member and not self.sha_member.is_eligible():
            errors.append(f"Member not eligible: {self.sha_member.get_eligibility_display()}")

        # Check has items
        if not self.items.exists():
            errors.append("Claim must have at least one item")

        # Check all items have tariff codes
        items_without_tariff = self.items.filter(tariff__isnull=True)
        if items_without_tariff.exists():
            count = items_without_tariff.count()
            errors.append(f"{count} item(s) missing SHA tariff code")

        # Check required attachments (clinical_notes and invoice are required)
        required_types = ["clinical_notes", "invoice"]
        existing_types = list(self.attachments.values_list("attachment_type", flat=True))
        for req_type in required_types:
            if req_type not in existing_types:
                errors.append(f"Missing required attachment: {req_type}")

        # Check claimed amount is positive
        if self.claimed_amount <= Decimal("0.00"):
            errors.append("Claimed amount must be greater than zero")

        # Check pre-authorization for restricted services
        items_needing_preauth = self.items.filter(
            tariff__isnull=False,
            tariff__requires_preauthorization=True,
        ).select_related("tariff")
        if items_needing_preauth.exists():
            approved_preauth = self.preauth_requests.filter(
                decision="APPROVED",
            ).first()
            if not approved_preauth:
                tariff_codes = ", ".join(i.tariff.code for i in items_needing_preauth if i.tariff)
                errors.append(
                    f"Pre-authorization required for restricted services ({tariff_codes}) "
                    "but no approved pre-authorization found"
                )
            elif approved_preauth.valid_until and approved_preauth.valid_until < date.today():
                errors.append(
                    f"Pre-authorization {approved_preauth.preauth_reference} has expired "
                    f"(valid until {approved_preauth.valid_until})"
                )

        return len(errors) == 0, errors

    def submit(self, user) -> bool:
        """
        Mark claim as submitted.

        Args:
            user: User performing the submission

        Returns:
            True if submission successful

        Raises:
            ValidationError if claim is not valid for submission
        """
        is_valid, errors = self.validate_for_submission()
        if not is_valid:
            raise ValidationError({"__all__": errors})

        self.status = self.ClaimStatus.SUBMITTED
        self.submitted_at = timezone.now()
        self.submitted_by = user
        self.save(update_fields=["status", "submitted_at", "submitted_by", "updated_at"])
        return True

    def get_age_days(self) -> int:
        """
        Get claim age in days since submission.

        Returns:
            Number of days since submission, or 0 if not submitted
        """
        if not self.submitted_at:
            return 0
        return (timezone.now() - self.submitted_at).days

    def can_appeal(self) -> bool:
        """
        Check if claim can be appealed.

        Returns:
            True if claim status allows appeal
        """
        appealable_statuses = [
            self.ClaimStatus.REJECTED,
            self.ClaimStatus.PARTIALLY_APPROVED,
        ]
        return self.status in appealable_statuses

    def create_appeal(self, reason: str, user) -> "SHAClaim":
        """
        Create an appeal (resubmission) of this claim.

        Args:
            reason: Reason for appeal (stored in appeal notes)
            user: User creating the appeal

        Returns:
            New SHAClaim instance for the appeal

        Raises:
            ValidationError if claim cannot be appealed
        """
        if not self.can_appeal():
            raise ValidationError(
                {"__all__": [f"Claim with status '{self.get_status_display()}' cannot be appealed"]}
            )

        # Create new claim as appeal with reason stored in notes
        appeal = SHAClaim.objects.create(
            patient=self.patient,
            sha_member=self.sha_member,
            encounter=self.encounter,
            invoice=self.invoice,
            claim_type=self.claim_type,
            service_date=self.service_date,
            admission_date=self.admission_date,
            discharge_date=self.discharge_date,
            primary_diagnosis_code=self.primary_diagnosis_code,
            primary_diagnosis_description=self.primary_diagnosis_description,
            secondary_diagnosis_codes=self.secondary_diagnosis_codes,
            facility_code=self.facility_code,
            facility_level=self.facility_level,
            preauth_number=self.preauth_number,
            preauth_date=self.preauth_date,
            preauth_valid_until=self.preauth_valid_until,
            adjudication_notes=f"Appeal reason: {reason}",
            version=self.version + 1,
            parent_claim=self,
            created_by=user,
        )

        # Update original claim status
        self.status = self.ClaimStatus.APPEALED
        self.save(update_fields=["status", "updated_at"])

        # Copy items to appeal
        for item in self.items.all():
            SHAClaimItem.objects.create(
                claim=appeal,
                tariff=item.tariff,
                service=item.service,
                description=item.description,
                quantity=item.quantity,
                unit_price=item.unit_price,
                claimed_amount=item.claimed_amount,
            )

        return appeal


class SHAClaimItem(models.Model):
    """
    Individual line item within a SHA claim.

    Each item represents a service provided, mapped to a SHA tariff
    code for reimbursement calculation.
    """

    class ItemStatus(models.TextChoices):
        """Status of the claim item during adjudication."""

        PENDING = "pending", "Pending Review"
        APPROVED = "approved", "Approved"
        REJECTED = "rejected", "Rejected"
        ADJUSTED = "adjusted", "Adjusted"

    class CoverageType(models.TextChoices):
        """Which coverage pays for this item."""

        SHA = "sha", "SHA Coverage"
        PFMS = "pfms", "PFMS Coverage (Government Subsidy)"
        BOTH = "both", "Split Between SHA and PFMS"

    id = models.BigAutoField(primary_key=True)

    # Claim linkage
    claim = models.ForeignKey(SHAClaim, on_delete=models.CASCADE, related_name="items")

    # Tariff mapping
    tariff = models.ForeignKey(
        SHATariff,
        on_delete=models.PROTECT,
        related_name="claim_items",
        null=True,
        blank=True,
        help_text="SHA tariff code for this item",
    )

    # Internal service (for reference)
    service = models.ForeignKey(
        "billing.Service",
        on_delete=models.PROTECT,
        related_name="sha_claim_items",
        null=True,
        blank=True,
    )
    invoice_item = models.ForeignKey(
        "billing.InvoiceItem",
        on_delete=models.SET_NULL,
        related_name="sha_claim_items",
        null=True,
        blank=True,
    )

    # Item details
    description = models.CharField(max_length=255)
    service_date = models.DateField(
        null=True, blank=True, help_text="Date this specific service was provided"
    )

    # Coverage type (for PFMS dual coverage - SHA Checklist item #13)
    coverage_type = models.CharField(
        max_length=10,
        choices=CoverageType.choices,
        default=CoverageType.SHA,
        help_text="Which coverage pays for this item (SHA, PFMS, or both)",
    )

    # Quantity and pricing
    quantity = models.DecimalField(max_digits=10, decimal_places=2, default=Decimal("1.00"))
    unit_price = models.DecimalField(
        max_digits=10, decimal_places=2, help_text="SHA tariff unit price"
    )
    claimed_amount = models.DecimalField(
        max_digits=12, decimal_places=2, help_text="Total claimed (quantity × unit_price)"
    )

    # Adjudication results
    status = models.CharField(max_length=20, choices=ItemStatus.choices, default=ItemStatus.PENDING)
    approved_quantity = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    approved_amount = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    rejection_reason = models.CharField(max_length=255, blank=True)

    # Audit
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "SHA Claim Item"
        verbose_name_plural = "SHA Claim Items"
        ordering = ["claim", "created_at"]

    def __str__(self):
        return f"{self.claim.claim_number} - {self.description}"

    def save(self, *args, **kwargs):
        """Override save to auto-calculate claimed amount and validate."""
        # Auto-calculate claimed amount (quantize to 2 decimal places)
        if self.quantity is not None and self.unit_price is not None:
            self.claimed_amount = (self.quantity * self.unit_price).quantize(Decimal("0.01"))

        self.full_clean()
        super().save(*args, **kwargs)

        # Update parent claim total
        self.claim.calculate_claimed_amount()

    def clean(self):
        """Validate claim item data."""
        errors = {}

        # Quantity must be positive
        if self.quantity is not None and self.quantity <= 0:
            errors["quantity"] = "Quantity must be greater than 0"

        # Unit price cannot be negative
        if self.unit_price is not None and self.unit_price < 0:
            errors["unit_price"] = "Unit price cannot be negative"

        # Validate against tariff max quantity
        if self.tariff and self.quantity and self.quantity > self.tariff.max_quantity_per_claim:
            errors["quantity"] = (
                f"Exceeds maximum quantity ({self.tariff.max_quantity_per_claim}) for this tariff"
            )

        if errors:
            raise ValidationError(errors)

    def apply_tariff(self, tariff: "SHATariff"):
        """
        Apply a tariff code to this item.

        Updates the tariff reference, unit price, and recalculates
        the claimed amount.

        Args:
            tariff: SHATariff instance to apply
        """
        self.tariff = tariff
        self.unit_price = tariff.sha_amount
        self.claimed_amount = (self.quantity * self.unit_price).quantize(Decimal("0.01"))
        self.save()

    @classmethod
    def create_from_invoice_item(
        cls, claim: "SHAClaim", invoice_item: "InvoiceItem", tariff: "SHATariff" = None
    ) -> "SHAClaimItem":
        """
        Create claim item from an invoice item.

        Attempts to find a matching tariff if not provided.

        Args:
            claim: Parent SHAClaim
            invoice_item: InvoiceItem to create from
            tariff: Optional SHATariff (will auto-find if not provided)

        Returns:
            Created SHAClaimItem instance
        """
        # Try to find matching tariff if not provided
        if not tariff and invoice_item.service:
            tariff = SHATariff.find_tariff_for_service(invoice_item.service, claim.facility_level)

        unit_price = tariff.sha_amount if tariff else invoice_item.unit_price

        return cls.objects.create(
            claim=claim,
            tariff=tariff,
            service=invoice_item.service,
            invoice_item=invoice_item,
            description=invoice_item.description,
            service_date=claim.service_date,
            quantity=invoice_item.quantity,
            unit_price=unit_price,
        )


class SHAClaimAttachment(models.Model):
    """
    Attachment for SHA claim submission.

    SHA requires various supporting documents for claims:
    - Clinical notes
    - Invoices
    - Lab reports (when applicable)
    - Prescriptions (for pharmacy claims)
    - Pre-authorization letters (when required)
    """

    class AttachmentType(models.TextChoices):
        """Types of claim attachments."""

        CLINICAL_NOTES = "clinical_notes", "Clinical Notes"
        LAB_REPORT = "lab_report", "Laboratory Report"
        RADIOLOGY_REPORT = "radiology_report", "Radiology Report"
        PRESCRIPTION = "prescription", "Prescription"
        INVOICE = "invoice", "Invoice"
        DISCHARGE_SUMMARY = "discharge_summary", "Discharge Summary"
        OPERATIVE_NOTES = "operative_notes", "Operative Notes"
        REFERRAL_LETTER = "referral_letter", "Referral Letter"
        PREAUTH_APPROVAL = "preauth_approval", "Pre-authorization Approval"
        ID_COPY = "id_copy", "ID Copy"
        SHA_CARD = "sha_card", "SHA Card Copy"
        OTHER = "other", "Other Document"

    # Allowed MIME types for attachments
    ALLOWED_MIME_TYPES = [
        "application/pdf",
        "image/jpeg",
        "image/png",
        "image/tiff",
    ]

    # Maximum file size: 10MB
    MAX_FILE_SIZE = 10 * 1024 * 1024

    id = models.BigAutoField(primary_key=True)

    # Claim linkage
    claim = models.ForeignKey(SHAClaim, on_delete=models.CASCADE, related_name="attachments")

    # Attachment details
    attachment_type = models.CharField(max_length=30, choices=AttachmentType.choices)
    name = models.CharField(max_length=255)
    description = models.TextField(blank=True)

    # File storage (validated at serializer level via magic-byte sniffing)
    file = models.FileField(
        upload_to="sha_claims/%Y/%m/",
        max_length=500,
    )
    file_size = models.IntegerField(null=True, blank=True, help_text="File size in bytes")
    mime_type = models.CharField(max_length=100, blank=True)
    checksum = models.CharField(
        max_length=64, blank=True, help_text="SHA-256 checksum for integrity verification"
    )

    # Metadata
    original_filename = models.CharField(max_length=255, blank=True)
    page_count = models.IntegerField(null=True, blank=True, help_text="Number of pages (for PDFs)")

    # Audit
    created_at = models.DateTimeField(auto_now_add=True)
    uploaded_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="sha_attachments_uploaded"
    )

    class Meta:
        verbose_name = "SHA Claim Attachment"
        verbose_name_plural = "SHA Claim Attachments"
        ordering = ["claim", "attachment_type"]

    def __str__(self):
        return f"{self.claim.claim_number} - {self.get_attachment_type_display()}"

    def save(self, *args, **kwargs):
        self.full_clean()
        super().save(*args, **kwargs)

    def clean(self):
        """Validate attachment."""
        # Max file size: 10MB
        if self.file_size and self.file_size > self.MAX_FILE_SIZE:
            raise ValidationError(
                {
                    "file_size": f"File size exceeds maximum allowed (10MB). Got {self.file_size} bytes."
                }
            )

        # Allowed mime types
        if self.mime_type and self.mime_type not in self.ALLOWED_MIME_TYPES:
            raise ValidationError(
                {
                    "mime_type": f"File type not allowed. Allowed types: PDF, JPEG, PNG, TIFF. Got: {self.mime_type}"
                }
            )

    @classmethod
    def get_required_types(cls, claim_type: str) -> list[str]:
        """Get required attachment types for a claim type."""
        base_required = ["clinical_notes", "invoice"]

        additional = {
            "inpatient": ["discharge_summary"],
            "surgery": ["discharge_summary", "operative_notes"],
            "maternity": ["discharge_summary"],
        }

        return base_required + additional.get(claim_type, [])


class SHAEligibilityCheck(models.Model):
    """
    Log of SHA eligibility verification requests.

    Records all eligibility checks for audit trail and debugging.
    """

    class CheckResult(models.TextChoices):
        ELIGIBLE = "eligible", "Eligible"
        INELIGIBLE = "ineligible", "Ineligible"
        PENDING = "pending", "Pending"
        ERROR = "error", "Error"
        TIMEOUT = "timeout", "Request Timeout"

    id = models.BigAutoField(primary_key=True)

    # Member being checked
    sha_member = models.ForeignKey(
        SHAMember, on_delete=models.CASCADE, related_name="eligibility_checks"
    )
    patient = models.ForeignKey(
        "patients.Patient", on_delete=models.CASCADE, related_name="sha_eligibility_checks"
    )

    # Request details
    check_date = models.DateTimeField(auto_now_add=True)
    request_data = models.JSONField(default=dict, help_text="Request payload sent to SHA")

    # Response
    result = models.CharField(max_length=20, choices=CheckResult.choices)
    response_data = models.JSONField(default=dict, help_text="Response from SHA API")
    response_time_ms = models.IntegerField(
        null=True, blank=True, help_text="API response time in milliseconds"
    )

    # Eligibility details (extracted from response)
    is_eligible = models.BooleanField(default=False)
    eligible_until = models.DateField(null=True, blank=True)
    benefit_balance = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        null=True,
        blank=True,
        help_text="Remaining benefit balance",
    )
    ineligibility_reason = models.CharField(max_length=255, blank=True)

    # Error handling
    error_code = models.CharField(max_length=50, blank=True)
    error_message = models.TextField(blank=True)

    # Audit
    checked_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="sha_eligibility_checks"
    )

    class Meta:
        verbose_name = "SHA Eligibility Check"
        verbose_name_plural = "SHA Eligibility Checks"
        ordering = ["-check_date"]
        indexes = [
            models.Index(fields=["sha_member", "check_date"]),
            models.Index(fields=["result"]),
        ]

    def __str__(self):
        return f"{self.sha_member.sha_number} - {self.result} ({self.check_date})"

    def update_member_eligibility(self):
        """Update the SHA member record with eligibility results."""
        member = self.sha_member

        # Update eligibility cache
        member.last_eligibility_check = timezone.now()
        member.eligibility_response = self.response_data

        if self.is_eligible:
            member.status = SHAMember.MembershipStatus.ACTIVE
            if self.eligible_until:
                member.eligibility_valid_until = self.eligible_until
        else:
            # Determine status based on ineligibility reason
            reason_lower = self.ineligibility_reason.lower()
            if "expired" in reason_lower:
                member.status = SHAMember.MembershipStatus.EXPIRED
            elif "suspended" in reason_lower:
                member.status = SHAMember.MembershipStatus.SUSPENDED
            else:
                member.status = SHAMember.MembershipStatus.INACTIVE

        member.save()


# ============================================================================
# Facility Billing Configuration
# ============================================================================


class FacilityBillingConfig(models.Model):
    """
    Per-facility billing configuration.

    Stores billing-specific settings for each facility, including:
    - Default payment type for new invoices
    - SHA accreditation status and contract tracking
    - Fee schedule overrides
    - Collection account identifiers

    Each facility has at most one config record (one-to-one).

    Kenya Context:
    - SHA-contracted facilities need accreditation tracking
    - Different facilities may have different fee schedules
    - Multi-facility organizations need isolated collection reporting
    """

    class SHAAccreditationStatus(models.TextChoices):
        """SHA accreditation lifecycle statuses."""

        NOT_APPLIED = "not_applied", "Not Applied"
        PENDING = "pending", "Application Pending"
        ACCREDITED = "accredited", "Accredited"
        CONDITIONAL = "conditional", "Conditional Accreditation"
        SUSPENDED = "suspended", "Suspended"
        REVOKED = "revoked", "Revoked"
        EXPIRED = "expired", "Expired"

    id = models.BigAutoField(primary_key=True)

    facility = models.OneToOneField(
        "core.Facility",
        on_delete=models.CASCADE,
        related_name="billing_config",
        help_text="The facility this billing config belongs to.",
    )

    # ------------------------------------------------------------------
    # Default Billing Settings
    # ------------------------------------------------------------------

    default_payment_type = models.CharField(
        max_length=20,
        choices=Invoice.PaymentType.choices,
        default=Invoice.PaymentType.CASH,
        help_text="Default payment type for new invoices at this facility.",
    )
    default_due_days = models.PositiveIntegerField(
        default=30,
        help_text="Default number of days until invoice is due.",
    )
    auto_finalize_on_checkout = models.BooleanField(
        default=False,
        help_text="Automatically finalize draft invoices when patient checks out.",
    )
    tax_rate = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        default=Decimal("0.00"),
        help_text="Default tax rate (percentage) applied to invoices. 0 = exempt.",
    )

    # ------------------------------------------------------------------
    # SHA Accreditation & Contract Tracking
    # ------------------------------------------------------------------

    sha_accreditation_status = models.CharField(
        max_length=20,
        choices=SHAAccreditationStatus.choices,
        default=SHAAccreditationStatus.NOT_APPLIED,
        help_text="Current SHA accreditation status for this facility.",
    )
    sha_accreditation_date = models.DateField(
        null=True,
        blank=True,
        help_text="Date when SHA accreditation was granted.",
    )
    sha_accreditation_expiry = models.DateField(
        null=True,
        blank=True,
        help_text="Date when current SHA accreditation expires.",
    )
    sha_contract_number = models.CharField(
        max_length=50,
        blank=True,
        default="",
        help_text="SHA contract reference number.",
    )
    sha_contract_start = models.DateField(
        null=True,
        blank=True,
        help_text="Date when the SHA contract became effective.",
    )
    sha_contract_end = models.DateField(
        null=True,
        blank=True,
        help_text="Date when the SHA contract expires.",
    )
    sha_service_level = models.CharField(
        max_length=50,
        blank=True,
        default="",
        help_text="SHA service level agreement tier (e.g., 'Comprehensive', 'Basic').",
    )
    sha_max_claim_amount = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        null=True,
        blank=True,
        help_text="Maximum single claim amount allowed under this contract.",
    )

    # ------------------------------------------------------------------
    # Fee Schedule
    # ------------------------------------------------------------------

    fee_schedule_name = models.CharField(
        max_length=100,
        blank=True,
        default="",
        help_text="Name of the fee schedule applied at this facility.",
    )
    fee_schedule_override = models.JSONField(
        default=dict,
        blank=True,
        help_text="Service code → price overrides. Keys are service codes, values are unit prices.",
    )

    # ------------------------------------------------------------------
    # Collection Accounts
    # ------------------------------------------------------------------

    mpesa_paybill = models.CharField(
        max_length=20,
        blank=True,
        default="",
        help_text="M-Pesa paybill number for this facility.",
    )
    mpesa_account_ref = models.CharField(
        max_length=50,
        blank=True,
        default="",
        help_text="Default M-Pesa account reference / till number.",
    )
    bank_name = models.CharField(
        max_length=100,
        blank=True,
        default="",
        help_text="Bank name for the facility's collection account.",
    )
    bank_account_number = models.CharField(
        max_length=50,
        blank=True,
        default="",
        help_text="Bank account number for collections.",
    )
    bank_branch = models.CharField(
        max_length=100,
        blank=True,
        default="",
        help_text="Bank branch name.",
    )

    # ------------------------------------------------------------------
    # M-Pesa API Credentials (per-facility multi-tenant support)
    # ------------------------------------------------------------------

    class MpesaEnvironment(models.TextChoices):
        SANDBOX = "sandbox", "Sandbox"
        PRODUCTION = "production", "Production"

    mpesa_consumer_key_encrypted = models.TextField(
        blank=True,
        default="",
        help_text="Daraja API consumer key (KMS-encrypted).",
    )
    mpesa_consumer_secret_encrypted = models.TextField(
        blank=True,
        default="",
        help_text="Daraja API consumer secret (KMS-encrypted).",
    )
    mpesa_passkey_encrypted = models.TextField(
        blank=True,
        default="",
        help_text="Lipa Na M-Pesa Online passkey (KMS-encrypted).",
    )
    mpesa_shortcode = models.CharField(
        max_length=20,
        blank=True,
        default="",
        help_text="M-Pesa business shortcode (paybill/till) for STK Push.",
    )
    mpesa_callback_url = models.URLField(
        max_length=500,
        blank=True,
        default="",
        help_text="Callback URL Safaricom will POST payment results to.",
    )
    mpesa_environment = models.CharField(
        max_length=20,
        choices=MpesaEnvironment.choices,
        default=MpesaEnvironment.SANDBOX,
        help_text="Daraja API environment (sandbox or production).",
    )

    # ------------------------------------------------------------------
    # Audit
    # ------------------------------------------------------------------

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "Facility Billing Config"
        verbose_name_plural = "Facility Billing Configs"

    def __str__(self):
        return f"Billing Config – {self.facility.name}"

    # ------------------------------------------------------------------
    # KMS-encrypted M-Pesa credential properties
    # ------------------------------------------------------------------

    @property
    def mpesa_consumer_key(self) -> str:
        if not self.mpesa_consumer_key_encrypted:
            return ""
        from hmis.apps.core.kms import get_kms_provider

        return get_kms_provider().decrypt_string(self.mpesa_consumer_key_encrypted)

    @mpesa_consumer_key.setter
    def mpesa_consumer_key(self, value: str) -> None:
        if not value:
            self.mpesa_consumer_key_encrypted = ""
            return
        from hmis.apps.core.kms import get_kms_provider

        self.mpesa_consumer_key_encrypted = get_kms_provider().encrypt_string(value)

    @property
    def mpesa_consumer_secret(self) -> str:
        if not self.mpesa_consumer_secret_encrypted:
            return ""
        from hmis.apps.core.kms import get_kms_provider

        return get_kms_provider().decrypt_string(self.mpesa_consumer_secret_encrypted)

    @mpesa_consumer_secret.setter
    def mpesa_consumer_secret(self, value: str) -> None:
        if not value:
            self.mpesa_consumer_secret_encrypted = ""
            return
        from hmis.apps.core.kms import get_kms_provider

        self.mpesa_consumer_secret_encrypted = get_kms_provider().encrypt_string(value)

    @property
    def mpesa_passkey(self) -> str:
        if not self.mpesa_passkey_encrypted:
            return ""
        from hmis.apps.core.kms import get_kms_provider

        return get_kms_provider().decrypt_string(self.mpesa_passkey_encrypted)

    @mpesa_passkey.setter
    def mpesa_passkey(self, value: str) -> None:
        if not value:
            self.mpesa_passkey_encrypted = ""
            return
        from hmis.apps.core.kms import get_kms_provider

        self.mpesa_passkey_encrypted = get_kms_provider().encrypt_string(value)

    @property
    def has_mpesa_credentials(self) -> bool:
        """Return True if the minimum required M-Pesa API credentials are configured.

        Sandbox only needs consumer_key + consumer_secret (Safaricom provides
        shared shortcode 174379 and a public test passkey).
        Production requires all four fields.
        """
        core = bool(self.mpesa_consumer_key and self.mpesa_consumer_secret)
        if not core:
            return False
        if self.mpesa_environment == self.MpesaEnvironment.PRODUCTION:
            return bool(self.mpesa_shortcode and self.mpesa_passkey)
        return True

    @property
    def is_sha_accredited(self) -> bool:
        """Check if the facility currently has active SHA accreditation."""
        if self.sha_accreditation_status != self.SHAAccreditationStatus.ACCREDITED:
            return False
        if self.sha_accreditation_expiry and self.sha_accreditation_expiry < date.today():
            return False
        return True

    @property
    def is_sha_contract_active(self) -> bool:
        """Check if the facility has an active SHA contract."""
        if not self.sha_contract_start:
            return False
        today = date.today()
        if self.sha_contract_start > today:
            return False
        if self.sha_contract_end and self.sha_contract_end < today:
            return False
        return True

    @property
    def sha_accreditation_days_remaining(self) -> int | None:
        """Days until SHA accreditation expires, or None if not accredited."""
        if not self.sha_accreditation_expiry:
            return None
        delta = (self.sha_accreditation_expiry - date.today()).days
        return max(delta, 0)

    @property
    def sha_contract_days_remaining(self) -> int | None:
        """Days until SHA contract expires, or None if no contract."""
        if not self.sha_contract_end:
            return None
        delta = (self.sha_contract_end - date.today()).days
        return max(delta, 0)

    def get_service_price(self, service_code: str) -> Decimal | None:
        """Get overridden price for a service, or None to use default."""
        price = self.fee_schedule_override.get(service_code)
        if price is not None:
            return Decimal(str(price))
        return None


# ---------------------------------------------------------------------------
# DHA HIE Consent & Preauth Models (User Journey Compliance)
# ---------------------------------------------------------------------------


class ConsentToken(FacilityScopedModel):
    """
    DHA visit consent token obtained via OTP or biometric verification.

    Required by the Kenya Digital Superhighway for SHIF (mandatory) and
    PHC (simplified) claim flows. Represents patient authorization for
    a clinical visit and subsequent billing.

    Lifecycle: PENDING → VALIDATED → EXPIRED/FAILED
    """

    class ConsentMethod(models.TextChoices):
        OTP = "OTP", "OTP (One-Time Password)"
        BIOMETRIC = "BIOMETRIC", "Biometric Verification"

    class ConsentStatus(models.TextChoices):
        PENDING = "PENDING", "Pending Verification"
        VALIDATED = "VALIDATED", "Validated"
        EXPIRED = "EXPIRED", "Expired"
        FAILED = "FAILED", "Failed"

    id = models.BigAutoField(primary_key=True)

    # Links
    patient = models.ForeignKey(
        "patients.Patient",
        on_delete=models.PROTECT,
        related_name="consent_tokens",
    )
    sha_member = models.ForeignKey(
        "billing.SHAMember",
        on_delete=models.PROTECT,
        related_name="consent_tokens",
    )
    encounter = models.ForeignKey(
        "encounters.Encounter",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="consent_tokens",
    )

    # Consent details
    consent_method = models.CharField(
        max_length=10,
        choices=ConsentMethod.choices,
        help_text="Method used for patient consent verification",
    )
    status = models.CharField(
        max_length=10,
        choices=ConsentStatus.choices,
        default=ConsentStatus.PENDING,
    )

    # OTP flow fields
    otp_reference = models.CharField(
        max_length=100,
        blank=True,
        help_text="Reference returned by DHA /send-web-otp endpoint",
    )
    identification_type = models.CharField(
        max_length=30,
        default="National ID",
        help_text="ID type used for OTP request",
    )
    identification_number = models.CharField(
        max_length=50,
        help_text="ID number used for OTP request",
    )

    # Token from DHA (returned after successful validation)
    consent_token = models.CharField(
        max_length=500,
        blank=True,
        help_text="Consent token returned by DHA after successful verification",
    )

    # Timestamps
    created_at = models.DateTimeField(auto_now_add=True)
    validated_at = models.DateTimeField(null=True, blank=True)
    expires_at = models.DateTimeField(
        null=True,
        blank=True,
        help_text="When this consent token expires",
    )

    # Audit
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="consent_tokens_created",
    )

    class Meta:
        verbose_name = "Consent Token"
        verbose_name_plural = "Consent Tokens"
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["patient", "status"]),
            models.Index(fields=["sha_member", "status"]),
            models.Index(fields=["status", "created_at"]),
        ]

    def __str__(self):
        return (
            f"Consent({self.get_consent_method_display()}) - "
            f"{self.patient} [{self.get_status_display()}]"
        )

    # ------------------------------------------------------------------
    # State transition methods
    # ------------------------------------------------------------------

    def mark_validated(self, token: str, expires_in_seconds: int = 3600) -> None:
        """Mark consent as validated with the token from DHA."""
        self.status = self.ConsentStatus.VALIDATED
        self.consent_token = token
        self.validated_at = timezone.now()
        self.expires_at = timezone.now() + timedelta(seconds=expires_in_seconds)
        self.save(update_fields=["status", "consent_token", "validated_at", "expires_at"])

    def mark_failed(self) -> None:
        """Mark consent verification as failed."""
        self.status = self.ConsentStatus.FAILED
        self.save(update_fields=["status"])

    def mark_expired(self) -> None:
        """Mark consent token as expired."""
        self.status = self.ConsentStatus.EXPIRED
        self.save(update_fields=["status"])

    # ------------------------------------------------------------------
    # Properties
    # ------------------------------------------------------------------

    @property
    def is_valid(self) -> bool:
        """Check if consent token is currently valid (validated and not expired)."""
        if self.status != self.ConsentStatus.VALIDATED:
            return False
        if self.expires_at and timezone.now() >= self.expires_at:
            return False
        return True


class PreauthRequest(FacilityScopedModel):
    """
    Pre-authorization request for SHA restricted services.

    Required by DHA for SHIF claims where the tariff has
    requires_preauthorization=True. Must be APPROVED before
    the claim can be submitted.

    Lifecycle: PENDING → APPROVED/DENIED → EXPIRED
    """

    class PreauthDecision(models.TextChoices):
        PENDING = "PENDING", "Pending Review"
        APPROVED = "APPROVED", "Approved"
        DENIED = "DENIED", "Denied"
        EXPIRED = "EXPIRED", "Expired"

    id = models.BigAutoField(primary_key=True)

    # Links
    claim = models.ForeignKey(
        "billing.SHAClaim",
        on_delete=models.CASCADE,
        related_name="preauth_requests",
    )
    patient = models.ForeignKey(
        "patients.Patient",
        on_delete=models.PROTECT,
        related_name="preauth_requests",
    )
    sha_member = models.ForeignKey(
        "billing.SHAMember",
        on_delete=models.PROTECT,
        related_name="preauth_requests",
    )
    consent_token = models.ForeignKey(
        "billing.ConsentToken",
        on_delete=models.PROTECT,
        related_name="preauth_requests",
        help_text="Valid consent token required for preauth submission",
    )

    # Request details
    preauth_reference = models.CharField(
        max_length=100,
        blank=True,
        help_text="Reference returned by DHA /v1/preauth/request",
    )
    procedure_code = models.CharField(
        max_length=20,
        help_text="SHA tariff code requiring pre-authorization",
    )
    diagnosis_codes = models.JSONField(
        default=list,
        help_text="List of ICD-10 diagnosis codes justifying the procedure",
    )
    estimated_cost = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        help_text="Estimated cost of the procedure (KES)",
    )
    scheduled_date = models.DateField(
        help_text="Planned date for the procedure",
    )
    clinical_notes = models.TextField(
        blank=True,
        help_text="Clinical justification for pre-authorization",
    )

    # Decision from DHA
    decision = models.CharField(
        max_length=10,
        choices=PreauthDecision.choices,
        default=PreauthDecision.PENDING,
    )
    approved_amount = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        null=True,
        blank=True,
        help_text="Amount approved by SHA (may differ from estimated)",
    )
    valid_until = models.DateField(
        null=True,
        blank=True,
        help_text="Date until which the pre-authorization is valid",
    )
    denial_reason = models.TextField(
        blank=True,
        help_text="Reason for denial (if denied)",
    )

    # Polling metadata
    poll_count = models.IntegerField(default=0)
    last_polled_at = models.DateTimeField(null=True, blank=True)

    # Timestamps
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    submitted_at = models.DateTimeField(null=True, blank=True)

    # Audit
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="preauth_requests_created",
    )

    class Meta:
        verbose_name = "Pre-authorization Request"
        verbose_name_plural = "Pre-authorization Requests"
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["claim", "decision"]),
            models.Index(fields=["decision", "created_at"]),
            models.Index(fields=["preauth_reference"]),
            models.Index(fields=["patient", "decision"]),
        ]

    def __str__(self):
        return f"Preauth({self.procedure_code}) - {self.patient} [{self.get_decision_display()}]"

    # ------------------------------------------------------------------
    # State transition methods
    # ------------------------------------------------------------------

    def update_from_poll(self, response_data: dict) -> None:
        """Update preauth status from DHA poll response."""
        decision = response_data.get("decision", "").upper()
        self.poll_count += 1
        self.last_polled_at = timezone.now()

        if decision == "APPROVED":
            self.decision = self.PreauthDecision.APPROVED
            self.approved_amount = Decimal(str(response_data.get("approved_amount", 0)))
            valid_until = response_data.get("valid_until")
            if valid_until:
                self.valid_until = date.fromisoformat(valid_until)
        elif decision == "DENIED":
            self.decision = self.PreauthDecision.DENIED
            self.denial_reason = response_data.get("message", "")

        self.save(
            update_fields=[
                "decision",
                "approved_amount",
                "valid_until",
                "denial_reason",
                "poll_count",
                "last_polled_at",
            ]
        )

    def mark_expired(self) -> None:
        """Mark preauth as expired."""
        self.decision = self.PreauthDecision.EXPIRED
        self.save(update_fields=["decision"])

    # ------------------------------------------------------------------
    # Properties
    # ------------------------------------------------------------------

    @property
    def is_valid(self) -> bool:
        """Check if preauth is approved and not expired."""
        if self.decision != self.PreauthDecision.APPROVED:
            return False
        if self.valid_until and date.today() > self.valid_until:
            return False
        return True


# ============================================================================
# DHA HIE Middleware (ILM) — Pre-visit registries cache
# ============================================================================


class PatientContact(FacilityScopedModel):
    """Cached next-of-kin / beneficiary contact entries from DHA HIE.

    Sourced from ``GET /api/v1/patients/contacts`` (consent) and
    ``POST /api/v1/patients/next-of-kin/contacts`` (eclaims). The DHA platform
    treats the contact list as the authoritative source for OTP delivery, so
    we cache the most recent payload per (patient, identifier) pair.
    """

    class ContactType(models.TextChoices):
        PRIMARY = "primary", "Primary"
        NEXT_OF_KIN = "next_of_kin", "Next of Kin"
        BENEFICIARY = "beneficiary", "Beneficiary"
        OTHER = "other", "Other"

    id = models.BigAutoField(primary_key=True)
    patient = models.ForeignKey(
        "patients.Patient", on_delete=models.CASCADE, related_name="dha_contacts"
    )
    sha_member = models.ForeignKey(
        SHAMember,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="dha_contacts",
    )
    contact_type = models.CharField(
        max_length=20, choices=ContactType.choices, default=ContactType.PRIMARY
    )
    full_name = models.CharField(max_length=255, blank=True)
    relationship = models.CharField(max_length=64, blank=True)
    phone = models.CharField(max_length=32, blank=True)
    email = models.EmailField(blank=True)
    identification_number = models.CharField(max_length=64, blank=True)
    identification_type = models.CharField(max_length=32, blank=True)
    is_otp_recipient = models.BooleanField(default=False)
    dha_contact_id = models.CharField(max_length=128, blank=True)
    raw_payload = models.JSONField(default=dict, blank=True)
    fetched_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "Patient Contact (DHA)"
        verbose_name_plural = "Patient Contacts (DHA)"
        ordering = ["-fetched_at"]
        indexes = [
            models.Index(fields=["patient", "contact_type"]),
            models.Index(fields=["dha_contact_id"]),
        ]

    def __str__(self) -> str:  # pragma: no cover - trivial
        return f"{self.full_name or self.phone or self.dha_contact_id} ({self.contact_type})"


class SHACoverageSnapshot(FacilityScopedModel):
    """Cached snapshot of a patient's DHA HIE eligibility/benefits/utilisation.

    One row is written per ``(patient, snapshot_type)`` per fetch. Older
    snapshots are kept (insert-only) for audit; queries should always read the
    latest by ``fetched_at``.
    """

    class SnapshotType(models.TextChoices):
        ELIGIBILITY = "eligibility", "Eligibility"
        BENEFITS = "benefits", "Benefits"
        SUB_BENEFITS = "sub_benefits", "Sub-benefits"
        BENEFITS_INTERVENTIONS = "benefits_interventions", "Benefit Interventions"
        UTILIZATION = "utilization", "Utilization"

    id = models.BigAutoField(primary_key=True)
    patient = models.ForeignKey(
        "patients.Patient",
        on_delete=models.CASCADE,
        related_name="dha_coverage_snapshots",
    )
    sha_member = models.ForeignKey(
        SHAMember,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="dha_coverage_snapshots",
    )
    snapshot_type = models.CharField(max_length=32, choices=SnapshotType.choices)
    is_eligible = models.BooleanField(default=False)
    member_cr_number = models.CharField(max_length=64, blank=True)
    sub_benefit_code = models.CharField(max_length=64, blank=True)
    intervention_code = models.CharField(max_length=64, blank=True)
    payload = models.JSONField(default=dict, blank=True)
    request_params = models.JSONField(default=dict, blank=True)
    correlation_id = models.CharField(max_length=64, blank=True)
    http_status = models.PositiveSmallIntegerField(null=True, blank=True)
    fetched_at = models.DateTimeField(auto_now_add=True)
    fetched_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="dha_coverage_snapshots",
    )

    class Meta:
        verbose_name = "SHA Coverage Snapshot"
        verbose_name_plural = "SHA Coverage Snapshots"
        ordering = ["-fetched_at"]
        indexes = [
            models.Index(fields=["patient", "snapshot_type", "-fetched_at"]),
            models.Index(fields=["snapshot_type", "-fetched_at"]),
        ]

    def __str__(self) -> str:  # pragma: no cover - trivial
        return f"{self.patient_id} {self.snapshot_type} @ {self.fetched_at:%Y-%m-%d %H:%M}"
