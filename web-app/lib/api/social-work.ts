/**
 * Social Work API Client
 * Sprint Allied Health - Social Work
 */

import { apiClient } from './client';
import { parseResponse } from '@/lib/schemas/validation';
import {
  SWReferralSchema,
  SWCaseSchema,
  CaseNoteSchema,
  SWInterventionSchema,
  PaginatedSWReferralListSchema,
  PaginatedSWCaseListSchema,
  PaginatedCaseNoteListSchema,
  PaginatedSWInterventionListSchema,
} from '@/lib/schemas/social-work.schema';
import type {
  SWReferral,
  SWReferralListItem,
  SWReferralCreateData,
  SWReferralListParams,
  SWCase,
  SWCaseListItem,
  SWCaseCreateData,
  SWCaseUpdateData,
  SWCaseListParams,
  CaseNote,
  CaseNoteCreateData,
  CaseNoteListParams,
  SWIntervention,
  SWInterventionCreateData,
  SWInterventionListParams,
} from '@/lib/types/social-work';
import type { PaginatedResponse } from '@/lib/types/allied-health';

const BASE_URL = '/api/social-work';

export const socialWorkApi = {
  // ============ Referrals ============

  listReferrals: async (
    params?: SWReferralListParams
  ): Promise<PaginatedResponse<SWReferralListItem>> => {
    const response = await apiClient.get(`${BASE_URL}/referrals/`, { params });
    return parseResponse(PaginatedSWReferralListSchema, response.data, {
      context: 'socialWorkApi.listReferrals',
    });
  },

  getReferral: async (id: number): Promise<SWReferral> => {
    const response = await apiClient.get(`${BASE_URL}/referrals/${id}/`);
    return parseResponse(SWReferralSchema, response.data, {
      context: 'socialWorkApi.getReferral',
    });
  },

  getReferralByNumber: async (referralNumber: string): Promise<SWReferral> => {
    const response = await apiClient.get(`${BASE_URL}/referrals/`, {
      params: { referral_number: referralNumber },
    });
    const paginated = parseResponse(PaginatedSWReferralListSchema, response.data, {
      context: 'socialWorkApi.getReferralByNumber',
    });
    const firstResult = paginated.results[0];
    if (!firstResult) {
      throw new Error(`Referral ${referralNumber} not found`);
    }
    return socialWorkApi.getReferral(firstResult.id);
  },

  createReferral: async (data: SWReferralCreateData): Promise<SWReferral> => {
    const response = await apiClient.post(`${BASE_URL}/referrals/`, data);
    return parseResponse(SWReferralSchema, response.data, {
      context: 'socialWorkApi.createReferral',
    });
  },

  updateReferral: async (
    id: number,
    data: Partial<SWReferralCreateData>
  ): Promise<SWReferral> => {
    const response = await apiClient.patch(`${BASE_URL}/referrals/${id}/`, data);
    return parseResponse(SWReferralSchema, response.data, {
      context: 'socialWorkApi.updateReferral',
    });
  },

  deleteReferral: async (id: number): Promise<void> => {
    await apiClient.delete(`${BASE_URL}/referrals/${id}/`);
  },

  // Referral Actions
  acceptReferral: async (id: number): Promise<SWReferral> => {
    const response = await apiClient.post(`${BASE_URL}/referrals/${id}/accept/`);
    return parseResponse(SWReferralSchema, response.data, {
      context: 'socialWorkApi.acceptReferral',
    });
  },

  rejectReferral: async (id: number, reason?: string): Promise<SWReferral> => {
    const response = await apiClient.post(`${BASE_URL}/referrals/${id}/reject/`, { reason });
    return parseResponse(SWReferralSchema, response.data, {
      context: 'socialWorkApi.rejectReferral',
    });
  },

  assignWorker: async (id: number, workerId: number): Promise<SWReferral> => {
    const response = await apiClient.post(`${BASE_URL}/referrals/${id}/assign_worker/`, {
      worker_id: workerId,
    });
    return parseResponse(SWReferralSchema, response.data, {
      context: 'socialWorkApi.assignWorker',
    });
  },

  createCaseFromReferral: async (
    id: number,
    caseData: Omit<SWCaseCreateData, 'referral_id'>
  ): Promise<SWCase> => {
    const response = await apiClient.post(`${BASE_URL}/referrals/${id}/create_case/`, caseData);
    return parseResponse(SWCaseSchema, response.data, {
      context: 'socialWorkApi.createCaseFromReferral',
    });
  },

  cancelReferral: async (id: number, reason?: string): Promise<SWReferral> => {
    const response = await apiClient.post(`${BASE_URL}/referrals/${id}/cancel/`, { reason });
    return parseResponse(SWReferralSchema, response.data, {
      context: 'socialWorkApi.cancelReferral',
    });
  },

  // ============ Cases ============

  listCases: async (params?: SWCaseListParams): Promise<PaginatedResponse<SWCaseListItem>> => {
    const response = await apiClient.get(`${BASE_URL}/cases/`, { params });
    return parseResponse(PaginatedSWCaseListSchema, response.data, {
      context: 'socialWorkApi.listCases',
    });
  },

  getCase: async (id: number): Promise<SWCase> => {
    const response = await apiClient.get(`${BASE_URL}/cases/${id}/`);
    return parseResponse(SWCaseSchema, response.data, {
      context: 'socialWorkApi.getCase',
    });
  },

  getCaseByNumber: async (caseNumber: string): Promise<SWCase> => {
    const response = await apiClient.get(`${BASE_URL}/cases/`, {
      params: { case_number: caseNumber },
    });
    const paginated = parseResponse(PaginatedSWCaseListSchema, response.data, {
      context: 'socialWorkApi.getCaseByNumber',
    });
    const firstResult = paginated.results[0];
    if (!firstResult) {
      throw new Error(`Case ${caseNumber} not found`);
    }
    return socialWorkApi.getCase(firstResult.id);
  },

  createCase: async (data: SWCaseCreateData): Promise<SWCase> => {
    const response = await apiClient.post(`${BASE_URL}/cases/`, data);
    return parseResponse(SWCaseSchema, response.data, {
      context: 'socialWorkApi.createCase',
    });
  },

  updateCase: async (id: number, data: SWCaseUpdateData): Promise<SWCase> => {
    const response = await apiClient.patch(`${BASE_URL}/cases/${id}/`, data);
    return parseResponse(SWCaseSchema, response.data, {
      context: 'socialWorkApi.updateCase',
    });
  },

  deleteCase: async (id: number): Promise<void> => {
    await apiClient.delete(`${BASE_URL}/cases/${id}/`);
  },

  // Case Actions
  updateCaseStatus: async (
    id: number,
    status: SWCase['status'],
    reason?: string
  ): Promise<SWCase> => {
    const response = await apiClient.post(`${BASE_URL}/cases/${id}/update_status/`, {
      status,
      reason,
    });
    return parseResponse(SWCaseSchema, response.data, {
      context: 'socialWorkApi.updateCaseStatus',
    });
  },

  closeCase: async (
    id: number,
    closureReason: string,
    outcomeSummary?: string
  ): Promise<SWCase> => {
    const response = await apiClient.post(`${BASE_URL}/cases/${id}/close/`, {
      closure_reason: closureReason,
      outcome_summary: outcomeSummary,
    });
    return parseResponse(SWCaseSchema, response.data, {
      context: 'socialWorkApi.closeCase',
    });
  },

  reopenCase: async (id: number, reason?: string): Promise<SWCase> => {
    const response = await apiClient.post(`${BASE_URL}/cases/${id}/reopen/`, { reason });
    return parseResponse(SWCaseSchema, response.data, {
      context: 'socialWorkApi.reopenCase',
    });
  },

  // ============ Case Notes ============

  listCaseNotes: async (
    params?: CaseNoteListParams
  ): Promise<PaginatedResponse<CaseNote>> => {
    const response = await apiClient.get(`${BASE_URL}/notes/`, { params });
    return parseResponse(PaginatedCaseNoteListSchema, response.data, {
      context: 'socialWorkApi.listCaseNotes',
    });
  },

  getCaseNote: async (id: number): Promise<CaseNote> => {
    const response = await apiClient.get(`${BASE_URL}/notes/${id}/`);
    return parseResponse(CaseNoteSchema, response.data, {
      context: 'socialWorkApi.getCaseNote',
    });
  },

  createCaseNote: async (data: CaseNoteCreateData): Promise<CaseNote> => {
    const response = await apiClient.post(`${BASE_URL}/notes/`, data);
    return parseResponse(CaseNoteSchema, response.data, {
      context: 'socialWorkApi.createCaseNote',
    });
  },

  updateCaseNote: async (
    id: number,
    data: Partial<CaseNoteCreateData>
  ): Promise<CaseNote> => {
    const response = await apiClient.patch(`${BASE_URL}/notes/${id}/`, data);
    return parseResponse(CaseNoteSchema, response.data, {
      context: 'socialWorkApi.updateCaseNote',
    });
  },

  deleteCaseNote: async (id: number): Promise<void> => {
    await apiClient.delete(`${BASE_URL}/notes/${id}/`);
  },

  // ============ Interventions ============

  listInterventions: async (
    params?: SWInterventionListParams
  ): Promise<PaginatedResponse<SWIntervention>> => {
    const response = await apiClient.get(`${BASE_URL}/interventions/`, { params });
    return parseResponse(PaginatedSWInterventionListSchema, response.data, {
      context: 'socialWorkApi.listInterventions',
    });
  },

  getIntervention: async (id: number): Promise<SWIntervention> => {
    const response = await apiClient.get(`${BASE_URL}/interventions/${id}/`);
    return parseResponse(SWInterventionSchema, response.data, {
      context: 'socialWorkApi.getIntervention',
    });
  },

  createIntervention: async (data: SWInterventionCreateData): Promise<SWIntervention> => {
    const response = await apiClient.post(`${BASE_URL}/interventions/`, data);
    return parseResponse(SWInterventionSchema, response.data, {
      context: 'socialWorkApi.createIntervention',
    });
  },

  updateIntervention: async (
    id: number,
    data: Partial<SWInterventionCreateData>
  ): Promise<SWIntervention> => {
    const response = await apiClient.patch(`${BASE_URL}/interventions/${id}/`, data);
    return parseResponse(SWInterventionSchema, response.data, {
      context: 'socialWorkApi.updateIntervention',
    });
  },

  deleteIntervention: async (id: number): Promise<void> => {
    await apiClient.delete(`${BASE_URL}/interventions/${id}/`);
  },

  // Intervention Actions
  startIntervention: async (id: number): Promise<SWIntervention> => {
    const response = await apiClient.post(`${BASE_URL}/interventions/${id}/start/`);
    return parseResponse(SWInterventionSchema, response.data, {
      context: 'socialWorkApi.startIntervention',
    });
  },

  completeIntervention: async (id: number, outcome?: string): Promise<SWIntervention> => {
    const response = await apiClient.post(`${BASE_URL}/interventions/${id}/complete/`, {
      outcome,
    });
    return parseResponse(SWInterventionSchema, response.data, {
      context: 'socialWorkApi.completeIntervention',
    });
  },

  cancelIntervention: async (id: number, reason?: string): Promise<SWIntervention> => {
    const response = await apiClient.post(`${BASE_URL}/interventions/${id}/cancel/`, { reason });
    return parseResponse(SWInterventionSchema, response.data, {
      context: 'socialWorkApi.cancelIntervention',
    });
  },

  // ============ Helper Methods ============

  getCaseNotes: async (caseId: number): Promise<PaginatedResponse<CaseNote>> => {
    return socialWorkApi.listCaseNotes({ case_id: caseId });
  },

  getCaseInterventions: async (caseId: number): Promise<PaginatedResponse<SWIntervention>> => {
    return socialWorkApi.listInterventions({ case_id: caseId });
  },
};
