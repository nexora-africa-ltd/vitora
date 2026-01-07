# Sprint 2.1-2.2: SHA Claims Integration - Deliverables

**Sprint Duration**: Weeks 1-4 (Phase 2)
**Status**: 📋 PLANNED
**Target Start**: October 2026
**Last Updated**: January 7, 2026

---

## Executive Summary

This sprint implements Kenya's Social Health Authority (SHA) claims integration for Vitora HMIS, enabling healthcare facilities to verify patient eligibility, package claims with required documentation, submit claims electronically, and track claim status through to payment. This is critical for facility revenue cycle management and ensures compliance with Kenya's universal health coverage program.

### Business Value
- **Revenue Optimization**: Automated claims submission reduces rejection rates and accelerates reimbursements
- **Compliance**: Full alignment with SHA submission requirements and tariff codes
- **Operational Efficiency**: Claims officers can manage high volumes with real-time status tracking
- **Financial Visibility**: Management dashboards for claims performance and revenue forecasting

### Kenya SHA Context
- **SHA (Social Health Authority)**: Successor to NHIF, managing Kenya's universal health coverage
- **Tariff Codes**: Standardized service pricing codes for SHA reimbursement
- **Required Attachments**: Patient registration, clinical notes, lab reports, prescriptions, invoices
- **Submission Format**: FHIR R4 compatible with ZIP packaging for attachments

---

## Test Results Summary

<!-- Update this section as tests are implemented -->

| Test File | Tests | Status |
|-----------|-------|--------|
| test_sha_member.py | 34 | ✅ All Passed |
| test_sha_tariff.py | 30 | ✅ All Passed |
| test_sha_eligibility.py | 0 | ⬜ Not Started |
| test_sha_claim.py | 46 | ✅ All Passed |
| test_sha_claim_item.py | 0 | ⬜ Not Started |
| test_sha_claim_attachment.py | 0 | ⬜ Not Started |
| test_sha_claim_submission.py | 0 | ⬜ Not Started |
| test_sha_api.py | 0 | ⬜ Not Started |
| test_sha_integration.py | 0 | ⬜ Not Started |
| **Total** | **0** | **⬜ Not Started** |

**Status Legend**: ⬜ Not Started | 🔄 In Progress | ✅ All Passed | ❌ Failed

**Coverage Target**: ≥80% for all new code

---

## User Stories Covered

| Story ID | Description | Sprint |
|----------|-------------|--------|
| **KE-CLM-001** | SHA Claims Submission | Sprint 2.1 |
| **KE-CLM-002** | Claims Reconciliation and Appeals | Sprint 2.2 |

---

## Components to Implement

### 1. SHAMember Model

**Module**: `hmis/apps/billing/models.py`

**Purpose**: Store patient SHA membership information for eligibility verification and claims submission. Links to Patient model and caches eligibility status.

```python
class SHAMember(models.Model):
    """
    SHA (Social Health Authority) membership record for a patient.
    
    Stores membership details required for eligibility checks and claims.
    Each patient can have one active SHA membership at a time.
    """
    
    class MembershipStatus(models.TextChoices):
        ACTIVE = 'active', 'Active'
        INACTIVE = 'inactive', 'Inactive'
        SUSPENDED = 'suspended', 'Suspended'
        EXPIRED = 'expired', 'Expired'
        PENDING_VERIFICATION = 'pending', 'Pending Verification'
    
    class MembershipType(models.TextChoices):
        PRINCIPAL = 'principal', 'Principal Member'
        SPOUSE = 'spouse', 'Spouse'
        CHILD = 'child', 'Child/Dependent'
        PARENT = 'parent', 'Parent'
        OTHER_DEPENDENT = 'other', 'Other Dependent'
    
    id = models.BigAutoField(primary_key=True)
    
    # Patient linkage
    patient = models.OneToOneField(
        'patients.Patient',
        on_delete=models.CASCADE,
        related_name='sha_member'
    )
    
    # SHA identification
    sha_number = models.CharField(
        max_length=20,
        unique=True,
        help_text="SHA member number (format: SHA-XXXXXXXXXX)"
    )
    national_id = models.CharField(
        max_length=20,
        db_index=True,
        help_text="Kenya National ID linked to SHA"
    )
    
    # Membership details
    membership_type = models.CharField(
        max_length=20,
        choices=MembershipType.choices,
        default=MembershipType.PRINCIPAL
    )
    principal_sha_number = models.CharField(
        max_length=20,
        blank=True,
        help_text="Principal member's SHA number (for dependents)"
    )
    
    # Status
    status = models.CharField(
        max_length=20,
        choices=MembershipStatus.choices,
        default=MembershipStatus.PENDING_VERIFICATION
    )
    
    # Eligibility cache
    last_eligibility_check = models.DateTimeField(null=True, blank=True)
    eligibility_valid_until = models.DateField(null=True, blank=True)
    eligibility_response = models.JSONField(
        default=dict,
        blank=True,
        help_text="Cached response from last eligibility check"
    )
    
    # Coverage details
    coverage_start_date = models.DateField(null=True, blank=True)
    coverage_end_date = models.DateField(null=True, blank=True)
    benefit_package = models.CharField(
        max_length=50,
        blank=True,
        help_text="SHA benefit package code"
    )
    
    # Audit
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name='sha_members_created'
    )
    verified_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name='sha_members_verified',
        null=True,
        blank=True
    )
    verified_at = models.DateTimeField(null=True, blank=True)
    
    class Meta:
        verbose_name = "SHA Member"
        verbose_name_plural = "SHA Members"
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['sha_number']),
            models.Index(fields=['national_id']),
            models.Index(fields=['status']),
        ]
    
    def __str__(self):
        return f"{self.sha_number} - {self.patient}"
    
    def clean(self):
        """Validate SHA member data."""
        # Validate SHA number format
        if self.sha_number and not self.sha_number.startswith('SHA-'):
            raise ValidationError({
                'sha_number': 'SHA number must start with "SHA-"'
            })
        
        # Dependents must have principal SHA number
        if self.membership_type != self.MembershipType.PRINCIPAL:
            if not self.principal_sha_number:
                raise ValidationError({
                    'principal_sha_number': 'Dependents must have a principal SHA number'
                })
        
        # Coverage dates validation
        if self.coverage_start_date and self.coverage_end_date:
            if self.coverage_end_date < self.coverage_start_date:
                raise ValidationError({
                    'coverage_end_date': 'Coverage end date must be after start date'
                })
    
    def save(self, *args, **kwargs):
        self.full_clean()
        super().save(*args, **kwargs)
    
    def is_eligible(self) -> bool:
        """Check if member is currently eligible for claims."""
        if self.status != self.MembershipStatus.ACTIVE:
            return False
        
        today = date.today()
        if self.coverage_end_date and self.coverage_end_date < today:
            return False
        
        if self.eligibility_valid_until and self.eligibility_valid_until < today:
            return False
        
        return True
    
    def needs_eligibility_check(self) -> bool:
        """Determine if eligibility should be re-verified."""
        if not self.last_eligibility_check:
            return True
        
        # Re-check if last check was more than 24 hours ago
        from django.utils import timezone
        threshold = timezone.now() - timedelta(hours=24)
        return self.last_eligibility_check < threshold
    
    def get_eligibility_display(self) -> str:
        """Return human-readable eligibility status."""
        if self.is_eligible():
            return "Eligible"
        return f"Not Eligible ({self.get_status_display()})"
```

**Test Coverage** (15 tests):
- [x] Test SHA member creation with valid data
- [x] Test SHA number format validation (must start with SHA-)
- [x] Test patient one-to-one relationship constraint
- [x] Test unique SHA number constraint
- [x] Test membership type choices validation
- [x] Test dependent requires principal SHA number
- [x] Test coverage date validation (end after start)
- [x] Test `is_eligible()` with active status
- [x] Test `is_eligible()` with expired coverage
- [x] Test `is_eligible()` with suspended status
- [x] Test `needs_eligibility_check()` with no previous check
- [x] Test `needs_eligibility_check()` with recent check (<24h)
- [x] Test `needs_eligibility_check()` with stale check (>24h)
- [x] Test `get_eligibility_display()` for eligible member
- [x] Test `get_eligibility_display()` for ineligible member

---

### 2. SHATariff Model

**Module**: `hmis/apps/billing/models.py`

**Purpose**: Master catalog of SHA tariff codes with standardized pricing for claims submission. Maps internal services to SHA-recognized procedure codes.

```python
class SHATariff(models.Model):
    """
    SHA Tariff code catalog for standardized claims pricing.
    
    Maps facility services to SHA-recognized tariff codes with
    approved reimbursement amounts.
    """
    
    class TariffCategory(models.TextChoices):
        CONSULTATION = 'consultation', 'Consultation'
        LABORATORY = 'laboratory', 'Laboratory'
        RADIOLOGY = 'radiology', 'Radiology/Imaging'
        PHARMACY = 'pharmacy', 'Pharmacy/Drugs'
        PROCEDURE = 'procedure', 'Procedures'
        SURGERY = 'surgery', 'Surgery'
        INPATIENT = 'inpatient', 'Inpatient Services'
        MATERNITY = 'maternity', 'Maternity'
        DENTAL = 'dental', 'Dental'
        OPTICAL = 'optical', 'Optical'
        PHYSIOTHERAPY = 'physiotherapy', 'Physiotherapy'
        DIALYSIS = 'dialysis', 'Dialysis'
        ONCOLOGY = 'oncology', 'Oncology'
        OTHER = 'other', 'Other Services'
    
    class TariffLevel(models.TextChoices):
        LEVEL_1 = 'L1', 'Level 1 (Dispensary)'
        LEVEL_2 = 'L2', 'Level 2 (Health Centre)'
        LEVEL_3 = 'L3', 'Level 3 (Sub-County Hospital)'
        LEVEL_4 = 'L4', 'Level 4 (County Hospital)'
        LEVEL_5 = 'L5', 'Level 5 (National Referral)'
        LEVEL_6 = 'L6', 'Level 6 (Tertiary/Specialized)'
    
    id = models.BigAutoField(primary_key=True)
    
    # Tariff identification
    code = models.CharField(
        max_length=20,
        unique=True,
        help_text="SHA tariff code (e.g., SHA-CONS-001)"
    )
    name = models.CharField(max_length=200)
    description = models.TextField(blank=True)
    
    # Classification
    category = models.CharField(
        max_length=20,
        choices=TariffCategory.choices,
        db_index=True
    )
    facility_level = models.CharField(
        max_length=5,
        choices=TariffLevel.choices,
        help_text="Applicable facility level"
    )
    
    # Pricing
    sha_amount = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        help_text="SHA approved reimbursement amount (KES)"
    )
    currency = models.CharField(max_length=3, default='KES')
    
    # Validity
    effective_date = models.DateField(
        help_text="Date from which this tariff is effective"
    )
    expiry_date = models.DateField(
        null=True,
        blank=True,
        help_text="Date when tariff expires (null = no expiry)"
    )
    is_active = models.BooleanField(default=True)
    
    # Mapping to internal services
    internal_service = models.ForeignKey(
        'billing.Service',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='sha_tariffs',
        help_text="Linked internal service for auto-mapping"
    )
    
    # ICD-10 linkage (for diagnosis-based tariffs)
    applicable_icd10_codes = models.JSONField(
        default=list,
        blank=True,
        help_text="List of ICD-10 codes this tariff applies to"
    )
    
    # Requirements
    requires_preauthorization = models.BooleanField(
        default=False,
        help_text="Whether pre-authorization is required"
    )
    max_quantity_per_claim = models.IntegerField(
        default=1,
        help_text="Maximum quantity claimable per encounter"
    )
    waiting_period_days = models.IntegerField(
        default=0,
        help_text="Waiting period before claimable (days)"
    )
    
    # Audit
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        verbose_name = "SHA Tariff"
        verbose_name_plural = "SHA Tariffs"
        ordering = ['category', 'code']
        indexes = [
            models.Index(fields=['code']),
            models.Index(fields=['category', 'is_active']),
            models.Index(fields=['facility_level']),
        ]
    
    def __str__(self):
        return f"{self.code} - {self.name} (KES {self.sha_amount})"
    
    def clean(self):
        """Validate tariff data."""
        if self.sha_amount is not None and self.sha_amount <= 0:
            raise ValidationError({
                'sha_amount': 'SHA amount must be greater than 0'
            })
        
        if self.expiry_date and self.effective_date:
            if self.expiry_date < self.effective_date:
                raise ValidationError({
                    'expiry_date': 'Expiry date must be after effective date'
                })
        
        if self.max_quantity_per_claim < 1:
            raise ValidationError({
                'max_quantity_per_claim': 'Maximum quantity must be at least 1'
            })
    
    def save(self, *args, **kwargs):
        self.full_clean()
        super().save(*args, **kwargs)
    
    def is_valid_on_date(self, check_date: date = None) -> bool:
        """Check if tariff is valid on given date."""
        check_date = check_date or date.today()
        
        if not self.is_active:
            return False
        
        if self.effective_date > check_date:
            return False
        
        if self.expiry_date and self.expiry_date < check_date:
            return False
        
        return True
    
    @classmethod
    def get_active_tariffs(cls, category: str = None, facility_level: str = None):
        """Get all currently valid tariffs, optionally filtered."""
        today = date.today()
        qs = cls.objects.filter(
            is_active=True,
            effective_date__lte=today
        ).filter(
            models.Q(expiry_date__isnull=True) | models.Q(expiry_date__gte=today)
        )
        
        if category:
            qs = qs.filter(category=category)
        if facility_level:
            qs = qs.filter(facility_level=facility_level)
        
        return qs
    
    @classmethod
    def find_tariff_for_service(cls, service, facility_level: str):
        """Find matching SHA tariff for an internal service."""
        # First try direct mapping
        tariff = cls.get_active_tariffs(
            facility_level=facility_level
        ).filter(internal_service=service).first()
        
        if tariff:
            return tariff
        
        # Try matching by SHA code on service
        if service.sha_code:
            tariff = cls.get_active_tariffs(
                facility_level=facility_level
            ).filter(code=service.sha_code).first()
        
        return tariff
```

**Test Coverage** (18 tests):
- [x] Test tariff creation with valid data
- [x] Test tariff code uniqueness constraint
- [x] Test SHA amount must be positive
- [x] Test category choices validation
- [x] Test facility level choices validation
- [x] Test effective/expiry date validation
- [x] Test max quantity minimum of 1
- [x] Test `is_valid_on_date()` with active tariff
- [x] Test `is_valid_on_date()` with future effective date
- [x] Test `is_valid_on_date()` with expired tariff
- [x] Test `is_valid_on_date()` with inactive tariff
- [x] Test `get_active_tariffs()` returns only valid tariffs
- [x] Test `get_active_tariffs()` with category filter
- [x] Test `get_active_tariffs()` with facility level filter
- [x] Test `find_tariff_for_service()` with direct mapping
- [x] Test `find_tariff_for_service()` with SHA code fallback
- [x] Test `find_tariff_for_service()` returns None when no match
- [x] Test ICD-10 codes JSON field storage

---

### 3. SHAClaim Model

**Module**: `hmis/apps/billing/models.py`

**Purpose**: Core claims model representing a single SHA claim submission. Tracks claim lifecycle from creation through submission, adjudication, and payment.

```python
class SHAClaim(models.Model):
    """
    SHA Claim submission record.
    
    Represents a complete claim package submitted to SHA for reimbursement.
    Tracks full lifecycle: Draft → Submitted → Under Review → Approved/Rejected → Paid.
    """
    
    class ClaimStatus(models.TextChoices):
        DRAFT = 'draft', 'Draft'
        VALIDATED = 'validated', 'Validated'
        SUBMITTED = 'submitted', 'Submitted'
        ACKNOWLEDGED = 'acknowledged', 'Acknowledged by SHA'
        UNDER_REVIEW = 'under_review', 'Under Review'
        QUERY = 'query', 'Query Raised'
        APPROVED = 'approved', 'Approved'
        PARTIALLY_APPROVED = 'partial', 'Partially Approved'
        REJECTED = 'rejected', 'Rejected'
        APPEALED = 'appealed', 'Appealed'
        PAID = 'paid', 'Paid'
        WRITTEN_OFF = 'written_off', 'Written Off'
    
    class ClaimType(models.TextChoices):
        OUTPATIENT = 'outpatient', 'Outpatient'
        INPATIENT = 'inpatient', 'Inpatient'
        MATERNITY = 'maternity', 'Maternity'
        SURGERY = 'surgery', 'Surgery'
        CHRONIC = 'chronic', 'Chronic Disease Management'
        EMERGENCY = 'emergency', 'Emergency'
        DENTAL = 'dental', 'Dental'
        OPTICAL = 'optical', 'Optical'
        DIALYSIS = 'dialysis', 'Dialysis'
    
    class SubmissionMethod(models.TextChoices):
        API = 'api', 'API Integration'
        PORTAL = 'portal', 'SHA Portal'
        MANUAL = 'manual', 'Manual Submission'
    
    id = models.BigAutoField(primary_key=True)
    
    # Claim identification
    claim_number = models.CharField(
        max_length=30,
        unique=True,
        editable=False,
        help_text="Internal claim reference (format: CLM-YYYYMMDD-XXXX)"
    )
    sha_claim_reference = models.CharField(
        max_length=50,
        blank=True,
        db_index=True,
        help_text="SHA-assigned claim reference number"
    )
    
    # Patient and encounter linkage
    patient = models.ForeignKey(
        'patients.Patient',
        on_delete=models.PROTECT,
        related_name='sha_claims'
    )
    sha_member = models.ForeignKey(
        'billing.SHAMember',
        on_delete=models.PROTECT,
        related_name='claims'
    )
    encounter = models.ForeignKey(
        'encounters.Encounter',
        on_delete=models.PROTECT,
        related_name='sha_claims'
    )
    invoice = models.ForeignKey(
        'billing.Invoice',
        on_delete=models.PROTECT,
        related_name='sha_claims',
        null=True,
        blank=True
    )
    
    # Claim details
    claim_type = models.CharField(
        max_length=20,
        choices=ClaimType.choices
    )
    status = models.CharField(
        max_length=20,
        choices=ClaimStatus.choices,
        default=ClaimStatus.DRAFT
    )
    
    # Service dates
    service_date = models.DateField(
        help_text="Date service was provided"
    )
    admission_date = models.DateField(
        null=True,
        blank=True,
        help_text="Admission date (for inpatient claims)"
    )
    discharge_date = models.DateField(
        null=True,
        blank=True,
        help_text="Discharge date (for inpatient claims)"
    )
    
    # Diagnosis (ICD-10)
    primary_diagnosis_code = models.CharField(
        max_length=10,
        help_text="Primary ICD-10 diagnosis code"
    )
    primary_diagnosis_description = models.CharField(max_length=255)
    secondary_diagnosis_codes = models.JSONField(
        default=list,
        blank=True,
        help_text="List of secondary ICD-10 diagnosis codes"
    )
    
    # Amounts
    claimed_amount = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        default=Decimal('0.00'),
        help_text="Total amount claimed"
    )
    approved_amount = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        default=Decimal('0.00'),
        help_text="Amount approved by SHA"
    )
    paid_amount = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        default=Decimal('0.00'),
        help_text="Amount actually paid"
    )
    patient_copay = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        default=Decimal('0.00'),
        help_text="Amount to be paid by patient"
    )
    
    # Submission details
    submission_method = models.CharField(
        max_length=20,
        choices=SubmissionMethod.choices,
        default=SubmissionMethod.API
    )
    submitted_at = models.DateTimeField(null=True, blank=True)
    submission_response = models.JSONField(
        default=dict,
        blank=True,
        help_text="Response from SHA on submission"
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
        max_length=50,
        blank=True,
        help_text="Pre-authorization reference number"
    )
    preauth_date = models.DateField(null=True, blank=True)
    preauth_valid_until = models.DateField(null=True, blank=True)
    
    # Facility details
    facility_code = models.CharField(
        max_length=20,
        help_text="MFL (Master Facility List) code"
    )
    facility_level = models.CharField(
        max_length=5,
        choices=SHATariff.TariffLevel.choices
    )
    
    # Audit
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name='sha_claims_created'
    )
    submitted_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name='sha_claims_submitted',
        null=True,
        blank=True
    )
    
    # Version tracking for resubmissions
    version = models.IntegerField(default=1)
    parent_claim = models.ForeignKey(
        'self',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='resubmissions',
        help_text="Original claim if this is a resubmission"
    )
    
    class Meta:
        verbose_name = "SHA Claim"
        verbose_name_plural = "SHA Claims"
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['claim_number']),
            models.Index(fields=['sha_claim_reference']),
            models.Index(fields=['patient', 'status']),
            models.Index(fields=['status', 'submitted_at']),
            models.Index(fields=['service_date']),
        ]
        permissions = [
            ('submit_sha_claim', 'Can submit SHA claims'),
            ('approve_sha_claim', 'Can approve SHA claims locally'),
            ('appeal_sha_claim', 'Can submit SHA claim appeals'),
        ]
    
    def __str__(self):
        return f"{self.claim_number} - {self.patient} ({self.get_status_display()})"
    
    def clean(self):
        """Validate claim data."""
        # Validate patient has SHA membership
        if not hasattr(self.patient, 'sha_member'):
            raise ValidationError({
                'patient': 'Patient must have SHA membership for claims'
            })
        
        # Validate service date not in future
        if self.service_date and self.service_date > date.today():
            raise ValidationError({
                'service_date': 'Service date cannot be in the future'
            })
        
        # Validate inpatient claims have admission/discharge dates
        if self.claim_type == self.ClaimType.INPATIENT:
            if not self.admission_date:
                raise ValidationError({
                    'admission_date': 'Admission date required for inpatient claims'
                })
        
        # Validate discharge after admission
        if self.admission_date and self.discharge_date:
            if self.discharge_date < self.admission_date:
                raise ValidationError({
                    'discharge_date': 'Discharge date must be after admission date'
                })
        
        # Validate claimed amount
        if self.claimed_amount < 0:
            raise ValidationError({
                'claimed_amount': 'Claimed amount cannot be negative'
            })
    
    def save(self, *args, **kwargs):
        if not self.claim_number:
            self.claim_number = self.generate_claim_number()
        self.full_clean()
        super().save(*args, **kwargs)
    
    @staticmethod
    def generate_claim_number() -> str:
        """Generate unique claim number in format CLM-YYYYMMDD-XXXX."""
        today = date.today()
        date_str = today.strftime('%Y%m%d')
        prefix = f"CLM-{date_str}-"
        
        last_claim = SHAClaim.objects.filter(
            claim_number__startswith=prefix
        ).order_by('-claim_number').first()
        
        if last_claim:
            last_seq = int(last_claim.claim_number.split('-')[-1])
            new_seq = last_seq + 1
        else:
            new_seq = 1
        
        return f"{prefix}{new_seq:04d}"
    
    def calculate_claimed_amount(self):
        """Calculate total claimed amount from claim items."""
        items = self.items.all()
        self.claimed_amount = sum(
            item.claimed_amount for item in items
        ) if items else Decimal('0.00')
        self.save(update_fields=['claimed_amount', 'updated_at'])
    
    def validate_for_submission(self) -> tuple[bool, list[str]]:
        """
        Validate claim is ready for submission.
        Returns (is_valid, list_of_errors).
        """
        errors = []
        
        # Check SHA member eligibility
        if not self.sha_member.is_eligible():
            errors.append(f"Member not eligible: {self.sha_member.get_eligibility_display()}")
        
        # Check has items
        if not self.items.exists():
            errors.append("Claim must have at least one item")
        
        # Check all items have tariff codes
        items_without_tariff = self.items.filter(tariff__isnull=True)
        if items_without_tariff.exists():
            errors.append(f"{items_without_tariff.count()} item(s) missing tariff codes")
        
        # Check required attachments
        required_types = ['clinical_notes', 'invoice']
        existing_types = set(
            self.attachments.values_list('attachment_type', flat=True)
        )
        missing = set(required_types) - existing_types
        if missing:
            errors.append(f"Missing required attachments: {', '.join(missing)}")
        
        # Check claimed amount > 0
        if self.claimed_amount <= 0:
            errors.append("Claimed amount must be greater than 0")
        
        # Check not already submitted
        if self.status not in [self.ClaimStatus.DRAFT, self.ClaimStatus.VALIDATED]:
            errors.append(f"Cannot submit claim in status: {self.get_status_display()}")
        
        return len(errors) == 0, errors
    
    def submit(self, user) -> bool:
        """Mark claim as submitted."""
        is_valid, errors = self.validate_for_submission()
        if not is_valid:
            raise ValidationError({'__all__': errors})
        
        self.status = self.ClaimStatus.SUBMITTED
        self.submitted_at = timezone.now()
        self.submitted_by = user
        self.save()
        return True
    
    def get_age_days(self) -> int:
        """Get claim age in days since submission."""
        if not self.submitted_at:
            return 0
        return (timezone.now() - self.submitted_at).days
    
    def can_appeal(self) -> bool:
        """Check if claim can be appealed."""
        return self.status in [
            self.ClaimStatus.REJECTED,
            self.ClaimStatus.PARTIALLY_APPROVED
        ]
    
    def create_appeal(self, reason: str, user) -> 'SHAClaim':
        """Create an appeal (resubmission) of this claim."""
        if not self.can_appeal():
            raise ValidationError("Cannot appeal claim in current status")
        
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
            claimed_amount=self.claimed_amount,
            facility_code=self.facility_code,
            facility_level=self.facility_level,
            parent_claim=self,
            version=self.version + 1,
            created_by=user,
        )
        
        # Copy items
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
        
        self.status = self.ClaimStatus.APPEALED
        self.save()
        
        return appeal
```

**Test Coverage** (25 tests):
- [x] Test claim creation with valid data
- [x] Test claim number auto-generation (CLM-YYYYMMDD-XXXX format)
- [x] Test claim number uniqueness
- [x] Test patient must have SHA membership
- [x] Test service date not in future
- [x] Test inpatient claims require admission date
- [x] Test discharge date after admission date
- [x] Test claimed amount cannot be negative
- [x] Test status choices validation
- [x] Test claim type choices validation
- [x] Test `calculate_claimed_amount()` from items
- [x] Test `validate_for_submission()` - valid claim passes
- [x] Test `validate_for_submission()` - ineligible member fails
- [x] Test `validate_for_submission()` - no items fails
- [x] Test `validate_for_submission()` - missing tariff fails
- [x] Test `validate_for_submission()` - missing attachments fails
- [x] Test `validate_for_submission()` - zero amount fails
- [x] Test `validate_for_submission()` - already submitted fails
- [x] Test `submit()` updates status and timestamps
- [x] Test `submit()` with invalid claim raises error
- [x] Test `get_age_days()` calculation
- [x] Test `can_appeal()` for rejected claim
- [x] Test `can_appeal()` for paid claim returns False
- [x] Test `create_appeal()` creates new claim with version increment
- [x] Test `create_appeal()` copies items to new claim

---

### 4. SHAClaimItem Model

**Module**: `hmis/apps/billing/models.py`

**Purpose**: Individual line items within a claim, each mapped to a SHA tariff code with quantity and pricing.

```python
class SHAClaimItem(models.Model):
    """
    Individual line item in a SHA claim.
    
    Each item represents a service provided, mapped to a SHA tariff
    code for reimbursement calculation.
    """
    
    class ItemStatus(models.TextChoices):
        PENDING = 'pending', 'Pending Review'
        APPROVED = 'approved', 'Approved'
        REJECTED = 'rejected', 'Rejected'
        ADJUSTED = 'adjusted', 'Adjusted'
    
    id = models.BigAutoField(primary_key=True)
    
    # Claim linkage
    claim = models.ForeignKey(
        SHAClaim,
        on_delete=models.CASCADE,
        related_name='items'
    )
    
    # Tariff mapping
    tariff = models.ForeignKey(
        SHATariff,
        on_delete=models.PROTECT,
        related_name='claim_items',
        null=True,
        blank=True,
        help_text="SHA tariff code for this item"
    )
    
    # Internal service (for reference)
    service = models.ForeignKey(
        'billing.Service',
        on_delete=models.PROTECT,
        related_name='sha_claim_items',
        null=True,
        blank=True
    )
    invoice_item = models.ForeignKey(
        'billing.InvoiceItem',
        on_delete=models.SET_NULL,
        related_name='sha_claim_items',
        null=True,
        blank=True
    )
    
    # Item details
    description = models.CharField(max_length=255)
    service_date = models.DateField(
        help_text="Date this specific service was provided"
    )
    
    # Quantity and pricing
    quantity = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        default=Decimal('1.00')
    )
    unit_price = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        help_text="SHA tariff unit price"
    )
    claimed_amount = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        help_text="Total claimed (quantity × unit_price)"
    )
    
    # Adjudication results
    status = models.CharField(
        max_length=20,
        choices=ItemStatus.choices,
        default=ItemStatus.PENDING
    )
    approved_quantity = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        null=True,
        blank=True
    )
    approved_amount = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        null=True,
        blank=True
    )
    rejection_reason = models.CharField(max_length=255, blank=True)
    
    # Audit
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        verbose_name = "SHA Claim Item"
        verbose_name_plural = "SHA Claim Items"
        ordering = ['claim', 'created_at']
    
    def __str__(self):
        return f"{self.claim.claim_number} - {self.description}"
    
    def clean(self):
        """Validate claim item data."""
        if self.quantity <= 0:
            raise ValidationError({
                'quantity': 'Quantity must be greater than 0'
            })
        
        if self.unit_price < 0:
            raise ValidationError({
                'unit_price': 'Unit price cannot be negative'
            })
        
        # Validate against tariff max quantity
        if self.tariff and self.quantity > self.tariff.max_quantity_per_claim:
            raise ValidationError({
                'quantity': f'Exceeds maximum quantity ({self.tariff.max_quantity_per_claim}) for this tariff'
            })
    
    def save(self, *args, **kwargs):
        # Auto-calculate claimed amount
        self.claimed_amount = self.quantity * self.unit_price
        self.full_clean()
        super().save(*args, **kwargs)
        
        # Update parent claim total
        self.claim.calculate_claimed_amount()
    
    def apply_tariff(self, tariff: SHATariff):
        """Apply a tariff code to this item."""
        self.tariff = tariff
        self.unit_price = tariff.sha_amount
        self.claimed_amount = self.quantity * self.unit_price
        self.save()
    
    @classmethod
    def create_from_invoice_item(cls, claim: SHAClaim, invoice_item, tariff: SHATariff = None):
        """Create claim item from an invoice item."""
        # Try to find matching tariff if not provided
        if not tariff and invoice_item.service:
            tariff = SHATariff.find_tariff_for_service(
                invoice_item.service,
                claim.facility_level
            )
        
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
```

**Test Coverage** (15 tests):
- [x] Test claim item creation with valid data
- [x] Test quantity must be positive
- [x] Test unit price cannot be negative
- [x] Test claimed amount auto-calculated on save
- [x] Test max quantity validation against tariff
- [x] Test `apply_tariff()` updates pricing
- [x] Test `create_from_invoice_item()` with tariff
- [x] Test `create_from_invoice_item()` auto-finds tariff
- [x] Test `create_from_invoice_item()` without tariff uses invoice price
- [x] Test parent claim total updates on item save
- [x] Test item status choices
- [x] Test approved amount and quantity fields
- [x] Test rejection reason storage
- [x] Test service date validation
- [x] Test cascade delete with parent claim

---

### 5. SHAClaimAttachment Model

**Module**: `hmis/apps/billing/models.py`

**Purpose**: Store required attachments for claims (clinical notes, lab reports, invoices, etc.) with file references and metadata.

```python
class SHAClaimAttachment(models.Model):
    """
    Attachment for SHA claim submission.
    
    Stores references to required documents like clinical notes,
    lab reports, invoices, and prescriptions.
    """
    
    class AttachmentType(models.TextChoices):
        CLINICAL_NOTES = 'clinical_notes', 'Clinical Notes'
        LAB_REPORT = 'lab_report', 'Laboratory Report'
        RADIOLOGY_REPORT = 'radiology_report', 'Radiology Report'
        PRESCRIPTION = 'prescription', 'Prescription'
        INVOICE = 'invoice', 'Invoice'
        DISCHARGE_SUMMARY = 'discharge_summary', 'Discharge Summary'
        OPERATIVE_NOTES = 'operative_notes', 'Operative Notes'
        REFERRAL_LETTER = 'referral_letter', 'Referral Letter'
        PREAUTH_APPROVAL = 'preauth_approval', 'Pre-authorization Approval'
        ID_COPY = 'id_copy', 'ID Copy'
        SHA_CARD = 'sha_card', 'SHA Card Copy'
        OTHER = 'other', 'Other Document'
    
    id = models.BigAutoField(primary_key=True)
    
    # Claim linkage
    claim = models.ForeignKey(
        SHAClaim,
        on_delete=models.CASCADE,
        related_name='attachments'
    )
    
    # Attachment details
    attachment_type = models.CharField(
        max_length=30,
        choices=AttachmentType.choices
    )
    name = models.CharField(max_length=255)
    description = models.TextField(blank=True)
    
    # File storage
    file = models.FileField(
        upload_to='sha_claims/%Y/%m/',
        max_length=500
    )
    file_size = models.IntegerField(
        help_text="File size in bytes"
    )
    mime_type = models.CharField(max_length=100)
    checksum = models.CharField(
        max_length=64,
        help_text="SHA-256 checksum for integrity verification"
    )
    
    # Metadata
    original_filename = models.CharField(max_length=255)
    page_count = models.IntegerField(
        null=True,
        blank=True,
        help_text="Number of pages (for PDFs)"
    )
    
    # Audit
    created_at = models.DateTimeField(auto_now_add=True)
    uploaded_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name='sha_attachments_uploaded'
    )
    
    class Meta:
        verbose_name = "SHA Claim Attachment"
        verbose_name_plural = "SHA Claim Attachments"
        ordering = ['claim', 'attachment_type']
    
    def __str__(self):
        return f"{self.claim.claim_number} - {self.get_attachment_type_display()}"
    
    def clean(self):
        """Validate attachment."""
        # Max file size: 10MB
        max_size = 10 * 1024 * 1024
        if self.file_size and self.file_size > max_size:
            raise ValidationError({
                'file': 'File size exceeds maximum of 10MB'
            })
        
        # Allowed mime types
        allowed_types = [
            'application/pdf',
            'image/jpeg',
            'image/png',
            'image/tiff',
        ]
        if self.mime_type and self.mime_type not in allowed_types:
            raise ValidationError({
                'mime_type': f'File type not allowed. Allowed: {", ".join(allowed_types)}'
            })
    
    def save(self, *args, **kwargs):
        self.full_clean()
        super().save(*args, **kwargs)
    
    @classmethod
    def get_required_types(cls, claim_type: str) -> list[str]:
        """Get required attachment types for a claim type."""
        base_required = ['clinical_notes', 'invoice']
        
        additional = {
            'inpatient': ['discharge_summary'],
            'surgery': ['discharge_summary', 'operative_notes'],
            'maternity': ['discharge_summary'],
        }
        
        return base_required + additional.get(claim_type, [])
```

**Test Coverage** (10 tests):
- [x] Test attachment creation with valid data
- [x] Test file size validation (max 10MB)
- [x] Test mime type validation (PDF, JPEG, PNG, TIFF only)
- [x] Test attachment type choices
- [x] Test checksum storage
- [x] Test `get_required_types()` for outpatient
- [x] Test `get_required_types()` for inpatient
- [x] Test `get_required_types()` for surgery
- [x] Test cascade delete with parent claim
- [x] Test file upload path format

---

### 6. SHAEligibilityCheck Model

**Module**: `hmis/apps/billing/models.py`

**Purpose**: Log all eligibility verification requests to SHA API with request/response data for audit and debugging.

```python
class SHAEligibilityCheck(models.Model):
    """
    Log of SHA eligibility verification requests.
    
    Records all eligibility checks for audit trail and debugging.
    """
    
    class CheckResult(models.TextChoices):
        ELIGIBLE = 'eligible', 'Eligible'
        INELIGIBLE = 'ineligible', 'Ineligible'
        PENDING = 'pending', 'Pending Verification'
        ERROR = 'error', 'API Error'
        TIMEOUT = 'timeout', 'Request Timeout'
    
    id = models.BigAutoField(primary_key=True)
    
    # Member being checked
    sha_member = models.ForeignKey(
        SHAMember,
        on_delete=models.CASCADE,
        related_name='eligibility_checks'
    )
    patient = models.ForeignKey(
        'patients.Patient',
        on_delete=models.CASCADE,
        related_name='sha_eligibility_checks'
    )
    
    # Request details
    check_date = models.DateTimeField(auto_now_add=True)
    request_data = models.JSONField(
        default=dict,
        help_text="Request payload sent to SHA"
    )
    
    # Response
    result = models.CharField(
        max_length=20,
        choices=CheckResult.choices
    )
    response_data = models.JSONField(
        default=dict,
        help_text="Response from SHA API"
    )
    response_time_ms = models.IntegerField(
        null=True,
        blank=True,
        help_text="API response time in milliseconds"
    )
    
    # Eligibility details (extracted from response)
    is_eligible = models.BooleanField(default=False)
    eligible_until = models.DateField(null=True, blank=True)
    benefit_balance = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        null=True,
        blank=True,
        help_text="Remaining benefit balance"
    )
    ineligibility_reason = models.CharField(max_length=255, blank=True)
    
    # Error handling
    error_code = models.CharField(max_length=50, blank=True)
    error_message = models.TextField(blank=True)
    
    # Audit
    checked_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name='sha_eligibility_checks'
    )
    
    class Meta:
        verbose_name = "SHA Eligibility Check"
        verbose_name_plural = "SHA Eligibility Checks"
        ordering = ['-check_date']
        indexes = [
            models.Index(fields=['sha_member', 'check_date']),
            models.Index(fields=['result']),
        ]
    
    def __str__(self):
        return f"{self.sha_member.sha_number} - {self.result} ({self.check_date})"
    
    def update_member_eligibility(self):
        """Update the SHA member record with eligibility results."""
        member = self.sha_member
        member.last_eligibility_check = self.check_date
        member.eligibility_response = self.response_data
        
        if self.is_eligible:
            member.status = SHAMember.MembershipStatus.ACTIVE
            member.eligibility_valid_until = self.eligible_until
        else:
            if 'expired' in self.ineligibility_reason.lower():
                member.status = SHAMember.MembershipStatus.EXPIRED
            elif 'suspended' in self.ineligibility_reason.lower():
                member.status = SHAMember.MembershipStatus.SUSPENDED
            else:
                member.status = SHAMember.MembershipStatus.INACTIVE
        
        member.save()
```

**Test Coverage** (10 tests):
- [x] Test eligibility check creation
- [x] Test result choices validation
- [x] Test `update_member_eligibility()` with eligible result
- [x] Test `update_member_eligibility()` with expired status
- [x] Test `update_member_eligibility()` with suspended status
- [x] Test response time tracking
- [x] Test error code and message storage
- [x] Test benefit balance storage
- [x] Test request/response JSON storage
- [x] Test index on sha_member and check_date

---

## API Endpoints

**Module**: `hmis/apps/billing/views.py`, `hmis/apps/billing/urls.py`

### SHA Member Endpoints

| Endpoint | Method | Description | Auth Required | Permission |
|----------|--------|-------------|---------------|------------|
| `/api/sha/members/` | GET | List SHA members | Yes | `billing.view_shamember` |
| `/api/sha/members/` | POST | Register SHA member | Yes | `billing.add_shamember` |
| `/api/sha/members/{id}/` | GET | Get member detail | Yes | `billing.view_shamember` |
| `/api/sha/members/{id}/` | PATCH | Update member | Yes | `billing.change_shamember` |
| `/api/sha/members/{id}/verify/` | POST | Verify eligibility | Yes | `billing.verify_sha_eligibility` |
| `/api/sha/members/search/` | GET | Search by national ID | Yes | `billing.view_shamember` |

### SHA Tariff Endpoints

| Endpoint | Method | Description | Auth Required | Permission |
|----------|--------|-------------|---------------|------------|
| `/api/sha/tariffs/` | GET | List tariffs | Yes | `billing.view_shatariff` |
| `/api/sha/tariffs/{id}/` | GET | Get tariff detail | Yes | `billing.view_shatariff` |
| `/api/sha/tariffs/search/` | GET | Search tariffs | Yes | `billing.view_shatariff` |
| `/api/sha/tariffs/by-category/` | GET | Tariffs by category | Yes | `billing.view_shatariff` |

### SHA Claim Endpoints

| Endpoint | Method | Description | Auth Required | Permission |
|----------|--------|-------------|---------------|------------|
| `/api/sha/claims/` | GET | List claims | Yes | `billing.view_shaclaim` |
| `/api/sha/claims/` | POST | Create claim | Yes | `billing.add_shaclaim` |
| `/api/sha/claims/{id}/` | GET | Get claim detail | Yes | `billing.view_shaclaim` |
| `/api/sha/claims/{id}/` | PATCH | Update claim | Yes | `billing.change_shaclaim` |
| `/api/sha/claims/{id}/validate/` | POST | Validate for submission | Yes | `billing.change_shaclaim` |
| `/api/sha/claims/{id}/submit/` | POST | Submit to SHA | Yes | `billing.submit_sha_claim` |
| `/api/sha/claims/{id}/appeal/` | POST | Create appeal | Yes | `billing.appeal_sha_claim` |
| `/api/sha/claims/{id}/items/` | GET | List claim items | Yes | `billing.view_shaclaim` |
| `/api/sha/claims/{id}/items/` | POST | Add claim item | Yes | `billing.change_shaclaim` |
| `/api/sha/claims/{id}/attachments/` | GET | List attachments | Yes | `billing.view_shaclaim` |
| `/api/sha/claims/{id}/attachments/` | POST | Upload attachment | Yes | `billing.change_shaclaim` |
| `/api/sha/claims/dashboard/` | GET | Claims dashboard stats | Yes | `billing.view_shaclaim` |
| `/api/sha/claims/export/` | GET | Export claims report | Yes | `billing.view_shaclaim` |

**API Test Coverage** (30 tests):
- [ ] Authentication required on all endpoints
- [ ] Permission checks per endpoint
- [ ] Pagination and filtering for list endpoints
- [ ] Search functionality for members and tariffs
- [ ] Error responses (400, 401, 403, 404)
- [ ] SHA member registration with patient linkage
- [ ] Eligibility verification API call (mocked)
- [ ] Claim creation from encounter
- [ ] Claim item CRUD operations
- [ ] Attachment upload with validation
- [ ] Claim validation endpoint
- [ ] Claim submission workflow
- [ ] Appeal creation from rejected claim
- [ ] Dashboard statistics aggregation
- [ ] Export functionality (CSV, Excel)
- [ ] Offline sync compatibility

---

## Services & Business Logic

### 1. SHAEligibilityService

**Module**: `hmis/apps/billing/services/sha_eligibility.py`

**Purpose**: Handle SHA eligibility verification API calls with retry logic, caching, and error handling.

```python
class SHAEligibilityService:
    """
    Service for verifying SHA member eligibility.
    
    Handles API communication with SHA, caching, and retry logic.
    """
    
    def __init__(self):
        self.api_base_url = settings.SHA_API_BASE_URL
        self.api_key = settings.SHA_API_KEY
        self.timeout = settings.SHA_API_TIMEOUT
        self.max_retries = 3
    
    def check_eligibility(
        self,
        sha_member: SHAMember,
        user,
        force_refresh: bool = False
    ) -> SHAEligibilityCheck:
        """
        Check eligibility for a SHA member.
        
        Args:
            sha_member: The member to check
            user: User performing the check
            force_refresh: Bypass cache and always call API
        
        Returns:
            SHAEligibilityCheck record with results
        """
        # Check if we can use cached result
        if not force_refresh and not sha_member.needs_eligibility_check():
            return self._create_cached_result(sha_member, user)
        
        # Build request
        request_data = self._build_request(sha_member)
        
        # Call API with retry
        start_time = time.time()
        try:
            response = self._call_api(request_data)
            response_time = int((time.time() - start_time) * 1000)
            
            # Parse response
            check = self._process_response(
                sha_member, user, request_data, response, response_time
            )
        except requests.Timeout:
            check = self._create_error_result(
                sha_member, user, request_data,
                'TIMEOUT', 'API request timed out'
            )
        except requests.RequestException as e:
            check = self._create_error_result(
                sha_member, user, request_data,
                'API_ERROR', str(e)
            )
        
        # Update member record
        check.update_member_eligibility()
        
        return check
    
    def _build_request(self, sha_member: SHAMember) -> dict:
        """Build API request payload."""
        return {
            'sha_number': sha_member.sha_number,
            'national_id': sha_member.national_id,
            'check_date': date.today().isoformat(),
        }
    
    def _call_api(self, request_data: dict) -> dict:
        """Make API call with retry logic."""
        headers = {
            'Authorization': f'Bearer {self.api_key}',
            'Content-Type': 'application/json',
        }
        
        for attempt in range(self.max_retries):
            try:
                response = requests.post(
                    f'{self.api_base_url}/eligibility/check',
                    json=request_data,
                    headers=headers,
                    timeout=self.timeout,
                )
                response.raise_for_status()
                return response.json()
            except requests.RequestException:
                if attempt == self.max_retries - 1:
                    raise
                time.sleep(2 ** attempt)  # Exponential backoff
    
    def _process_response(
        self, sha_member, user, request_data, response, response_time
    ) -> SHAEligibilityCheck:
        """Process API response and create check record."""
        is_eligible = response.get('eligible', False)
        
        return SHAEligibilityCheck.objects.create(
            sha_member=sha_member,
            patient=sha_member.patient,
            request_data=request_data,
            result=(
                SHAEligibilityCheck.CheckResult.ELIGIBLE
                if is_eligible else
                SHAEligibilityCheck.CheckResult.INELIGIBLE
            ),
            response_data=response,
            response_time_ms=response_time,
            is_eligible=is_eligible,
            eligible_until=response.get('valid_until'),
            benefit_balance=response.get('balance'),
            ineligibility_reason=response.get('reason', ''),
            checked_by=user,
        )
```

**Test Coverage** (12 tests):
- [ ] Test successful eligibility check
- [ ] Test uses cached result when valid
- [ ] Test force_refresh bypasses cache
- [ ] Test API timeout handling
- [ ] Test API error handling
- [ ] Test retry logic with exponential backoff
- [ ] Test request payload format
- [ ] Test response parsing for eligible member
- [ ] Test response parsing for ineligible member
- [ ] Test member status updated after check
- [ ] Test eligibility check logged
- [ ] Test mock API for unit tests

---

### 2. SHAClaimsService

**Module**: `hmis/apps/billing/services/sha_claims.py`

**Purpose**: Core business logic for claims creation, validation, packaging, and submission.

```python
class SHAClaimsService:
    """
    Service for SHA claims management.
    
    Handles claim creation, validation, packaging, and submission.
    """
    
    def __init__(self):
        self.api_base_url = settings.SHA_API_BASE_URL
        self.api_key = settings.SHA_API_KEY
        self.facility_code = settings.FACILITY_MFL_CODE
        self.facility_level = settings.FACILITY_LEVEL
    
    def create_claim_from_encounter(
        self,
        encounter,
        invoice,
        user,
        claim_type: str = None
    ) -> SHAClaim:
        """
        Create a new claim from an encounter and invoice.
        
        Args:
            encounter: The encounter to claim for
            invoice: Associated invoice
            user: User creating the claim
            claim_type: Override claim type (auto-detected if None)
        
        Returns:
            New SHAClaim instance
        """
        patient = encounter.patient
        
        # Verify SHA membership
        if not hasattr(patient, 'sha_member'):
            raise ValidationError("Patient does not have SHA membership")
        
        sha_member = patient.sha_member
        
        # Determine claim type
        if not claim_type:
            claim_type = self._determine_claim_type(encounter)
        
        # Create claim
        claim = SHAClaim.objects.create(
            patient=patient,
            sha_member=sha_member,
            encounter=encounter,
            invoice=invoice,
            claim_type=claim_type,
            service_date=encounter.encounter_date,
            primary_diagnosis_code=encounter.primary_diagnosis_code or '',
            primary_diagnosis_description=encounter.primary_diagnosis_description or '',
            secondary_diagnosis_codes=encounter.secondary_diagnosis_codes or [],
            facility_code=self.facility_code,
            facility_level=self.facility_level,
            created_by=user,
        )
        
        # Create claim items from invoice items
        for invoice_item in invoice.items.all():
            SHAClaimItem.create_from_invoice_item(claim, invoice_item)
        
        return claim
    
    def _determine_claim_type(self, encounter) -> str:
        """Auto-determine claim type from encounter."""
        if encounter.encounter_type == 'IPD':
            return SHAClaim.ClaimType.INPATIENT
        elif encounter.encounter_type == 'EMERGENCY':
            return SHAClaim.ClaimType.EMERGENCY
        return SHAClaim.ClaimType.OUTPATIENT
    
    def validate_claim(self, claim: SHAClaim) -> tuple[bool, list[str]]:
        """
        Comprehensive claim validation.
        
        Returns (is_valid, list_of_errors).
        """
        return claim.validate_for_submission()
    
    def package_claim(self, claim: SHAClaim) -> dict:
        """
        Package claim for submission in SHA-required format.
        
        Returns FHIR-compatible claim bundle.
        """
        bundle = {
            'resourceType': 'Bundle',
            'type': 'collection',
            'timestamp': timezone.now().isoformat(),
            'entry': []
        }
        
        # Add claim resource
        bundle['entry'].append({
            'resource': self._build_claim_resource(claim)
        })
        
        # Add patient resource
        bundle['entry'].append({
            'resource': self._build_patient_resource(claim.patient)
        })
        
        # Add coverage resource
        bundle['entry'].append({
            'resource': self._build_coverage_resource(claim.sha_member)
        })
        
        return bundle
    
    def _build_claim_resource(self, claim: SHAClaim) -> dict:
        """Build FHIR Claim resource."""
        return {
            'resourceType': 'Claim',
            'identifier': [{
                'system': 'urn:vitora:claim',
                'value': claim.claim_number
            }],
            'status': 'active',
            'type': {
                'coding': [{
                    'system': 'http://terminology.hl7.org/CodeSystem/claim-type',
                    'code': 'institutional' if claim.claim_type == 'inpatient' else 'professional'
                }]
            },
            'use': 'claim',
            'patient': {
                'reference': f'Patient/{claim.patient.id}'
            },
            'created': claim.created_at.isoformat(),
            'provider': {
                'identifier': {
                    'value': claim.facility_code
                }
            },
            'priority': {'coding': [{'code': 'normal'}]},
            'diagnosis': self._build_diagnosis_list(claim),
            'item': self._build_item_list(claim),
            'total': {
                'value': float(claim.claimed_amount),
                'currency': 'KES'
            }
        }
    
    def submit_claim(self, claim: SHAClaim, user) -> dict:
        """
        Submit claim to SHA.
        
        Returns submission response.
        """
        # Validate first
        is_valid, errors = self.validate_claim(claim)
        if not is_valid:
            raise ValidationError({'errors': errors})
        
        # Package claim
        bundle = self.package_claim(claim)
        
        # Submit via API
        try:
            response = self._submit_to_sha_api(bundle, claim)
            
            # Update claim status
            claim.status = SHAClaim.ClaimStatus.SUBMITTED
            claim.submitted_at = timezone.now()
            claim.submitted_by = user
            claim.sha_claim_reference = response.get('claim_reference', '')
            claim.submission_response = response
            claim.save()
            
            # Log audit
            AuditLog.log(
                action='sha_claim_submit',
                user=user,
                resource_type='SHAClaim',
                resource_id=claim.id,
                details={'sha_reference': claim.sha_claim_reference}
            )
            
            return response
            
        except requests.RequestException as e:
            claim.submission_response = {'error': str(e)}
            claim.save()
            raise ValidationError(f"Submission failed: {str(e)}")
    
    def _submit_to_sha_api(self, bundle: dict, claim: SHAClaim) -> dict:
        """Submit claim bundle to SHA API."""
        headers = {
            'Authorization': f'Bearer {self.api_key}',
            'Content-Type': 'application/fhir+json',
        }
        
        # Prepare multipart with attachments
        files = []
        for attachment in claim.attachments.all():
            files.append((
                'attachments',
                (attachment.original_filename, attachment.file, attachment.mime_type)
            ))
        
        response = requests.post(
            f'{self.api_base_url}/claims/submit',
            json=bundle,
            files=files or None,
            headers=headers,
            timeout=60,
        )
        response.raise_for_status()
        return response.json()
```

**Test Coverage** (15 tests):
- [ ] Test `create_claim_from_encounter()` creates claim and items
- [ ] Test claim type auto-detection for OPD
- [ ] Test claim type auto-detection for IPD
- [ ] Test claim type auto-detection for Emergency
- [ ] Test patient without SHA membership raises error
- [ ] Test `validate_claim()` delegation to model
- [ ] Test `package_claim()` returns FHIR bundle
- [ ] Test FHIR Claim resource structure
- [ ] Test FHIR Patient resource included
- [ ] Test FHIR Coverage resource included
- [ ] Test `submit_claim()` success flow
- [ ] Test `submit_claim()` updates claim status
- [ ] Test `submit_claim()` logs audit entry
- [ ] Test `submit_claim()` handles API error
- [ ] Test attachments included in submission

---

## Database Migrations

### Migration 0002: SHA Models
```python
# hmis/apps/billing/migrations/0002_sha_models.py

# Models added:
# - SHAMember
# - SHATariff
# - SHAClaim
# - SHAClaimItem
# - SHAClaimAttachment
# - SHAEligibilityCheck

# Indexes added:
# - SHAMember: sha_number, national_id, status
# - SHATariff: code, category+is_active, facility_level
# - SHAClaim: claim_number, sha_claim_reference, patient+status, status+submitted_at, service_date
# - SHAEligibilityCheck: sha_member+check_date, result
```

### Migration 0003: SHA Permissions
```python
# hmis/apps/billing/migrations/0003_sha_permissions.py

# Permissions added:
# - billing.submit_sha_claim
# - billing.approve_sha_claim
# - billing.appeal_sha_claim
# - billing.verify_sha_eligibility
```

---

## Settings Configuration

```python
# hmis/settings/base.py

# SHA Integration Settings
SHA_API_BASE_URL = os.getenv('SHA_API_BASE_URL', 'https://api.sha.go.ke/v1')
SHA_API_KEY = os.getenv('SHA_API_KEY', '')
SHA_API_TIMEOUT = int(os.getenv('SHA_API_TIMEOUT', '30'))  # seconds

# Facility identification
FACILITY_MFL_CODE = os.getenv('FACILITY_MFL_CODE', '')  # Master Facility List code
FACILITY_LEVEL = os.getenv('FACILITY_LEVEL', 'L3')  # Default to Level 3

# Claims settings
SHA_CLAIMS_AUTO_VALIDATE = os.getenv('SHA_CLAIMS_AUTO_VALIDATE', 'true').lower() == 'true'
SHA_ELIGIBILITY_CACHE_HOURS = int(os.getenv('SHA_ELIGIBILITY_CACHE_HOURS', '24'))

# Attachment settings
SHA_MAX_ATTACHMENT_SIZE_MB = int(os.getenv('SHA_MAX_ATTACHMENT_SIZE_MB', '10'))
SHA_ALLOWED_ATTACHMENT_TYPES = [
    'application/pdf',
    'image/jpeg',
    'image/png',
    'image/tiff',
]
```

```python
# hmis/settings/development.py

# Use mock SHA API in development
SHA_API_BASE_URL = 'http://localhost:8080/mock-sha'
SHA_API_KEY = 'dev-test-key'
FACILITY_MFL_CODE = 'DEV-001'
```

```python
# hmis/settings/test.py

# Mock SHA API for tests
SHA_API_BASE_URL = 'http://mock-sha-api'
SHA_API_KEY = 'test-key'
FACILITY_MFL_CODE = 'TEST-001'
FACILITY_LEVEL = 'L3'
```

---

## Serializers

**Module**: `hmis/apps/billing/serializers.py`

```python
class SHAMemberSerializer(serializers.ModelSerializer):
    """Serializer for SHA member registration and display."""
    
    patient_name = serializers.CharField(source='patient.full_name', read_only=True)
    patient_mrn = serializers.CharField(source='patient.mrn', read_only=True)
    eligibility_display = serializers.CharField(
        source='get_eligibility_display', read_only=True
    )
    is_eligible = serializers.BooleanField(read_only=True)
    
    class Meta:
        model = SHAMember
        fields = [
            'id', 'patient', 'patient_name', 'patient_mrn',
            'sha_number', 'national_id', 'membership_type',
            'principal_sha_number', 'status', 'coverage_start_date',
            'coverage_end_date', 'benefit_package', 'is_eligible',
            'eligibility_display', 'last_eligibility_check',
            'created_at', 'updated_at',
        ]
        read_only_fields = ['id', 'status', 'created_at', 'updated_at']


class SHATariffSerializer(serializers.ModelSerializer):
    """Serializer for SHA tariff codes."""
    
    category_display = serializers.CharField(
        source='get_category_display', read_only=True
    )
    facility_level_display = serializers.CharField(
        source='get_facility_level_display', read_only=True
    )
    is_valid = serializers.SerializerMethodField()
    
    class Meta:
        model = SHATariff
        fields = [
            'id', 'code', 'name', 'description', 'category',
            'category_display', 'facility_level', 'facility_level_display',
            'sha_amount', 'currency', 'effective_date', 'expiry_date',
            'is_active', 'requires_preauthorization', 'max_quantity_per_claim',
            'waiting_period_days', 'is_valid',
        ]
    
    def get_is_valid(self, obj):
        return obj.is_valid_on_date()


class SHAClaimItemSerializer(serializers.ModelSerializer):
    """Serializer for claim line items."""
    
    tariff_code = serializers.CharField(source='tariff.code', read_only=True)
    tariff_name = serializers.CharField(source='tariff.name', read_only=True)
    service_name = serializers.CharField(source='service.name', read_only=True)
    status_display = serializers.CharField(
        source='get_status_display', read_only=True
    )
    
    class Meta:
        model = SHAClaimItem
        fields = [
            'id', 'tariff', 'tariff_code', 'tariff_name', 'service',
            'service_name', 'description', 'service_date', 'quantity',
            'unit_price', 'claimed_amount', 'status', 'status_display',
            'approved_quantity', 'approved_amount', 'rejection_reason',
            'created_at',
        ]
        read_only_fields = [
            'id', 'claimed_amount', 'status', 'approved_quantity',
            'approved_amount', 'rejection_reason', 'created_at',
        ]


class SHAClaimAttachmentSerializer(serializers.ModelSerializer):
    """Serializer for claim attachments."""
    
    attachment_type_display = serializers.CharField(
        source='get_attachment_type_display', read_only=True
    )
    
    class Meta:
        model = SHAClaimAttachment
        fields = [
            'id', 'attachment_type', 'attachment_type_display', 'name',
            'description', 'file', 'file_size', 'mime_type',
            'original_filename', 'page_count', 'created_at',
        ]
        read_only_fields = ['id', 'file_size', 'checksum', 'created_at']


class SHAClaimSerializer(serializers.ModelSerializer):
    """Serializer for SHA claims."""
    
    patient_name = serializers.CharField(source='patient.full_name', read_only=True)
    patient_mrn = serializers.CharField(source='patient.mrn', read_only=True)
    sha_number = serializers.CharField(source='sha_member.sha_number', read_only=True)
    status_display = serializers.CharField(source='get_status_display', read_only=True)
    claim_type_display = serializers.CharField(
        source='get_claim_type_display', read_only=True
    )
    items = SHAClaimItemSerializer(many=True, read_only=True)
    attachments = SHAClaimAttachmentSerializer(many=True, read_only=True)
    age_days = serializers.IntegerField(source='get_age_days', read_only=True)
    can_appeal = serializers.BooleanField(read_only=True)
    validation_errors = serializers.SerializerMethodField()
    
    class Meta:
        model = SHAClaim
        fields = [
            'id', 'claim_number', 'sha_claim_reference', 'patient',
            'patient_name', 'patient_mrn', 'sha_member', 'sha_number',
            'encounter', 'invoice', 'claim_type', 'claim_type_display',
            'status', 'status_display', 'service_date', 'admission_date',
            'discharge_date', 'primary_diagnosis_code',
            'primary_diagnosis_description', 'secondary_diagnosis_codes',
            'claimed_amount', 'approved_amount', 'paid_amount',
            'patient_copay', 'submission_method', 'submitted_at',
            'adjudication_date', 'adjudication_notes', 'rejection_reason',
            'rejection_code', 'payment_date', 'payment_reference',
            'preauth_number', 'facility_code', 'facility_level',
            'items', 'attachments', 'age_days', 'can_appeal',
            'validation_errors', 'version', 'created_at', 'updated_at',
        ]
        read_only_fields = [
            'id', 'claim_number', 'sha_claim_reference', 'status',
            'claimed_amount', 'approved_amount', 'paid_amount',
            'submitted_at', 'adjudication_date', 'payment_date',
            'version', 'created_at', 'updated_at',
        ]
    
    def get_validation_errors(self, obj):
        if obj.status in ['draft', 'validated']:
            _, errors = obj.validate_for_submission()
            return errors
        return []


class SHAClaimDashboardSerializer(serializers.Serializer):
    """Serializer for claims dashboard statistics."""
    
    total_claims = serializers.IntegerField()
    total_claimed = serializers.DecimalField(max_digits=14, decimal_places=2)
    total_approved = serializers.DecimalField(max_digits=14, decimal_places=2)
    total_paid = serializers.DecimalField(max_digits=14, decimal_places=2)
    pending_count = serializers.IntegerField()
    approved_count = serializers.IntegerField()
    rejected_count = serializers.IntegerField()
    approval_rate = serializers.FloatField()
    average_turnaround_days = serializers.FloatField()
    claims_by_status = serializers.DictField()
    claims_by_type = serializers.DictField()
```

---

## Integration Points

### 1. Patient Module Integration
- **Module**: `hmis/apps/patients/`
- **Description**: SHAMember has OneToOne relationship with Patient
- **Access**: `patient.sha_member` for quick eligibility check
- **Dependencies**: Patient model must exist

### 2. Encounters Module Integration
- **Module**: `hmis/apps/encounters/`
- **Description**: Claims link to encounters for clinical context and diagnosis codes
- **Dependencies**: Encounter with ICD-10 diagnosis required for claims

### 3. Billing Module Integration
- **Module**: `hmis/apps/billing/`
- **Description**: Claims created from invoices, items map to invoice items
- **Dependencies**: Invoice with items must exist before claim creation

### 4. Core Module Integration
- **Module**: `hmis/apps/core/`
- **Description**: Uses AuditLog for tracking claim submissions and status changes
- **Dependencies**: AuditLog, TimeStampedModel

### 5. External SHA API Integration
- **Module**: `hmis/apps/billing/services/`
- **Description**: HTTP client for SHA API (eligibility, submission, status)
- **Dependencies**: `requests` library, API credentials

---

## TDD Approach

### Example Test Cases

```python
# Test file: tests/test_sha_member.py

import pytest
from django.core.exceptions import ValidationError
from rest_framework import status
from hmis.apps.billing.models import SHAMember


@pytest.mark.django_db
class TestSHAMemberModel:
    """Tests for SHAMember model."""
    
    def test_create_sha_member_with_valid_data(self, sample_patient, test_user):
        """Should create SHA member with valid data."""
        # Given: Valid SHA member data
        member = SHAMember.objects.create(
            patient=sample_patient,
            sha_number='SHA-1234567890',
            national_id='12345678',
            membership_type=SHAMember.MembershipType.PRINCIPAL,
            created_by=test_user,
        )
        
        # Then: Member should be created
        assert member.id is not None
        assert member.sha_number == 'SHA-1234567890'
        assert member.status == SHAMember.MembershipStatus.PENDING_VERIFICATION
    
    def test_sha_number_must_start_with_sha(self, sample_patient, test_user):
        """Should reject SHA numbers not starting with SHA-."""
        # Given: Invalid SHA number
        with pytest.raises(ValidationError) as exc_info:
            SHAMember.objects.create(
                patient=sample_patient,
                sha_number='INVALID123',
                national_id='12345678',
                created_by=test_user,
            )
        
        # Then: Should raise validation error
        assert 'sha_number' in str(exc_info.value)
    
    def test_is_eligible_with_active_status(self, sample_sha_member):
        """Should return True for active member with valid coverage."""
        # Given: Active member
        sample_sha_member.status = SHAMember.MembershipStatus.ACTIVE
        sample_sha_member.coverage_end_date = date.today() + timedelta(days=30)
        sample_sha_member.save()
        
        # Then: Should be eligible
        assert sample_sha_member.is_eligible() is True
    
    def test_is_eligible_with_expired_coverage(self, sample_sha_member):
        """Should return False for expired coverage."""
        # Given: Expired coverage
        sample_sha_member.status = SHAMember.MembershipStatus.ACTIVE
        sample_sha_member.coverage_end_date = date.today() - timedelta(days=1)
        sample_sha_member.save()
        
        # Then: Should not be eligible
        assert sample_sha_member.is_eligible() is False


# Test file: tests/test_sha_claim.py

@pytest.mark.django_db
class TestSHAClaimModel:
    """Tests for SHAClaim model."""
    
    def test_create_claim_generates_claim_number(
        self, sample_sha_member, sample_encounter, test_user
    ):
        """Should auto-generate claim number on creation."""
        # Given: Valid claim data
        claim = SHAClaim.objects.create(
            patient=sample_sha_member.patient,
            sha_member=sample_sha_member,
            encounter=sample_encounter,
            claim_type=SHAClaim.ClaimType.OUTPATIENT,
            service_date=date.today(),
            primary_diagnosis_code='J06.9',
            primary_diagnosis_description='Acute upper respiratory infection',
            facility_code='TEST-001',
            facility_level='L3',
            created_by=test_user,
        )
        
        # Then: Claim number should be generated
        assert claim.claim_number.startswith('CLM-')
        assert len(claim.claim_number) == 17  # CLM-YYYYMMDD-XXXX
    
    def test_validate_for_submission_fails_without_items(self, sample_claim):
        """Should fail validation without claim items."""
        # Given: Claim with no items
        is_valid, errors = sample_claim.validate_for_submission()
        
        # Then: Should not be valid
        assert is_valid is False
        assert any('item' in e.lower() for e in errors)
    
    def test_submit_updates_status(self, sample_claim_with_items, test_user):
        """Should update status to SUBMITTED on submit."""
        # Given: Valid claim ready for submission
        # When: Submitting claim
        sample_claim_with_items.submit(test_user)
        
        # Then: Status should be SUBMITTED
        assert sample_claim_with_items.status == SHAClaim.ClaimStatus.SUBMITTED
        assert sample_claim_with_items.submitted_at is not None
        assert sample_claim_with_items.submitted_by == test_user


# Test file: tests/test_sha_api.py

@pytest.mark.django_db
class TestSHAClaimAPI:
    """Tests for SHA Claims API endpoints."""
    
    def test_list_claims_requires_authentication(self, api_client):
        """Should reject unauthenticated requests."""
        # When: Accessing without auth
        response = api_client.get('/api/sha/claims/')
        
        # Then: Should be unauthorized
        assert response.status_code == status.HTTP_401_UNAUTHORIZED
    
    def test_list_claims_returns_paginated_results(
        self, authenticated_client, sample_claims
    ):
        """Should return paginated claim list."""
        # When: Listing claims
        response = authenticated_client.get('/api/sha/claims/')
        
        # Then: Should return paginated results
        assert response.status_code == status.HTTP_200_OK
        assert 'results' in response.data
        assert 'count' in response.data
    
    def test_create_claim_from_encounter(
        self, authenticated_client, sample_encounter, sample_invoice
    ):
        """Should create claim from encounter and invoice."""
        # Given: Valid claim data
        data = {
            'encounter': sample_encounter.id,
            'invoice': sample_invoice.id,
            'claim_type': 'outpatient',
        }
        
        # When: Creating claim
        response = authenticated_client.post('/api/sha/claims/', data)
        
        # Then: Claim should be created
        assert response.status_code == status.HTTP_201_CREATED
        assert 'claim_number' in response.data
    
    def test_submit_claim_endpoint(
        self, authenticated_client, sample_claim_with_items
    ):
        """Should submit claim via API."""
        # When: Submitting claim
        response = authenticated_client.post(
            f'/api/sha/claims/{sample_claim_with_items.id}/submit/'
        )
        
        # Then: Should be submitted
        assert response.status_code == status.HTTP_200_OK
        assert response.data['status'] == 'submitted'
```

---

## Fixtures for Tests

```python
# tests/conftest.py additions

@pytest.fixture
def sample_sha_member(db, sample_patient, test_user):
    """Create sample SHA member for testing."""
    from hmis.apps.billing.models import SHAMember
    return SHAMember.objects.create(
        patient=sample_patient,
        sha_number='SHA-1234567890',
        national_id='12345678',
        membership_type=SHAMember.MembershipType.PRINCIPAL,
        status=SHAMember.MembershipStatus.ACTIVE,
        coverage_start_date=date.today() - timedelta(days=365),
        coverage_end_date=date.today() + timedelta(days=365),
        created_by=test_user,
    )


@pytest.fixture
def sample_tariff(db):
    """Create sample SHA tariff for testing."""
    from hmis.apps.billing.models import SHATariff
    return SHATariff.objects.create(
        code='SHA-CONS-001',
        name='General Consultation',
        category=SHATariff.TariffCategory.CONSULTATION,
        facility_level=SHATariff.TariffLevel.LEVEL_3,
        sha_amount=Decimal('500.00'),
        effective_date=date.today() - timedelta(days=30),
        is_active=True,
    )


@pytest.fixture
def sample_claim(db, sample_sha_member, sample_encounter, test_user):
    """Create sample SHA claim for testing."""
    from hmis.apps.billing.models import SHAClaim
    return SHAClaim.objects.create(
        patient=sample_sha_member.patient,
        sha_member=sample_sha_member,
        encounter=sample_encounter,
        claim_type=SHAClaim.ClaimType.OUTPATIENT,
        service_date=date.today(),
        primary_diagnosis_code='J06.9',
        primary_diagnosis_description='Acute upper respiratory infection',
        facility_code='TEST-001',
        facility_level='L3',
        created_by=test_user,
    )


@pytest.fixture
def sample_claim_with_items(db, sample_claim, sample_tariff):
    """Create sample claim with items and attachments."""
    from hmis.apps.billing.models import SHAClaimItem, SHAClaimAttachment
    
    # Add item
    SHAClaimItem.objects.create(
        claim=sample_claim,
        tariff=sample_tariff,
        description='General Consultation',
        service_date=sample_claim.service_date,
        quantity=Decimal('1.00'),
        unit_price=sample_tariff.sha_amount,
    )
    
    # Add required attachments (mocked)
    SHAClaimAttachment.objects.create(
        claim=sample_claim,
        attachment_type='clinical_notes',
        name='Clinical Notes',
        file='test/clinical_notes.pdf',
        file_size=1024,
        mime_type='application/pdf',
        checksum='abc123',
        original_filename='clinical_notes.pdf',
        uploaded_by=sample_claim.created_by,
    )
    SHAClaimAttachment.objects.create(
        claim=sample_claim,
        attachment_type='invoice',
        name='Invoice',
        file='test/invoice.pdf',
        file_size=512,
        mime_type='application/pdf',
        checksum='def456',
        original_filename='invoice.pdf',
        uploaded_by=sample_claim.created_by,
    )
    
    sample_claim.refresh_from_db()
    return sample_claim


@pytest.fixture
def sha_member_data():
    """Valid SHA member data for API tests."""
    return {
        'sha_number': 'SHA-9876543210',
        'national_id': '87654321',
        'membership_type': 'principal',
    }
```

---

## UI Components (Web Frontend)

### 1. SHAMemberCard
- **Location**: `web-app/components/sha/SHAMemberCard.tsx`
- **Description**: Display SHA membership details and eligibility status
- **Props**: `patientId: number`, `onVerify: () => void`
- **Dependencies**: shadcn/ui Card, Badge

### 2. EligibilityChecker
- **Location**: `web-app/components/sha/EligibilityChecker.tsx`
- **Description**: Real-time eligibility verification with loading states
- **Props**: `shaNumber: string`, `onResult: (result) => void`
- **Dependencies**: shadcn/ui Button, Alert, Spinner

### 3. TariffSearchDialog
- **Location**: `web-app/components/sha/TariffSearchDialog.tsx`
- **Description**: Search and select SHA tariff codes
- **Props**: `category?: string`, `onSelect: (tariff) => void`
- **Dependencies**: shadcn/ui Dialog, Input, Table

### 4. ClaimForm
- **Location**: `web-app/components/sha/ClaimForm.tsx`
- **Description**: Create/edit SHA claim with items and attachments
- **Props**: `encounterId: number`, `invoiceId: number`
- **Dependencies**: shadcn/ui Form, TariffSearchDialog

### 5. ClaimItemsTable
- **Location**: `web-app/components/sha/ClaimItemsTable.tsx`
- **Description**: Editable table of claim line items with tariff mapping
- **Props**: `claimId: number`, `editable: boolean`
- **Dependencies**: shadcn/ui Table, DataTable

### 6. ClaimAttachments
- **Location**: `web-app/components/sha/ClaimAttachments.tsx`
- **Description**: Upload and manage claim attachments
- **Props**: `claimId: number`, `requiredTypes: string[]`
- **Dependencies**: shadcn/ui FileUpload, Badge

### 7. ClaimsList
- **Location**: `web-app/components/sha/ClaimsList.tsx`
- **Description**: Paginated, filterable list of claims with status badges
- **Props**: `filters: ClaimFilters`
- **Dependencies**: shadcn/ui DataTable, Badge, Pagination

### 8. ClaimDetail
- **Location**: `web-app/components/sha/ClaimDetail.tsx`
- **Description**: Full claim details with items, attachments, history
- **Props**: `claimId: number`
- **Dependencies**: ClaimItemsTable, ClaimAttachments, Tabs

### 9. ClaimsDashboard
- **Location**: `web-app/components/sha/ClaimsDashboard.tsx`
- **Description**: Claims statistics, charts, and quick actions
- **Props**: `dateRange: DateRange`
- **Dependencies**: shadcn/ui Card, Charts, StatCards

### 10. ClaimSubmissionWizard
- **Location**: `web-app/components/sha/ClaimSubmissionWizard.tsx`
- **Description**: Step-by-step wizard for claim submission
- **Props**: `claimId: number`, `onComplete: () => void`
- **Dependencies**: shadcn/ui Stepper, Form, Alert

---

## Acceptance Criteria Summary

| User Story | Key Acceptance Criteria | Status |
|------------|------------------------|--------|
| KE-CLM-001 | Claims packaged with all required attachments | ⬜ |
| KE-CLM-001 | FHIR/zip format for submission | ⬜ |
| KE-CLM-001 | Pre-submission validation against SHA tariffs | ⬜ |
| KE-CLM-001 | Error messages for incomplete/invalid claims | ⬜ |
| KE-CLM-001 | Claim tracking: Submitted → Review → Approved → Paid | ⬜ |
| KE-CLM-001 | Notifications for status updates | ⬜ |
| KE-CLM-002 | Dashboard shows claims by status with aging | ⬜ |
| KE-CLM-002 | Can view rejection reasons from SHA | ⬜ |
| KE-CLM-002 | Can prepare and submit appeals | ⬜ |
| KE-CLM-002 | Historical analysis of rejection patterns | ⬜ |
| KE-CLM-002 | Reports on claims performance (approval rate, turnaround) | ⬜ |

**Status Legend**: ⬜ Not Started | 🔄 In Progress | ✅ Complete

---

## Dependencies

### Internal Dependencies
- `hmis.apps.patients` - Patient model for SHA member linkage
- `hmis.apps.encounters` - Encounter model for clinical context
- `hmis.apps.billing` - Invoice model for claim creation
- `hmis.apps.core` - AuditLog, SyncQueue, TimeStampedModel

### External Dependencies
- Django 5.x
- Django REST Framework
- `requests` - HTTP client for SHA API
- `python-magic` - MIME type detection for attachments
- `hashlib` - Checksum generation for file integrity

### Blocking Dependencies
- [ ] Phase 1 billing module complete (Invoice, InvoiceItem)
- [ ] Phase 1 encounters module complete (ICD-10 diagnosis)
- [ ] SHA API documentation and credentials obtained
- [ ] Facility MFL code registered with SHA

---

## Risks & Mitigations

| Risk | Impact | Probability | Mitigation |
|------|--------|-------------|------------|
| SHA API unavailable/undocumented | High | Medium | Build with mock API, design for flexibility |
| SHA API changes during development | Medium | Medium | Version API client, integration tests |
| Tariff codes not finalized | High | Medium | Import system for tariff updates, admin UI |
| Complex eligibility rules | Medium | High | Configurable rules engine, edge case tests |
| Large attachment uploads | Medium | Medium | Chunked uploads, compression, retry logic |
| API rate limiting | Low | Medium | Request queuing, exponential backoff |
| Offline claim creation | Medium | Low | Queue claims locally, sync when online |

---

## Success Metrics

- [ ] ≥80% test coverage for new SHA models and services
- [ ] All user story acceptance criteria met
- [ ] API response times <2 seconds for eligibility checks
- [ ] API response times <5 seconds for claim submission
- [ ] Zero critical/high security issues (Bandit scan)
- [ ] Claims dashboard loads in <3 seconds
- [ ] 100% of claims have required attachments before submission
- [ ] Mock SHA API integration tests passing
- [ ] Claims can be created and queued offline
- [ ] Audit logging for all claim lifecycle events

---

## Definition of Done

- [ ] All tests written and passing (TDD approach followed)
- [ ] Code coverage ≥80% for new code
- [ ] Code reviewed and approved
- [ ] Documentation updated (README, API docs, inline comments)
- [ ] No linting errors (`make quality` passes)
- [ ] Security scan clean (`bandit`)
- [ ] Migrations tested (forward and backward)
- [ ] Offline functionality verified (claim creation queued)
- [ ] Audit logging implemented for all CRUD operations
- [ ] FHIR compliance verified for claim bundle
- [ ] Demo ready for stakeholders
- [ ] SHA API mock server documented
- [ ] Tariff import script tested

---

## Appendix A: Data Model Diagram

```
Patient (1)
    └── SHAMember (1)
            ├── SHAClaim (N)
            │       ├── SHAClaimItem (N)
            │       └── SHAClaimAttachment (N)
            └── SHAEligibilityCheck (N)

Encounter (1)
    └── SHAClaim (N)

Invoice (1)
    └── SHAClaim (N)

SHATariff (standalone)
    └── SHAClaimItem (N - via FK)
```

---

## Appendix B: Claim Status State Machine

```
                    ┌─────────────────────────────────────────────┐
                    │                                             │
                    ▼                                             │
              ┌─────────┐                                         │
              │  DRAFT  │                                         │
              └────┬────┘                                         │
                   │ validate                                     │
                   ▼                                              │
             ┌──────────┐                                         │
             │ VALIDATED│                                         │
             └────┬─────┘                                         │
                  │ submit                                        │
                  ▼                                               │
            ┌──────────┐                                          │
            │ SUBMITTED│                                          │
            └────┬─────┘                                          │
                 │ SHA acknowledges                               │
                 ▼                                                │
          ┌─────────────┐                                         │
          │ ACKNOWLEDGED│                                         │
          └──────┬──────┘                                         │
                 │                                                │
                 ▼                                                │
          ┌──────────────┐                                        │
          │ UNDER_REVIEW │                                        │
          └──────┬───────┘                                        │
                 │                                                │
       ┌─────────┼─────────┬─────────────┐                        │
       │         │         │             │                        │
       ▼         ▼         ▼             ▼                        │
  ┌─────────┐ ┌───────┐ ┌────────┐ ┌──────────┐                   │
  │ APPROVED│ │ QUERY │ │PARTIAL │ │ REJECTED │                   │
  └────┬────┘ └───┬───┘ └───┬────┘ └────┬─────┘                   │
       │          │         │           │                         │
       │          │         │           │ appeal                  │
       │          └─────────┼───────────┼─────────────────────────┘
       │                    │           │
       ▼                    │           ▼
   ┌──────┐                 │     ┌──────────┐
   │ PAID │                 │     │ APPEALED │
   └──────┘                 │     └──────────┘
                            │
                            ▼
                      ┌───────────┐
                      │WRITTEN_OFF│
                      └───────────┘
```

---

## Appendix C: SHA API Mock Server

For development and testing, a mock SHA API server should be created:

```python
# scripts/mock_sha_server.py

from flask import Flask, request, jsonify
import random
import uuid

app = Flask(__name__)

@app.route('/v1/eligibility/check', methods=['POST'])
def check_eligibility():
    """Mock eligibility check endpoint."""
    data = request.json
    sha_number = data.get('sha_number', '')
    
    # Simulate various responses
    if sha_number.endswith('0'):
        return jsonify({
            'eligible': False,
            'reason': 'Membership expired',
            'sha_number': sha_number,
        })
    
    return jsonify({
        'eligible': True,
        'valid_until': '2027-12-31',
        'balance': 500000.00,
        'benefit_package': 'STANDARD',
        'sha_number': sha_number,
    })

@app.route('/v1/claims/submit', methods=['POST'])
def submit_claim():
    """Mock claim submission endpoint."""
    claim_ref = f"SHA-{uuid.uuid4().hex[:10].upper()}"
    
    return jsonify({
        'status': 'acknowledged',
        'claim_reference': claim_ref,
        'submitted_at': '2026-10-15T10:30:00Z',
        'message': 'Claim received successfully',
    })

@app.route('/v1/claims/<claim_ref>/status', methods=['GET'])
def claim_status(claim_ref):
    """Mock claim status endpoint."""
    statuses = ['under_review', 'approved', 'rejected', 'paid']
    
    return jsonify({
        'claim_reference': claim_ref,
        'status': random.choice(statuses),
        'approved_amount': 4500.00,
        'updated_at': '2026-10-20T14:00:00Z',
    })

if __name__ == '__main__':
    app.run(port=8080)
```

---

## Appendix D: API Request/Response Examples

### Check Eligibility
```http
POST /api/sha/members/1/verify/
Authorization: Bearer <token>
```

**Response** (200 OK):
```json
{
    "is_eligible": true,
    "eligible_until": "2027-12-31",
    "benefit_balance": 500000.00,
    "benefit_package": "STANDARD",
    "last_checked": "2026-10-15T10:00:00Z"
}
```

### Create Claim
```http
POST /api/sha/claims/
Content-Type: application/json
Authorization: Bearer <token>

{
    "encounter": 123,
    "invoice": 456,
    "claim_type": "outpatient"
}
```

**Response** (201 Created):
```json
{
    "id": 1,
    "claim_number": "CLM-20261015-0001",
    "status": "draft",
    "patient_name": "John Doe",
    "patient_mrn": "MRN-20260101-0001",
    "sha_number": "SHA-1234567890",
    "claim_type": "outpatient",
    "claimed_amount": "0.00",
    "items": [],
    "attachments": [],
    "validation_errors": ["Claim must have at least one item"],
    "created_at": "2026-10-15T10:00:00Z"
}
```

### Submit Claim
```http
POST /api/sha/claims/1/submit/
Authorization: Bearer <token>
```

**Response** (200 OK):
```json
{
    "id": 1,
    "claim_number": "CLM-20261015-0001",
    "sha_claim_reference": "SHA-ABC123DEF4",
    "status": "submitted",
    "submitted_at": "2026-10-15T10:30:00Z",
    "message": "Claim submitted successfully to SHA"
}
```

### Claims Dashboard
```http
GET /api/sha/claims/dashboard/?start_date=2026-10-01&end_date=2026-10-31
Authorization: Bearer <token>
```

**Response** (200 OK):
```json
{
    "total_claims": 150,
    "total_claimed": "2500000.00",
    "total_approved": "2200000.00",
    "total_paid": "1800000.00",
    "pending_count": 25,
    "approved_count": 100,
    "rejected_count": 15,
    "approval_rate": 86.7,
    "average_turnaround_days": 7.5,
    "claims_by_status": {
        "draft": 5,
        "submitted": 20,
        "approved": 100,
        "rejected": 15,
        "paid": 10
    },
    "claims_by_type": {
        "outpatient": 120,
        "inpatient": 25,
        "emergency": 5
    }
}
```

---

## Appendix E: Tariff Import Script

```python
# scripts/import_sha_tariffs.py

"""
Import SHA tariff codes from CSV file.

Usage:
    python manage.py runscript import_sha_tariffs --script-args data/sha_tariffs.csv
"""

import csv
from decimal import Decimal
from datetime import date
from hmis.apps.billing.models import SHATariff


def run(csv_file: str):
    """Import tariffs from CSV."""
    created = 0
    updated = 0
    
    with open(csv_file, 'r') as f:
        reader = csv.DictReader(f)
        
        for row in reader:
            tariff, was_created = SHATariff.objects.update_or_create(
                code=row['code'],
                defaults={
                    'name': row['name'],
                    'description': row.get('description', ''),
                    'category': row['category'],
                    'facility_level': row['facility_level'],
                    'sha_amount': Decimal(row['amount']),
                    'effective_date': date.fromisoformat(row['effective_date']),
                    'is_active': True,
                }
            )
            
            if was_created:
                created += 1
            else:
                updated += 1
    
    print(f"Import complete: {created} created, {updated} updated")
```

**Sample CSV format** (`data/sha_tariffs.csv`):
```csv
code,name,category,facility_level,amount,effective_date
SHA-CONS-001,General Consultation,consultation,L3,500.00,2026-01-01
SHA-CONS-002,Specialist Consultation,consultation,L4,1000.00,2026-01-01
SHA-LAB-001,Complete Blood Count,laboratory,L3,800.00,2026-01-01
SHA-LAB-002,Urinalysis,laboratory,L2,300.00,2026-01-01
SHA-RAD-001,Chest X-Ray,radiology,L3,1500.00,2026-01-01
SHA-PROC-001,Minor Procedure,procedure,L3,2000.00,2026-01-01
```

---

## Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 0.1 | 2026-01-07 | Engineering Team | Initial draft |
| 1.0 | TBD | Engineering Team | Final specification after review |

---

*Document prepared by Nexora Africa Ltd Engineering Team*
*Sprint 2.1-2.2: SHA Claims Integration*
