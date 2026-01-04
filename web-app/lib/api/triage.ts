/**
 * Triage API client.
 * Sprint 1.5-1.6 Track E: Triage MVP
 *
 * Provides API methods for triage assessments, queue management,
 * vital thresholds, and reporting.
 */

import { apiClient } from './client';
import type {
  TriageAssessment,
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

export interface TriageAssessmentCreateData {
  encounter_id: number;
  mental_status: 'A' | 'V' | 'P' | 'U';
  chief_complaint_category: string;
  chief_complaint_text?: string;
  pain_score?: number;
  mobility?: string;
  arrival_mode?: string;
  assigned_area?: AssignedArea;
  triage_category?: TriageCategory;
  category_override_reason?: string;
  allergies_snapshot?: string;
  notes?: string;
  // Vitals (can come from encounter or be entered directly)
  spo2?: number;
  systolic_bp?: number;
  diastolic_bp?: number;
  heart_rate?: number;
  temperature?: number;
  respiratory_rate?: number;
}

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
  encounter_id?: number;
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
  reasoning?: string;
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
    return response.data;
  },

  /**
   * Get a single triage assessment by ID.
   */
  async getAssessment(id: number): Promise<TriageAssessment> {
    const response = await apiClient.get<TriageAssessment>(`/api/triage/assessments/${id}/`);
    return response.data;
  },

  /**
   * Create a new triage assessment.
   */
  async createAssessment(data: TriageAssessmentCreateData): Promise<TriageAssessment> {
    const response = await apiClient.post<TriageAssessment>('/api/triage/assessments/', data);
    return response.data;
  },

  /**
   * Update an existing triage assessment.
   */
  async updateAssessment(id: number, data: TriageAssessmentUpdateData): Promise<TriageAssessment> {
    const response = await apiClient.patch<TriageAssessment>(`/api/triage/assessments/${id}/`, data);
    return response.data;
  },

  /**
   * Delete a triage assessment (admin only).
   */
  async deleteAssessment(id: number): Promise<void> {
    await apiClient.delete(`/api/triage/assessments/${id}/`);
  },

  /**
   * Calculate suggested triage category based on vitals and symptoms.
   */
  async calculateCategory(data: CalculateCategoryRequest): Promise<CalculateCategoryResponse> {
    const response = await apiClient.post<CalculateCategoryResponse>(
      '/api/triage/assessments/calculate-category/',
      data
    );
    return response.data;
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
    return response.data;
  },

  /**
   * Mark a patient as called.
   */
  async callPatient(queueEntryId: number): Promise<TriageQueueEntry> {
    const response = await apiClient.post<TriageQueueEntry>(
      `/api/triage/queue/${queueEntryId}/call/`
    );
    return response.data;
  },

  /**
   * Mark a patient as with clinician.
   */
  async markWithClinician(queueEntryId: number): Promise<TriageQueueEntry> {
    const response = await apiClient.post<TriageQueueEntry>(
      `/api/triage/queue/${queueEntryId}/with-clinician/`
    );
    return response.data;
  },

  /**
   * Mark a patient as completed.
   */
  async markComplete(queueEntryId: number): Promise<TriageQueueEntry> {
    const response = await apiClient.post<TriageQueueEntry>(
      `/api/triage/queue/${queueEntryId}/complete/`
    );
    return response.data;
  },

  /**
   * Mark a patient as left without being seen (LWBS).
   */
  async markLWBS(queueEntryId: number, reason: string): Promise<TriageQueueEntry> {
    const response = await apiClient.post<TriageQueueEntry>(
      `/api/triage/queue/${queueEntryId}/lwbs/`,
      { reason }
    );
    return response.data;
  },

  // ============ Vital Thresholds ============

  /**
   * Get all vital thresholds.
   */
  async getVitalThresholds(): Promise<TriageVitalThreshold[]> {
    const response = await apiClient.get<TriageVitalThreshold[]>('/api/triage/vital-thresholds/');
    return response.data;
  },

  /**
   * Get a single vital threshold by ID.
   */
  async getVitalThreshold(id: number): Promise<TriageVitalThreshold> {
    const response = await apiClient.get<TriageVitalThreshold>(
      `/api/triage/vital-thresholds/${id}/`
    );
    return response.data;
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
    return response.data;
  },

  /**
   * Toggle threshold active status.
   */
  async toggleThresholdActive(id: number, isActive: boolean): Promise<TriageVitalThreshold> {
    const response = await apiClient.patch<TriageVitalThreshold>(
      `/api/triage/vital-thresholds/${id}/`,
      { is_active: isActive }
    );
    return response.data;
  },

  /**
   * Reset a single threshold to system defaults.
   */
  async resetThresholdToDefault(id: number): Promise<TriageVitalThreshold> {
    const response = await apiClient.post<TriageVitalThreshold>(
      `/api/triage/vital-thresholds/${id}/reset/`
    );
    return response.data;
  },

  /**
   * Reset all thresholds to system defaults.
   */
  async resetAllThresholdsToDefaults(): Promise<TriageVitalThreshold[]> {
    const response = await apiClient.post<TriageVitalThreshold[]>(
      '/api/triage/vital-thresholds/reset-all/'
    );
    return response.data;
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
    return response.data;
  },

  // ============ Reports ============

  /**
   * Get triage report summary.
   */
  async getReports(params: TriageReportParams): Promise<TriageReportSummary> {
    const response = await apiClient.get<TriageReportSummary>('/api/triage/reports/', { params });
    return response.data;
  },

  /**
   * Get wait time statistics.
   */
  async getWaitTimeStats(dateRange: string): Promise<WaitTimeStatsResponse> {
    const response = await apiClient.get<WaitTimeStatsResponse>(
      '/api/triage/reports/wait-times/',
      { params: { date_range: dateRange } }
    );
    return response.data;
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
    return response.data;
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
};

export default triageApi;
