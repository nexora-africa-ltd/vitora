import { apiClient } from './client';
import { parseResponse } from '@/lib/schemas/validation';
import { z } from 'zod';
import { FamilyHistorySchema } from '@/lib/schemas/family-history.schema';
import type {
  FamilyHistory,
  FamilyHistoryCreatePayload,
  FamilyHistoryUpdatePayload,
} from '@/lib/types/family-history';

export const familyHistoryApi = {
  async listByPatient(patientId: number): Promise<FamilyHistory[]> {
    const response = await apiClient.get(`/api/patients/${patientId}/family-history/`);
    return parseResponse(z.array(FamilyHistorySchema), response.data.results || [], {
      context: 'familyHistoryApi.listByPatient',
    });
  },

  async get(patientId: number, id: number): Promise<FamilyHistory> {
    const response = await apiClient.get(`/api/patients/${patientId}/family-history/${id}/`);
    return parseResponse(FamilyHistorySchema, response.data, {
      context: 'familyHistoryApi.get',
    });
  },

  async create(patientId: number, data: FamilyHistoryCreatePayload): Promise<FamilyHistory> {
    const response = await apiClient.post(`/api/patients/${patientId}/family-history/`, data);
    return parseResponse(FamilyHistorySchema, response.data, {
      context: 'familyHistoryApi.create',
    });
  },

  async update(
    patientId: number,
    id: number,
    data: FamilyHistoryUpdatePayload
  ): Promise<FamilyHistory> {
    const response = await apiClient.patch(
      `/api/patients/${patientId}/family-history/${id}/`,
      data
    );
    return parseResponse(FamilyHistorySchema, response.data, {
      context: 'familyHistoryApi.update',
    });
  },

  async delete(patientId: number, id: number): Promise<void> {
    await apiClient.delete(`/api/patients/${patientId}/family-history/${id}/`);
  },
};
