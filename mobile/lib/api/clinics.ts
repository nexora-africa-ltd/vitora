import { apiClient } from './client';
import { PaginatedClinicSchema } from '@/lib/schemas/clinic.schema';
import { parseResponse } from '@/lib/schemas/validation';
import type { ClinicListParams, PaginatedClinics } from '@/lib/types/clinic';

export const clinicsApi = {
  async list(params: ClinicListParams = {}): Promise<PaginatedClinics> {
    const response = await apiClient.get('/api/clinics/', { params });
    return parseResponse(PaginatedClinicSchema, response.data, { context: 'clinics.list' });
  },
};