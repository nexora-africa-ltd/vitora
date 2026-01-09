# Kenya Digital Superhighway API Usage Analysis

> **Purpose**: Analysis of DHA (Digital Health Agency) APIs from the Kenya Digital Superhighway Postman collection and their usage within Vitora HMIS.
>
> **Base URL**: `https://uat.dha.go.ke/`
>
> **Analysis Date**: January 9, 2026

---

## Table of Contents

1. [Terminology APIs](#1-terminology-apis)
2. [Authentication APIs](#2-authentication-apis)
3. [Client Registry APIs](#3-client-registry-apis)
4. [Claims APIs](#4-claims-apis)
5. [Search APIs](#5-search-apis)
6. [Summary & Recommendations](#summary--recommendations)

---

## 1. Terminology APIs

Reference terminology services for healthcare coding standards.

### 1.1 Get SHA Interventions

| Attribute | Value |
|-----------|-------|
| **Endpoint** | `GET /terminology/v1/sha-intervention` |
| **Purpose** | Fetch SHA intervention codes for claims |
| **In Settings?** | ✅ `SHA_ENDPOINTS['terminology_sha']` |
| **Actually Used?** | ❌ No |
| **Status** | **Configured but not called** |

**Analysis**: The endpoint path is configured in `base.py`, but no service actually calls the DHA Terminology API. The claims service (`sha_claims.py`) mentions "SHA intervention code" but uses codes from local tariff data.

---

### 1.2 Get ICHIs

| Attribute | Value |
|-----------|-------|
| **Endpoint** | `GET /terminology/v1/ichi` |
| **Purpose** | International Classification of Health Interventions |
| **In Settings?** | ✅ `SHA_ENDPOINTS['terminology_ichi']` |
| **Actually Used?** | ❌ No |
| **Status** | **Configured but not called** |

**Analysis**: ICHI codes would be useful for procedure coding. Currently not integrated.

---

### 1.3 Get LOINC

| Attribute | Value |
|-----------|-------|
| **Endpoint** | `GET /terminology/v1/loinc` |
| **Purpose** | Lab test standardization codes |
| **In Settings?** | ✅ `SHA_ENDPOINTS['terminology_loinc']` |
| **Actually Used?** | ❌ Not remotely |
| **Status** | **Local model instead** |

**Analysis**: Vitora has its own `LOINCCode` model in the laboratory module. Codes are imported via `import_loinc` management command from CSV, not fetched from DHA API.

**Local Implementation**:
- Model: `hmis/apps/laboratory/models.py::LOINCCode`
- ViewSet: `LOINCCodeViewSet` at `/api/laboratory/loinc-codes/`
- Import: `python manage.py import_loinc`

---

### 1.4 Get ICD-11 Codes

| Attribute | Value |
|-----------|-------|
| **Endpoint** | `GET /terminology/v1/icd11` |
| **Purpose** | Diagnosis codes (ICD-11 standard) |
| **In Settings?** | ✅ `SHA_ENDPOINTS['terminology_icd11']` |
| **Actually Used?** | ❌ Not remotely |
| **Status** | **Configured but not called** |

**Analysis**: The claims service hardcodes the ICD-11 system URL for FHIR compliance but doesn't fetch codes from DHA. Local ICD-10 codes exist but ICD-11 lookup is not implemented.

---

### 1.5 Get Active Components

| Attribute | Value |
|-----------|-------|
| **Endpoint** | `GET /terminology/v1/active-component` |
| **Purpose** | Drug active ingredient lookup |
| **In Settings?** | ❌ No |
| **Actually Used?** | ❌ No |
| **Status** | **Not integrated** |

**Analysis**: Would be valuable for pharmacy module to validate drug compositions. Not currently in settings or code.

---

### 1.6 Get Products

| Attribute | Value |
|-----------|-------|
| **Endpoint** | `GET /terminology/v1/product` |
| **Purpose** | Kenya drug product registry (PPB, KNHTS) |
| **In Settings?** | ✅ `SHA_ENDPOINTS['terminology_product']` |
| **Actually Used?** | ❌ No |
| **Status** | **Configured but not called** |

**Analysis**: Highly valuable for pharmacy to validate drugs against Kenya approved registry (PPB registration codes, KNHTS concept IDs). Currently configured but not implemented.

---

### Terminology APIs Summary

| API | Configured | Implemented | Priority |
|-----|------------|-------------|----------|
| SHA Interventions | ✅ | ❌ | High (claims validation) |
| ICHI | ✅ | ❌ | Medium |
| LOINC | ✅ | 🔶 Local | Low (already local) |
| ICD-11 | ✅ | ❌ | High (diagnosis validation) |
| Active Components | ❌ | ❌ | Medium |
| Products | ✅ | ❌ | High (pharmacy) |

---

## 2. Authentication APIs

### 2.1 DHA APIs Auth

| Attribute | Value |
|-----------|-------|
| **Endpoint** | `GET /v1/hie-auth?key={{consumer_key}}` |
| **Method** | GET with Basic Auth header |
| **Purpose** | Obtain JWT token for subsequent API calls |
| **In Settings?** | ✅ `SHA_ENDPOINTS['auth']` |
| **Actually Used?** | ✅ **Yes - Fully Implemented** |
| **Status** | **✅ Production Ready** |

**Analysis**: Fully implemented in `sha_auth.py`. The `SHAAuthService` class handles:
- Basic Auth header creation (base64 encoded username:password)
- JWT token retrieval from DHA
- Token caching with expiry tracking (5-minute buffer)
- Automatic token refresh

**Implementation Details**:
```python
# File: hmis/apps/billing/services/sha_auth.py
class SHAAuthService:
    def get_token(self, force_refresh=False) -> str:
        # GET /v1/hie-auth?key={consumer_key}
        # Headers: Authorization: Basic {base64(username:password)}
        # Returns: {"token": "eyJ..."}
```

**Required Settings**:
- `SHA_API_BASE_URL` - Base URL (e.g., `https://uat.dha.go.ke`)
- `SHA_CONSUMER_KEY` - API consumer key
- `SHA_USERNAME` - API username
- `SHA_PASSWORD` - API password

---

## 3. Client Registry APIs

### 3.1 Register a New Client

| Attribute | Value |
|-----------|-------|
| **Endpoint** | `POST /v3/uat-cr-registration` |
| **Purpose** | Register new patient in national Client Registry |
| **In Settings?** | ✅ `SHA_ENDPOINTS['client_register']` |
| **Actually Used?** | ❌ No |
| **Status** | **Configured but not implemented** |

**Analysis**: Endpoint is configured but no service calls it. Would require:
- PIN encryption using RSA public key
- Agent identifier for facility
- Integration with patient registration flow

**Request Format** (from Postman):
```json
{
  "agent": "SAFARICOM-CONSORTIUM-SANDBOX",
  "encrypted_pin": "xv4BIGTd2...",
  "identification_number": "XXXXXXXXX",
  "identification_type": "National ID"
}
```

---

### 3.2 Fetch CR Client

| Attribute | Value |
|-----------|-------|
| **Endpoint** | `GET /v3/client-registry/fetch-client` |
| **Purpose** | Lookup patient in national Client Registry |
| **In Settings?** | ✅ `SHA_ENDPOINTS['client_registry']` |
| **Actually Used?** | ❌ No |
| **Status** | **Configured but not implemented** |

**Analysis**: Would be valuable for:
- Patient deduplication during registration
- Fetching CR number for SHA claims
- Verifying patient identity

**Supported ID Types**:
- National ID
- KRA PIN
- Passport
- Birth Certificate
- Alien ID
- Mandate Number
- Temporary ID

---

### 3.3 Update CR Client

| Attribute | Value |
|-----------|-------|
| **Endpoint** | `PUT /v3/update-client` |
| **Purpose** | Update patient details in Client Registry |
| **In Settings?** | ✅ `SHA_ENDPOINTS['client_update']` |
| **Actually Used?** | ❌ No |
| **Status** | **Configured but not implemented** |

**Analysis**: Required when patient demographics change. Not currently integrated.

---

### Client Registry APIs Summary

| API | Configured | Implemented | Priority |
|-----|------------|-------------|----------|
| Register Client | ✅ | ❌ | High |
| Fetch Client | ✅ | ❌ | High |
| Update Client | ✅ | ❌ | Medium |

**Note**: Client Registry integration is critical for SHA claims submission, as CR numbers are required for patient identification in FHIR bundles.

---

## 4. Claims APIs

### 4.1 Eligibility Check

| Attribute | Value |
|-----------|-------|
| **Endpoint** | `GET /v2/eligibility?identification_type={type}&identification_number={number}` |
| **Purpose** | Verify patient SHA coverage before service |
| **In Settings?** | ✅ `SHA_ENDPOINTS['eligibility']` |
| **Actually Used?** | ✅ **Yes - Fully Implemented** |
| **Status** | **✅ Production Ready** |

**Analysis**: Fully implemented in `sha_eligibility.py`. The `SHAEligibilityService` handles:
- Eligibility checking with multiple ID types
- Response parsing and caching
- Retry logic with exponential backoff
- Coverage end date tracking

**Implementation Details**:
```python
# File: hmis/apps/billing/services/sha_eligibility.py
class SHAEligibilityService:
    def check_eligibility(self, sha_member, user) -> SHAEligibilityCheck:
        # GET /v2/eligibility?doc_type={type}&doc_value={value}
```

**Response Fields Parsed**:
- `eligible` - Boolean eligibility status
- `coverageEndDate` - Coverage expiry date
- `isEmployed` - Employment status
- `means_testing_details` - Copay information
- `full_name` - Verified patient name

---

### 4.2 Submit Claims

| Attribute | Value |
|-----------|-------|
| **Endpoint** | `POST /v1/shr-med/bundle` |
| **Purpose** | Submit FHIR R4 claims bundle to SHA |
| **In Settings?** | ✅ `SHA_ENDPOINTS['claims_submit']` |
| **Actually Used?** | ✅ **Yes - Fully Implemented** |
| **Status** | **✅ Production Ready** |

**Analysis**: Fully implemented in `sha_claims.py`. The `SHAClaimsService` builds compliant FHIR R4 bundles containing:
- Organization resource (facility)
- Patient resource (with CR number)
- Coverage resource (with scheme category)
- Claim resource (with diagnoses, items, totals)

**FHIR Bundle Structure**:
```json
{
  "resourceType": "Bundle",
  "type": "message",
  "entry": [
    {"resource": {"resourceType": "Organization", ...}},
    {"resource": {"resourceType": "Coverage", ...}},
    {"resource": {"resourceType": "Patient", ...}},
    {"resource": {"resourceType": "Claim", ...}}
  ]
}
```

---

### 4.3 Poll Claim Status

| Attribute | Value |
|-----------|-------|
| **Endpoint** | `GET /v1/shr-med/claim-status?claim_id={{claim_id}}` |
| **Purpose** | Check status of submitted claim |
| **In Settings?** | ✅ `SHA_ENDPOINTS['claims_status']` |
| **Actually Used?** | ✅ **Yes - Fully Implemented** |
| **Status** | **✅ Production Ready** |

**Analysis**: Implemented for async claim tracking. Returns status:
- `draft` - Pending processing
- `active` - Under review
- `completed` - Approved
- `cancelled` - Rejected

---

### Claims APIs Summary

| API | Configured | Implemented | Priority |
|-----|------------|-------------|----------|
| Eligibility Check | ✅ | ✅ | N/A - Done |
| Submit Claims | ✅ | ✅ | N/A - Done |
| Poll Status | ✅ | ✅ | N/A - Done |

**Note**: All core claims APIs are fully implemented and tested with 775+ billing tests.

---

## 5. Search APIs

### 5.1 Search Organization (Facility)

| Attribute | Value |
|-----------|-------|
| **Endpoint** | `GET /v1/facility-search?facility_code={{mfl_code}}` |
| **Purpose** | Validate facility in Kenya Master Facility List |
| **In Settings?** | ✅ `SHA_ENDPOINTS['facility_search']` |
| **Actually Used?** | ❌ No |
| **Status** | **Configured but not implemented** |

**Analysis**: Would be valuable for:
- Validating facility MFL code before claims
- Fetching facility level for tariff lookup
- Checking operational status and license

**Response Fields**:
- `found` - Whether facility exists
- `facility_level` - Level 1-6
- `operational_status` - Active/Inactive
- `current_license_expiry_date` - License validity

---

### 5.2 Search Practitioner

| Attribute | Value |
|-----------|-------|
| **Endpoint** | `GET /v1/practitioner-search?identification_number={{id}}` |
| **Purpose** | Validate healthcare worker in HWR |
| **In Settings?** | ✅ `SHA_ENDPOINTS['practitioner_search']` |
| **Actually Used?** | ❌ No |
| **Status** | **Configured but not implemented** |

**Analysis**: Would be valuable for:
- Verifying provider before claims submission
- Fetching practitioner registration number
- Validating prescribing authority

**Search Parameters**:
- `registration_number` - Professional registration (e.g., PUID-143557)
- `identification_number` - National ID

---

### Search APIs Summary

| API | Configured | Implemented | Priority |
|-----|------------|-------------|----------|
| Facility Search | ✅ | ❌ | Medium |
| Practitioner Search | ✅ | ❌ | Medium |

---

## Summary & Recommendations

### Overall API Coverage

| Category | Total APIs | Configured | Implemented | % Complete |
|----------|-----------|------------|-------------|------------|
| Terminology | 6 | 5 | 0 (1 local) | 0% |
| Authentication | 1 | 1 | 1 | **100%** |
| Client Registry | 3 | 3 | 0 | 0% |
| Claims | 3 | 3 | 3 | **100%** |
| Search | 2 | 2 | 0 | 0% |
| **Total** | **15** | **14** | **4** | **27%** |

### Priority Implementation Roadmap

#### ✅ Already Complete (High Priority)
1. **Authentication** - Token management working
2. **Eligibility Check** - Coverage verification working
3. **Claims Submission** - FHIR bundles working
4. **Claims Status** - Polling working

#### 🔴 High Priority (Next Sprint)
1. **Fetch CR Client** - Required for patient lookup/deduplication
2. **Register CR Client** - Required for new patient enrollment
3. **SHA Interventions** - Validate intervention codes before claims
4. **ICD-11 Lookup** - Validate diagnosis codes

#### 🟡 Medium Priority
1. **Facility Search** - Validate MFL codes
2. **Practitioner Search** - Validate providers
3. **Products API** - Pharmacy drug validation
4. **Active Components** - Drug composition validation

#### 🟢 Low Priority
1. **LOINC API** - Already have local model
2. **ICHI API** - Procedure codes (future)
3. **Update CR Client** - Patient updates (future)

### Key Findings

1. **Core Billing Path Complete**: Auth → Eligibility → Claims → Status is fully functional
2. **Client Registry Gap**: No CR integration means manual patient matching
3. **Terminology APIs Untapped**: All configured but none calling DHA remotely
4. **Local Fallbacks**: LOINC uses local CSV import, not DHA API

---

**Document Status**: ✅ Complete  
**Last Updated**: January 9, 2026  
**Analysis By**: Vitora HMIS Development Team
