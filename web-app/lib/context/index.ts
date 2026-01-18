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
