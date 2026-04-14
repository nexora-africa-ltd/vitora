import { apiClient } from './client';
import { PaginatedTriageAssessmentSchema, TriageAssessmentSchema } from '@/lib/schemas/triage.schema';
import { parseResponse } from '@/lib/schemas/validation';
import type { TriageAssessment, TriageAssessmentCreateData } from '@/lib/types/triage';

export const triageApi = {
  async list(params: { encounter?: number; ordering?: string; page?: number; page_size?: number } = {}): Promise<TriageAssessment[]> {
    const response = await apiClient.get('/api/triage/assessments/', { params });
    const parsed = parseResponse(PaginatedTriageAssessmentSchema, response.data, { context: 'triage.list' });
    return parsed.results;
  },

  async get(id: number): Promise<TriageAssessment> {
    const response = await apiClient.get(`/api/triage/assessments/${id}/`);
    return parseResponse(TriageAssessmentSchema, response.data, { context: 'triage.get' });
  },

  async getByEncounter(encounterId: number): Promise<TriageAssessment | null> {
    const results = await this.list({ encounter: encounterId, ordering: '-arrival_time', page_size: 1 });
    return results[0] ?? null;
  },

  async create(data: TriageAssessmentCreateData): Promise<TriageAssessment> {
    const response = await apiClient.post('/api/triage/assessments/', data);
    return parseResponse(TriageAssessmentSchema, response.data, { context: 'triage.create' });
  },

  async complete(id: number): Promise<TriageAssessment> {
    const response = await apiClient.post(`/api/triage/assessments/${id}/complete/`);
    return parseResponse(TriageAssessmentSchema, response.data, { context: 'triage.complete' });
  },
};
