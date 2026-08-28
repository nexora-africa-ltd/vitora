# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""Billing models finance payments for Vitora HMIS.

What this file is for:
- Implement models finance payments logic for the billing domain.

How to use it:
- Import classes and functions from this module in Django app code and tests.

Supported inputs/args:
- Python imports and Django ORM/runtime inputs; no standalone CLI arguments.
"""

from datetime import date
from decimal import Decimal

from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import models
from django.utils import timezone

from hmis.apps.billing.models_finance_invoice import Invoice
from hmis.apps.core.mixins import FacilityScopedModel


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
        # Skip validation during sync materialization — cloud already validated
        if not getattr(self, "_from_sync_materializer", False):
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

        # Allow only explicit interim-copay payments on proforma invoices.
        if self.invoice and self.invoice.status == Invoice.Status.PROFORMA:
            details = self.payment_details or {}
            is_interim_copay = bool(details.get("interim_copay"))
            if not is_interim_copay:
                raise ValidationError(
                    "Cannot create payment for proforma invoice unless payment_details.interim_copay=true."
                )

        # Check invoice balance
        if (
            self.invoice
            and self.amount
            and self.amount > self.invoice.balance_due
            and not (
                self.invoice.status == Invoice.Status.PROFORMA
                and bool((self.payment_details or {}).get("interim_copay"))
            )
        ):
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

        # Interim copay payments against proforma invoices are held as deposits and
        # reconciled to finalized invoices later.
        details = self.payment_details or {}
        if self.invoice.status == Invoice.Status.PROFORMA and bool(details.get("interim_copay")):
            return

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
        constraints = [
            models.UniqueConstraint(
                fields=["facility", "code"],
                name="unique_payment_point_code_per_facility",
            ),
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
