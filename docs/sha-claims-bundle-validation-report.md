# SHA Claims Bundle Validation Report

**Generated**: January 8, 2026  
**Source**: `backend/hmis/apps/billing/services/sha_claims.py`  
**Reference**: `docs/sha-guides/claims.md` (Official SHA FHIR Bundle Specification)

---

## Executive Summary

This report validates our current FHIR claim bundle implementation against the official SHA (Social Health Authority) specification. The analysis reveals **significant discrepancies** that must be addressed before production deployment.

| Category | Status | Issues Found |
|----------|--------|--------------|
| Bundle Structure | ⚠️ Partial | 4 issues |
| Organization Resource | ❌ Missing | Not implemented |
| Patient Resource | ⚠️ Partial | 5 issues |
| Coverage Resource | ⚠️ Partial | 4 issues |
| Claim Resource | ⚠️ Partial | 12 issues |
| **Overall Compliance** | **❌ 40%** | **25 total issues** |

---

## 1. Bundle Structure

### Current Implementation
```python
bundle = {
    'resourceType': 'Bundle',
    'type': 'collection',
    'timestamp': timezone.now().isoformat(),
    'entry': []
}
```

### Official Requirement
```json
{
  "id": "{{$guid}}",
  "meta": {
    "profile": ["https://qa-mis.apeiro-digital.com/fhir/StructureDefinition/bundle|1.0.0"]
  },
  "timestamp": "2025-01-27T12:19:00.073496",
  "type": "message",
  "entry": [...],
  "resourceType": "Bundle"
}
```

### Issues

| # | Field | Current | Required | Severity |
|---|-------|---------|----------|----------|
| 1 | `id` | ❌ Missing | GUID (same as Claim id) | 🔴 Critical |
| 2 | `meta.profile` | ❌ Missing | SHA bundle profile URL | 🔴 Critical |
| 3 | `type` | `"collection"` | `"message"` | 🔴 Critical |
| 4 | `entry[].fullUrl` | ❌ Missing | Full resource URLs | 🟡 Medium |

---

## 2. Organization Resource

### Current Implementation
**❌ NOT IMPLEMENTED** - Our bundle does not include an Organization resource.

### Official Requirement
```json
{
  "fullUrl": "https://qa-mis.apeiro-digital.com/fhir/Organization/FID-22-101101-0",
  "resource": {
    "id": "FID-22-101101-0",
    "meta": {
      "profile": ["https://mis.apeiro-digital.com/fhir/StructureDefinition/provider-organization|1.0.0"]
    },
    "name": "Facility Name",
    "active": "True",
    "extension": [{
      "url": "https://qa-mis.apeiro-digital.com/fhir/StructureDefinition/facility-level",
      "valueCodeableConcept": {
        "coding": [{
          "system": "https://qa-mis.apeiro-digital.com/fhir/StructureDefinition/facility-level",
          "code": "LEVEL 4",
          "display": "LEVEL 4"
        }]
      }
    }],
    "identifier": [{
      "use": "official",
      "type": {
        "coding": [{
          "display": "Code",
          "system": "https://qa-mis.apeiro-digital.com/fhir/terminology/CodeSystem/facility-identifier-types",
          "code": "fr-code"
        }]
      },
      "value": "FID-22-101101-0"
    }],
    "type": [{
      "coding": [{
        "system": "https://ts.kenya-hie.health/fhir/terminology/CodeSystem/organization-type",
        "code": "prov"
      }]
    }],
    "resourceType": "Organization"
  }
}
```

### Issues

| # | Issue | Severity |
|---|-------|----------|
| 5 | Organization resource completely missing | 🔴 Critical |

---

## 3. Patient Resource

### Current Implementation
```python
{
    'resourceType': 'Patient',
    'id': str(patient.id),
    'identifier': [{
        'system': 'urn:vitora:mrn',
        'value': patient.mrn
    }],
    'name': [{
        'use': 'official',
        'family': patient.last_name,
        'given': [patient.first_name]
    }],
    'gender': self._map_gender(patient.gender),
    'birthDate': self._format_date(patient.date_of_birth),
}
```

### Official Requirement
```json
{
  "fullUrl": "https://qa-mis.apeiro-digital.com/fhir/Patient/CR0000000000001-1",
  "resource": {
    "id": "CR0000000000001-1",
    "meta": {
      "profile": ["https://mis.apeiro-digital.com/fhir/StructureDefinition/patient|1.0.0"]
    },
    "identifier": [{
      "value": "CR0000000000001-1",
      "use": "official",
      "system": "https://qa-mis.apeiro-digital.com/fhir/identifier/shanumber"
    }],
    "name": [{
      "text": "FATUMA MOHAMMED",
      "family": "MOHAMMED",
      "given": ["FATUMA", "MOHAMMED"]
    }],
    "gender": "female",
    "birthDate": "1965-12-31",
    "resourceType": "Patient"
  }
}
```

### Issues

| # | Field | Current | Required | Severity |
|---|-------|---------|----------|----------|
| 6 | `id` | Internal patient ID | SHA CR Number (e.g., `CR0000000000001-1`) | 🔴 Critical |
| 7 | `meta.profile` | ❌ Missing | SHA patient profile URL | 🟡 Medium |
| 8 | `identifier.system` | `urn:vitora:mrn` | `https://qa-mis.apeiro-digital.com/fhir/identifier/shanumber` | 🔴 Critical |
| 9 | `identifier.value` | MRN | SHA Number (CR Number) | 🔴 Critical |
| 10 | `name.text` | ❌ Missing | Full name as text | 🟡 Medium |

---

## 4. Coverage Resource

### Current Implementation
```python
{
    'resourceType': 'Coverage',
    'id': str(sha_member.id),
    'identifier': [{
        'system': 'urn:kenya:sha',
        'value': sha_member.sha_number
    }],
    'status': 'active' if sha_member.status == 'active' else 'cancelled',
    'type': {...},
    'subscriber': {'reference': f'Patient/{sha_member.patient.id}'},
    'beneficiary': {'reference': f'Patient/{sha_member.patient.id}'},
    'period': {...},
    'payor': [{'display': 'Social Health Authority (SHA)'}]
}
```

### Official Requirement
```json
{
  "fullUrl": "https://qa-mis.apeiro-digital.com/fhir/Coverage/CR0000000000001-1-sha-coverage",
  "resource": {
    "extension": [
      {
        "url": "https://qa-mis.apeiro-digital.com/fhir/StructureDefinition/schemeCategoryCode",
        "valueString": "CAT-SHA-001"
      },
      {
        "url": "https://qa-mis.apeiro-digital.com/fhir/StructureDefinition/schemeCategoryName",
        "valueString": "SOCIAL HEALTH AUTHORITY"
      }
    ],
    "identifier": [{
      "use": "official",
      "value": "CR0000000000001-1-sha-coverage"
    }],
    "status": "active",
    "beneficiary": {
      "reference": "https://qa-mis.apeiro-digital.com/fhir/Patient/CR0000000000001-1",
      "type": "Patient"
    },
    "resourceType": "Coverage"
  }
}
```

### Issues

| # | Field | Current | Required | Severity |
|---|-------|---------|----------|----------|
| 11 | `extension` | ❌ Missing | `schemeCategoryCode` = `CAT-SHA-001`, `schemeCategoryName` = `SOCIAL HEALTH AUTHORITY` | 🔴 Critical |
| 12 | `identifier.value` | SHA number | `{CR_NUMBER}-sha-coverage` format | 🔴 Critical |
| 13 | `beneficiary.reference` | Relative reference | Full URL with CR Number | 🟡 Medium |
| 14 | `beneficiary.type` | ❌ Missing | `"Patient"` | 🟡 Medium |

---

## 5. Claim Resource

### Current Implementation
```python
{
    'resourceType': 'Claim',
    'identifier': [{'system': 'urn:vitora:claim', 'value': claim.claim_number}],
    'status': 'active',
    'type': {'coding': [{'system': '...claim-type', 'code': 'institutional'|'professional'}]},
    'use': 'claim',
    'patient': {'reference': f'Patient/{claim.patient.id}'},
    'created': claim.created_at.isoformat(),
    'provider': {'identifier': {'value': claim.facility_code}},
    'priority': {'coding': [{'code': 'normal'}]},
    'diagnosis': [...],
    'item': [...],
    'total': {'value': float(claim.claimed_amount), 'currency': 'KES'}
}
```

### Official Requirement (Key Fields)
```json
{
  "id": "a0016666-8137-47c1-b90c-c8e7c3094a28",
  "identifier": [{
    "system": "https://qa-mis.apeiro-digital.com/fhir/claim",
    "value": "a0016666-8137-47c1-b90c-c8e7c3094a28"
  }],
  "subType": {"coding": [{"system": "...ex-claimsubtype", "code": "op"}]},
  "patient": {
    "reference": "https://qa-mis.apeiro-digital.com/fhir/Patient/CR0000000000001-1",
    "identifier": {"value": "CR0000000000001-1", "use": "official", "system": "...shanumber"},
    "type": "Patient"
  },
  "billablePeriod": {"start": "2025-01-28T00:00:00", "end": "2025-01-29T00:00:00"},
  "insurance": [{
    "sequence": 1,
    "focal": "True",
    "coverage": {"reference": "https://.../Coverage/CR0000000000001-1-sha-coverage"}
  }],
  "provider": {
    "reference": "https://fr.kenya-hie.health/api/v4/Organization/FID-22-101101-0",
    "id": "FID-22-101101-0",
    "type": "Organization",
    "identifier": {...}
  },
  "diagnosis": [{
    "diagnosisCodeableConcept": {
      "coding": [{
        "system": "https://qa-mis.apeiro-digital.com/fhir/terminology/CodeSystem/icd-11",
        "code": "1A00"
      }]
    }
  }],
  "item": [{
    "productOrService": {
      "coding": [{
        "system": "https://qa-mis.apeiro-digital.com/fhir/CodeSystem/intervention-codes",
        "code": "SHA-02-005"
      }]
    },
    "servicedPeriod": {"start": "2025-01-28", "end": "2025-01-28"},
    "category": {"coding": [{"system": "...category-codes", "code": "procedure"}]},
    "extension": [{"url": "...Coverage", "valueReference": {...}}],
    "factor": 1
  }]
}
```

### Issues

| # | Field | Current | Required | Severity |
|---|-------|---------|----------|----------|
| 15 | `id` | ❌ Missing | GUID (same as bundle id) | 🔴 Critical |
| 16 | `identifier.system` | `urn:vitora:claim` | `https://qa-mis.apeiro-digital.com/fhir/claim` | 🔴 Critical |
| 17 | `subType` | ❌ Missing | `"op"` (outpatient) or `"ip"` (inpatient) | 🟡 Medium |
| 18 | `patient` | Simple reference | Full reference with identifier and type | 🔴 Critical |
| 19 | `billablePeriod` | ❌ Missing | Start/end datetime | 🔴 Critical |
| 20 | `insurance` | ❌ Missing | Coverage reference array | 🔴 Critical |
| 21 | `provider` | Simple identifier | Full reference with Organization URL | 🔴 Critical |
| 22 | `diagnosis.coding.system` | `icd-10` | `icd-11` (SHA uses ICD-11!) | 🔴 Critical |
| 23 | `item.productOrService.system` | `urn:vitora:service` | SHA intervention codes system | 🔴 Critical |
| 24 | `item.servicedPeriod` | `servicedDate` only | `servicedPeriod` with start/end | 🟡 Medium |
| 25 | `item.category` | ❌ Missing | Category coding (procedure, drug, etc.) | 🟡 Medium |
| 26 | `item.extension` | ❌ Missing | Coverage reference extension | 🟡 Medium |

---

## 6. Summary of Required Changes

### 🔴 Critical (Must Fix)

1. **Bundle**: Add `id`, `meta.profile`, change `type` to `"message"`
2. **Organization**: Implement complete Organization resource with facility data
3. **Patient**: Use SHA CR Number as ID, update identifier system
4. **Coverage**: Add SHA scheme extensions, fix identifier format
5. **Claim**: Add `id`, `billablePeriod`, `insurance`, fix `provider` structure
6. **Diagnosis**: Change from ICD-10 to ICD-11 coding system
7. **Items**: Use SHA intervention codes system

### 🟡 Medium (Should Fix)

1. Add `fullUrl` to all entry resources
2. Add `meta.profile` to Patient resource
3. Add `name.text` to Patient resource
4. Add `subType` to Claim resource
5. Add `servicedPeriod` instead of `servicedDate` to items
6. Add `category` and `extension` to items

---

## 7. Environment Configuration

### Two Different URL Types

⚠️ **Important Distinction**: There are TWO types of URLs in SHA integration:

#### 1. API Endpoint (for HTTP requests)
```python
# Current - correct for API calls
SHA_API_BASE_URL = 'https://uat.dha.go.ke'
```
This is where we POST the bundle to `/v1/shr-med/bundle`.

#### 2. FHIR Profile/Resource Base URLs (used INSIDE the bundle)
These are **not API endpoints** - they are namespace URLs used within FHIR resources for:
- `meta.profile` references
- `fullUrl` in bundle entries  
- `identifier.system` values
- Resource `reference` URLs

| Environment | FHIR Base URL (for bundle content) |
|-------------|-------------------------------------|
| UAT | `https://qa-mis.apeiro-digital.com` |
| Production | `https://mis.apeiro-digital.com` |

### Required Settings Addition
```python
# Add to settings/base.py
SHA_FHIR_BASE_URL = os.getenv(
    'SHA_FHIR_BASE_URL', 
    'https://qa-mis.apeiro-digital.com'  # UAT default
)
```

This FHIR base URL should be used when building bundle resources, NOT for API calls.

---

## 8. Recommended Action Plan

### Phase 1: Critical Fixes (Blocking)
- [ ] Add Organization resource builder method
- [ ] Update bundle structure (id, meta, type)
- [ ] Fix Patient resource to use CR Number
- [ ] Add Coverage scheme extensions
- [ ] Update Claim resource with all required fields
- [ ] Change diagnosis system to ICD-11

### Phase 2: Medium Priority
- [ ] Add fullUrl to all resources
- [ ] Add meta.profile to resources
- [ ] Update item structure with category/extension

### Phase 3: Testing
- [ ] Create validation function against SHA schema
- [ ] Add integration tests with mock SHA responses
- [ ] Test with SHA UAT environment

---

## 9. Sample Correct Bundle Structure

```json
{
  "id": "{{GUID}}",
  "meta": {
    "profile": ["https://qa-mis.apeiro-digital.com/fhir/StructureDefinition/bundle|1.0.0"]
  },
  "timestamp": "{{ISO_TIMESTAMP}}",
  "type": "message",
  "entry": [
    {"fullUrl": "{{BASE_URL}}/fhir/Organization/{{FACILITY_CODE}}", "resource": {...}},
    {"fullUrl": "{{BASE_URL}}/fhir/Coverage/{{CR_NUMBER}}-sha-coverage", "resource": {...}},
    {"fullUrl": "{{BASE_URL}}/fhir/Patient/{{CR_NUMBER}}", "resource": {...}},
    {"fullUrl": "{{BASE_URL}}/fhir/Claim/{{GUID}}", "resource": {...}}
  ],
  "resourceType": "Bundle"
}
```

---

**Report Generated By**: Vitora HMIS SHA Integration Team  
**Next Review**: Before UAT submission
