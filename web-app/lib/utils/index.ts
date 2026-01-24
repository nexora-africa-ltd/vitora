// Utility exports
export { cn } from './cn';
export {
  formatDate,
  formatDateTime,
  formatRelativeTime,
  calculateAge,
  formatPhoneNumber,
  formatCurrency,
  formatMRN,
} from './format';
export {
  API_BASE_URL,
  APP_NAME,
  APP_ENV,
  GENDER_OPTIONS,
  REFERRAL_SOURCE_OPTIONS,
  RELATIONSHIP_OPTIONS,
  ENCOUNTER_TYPES,
  ENCOUNTER_STATUS,
  VITAL_RANGES,
  DEFAULT_PAGE_SIZE,
  PAGE_SIZE_OPTIONS,
} from './constants';
export type {
  Gender,
  ReferralSource,
  Relationship,
  EncounterType,
  EncounterStatusType,
} from './constants';

// Idempotency utilities (Sprint 1.7)
export {
  generateIdempotencyKey,
  getOrCreateIdempotencyKey,
  clearIdempotencyKey,
  useIdempotencyKey,
} from './idempotency';
