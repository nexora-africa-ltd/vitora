/**
 * Zod schemas for Inpatient API response validation
 *
 * TODO: Implement full schemas matching lib/types/inpatient.ts
 * See lib/schemas/clinic.schema.ts for implementation example.
 */
import { z } from 'zod';

// =============================================================================
// PLACEHOLDER SCHEMAS - TO BE IMPLEMENTED
// =============================================================================

// Admission schemas
export const AdmissionSchema = z.object({}).passthrough();

// Ward/Bed schemas
export const WardSchema = z.object({}).passthrough();
export const BedSchema = z.object({}).passthrough();

// Nursing schemas
export const NursingNoteSchema = z.object({}).passthrough();
export const NursingOrderSchema = z.object({}).passthrough();

// Discharge schemas
export const DischargeSchema = z.object({}).passthrough();

// Paginated responses
export const PaginatedAdmissionSchema = z.object({
  count: z.number(),
  next: z.string().nullable(),
  previous: z.string().nullable(),
  results: z.array(AdmissionSchema),
});

export const PaginatedWardSchema = z.object({
  count: z.number(),
  next: z.string().nullable(),
  previous: z.string().nullable(),
  results: z.array(WardSchema),
});

// Array responses
export const BedArrayResponseSchema = z.object({
  results: z.array(BedSchema),
});

export const NursingNoteArrayResponseSchema = z.object({
  results: z.array(NursingNoteSchema),
});
