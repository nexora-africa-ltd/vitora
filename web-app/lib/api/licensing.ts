import { apiClient } from './client';
import { z } from 'zod';
import { parseResponse } from '@/lib/schemas/validation';
import {
  ActivationResponseSchema,
  HubEulaResponseSchema,
  LicenseStatusSchema,
} from '@/lib/schemas/licensing.schema';
import {
  isDesktop,
  getInstallationId as getTauriInstallationId,
  storeLicenseToken,
  getLicenseToken,
  clearLicenseToken,
} from '@/lib/desktop';
import type {
  ActivationRequest,
  ActivationResponse,
  CheckInRequest,
  GenerateCodeRequest,
  GenerateCodeResponse,
  InstallationDetail,
  InstallationListItem,
  LicenseStatus,
  HubEulaResponse,
  PaginatedInstallations,
} from '@/lib/types/licensing';

const LICENSE_TOKEN_KEY = 'vitora_license_token';
const INSTALLATION_ID_KEY = 'vitora_installation_id';

const InstallationListItemSchema = z.object({
  id: z.number(),
  installation_id: z.string(),
  name: z.string(),
  org_name: z.string(),
  status: z.enum(['PENDING', 'ACTIVE', 'SUSPENDED', 'REVOKED']),
  activated_at: z.string().nullable(),
  last_check_in: z.string().nullable(),
  app_version: z.string(),
  os_info: z.string(),
  created_at: z.string(),
});

const InstallationDetailSchema = InstallationListItemSchema.extend({
  organization: z.number(),
  facility: z.number().nullable(),
  facility_name: z.string(),
  activation_code: z.string(),
  activated_by: z.number().nullable(),
  check_in_ip: z.string(),
  check_in_count: z.number(),
  hostname: z.string(),
  hardware_fingerprint: z.string(),
  binary_manifest_id: z.string(),
  tamper_flagged_at: z.string().nullable(),
  tamper_resolved_at: z.string().nullable(),
  revocation_epoch: z.number(),
  last_reported_hashes: z.record(z.string(), z.string()),
  is_tampered: z.boolean(),
  revoked_at: z.string().nullable(),
  revoked_reason: z.string(),
  updated_at: z.string(),
});

const PaginatedInstallationsSchema = z.object({
  count: z.number(),
  next: z.string().nullable(),
  previous: z.string().nullable(),
  results: z.array(InstallationListItemSchema),
});

const GenerateCodeResponseSchema = z.object({
  id: z.number(),
  activation_code: z.string(),
  organization: z.string(),
  facility: z.string().nullable(),
  status: z.enum(['PENDING', 'ACTIVE', 'SUSPENDED', 'REVOKED']),
});

const SendCodeResponseSchema = z.object({
  sent_to: z.string(),
  organization: z.string(),
});

export const licensingApi = {
  /**
   * Activate an installation with a one-time code.
   * No auth required — the activation code serves as auth.
   */
  async activate(data: ActivationRequest): Promise<ActivationResponse> {
    const response = await apiClient.post('/api/licensing/activate/', data);
    const result = parseResponse(ActivationResponseSchema, response.data, {
      context: 'licensingApi.activate',
    });
    // Store the license token locally
    this.storeToken(result.license_token);
    return result;
  },

  /** Fetch active Hub EULA text/version for activation UX. */
  async getHubEula(): Promise<HubEulaResponse> {
    const response = await apiClient.get('/api/licensing/eula/');
    return parseResponse(HubEulaResponseSchema, response.data, {
      context: 'licensingApi.getHubEula',
    });
  },

  /**
   * Periodic check-in to refresh the license token.
   * Returns updated token with latest plan features/limits.
   */
  async checkIn(data: CheckInRequest): Promise<ActivationResponse> {
    const response = await apiClient.post('/api/licensing/check-in/', data);
    const result = parseResponse(ActivationResponseSchema, response.data, {
      context: 'licensingApi.checkIn',
    });
    // Update the stored token
    this.storeToken(result.license_token);
    return result;
  },

  /**
   * Verify the current license token locally.
   * Uses X-License-Token header (not Authorization to avoid JWT auth conflict).
   */
  async verifyStatus(): Promise<LicenseStatus> {
    const token = this.getStoredToken();
    const headers: Record<string, string> = {};
    if (token) {
      headers['X-License-Token'] = token;
    }
    const response = await apiClient.get('/api/licensing/status/', { headers });
    return parseResponse(LicenseStatusSchema, response.data, {
      context: 'licensingApi.verifyStatus',
    });
  },

  /** Store the license JWT in localStorage. */
  storeToken(token: string): void {
    if (typeof window !== 'undefined') {
      localStorage.setItem(LICENSE_TOKEN_KEY, token);
      // Also persist to Tauri keystore (secure, survives cache clears)
      if (isDesktop()) {
        storeLicenseToken(token).catch(() => {});
      }
    }
  },

  /** Retrieve the stored license JWT (sync — localStorage only). */
  getStoredToken(): string | null {
    if (typeof window !== 'undefined') {
      return localStorage.getItem(LICENSE_TOKEN_KEY);
    }
    return null;
  },

  /**
   * Retrieve the license token, preferring Tauri keystore over localStorage.
   * Use this async version when initializing to restore from keystore.
   */
  async getStoredTokenAsync(): Promise<string | null> {
    if (typeof window === 'undefined') return null;

    // In desktop mode, try the secure keystore first
    if (isDesktop()) {
      const keystoreToken = await getLicenseToken();
      if (keystoreToken) {
        // Sync to localStorage for fast synchronous access
        localStorage.setItem(LICENSE_TOKEN_KEY, keystoreToken);
        return keystoreToken;
      }
    }

    return localStorage.getItem(LICENSE_TOKEN_KEY);
  },

  /** Clear the stored license token. */
  clearToken(): void {
    if (typeof window !== 'undefined') {
      localStorage.removeItem(LICENSE_TOKEN_KEY);
      if (isDesktop()) {
        clearLicenseToken().catch(() => {});
      }
    }
  },

  /**
   * Get the installation ID.
   * In desktop mode: reads from Tauri config (stable, persisted in app data).
   * In browser mode: generates a UUID and stores in localStorage.
   */
  async getInstallationIdAsync(): Promise<string> {
    if (typeof window === 'undefined') return '';

    // In desktop mode, use Tauri's stable client_id
    if (isDesktop()) {
      const tauriId = await getTauriInstallationId();
      if (tauriId) return tauriId;
    }

    // Fallback: localStorage UUID
    return this.getInstallationId();
  },

  /** Synchronous fallback for installation ID (localStorage). */
  getInstallationId(): string {
    if (typeof window === 'undefined') return '';
    let id = localStorage.getItem(INSTALLATION_ID_KEY);
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem(INSTALLATION_ID_KEY, id);
    }
    return id;
  },
};

// ---------------------------------------------------------------------------
// Admin API (Nexora superuser only)
// ---------------------------------------------------------------------------

export const licensingAdminApi = {
  /** List all installations (paginated). */
  async list(params?: { page?: number; search?: string }): Promise<PaginatedInstallations> {
    const response = await apiClient.get('/api/licensing/installations/', { params });
    return parseResponse(PaginatedInstallationsSchema, response.data, {
      context: 'licensingAdminApi.list',
    });
  },

  /** Get installation detail. */
  async get(id: number): Promise<InstallationDetail> {
    const response = await apiClient.get(`/api/licensing/installations/${id}/`);
    return parseResponse(InstallationDetailSchema, response.data, {
      context: 'licensingAdminApi.get',
    });
  },

  /** Revoke an installation. */
  async revoke(id: number, reason?: string): Promise<void> {
    await apiClient.post(`/api/licensing/installations/${id}/revoke/`, { reason });
  },

  /** Suspend an installation. */
  async suspend(id: number, reason?: string): Promise<void> {
    await apiClient.post(`/api/licensing/installations/${id}/suspend/`, { reason });
  },

  /** Reactivate a suspended installation. */
  async reactivate(id: number): Promise<void> {
    await apiClient.post(`/api/licensing/installations/${id}/reactivate/`);
  },

  /** Generate a new activation code. */
  async generateCode(data: GenerateCodeRequest): Promise<GenerateCodeResponse> {
    const response = await apiClient.post('/api/licensing/generate-code/', data);
    return parseResponse(GenerateCodeResponseSchema, response.data, {
      context: 'licensingAdminApi.generateCode',
    });
  },

  /** Email the activation code to the organization's contact email. */
  async sendCode(
    id: number,
    payload?: { to_email: string; subject?: string; body?: string }
  ): Promise<{ sent_to: string; organization: string }> {
    const response = await apiClient.post(
      `/api/licensing/installations/${id}/send-code/`,
      payload || {}
    );
    return parseResponse(SendCodeResponseSchema, response.data, {
      context: 'licensingAdminApi.sendCode',
    });
  },

  /** Update installation fields (e.g., link a facility). */
  async patch(
    id: number,
    data: { facility?: number | null; name?: string }
  ): Promise<InstallationDetail> {
    const response = await apiClient.patch(`/api/licensing/installations/${id}/`, data);
    return parseResponse(InstallationDetailSchema, response.data, {
      context: 'licensingAdminApi.patch',
    });
  },
};
