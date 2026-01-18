/**
 * Terminology Module - Public Exports
 *
 * Centralized module for Kenya DHA/SHA terminology lookups.
 * Provides type-safe APIs and React hooks for:
 * - ICD-11 (Diagnosis codes)
 * - SHA Interventions (Procedures)
 * - ICHI (Health intervention classification)
 * - LOINC (Lab test codes)
 * - Drug Products (Kenya drug registry)
 * - Active Components (Drug ingredients)
 *
 * @example
 * // API usage (framework-agnostic)
 * import { terminologyApi } from '@/lib/terminology';
 * const results = await terminologyApi.searchICD11({ search: 'malaria' });
 *
 * @example
 * // Hook usage (React Query)
 * import { useICD11Search } from '@/lib/terminology';
 * const { data, isLoading } = useICD11Search({ search: 'malaria' });
 */

// Types
export type {
  // ICD-11
  ICD11Code,
  ICD11SelectValue,
  // SHA Interventions
  SHAIntervention,
  // ICHI
  ICHICode,
  ICHISelectValue,
  // LOINC
  LOINCCode,
  LOINCSelectValue,
  // Drugs
  DrugProduct,
  DrugSelectValue,
  // Active Components
  ActiveComponent,
  ActiveComponentSelectValue,
  // Search params
  TerminologySearchParams,
  InterventionSearchParams,
  DrugSearchParams,
  // Paginated responses
  PaginatedResponse,
  PaginatedICD11Codes,
  PaginatedSHAInterventions,
  PaginatedICHICodes,
  PaginatedLOINCCodes,
  PaginatedDrugProducts,
  PaginatedActiveComponents,
  // Categories
  InterventionCategory,
  FacilityLevel,
  DosageForm,
} from './types';

// Constants
export {
  INTERVENTION_CATEGORIES,
  FACILITY_LEVELS,
  DOSAGE_FORMS,
} from './types';

// API functions
export {
  terminologyApi,
  searchICD11,
  searchInterventions,
  searchICHI,
  searchLOINC,
  searchDrugs,
  searchActiveComponents,
} from './api';

// React Query hooks
export {
  terminologyQueryKeys,
  useICD11Search,
  useInterventionsSearch,
  useICHISearch,
  useLOINCSearch,
  useDrugsSearch,
  useActiveComponentsSearch,
} from './hooks';
