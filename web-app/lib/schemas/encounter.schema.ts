/**
 * Zod schemas for Encounters API response validation
 *
 * TODO: Implement full schemas matching lib/types/encounter.ts
 * See lib/schemas/clinic.schema.ts for implementation example.
 */
import { z } from 'zod';

// =============================================================================
// PLACEHOLDER SCHEMAS - TO BE IMPLEMENTED
// =============================================================================

// Encounter schemas
export const EncounterSchema = z.object({}).passthrough();
export const EncounterListItemSchema = z.object({}).passthrough();

// Diagnosis schemas
export const DiagnosisSchema = z.object({}).passthrough();
export const ICD10CodeSchema = z.object({}).passthrough();

// Treatment schemas
export const TreatmentPlanSchema = z.object({}).passthrough();

// Paginated responses
export const PaginatedEncounterSchema = z.object({
  count: z.number(),
  next: z.string().nullable(),
  previous: z.string().nullable(),
  results: z.array(EncounterSchema),
});

export const PaginatedICD10CodeSchema = z.object({
  count: z.number(),
  next: z.string().nullable(),
  previous: z.string().nullable(),
  results: z.array(ICD10CodeSchema),
});

// Array responses
export const DiagnosisArrayResponseSchema = z.object({
  results: z.array(DiagnosisSchema),
});
