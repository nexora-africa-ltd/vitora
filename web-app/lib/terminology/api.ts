/**
 * Terminology API Client
 *
 * Pure API functions for Kenya DHA/SHA terminology lookups.
 * These functions are framework-agnostic and can be used with any
 * state management solution (React Query, SWR, Redux, etc.)
 *
 * Backend endpoints are proxied through our Django backend to:
 * - Handle DHA authentication (JWT tokens)
 * - Provide caching and rate limiting
 * - Support offline fallback with local database
 *
 * @see backend/hmis/apps/billing/services/terminology_service.py
 */

import { apiClient } from '@/lib/api/client';
import type {
  TerminologySearchParams,
  InterventionSearchParams,
  DrugSearchParams,
  PaginatedICD11Codes,
  PaginatedSHAInterventions,
  PaginatedICHICodes,
  PaginatedLOINCCodes,
  PaginatedDrugProducts,
  PaginatedActiveComponents,
} from './types';

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Build query string from params object, filtering out empty values
 */
function buildQueryString<T extends object>(params: T): string {
  const searchParams = new URLSearchParams();

  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      searchParams.append(key, String(value));
    }
  });

  return searchParams.toString();
}

/**
 * Build URL with optional query string
 */
function buildUrl(baseUrl: string, params?: object): string {
  if (!params) return baseUrl;
  const queryString = buildQueryString(params);
  return queryString ? `${baseUrl}?${queryString}` : baseUrl;
}

// ============================================================================
// ICD-11 API (Diagnosis Codes)
// ============================================================================

/**
 * Search ICD-11 diagnosis codes
 *
 * @example
 * const results = await searchICD11({ search: 'malaria', page_size: 20 });
 */
export async function searchICD11(
  params?: TerminologySearchParams
): Promise<PaginatedICD11Codes> {
  const url = buildUrl('/api/billing/terminology/icd11/', params);
  const response = await apiClient.get(url);
  return response.data;
}

// ============================================================================
// SHA Interventions API (Procedures)
// ============================================================================

/**
 * Search SHA interventions/procedures
 *
 * @example
 * const results = await searchInterventions({
 *   search: 'consultation',
 *   facility_level: 4,
 *   page_size: 20
 * });
 */
export async function searchInterventions(
  params?: InterventionSearchParams
): Promise<PaginatedSHAInterventions> {
  const url = buildUrl('/api/billing/terminology/interventions/', params);
  const response = await apiClient.get(url);
  return response.data;
}

// ============================================================================
// ICHI API (Health Interventions Classification)
// ============================================================================

/**
 * Search ICHI (International Classification of Health Interventions) codes
 *
 * @example
 * const results = await searchICHI({ search: 'appendectomy' });
 */
export async function searchICHI(
  params?: TerminologySearchParams
): Promise<PaginatedICHICodes> {
  const url = buildUrl('/api/billing/terminology/ichi/', params);
  const response = await apiClient.get(url);
  return response.data;
}

// ============================================================================
// LOINC API (Lab Test Codes)
// ============================================================================

/**
 * Search LOINC laboratory test codes
 *
 * @example
 * const results = await searchLOINC({ search: 'hemoglobin' });
 */
export async function searchLOINC(
  params?: TerminologySearchParams
): Promise<PaginatedLOINCCodes> {
  const url = buildUrl('/api/billing/terminology/loinc/', params);
  const response = await apiClient.get(url);
  return response.data;
}

// ============================================================================
// Drug Products API (Kenya Drug Registry)
// ============================================================================

/**
 * Search Kenya drug registry products
 *
 * @example
 * const results = await searchDrugs({
 *   search: 'paracetamol',
 *   dosage_form: 'Tablet'
 * });
 */
export async function searchDrugs(
  params?: DrugSearchParams
): Promise<PaginatedDrugProducts> {
  const url = buildUrl('/api/billing/terminology/drugs/', params);
  const response = await apiClient.get(url);
  return response.data;
}

// ============================================================================
// Active Components API (Drug Ingredients)
// ============================================================================

/**
 * Search drug active components/ingredients
 *
 * @example
 * const results = await searchActiveComponents({ search: 'acetaminophen' });
 */
export async function searchActiveComponents(
  params?: TerminologySearchParams
): Promise<PaginatedActiveComponents> {
  const url = buildUrl('/api/billing/terminology/active-components/', params);
  const response = await apiClient.get(url);
  return response.data;
}

// ============================================================================
// Exported API Object
// ============================================================================

export const terminologyApi = {
  searchICD11,
  searchInterventions,
  searchICHI,
  searchLOINC,
  searchDrugs,
  searchActiveComponents,
} as const;

export default terminologyApi;
