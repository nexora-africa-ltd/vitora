/**
 * Zod schemas for Triage API response validation
 *
 * TODO: Implement full schemas matching lib/types/triage.ts
 * See lib/schemas/clinic.schema.ts for implementation example.
 */
import { z } from 'zod';

// =============================================================================
// PLACEHOLDER SCHEMAS - TO BE IMPLEMENTED
// =============================================================================

// Triage assessment schemas
export const TriageAssessmentSchema = z.object({}).passthrough();
export const TriageVitalsSchema = z.object({}).passthrough();

// Triage queue schemas
export const TriageQueueEntrySchema = z.object({}).passthrough();

// Paginated responses
export const PaginatedTriageAssessmentSchema = z.object({
  count: z.number(),
  next: z.string().nullable(),
  previous: z.string().nullable(),
  results: z.array(TriageAssessmentSchema),
});

// Array responses
export const TriageQueueArrayResponseSchema = z.object({
  results: z.array(TriageQueueEntrySchema),
});
