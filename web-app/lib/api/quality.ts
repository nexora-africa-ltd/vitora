/**
 * Quality Measures & Reporting API client.
 *
 * Provides API methods for quarterly/annual reports, quality measure definitions (CQM),
 * measure results, import/export, and quality dashboard.
 *
 * All responses are validated with Zod schemas to catch data shape mismatches
 * at runtime before they cause errors in components.
 *
 * Backend: hmis/apps/quality/ (serializers.py, views.py)
 * Endpoints: /api/quality/...
 */

import { apiClient } from './client';
import { parseResponse } from '@/lib/schemas/validation';
import {
  QuarterlyReportSchema,
  AnnualReportSchema,
  QualityMeasureSchema,
  QualityMeasureResultSchema,
  QualityDashboardSchema,
  QualityMeasureImportResultSchema,
  PaginatedQuarterlyReportSchema,
  PaginatedAnnualReportSchema,
  PaginatedQualityMeasureSchema,
  PaginatedQualityMeasureResultSchema,
} from '@/lib/schemas/quality.schema';
import type {
  QuarterlyReport,
  QuarterlyReportListParams,
  QuarterlyReportGenerateData,
  AnnualReport,
  AnnualReportListParams,
  AnnualReportGenerateData,
  QualityMeasure,
  QualityMeasureCreateData,
  QualityMeasureListParams,
  QualityMeasureResult,
  QualityMeasureResultCreateData,
  QualityMeasureResultListParams,
  QualityMeasureResultTrendParams,
  QualityMeasureExportData,
  QualityMeasureImportResult,
  QualityDashboardData,
  QualityDashboardParams,
} from '@/lib/types/quality';
import type { PaginatedResponse } from '@/lib/types';

const BASE = '/api/quality';

// =============================================================================
// QUARTERLY REPORT ENDPOINTS
// =============================================================================

export const qualityApi = {
  // -------------------------------------------------------------------------
  // Quarterly Reports
  // -------------------------------------------------------------------------

  listQuarterlyReports: async (
    params?: QuarterlyReportListParams,
  ): Promise<PaginatedResponse<QuarterlyReport>> => {
    const response = await apiClient.get<PaginatedResponse<QuarterlyReport>>(
      `${BASE}/quarterly-reports/`,
      { params },
    );
    return parseResponse(PaginatedQuarterlyReportSchema, response.data, {
      context: 'qualityApi.listQuarterlyReports',
    });
  },

  getQuarterlyReport: async (id: number): Promise<QuarterlyReport> => {
    const response = await apiClient.get<QuarterlyReport>(
      `${BASE}/quarterly-reports/${id}/`,
    );
    return parseResponse(QuarterlyReportSchema, response.data, {
      context: 'qualityApi.getQuarterlyReport',
    });
  },

  generateQuarterlyReport: async (
    data: QuarterlyReportGenerateData,
  ): Promise<QuarterlyReport> => {
    const response = await apiClient.post<QuarterlyReport>(
      `${BASE}/quarterly-reports/generate/`,
      data,
    );
    return parseResponse(QuarterlyReportSchema, response.data, {
      context: 'qualityApi.generateQuarterlyReport',
    });
  },

  generateAllQuarterlyReports: async (data: {
    year: number;
    quarter: number;
  }): Promise<QuarterlyReport[]> => {
    const response = await apiClient.post<QuarterlyReport[]>(
      `${BASE}/quarterly-reports/generate-all/`,
      data,
    );
    // Response is an array, validate each item
    const results = Array.isArray(response.data) ? response.data : [];
    return results.map((item, i) =>
      parseResponse(QuarterlyReportSchema, item, {
        context: `qualityApi.generateAllQuarterlyReports[${i}]`,
      }),
    );
  },

  // -------------------------------------------------------------------------
  // Annual Reports
  // -------------------------------------------------------------------------

  listAnnualReports: async (
    params?: AnnualReportListParams,
  ): Promise<PaginatedResponse<AnnualReport>> => {
    const response = await apiClient.get<PaginatedResponse<AnnualReport>>(
      `${BASE}/annual-reports/`,
      { params },
    );
    return parseResponse(PaginatedAnnualReportSchema, response.data, {
      context: 'qualityApi.listAnnualReports',
    });
  },

  getAnnualReport: async (id: number): Promise<AnnualReport> => {
    const response = await apiClient.get<AnnualReport>(
      `${BASE}/annual-reports/${id}/`,
    );
    return parseResponse(AnnualReportSchema, response.data, {
      context: 'qualityApi.getAnnualReport',
    });
  },

  generateAnnualReport: async (
    data: AnnualReportGenerateData,
  ): Promise<AnnualReport> => {
    const response = await apiClient.post<AnnualReport>(
      `${BASE}/annual-reports/generate/`,
      data,
    );
    return parseResponse(AnnualReportSchema, response.data, {
      context: 'qualityApi.generateAnnualReport',
    });
  },

  // -------------------------------------------------------------------------
  // Quality Measures (CQM Definitions)
  // -------------------------------------------------------------------------

  listMeasures: async (
    params?: QualityMeasureListParams,
  ): Promise<PaginatedResponse<QualityMeasure>> => {
    const response = await apiClient.get<PaginatedResponse<QualityMeasure>>(
      `${BASE}/measures/`,
      { params },
    );
    return parseResponse(PaginatedQualityMeasureSchema, response.data, {
      context: 'qualityApi.listMeasures',
    });
  },

  getMeasure: async (id: number): Promise<QualityMeasure> => {
    const response = await apiClient.get<QualityMeasure>(
      `${BASE}/measures/${id}/`,
    );
    return parseResponse(QualityMeasureSchema, response.data, {
      context: 'qualityApi.getMeasure',
    });
  },

  createMeasure: async (
    data: QualityMeasureCreateData,
  ): Promise<QualityMeasure> => {
    const response = await apiClient.post<QualityMeasure>(
      `${BASE}/measures/`,
      data,
    );
    return parseResponse(QualityMeasureSchema, response.data, {
      context: 'qualityApi.createMeasure',
    });
  },

  updateMeasure: async (
    id: number,
    data: Partial<QualityMeasureCreateData>,
  ): Promise<QualityMeasure> => {
    const response = await apiClient.patch<QualityMeasure>(
      `${BASE}/measures/${id}/`,
      data,
    );
    return parseResponse(QualityMeasureSchema, response.data, {
      context: 'qualityApi.updateMeasure',
    });
  },

  deleteMeasure: async (id: number): Promise<void> => {
    await apiClient.delete(`${BASE}/measures/${id}/`);
  },

  importMeasures: async (
    file: File,
    format: 'csv' | 'json' = 'json',
  ): Promise<QualityMeasureImportResult> => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('format', format);
    const response = await apiClient.post<QualityMeasureImportResult>(
      `${BASE}/measures/import/`,
      formData,
      { headers: { 'Content-Type': 'multipart/form-data' } },
    );
    return parseResponse(QualityMeasureImportResultSchema, response.data, {
      context: 'qualityApi.importMeasures',
    });
  },

  exportMeasures: async (data: QualityMeasureExportData): Promise<unknown> => {
    // CSV format returns a file download; JSON/QRDA returns JSON
    if (data.format === 'csv') {
      const response = await apiClient.post(`${BASE}/measures/export/`, data, {
        responseType: 'blob',
      });
      return response.data;
    }
    const response = await apiClient.post(`${BASE}/measures/export/`, data);
    return response.data;
  },

  // -------------------------------------------------------------------------
  // Quality Measure Results
  // -------------------------------------------------------------------------

  listResults: async (
    params?: QualityMeasureResultListParams,
  ): Promise<PaginatedResponse<QualityMeasureResult>> => {
    const response = await apiClient.get<
      PaginatedResponse<QualityMeasureResult>
    >(`${BASE}/results/`, { params });
    return parseResponse(PaginatedQualityMeasureResultSchema, response.data, {
      context: 'qualityApi.listResults',
    });
  },

  getResult: async (id: number): Promise<QualityMeasureResult> => {
    const response = await apiClient.get<QualityMeasureResult>(
      `${BASE}/results/${id}/`,
    );
    return parseResponse(QualityMeasureResultSchema, response.data, {
      context: 'qualityApi.getResult',
    });
  },

  createResult: async (
    data: QualityMeasureResultCreateData,
  ): Promise<QualityMeasureResult> => {
    const response = await apiClient.post<QualityMeasureResult>(
      `${BASE}/results/`,
      data,
    );
    return parseResponse(QualityMeasureResultSchema, response.data, {
      context: 'qualityApi.createResult',
    });
  },

  updateResult: async (
    id: number,
    data: Partial<QualityMeasureResultCreateData>,
  ): Promise<QualityMeasureResult> => {
    const response = await apiClient.patch<QualityMeasureResult>(
      `${BASE}/results/${id}/`,
      data,
    );
    return parseResponse(QualityMeasureResultSchema, response.data, {
      context: 'qualityApi.updateResult',
    });
  },

  deleteResult: async (id: number): Promise<void> => {
    await apiClient.delete(`${BASE}/results/${id}/`);
  },

  getResultTrends: async (
    params: QualityMeasureResultTrendParams,
  ): Promise<QualityMeasureResult[]> => {
    const response = await apiClient.get<QualityMeasureResult[]>(
      `${BASE}/results/trends/`,
      { params },
    );
    // Trend endpoint returns a flat array
    const results = Array.isArray(response.data) ? response.data : [];
    return results.map((item, i) =>
      parseResponse(QualityMeasureResultSchema, item, {
        context: `qualityApi.getResultTrends[${i}]`,
      }),
    );
  },

  // -------------------------------------------------------------------------
  // Quality Dashboard
  // -------------------------------------------------------------------------

  getDashboard: async (
    params?: QualityDashboardParams,
  ): Promise<QualityDashboardData> => {
    const response = await apiClient.get<QualityDashboardData>(
      `${BASE}/dashboard/`,
      { params },
    );
    return parseResponse(QualityDashboardSchema, response.data, {
      context: 'qualityApi.getDashboard',
    });
  },

  // -------------------------------------------------------------------------
  // SDMX Export
  // -------------------------------------------------------------------------

  /**
   * Export a quarterly report in SDMX-ML 2.1 XML format.
   * Triggers a file download.
   */
  exportQuarterlyReportSdmx: async (reportId: number): Promise<Blob> => {
    const response = await apiClient.post(
      `${BASE}/quarterly-reports/${reportId}/export-sdmx/`,
      {},
      { responseType: 'blob' }
    );
    return response.data as Blob;
  },

  /**
   * Export an annual report in SDMX-ML 2.1 XML format.
   * Triggers a file download.
   */
  exportAnnualReportSdmx: async (reportId: number): Promise<Blob> => {
    const response = await apiClient.post(
      `${BASE}/annual-reports/${reportId}/export-sdmx/`,
      {},
      { responseType: 'blob' }
    );
    return response.data as Blob;
  },

  // -------------------------------------------------------------------------
  // Seed Defaults
  // -------------------------------------------------------------------------

  /**
   * Seed default Kenya CQM measures. Only creates measures whose code
   * doesn't already exist. Safe to call multiple times.
   */
  seedDefaults: async (): Promise<{ created: number; skipped: number; total: number }> => {
    const response = await apiClient.post(`${BASE}/measures/seed-defaults/`);
    return response.data as { created: number; skipped: number; total: number };
  },

  // -------------------------------------------------------------------------
  // Evaluate
  // -------------------------------------------------------------------------

  /**
   * Trigger CQM evaluation for a clinic or all active clinics.
   * If clinic_id is omitted, evaluates all active clinics.
   */
  evaluateMeasures: async (params: {
    clinic_id?: number;
    year?: number;
    period?: number;
    period_type?: string;
  }): Promise<{
    clinic_id?: number;
    year: number;
    period: number;
    period_type: string;
    results?: Array<{
      measure_code: string;
      measure_name: string;
      numerator: number;
      denominator: number;
      percentage: string;
      meets_target: boolean;
      notes: string;
    }>;
    total_evaluated?: number;
    clinics_evaluated?: number;
    clinic_results?: Array<{
      clinic_id: number;
      clinic_name: string;
      results: Array<{
        measure_code: string;
        measure_name: string;
        numerator: number;
        denominator: number;
        percentage: string;
        meets_target: boolean;
        notes: string;
      }>;
      total_evaluated: number;
    }>;
  }> => {
    const url = params.clinic_id
      ? `${BASE}/results/evaluate/?clinic_id=${params.clinic_id}`
      : `${BASE}/results/evaluate/`;
    const response = await apiClient.post(url, {
      year: params.year,
      period: params.period,
      period_type: params.period_type,
    });
    return response.data;
  },
};

export default qualityApi;
