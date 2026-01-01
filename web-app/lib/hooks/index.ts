/**
 * Barrel export for custom hooks.
 */

export { useDebounce } from './use-debounce';
export {
  useEncounters,
  useEncounter,
  useEncounterDiagnoses,
  useEncounterTreatmentPlan,
  useCreateEncounter,
  useUpdateEncounter,
} from './use-encounters';
export { useCounties, useSubCounties, useWards, useLocationSelector } from './use-locations';
export { useNetworkStatus } from './use-network-status';
export { usePatients, usePatient } from './use-patients';
export { useToast, toast } from './use-toast';
export { useToastNotification } from './use-toast-notification';
