import { apiClient } from './client';
import { parseResponse } from '@/lib/schemas/validation';
import { z } from 'zod';
import { ChronicConditionSchema } from '@/lib/schemas/chronic-condition.schema';
import type {
  ChronicCondition,
  ChronicConditionCreatePayload,
  ChronicConditionUpdatePayload,
} from '@/lib/types/chronic-condition';

export const chronicConditionsApi = {
  async listByPatient(patientId: number): Promise<ChronicCondition[]> {
    const response = await apiClient.get(`/api/patients/${patientId}/chronic-conditions/`);
    return parseResponse(z.array(ChronicConditionSchema), response.data.results || [], {
      context: 'chronicConditionsApi.listByPatient',
    });
  },

  async get(patientId: number, id: number): Promise<ChronicCondition> {
    const response = await apiClient.get(`/api/patients/${patientId}/chronic-conditions/${id}/`);
    return parseResponse(ChronicConditionSchema, response.data, {
      context: 'chronicConditionsApi.get',
    });
  },

  async create(patientId: number, data: ChronicConditionCreatePayload): Promise<ChronicCondition> {
    const response = await apiClient.post(`/api/patients/${patientId}/chronic-conditions/`, data);
    return parseResponse(ChronicConditionSchema, response.data, {
      context: 'chronicConditionsApi.create',
    });
  },

  async update(
    patientId: number,
    id: number,
    data: ChronicConditionUpdatePayload
  ): Promise<ChronicCondition> {
    const response = await apiClient.patch(
      `/api/patients/${patientId}/chronic-conditions/${id}/`,
      data
    );
    return parseResponse(ChronicConditionSchema, response.data, {
      context: 'chronicConditionsApi.update',
    });
  },

  async delete(patientId: number, id: number): Promise<void> {
    await apiClient.delete(`/api/patients/${patientId}/chronic-conditions/${id}/`);
  },
};
