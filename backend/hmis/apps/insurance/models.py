"""
Insurance models for Vitora HMIS.

This module contains all private insurance–related models including:
- InsuranceProvider: Registry of insurance companies
- InsurancePlan: Plans/schemes offered by each provider
- PatientInsurance: Patient enrollment in insurance plans
- InsuranceProviderConfig: Per-facility insurer credentials & contract info
- InsuranceClaim: Claims submitted to private insurers
- InsuranceClaimItem: Line items on claims
- InsurancePreauth: Pre-authorization requests
- InsuranceRemittance / InsuranceRemittanceLine: Batch payment tracking
- PayerTariff: Service-to-payer code/rate mapping

All models follow facility/org scoping and TDD approach.
"""

from datetime import date, timedelta
from decimal import Decimal

from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import models
from django.utils import timezone

from hmis.apps.core.mixins import FacilityScopedModel, OrganizationScopedModel


# ---------------------------------------------------------------------------
# InsuranceProvider
# ---------------------------------------------------------------------------
class InsuranceProvider(OrganizationScopedModel):
    """Registry of insurance companies."""

    class ProviderType(models.TextChoices):
        PRIVATE = "private", "Private"
        CORPORATE = "corporate", "Corporate"
        COMMUNITY = "community", "Community-Based"
        MICRO = "micro", "Micro-Insurance"
        OTHER = "other", "Other"

    class Status(models.TextChoices):
        ACTIVE = "active", "Active"
        SUSPENDED = "suspended", "Suspended"
        INACTIVE = "inactive", "Inactive"

    id = models.BigAutoField(primary_key=True)
    name = models.CharField(max_length=200)
    code = models.CharField(max_length=30, help_text="Short code, e.g. JUBILEE, AAR, CIC")
    provider_type = models.CharField(
        max_length=20, choices=ProviderType.choices, default=ProviderType.PRIVATE
    )
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.ACTIVE)
    contact_email = models.EmailField(blank=True)
    contact_phone = models.CharField(max_length=20, blank=True)
    contact_person = models.CharField(max_length=200, blank=True)
    address = models.TextField(blank=True)
    website = models.URLField(blank=True)
    api_integration_enabled = models.BooleanField(
        default=False, help_text="Whether this provider supports API integration"
    )
    notes = models.TextField(blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["name"]
        constraints = [
            models.UniqueConstraint(
                fields=["organization", "code"],
                name="unique_provider_code_per_org",
            )
        ]
        indexes = [
            models.Index(fields=["organization", "status"]),
        ]

    def __str__(self):
        return self.name


# ---------------------------------------------------------------------------
# InsurancePlan
# ---------------------------------------------------------------------------
class InsurancePlan(OrganizationScopedModel):
    """Plans/schemes offered by an insurance provider."""

    class PlanType(models.TextChoices):
        INDIVIDUAL = "individual", "Individual"
        FAMILY = "family", "Family"
        GROUP = "group", "Group"
        CORPORATE = "corporate", "Corporate"

    class CoverageType(models.TextChoices):
        INPATIENT = "inpatient", "Inpatient Only"
        OUTPATIENT = "outpatient", "Outpatient Only"
        COMPREHENSIVE = "comprehensive", "Comprehensive"
        DENTAL = "dental", "Dental"
        OPTICAL = "optical", "Optical"
        MATERNITY = "maternity", "Maternity"

    class Status(models.TextChoices):
        ACTIVE = "active", "Active"
        DISCONTINUED = "discontinued", "Discontinued"

    id = models.BigAutoField(primary_key=True)
    provider = models.ForeignKey(InsuranceProvider, on_delete=models.CASCADE, related_name="plans")
    name = models.CharField(max_length=200)
    code = models.CharField(max_length=30)
    plan_type = models.CharField(
        max_length=20, choices=PlanType.choices, default=PlanType.INDIVIDUAL
    )
    coverage_type = models.CharField(
        max_length=20,
        choices=CoverageType.choices,
        default=CoverageType.COMPREHENSIVE,
    )
    default_copay_percent = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        default=Decimal("0.00"),
        help_text="Patient co-pay percentage (0-100)",
    )
    annual_limit = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        null=True,
        blank=True,
        help_text="Annual benefit cap in KES",
    )
    per_visit_limit = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        null=True,
        blank=True,
        help_text="Per-visit benefit cap in KES",
    )
    preauth_required = models.BooleanField(
        default=False, help_text="Does this plan require pre-authorization?"
    )
    preauth_threshold = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        null=True,
        blank=True,
        help_text="Amount above which preauth is mandatory (KES)",
    )
    waiting_period_days = models.IntegerField(
        default=0, help_text="Waiting period for new members (days)"
    )
    exclusions = models.JSONField(
        default=list,
        blank=True,
        help_text="List of excluded services/conditions",
    )
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.ACTIVE)
    effective_from = models.DateField(null=True, blank=True)
    effective_to = models.DateField(null=True, blank=True)
    notes = models.TextField(blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["provider", "name"]
        constraints = [
            models.UniqueConstraint(
                fields=["provider", "code"],
                name="unique_plan_code_per_provider",
            )
        ]

    def __str__(self):
        return f"{self.provider.name} – {self.name}"

    def clean(self):
        if self.effective_from and self.effective_to and self.effective_to < self.effective_from:
            raise ValidationError({"effective_to": "End date must be on or after start date."})
        if self.default_copay_percent < 0 or self.default_copay_percent > 100:
            raise ValidationError({"default_copay_percent": "Must be between 0 and 100."})


# ---------------------------------------------------------------------------
# PatientInsurance
# ---------------------------------------------------------------------------
class PatientInsurance(OrganizationScopedModel):
    """Patient enrollment in an insurance plan."""

    class MemberType(models.TextChoices):
        PRINCIPAL = "principal", "Principal"
        SPOUSE = "spouse", "Spouse"
        CHILD = "child", "Child"
        DEPENDENT = "dependent", "Dependent"
        OTHER = "other", "Other"

    class Status(models.TextChoices):
        ACTIVE = "active", "Active"
        EXPIRED = "expired", "Expired"
        SUSPENDED = "suspended", "Suspended"
        CANCELLED = "cancelled", "Cancelled"
        PENDING_VERIFICATION = "pending_verification", "Pending Verification"

    id = models.BigAutoField(primary_key=True)
    patient = models.ForeignKey(
        "patients.Patient",
        on_delete=models.PROTECT,
        related_name="insurance_enrollments",
    )
    plan = models.ForeignKey(InsurancePlan, on_delete=models.PROTECT, related_name="enrollments")
    provider = models.ForeignKey(
        InsuranceProvider,
        on_delete=models.PROTECT,
        related_name="patient_enrollments",
        help_text="Denormalized from plan for fast filtering",
    )
    member_number = models.CharField(max_length=50)
    policy_number = models.CharField(max_length=50, blank=True)
    member_type = models.CharField(
        max_length=20,
        choices=MemberType.choices,
        default=MemberType.PRINCIPAL,
    )
    principal_member = models.ForeignKey(
        "self",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="dependents",
        help_text="If dependent, link to the principal member",
    )
    principal_name = models.CharField(
        max_length=200,
        blank=True,
        help_text="Name of principal member (if external)",
    )
    employer = models.CharField(max_length=200, blank=True)
    status = models.CharField(max_length=25, choices=Status.choices, default=Status.ACTIVE)
    valid_from = models.DateField()
    valid_to = models.DateField()
    copay_override = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        null=True,
        blank=True,
        help_text="Patient-specific co-pay if different from plan default",
    )
    annual_balance = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        null=True,
        blank=True,
        help_text="Remaining annual benefit",
    )
    is_primary = models.BooleanField(default=True, help_text="Primary vs secondary insurance")
    verified_at = models.DateTimeField(null=True, blank=True)
    verified_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="+",
    )
    notes = models.TextField(blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-is_primary", "-valid_to"]
        constraints = [
            models.UniqueConstraint(
                fields=["patient", "plan", "member_number"],
                name="unique_patient_plan_member",
            )
        ]
        indexes = [
            models.Index(fields=["patient", "status"]),
            models.Index(fields=["provider", "member_number"]),
        ]

    def __str__(self):
        return f"{self.patient} – {self.plan.name} ({self.member_number})"

    def clean(self):
        if self.valid_to and self.valid_from and self.valid_to < self.valid_from:
            raise ValidationError({"valid_to": "End date must be on or after start date."})
        if self.copay_override is not None and (
            self.copay_override < 0 or self.copay_override > 100
        ):
            raise ValidationError({"copay_override": "Must be between 0 and 100."})

    def save(self, *args, **kwargs):
        # Auto-set provider from plan
        if self.plan_id and not self.provider_id:
            self.provider_id = self.plan.provider_id
        super().save(*args, **kwargs)

    @property
    def is_valid(self) -> bool:
        """Whether this enrollment is currently active and within validity."""
        return (
            self.status == self.Status.ACTIVE and self.valid_from <= date.today() <= self.valid_to
        )

    @property
    def copay_percent(self) -> Decimal:
        """Effective co-pay: patient override or plan default."""
        if self.copay_override is not None:
            return self.copay_override
        return self.plan.default_copay_percent

    @property
    def days_until_expiry(self) -> int:
        delta = self.valid_to - date.today()
        return max(0, delta.days)


# ---------------------------------------------------------------------------
# InsuranceProviderConfig (per-facility)
# ---------------------------------------------------------------------------
class InsuranceProviderConfig(FacilityScopedModel):
    """Per-facility credentials and contract details for an insurer."""

    class AccreditationStatus(models.TextChoices):
        ACCREDITED = "accredited", "Accredited"
        PENDING = "pending", "Pending"
        EXPIRED = "expired", "Expired"
        NOT_ACCREDITED = "not_accredited", "Not Accredited"

    class SubmissionFormat(models.TextChoices):
        API = "api", "API"
        CSV = "csv", "CSV"
        EXCEL = "excel", "Excel"
        PDF = "pdf", "PDF"
        MANUAL = "manual", "Manual"

    class ApiAuthType(models.TextChoices):
        NONE = "none", "None"
        BASIC = "basic", "Basic Auth"
        BEARER = "bearer", "Bearer Token"
        OAUTH2 = "oauth2", "OAuth 2.0"
        API_KEY = "api_key", "API Key"
        CUSTOM = "custom", "Custom"

    id = models.BigAutoField(primary_key=True)
    provider = models.ForeignKey(
        InsuranceProvider, on_delete=models.CASCADE, related_name="facility_configs"
    )
    contract_number = models.CharField(max_length=50, blank=True)
    contract_start = models.DateField(null=True, blank=True)
    contract_end = models.DateField(null=True, blank=True)
    accreditation_status = models.CharField(
        max_length=20,
        choices=AccreditationStatus.choices,
        default=AccreditationStatus.NOT_ACCREDITED,
    )
    accreditation_number = models.CharField(max_length=50, blank=True)
    api_base_url = models.URLField(blank=True)
    api_auth_type = models.CharField(
        max_length=20,
        choices=ApiAuthType.choices,
        default=ApiAuthType.NONE,
    )
    api_credentials = models.JSONField(
        default=dict,
        blank=True,
        help_text="Encrypted credentials blob (keys vary by auth type)",
    )
    api_enabled = models.BooleanField(default=False)
    max_claim_amount = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        null=True,
        blank=True,
        help_text="Maximum single-claim amount for this facility (KES)",
    )
    submission_format = models.CharField(
        max_length=10,
        choices=SubmissionFormat.choices,
        default=SubmissionFormat.MANUAL,
    )
    notes = models.TextField(blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["facility", "provider"],
                name="unique_provider_config_per_facility",
            )
        ]
        verbose_name = "Insurance Provider Config"
        verbose_name_plural = "Insurance Provider Configs"

    def __str__(self):
        return f"{self.provider.name} @ {self.facility.name}"

    @property
    def is_contract_active(self) -> bool:
        if not self.contract_start or not self.contract_end:
            return False
        return self.contract_start <= date.today() <= self.contract_end


# ---------------------------------------------------------------------------
# InsuranceClaim
# ---------------------------------------------------------------------------
class InsuranceClaim(FacilityScopedModel):
    """Claim submitted to a private insurer."""

    class Status(models.TextChoices):
        DRAFT = "draft", "Draft"
        PENDING_PREAUTH = "pending_preauth", "Pending Pre-auth"
        PREAUTH_APPROVED = "preauth_approved", "Pre-auth Approved"
        PREAUTH_DENIED = "preauth_denied", "Pre-auth Denied"
        SUBMITTED = "submitted", "Submitted"
        ACKNOWLEDGED = "acknowledged", "Acknowledged"
        UNDER_REVIEW = "under_review", "Under Review"
        QUERY = "query", "Query"
        APPROVED = "approved", "Approved"
        PARTIALLY_APPROVED = "partially_approved", "Partially Approved"
        REJECTED = "rejected", "Rejected"
        PAID = "paid", "Paid"
        PARTIALLY_PAID = "partially_paid", "Partially Paid"
        APPEALED = "appealed", "Appealed"
        WRITTEN_OFF = "written_off", "Written Off"
        CANCELLED = "cancelled", "Cancelled"

    class ClaimType(models.TextChoices):
        OUTPATIENT = "outpatient", "Outpatient"
        INPATIENT = "inpatient", "Inpatient"
        DENTAL = "dental", "Dental"
        OPTICAL = "optical", "Optical"
        MATERNITY = "maternity", "Maternity"
        EMERGENCY = "emergency", "Emergency"

    id = models.BigAutoField(primary_key=True)
    claim_number = models.CharField(max_length=50, unique=True, editable=False)

    # Relationships
    invoice = models.ForeignKey(
        "billing.Invoice",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="insurance_claims",
    )
    patient_insurance = models.ForeignKey(
        PatientInsurance,
        on_delete=models.PROTECT,
        related_name="claims",
    )
    provider = models.ForeignKey(
        InsuranceProvider,
        on_delete=models.PROTECT,
        related_name="claims",
    )
    patient = models.ForeignKey(
        "patients.Patient",
        on_delete=models.PROTECT,
        related_name="insurance_claims",
    )
    encounter = models.ForeignKey(
        "encounters.Encounter",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="insurance_claims",
    )
    preauth = models.ForeignKey(
        "InsurancePreauth",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="claims",
    )

    # Claim details
    status = models.CharField(max_length=25, choices=Status.choices, default=Status.DRAFT)
    claim_type = models.CharField(
        max_length=20, choices=ClaimType.choices, default=ClaimType.OUTPATIENT
    )
    diagnosis_codes = models.JSONField(default=list, blank=True, help_text="ICD-10 codes")

    # Dates
    service_date = models.DateField(default=date.today)
    admission_date = models.DateField(null=True, blank=True)
    discharge_date = models.DateField(null=True, blank=True)
    submission_date = models.DateTimeField(null=True, blank=True)

    # Financial
    total_amount = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal("0.00"))
    approved_amount = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal("0.00"))
    copay_amount = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal("0.00"))
    paid_amount = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal("0.00"))

    # Insurer references
    external_claim_id = models.CharField(
        max_length=100,
        blank=True,
        help_text="Insurer's reference number",
    )
    external_preauth_id = models.CharField(
        max_length=100,
        blank=True,
        help_text="Linked preauth at insurer",
    )

    # Query / rejection info
    rejection_reason = models.TextField(blank=True)
    query_details = models.TextField(
        blank=True, help_text="Insurer queries / requests for information"
    )
    query_response = models.TextField(blank=True)

    # Audit
    submitted_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="insurance_claims_submitted",
    )
    reviewed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="insurance_claims_reviewed",
    )
    notes = models.TextField(blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["provider", "status"]),
            models.Index(fields=["patient", "status"]),
            models.Index(fields=["claim_number"]),
            models.Index(fields=["status", "submission_date"]),
        ]

    def __str__(self):
        return f"{self.claim_number} – {self.provider.name}"

    def save(self, *args, **kwargs):
        if not self.claim_number:
            self.claim_number = self._generate_claim_number()
        if self.patient_insurance_id and not self.provider_id:
            self.provider_id = self.patient_insurance.provider_id
        super().save(*args, **kwargs)

    @staticmethod
    def _generate_claim_number() -> str:
        today = date.today()
        prefix = f"IC-{today.strftime('%Y%m%d')}-"
        last = (
            InsuranceClaim.objects.filter(claim_number__startswith=prefix)
            .order_by("-claim_number")
            .first()
        )
        seq = int(last.claim_number.split("-")[-1]) + 1 if last else 1
        return f"{prefix}{seq:04d}"

    # ---- State-transition methods ----

    _SUBMITTABLE = {Status.DRAFT, Status.PREAUTH_APPROVED}

    def submit(self, user=None):
        """Submit claim to insurer."""
        if self.status not in self._SUBMITTABLE:
            raise ValidationError(f"Cannot submit claim in '{self.get_status_display()}' status.")
        self.status = self.Status.SUBMITTED
        self.submission_date = timezone.now()
        if user:
            self.submitted_by = user
        self.save(update_fields=["status", "submission_date", "submitted_by", "updated_at"])

    def acknowledge(self):
        if self.status != self.Status.SUBMITTED:
            raise ValidationError("Only submitted claims can be acknowledged.")
        self.status = self.Status.ACKNOWLEDGED
        self.save(update_fields=["status", "updated_at"])

    def approve(self, approved_amount: Decimal, user=None):
        if self.status not in {
            self.Status.SUBMITTED,
            self.Status.ACKNOWLEDGED,
            self.Status.UNDER_REVIEW,
        }:
            raise ValidationError("Claim is not in a reviewable status.")
        self.status = self.Status.APPROVED
        self.approved_amount = approved_amount
        if user:
            self.reviewed_by = user
        self.save(update_fields=["status", "approved_amount", "reviewed_by", "updated_at"])

    def partially_approve(self, approved_amount: Decimal, user=None):
        if self.status not in {
            self.Status.SUBMITTED,
            self.Status.ACKNOWLEDGED,
            self.Status.UNDER_REVIEW,
        }:
            raise ValidationError("Claim is not in a reviewable status.")
        self.status = self.Status.PARTIALLY_APPROVED
        self.approved_amount = approved_amount
        if user:
            self.reviewed_by = user
        self.save(update_fields=["status", "approved_amount", "reviewed_by", "updated_at"])

    def reject(self, reason: str, user=None):
        if self.status in {
            self.Status.PAID,
            self.Status.CANCELLED,
            self.Status.WRITTEN_OFF,
        }:
            raise ValidationError("Claim cannot be rejected in its current status.")
        self.status = self.Status.REJECTED
        self.rejection_reason = reason
        if user:
            self.reviewed_by = user
        self.save(update_fields=["status", "rejection_reason", "reviewed_by", "updated_at"])

    def query_claim(self, details: str, user=None):
        """Insurer raises a query on the claim."""
        self.status = self.Status.QUERY
        self.query_details = details
        if user:
            self.reviewed_by = user
        self.save(update_fields=["status", "query_details", "reviewed_by", "updated_at"])

    def respond_to_query(self, response: str, user=None):
        if self.status != self.Status.QUERY:
            raise ValidationError("Claim is not in query status.")
        self.status = self.Status.SUBMITTED
        self.query_response = response
        if user:
            self.submitted_by = user
        self.save(update_fields=["status", "query_response", "submitted_by", "updated_at"])

    def mark_paid(self, paid_amount: Decimal):
        if self.status not in {
            self.Status.APPROVED,
            self.Status.PARTIALLY_APPROVED,
        }:
            raise ValidationError("Only approved claims can be marked as paid.")
        self.paid_amount = paid_amount
        if paid_amount >= self.approved_amount:
            self.status = self.Status.PAID
        else:
            self.status = self.Status.PARTIALLY_PAID
        self.save(update_fields=["status", "paid_amount", "updated_at"])

    def appeal(self, notes: str = ""):
        if self.status != self.Status.REJECTED:
            raise ValidationError("Only rejected claims can be appealed.")
        self.status = self.Status.APPEALED
        if notes:
            self.notes = notes
        self.save(update_fields=["status", "notes", "updated_at"])

    def cancel(self, reason: str = ""):
        if self.status in {self.Status.PAID, self.Status.CANCELLED}:
            raise ValidationError("Cannot cancel claim in its current status.")
        self.status = self.Status.CANCELLED
        if reason:
            self.rejection_reason = reason
        self.save(update_fields=["status", "rejection_reason", "updated_at"])

    def write_off(self, reason: str = ""):
        self.status = self.Status.WRITTEN_OFF
        if reason:
            self.notes = reason
        self.save(update_fields=["status", "notes", "updated_at"])

    # ---- Properties ----

    @property
    def days_since_submission(self) -> int | None:
        if not self.submission_date:
            return None
        return (timezone.now() - self.submission_date).days

    @property
    def is_overdue(self) -> bool:
        """Consider overdue if submitted >30 days ago and still pending."""
        if self.status in {
            self.Status.PAID,
            self.Status.CANCELLED,
            self.Status.WRITTEN_OFF,
        }:
            return False
        ds = self.days_since_submission
        return ds is not None and ds > 30

    @property
    def is_appealable(self) -> bool:
        return self.status == self.Status.REJECTED


# ---------------------------------------------------------------------------
# InsuranceClaimItem
# ---------------------------------------------------------------------------
class InsuranceClaimItem(models.Model):
    """Line item on an insurance claim."""

    class Status(models.TextChoices):
        PENDING = "pending", "Pending"
        APPROVED = "approved", "Approved"
        PARTIALLY_APPROVED = "partially_approved", "Partially Approved"
        REJECTED = "rejected", "Rejected"

    id = models.BigAutoField(primary_key=True)
    claim = models.ForeignKey(InsuranceClaim, on_delete=models.CASCADE, related_name="items")
    invoice_item = models.ForeignKey(
        "billing.InvoiceItem",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="insurance_claim_items",
    )
    service_description = models.CharField(max_length=300)
    service_code = models.CharField(
        max_length=30, blank=True, help_text="Payer-specific service code"
    )
    quantity = models.IntegerField(default=1)
    unit_price = models.DecimalField(max_digits=12, decimal_places=2)
    claimed_amount = models.DecimalField(max_digits=12, decimal_places=2)
    approved_amount = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal("0.00"))
    rejection_reason = models.CharField(max_length=300, blank=True)
    tariff_code = models.CharField(max_length=30, blank=True)
    status = models.CharField(max_length=25, choices=Status.choices, default=Status.PENDING)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["id"]

    def __str__(self):
        return f"{self.service_description} ({self.claimed_amount})"


# ---------------------------------------------------------------------------
# InsurancePreauth
# ---------------------------------------------------------------------------
class InsurancePreauth(FacilityScopedModel):
    """Pre-authorization request to a private insurer."""

    class Status(models.TextChoices):
        DRAFT = "draft", "Draft"
        SUBMITTED = "submitted", "Submitted"
        APPROVED = "approved", "Approved"
        DENIED = "denied", "Denied"
        EXPIRED = "expired", "Expired"
        CANCELLED = "cancelled", "Cancelled"

    class PreauthType(models.TextChoices):
        ADMISSION = "admission", "Admission"
        SURGERY = "surgery", "Surgery"
        PROCEDURE = "procedure", "Procedure"
        INVESTIGATION = "investigation", "Investigation"
        MEDICATION = "medication", "Medication"
        OTHER = "other", "Other"

    id = models.BigAutoField(primary_key=True)
    preauth_number = models.CharField(max_length=50, unique=True, editable=False)

    patient_insurance = models.ForeignKey(
        PatientInsurance, on_delete=models.PROTECT, related_name="preauths"
    )
    provider = models.ForeignKey(
        InsuranceProvider, on_delete=models.PROTECT, related_name="preauths"
    )
    patient = models.ForeignKey(
        "patients.Patient", on_delete=models.PROTECT, related_name="insurance_preauths"
    )

    status = models.CharField(max_length=20, choices=Status.choices, default=Status.DRAFT)
    preauth_type = models.CharField(
        max_length=20, choices=PreauthType.choices, default=PreauthType.ADMISSION
    )
    diagnosis_codes = models.JSONField(default=list, blank=True)
    requested_services = models.JSONField(
        default=list,
        blank=True,
        help_text="List of {description, code, quantity, estimated_cost}",
    )
    estimated_cost = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal("0.00"))
    approved_amount = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    validity_period_days = models.IntegerField(
        null=True,
        blank=True,
        help_text="How long approval is valid (days)",
    )
    approved_at = models.DateTimeField(null=True, blank=True)
    expires_at = models.DateTimeField(null=True, blank=True)
    external_preauth_id = models.CharField(
        max_length=100,
        blank=True,
        help_text="Insurer's preauth reference",
    )
    clinical_notes = models.TextField(blank=True)
    rejection_reason = models.TextField(blank=True)

    submitted_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="insurance_preauths_submitted",
    )
    reviewed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="insurance_preauths_reviewed",
    )
    notes = models.TextField(blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["provider", "status"]),
            models.Index(fields=["patient", "status"]),
        ]

    def __str__(self):
        return f"{self.preauth_number} – {self.provider.name}"

    def save(self, *args, **kwargs):
        if not self.preauth_number:
            self.preauth_number = self._generate_preauth_number()
        if self.patient_insurance_id and not self.provider_id:
            self.provider_id = self.patient_insurance.provider_id
        super().save(*args, **kwargs)

    @staticmethod
    def _generate_preauth_number() -> str:
        today = date.today()
        prefix = f"IPA-{today.strftime('%Y%m%d')}-"
        last = (
            InsurancePreauth.objects.filter(preauth_number__startswith=prefix)
            .order_by("-preauth_number")
            .first()
        )
        seq = int(last.preauth_number.split("-")[-1]) + 1 if last else 1
        return f"{prefix}{seq:04d}"

    # ---- State transitions ----

    def submit(self, user=None):
        if self.status != self.Status.DRAFT:
            raise ValidationError("Only draft preauths can be submitted.")
        self.status = self.Status.SUBMITTED
        if user:
            self.submitted_by = user
        self.save(update_fields=["status", "submitted_by", "updated_at"])

    def approve(self, approved_amount: Decimal, validity_days: int = 30, user=None):
        if self.status != self.Status.SUBMITTED:
            raise ValidationError("Only submitted preauths can be approved.")
        self.status = self.Status.APPROVED
        self.approved_amount = approved_amount
        self.approved_at = timezone.now()
        self.validity_period_days = validity_days
        self.expires_at = timezone.now() + timedelta(days=validity_days)
        if user:
            self.reviewed_by = user
        self.save(
            update_fields=[
                "status",
                "approved_amount",
                "approved_at",
                "validity_period_days",
                "expires_at",
                "reviewed_by",
                "updated_at",
            ]
        )

    def deny(self, reason: str, user=None):
        if self.status != self.Status.SUBMITTED:
            raise ValidationError("Only submitted preauths can be denied.")
        self.status = self.Status.DENIED
        self.rejection_reason = reason
        if user:
            self.reviewed_by = user
        self.save(update_fields=["status", "rejection_reason", "reviewed_by", "updated_at"])

    def cancel(self, reason: str = ""):
        if self.status in {self.Status.EXPIRED, self.Status.CANCELLED}:
            raise ValidationError("Preauth is already expired or cancelled.")
        self.status = self.Status.CANCELLED
        if reason:
            self.rejection_reason = reason
        self.save(update_fields=["status", "rejection_reason", "updated_at"])

    def expire(self):
        if self.status != self.Status.APPROVED:
            raise ValidationError("Only approved preauths can expire.")
        self.status = self.Status.EXPIRED
        self.save(update_fields=["status", "updated_at"])

    @property
    def is_expired(self) -> bool:
        if self.status != self.Status.APPROVED:
            return False
        return bool(self.expires_at and timezone.now() > self.expires_at)

    @property
    def is_active(self) -> bool:
        return self.status == self.Status.APPROVED and not self.is_expired


# ---------------------------------------------------------------------------
# InsuranceRemittance
# ---------------------------------------------------------------------------
class InsuranceRemittance(FacilityScopedModel):
    """Batch payment received from an insurer."""

    class Status(models.TextChoices):
        RECEIVED = "received", "Received"
        RECONCILED = "reconciled", "Reconciled"
        PARTIAL = "partial", "Partially Reconciled"
        DISPUTED = "disputed", "Disputed"

    id = models.BigAutoField(primary_key=True)
    provider = models.ForeignKey(
        InsuranceProvider, on_delete=models.PROTECT, related_name="remittances"
    )
    remittance_number = models.CharField(max_length=50)
    remittance_date = models.DateField()
    total_amount = models.DecimalField(max_digits=12, decimal_places=2)
    reconciled_amount = models.DecimalField(
        max_digits=12, decimal_places=2, default=Decimal("0.00")
    )
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.RECEIVED)
    payment_method = models.CharField(max_length=50, blank=True)
    payment_reference = models.CharField(max_length=100, blank=True)
    bank_reference = models.CharField(max_length=100, blank=True)

    received_at = models.DateTimeField(null=True, blank=True)
    reconciled_at = models.DateTimeField(null=True, blank=True)
    notes = models.TextField(blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-remittance_date"]
        indexes = [
            models.Index(fields=["provider", "status"]),
        ]

    def __str__(self):
        return f"{self.remittance_number} – {self.provider.name}"

    def reconcile(self):
        """Mark remittance as reconciled once all lines are matched."""
        total_matched = sum(line.net_amount for line in self.lines.all())
        self.reconciled_amount = total_matched
        if total_matched >= self.total_amount:
            self.status = self.Status.RECONCILED
        else:
            self.status = self.Status.PARTIAL
        self.reconciled_at = timezone.now()
        self.save(update_fields=["reconciled_amount", "status", "reconciled_at", "updated_at"])


# ---------------------------------------------------------------------------
# InsuranceRemittanceLine
# ---------------------------------------------------------------------------
class InsuranceRemittanceLine(models.Model):
    """Individual claim paid within a remittance batch."""

    id = models.BigAutoField(primary_key=True)
    remittance = models.ForeignKey(
        InsuranceRemittance, on_delete=models.CASCADE, related_name="lines"
    )
    claim = models.ForeignKey(
        InsuranceClaim,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="remittance_lines",
    )
    claim_number = models.CharField(max_length=50, help_text="Claim number as reported by insurer")
    member_number = models.CharField(max_length=50, blank=True)
    paid_amount = models.DecimalField(max_digits=12, decimal_places=2)
    deductions = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal("0.00"))
    net_amount = models.DecimalField(max_digits=12, decimal_places=2)
    notes = models.CharField(max_length=300, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["id"]

    def __str__(self):
        return f"{self.claim_number} – {self.net_amount}"


# ---------------------------------------------------------------------------
# PayerTariff
# ---------------------------------------------------------------------------
class PayerTariff(OrganizationScopedModel):
    """Service-to-payer code and rate mapping."""

    id = models.BigAutoField(primary_key=True)
    provider = models.ForeignKey(
        InsuranceProvider, on_delete=models.CASCADE, related_name="tariffs"
    )
    plan = models.ForeignKey(
        InsurancePlan,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="tariffs",
        help_text="If null, applies to all plans for this provider",
    )
    service = models.ForeignKey(
        "billing.Service",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="payer_tariffs",
    )
    service_code = models.CharField(max_length=30, help_text="Facility's service code")
    payer_code = models.CharField(max_length=30, help_text="Insurer's code for this service")
    payer_description = models.CharField(max_length=300, blank=True)
    tariff_amount = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        help_text="Insurer's approved rate (KES)",
    )
    facility_charge = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        null=True,
        blank=True,
        help_text="What facility normally charges (KES)",
    )
    requires_preauth = models.BooleanField(default=False)
    effective_from = models.DateField()
    effective_to = models.DateField(null=True, blank=True)
    notes = models.TextField(blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["provider", "service_code"]
        constraints = [
            models.UniqueConstraint(
                fields=["provider", "service_code", "plan", "effective_from"],
                name="unique_tariff_mapping",
            )
        ]

    def __str__(self):
        return f"{self.provider.name}: {self.service_code} → {self.payer_code}"

    @property
    def is_active(self) -> bool:
        today = date.today()
        if self.effective_to:
            return self.effective_from <= today <= self.effective_to
        return today >= self.effective_from


# ---------------------------------------------------------------------------
# InsuranceOutboundCall — audit row for every outbound call to an insurer API
# ---------------------------------------------------------------------------


class InsuranceOutboundCall(FacilityScopedModel):
    """Audit row for every outbound HTTP call to a private insurer API.

    Mirrors ``DHAOutboundCall`` but scoped to the insurance provider.
    PII is redacted from request/response payloads before persistence.
    """

    class Status(models.TextChoices):
        SUCCESS = "SUCCESS", "Success"
        CLIENT_ERROR = "CLIENT_ERROR", "Client Error (4xx)"
        SERVER_ERROR = "SERVER_ERROR", "Server Error (5xx)"
        TRANSPORT = "TRANSPORT", "Transport Error"
        TIMEOUT = "TIMEOUT", "Timeout"

    provider = models.ForeignKey(
        "insurance.InsuranceProvider",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="outbound_calls",
    )
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="insurance_outbound_calls",
        help_text="User who triggered the call (if request-scoped).",
    )

    method = models.CharField(max_length=10)
    path = models.CharField(max_length=500, help_text="Path on the insurer API.")
    base_url = models.CharField(max_length=500, blank=True, default="")
    auth_mode = models.CharField(max_length=20, blank=True, default="")

    status = models.CharField(max_length=20, choices=Status.choices)
    status_code = models.IntegerField(null=True, blank=True)
    duration_ms = models.IntegerField(null=True, blank=True)
    attempt = models.PositiveSmallIntegerField(default=1)

    correlation_id = models.CharField(max_length=64, blank=True, default="")
    error_code = models.CharField(max_length=64, blank=True, default="")

    request_payload = models.JSONField(
        null=True, blank=True, help_text="PII-redacted request body."
    )
    response_excerpt = models.JSONField(null=True, blank=True, help_text="First 4 KB of response.")
    error_message = models.TextField(blank=True, default="")

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["facility", "-created_at"]),
            models.Index(fields=["provider", "-created_at"]),
            models.Index(fields=["status", "-created_at"]),
            models.Index(fields=["correlation_id"]),
        ]
        verbose_name = "Insurance Outbound Call"
        verbose_name_plural = "Insurance Outbound Calls"

    def __str__(self) -> str:  # pragma: no cover - cosmetic
        ts = self.created_at.strftime("%Y-%m-%d %H:%M:%S") if self.created_at else "?"
        return f"[{ts}] {self.method} {self.path} -> {self.status_code}"
