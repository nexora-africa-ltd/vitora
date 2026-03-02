/**
 * Context exports for Vitora HMIS
 *
 * Patient and Encounter contexts for clinical workflow management.
 */

// Patient Context
export {
  PatientProvider,
  PatientContext,
  usePatientContext,
  useOptionalPatientContext,
  type PatientContextValue,
  type PatientProviderProps,
} from './patient-context';

// Encounter Context
export {
  EncounterProvider,
  EncounterContext,
  useEncounterContext,
  useOptionalEncounterContext,
  type EncounterContextValue,
  type EncounterProviderProps,
} from './encounter-context';

// Page Refresh Context
export {
  PageRefreshProvider,
  usePageRefresh,
  formatLastFetch,
} from './page-refresh-context';

// Sync Context
export {
  SyncProvider,
  useSyncStatus,
  formatLastSync,
} from './sync-context';

// AI Chat Context
export {
  AIChatProvider,
  useAIChatContext,
  useOptionalAIChatContext,
  type AIChatContextValue,
  type AIChatProviderProps,
} from './ai-chat-context';
