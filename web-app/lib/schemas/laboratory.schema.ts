/**
 * Zod schemas for Laboratory API response validation
 *
 * TODO: Implement full schemas matching lib/types/laboratory.ts
 * See lib/schemas/clinic.schema.ts for implementation example.
 */
import { z } from 'zod';

// =============================================================================
// PLACEHOLDER SCHEMAS - TO BE IMPLEMENTED
// =============================================================================

// Lab test schemas
export const LabTestSchema = z.object({}).passthrough();
export const LabTestCatalogSchema = z.object({}).passthrough();

// Lab order schemas
export const LabOrderSchema = z.object({}).passthrough();
export const LabOrderItemSchema = z.object({}).passthrough();

// Lab result schemas
export const LabResultSchema = z.object({}).passthrough();

// Paginated responses
export const PaginatedLabTestCatalogSchema = z.object({
  count: z.number(),
  next: z.string().nullable(),
  previous: z.string().nullable(),
  results: z.array(LabTestCatalogSchema),
});

export const PaginatedLabOrderSchema = z.object({
  count: z.number(),
  next: z.string().nullable(),
  previous: z.string().nullable(),
  results: z.array(LabOrderSchema),
});

// Array responses
export const LabOrderItemArrayResponseSchema = z.object({
  results: z.array(LabOrderItemSchema),
});

export const LabResultArrayResponseSchema = z.object({
  results: z.array(LabResultSchema),
});
