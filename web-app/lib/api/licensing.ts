import { apiClient } from './client';
import { parseResponse } from '@/lib/schemas/validation';
import { ActivationResponseSchema, LicenseStatusSchema } from '@/lib/schemas/licensing.schema';
import type {
  ActivationRequest,
  ActivationResponse,
  CheckInRequest,
  LicenseStatus,
} from '@/lib/types/licensing';

const LICENSE_TOKEN_KEY = 'vitora_license_token';

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
    }
  },

  /** Retrieve the stored license JWT. */
  getStoredToken(): string | null {
    if (typeof window !== 'undefined') {
      return localStorage.getItem(LICENSE_TOKEN_KEY);
    }
    return null;
  },

  /** Clear the stored license token. */
  clearToken(): void {
    if (typeof window !== 'undefined') {
      localStorage.removeItem(LICENSE_TOKEN_KEY);
    }
  },

  /** Get the installation ID (generated on first run, persisted). */
  getInstallationId(): string {
    if (typeof window === 'undefined') return '';
    const KEY = 'vitora_installation_id';
    let id = localStorage.getItem(KEY);
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem(KEY, id);
    }
    return id;
  },
};
