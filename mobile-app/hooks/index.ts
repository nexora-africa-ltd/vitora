/**
 * Hooks Index
 *
 * Central export for all custom hooks.
 */

// Patient hooks
export { usePatients, patientKeys } from './usePatients';
export { usePatient } from './usePatient';
export { useCreatePatient } from './useCreatePatient';
export type { UseCreatePatientOptions } from './useCreatePatient';
export { useUpdatePatient } from './useUpdatePatient';
export type { UpdatePatientInput, UseUpdatePatientOptions } from './useUpdatePatient';

// Sync and connectivity hooks
export { useOfflineStatus } from './useOfflineStatus';
export type { OfflineStatus } from './useOfflineStatus';
export { useSyncStatus } from './useSyncStatus';
export type { SyncStatus, SyncStatusSummary } from './useSyncStatus';

// Billing hooks
export { useInvoice, useInvoicePayments, useInvoices } from './useBilling';

// SHA hooks
export {
	useCheckSHAEligibility,
	useDirectSHAEligibility,
	useSHAEligibility,
	shaKeys,
} from './useSHA';
