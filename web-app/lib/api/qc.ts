/**
 * API client for QC (Quality Control) module.
 */

import { apiClient } from './client';
import { parseResponse } from '@/lib/schemas/validation';
import {
  PaginatedQCMaterialSchema,
  QCMaterialSchema,
  PaginatedQCLotSchema,
  QCLotDetailSchema,
  QCLotArraySchema,
  PaginatedQCTargetSchema,
  QCTargetSchema,
  PaginatedQCResultSchema,
  QCResultDetailSchema,
  LeveyJenningsDataSchema,
  QCRuleArraySchema,
  QCRuleSchema,
  QCRuleViolationSchema,
  QCRuleViolationArraySchema,
  PaginatedEQASurveySchema,
  EQASurveyDetailSchema,
  EQASampleSchema,
  EQASubmissionSchema,
  EQASubmissionArraySchema,
} from '@/lib/schemas/qc.schema';
import type {
  QCMaterial,
  QCMaterialCreateData,
  QCLot,
  QCLotDetail,
  QCLotCreateData,
  QCLotListParams,
  QCTarget,
  QCTargetCreateData,
  QCResult,
  QCResultDetail,
  QCResultCreateData,
  QCResultListParams,
  QCRule,
  QCRuleCreateData,
  QCRuleViolation,
  LeveyJenningsData,
  EQASurvey,
  EQASurveyDetail,
  EQASurveyCreateData,
  EQASurveyListParams,
  EQASample,
  EQASampleCreateData,
  EQASubmission,
  EQASubmissionCreateData,
  EQAUpdateScoreData,
} from '@/lib/types/qc';
import type { PaginatedResponse } from '@/lib/types';

const QC_BASE = '/api/lab/qc';

// ============================================================================
// QC Materials
// ============================================================================

export const qcMaterialsApi = {
  async list(params?: { page?: number; search?: string }): Promise<PaginatedResponse<QCMaterial>> {
    const response = await apiClient.get(`${QC_BASE}/materials/`, { params });
    return parseResponse(PaginatedQCMaterialSchema, response.data, { context: 'qcMaterialsApi.list' });
  },

  async get(id: number): Promise<QCMaterial> {
    const response = await apiClient.get(`${QC_BASE}/materials/${id}/`);
    return parseResponse(QCMaterialSchema, response.data, { context: 'qcMaterialsApi.get' });
  },

  async create(data: QCMaterialCreateData): Promise<QCMaterial> {
    const response = await apiClient.post(`${QC_BASE}/materials/`, data);
    return parseResponse(QCMaterialSchema, response.data, { context: 'qcMaterialsApi.create' });
  },

  async update(id: number, data: Partial<QCMaterialCreateData>): Promise<QCMaterial> {
    const response = await apiClient.patch(`${QC_BASE}/materials/${id}/`, data);
    return parseResponse(QCMaterialSchema, response.data, { context: 'qcMaterialsApi.update' });
  },

  async delete(id: number): Promise<void> {
    await apiClient.delete(`${QC_BASE}/materials/${id}/`);
  },
};

// ============================================================================
// QC Lots
// ============================================================================

export const qcLotsApi = {
  async list(params?: QCLotListParams): Promise<PaginatedResponse<QCLot>> {
    const response = await apiClient.get(`${QC_BASE}/lots/`, { params });
    return parseResponse(PaginatedQCLotSchema, response.data, { context: 'qcLotsApi.list' });
  },

  async get(id: number): Promise<QCLotDetail> {
    const response = await apiClient.get(`${QC_BASE}/lots/${id}/`);
    return parseResponse(QCLotDetailSchema, response.data, { context: 'qcLotsApi.get' });
  },

  async create(data: QCLotCreateData): Promise<QCLotDetail> {
    const response = await apiClient.post(`${QC_BASE}/lots/`, data);
    return parseResponse(QCLotDetailSchema, response.data, { context: 'qcLotsApi.create' });
  },

  async update(id: number, data: Partial<QCLotCreateData>): Promise<QCLotDetail> {
    const response = await apiClient.patch(`${QC_BASE}/lots/${id}/`, data);
    return parseResponse(QCLotDetailSchema, response.data, { context: 'qcLotsApi.update' });
  },

  async delete(id: number): Promise<void> {
    await apiClient.delete(`${QC_BASE}/lots/${id}/`);
  },

  async expiringSoon(): Promise<QCLot[]> {
    const response = await apiClient.get(`${QC_BASE}/lots/expiring_soon/`);
    return parseResponse(QCLotArraySchema, response.data, { context: 'qcLotsApi.expiringSoon' });
  },
};

// ============================================================================
// QC Targets
// ============================================================================

export const qcTargetsApi = {
  async list(params?: { lot?: number; test?: number; page?: number }): Promise<PaginatedResponse<QCTarget>> {
    const response = await apiClient.get(`${QC_BASE}/targets/`, { params });
    return parseResponse(PaginatedQCTargetSchema, response.data, { context: 'qcTargetsApi.list' });
  },

  async create(data: QCTargetCreateData): Promise<QCTarget> {
    const response = await apiClient.post(`${QC_BASE}/targets/`, data);
    return parseResponse(QCTargetSchema, response.data, { context: 'qcTargetsApi.create' });
  },

  async update(id: number, data: Partial<QCTargetCreateData>): Promise<QCTarget> {
    const response = await apiClient.patch(`${QC_BASE}/targets/${id}/`, data);
    return parseResponse(QCTargetSchema, response.data, { context: 'qcTargetsApi.update' });
  },

  async delete(id: number): Promise<void> {
    await apiClient.delete(`${QC_BASE}/targets/${id}/`);
  },
};

// ============================================================================
// QC Results
// ============================================================================

export const qcResultsApi = {
  async list(params?: QCResultListParams): Promise<PaginatedResponse<QCResult>> {
    const response = await apiClient.get(`${QC_BASE}/results/`, { params });
    return parseResponse(PaginatedQCResultSchema, response.data, { context: 'qcResultsApi.list' });
  },

  async get(id: number): Promise<QCResultDetail> {
    const response = await apiClient.get(`${QC_BASE}/results/${id}/`);
    return parseResponse(QCResultDetailSchema, response.data, { context: 'qcResultsApi.get' });
  },

  async create(data: QCResultCreateData): Promise<QCResult> {
    const response = await apiClient.post(`${QC_BASE}/results/`, data);
    return parseResponse(QCResultDetailSchema, response.data, { context: 'qcResultsApi.create' });
  },

  async getLeveyJennings(params: {
    lot_id: number;
    test_id: number;
    instrument_id?: number;
    limit?: number;
  }): Promise<LeveyJenningsData> {
    const response = await apiClient.get(`${QC_BASE}/results/levey-jennings/`, { params });
    return parseResponse(LeveyJenningsDataSchema, response.data, { context: 'qcResultsApi.getLeveyJennings' });
  },
};

// ============================================================================
// QC Rules
// ============================================================================

export const qcRulesApi = {
  async list(params?: { rule_type?: string; is_active?: boolean }): Promise<QCRule[]> {
    const response = await apiClient.get(`${QC_BASE}/rules/`, { params });
    const data = Array.isArray(response.data) ? response.data : response.data.results || [];
    return parseResponse(QCRuleArraySchema, data, { context: 'qcRulesApi.list' });
  },

  async create(data: QCRuleCreateData): Promise<QCRule> {
    const response = await apiClient.post(`${QC_BASE}/rules/`, data);
    return parseResponse(QCRuleSchema, response.data, { context: 'qcRulesApi.create' });
  },

  async update(id: number, data: Partial<QCRuleCreateData>): Promise<QCRule> {
    const response = await apiClient.patch(`${QC_BASE}/rules/${id}/`, data);
    return parseResponse(QCRuleSchema, response.data, { context: 'qcRulesApi.update' });
  },

  async delete(id: number): Promise<void> {
    await apiClient.delete(`${QC_BASE}/rules/${id}/`);
  },

  async seedDefaults(): Promise<QCRule[]> {
    const response = await apiClient.post(`${QC_BASE}/rules/seed-defaults/`);
    if (response.data.message) return [];
    return parseResponse(QCRuleArraySchema, response.data, { context: 'qcRulesApi.seedDefaults' });
  },
};

// ============================================================================
// QC Violations
// ============================================================================

export const qcViolationsApi = {
  async list(params?: {
    severity?: string;
    acknowledged?: boolean;
    page?: number;
  }): Promise<QCRuleViolation[]> {
    const response = await apiClient.get(`${QC_BASE}/violations/`, { params });
    const data = Array.isArray(response.data) ? response.data : response.data.results || [];
    return parseResponse(QCRuleViolationArraySchema, data, { context: 'qcViolationsApi.list' });
  },

  async acknowledge(id: number, corrective_action?: string): Promise<QCRuleViolation> {
    const response = await apiClient.post(`${QC_BASE}/violations/${id}/acknowledge/`, {
      corrective_action: corrective_action || '',
    });
    return parseResponse(QCRuleViolationSchema, response.data, { context: 'qcViolationsApi.acknowledge' });
  },
};

// ============================================================================
// EQA Surveys
// ============================================================================

export const eqaSurveysApi = {
  async list(params?: EQASurveyListParams): Promise<PaginatedResponse<EQASurvey>> {
    const response = await apiClient.get(`${QC_BASE}/eqa/surveys/`, { params });
    return parseResponse(PaginatedEQASurveySchema, response.data, { context: 'eqaSurveysApi.list' });
  },

  async get(id: number): Promise<EQASurveyDetail> {
    const response = await apiClient.get(`${QC_BASE}/eqa/surveys/${id}/`);
    return parseResponse(EQASurveyDetailSchema, response.data, { context: 'eqaSurveysApi.get' });
  },

  async create(data: EQASurveyCreateData): Promise<EQASurveyDetail> {
    const response = await apiClient.post(`${QC_BASE}/eqa/surveys/`, data);
    return parseResponse(EQASurveyDetailSchema, response.data, { context: 'eqaSurveysApi.create' });
  },

  async update(id: number, data: Partial<EQASurveyCreateData>): Promise<EQASurveyDetail> {
    const response = await apiClient.patch(`${QC_BASE}/eqa/surveys/${id}/`, data);
    return parseResponse(EQASurveyDetailSchema, response.data, { context: 'eqaSurveysApi.update' });
  },

  async markSubmitted(id: number): Promise<EQASurveyDetail> {
    const response = await apiClient.post(`${QC_BASE}/eqa/surveys/${id}/submit/`);
    return parseResponse(EQASurveyDetailSchema, response.data, { context: 'eqaSurveysApi.markSubmitted' });
  },
};

// ============================================================================
// EQA Samples
// ============================================================================

export const eqaSamplesApi = {
  async list(params?: { survey?: number }): Promise<EQASample[]> {
    const response = await apiClient.get(`${QC_BASE}/eqa/samples/`, { params });
    const data = Array.isArray(response.data) ? response.data : response.data.results || [];
    return data as EQASample[];
  },

  async create(data: EQASampleCreateData): Promise<EQASample> {
    const response = await apiClient.post(`${QC_BASE}/eqa/samples/`, data);
    return parseResponse(EQASampleSchema, response.data, { context: 'eqaSamplesApi.create' });
  },
};

// ============================================================================
// EQA Submissions
// ============================================================================

export const eqaSubmissionsApi = {
  async list(params?: { 'sample__survey'?: number; performance?: string }): Promise<EQASubmission[]> {
    const response = await apiClient.get(`${QC_BASE}/eqa/submissions/`, { params });
    const data = Array.isArray(response.data) ? response.data : response.data.results || [];
    return parseResponse(EQASubmissionArraySchema, data, { context: 'eqaSubmissionsApi.list' });
  },

  async create(data: EQASubmissionCreateData): Promise<EQASubmission> {
    const response = await apiClient.post(`${QC_BASE}/eqa/submissions/`, data);
    return parseResponse(EQASubmissionSchema, response.data, { context: 'eqaSubmissionsApi.create' });
  },

  async updateScore(id: number, data: EQAUpdateScoreData): Promise<EQASubmission> {
    const response = await apiClient.post(`${QC_BASE}/eqa/submissions/${id}/update-score/`, data);
    return parseResponse(EQASubmissionSchema, response.data, { context: 'eqaSubmissionsApi.updateScore' });
  },
};
