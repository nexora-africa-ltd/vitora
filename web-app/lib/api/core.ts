/**
 * Core Utilities API Client
 * API functions for core utility operations like case number generation
 */

import { apiClient } from './client';
import { parseResponse } from '@/lib/schemas/validation';
import {
  PRCNumberResponseSchema,
  CaseNumberResponseSchema,
} from '@/lib/schemas/core.schema';

export interface PRCNumberResponse {
  prc_number: string;
}

export interface CaseNumberResponse {
  case_number: string;
}

export const coreApi = {
  /**
   * Generate a new PRC (Post-Rape Care) Number.
   * Format: {FACILITY_CODE}-PRC-{SEQUENCE}/{YEAR}
   * Example: FAC-PRC-0042/2026
   */
  async generatePRCNumber(facilityCode?: string): Promise<string> {
    const params = facilityCode ? { facility_code: facilityCode } : {};
    const response = await apiClient.get<PRCNumberResponse>(
      '/api/core/generate/prc-number/',
      { params }
    );
    const validated = parseResponse(PRCNumberResponseSchema, response.data, {
      context: 'coreApi.generatePRCNumber',
    });
    return validated.prc_number;
  },

  /**
   * Generate a generic case number with a given prefix.
   * Format: {FACILITY_CODE}-{PREFIX}-{SEQUENCE}/{YEAR}
   * Example: FAC-RTA-0001/2026
   */
  async generateCaseNumber(prefix: string, facilityCode?: string): Promise<string> {
    const params: Record<string, string> = { prefix };
    if (facilityCode) {
      params.facility_code = facilityCode;
    }
    const response = await apiClient.get<CaseNumberResponse>(
      '/api/core/generate/case-number/',
      { params }
    );
    const validated = parseResponse(CaseNumberResponseSchema, response.data, {
      context: 'coreApi.generateCaseNumber',
    });
    return validated.case_number;
  },
};

export default coreApi;
