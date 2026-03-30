import type { ClinicType } from '@/lib/types/clinic';

/**
 * Maps procedure categories to their natural clinic type counterparts.
 *
 * When a procedure category has a specific match (e.g., DENTAL → DENTAL clinic),
 * those clinics are shown first. Generic procedure room types are always included
 * as fallback so every procedure can be assigned somewhere.
 */

/** Category-specific clinic types (exact matches) */
export const CATEGORY_CLINIC_MAP: Record<string, ClinicType[]> = {
  DENTAL: ['DENTAL'],
  OPHTHALMIC: ['EYE'],
  ENT: ['ENT'],
  OBSTETRIC: ['ANC', 'PNC'],
  WOUND_CARE: ['DRESSING'],
  INJECTION: ['INJECTION'],
};

/** Generic procedure room types — always available as fallback */
export const GENERIC_PROCEDURE_CLINIC_TYPES: ClinicType[] = [
  'PROCEDURE',
  'SURGICAL',
  'OT',
  'DRESSING',
  'INJECTION',
];

/**
 * Get the clinic types that should be available for a given procedure category.
 * Returns category-specific types first, then generic procedure room types.
 * Deduplicates the result.
 */
export function getClinicTypesForCategory(category: string): ClinicType[] {
  const specific = CATEGORY_CLINIC_MAP[category] ?? [];
  const combined = [...specific, ...GENERIC_PROCEDURE_CLINIC_TYPES];
  return [...new Set(combined)];
}

/**
 * Get ALL possible clinic types that could be assigned to any procedure.
 * Useful for the bulk Room Assignments page (which shows all procedures).
 */
export function getAllProcedureClinicTypes(): ClinicType[] {
  const all = new Set<ClinicType>(GENERIC_PROCEDURE_CLINIC_TYPES);
  for (const types of Object.values(CATEGORY_CLINIC_MAP)) {
    for (const t of types) all.add(t);
  }
  return [...all];
}
