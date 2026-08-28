# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""Billing models sha ops for Vitora HMIS.

What this file is for:
- Implement models sha ops logic for the billing domain.

How to use it:
- Import classes and functions from this module in Django app code and tests.

Supported inputs/args:
- Python imports and Django ORM/runtime inputs; no standalone CLI arguments.
"""

from decimal import Decimal

from django.conf import settings
from django.db import models
from django.utils import timezone

from hmis.apps.billing.models_sha_claim_core import SHAClaim
from hmis.apps.billing.models_sha_registry import SHAMember
from hmis.apps.core.mixins import FacilityScopedModel


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


class SHAPreauth(FacilityScopedModel):
    """Tracks DHA HIE preauthorisation requests submitted via ``/api/v1/preauths``.

    A preauth is created per ``(consent_token, intervention_code)`` pair and
    moves through DRAFT → SUBMITTED → (APPROVED|DENIED|CANCELLED). The
    ``request_payload`` and ``response_payload`` fields keep the full DHA
    round-trip so we can reconstruct decisions and audit failures.
    """

    class Status(models.TextChoices):
        DRAFT = "draft", "Draft"
        SUBMITTED = "submitted", "Submitted"
        APPROVED = "approved", "Approved"
        DENIED = "denied", "Denied"
        CANCELLED = "cancelled", "Cancelled"

    id = models.BigAutoField(primary_key=True)
    claim = models.ForeignKey(
        SHAClaim,
        on_delete=models.CASCADE,
        related_name="preauths",
        null=True,
        blank=True,
    )
    patient = models.ForeignKey(
        "patients.Patient", on_delete=models.PROTECT, related_name="dha_preauths"
    )
    sha_member = models.ForeignKey(
        SHAMember,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="dha_preauths",
    )
    consent_token = models.CharField(max_length=255)
    intervention_code = models.CharField(max_length=64)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.DRAFT)
    dha_external_id = models.CharField(max_length=64, blank=True)
    correlation_id = models.CharField(max_length=64, blank=True)
    request_payload = models.JSONField(default=dict, blank=True)
    response_payload = models.JSONField(default=dict, blank=True)
    diagnoses = models.JSONField(default=list, blank=True)
    doctor_consent_state = models.CharField(max_length=32, blank=True)
    requested_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="requested_dha_preauths",
    )
    decided_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="decided_dha_preauths",
    )
    submitted_at = models.DateTimeField(null=True, blank=True)
    decided_at = models.DateTimeField(null=True, blank=True)
    cancelled_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "SHA Preauthorisation (DHA)"
        verbose_name_plural = "SHA Preauthorisations (DHA)"
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["claim", "status"]),
            models.Index(fields=["consent_token"]),
            models.Index(fields=["dha_external_id"]),
        ]
        constraints = [
            models.UniqueConstraint(
                fields=["consent_token", "intervention_code"],
                name="uniq_dha_preauth_consent_intervention",
            ),
        ]

    def __str__(self) -> str:  # pragma: no cover - trivial
        return f"Preauth {self.intervention_code} ({self.status})"

    # ------------------------------------------------------------------
    # State transition guards
    # ------------------------------------------------------------------

    VALID_TRANSITIONS: dict[str, set[str]] = {
        "draft": {"submitted", "cancelled"},
        "submitted": {"approved", "denied", "cancelled"},
        "approved": set(),  # Terminal
        "denied": set(),  # Terminal
        "cancelled": set(),  # Terminal
    }

    def can_transition_to(self, new_status: str) -> bool:
        """Check if transitioning to new_status is valid."""
        allowed = self.VALID_TRANSITIONS.get(self.status, set())
        return new_status in allowed

    def transition_to(self, new_status: str) -> None:
        """Transition to a new status with guard check.

        Raises ValueError if the transition is not allowed.
        """
        if not self.can_transition_to(new_status):
            raise ValueError(
                f"Cannot transition SHAPreauth from '{self.status}' to '{new_status}'. "
                f"Allowed: {self.VALID_TRANSITIONS.get(self.status, set())}"
            )
        self.status = new_status


class SHAEmergencyClaim(FacilityScopedModel):
    """Tracks DHA HIE emergency / EMT claims (``/api/v1/claims/emergency``, ``/claims/emt``).

    Emergency claims live alongside (not inside) ``SHAClaim`` because they may
    precede patient identification (unidentified patients get ``brought_by`` /
    ``mode_of_arrival`` with no MRN). When the patient is later identified,
    ``patient`` is back-filled.
    """

    class ClaimKind(models.TextChoices):
        EMERGENCY = "emergency", "Emergency"
        EMT = "emt", "EMT"

    class Status(models.TextChoices):
        OPEN = "open", "Open"
        SUBMITTED = "submitted", "Submitted"
        AUTHORIZED = "authorized", "Authorized"
        CANCELLED = "cancelled", "Cancelled"

    id = models.BigAutoField(primary_key=True)
    kind = models.CharField(max_length=16, choices=ClaimKind.choices, default=ClaimKind.EMERGENCY)
    patient = models.ForeignKey(
        "patients.Patient",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="dha_emergency_claims",
    )
    sha_member = models.ForeignKey(
        SHAMember,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="dha_emergency_claims",
    )
    claim = models.ForeignKey(
        SHAClaim,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="dha_emergency_claims",
    )
    consent_token = models.CharField(max_length=255, blank=True)
    reference_number = models.CharField(max_length=64, blank=True)
    case_number = models.CharField(max_length=64, blank=True)
    beneficiary_cr_id = models.CharField(max_length=64, blank=True)
    brought_by = models.CharField(max_length=32, blank=True)
    mode_of_arrival = models.CharField(max_length=32, blank=True)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.OPEN)
    dha_external_id = models.CharField(max_length=64, blank=True)
    correlation_id = models.CharField(max_length=64, blank=True)
    request_payload = models.JSONField(default=dict, blank=True)
    response_payload = models.JSONField(default=dict, blank=True)
    interventions = models.JSONField(default=list, blank=True)
    diagnoses = models.JSONField(default=list, blank=True)
    notes = models.TextField(blank=True)
    opened_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="opened_dha_emergency_claims",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "SHA Emergency Claim (DHA)"
        verbose_name_plural = "SHA Emergency Claims (DHA)"
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["kind", "status"]),
            models.Index(fields=["dha_external_id"]),
            models.Index(fields=["reference_number"]),
        ]

    def __str__(self) -> str:  # pragma: no cover - trivial
        return f"{self.kind} {self.reference_number or self.dha_external_id} ({self.status})"


class SHAOtpRequest(FacilityScopedModel):
    """Track OTP requests sent through DHA ILM (visit / discharge)."""

    class Kind(models.TextChoices):
        VISIT = "visit", "Visit OTP"
        DISCHARGE = "discharge", "Discharge OTP"

    class Status(models.TextChoices):
        SENT = "sent", "Sent"
        VERIFIED = "verified", "Verified"
        FAILED = "failed", "Failed"

    patient = models.ForeignKey(
        "patients.Patient",
        on_delete=models.PROTECT,
        related_name="sha_otp_requests",
        null=True,
        blank=True,
    )
    sha_member = models.ForeignKey(
        "billing.SHAMember",
        on_delete=models.SET_NULL,
        related_name="otp_requests",
        null=True,
        blank=True,
    )
    claim = models.ForeignKey(
        "billing.SHAClaim",
        on_delete=models.SET_NULL,
        related_name="otp_requests",
        null=True,
        blank=True,
    )
    kind = models.CharField(max_length=16, choices=Kind.choices)
    status = models.CharField(max_length=16, choices=Status.choices, default=Status.SENT)
    consent_token = models.CharField(max_length=512, blank=True, default="")
    patient_cr_id = models.CharField(max_length=64, blank=True, default="")
    intervention_codes = models.JSONField(default=list, blank=True)
    response_payload = models.JSONField(default=dict, blank=True)
    correlation_id = models.CharField(max_length=128, blank=True, default="")
    sent_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        related_name="sha_otp_sent",
        null=True,
        blank=True,
    )
    sent_at = models.DateTimeField(default=timezone.now)
    verified_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        verbose_name = "SHA OTP Request"
        verbose_name_plural = "SHA OTP Requests"
        ordering = ["-sent_at"]
        indexes = [
            models.Index(fields=["kind", "status"]),
            models.Index(fields=["patient_cr_id"]),
        ]

    def __str__(self) -> str:  # pragma: no cover - trivial
        return f"{self.get_kind_display()} OTP -> {self.patient_cr_id or self.patient_id} ({self.status})"


class SHAOtpWhitelistRequest(FacilityScopedModel):
    """Track OTP whitelist requests submitted to DHA ILM."""

    class Status(models.TextChoices):
        REQUESTED = "requested", "Requested"
        APPROVED = "approved", "Approved"
        REJECTED = "rejected", "Rejected"
        FAILED = "failed", "Failed"

    patient = models.ForeignKey(
        "patients.Patient",
        on_delete=models.PROTECT,
        related_name="sha_otp_whitelist_requests",
        null=True,
        blank=True,
    )
    beneficiary_cr_id = models.CharField(max_length=64)
    reason_type = models.CharField(max_length=64, blank=True, default="")
    reason = models.TextField(blank=True, default="")
    biometric_attempts = models.IntegerField(default=0)
    status = models.CharField(max_length=16, choices=Status.choices, default=Status.REQUESTED)
    dha_guid = models.CharField(max_length=128, blank=True, default="")
    response_payload = models.JSONField(default=dict, blank=True)
    correlation_id = models.CharField(max_length=128, blank=True, default="")
    requested_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        related_name="sha_otp_whitelists",
        null=True,
        blank=True,
    )
    requested_at = models.DateTimeField(default=timezone.now)

    class Meta:
        verbose_name = "SHA OTP Whitelist Request"
        verbose_name_plural = "SHA OTP Whitelist Requests"
        ordering = ["-requested_at"]
        indexes = [
            models.Index(fields=["beneficiary_cr_id"]),
            models.Index(fields=["status"]),
            models.Index(fields=["dha_guid"]),
        ]

    def __str__(self) -> str:  # pragma: no cover - trivial
        return f"OTP whitelist {self.beneficiary_cr_id} ({self.status})"


class SHAUpload(FacilityScopedModel):
    """Audit row for files uploaded to DHA ILM /uploads."""

    filename = models.CharField(max_length=255)
    content_type = models.CharField(max_length=128, blank=True, default="")
    size_bytes = models.BigIntegerField(default=0)
    dha_file_id = models.CharField(max_length=255, blank=True, default="")
    dha_file_path = models.CharField(max_length=512, blank=True, default="")
    dha_download_url = models.TextField(blank=True, default="")
    response_payload = models.JSONField(default=dict, blank=True)
    correlation_id = models.CharField(max_length=128, blank=True, default="")
    uploaded_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        related_name="sha_uploads",
        null=True,
        blank=True,
    )
    uploaded_at = models.DateTimeField(default=timezone.now)

    class Meta:
        verbose_name = "SHA Upload"
        verbose_name_plural = "SHA Uploads"
        ordering = ["-uploaded_at"]
        indexes = [
            models.Index(fields=["dha_file_id"]),
        ]

    def __str__(self) -> str:  # pragma: no cover - trivial
        return f"{self.filename} ({self.dha_file_id or 'pending'})"


class SHADhaPrescription(FacilityScopedModel):
    """Audit row for ePrescriptions sent through DHA ILM (Phase 5)."""

    class Status(models.TextChoices):
        DRAFT = "draft", "Draft"
        CREATED = "created", "Created"
        DISPENSED = "dispensed", "Dispensed"
        CANCELLED = "cancelled", "Cancelled"
        FAILED = "failed", "Failed"

    patient = models.ForeignKey(
        "patients.Patient",
        on_delete=models.PROTECT,
        related_name="sha_dha_prescriptions",
        null=True,
        blank=True,
    )
    encounter = models.ForeignKey(
        "encounters.Encounter",
        on_delete=models.SET_NULL,
        related_name="sha_dha_prescriptions",
        null=True,
        blank=True,
    )
    claim = models.ForeignKey(
        "billing.SHAClaim",
        on_delete=models.SET_NULL,
        related_name="dha_prescriptions",
        null=True,
        blank=True,
    )
    consent_token = models.CharField(max_length=512, blank=True, default="")
    intervention_code = models.CharField(max_length=64, blank=True, default="")
    identification_number = models.CharField(max_length=64, blank=True, default="")
    identification_type = models.CharField(max_length=32, blank=True, default="")
    regulation_body = models.CharField(max_length=128, blank=True, default="")
    items = models.JSONField(default=list, blank=True)
    status = models.CharField(max_length=16, choices=Status.choices, default=Status.DRAFT)
    dha_external_id = models.CharField(max_length=128, blank=True, default="")
    dha_guid = models.CharField(max_length=128, blank=True, default="")
    response_payload = models.JSONField(default=dict, blank=True)
    dispense_payload = models.JSONField(default=dict, blank=True)
    correlation_id = models.CharField(max_length=128, blank=True, default="")
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        related_name="sha_dha_prescriptions_created",
        null=True,
        blank=True,
    )
    created_at = models.DateTimeField(default=timezone.now)
    dispensed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        verbose_name = "SHA DHA Prescription"
        verbose_name_plural = "SHA DHA Prescriptions"
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["status"]),
            models.Index(fields=["dha_external_id"]),
            models.Index(fields=["intervention_code"]),
        ]

    def __str__(self) -> str:  # pragma: no cover - trivial
        return f"DHA Rx {self.dha_external_id or self.pk} ({self.status})"


class SHARemittance(FacilityScopedModel):
    """
    SHA remittance (payment batch) received from DHA.

    Represents a single bank transfer from SHA to the facility,
    retrieved via GET /api/v1/claims/remittances.
    """

    class RemittanceStatus(models.TextChoices):
        RECEIVED = "received", "Received"
        RECONCILING = "reconciling", "Reconciling"
        RECONCILED = "reconciled", "Reconciled"
        PARTIAL = "partial", "Partially Reconciled"

    id = models.BigAutoField(primary_key=True)

    bank_reference = models.CharField(
        max_length=100,
        unique=True,
        help_text="Unique bank transfer reference from SHA",
    )
    payment_date = models.DateField(
        help_text="Date the payment was made by SHA",
    )
    total_amount = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        help_text="Total amount of this remittance",
    )
    claims_count = models.IntegerField(
        default=0,
        help_text="Number of claims paid in this remittance",
    )
    status = models.CharField(
        max_length=15,
        choices=RemittanceStatus.choices,
        default=RemittanceStatus.RECEIVED,
    )

    # Tracking
    fetched_at = models.DateTimeField(
        auto_now_add=True,
        help_text="When this remittance was pulled from DHA",
    )
    reconciled_at = models.DateTimeField(
        null=True,
        blank=True,
        help_text="When reconciliation was completed",
    )

    # Raw DHA response
    dha_payload = models.JSONField(
        default=dict,
        blank=True,
        help_text="Raw response from DHA getRemittances endpoint",
    )

    class Meta:
        verbose_name = "SHA Remittance"
        verbose_name_plural = "SHA Remittances"
        ordering = ["-payment_date"]
        indexes = [
            models.Index(fields=["bank_reference"]),
            models.Index(fields=["payment_date"]),
            models.Index(fields=["status"]),
        ]

    def __str__(self):
        return f"Remittance {self.bank_reference} ({self.total_amount})"

    @property
    def reconciled_amount(self) -> Decimal:
        """Total amount reconciled (matched to local claims)."""
        return self.lines.filter(claim__isnull=False).aggregate(total=models.Sum("paid_amount"))[
            "total"
        ] or Decimal("0.00")

    @property
    def unreconciled_amount(self) -> Decimal:
        """Amount not yet matched to local claims."""
        return self.total_amount - self.reconciled_amount


class SHARemittanceLine(models.Model):
    """
    Individual claim payment within a remittance.

    Retrieved via GET /api/v1/claims/remittances/{bank_reference}/claims.
    Links DHA claim payment to local SHAClaim for reconciliation.
    """

    id = models.BigAutoField(primary_key=True)

    remittance = models.ForeignKey(
        SHARemittance,
        on_delete=models.CASCADE,
        related_name="lines",
    )
    claim = models.ForeignKey(
        "billing.SHAClaim",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="remittance_lines",
        help_text="Matched local claim (null if unreconciled)",
    )

    # DHA fields
    dha_claim_id = models.CharField(
        max_length=100,
        help_text="DHA-side claim identifier",
    )
    paid_amount = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        help_text="Amount paid for this claim",
    )
    payment_status = models.CharField(
        max_length=30,
        blank=True,
        help_text="DHA payment status (e.g. PAID, PARTIAL)",
    )

    # Reconciliation
    is_reconciled = models.BooleanField(
        default=False,
        help_text="Whether this line has been matched to a local claim",
    )
    reconciled_at = models.DateTimeField(
        null=True,
        blank=True,
    )

    # Raw data
    dha_payload = models.JSONField(
        default=dict,
        blank=True,
        help_text="Raw claim data from DHA",
    )

    class Meta:
        verbose_name = "SHA Remittance Line"
        verbose_name_plural = "SHA Remittance Lines"
        ordering = ["-paid_amount"]
        indexes = [
            models.Index(fields=["dha_claim_id"]),
            models.Index(fields=["is_reconciled"]),
        ]

    def __str__(self):
        return f"Line {self.dha_claim_id} ({self.paid_amount})"
