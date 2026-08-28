# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""Billing models supplier for Vitora HMIS.

What this file is for:
- Implement models supplier logic for the billing domain.

How to use it:
- Import classes and functions from this module in Django app code and tests.

Supported inputs/args:
- Python imports and Django ORM/runtime inputs; no standalone CLI arguments.
"""

from datetime import date, timedelta
from decimal import Decimal

from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import models
from django.utils import timezone

from hmis.apps.core.mixins import FacilityScopedModel


def generate_bill_number():
    """Generate a unique Supplier Bill number: BILL-YYYYMMDD-XXXX."""
    from django.apps import apps as django_apps

    today = date.today().strftime("%Y%m%d")
    prefix = f"BILL-{today}-"
    SupplierBillModel = django_apps.get_model("billing", "SupplierBill")
    latest = (
        SupplierBillModel.objects.filter(bill_number__startswith=prefix)
        .order_by("-bill_number")
        .first()
    )
    sequence = int(latest.bill_number.split("-")[-1]) + 1 if latest else 1
    return f"{prefix}{sequence:04d}"


def generate_supplier_payment_reference():
    """Generate a unique supplier payment reference: SPAY-YYYYMMDD-XXXX."""
    from django.apps import apps as django_apps

    today = date.today().strftime("%Y%m%d")
    prefix = f"SPAY-{today}-"
    SupplierPaymentModel = django_apps.get_model("billing", "SupplierPayment")
    latest = (
        SupplierPaymentModel.objects.filter(payment_reference__startswith=prefix)
        .order_by("-payment_reference")
        .first()
    )
    sequence = int(latest.payment_reference.split("-")[-1]) + 1 if latest else 1
    return f"{prefix}{sequence:04d}"


class SupplierBillStatus(models.TextChoices):
    DRAFT = "draft", "Draft"
    RECEIVED = "received", "Received"
    APPROVED = "approved", "Approved"
    PARTIALLY_PAID = "partially_paid", "Partially Paid"
    PAID = "paid", "Paid"
    DISPUTED = "disputed", "Disputed"
    CANCELLED = "cancelled", "Cancelled"


class SupplierBill(FacilityScopedModel):
    """
    Accounts-payable bill from a supplier, linked to a GRN.

    Facility-scoped: each facility manages its own payables.
    Supports 3-way matching: PO amount vs GRN amount vs supplier invoice amount.
    """

    id = models.BigAutoField(primary_key=True)

    # Identification
    bill_number = models.CharField(
        max_length=30,
        unique=True,
        editable=False,
        default=generate_bill_number,
    )
    supplier_invoice_number = models.CharField(
        max_length=100,
        blank=True,
        help_text="Invoice number from the supplier's document.",
    )

    # Linkage to procurement
    supplier = models.ForeignKey(
        "inventory.Supplier",
        on_delete=models.PROTECT,
        related_name="bills",
    )
    grn = models.ForeignKey(
        "inventory.GoodsReceiptNote",
        on_delete=models.PROTECT,
        related_name="bills",
        null=True,
        blank=True,
        help_text="GRN that triggered this bill.",
    )
    purchase_order = models.ForeignKey(
        "inventory.PurchaseOrder",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="bills",
        help_text="Linked PO for 3-way matching.",
    )

    # Financial
    amount_invoiced = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        help_text="Total amount on the supplier's invoice.",
    )
    tax_amount = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        default=Decimal("0.00"),
        help_text="VAT or other tax on the bill.",
    )
    amount_paid = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        default=Decimal("0.00"),
        help_text="Total payments made against this bill.",
    )

    # Status
    status = models.CharField(
        max_length=20,
        choices=SupplierBillStatus.choices,
        default=SupplierBillStatus.DRAFT,
    )

    # Dates
    bill_date = models.DateField(
        default=date.today,
        help_text="Date on the supplier's invoice.",
    )
    due_date = models.DateField(
        null=True,
        blank=True,
        help_text="Payment due date (derived from supplier payment terms).",
    )
    received_date = models.DateField(
        null=True,
        blank=True,
        help_text="Date the bill document was received by finance.",
    )

    # 3-way matching
    po_amount = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        null=True,
        blank=True,
        help_text="Total from PO (auto-populated for matching).",
    )
    grn_amount = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        null=True,
        blank=True,
        help_text="Total from GRN (auto-populated for matching).",
    )
    is_matched = models.BooleanField(
        default=False,
        help_text="True when PO, GRN, and invoice amounts align within tolerance.",
    )
    match_variance = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        null=True,
        blank=True,
        help_text="Max absolute variance between the three amounts.",
    )
    match_notes = models.TextField(
        blank=True,
        help_text="Notes from the matching review.",
    )

    # Approval
    approved_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="bills_approved",
    )
    approved_at = models.DateTimeField(null=True, blank=True)

    # Audit
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="bills_created",
    )
    notes = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-bill_date", "-created_at"]
        verbose_name = "Supplier Bill"
        verbose_name_plural = "Supplier Bills"
        indexes = [
            models.Index(fields=["status"]),
            models.Index(fields=["due_date"]),
            models.Index(fields=["supplier"]),
        ]
        permissions = [
            ("approve_supplierbill", "Can approve supplier bills for payment"),
        ]

    def __str__(self):
        return f"{self.bill_number} ({self.supplier.name})"

    # -- Computed properties --------------------------------------------------

    @property
    def total_amount(self) -> Decimal:
        """Amount invoiced plus tax."""
        return self.amount_invoiced + self.tax_amount

    @property
    def balance(self) -> Decimal:
        """Outstanding balance."""
        return self.total_amount - self.amount_paid

    @property
    def is_overdue(self) -> bool:
        """True if unpaid and past due date."""
        if self.status in (SupplierBillStatus.PAID, SupplierBillStatus.CANCELLED):
            return False
        return self.due_date is not None and self.due_date < date.today()

    @property
    def days_overdue(self) -> int:
        """Number of days past due. 0 if not overdue."""
        if not self.is_overdue or self.due_date is None:
            return 0
        return (date.today() - self.due_date).days

    @property
    def aging_bucket(self) -> str:
        """Aging classification: current, 1-30, 31-60, 61-90, 90+."""
        days = self.days_overdue
        if days == 0:
            return "current"
        elif days <= 30:
            return "1-30"
        elif days <= 60:
            return "31-60"
        elif days <= 90:
            return "61-90"
        else:
            return "90+"

    # -- 3-way matching -------------------------------------------------------

    def perform_three_way_match(self, tolerance: Decimal = Decimal("0.01")) -> bool:
        """
        Compare PO amount, GRN amount, and supplier invoice amount.

        Populates po_amount, grn_amount, match_variance, is_matched.
        Returns True if all three amounts are within tolerance.
        """
        amounts = []

        # PO total
        if self.purchase_order:
            self.po_amount = Decimal(str(self.purchase_order.total_amount))
            amounts.append(self.po_amount)

        # GRN total
        if self.grn:
            self.grn_amount = Decimal(str(self.grn.total_amount))
            amounts.append(self.grn_amount)

        # Supplier invoice amount (always present)
        amounts.append(self.amount_invoiced)

        if len(amounts) < 2:
            # Can't match with less than 2 amounts
            self.is_matched = False
            self.match_variance = None
            self.save(
                update_fields=[
                    "po_amount",
                    "grn_amount",
                    "is_matched",
                    "match_variance",
                    "updated_at",
                ]
            )
            return False

        max_amt = max(amounts)
        min_amt = min(amounts)
        self.match_variance = max_amt - min_amt
        self.is_matched = self.match_variance <= tolerance

        self.save(
            update_fields=[
                "po_amount",
                "grn_amount",
                "is_matched",
                "match_variance",
                "updated_at",
            ]
        )
        return self.is_matched

    # -- State-transition methods ---------------------------------------------

    def receive(self):
        """DRAFT → RECEIVED. Bill document received by finance."""
        if self.status != SupplierBillStatus.DRAFT:
            raise ValidationError("Only DRAFT bills can be marked as received.")
        self.status = SupplierBillStatus.RECEIVED
        self.received_date = date.today()
        self.save(update_fields=["status", "received_date", "updated_at"])

    def approve(self, user):
        """RECEIVED → APPROVED. Finance approves the bill for payment."""
        if self.status != SupplierBillStatus.RECEIVED:
            raise ValidationError("Only RECEIVED bills can be approved.")
        self.status = SupplierBillStatus.APPROVED
        self.approved_by = user
        self.approved_at = timezone.now()
        self.save(update_fields=["status", "approved_by", "approved_at", "updated_at"])

    def dispute(self, notes=""):
        """RECEIVED or APPROVED → DISPUTED."""
        if self.status not in (SupplierBillStatus.RECEIVED, SupplierBillStatus.APPROVED):
            raise ValidationError("Only RECEIVED or APPROVED bills can be disputed.")
        self.status = SupplierBillStatus.DISPUTED
        if notes:
            self.match_notes = notes
        self.save(update_fields=["status", "match_notes", "updated_at"])

    def cancel(self):
        """Any non-terminal status → CANCELLED."""
        terminal = {SupplierBillStatus.PAID, SupplierBillStatus.CANCELLED}
        if self.status in terminal:
            raise ValidationError("Cannot cancel a paid or already-cancelled bill.")
        self.status = SupplierBillStatus.CANCELLED
        self.save(update_fields=["status", "updated_at"])

    def record_payment(self, amount: Decimal):
        """Update amount_paid and status after a SupplierPayment is recorded."""
        self.amount_paid = self.amount_paid + amount
        if self.amount_paid >= self.total_amount:
            self.status = SupplierBillStatus.PAID
        else:
            self.status = SupplierBillStatus.PARTIALLY_PAID
        self.save(update_fields=["amount_paid", "status", "updated_at"])

    def compute_due_date(self):
        """Derive due_date from supplier payment_terms if parseable."""
        if self.due_date:
            return  # Already set manually
        terms = (self.supplier.payment_terms or "").strip().lower()
        # Parse "net 30", "net 60", etc.
        if terms.startswith("net"):
            try:
                days = int(terms.replace("net", "").strip())
                base = self.bill_date or date.today()
                self.due_date = base + timedelta(days=days)
                self.save(update_fields=["due_date", "updated_at"])
            except (ValueError, TypeError):
                pass


class SupplierBillItem(models.Model):
    """Line item on a supplier bill (mirrors GRN items for audit trail)."""

    id = models.BigAutoField(primary_key=True)
    bill = models.ForeignKey(
        SupplierBill,
        on_delete=models.CASCADE,
        related_name="items",
    )
    description = models.CharField(max_length=255)
    quantity = models.DecimalField(max_digits=10, decimal_places=2)
    unit_cost = models.DecimalField(max_digits=10, decimal_places=2)
    grn_item = models.ForeignKey(
        "inventory.GRNItem",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="bill_items",
        help_text="Linked GRN item for traceability.",
    )

    class Meta:
        ordering = ["id"]
        verbose_name = "Supplier Bill Item"
        verbose_name_plural = "Supplier Bill Items"

    def __str__(self):
        return f"{self.description} x{self.quantity}"

    @property
    def line_total(self) -> Decimal:
        return self.quantity * self.unit_cost


class SupplierPayment(FacilityScopedModel):
    """
    Payment made to a supplier against a bill.

    Supports partial payments. Payment methods mirror patient Payment.Method.
    """

    class Method(models.TextChoices):
        CASH = "cash", "Cash"
        MPESA = "mpesa", "M-Pesa"
        CARD = "card", "Card"
        BANK_TRANSFER = "bank_transfer", "Bank Transfer"
        CHEQUE = "cheque", "Cheque"

    class Status(models.TextChoices):
        PENDING = "pending", "Pending"
        COMPLETED = "completed", "Completed"
        FAILED = "failed", "Failed"
        REVERSED = "reversed", "Reversed"

    id = models.BigAutoField(primary_key=True)

    # Identification
    payment_reference = models.CharField(
        max_length=30,
        unique=True,
        editable=False,
        default=generate_supplier_payment_reference,
    )

    # Linkage
    bill = models.ForeignKey(
        SupplierBill,
        on_delete=models.PROTECT,
        related_name="payments",
    )
    supplier = models.ForeignKey(
        "inventory.Supplier",
        on_delete=models.PROTECT,
        related_name="payments_received",
    )

    # Payment details
    method = models.CharField(max_length=20, choices=Method.choices)
    amount = models.DecimalField(max_digits=12, decimal_places=2)
    currency = models.CharField(max_length=3, default="KES")
    status = models.CharField(
        max_length=20,
        choices=Status.choices,
        default=Status.PENDING,
    )

    # Method-specific references
    transaction_reference = models.CharField(
        max_length=100,
        blank=True,
        help_text="Bank ref, M-Pesa receipt, cheque number, etc.",
    )
    payment_details = models.JSONField(
        default=dict,
        blank=True,
        help_text="Extra details: bank name, cheque date, etc.",
    )

    # Dates
    payment_date = models.DateField(default=date.today)
    processed_at = models.DateTimeField(null=True, blank=True)

    # Notes
    notes = models.TextField(blank=True)
    failure_reason = models.TextField(blank=True)

    # Audit
    paid_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="supplier_payments_made",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-payment_date", "-created_at"]
        verbose_name = "Supplier Payment"
        verbose_name_plural = "Supplier Payments"
        indexes = [
            models.Index(fields=["status"]),
            models.Index(fields=["payment_date"]),
            models.Index(fields=["bill"]),
        ]

    def __str__(self):
        return f"{self.payment_reference} ({self.amount} {self.currency})"

    def process(self):
        """Mark payment as completed and update the bill balance."""
        if self.status != self.Status.PENDING:
            raise ValidationError("Only PENDING payments can be processed.")
        self.status = self.Status.COMPLETED
        self.processed_at = timezone.now()
        self.save(update_fields=["status", "processed_at", "updated_at"])
        # Update bill
        self.bill.record_payment(self.amount)

    def reverse(self, reason=""):
        """Reverse a completed payment."""
        if self.status != self.Status.COMPLETED:
            raise ValidationError("Only COMPLETED payments can be reversed.")
        self.status = self.Status.REVERSED
        self.failure_reason = reason
        self.save(update_fields=["status", "failure_reason", "updated_at"])
        # Deduct from bill
        self.bill.amount_paid = self.bill.amount_paid - self.amount
        if self.bill.amount_paid <= Decimal("0.00"):
            self.bill.amount_paid = Decimal("0.00")
            self.bill.status = SupplierBillStatus.APPROVED
        else:
            self.bill.status = SupplierBillStatus.PARTIALLY_PAID
        self.bill.save(update_fields=["amount_paid", "status", "updated_at"])
