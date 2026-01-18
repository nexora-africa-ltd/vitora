/**
 * Terminology Components - Public Exports
 *
 * Reusable select components for Kenya DHA/SHA terminologies.
 * These components provide searchable dropdowns with debounced search,
 * loading states, and consistent styling.
 *
 * @example
 * import { ICD11Select, LOINCSelect, DrugProductSelect } from '@/components/terminology';
 *
 * <ICD11Select onSelect={handleDiagnosis} />
 * <LOINCSelect onSelect={handleLabTest} />
 * <DrugProductSelect onSelect={handleDrug} showPrice />
 */

// ICD-11 Diagnosis Codes
export { ICD11Select } from './ICD11Select';
export type { ICD11SelectProps } from './ICD11Select';

// LOINC Lab Test Codes
export { LOINCSelect } from './LOINCSelect';
export type { LOINCSelectProps } from './LOINCSelect';

// Kenya Drug Registry
export { DrugProductSelect } from './DrugProductSelect';
export type { DrugProductSelectProps } from './DrugProductSelect';

// ICHI Health Interventions
export { ICHISelect } from './ICHISelect';
export type { ICHISelectProps } from './ICHISelect';

// SHA Interventions (with pricing)
export { SHAInterventionSelect } from './SHAInterventionSelect';
export type { SHAInterventionSelectProps } from './SHAInterventionSelect';

// Drug Active Components
export { ActiveComponentSelect } from './ActiveComponentSelect';
export type { ActiveComponentSelectProps } from './ActiveComponentSelect';

// Re-export types from lib for convenience
export type {
  ICD11SelectValue,
  LOINCSelectValue,
  DrugSelectValue,
  ICHISelectValue,
  ActiveComponentSelectValue,
  SHAIntervention,
} from '@/lib/terminology';
