/**
 * Frontend Events API client
 * 
 * Handles logging user interactions and clinical workflow events
 * to the backend for analytics, debugging, and compliance tracking.
 */

import { apiClient } from './client';

/**
 * Event types that can be logged
 */
export type FrontendEventType =
  // Navigation events
  | 'page_view'
  | 'modal_open'
  | 'tab_switch'
  // Clinical workflow events
  | 'encounter_open'
  | 'encounter_save'
  | 'encounter_finalize'
  | 'diagnosis_add'
  | 'diagnosis_update'
  | 'diagnosis_remove'
  | 'lab_order_create'
  | 'lab_result_view'
  | 'prescription_create'
  | 'prescription_dispense'
  // Patient events
  | 'patient_view'
  | 'patient_search'
  // Form events
  | 'form_start'
  | 'form_save'
  | 'form_submit'
  | 'form_error'
  // Offline events
  | 'offline_queue'
  | 'offline_sync'
  // Other
  | 'custom';

/**
 * Device types
 */
export type DeviceType = 'web' | 'desktop' | 'mobile';

/**
 * Resource types that events can be associated with
 */
export type ResourceType =
  | 'Patient'
  | 'Encounter'
  | 'Diagnosis'
  | 'LabOrder'
  | 'LabResult'
  | 'Prescription'
  | 'Invoice'
  | 'Payment'
  | '';

/**
 * Frontend event data structure
 */
export interface FrontendEvent {
  id?: number;
  event_type: FrontendEventType;
  resource_type: ResourceType;
  resource_id?: number | null;
  client_timestamp: string; // ISO string
  server_timestamp?: string;
  session_id: string;
  device_type: DeviceType;
  details: Record<string, unknown>;
  was_offline: boolean;
}

/**
 * Response from logging a single event
 */
export interface LogEventResponse extends FrontendEvent {
  id: number;
  server_timestamp: string;
  username: string;
}

/**
 * Response from batch event logging
 */
export interface BatchLogResponse {
  message: string;
  count: number;
}

/**
 * Events API methods
 */
export const eventsApi = {
  /**
   * Log a single frontend event
   */
  async logEvent(event: Omit<FrontendEvent, 'id' | 'server_timestamp'>): Promise<LogEventResponse> {
    const response = await apiClient.post<LogEventResponse>('/api/core/events/', event);
    return response.data;
  },

  /**
   * Log multiple events at once (useful for offline sync)
   */
  async logBatch(events: Omit<FrontendEvent, 'id' | 'server_timestamp'>[]): Promise<BatchLogResponse> {
    const response = await apiClient.post<BatchLogResponse>('/api/core/events/batch/', { events });
    return response.data;
  },

  /**
   * Get events (for debugging/admin purposes)
   */
  async getEvents(params?: {
    event_type?: FrontendEventType;
    resource_type?: ResourceType;
    session_id?: string;
    was_offline?: boolean;
    page?: number;
    page_size?: number;
  }): Promise<{ count: number; results: LogEventResponse[] }> {
    const response = await apiClient.get<{ count: number; results: LogEventResponse[] }>(
      '/api/core/events/',
      { params }
    );
    return response.data;
  },
};

export default eventsApi;
