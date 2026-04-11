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

// ---------------------------------------------------------------------------
// Upload event bus — lets SyncProvider react to upload successes/failures
// without coupling the connector to React context.
// ---------------------------------------------------------------------------

export type SyncUploadEvent =
  | { type: 'upload_success'; table: string }
  | { type: 'upload_error'; table: string; message: string; permanent: boolean };

type SyncUploadListener = (event: SyncUploadEvent) => void;
const _listeners = new Set<SyncUploadListener>();

/** Subscribe to upload events. Returns an unsubscribe function. */
export function onSyncUploadEvent(listener: SyncUploadListener): () => void {
  _listeners.add(listener);
  return () => { _listeners.delete(listener); };
}

function emitSyncEvent(event: SyncUploadEvent) {
  _listeners.forEach(fn => fn(event));
}

/**
 * Map PowerSync table names back to Django REST API endpoints.
 * Only tables that support client-side writes need entries here.
 * Read-only reference tables (counties, sub-counties, wards, ICD-10, templates) are omitted.
 */
const TABLE_TO_ENDPOINT: Record<string, string> = {
  // Phase 1: Core tables
  patients_patient: '/api/patients/',
  patients_emergencycontact: '/api/patients/{patient_id}/emergency-contacts/',
  encounters_encounter: '/api/encounters/',

  // Phase 2: Clinical workflow
  triage_triageassessment: '/api/triage/assessments/',
  encounters_diagnosis: '/api/encounters/{encounter_id}/diagnoses/',
  encounters_treatmentplan: '/api/encounters/{encounter_id}/treatment-plan/',
  encounters_medication: '/api/encounters/{encounter_id}/treatment-plan/medications/',

  // Phase 3: Pharmacy, Laboratory, Billing
  pharmacy_prescription: '/api/pharmacy/prescriptions/',
  laboratory_laborder: '/api/lab/orders/',
  laboratory_labresult: '/api/lab/results/',
  billing_invoice: '/api/billing/invoices/',
};

export class VitoraPowerSyncConnector implements PowerSyncBackendConnector {
  /**
   * Returns credentials for the PowerSync service.
   *
   * Calls the dedicated /api/powersync/credentials/ endpoint which
   * returns a purpose-built JWT with the required `kid` header, `sub`
   * claim, and correct `aud` claim that PowerSync Cloud verifies.
   *
   * Falls back to the main access token if the endpoint fails (e.g.
   * backend doesn't have the endpoint yet during a rolling deploy).
   */
  async fetchCredentials() {
    const accessToken = tokenStorage.getAccessToken();

    if (!accessToken) {
      throw new Error('No access token available — user must log in first.');
    }

    // Try the dedicated PowerSync credentials endpoint first
    try {
      const response = await apiClient.get<{
        token: string;
        powersync_url: string;
        expires_at: number;
      }>('/api/powersync/credentials/');

      const { token, powersync_url, expires_at } = response.data;

      return {
        endpoint: powersync_url || POWERSYNC_URL,
        token,
        expiresAt: new Date(expires_at * 1000),
      };
    } catch (error) {
      // Fallback: use the main access token directly (old behavior).
      // This path runs if the backend doesn't have the endpoint yet.
      console.warn('[PowerSync] Credentials endpoint failed, falling back to access token:', error);

      let expiresAt: Date | undefined;
      try {
        const parts = accessToken.split('.');
        const payload = JSON.parse(atob(parts[1] ?? ''));
        if (payload.exp) {
          expiresAt = new Date(payload.exp * 1000);
        }
      } catch {
        // If decode fails, let PowerSync handle expiry via 401
      }

      return {
        endpoint: POWERSYNC_URL,
        token: accessToken,
        expiresAt,
      };
    }
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
      const table = transaction.crud[0]?.table ?? 'unknown';
      emitSyncEvent({ type: 'upload_success', table });
    } catch (error: unknown) {
      const table = transaction.crud[0]?.table ?? 'unknown';
      const message = error instanceof Error ? error.message : 'Upload failed';

      // If it's a permanent error (4xx), discard the entry to avoid infinite retries
      if (error instanceof Error && 'status' in error) {
        const status = (error as { status: number }).status;
        if (status >= 400 && status < 500 && status !== 401 && status !== 429) {
          console.error(
            `[PowerSync] Permanent error uploading ${table}:`,
            error
          );
          emitSyncEvent({ type: 'upload_error', table, message, permanent: true });
          await transaction.complete();
          return;
        }
      }
      emitSyncEvent({ type: 'upload_error', table, message, permanent: false });
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
    if (endpoint.includes('{encounter_id}') && entry.opData?.encounter_id) {
      endpoint = endpoint.replace('{encounter_id}', String(entry.opData.encounter_id));
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
