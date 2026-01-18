# SHA (Social Health Authority) Implementation Summary

**Last Updated**: January 9, 2026
**Status**: ✅ Phase 2.1-2.2 Complete
**Branch**: `feature/sha-integration`

---

## Executive Summary

Vitora HMIS implements comprehensive SHA (Social Health Authority) integration for Kenya's universal health coverage program. This enables healthcare facilities to:

- **Verify patient eligibility** via SHA's Client Registry API
- **Package and submit claims** in FHIR R4 format
- **Track claim lifecycle** from submission to payment
- **Record pharmacy dispenses** via Shared Health Record (SHR)
- **Work offline** with automatic sync when connectivity resumes

### Key Metrics

| Metric | Value |
|--------|-------|
| **Total SHA Tests** | 775 |
| **Test Coverage** | 84.98% |
| **Models** | 6 |
| **API Endpoints** | 20+ |
| **Services** | 4 |
| **Documentation Files** | 10 |

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                       SHA Integration Architecture                          │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────────┐                          ┌─────────────────┐          │
│  │  Vitora HMIS    │                          │  Kenya SHA API  │          │
│  │  (Django)       │                          │  (DHA Gateway)  │          │
│  └────────┬────────┘                          └────────┬────────┘          │
│           │                                            │                    │
│  ┌────────▼────────┐     FHIR R4 / REST      ┌────────▼────────┐          │
│  │ SHAClaimsService│◄────────────────────────►│ /v1/shr-med/    │          │
│  │ SHAEligibility  │                          │ /v2/eligibility │          │
│  │ SHAAuthService  │                          │ /v1/hie-auth    │          │
│  └────────┬────────┘                          └─────────────────┘          │
│           │                                                                 │
│  ┌────────▼────────────────────────────────────────────────────┐           │
│  │                    Django Models                             │           │
│  ├──────────────┬──────────────┬──────────────┬────────────────┤           │
│  │  SHAMember   │  SHATariff   │   SHAClaim   │ SHAClaimItem   │           │
│  │  (Patient    │  (Pricing    │   (Claim     │ (Line Items)   │           │
│  │   Linkage)   │   Catalog)   │   Lifecycle) │                │           │
│  └──────────────┴──────────────┴──────────────┴────────────────┘           │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Data Models

### 1. SHAMember

Links Patient records to SHA membership for eligibility verification.

```python
class SHAMember(models.Model):
    patient = models.OneToOneField(Patient)           # 1:1 with Patient
    sha_number = models.CharField(unique=True)        # SHA-XXXXXXXXX format
    national_id = models.CharField()                  # Kenyan ID number
    membership_type = models.CharField()              # principal/dependent
    status = models.CharField()                       # active/suspended/expired
    coverage_start_date = models.DateField()
    coverage_end_date = models.DateField(null=True)
    last_eligibility_check = models.DateTimeField()
    eligibility_status = models.CharField()           # eligible/ineligible/pending
```

**Key Methods:**
- `is_eligible()` - Check current eligibility status
- `needs_eligibility_check()` - Check if 24h cache expired
- `get_eligibility_display()` - Human-readable status

### 2. SHATariff

Master catalog of SHA-approved service codes with pricing.

```python
class SHATariff(models.Model):
    code = models.CharField(unique=True)              # SHA tariff code
    description = models.TextField()
    category = models.CharField()                     # consultation/lab/pharmacy/...
    sha_amount = models.DecimalField()                # SHA reimbursement amount
    facility_level = models.CharField()               # L1-L6
    effective_date = models.DateField()
    expiry_date = models.DateField(null=True)
    is_active = models.BooleanField(default=True)
    icd10_codes = models.JSONField()                  # Applicable diagnosis codes
    max_quantity = models.IntegerField(default=1)
```

**Key Methods:**
- `is_valid_on_date(date)` - Check tariff validity
- `get_active_tariffs(category, facility_level)` - Query valid tariffs
- `find_tariff_for_service(service)` - Auto-map service to tariff

### 3. SHAClaim

Core claims model tracking full lifecycle.

```python
class SHAClaim(models.Model):
    claim_number = models.CharField(unique=True)      # CLM-YYYYMMDD-XXXX
    patient = models.ForeignKey(Patient)
    sha_member = models.ForeignKey(SHAMember)
    encounter = models.ForeignKey(Encounter, null=True)
    invoice = models.ForeignKey(Invoice, null=True)

    claim_type = models.CharField()                   # outpatient/inpatient/...
    status = models.CharField()                       # draft/validated/submitted/...
    service_date = models.DateField()

    # Amounts
    claimed_amount = models.DecimalField()
    approved_amount = models.DecimalField(null=True)

    # SHA Response
    sha_claim_reference = models.CharField(null=True)
    submission_response = models.JSONField()

    # Timestamps
    submitted_at = models.DateTimeField(null=True)
    adjudicated_at = models.DateTimeField(null=True)
    paid_at = models.DateTimeField(null=True)
```

**Claim Status Lifecycle:**
```
DRAFT → VALIDATED → SUBMITTED → UNDER_REVIEW → APPROVED/REJECTED → PAID
                                      ↓
                                  APPEALED → (re-enters at SUBMITTED)
```

**Key Methods:**
- `calculate_claimed_amount()` - Sum from items
- `validate_for_submission()` - Pre-submission checks
- `submit()` - Trigger submission workflow
- `can_appeal()` - Check if appeal allowed
- `create_appeal()` - Create appeal claim

### 4. SHAClaimItem

Individual line items within a claim.

```python
class SHAClaimItem(models.Model):
    claim = models.ForeignKey(SHAClaim, related_name='items')
    tariff = models.ForeignKey(SHATariff)
    service_description = models.TextField()
    quantity = models.IntegerField()
    unit_price = models.DecimalField()
    claimed_amount = models.DecimalField()            # Auto-calculated

    # Adjudication results
    status = models.CharField()                       # pending/approved/rejected
    approved_quantity = models.IntegerField(null=True)
    approved_amount = models.DecimalField(null=True)
    rejection_reason = models.TextField(blank=True)
```

### 5. SHAClaimAttachment

Supporting documents for claims.

```python
class SHAClaimAttachment(models.Model):
    claim = models.ForeignKey(SHAClaim, related_name='attachments')
    attachment_type = models.CharField()              # clinical_notes/lab_report/...
    file = models.FileField()
    file_name = models.CharField()
    mime_type = models.CharField()                    # PDF, JPEG, PNG, TIFF only
    file_size = models.IntegerField()                 # Max 10MB
    checksum = models.CharField()                     # SHA-256 hash
```

**Required Attachment Types by Claim Type:**
| Claim Type | Required Attachments |
|------------|---------------------|
| Outpatient | clinical_notes, invoice |
| Inpatient | clinical_notes, invoice, admission_form, discharge_summary |
| Surgery | clinical_notes, invoice, surgical_report, consent_form |
| Maternity | clinical_notes, invoice, anc_card |

### 6. SHAEligibilityCheck

Audit log of eligibility verification requests.

```python
class SHAEligibilityCheck(models.Model):
    sha_member = models.ForeignKey(SHAMember)
    check_date = models.DateTimeField(auto_now_add=True)
    result = models.CharField()                       # eligible/ineligible/error
    response_time_ms = models.IntegerField()
    request_payload = models.JSONField()
    response_payload = models.JSONField()
    error_code = models.CharField(blank=True)
    error_message = models.TextField(blank=True)
    benefit_balance = models.JSONField(null=True)
```

---

## Services

### 1. SHAAuthService (`sha_auth.py`)

Handles authentication with SHA API using Basic Auth → JWT exchange.

```python
class SHAAuthService:
    def get_access_token() -> str
    def refresh_token() -> str
    def is_token_valid() -> bool
```

**Features:**
- Token caching with 5-minute expiry buffer
- Automatic refresh on 401 responses
- Basic Auth credentials from environment

### 2. SHAEligibilityService (`sha_eligibility.py`)

Verifies patient eligibility against SHA API.

```python
class SHAEligibilityService:
    def check_eligibility(sha_member, force_refresh=False) -> EligibilityResult
    def get_benefit_balance(sha_member) -> dict
```

**Features:**
- 24-hour result caching
- Retry logic with exponential backoff (3 attempts)
- Member status auto-update
- Eligibility check logging

### 3. SHAClaimsService (`sha_claims.py`)

Core claims business logic.

```python
class SHAClaimsService:
    def create_claim_from_encounter(encounter) -> SHAClaim
    def validate_claim(claim) -> ValidationResult
    def package_claim(claim) -> dict  # FHIR Bundle
    def submit_claim(claim) -> SubmissionResult
    def check_claim_status(claim) -> StatusResult
```

**FHIR Bundle Structure:**
```json
{
  "resourceType": "Bundle",
  "type": "collection",
  "entry": [
    { "resource": { "resourceType": "Practitioner" } },
    { "resource": { "resourceType": "Organization" } },
    { "resource": { "resourceType": "Coverage" } },
    { "resource": { "resourceType": "Patient" } },
    { "resource": { "resourceType": "Claim" } }
  ]
}
```

**Key Features:**
- Auto-detection of claim type (OPD/IPD/Emergency)
- FHIR R4 compliant bundle generation
- Offline queue integration via SyncQueue
- Comprehensive validation (eligibility, tariffs, attachments)

---

## API Endpoints

### SHA Member Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/sha/members/` | List SHA members |
| POST | `/api/sha/members/` | Register SHA member |
| GET | `/api/sha/members/{id}/` | Get member detail |
| PATCH | `/api/sha/members/{id}/` | Update member |
| POST | `/api/sha/members/{id}/verify/` | Verify eligibility |
| GET | `/api/sha/members/search/` | Search by SHA number/national ID |

### SHA Tariff Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/sha/tariffs/` | List tariffs |
| GET | `/api/sha/tariffs/{id}/` | Get tariff detail |
| GET | `/api/sha/tariffs/search/` | Search tariffs by code/description |
| GET | `/api/sha/tariffs/by-category/` | Group by category |

### SHA Claim Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/sha/claims/` | List claims |
| POST | `/api/sha/claims/` | Create claim |
| GET | `/api/sha/claims/{id}/` | Get claim detail |
| PATCH | `/api/sha/claims/{id}/` | Update claim |
| POST | `/api/sha/claims/{id}/validate/` | Validate for submission |
| POST | `/api/sha/claims/{id}/submit/` | Submit to SHA |
| POST | `/api/sha/claims/{id}/appeal/` | Create appeal |
| GET | `/api/sha/claims/{id}/items/` | List claim items |
| POST | `/api/sha/claims/{id}/items/` | Add claim item |
| GET | `/api/sha/claims/{id}/attachments/` | List attachments |
| POST | `/api/sha/claims/{id}/attachments/` | Upload attachment |
| GET | `/api/sha/claims/dashboard/` | Dashboard statistics |
| GET | `/api/sha/claims/export/` | Export CSV/Excel |

---

## Settings Configuration

```python
# hmis/settings/base.py

# Feature Flag
SHA_ENABLED = os.getenv("SHA_ENABLED", "false").lower() == "true"

# API Configuration
SHA_API_BASE_URL = os.getenv("SHA_API_BASE_URL", "https://uat.dha.go.ke")
SHA_API_TIMEOUT = int(os.getenv("SHA_API_TIMEOUT", "30"))

# Authentication (Basic Auth → JWT)
SHA_CONSUMER_KEY = os.getenv("SHA_CONSUMER_KEY", "")
SHA_CLIENT_SECRET = os.getenv("SHA_CLIENT_SECRET", "")
SHA_USERNAME = os.getenv("SHA_USERNAME", "")
SHA_PASSWORD = os.getenv("SHA_PASSWORD", "")

# FHIR Base URL (for bundle profile URLs)
SHA_FHIR_BASE_URL = os.getenv("SHA_FHIR_BASE_URL", "https://qa-mis.apeiro-digital.com")

# Facility Configuration
FACILITY_MFL_CODE = os.getenv("FACILITY_MFL_CODE", "")
FACILITY_LEVEL = os.getenv("FACILITY_LEVEL", "L3")

# SHA Endpoints
SHA_ENDPOINTS = {
    'auth': '/v1/hie-auth',
    'eligibility': '/v2/eligibility',
    'client_registry': '/v3/client-registry/fetch-client',
    'client_register': '/v3/uat-cr-registration',
    'claims_submit': '/v1/shr-med/bundle',
    'claims_status': '/v1/shr-med/claim-status',
    'facility_search': '/v1/facility-search',
    'practitioner_search': '/v1/practitioner-search',
    'terminology_icd11': '/terminology/v1/icd11',
    'terminology_loinc': '/terminology/v1/loinc',
}

# SHR (Shared Health Record) Endpoints
SHA_API_ENDPOINTS = {
    'patient_resource': '/v1/patient-resource',
    'shr_submission': '/v1/shr-submission',
    'shr_summary': '/v1/shr/summary',
}
```

---

## Test Coverage

### Test Files Summary

| Test File | Tests | Lines | Description |
|-----------|-------|-------|-------------|
| `test_sha_member.py` | 34 | 694 | SHAMember model tests |
| `test_sha_tariff.py` | 30 | 793 | SHATariff model tests |
| `test_sha_claim.py` | 46 | 1,297 | SHAClaim model tests |
| `test_sha_claim_item.py` | 35 | 770 | SHAClaimItem model tests |
| `test_sha_claim_attachment.py` | 20 | 485 | SHAClaimAttachment tests |
| `test_sha_eligibility_check.py` | 25 | 478 | SHAEligibilityCheck tests |
| `test_sha_eligibility_service.py` | 12 | 608 | Eligibility service tests |
| `test_sha_claims_service.py` | 15 | 877 | Claims service tests |
| `test_sha_api.py` | 91 | 1,673 | API endpoint tests |

### SHR Compliance Tests

| Test File | Tests | Description |
|-----------|-------|-------------|
| `test_shr_configuration.py` | 22 | API endpoint configuration |
| `test_patient_resource.py` | 26 | Patient registration/update |
| `test_medication_request.py` | 31 | Prescription submission |
| `test_medication_dispense.py` | 29 | Dispense recording |
| `test_ips_bundle.py` | 30 | IPS/Patient summary |
| `test_refill_calculation.py` | 15 | Medication refill balance |

### SHA Compliance Tests

| Test File | Tests | Description |
|-----------|-------|-------------|
| `test_bundle_compliance.py` | 15 | FHIR bundle structure |
| `test_claim_compliance.py` | 12 | Claim resource validation |
| `test_coverage_compliance.py` | 10 | Coverage extensions |
| `test_organization_compliance.py` | 8 | Organization resource |
| `test_patient_compliance.py` | 10 | Patient resource |
| `test_practitioner_compliance.py` | 8 | Practitioner resource |
| `test_encounter_compliance.py` | 6 | Encounter resource |
| `test_general_compliance.py` | 20+ | General FHIR compliance |

**Total: 775 billing tests passing**

---

## Documentation

### SHA API Guides (`docs/sha-guides/`)

| Document | Description |
|----------|-------------|
| `claims.md` | FHIR Bundle structure for claim submission |
| `claims-api.md` | Claims submission workflow |
| `eligibility.md` | Eligibility API specification |
| `shr-integration.md` | SHR integration guide (pharmacy workflow) |
| `client-registry.md` | Client Registry overview |
| `facility-registry.md` | Facility registration |
| `health-worker-registry.md` | Practitioner registration |
| `fhir.md` | FHIR implementation guide |
| `patient.md` | Patient resource management |
| `shr.md` | SHR concept overview |

---

## Offline Support

SHA integration supports offline operation via the `SyncQueue` model:

1. **Claim Creation**: Claims can be created offline and queued for submission
2. **Validation**: Pre-submission validation works offline
3. **Sync**: When online, queued claims are automatically submitted
4. **Conflict Resolution**: Last-write-wins with manual override option

```python
# Example: Offline claim submission
from hmis.apps.billing.services.sha_claims import SHAClaimsService

service = SHAClaimsService()
result = service.submit_claim(claim)

if result.status == 'queued':
    # Claim queued for later submission
    print(f"Queued: {result.queue_entry_id}")
elif result.status == 'submitted':
    # Claim submitted successfully
    print(f"SHA Reference: {result.sha_claim_reference}")
```

---

## Security & Compliance

### Authentication
- API endpoints require JWT authentication
- SHA API uses Basic Auth → JWT exchange
- Credentials stored in environment variables (never in code)

### Permissions
| Permission | Description |
|------------|-------------|
| `billing.view_shamember` | View SHA member records |
| `billing.add_shamember` | Register new SHA members |
| `billing.change_shamember` | Update SHA member records |
| `billing.view_shaclaim` | View claims |
| `billing.add_shaclaim` | Create claims |
| `billing.change_shaclaim` | Update claims |
| `billing.submit_sha_claim` | Submit claims to SHA |
| `billing.appeal_sha_claim` | Create claim appeals |
| `billing.verify_sha_eligibility` | Verify eligibility |

### Audit Logging
All claim lifecycle events are logged:
- `sha_claim_create`
- `sha_claim_validate`
- `sha_claim_submit`
- `sha_claim_status_update`
- `sha_claim_appeal`
- `sha_eligibility_check`

### Kenya DPA 2019 Compliance
- Patient data encrypted at rest (Fernet)
- Audit logs retained for 7 years
- Purpose limitation enforced via audit details

---

## Integration Points

### Internal Dependencies
- **Patients Module**: SHAMember links to Patient
- **Encounters Module**: Claims link to Encounters for diagnosis codes
- **Billing Module**: Claims created from Invoices
- **Core Module**: AuditLog, SyncQueue, TimeStampedModel

### External Dependencies
- **SHA API**: Kenya Digital Superhighway (DHA Gateway)
- **FHIR R4**: HL7 FHIR standard for interoperability

---

## Environment Variables

```bash
# Feature Flag
SHA_ENABLED=true

# API Configuration
SHA_API_BASE_URL=https://uat.dha.go.ke
SHA_API_TIMEOUT=30

# Authentication
SHA_CONSUMER_KEY=your-consumer-key
SHA_CLIENT_SECRET=your-client-secret
SHA_USERNAME=your-username
SHA_PASSWORD=your-password

# FHIR Configuration
SHA_FHIR_BASE_URL=https://qa-mis.apeiro-digital.com

# Facility
FACILITY_MFL_CODE=12345
FACILITY_LEVEL=L3
```

---

## Quick Start

### 1. Enable SHA Integration
```python
# .env
SHA_ENABLED=true
SHA_API_BASE_URL=https://uat.dha.go.ke
```

### 2. Run Migrations
```bash
cd backend
python manage.py migrate
```

### 3. Load Tariffs
```bash
python manage.py import_sha_tariffs data/sha_tariffs.csv
```

### 4. Register SHA Member
```python
from hmis.apps.billing.models import SHAMember

member = SHAMember.objects.create(
    patient=patient,
    sha_number='SHA-123456789',
    national_id='12345678',
    membership_type='principal',
    status='active',
    coverage_start_date='2025-01-01',
)
```

### 5. Create and Submit Claim
```python
from hmis.apps.billing.services.sha_claims import SHAClaimsService

service = SHAClaimsService()

# Create claim from encounter
claim = service.create_claim_from_encounter(encounter)

# Validate
validation = service.validate_claim(claim)
if validation.is_valid:
    # Submit
    result = service.submit_claim(claim)
```

---

## Troubleshooting

### Common Issues

**1. "Patient does not have SHA membership"**
- Ensure patient has linked SHAMember record
- Check `patient.sha_member` exists

**2. "Eligibility check failed"**
- Check SHA_API_BASE_URL is correct
- Verify credentials (SHA_USERNAME, SHA_PASSWORD)
- Check network connectivity

**3. "Missing required attachments"**
- Use `SHAClaimAttachment.get_required_types(claim_type)` to check requirements
- Ensure all required attachment types are uploaded

**4. "Tariff not found for service"**
- Load SHA tariffs via import script
- Check tariff is active and valid for service date

---

## Changelog

### January 2026
- ✅ Complete SHA claims integration
- ✅ FHIR R4 bundle generation
- ✅ Eligibility verification with caching
- ✅ Offline claim queuing
- ✅ SHR compliance tests (155 tests)
- ✅ SHA compliance tests (111 tests)
- ✅ 775 total billing tests passing
- ✅ 84.98% overall test coverage

---

## Related Documents

- [SHA API Guides](sha-guides/) - Official SHA API documentation
- [FHIR Implementation](sha-guides/fhir.md) - FHIR R4 compliance details
- [Claims Workflow](sha-guides/claims-api.md) - Claims submission workflow
- [User Stories](user-stories.md) - KE-CLM-001, KE-CLM-002
