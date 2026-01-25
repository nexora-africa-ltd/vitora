/**
 * Zod schemas for SHA (Social Health Authority) API response validation
 *
 * TODO: Implement full schemas matching lib/types/sha.ts
 * See lib/schemas/clinic.schema.ts for implementation example.
 */
import { z } from 'zod';

// =============================================================================
// PLACEHOLDER SCHEMAS - TO BE IMPLEMENTED
// =============================================================================

// SHA member schemas
export const SHAMemberSchema = z.object({}).passthrough();
export const SHAMemberSearchResultSchema = z.object({}).passthrough();

// SHA claim schemas
export const SHAClaimSchema = z.object({}).passthrough();
export const SHAClaimItemSchema = z.object({}).passthrough();

// SHA preauthorization schemas
export const SHAPreauthorizationSchema = z.object({}).passthrough();

// Paginated responses
export const PaginatedSHAClaimSchema = z.object({
  count: z.number(),
  next: z.string().nullable(),
  previous: z.string().nullable(),
  results: z.array(SHAClaimSchema),
});

// Array responses
export const SHAClaimItemArrayResponseSchema = z.object({
  results: z.array(SHAClaimItemSchema),
});
