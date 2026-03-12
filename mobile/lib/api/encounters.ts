import { apiClient } from './client';
import {
  DiagnosisSchema,
  EncounterSchema,
  EncounterTransitionSchema,
  ICD10CodeSchema,
  PaginatedDiagnosisSchema,
  PaginatedEncounterSchema,
  PaginatedICD10CodeSchema,
  TreatmentPlanSchema,
} from '@/lib/schemas/encounter.schema';
import { parseResponse } from '@/lib/schemas/validation';
import type { PaginatedResponse } from '@/lib/types/common';
import type {
  Diagnosis,
  DiagnosisInput,
  Encounter,
  EncounterCreateData,
  EncounterQuickConsultationData,
  EncounterListParams,
  EncounterTransitionInput,
  EncounterTransitionResponse,
  EncounterUpdateData,
  ICD10Code,
  TreatmentPlan,
  TreatmentPlanInput,
} from '@/lib/types/encounter';

export const encountersApi = {
  async list(params: EncounterListParams = {}): Promise<PaginatedResponse<Encounter>> {
    const response = await apiClient.get('/api/encounters/', { params });
    return parseResponse(PaginatedEncounterSchema, response.data, { context: 'encounters.list' });
  },

  async get(id: number): Promise<Encounter> {
    const response = await apiClient.get(`/api/encounters/${id}/`);
    return parseResponse(EncounterSchema, response.data, { context: 'encounters.get' });
  },

  async create(data: EncounterCreateData): Promise<Encounter> {
    const response = await apiClient.post('/api/encounters/', data);
    return parseResponse(EncounterSchema, response.data, { context: 'encounters.create' });
  },

  async quickConsultation(data: EncounterQuickConsultationData): Promise<Encounter> {
    const response = await apiClient.post('/api/encounters/quick_consultation/', data);
    return parseResponse(EncounterSchema, response.data, { context: 'encounters.quickConsultation' });
  },

  async update(id: number, data: EncounterUpdateData): Promise<Encounter> {
    const response = await apiClient.patch(`/api/encounters/${id}/`, data);
    return parseResponse(EncounterSchema, response.data, { context: 'encounters.update' });
  },

  async startProgress(id: number): Promise<Encounter> {
    const response = await apiClient.post(`/api/encounters/${id}/start_progress/`);
    return parseResponse(EncounterSchema, response.data, { context: 'encounters.startProgress' });
  },

  async finalize(id: number): Promise<Encounter> {
    const response = await apiClient.post(`/api/encounters/${id}/finalize/`);
    return parseResponse(EncounterSchema, response.data, { context: 'encounters.finalize' });
  },

  async cancel(id: number, reason?: string): Promise<Encounter> {
    const response = await apiClient.post(`/api/encounters/${id}/cancel/`, reason ? { reason } : {});
    return parseResponse(EncounterSchema, response.data, { context: 'encounters.cancel' });
  },

  async transition(id: number, data: EncounterTransitionInput): Promise<EncounterTransitionResponse> {
    const response = await apiClient.post(`/api/encounters/${id}/transition/`, data);
    return parseResponse(EncounterTransitionSchema, response.data, { context: 'encounters.transition' });
  },

  async searchICD10(query: string): Promise<ICD10Code[]> {
    const trimmed = query.trim();
    if (!trimmed) {
      return [];
    }

    const response = await apiClient.get('/api/icd10-codes/', {
      params: { search: trimmed, page_size: 20 },
    });
    const parsed = parseResponse(PaginatedICD10CodeSchema, response.data, { context: 'encounters.searchICD10' });
    return parsed.results;
  },

  async getDiagnoses(encounterId: number): Promise<Diagnosis[]> {
    const response = await apiClient.get(`/api/encounters/${encounterId}/diagnoses/`);
    const parsed = parseResponse(PaginatedDiagnosisSchema, response.data, { context: 'encounters.getDiagnoses' });
    return parsed.results;
  },

  async createDiagnosis(encounterId: number, data: DiagnosisInput): Promise<Diagnosis> {
    const response = await apiClient.post(`/api/encounters/${encounterId}/diagnoses/`, data);
    return parseResponse(DiagnosisSchema, response.data, { context: 'encounters.createDiagnosis' });
  },

  async updateDiagnosis(encounterId: number, diagnosisId: number, data: Partial<DiagnosisInput>): Promise<Diagnosis> {
    const response = await apiClient.patch(`/api/encounters/${encounterId}/diagnoses/${diagnosisId}/`, data);
    return parseResponse(DiagnosisSchema, response.data, { context: 'encounters.updateDiagnosis' });
  },

  async deleteDiagnosis(encounterId: number, diagnosisId: number): Promise<void> {
    await apiClient.delete(`/api/encounters/${encounterId}/diagnoses/${diagnosisId}/`);
  },

  async getTreatmentPlan(encounterId: number): Promise<TreatmentPlan | null> {
    try {
      const response = await apiClient.get(`/api/encounters/${encounterId}/treatment-plan/`);
      return parseResponse(TreatmentPlanSchema, response.data, { context: 'encounters.getTreatmentPlan' });
    } catch (error: unknown) {
      const axiosError = error as { response?: { status?: number } };
      if (axiosError.response?.status === 404) {
        return null;
      }
      throw error;
    }
  },

  async createTreatmentPlan(encounterId: number, data: TreatmentPlanInput): Promise<TreatmentPlan> {
    const response = await apiClient.post(`/api/encounters/${encounterId}/treatment-plan/`, data);
    return parseResponse(TreatmentPlanSchema, response.data, { context: 'encounters.createTreatmentPlan' });
  },

  async updateTreatmentPlan(encounterId: number, data: TreatmentPlanInput): Promise<TreatmentPlan> {
    const response = await apiClient.patch(`/api/encounters/${encounterId}/treatment-plan/`, data);
    return parseResponse(TreatmentPlanSchema, response.data, { context: 'encounters.updateTreatmentPlan' });
  },
};