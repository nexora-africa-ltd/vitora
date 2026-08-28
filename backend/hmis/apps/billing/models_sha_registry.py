# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""Billing models sha registry for Vitora HMIS.

What this file is for:
- Implement models sha registry logic for the billing domain.

How to use it:
- Import classes and functions from this module in Django app code and tests.

Supported inputs/args:
- Python imports and Django ORM/runtime inputs; no standalone CLI arguments.
"""

from datetime import date, timedelta

from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import models
from django.utils import timezone

from hmis.apps.core.pii import encrypted_pii_property


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
    # NOTE: sha_number is the SHA *membership* number (format: SHA-XXXXXXXXXX).
    # It is NOT the Client Registry number (CR number, format: CR{digits}-{digit})
    # used as ``patient_id`` in ILM API calls.  The CR number lives on
    # Patient.cr_number and is obtained from the ILM eligibility response
    # field ``memberCrNumber``.
    sha_number = models.CharField(
        max_length=20, unique=True, help_text="SHA member number (format: SHA-XXXXXXXXXX)"
    )
    national_id_encrypted = models.TextField(
        default="", blank=True, help_text="Encrypted Kenya National ID linked to SHA"
    )
    national_id_hmac = models.CharField(
        max_length=64,
        default="",
        blank=True,
        db_index=True,
        help_text="HMAC blind-index for national ID lookups",
    )
    national_id = encrypted_pii_property("national_id")

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
            models.Index(fields=["national_id_hmac"]),
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

    def get_ineligibility_reason(self) -> str:
        """Return a concrete reason when the member is currently ineligible."""
        today = date.today()

        if self.status != self.MembershipStatus.ACTIVE:
            return f"membership status is {self.get_status_display()}"

        if self.coverage_end_date and self.coverage_end_date < today:
            return f"coverage expired on {self.coverage_end_date.isoformat()}"

        if self.eligibility_valid_until and self.eligibility_valid_until < today:
            return f"eligibility validity expired on {self.eligibility_valid_until.isoformat()}"

        return "member not currently eligible"

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
        return f"Not Eligible ({self.get_ineligibility_reason()})"


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
