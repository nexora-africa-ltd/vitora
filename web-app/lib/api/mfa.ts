/**
 * MFA (Multi-Factor Authentication) API Client
 *
 * API functions for MFA operations:
 * - Status checking
 * - TOTP enrollment/setup
 * - MFA verification during login
 * - Backup code management
 * - MFA disable
 */

import { apiClient } from './client';
import { parseResponse } from '@/lib/schemas/validation';
import type { FacilityModules } from '@/lib/auth/context';
import {
  MFAStatusSchema,
  TOTPSetupSchema,
  TOTPConfirmResponseSchema,
  MFAVerifyResponseSchema,
  BackupCodesResponseSchema,
  type MFAStatusSchemaType,
  type TOTPSetupSchemaType,
  type TOTPConfirmRequestSchemaType,
  type TOTPConfirmResponseSchemaType,
  type MFAVerifyRequestSchemaType,
  type MFAVerifyResponseSchemaType,
  type BackupCodesRegenerateRequestSchemaType,
  type BackupCodesResponseSchemaType,
  type MFADisableRequestSchemaType,
} from '@/lib/schemas/mfa.schema';

export interface MFAStatus {
  mfa_enabled: boolean;
  mfa_required: boolean;
  devices_count: number;
  backup_codes_remaining: number;
  has_pending_setup?: boolean;
}

export interface TOTPSetup {
  secret: string;
  qr_code: string;
  provisioning_uri: string;
}

export interface TOTPConfirmResponse {
  confirmed: boolean;
  backup_codes: string[];
}

export interface MFAVerifyUser {
  id: number;
  username: string;
  email: string;
  first_name: string;
  last_name: string;
  is_staff: boolean;
  is_superuser?: boolean;
  role?: string | null;
  role_category?: string | null;
  permissions: string[];
  facility?: {
    id: number;
    mfl_code: string;
    name: string;
    level: string;
    modules: FacilityModules;
    sha_contracted: boolean;
  } | null;
}

export interface MFAVerifyResponse {
  access: string;
  refresh: string;
  user: MFAVerifyUser;
}

export interface BackupCodesResponse {
  backup_codes: string[];
}

export const mfaApi = {
  /**
   * Get current user's MFA status.
   */
  async getStatus(): Promise<MFAStatus> {
    const response = await apiClient.get('/api/mfa/status/');
    return parseResponse(MFAStatusSchema, response.data, {
      context: 'mfaApi.getStatus',
    });
  },

  /**
   * Start TOTP enrollment process.
   * Returns QR code and provisioning URI for authenticator app.
   */
  async startTOTPSetup(): Promise<TOTPSetup> {
    const response = await apiClient.post('/api/mfa/totp/setup/');
    return parseResponse(TOTPSetupSchema, response.data, {
      context: 'mfaApi.startTOTPSetup',
    });
  },

  /**
   * Confirm TOTP enrollment with a valid token.
   * Returns backup codes on success.
   */
  async confirmTOTPSetup(token: string): Promise<TOTPConfirmResponse> {
    const requestData: TOTPConfirmRequestSchemaType = { token };
    const response = await apiClient.post('/api/mfa/totp/confirm/', requestData);
    return parseResponse(TOTPConfirmResponseSchema, response.data, {
      context: 'mfaApi.confirmTOTPSetup',
    });
  },

  /**
   * Verify MFA during login flow.
   * Use either TOTP token or backup code.
   */
  async verifyMFA(
    mfaToken: string,
    options: { token?: string; backupCode?: string }
  ): Promise<MFAVerifyResponse> {
    const requestData: MFAVerifyRequestSchemaType = {
      mfa_token: mfaToken,
      ...(options.token && { token: options.token }),
      ...(options.backupCode && { backup_code: options.backupCode }),
    };

    const response = await apiClient.post('/api/mfa/verify/', requestData);
    return parseResponse(MFAVerifyResponseSchema, response.data, {
      context: 'mfaApi.verifyMFA',
    });
  },

  /**
   * Regenerate backup codes (requires TOTP verification).
   */
  async regenerateBackupCodes(totpToken: string): Promise<BackupCodesResponse> {
    const requestData: BackupCodesRegenerateRequestSchemaType = { token: totpToken };
    const response = await apiClient.post('/api/mfa/backup-codes/regenerate/', requestData);
    return parseResponse(BackupCodesResponseSchema, response.data, {
      context: 'mfaApi.regenerateBackupCodes',
    });
  },

  /**
   * Disable MFA for current user (requires password confirmation).
   */
  async disableMFA(password: string): Promise<void> {
    const requestData: MFADisableRequestSchemaType = { password };
    await apiClient.post('/api/mfa/disable/', requestData);
  },
};