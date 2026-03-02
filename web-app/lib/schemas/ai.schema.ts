/**
 * Zod schemas for AI/TibaBot API response validation.
 */

import { z } from 'zod';

/** Schema for a single ICD-10 suggestion */
export const AIICD10SuggestionSchema = z.object({
  code: z.string(),
  description: z.string(),
  confidence: z.number().min(0).max(1),
});

/** Schema for the ICD-10 suggest response */
export const AIICD10SuggestResponseSchema = z.object({
  suggestions: z.array(AIICD10SuggestionSchema),
  clinical_text_preview: z.string().optional(),
  error: z.string().optional(),
});

/** Schema for AI status response */
export const AIStatusSchema = z.object({
  enabled: z.boolean(),
  service_name: z.string(),
  service_available: z.boolean(),
});
