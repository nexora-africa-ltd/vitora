/**
 * Zod schemas for onboarding/auth API response validation
 */
import { z } from 'zod';

// =============================================================================
// ENUMS
// =============================================================================

export const InvitationStatusSchema = z.enum(['PENDING', 'ACCEPTED', 'EXPIRED', 'REVOKED']);

// =============================================================================
// INVITATION SCHEMAS
// =============================================================================

export const StaffInvitationSchema = z.object({
  id: z.number(),
  token: z.string(),
  email: z.string(),
  organization: z.number(),
  organization_name: z.string(),
  facility: z.number().nullable(),
  facility_name: z.string(),
  role: z.number().nullable(),
  role_name: z.string(),
  department: z.number().nullable(),
  department_name: z.string(),
  job_title: z.string(),
  employee_id: z.string(),
  status: InvitationStatusSchema,
  invited_by: z.number().nullable(),
  invited_by_name: z.string(),
  expires_at: z.string(),
  expires_hours: z.number(),
  accepted_at: z.string().nullable(),
  accepted_user: z.number().nullable(),
  last_sent_at: z.string().nullable(),
  send_count: z.number(),
  is_expired: z.boolean(),
  is_usable: z.boolean(),
  created_at: z.string(),
});

export const PaginatedInvitationSchema = z.object({
  count: z.number(),
  next: z.string().nullable(),
  previous: z.string().nullable(),
  results: z.array(StaffInvitationSchema),
});

export const InvitationPublicSchema = z.object({
  email: z.string(),
  organization_name: z.string(),
  role_name: z.string(),
  department_name: z.string(),
  job_title: z.string(),
  is_expired: z.boolean(),
  is_usable: z.boolean(),
  expires_at: z.string(),
});

export const InvitationAcceptResponseSchema = z.object({
  message: z.string(),
  username: z.string(),
});

// =============================================================================
// AUTH RESPONSE SCHEMAS
// =============================================================================

export const MessageResponseSchema = z.object({
  message: z.string(),
});

// =============================================================================
// DIRECT CREATION CREDENTIAL RESPONSE
// =============================================================================

export const StaffCreateWithCredentialsSchema = z.object({
  temp_password: z.string(),
  id: z.number(),
  user: z.number(),
  user_username: z.string(),
  user_email: z.string(),
  user_first_name: z.string(),
  user_last_name: z.string(),
  full_name: z.string(),
  employee_id: z.string(),
});
