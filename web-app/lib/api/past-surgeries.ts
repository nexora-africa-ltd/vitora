import { apiClient } from './client';
import { parseResponse } from '@/lib/schemas/validation';
import { z } from 'zod';
import { PastSurgerySchema } from '@/lib/schemas/past-surgery.schema';
import type {
  PastSurgery,
  PastSurgeryCreatePayload,
  PastSurgeryUpdatePayload,
} from '@/lib/types/past-surgery';

export const pastSurgeriesApi = {
  async listByPatient(patientId: number): Promise<PastSurgery[]> {
    const response = await apiClient.get(`/api/patients/${patientId}/past-surgeries/`);
    return parseResponse(z.array(PastSurgerySchema), response.data.results || [], {
      context: 'pastSurgeriesApi.listByPatient',
    });
  },

  async get(patientId: number, id: number): Promise<PastSurgery> {
    const response = await apiClient.get(`/api/patients/${patientId}/past-surgeries/${id}/`);
    return parseResponse(PastSurgerySchema, response.data, {
      context: 'pastSurgeriesApi.get',
    });
  },

  async create(patientId: number, data: PastSurgeryCreatePayload): Promise<PastSurgery> {
    const response = await apiClient.post(`/api/patients/${patientId}/past-surgeries/`, data);
    return parseResponse(PastSurgerySchema, response.data, {
      context: 'pastSurgeriesApi.create',
    });
  },

  async update(
    patientId: number,
    id: number,
    data: PastSurgeryUpdatePayload
  ): Promise<PastSurgery> {
    const response = await apiClient.patch(
      `/api/patients/${patientId}/past-surgeries/${id}/`,
      data
    );
    return parseResponse(PastSurgerySchema, response.data, {
      context: 'pastSurgeriesApi.update',
    });
  },

  async delete(patientId: number, id: number): Promise<void> {
    await apiClient.delete(`/api/patients/${patientId}/past-surgeries/${id}/`);
  },
};
