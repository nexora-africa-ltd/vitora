/**
 * PowerSync Connector
 *
 * Implements the two methods PowerSync requires:
 *   1. fetchCredentials() — returns a JWT for the PowerSync service
 *   2. uploadData()       — pushes local writes to the Django REST API
 *
 * The connector bridges PowerSync's local SQLite ↔ Django backend.
 */

import {
  AbstractPowerSyncDatabase,
  CrudEntry,
  PowerSyncBackendConnector,
  UpdateType,
} from '@powersync/web';
import { tokenStorage } from '@/lib/auth/storage';
import { apiClient } from '@/lib/api/client';

/** URL of the PowerSync service (Cloud or self-hosted). */
const POWERSYNC_URL = process.env.NEXT_PUBLIC_POWERSYNC_URL || '';

/**
 * Map PowerSync table names back to Django REST API endpoints.
 * Only tables that support client-side writes need entries here.
 * Read-only reference tables (counties, sub-counties, wards) are omitted.
 */
const TABLE_TO_ENDPOINT: Record<string, string> = {
  patients_patient: '/api/patients/',
  patients_emergencycontact: '/api/patients/{patient_id}/emergency-contacts/',
  encounters_encounter: '/api/encounters/',
};

export class VitoraPowerSyncConnector implements PowerSyncBackendConnector {
  /**
   * Returns credentials for the PowerSync service.
   * Re-uses the JWT access token from Django auth (already in localStorage).
   * The token now contains facility_id and organization_id claims
   * that PowerSync uses to evaluate sync rules.
   */
  async fetchCredentials() {
    const token = tokenStorage.getAccessToken();

    if (!token) {
      throw new Error('No access token available — user must log in first.');
    }

    // Decode token expiry without a library (JWT is base64url)
    let expiresAt: Date | undefined;
    try {
      const payload = JSON.parse(atob(token.split('.')[1]));
      if (payload.exp) {
        expiresAt = new Date(payload.exp * 1000);
      }
    } catch {
      // If decode fails, let PowerSync handle expiry via 401
    }

    return {
      endpoint: POWERSYNC_URL,
      token,
      expiresAt,
    };
  }

  /**
   * Uploads local mutations to the Django REST API.
   *
   * PowerSync calls this whenever there are pending local writes.
   * Each CrudEntry represents a CREATE, UPDATE, or DELETE that happened
   * while the user was offline (or online — PowerSync always writes locally first).
   *
   * Strategy:
   *   - CREATE → POST to the table's endpoint
   *   - UPDATE → PATCH to the table's endpoint/{id}/
   *   - DELETE → DELETE to the table's endpoint/{id}/
   *
   * On success, the entry is removed from the upload queue.
   * On failure, PowerSync retries automatically with backoff.
   */
  async uploadData(database: AbstractPowerSyncDatabase): Promise<void> {
    const transaction = await database.getNextCrudTransaction();
    if (!transaction) return;

    try {
      for (const entry of transaction.crud) {
        await this.uploadCrudEntry(entry);
      }
      await transaction.complete();
    } catch (error: unknown) {
      // If it's a permanent error (4xx), discard the entry to avoid infinite retries
      if (error instanceof Error && 'status' in error) {
        const status = (error as { status: number }).status;
        if (status >= 400 && status < 500 && status !== 401 && status !== 429) {
          console.error(
            `[PowerSync] Permanent error uploading ${transaction.crud[0]?.table}:`,
            error
          );
          await transaction.complete();
          return;
        }
      }
      throw error; // Retryable — let PowerSync handle backoff
    }
  }

  /**
   * Upload a single CRUD entry to the Django API.
   */
  private async uploadCrudEntry(entry: CrudEntry): Promise<void> {
    const endpointTemplate = TABLE_TO_ENDPOINT[entry.table];
    if (!endpointTemplate) {
      console.warn(`[PowerSync] No endpoint mapping for table: ${entry.table}`);
      return;
    }

    // Build the endpoint URL, replacing path parameters from the entry data
    let endpoint = endpointTemplate;
    if (endpoint.includes('{patient_id}') && entry.opData?.patient_id) {
      endpoint = endpoint.replace('{patient_id}', String(entry.opData.patient_id));
    }

    switch (entry.op) {
      case UpdateType.PUT: {
        // CREATE: POST to collection endpoint
        const { id: _id, ...data } = entry.opData ?? {};
        await apiClient.post(endpoint, data);
        break;
      }
      case UpdateType.PATCH: {
        // UPDATE: PATCH to detail endpoint
        await apiClient.patch(`${endpoint}${entry.id}/`, entry.opData);
        break;
      }
      case UpdateType.DELETE: {
        // DELETE: DELETE to detail endpoint
        await apiClient.delete(`${endpoint}${entry.id}/`);
        break;
      }
    }
  }
}
