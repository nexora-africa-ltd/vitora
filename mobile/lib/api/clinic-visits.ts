import { apiClient } from './client';
import { ClinicVisitSchema } from '@/lib/schemas/clinic.schema';
import { parseResponse } from '@/lib/schemas/validation';
import type { ClinicVisit } from '@/lib/types/clinic';

export const clinicVisitsApi = {
  async get(id: number): Promise<ClinicVisit> {
    const response = await apiClient.get(`/api/clinic-visits/${id}/`);
    return parseResponse(ClinicVisitSchema, response.data, { context: 'clinicVisits.get' });
  },

  async startConsultation(id: number): Promise<ClinicVisit> {
    const response = await apiClient.post(`/api/clinic-visits/${id}/start/`);
    return parseResponse(ClinicVisitSchema, response.data, { context: 'clinicVisits.startConsultation' });
  },
};
