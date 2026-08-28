# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
# ruff: noqa: E402, F405
"""Inventory models counts etims for Vitora HMIS.

What this file is for:
- Implement models counts etims logic for the inventory domain.

How to use it:
- Import classes and functions from this module in Django app code and tests.

Supported inputs/args:
- Python imports and Django ORM/runtime inputs; no standalone CLI arguments.
"""

from datetime import datetime

from django.apps import apps
from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import models
from django.utils import timezone

from hmis.apps.core.mixins import FacilityScopedModel
from hmis.apps.core.models import TimeStampedModel

# ---------------------------------------------------------------------------
# Auto-number generators
# ---------------------------------------------------------------------------


def generate_stock_count_number():
    """Generate a unique Stock Count number: SC-YYYYMMDD-XXXX."""
    today = datetime.now().strftime("%Y%m%d")
    prefix = f"SC-{today}-"
    StockCount = apps.get_model("inventory", "StockCount")
    latest = (
        StockCount.objects.filter(count_number__startswith=prefix).order_by("-count_number").first()
    )
    sequence = int(latest.count_number.split("-")[-1]) + 1 if latest else 1
    return f"{prefix}{sequence:04d}"


# ---------------------------------------------------------------------------
# Stock Count
# ---------------------------------------------------------------------------


from hmis.apps.inventory.models_procurement import *  # noqa: F403
from hmis.apps.inventory.models_stock_flow import *  # noqa: F403


class StockCountType(models.TextChoices):
    FULL = "FULL", "Full Count"
    CYCLE = "CYCLE", "Cycle Count"
    SPOT = "SPOT", "Spot Check"


class StockCountStatus(models.TextChoices):
    DRAFT = "DRAFT", "Draft"
    IN_PROGRESS = "IN_PROGRESS", "In Progress"
    COMPLETED = "COMPLETED", "Completed"
    APPROVED = "APPROVED", "Approved"
    CANCELLED = "CANCELLED", "Cancelled"


class StockCount(FacilityScopedModel, TimeStampedModel):
    """
    Physical stock count / cycle count session.

    Workflow: DRAFT → IN_PROGRESS → COMPLETED → APPROVED
                ↘───────────↘──────────→ CANCELLED
    """

    count_number = models.CharField(
        max_length=30,
        unique=True,
        editable=False,
        default=generate_stock_count_number,
    )
    count_type = models.CharField(
        max_length=10,
        choices=StockCountType.choices,
        default=StockCountType.CYCLE,
    )
    store_location = models.ForeignKey(
        StoreLocation,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="stock_counts",
        help_text="Null = facility main store.",
    )
    status = models.CharField(
        max_length=15,
        choices=StockCountStatus.choices,
        default=StockCountStatus.DRAFT,
    )

    # Users
    started_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="stock_counts_started",
    )
    approved_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="stock_counts_approved",
    )

    # Dates
    started_at = models.DateTimeField(null=True, blank=True)
    completed_at = models.DateTimeField(null=True, blank=True)
    approved_at = models.DateTimeField(null=True, blank=True)

    notes = models.TextField(blank=True)

    class Meta:
        ordering = ["-created_at"]
        permissions = [
            ("approve_stock_count", "Can approve stock counts"),
        ]

    def __str__(self):
        return f"{self.count_number} ({self.get_count_type_display()})"

    # -- Computed properties --------------------------------------------------

    @property
    def total_items_counted(self):
        return self.items.exclude(counted_quantity__isnull=True).count()

    @property
    def total_discrepancies(self):
        """Count of items where counted_quantity != system_quantity."""
        counted = self.items.exclude(counted_quantity__isnull=True)
        return counted.exclude(counted_quantity=models.F("system_quantity")).count()

    # -- State-transition methods ---------------------------------------------

    def start(self):
        """DRAFT → IN_PROGRESS."""
        if self.status != StockCountStatus.DRAFT:
            raise ValidationError("Only DRAFT stock counts can be started.")
        if not self.items.exists():
            raise ValidationError("Cannot start a stock count with no items.")
        self.status = StockCountStatus.IN_PROGRESS
        self.started_at = timezone.now()
        self.save(update_fields=["status", "started_at", "updated_at"])

    def complete(self):
        """IN_PROGRESS → COMPLETED."""
        if self.status != StockCountStatus.IN_PROGRESS:
            raise ValidationError("Only IN_PROGRESS stock counts can be completed.")
        # All items must have been counted
        uncounted = self.items.filter(counted_quantity__isnull=True).count()
        if uncounted > 0:
            raise ValidationError(f"{uncounted} item(s) have not been counted yet.")
        self.status = StockCountStatus.COMPLETED
        self.completed_at = timezone.now()
        self.save(update_fields=["status", "completed_at", "updated_at"])

    def approve(self, user):
        """
        COMPLETED → APPROVED.

        Creates StockAdjustment(COUNT_CORRECTION) for each item with a variance.
        """
        if self.status != StockCountStatus.COMPLETED:
            raise ValidationError("Only COMPLETED stock counts can be approved.")

        StockAdjustment = apps.get_model("pharmacy", "StockAdjustment")

        for item in self.items.select_related("batch").exclude(
            counted_quantity=models.F("system_quantity")
        ):
            variance = item.counted_quantity - item.system_quantity
            StockAdjustment.objects.create(
                batch=item.batch,
                adjustment_type="COUNT_CORRECTION",
                quantity=variance,
                reason=(
                    f"Stock count {self.count_number}: "
                    f"system={item.system_quantity}, counted={item.counted_quantity}. "
                    f"{item.variance_reason}"
                ),
                reference_number=self.count_number,
                adjusted_by=user,
            )

        self.status = StockCountStatus.APPROVED
        self.approved_by = user
        self.approved_at = timezone.now()
        self.save(update_fields=["status", "approved_by", "approved_at", "updated_at"])

    def cancel(self):
        """Any non-terminal → CANCELLED."""
        terminal = {StockCountStatus.APPROVED, StockCountStatus.CANCELLED}
        if self.status in terminal:
            raise ValidationError("Cannot cancel an approved or already-cancelled count.")
        self.status = StockCountStatus.CANCELLED
        self.save(update_fields=["status", "updated_at"])

    def generate_items(self):
        """
        Auto-populate StockCountItems from current StockBatches.

        Only for DRAFT counts. Snapshots system_quantity from each batch.
        """
        if self.status != StockCountStatus.DRAFT:
            raise ValidationError("Items can only be generated for DRAFT counts.")

        StockBatch = apps.get_model("pharmacy", "StockBatch")

        # Get batches at the facility (optionally filtered by store)
        batches = StockBatch.objects.filter(
            facility=self.facility,
            status="AVAILABLE",
            quantity_available__gt=0,
        )

        created = 0
        for batch in batches.select_related("drug"):
            _, is_new = StockCountItem.objects.get_or_create(
                stock_count=self,
                batch=batch,
                defaults={
                    "drug": batch.drug,
                    "system_quantity": batch.quantity_available,
                },
            )
            if is_new:
                created += 1
        return created


# ---------------------------------------------------------------------------
# Stock Count Item
# ---------------------------------------------------------------------------


class StockCountItem(TimeStampedModel):
    """Individual line item in a stock count — one per batch."""

    stock_count = models.ForeignKey(
        StockCount,
        on_delete=models.CASCADE,
        related_name="items",
    )
    drug = models.ForeignKey(
        "pharmacy.Drug",
        on_delete=models.PROTECT,
        related_name="stock_count_items",
    )
    batch = models.ForeignKey(
        "pharmacy.StockBatch",
        on_delete=models.PROTECT,
        related_name="stock_count_items",
    )

    # Snapshot at count start
    system_quantity = models.PositiveIntegerField(
        help_text="System quantity at time of count generation.",
    )

    # Physical count result
    counted_quantity = models.PositiveIntegerField(
        null=True,
        blank=True,
        help_text="Actual physical count. Null until counted.",
    )
    variance_reason = models.TextField(
        blank=True,
        help_text="Required explanation when counted ≠ system.",
    )

    # Who counted
    counted_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="stock_items_counted",
    )
    counted_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["drug__generic_name"]
        constraints = [
            models.UniqueConstraint(
                fields=["stock_count", "batch"],
                name="unique_count_item_per_batch",
            ),
        ]

    def __str__(self):
        return f"{self.drug.generic_name} batch {self.batch.batch_number}"

    @property
    def variance(self):
        """Difference between counted and system quantity."""
        if self.counted_quantity is None:
            return None
        return self.counted_quantity - self.system_quantity

    @property
    def has_discrepancy(self):
        if self.counted_quantity is None:
            return False
        return self.counted_quantity != self.system_quantity


# ===========================================================================
# Phase 5: KRA eTIMS Integration
# ===========================================================================


class ETIMSEnvironment(models.TextChoices):
    SANDBOX = "SANDBOX", "Sandbox"
    PRODUCTION = "PRODUCTION", "Production"


class ETIMSReceiptType(models.TextChoices):
    """KRA receipt types per TIS specification §4.1."""

    NORMAL = "N", "Normal"
    COPY = "C", "Copy"
    TRAINING = "T", "Training"
    PROFORMA = "P", "Proforma"


class ETIMSTransactionType(models.TextChoices):
    """KRA transaction types per TIS specification §4.2."""

    SALE = "S", "Sale"
    CREDIT_NOTE = "NC", "Credit Note"


class ETIMSReceiptLabel(models.TextChoices):
    """Combined receipt type + transaction type labels per §4.3."""

    NS = "NS", "Normal Sale"
    NC = "NC", "Normal Credit Note"
    CS = "CS", "Copy Sale"
    CC = "CC", "Copy Credit Note"
    TS = "TS", "Training Sale"
    TC = "TC", "Training Credit Note"
    PS = "PS", "Proforma Sale"


class ETIMSInvoiceStatus(models.TextChoices):
    PENDING = "PENDING", "Pending"
    SUBMITTED = "SUBMITTED", "Submitted"
    CONFIRMED = "CONFIRMED", "Confirmed"
    FAILED = "FAILED", "Failed"
    CANCELLED = "CANCELLED", "Cancelled"


def _dash_separate(value: str, chunk_size: int = 4) -> str:
    """Separate a string by dash after every chunk_size characters (§6.23.6/7)."""
    if not value:
        return ""
    return "-".join(value[i : i + chunk_size] for i in range(0, len(value), chunk_size))


class ETIMSConfig(FacilityScopedModel, TimeStampedModel):
    """
    KRA eTIMS configuration per facility (singleton per facility).

    Stores KRA branch credentials and connection settings.
    The api_key is stored encrypted via the KMS provider.
    """

    bhf_id = models.CharField(
        max_length=3,
        help_text="Branch (BHF) ID assigned by KRA, e.g. '00'.",
    )
    dvc_srl_no = models.CharField(
        max_length=50,
        help_text="Device serial number from KRA.",
    )
    tin = models.CharField(
        max_length=15,
        help_text="Tax Identification Number (TIN).",
    )
    api_base_url = models.URLField(
        help_text="eTIMS API base URL (sandbox or production).",
    )
    api_key_encrypted = models.TextField(
        blank=True,
        help_text="Encrypted eTIMS communication key (set via property).",
    )
    is_active = models.BooleanField(default=False)
    last_sync_at = models.DateTimeField(null=True, blank=True)
    environment = models.CharField(
        max_length=12,
        choices=ETIMSEnvironment.choices,
        default=ETIMSEnvironment.SANDBOX,
    )

    # Receipt counters per type (§6.3 - uninterrupted ascending per receipt type)
    counter_ns = models.PositiveIntegerField(default=0, help_text="Next NS receipt counter.")
    counter_nc = models.PositiveIntegerField(default=0, help_text="Next NC receipt counter.")
    counter_cs = models.PositiveIntegerField(default=0, help_text="Next CS receipt counter.")
    counter_cc = models.PositiveIntegerField(default=0, help_text="Next CC receipt counter.")
    counter_ts = models.PositiveIntegerField(default=0, help_text="Next TS receipt counter.")
    counter_tc = models.PositiveIntegerField(default=0, help_text="Next TC receipt counter.")
    counter_ps = models.PositiveIntegerField(default=0, help_text="Next PS receipt counter.")

    class Meta:
        verbose_name = "eTIMS Configuration"
        verbose_name_plural = "eTIMS Configurations"
        ordering = ["-created_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["facility"],
                name="unique_etims_config_per_facility",
            ),
        ]
        permissions = [
            ("manage_etims", "Can manage eTIMS configuration"),
        ]

    def __str__(self):
        return f"eTIMS Config – TIN {self.tin} ({self.environment})"

    @property
    def api_key(self):
        """Decrypt and return the API key."""
        if not self.api_key_encrypted:
            return ""
        from hmis.apps.core.kms import get_kms_provider

        return get_kms_provider().decrypt_string(self.api_key_encrypted)

    @api_key.setter
    def api_key(self, value):
        """Encrypt and store the API key."""
        if not value:
            self.api_key_encrypted = ""
            return
        from hmis.apps.core.kms import get_kms_provider

        self.api_key_encrypted = get_kms_provider().encrypt_string(value)

    def get_next_receipt_number(self, receipt_label: str) -> int:
        """
        Atomically increment and return the next receipt number for a label.

        Per KRA TIS spec §6.3 — uninterrupted ascending per receipt type.
        Uses select_for_update to prevent race conditions.
        """
        counter_field = f"counter_{receipt_label.lower()}"
        if not hasattr(self, counter_field):
            raise ValueError(f"Invalid receipt label: {receipt_label}")
        # Refresh with lock
        locked = ETIMSConfig.objects.select_for_update().get(pk=self.pk)
        current = getattr(locked, counter_field)
        next_num = current + 1
        setattr(locked, counter_field, next_num)
        locked.save(update_fields=[counter_field, "updated_at"])
        # Update self
        setattr(self, counter_field, next_num)
        return next_num


class ETIMSInvoice(FacilityScopedModel, TimeStampedModel):
    """
    Tracks submission of a billing invoice to KRA eTIMS.

    Each billing Invoice that requires eTIMS reporting gets one ETIMSInvoice
    record that tracks its submission lifecycle:
    PENDING → SUBMITTED → CONFIRMED (or FAILED with retries).
    """

    invoice = models.ForeignKey(
        "billing.Invoice",
        on_delete=models.PROTECT,
        related_name="etims_submissions",
    )
    dispensing = models.ForeignKey(
        "pharmacy.Dispensing",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="etims_submissions",
        help_text="Optional: dispensing that triggered this submission.",
    )

    # Receipt classification (§4.1-4.3)
    receipt_type = models.CharField(
        max_length=2,
        choices=ETIMSReceiptType.choices,
        default=ETIMSReceiptType.NORMAL,
        help_text="KRA receipt type: N, C, T, P.",
    )
    transaction_type = models.CharField(
        max_length=2,
        choices=ETIMSTransactionType.choices,
        default=ETIMSTransactionType.SALE,
        help_text="KRA transaction type: S or NC.",
    )
    receipt_label = models.CharField(
        max_length=2,
        choices=ETIMSReceiptLabel.choices,
        default=ETIMSReceiptLabel.NS,
        help_text="Combined receipt label (NS, NC, CS, CC, TS, TC, PS).",
    )

    # Credit note reference (§6.16, §14)
    original_etims_invoice = models.ForeignKey(
        "self",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="credit_notes",
        help_text="Original invoice for credit notes (NC/CC).",
    )
    original_cu_invoice_number = models.CharField(
        max_length=100,
        blank=True,
        help_text="Original CU invoice number for credit note reference.",
    )

    # Buyer identification (§3d, §5.1.3)
    buyer_pin = models.CharField(
        max_length=15,
        blank=True,
        help_text="Buyer's KRA PIN (optional per §5.1.3).",
    )

    # Receipt counter per type (from config, stored for audit)
    receipt_type_counter = models.PositiveIntegerField(
        default=0,
        help_text="Sequential counter per receipt type (§6.3).",
    )

    etims_receipt_number = models.CharField(
        max_length=100,
        blank=True,
        help_text="Receipt number returned by KRA on confirmation.",
    )
    etims_internal_data = models.JSONField(
        default=dict,
        blank=True,
        help_text="Raw response data from KRA for audit trail.",
    )

    # SCU response fields (§5.3)
    scu_id = models.CharField(
        max_length=50,
        blank=True,
        help_text="SCU/CU ID from OSCU/VSCU response (§5.3.1).",
    )
    scu_datetime = models.DateTimeField(
        null=True,
        blank=True,
        help_text="Date/time stamped by OSCU/VSCU (§5.3.2).",
    )
    scu_receipt_counter = models.PositiveIntegerField(
        default=0,
        help_text="Receipt counter per type from SCU (§5.3.4).",
    )
    scu_total_counter = models.PositiveIntegerField(
        default=0,
        help_text="Total receipt counter from SCU (§5.3.5).",
    )
    scu_internal_data = models.CharField(
        max_length=200,
        blank=True,
        help_text="Internal data string from SCU (§5.3.6 / §6.23.6).",
    )
    scu_receipt_signature = models.CharField(
        max_length=200,
        blank=True,
        help_text="Digital receipt signature from SCU (§5.3.6 / §6.23.7).",
    )
    qr_code_data = models.TextField(
        blank=True,
        help_text="QR code string per §6.23.8: date#time#cu_number#cu_receipt_number#internal_data#signature.",
    )

    # EJ Data submission status (§5.5)
    ej_data_sent = models.BooleanField(
        default=False,
        help_text="Whether electronic journal data was sent for this receipt.",
    )

    status = models.CharField(
        max_length=12,
        choices=ETIMSInvoiceStatus.choices,
        default=ETIMSInvoiceStatus.PENDING,
    )
    submitted_at = models.DateTimeField(null=True, blank=True)
    confirmed_at = models.DateTimeField(null=True, blank=True)
    error_message = models.TextField(blank=True)
    retry_count = models.IntegerField(default=0)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"eTIMS {self.invoice.invoice_number} [{self.receipt_label}] – {self.get_status_display()}"

    @property
    def cu_invoice_number(self) -> str:
        """Format: {SCU_ID}/{receipt_number} per §6.23.4."""
        if self.scu_id and self.etims_receipt_number:
            return f"{self.scu_id}/{self.etims_receipt_number}"
        return ""

    @property
    def formatted_internal_data(self) -> str:
        """Internal data separated by dash after every 4th char (§6.23.6)."""
        return _dash_separate(self.scu_internal_data)

    @property
    def formatted_receipt_signature(self) -> str:
        """Receipt signature separated by dash after every 4th char (§6.23.7)."""
        return _dash_separate(self.scu_receipt_signature)

    def generate_qr_code_data(self) -> str:
        """Generate QR code string per §6.23.8."""
        if not self.scu_datetime or not self.scu_id:
            return ""
        date_str = self.scu_datetime.strftime("%d%m%Y")
        time_str = self.scu_datetime.strftime("%H%M%S")
        return (
            f"{date_str}#{time_str}#{self.scu_id}"
            f"#{self.etims_receipt_number}#{self.scu_internal_data}#{self.scu_receipt_signature}"
        )

    def mark_submitted(self, response_data=None):
        """PENDING → SUBMITTED."""
        self.status = ETIMSInvoiceStatus.SUBMITTED
        self.submitted_at = timezone.now()
        if response_data:
            self.etims_internal_data = response_data
        self.save(update_fields=["status", "submitted_at", "etims_internal_data", "updated_at"])

    def mark_confirmed(self, receipt_number, response_data=None, scu_data=None):
        """SUBMITTED → CONFIRMED with full SCU response data (§5.3)."""
        self.status = ETIMSInvoiceStatus.CONFIRMED
        self.confirmed_at = timezone.now()
        self.etims_receipt_number = receipt_number
        if response_data:
            self.etims_internal_data = response_data
        # Store SCU response fields
        if scu_data:
            self.scu_id = scu_data.get("scu_id", "")
            if scu_data.get("scu_datetime"):
                self.scu_datetime = scu_data["scu_datetime"]
            self.scu_receipt_counter = scu_data.get("receipt_type_counter", 0)
            self.scu_total_counter = scu_data.get("total_counter", 0)
            self.scu_internal_data = scu_data.get("internal_data", "")
            self.scu_receipt_signature = scu_data.get("receipt_signature", "")
        # Generate QR code
        self.qr_code_data = self.generate_qr_code_data()
        self.save(
            update_fields=[
                "status",
                "confirmed_at",
                "etims_receipt_number",
                "etims_internal_data",
                "scu_id",
                "scu_datetime",
                "scu_receipt_counter",
                "scu_total_counter",
                "scu_internal_data",
                "scu_receipt_signature",
                "qr_code_data",
                "updated_at",
            ]
        )

    def mark_failed(self, error_message):
        """Mark as FAILED with error details."""
        self.status = ETIMSInvoiceStatus.FAILED
        self.error_message = error_message
        self.retry_count += 1
        self.save(update_fields=["status", "error_message", "retry_count", "updated_at"])

    def mark_cancelled(self):
        """Mark as CANCELLED (manual user action)."""
        self.status = ETIMSInvoiceStatus.CANCELLED
        self.save(update_fields=["status", "updated_at"])


class ETIMSItem(TimeStampedModel):
    """Individual line item in an eTIMS invoice submission."""

    etims_invoice = models.ForeignKey(
        ETIMSInvoice,
        on_delete=models.CASCADE,
        related_name="items",
    )
    item_code = models.CharField(
        max_length=50,
        help_text="HS code or KRA item classification code.",
    )
    item_name = models.CharField(max_length=255)
    quantity = models.DecimalField(max_digits=10, decimal_places=2)
    unit_price = models.DecimalField(max_digits=12, decimal_places=2)
    tax_amount = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    total = models.DecimalField(max_digits=12, decimal_places=2)

    class Meta:
        ordering = ["id"]

    def __str__(self):
        return f"{self.item_name} x{self.quantity}"


class ETIMSDailyReportType(models.TextChoices):
    """KRA daily report types (§6.5, §15, §16)."""

    X_REPORT = "X", "X Daily Report (interim)"
    Z_REPORT = "Z", "Z Daily Report (end of day)"


class ETIMSDailyReport(FacilityScopedModel, TimeStampedModel):
    """
    X and Z daily reports per KRA TIS specification (§6.5, §15-16).

    Z report = end-of-day summary (00:00:00 to 23:59:59).
    X report = summary since last Z report to present.
    """

    report_type = models.CharField(
        max_length=1,
        choices=ETIMSDailyReportType.choices,
    )
    report_date = models.DateField(help_text="Date the report covers.")
    report_number = models.PositiveIntegerField(help_text="Sequential Z/X report number.")

    # Sales summary (§15.1.5 / §16.1.5)
    total_ns_amount = models.DecimalField(
        max_digits=14,
        decimal_places=2,
        default=0,
        help_text="Total sales amount for all NS receipts, including tax.",
    )
    total_ns_count = models.PositiveIntegerField(default=0, help_text="Number of NS receipts.")

    # Credit notes (§15.1.8-9 / §16.1.8-9)
    total_nc_amount = models.DecimalField(
        max_digits=14,
        decimal_places=2,
        default=0,
        help_text="Total credit note amount for all NC receipts (negative).",
    )
    total_nc_count = models.PositiveIntegerField(default=0, help_text="Number of NC receipts.")

    # Tax breakdown per rate (§15.1.10-11 / §16.1.10-11) — 5 tax slots A-E
    taxable_amount_a = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    tax_amount_a = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    taxable_amount_b = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    tax_amount_b = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    taxable_amount_c = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    tax_amount_c = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    taxable_amount_d = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    tax_amount_d = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    taxable_amount_e = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    tax_amount_e = models.DecimalField(max_digits=14, decimal_places=2, default=0)

    # Other counts (§15.1.12-20)
    opening_deposit = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    total_items_sold = models.PositiveIntegerField(default=0)
    total_cs_cc_count = models.PositiveIntegerField(default=0, help_text="Copy receipts count.")
    total_cs_cc_amount = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    total_ts_tc_count = models.PositiveIntegerField(default=0, help_text="Training receipts count.")
    total_ts_tc_amount = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    total_ps_count = models.PositiveIntegerField(default=0, help_text="Proforma receipts count.")
    total_ps_amount = models.DecimalField(max_digits=14, decimal_places=2, default=0)

    # Payment breakdown (§15.1.17)
    payment_cash = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    payment_mpesa = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    payment_insurance = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    payment_other = models.DecimalField(max_digits=14, decimal_places=2, default=0)

    # Discounts (§15.1.18)
    total_discounts = models.DecimalField(max_digits=14, decimal_places=2, default=0)

    # Incomplete sales (§15.1.20)
    incomplete_sales_count = models.PositiveIntegerField(default=0)

    generated_at = models.DateTimeField(auto_now_add=True)
    generated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
    )

    class Meta:
        ordering = ["-report_date", "-report_number"]
        constraints = [
            models.UniqueConstraint(
                fields=["facility", "report_type", "report_date", "report_number"],
                name="unique_etims_daily_report",
            ),
        ]

    def __str__(self):
        return f"{self.get_report_type_display()} #{self.report_number} – {self.report_date}"


# ===========================================================================
# Phase 6: Predictive Analytics / Demand Forecasting
# ===========================================================================
