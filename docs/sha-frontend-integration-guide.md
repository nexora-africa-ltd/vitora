# SHA Integration Frontend Guide

> **Purpose**: Guide for frontend developers implementing SHA (Social Health Authority) integration flows in Vitora HMIS.
>
> **Last Updated**: January 9, 2026
>
> **Backend Branch**: `feature/sha-integration`

---

## Overview: Key Integration Points

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      SHA-Enabled Patient Journey                            │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐    ┌───────────┐ │
│  │  REGISTRATION │───▶│  ELIGIBILITY │───▶│   SERVICE    │───▶│   CLAIM   │ │
│  │              │    │    CHECK     │    │  DELIVERY    │    │ SUBMISSION│ │
│  └──────────────┘    └──────────────┘    └──────────────┘    └───────────┘ │
│         │                   │                   │                   │       │
│         ▼                   ▼                   ▼                   ▼       │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐    ┌───────────┐ │
│  │ Client       │    │ Coverage     │    │ Encounter    │    │ FHIR R4   │ │
│  │ Registry     │    │ Verification │    │ + Billing    │    │ Bundle    │ │
│  │ Lookup       │    │ + Copay Info │    │ Items        │    │ Submission│ │
│  └──────────────┘    └──────────────┘    └──────────────┘    └───────────┘ │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Table of Contents

1. [Flow 1: Patient Registration with CR Lookup](#flow-1-patient-registration-with-cr-lookup)
2. [Flow 2: Eligibility Check Before Service](#flow-2-eligibility-check-before-service)
3. [Flow 3: Service Item Selection with SHA Validation](#flow-3-service-item-selection-with-sha-validation)
4. [Flow 4: Claim Submission](#flow-4-claim-submission)
5. [Flow 5: Facility Validation](#flow-5-facility-validation-adminsetup)
6. [API Reference Summary](#api-reference-summary-for-frontend)
7. [Error Handling Patterns](#error-handling-patterns)

---

## Flow 1: Patient Registration with CR Lookup

### When to Trigger
- User enters National ID, Huduma Number, or Passport in registration form
- Trigger on blur or "Verify" button click

### API Sequence

```
1. POST /api/billing/client-registry/fetch/
   Body: { "national_id": "12345678" }

2a. If found → Pre-fill form with CR data
2b. If not found → Allow manual entry, offer to register in CR
```

### UI States

| State | UI Treatment |
|-------|-------------|
| `idle` | Normal input field |
| `searching` | Spinner on input, disable submit |
| `found` | Green checkmark ✓, pre-fill fields, show "CR Verified" badge |
| `not_found` | Yellow info: "Not in Client Registry - will register on save" |
| `error` | Red alert: "CR lookup failed - continue with manual entry" |

### Component Pseudocode

```typescript
// PatientRegistrationForm.tsx
const [crStatus, setCrStatus] = useState<'idle' | 'searching' | 'found' | 'not_found' | 'error'>('idle');
const [crClient, setCrClient] = useState<ClientRegistryClient | null>(null);

async function handleIdVerify(nationalId: string) {
  setCrStatus('searching');
  try {
    const response = await api.post('/billing/client-registry/fetch/', {
      national_id: nationalId
    });
    if (response.data.client) {
      setCrClient(response.data.client);
      setCrStatus('found');
      // Pre-fill form fields
      setValue('first_name', response.data.client.first_name);
      setValue('last_name', response.data.client.last_name);
      setValue('date_of_birth', response.data.client.date_of_birth);
      setValue('gender', response.data.client.gender);
      setValue('cr_number', response.data.client.client_number); // Store CR number
    } else {
      setCrStatus('not_found');
    }
  } catch (error) {
    setCrStatus('error');
    // Allow manual entry - CR is enhancement, not blocker
  }
}
```

### UI Mockup

```
┌─────────────────────────────────────────────────────────────────┐
│ Patient Registration                                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  National ID *                                                  │
│  ┌─────────────────────────────────┐ ┌──────────────┐          │
│  │ 12345678                        │ │ ✓ Verify CR  │          │
│  └─────────────────────────────────┘ └──────────────┘          │
│  ✅ Client Registry: CR-2024-00456                              │
│                                                                 │
│  First Name *              Last Name *         (pre-filled)     │
│  ┌────────────────────┐    ┌────────────────────┐              │
│  │ John               │    │ Doe                │              │
│  └────────────────────┘    └────────────────────┘              │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## Flow 2: Eligibility Check Before Service

### When to Trigger
- When starting a new encounter for a patient
- On patient arrival (check-in flow)
- Before adding billable items

### API Sequence

```
1. GET /api/billing/sha-members/?patient={patient_id}
   → Get patient's SHA membership record

2. POST /api/billing/eligibility/check/
   Body: { "sha_member_id": 123 }
   → Returns eligibility status, coverage end date, copay info
```

### UI States

| State | Color | Action |
|-------|-------|--------|
| `eligible` | 🟢 Green | Proceed with service, show coverage info |
| `ineligible` | 🔴 Red | Block SHA billing, offer cash payment |
| `pending` | 🟡 Yellow | Coverage pending verification |
| `expired` | 🟠 Orange | Coverage expired on {date} |
| `checking` | ⚪ Gray | Spinner while API call |
| `error` | 🔴 Red | API failed, allow manual override with reason |

### Component Pseudocode

```typescript
// EligibilityBanner.tsx
interface EligibilityState {
  status: 'checking' | 'eligible' | 'ineligible' | 'expired' | 'error';
  coverageEndDate?: string;
  copayPercentage?: number;
  memberName?: string;
}

function EligibilityBanner({ patientId }: { patientId: number }) {
  const [eligibility, setEligibility] = useState<EligibilityState>({ status: 'checking' });

  useEffect(() => {
    checkEligibility();
  }, [patientId]);

  async function checkEligibility() {
    try {
      // Step 1: Get SHA member record
      const memberRes = await api.get(`/billing/sha-members/?patient=${patientId}`);
      if (!memberRes.data.results.length) {
        setEligibility({ status: 'ineligible' }); // Not enrolled
        return;
      }

      // Step 2: Check eligibility with SHA
      const eligRes = await api.post('/billing/eligibility/check/', {
        sha_member_id: memberRes.data.results[0].id
      });

      setEligibility({
        status: eligRes.data.is_eligible ? 'eligible' : 'ineligible',
        coverageEndDate: eligRes.data.coverage_end_date,
        copayPercentage: eligRes.data.copay_percentage,
        memberName: eligRes.data.verified_name,
      });
    } catch (error) {
      setEligibility({ status: 'error' });
    }
  }

  return (
    <div className={`eligibility-banner ${eligibility.status}`}>
      {eligibility.status === 'eligible' && (
        <>
          <CheckCircle className="text-green-500" />
          <span>SHA Eligible - Coverage until {eligibility.coverageEndDate}</span>
          {eligibility.copayPercentage > 0 && (
            <Badge>Copay: {eligibility.copayPercentage}%</Badge>
          )}
        </>
      )}
      {eligibility.status === 'ineligible' && (
        <>
          <XCircle className="text-red-500" />
          <span>Not SHA Eligible - Cash payment required</span>
        </>
      )}
    </div>
  );
}
```

### UI Mockup

```
┌─────────────────────────────────────────────────────────────────┐
│ New Encounter - John Doe (MRN-20260109-0042)                    │
├─────────────────────────────────────────────────────────────────┤
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │ ✅ SHA ELIGIBLE                                             │ │
│ │ Coverage: Active until Dec 31, 2026                         │ │
│ │ Scheme: SHIF Employed | Copay: 0%                          │ │
│ │ Verified: John Kamau Doe                                    │ │
│ └─────────────────────────────────────────────────────────────┘ │
│                                                                 │
│  Chief Complaint *                                              │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ Patient presents with...                                │   │
│  └─────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

---

## Flow 3: Service Item Selection with SHA Validation

### When to Trigger
- When adding diagnosis codes (ICD-11 validation)
- When adding procedures (SHA intervention lookup)
- When adding lab tests (LOINC validation)
- When prescribing drugs (Drug product lookup)

### API Endpoints for Autocomplete

```typescript
// Terminology lookups - use for autocomplete/search
GET /api/billing/terminology/icd11/?search=malaria
GET /api/billing/terminology/interventions/?search=consultation&facility_level=3
GET /api/billing/terminology/loinc/?search=glucose
GET /api/billing/terminology/drugs/?search=paracetamol
```

### Component Pattern: SHA-Validated Select

```typescript
// SHAInterventionSelect.tsx
interface Intervention {
  code: string;
  name: string;
  price: number;
  facility_level: number;
}

function SHAInterventionSelect({
  onSelect,
  facilityLevel = 3
}: {
  onSelect: (intervention: Intervention) => void;
  facilityLevel?: number;
}) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Intervention[]>([]);
  const [loading, setLoading] = useState(false);

  // Debounced search
  useEffect(() => {
    if (query.length < 2) return;

    const timer = setTimeout(async () => {
      setLoading(true);
      const res = await api.get('/billing/terminology/interventions/', {
        params: { search: query, facility_level: facilityLevel }
      });
      setResults(res.data.results);
      setLoading(false);
    }, 300);

    return () => clearTimeout(timer);
  }, [query, facilityLevel]);

  return (
    <Combobox onChange={onSelect}>
      <Combobox.Input
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search SHA interventions..."
      />
      <Combobox.Options>
        {loading && <div>Searching SHA catalog...</div>}
        {results.map((intervention) => (
          <Combobox.Option key={intervention.code} value={intervention}>
            <span className="font-mono">{intervention.code}</span>
            <span>{intervention.name}</span>
            <span className="text-green-600">KES {intervention.price}</span>
          </Combobox.Option>
        ))}
      </Combobox.Options>
    </Combobox>
  );
}
```

### UI Mockup

```
┌─────────────────────────────────────────────────────────────────┐
│ Add Service Item                                                │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Service Type: [SHA Intervention ▼]                             │
│                                                                 │
│  Search SHA Interventions                                       │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ consult                                                  │   │
│  └─────────────────────────────────────────────────────────┘   │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ SHA-OPD-001  General Consultation         KES 500       │   │
│  │ SHA-OPD-002  Specialist Consultation      KES 1,200     │   │
│  │ SHA-OPD-003  Emergency Consultation       KES 800       │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## Flow 4: Claim Submission

### When to Trigger
- When encounter is marked as "completed"
- When invoice is finalized
- Manual "Submit to SHA" action

### API Sequence

```
1. POST /api/billing/claims/
   Body: { "invoice_id": 456, "encounter_id": 789 }
   → Creates claim record, returns claim_id

2. POST /api/billing/claims/{claim_id}/submit/
   → Submits FHIR bundle to SHA, returns tracking number

3. GET /api/billing/claims/{claim_id}/
   → Poll for status updates (or use websocket)
```

### Claim States

| Status | UI | Next Action |
|--------|-----|-------------|
| `draft` | 📝 Gray | Edit, then submit |
| `pending` | ⏳ Yellow | Waiting for SHA response |
| `submitted` | 📤 Blue | Tracking number issued |
| `processing` | 🔄 Blue animated | SHA reviewing |
| `approved` | ✅ Green | Payment expected |
| `rejected` | ❌ Red | Show reason, allow resubmit |
| `paid` | 💰 Green | Complete |

### Component Pseudocode

```typescript
// ClaimSubmission.tsx
function ClaimSubmissionButton({ invoiceId, encounterId }: Props) {
  const [claim, setClaim] = useState<Claim | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit() {
    setSubmitting(true);
    try {
      // Step 1: Create claim
      const createRes = await api.post('/billing/claims/', {
        invoice_id: invoiceId,
        encounter_id: encounterId,
      });

      // Step 2: Submit to SHA
      const submitRes = await api.post(`/billing/claims/${createRes.data.id}/submit/`);
      setClaim(submitRes.data);

      // Step 3: Start polling for status
      pollClaimStatus(submitRes.data.id);
    } catch (error) {
      toast.error('Claim submission failed: ' + error.message);
    } finally {
      setSubmitting(false);
    }
  }

  async function pollClaimStatus(claimId: number) {
    const poll = setInterval(async () => {
      const res = await api.get(`/billing/claims/${claimId}/`);
      setClaim(res.data);

      if (['approved', 'rejected', 'paid'].includes(res.data.status)) {
        clearInterval(poll);
      }
    }, 5000); // Poll every 5 seconds
  }

  return (
    <div>
      {!claim && (
        <Button onClick={handleSubmit} loading={submitting}>
          <Upload className="mr-2" />
          Submit to SHA
        </Button>
      )}

      {claim && (
        <ClaimStatusBadge
          status={claim.status}
          trackingNumber={claim.sha_reference}
          rejectionReason={claim.rejection_reason}
        />
      )}
    </div>
  );
}
```

### UI Mockup

```
┌─────────────────────────────────────────────────────────────────┐
│ Invoice #INV-2026-0042                                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Items                                          Amount          │
│  ─────────────────────────────────────────────────────────      │
│  SHA-OPD-001 General Consultation              KES    500       │
│  SHA-LAB-015 Complete Blood Count              KES    350       │
│  SHA-PHM-042 Paracetamol 500mg x 20            KES    150       │
│  ─────────────────────────────────────────────────────────      │
│  Total                                         KES  1,000       │
│  SHA Coverage (100%)                          -KES  1,000       │
│  Patient Copay                                 KES      0       │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ 📤 SHA CLAIM STATUS: APPROVED                           │   │
│  │ Reference: SHA-CLM-2026-00891234                         │   │
│  │ Submitted: Jan 9, 2026 14:32                             │   │
│  │ Approved: Jan 9, 2026 14:35                              │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## Flow 5: Facility Validation (Admin/Setup)

### When to Trigger
- Facility setup/configuration
- Before enabling SHA billing

### API Call

```typescript
POST /api/billing/dha/validate-facility/
Body: { "facility_code": "24979" }

Response: {
  "valid": true,
  "facility": {
    "name": "Sample Health Centre",
    "level": 3,
    "county": "Nairobi",
    "operational_status": "Operational",
    "sha_approved": true,
    "license_expiry": "2027-03-15"
  },
  "errors": []  // or ["License expired", "Not SHA approved"]
}
```

### UI Mockup

```
┌─────────────────────────────────────────────────────────────────┐
│ Facility Settings                                               │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  MFL Code *                                                     │
│  ┌─────────────────────────────────┐ ┌──────────────┐          │
│  │ 24979                           │ │ ✓ Validate   │          │
│  └─────────────────────────────────┘ └──────────────┘          │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ ✅ FACILITY VALIDATED                                    │   │
│  │ Name: Sample Health Centre                               │   │
│  │ Level: 3 | County: Nairobi                              │   │
│  │ SHA Approved: Yes                                        │   │
│  │ License Valid Until: Mar 15, 2027                        │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## API Reference Summary for Frontend

| Flow | Endpoint | Method | Purpose |
|------|----------|--------|---------|
| CR Lookup | `/billing/client-registry/fetch/` | POST | Find patient in national registry |
| CR Register | `/billing/client-registry/register/` | POST | Register new patient in CR |
| CR Update | `/billing/client-registry/update/` | PUT | Update patient in CR |
| Eligibility | `/billing/eligibility/check/` | POST | Verify SHA coverage |
| ICD-11 Search | `/billing/terminology/icd11/` | GET | Diagnosis code lookup |
| Interventions | `/billing/terminology/interventions/` | GET | SHA procedure catalog |
| LOINC Search | `/billing/terminology/loinc/` | GET | Lab test codes |
| ICHI Search | `/billing/terminology/ichi/` | GET | Intervention classification |
| Drug Search | `/billing/terminology/drugs/` | GET | Kenya drug registry |
| Active Components | `/billing/terminology/components/` | GET | Drug ingredients |
| Create Claim | `/billing/claims/` | POST | Create claim from invoice |
| Submit Claim | `/billing/claims/{id}/submit/` | POST | Send to SHA |
| Claim Status | `/billing/claims/{id}/` | GET | Check claim status |
| Facility Validate | `/billing/dha/validate-facility/` | POST | Validate MFL code |
| Practitioner Validate | `/billing/dha/validate-practitioner/` | POST | Validate HWR registration |

---

## Error Handling Patterns

### Graceful Degradation

SHA integration should **enhance** the workflow, not **block** it. If DHA APIs are down, allow manual entry with appropriate warnings.

```typescript
// Graceful degradation - SHA is enhancement, not blocker
try {
  const eligibility = await checkEligibility(patientId);
  showEligibilityBanner(eligibility);
} catch (error) {
  // Log but don't block clinical workflow
  console.error('SHA eligibility check failed:', error);
  showWarningBanner('Unable to verify SHA coverage - proceeding with manual billing');
}
```

### Common Error Responses

| HTTP Status | Meaning | UI Action |
|-------------|---------|-----------|
| `401` | Auth token expired | Refresh token, retry |
| `404` | Not found (CR, facility) | Show "not found" state |
| `422` | Validation error | Show field-level errors |
| `500` | DHA API down | Show warning, allow manual |
| `503` | Service unavailable | Retry with backoff |

### Retry Logic

```typescript
async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  delay: number = 1000
): Promise<T> {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error) {
      if (i === maxRetries - 1) throw error;
      await new Promise(r => setTimeout(r, delay * (i + 1)));
    }
  }
  throw new Error('Max retries exceeded');
}

// Usage
const eligibility = await withRetry(() => checkEligibility(patientId));
```

---

## TypeScript Types Reference

```typescript
// types/sha.ts

interface ClientRegistryClient {
  client_number: string;
  first_name: string;
  last_name: string;
  middle_name?: string;
  date_of_birth: string;
  gender: 'M' | 'F' | 'O';
  national_id?: string;
  huduma_number?: string;
  phone_number?: string;
}

interface EligibilityCheck {
  is_eligible: boolean;
  coverage_end_date?: string;
  copay_percentage: number;
  scheme_category?: string;
  verified_name?: string;
  checked_at: string;
}

interface SHAIntervention {
  code: string;
  name: string;
  description?: string;
  category: string;
  price: number;
  facility_level: number;
  is_active: boolean;
}

interface ICD11Code {
  code: string;
  title: string;
  description?: string;
  chapter?: string;
}

interface Claim {
  id: number;
  invoice_id: number;
  encounter_id: number;
  status: 'draft' | 'pending' | 'submitted' | 'processing' | 'approved' | 'rejected' | 'paid';
  sha_reference?: string;
  submitted_at?: string;
  total_amount: number;
  rejection_reason?: string;
}

interface FacilityInfo {
  facility_code: string;
  name: string;
  level: number;
  county: string;
  operational_status: string;
  sha_approved: boolean;
  license_expiry?: string;
}
```

---

## Related Documentation

- [DHA API Usage Analysis](dha-api-usage-analysis.md) - Detailed API endpoint documentation
- [SHA Implementation Summary](sha-implementation-summary.md) - Backend implementation details
- [Billing Implementation Plan](billing-implementation-plan.md) - Full billing module design

---

**Document Status**: ✅ Complete
**Last Updated**: January 9, 2026
**Author**: Vitora HMIS Development Team
