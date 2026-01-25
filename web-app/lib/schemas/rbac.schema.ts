/**
 * Zod schemas for RBAC API response validation
 *
 * TODO: Implement full schemas matching lib/types/rbac.ts
 * See lib/schemas/clinic.schema.ts for implementation example.
 */
import { z } from 'zod';

// =============================================================================
// PLACEHOLDER SCHEMAS - TO BE IMPLEMENTED
// =============================================================================

// User schemas
export const UserSchema = z.object({}).passthrough();
export const UserProfileSchema = z.object({}).passthrough();

// Role schemas
export const RoleSchema = z.object({}).passthrough();
export const PermissionSchema = z.object({}).passthrough();

// Group schemas
export const GroupSchema = z.object({}).passthrough();

// Paginated responses
export const PaginatedUserSchema = z.object({
  count: z.number(),
  next: z.string().nullable(),
  previous: z.string().nullable(),
  results: z.array(UserSchema),
});

export const PaginatedRoleSchema = z.object({
  count: z.number(),
  next: z.string().nullable(),
  previous: z.string().nullable(),
  results: z.array(RoleSchema),
});

// Array responses
export const PermissionArrayResponseSchema = z.object({
  results: z.array(PermissionSchema),
});
