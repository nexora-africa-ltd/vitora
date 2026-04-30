/**
 * SHA Integration Components
 * Re-exports all SHA-related components for easy imports
 */

// Client Registry
export {
  ClientRegistryLookup,
  useClientRegistryLookup,
} from './ClientRegistryLookup';

// SHA Verification Modal (combined CR + Eligibility)
export { SHAVerificationModal } from './SHAVerificationModal';
export type { SHAPayloadPerson } from '@/lib/types/sha';

// Eligibility
export {
  EligibilityBanner,
  useEligibilityCheck,
} from './EligibilityBanner';

// Terminology Selects - Re-export from centralized terminology module
// DEPRECATED: Import directly from '@/components/terminology' instead
export {
  SHAInterventionSelect,
  ICD11Select,
  LOINCSelect,
  DrugProductSelect as DrugSelect, // Alias for backward compatibility
} from '@/components/terminology';

// Claims
export {
  ClaimStatusBadge,
  ClaimSubmissionButton,
  ClaimStatusCard,
  ClaimTracking,
  ClaimListItem,
} from './ClaimComponents';

// Claim Items Table with coverage type (SHA Integration Checklist #13)
export { ClaimItemsTable } from './ClaimItemsTable';

// PFMS Coverage Toggle (SHA Integration Checklist #13)
export { PFMSToggle } from './PFMSToggle';

// Dependents View for Principal Members
export { DependentsView } from './DependentsView';

// Facility & Practitioner Validation
export {
  FacilityValidation,
  PractitionerValidation,
} from './FacilityValidation';

// DHA HIE Consent & Pre-authorization
export { ConsentPanel } from './ConsentPanel';
export { PreauthPanel } from './PreauthPanel';

// DHA HIE Flow visual indicator (SHIF / PHC / ECCIF)
export { ClaimFlowBadge } from './ClaimFlowBadge';
