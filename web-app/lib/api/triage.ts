/**
 * Triage API client.
 * Sprint 1.5-1.6 Track E: Triage MVP
 *
 * Provides API methods for triage assessments, queue management,
 * vital thresholds, and reporting.
 */

import { apiClient } from './client';
import { parseResponse } from '@/lib/schemas/validation';
import { z } from 'zod';
import {
  TriageAssessmentSchema,
  TriageQueueEntrySchema,
  TriageVitalThresholdSchema,
  TriageVitalThresholdArraySchema,
  CalculateCategoryResponseSchema,
  RouteToClinicResponseSchema,
  TriageReportSummarySchema,
  WaitTimeStatsResponseSchema,
  VolumeReportResponseSchema,
  WaitingQueueEntrySchema,
  PaginatedTriageAssessmentSchema,
  PaginatedTriageQueueSchema,
  PaginatedWaitingQueueSchema,
} from '@/lib/schemas/triage.schema';
import type {
  TriageAssessment,
  TriageAssessmentCreateData,
  TriageQueueEntry,
  TriageVitalThreshold,
  TriageReportSummary,
  TriageCategory,
  AssignedArea,
  TriageAlert,
  WaitTimeStats,
  VitalType,
} from '@/lib/types/triage';
import type { PaginatedResponse } from '@/lib/types';

// =============================================================================
// TYPES
// =============================================================================

export interface TriageAssessmentUpdateData {
  mental_status?: 'A' | 'V' | 'P' | 'U';
  chief_complaint_category?: string;
  chief_complaint_text?: string;
  pain_score?: number;
  mobility?: string;
  assigned_area?: AssignedArea;
  triage_category?: TriageCategory;
  category_override_reason?: string;
  notes?: string;
}

export interface TriageAssessmentListParams {
  page?: number;
  page_size?: number;
  triage_category?: TriageCategory;
  assigned_area?: AssignedArea;
  start_date?: string;
  end_date?: string;
  patient_id?: number;
  encounter?: number; // Filter by encounter FK
}

export interface TriageQueueListParams {
  assigned_area?: AssignedArea;
  triage_category?: TriageCategory;
  status?: 'WAITING' | 'CALLED' | 'WITH_CLINICIAN';
}

export interface CalculateCategoryRequest {
  spo2?: number;
  systolic_bp?: number;
  diastolic_bp?: number;
  heart_rate?: number;
  temperature?: number;
  respiratory_rate?: number;
  mental_status: 'A' | 'V' | 'P' | 'U';
  chief_complaint_category: string;
  pain_score?: number;
  mobility?: string;
}

export interface CalculateCategoryResponse {
  suggested_category: TriageCategory;
  alerts: TriageAlert[];
  reasoning?: string | null;
}

export interface TriageReportParams {
  date_range: string;
  start_date?: string;
  end_date?: string;
  area?: AssignedArea;
  category?: TriageCategory;
}

export interface WaitTimeStatsResponse {
  avg_wait_minutes: number;
  median_wait_minutes: number;
  target_met_percentage: number;
  by_category: WaitTimeStats[];
}

export interface RouteToClinicResponse {
  id: number;
  session: number;
  patient: {
    id: number;
    mrn: string;
    first_name: string;
    last_name: string;
    full_name: string;
    date_of_birth: string;
    age: number;
    gender: string;
    phone_number?: string | null;
  };
  patient_name: string;
  patient_mrn: string;
  clinic_name: string;
  queue_number: number;
  status: string;
  status_display: string;
  priority: string;
  priority_display: string;
  visit_type: string;
  visit_type_display: string;
  source: string;
  source_display: string;
  registered_at: string;
  called_at: string | null;
  consultation_started_at: string | null;
  completed_at: string | null;
  encounter: number | null;
  triage_assessment: number | null;
  referred_from: number | null;
  referred_to_clinic: number | null;
  referral_reason: string;
  assigned_clinician: number | null;
  registered_by: number;
  registered_by_name: string;
}

// =============================================================================
// WAITING QUEUE TYPES
// =============================================================================

export interface WaitingQueueEntry {
  id: number;
  patient: number;
  patient_name: string;
  patient_mrn: string;
  patient_age: number | null;
  patient_gender: string;
  encounter: number | null;
  check_in_time: string;
  reason_for_visit: string;
  status: 'WAITING_TRIAGE' | 'IN_TRIAGE' | 'TRIAGED' | 'CANCELLED';
  priority_hint: string;
  notes: string;
  wait_time_minutes: number;
  created_at: string;
}

export interface WaitingQueueCreateData {
  patient_id: number;
  reason_for_visit?: string;
  priority_hint?: string;
  create_encounter?: boolean;
  notes?: string;
}

export interface WaitingQueueListParams {
  status?: string;
  priority_hint?: string;
  show_all?: boolean;
}

// =============================================================================
// API CLIENT
// =============================================================================

export const triageApi = {
  // ============ Triage Assessments ============

  /**
   * Get paginated list of triage assessments.
   */
  async listAssessments(
    params?: TriageAssessmentListParams
  ): Promise<PaginatedResponse<TriageAssessment>> {
    const response = await apiClient.get<PaginatedResponse<TriageAssessment>>('/api/triage/assessments/', {
      params,
    });
    return parseResponse(PaginatedTriageAssessmentSchema, response.data, { context: 'triageApi.listAssessments' });
  },

  /**
   * Get a single triage assessment by ID.
   */
  async getAssessment(id: number): Promise<TriageAssessment> {
    const response = await apiClient.get<TriageAssessment>(`/api/triage/assessments/${id}/`);
    return parseResponse(TriageAssessmentSchema, response.data, { context: 'triageApi.getAssessment' });
  },

  /**
   * Create a new triage assessment.
   */
  async createAssessment(data: TriageAssessmentCreateData): Promise<TriageAssessment> {
    console.log('Creating triage assessment with data:', JSON.stringify(data, null, 2));
    try {
      const response = await apiClient.post<TriageAssessment>('/api/triage/assessments/', data);
      return parseResponse(TriageAssessmentSchema, response.data, { context: 'triageApi.createAssessment' });
    } catch (error: unknown) {
      if (error && typeof error === 'object' && 'response' in error) {
        const axiosError = error as { response?: { data?: unknown; status?: number } };
        console.error('Triage assessment creation failed:', {
          status: axiosError.response?.status,
          data: axiosError.response?.data,
        });
      }
      throw error;
    }
  },

  /**
   * Update an existing triage assessment.
   */
  async updateAssessment(id: number, data: TriageAssessmentUpdateData): Promise<TriageAssessment> {
    const response = await apiClient.patch<TriageAssessment>(`/api/triage/assessments/${id}/`, data);
    return parseResponse(TriageAssessmentSchema, response.data, { context: 'triageApi.updateAssessment' });
  },

  /**
   * Delete a triage assessment (admin only).
   */
  async deleteAssessment(id: number): Promise<void> {
    await apiClient.delete(`/api/triage/assessments/${id}/`);
  },

  /**
   * Complete a triage assessment (sets triage_end_time).
   */
  async completeAssessment(id: number): Promise<TriageAssessment> {
    const response = await apiClient.post<TriageAssessment>(
      `/api/triage/assessments/${id}/complete/`
    );
    return parseResponse(TriageAssessmentSchema, response.data, { context: 'triageApi.completeAssessment' });
  },

  /**
   * Route a triaged patient to a specific clinic.
   * Creates a ClinicVisit in the target clinic's queue.
   */
  async routeToClinic(
    assessmentId: number,
    data: { clinic_id: number; notes?: string }
  ): Promise<RouteToClinicResponse> {
    const response = await apiClient.post<RouteToClinicResponse>(
      `/api/triage/assessments/${assessmentId}/route-to-clinic/`,
      data
    );
    return parseResponse(RouteToClinicResponseSchema, response.data, { context: 'triageApi.routeToClinic' });
  },

  /**
   * Calculate suggested triage category based on vitals and symptoms.
   */
  async calculateCategory(data: CalculateCategoryRequest): Promise<CalculateCategoryResponse> {
    const response = await apiClient.post<CalculateCategoryResponse>(
      '/api/triage/assessments/calculate-category/',
      data
    );
    return parseResponse(CalculateCategoryResponseSchema, response.data, { context: 'triageApi.calculateCategory' });
  },

  // ============ Triage Queue ============

  /**
   * Get active triage queue (sorted by priority).
   */
  async getQueue(params?: TriageQueueListParams): Promise<PaginatedResponse<TriageQueueEntry>> {
    const response = await apiClient.get<PaginatedResponse<TriageQueueEntry>>(
      '/api/triage/queue/',
      { params }
    );
    return parseResponse(PaginatedTriageQueueSchema, response.data, { context: 'triageApi.getQueue' });
  },

  /**
   * Mark a patient as called.
   */
  async callPatient(queueEntryId: number): Promise<TriageQueueEntry> {
    const response = await apiClient.post<TriageQueueEntry>(
      `/api/triage/queue/${queueEntryId}/call/`
    );
    return parseResponse(TriageQueueEntrySchema, response.data, { context: 'triageApi.callPatient' });
  },

  /**
   * Mark a patient as with clinician.
   */
  async markWithClinician(queueEntryId: number): Promise<TriageQueueEntry> {
    const response = await apiClient.post<TriageQueueEntry>(
      `/api/triage/queue/${queueEntryId}/with-clinician/`
    );
    return parseResponse(TriageQueueEntrySchema, response.data, { context: 'triageApi.markWithClinician' });
  },

  /**
   * Mark a patient as completed.
   */
  async markComplete(queueEntryId: number): Promise<TriageQueueEntry> {
    const response = await apiClient.post<TriageQueueEntry>(
      `/api/triage/queue/${queueEntryId}/complete/`
    );
    return parseResponse(TriageQueueEntrySchema, response.data, { context: 'triageApi.markComplete' });
  },

  /**
   * Mark a patient as left without being seen (LWBS).
   */
  async markLWBS(queueEntryId: number, reason: string): Promise<TriageQueueEntry> {
    const response = await apiClient.post<TriageQueueEntry>(
      `/api/triage/queue/${queueEntryId}/lwbs/`,
      { reason }
    );
    return parseResponse(TriageQueueEntrySchema, response.data, { context: 'triageApi.markLWBS' });
  },

  // ============ Vital Thresholds ============

  /**
   * Get all vital thresholds.
   */
  async getVitalThresholds(): Promise<TriageVitalThreshold[]> {
    const response = await apiClient.get<TriageVitalThreshold[]>('/api/triage/vital-thresholds/');
    return parseResponse(TriageVitalThresholdArraySchema, response.data, { context: 'triageApi.getVitalThresholds' });
  },

  /**
   * Get a single vital threshold by ID.
   */
  async getVitalThreshold(id: number): Promise<TriageVitalThreshold> {
    const response = await apiClient.get<TriageVitalThreshold>(
      `/api/triage/vital-thresholds/${id}/`
    );
    return parseResponse(TriageVitalThresholdSchema, response.data, { context: 'triageApi.getVitalThreshold' });
  },

  /**
   * Update a vital threshold (admin only).
   */
  async updateVitalThreshold(
    id: number,
    data: Partial<TriageVitalThreshold>
  ): Promise<TriageVitalThreshold> {
    const response = await apiClient.put<TriageVitalThreshold>(
      `/api/triage/vital-thresholds/${id}/`,
      data
    );
    return parseResponse(TriageVitalThresholdSchema, response.data, { context: 'triageApi.updateVitalThreshold' });
  },

  /**
   * Toggle threshold active status.
   */
  async toggleThresholdActive(id: number, isActive: boolean): Promise<TriageVitalThreshold> {
    const response = await apiClient.patch<TriageVitalThreshold>(
      `/api/triage/vital-thresholds/${id}/`,
      { is_active: isActive }
    );
    return parseResponse(TriageVitalThresholdSchema, response.data, { context: 'triageApi.toggleThresholdActive' });
  },

  /**
   * Reset a single threshold to system defaults.
   */
  async resetThresholdToDefault(id: number): Promise<TriageVitalThreshold> {
    const response = await apiClient.post<TriageVitalThreshold>(
      `/api/triage/vital-thresholds/${id}/reset/`
    );
    return parseResponse(TriageVitalThresholdSchema, response.data, { context: 'triageApi.resetThresholdToDefault' });
  },

  /**
   * Reset all thresholds to system defaults.
   */
  async resetAllThresholdsToDefaults(): Promise<TriageVitalThreshold[]> {
    const response = await apiClient.post<TriageVitalThreshold[]>(
      '/api/triage/vital-thresholds/reset-all/'
    );
    return parseResponse(TriageVitalThresholdArraySchema, response.data, { context: 'triageApi.resetAllThresholdsToDefaults' });
  },

  /**
   * Export thresholds configuration as JSON.
   */
  async exportThresholds(): Promise<Blob> {
    const response = await apiClient.get('/api/triage/vital-thresholds/export/', {
      responseType: 'blob',
    });
    return response.data;
  },

  /**
   * Import thresholds configuration from JSON.
   */
  async importThresholds(data: Record<string, unknown>): Promise<TriageVitalThreshold[]> {
    const response = await apiClient.post<TriageVitalThreshold[]>(
      '/api/triage/vital-thresholds/import/',
      data
    );
    return parseResponse(TriageVitalThresholdArraySchema, response.data, { context: 'triageApi.importThresholds' });
  },

  // ============ Reports ============

  /**
   * Get triage report summary.
   */
  async getReports(params: TriageReportParams): Promise<TriageReportSummary> {
    const response = await apiClient.get<TriageReportSummary>('/api/triage/reports/', { params });
    return parseResponse(TriageReportSummarySchema, response.data, { context: 'triageApi.getReports' });
  },

  /**
   * Get wait time statistics.
   */
  async getWaitTimeStats(dateRange: string): Promise<WaitTimeStatsResponse> {
    const response = await apiClient.get<WaitTimeStatsResponse>(
      '/api/triage/reports/wait-times/',
      { params: { date_range: dateRange } }
    );
    return parseResponse(WaitTimeStatsResponseSchema, response.data, { context: 'triageApi.getWaitTimeStats' });
  },

  /**
   * Get volume report by category.
   */
  async getVolumeReport(params: TriageReportParams): Promise<{
    by_category: Array<{ category: TriageCategory; count: number; percentage: number }>;
    by_area: Array<{ area: AssignedArea; area_label: string; count: number }>;
    total: number;
  }> {
    const response = await apiClient.get('/api/triage/reports/volume/', { params });
    return parseResponse(VolumeReportResponseSchema, response.data, { context: 'triageApi.getVolumeReport' });
  },

  /**
   * Export triage report.
   */
  async exportReport(
    format: 'pdf' | 'csv' | 'excel',
    params: TriageReportParams
  ): Promise<Blob> {
    const response = await apiClient.get('/api/triage/reports/export/', {
      params: { format, ...params },
      responseType: 'blob',
    });
    return response.data;
  },

  // ============ Waiting Queue ============

  /**
   * Get waiting queue (patients awaiting triage).
   */
  async getWaitingQueue(params?: WaitingQueueListParams): Promise<PaginatedResponse<WaitingQueueEntry>> {
    const response = await apiClient.get<PaginatedResponse<WaitingQueueEntry>>(
      '/api/triage/waiting/',
      { params }
    );
    return parseResponse(PaginatedWaitingQueueSchema, response.data, { context: 'triageApi.getWaitingQueue' });
  },

  /**
   * Check in a patient (add to waiting queue).
   */
  async checkInPatient(data: WaitingQueueCreateData): Promise<WaitingQueueEntry> {
    const response = await apiClient.post<WaitingQueueEntry>('/api/triage/waiting/', data);
    return parseResponse(WaitingQueueEntrySchema, response.data, { context: 'triageApi.checkInPatient' });
  },

  /**
   * Start triage for a waiting patient.
   */
  async startTriage(waitingQueueId: number): Promise<WaitingQueueEntry> {
    const response = await apiClient.post<WaitingQueueEntry>(
      `/api/triage/waiting/${waitingQueueId}/start-triage/`
    );
    return parseResponse(WaitingQueueEntrySchema, response.data, { context: 'triageApi.startTriage' });
  },

  /**
   * Cancel/remove a patient from waiting queue.
   */
  async cancelWaitingEntry(waitingQueueId: number, reason?: string): Promise<WaitingQueueEntry> {
    const response = await apiClient.post<WaitingQueueEntry>(
      `/api/triage/waiting/${waitingQueueId}/cancel/`,
      { reason }
    );
    return parseResponse(WaitingQueueEntrySchema, response.data, { context: 'triageApi.cancelWaitingEntry' });
  },
};

export default triageApi;
