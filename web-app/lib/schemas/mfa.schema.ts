/**
 * Zod schemas for MFA (Multi-Factor Authentication) API response validation
 *
 * Implements validation for:
 * - MFA status responses
 * - TOTP setup/enrollment
 * - MFA verification
 * - Backup codes
 *
 * See lib/api/mfa.ts for usage.
 */
import { z } from 'zod';

// =============================================================================
// MFA STATUS SCHEMAS
// =============================================================================

export const MFAStatusSchema = z.object({
  mfa_enabled: z.boolean(),
  mfa_required: z.boolean(),
  devices_count: z.number(),
  backup_codes_remaining: z.number(),
  has_pending_setup: z.boolean().optional(),
});

export type MFAStatusSchemaType = z.infer<typeof MFAStatusSchema>;

// =============================================================================
// TOTP SETUP SCHEMAS
// =============================================================================

export const TOTPSetupSchema = z.object({
  secret: z.string(),
  qr_code: z.string(), // Base64 encoded QR image
  provisioning_uri: z.string(),
});

export type TOTPSetupSchemaType = z.infer<typeof TOTPSetupSchema>;

export const TOTPConfirmRequestSchema = z.object({
  token: z.string().length(6).regex(/^\d{6}$/, 'Token must be 6 digits'),
});

export type TOTPConfirmRequestSchemaType = z.infer<typeof TOTPConfirmRequestSchema>;

export const TOTPConfirmResponseSchema = z.object({
  confirmed: z.boolean(),
  backup_codes: z.array(z.string()),
});

export type TOTPConfirmResponseSchemaType = z.infer<typeof TOTPConfirmResponseSchema>;

// =============================================================================
// MFA VERIFICATION SCHEMAS
// =============================================================================

export const MFAVerifyRequestSchema = z.object({
  mfa_token: z.string(),
  token: z.string().length(6).regex(/^\d{6}$/, 'Token must be 6 digits').optional(),
  backup_code: z.string().optional(),
}).refine(
  (data) => data.token || data.backup_code,
  {
    message: 'Either token or backup_code must be provided',
    path: ['token'],
  }
);

export type MFAVerifyRequestSchemaType = z.infer<typeof MFAVerifyRequestSchema>;

export const MFAVerifyResponseSchema = z.object({
  access: z.string(),
  refresh: z.string(),
});

export type MFAVerifyResponseSchemaType = z.infer<typeof MFAVerifyResponseSchema>;

// =============================================================================
// BACKUP CODES SCHEMAS
// =============================================================================

export const BackupCodesRegenerateRequestSchema = z.object({
  token: z.string().length(6).regex(/^\d{6}$/, 'Token must be 6 digits'),
});

export type BackupCodesRegenerateRequestSchemaType = z.infer<typeof BackupCodesRegenerateRequestSchema>;

export const BackupCodesResponseSchema = z.object({
  backup_codes: z.array(z.string()),
});

export type BackupCodesResponseSchemaType = z.infer<typeof BackupCodesResponseSchema>;

// =============================================================================
// MFA DISABLE SCHEMAS
// =============================================================================

export const MFADisableRequestSchema = z.object({
  password: z.string(),
});

export type MFADisableRequestSchemaType = z.infer<typeof MFADisableRequestSchema>;

// =============================================================================
// LOGIN RESPONSE WITH MFA
// =============================================================================

export const LoginResponseWithMFASchema = z.object({
  mfa_required: z.boolean(),
  mfa_token: z.string().optional(),
  mfa_setup_required: z.boolean().optional(),
  access: z.string().optional(),
  refresh: z.string().optional(),
  user: z.any().optional(), // User object from backend
});

export type LoginResponseWithMFASchemaType = z.infer<typeof LoginResponseWithMFASchema>;