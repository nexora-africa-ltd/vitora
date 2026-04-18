/**
 * Zod schemas for membership & join request API response validation
 */
import { z } from 'zod';

// =============================================================================
// MEMBERSHIP SCHEMAS
// =============================================================================

export const MembershipFacilitySchema = z.object({
  id: z.number(),
  name: z.string(),
  mfl_code: z.string(),
});

export const OrgMembershipSchema = z.object({
  id: z.number(),
  organization_id: z.number(),
  organization_name: z.string(),
  role_code: z.string(),
  role_name: z.string(),
  is_primary: z.boolean(),
  facilities: z.array(MembershipFacilitySchema),
});

// =============================================================================
// JOIN REQUEST SCHEMAS
// =============================================================================

export const JoinRequestStatusSchema = z.enum(['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED']);

export const OrgJoinRequestSchema = z.object({
  id: z.number(),
  user: z.number(),
  user_name: z.string(),
  user_email: z.string(),
  organization: z.number(),
  organization_name: z.string(),
  requested_role: z.number().nullable(),
  requested_role_name: z.string(),
  message: z.string(),
  status: JoinRequestStatusSchema,
  reviewed_by: z.number().nullable(),
  reviewed_by_name: z.string(),
  reviewed_at: z.string().nullable(),
  review_notes: z.string(),
  created_at: z.string(),
  updated_at: z.string(),
});

export const PaginatedJoinRequestSchema = z.object({
  count: z.number(),
  next: z.string().nullable(),
  previous: z.string().nullable(),
  results: z.array(OrgJoinRequestSchema),
});
