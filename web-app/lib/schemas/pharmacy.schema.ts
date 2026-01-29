/**
 * Zod schemas for Pharmacy API response validation
 *
 * TODO: Implement full schemas matching lib/types/pharmacy.ts
 * See lib/schemas/clinic.schema.ts for implementation example.
 */
import { z } from 'zod';

// =============================================================================
// PLACEHOLDER SCHEMAS - TO BE IMPLEMENTED
// =============================================================================

// Drug schemas
export const DrugSchema = z.object({}).passthrough();
export const DrugListItemSchema = z.object({}).passthrough();

// Drug category registry schemas
export const DrugCategorySchema = z.object({
  id: z.number(),
  code: z.string(),
  name: z.string(),
  value: z.string(),
  label: z.string(),
  is_active: z.boolean().optional(),
  created_at: z.string().optional(),
  updated_at: z.string().optional(),
});

export const PaginatedDrugCategorySchema = z.object({
  count: z.number(),
  next: z.string().nullable(),
  previous: z.string().nullable(),
  results: z.array(DrugCategorySchema),
});

// Prescription schemas
export const PrescriptionSchema = z.object({}).passthrough();
export const PrescriptionItemSchema = z.object({}).passthrough();

// Dispensing schemas
export const DispensingSchema = z.object({}).passthrough();

// Inventory schemas
export const InventoryItemSchema = z.object({}).passthrough();
export const InventoryBatchSchema = z.object({}).passthrough();
export const StockMovementSchema = z.object({}).passthrough();

// Paginated responses
export const PaginatedDrugSchema = z.object({
  count: z.number(),
  next: z.string().nullable(),
  previous: z.string().nullable(),
  results: z.array(DrugSchema),
});

export const PaginatedPrescriptionSchema = z.object({
  count: z.number(),
  next: z.string().nullable(),
  previous: z.string().nullable(),
  results: z.array(PrescriptionSchema),
});

export const PaginatedInventoryItemSchema = z.object({
  count: z.number(),
  next: z.string().nullable(),
  previous: z.string().nullable(),
  results: z.array(InventoryItemSchema),
});

// Array responses
export const PrescriptionItemArrayResponseSchema = z.object({
  results: z.array(PrescriptionItemSchema),
});
