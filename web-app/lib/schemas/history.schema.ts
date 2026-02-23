/**
 * Version History Zod Schemas
 *
 * Validates API responses for model version history endpoints.
 * Supports DHA compliance audit trail requirements.
 */

import { z } from 'zod';

/**
 * Schema for a field change
 */
export const FieldChangeSchema = z.object({
  old: z.union([z.string(), z.number(), z.boolean(), z.null()]),
  new: z.union([z.string(), z.number(), z.boolean(), z.null()]),
});

/**
 * Schema for field changes map
 */
export const FieldChangesSchema = z.record(z.string(), FieldChangeSchema);

/**
 * Schema for history type
 */
export const HistoryTypeSchema = z.enum(['created', 'updated', 'deleted']);

/**
 * Schema for a single version history item
 */
export const VersionHistoryItemSchema = z.object({
  version_id: z.number(),
  history_type: HistoryTypeSchema,
  history_date: z.string(),
  history_user_id: z.number().nullable(),
  history_user: z.string().nullable(),
  changes: FieldChangesSchema,
});

/**
 * Schema for array of version history items
 */
export const VersionHistoryArraySchema = z.array(VersionHistoryItemSchema);

/**
 * Schema for version count response
 */
export const VersionCountSchema = z.object({
  count: z.number(),
});

// Export types inferred from schemas
export type VersionHistoryItemSchemaType = z.infer<typeof VersionHistoryItemSchema>;
export type VersionCountSchemaType = z.infer<typeof VersionCountSchema>;
