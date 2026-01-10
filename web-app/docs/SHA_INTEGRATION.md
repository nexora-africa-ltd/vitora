# SHA (Social Health Authority) Frontend Integration

This document describes the frontend implementation for integrating with Kenya's Social Health Authority (SHA) systems in the Vitora HMIS web application.

## Overview

The SHA integration enables healthcare facilities to:
- Verify patient coverage through the Client Registry (CR)
- Check eligibility for SHA benefits
- Submit claims for reimbursement
- Track claim status and payments
- Use standardized medical terminologies (ICD-11, LOINC, ICHI)

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                      Frontend Components                         │
├─────────────────────────────────────────────────────────────────┤
│  ClientRegistryLookup │ EligibilityBanner │ ClaimComponents     │
│  SHAInterventionSelect │ FacilityValidation │ SHA Claims Pages  │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                      React Query Hooks                           │
│  useSHAMembersByPatient │ usePatientEligibility │ useClaims     │
│  useICD11Search │ useLOINCSearch │ useDrugsSearch               │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                      SHA API Client                              │
│  shaApi.fetchFromClientRegistry │ shaApi.checkEligibility       │
│  shaApi.createClaim │ shaApi.submitClaim │ shaApi.searchICD11   │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                      Django Backend API                          │
│  /api/sha/members/ │ /api/sha/eligibility/ │ /api/sha/claims/   │
│  /api/sha/terminology/icd11/ │ /api/sha/terminology/loinc/      │
└─────────────────────────────────────────────────────────────────┘
```

## File Structure

```
web-app/
├── lib/
│   ├── types/
│   │   └── sha.ts              # TypeScript type definitions
│   ├── api/
│   │   └── sha.ts              # API client functions
│   └── hooks/
│       └── use-sha.ts          # React Query hooks
├── components/
│   ├── billing/
│   │   └── sha/
│   │       ├── index.ts                    # Barrel exports
│   │       ├── ClientRegistryLookup.tsx    # CR search component
│   │       ├── EligibilityBanner.tsx       # Coverage display
│   │       ├── SHAInterventionSelect.tsx   # Terminology selects
│   │       ├── ClaimComponents.tsx         # Claim status/tracking
│   │       └── FacilityValidation.tsx      # Facility verification
│   └── patients/
│       └── sha-cr-lookup.tsx   # CR lookup for patient forms
└── app/
    └── (dashboard)/
        └── billing/
            └── sha-claims/
                ├── page.tsx        # Claims list page
                ├── loading.tsx     # Loading skeleton
                └── [id]/
                    ├── page.tsx    # Claim detail page
                    └── loading.tsx # Detail loading skeleton
```

## Components

### ClientRegistryLookup

Search the SHA Client Registry to verify patient identity and auto-populate registration forms.

```tsx
import { ClientRegistryLookup } from '@/components/billing/sha';

<ClientRegistryLookup
  onClientFound={(client) => {
    // Auto-populate form with client data
    form.setValue('first_name', client.first_name);
    form.setValue('national_id', client.id_number);
  }}
  onVerified={(verified, crNumber) => {
    // Update verification status
  }}
/>
```

### EligibilityBanner

Display patient's SHA coverage status with visual indicators.

```tsx
import { EligibilityBanner, CompactEligibilityBanner } from '@/components/billing/sha';

// Full banner for patient detail pages
<EligibilityBanner patientId={patientId} />

// Compact version for lists/cards
<CompactEligibilityBanner patientId={patientId} />
```

### SHAInterventionSelect

Select medical codes from SHA-approved terminologies.

```tsx
import { 
  ICD11Select, 
  LOINCSelect, 
  DrugSelect,
  SHAInterventionSelect 
} from '@/components/billing/sha';

// Diagnosis selection (ICD-11)
<ICD11Select
  value={selectedDiagnosis}
  onChange={(code) => setSelectedDiagnosis(code)}
  placeholder="Search diagnoses..."
/>

// Lab test selection (LOINC)
<LOINCSelect
  value={selectedTest}
  onChange={(code) => setSelectedTest(code)}
/>

// Drug selection
<DrugSelect
  value={selectedDrug}
  onChange={(drug) => setSelectedDrug(drug)}
/>

// Generic SHA intervention
<SHAInterventionSelect
  value={selectedIntervention}
  onChange={(intervention) => setIntervention(intervention)}
  category="procedure"
/>
```

### ClaimComponents

Display and manage SHA claims.

```tsx
import { 
  ClaimStatusBadge,
  ClaimStatusCard,
  ClaimSubmissionButton,
  ClaimTracking,
  ClaimListItem
} from '@/components/billing/sha';

// Status badge
<ClaimStatusBadge status="approved" />

// Full claim card
<ClaimStatusCard claim={claim} onRefresh={refetch} />

// Submit button with loading state
<ClaimSubmissionButton
  claimId={claimId}
  status={status}
  onSubmit={handleSubmit}
/>

// Timeline tracking
<ClaimTracking claim={claim} />
```

### FacilityValidation

Validate facility MFL codes and practitioner licenses.

```tsx
import { FacilityValidation, PractitionerValidation } from '@/components/billing/sha';

// Facility validation
<FacilityValidation
  mflCode={facilityCode}
  onValidated={(info) => console.log('Valid:', info)}
/>

// Practitioner validation
<PractitionerValidation
  licenseNumber={practitionerLicense}
  onValidated={(info) => console.log('Valid:', info)}
/>
```

## Hooks

### Query Hooks

```tsx
import {
  useSHAMembersByPatient,
  usePatientEligibility,
  useClaims,
  useClaim,
  useICD11Search,
  useLOINCSearch,
  useDrugsSearch,
  useInterventionsSearch,
  useValidateFacility,
} from '@/lib/hooks/use-sha';

// Get SHA members for a patient
const { data: members } = useSHAMembersByPatient(patientId);

// Check eligibility
const { data: eligibility, isLoading } = usePatientEligibility(patientId);

// Get claims with filtering
const { data: claims } = useClaims({ 
  status: 'pending',
  patient: patientId 
});

// Search terminologies (debounced)
const { data: diagnoses } = useICD11Search({ search: 'malaria' });
const { data: tests } = useLOINCSearch({ search: 'glucose' });
const { data: drugs } = useDrugsSearch({ search: 'paracetamol' });
```

### Mutation Hooks

```tsx
import {
  useCreateClaim,
  useSubmitClaim,
  useResubmitClaim,
  useCancelClaim,
  useCheckEligibility,
} from '@/lib/hooks/use-sha';

// Create and submit a claim
const createClaim = useCreateClaim();
const submitClaim = useSubmitClaim();

const handleCreateAndSubmit = async () => {
  const claim = await createClaim.mutateAsync({
    invoice_id: invoiceId,
    encounter_id: encounterId,
  });
  await submitClaim.mutateAsync(claim.id);
};
```

## API Client

Direct API access is available through `shaApi`:

```tsx
import { shaApi } from '@/lib/api/sha';

// Client Registry lookup
const client = await shaApi.fetchFromClientRegistry({ 
  id_number: '12345678' 
});

// Check eligibility
const eligibility = await shaApi.checkPatientEligibility(patientId);

// CRUD operations
const claims = await shaApi.getClaims({ status: 'approved' });
const claim = await shaApi.createClaim({ invoice_id: 1 });
const submitted = await shaApi.submitClaim(claim.id);

// Terminology searches
const icd11Codes = await shaApi.searchICD11({ search: 'diabetes' });
const loincCodes = await shaApi.searchLOINC({ search: 'hemoglobin' });
const drugs = await shaApi.searchDrugs({ search: 'amoxicillin' });
```

## Types

Key TypeScript types for SHA integration:

```tsx
import type {
  // Client Registry
  ClientRegistryClient,
  ClientRegistryLookupParams,
  
  // Eligibility
  EligibilityState,
  EligibilityCheckRequest,
  
  // Claims
  Claim,
  ClaimStatus,
  ClaimCreateRequest,
  ClaimListParams,
  ClaimSubmitResponse,
  
  // Terminologies
  ICD11Code,
  LOINCCode,
  DrugProduct,
  SHAIntervention,
  
  // Facility
  FacilityInfo,
  PractitionerInfo,
  
  // SHA Member
  SHAMember,
} from '@/lib/types/sha';
```

## Claim Workflow

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Draft     │────▶│  Submitted  │────▶│  Processing │
└─────────────┘     └─────────────┘     └─────────────┘
                                               │
                    ┌──────────────────────────┼──────────────────────────┐
                    ▼                          ▼                          ▼
             ┌─────────────┐           ┌─────────────┐           ┌─────────────┐
             │  Approved   │           │  Rejected   │           │   Partial   │
             └─────────────┘           └─────────────┘           └─────────────┘
                                              │
                                              ▼
                                       ┌─────────────┐
                                       │ Resubmitted │
                                       └─────────────┘
```

## Status Colors

| Status | Color | Description |
|--------|-------|-------------|
| `draft` | Gray | Claim created, not yet submitted |
| `submitted` | Blue | Sent to SHA, awaiting processing |
| `processing` | Yellow | Being reviewed by SHA |
| `approved` | Green | Claim approved for payment |
| `rejected` | Red | Claim rejected, needs correction |
| `partial` | Orange | Partially approved |
| `cancelled` | Gray | Cancelled by facility |

## Error Handling

Components handle errors gracefully with fallback states:

```tsx
// EligibilityBanner shows "Unable to verify" on error
<EligibilityBanner patientId={patientId} />

// Terminology selects allow manual entry on API failure
<ICD11Select
  value={value}
  onChange={onChange}
  allowManualEntry={true}  // Falls back to free text
/>
```

## Caching Strategy

- **Terminology data**: 30 minute stale time (rarely changes)
- **Eligibility**: 5 minute stale time
- **Claims in progress**: Auto-refetch every 10 seconds
- **Claim list**: Invalidated on create/submit/cancel mutations

## Environment Variables

Ensure these are configured in the backend:

```env
SHA_API_BASE_URL=https://api.sha.go.ke
SHA_CLIENT_ID=your_client_id
SHA_CLIENT_SECRET=your_client_secret
SHA_FACILITY_CODE=your_mfl_code
```

## Related Documentation

- [SHA Frontend Integration Guide](../docs/sha-frontend-integration-guide.md)
- [SHA Implementation Summary](../docs/sha-implementation-summary.md)
- [SHA Claims Bundle Validation](../docs/sha-claims-bundle-validation-report.md)
- [Billing Implementation Plan](../docs/billing-implementation-plan.md)
