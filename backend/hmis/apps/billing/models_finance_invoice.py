# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""
What this file is for: invoice, invoice item, and invoice payer billing models.
How to use: imported by `hmis.apps.billing.models_finance` for model registration and compatibility.
Supported inputs/args: Django model fields/methods for invoice lifecycle and line-item billing.
"""

import uuid
from datetime import date, timedelta
from decimal import Decimal

from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import models
from django.utils import timezone

from hmis.apps.core.mixins import FacilityScopedModel


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

    class PayerType(models.TextChoices):
        CASH = "cash", "Cash / Self-Pay"
        SHA = "sha", "SHA (Social Health Authority)"
        PRIVATE_INSURANCE = "private_insurance", "Private Insurance"
        CORPORATE = "corporate", "Corporate Account"
        MIXED = "mixed", "Mixed / Split Responsibility"

    # Default proforma validity in days
    DEFAULT_PROFORMA_VALIDITY_DAYS = 30

    id = models.BigAutoField(primary_key=True)
    public_id = models.UUIDField(
        default=uuid.uuid4,
        unique=True,
        db_index=True,
        editable=False,
        help_text="Stable public UUID for external APIs and links.",
    )

    # Invoice identification
    invoice_number = models.CharField(max_length=50, editable=False)

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
    payer_type = models.CharField(max_length=24, choices=PayerType.choices, default=PayerType.CASH)

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
        constraints = [
            models.UniqueConstraint(
                fields=["facility", "invoice_number"],
                name="unique_invoice_number_per_facility",
            ),
        ]

    def __str__(self):
        return f"{self.invoice_number} - {self.patient}"

    def save(self, *args, **kwargs):
        """Override save to generate invoice number, set defaults, and validate."""
        if not self.invoice_number:
            self.invoice_number = self.generate_invoice_number()

        if (
            self.encounter_id
            and self.invoice_date
            and self.due_date
            and self.due_date < self.invoice_date
        ):
            encounter_date = getattr(self.encounter, "encounter_date", None)
            if encounter_date and encounter_date <= self.due_date:
                self.invoice_date = encounter_date
            else:
                self.invoice_date = self.due_date

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

        # Get the last invoice number for today with this prefix within the same facility
        last_invoice = (
            Invoice.objects.filter(
                invoice_number__startswith=prefix,
                facility=self.facility,
            )
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
            payer_type=self.payer_type,
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
                inpatient_consumable_usage=item.inpatient_consumable_usage,
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
            payer_type=self.payer_type,
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
                inpatient_consumable_usage=item.inpatient_consumable_usage,
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
    inpatient_consumable_usage = models.ForeignKey(
        "inpatient.InpatientConsumableUsage",
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
    is_preview_materialized = models.BooleanField(
        default=False,
        help_text="True when this line is auto-materialized from DHA preview data",
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


class InvoicePayer(models.Model):
    """Tracks each payer's allocation on an invoice (multi-payer split).

    Replaces the flat insurance_provider / insurance_amount fields on Invoice
    with a structured M:1 relationship.  Each row represents one payer
    (cash, SHA, private insurance, corporate) and its share of the invoice.
    """

    class PayerType(models.TextChoices):
        CASH = "cash", "Cash / Self-Pay"
        SHA = "sha", "SHA (Social Health Authority)"
        PRIVATE_INSURANCE = "private_insurance", "Private Insurance"
        CORPORATE = "corporate", "Corporate Account"

    class Status(models.TextChoices):
        PENDING = "pending", "Pending"
        CLAIMED = "claimed", "Claimed"
        APPROVED = "approved", "Approved"
        PAID = "paid", "Paid"
        REJECTED = "rejected", "Rejected"
        WRITTEN_OFF = "written_off", "Written Off"

    invoice = models.ForeignKey(
        Invoice,
        on_delete=models.CASCADE,
        related_name="payers",
    )
    payer_type = models.CharField(
        max_length=20,
        choices=PayerType.choices,
        default=PayerType.CASH,
    )
    # Private insurance link (nullable — only for PRIVATE_INSURANCE payer type)
    patient_insurance = models.ForeignKey(
        "insurance.PatientInsurance",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="invoice_payers",
    )
    insurance_claim = models.ForeignKey(
        "insurance.InsuranceClaim",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="invoice_payers",
    )
    sha_claim = models.ForeignKey(
        "billing.SHAClaim",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="invoice_payers",
    )

    # Denormalized for display (avoids joins on list views)
    provider_name = models.CharField(max_length=200, blank=True)
    member_number = models.CharField(max_length=100, blank=True)

    # Allocation
    priority = models.PositiveSmallIntegerField(
        default=1,
        help_text="Payer order: 1 = primary, 2 = secondary, etc.",
    )
    allocation_percent = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        default=Decimal("0.00"),
        help_text="Percentage of invoice total allocated to this payer (0-100).",
    )
    allocated_amount = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        default=Decimal("0.00"),
        help_text="Absolute amount allocated to this payer.",
    )
    approved_amount = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        default=Decimal("0.00"),
    )
    paid_amount = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        default=Decimal("0.00"),
    )

    status = models.CharField(
        max_length=20,
        choices=Status.choices,
        default=Status.PENDING,
    )
    notes = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["priority"]
        indexes = [
            models.Index(fields=["invoice", "payer_type"]),
        ]

    def __str__(self):
        return f"{self.get_payer_type_display()} — {self.provider_name or 'Self'} ({self.invoice})"

    def clean(self):
        if self.allocation_percent < 0 or self.allocation_percent > 100:
            raise ValidationError({"allocation_percent": "Must be between 0 and 100."})

    @property
    def balance(self) -> Decimal:
        """Amount still outstanding for this payer."""
        return self.allocated_amount - self.paid_amount
