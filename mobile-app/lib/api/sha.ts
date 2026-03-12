/**
 * SHA eligibility API module.
 */

import type {
  SHADirectEligibilityRequest,
  SHADirectEligibilityResponse,
  SHAEligibility,
  SHAEligibilityRequest,
  SHAEligibilityResponse,
} from '@/lib/types/sha';
import { getCoverageStatus } from '@/lib/types/sha';
import { getApiClient } from './client';

function normalizeEligibility(
  response: SHAEligibilityResponse,
  patientId?: number,
): SHAEligibility {
  const reason = response.ineligibility_reason || response.message || '';

  return {
    ...response,
    patient_id: patientId,
    ineligibility_reason: reason,
    checked_at: new Date().toISOString(),
    coverage_status: getCoverageStatus({ is_eligible: response.is_eligible }),
  };
}

export const shaApi = {
  /**
   * Check SHA eligibility using a patient ID or SHA number.
   */
  async checkEligibility(data: SHAEligibilityRequest): Promise<SHAEligibility> {
    const client = getApiClient();
    const response = await client.post<SHAEligibilityResponse>(
      '/api/billing/eligibility/check/',
      data,
    );

    return normalizeEligibility(response.data, data.patient_id);
  },

  /**
   * Convenience helper to check by patient ID.
   */
  async checkPatientEligibility(patientId: number): Promise<SHAEligibility> {
    return this.checkEligibility({ patient_id: patientId });
  },

  /**
   * Direct SHA lookup using identification data.
   */
  async checkDirectEligibility(
    params: SHADirectEligibilityRequest,
  ): Promise<SHADirectEligibilityResponse> {
    const client = getApiClient();
    const response = await client.get<SHADirectEligibilityResponse>(
      '/api/billing/eligibility/direct/',
      { params },
    );
    return response.data;
  },
};