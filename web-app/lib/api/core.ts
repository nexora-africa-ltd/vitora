/**
 * Core Utilities API Client
 * API functions for core utility operations like case number generation
 */

import { apiClient } from './client';
import { parseResponse } from '@/lib/schemas/validation';
import {
  CaseNumberResponseSchema,
  EmergencyAccessDashboardStatsSchema,
  EmergencyAccessSchema,
  PaginatedEmergencyAccessSchema,
  PRCNumberResponseSchema,
} from '@/lib/schemas/core.schema';

export interface PRCNumberResponse {
  prc_number: string;
}

export interface CaseNumberResponse {
  case_number: string;
}

export interface EmergencyAccess {
  id: number;
  user: number;
  user_username: string;
  user_full_name: string;
  patient: number | null;
  patient_mrn: string | null;
  patient_name: string | null;
  reason:
    | 'LIFE_THREATENING'
    | 'UNCONSCIOUS_PATIENT'
    | 'MASS_CASUALTY'
    | 'CRITICAL_LAB_RESULT'
    | 'MEDICATION_EMERGENCY'
    | 'DISASTER_RESPONSE'
    | 'OTHER';
  reason_display: string;
  reason_details: string;
  requested_at: string;
  expires_at: string;
  duration_minutes: number;
  status: 'ACTIVE' | 'EXPIRED' | 'REVOKED' | 'REVIEWED';
  status_display: string;
  is_active: boolean;
  is_expired: boolean;
  remaining_minutes: number;
  approver: number | null;
  approver_username: string | null;
  approved_at: string | null;
  approval_notes: string;
  revoked_by: number | null;
  revoked_by_username: string | null;
  revoked_at: string | null;
  revocation_reason: string;
  escalation_sent: boolean;
  escalation_sent_at: string | null;
  ip_address: string | null;
}

export interface EmergencyAccessDashboardStats {
  total_active: number;
  total_pending_review: number;
  total_today: number;
  total_this_week: number;
  by_reason: Record<string, number>;
  by_status: Record<string, number>;
}

export const coreApi = {
  /**
   * Generate a new PRC (Post-Rape Care) Number.
   * Format: {FACILITY_CODE}-PRC-{SEQUENCE}/{YEAR}
   * Example: FAC-PRC-0042/2026
   */
  async generatePRCNumber(facilityCode?: string): Promise<string> {
    const params = facilityCode ? { facility_code: facilityCode } : {};
    const response = await apiClient.get<PRCNumberResponse>('/api/core/generate/prc-number/', {
      params,
    });
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
    const response = await apiClient.get<CaseNumberResponse>('/api/core/generate/case-number/', {
      params,
    });
    const validated = parseResponse(CaseNumberResponseSchema, response.data, {
      context: 'coreApi.generateCaseNumber',
    });
    return validated.case_number;
  },

  async listEmergencyAccess(params?: {
    status?: string;
    pending_review?: boolean;
    since?: string;
    page?: number;
    page_size?: number;
  }): Promise<{ count: number; results: EmergencyAccess[] }> {
    const response = await apiClient.get('/api/core/emergency-access/', { params });
    return parseResponse(PaginatedEmergencyAccessSchema, response.data, {
      context: 'coreApi.listEmergencyAccess',
    });
  },

  async getEmergencyAccess(id: number): Promise<EmergencyAccess> {
    const response = await apiClient.get(`/api/core/emergency-access/${id}/`);
    return parseResponse(EmergencyAccessSchema, response.data, {
      context: 'coreApi.getEmergencyAccess',
    });
  },

  async createEmergencyAccess(data: {
    reason: EmergencyAccess['reason'];
    reason_details: string;
    duration_minutes?: number;
    patient_mrn?: string;
  }): Promise<EmergencyAccess> {
    const response = await apiClient.post('/api/core/emergency-access/', data);
    return parseResponse(EmergencyAccessSchema, response.data, {
      context: 'coreApi.createEmergencyAccess',
    });
  },

  async reviewEmergencyAccess(
    id: number,
    data: { action: 'approve' | 'revoke'; notes?: string }
  ): Promise<EmergencyAccess> {
    const response = await apiClient.post(`/api/core/emergency-access/${id}/review/`, data);
    return parseResponse(EmergencyAccessSchema, response.data, {
      context: 'coreApi.reviewEmergencyAccess',
    });
  },

  async emergencyAccessDashboardStats(): Promise<EmergencyAccessDashboardStats> {
    const response = await apiClient.get('/api/core/emergency-access/dashboard_stats/');
    return parseResponse(EmergencyAccessDashboardStatsSchema, response.data, {
      context: 'coreApi.emergencyAccessDashboardStats',
    });
  },

  async myActiveEmergencyAccess(): Promise<EmergencyAccess[]> {
    const response = await apiClient.get('/api/core/emergency-access/my_active/');
    return parseResponse(EmergencyAccessSchema.array(), response.data, {
      context: 'coreApi.myActiveEmergencyAccess',
    });
  },
};

export default coreApi;
