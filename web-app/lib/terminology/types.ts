/**
 * Terminology Types for Kenya DHA/SHA APIs
 *
 * These types represent the standardized health terminologies used across
 * the Vitora HMIS system for interoperability with Kenya's Digital Health Authority.
 *
 * Supported terminologies:
 * - ICD-11: International Classification of Diseases
 * - ICHI: International Classification of Health Interventions
 * - LOINC: Logical Observation Identifiers Names and Codes (Lab)
 * - SHA Interventions: Kenya SHA procedure/intervention codes
 * - Drug Products: Kenya drug registry with KNHTS codes
 *
 * @see docs/dha-api-usage-analysis.md
 */

// ============================================================================
// ICD-11 (Diagnosis Codes)
// ============================================================================

export interface ICD11Code {
  id: number;
  code: string;
  title: string;
  description?: string;
  chapter?: string;
  block?: string;
  is_active: boolean;
}

/** Simplified ICD-11 selection value for forms */
export interface ICD11SelectValue {
  code: string;
  title: string;
}

// ============================================================================
// SHA Interventions (Procedures)
// ============================================================================

export interface SHAIntervention {
  id: number;
  code: string;
  name: string;
  description?: string;
  category: string;
  price: number;
  currency: string;
  facility_level: number;
  requires_preauthorization: boolean;
  is_active: boolean;
}

// ============================================================================
// ICHI (Health Interventions)
// ============================================================================

export interface ICHICode {
  id: number;
  code: string;
  title: string;
  description?: string;
  block?: string;
  chapter?: string;
  is_active: boolean;
}

/** Simplified ICHI selection value for forms */
export interface ICHISelectValue {
  code: string;
  title: string;
}

// ============================================================================
// LOINC (Lab Test Codes)
// ============================================================================

export interface LOINCCode {
  id: number;
  code: string;
  component: string;
  long_common_name: string;
  property?: string;
  time_aspect?: string;
  system?: string;
  scale_type?: string;
  method_type?: string;
  class_name?: string;
  is_active: boolean;
}

/** Simplified LOINC selection value for forms */
export interface LOINCSelectValue {
  code: string;
  name: string;
}

// ============================================================================
// Drug Products (Kenya Drug Registry)
// ============================================================================

export interface DrugProduct {
  id: number;
  code: string;
  name: string;
  generic_name?: string;
  brand_name?: string;
  dosage_form?: string;
  strength?: string;
  route_of_administration?: string;
  manufacturer?: string;
  price?: number;
  currency?: string;
  is_controlled: boolean;
  is_active: boolean;
}

/** Simplified drug selection value for forms */
export interface DrugSelectValue {
  code: string;
  name: string;
  price?: number;
}

// ============================================================================
// Active Components (Drug Ingredients)
// ============================================================================

export interface ActiveComponent {
  id: number;
  code: string;
  name: string;
  description?: string;
  is_active: boolean;
}

/** Simplified active component selection value */
export interface ActiveComponentSelectValue {
  code: string;
  name: string;
}

// ============================================================================
// Search Parameters
// ============================================================================

export interface TerminologySearchParams {
  search?: string;
  page?: number;
  page_size?: number;
}

export interface InterventionSearchParams extends TerminologySearchParams {
  facility_level?: number;
  category?: string;
}

export interface DrugSearchParams extends TerminologySearchParams {
  dosage_form?: string;
  is_controlled?: boolean;
}

// ============================================================================
// Paginated Response Types
// ============================================================================

export interface PaginatedResponse<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}

export type PaginatedICD11Codes = PaginatedResponse<ICD11Code>;
export type PaginatedSHAInterventions = PaginatedResponse<SHAIntervention>;
export type PaginatedICHICodes = PaginatedResponse<ICHICode>;
export type PaginatedLOINCCodes = PaginatedResponse<LOINCCode>;
export type PaginatedDrugProducts = PaginatedResponse<DrugProduct>;
export type PaginatedActiveComponents = PaginatedResponse<ActiveComponent>;

// ============================================================================
// Terminology Categories (for filtering)
// ============================================================================

export const INTERVENTION_CATEGORIES = [
  'Consultation',
  'Procedure',
  'Surgery',
  'Laboratory',
  'Imaging',
  'Pharmacy',
  'Other',
] as const;

export type InterventionCategory = typeof INTERVENTION_CATEGORIES[number];

export const FACILITY_LEVELS = [1, 2, 3, 4, 5, 6] as const;
export type FacilityLevel = typeof FACILITY_LEVELS[number];

export const DOSAGE_FORMS = [
  'Tablet',
  'Capsule',
  'Syrup',
  'Injection',
  'Cream',
  'Ointment',
  'Drops',
  'Inhaler',
  'Suppository',
  'Other',
] as const;

export type DosageForm = typeof DOSAGE_FORMS[number];
