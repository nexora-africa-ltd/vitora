/**
 * Zod schemas for Patients API response validation
 *
 * TODO: Implement full schemas matching lib/types/patient.ts
 * See lib/schemas/clinic.schema.ts for implementation example.
 */
import { z } from 'zod';

// =============================================================================
// PLACEHOLDER SCHEMAS - TO BE IMPLEMENTED
// =============================================================================

// Patient schemas
export const PatientSchema = z.object({}).passthrough();
export const PatientListItemSchema = z.object({}).passthrough();

// Emergency contact schemas
export const EmergencyContactSchema = z.object({}).passthrough();

// Paginated responses
export const PaginatedPatientSchema = z.object({
  count: z.number(),
  next: z.string().nullable(),
  previous: z.string().nullable(),
  results: z.array(PatientSchema),
});

// Array responses
export const EmergencyContactArrayResponseSchema = z.object({
  results: z.array(EmergencyContactSchema),
});
