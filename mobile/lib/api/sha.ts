import { PatientSHAEligibilitySchema, SHADirectEligibilityResponseSchema, SHAEligibilityResponseSchema } from '@/lib/schemas/sha.schema';
import { parseResponse } from '@/lib/schemas/validation';
import { getCoverageStatus } from '@/lib/types/sha';
import type { PatientSHAEligibility, SHADirectEligibilityRequest, SHADirectEligibilityResponse, SHAEligibilityRequest, SHAEligibilityResponse } from '@/lib/types/sha';

import { apiClient } from './client';

function normalizeEligibility(response: SHAEligibilityResponse, patientId: number): PatientSHAEligibility {
  return parseResponse(
    PatientSHAEligibilitySchema,
    {
      ...response,
      patient_id: patientId,
      checked_at: new Date().toISOString(),
      coverage_status: getCoverageStatus(response.is_eligible),
    },
    { context: 'sha.normalizeEligibility' },
  );
}

export const shaApi = {
  async checkEligibility(data: SHAEligibilityRequest): Promise<SHAEligibilityResponse> {
    const response = await apiClient.post('/api/billing/eligibility/check/', data);
    return parseResponse(SHAEligibilityResponseSchema, response.data, { context: 'sha.checkEligibility' });
  },

  async checkPatientEligibility(patientId: number): Promise<PatientSHAEligibility> {
    const response = await this.checkEligibility({ patient_id: patientId });
    return normalizeEligibility(response, patientId);
  },

  async checkDirectEligibility(params: SHADirectEligibilityRequest): Promise<SHADirectEligibilityResponse> {
    const response = await apiClient.get('/api/billing/eligibility/direct/', { params });
    return parseResponse(SHADirectEligibilityResponseSchema, response.data, { context: 'sha.checkDirectEligibility' });
  },
};
