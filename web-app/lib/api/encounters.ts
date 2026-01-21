/**
 * Encounters API client.
 */

import { apiClient } from './client';
import {
  Encounter,
  EncounterListParams,
  Diagnosis,
  TreatmentPlan,
} from '@/lib/types/encounter';
import { PaginatedResponse } from '@/lib/types';

export const encountersApi = {
  /**
   * Get paginated list of encounters.
   */
  async list(params?: EncounterListParams): Promise<PaginatedResponse<Encounter>> {
    const response = await apiClient.get<PaginatedResponse<Encounter>>('/api/encounters/', {
      params,
    });
    return response.data;
  },

  /**
   * Get a single encounter by ID.
   */
  async get(id: number): Promise<Encounter> {
    const response = await apiClient.get<Encounter>(`/api/encounters/${id}/`);
    return response.data;
  },

  /**
   * Create a new encounter.
   */
  async create(data: Partial<Encounter>): Promise<Encounter> {
    const response = await apiClient.post<Encounter>('/api/encounters/', data);
    return response.data;
  },

  /**
   * Update an encounter.
   */
  async update(id: number, data: Partial<Encounter>): Promise<Encounter> {
    const response = await apiClient.patch<Encounter>(`/api/encounters/${id}/`, data);
    return response.data;
  },

  /**
   * Finalize/complete an encounter.
   * Changes status to COMPLETED and records the finalizing user and timestamp.
   */
  async finalize(id: number): Promise<Encounter> {
    const response = await apiClient.post<Encounter>(`/api/encounters/${id}/finalize/`);
    return response.data;
  },

  /**
   * Get diagnoses for an encounter.
   */
  async getDiagnoses(encounterId: number): Promise<Diagnosis[]> {
    const response = await apiClient.get<Diagnosis[]>(
      `/api/encounters/${encounterId}/diagnoses/`
    );
    return response.data;
  },

  /**
   * Create a diagnosis for an encounter.
   */
  async createDiagnosis(encounterId: number, data: CreateDiagnosisData): Promise<Diagnosis> {
    const response = await apiClient.post<Diagnosis>(
      `/api/encounters/${encounterId}/diagnoses/`,
      data
    );
    return response.data;
  },

  /**
   * Delete a diagnosis.
   */
  async deleteDiagnosis(encounterId: number, diagnosisId: number): Promise<void> {
    await apiClient.delete(`/api/encounters/${encounterId}/diagnoses/${diagnosisId}/`);
  },

  /**
   * Update a diagnosis (e.g., change certainty after lab results).
   */
  async updateDiagnosis(encounterId: number, diagnosisId: number, data: Partial<CreateDiagnosisData>): Promise<Diagnosis> {
    const response = await apiClient.patch<Diagnosis>(
      `/api/encounters/${encounterId}/diagnoses/${diagnosisId}/`,
      data
    );
    return response.data;
  },

  /**
   * Get treatment plan for an encounter.
   */
  async getTreatmentPlan(encounterId: number): Promise<TreatmentPlan | null> {
    try {
      const response = await apiClient.get<TreatmentPlan>(
        `/api/encounters/${encounterId}/treatment-plan/`
      );
      return response.data;
    } catch (error: unknown) {
      const axiosError = error as { response?: { status?: number } };
      if (axiosError.response?.status === 404) {
        return null;
      }
      throw error;
    }
  },

  /**
   * Get pre-triage queue (encounters awaiting triage).
   *
   * Returns encounters with:
   * - triage_status = PENDING (or IN_PROGRESS if include_in_progress=true)
   * - triage_requirement in (MANDATORY, OPTIONAL)
   *
   * Sorted by arrival time (created_at) ascending.
   */
  async getPreTriageQueue(params?: PreTriageQueueParams): Promise<PaginatedResponse<PreTriageQueueItem>> {
    const response = await apiClient.get<PaginatedResponse<PreTriageQueueItem>>(
      '/api/encounters/pre_triage_queue/',
      { params }
    );
    return response.data;
  },

  /**
   * Edit chief complaint with audit trail.
   *
   * Only allowed for triaged encounters. Requires a reason for the edit.
   */
  async editChiefComplaint(
    encounterId: number,
    data: {
      chief_complaint: string;
      edit_reason: string;
      edit_reason_other?: string;
    }
  ): Promise<Encounter> {
    const response = await apiClient.post<Encounter>(
      `/api/encounters/${encounterId}/edit_chief_complaint/`,
      data
    );
    return response.data;
  },

  // ===========================================================================
  // Clinical Template Sync
  // ===========================================================================

  /**
   * Populate template fields from existing encounter/patient data.
   * Auto-fills template fields with matching encounter vitals and patient demographics.
   */
  async populateTemplate(
    encounterId: number,
    templateId: number,
    structureBySection?: boolean
  ): Promise<TemplatePopulateResponse> {
    const params: Record<string, string> = { template_id: String(templateId) };
    if (structureBySection) {
      params.structure_by_section = 'true';
    }
    const response = await apiClient.get<TemplatePopulateResponse>(
      `/api/encounters/${encounterId}/populate-template/`,
      { params }
    );
    return response.data;
  },

  /**
   * Sync template data back to encounter fields.
   * Updates encounter vitals and other fields from template data.
   */
  async syncTemplate(
    encounterId: number,
    templateId: number,
    templateData: Record<string, unknown>
  ): Promise<TemplateSyncResponse> {
    const response = await apiClient.post<TemplateSyncResponse>(
      `/api/encounters/${encounterId}/sync-template/`,
      {
        template_id: templateId,
        template_data: templateData,
      }
    );
    return response.data;
  },

  /**
   * List template snapshots (attachments) for an encounter.
   */
  async listTemplateSnapshots(encounterId: number): Promise<TemplateSnapshot[]> {
    const response = await apiClient.get<TemplateSnapshot[]>(
      `/api/encounters/${encounterId}/template-snapshots/`
    );
    return response.data;
  },

  /**
   * Create a template snapshot (attachment) for an encounter.
   * Snapshots are immutable records of completed template assessments.
   */
  async createTemplateSnapshot(
    encounterId: number,
    templateId: number,
    templateData: Record<string, unknown>
  ): Promise<TemplateSnapshot> {
    const response = await apiClient.post<TemplateSnapshot>(
      `/api/encounters/${encounterId}/template-snapshots/`,
      {
        template_id: templateId,
        template_data: templateData,
      }
    );
    return response.data;
  },
};

// =============================================================================
// Clinical Template Sync Types
// =============================================================================

export interface TemplatePopulateResponse {
  populated_data: Record<string, unknown>;
  template_id: number;
  template_name: string;
}

export interface TemplateSyncResponse extends Encounter {
  changed_fields: string[];
}

export interface TemplateSnapshot {
  id: number;
  template_id: number | null;
  template_name: string;
  template_version: string;
  data: Record<string, unknown>;
  created_by: string | null;
  created_at: string;
}

// =============================================================================
// Diagnosis Types
// =============================================================================

export interface CreateDiagnosisData {
  icd10_code?: number | null;
  icd11_code?: string;
  icd11_display?: string;
  diagnosis_type: 'PRIMARY' | 'SECONDARY' | 'DIFFERENTIAL' | 'WORKING';
  free_text_diagnosis?: string;
  notes?: string;
  is_confirmed?: boolean;
  certainty?: 'confirmed' | 'provisional' | 'ruled_out' | 'suspected';
}

// =============================================================================
// Pre-Triage Queue Types
// =============================================================================

export interface PreTriageQueueParams {
  triage_requirement?: 'MANDATORY' | 'OPTIONAL';
  encounter_type?: string;
  include_in_progress?: boolean;
}

export interface PreTriageQueueItem {
  id: number;
  patient_id: number;
  patient_name: string;
  patient_mrn: string;
  patient_age: number | null;
  patient_gender: string;
  encounter_type: string;
  encounter_type_display?: string;
  chief_complaint: string;
  triage_requirement: 'MANDATORY' | 'OPTIONAL' | 'NOT_REQUIRED';
  triage_status: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'BYPASSED' | 'NOT_APPLICABLE';
  created_at: string;
  wait_time_minutes: number;
}
