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
  webauthn_credentials_count: z.number().default(0),
  backup_codes_remaining: z.number(),
  has_pending_setup: z.boolean().optional(),
  available_methods: z.array(z.string()).default([]),
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

// User schema for MFA verify response (matches auth context User type)
const FacilityModulesSchema = z.object({
  outpatient: z.boolean(),
  inpatient: z.boolean(),
  emergency: z.boolean(),
  pharmacy: z.boolean(),
  laboratory: z.boolean(),
  imaging: z.boolean(),
  theatre: z.boolean(),
  dialysis: z.boolean(),
  icu: z.boolean(),
  maternity: z.boolean(),
  mortuary: z.boolean(),
  blood_bank: z.boolean(),
  inventory: z.boolean(),
});

const UserFacilitySchema = z.object({
  id: z.number(),
  mfl_code: z.string(),
  name: z.string(),
  level: z.string(),
  modules: FacilityModulesSchema,
  sha_contracted: z.boolean(),
});

export const MFAVerifyUserSchema = z.object({
  id: z.number(),
  username: z.string(),
  email: z.string(),
  first_name: z.string(),
  last_name: z.string(),
  is_staff: z.boolean(),
  is_superuser: z.boolean().optional(),
  role: z.string().nullable().optional(),
  role_display: z.string().nullable().optional(),
  role_category: z.string().nullable().optional(),
  phone_number: z.string().nullable().optional(),
  permissions: z.array(z.string()),
  facility: UserFacilitySchema.nullable().optional(),
});

export const MFAVerifyResponseSchema = z.object({
  access: z.string(),
  refresh: z.string(),
  user: MFAVerifyUserSchema,
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
// WEBAUTHN / PASSKEY SCHEMAS
// =============================================================================

export const WebAuthnCredentialSchema = z.object({
  id: z.number(),
  name: z.string(),
  created_at: z.string(),
  last_used_at: z.string().nullable(),
  backed_up: z.boolean(),
  transports: z.array(z.string()),
});

export type WebAuthnCredentialSchemaType = z.infer<typeof WebAuthnCredentialSchema>;

export const WebAuthnCredentialListSchema = z.array(WebAuthnCredentialSchema);

export const WebAuthnRegisterBeginResponseSchema = z.object({
  options: z.string(), // JSON string of PublicKeyCredentialCreationOptions
});

export type WebAuthnRegisterBeginResponseSchemaType = z.infer<typeof WebAuthnRegisterBeginResponseSchema>;

export const WebAuthnAuthenticateBeginResponseSchema = z.object({
  options: z.string(), // JSON string of PublicKeyCredentialRequestOptions
});

export type WebAuthnAuthenticateBeginResponseSchemaType = z.infer<typeof WebAuthnAuthenticateBeginResponseSchema>;

// =============================================================================
// LOGIN RESPONSE WITH MFA
// =============================================================================

export const LoginResponseWithMFASchema = z.object({
  mfa_required: z.boolean(),
  mfa_token: z.string().optional(),
  mfa_setup_required: z.boolean().optional(),
  available_methods: z.array(z.string()).optional(),
  access: z.string().optional(),
  refresh: z.string().optional(),
  user: z.any().optional(),
});

export type LoginResponseWithMFASchemaType = z.infer<typeof LoginResponseWithMFASchema>;
