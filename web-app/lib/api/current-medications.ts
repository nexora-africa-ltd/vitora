import { apiClient } from './client';
import { parseResponse } from '@/lib/schemas/validation';
import { z } from 'zod';
import { CurrentMedicationSchema } from '@/lib/schemas/current-medication.schema';
import type {
  CurrentMedication,
  CurrentMedicationCreatePayload,
  CurrentMedicationUpdatePayload,
} from '@/lib/types/current-medication';

export const currentMedicationsApi = {
  async listByPatient(patientId: number): Promise<CurrentMedication[]> {
    const response = await apiClient.get(`/api/patients/${patientId}/current-medications/`);
    return parseResponse(z.array(CurrentMedicationSchema), response.data.results || [], {
      context: 'currentMedicationsApi.listByPatient',
    });
  },

  async get(patientId: number, id: number): Promise<CurrentMedication> {
    const response = await apiClient.get(
      `/api/patients/${patientId}/current-medications/${id}/`
    );
    return parseResponse(CurrentMedicationSchema, response.data, {
      context: 'currentMedicationsApi.get',
    });
  },

  async create(
    patientId: number,
    data: CurrentMedicationCreatePayload
  ): Promise<CurrentMedication> {
    const response = await apiClient.post(
      `/api/patients/${patientId}/current-medications/`,
      data
    );
    return parseResponse(CurrentMedicationSchema, response.data, {
      context: 'currentMedicationsApi.create',
    });
  },

  async update(
    patientId: number,
    id: number,
    data: CurrentMedicationUpdatePayload
  ): Promise<CurrentMedication> {
    const response = await apiClient.patch(
      `/api/patients/${patientId}/current-medications/${id}/`,
      data
    );
    return parseResponse(CurrentMedicationSchema, response.data, {
      context: 'currentMedicationsApi.update',
    });
  },

  async delete(patientId: number, id: number): Promise<void> {
    await apiClient.delete(`/api/patients/${patientId}/current-medications/${id}/`);
  },
};
