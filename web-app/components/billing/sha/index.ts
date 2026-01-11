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

// Eligibility
export { 
  EligibilityBanner, 
  useEligibilityCheck,
} from './EligibilityBanner';

// Terminology Selects
export {
  SHAInterventionSelect,
  ICD11Select,
  LOINCSelect,
  DrugSelect,
} from './SHAInterventionSelect';

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

// Facility & Practitioner Validation
export {
  FacilityValidation,
  PractitionerValidation,
} from './FacilityValidation';
