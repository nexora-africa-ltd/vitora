/**
 * Zod schemas for Core API response validation (Locations, Notifications, etc.)
 *
 * TODO: Implement full schemas matching lib/types/*.ts
 * See lib/schemas/clinic.schema.ts for implementation example.
 */
import { z } from 'zod';

// =============================================================================
// PLACEHOLDER SCHEMAS - TO BE IMPLEMENTED
// =============================================================================

// Location schemas (Kenya hierarchy)
export const CountySchema = z.object({}).passthrough();
export const SubCountySchema = z.object({}).passthrough();
export const LocationWardSchema = z.object({}).passthrough();  // Named to avoid collision with inpatient WardSchema

// Notification schemas
export const NotificationSchema = z.object({}).passthrough();

// Clinical template schemas
export const ClinicalTemplateSchema = z.object({}).passthrough();

// Paginated responses
export const PaginatedCountySchema = z.object({
  count: z.number(),
  next: z.string().nullable(),
  previous: z.string().nullable(),
  results: z.array(CountySchema),
});

export const PaginatedNotificationSchema = z.object({
  count: z.number(),
  next: z.string().nullable(),
  previous: z.string().nullable(),
  results: z.array(NotificationSchema),
});

export const PaginatedClinicalTemplateSchema = z.object({
  count: z.number(),
  next: z.string().nullable(),
  previous: z.string().nullable(),
  results: z.array(ClinicalTemplateSchema),
});

// Array responses
export const SubCountyArrayResponseSchema = z.object({
  results: z.array(SubCountySchema),
});

export const LocationWardArrayResponseSchema = z.object({
  results: z.array(LocationWardSchema),
});
