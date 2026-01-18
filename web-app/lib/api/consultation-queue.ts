/**
 * Consultation Queue API client.
 *
 * Handles API calls for consultation queue operations:
 * - Fetching the queue
 * - Calling patients
 * - Starting consultations
 * - Bypassing triage
 *
 * Phase 3.3: Call Patient Functionality
 */

import { apiClient } from './client';
import type {
  ConsultationQueueItem,
  ConsultationQueueFilters,
  Encounter,
} from '@/lib/types/encounter';

// =============================================================================
// Types
// =============================================================================

export interface ConsultationQueueResponse {
  results: ConsultationQueueItem[];
  count: number;
  next?: string | null;
  previous?: string | null;
}

// =============================================================================
// API Client
// =============================================================================

export const consultationQueueApi = {
  /**
   * Get the consultation queue.
   *
   * Returns encounters ready for consultation (COMPLETED, BYPASSED, NOT_APPLICABLE triage).
   * Sorted by priority (triage category) then wait time.
   */
  async getQueue(filters?: ConsultationQueueFilters): Promise<ConsultationQueueResponse> {
    const response = await apiClient.get<ConsultationQueueResponse>(
      '/api/encounters/consultation_queue/',
      { params: filters }
    );
    return response.data;
  },

  /**
   * Call a patient for consultation.
   *
   * Sets consultation_status to CALLED and records the call time.
   * Creates a notification for the patient.
   *
   * @param encounterId - The encounter ID to call
   * @returns The updated encounter
   */
  async callPatient(encounterId: number): Promise<Encounter> {
    const response = await apiClient.post<Encounter>(
      `/api/encounters/${encounterId}/call/`
    );
    return response.data;
  },

  /**
   * Start consultation for a patient.
   *
   * Sets consultation_status to IN_PROGRESS and records start time.
   * Only allowed from WAITING or CALLED status.
   *
   * @param encounterId - The encounter ID to start consultation for
   * @returns The updated encounter
   */
  async startConsultation(encounterId: number): Promise<Encounter> {
    const response = await apiClient.post<Encounter>(
      `/api/encounters/${encounterId}/start_consultation/`
    );
    return response.data;
  },

  /**
   * Bypass triage for an encounter.
   *
   * Only allowed for OPTIONAL triage encounters.
   * Sets triage_status to BYPASSED with the given reason.
   *
   * @param encounterId - The encounter ID to bypass triage for
   * @param reason - The bypass reason (required)
   * @param notes - Additional notes (optional, for 'OTHER' reason)
   * @returns The updated encounter
   */
  async bypassTriage(
    encounterId: number,
    reason: string,
    notes?: string
  ): Promise<Encounter> {
    const response = await apiClient.post<Encounter>(
      `/api/encounters/${encounterId}/bypass_triage/`,
      { reason, notes }
    );
    return response.data;
  },
};
