# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""Billing models sha claim core for Vitora HMIS.

What this file is for:
- Implement models sha claim core logic for the billing domain.

How to use it:
- Import classes and functions from this module in Django app code and tests.

Supported inputs/args:
- Python imports and Django ORM/runtime inputs; no standalone CLI arguments.
"""

from datetime import date, datetime, timedelta
from decimal import Decimal

from django.apps import apps
from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import models
from django.utils import timezone

from hmis.apps.billing.document_types import (
    dha_document_type_to_local_attachment_type,
    normalize_local_attachment_type,
)
from hmis.apps.billing.models_finance import InvoiceItem
from hmis.apps.billing.models_sha_registry import SHATariff
from hmis.apps.core.mixins import FacilityScopedModel


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
        CANCELLED = "cancelled", "Cancelled"

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

    # Diagnosis (ICD-11)
    primary_diagnosis_code = models.CharField(
        max_length=10, help_text="Primary ICD-11 diagnosis code"
    )
    primary_diagnosis_description = models.CharField(max_length=255)
    secondary_diagnosis_codes = models.JSONField(
        default=list, blank=True, help_text="List of secondary ICD-11 diagnosis codes"
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
    facility_code = models.CharField(
        max_length=50,
        help_text="DHA Facility Registry (FR) code — used in FHIR bundles and claim submissions. "
        "Resolved from billing_config.sha_facility_fr_code > dha_fr_code > settings fallback.",
    )
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
    dha_invoice_number = models.CharField(
        max_length=64,
        blank=True,
        default="",
        help_text="DHA-side invoice number from ILM preview (e.g. INV/12345/67890)",
    )
    dha_discharge_snapshot = models.JSONField(
        default=dict,
        blank=True,
        help_text=(
            "Compact discharge-time DHA payload snapshot (status, totals, key identifiers) "
            "captured for audit/reporting."
        ),
    )
    previewed_at = models.DateTimeField(
        null=True,
        blank=True,
        help_text="When the provider preview was last requested (required before submit)",
    )

    class Meta:
        verbose_name = "SHA Claim"
        verbose_name_plural = "SHA Claims"
        ordering = ["-created_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["facility", "claim_number"],
                name="unique_claim_number_per_facility",
            ),
        ]
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
            self.claim_number = self.generate_claim_number(facility=self.facility)
        # Auto-resolve facility from encounter if not explicitly set
        if not self.facility_id and self.encounter_id:
            try:
                enc = self.encounter
                if enc.facility_id:
                    self.facility_id = enc.facility_id
            except (
                AttributeError,
                TypeError,
                ValueError,
                RuntimeError,
                OSError,
                AssertionError,
                ImportError,
            ):  # noqa: S110
                pass  # Encounter may not be loaded yet during migrations
        # Backfill facility_code from facility FK if not set.
        # Priority: billing_config.sha_facility_fr_code > dha_fr_code > mfl_code (last resort)
        if self.facility and not self.facility_code:
            fr_code = None
            try:
                bc = getattr(self.facility, "billing_config", None)
                if bc:
                    fr_code = getattr(bc, "sha_facility_fr_code", None) or None
            except (
                AttributeError,
                TypeError,
                ValueError,
                RuntimeError,
                OSError,
                AssertionError,
                ImportError,
            ):
                fr_code = None
            if not fr_code:
                fr_code = getattr(self.facility, "dha_fr_code", None) or None
            self.facility_code = fr_code or getattr(self.facility, "mfl_code", "") or ""
        # Backfill facility_level from facility FK if not set
        if self.facility and not self.facility_level:
            level_raw = getattr(self.facility, "level", "") or ""
            # Normalize to "L{n}" format expected by SHATariff.TariffLevel choices
            if level_raw and not str(level_raw).upper().startswith("L"):
                level_raw = f"L{level_raw}"
            self.facility_level = level_raw
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

    @classmethod
    def generate_claim_number(cls, facility=None) -> str:
        """Generate unique claim number in format CLM-YYYYMMDD-XXXX."""
        today = date.today()
        date_str = today.strftime("%Y%m%d")
        prefix = f"CLM-{date_str}-"

        # Facility scoping: only look for the highest number within this facility
        qs = cls.objects.filter(claim_number__startswith=prefix)
        if facility:
            qs = qs.filter(facility=facility)
        last_claim = qs.order_by("-claim_number").first()

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
            errors.append(f"Member not eligible: {self.sha_member.get_ineligibility_reason()}")

        # Inpatient claims must be discharged before submission.
        # Discharge metadata is populated by the ILM discharge workflow.
        if self.claim_type == self.ClaimType.INPATIENT and not self.discharge_date:
            errors.append(
                "Inpatient claim requires discharge completion before submission. "
                "Use the Discharge panel to finalize discharge first."
            )

        # Check has items
        if not self.items.exists():
            errors.append("Claim must have at least one item")

        # Check all items have tariff codes
        items_without_tariff = self.items.filter(tariff__isnull=True)
        if items_without_tariff.exists():
            count = items_without_tariff.count()
            errors.append(f"{count} item(s) missing SHA tariff code")

        pending_allocations = self.items.filter(
            allocation_status=SHAClaimItem.AllocationStatus.PENDING
        )
        if pending_allocations.exists():
            errors.append(
                f"{pending_allocations.count()} item(s) require payer allocation review "
                "(SHA / patient / discount split)."
            )

        # Check required attachments. Clinical notes are always required.
        # Provider invoice is optional for outpatient capitation interventions.
        required_types = ["clinical_notes"]
        if self.requires_invoice_attachment:
            required_types.append("invoice")
        existing_types = list(self.attachments.values_list("attachment_type", flat=True))
        for req_type in required_types:
            if req_type not in existing_types:
                errors.append(f"Missing required attachment: {req_type}")

        # Check intervention-specific document types (DHA HIE spec)
        missing_docs = self.missing_document_types
        if missing_docs:
            for entry in missing_docs:
                code = entry["intervention_code"]
                for doc_type in entry["missing"]:
                    errors.append(f"Missing required document '{doc_type}' for intervention {code}")

        # Check per-diem interventions have a tariff for this facility's KEPH level
        from django.conf import settings as django_settings

        facility_level_str = getattr(django_settings, "FACILITY_LEVEL", "L3")
        keph_level_num = int(facility_level_str.replace("L", "")) if facility_level_str else 3
        active_interventions = self.claim_interventions.filter(
            status=SHAClaimIntervention.InterventionStatus.ACTIVE,
        )
        for intervention in active_interventions:
            if intervention.is_per_diem:
                tariff = intervention.tariff_for_level(keph_level_num)
                if not tariff:
                    errors.append(
                        f"Per-diem intervention {intervention.intervention_code} has no "
                        f"tariff defined for facility level {facility_level_str}. "
                        f"Cannot compute per-diem billing."
                    )

        # Check consent token for SHIF-flow claims (non-emergency)
        if self.claim_flow == self.ClaimFlow.SHIF and not self.is_emergency_claim:
            consent_token_model = apps.get_model("billing", "ConsentToken")
            has_valid_consent = (
                self.dha_visit_started_at is not None
                or consent_token_model.objects.filter(
                    encounter=self.encounter,
                    status="VALIDATED",
                ).exists()
            )
            if not has_valid_consent:
                errors.append(
                    "SHIF claims require a validated consent token (OTP or biometric). "
                    "Please complete the Start Visit flow before submitting."
                )

        # Check claimed amount is positive
        if self.claimed_amount <= Decimal("0.00"):
            errors.append("Claimed amount must be greater than zero")

        # Check claim has been previewed at least once (DHA UAT requirement)
        if not self.previewed_at:
            errors.append(
                "Claim must be previewed before submission. Call the preview endpoint first."
            )

        # Check all preauths on this claim are approved (DHA UAT requirement)
        pending_preauths = self.preauths.filter(
            status__in=["draft", "submitted"],
        )
        if pending_preauths.exists():
            pending_codes = ", ".join(p.intervention_code for p in pending_preauths[:5])
            errors.append(
                f"All pre-authorizations must be approved before submission. "
                f"Pending/submitted preauths: {pending_codes}"
            )

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

    @property
    def is_outpatient_capitation_claim(self) -> bool:
        """Return True when this claim is outpatient capitation workflow."""
        if self.claim_type != self.ClaimType.OUTPATIENT:
            return False

        flow = str(self.claim_flow or "").strip().lower()
        if flow != self.ClaimFlow.PHC:
            return False

        capitation_interventions = self.claim_interventions.filter(
            status=SHAClaimIntervention.InterventionStatus.ACTIVE,
            payment_mechanism=SHAClaimIntervention.PaymentMechanism.CAPITATION,
        )
        if capitation_interventions.exists():
            return True

        capitation_code_q = models.Q(intervention_code__startswith="SHA-12-") | models.Q(
            intervention_code__in=["SHA-08-001", "SHA-08-002", "SHA-08-003"]
        )
        if (
            self.claim_interventions.filter(status=SHAClaimIntervention.InterventionStatus.ACTIVE)
            .filter(capitation_code_q)
            .exists()
        ):
            return True

        tariff_code_q = models.Q(tariff__code__startswith="SHA-12-") | models.Q(
            tariff__code__in=["SHA-08-001", "SHA-08-002", "SHA-08-003"]
        )
        return self.items.filter(tariff__isnull=False).filter(tariff_code_q).exists()

    @property
    def requires_invoice_attachment(self) -> bool:
        """Return True when invoice attachment is required for submission."""
        return not self.is_outpatient_capitation_claim

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

    # ------------------------------------------------------------------
    # Document-type enforcement (DHA HIE spec compliance)
    # ------------------------------------------------------------------

    @property
    def missing_document_types(self) -> list[dict]:
        """
        Return list of missing required document types per intervention.

        Per the DHA HIE spec, each intervention has a `document_types` array
        listing required documents. Submission must be blocked if any are missing.

        Returns:
            List of dicts: [{"intervention_code": "SHA-07-001", "missing": ["MEDICAL_REPORT"]}]
        """
        missing = []
        existing_types = {
            normalize_local_attachment_type(value)
            for value in self.attachments.values_list("attachment_type", flat=True)
        }
        for intervention in self.claim_interventions.all():
            required = intervention.required_document_types
            if not required:
                continue
            not_uploaded = []
            for document_type in required:
                normalized_local = dha_document_type_to_local_attachment_type(document_type)
                if normalized_local not in existing_types:
                    not_uploaded.append(document_type)
            if not_uploaded:
                missing.append(
                    {
                        "intervention_code": intervention.intervention_code,
                        "intervention_name": intervention.intervention_name,
                        "missing": not_uploaded,
                    }
                )
        return missing

    # ------------------------------------------------------------------
    # Time-barring deadline (DHA spec compliance)
    # ------------------------------------------------------------------

    @property
    def time_barring_deadline(self) -> datetime | None:
        """
        Compute the submission deadline based on DHA time-barring rules.

        Rules:
        - Emergency claims (ECCIF): 24 hours from service_date
        - Standard claims with pending attachments (QUERY status): 14 days from
          when the query was raised (approximated by updated_at when status=query)
        - All other draft/validated claims: no hard deadline (return None)

        Returns:
            datetime deadline or None if no time limit applies.
        """
        if self.is_emergency_claim or self.claim_type == self.ClaimType.EMERGENCY:
            # 24-hour window from service date for emergency claims
            service_dt = datetime.combine(self.service_date, datetime.min.time())
            return timezone.make_aware(service_dt) + timedelta(hours=24)

        if self.status == self.ClaimStatus.QUERY:
            # 14-day window from when query was raised
            return self.updated_at + timedelta(days=14)

        return None

    @property
    def is_time_barred(self) -> bool:
        """Check if claim has exceeded its time-barring deadline."""
        deadline = self.time_barring_deadline
        if deadline is None:
            return False
        return timezone.now() > deadline

    @property
    def hours_until_time_barred(self) -> float | None:
        """Hours remaining until time-barring, or None if no deadline."""
        deadline = self.time_barring_deadline
        if deadline is None:
            return None
        delta = deadline - timezone.now()
        return max(0, delta.total_seconds() / 3600)


class SHAClaimIntervention(models.Model):
    """
    Intervention added to a DHA HIE virtual claim.

    Tracks each intervention added via the ILM /api/v1/claims/interventions
    endpoint, including the required `document_types` returned by the HIE.
    Used to enforce document-type completeness before claim submission.

    Lifecycle: ACTIVE → RETIRED (can be RESTORED back to ACTIVE)
    """

    class InterventionStatus(models.TextChoices):
        ACTIVE = "active", "Active"
        RETIRED = "retired", "Retired"

    id = models.BigAutoField(primary_key=True)

    claim = models.ForeignKey(
        SHAClaim,
        on_delete=models.CASCADE,
        related_name="claim_interventions",
    )

    # Intervention identification
    intervention_code = models.CharField(
        max_length=20,
        help_text="SHA intervention code (e.g., SHA-07-001)",
    )
    intervention_name = models.CharField(
        max_length=255,
        blank=True,
        help_text="Human-readable intervention name from HIE response",
    )
    benefit_code = models.CharField(
        max_length=10,
        blank=True,
        help_text="Parent benefit package code (e.g., SHA-07)",
    )

    # Status
    status = models.CharField(
        max_length=10,
        choices=InterventionStatus.choices,
        default=InterventionStatus.ACTIVE,
    )
    preview_missing_streak = models.PositiveSmallIntegerField(
        default=0,
        help_text="Consecutive preview reconciliations where this intervention code was absent",
    )
    last_seen_in_preview_at = models.DateTimeField(
        null=True,
        blank=True,
        help_text="Last time this intervention code appeared in DHA preview payload",
    )
    auto_retired_by_omission = models.BooleanField(
        default=False,
        help_text="True when intervention was soft-retired after repeated omission from preview",
    )

    # Document types required by SHA for this intervention
    # Populated from the HIE response's `document_types` field
    required_document_types = models.JSONField(
        default=list,
        blank=True,
        help_text="Required document types from DHA (e.g., ['MEDICAL_REPORT', 'LAB_REPORT'])",
    )

    # DHA-side metadata
    dha_intervention_id = models.CharField(
        max_length=64,
        blank=True,
        help_text="ID returned by HIE for this intervention on the claim",
    )
    tariff_amount = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        null=True,
        blank=True,
        help_text="Tariff amount for this intervention per HIE response",
    )

    # -------------------------------------------------------------------------
    # DHA Routing Flags (from GET /api/v1/patients/benefits/interventions)
    # These determine which scenario flow applies (per-diem vs FFS, preauth
    # type, elective vs normal, inpatient vs outpatient).
    # -------------------------------------------------------------------------
    class PaymentMechanism(models.TextChoices):
        PER_DIEM = "PER_DIEM", "Per Diem"
        FEE_FOR_SERVICE = "FEE_FOR_SERVICE", "Fee for Service"
        CAPITATION = "CAPITATION", "Capitation"

    class AccessPoint(models.TextChoices):
        IP = "IP", "Inpatient"
        OP = "OP", "Outpatient"
        BOTH = "BOTH", "Both"

    payment_mechanism = models.CharField(
        max_length=20,
        choices=PaymentMechanism.choices,
        blank=True,
        help_text="PER_DIEM, FEE_FOR_SERVICE, or CAPITATION — drives billing flow",
    )
    access_point = models.CharField(
        max_length=4,
        choices=AccessPoint.choices,
        blank=True,
        help_text="IP (inpatient), OP (outpatient), or BOTH",
    )
    needs_preauth = models.BooleanField(
        default=False,
        help_text="True if this intervention requires pre-authorization",
    )
    needs_manual_preauth_approval = models.BooleanField(
        default=False,
        help_text="True if elective preauth (doctor approval required before visit)",
    )

    # Preauth type flags (mutually exclusive — normal if all false)
    is_surgical_preauth = models.BooleanField(default=False)
    is_renal_preauth = models.BooleanField(default=False)
    is_oncology_preauth = models.BooleanField(default=False)
    is_imaging_preauth = models.BooleanField(default=False)
    is_optical_preauth = models.BooleanField(default=False)

    # Fund / scheme metadata from ILM interventions payload
    fund = models.CharField(
        max_length=128,
        blank=True,
        help_text="Top-level fund label from ILM interventions payload",
    )
    intervention_fund = models.CharField(
        max_length=128,
        blank=True,
        help_text="Intervention-specific fund label from ILM payload",
    )
    supported_scheme = models.CharField(
        max_length=128,
        blank=True,
        help_text="Supported scheme label from ILM payload",
    )
    schemes = models.JSONField(
        default=list,
        blank=True,
        help_text="Applicable schemes from ILM payload",
    )
    intervention_payload = models.JSONField(
        default=dict,
        blank=True,
        help_text="Raw ILM intervention payload preserved for future metadata needs",
    )

    # Hospital Level Tariffs (per KEPH level)
    level2_tariff = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    level3_tariff = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    level4_tariff = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    level5_tariff = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    level6_tariff = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)

    # Audit
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "SHA Claim Intervention"
        verbose_name_plural = "SHA Claim Interventions"
        ordering = ["claim", "created_at"]
        unique_together = [("claim", "intervention_code")]
        indexes = [
            models.Index(fields=["claim", "status"]),
            models.Index(fields=["intervention_code"]),
        ]

    def __str__(self):
        return f"{self.claim.claim_number} - {self.intervention_code} ({self.get_status_display()})"

    @property
    def preauth_type(self) -> str:
        """Derive the preauth form type from DHA flags."""
        if self.is_surgical_preauth:
            return "surgical"
        if self.is_renal_preauth:
            return "renal"
        if self.is_oncology_preauth:
            return "oncology"
        if self.is_imaging_preauth:
            return "imaging"
        if self.is_optical_preauth:
            return "optical"
        return "normal"

    @property
    def is_per_diem(self) -> bool:
        return self.payment_mechanism == self.PaymentMechanism.PER_DIEM

    @property
    def is_elective_preauth(self) -> bool:
        return self.needs_preauth and self.needs_manual_preauth_approval

    def tariff_for_level(self, keph_level: int):
        """Return the tariff ceiling for the given KEPH level (2-6)."""
        mapping = {
            2: self.level2_tariff,
            3: self.level3_tariff,
            4: self.level4_tariff,
            5: self.level5_tariff,
            6: self.level6_tariff,
        }
        return mapping.get(keph_level, self.tariff_amount)

    def retire(self) -> None:
        """Mark intervention as retired."""
        self.status = self.InterventionStatus.RETIRED
        self.auto_retired_by_omission = False
        self.save(update_fields=["status", "auto_retired_by_omission", "updated_at"])

    def restore(self) -> None:
        """Restore a retired intervention."""
        self.status = self.InterventionStatus.ACTIVE
        self.preview_missing_streak = 0
        self.auto_retired_by_omission = False
        self.save(
            update_fields=[
                "status",
                "preview_missing_streak",
                "auto_retired_by_omission",
                "updated_at",
            ]
        )


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

    class AllocationStatus(models.TextChoices):
        """Whether payer split for this line is final."""

        PENDING = "pending", "Pending Allocation Review"
        RESOLVED = "resolved", "Allocation Resolved"

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
    sha_covered_amount = models.DecimalField(
        max_digits=12, decimal_places=2, default=Decimal("0.00")
    )
    patient_payable_amount = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        default=Decimal("0.00"),
    )
    discount_amount = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal("0.00"))
    discount_reason = models.TextField(blank=True)
    discount_applied_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        related_name="sha_claim_item_discounts_applied",
        null=True,
        blank=True,
    )
    discount_applied_at = models.DateTimeField(null=True, blank=True)
    allocation_status = models.CharField(
        max_length=16,
        choices=AllocationStatus.choices,
        default=AllocationStatus.RESOLVED,
    )
    is_preview_line = models.BooleanField(
        default=False,
        help_text="True when this claim line originates from DHA preview apply",
    )

    # Adjudication results
    status = models.CharField(max_length=20, choices=ItemStatus.choices, default=ItemStatus.PENDING)
    approved_quantity = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    approved_amount = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    rejection_reason = models.CharField(max_length=255, blank=True)

    # Audit
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    # LOINC codes for interoperability (FHIR Observation / SHA lab claims)
    loinc_code = models.CharField(
        max_length=20,
        blank=True,
        default="",
        help_text="Order-level LOINC code (from TestCatalog) for the test ordered",
    )
    result_loinc_code = models.CharField(
        max_length=20,
        blank=True,
        default="",
        help_text="Result-level LOINC code (from LabResult) for the specific observation",
    )

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

        claimed_amount = Decimal(self.claimed_amount or 0).quantize(Decimal("0.01"))
        sha_covered = Decimal(self.sha_covered_amount or 0).quantize(Decimal("0.01"))
        patient_payable = Decimal(self.patient_payable_amount or 0).quantize(Decimal("0.01"))
        discount = Decimal(self.discount_amount or 0).quantize(Decimal("0.01"))
        split_total = (sha_covered + patient_payable + discount).quantize(Decimal("0.01"))

        if (
            self.claimed_amount is not None
            and sha_covered == Decimal("0.00")
            and patient_payable == Decimal("0.00")
            and discount == Decimal("0.00")
            and self.allocation_status == self.AllocationStatus.RESOLVED
        ):
            self.sha_covered_amount = claimed_amount
        elif (
            split_total != claimed_amount
            and self.allocation_status == self.AllocationStatus.RESOLVED
        ):
            # Keep patient and discount amounts stable where possible, and rebalance
            # the SHA-covered portion to preserve allocation integrity.
            remainder_for_sha = (claimed_amount - patient_payable - discount).quantize(
                Decimal("0.01")
            )
            if remainder_for_sha >= Decimal("0.00"):
                self.sha_covered_amount = remainder_for_sha
            else:
                remaining_after_discount = (claimed_amount - discount).quantize(Decimal("0.01"))
                if remaining_after_discount >= Decimal("0.00"):
                    self.patient_payable_amount = remaining_after_discount
                    self.sha_covered_amount = Decimal("0.00")
                else:
                    self.discount_amount = claimed_amount
                    self.patient_payable_amount = Decimal("0.00")
                    self.sha_covered_amount = Decimal("0.00")

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

        if self.sha_covered_amount < 0:
            errors["sha_covered_amount"] = "SHA covered amount cannot be negative"

        if self.patient_payable_amount < 0:
            errors["patient_payable_amount"] = "Patient payable amount cannot be negative"

        if self.discount_amount < 0:
            errors["discount_amount"] = "Discount amount cannot be negative"

        if self.discount_amount > 0 and not str(self.discount_reason or "").strip():
            errors["discount_reason"] = (
                "Discount reason is required when discount amount is applied"
            )

        split_total = (
            Decimal(self.sha_covered_amount or 0)
            + Decimal(self.patient_payable_amount or 0)
            + Decimal(self.discount_amount or 0)
        ).quantize(Decimal("0.01"))
        claimed_amount = Decimal(self.claimed_amount or 0).quantize(Decimal("0.01"))
        if split_total != claimed_amount:
            errors["allocation"] = (
                "Line allocation mismatch: "
                "sha_covered_amount + patient_payable_amount + discount_amount "
                "must equal claimed_amount"
            )

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
        if self.allocation_status == self.AllocationStatus.RESOLVED:
            self.sha_covered_amount = self.claimed_amount
            self.patient_payable_amount = Decimal("0.00")
            self.discount_amount = Decimal("0.00")
            self.discount_reason = ""
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
            sha_covered_amount=(invoice_item.quantity * unit_price).quantize(Decimal("0.01")),
            patient_payable_amount=Decimal("0.00"),
            discount_amount=Decimal("0.00"),
            allocation_status=cls.AllocationStatus.RESOLVED,
            is_preview_line=False,
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
        MEDICAL_REPORT = "medical_report", "Medical Report"
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
