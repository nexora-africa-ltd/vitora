# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
# ruff: noqa: SIM103
"""Billing models sha config for Vitora HMIS.

What this file is for:
- Implement models sha config logic for the billing domain.

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

from hmis.apps.billing.models_finance import Invoice, InvoiceItem
from hmis.apps.billing.models_sha_registry import SHAMember
from hmis.apps.core.mixins import FacilityScopedModel


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
                # Keep canonical coverage end-date in sync with the latest
                # eligibility response so claim validation does not rely on
                # stale locally-registered coverage dates.
                member.coverage_end_date = self.eligible_until
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
    hide_capitation_interventions = models.BooleanField(
        default=False,
        help_text=(
            "When enabled, intervention lookups for this facility hide CAPITATION "
            "codes unless explicitly requested via payment_mechanism."
        ),
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
    # Transaction Status API credentials (independent from STK Push credentials).
    mpesa_initiator_name = models.CharField(max_length=100, blank=True, default="")
    mpesa_security_credential_encrypted = models.TextField(blank=True, default="")

    # SHA/DHA ILM API Credentials (per-facility multi-tenant support)
    # ------------------------------------------------------------------

    class SHAEnvironment(models.TextChoices):
        SANDBOX = "sandbox", "Sandbox (UAT)"
        PRODUCTION = "production", "Production"

    sha_consumer_key_encrypted = models.TextField(
        blank=True,
        default="",
        help_text="DHA ILM API consumer key (KMS-encrypted).",
    )
    sha_client_id_encrypted = models.TextField(
        blank=True,
        default="",
        help_text="DHA ILM OAuth client ID (KMS-encrypted).",
    )
    sha_client_secret_encrypted = models.TextField(
        blank=True,
        default="",
        help_text="DHA ILM OAuth client secret (KMS-encrypted).",
    )
    sha_username_encrypted = models.TextField(
        blank=True,
        default="",
        help_text="DHA ILM Basic Auth username (KMS-encrypted).",
    )
    sha_password_encrypted = models.TextField(
        blank=True,
        default="",
        help_text="DHA ILM Basic Auth password (KMS-encrypted).",
    )
    sha_encrypted_pin = models.TextField(
        blank=True,
        default="",
        help_text="Pre-encrypted DHA PIN (stored as-is, already encrypted by DHA).",
    )
    sha_agent_code = models.CharField(
        max_length=50,
        blank=True,
        default="",
        help_text="DHA agent identifier (e.g., DHABP05113).",
    )
    sha_facility_fr_code = models.CharField(
        max_length=50,
        blank=True,
        default="",
        help_text="Facility Registry code for DHA/ILM API calls.",
    )
    sha_api_environment = models.CharField(
        max_length=20,
        choices=SHAEnvironment.choices,
        default=SHAEnvironment.SANDBOX,
        help_text="DHA ILM API environment (sandbox or production).",
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
    @property
    def mpesa_security_credential(self) -> str:
        """Daraja Transaction Status API credential, encrypted per facility."""
        from hmis.apps.core.kms import get_kms_provider

        if not self.mpesa_security_credential_encrypted:
            return ""
        return get_kms_provider().decrypt_string(self.mpesa_security_credential_encrypted)

    @mpesa_security_credential.setter
    def mpesa_security_credential(self, value: str) -> None:
        from hmis.apps.core.kms import get_kms_provider

        self.mpesa_security_credential_encrypted = (
            get_kms_provider().encrypt_string(value) if value else ""
        )

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

    # ------------------------------------------------------------------
    # KMS-encrypted SHA/DHA ILM credential properties
    # ------------------------------------------------------------------

    @property
    def sha_consumer_key(self) -> str:
        if not self.sha_consumer_key_encrypted:
            return ""
        from hmis.apps.core.kms import get_kms_provider

        return get_kms_provider().decrypt_string(self.sha_consumer_key_encrypted)

    @sha_consumer_key.setter
    def sha_consumer_key(self, value: str) -> None:
        if not value:
            self.sha_consumer_key_encrypted = ""
            return
        from hmis.apps.core.kms import get_kms_provider

        self.sha_consumer_key_encrypted = get_kms_provider().encrypt_string(value)

    @property
    def sha_client_id(self) -> str:
        if not self.sha_client_id_encrypted:
            return ""
        from hmis.apps.core.kms import get_kms_provider

        return get_kms_provider().decrypt_string(self.sha_client_id_encrypted)

    @sha_client_id.setter
    def sha_client_id(self, value: str) -> None:
        if not value:
            self.sha_client_id_encrypted = ""
            return
        from hmis.apps.core.kms import get_kms_provider

        self.sha_client_id_encrypted = get_kms_provider().encrypt_string(value)

    @property
    def sha_client_secret(self) -> str:
        if not self.sha_client_secret_encrypted:
            return ""
        from hmis.apps.core.kms import get_kms_provider

        return get_kms_provider().decrypt_string(self.sha_client_secret_encrypted)

    @sha_client_secret.setter
    def sha_client_secret(self, value: str) -> None:
        if not value:
            self.sha_client_secret_encrypted = ""
            return
        from hmis.apps.core.kms import get_kms_provider

        self.sha_client_secret_encrypted = get_kms_provider().encrypt_string(value)

    @property
    def sha_username(self) -> str:
        if not self.sha_username_encrypted:
            return ""
        from hmis.apps.core.kms import get_kms_provider

        return get_kms_provider().decrypt_string(self.sha_username_encrypted)

    @sha_username.setter
    def sha_username(self, value: str) -> None:
        if not value:
            self.sha_username_encrypted = ""
            return
        from hmis.apps.core.kms import get_kms_provider

        self.sha_username_encrypted = get_kms_provider().encrypt_string(value)

    @property
    def sha_password(self) -> str:
        if not self.sha_password_encrypted:
            return ""
        from hmis.apps.core.kms import get_kms_provider

        return get_kms_provider().decrypt_string(self.sha_password_encrypted)

    @sha_password.setter
    def sha_password(self, value: str) -> None:
        if not value:
            self.sha_password_encrypted = ""
            return
        from hmis.apps.core.kms import get_kms_provider

        self.sha_password_encrypted = get_kms_provider().encrypt_string(value)

    @property
    def has_sha_credentials(self) -> bool:
        """Return True if the minimum required SHA/DHA ILM credentials are configured."""
        return bool(
            self.sha_consumer_key
            and self.sha_client_id
            and self.sha_client_secret
            and self.sha_username
            and self.sha_password
        )

    def get_service_price(self, service_code: str) -> Decimal | None:
        """Get overridden price for a service, or None to use default."""
        price = self.fee_schedule_override.get(service_code)
        if price is not None:
            return Decimal(str(price))
        return None


class BillingAutomationRule(models.Model):
    """Configurable billing automation rule attached to a facility billing config."""

    class Trigger(models.TextChoices):
        ENCOUNTER_CREATED = "encounter_created", "Encounter Created"
        ADMISSION_CREATED = "admission_created", "Admission Created"
        CHECKOUT = "checkout", "Checkout"
        DAILY = "daily", "Daily Schedule"

    class Recurrence(models.TextChoices):
        ONCE = "once", "One-time"
        RECURRING = "recurring", "Recurring"

    id = models.BigAutoField(primary_key=True)
    billing_config = models.ForeignKey(
        FacilityBillingConfig,
        on_delete=models.CASCADE,
        related_name="automation_rules",
    )
    name = models.CharField(max_length=150)
    is_active = models.BooleanField(default=True)
    trigger = models.CharField(
        max_length=30,
        choices=Trigger.choices,
        default=Trigger.ENCOUNTER_CREATED,
    )
    recurrence = models.CharField(
        max_length=20,
        choices=Recurrence.choices,
        default=Recurrence.ONCE,
        help_text="One-time or recurring charge behavior.",
    )
    repeat_every_days = models.PositiveIntegerField(
        default=1,
        help_text="For recurring rules, run every N days per context.",
    )
    service = models.ForeignKey(
        "billing.Service",
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="automation_rules",
    )
    item_type = models.CharField(
        max_length=20,
        choices=InvoiceItem.ItemType.choices,
        default=InvoiceItem.ItemType.SERVICE,
    )
    quantity = models.DecimalField(max_digits=10, decimal_places=2, default=Decimal("1.00"))
    unit_price_override = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        null=True,
        blank=True,
        help_text="Optional fixed price override. If empty, service unit price is used.",
    )
    description_template = models.CharField(max_length=300, blank=True, default="")
    encounter_types = models.JSONField(
        default=list,
        blank=True,
        help_text="Optional encounter type allow-list (e.g. ['OPD', 'EMERGENCY']).",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["name"]
        indexes = [
            models.Index(fields=["billing_config", "trigger", "is_active"]),
        ]

    def __str__(self):
        return f"{self.name} ({self.get_trigger_display()})"

    def clean(self):
        errors = {}
        if self.quantity <= 0:
            errors["quantity"] = "Quantity must be greater than zero."
        if self.recurrence == self.Recurrence.RECURRING and self.repeat_every_days < 1:
            errors["repeat_every_days"] = (
                "repeat_every_days must be at least 1 for recurring rules."
            )
        if self.unit_price_override is None and self.service_id is None:
            errors["service"] = "Select a service or provide a unit_price_override."
        if self.unit_price_override is not None and self.unit_price_override < 0:
            errors["unit_price_override"] = "unit_price_override cannot be negative."
        if errors:
            raise ValidationError(errors)


class BillingAutomationExecution(models.Model):
    """Execution ledger for billing automation rules (idempotency + audit)."""

    id = models.BigAutoField(primary_key=True)
    rule = models.ForeignKey(
        BillingAutomationRule,
        on_delete=models.CASCADE,
        related_name="executions",
    )
    encounter = models.ForeignKey(
        "encounters.Encounter",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="billing_automation_executions",
    )
    context_key = models.CharField(
        max_length=120,
        help_text="Idempotency context key, e.g. encounter:123",
    )
    execution_date = models.DateField(help_text="Execution bucket date for recurrence checks.")
    invoice_item = models.ForeignKey(
        "billing.InvoiceItem",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="automation_executions",
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["rule", "context_key", "execution_date"],
                name="unique_rule_execution_per_context_date",
            )
        ]
        indexes = [
            models.Index(fields=["rule", "context_key"]),
        ]

    def __str__(self):
        return f"{self.rule.name} @ {self.context_key} ({self.execution_date})"


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

    # Biometric flow fields
    auth_guid = models.CharField(
        max_length=200,
        blank=True,
        default="",
        help_text="Authorization GUID returned by DHA /api/v1/claims/authorize",
    )
    iframe_url = models.URLField(
        max_length=500,
        blank=True,
        default="",
        help_text="Biometric capture iframe URL (valid for 10 minutes)",
    )
    iframe_expires_at = models.DateTimeField(
        null=True,
        blank=True,
        help_text="When the biometric iframe expires (10 min from creation)",
    )
    retry_count = models.IntegerField(
        default=0,
        help_text="Number of failed biometric matching attempts (max 3)",
    )

    # Intervention codes sent with the OTP request (persisted so that
    # start-visit can re-use them without the frontend needing to resend).
    intervention_codes = models.JSONField(
        default=list,
        blank=True,
        help_text="SHA intervention codes sent with the OTP request",
    )

    # Access point for per-access-point consent dedup (DHA UAT requirement)
    access_point = models.CharField(
        max_length=4,
        blank=True,
        default="",
        help_text="IP (inpatient), OP (outpatient) — used for per-access-point consent dedup",
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

    def mark_validated(self, token: str, expires_in_seconds: int | None = None) -> None:
        """Mark consent as validated with the token from DHA."""
        self.status = self.ConsentStatus.VALIDATED
        self.consent_token = token
        self.validated_at = timezone.now()
        self.expires_at = (
            timezone.now() + timedelta(seconds=expires_in_seconds)
            if expires_in_seconds is not None
            else None
        )
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
