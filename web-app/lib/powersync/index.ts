/**
 * PowerSync barrel export
 *
 * Central entry point for all PowerSync-related modules.
 */

// Schema & row types
export { powersyncSchema } from './schema';
export type { PatientRow, EncounterRow, CountyRow, SubCountyRow, WardRow } from './schema';

// Connector
export { VitoraPowerSyncConnector } from './connector';

// Low-level hooks (direct SQLite queries)
export { usePowerSyncQuery, usePowerSyncQueryFirst, usePowerSyncDatabase } from './hooks';

// Dual-mode hooks (PowerSync + React Query fallback)
export { useOfflineQuery } from './use-offline-query';
export type { UseOfflineQueryOptions, UseOfflineQueryResult } from './use-offline-query';
export { useOfflineMutation } from './use-offline-mutation';
export type { UseOfflineMutationOptions, UseOfflineMutationResult } from './use-offline-mutation';

// SQL builders
export {
  buildListQuery,
  buildCountQuery,
  buildDetailQuery,
  buildInsertQuery,
  buildUpdateQuery,
  buildDeleteQuery,
} from './sql-builders';
export type { SqlQuery, ListQueryOptions } from './sql-builders';

// Row → type transformers
export {
  transformCountyRow,
  transformSubCountyRow,
  transformWardRow,
  transformPatientRow,
  transformEncounterRow,
  toNumericId,
  toBool,
} from './transforms';
export type { PatientLocalRecord, EncounterLocalRecord } from './transforms';

// Utilities
export { generateId } from './uuid';
